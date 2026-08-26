#!/usr/bin/env bash
# Cross-repo byte-parity guard for docs/standing-constraints.md between
# alfred and cejel.
#
# Vendored identically in both repos (scripts/constraints-parity-guard.sh in
# each) so the ONE piece of logic that checks for drift cannot itself drift
# between the two copies that run it -- the same failure class this guard
# exists to catch. Keep the two copies byte-identical; if you edit one, copy
# the same bytes into the other in the same change.
#
# Sibling read method: the GitHub raw-contents API via `gh api
# repos/<owner>/<repo>/contents/<path> -H "Accept: application/vnd.github.raw"`.
# This is HTTPS-over-gh's-own-auth, not git -- it touches no git state (no
# fetch, no clone, no shallow/depth flags, no worktree ref/shallow metadata)
# and cannot hit the duplicate `Authorization` header hazard that a
# `git -c http.extraHeader=...` credential path can (alfred #1117 / #1096:
# actions/checkout persists its own header; a second one set by the process
# merges instead of replacing it and GitHub rejects the request). Do not
# switch this script to `git fetch` or `git clone` of the sibling without
# re-reading that incident and this repo's HARD PROHIBITION on shallow
# clones against any repository whose .git may be shared (worktrees share
# repository metadata -- a shallow fetch inside one writes .git/shallow into
# the shared object store for every co-tenant checkout).
#
# An unreadable sibling (bad auth, unreachable network, wrong path/ref) FAILS
# this script -- it never skips. An unreadable sibling is indistinguishable
# from a drifted one and must be treated as loud.
set -euo pipefail

LOCAL_PATH="${PARITY_GUARD_LOCAL_PATH:-docs/standing-constraints.md}"
SELF_LABEL="${PARITY_GUARD_SELF_LABEL:?PARITY_GUARD_SELF_LABEL is required (e.g. alfred)}"
SIBLING_REPO="${PARITY_GUARD_SIBLING_REPO:?PARITY_GUARD_SIBLING_REPO is required (e.g. BargLabs/cejel)}"
SIBLING_REF="${PARITY_GUARD_SIBLING_REF:-main}"
SIBLING_PATH="${PARITY_GUARD_SIBLING_PATH:-docs/standing-constraints.md}"
SIBLING_LABEL="${PARITY_GUARD_SIBLING_LABEL:-${SIBLING_REPO}}"
# Informational only -- echoed into failure output so a red run names which
# auth plane it used without anyone having to go read the workflow YAML.
# 'GITHUB_TOKEN' = the job's default token (works here only because the
# sibling being read is PUBLIC; GitHub's contents API serves public-repo
# content to any authenticated Actions token regardless of which repo it
# belongs to). 'installation-token' / 'fine-grained-pat' = a secret scoped
# with explicit read access to a PRIVATE sibling, required whenever the
# sibling being read is private. 'ambient' = whatever `gh`'s already-logged-in
# session provides (local/manual runs only, never CI).
AUTH_MODE="${PARITY_GUARD_AUTH_MODE:-GITHUB_TOKEN}"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

if [ ! -f "${LOCAL_PATH}" ]; then
  echo "::error::constraints-parity-guard: local file not found at ${LOCAL_PATH}" >&2
  exit 1
fi

SIBLING_TMP="$(mktemp)"
STDERR_TMP="$(mktemp)"
cleanup() { rm -f "${SIBLING_TMP}" "${STDERR_TMP}"; }
trap cleanup EXIT

if ! gh api "repos/${SIBLING_REPO}/contents/${SIBLING_PATH}?ref=${SIBLING_REF}" \
    -H "Accept: application/vnd.github.raw" \
    >"${SIBLING_TMP}" 2>"${STDERR_TMP}"; then
  detail="$(tr '\n' ' ' <"${STDERR_TMP}")"
  plane="content"
  case "${detail}" in
    *"HTTP 401"*|*"HTTP 403"*|*"Bad credentials"*) plane="auth" ;;
    # GitHub returns 404, not 403, for a private repo/path the token can't
    # read -- indistinguishable from "genuinely doesn't exist" by design, so
    # this plane is deliberately ambiguous rather than mislabeled "content".
    *"HTTP 404"*|*"Not Found"*) plane="auth-or-content" ;;
    *"timeout"*|*"Could not resolve"*|*"HTTP 5"*) plane="transport" ;;
  esac
  echo "::error::constraints-parity-guard FAILED [plane=${plane}] repo=${SIBLING_REPO} ref=${SIBLING_REF} path=${SIBLING_PATH} auth_mode=${AUTH_MODE} detail=\"${detail}\"" >&2
  echo "constraints-parity-guard: an unreadable sibling is treated as drift, not skipped." >&2
  exit 1
fi

local_digest="$(sha256_of "${LOCAL_PATH}")"
sibling_digest="$(sha256_of "${SIBLING_TMP}")"
local_version_line="$(grep -m1 'CONSTRAINTS-VERSION' "${LOCAL_PATH}" || echo '(no CONSTRAINTS-VERSION line found)')"
sibling_version_line="$(grep -m1 'CONSTRAINTS-VERSION' "${SIBLING_TMP}" || echo '(no CONSTRAINTS-VERSION line found)')"

if ! cmp -s "${LOCAL_PATH}" "${SIBLING_TMP}"; then
  echo "::error::constraints-parity-guard: ${SELF_LABEL} and ${SIBLING_LABEL} standing constraints have diverged." >&2
  echo "${SELF_LABEL} (${LOCAL_PATH}): sha256=${local_digest} ${local_version_line}"
  echo "${SIBLING_LABEL} (${SIBLING_REPO}@${SIBLING_REF}/${SIBLING_PATH}): sha256=${sibling_digest} ${sibling_version_line}"
  exit 1
fi

echo "constraints-parity-guard: OK -- ${SELF_LABEL} and ${SIBLING_LABEL} byte-identical. sha256=${local_digest} ${local_version_line}"
