#!/usr/bin/env bash
# scripts/release.sh <version> [--dry-run] [--from <stage>]
#
# Deterministic release driver for @cejel/cejel. Walks the release in order, reads the state of
# the world before and after every stage (never an action's exit code), and stops for a typed
# `yes` before each of the five irreversible actions:
#   2 tag push, 5 publish the GitHub release, 7 npm publish, 9 distribution publish, 12 move v1.
# The count is five: stages 2, 5, 7, 9 and 12 are the irreversible ones, and only they are gated.
#
# <version> is X.Y.Z (a final release) or X.Y.Z-rc.N with N >= 1 (a release candidate; the grammar
# is scripts/release-version.mjs's). A release candidate moves nothing a user gets by default: it
# runs stages 1-3, 5-7 and 13 only. Its GitHub release is flagged prerelease and never latest, npm
# publishes it under `next` (publish-npm.yml derives the tag from the version), and stages 4 and
# 8-12 (binaries, distribution, Homebrew, currency, v1) and the site record print `skipped:
# prerelease`. Stage 13 then reads back from the registry that dist-tags.next is the version,
# dist-tags.latest is byte-identical to its value at preflight and the tarball's gitHead is the
# tag's commit, and from GitHub that releases/latest has not moved. A final release runs as before.
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
# RELEASE_CURRENCY_WAIT (default 300 s), RELEASE_MCP_RETRY_DELAY (default 3 s),
# RELEASE_RUN_LIST_TRIES (default 5; tries for an empty run listing or a failed run-log read, a
# whole number of at least 1, else the driver refuses), RELEASE_RUN_FIND_SLEEP (default 3 s between
# those tries, and between run-appearance checks after a dispatch), RELEASE_SKIP_VALIDATE=1 (tests
# only).

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
MCP_TIMEOUT=45
MCP_RETRY_DELAY="${RELEASE_MCP_RETRY_DELAY:-3}"
RUN_LIST_TRIES="${RELEASE_RUN_LIST_TRIES:-5}"
MCP_NOT_LAG="re-read before writing current-release.mjs; a read error is not a lag"
CURRENCY_SURFACES=14 # the SURFACES list in scripts/verify-release-currency.mjs
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

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[1-9][0-9]*)?$ ]] || { echo "usage: $0 <X.Y.Z or X.Y.Z-rc.N (N >= 1), no leading v> [--dry-run] [--from <stage>]" >&2; exit 2; }
[[ "$FROM_STAGE" =~ ^[0-9]+$ ]] || { echo "--from needs a stage number" >&2; exit 2; }
TAG="v${VERSION}"
PRERELEASE=0; [[ "$VERSION" == *-rc.* ]] && PRERELEASE=1

# prerelease_skip <stage>: why a release candidate does not run <stage>; nothing for a stage it runs.
prerelease_skip() {
  case "$1" in
    4) echo "no binaries are built or attached to a prerelease" ;;
    8) echo "it only gates stage 9, which a prerelease skips" ;;
    9) echo "no OCI image and no MCP Registry entry for a prerelease" ;;
    10) echo "the Homebrew tap stays on the newest final release" ;;
    11) echo "the currency check reads the newest final release, which a prerelease does not move" ;;
    12) echo "v1 stays on the newest final release" ;;
  esac
}

