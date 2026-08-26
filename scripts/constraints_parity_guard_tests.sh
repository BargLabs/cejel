#!/usr/bin/env bash
# Regression tests for scripts/constraints-parity-guard.sh. Stubs `gh` on
# PATH so these run fast, deterministic, and offline -- no real network call,
# no real git state touched. Per this card's HARD PROHIBITION (goal
# goal_constraints_parity_guard_2026-08-24.md), these tests must run against
# fixture repos/files they create, never against the estate's checkouts or
# any real git clone/fetch -- so the stub never shells out to git at all.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/constraints-parity-guard.sh"

PASS_COUNT=0
FAIL_COUNT=0
TEST_TMP=""

log_pass() {
  echo "PASS: $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

log_fail() {
  echo "FAIL: $1"
  echo "  $2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

cleanup() {
  if [ -n "${TEST_TMP}" ] && [ -d "${TEST_TMP}" ]; then
    rm -rf "${TEST_TMP}"
  fi
}
trap cleanup EXIT

# ============================= static structural guarantees =============================
# The functional stubbed-gh tests below prove the script BEHAVES correctly;
# this proves it structurally CANNOT regress into the hazard the goal names --
# a rename or "helpful" rewrite that reintroduces git (and with it, shallow
# flags or the duplicate-auth-header path) would still pass a behavioral test
# run locally against a shallow-tolerant fixture, so the guarantee has to be
# asserted on the script's own source, not just its observed behavior.

# Strip comment-only lines first: the header comment intentionally names
# "git fetch" / "git clone" / "--depth" while explaining why the script must
# never use them, so a substring check against the raw file would false-fail
# on the very sentence documenting the prohibition. Only executable lines
# (or code fragments after a trailing "# comment") can trip these checks.
executable_source="$(grep -v '^\s*#' "${TARGET_SCRIPT}")"

case "${executable_source}" in
  *"--depth"*|*"--shallow-since"*|*"--shallow-exclude"*)
    log_fail "guard script contains no shallow-clone flags" "found a --depth/--shallow-since/--shallow-exclude token outside comments"
    ;;
  *)
    log_pass "guard script contains no shallow-clone flags"
    ;;
esac

case "${executable_source}" in
  *"git clone"*|*"git fetch"*)
    log_fail "guard script never shells out to git clone/fetch" "found a git clone/fetch invocation outside comments"
    ;;
  *)
    log_pass "guard script never shells out to git clone/fetch"
    ;;
esac

case "${executable_source}" in
  *"gh api"*"contents"*"vnd.github.raw"*)
    log_pass "guard script uses the raw-contents API (gh api ... contents ... vnd.github.raw)"
    ;;
  *)
    log_fail "guard script uses the raw-contents API" "expected a gh api .../contents/... call requesting application/vnd.github.raw"
    ;;
esac

case "${executable_source}" in
  *"set -euo pipefail"*)
    log_pass "guard script fails closed (set -euo pipefail)"
    ;;
  *)
    log_fail "guard script fails closed (set -euo pipefail)" "missing set -euo pipefail"
    ;;
esac

# ============================= functional behavior (stubbed gh, no network/git) =============================

TEST_TMP="$(mktemp -d)"
STUB_DIR="${TEST_TMP}/bin"
mkdir -p "${STUB_DIR}"

LOCAL_FILE="${TEST_TMP}/local-constraints.md"
cat >"${LOCAL_FILE}" <<'EOF'
**CONSTRAINTS-VERSION: 2026-08-01.5**
line two, unchanged between the two fixture copies
EOF

run_with_stub() {
  local gh_mode="$1"
  GH_STUB_MODE="${gh_mode}" \
    PARITY_GUARD_LOCAL_PATH="${LOCAL_FILE}" \
    PARITY_GUARD_SELF_LABEL="alfred" \
    PARITY_GUARD_SIBLING_REPO="BargLabs/cejel" \
    PARITY_GUARD_SIBLING_LABEL="cejel" \
    PATH="${STUB_DIR}:${PATH}" \
    "${TARGET_SCRIPT}"
}

