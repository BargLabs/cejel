#!/bin/sh
set -eu

if [ ! -x /usr/bin/sandbox-exec ]; then
  echo "sandbox-exec is unavailable; refusing to run without enforced network isolation" >&2
  exit 126
fi

exec /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' "$@"
