#!/bin/sh

set -eu

case "${1:-}" in
  -h|--help|-v|--version)
    exec cejel "$@"
    ;;
  *)
    exec cejel-mcp "$@"
    ;;
esac
