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
  fetch|worktree|config) exit 0 ;;
  remote) echo "https://github.com/BargLabs/cejel.git" ;;
  rev-parse)
    case "$2" in
      origin/main) cat "$S/main_sha" ;;
      *'^{commit}') cat "$S/tag_sha" ;;
      *) echo "unhandled rev-parse $2" >&2; exit 1 ;;
    esac ;;
  ls-remote)
    shift 2
    for ref in "$@"; do
      case "$ref" in
        refs/tags/v1) [ -s "$S/v1_sha" ] && printf '%s\trefs/tags/v1\n' "$(cat "$S/v1_sha")" ;;
        refs/tags/v0.4.11^{}) [ -s "$S/tag_sha" ] && printf '%s\t%s\n' "$(cat "$S/tag_sha")" "$ref" ;;
      esac
    done
    exit 0 ;;
  show)
    case "$2" in
      *:*) f="${2#*:}"; [ -f "$S/files/$f" ] && cat "$S/files/$f" || { echo "no $2" >&2; exit 1; } ;;
    esac ;;
  merge-base) [ "$(cat "$S/ancestor")" = 1 ] ;;
  tag|push) exit 0 ;;
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
  "release view") if [ -f "$S/release.json" ]; then emit "$S/release.json"; else echo "release not found" >&2; exit 1; fi ;;
  "release download")
    for ((i=0; i<${#args[@]}; i++)); do [ "${args[$i]}" = "--dir" ] && d="${args[$((i+1))]}"; done
    cp "$S"/assets/* "$d"/ ;;
  "release create"|"release edit"|"workflow run") exit 0 ;;
  "run list") emit "$S/runlist.json" ;;
  "run view") if [ "$want_log" = 1 ]; then cat "$S/runlog.txt"; else emit "$S/runview.json"; fi ;;
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
  *modelcontextprotocol.io*) [ -f "$S/mcp.json" ] && cat "$S/mcp.json" || { echo "404" >&2; exit 22; } ;;
  *github.com*archive*) printf 'tarball-bytes' >"$out" ;;
  *) echo "unhandled curl $url" >&2; exit 1 ;;
esac
SHIM
chmod +x "$BIN"/git "$BIN"/gh "$BIN"/curl

sha_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; else openssl dgst -sha256 "$1" | awk '{print $NF}'; fi; }

TAGSHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
MAINSHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
NPM_OK='{"dist-tags":{"latest":"0.4.11"},"versions":{"0.4.11":{"gitHead":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","_npmUser":{"name":"GitHub Actions","email":"npm-oidc-no-reply@github.com"},"dist":{"attestations":{"provenance":{"predicateType":"https://slsa.dev/provenance/v1"}}}}}}'
NPM_NONE='{"dist-tags":{"latest":"0.4.10"},"versions":{"0.4.10":{}}}'
NPM_HAND='{"dist-tags":{"latest":"0.4.11"},"versions":{"0.4.11":{"_npmUser":{"name":"cejel","email":"x@example.com"},"dist":{}}}}'

# new_state <dir>: a finished 0.4.11 release, tag behind a moved main.
new_state() {
  local S="$1"; mkdir -p "$S/files" "$S/assets"
  echo "$MAINSHA" >"$S/main_sha"; echo "$TAGSHA" >"$S/tag_sha"; echo "$TAGSHA" >"$S/v1_sha"; echo 1 >"$S/ancestor"
  echo '{"version":"0.4.11"}' >"$S/files/package.json"; echo '{"version":"0.4.11"}' >"$S/files/server.json"
  echo '{"mcpRegistry":"0.4.11","oci":"0.4.11"}' >"$S/files/published-versions.json"
  printf 'FROM node\nARG VERSION=0.4.11\n' >"$S/files/Dockerfile"
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
  echo '[{"databaseId":12345678901,"createdAt":"2099-01-01T00:00:00Z","status":"completed"}]' >"$S/runlist.json"
  echo '{"status":"completed","conclusion":"success","updatedAt":"2026-09-25T00:00:00Z"}' >"$S/runview.json"
  { echo "+ @cejel/cejel@$V"; echo "Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=123";
    for i in 1 2 3 4 5 6 7 8 9 10; do echo "[PASS] surface$i: observed=$V"; done
    for i in 1 2 3; do echo "[FAIL] cejel.dev surface$i: observed=old"; done; } >"$S/runlog.txt"
  echo "$NPM_OK" >"$S/npm.json"
  echo "sha256:cafe" >"$S/oci_digest"
  echo '{"server":{"version":"0.4.11"}}' >"$S/mcp.json"
  : >"$S/calls.log"
}

# run_release <state dir> <stdin text> [args...] -> sets OUT, RC
run_release() {
  local S="$1" input="$2"; shift 2
  OUT="$(printf '%s\n' "$input" | FAKE_STATE="$S" PATH="$BIN:$PATH" RELEASE_SKIP_VALIDATE=1 RELEASE_POLL_INTERVAL=0 RELEASE_POLL_MAX=0 RELEASE_CURRENCY_WAIT=0 RELEASE_RUN_FIND_SLEEP=0 \
    bash "$TARGET" "$V" "$@" 2>&1)"; RC=$?
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
has "10 of 13"; check "happy: currency says it is reading the before-site state (10 of 13)" $? "$OUT"
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

# 7. confirmation: anything but the literal yes stops before the irreversible action.
S="$TEST_TMP/s7"; new_state "$S"; echo "$NPM_NONE" >"$S/npm.json"; rm -f "$S/oci_digest"
run_release "$S" "y"
[ "$RC" != 0 ] && has "not confirmed"; check "confirm: 'y' is refused" $? "rc=$RC: $OUT"
! grep -q 'verify_only=false' "$S/calls.log"; check "confirm: no publish dispatch after a refused confirm" $? "$(cat "$S/calls.log")"
has "about to run" && has "state verified"; check "confirm: prompt shows the command and the verified state" $? "$OUT"

echo
echo "release_tests: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
