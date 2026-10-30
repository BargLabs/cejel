#!/usr/bin/env bash
# Tests for scripts/release.sh. Static structural asserts, then functional runs against shell
# shims of gh, curl and git placed first on PATH that return canned state. Nothing here touches the
# network, the real repository, or a real release.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${SCRIPT_DIR}/release.sh"
V="0.4.11"
PASS=0; FAIL=0
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

ok()  { echo "PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $1"; [ -n "${2:-}" ] && echo "  $2"; FAIL=$((FAIL + 1)); }
check() { if [ "$2" = 0 ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }

# ============================= static structural guarantees =============================
# (a) Exactly the five irreversible stages are gated.
gated="$(grep -E '^[[:space:]]*(confirm|irreversible) [0-9]+' "$TARGET" | sed -E 's/^[[:space:]]*(confirm|irreversible) ([0-9]+).*/\2/' | sort -n | uniq | tr '\n' ' ')"
[ "$gated" = "2 5 7 9 12 " ]; check "static: confirm gates stages 2 5 7 9 12 and no others" $? "got: $gated"

# (b) In every function, an irreversible command is preceded by a confirm/irreversible line.
viol="$(awk '
  /^[a-zA-Z0-9_]+\(\) *\{/ { fn=$1; seen=0 }
  /^[[:space:]]*(confirm|irreversible) [0-9]+/ { seen=1 }
  fn ~ /^stage[0-9]+/ && /(git push|git tag|gh release edit|verify_only=false)/ && $0 !~ /^[[:space:]]*#/ && seen==0 { print fn": "$0 }
' "$TARGET")"
[ -z "$viol" ]; check "static: every irreversible command follows a confirm in its stage" $? "$viol"

# (c) No mutating command is run bare; each goes through act / irreversible / confirm text.
bare="$(grep -nE '^[[:space:]]*(git (tag|push)|gh (release (create|edit)|workflow run)|gh_r (release (create|edit)|workflow run)) ' "$TARGET" || true)"
[ -z "$bare" ]; check "static: no state-changing command is invoked outside act/irreversible" $? "$bare"

# (d) No postcondition is read from an exit code.
grep -nF '$?' "$TARGET" >/dev/null 2>&1
[ $? -ne 0 ]; check "static: script never reads \$? (state is read from the world)" $? ""

# (e) Every gh call carries --repo (gh_r adds it; direct gh calls must pass it).
direct="$(grep -nE '(^|[^_a-zA-Z])gh (run|release|workflow|api)' "$TARGET" | grep -v -- '--repo' | grep -vE '^[0-9]+:[[:space:]]*#|say |confirm |die |echo ' || true)"
[ -z "$direct" ]; check "static: direct gh invocations carry --repo" $? "$direct"

# (f) Never edits a file or commits.
! grep -vE '^[[:space:]]*#' "$TARGET" | grep -nE 'git (commit|add)\b|>>? *"?\$?\{?(REPO_ROOT|PWD)' >/dev/null
check "static: no git commit/add" $? ""

# (g) Every release workflow is dispatched with --ref "$TAG" (the tag-ref rule).
n_dispatch="$(grep -c 'gh workflow run' "$TARGET")"
n_ref="$(grep -E 'gh workflow run' "$TARGET" | grep -c -- '--ref "\$TAG"')"
# the currency run is dispatched on main by design (its own inputs carry the version and commit)
[ "$n_ref" -ge 1 ] && grep -q 'dispatch_and_watch()' "$TARGET" && grep -q -- '--ref "\$TAG"' "$TARGET"
check "static: tag-ref dispatch rule present ($n_ref of $n_dispatch literal dispatch lines)" $? ""

# ============================= shims =============================
BIN="$TEST_TMP/bin"; mkdir -p "$BIN"

cat >"$BIN/git" <<'SHIM'
#!/usr/bin/env bash
S="$FAKE_STATE"
echo "git $*" >>"$S/calls.log"
case "$1" in
  fetch)
    # Like real git: a fetch with --tags refuses when a local tag differs from the remote's
    # (git does not overwrite an existing tag without a forced refspec).
    if [ -s "$S/fetch_fail" ]; then cat "$S/fetch_fail" >&2; exit 1; fi
    case " $* " in
      *" --tags "*)
        if [ -s "$S/local_v1_sha" ] && [ "$(cat "$S/local_v1_sha")" != "$(cat "$S/v1_sha" 2>/dev/null)" ]; then
          echo " ! [rejected]        v1         -> v1  (would clobber existing tag)" >&2; exit 1
        fi ;;
    esac
    exit 0 ;;
  worktree|config) exit 0 ;;
  remote) echo "https://github.com/BargLabs/cejel.git" ;;
  rev-parse)
    case "$2" in
      origin/main) cat "$S/main_sha" ;;
      --verify)
        # rev-parse --verify -q <ref>^{commit}: a release branch resolves only when the test staged one.
        case "$4" in
          origin/release/*) if [ -s "$S/release_branch_sha" ]; then cat "$S/release_branch_sha"; else exit 1; fi ;;
          *) echo "unhandled rev-parse $*" >&2; exit 1 ;;
        esac ;;
      *'^{commit}') cat "$S/tag_sha" ;;
      *) echo "unhandled rev-parse $2" >&2; exit 1 ;;
    esac ;;
  ls-remote)
    shift 2
    for ref in "$@"; do
      case "$ref" in
        refs/tags/v1) [ -s "$S/v1_sha" ] && printf '%s\trefs/tags/v1\n' "$(cat "$S/v1_sha")" ;;
        refs/tags/*'^{}') [ -s "$S/tag_sha" ] && printf '%s\t%s\n' "$(cat "$S/tag_sha")" "$ref" ;;
      esac
    done
    exit 0 ;;
  show)
    case "$2" in
      *:*) f="${2#*:}"; [ -f "$S/files/$f" ] && cat "$S/files/$f" || { echo "no $2" >&2; exit 1; } ;;
    esac ;;
  merge-base) [ "$(cat "$S/ancestor")" = 1 ] ;;
  push)
    # The tag on origin after a tag push, when the test staged one.
    if [ -s "$S/tag_after_push" ]; then cp "$S/tag_after_push" "$S/tag_sha"; fi
    exit 0 ;;
  tag) exit 0 ;;
  *) echo "unhandled git $*" >&2; exit 1 ;;
esac
SHIM

cat >"$BIN/gh" <<'SHIM'
#!/usr/bin/env bash
S="$FAKE_STATE"
echo "gh $*" >>"$S/calls.log"
args=("$@"); jqf=""; want_log=0
for ((i=0; i<${#args[@]}; i++)); do
  [ "${args[$i]}" = "--jq" ] && jqf="${args[$((i+1))]}"
  [ "${args[$i]}" = "--log" ] && want_log=1
done
emit() { if [ -n "$jqf" ]; then jq -r "$jqf" "$1"; else cat "$1"; fi; }
case "$1 $2" in
  "release view")
    # Without a tag argument gh shows the repository's latest release ($S/latest_release.json).
    if [[ "${3:-}" == --* ]]; then
      if [ -f "$S/latest_release.json" ]; then emit "$S/latest_release.json"; else echo "release not found" >&2; exit 1; fi
    elif [ -f "$S/release.json" ]; then emit "$S/release.json"; else echo "release not found" >&2; exit 1; fi ;;
  "release download")
    for ((i=0; i<${#args[@]}; i++)); do [ "${args[$i]}" = "--dir" ] && d="${args[$((i+1))]}"; done
    cp "$S"/assets/* "$d"/ ;;
  "workflow run")
    # A currency dispatch appends a new run (as GitHub would) when the test staged its log.
    case " $* " in
      *" verify-release-currency.yml "*)
        if [ -s "$S/dispatch_runlog.txt" ]; then
          jq '. + [{databaseId:99999999999,createdAt:"2099-06-01T00:00:00Z",event:"workflow_dispatch",status:"completed"}]' "$S/runlist.json" >"$S/rl.tmp" && mv "$S/rl.tmp" "$S/runlist.json"
          cp "$S/dispatch_runlog.txt" "$S/runlog_99999999999.txt"
        fi ;;
      *" publish-npm.yml "*" verify_only=false "*)
        # The registry after a publish, when the test staged one.
        [ -f "$S/npm_after_publish.json" ] && cp "$S/npm_after_publish.json" "$S/npm.json" ;;
    esac
    exit 0 ;;
  "release create") exit 0 ;;
  "release edit")
    # The release and the repository's latest release after the edit, when the test staged them.
    [ -f "$S/release_after_edit.json" ] && cp "$S/release_after_edit.json" "$S/release.json"
    [ -f "$S/latest_release_after_edit.json" ] && cp "$S/latest_release_after_edit.json" "$S/latest_release.json"
    exit 0 ;;
  "run list")
    # Like GitHub's filtered listing on a bad moment: the first N publish-npm.yml listings
    # ($S/runlist_empty) answer []. Scoped to that workflow so no other stage's lookup absorbs them.
    if [ -s "$S/runlist_empty" ] && [ "$(cat "$S/runlist_empty")" -gt 0 ] && [[ " $* " == *" publish-npm.yml "* ]]; then
      echo $(( $(cat "$S/runlist_empty") - 1 )) >"$S/runlist_empty"; echo '[]' >"$S/rl.empty"; emit "$S/rl.empty"; exit 0
    fi
    # The same for one other named workflow: $S/runlist_empty_<workflow file> holds its count.
    for wfe in "$S"/runlist_empty_*; do
      [ -s "$wfe" ] || continue; wfn="${wfe##*/runlist_empty_}"
      if [ "$(cat "$wfe")" -gt 0 ] && [[ " $* " == *" $wfn "* ]]; then
        echo $(( $(cat "$wfe") - 1 )) >"$wfe"; echo '[]' >"$S/rl.empty"; emit "$S/rl.empty"; exit 0
      fi
    done
    # Like real gh: --event narrows the list to runs of that trigger.
    ev=""; for ((i=0; i<${#args[@]}; i++)); do [ "${args[$i]}" = "--event" ] && ev="${args[$((i+1))]}"; done
    if [ -n "$ev" ]; then jq --arg e "$ev" '[.[]|select(.event==$e)]' "$S/runlist.json" >"$S/rl.filtered"; emit "$S/rl.filtered"
    else emit "$S/runlist.json"; fi ;;
  "run view")
    # $S/runlog_plan_<id>: one outcome per log read of run <id>, consumed in order: "ok", or "fail"
    # (gh exits 1 with an error on stderr). Lets a test fail exactly the read it targets.
    if [ "$want_log" = 1 ] && [ -s "$S/runlog_plan_$3" ]; then
      step="$(head -1 "$S/runlog_plan_$3")"; tail -n +2 "$S/runlog_plan_$3" >"$S/plan.tmp"; mv "$S/plan.tmp" "$S/runlog_plan_$3"
      [ "$step" = fail ] && { echo "HTTP 502: simulated log read failure" >&2; exit 1; }
    fi
    if [ "$want_log" = 1 ]; then
      # A per-run log keeps the default log's two header lines (npm publish line, sigstore URL).
      if [ -f "$S/runlog_$3.txt" ]; then head -2 "$S/runlog.txt"; cat "$S/runlog_$3.txt"; else cat "$S/runlog.txt"; fi
    else emit "$S/runview.json"; fi ;;
  "run watch") exit 0 ;;
  *) echo "unhandled gh $*" >&2; exit 1 ;;