WORK="$(mktemp -d)"
cleanup() {
  if [ -n "${PREFLIGHT_WT:-}" ]; then git worktree remove --force "$PREFLIGHT_WT" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

say()  { echo "[release $VERSION] $*"; }
die()  { echo "[release $VERSION] REFUSE: $*" >&2; exit 1; }
# Refused rather than clamped: zero tries would turn every lookup into "nothing found" unread.
[[ "$RUN_LIST_TRIES" =~ ^[1-9][0-9]*$ ]] || die "RELEASE_RUN_LIST_TRIES must be a whole number of at least 1 (got '$RUN_LIST_TRIES')"
# Refused rather than rounded to the next stage a prerelease runs: the operator named a stage that does not happen.
if [ "$PRERELEASE" = 1 ] && [ -n "$(prerelease_skip "$FROM_STAGE")" ]; then
  die "--from $FROM_STAGE: a prerelease does not run stage $FROM_STAGE ($(prerelease_skip "$FROM_STAGE")); it runs stages 1-3, 5-7 and 13"
fi
done_() { say "stage $1 ($2): already done -- $3"; }

# Facts gathered for the handback.
RELEASE_SHA=""; RUN_BINARIES=""; RUN_NPM=""; RUN_DIST=""; RUN_CURRENCY=""
OCI_DIGEST=""; MCP_STATE="not read"; TLOG_URL=""; GIT_HEAD=""; CURRENCY_STATE=""
# Prerelease only: the defaults read at preflight, which the run must leave as they were.
NPM_LATEST_BEFORE=""; GH_LATEST_BEFORE=""; NPM_INTEGRITY=""

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
  if [ "$PRERELEASE" = 1 ]; then npm_problems_prerelease "$j"; return; fi
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

# A release candidate's postconditions: the same publisher and provenance, dist-tags.next is the
# version, dist-tags.latest is byte-identical (as JSON text) to its value at preflight, and the
# tarball's gitHead is the tag's commit.
npm_problems_prerelease() { # npm_problems_prerelease <registry json>
  jq -r --arg v "$VERSION" --arg u "$NPM_USER_EXPECTED" --arg sha "$RELEASE_SHA" --arg before "$NPM_LATEST_BEFORE" '
    (.versions[$v]) as $e
    | if $e == null then "version absent"
      else
        ( if ($e._npmUser | ((.name // "") + " <" + (.email // "") + ">")) == $u then empty
          else "_npmUser is " + ($e._npmUser|tojson) + ", expected exactly " + ($u|tojson) end ),
        ( if ($e.dist.attestations.provenance // null) != null then empty
          else "dist.attestations has no provenance predicate" end ),
        ( if (.["dist-tags"].next // "") == $v then empty
          else "dist-tags.next is " + ((.["dist-tags"].next // "none")|tojson) + ", expected " + ($v|tojson) end ),
        ( (.["dist-tags"].latest | tojson) as $now
          | if $now == $before then empty
            else "dist-tags.latest moved: " + $before + " before the run, " + $now + " now" end ),
        ( if ($e.gitHead // "") == $sha then empty
          else "gitHead is " + (($e.gitHead // "none")|tojson) + ", expected the tag commit " + $sha end )
      end' <<<"$1"
}

npm_latest_json() { registry_json | jq -c '.["dist-tags"].latest'; }

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

# GitHub's run listing filtered by --branch and --status can answer with an empty list for a
# while even for runs that finished hours ago: on 2026-10-22, two of four identical calls for
# v0.6.8's publish-npm runs returned [] and the other two both runs, which made a `--from 13`
# resume refuse at stage 7. So an empty answer, or a failed gh call, is retried before it is
# believed; gh's stderr from the last failed try is passed on, so a refusal can be traced.
# success_run_ids <workflow> <limit>: ids of successful runs of <workflow> on $TAG, newest first.
success_run_ids() {
  local wf="$1" limit="$2" n out tries="$RUN_LIST_TRIES" err="$WORK/run-list.err"
  for ((n = 1; n <= tries; n++)); do
    out="$(gh_r run list --workflow "$wf" --branch "$TAG" --status success --limit "$limit" --json databaseId --jq '.[].databaseId' 2>"$err")" || out=""
    if [ -n "$out" ]; then echo "$out"; return 0; fi
    if [ "$n" -lt "$tries" ]; then
      say "  $wf run listing on $TAG empty or gh failed; retry $((n + 1))/$tries" >&2
      sleep "${RELEASE_RUN_FIND_SLEEP:-3}"
    fi
  done
  say "  $wf run listing on $TAG still empty or failing after $tries tries" >&2
  [ -s "$err" ] && cat "$err" >&2
  return 0
}

# read_run_log <run id>: the run's log on stdout. A failed or empty `gh run view --log` is retried
# like an empty listing (the same 2026-10-22 incident class); after the last try gh's stderr is
# passed on and the function fails, so a caller refuses for an unreadable log, not a missing line.
read_run_log() {
  local id="$1" n out tries="$RUN_LIST_TRIES" err="$WORK/run-view.err"
  for ((n = 1; n <= tries; n++)); do
    out="$(gh_r run view "$id" --log 2>"$err")" || out=""
    if [ -n "$out" ]; then printf '%s\n' "$out"; return 0; fi
    if [ "$n" -lt "$tries" ]; then
      say "  run $id log empty or gh failed; retry $((n + 1))/$tries" >&2
      sleep "${RELEASE_RUN_FIND_SLEEP:-3}"
    fi
  done
  say "  run $id log still unreadable after $tries tries" >&2
  [ -s "$err" ] && cat "$err" >&2
  return 1
}

latest_success_run() { # latest_success_run <workflow>
  success_run_ids "$1" 1 | head -1
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
  # The Claude plugin's manifest version and the @cejel/cejel version its MCP server launches
  # (scripts/claude-plugin-versions.mjs holds the same two paths and the same pin pattern).
  got="$(git show "$RELEASE_SHA:plugins/cejel/.claude-plugin/plugin.json" | jq -r .version)"; [ "$got" = "$VERSION" ] || bad+=" plugin.json.version=$got"
  got="$(git show "$RELEASE_SHA:plugins/cejel/.mcp.json" | jq -r '.mcpServers.cejel as $s | if $s.command == "npx" and ($s.args | length) == 3 and $s.args[0] == "-y" and $s.args[2] == "mcp" then ($s.args[1] | (capture("^@cejel/cejel@(?<v>.+)$").v // "<not pinned>")) else "<not npx -y @cejel/cejel@X mcp>" end')"
  [ "$got" = "$VERSION" ] || bad+=" .mcp.json.@cejel/cejel=$got"
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
  [ "$PRERELEASE" = 1 ] && read_prerelease_baseline
  say "  preflight ok"
}

gh_latest_release() { gh_r release view --json tagName --jq .tagName; } # no tag argument: the repository's latest release

# What a user gets by default, read before anything moves; stages 5 and 13 require both unchanged.
# A resumed run reads them after the earlier stages ran, so it also requires latest to be a final
# version other than this one: a resume cannot prove "unchanged" across runs, only "not this".
read_prerelease_baseline() {
  NPM_LATEST_BEFORE="$(npm_latest_json)" || die "registry unreadable; cannot record dist-tags.latest before the run"
  case "$NPM_LATEST_BEFORE" in
    \"*-*\"|null|"") die "npm dist-tags.latest is $NPM_LATEST_BEFORE before the run; a prerelease run needs latest on a final version" ;;
  esac
  GH_LATEST_BEFORE="$(gh_latest_release 2>"$WORK/err")" || die "could not read the latest GitHub release: $(cat "$WORK/err")"
  [ -n "$GH_LATEST_BEFORE" ] && [ "$GH_LATEST_BEFORE" != "$TAG" ] || die "releases/latest is '$GH_LATEST_BEFORE' before the run; a prerelease run needs it on a final release"
  say "  prerelease: npm dist-tag next; GitHub release flagged prerelease. Must not move: dist-tags.latest $NPM_LATEST_BEFORE, releases/latest $GH_LATEST_BEFORE"
}

gh_latest_unchanged() { # gh_latest_unchanged <stage>
  local now; now="$(gh_latest_release 2>"$WORK/err")" || die "stage $1: could not read the latest GitHub release: $(cat "$WORK/err")"
  [ "$now" = "$GH_LATEST_BEFORE" ] || die "stage $1: releases/latest is $now, was $GH_LATEST_BEFORE before the run"
  say "  releases/latest unchanged: $now"
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
  if [ "$PRERELEASE" = 1 ]; then
    act gh release create "$TAG" --repo "$REPO" --draft --prerelease --verify-tag --title "$TAG" --notes "cejel $VERSION (release candidate)"
    [ "$DRY_RUN" = 1 ] && return 0
    [ "$(release_view)" = "true|true" ] || die "after create, $TAG is not a draft prerelease"
    return 0
  fi
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
  if [ "$PRERELEASE" = 1 ]; then stage5_prerelease; return; fi
  local st; st="$(release_view)"
  if [ -z "$st" ]; then
    [ "$DRY_RUN" = 1 ] || die "no release on $TAG"
    # The release does not exist yet, so a dry run cannot read it; it still shows the prompt the
    # real run will stop at, so the preview lists every irreversible step.
    irreversible 5 "draft release $TAG, twelve assets verified (precondition checked in the real run; no release exists yet in this dry run)" -- gh release edit "$TAG" --repo "$REPO" --draft=false
    return 0
  fi
  if [ "$st" = "false|false" ]; then done_ 5 publish-release "published, not a prerelease"; return; fi
  [ "$st" != "false|true" ] || die "$TAG is published but flagged prerelease"
  irreversible 5 "draft release $TAG, twelve assets verified" -- gh release edit "$TAG" --repo "$REPO" --draft=false
  [ "$DRY_RUN" = 1 ] && return 0
  [ "$(release_view)" = "false|false" ] || die "after edit, $TAG is not published/non-prerelease"
}

# A release candidate's GitHub release: published flagged prerelease and never marked latest, with
# no binaries (stage 4 is skipped). releases/latest is read back afterwards, not assumed.
stage5_prerelease() {
  local st; st="$(release_view)"
  case "$st" in
    "false|true") done_ 5 publish-release "published, flagged prerelease" ;;
    "false|false") die "$TAG is published and not flagged prerelease; a release candidate is never a full release" ;;
    *)
      [ -n "$st" ] || [ "$DRY_RUN" = 1 ] || die "no release on $TAG"
      irreversible 5 "draft release $TAG (isDraft|isPrerelease = ${st:-none yet in this dry run}); releases/latest is $GH_LATEST_BEFORE and must not move" -- gh release edit "$TAG" --repo "$REPO" --draft=false --prerelease --latest=false
      [ "$DRY_RUN" = 1 ] && return 0
      [ "$(release_view)" = "false|true" ] || die "after edit, $TAG is not a published prerelease"
      ;;
  esac
  gh_latest_unchanged 5
}

# ---------------------------------------------------------------- stage 6 / 7
npm_log_plus_line() { # npm_log_plus_line <run id>
  local log; log="$(read_run_log "$1")" || return 0
  grep -F "+ $NPM_PKG@$VERSION" <<<"$log" | head -1 || true
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
    if [ "$PRERELEASE" = 1 ]; then
      done_ 7 npm-publish "registry entry verified (provenance, publisher, next tag, latest unchanged, gitHead)"
    else
      done_ 7 npm-publish "registry entry verified (provenance, publisher, latest tag)"
    fi
    return
  fi
  local id tagged=""
  [ "$PRERELEASE" = 1 ] && tagged="; the workflow derives dist-tag next from the version, latest stays $NPM_LATEST_BEFORE"
  confirm 7 "gh workflow run publish-npm.yml --repo $REPO --ref $TAG -f release_tag=$TAG -f verify_only=false" \
    "verify-only run succeeded this session or earlier; registry has no $VERSION$tagged"
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

# find_npm_publish_run: the newest successful publish-npm run on $TAG whose log carries the '+' line.
# It runs in a command substitution, so when it finds none it writes the actual cause to
# $NPM_LOOKUP_CAUSE for finish_npm's refusal (#581): the listing stayed empty, or some runs' logs
# could not be read, or every log read lacks the line.
NPM_LOOKUP_CAUSE="$WORK/npm-lookup.cause"
find_npm_publish_run() {
  local id ids log unreadable=0 noline=0
  ids="$(success_run_ids publish-npm.yml 5)"
  if [ -z "$ids" ]; then
    echo "the publish-npm.yml run listing on $TAG stayed empty or gh failed after $RUN_LIST_TRIES tries" >"$NPM_LOOKUP_CAUSE"
    return 0
  fi
  for id in $ids; do
    if ! log="$(read_run_log "$id")"; then unreadable=$((unreadable + 1)); continue; fi
    if grep -qF "+ $NPM_PKG@$VERSION" <<<"$log"; then echo "$id"; return 0; fi
    noline=$((noline + 1))
  done
  echo "of the $((unreadable + noline)) successful publish-npm.yml run(s) on $TAG, $unreadable had a log that could not be read after $RUN_LIST_TRIES tries and $noline had a log without the line" >"$NPM_LOOKUP_CAUSE"
  return 0
}

finish_npm() {
  GIT_HEAD="$(registry_gitHead)"
  if [ -z "$RUN_NPM" ]; then die "registry entry is clean but no successful publish-npm run on $TAG has a '+ $NPM_PKG@$VERSION' log line: $(cat "$NPM_LOOKUP_CAUSE" 2>/dev/null || echo 'cause not recorded') (gh's stderr, if any, is above)"; fi
  local log; log="$(read_run_log "$RUN_NPM")" || die "could not read run $RUN_NPM's log after $RUN_LIST_TRIES tries (gh failed or returned nothing; gh's stderr, if any, is above)"
  grep -qF "+ $NPM_PKG@$VERSION" <<<"$log" || die "run $RUN_NPM log has no '+ $NPM_PKG@$VERSION' line"
  TLOG_URL="$(grep -Eo 'https://search\.sigstore\.dev/[^ ]+' <<<"$log" | head -1 || true)"
  say "  npm run $RUN_NPM; gitHead ${GIT_HEAD:-none}; transparency log: ${TLOG_URL:-<not found in run log>}"
  if [ "$PRERELEASE" = 1 ]; then
    NPM_INTEGRITY="$(registry_json | jq -r --arg v "$VERSION" '.versions[$v].dist.integrity // ""')" || die "registry unreadable"
    say "  tarball integrity ${NPM_INTEGRITY:-<none in the registry entry>}"
  fi
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

# One read: sets MCP_CODE (HTTP status, empty when curl itself failed), MCP_BODY, MCP_ERR.
mcp_attempt() {
  local raw
  if raw="$(curl -sS --max-time "$MCP_TIMEOUT" -w '\n%{http_code}' "https://registry.modelcontextprotocol.io/v0.1/servers/$MCP_NAME/versions/$VERSION" 2>"$WORK/mcp_err")"; then
    MCP_CODE="${raw##*$'\n'}"; MCP_BODY="${raw%$'\n'*}"; MCP_ERR=""
  else
    MCP_CODE=""; MCP_BODY=""; MCP_ERR="$(head -c 300 "$WORK/mcp_err")"
  fi
}

# Three states, never conflated. Only LAG is a claim about the registry; a failed read is not one
# (cejel-site's disclosedLag is a published claim that the registry serves an older version).
read_mcp() {
  local attempt v
  for attempt in 1 2; do
    mcp_attempt
    # Retry once, only when no answer came back (timeout, connection) or the answer was HTTP 5xx.
    if { [ -z "$MCP_CODE" ] || [[ "$MCP_CODE" =~ ^5 ]]; } && [ "$attempt" = 1 ]; then sleep "$MCP_RETRY_DELAY"; continue; fi
    break
  done
  if [ -z "$MCP_CODE" ]; then
    MCP_STATE="NOT READ: ${MCP_ERR:-curl failed without a message}; $MCP_NOT_LAG"
  elif [ "$MCP_CODE" != 200 ]; then
    MCP_STATE="NOT READ: HTTP $MCP_CODE $(head -c 200 <<<"$MCP_BODY"); $MCP_NOT_LAG"
  else
    v="$(jq -r '.server.version // .version // empty' <<<"$MCP_BODY" 2>/dev/null || true)"
    if [ "$v" = "$VERSION" ]; then MCP_STATE="serves $VERSION"
    elif [ -n "$v" ]; then MCP_STATE="LAG: serves $v (expected $VERSION)"
    else MCP_STATE="NOT READ: HTTP 200 without a version field: $(head -c 200 <<<"$MCP_BODY"); $MCP_NOT_LAG"
    fi
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
  # The formula installs the four native binaries, each with its own digest from the SHA256SUMS
  # that stage 4 downloaded and verified. The Windows binary is not in the formula.
  local sums="$WORK/assets/SHA256SUMS" t digest
  if [ -s "$sums" ]; then
    say "  operator command (tap repo): bump Formula/cejel.rb to version $VERSION with these binary urls and sha256 values (from the verified SHA256SUMS):"
    for t in Darwin-arm64 Darwin-x86_64 Linux-aarch64 Linux-x86_64; do
      digest="$(awk -v n="cejel-$t" '{f=$2; sub(/^\*/,"",f)} f==n{print $1}' "$sums")"
      [ -n "$digest" ] || { say "    cejel-$t: no digest in SHA256SUMS; read it from the release by hand"; continue; }
      say "    https://github.com/$REPO/releases/download/$TAG/cejel-$t  sha256 $digest"
    done
    say "  operator command (tap repo): in .github/workflows/verify-cejel-consumer-routes.yml set expected_version: '$VERSION' and pin $REPO@$TAG"
  else
    say "  [dry-run] no verified SHA256SUMS yet; the four binary digests are printed once stage 4 has verified the release"
  fi
  say "  ORDER: the tap's action-routes check reads action@v1, so the tap PR stays red until stage 12 has moved v1. Do not wait on the tap check before stage 12."
}

# ---------------------------------------------------------------- stage 11
currency_after() { # currency_after <since-iso> -> "id event createdAt" of the newest run of ANY trigger
  # Not only workflow_run: a run dispatched after the v1 move or the site update supersedes the
  # workflow_run one, and reading the older run reports a state the world has left.
  gh_r run list --workflow verify-release-currency.yml --limit 20 --json databaseId,createdAt,event \
    | jq -r --arg s "$1" '[.[]|select(.createdAt >= $s)]|sort_by(.createdAt)|last|select(.!=null)|"\(.databaseId) \(.event) \(.createdAt)"'
}

# The surfaces that cannot pass before stage 12 moves v1 and the tap and site are updated: the
# Action and the tap read action@v1, and the cejel.dev surfaces read the site record. Matched by
# the label on each [FAIL] line.
PRE_V1_MAY_FAIL=("GitHub Action" "Homebrew tap" "cejel.dev homepage" "cejel.dev for-engineers" "changelog" "leaderboard")

# currency_read <run id>: wait for completion, then set CUR_PASS, CUR_FAIL, CUR_FAIL_LINES, CUR_FAIL_LABELS.
currency_read() {
  local id="$1" status log
  status="$(gh_r run view "$id" --json status --jq .status)"
  if [ "$status" != "completed" ]; then
    [ "$DRY_RUN" = 1 ] && { say "  currency run $id is $status (in flight, not a failure)"; return 1; }
    gh_r run watch "$id" >/dev/null 2>&1 || true
  fi
  # #581: through read_run_log, so a failed or empty read is retried and then refused by name, not a
  # silent exit or a "0 surfaces" count.
  log="$(read_run_log "$id")" || die "could not read currency run $id's log after $RUN_LIST_TRIES tries (gh failed or returned nothing; gh's stderr, if any, is above)"
  CUR_PASS="$(grep -c '\[PASS\]' <<<"$log" || true)"; CUR_FAIL="$(grep -c '\[FAIL\]' <<<"$log" || true)"
  [ $((CUR_PASS + CUR_FAIL)) -eq "$CURRENCY_SURFACES" ] || die "currency run $id reported $((CUR_PASS + CUR_FAIL)) surfaces, expected $CURRENCY_SURFACES"
  CUR_FAIL_LINES="$(grep '\[FAIL\]' <<<"$log" || true)"
  CUR_FAIL_LABELS="$(sed -n 's/.*\[FAIL\] \(.*\): observed=.*/\1/p' <<<"$CUR_FAIL_LINES")"
}

stage11() {
  say "stage 11 (currency)"
  if [ "$DRY_RUN" = 1 ] && [ -z "$OCI_DIGEST" ]; then say "  [dry-run] distribution not published; currency not read"; return; fi
  local since waited=0 pick="" id sha="$RELEASE_SHA" ev created
  # Read the newest verify-release-currency run, whatever its trigger, created after the last
  # publish workflow completed.
  since="$(gh_r run view "${RUN_DIST:-$RUN_NPM}" --json updatedAt --jq .updatedAt 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
  while [ -z "$pick" ]; do
    pick="$(currency_after "$since")"
    [ -n "$pick" ] && break
    [ "$waited" -ge "$CURRENCY_WAIT" ] && break
    [ "$DRY_RUN" = 1 ] && break
    sleep "$POLL_INTERVAL"; waited=$((waited + POLL_INTERVAL))
  done
  if [ -z "$pick" ]; then
    if [ "$DRY_RUN" = 1 ]; then act gh workflow run verify-release-currency.yml --repo "$REPO" -f "version=$VERSION" -f "commit=$sha"; return 0; fi
    id="$(dispatch_currency "$sha")"; ev="workflow_dispatch"; created="just now"
  else
    read -r id ev created <<<"$pick"
  fi
  say "  reading currency run $id (event $ev, created $created)"
  currency_read "$id" || return 0
  RUN_CURRENCY="$id"
  local label allowed bad=""
  if [ "$CUR_FAIL" -eq 0 ]; then CURRENCY_STATE="$CURRENCY_SURFACES of $CURRENCY_SURFACES"
  else
    while IFS= read -r label; do
      allowed=0; for a in "${PRE_V1_MAY_FAIL[@]}"; do [ "$label" = "$a" ] && allowed=1; done
      [ "$allowed" = 1 ] || bad+="$label; "
    done <<<"$CUR_FAIL_LABELS"
    [ -z "$bad" ] || die "currency run $id: $CUR_PASS pass / $CUR_FAIL fail, and the failures are not all among {$(printf '%s, ' "${PRE_V1_MAY_FAIL[@]}")} (unexpected: $bad):
$CUR_FAIL_LINES"
    CURRENCY_STATE="$CUR_PASS of $CURRENCY_SURFACES (before v1 moves, the tap bump and the site record; stage 13 requires $CURRENCY_SURFACES of $CURRENCY_SURFACES)"
  fi
  say "  currency run $id: $CURRENCY_STATE"
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
# A release is complete only when this passes (docs/release-process.md). It runs after stage 12 and
# after the operator's tap bump and site record, so on a first pass it may refuse: do those, then
# re-run with --from 13 (every earlier stage re-reads and reports done).
stage13() {
  if [ "$PRERELEASE" = 1 ]; then stage13_prerelease; return; fi
  say "stage 13 (final currency: $CURRENCY_SURFACES of $CURRENCY_SURFACES)"
  local id
  if [ "$DRY_RUN" = 1 ]; then
    act gh workflow run verify-release-currency.yml --repo "$REPO" -f "version=$VERSION" -f "commit=$RELEASE_SHA"
    say "  [dry-run] would require $CURRENCY_SURFACES of $CURRENCY_SURFACES from the fresh run"
    return 0
  fi
  id="$(dispatch_currency "$RELEASE_SHA")"
  currency_read "$id"
  RUN_CURRENCY="$id"
  [ "$CUR_FAIL" -eq 0 ] || die "stage 13: fresh currency run $id: $CUR_PASS pass / $CUR_FAIL fail; the release is not complete until $CURRENCY_SURFACES of $CURRENCY_SURFACES (tap bump and site record done?):
$CUR_FAIL_LINES"
  CURRENCY_STATE="$CURRENCY_SURFACES of $CURRENCY_SURFACES"
  say "  fresh currency run $id: $CURRENCY_SURFACES of $CURRENCY_SURFACES -- release complete"
}

# A release candidate is complete when the registry and GitHub, read now, show it published under
# next and every default where it was at preflight.
stage13_prerelease() {
  say "stage 13 (prerelease: npm and GitHub read back)"
  if [ "$DRY_RUN" = 1 ] && ! npm_has_version; then
    say "  [dry-run] would require dist-tags.next = $VERSION, dist-tags.latest = $NPM_LATEST_BEFORE, gitHead = the tag commit, $TAG a published prerelease and releases/latest = $GH_LATEST_BEFORE"
    return 0
  fi
  local p; p="$(npm_problems)"
  [ -z "$p" ] || die "stage 13: $(tr '\n' ';' <<<"$p")"
  [ "$(release_view)" = "false|true" ] || die "stage 13: $TAG is not a published prerelease"
  gh_latest_unchanged 13
  GIT_HEAD="$(registry_gitHead)"
  NPM_INTEGRITY="$(registry_json | jq -r --arg v "$VERSION" '.versions[$v].dist.integrity // ""')" || die "registry unreadable"
  say "  dist-tags.next = $VERSION; dist-tags.latest unchanged ($NPM_LATEST_BEFORE); gitHead $GIT_HEAD = the tag commit -- release candidate complete"
}

# ---------------------------------------------------------------- handback
handback() {
  if [ "$PRERELEASE" = 1 ]; then handback_prerelease; return; fi
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

handback_prerelease() {
  cat <<EOF

================ HANDBACK: release candidate $VERSION ================
version:              $VERSION (npm dist-tag next)
release commit:       $RELEASE_SHA
gitHead (npm):        ${GIT_HEAD:-<not read>}
tarball integrity:    ${NPM_INTEGRITY:-<not read>}
dist-tags.latest:     $NPM_LATEST_BEFORE (read at preflight; must be unchanged)
GitHub release:       $TAG, flagged prerelease; releases/latest $GH_LATEST_BEFORE (must be unchanged)
npm run:              ${RUN_NPM:-<not recorded>}
transparency log:     ${TLOG_URL:-<not read>}
skipped: prerelease   binaries, OCI image, MCP Registry, Homebrew tap, currency, v1, site record
=============================================================================
Installed only by exact version: npx -y @cejel/cejel@$VERSION
EOF
}

# ---------------------------------------------------------------- main
# --from is a convenience only: stages before it still run their reads, so no precondition is skipped.
run_stage() { # run_stage <n> <fn>
  if [ "$1" -lt "$FROM_STAGE" ]; then say "stage $1: before --from $FROM_STAGE; its state checks still run"; fi
  "$2"
}

STAGE_NAMES=(- preflight tag draft-release binaries publish-release npm-verify npm-publish distribution-verify distribution-publish homebrew currency action-major-tag final)

[ "$DRY_RUN" = 1 ] && say "DRY RUN: reads execute, no tag/release/workflow/push is performed"
[ "$PRERELEASE" = 1 ] && say "PRERELEASE $VERSION: runs stages 1-3, 5-7 and 13; nothing a user gets by default moves"
stage1
for n in 2 3 4 5 6 7 8 9 10 11 12 13; do
  if [ "$PRERELEASE" = 1 ] && [ -n "$(prerelease_skip "$n")" ]; then
    say "stage $n (${STAGE_NAMES[$n]}): skipped: prerelease -- $(prerelease_skip "$n")"
    continue
  fi
  run_stage "$n" "stage$n"
done
[ "$PRERELEASE" = 1 ] && say "site record: skipped: prerelease -- cejel-site's current-release record stays on the newest final release"
handback
