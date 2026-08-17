#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo 'usage: v1-9-v3-cross-policy-wrapper.sh <node-executable-or-script> [args...]' >&2
  exit 64
fi

wrapper_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
hook="$wrapper_directory/no-egress-hook.cjs"
adapter="$wrapper_directory/v1-9-v3-historical-git-adapter.cjs"
if [ ! -f "$hook" ] || [ ! -f "$adapter" ]; then
  echo 'cross-policy no-egress assets are missing' >&2
  exit 65
fi
if [ -n "${NODE_OPTIONS:-}" ]; then
  echo 'cross-policy wrapper refuses inherited NODE_OPTIONS' >&2
  exit 66
fi
if [ -n "${CEJEL_NO_EGRESS_AUDIT_LOG:-}" ] && [ -z "${CEJEL_HISTORICAL_SCAN_ROOT:-}" ]; then
  echo 'cross-policy audit logging requires CEJEL_HISTORICAL_SCAN_ROOT' >&2
  exit 67
fi

NODE_OPTIONS="--require=$hook --require=$adapter"
export NODE_OPTIONS
exec "$@"