esac
SHIM

cat >"$BIN/curl" <<'SHIM'
#!/usr/bin/env bash
S="$FAKE_STATE"
echo "curl $*" >>"$S/calls.log"
out=""; url=""
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
  [ "${args[$i]}" = "-o" ] && out="${args[$((i+1))]}"
  case "${args[$i]}" in http*) url="${args[$i]}" ;; esac
done
case "$url" in
  *registry.npmjs.org*) cat "$S/npm.json" ;;
  *ghcr.io/token*) echo '{"token":"t"}' ;;
  *ghcr.io/v2*) [ -s "$S/oci_digest" ] && printf 'HTTP/2 200\r\nDocker-Content-Digest: %s\r\n' "$(cat "$S/oci_digest")" || exit 22 ;;
  *modelcontextprotocol.io*)
    # Like curl without -f: an HTTP error status is not a failing exit. $S/mcp_queue holds one
    # outcome per line, consumed one per call: an HTTP status, or "timeout" (curl exit 28).
    code=200
    if [ -s "$S/mcp_queue" ]; then
      code="$(head -1 "$S/mcp_queue")"; tail -n +2 "$S/mcp_queue" >"$S/mcp_queue.tmp"; mv "$S/mcp_queue.tmp" "$S/mcp_queue"
    fi
    [ "$code" = timeout ] && { echo "curl: (28) Operation timed out after 45001 milliseconds" >&2; exit 28; }
    [ "$code" = 200 ] && [ ! -f "$S/mcp.json" ] && code=404
    [ "$code" = 200 ] && cat "$S/mcp.json"
    case " $* " in *" -w "*) printf '\n%s' "$code" ;; esac ;;
  *) echo "unhandled curl $url" >&2; exit 1 ;;
esac
SHIM
# The prerelease rule (release-version.mjs check-prerelease-commit) reads the repository with git,
# which is shimmed here, so its verdict is staged: $S/rule_refuse holds the refusal it prints. Every
# other node call runs the real node.
cat >"$BIN/node" <<'SHIM'
#!/usr/bin/env bash
S="$FAKE_STATE"
case " $* " in
  *" check-prerelease-commit "*)
    echo "node $*" >>"$S/calls.log"
    if [ -s "$S/rule_refuse" ]; then cat "$S/rule_refuse" >&2; exit 1; fi
    echo "$4 may be released as $3: one commit on main, reproduced by the bump"
    exit 0 ;;
esac
exec "$REAL_NODE" "$@"
SHIM
REAL_NODE="$(command -v node)"
chmod +x "$BIN"/git "$BIN"/gh "$BIN"/curl "$BIN"/node

sha_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; else openssl dgst -sha256 "$1" | awk '{print $NF}'; fi; }

TAGSHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
MAINSHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
NPM_OK='{"dist-tags":{"latest":"0.4.11"},"versions":{"0.4.11":{"gitHead":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","_npmUser":{"name":"GitHub Actions","email":"npm-oidc-no-reply@github.com"},"dist":{"attestations":{"provenance":{"predicateType":"https://slsa.dev/provenance/v1"}}}}}}'
NPM_NONE='{"dist-tags":{"latest":"0.4.10"},"versions":{"0.4.10":{}}}'
NPM_HAND='{"dist-tags":{"latest":"0.4.11"},"versions":{"0.4.11":{"_npmUser":{"name":"cejel","email":"x@example.com"},"dist":{}}}}'

SURFACES=("npm" "npm attestation" "GitHub release" "git tag" "OCI" "GitHub Action" "Homebrew tap" "MCP Registry" "cejel.dev homepage" "cejel.dev for-engineers" "changelog" "published-versions.json" "leaderboard" "Claude plugin")
# mklog [failing surface...]: the verifier's fourteen lines in its own format, prefixed as a run log shows them.
mklog() {
  local s f
  for s in "${SURFACES[@]}"; do
    for f in "$@"; do
      if [ "$f" = "$s" ]; then printf 'verify\tRun verifier\t2026-09-29T00:00:00Z [FAIL] %s: observed=old; reason=stale\n' "$s"; continue 2; fi
    done
    printf 'verify\tRun verifier\t2026-09-29T00:00:00Z [PASS] %s: observed=%s\n' "$s" "$V"
  done
}
# The failing set before v1 moves and before the tap and site are updated (measured 2026-10-02).
# The operator named "the three cejel.dev surfaces" without labels: homepage, for-engineers and
# leaderboard are the fixture's choice.
PREV1_FAILS=("GitHub Action" "Homebrew tap" "cejel.dev homepage" "cejel.dev for-engineers" "leaderboard")

