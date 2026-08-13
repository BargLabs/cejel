#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo 'usage: no-egress-wrapper.sh <committed-detector-script> [args...]' >&2
  exit 64
fi

if [ -n "${NODE_OPTIONS:-}" ]; then
  echo 'no-egress wrapper refuses inherited NODE_OPTIONS' >&2
  exit 66
fi

if ! command -v docker >/dev/null 2>&1; then
  echo 'docker is unavailable; refusing to run without host network isolation' >&2
  exit 126
fi

if [ -z "${CEJEL_CALIBRATION_NO_EGRESS_IMAGE:-}" ]; then
  echo 'CEJEL_CALIBRATION_NO_EGRESS_IMAGE is required for host network isolation' >&2
  exit 67
fi

wrapper_directory=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
detector_root=$(CDPATH= cd "$wrapper_directory/../../.." && pwd -P)
runtime_wrapper="$detector_root/calibration/llm/scripts/no-egress-runtime-wrapper.sh"

case "$1" in
  "$detector_root"/*)
    detector_script="$1"
    ;;
  *)
    echo 'no-egress wrapper requires a committed detector-repository script' >&2
    exit 68
    ;;
esac

if ! docker image inspect "$CEJEL_CALIBRATION_NO_EGRESS_IMAGE" >/dev/null 2>&1; then
  echo 'prepared no-egress container image is unavailable locally' >&2
  exit 69
fi

source_mount=''
output_mount=''

run_container() {
  if [ -n "$source_mount" ]; then
    exec docker run --rm --pull=never --network none --read-only --cap-drop ALL \
      --security-opt no-new-privileges --pids-limit 128 \
      --tmpfs /tmp:rw,noexec,nosuid,size=64m --user "$(id -u):$(id -g)" \
      --workdir "$detector_root" --entrypoint /bin/sh \
      -v "$detector_root:$detector_root:ro" \
      -v "$source_mount" -v "$output_mount" \
      -e "CEJEL_CALIBRATION_NO_EGRESS_IMAGE=$CEJEL_CALIBRATION_NO_EGRESS_IMAGE" \
      -e CEJEL_CALIBRATION_HOST_NO_EGRESS=1 \
      "$CEJEL_CALIBRATION_NO_EGRESS_IMAGE" "$@"
  fi
  exec docker run --rm --pull=never --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --pids-limit 128 \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m --user "$(id -u):$(id -g)" \
    --workdir "$detector_root" --entrypoint /bin/sh \
    -v "$detector_root:$detector_root:ro" \
    -e "CEJEL_CALIBRATION_NO_EGRESS_IMAGE=$CEJEL_CALIBRATION_NO_EGRESS_IMAGE" \
    -e CEJEL_CALIBRATION_HOST_NO_EGRESS=1 \
    "$CEJEL_CALIBRATION_NO_EGRESS_IMAGE" "$@"
}

if [ "$#" -eq 1 ]; then
  run_container "$runtime_wrapper" "$detector_script"
fi

if [ "$#" -ne 6 ] || [ "$2" != 'scan' ] || [ "$4" != '--out' ] || [ "$6" != '--quiet' ]; then
  echo 'no-egress wrapper accepts only the frozen scan argv' >&2
  exit 70
fi

source_directory=$(CDPATH= cd "$3" && pwd -P)
output_directory=$(CDPATH= cd "$5" && pwd -P)
source_mount="$source_directory:$source_directory:ro"
output_mount="$output_directory:$output_directory:rw"
run_container "$runtime_wrapper" "$detector_script" scan "$source_directory" --out "$output_directory" --quiet
