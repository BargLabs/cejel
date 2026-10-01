# v0.4.8 → 0.4.9 candidate: v17 behaviour delta over the pinned corpus

Human rendering of `paired-result.json`. The public entry is
`leaderboard/RUBRIC_CHANGELOG.md` § "0.4.9 — behaviour change under witan-rubric-v17-2026-07-24".

- Baseline arm: cejel source at `7606392` (the `v0.4.8` commit), `package.json` 0.4.8.
- Candidate arm: cejel source at `9df6f31`, the tree this release tags.
- Rubric: `witan-rubric-v17-2026-07-24` (calibrated public default) in both arms.
- `generatedAt` fixed at `2026-09-15T00:00:00.000Z` in both arms.
- Corpus: `leaderboard/corpus.json`, sha256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`
  (byte-identical to the corpus the v19 protocol froze). 24 rows, each checked out at its pinned
  commit and verified with `git rev-parse HEAD` before scoring; the private row from a local
  clone at the commit the published board pins (`95e05c33`).
- Both arms scored on one macOS host within one hour, from source via `pnpm exec tsx`
  (`harness/score-arm.ts`), compared by `harness/compare.mjs`. Exact invocation: `harness/RUN.md`.
- Public rows fetched `--depth=1`; both arms see the same one-commit history (see RUN.md).
- Preregistered twice: `PREREGISTRATION.md` (`0f80959`) for the first candidate tree, and
  `PREREGISTRATION-2.md` (`680b9d3`) for this one after both PRs took review-fix commits. Each was
  committed before its `compare.mjs` run, naming
  both arms, all five score-capable changes and the exact metric values expected. The measured
  and each result matched its prediction in full. The second run is byte-identical to the first
  on all 24 rows once `toolVersion` is excluded, so no figure below changed. Guard 5 satisfied:
  both preregistration commits are strict ancestors of this result commit.
- Cross-check: the published `@cejel/cejel@0.4.8` npm artifact, run on a Linux container
  against django at its pinned commit, reproduced the baseline arm exactly (overall 3.2, code
  2.6, process 3.8, B3 3.6, `ci_script_depth` 3).

## Result

24/24 rows completed in both arms. 0 reports byte-identical (report format 1.1 to 1.2 adds
`rubricBehaviourFingerprint` to all 24; not a scoring difference — see the rubric entry). 4 rows moved, exactly the 4
predicted, on exactly the 2 predicted metrics.

`B3.ci_script_depth`, all down: django 3 → 2 (B3 3.6 → 3.1, process 3.8 → 3.6, overall
3.2 → 3.1), vite 5 → 4 (no score change), alfred 5 → 4 (no score change).

`A3.observability_depth`, both up, neither crossing a score band: react 68 → 108 (A3 stays
2.3/warning), alfred 64 → 73 (A3 stays 3.6/verified).

No verdict, no placement, no coverage figure, no other criterion or metric moved. The v17
scoring-surface golden guard stays 4/4 green on the candidate, and the two guards shipped with
the A3 changes pass on it (20 assertions across the three files).

## Baseline vs the published board

Compared at scoring level (headline, per-criterion score/status, per-metric value): 20 of 24
rows reproduce the board. Four predate 0.4.8: fastapi A4 `lockfile_coverage` 1 → abstained,
A4 3.6 → 3.4, overall 3.1 → 3.0, code trust 3.0 → 2.8; biomejs B4 `audit_artifact_depth`
16 → 15, `audit_freshness_depth` 2 → 1; fmt A1 `non_hollow_test_share` 29 → 28,
`test_to_source_ratio` 55 → 54; alfred A3 `rollback_safety_depth` 806 → 753. See
`paired-result.json` → `boardCheck`. (The first version of this check compared whole objects
and reported DIFFERS on all 24 rows because 0.4.8 added a `derivation` field to findings; it
was rewritten after review and now reproduces exactly the four rows found by hand.)

## Not committed

Raw per-row reports (`out/base/*.json`, `out/combined/*.json`) stay on the measuring host. The
private row's report is not public; the public rows' reports are reproducible from the harness.

## Erratum, 2026-09-26: which result commit the ancestry holds for

The Guard 5 sentence above reads: "both preregistration commits are strict ancestors of this
result commit." It was true of the commit it was written in, `1bc56cd`. It is not true of any
commit on `main`. The release PR (#306) was squash-merged, so `main` carries this record in
`2af3407` (later edited in `8c4ea37` and `cd75fc4`), and neither `0f80959` nor `680b9d3` is an
ancestor of those. #310 repaired the same defect for the candidate-arm commits this file cites and
left these two, which are the ones Guard 5 rests on.

The ancestry is intact on the pre-squash history: `0f80959` is a strict ancestor of `2242959`
(the first run) and `680b9d3` of `1bc56cd` (the re-run this file reports). From 2026-09-15 to
2026-09-20 that history existed only in a local worktree. It was pushed as a rescue branch on
2026-09-20 and is now pinned by the signed tag `evidence/v17-delta-0.4.9-preregistrations`
(target `1bc56cd`). To check:

```
git fetch origin tag evidence/v17-delta-0.4.9-preregistrations
git merge-base --is-ancestor 0f80959 2242959 && git merge-base --is-ancestor 680b9d3 1bc56cd && echo "ancestry holds"
```

No figure in this record changes. The sentence above is left as written.