# new_state <dir>: a finished 0.4.11 release, tag behind a moved main.
new_state() {
  local S="$1"; mkdir -p "$S/files" "$S/assets"
  echo "$MAINSHA" >"$S/main_sha"; echo "$TAGSHA" >"$S/tag_sha"; echo "$TAGSHA" >"$S/v1_sha"; echo 1 >"$S/ancestor"
  echo '{"version":"0.4.11"}' >"$S/files/package.json"; echo '{"version":"0.4.11"}' >"$S/files/server.json"
  echo '{"mcpRegistry":"0.4.11","oci":"0.4.11"}' >"$S/files/published-versions.json"
  printf 'FROM node\nARG VERSION=0.4.11\n' >"$S/files/Dockerfile"
  mkdir -p "$S/files/plugins/cejel/.claude-plugin"
  echo '{"name":"cejel","version":"0.4.11"}' >"$S/files/plugins/cejel/.claude-plugin/plugin.json"
  echo '{"mcpServers":{"cejel":{"command":"npx","args":["-y","@cejel/cejel@0.4.11","mcp"]}}}' >"$S/files/plugins/cejel/.mcp.json"
  printf '# Changelog\n\n## [Unreleased]\n\n## [0.4.11] - 2026-09-25\n- x\n' >"$S/files/CHANGELOG.md"
  mkdir -p "$S/files/action"; printf 'name: cejel-action\n' >"$S/files/action/action.yml"
  local t names=()
  for t in Darwin-arm64 Darwin-x86_64 Linux-aarch64 Linux-x86_64 Windows-x86_64.exe; do
    echo "bin-$t" >"$S/assets/cejel-$t"; echo "{}" >"$S/assets/cejel-$t.spdx.json"
  done
  echo "{}" >"$S/assets/cejel-v$V-provenance.sigstore.json"
  : >"$S/assets/SHA256SUMS"
  for t in Darwin-arm64 Darwin-x86_64 Linux-aarch64 Linux-x86_64 Windows-x86_64.exe; do
    echo "$(sha_of "$S/assets/cejel-$t")  cejel-$t" >>"$S/assets/SHA256SUMS"
  done
  local a; for a in "$S"/assets/*; do names+=("$(basename "$a")"); done
  printf '%s\n' "${names[@]}" | jq -R '{name:.}' | jq -s '{isDraft:false,isPrerelease:false,assets:.}' >"$S/release.json"
  echo '[{"databaseId":12345678901,"createdAt":"2099-01-01T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
  echo '{"status":"completed","conclusion":"success","updatedAt":"2026-09-25T00:00:00Z"}' >"$S/runview.json"
  { echo "+ @cejel/cejel@$V"; echo "Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=123";
    mklog; } >"$S/runlog.txt"
  echo "$NPM_OK" >"$S/npm.json"
  echo "sha256:cafe" >"$S/oci_digest"
  echo '{"server":{"version":"0.4.11"}}' >"$S/mcp.json"
  : >"$S/calls.log"
}

# run_release <state dir> <stdin text> [args...] -> sets OUT, RC
run_release() {
  local S="$1" input="$2"; shift 2
  OUT="$(printf '%s\n' "$input" | FAKE_STATE="$S" REAL_NODE="$REAL_NODE" PATH="$BIN:$PATH" RELEASE_SKIP_VALIDATE=1 RELEASE_POLL_INTERVAL=0 RELEASE_POLL_MAX=0 RELEASE_CURRENCY_WAIT=0 RELEASE_RUN_FIND_SLEEP=0 RELEASE_MCP_RETRY_DELAY=0 \
    bash "$TARGET" "${RUN_V:-$V}" "$@" 2>&1)"; RC=$?
}
mutations() { grep -cE '^(git (tag|push)|gh (release (create|edit)|workflow run))' "$1/calls.log" || true; }
has() { grep -qF -- "$1" <<<"$OUT"; }

# 1. happy path, dry-run, finished release: every stage reads as done; resumability.
S="$TEST_TMP/s1"; new_state "$S"
run_release "$S" "" --dry-run
[ "$RC" = 0 ]; check "happy: dry-run on a finished release exits 0" $? "rc=$RC: $OUT"
for st in "2 (tag)" "3 (draft-release)" "4 (binaries)" "5 (publish-release)" "6 (npm-verify)" "7 (npm-publish)" "8 (distribution-verify)" "9 (distribution-publish)" "12 (action-major-tag)"; do
  has "stage $st: already done"; check "happy: stage $st reads as already done" $? "$OUT"
done
has "HANDBACK"; check "happy: handback printed" $? ""
has "14 of 14"; check "happy: currency reads 14 of 14 on a finished release" $? "$OUT"
has "would run: gh workflow run verify-release-currency.yml"; check "happy: stage 13 prints the fresh currency dispatch in dry-run" $? "$OUT"
[ "$(mutations "$S")" = 0 ]; check "happy: dry-run performs no mutating call" $? "$(cat "$S/calls.log")"

# 2. fresh release, dry-run: every action printed, none executed.
S="$TEST_TMP/s2"; new_state "$S"; rm -f "$S/tag_sha" "$S/v1_sha" "$S/release.json" "$S/oci_digest" "$S/mcp.json"; echo "$NPM_NONE" >"$S/npm.json"; echo "$MAINSHA" >"$S/main_sha"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "would run: git tag -s v$V" && has "would run: git push origin refs/tags/v$V" && has "would run: gh release create"
check "fresh: dry-run prints the tag and draft actions" $? "rc=$RC: $OUT"
has "would run: gh workflow run publish-npm.yml"; check "fresh: npm dispatch uses the tag ref" $? "$OUT"
grep -F "publish-npm.yml" <<<"$OUT" | grep -qF -- "--ref v$V"; check "fresh: workflows dispatched with --ref <tag>" $? "$OUT"
has "release-binaries.yml" && has "release_tag=v$V" && has "attach_to_release=true"; check "fresh: release-binaries.yml carries both required inputs" $? "$OUT"
[ "$(mutations "$S")" = 0 ]; check "fresh: dry-run performs no mutating call" $? "$(cat "$S/calls.log")"

# 3. tag pointing away from origin/main: refuse at stage 2.
S="$TEST_TMP/s3"; new_state "$S"; echo 0 >"$S/ancestor"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "not origin/main"; check "tag off origin/main history: refuse at stage 2" $? "rc=$RC: $OUT"

# 4. draft with eleven assets: refuse at stage 4.
S="$TEST_TMP/s4"; new_state "$S"
jq '.isDraft=true | .assets |= .[:11]' "$S/release.json" >"$S/r.json" && mv "$S/r.json" "$S/release.json"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "partial asset set" && has "missing:"; check "draft with partial assets: refuse at stage 4 naming the missing asset" $? "rc=$RC: $OUT"

# 5. registry already holds the version under the wrong publisher (the 0.4.9 case): refuse.
S="$TEST_TMP/s5"; new_state "$S"; echo "$NPM_HAND" >"$S/npm.json"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "outside the script" && has '"name":"cejel"'; check "_npmUser = cejel: refuse (0.4.9 case)" $? "rc=$RC: $OUT"

# 5b. registry holds the version without provenance: refuse.
S="$TEST_TMP/s5b"; new_state "$S"; jq -c 'del(.versions["0.4.11"].dist.attestations)' <<<"$NPM_OK" >"$S/npm.json"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "no provenance predicate"; check "no attestation: refuse" $? "rc=$RC: $OUT"

# 6. real run, version never appears: refuse quoting the run log's + line.
S="$TEST_TMP/s6"; new_state "$S"; echo "$NPM_NONE" >"$S/npm.json"; rm -f "$S/oci_digest"
run_release "$S" "yes"
[ "$RC" != 0 ] && has "still has no $V" && has "+ @cejel/cejel@$V"; check "poll window exhausted: refuse and quote the log's + line" $? "rc=$RC: $OUT"
grep -q 'verify_only=true' "$S/calls.log" && grep -q 'verify_only=false' "$S/calls.log"; check "poll: verify-only dispatched before the publish" $? "$(cat "$S/calls.log")"

# 6b. a resume after publishing: the filtered run listing answers [] twice, then the runs. The
# publish run is still found (stage 7 reads the '+' line), as on 2026-10-22's 0.6.8 resume.
S="$TEST_TMP/s6b"; new_state "$S"; echo 2 >"$S/runlist_empty"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "stage 7 (npm-publish): already done"; check "empty run listing: retried, publish run found, stage 7 done" $? "rc=$RC: $OUT"
! has "no successful publish-npm run"; check "empty run listing: no false refusal at stage 7" $? "$OUT"

# 6c. stage 7's publish-run lookup reads each run's log: the first two reads of the publish run fail,
# then succeed. The '+' line is still found and stage 7 reads as done.
S="$TEST_TMP/s6c"; new_state "$S"; printf 'fail\nfail\nok\nok\n' >"$S/runlog_plan_12345678901"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "stage 7 (npm-publish): already done"; check "failed log reads: retried, '+' line found, stage 7 done" $? "rc=$RC: $OUT"

# 6d. the lookup's read succeeds, then every read in finish_npm fails: a REFUSE naming the unreadable
# log, not a bare exit.
S="$TEST_TMP/s6d"; new_state "$S"; printf 'ok\nfail\nfail\nfail\nfail\nfail\n' >"$S/runlog_plan_12345678901"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "could not read run 12345678901's log" && has "simulated log read failure"
check "unreadable log in finish_npm: refuses with its cause and gh's stderr" $? "rc=$RC: $OUT"

# 6e. permanent absence: every publish-npm listing stays empty. Stage 7 refuses with the try count,
# prints a retry line per retry, and lists exactly RELEASE_RUN_LIST_TRIES times (default 5).
S="$TEST_TMP/s6e"; new_state "$S"; echo 999 >"$S/runlist_empty"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "the publish-npm.yml run listing on v$V stayed empty or gh failed after 5 tries"
check "permanent absence: stage 7 refuses naming the tries and the cause" $? "rc=$RC: $OUT"
[ "$(grep -c '^gh run list --workflow publish-npm.yml' "$S/calls.log")" = 5 ]
check "permanent absence: exactly 5 publish-npm listings" $? "$(grep '^gh run list' "$S/calls.log")"
[ "$(grep -c 'publish-npm.yml run listing on v0.4.11 empty or gh failed; retry' <<<"$OUT")" = 4 ] && has "retry 5/5"
check "permanent absence: one retry line per retry (4, ending 5/5)" $? "$OUT"

# 6f. RELEASE_RUN_LIST_TRIES must be a whole number of at least 1: 0 and a word are refused.
for bad in 0 abc; do
  S="$TEST_TMP/s6f-$bad"; new_state "$S"
  OUT="$(FAKE_STATE="$S" PATH="$BIN:$PATH" RELEASE_SKIP_VALIDATE=1 RELEASE_RUN_LIST_TRIES="$bad" bash "$TARGET" "$V" --dry-run 2>&1)"; RC=$?
  [ "$RC" != 0 ] && has "RELEASE_RUN_LIST_TRIES must be a whole number of at least 1 (got '$bad')"
  check "RELEASE_RUN_LIST_TRIES=$bad is refused" $? "rc=$RC: $OUT"
done

# 6g. #581: the publish run is listed but its log never carries the '+' line: the refusal names that
# cause, not an empty listing.
S="$TEST_TMP/s6g"; new_state "$S"; sed -i.bak '1d' "$S/runlog.txt"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "of the 1 successful publish-npm.yml run(s) on v$V, 0 had a log that could not be read after 5 tries and 1 had a log without the line"
check "#581: a listed run without the '+' line is named as the cause" $? "rc=$RC: $OUT"

# 6h. #581: every read of the listed publish run's log fails: the refusal names unreadable logs.
S="$TEST_TMP/s6h"; new_state "$S"; printf 'fail\nfail\nfail\nfail\nfail\n' >"$S/runlog_plan_12345678901"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "1 had a log that could not be read after 5 tries and 0 had a log without the line" && has "simulated log read failure"
check "#581: unreadable logs are named as the cause, with gh's stderr" $? "rc=$RC: $OUT"

# 6i. #581: stage 4's release-binaries.yml listing answers [] twice; the run is still recorded.
S="$TEST_TMP/s6i"; new_state "$S"; echo 2 >"$S/runlist_empty_release-binaries.yml"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "latest successful run on tag: 12345678901"
check "#581: stage 4's empty listing is retried and the binaries run recorded" $? "rc=$RC: $OUT"

# 6j. #581: stage 9's publish-distribution.yml listing answers [] twice; the run is still recorded.
S="$TEST_TMP/s6j"; new_state "$S"; echo 2 >"$S/runlist_empty_publish-distribution.yml"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && grep -qE 'distribution: +12345678901' <<<"$OUT"
check "#581: stage 9's empty listing is retried and the distribution run recorded" $? "rc=$RC: $OUT"

# 6k. #581: every read of the currency run's log fails: stage 11 refuses naming the unreadable log
# (before, stage 11 refused with the wrong cause, "reported 0 surfaces": its `currency_read || return 0`
# disabled set -e inside currency_read, so the failed read went on to be counted).
S="$TEST_TMP/s6k"; new_state "$S"
echo '[{"databaseId":36579259365,"createdAt":"2099-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
# The fake run list serves this one run for every workflow: stage 7 reads its log twice (lookup and
# finish_npm), then stage 11's currency read fails five times.
mklog >"$S/runlog_36579259365.txt"; printf 'ok\nok\nfail\nfail\nfail\nfail\nfail\n' >"$S/runlog_plan_36579259365"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "could not read currency run 36579259365's log after 5 tries"
check "#581: an unreadable currency log refuses by name" $? "rc=$RC: $OUT"

# 6l. #581: the currency run's log read fails twice, then succeeds: stage 11 retries and reads it.
S="$TEST_TMP/s6l"; new_state "$S"
echo '[{"databaseId":36579259365,"createdAt":"2099-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
mklog >"$S/runlog_36579259365.txt"; printf 'ok\nok\nfail\nfail\nok\n' >"$S/runlog_plan_36579259365"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "14 of 14" && has "run 36579259365 log empty or gh failed; retry 2/5"
check "#581: a currency log read that fails twice is retried and read" $? "rc=$RC: $OUT"

# 7. confirmation: anything but the literal yes stops before the irreversible action.
S="$TEST_TMP/s7"; new_state "$S"; echo "$NPM_NONE" >"$S/npm.json"; rm -f "$S/oci_digest"
run_release "$S" "y"
[ "$RC" != 0 ] && has "not confirmed"; check "confirm: 'y' is refused" $? "rc=$RC: $OUT"
! grep -q 'verify_only=false' "$S/calls.log"; check "confirm: no publish dispatch after a refused confirm" $? "$(cat "$S/calls.log")"
has "about to run" && has "state verified"; check "confirm: prompt shows the command and the verified state" $? "$OUT"

# 8. a stale local v1 (moved upstream) must not stop stage 1: the driver does not fetch tags.
S="$TEST_TMP/s8"; new_state "$S"; echo "dddddddddddddddddddddddddddddddddddddddd" >"$S/local_v1_sha"
run_release "$S" "" --dry-run
[ "$RC" = 0 ]; check "stale local v1: stage 1 passes (no tag fetch)" $? "rc=$RC: $OUT"
! grep -qE '^git fetch .*--tags' "$S/calls.log"; check "stale local v1: no fetch carries --tags" $? "$(cat "$S/calls.log")"

# 9. a fetch that fails for any reason surfaces git's own stderr in the refusal.
S="$TEST_TMP/s9"; new_state "$S"; echo "fatal: unable to access 'https://github.com/BargLabs/cejel.git/': simulated outage" >"$S/fetch_fail"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "git fetch origin failed" && has "simulated outage"; check "fetch failure: refusal carries git's stderr" $? "rc=$RC: $OUT"

# 10. the temporary-worktree refusal also carries git's stderr (stage 1 skips it under RELEASE_SKIP_VALIDATE).
grep -q 'wt_err' "$TARGET"; check "static: worktree add failure captures stderr" $? ""

# 11. the newest currency run of ANY trigger is read, not only workflow_run (the 0.4.11 dry run).
S="$TEST_TMP/s11"; new_state "$S"
cat >"$S/runlist.json" <<'JSON'
[{"databaseId":36146147435,"createdAt":"2026-09-25T14:14:00Z","event":"workflow_run","status":"completed"},
 {"databaseId":36489469157,"createdAt":"2026-09-28T00:00:00Z","event":"schedule","status":"completed"},
 {"databaseId":36579259365,"createdAt":"2026-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]
JSON
mklog "${PREV1_FAILS[@]}" "Homebrew tap" >"$S/runlog_36146147435.txt"
mklog >"$S/runlog_36579259365.txt"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "36579259365" && has "workflow_dispatch" && has "2026-09-29T00:00:00Z" && has "14 of 14"
check "stale run: newer workflow_dispatch run is read and its id, event and time printed" $? "rc=$RC: $OUT"
! has "currency run 36146147435"; check "stale run: the old workflow_run run is not read" $? "$OUT"

# 12. before v1 / tap / site: the named failing set passes stage 11.
S="$TEST_TMP/s12"; new_state "$S"
echo '[{"databaseId":36579259365,"createdAt":"2026-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
mklog "${PREV1_FAILS[@]}" >"$S/runlog_36579259365.txt"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "9 of 14" && has "before v1"; check "pre-v1: the named failing set passes stage 11" $? "rc=$RC: $OUT"

# 13. the same number of failures with a different surface failing refuses, printing every [FAIL] line.
S="$TEST_TMP/s13"; new_state "$S"
echo '[{"databaseId":36579259365,"createdAt":"2026-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
mklog "npm" "GitHub Action" "Homebrew tap" "cejel.dev homepage" "cejel.dev for-engineers" >"$S/runlog_36579259365.txt"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "[FAIL] npm:" && has "[FAIL] GitHub Action:"; check "pre-v1: five failures including npm refuse, every [FAIL] line printed" $? "rc=$RC: $OUT"

# 14. stage 13 requires 14 of 14 from a FRESH run: 13 of 14 refuses.
S="$TEST_TMP/s14"; new_state "$S"
echo '[{"databaseId":36579259365,"createdAt":"2026-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
mklog "${PREV1_FAILS[@]}" >"$S/runlog_36579259365.txt"
mklog "Homebrew tap" >"$S/dispatch_runlog.txt"
run_release "$S" ""
[ "$RC" != 0 ] && has "stage 13" && has "[FAIL] Homebrew tap:" && has "13 pass"; check "stage 13: 13 of 14 refuses and prints the failing line" $? "rc=$RC: $OUT"
grep -qF 'gh workflow run verify-release-currency.yml' "$S/calls.log"; check "stage 13: a fresh currency run was dispatched" $? "$(cat "$S/calls.log")"

# 15. stage 13 passes on 14 of 14 from the fresh run and the driver completes.
S="$TEST_TMP/s15"; new_state "$S"
echo '[{"databaseId":36579259365,"createdAt":"2026-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
mklog "${PREV1_FAILS[@]}" >"$S/runlog_36579259365.txt"
mklog >"$S/dispatch_runlog.txt"
run_release "$S" ""
[ "$RC" = 0 ] && has "stage 13" && has "14 of 14" && has "HANDBACK" && has "99999999999"; check "stage 13: 14 of 14 from the fresh run completes the release" $? "rc=$RC: $OUT"

# 15b. #581: stage 13's fresh currency run has a log that cannot be read: a REFUSE naming it (before,
# the driver exited with no REFUSE line).
S="$TEST_TMP/s15b"; new_state "$S"
echo '[{"databaseId":36579259365,"createdAt":"2026-09-29T00:00:00Z","event":"workflow_dispatch","status":"completed"}]' >"$S/runlist.json"
mklog "${PREV1_FAILS[@]}" >"$S/runlog_36579259365.txt"
mklog >"$S/dispatch_runlog.txt"; printf 'fail\nfail\nfail\nfail\nfail\n' >"$S/runlog_plan_99999999999"
run_release "$S" ""
[ "$RC" != 0 ] && has "REFUSE" && has "could not read currency run 99999999999's log after 5 tries"
check "#581: an unreadable stage-13 currency log refuses by name" $? "rc=$RC: $OUT"

# 16. a dry run against a world with no release shows all five irreversible prompts, in order.
S="$TEST_TMP/s16"; new_state "$S"; rm -f "$S/tag_sha" "$S/v1_sha" "$S/release.json" "$S/oci_digest" "$S/mcp.json"; echo "$NPM_NONE" >"$S/npm.json"
run_release "$S" "" --dry-run
blocks="$(grep -o 'STAGE [0-9]* IS IRREVERSIBLE' <<<"$OUT" | sed -E 's/STAGE ([0-9]+).*/\1/' | tr '\n' ' ')"
[ "$RC" = 0 ] && [ "$blocks" = "2 5 7 9 12 " ]; check "dry-run, no release: irreversible blocks for stages 2 5 7 9 12 in order" $? "rc=$RC blocks=$blocks: $OUT"
has "about to run : gh release edit v$V --repo BargLabs/cejel --draft=false" && has "twelve assets"; check "dry-run, no release: stage 5 shows the command and the precondition it will verify" $? "$OUT"
[ "$(mutations "$S")" = 0 ]; check "dry-run, no release: still no mutating call" $? "$(cat "$S/calls.log")"

# 17. the stage-10 hint gives the four binary URLs with their SHA256SUMS digests, not the source tarball.
S="$TEST_TMP/s17"; new_state "$S"
run_release "$S" "" --dry-run
urls="$(grep -oE "releases/download/v$V/cejel-[A-Za-z0-9_-]+ +sha256 [0-9a-f]+" <<<"$OUT")"
[ "$(wc -l <<<"$urls" | tr -d ' ')" = 4 ] && [ "$(grep -c 'releases/download/' <<<"$OUT")" = 4 ]; check "stage 10: names exactly four binary URLs" $? "$urls"
allmatch=0
for t in Darwin-arm64 Darwin-x86_64 Linux-aarch64 Linux-x86_64; do
  want="$(awk -v n="cejel-$t" '$2==n{print $1}' "$S/assets/SHA256SUMS")"
  grep -qE "releases/download/v$V/cejel-$t +sha256 $want\$" <<<"$OUT" || allmatch=1
done
check "stage 10: each URL carries its SHA256SUMS digest" $allmatch "$OUT"
! has "Windows-x86_64.exe  sha256" && ! has "archive/refs/tags"; check "stage 10: no tarball and no Windows line" $? "$OUT"
has "expected_version: '$V'" && has "BargLabs/cejel@v$V" && has "verify-cejel-consumer-routes.yml" && has "action@v1"; check "stage 10: consumer-routes pin, expected_version and the ORDER note" $? "$OUT"

# 18. the handback's MCP state: serves / LAG / NOT READ are three distinct states.
mcp_line() { grep '^MCP registry state:' <<<"$OUT"; }
mcp_calls() { grep -c 'modelcontextprotocol.io' "$1/calls.log" || true; }
S="$TEST_TMP/s18a"; new_state "$S"
run_release "$S" "" --dry-run
mcp_line | grep -qF "serves $V" && ! mcp_line | grep -qi 'lag\|NOT READ'; check "mcp state: right version reads 'serves X'" $? "$(mcp_line)"
S="$TEST_TMP/s18b"; new_state "$S"; echo '{"server":{"version":"0.4.10"}}' >"$S/mcp.json"
run_release "$S" "" --dry-run
mcp_line | grep -qF "LAG: serves 0.4.10 (expected $V)" && [ "$(mcp_calls "$S")" = 1 ]; check "mcp state: wrong version reads LAG and is not retried" $? "$(mcp_line)"
S="$TEST_TMP/s18c"; new_state "$S"; printf '500\n500\n' >"$S/mcp_queue"
run_release "$S" "" --dry-run
mcp_line | grep -qF "NOT READ: HTTP 500" && mcp_line | grep -qF "a read error is not a lag" && ! mcp_line | grep -qF "LAG:" && ! mcp_line | grep -qF "disclosed-lag"; check "mcp state: HTTP 500 reads NOT READ, never LAG" $? "$(mcp_line)"
[ "$(mcp_calls "$S")" = 2 ]; check "mcp state: a failed read is retried exactly once" $? "$(cat "$S/calls.log")"
S="$TEST_TMP/s18d"; new_state "$S"; printf 'timeout\n200\n' >"$S/mcp_queue"
run_release "$S" "" --dry-run
mcp_line | grep -qF "serves $V" && [ "$(mcp_calls "$S")" = 2 ]; check "mcp state: a timeout then a good read reads 'serves X'" $? "$(mcp_line)"
S="$TEST_TMP/s18e"; new_state "$S"; printf 'timeout\ntimeout\n' >"$S/mcp_queue"
run_release "$S" "" --dry-run
mcp_line | grep -qF "NOT READ:" && mcp_line | grep -qi 'timed out'; check "mcp state: two timeouts read NOT READ with curl's reason" $? "$(mcp_line)"

# 19. preflight refuses when the Claude plugin's manifest version or MCP pin disagrees with the release.
S="$TEST_TMP/s19a"; new_state "$S"; echo '{"name":"cejel","version":"0.4.10"}' >"$S/files/plugins/cejel/.claude-plugin/plugin.json"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "plugin.json.version=0.4.10"; check "plugin: a stale plugin.json version refuses at preflight" $? "rc=$RC: $OUT"
S="$TEST_TMP/s19b"; new_state "$S"; echo '{"mcpServers":{"cejel":{"command":"npx","args":["-y","@cejel/cejel@0.4.10","mcp"]}}}' >"$S/files/plugins/cejel/.mcp.json"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has ".mcp.json.@cejel/cejel=0.4.10"; check "plugin: a stale .mcp.json pin refuses at preflight" $? "rc=$RC: $OUT"
S="$TEST_TMP/s19c"; new_state "$S"; echo '{"mcpServers":{"cejel":{"command":"npx","args":["-y","@cejel/cejel","mcp"]}}}' >"$S/files/plugins/cejel/.mcp.json"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has ".mcp.json.@cejel/cejel=<not pinned>"; check "plugin: an unpinned .mcp.json launch refuses at preflight" $? "rc=$RC: $OUT"
S="$TEST_TMP/s19d"; new_state "$S"; echo '{"mcpServers":{"cejel":{"command":"npx","args":["-y","--package=@cejel/cejel@0.4.11","cejel-mcp"]}}}' >"$S/files/plugins/cejel/.mcp.json"
run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has ".mcp.json.@cejel/cejel=<not npx -y @cejel/cejel@X mcp>"; check "plugin: the old --package launch form refuses at preflight" $? "rc=$RC: $OUT"

# ============================= prerelease (X.Y.Z-rc.N) =============================
RC_V="0.7.0-rc.1"
NPM_USER='"_npmUser":{"name":"GitHub Actions","email":"npm-oidc-no-reply@github.com"}'
PROV='"attestations":{"provenance":{"predicateType":"https://slsa.dev/provenance/v1"}}'
NPM_RC_BEFORE='{"dist-tags":{"latest":"0.6.8"},"versions":{"0.6.8":{}}}'
# npm_rc <latest> <next> <gitHead>: the registry holding the release candidate.
npm_rc() {
  printf '{"dist-tags":{"latest":"%s","next":"%s"},"versions":{"0.6.8":{},"%s":{"gitHead":"%s",%s,"dist":{"integrity":"sha512-rcintegrity==",%s}}}}' \
    "$1" "$2" "$RC_V" "$3" "$NPM_USER" "$PROV"
}
NPM_RC_OK="$(npm_rc 0.6.8 "$RC_V" "$TAGSHA")"
PRERELEASE_SKIPPED=("4 (binaries)" "8 (distribution-verify)" "9 (distribution-publish)" "10 (homebrew)" "11 (currency)" "12 (action-major-tag)")

# new_rc_state <dir>: a finished 0.7.0-rc.1 prerelease (tag, published prerelease, npm under next),
# tagged from origin/release/0.7.0-rc.1; latest stays on 0.6.8 everywhere and v1 on another commit.
new_rc_state() {
  local S="$1" f; new_state "$S"
  echo "$TAGSHA" >"$S/release_branch_sha"
  for f in package.json server.json published-versions.json Dockerfile plugins/cejel/.claude-plugin/plugin.json plugins/cejel/.mcp.json; do
    sed -i.bak "s/0\.4\.11/$RC_V/g" "$S/files/$f"; rm -f "$S/files/$f.bak"
  done
  printf '# Changelog\n\n## [Unreleased]\n\n## [%s] - 2026-10-30\n- x\n' "$RC_V" >"$S/files/CHANGELOG.md"
  echo "cccccccccccccccccccccccccccccccccccccccc" >"$S/v1_sha"
  rm -rf "$S/assets" "$S/oci_digest" "$S/mcp.json"
  echo '{"isDraft":false,"isPrerelease":true,"assets":[]}' >"$S/release.json"
  echo '{"tagName":"v0.6.8","isPrerelease":false}' >"$S/latest_release.json"
  echo "$NPM_RC_OK" >"$S/npm.json"
  { echo "+ @cejel/cejel@$RC_V"; echo "Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=456"; } >"$S/runlog.txt"
}

# 21. the driver accepts X.Y.Z-rc.N (N >= 1) and refuses every other prerelease shape and a leading v.
for bad in 0.7.0-rc 0.7.0-rc.0 0.7.0-beta.1 v0.7.0-rc.1 0.7.0-rc.1+b; do
  S="$TEST_TMP/s21-$bad"; new_rc_state "$S"
  RUN_V="$bad" run_release "$S" "" --dry-run
  [ "$RC" = 2 ] && has "X.Y.Z or X.Y.Z-rc.N" && [ ! -s "$S/calls.log" ]
  check "prerelease: the driver refuses '$bad' before any read" $? "rc=$RC: $OUT"
done

# 22. a finished prerelease, dry run: stages 2 3 5 6 7 read as done, 4 and 8-12 print skipped: prerelease,
# stage 13 reads npm and GitHub back, and nothing touches v1, the binaries, distribution or currency.
S="$TEST_TMP/s22"; new_rc_state "$S"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" = 0 ]; check "prerelease: dry-run on a finished prerelease exits 0" $? "rc=$RC: $OUT"
for st in "2 (tag)" "3 (draft-release)" "5 (publish-release)" "6 (npm-verify)" "7 (npm-publish)"; do
  has "stage $st: already done"; check "prerelease: stage $st reads as already done" $? "$OUT"
done
for st in "${PRERELEASE_SKIPPED[@]}"; do
  has "stage $st: skipped: prerelease"; check "prerelease: stage $st prints skipped: prerelease" $? "$OUT"
done
has "site record: skipped: prerelease"; check "prerelease: the site record step prints skipped: prerelease" $? "$OUT"
has "published, flagged prerelease" && has "releases/latest unchanged: v0.6.8"; check "prerelease: the GitHub release is a prerelease and releases/latest is unchanged" $? "$OUT"
has "dist-tags.next = $RC_V" && has 'dist-tags.latest unchanged ("0.6.8")' && has "gitHead $TAGSHA = the tag commit"
check "prerelease: stage 13 reads next, latest and gitHead back from the registry" $? "$OUT"
has "tarball integrity:    sha512-rcintegrity=="; check "prerelease: the handback records the tarball integrity" $? "$OUT"
! grep -qE 'release-binaries|publish-distribution|verify-release-currency|refs/tags/v1|ghcr|modelcontextprotocol' "$S/calls.log"
check "prerelease: no binaries, distribution, currency, v1, OCI or MCP read or dispatch" $? "$(cat "$S/calls.log")"
[ "$(mutations "$S")" = 0 ]; check "prerelease: dry-run performs no mutating call" $? "$(cat "$S/calls.log")"

# 23. a fresh prerelease, dry run: three irreversible prompts (2 5 7); the draft and the published
# release are flagged prerelease, and stage 5 never marks it latest.
S="$TEST_TMP/s23"; new_rc_state "$S"; rm -f "$S/tag_sha" "$S/release.json"; echo "$NPM_RC_BEFORE" >"$S/npm.json"
RUN_V="$RC_V" run_release "$S" "" --dry-run
blocks="$(grep -o 'STAGE [0-9]* IS IRREVERSIBLE' <<<"$OUT" | sed -E 's/STAGE ([0-9]+).*/\1/' | tr '\n' ' ')"
[ "$RC" = 0 ] && [ "$blocks" = "2 5 7 " ]; check "prerelease dry-run: irreversible blocks for stages 2 5 7 only" $? "rc=$RC blocks=$blocks: $OUT"
has "would run: gh release create v$RC_V --repo BargLabs/cejel --draft --prerelease"; check "prerelease dry-run: the draft is created flagged prerelease" $? "$OUT"
has "about to run : gh release edit v$RC_V --repo BargLabs/cejel --draft=false --prerelease --latest=false"
check "prerelease dry-run: stage 5 publishes it as a prerelease, never latest" $? "$OUT"
for st in "${PRERELEASE_SKIPPED[@]}"; do
  has "stage $st: skipped: prerelease"; check "prerelease dry-run: stage $st prints skipped: prerelease" $? "$OUT"
done
[ "$(mutations "$S")" = 0 ]; check "prerelease dry-run: no mutating call" $? "$(cat "$S/calls.log")"

# 24. --from a stage a prerelease does not run is refused; --from 13 is not; a final release still takes --from 9.
for from in 4 8 9 10 11 12; do
  S="$TEST_TMP/s24-$from"; new_rc_state "$S"
  RUN_V="$RC_V" run_release "$S" "" --dry-run --from "$from"
  [ "$RC" != 0 ] && has "REFUSE" && has "--from $from: a prerelease does not run stage $from"
  check "prerelease: --from $from is refused" $? "rc=$RC: $OUT"
done
S="$TEST_TMP/s24-13"; new_rc_state "$S"
RUN_V="$RC_V" run_release "$S" "" --dry-run --from 13
[ "$RC" = 0 ]; check "prerelease: --from 13 runs" $? "rc=$RC: $OUT"
S="$TEST_TMP/s24-final"; new_state "$S"
run_release "$S" "" --dry-run --from 9
[ "$RC" = 0 ] && has "stage 9 (distribution-publish): already done"; check "final: --from 9 still runs" $? "rc=$RC: $OUT"

# rc_publish_state <dir>: tag pushed, draft prerelease, npm without the release candidate; the
# staged registry and releases/latest after the publish and the edit are clean unless a test changes them.
rc_publish_state() {
  local S="$1"; new_rc_state "$S"
  echo '{"isDraft":true,"isPrerelease":true,"assets":[]}' >"$S/release.json"
  echo '{"isDraft":false,"isPrerelease":true,"assets":[]}' >"$S/release_after_edit.json"
  echo "$NPM_RC_BEFORE" >"$S/npm.json"; echo "$NPM_RC_OK" >"$S/npm_after_publish.json"
}

# 25. a real prerelease run from a draft: publishes the release as a prerelease and npm under next,
# then verifies both from the world.
S="$TEST_TMP/s25"; rc_publish_state "$S"
RUN_V="$RC_V" run_release "$S" $'yes\nyes'
[ "$RC" = 0 ] && has "HANDBACK" && has "dist-tags.next = $RC_V"; check "prerelease real run: publishes and verifies from the registry" $? "rc=$RC: $OUT"
grep -qF -- "gh release edit v$RC_V --repo BargLabs/cejel --draft=false --prerelease --latest=false" "$S/calls.log"
check "prerelease real run: the release edit flags prerelease and not latest" $? "$(cat "$S/calls.log")"

# 26. the post-publish check fails when latest moved.
S="$TEST_TMP/s26"; rc_publish_state "$S"; npm_rc "$RC_V" "$RC_V" "$TAGSHA" >"$S/npm_after_publish.json"
RUN_V="$RC_V" run_release "$S" $'yes\nyes'
[ "$RC" != 0 ] && has "REFUSE" && has 'dist-tags.latest moved: "0.6.8" before the run, "0.7.0-rc.1" now'
check "prerelease: npm latest moved by the publish refuses" $? "rc=$RC: $OUT"

# 27. the post-publish check fails when next is not the version.
S="$TEST_TMP/s27"; rc_publish_state "$S"; npm_rc 0.6.8 0.6.9-rc.1 "$TAGSHA" >"$S/npm_after_publish.json"
RUN_V="$RC_V" run_release "$S" $'yes\nyes'
[ "$RC" != 0 ] && has "REFUSE" && has 'dist-tags.next is "0.6.9-rc.1", expected "0.7.0-rc.1"'
check "prerelease: npm next not the version refuses" $? "rc=$RC: $OUT"

# 28. the post-publish check fails when the tarball's gitHead is not the tag's commit.
S="$TEST_TMP/s28"; rc_publish_state "$S"; npm_rc 0.6.8 "$RC_V" "$MAINSHA" >"$S/npm_after_publish.json"
RUN_V="$RC_V" run_release "$S" $'yes\nyes'
[ "$RC" != 0 ] && has "REFUSE" && has "gitHead is \"$MAINSHA\", expected the tag commit $TAGSHA"
check "prerelease: a gitHead other than the tag commit refuses" $? "rc=$RC: $OUT"

# 29. publishing the GitHub prerelease must not move releases/latest.
S="$TEST_TMP/s29"; rc_publish_state "$S"; echo "{\"tagName\":\"v$RC_V\",\"isPrerelease\":true}" >"$S/latest_release_after_edit.json"
RUN_V="$RC_V" run_release "$S" $'yes\nyes'
[ "$RC" != 0 ] && has "REFUSE" && has "stage 5: releases/latest is v$RC_V, was v0.6.8 before the run"
check "prerelease: releases/latest moved by stage 5 refuses" $? "rc=$RC: $OUT"
! grep -q 'verify_only' "$S/calls.log"; check "prerelease: nothing reaches npm after releases/latest moved" $? "$(cat "$S/calls.log")"

# 30. a release candidate's GitHub release published without the prerelease flag refuses.
S="$TEST_TMP/s30"; new_rc_state "$S"; echo '{"isDraft":false,"isPrerelease":false,"assets":[]}' >"$S/release.json"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "published and not flagged prerelease"; check "prerelease: a full GitHub release for an rc refuses" $? "rc=$RC: $OUT"

# 31. a registry where the release candidate already holds latest refuses at preflight, before any action.
S="$TEST_TMP/s31"; new_rc_state "$S"; npm_rc "$RC_V" "$RC_V" "$TAGSHA" >"$S/npm.json"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has 'npm dist-tags.latest is "0.7.0-rc.1"'; check "prerelease: latest already on a prerelease refuses at preflight" $? "rc=$RC: $OUT"

# ============================= release branch (release/X.Y.Z-rc.N, never merged) =============================
RCBRANCH="eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
rule_calls() { grep -F "check-prerelease-commit" "$1/calls.log" || true; }

# 32. a fresh release candidate takes its release commit from origin/release/<version>, checks it with
# the rule at preflight and tags that commit, not origin/main.
S="$TEST_TMP/s32"; new_rc_state "$S"; rm -f "$S/tag_sha" "$S/release.json"; echo "$NPM_RC_BEFORE" >"$S/npm.json"; echo "$RCBRANCH" >"$S/release_branch_sha"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "release commit: $RCBRANCH (origin/release/$RC_V)" && has "would run: git tag -s v$RC_V $RCBRANCH"
check "release branch: the release commit is origin/release/<version>, and stage 2 tags it" $? "rc=$RC: $OUT"
! has "git tag -s v$RC_V $MAINSHA"; check "release branch: stage 2 does not tag origin/main" $? "$OUT"
rule_calls "$S" | grep -qE "check-prerelease-commit $RC_V $RCBRANCH origin/main\$"
check "release branch: preflight checks the branch commit with the rule against origin/main" $? "$(cat "$S/calls.log")"
has "$RCBRANCH may be released as $RC_V"; check "release branch: preflight prints the rule's verdict" $? "$OUT"
[ "$(mutations "$S")" = 0 ]; check "release branch: dry-run performs no mutating call" $? "$(cat "$S/calls.log")"

# 33. no release branch: refuse at preflight and print the commands that create it.
S="$TEST_TMP/s33"; new_rc_state "$S"; rm -f "$S/tag_sha" "$S/release.json" "$S/release_branch_sha"; echo "$NPM_RC_BEFORE" >"$S/npm.json"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "no origin/release/$RC_V"; check "release branch absent: refuse at preflight" $? "rc=$RC: $OUT"
has "git switch -c release/$RC_V origin/main" && has "node scripts/bump-release-version.mjs $RC_V" && has "git push origin release/$RC_V"
check "release branch absent: the refusal prints the commands that create it" $? "$OUT"
! has "STAGE 2 IS IRREVERSIBLE" && [ -z "$(rule_calls "$S")" ] && [ "$(mutations "$S")" = 0 ]
check "release branch absent: nothing tagged, the rule never run" $? "$(cat "$S/calls.log")"

# 34. the rule refuses the branch commit: refuse at preflight with the rule's message, before any tag.
S="$TEST_TMP/s34"; new_rc_state "$S"; rm -f "$S/tag_sha" "$S/release.json"; echo "$NPM_RC_BEFORE" >"$S/npm.json"; echo "$RCBRANCH" >"$S/release_branch_sha"
echo "$RCBRANCH is not the bump to $RC_V on $MAINSHA: README.md: the commit changes it and the bump does not" >"$S/rule_refuse"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "README.md: the commit changes it and the bump does not" && ! has "STAGE 2 IS IRREVERSIBLE"
check "release branch: a commit the rule refuses stops at preflight with the rule's message" $? "rc=$RC: $OUT"

# 35. a final version still takes its release commit from origin/main and never runs the prerelease rule.
S="$TEST_TMP/s35"; new_state "$S"; rm -f "$S/tag_sha" "$S/v1_sha" "$S/release.json" "$S/oci_digest" "$S/mcp.json"; echo "$NPM_NONE" >"$S/npm.json"; echo "$RCBRANCH" >"$S/release_branch_sha"
run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "release commit: $MAINSHA (origin/main)" && has "would run: git tag -s v$V $MAINSHA"
check "final: the release commit is still origin/main, and stage 2 tags it" $? "rc=$RC: $OUT"
[ -z "$(rule_calls "$S")" ]; check "final: the prerelease rule is never run" $? "$(cat "$S/calls.log")"

# 36. a finished release candidate is off main by design: stage 2 reads done, where a final version's
# off-main tag refuses (test 3); preflight checks the tag's commit with the rule.
S="$TEST_TMP/s36"; new_rc_state "$S"; echo 0 >"$S/ancestor"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "stage 2 (tag): already done"; check "finished prerelease off main: stage 2 reads done" $? "rc=$RC: $OUT"
rule_calls "$S" | grep -qE "check-prerelease-commit $RC_V $TAGSHA origin/main\$"; check "finished prerelease: the rule checks the tag's commit" $? "$(cat "$S/calls.log")"
S="$TEST_TMP/s36b"; new_rc_state "$S"; echo "the rule refused" >"$S/rule_refuse"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "the rule refused"; check "finished prerelease: a tag commit the rule refuses stops at preflight" $? "rc=$RC: $OUT"

# 37. the tag and the release branch disagree: refuse at preflight. A deleted branch is fine: the tag holds.
S="$TEST_TMP/s37"; new_rc_state "$S"; echo "$RCBRANCH" >"$S/release_branch_sha"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" != 0 ] && has "REFUSE" && has "origin/release/$RC_V is $RCBRANCH, but v$RC_V on origin points at $TAGSHA"
check "release branch and tag disagree: refuse at preflight" $? "rc=$RC: $OUT"
S="$TEST_TMP/s37b"; new_rc_state "$S"; rm -f "$S/release_branch_sha"
RUN_V="$RC_V" run_release "$S" "" --dry-run
[ "$RC" = 0 ] && has "release commit: $TAGSHA (from existing tag v$RC_V)"; check "release branch deleted after the release: the tag holds" $? "rc=$RC: $OUT"

# 38. a real run from the release branch: stage 2 tags the branch commit and reads the pushed tag back.
S="$TEST_TMP/s38"; rc_publish_state "$S"; rm -f "$S/tag_sha"; echo "$RCBRANCH" >"$S/release_branch_sha"; echo "$RCBRANCH" >"$S/tag_after_push"
npm_rc 0.6.8 "$RC_V" "$RCBRANCH" >"$S/npm_after_publish.json"
RUN_V="$RC_V" run_release "$S" $'yes\nyes\nyes'
[ "$RC" = 0 ] && has "HANDBACK" && grep -qF "git tag -s v$RC_V $RCBRANCH" "$S/calls.log"
check "release branch real run: tags the branch commit and completes" $? "rc=$RC: $OUT"
S="$TEST_TMP/s38b"; rc_publish_state "$S"; rm -f "$S/tag_sha"; echo "$RCBRANCH" >"$S/release_branch_sha"; echo "$MAINSHA" >"$S/tag_after_push"
RUN_V="$RC_V" run_release "$S" $'yes\nyes\nyes'
[ "$RC" != 0 ] && has "after push, v$RC_V on origin is '$MAINSHA', expected $RCBRANCH"
check "release branch real run: a pushed tag on another commit refuses" $? "rc=$RC: $OUT"

# 20. the driver's surface count is the verifier's: adding a surface to one without the other fails here.
n_verifier="$(node -e 'const src = require("fs").readFileSync(process.argv[1], "utf8"); console.log(/const SURFACES = \[([\s\S]*?)\];/.exec(src)[1].match(/'"'"'[^'"'"']+'"'"'/g).length)' "$SCRIPT_DIR/verify-release-currency.mjs")"
n_driver="$(sed -n 's/^CURRENCY_SURFACES=\([0-9]*\).*/\1/p' "$TARGET")"
[ -n "$n_verifier" ] && [ "$n_verifier" = "$n_driver" ] && [ "$n_verifier" = "${#SURFACES[@]}" ]
check "static: driver CURRENCY_SURFACES, verifier SURFACES and this harness agree ($n_driver / $n_verifier / ${#SURFACES[@]})" $? ""

echo
echo "release_tests: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
