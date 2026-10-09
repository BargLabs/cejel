# Running the #433 v17 delta (v0.6.2 → #441's merge commit)

The operator runs these steps **after this PR merges with `--merge`**, from a clean checkout of
this repository's `main`, on one macOS host. Nothing here was run when the harness was written.
The expected values are in `../PREREGISTRATION.md`. Compare the outputs with that file only.

`DELTA_ROOT` is a scratch directory outside the repository. Nothing under it is committed except
the two copies made in step 6.

## 1. Scratch root and corpus

```
export DELTA_ROOT=~/tmp/cejel-433-delta
mkdir -p "$DELTA_ROOT"
cp leaderboard/corpus.json "$DELTA_ROOT/corpus.json"
shasum -a 256 "$DELTA_ROOT/corpus.json"
echo "expect dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00"
node -e 'for (const e of require(process.argv[1]).entries) console.log([e.name, e.visibility, e.url ?? "", e.commit ?? ""].join("\t"))' \
  "$DELTA_ROOT/corpus.json" > "$DELTA_ROOT/entries.tsv"
```

## 2. Checkouts, one per row, at `$DELTA_ROOT/checkouts/<name>`

Either reuse the 0.4.11 checkouts as APFS clones:

```
cp -cR ~/tmp/cejel-0411-delta/checkouts "$DELTA_ROOT/checkouts"
```

or recreate the public rows on an empty root. Each is fetched `--depth=1` at its pin, the command
the 0.4.9 and 0.4.11 runs used (see the preregistration on "blob-filtered"):

```
while IFS=$'\t' read -r name vis url commit; do
  [ "$vis" = public ] || continue
  t="$DELTA_ROOT/checkouts/$name"
  [ -e "$t" ] && { echo "exists $name"; continue; }
  mkdir -p "$t" && git -C "$t" init --quiet && git -C "$t" remote add origin "$url"
  git -C "$t" fetch --quiet --depth=1 origin "$commit"
  git -C "$t" checkout --quiet --detach FETCH_HEAD
done < "$DELTA_ROOT/entries.tsv"
```

For the recreate path, also place the private row's checkout at
`$DELTA_ROOT/checkouts/<its corpus name>`, at the commit the 0.4.11 run used. You hold that
commit. It is not named in this public file.

**Verify every checkout before scoring.** `prepare-checkouts.sh` and the loop above both skip a
directory that already exists, so this step is never optional:

```
while IFS=$'\t' read -r name vis url commit; do
  t="$DELTA_ROOT/checkouts/$name"
  head=$(git -C "$t" rev-parse HEAD)
  [ -z "$(git -C "$t" status --porcelain)" ] || echo "DIRTY $name"
  if [ "$vis" = public ]; then
    [ "$head" = "$commit" ] || echo "PIN MISMATCH $name $head"
    [ "$(git -C "$t" rev-parse --is-shallow-repository)" = true ] || echo "NOT SHALLOW $name"
  else
    echo "private row at $head (compare with the 0.4.11 commit by hand)"
  fi
done < "$DELTA_ROOT/entries.tsv"
```

Expected output: no `DIRTY`, `PIN MISMATCH` or `NOT SHALLOW` line, and the private row at its
0.4.11 commit. Stop on any other output.

## 3. The published board the baseline is checked against

`compare.mjs` reads `~/projects/cejel-site/leaderboard/reports/*.json`. Confirm the checkout holds
the published 0.4.9 board reports:

```
git -C ~/projects/cejel-site fetch --quiet origin
git -C ~/projects/cejel-site diff --quiet 026774b25ed77c692392ee85c4d626b499780823 origin/main -- 'leaderboard/reports/*.json' && echo "board json unchanged since 026774b"
git -C ~/projects/cejel-site diff --quiet HEAD -- 'leaderboard/reports/*.json' && git -C ~/projects/cejel-site diff --quiet origin/main HEAD -- 'leaderboard/reports/*.json' && echo "local board json = origin/main"
```

Expected output: both lines are printed.

