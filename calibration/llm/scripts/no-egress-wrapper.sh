#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo 'usage: no-egress-wrapper.sh <node-executable-or-script> [args...]' >&2
  exit 64
fi

wrapper_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
hook="$wrapper_directory/no-egress-hook.cjs"
if [ ! -f "$hook" ]; then
  echo 'no-egress hook is missing' >&2
  exit 65
fi

if [ -n "${NODE_OPTIONS:-}" ]; then
  echo 'no-egress wrapper refuses inherited NODE_OPTIONS' >&2
  exit 66
fi
NODE_OPTIONS="--require=$hook"
export NODE_OPTIONS
exec "$@"
