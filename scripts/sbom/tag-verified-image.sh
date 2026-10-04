#!/usr/bin/env bash
# Apply tags to an image that was pushed by digest, verified and attested, and prove each tag resolves
# to that same digest.
#
#   scripts/sbom/tag-verified-image.sh <image-repo> <index-digest> <tags (newline separated)>
#
# `docker buildx imagetools create` with a single source keeps the source digest, so provenance and the
# SBOM attested to <index-digest> stay valid for the tags; the read-back makes that a checked fact,
# not an assumption. The same script runs in the release workflow and in CI.
set -euo pipefail

image="${1:?usage: tag-verified-image.sh <image-repo> <index-digest> <tags>}"
digest="${2:?index digest required}"
tags="${3:?tags required}"

args=()
while IFS= read -r tag; do
  [ -n "$tag" ] && args+=(-t "$tag")
done <<< "$tags"
if [ "${#args[@]}" -lt 2 ]; then
  echo "::error::expected at least two tags (version and latest), got $((${#args[@]} / 2))." >&2
  exit 1
fi

docker buildx imagetools create "${args[@]}" "$image@$digest"

while IFS= read -r tag; do
  [ -n "$tag" ] || continue
  resolved="$(docker buildx imagetools inspect "$tag" --format '{{json .Manifest.Digest}}' | tr -d '"')"
  if [ "$resolved" != "$digest" ]; then
    echo "::error::$tag resolves to $resolved, not the attested $digest." >&2
    exit 1
  fi
done <<< "$tags"
echo "tag-verified-image: every tag resolves to $digest"
