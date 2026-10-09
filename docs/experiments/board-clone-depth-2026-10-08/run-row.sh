#!/usr/bin/env bash
# run-row.sh <name> <url> <sha> <outroot>: depth-1 (board public method) and full arm, cejel 0.4.9.
set -uo pipefail
name="$1"; url="$2"; sha="$3"; root="$4"
w="$root/work/$name"; o="$root/out/$name"; rm -rf "$w" "$o"; mkdir -p "$w" "$o/shallow" "$o/full"
log="$o/log.txt"; : > "$log"
g() { git -c advice.detachedHead=false "$@" >>"$log" 2>&1; }
# depth-1 arm: identical to the board's public-row fetch
g init --quiet "$w/shallow" && g -C "$w/shallow" remote add origin "$url" \
  && g -C "$w/shallow" fetch --depth 1 --filter=blob:none --quiet origin "$sha" \
  && g -C "$w/shallow" checkout --detach --quiet FETCH_HEAD || echo "SHALLOW_CLONE_FAILED" >>"$log"
# full arm: full clone, no blob filter, pinned commit
g clone --no-checkout --quiet "$url" "$w/full" && g -C "$w/full" fetch --no-tags --quiet origin "$sha" \
  && g -C "$w/full" checkout --detach --quiet "$sha" || echo "FULL_CLONE_FAILED" >>"$log"
for arm in shallow full; do
  d="$w/$arm"
  {
    echo "head=$(git -C "$d" rev-parse HEAD 2>/dev/null)"
    echo "shallow=$(git -C "$d" rev-parse --is-shallow-repository 2>/dev/null)"
    echo "commits=$(git -C "$d" rev-list --count HEAD 2>/dev/null)"
  } > "$o/$arm/meta.txt"
  (cd "$root" && npx -y @cejel/cejel@0.4.9 "$d" --product-name "$name" --out-dir "$o/$arm" --quiet) >>"$log" 2>&1
  echo "scan_exit_$arm=$?" >> "$o/$arm/meta.txt"
done
echo "DONE $name"
