#!/usr/bin/env bash
# Generate and check the OCI image's bundle SBOM from the Dockerfile's own `build` stage.
#
#   scripts/sbom/image-bundle-sbom.sh <out-dir> [platform]
#
# Builds the `build` stage with buildx (no push) and exports it, then generates the SPDX document from
# that stage's bundler metafile, lockfile and node_modules, checks it, and records the stage's dist/
# SHA-256 hashes. Writes <out-dir>/cejel-bundle.spdx.json and <out-dir>/dist.sha256.
# The same script runs in the release workflow (bundle-sbom job) and in CI (oci-sbom-binding job), so
# the release path is exercised on real runners on every relevant PR.
set -euo pipefail

out="${1:?usage: image-bundle-sbom.sh <out-dir> [platform]}"
platform="${2:-linux/amd64}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
stage_root="$(mktemp -d)"
trap 'rm -rf "$stage_root"' EXIT

mkdir -p "$out"
docker buildx build --platform "$platform" --target build --output "type=local,dest=$stage_root" "$repo"

stage="$stage_root/src"
test -f "$stage/.build/metafiles/package.json"
node "$repo/scripts/sbom/generate-bundle-sbom.mjs" --metafile "$stage/.build/metafiles/package.json" \
  --root "$stage" --out "$out/cejel-bundle.spdx.json"
node "$repo/scripts/sbom/check-sbom-inventory.mjs" "$out/cejel-bundle.spdx.json" \
  --require zod --require @modelcontextprotocol/sdk
(cd "$stage/dist" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > "$out/dist.sha256"
test -s "$out/dist.sha256"
echo "image-bundle-sbom: $(wc -l < "$out/dist.sha256" | tr -d ' ') dist file(s) hashed from the $platform build stage"
