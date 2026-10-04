#!/usr/bin/env bash
# Prove a pushed multi-platform image carries the dist/ its bundle SBOM was computed from.
#
#   scripts/sbom/verify-image-dist.sh <image-repo> <index-digest> <expected-dist.sha256>
#
# Resolves each platform's own manifest digest from the pushed index and creates a container from
# THAT digest, rather than `docker create --platform X <repo>@<index-digest>` twice: on Docker's
# classic image store (GitHub's ubuntu runners, overlay2) the second create on the same index digest
# fails with "cannot overwrite digest" (third review of #404). Each image is removed after its pass.
# Exactly linux/amd64 and linux/arm64 must be present; attestation manifests are skipped.
# The same script runs in the release workflow and in CI against a throwaway local registry.
set -euo pipefail

image="${1:?usage: verify-image-dist.sh <image-repo> <index-digest> <expected-dist.sha256>}"
digest="${2:?index digest required}"
expected="${3:?expected dist.sha256 required}"
test -s "$expected"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

docker buildx imagetools inspect --raw "$image@$digest" > "$work/index.json"
# shellcheck disable=SC2016 # ${...} below is a JavaScript template literal, not shell.
node -e '
  const index = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const m of index.manifests ?? []) {
    const p = m.platform ?? {};
    if (p.os && p.os !== "unknown") console.log(`${p.os}/${p.architecture}${p.variant ? `/${p.variant}` : ""} ${m.digest}`);
  }
' "$work/index.json" > "$work/platforms.txt"

found="$(cut -d' ' -f1 "$work/platforms.txt" | LC_ALL=C sort | tr '\n' ' ')"
if [ "$found" != "linux/amd64 linux/arm64 " ]; then
  echo "::error::$image@$digest carries platforms [$found]; expected exactly linux/amd64 and linux/arm64." >&2
  exit 1
fi

checked=0
while read -r platform manifest; do
  cid="$(docker create "$image@$manifest")"
  docker cp "$cid:/opt/cejel/dist" "$work/dist-$checked"
  docker rm "$cid" > /dev/null
  docker rmi -f "$image@$manifest" > /dev/null 2>&1 || true
  (cd "$work/dist-$checked" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > "$work/dist-$checked.sha256"
  if ! diff -u "$expected" "$work/dist-$checked.sha256"; then
    echo "::error::$platform image dist/ differs from the build stage the bundle SBOM was computed from." >&2
    exit 1
  fi
  checked=$((checked + 1))
done < "$work/platforms.txt"

test "$checked" -eq 2
echo "verify-image-dist: linux/amd64 and linux/arm64 dist/ match $expected"
