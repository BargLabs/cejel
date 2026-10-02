#!/usr/bin/env bash
# scripts/release.sh <version> [--dry-run] [--from <stage>]
#
# Deterministic release driver for @cejel/cejel. Walks the release in order, reads the state of
# the world before and after every stage (never an action's exit code), and stops for a typed
# `yes` before each of the five irreversible actions:
#   2 tag push, 5 publish the GitHub release, 7 npm publish, 9 distribution publish, 12 move v1.
# The count is five: stages 2, 5, 7, 9 and 12 are the irreversible ones, and only they are gated.
#
# Resumable: each stage reads the current state and skips itself when the state already shows it
# done. It never edits a repository file and never runs `git commit`. Tools: bash, git, gh, jq,
# curl (plus crane if present). No model, no network beyond GitHub, the npm registry, ghcr.io and
# the MCP registry. Every gh call carries --repo so the shell's directory does not matter.
#
# Stated limits (workflow inputs make these unverifiable from outside; no workflow was edited):
#   - A workflow_dispatch run's inputs are not exposed by `gh run list`, so a verify-only run and
#     a publishing run of the same workflow are distinguished only by the state they leave behind
#     (registry, ghcr). A resumed run therefore reports "latest successful run on the tag".
#   - Preflight reads the release commit: the tag's commit when the tag already exists on origin
#     (so a finished release can be re-read after main moves on), else origin/main.
#   - Workflow-only npm publication is operator policy, not a registry guarantee (0.4.9).
#
# Test seams (env): RELEASE_POLL_INTERVAL (default 20 s), RELEASE_POLL_MAX (default 600 s),
# RELEASE_CURRENCY_WAIT (default 300 s), RELEASE_SKIP_VALIDATE=1 (tests only).

set -euo pipefail

REPO="BargLabs/cejel"
REMOTE="origin"
NPM_PKG="@cejel/cejel"
NPM_URL="https://registry.npmjs.org/%40cejel%2Fcejel"
NPM_USER_EXPECTED="GitHub Actions <npm-oidc-no-reply@github.com>"
OCI_REPO="barglabs/cejel"
MCP_NAME="io.github.BargLabs%2Fcejel"
POLL_INTERVAL="${RELEASE_POLL_INTERVAL:-20}"
POLL_MAX="${RELEASE_POLL_MAX:-600}"
CURRENCY_WAIT="${RELEASE_CURRENCY_WAIT:-300}"
if command -v crane >/dev/null 2>&1; then OCI_TOOL=crane; else OCI_TOOL=curl; fi

DRY_RUN=0
FROM_STAGE=1
VERSION=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --from) shift; FROM_STAGE="${1:-}" ;;
    -h|--help) sed -n 2,5p "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) if [ -z "$VERSION" ]; then VERSION="$1"; else echo "unexpected argument: $1" >&2; exit 2; fi ;;
  esac
  shift
done

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: $0 <semver, no leading v> [--dry-run] [--from <stage>]" >&2; exit 2; }
[[ "$FROM_STAGE" =~ ^[0-9]+$ ]] || { echo "--from needs a stage number" >&2; exit 2; }
TAG="v${VERSION}"

