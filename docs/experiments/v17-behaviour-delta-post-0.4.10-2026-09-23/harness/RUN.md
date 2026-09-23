# Reproducing the v0.4.10 → main v17 delta

Run on one macOS host on 2026-09-23. `DELTA_ROOT` is a scratch directory outside the repository.
Nothing under it is committed. `compare.mjs` writes `delta.json`/`delta.md` there, and
`compare-bytes.mjs` writes `bytes.json`. The committed `../paired-result.json` and
`../bytes-result.json` are copies of those outputs.

```
export DELTA_ROOT=~/tmp/cejel-0411-delta
mkdir -p "$DELTA_ROOT"
cp leaderboard/corpus.json "$DELTA_ROOT/corpus.json"      # sha256 dc723f53…
```

**Checkouts.** `$DELTA_ROOT/checkouts/<name>` holds one checkout per corpus row, at its pinned
commit. For this run they were APFS clones (`cp -cR`) of the checkouts produced by
`../../v17-behaviour-delta-0.4.9-2026-09-15/harness/prepare-checkouts.sh`: public rows fetched
`--depth=1` at the pin, and the private row cloned locally from the operator's alfred checkout at
`95e05c33`. Before scoring, every checkout was verified to be clean
(`git status --porcelain` empty) with `git rev-parse HEAD` equal to its pin. Note that
`prepare-checkouts.sh` itself skips that verification for a directory that already exists, so
run it on an empty root, or re-verify afterwards as this run did.

**Two source worktrees, one per arm.** Both lockfiles are identical.

```
git worktree add --detach ../cejel-wt-base v0.4.10     # d2a8018
git worktree add --detach ../cejel-wt-cand 5ae73b2     # candidate: main after #358 and #321
( cd ../cejel-wt-base && pnpm install --frozen-lockfile )
( cd ../cejel-wt-cand && pnpm install --frozen-lockfile )
```

**Score each arm from inside its worktree.** The scanner is resolved from the working directory,
and the first output line names the scanner path, its git HEAD and the package version:

```
H=$PWD/docs/experiments/v17-behaviour-delta-post-0.4.10-2026-09-23/harness
( cd ../cejel-wt-base && ARM=base pnpm exec tsx "$H/score-arm.ts" )
( cd ../cejel-wt-cand && ARM=cand pnpm exec tsx "$H/score-arm.ts" )
LEFT_ARM=base RIGHT_ARM=cand node "$H/compare.mjs"
LEFT_ARM=base RIGHT_ARM=cand node "$H/compare-bytes.mjs"
```

`compare.mjs` is the 0.4.9 harness file, changed in one line so that it reads `DELTA_ROOT`. It
compares the arms at scoring level (headline, per-criterion score and status, per-metric value)
and checks the base arm against the published board reports in
`~/projects/cejel-site/leaderboard/reports/`. `compare-bytes.mjs` is new for this run. It tests
expected value E4: whether `withheldPaths` is the only difference between the arms.

**Expected output for the committed record.** `compare.mjs`: 24 of 24 rows, 0 errors, 0 reports
byte-identical, 0 criteria, metrics or headlines moved, and board check `24/24 rows reproduce the
published board at scoring level`. `compare-bytes.mjs`:
`{"rows":24,"byteIdentical":0,"rightWithNonEmptyWithheldPaths":17,"identicalWithoutWithheldPaths":24,"fingerprintEqual":24}`,
with no `DIFF` lines. Both outputs were copied unchanged to `../paired-result.json` and
`../bytes-result.json`.