## 4. Two source worktrees, one per arm

Both arms have byte-identical `package.json` and `pnpm-lock.yaml`.

```
git worktree add --detach ../cejel-wt-433-base 7c9170f653fc5a2cd3e3f06d45b9fa3fe6e013a8
git worktree add --detach ../cejel-wt-433-cand 3c6d16137b48e9a9c4a78bd65dc4005d4276bd95
( cd ../cejel-wt-433-base && pnpm install --frozen-lockfile )
( cd ../cejel-wt-433-cand && pnpm install --frozen-lockfile )
```

## 5. Score each arm from inside its worktree, then compare

The scanner is resolved from the working directory. The first output line names the scanner
path, its git HEAD and the package version. `score-arm.ts` refuses to score anything unless the
worktree is at that arm's preregistered commit with no tracked changes.

```
H=$PWD/docs/experiments/v17-behaviour-delta-433-2026-10-09/harness
( cd ../cejel-wt-433-base && ARM=base pnpm exec tsx "$H/score-arm.ts" )
( cd ../cejel-wt-433-cand && ARM=cand pnpm exec tsx "$H/score-arm.ts" )
LEFT_ARM=base RIGHT_ARM=cand node "$H/compare.mjs"
LEFT_ARM=base RIGHT_ARM=cand node "$H/compare-bytes.mjs"
```

Score each arm once. If a row errors, keep the error. Do not repair it and re-run.

## 6. Where the outputs go

- `compare.mjs` writes `$DELTA_ROOT/delta.json` and `$DELTA_ROOT/delta.md`. It compares the arms
  at scoring level (headline, per-criterion score and status, per-metric value) and checks the
  base arm against the published board (expected value 1). It also computes placements
  (expected value 3).
- `compare-bytes.mjs` writes `$DELTA_ROOT/bytes.json`, covering expected values 4 and 5.
- Copy both, unchanged, beside the preregistration, then write `result.md` there. Commit them on a
  branch whose history contains the preregistration commit:

```
D=docs/experiments/v17-behaviour-delta-433-2026-10-09
cp "$DELTA_ROOT/delta.json" "$D/paired-result.json"
cp "$DELTA_ROOT/bytes.json" "$D/bytes-result.json"
```

Raw per-row reports under `$DELTA_ROOT/out/` stay local. The private row's report is not public.
In both committed files, the private row appears only as `private-row`.

## Changes from the 0.4.11 harness

The 0.4.11 harness is `../../v17-behaviour-delta-post-0.4.10-2026-09-23/harness/`. Only these
changes were made:

- **`score-arm.ts`**
  - The scratch root defaults to `~/tmp/cejel-433-delta`.
  - New `ARM_COMMITS` names the two preregistered arm commits. The script refuses to run when
    `ARM` is not `base` or `cand`, when the source tree's HEAD is not that arm's commit, or when
    the tree has tracked changes. The 0.4.11 confirmation run's `RUN.md` named the wrong baseline
    and left the candidate unpinned.
  - `srcHead` is now read before the scanner is imported. Scoring is unchanged.
- **`compare.mjs`**
  - The scratch root defaults to `~/tmp/cejel-433-delta`.
  - `PUBLISHER_OWNED` is derived from the corpus (private visibility, plus `cejel`) rather than
    listing the private row by name. The set is the same.
  - A private-visibility row is emitted as `private-row` in `delta.json`, `delta.md` and the
    console. The private row's name is not to appear in this public repository, and these
    outputs are committed.
  - Comparison, placement and board-check logic are unchanged.
- **`compare-bytes.mjs`**: rewritten for this run's expected value 5. The 0.4.11 version tested
  0.4.11's E4: that `withheldPaths` was the only difference between the arms. That claim does not
  apply to #433. This version removes each predicted difference only in its predicted direction,
  then reports what remains, as top-level keys and criterion ids only, never values or paths. It
  exports `comparePair` so the normalisation can be exercised on synthetic reports. The CLI
  behaviour runs only when the file is executed directly.
