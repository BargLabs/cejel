#!/usr/bin/env bash

set -euo pipefail

: "${IMAGE_NAME:?IMAGE_NAME must be set}"
: "${RELEASE_TAG:?RELEASE_TAG must be set}"

image_tag="${IMAGE_NAME}:${RELEASE_TAG#v}"
inspection_output="$(mktemp)"
trap 'rm -f "$inspection_output"' EXIT

if docker buildx imagetools inspect "$image_tag" >"$inspection_output" 2>&1; then
  echo "OCI tag refusal: ${image_tag} is already published; refusing to overwrite it." >&2
  cat "$inspection_output" >&2
  exit 1
fi

if ! grep -Eqi 'manifest unknown|name unknown|not found' "$inspection_output"; then
  echo "Unable to establish whether OCI tag ${image_tag} already exists; refusing to publish." >&2
  cat "$inspection_output" >&2
  exit 1
fi

echo "OCI tag absence assertion passed for ${image_tag}"
