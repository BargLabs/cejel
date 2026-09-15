#!/usr/bin/env bash
set -euo pipefail
ROOT=~/tmp/cejel-049-delta
CORPUS=~/projects/cejel/.worktrees/rescore-cand-fe4210a/leaderboard/corpus.json
ALFRED_COMMIT=95e05c337db0e43f3a59f5ab73fb73f7715326ef
python3 - "$CORPUS" <<'PY' > "$ROOT/entries.tsv"
import json,sys
d=json.load(open(sys.argv[1]))
for e in d['entries']:
    print(e['name'], e.get('visibility'), e.get('url',''), e.get('commit',''), sep='\t')
PY
while IFS=$'\t' read -r name vis url commit; do
  t="$ROOT/checkouts/$name"
  if [ -d "$t" ]; then echo "exists $name"; continue; fi
  if [ "$vis" = "private" ]; then
    git clone --quiet --local --no-hardlinks --no-checkout ~/projects/alfred "$t"
    git -C "$t" checkout --quiet --detach "$ALFRED_COMMIT"
    commit="$ALFRED_COMMIT"
  else
    mkdir -p "$t"; git -C "$t" init --quiet; git -C "$t" remote add origin "$url"
    git -C "$t" fetch --quiet --depth=1 origin "$commit"
    git -C "$t" checkout --quiet --detach FETCH_HEAD
  fi
  actual=$(git -C "$t" rev-parse HEAD)
  [ "$actual" = "$commit" ] || { echo "MISMATCH $name $actual"; exit 1; }
  echo "ok $name $(echo $actual | cut -c1-8)"
done < "$ROOT/entries.tsv"
echo "CHECKOUTS_DONE $(ls $ROOT/checkouts | wc -l | tr -d ' ')"
