#!/usr/bin/env bash
# Prove a pushed multi-platform image has the runtime shape the Dockerfile promises, per platform.
#
#   scripts/sbom/verify-image-runtime.sh <image-repo> <index-digest>
#
# Since #421 the final stage copies its bin links, executable bits and /workspace from the native
# build stage instead of creating them with RUN. This checks the result in each platform's own
# filesystem (read from `docker export`, so a foreign platform is inspected without running it):
#   - dist/index.js and dist/mcp/index.js are executable;
#   - /usr/local/bin/cejel and cejel-mcp are symlinks to them;
#   - /usr/local/bin/cejel-entrypoint is mode 0755 and owned by root;
#   - /workspace is a directory owned by the node user (uid 1000);
# and, on the runner's own platform only, runs `cejel --version` through the bin link as the image
# user. Exactly linux/amd64 and linux/arm64 must be present; attestation manifests are skipped.
# Runs in CI (oci-sbom-binding) and in the release before attestation (publish-distribution).
set -euo pipefail

image="${1:?usage: verify-image-runtime.sh <image-repo> <index-digest>}"
digest="${2:?index digest required}"
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

native="linux/$(docker version --format '{{.Server.Arch}}')"
checked=0
while read -r platform manifest; do
  cid="$(docker create --platform "$platform" "$image@$manifest")"
  docker export "$cid" > "$work/rootfs.tar"
  docker rm "$cid" > /dev/null
  if ! python3 -I - "$work/rootfs.tar" "$platform" <<'PY'
import sys, tarfile
tar_path, platform = sys.argv[1], sys.argv[2]
members = {m.name.lstrip("./"): m for m in tarfile.open(tar_path)}
problems = []
def need(name):
    m = members.get(name)
    if m is None:
        problems.append(f"{name} is missing")
    return m
for path in ("opt/cejel/dist/index.js", "opt/cejel/dist/mcp/index.js"):
    m = need(path)
    if m is not None and not (m.isfile() and m.mode & 0o111):
        problems.append(f"{path} is not an executable file (mode {oct(m.mode)})")
for link, target in (("usr/local/bin/cejel", "/opt/cejel/dist/index.js"),
                     ("usr/local/bin/cejel-mcp", "/opt/cejel/dist/mcp/index.js")):
    m = need(link)
    if m is not None and not (m.issym() and m.linkname == target):
        problems.append(f"{link} is not a symlink to {target} (type {m.type!r}, target {m.linkname!r})")
m = need("usr/local/bin/cejel-entrypoint")
if m is not None and not (m.isfile() and (m.mode & 0o777) == 0o755 and m.uid == 0):
    problems.append(f"usr/local/bin/cejel-entrypoint is not root-owned mode 0755 (mode {oct(m.mode)}, uid {m.uid})")
m = need("workspace")
if m is not None and not (m.isdir() and m.uid == 1000):
    problems.append(f"workspace is not a directory owned by uid 1000 (type {m.type!r}, uid {m.uid})")
for p in problems:
    print(f"::error::{platform}: {p}", file=sys.stderr)
sys.exit(1 if problems else 0)
PY
  then
    exit 1
  fi
  if [ "$platform" = "$native" ]; then
    version="$(docker run --rm --platform "$platform" --entrypoint /usr/local/bin/cejel "$image@$manifest" --version)"
    test -n "$version"
    echo "verify-image-runtime: $platform runs cejel --version -> $version"
  fi
  docker rmi -f "$image@$manifest" > /dev/null 2>&1 || true
  checked=$((checked + 1))
done < "$work/platforms.txt"

test "$checked" -eq 2
echo "verify-image-runtime: linux/amd64 and linux/arm64 have the promised runtime shape"