WORK="$(mktemp -d)"
cleanup() {
  if [ -n "${PREFLIGHT_WT:-}" ]; then git worktree remove --force "$PREFLIGHT_WT" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

say()  { echo "[release $VERSION] $*"; }
die()  { echo "[release $VERSION] REFUSE: $*" >&2; exit 1; }
done_() { say "stage $1 ($2): already done -- $3"; }

# Facts gathered for the handback.
RELEASE_SHA=""; RUN_BINARIES=""; RUN_NPM=""; RUN_DIST=""; RUN_CURRENCY=""
OCI_DIGEST=""; MCP_STATE="not read"; TLOG_URL=""; GIT_HEAD=""; CURRENCY_STATE=""

# ---------------------------------------------------------------- action wrappers
# Every state-changing command goes through act / irreversible, so --dry-run can suppress it and
# so scripts/release_tests.sh can assert that nothing else mutates anything.
act() {
  if [ "$DRY_RUN" = 1 ]; then say "[dry-run] would run: $*"; return 0; fi
  say "running: $*"
  "$@"
}

confirm() { # confirm <stage> <command text> <verified state>
  say "STAGE $1 IS IRREVERSIBLE."
  say "  about to run : $2"
  say "  state verified: $3"
  if [ "$DRY_RUN" = 1 ]; then say "[dry-run] would ask for the literal 'yes' here"; return 0; fi
  printf 'type yes to proceed: '
  local reply=""
  read -r reply || true
  [ "$reply" = "yes" ] || die "stage $1 not confirmed (only the literal 'yes' is accepted)"
}

irreversible() { # irreversible <stage> <verified state> -- <command...>
  local stage="$1" state="$2"; shift 3
  confirm "$stage" "$*" "$state"
  act "$@"
}

# ---------------------------------------------------------------- readers
gh_r() { gh "$@" --repo "$REPO"; }

registry_json() { curl -fsS "$NPM_URL"; }

npm_has_version() {
  local j; j="$(registry_json)" || die "registry unreadable"
  jq -e --arg v "$VERSION" '.versions[$v] != null' <<<"$j" >/dev/null
}

# Prints the problems with the registry entry for $VERSION; empty output means all postconditions hold.
npm_problems() {
  local j; j="$(registry_json)" || { echo "registry unreadable"; return; }
  jq -r --arg v "$VERSION" --arg u "$NPM_USER_EXPECTED" '
    (.versions[$v]) as $e
    | if $e == null then "version absent"
      else
        ( if ($e._npmUser | ((.name // "") + " <" + (.email // "") + ">")) == $u then empty
          else "_npmUser is " + ($e._npmUser|tojson) + ", expected exactly " + ($u|tojson) end ),
        ( if ($e.dist.attestations.provenance // null) != null then empty
          else "dist.attestations has no provenance predicate" end ),
        ( if (.["dist-tags"].latest // "") == $v then empty
          else "dist-tags.latest is " + ((.["dist-tags"].latest // "none")|tojson) end )
      end' <<<"$j"
}

registry_gitHead() { registry_json | jq -r --arg v "$VERSION" '.versions[$v].gitHead // ""'; }

# Find the run created at/after $2 (ISO) for workflow $1 on ref $TAG, recording its id.
find_new_run() { # find_new_run <workflow> <since-iso>
  local wf="$1" since="$2" n id
  for n in 1 2 3 4 5 6 7 8 9 10; do
    id="$(gh_r run list --workflow "$wf" --event workflow_dispatch --branch "$TAG" --limit 10 \
      --json databaseId,createdAt | jq -r --arg s "$since" '[.[]|select(.createdAt >= $s)]|sort_by(.createdAt)|first|.databaseId // empty')"
    if [ -n "$id" ]; then echo "$id"; return 0; fi
    sleep "${RELEASE_RUN_FIND_SLEEP:-3}"
  done
  return 1
}

# Dispatch <workflow> on the tag, watch it, and echo the run id on stdout (progress on stderr).
# $1 = workflow file, rest = -f inputs. Postcondition is read by the caller from the world.
dispatch_and_watch() {
  local wf="$1"; shift
  local since id conclusion
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  act gh workflow run "$wf" --repo "$REPO" --ref "$TAG" "$@" >&2
  if [ "$DRY_RUN" = 1 ]; then return 0; fi
  id="$(find_new_run "$wf" "$since")" || die "no $wf run appeared after dispatch"
  [[ "$id" =~ ^[0-9]{9,}$ ]] || die "run id '$id' is not a run id"
  say "dispatched $wf as run $id (a job id is not a run id)" >&2
  gh_r run watch "$id" --exit-status >&2 || true
  conclusion="$(gh_r run view "$id" --json conclusion --jq .conclusion)"
  [ "$conclusion" = "success" ] || die "$wf run $id concluded '$conclusion'"
  echo "$id"
}

latest_success_run() { # latest_success_run <workflow>
  gh_r run list --workflow "$1" --branch "$TAG" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty'
}

# ---------------------------------------------------------------- stage 1
stage1() {
  say "stage 1 (preflight)"
  # No --tags: v1 moves every release, so a clone that fetched tags before holds a stale v1 and a
  # tag fetch refuses ("would clobber existing tag"). Tag state is read with ls-remote below, and
  # stage 12 fetches v1 with a forced refspec.
  local fetch_err
  fetch_err="$(git fetch "$REMOTE" --prune 2>&1 >/dev/null)" || die "git fetch $REMOTE failed: $fetch_err"
  case "$(git remote get-url "$REMOTE")" in *"$REPO"*) ;; *) die "remote $REMOTE is not $REPO";; esac
  local main_sha tag_lines
  main_sha="$(git rev-parse "$REMOTE/main")"
  tag_lines="$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG" "refs/tags/$TAG^{}")"
  REMOTE_TAG_SHA="$(awk -v r="refs/tags/$TAG^{}" '$2==r{print $1}' <<<"$tag_lines")"
  [ -n "$REMOTE_TAG_SHA" ] || REMOTE_TAG_SHA="$(awk -v r="refs/tags/$TAG" '$2==r{print $1}' <<<"$tag_lines")"
  MAIN_SHA="$main_sha"
  RELEASE_SHA="${REMOTE_TAG_SHA:-$main_sha}"
  say "  release commit: $RELEASE_SHA ($([ -n "$REMOTE_TAG_SHA" ] && echo "from existing tag $TAG" || echo "origin/main"))"

  local bad="" got
  got="$(git show "$RELEASE_SHA:package.json" | jq -r .version)"; [ "$got" = "$VERSION" ] || bad+=" package.json.version=$got"
  got="$(git show "$RELEASE_SHA:server.json" | jq -r .version)"; [ "$got" = "$VERSION" ] || bad+=" server.json.version=$got"
  local pv; pv="$(git show "$RELEASE_SHA:published-versions.json")"
  got="$(jq -r .mcpRegistry <<<"$pv")"; [ "$got" = "$VERSION" ] || bad+=" published-versions.json.mcpRegistry=$got"
  got="$(jq -r .oci <<<"$pv")"; [ "$got" = "$VERSION" ] || bad+=" published-versions.json.oci=$got"
  got="$(git show "$RELEASE_SHA:Dockerfile" | sed -n 's/^ARG VERSION=//p' | head -1)"; [ "$got" = "$VERSION" ] || bad+=" Dockerfile.VERSION=$got"
  [ -z "$bad" ] || die "version fields disagree with $VERSION at $RELEASE_SHA:$bad"

  local cl; cl="$(git show "$RELEASE_SHA:CHANGELOG.md")"
  grep -q "^## \[$VERSION\]" <<<"$cl" || die "CHANGELOG.md has no '## [$VERSION]' section at $RELEASE_SHA"
  if awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f&&NF{found=1} END{exit !found}' <<<"$cl"; then
    die "CHANGELOG.md has [Unreleased] content at $RELEASE_SHA"
  fi

  if [ "${RELEASE_SKIP_VALIDATE:-0}" = 1 ]; then
    say "  validate:distribution skipped (RELEASE_SKIP_VALIDATE, tests only)"
  else
    PREFLIGHT_WT="$WORK/wt"
    local wt_err
    wt_err="$(git worktree add --detach "$PREFLIGHT_WT" "$RELEASE_SHA" 2>&1 >/dev/null)" || die "could not create temporary worktree at $RELEASE_SHA: $wt_err"
    (cd "$PREFLIGHT_WT" && pnpm install --frozen-lockfile >/dev/null && pnpm run validate:distribution) \
      || die "pnpm run validate:distribution failed at $RELEASE_SHA"
  fi
  say "  preflight ok"
}

# ---------------------------------------------------------------- stage 2
stage2() {
  if [ -n "$REMOTE_TAG_SHA" ]; then
    if [ "$REMOTE_TAG_SHA" != "$MAIN_SHA" ]; then
      # A finished release is allowed to sit behind a moved main; a tag off main's history is not.
      git merge-base --is-ancestor "$REMOTE_TAG_SHA" "$MAIN_SHA" \
        || die "$TAG on $REMOTE points at $REMOTE_TAG_SHA, which is not origin/main ($MAIN_SHA) nor an ancestor of it"
    fi
    done_ 2 tag "$TAG on $REMOTE -> $REMOTE_TAG_SHA"
    return
  fi
  confirm 2 "git tag -s $TAG $MAIN_SHA -m \"cejel $VERSION\" && git push $REMOTE refs/tags/$TAG" "no $TAG on $REMOTE; origin/main = $MAIN_SHA; preflight green"
  act git tag -s "$TAG" "$MAIN_SHA" -m "cejel $VERSION"
  act git push "$REMOTE" "refs/tags/$TAG"
  [ "$DRY_RUN" = 1 ] && return 0
  local got; got="$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG^{}" | awk '{print $1}')"
  [ -n "$got" ] || got="$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG" | awk '{print $1}')"
  [ "$got" = "$MAIN_SHA" ] || die "after push, $TAG on $REMOTE is '$got', expected $MAIN_SHA"
  [ "$(git rev-parse "$TAG^{commit}")" = "$MAIN_SHA" ] || die "local $TAG does not peel to $MAIN_SHA"
  REMOTE_TAG_SHA="$MAIN_SHA"; RELEASE_SHA="$MAIN_SHA"
}

# ---------------------------------------------------------------- stage 3
release_view() { # prints "draft|prerelease" or nothing when no release exists
  local out err
  if out="$(gh_r release view "$TAG" --json isDraft,isPrerelease --jq '"\(.isDraft)|\(.isPrerelease)"' 2>"$WORK/err")"; then
    echo "$out"
  else
    err="$(cat "$WORK/err")"
    case "$err" in *"release not found"*) return 0 ;; *) die "gh release view failed: $err" ;; esac
  fi
}

stage3() {
  local st; st="$(release_view)"
  if [ -n "$st" ]; then done_ 3 draft-release "release on $TAG exists (isDraft|isPrerelease = $st)"; return; fi
  act gh release create "$TAG" --repo "$REPO" --draft --verify-tag --title "$TAG" --notes "cejel $VERSION"
  [ "$DRY_RUN" = 1 ] && return 0
  [ "$(release_view)" = "true|false" ] || die "after create, $TAG is not a draft release"
}

# ---------------------------------------------------------------- stage 4
EXPECTED_ASSETS() {
  local t
  for t in Darwin-arm64 Darwin-x86_64 Linux-aarch64 Linux-x86_64 Windows-x86_64.exe; do
    echo "cejel-$t"; echo "cejel-$t.spdx.json"
  done
  echo "cejel-$TAG-provenance.sigstore.json"; echo "SHA256SUMS"
}

assets_complete() { # prints missing/unexpected names; empty = exactly the twelve
  local have; have="$(gh_r release view "$TAG" --json assets --jq '.assets[].name' | sort)"
  { diff <(EXPECTED_ASSETS | sort) <(echo "$have") || true; } | sed -n 's/^< /missing: /p;s/^> /unexpected: /p'
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else openssl dgst -sha256 "$1" | awk '{print $NF}'; fi
}

verify_checksums() {
  local d="$WORK/assets"; rm -rf "$d"; mkdir -p "$d"
  gh_r release download "$TAG" --dir "$d" || die "could not download release assets"
  [ -s "$d/SHA256SUMS" ] || die "SHA256SUMS missing or empty"
  local n=0 digest name actual
  while read -r digest name; do
    [ -n "$digest" ] || continue
    name="${name#\*}"
    [ -f "$d/$name" ] || die "SHA256SUMS lists $name but it was not downloaded"
    actual="$(sha256_of "$d/$name")"
    [ "$actual" = "$digest" ] || die "SHA256SUMS digest for $name is $digest but the downloaded file is $actual"
    n=$((n + 1))
  done <"$d/SHA256SUMS"
  [ "$n" -eq 5 ] || die "SHA256SUMS lists $n entries, expected the five binaries"
  say "  $n binary digests match SHA256SUMS"
}

stage4() {
  local st missing; st="$(release_view)"
  if [ "$DRY_RUN" = 1 ] && [ -z "$st" ]; then
    say "stage 4 (binaries): [dry-run] no release yet"
    RUN_BINARIES="$(dispatch_and_watch release-binaries.yml -f "release_tag=$TAG" -f attach_to_release=true)"
    return 0
  fi
  missing="$(assets_complete)"
  if [ -z "$missing" ]; then
    verify_checksums
    RUN_BINARIES="$(latest_success_run release-binaries.yml || true)"
    done_ 4 binaries "twelve expected assets present, digests match (latest successful run on tag: ${RUN_BINARIES:-none found})"
    return
  fi
  [ "$st" = "true|false" ] || die "assets incomplete ($(tr '\n' ' ' <<<"$missing")) and release is not a draft; release-binaries.yml needs a draft"
  if [ "$(gh_r release view "$TAG" --json assets --jq '.assets|length')" != 0 ]; then
    die "draft has a partial asset set ($(tr '\n' ' ' <<<"$missing")); inspect by hand, the driver will not overwrite it"
  fi
  RUN_BINARIES="$(dispatch_and_watch release-binaries.yml -f "release_tag=$TAG" -f attach_to_release=true)"
  [ "$DRY_RUN" = 1 ] && return 0
  missing="$(assets_complete)"
  [ -z "$missing" ] || die "after run $RUN_BINARIES the draft's assets are wrong: $(tr '\n' ' ' <<<"$missing")"
  verify_checksums
}

# ---------------------------------------------------------------- stage 5
stage5() {
  local st; st="$(release_view)"
  [ -n "$st" ] || { [ "$DRY_RUN" = 1 ] && { say "stage 5: [dry-run] release does not exist yet"; return; }; die "no release on $TAG"; }
  if [ "$st" = "false|false" ]; then done_ 5 publish-release "published, not a prerelease"; return; fi
  [ "$st" != "false|true" ] || die "$TAG is published but flagged prerelease"
  irreversible 5 "draft release $TAG, twelve assets verified" -- gh release edit "$TAG" --repo "$REPO" --draft=false
  [ "$DRY_RUN" = 1 ] && return 0
  [ "$(release_view)" = "false|false" ] || die "after edit, $TAG is not published/non-prerelease"
}

# ---------------------------------------------------------------- stage 6 / 7
npm_log_plus_line() { # npm_log_plus_line <run id>
  gh_r run view "$1" --log 2>/dev/null | grep -F "+ $NPM_PKG@$VERSION" | head -1 || true
}

stage6() {
  if npm_has_version; then
    local p; p="$(npm_problems)"
    [ -z "$p" ] || die "registry already holds $NPM_PKG@$VERSION and it is not a clean workflow publish (someone published outside the script): $(tr '\n' ';' <<<"$p")"
    done_ 6 npm-verify "registry holds $VERSION and passes every postcondition; verify-only superseded"
    return
  fi
  local id; id="$(dispatch_and_watch publish-npm.yml -f "release_tag=$TAG" -f verify_only=true)"
  [ "$DRY_RUN" = 1 ] && return 0
  say "  verify-only run $id succeeded"
  npm_has_version && die "registry holds $VERSION after a verify-only run; refusing"
  return 0
}

stage7() {
  if npm_has_version; then
    local p; p="$(npm_problems)"
    [ -z "$p" ] || die "registry holds $VERSION but: $(tr '\n' ';' <<<"$p")"
    RUN_NPM="${RUN_NPM:-$(find_npm_publish_run)}"
    finish_npm
    done_ 7 npm-publish "registry entry verified (provenance, publisher, latest tag)"
    return
  fi
  local id
  confirm 7 "gh workflow run publish-npm.yml --repo $REPO --ref $TAG -f release_tag=$TAG -f verify_only=false" \
    "verify-only run succeeded this session or earlier; registry has no $VERSION"
  id="$(dispatch_and_watch publish-npm.yml -f "release_tag=$TAG" -f verify_only=false)"
  [ "$DRY_RUN" = 1 ] && return 0
  RUN_NPM="$id"
  local waited=0
  until npm_has_version; do
    if [ "$waited" -ge "$POLL_MAX" ]; then
      die "registry still has no $VERSION after ${POLL_MAX}s. Run $id log line: '$(npm_log_plus_line "$id")' (a '+ $NPM_PKG@$VERSION' line means published-and-lagging; no line means not published)"
    fi
    sleep "$POLL_INTERVAL"; waited=$((waited + POLL_INTERVAL))
  done
  local p; p="$(npm_problems)"
  [ -z "$p" ] || die "published, but: $(tr '\n' ';' <<<"$p")"
  finish_npm
}

find_npm_publish_run() {
  local id
  for id in $(gh_r run list --workflow publish-npm.yml --branch "$TAG" --status success --limit 5 --json databaseId --jq '.[].databaseId'); do
    if [ -n "$(npm_log_plus_line "$id")" ]; then echo "$id"; return 0; fi
  done
  return 0
}

finish_npm() {
  GIT_HEAD="$(registry_gitHead)"
  if [ -z "$RUN_NPM" ]; then die "registry entry is clean but no successful publish-npm run on $TAG has a '+ $NPM_PKG@$VERSION' log line"; fi
  local log; log="$(gh_r run view "$RUN_NPM" --log 2>/dev/null)"
  grep -qF "+ $NPM_PKG@$VERSION" <<<"$log" || die "run $RUN_NPM log has no '+ $NPM_PKG@$VERSION' line"
  TLOG_URL="$(grep -Eo 'https://search\.sigstore\.dev/[^ ]+' <<<"$log" | head -1 || true)"
  say "  npm run $RUN_NPM; gitHead ${GIT_HEAD:-none}; transparency log: ${TLOG_URL:-<not found in run log>}"
}

# ---------------------------------------------------------------- stage 8 / 9
oci_digest() { # prints digest or nothing
  if [ "$OCI_TOOL" = crane ]; then
    crane digest "ghcr.io/$OCI_REPO:$VERSION" 2>/dev/null || true
  else
    local tok; tok="$(curl -fsS "https://ghcr.io/token?scope=repository:$OCI_REPO:pull" 2>/dev/null | jq -r '.token // empty')" || return 0
    [ -n "$tok" ] || return 0
    curl -fsSI -H "Authorization: Bearer $tok" \
      -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
      "https://ghcr.io/v2/$OCI_REPO/manifests/$VERSION" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="docker-content-digest:"{print $2}' || true
  fi
}

read_mcp() {
  local out
  if out="$(curl -fsS "https://registry.modelcontextprotocol.io/v0.1/servers/$MCP_NAME/versions/$VERSION" 2>&1)"; then
    local v; v="$(jq -r '.server.version // .version // empty' <<<"$out" 2>/dev/null)"
    if [ "$v" = "$VERSION" ]; then MCP_STATE="serves $VERSION"; else MCP_STATE="responded without version $VERSION: $(head -c 300 <<<"$out")"; fi
  else
    MCP_STATE="disclosed-lag state, not current: registry read failed: $(head -c 300 <<<"$out")"
  fi
}

stage8() {
  OCI_DIGEST="$(oci_digest)"
  if [ -n "$OCI_DIGEST" ]; then done_ 8 distribution-verify "ghcr.io/$OCI_REPO:$VERSION already resolves ($OCI_DIGEST); verify-only would trip the tag-unpublished guard"; return; fi
  [ "$DRY_RUN" = 1 ] || npm_has_version || die "npm does not hold $VERSION; distribution comes after npm"
  RUN_DIST="$(dispatch_and_watch publish-distribution.yml -f "release_tag=$TAG" -f verify_only=true -f publish_mcp_registry=false -f reuse_published_oci_tag=false)"
}

stage9() {
  OCI_DIGEST="$(oci_digest)"
  if [ -n "$OCI_DIGEST" ]; then
    [ -n "$RUN_DIST" ] || RUN_DIST="$(latest_success_run publish-distribution.yml || true)"
    read_mcp
    done_ 9 distribution-publish "ghcr.io/$OCI_REPO:$VERSION -> $OCI_DIGEST (read with $OCI_TOOL); MCP registry: $MCP_STATE"
    return
  fi
  confirm 9 "gh workflow run publish-distribution.yml --repo $REPO --ref $TAG -f release_tag=$TAG -f verify_only=false -f publish_mcp_registry=true -f reuse_published_oci_tag=false" \
    "distribution verify-only run succeeded; ghcr.io/$OCI_REPO:$VERSION does not resolve"
  RUN_DIST="$(dispatch_and_watch publish-distribution.yml -f "release_tag=$TAG" -f verify_only=false -f publish_mcp_registry=true -f reuse_published_oci_tag=false)"
  [ "$DRY_RUN" = 1 ] && return 0
  OCI_DIGEST="$(oci_digest)"
  [ -n "$OCI_DIGEST" ] || die "after run $RUN_DIST, ghcr.io/$OCI_REPO:$VERSION does not resolve to a manifest digest"
  read_mcp
  say "  OCI $OCI_DIGEST (read with $OCI_TOOL); MCP registry: $MCP_STATE"
}

# ---------------------------------------------------------------- stage 10
stage10() {
  say "stage 10 (homebrew): NOT run by this driver -- separate repository, its own review."
  local d="$WORK/brew"; mkdir -p "$d"
  if [ "$DRY_RUN" = 1 ] && [ -z "$(release_view)" ]; then say "  [dry-run] no release yet; tarball digest not computed"; return; fi
  local tarball="$d/$TAG.tar.gz" digest
  if curl -fsSL "https://github.com/$REPO/archive/refs/tags/$TAG.tar.gz" -o "$tarball"; then
    digest="$(sha256_of "$tarball")"
    say "  source tarball sha256 (from the published tag archive): $digest"
    say "  operator command (tap repo): bump the cejel formula to version $VERSION with url https://github.com/$REPO/archive/refs/tags/$TAG.tar.gz and sha256 $digest"
  else
    say "  could not download the tag archive; compute the tarball digest by hand"
  fi
  say "  ORDER: the tap's action-routes check reads action@v1, so the tap PR stays red until stage 12 has moved v1. Do not wait on the tap check before stage 12."
}

# ---------------------------------------------------------------- stage 11
currency_after() { # currency_after <since-iso> -> id of a workflow_run-triggered run
  gh_r run list --workflow verify-release-currency.yml --event workflow_run --limit 10 --json databaseId,createdAt \
    | jq -r --arg s "$1" '[.[]|select(.createdAt >= $s)]|sort_by(.createdAt)|last|.databaseId // empty'
}

stage11() {
  say "stage 11 (currency)"
  if [ "$DRY_RUN" = 1 ] && [ -z "$OCI_DIGEST" ]; then say "  [dry-run] distribution not published; currency not read"; return; fi
  local since waited=0 id="" sha="$RELEASE_SHA" status="" conclusion=""
  # The currency run is triggered by workflow_run; read for one that started after the last
  # publish workflow completed. Fall back to the most recent of any kind within the window.
  since="$(gh_r run view "${RUN_DIST:-$RUN_NPM}" --json updatedAt --jq .updatedAt 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
  while [ -z "$id" ]; do
    id="$(currency_after "$since")"
    [ -n "$id" ] && break
    [ "$waited" -ge "$CURRENCY_WAIT" ] && break
    [ "$DRY_RUN" = 1 ] && break
    sleep "$POLL_INTERVAL"; waited=$((waited + POLL_INTERVAL))
  done
  if [ -z "$id" ]; then
    if [ "$DRY_RUN" = 1 ]; then act gh workflow run verify-release-currency.yml --repo "$REPO" -f "version=$VERSION" -f "commit=$sha"; return 0; fi
    id="$(dispatch_currency "$sha")"
  fi
  # In-flight states are not failures: wait for completion before reading.
  status="$(gh_r run view "$id" --json status --jq .status)"
  if [ "$status" != "completed" ]; then
    [ "$DRY_RUN" = 1 ] && { say "  currency run $id is $status (in flight, not a failure)"; return 0; }
    gh_r run watch "$id" >/dev/null 2>&1 || true
  fi
  conclusion="$(gh_r run view "$id" --json conclusion --jq .conclusion)"
  RUN_CURRENCY="$id"
  local log pass fail
  log="$(gh_r run view "$id" --log 2>/dev/null)"
  pass="$(grep -c '\[PASS\]' <<<"$log" || true)"; fail="$(grep -c '\[FAIL\]' <<<"$log" || true)"
  local total=$((pass + fail))
  [ "$total" -eq 13 ] || die "currency run $id reported $total surfaces, expected thirteen"
  local dev_fail; dev_fail="$(grep '\[FAIL\]' <<<"$log" | grep -ci 'cejel\.dev' || true)"
  if [ "$fail" -eq 0 ]; then CURRENCY_STATE="13 of 13 (after the site record)"
  elif [ "$pass" -eq 10 ] && [ "$dev_fail" -eq 3 ]; then
    CURRENCY_STATE="10 of 13 (before the site record; the three failing surfaces are all cejel.dev)"
  else die "currency run $id: $pass pass / $fail fail, and the failures are not exactly the three cejel.dev surfaces:
$(grep '\[FAIL\]' <<<"$log")"; fi
  say "  currency run $id (conclusion $conclusion): $CURRENCY_STATE"
}

dispatch_currency() { # dispatch_currency <sha>; its own function because the run is on main, not the tag
  local since id n; since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  act gh workflow run verify-release-currency.yml --repo "$REPO" -f "version=$VERSION" -f "commit=$1" >&2
  for n in 1 2 3 4 5 6 7 8 9 10; do
    id="$(gh_r run list --workflow verify-release-currency.yml --event workflow_dispatch --limit 10 --json databaseId,createdAt \
      | jq -r --arg s "$since" '[.[]|select(.createdAt >= $s)]|sort_by(.createdAt)|first|.databaseId // empty')"
    [ -n "$id" ] && { echo "$id"; return 0; }
    sleep "${RELEASE_RUN_FIND_SLEEP:-3}"
  done
  die "no verify-release-currency run appeared after dispatch"
}

# ---------------------------------------------------------------- stage 12
stage12() {
  local v1 rel
  v1="$(git ls-remote --tags "$REMOTE" refs/tags/v1 | awk '{print $1}' | head -1)"
  rel="$RELEASE_SHA"
  if [ -n "$v1" ] && [ "$v1" = "$rel" ]; then done_ 12 action-major-tag "v1 already at $rel"; stage12_print_consumer; return; fi
  local v1_err
  v1_err="$(git fetch "$REMOTE" "+refs/tags/v1:refs/tags/v1" 2>&1 >/dev/null)" || say "  warning: could not fetch v1 (the diff below may fail): $v1_err"
  say "stage 12 (Action major tag): v1 is at ${v1:-<absent>}, release is $rel"
  say "  diff of action/action.yml, v1 -> $TAG (see docs/release-process.md 'Required Action major-tag step'):"
  if [ -n "$v1" ]; then
    diff <(git show "$v1:action/action.yml") <(git show "$rel:action/action.yml") || true
  else say "  (no existing v1)"; fi
  irreversible 12 "v1 at ${v1:-<absent>}; release $TAG at $rel; action.yml diff printed above; v1 is the only movable tag" -- git push --force "$REMOTE" "$rel:refs/tags/v1"
  [ "$DRY_RUN" = 1 ] && { stage12_print_consumer; return 0; }
  local now; now="$(git ls-remote --tags "$REMOTE" refs/tags/v1 | awk '{print $1}' | head -1)"
  [ "$now" = "$rel" ] || die "after push, v1 is '$now', expected $rel"
  stage12_print_consumer
}

stage12_print_consumer() {
  say "  NEXT (not run by this driver): run a consumer workflow using BargLabs/cejel/action@v1;"
  say "  it must report cejel $VERSION. If it does not, revert the v1 move and investigate."
}

# ---------------------------------------------------------------- stage 13
stage13() {
  cat <<EOF

================ HANDBACK for cejel-site current-release.mjs ================
version:              $VERSION
gitHead (npm):        ${GIT_HEAD:-<not read>}
release commit:       $RELEASE_SHA
OCI digest:           ${OCI_DIGEST:-<not read>}
run ids:
  binaries:           ${RUN_BINARIES:-<not recorded>}
  npm:                ${RUN_NPM:-<not recorded>}
  distribution:       ${RUN_DIST:-<not recorded>}
  currency:           ${RUN_CURRENCY:-<not recorded>}  [${CURRENCY_STATE:-not read}]
Homebrew PR:          <fill in once the tap PR exists>
transparency log:     ${TLOG_URL:-<not read>}
MCP registry state:   $MCP_STATE
=============================================================================
Resumed stages report "latest successful run on the tag" where inputs cannot be read back.
The site record is written by a human under cejel-site's DEPLOY.md. This script stops here.
EOF
}

# ---------------------------------------------------------------- main
# --from is a convenience only: stages before it still run their reads, so no precondition is skipped.
run_stage() { # run_stage <n> <fn>
  if [ "$1" -lt "$FROM_STAGE" ]; then say "stage $1: before --from $FROM_STAGE; its state checks still run"; fi
  "$2"
}

[ "$DRY_RUN" = 1 ] && say "DRY RUN: reads execute, no tag/release/workflow/push is performed"
stage1
for n in 2 3 4 5 6 7 8 9 10 11 12; do run_stage "$n" "stage$n"; done
stage13
