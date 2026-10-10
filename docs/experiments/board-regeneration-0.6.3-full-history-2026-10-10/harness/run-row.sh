#!/usr/bin/env bash
# run-row.sh <name> <source> <pin> <root>: one board row, full-history clone, published @cejel/cejel@0.6.3.
# The full arm of ../../board-clone-depth-2026-10-08/run-row.sh, with the 0.6.3 package, a refusal to
# run from (or score into) any directory inside a cejel checkout or install (#436), and --product-name.
# <source> is the row's URL, or for the private row the path of the operator's local checkout.
# Writes <root>/out/<name>/{report.json,meta.txt,log.txt}; clones into <root>/work/<name>.
set -uo pipefail
[ "$#" -eq 4 ] || { echo "usage: run-row.sh <name> <source> <pin> <root>" >&2; exit 2; }
name="$1"; src="$2"; pin="$3"; root="$4"
PKG='@cejel/cejel@0.6.3'; WANT_VERSION='0.6.3'

# A directory is unsafe when it, or any parent, is a cejel checkout or holds an installed cejel: there
# `npx @cejel/cejel@<version>` can resolve the local package instead of the registry version (#436).
unsafe_dir() {
  local d; d=$(cd "$1" 2>/dev/null && pwd -P) || return 0
  while :; do
    if [ -f "$d/package.json" ] && grep -Eq '"name"[[:space:]]*:[[:space:]]*"@cejel/cejel"' "$d/package.json"; then
      echo "$d"; return 0
    fi
    if [ -e "$d/node_modules/@cejel/cejel" ] || [ -e "$d/node_modules/.bin/cejel" ]; then echo "$d"; return 0; fi
    [ "$d" = / ] && return 1
    d=$(dirname "$d")
  done
}
mkdir -p "$root" || exit 2
for dir in "$PWD" "$root"; do
  if hit=$(unsafe_dir "$dir"); then
    echo "REFUSED: $dir is inside a cejel checkout or install ($hit); run from a neutral directory (#436)" >&2
    exit 3
  fi
done
got=$(cd "$root" && npx -y "$PKG" --version 2>/dev/null | tail -n 1)
[ "$got" = "$WANT_VERSION" ] || { echo "REFUSED: npx $PKG --version printed '$got', expected $WANT_VERSION" >&2; exit 3; }

w="$root/work/$name"; o="$root/out/$name"
rm -rf "$w" "$o"; mkdir -p "$o"
log="$o/log.txt"; : > "$log"
g() { git -c advice.detachedHead=false "$@" >>"$log" 2>&1; }

# full arm: full clone, no depth limit, no blob filter, pinned commit
if ! { g clone --no-checkout --quiet "$src" "$w" && g -C "$w" fetch --no-tags --quiet origin "$pin" \
  && g -C "$w" checkout --detach --quiet "$pin"; }; then
  echo "error=FULL_CLONE_FAILED" > "$o/meta.txt"; echo "ERROR $name FULL_CLONE_FAILED"; exit 1
fi
head=$(git -C "$w" rev-parse HEAD 2>/dev/null)
shallow=$(git -C "$w" rev-parse --is-shallow-repository 2>/dev/null)
commits=$(git -C "$w" rev-list --count HEAD 2>/dev/null)
{ echo "head=$head"; echo "shallow=$shallow"; echo "commits=$commits"; } > "$o/meta.txt"
if [ "$head" != "$pin" ]; then echo "error=PIN_MISMATCH" >> "$o/meta.txt"; echo "ERROR $name PIN_MISMATCH"; exit 1; fi
if [ "$shallow" != false ]; then echo "error=NOT_FULL_HISTORY" >> "$o/meta.txt"; echo "ERROR $name NOT_FULL_HISTORY"; exit 1; fi

(cd "$root" && npx -y "$PKG" "$w" --product-name "$name" --out-dir "$o" --quiet) >>"$log" 2>&1
rc=$?
echo "scan_exit=$rc" >> "$o/meta.txt"
[ -s "$o/report.json" ] || { echo "error=NO_REPORT" >> "$o/meta.txt"; echo "ERROR $name NO_REPORT (scan_exit=$rc)"; exit 1; }
echo "DONE $name commits=$commits scan_exit=$rc"