# --- match: stubbed gh returns byte-identical content ---
cat >"${STUB_DIR}/gh" <<EOF
#!/usr/bin/env bash
if [ "\${GH_STUB_MODE:-}" = "match" ]; then
  cat "${LOCAL_FILE}"
  exit 0
fi
exit 99
EOF
chmod +x "${STUB_DIR}/gh"

if out="$(run_with_stub match 2>&1)"; then
  if echo "${out}" | grep -q "OK" && echo "${out}" | grep -q "2026-08-01.5"; then
    log_pass "exits 0 and reports OK with the shared CONSTRAINTS-VERSION when bytes match"
  else
    log_fail "exits 0 and reports OK when bytes match" "missing OK/version line: ${out}"
  fi
else
  log_fail "exits 0 when bytes match" "nonzero exit: ${out}"
fi

# --- drift: stubbed gh returns a sibling with a different CONSTRAINTS-VERSION ---
cat >"${STUB_DIR}/gh" <<EOF
#!/usr/bin/env bash
if [ "\${GH_STUB_MODE:-}" = "drift" ]; then
  echo "**CONSTRAINTS-VERSION: 2026-08-01.4**"
  echo "line two, unchanged between the two fixture copies"
  exit 0
fi
exit 99
EOF
chmod +x "${STUB_DIR}/gh"

if out="$(run_with_stub drift 2>&1)"; then
  log_fail "exits nonzero on a one-line divergence (reverse-patch proof)" "command succeeded unexpectedly: ${out}"
else
  if echo "${out}" | grep -q "diverged" \
    && echo "${out}" | grep -q "2026-08-01.5" \
    && echo "${out}" | grep -q "2026-08-01.4"; then
    log_pass "exits nonzero on a one-line divergence and names both CONSTRAINTS-VERSION lines"
  else
    log_fail "exits nonzero on divergence and names both versions" "missing diverged/version lines: ${out}"
  fi
fi

# --- unreadable sibling: stubbed gh fails the way `gh api` fails against a
# repo/path the token cannot read (nonzero exit, GitHub-shaped stderr) ---
cat >"${STUB_DIR}/gh" <<'EOF'
#!/usr/bin/env bash
if [ "${GH_STUB_MODE:-}" = "unreadable" ]; then
  echo '{"message":"Not Found","documentation_url":"https://docs.github.com/rest"}' >&2
  echo "gh: Not Found (HTTP 404)" >&2
  exit 1
fi
exit 99
EOF
chmod +x "${STUB_DIR}/gh"

if out="$(run_with_stub unreadable 2>&1)"; then
  log_fail "exits nonzero (fails, does not skip) when the sibling is unreadable" "command succeeded unexpectedly: ${out}"
else
  if echo "${out}" | grep -qi "FAILED" && echo "${out}" | grep -qi "not skipped"; then
    log_pass "exits nonzero and says so loudly when the sibling is unreadable, never silently skips"
  else
    log_fail "fails loud (not skip) on an unreadable sibling" "missing FAILED/not-skipped language: ${out}"
  fi
fi

# --- missing local file: fails loud rather than comparing nothing ---
if out="$(GH_STUB_MODE=match PARITY_GUARD_LOCAL_PATH="${TEST_TMP}/does-not-exist.md" \
  PARITY_GUARD_SELF_LABEL="alfred" PARITY_GUARD_SIBLING_REPO="BargLabs/cejel" \
  PARITY_GUARD_SIBLING_LABEL="cejel" PATH="${STUB_DIR}:${PATH}" "${TARGET_SCRIPT}" 2>&1)"; then
  log_fail "exits nonzero when the local file is missing" "command succeeded unexpectedly: ${out}"
else
  if echo "${out}" | grep -qi "not found"; then
    log_pass "exits nonzero when the local file is missing"
  else
    log_fail "exits nonzero when the local file is missing" "missing 'not found' message: ${out}"
  fi
fi

echo ""
echo "constraints_parity_guard_tests summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"

if [ "${FAIL_COUNT}" -eq 0 ]; then
  exit 0
fi

exit 1
