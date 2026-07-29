#!/usr/bin/env bash
# Fast local parity check with CI's cheap gate (ci.yml's `pnpm run typecheck`
# step). Deliberately excludes `pnpm run build`, `pnpm run validate:distribution`,
# `pnpm test`, and the Docker/Action smoke steps — those stay in CI / a full
# local run, not this fast pre-commit/pre-push gate. Cejel has no linter
# configured (no biome/eslint config or `lint` script as of 2026-07), so
# typecheck is the whole fast gate for now; add a lint step here if one is
# ever introduced.
#
# Usage:
#   scripts/preflight_fast.sh
#
# Used by:
#   - headless goal worktrees / cross-repo streams (e.g. alfred's
#     scripts/run-goal-stream.sh), which gate on this existing before
#     spawning any goal worker.
#
# Exit codes:
#   0  → typecheck passed
#   1+ → typecheck failed; do not commit/push. See output above.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${CEJEL_PREFLIGHT_FAST_REPO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

cd "${REPO_ROOT}" || {
  echo "preflight_fast: could not cd to ${REPO_ROOT}" >&2
  exit 99
}

FAIL_COUNT=0

# SELF-HEAL a stale/missing install BEFORE the checks. Without this, a stale
# local node_modules or a fresh goal worktree makes `pnpm run typecheck` fail
# on "cannot find module" / "command not found" — a FALSE failure that looks
# like a real break. Install only when actually stale (lockfile newer than the
# install marker, or node_modules absent). Escape hatch: PREFLIGHT_NO_INSTALL=1.
_pf_marker="node_modules/.modules.yaml"   # pnpm writes this after a completed install
if [ "${PREFLIGHT_NO_INSTALL:-0}" != "1" ] \
  && { [ ! -d node_modules ] || [ ! -e "${_pf_marker}" ] || [ "pnpm-lock.yaml" -nt "${_pf_marker}" ]; }; then
  echo "--- deps stale or missing → pnpm install (self-heal) ---"
  pnpm install --frozen-lockfile || pnpm install || {
    echo "preflight_fast: pnpm install failed — env may be incomplete; checks below may false-fail." >&2
  }
fi

echo "=== Cejel fast preflight (tsc — same check as CI's ci.yml typecheck step) ==="

echo ""
echo "--- pnpm run typecheck (tsc --noEmit) ---"
if pnpm run typecheck; then
  echo "PASS: typecheck"
else
  echo "FAIL: typecheck" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""
if [ "${FAIL_COUNT}" -eq 0 ]; then
  echo "preflight_fast: OK — typecheck passed."
  exit 0
fi

echo "preflight_fast: FAILED (${FAIL_COUNT} check(s) failed). Fix before committing/pushing." >&2
exit 1
