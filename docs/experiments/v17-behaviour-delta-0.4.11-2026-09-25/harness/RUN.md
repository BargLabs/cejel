# Reproducing the v0.4.10 → 0.4.11 v17 delta

Everything below was run on one macOS host on 2026-09-25. `DELTA_ROOT` is a scratch directory
outside the repository; nothing under it is committed except what `compare.mjs` writes to
`paired-result.json`.

```
export DELTA_ROOT=~/tmp/cejel-049-delta
mkdir -p "$DELTA_ROOT"
cp leaderboard/corpus.json "$DELTA_ROOT/corpus.json"      # sha256 dc723f53…
bash docs/experiments/v17-behaviour-delta-0.4.9-2026-09-25/harness/prepare-checkouts.sh
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
git worktree add --detach .worktrees/rescore-base-v0.4.10 v0.4.10      # 7606392
git worktree add --detach .worktrees/rescore-cand-0411 origin/main           # candidate: main + both
( cd .worktrees/combined-049 \
  && git merge --no-gpg-sign --no-edit origin/stream/yellow/20260915-141422-goal_cejel_a3_runtime_pattern_coverage_0 \
  && git merge --no-gpg-sign --no-edit origin/stream/yellow/20260915-141447-goal_cejel_certificate_scope_disclosure_ )
( cd .worktrees/rescore-base-v0.4.8 && pnpm install --frozen-lockfile )
( cd .worktrees/combined-049 && pnpm install --frozen-lockfile )
```

Score each arm **from inside its worktree** (the scanner is resolved from the working
directory, or from `CEJEL_SRC`; the first output line names the scanner path, its git HEAD and
package version before any number):

```
H=$PWD/docs/experiments/v17-behaviour-delta-0.4.9-2026-09-25/harness
( cd .worktrees/rescore-base-v0.4.8    && ARM=base pnpm exec tsx "$H/score-arm.ts" )
( cd .worktrees/combined-049          && ARM=combined pnpm exec tsx "$H/score-arm.ts" )
LEFT_ARM=base RIGHT_ARM=combined node "$H/compare.mjs"   # writes $DELTA_ROOT/delta.json, delta.md
```

`compare.mjs` compares the two arms at scoring level (headline, per-criterion score/status,
per-metric value; symmetric, so a criterion or metric present on only one side is reported) and
checks the base arm against the published board reports at
`~/projects/cejel-site/leaderboard/reports/<name>.json` at the same level. `LEFT_ARM`/`RIGHT_ARM` name the directories under `out/` and default to `base`/`cand`. Expected
output for the committed record: `24/24` rows, `20` byte-identical, `4` rows with a moved metric
(`B3.ci_script_depth`: django, vite, alfred; `A3.observability_depth`: react, alfred), one moved
headline (django), board check `20/24 reproduce` with fastapi, biomejs, fmt and alfred
differing.

Verification that the committed harness runs from its committed location: on 2026-09-25 the
candidate arm was re-scored from this path into a fresh `DELTA_ROOT` and all 24 reports were
identical to the originals (`toolVersion` masked, since the version bump commit sits between
the two runs).

Verification for the combined record: on 2026-09-25 `compare.mjs` was run from this committed
path against `out/base` and `out/combined` and its `delta.json` was byte-identical to the
committed `paired-result.json`.

## Release-tree correction — 2026-09-16

The `20` byte-identical count above describes the historical pre-fingerprint candidate,
not the shipped 0.4.9 tree. The final result in `../paired-result.json` and
`leaderboard/RUBRIC_CHANGELOG.md` records zero byte-identical reports: all 24 carry
`rubricBehaviourFingerprint` and report format 1.2. The four rows with metric changes
and the single headline change are unchanged. Reproducing the historical combined arm
above does not reproduce the release artifact. For the release, execute the published
`@cejel/cejel@0.4.9` entry point at the same corpus pins; do not edit either preregistration.
