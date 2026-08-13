#!/bin/sh
set -eu

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo 'usage: prepare-no-egress-image.sh <local-image-tag>' >&2
  exit 64
fi

if ! command -v docker >/dev/null 2>&1; then
  echo 'docker is unavailable; cannot prepare the no-egress image' >&2
  exit 126
fi

image="$1"
script_directory=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
detector_root=$(CDPATH= cd "$script_directory/../../.." && pwd -P)
dockerfile="$detector_root/calibration/llm/Dockerfile.no-egress"

if ! docker build --pull=false --tag "$image" --file "$dockerfile" "$detector_root"; then
  echo 'no-egress image build failed' >&2
  exit 72
fi

# The execution wrapper performs this exact local-store lookup before entering its one-shot
# control gate. Make preparation fail here, while the subject is synthetic and no authorization
# has been consumed, if that lookup cannot resolve the image the builder just tagged.
if image_id=$(docker image inspect --format '{{.Id}}' "$image" 2>&1); then
  if [ -n "$image_id" ]; then
    printf '%s\n' "$image_id"
    exit 0
  fi
fi

echo 'prepared no-egress image cannot be resolved from the local Docker store' >&2
exit 73
