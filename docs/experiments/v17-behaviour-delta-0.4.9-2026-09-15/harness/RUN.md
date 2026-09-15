# Reproducing the v0.4.8 → 0.4.9 v17 delta

Everything below was run on one macOS host on 2026-09-15. `DELTA_ROOT` is a scratch directory
outside the repository; nothing under it is committed except what `compare.mjs` writes to
`paired-result.json`.

```
export DELTA_ROOT=~/tmp/cejel-049-delta
mkdir -p "$DELTA_ROOT"
cp leaderboard/corpus.json "$DELTA_ROOT/corpus.json"      # sha256 dc723f53…
bash docs/experiments/v17-behaviour-delta-0.4.9-2026-09-15/harness/prepare-checkouts.sh
```

`prepare-checkouts.sh` fetches each public row with `--depth=1` at its pinned commit and
asserts `git rev-parse HEAD` equals the pin; the private row is a `--local --no-checkout` clone
of the operator's alfred checkout at the commit the published board pins (`95e05c33`), which
must exist at `~/projects/alfred`. **Shallow clones:** both arms score the same depth-1
checkouts, so the base→candidate delta is unaffected; history-dependent signals (A2's
recent-history secret scan, B4's commit-year freshness) see one commit of history in both arms,
which is the same shape the v19 protocol used and may differ from a full-history scan.

Two source worktrees, one per arm:

```
git worktree add --detach .worktrees/rescore-base-v0.4.8 v0.4.8      # 7606392
git worktree add --detach .worktrees/rescore-cand-fe4210a fe4210a   # candidate
( cd .worktrees/rescore-base-v0.4.8 && pnpm install --frozen-lockfile )
( cd .worktrees/rescore-cand-fe4210a && pnpm install --frozen-lockfile )
```

Score each arm **from inside its worktree** (the scanner is resolved from the working
directory, or from `CEJEL_SRC`; the first output line names the scanner path, its git HEAD and
package version before any number):

```
H=$PWD/docs/experiments/v17-behaviour-delta-0.4.9-2026-09-15/harness
( cd .worktrees/rescore-base-v0.4.8    && ARM=base pnpm exec tsx "$H/score-arm.ts" )
( cd .worktrees/rescore-cand-fe4210a   && ARM=cand pnpm exec tsx "$H/score-arm.ts" )
node "$H/compare.mjs"       # writes $DELTA_ROOT/delta.json and delta.md
```

`compare.mjs` compares the two arms at scoring level (headline, per-criterion score/status,
per-metric value; symmetric, so a criterion or metric present on only one side is reported) and
checks the base arm against the published board reports at
`~/projects/cejel-site/leaderboard/reports/<name>.json` at the same level. Expected output for
the committed record: `24/24` rows, `21` byte-identical, `3` rows with a moved metric
(`B3.ci_script_depth`: django, vite, alfred), board check `20/24 reproduce` with fastapi,
biomejs, fmt and alfred differing.

Verification that the committed harness runs from its committed location: on 2026-09-15 the
candidate arm was re-scored from this path into a fresh `DELTA_ROOT` and all 24 reports were
identical to the originals (`toolVersion` masked, since the version bump commit sits between
the two runs).
