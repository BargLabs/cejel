# v0.4.8 → 0.4.9 candidate: v17 behaviour delta over the pinned corpus

Human rendering of `paired-result.json`. The public entry is
`leaderboard/RUBRIC_CHANGELOG.md` § "0.4.9 — behaviour change under witan-rubric-v17-2026-07-24".

- Baseline arm: cejel source at `7606392` (the `v0.4.8` commit), `package.json` 0.4.8.
- Candidate arm: cejel source at `fe4210a` (`origin/main` on 2026-09-15, the 0.4.9 candidate).
- Rubric: `witan-rubric-v17-2026-07-24` (calibrated public default) in both arms.
- `generatedAt` fixed at `2026-09-15T00:00:00.000Z` in both arms.
- Corpus: `leaderboard/corpus.json`, sha256 `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`
  (byte-identical to the corpus the v19 protocol froze). 24 rows, each checked out at its pinned
  commit and verified with `git rev-parse HEAD` before scoring; the private row from a local
  clone at the commit the published board pins (`95e05c33`).
- Both arms scored on one macOS host within one hour, from source via `pnpm exec tsx`
  (`harness/score-arm.ts`), compared by `harness/compare.mjs`. Exact invocation: `harness/RUN.md`.
- Public rows fetched `--depth=1`; both arms see the same one-commit history (see RUN.md).
- Not preregistered: measured post hoc in one session; the expected-value paragraph in the
  rubric entry was written from the checkouts before the comparison ran but is not a separate
  ancestor commit, so that ordering is not git-verifiable.
- Cross-check: the published `@cejel/cejel@0.4.8` npm artifact, run on a Linux container
  against django at its pinned commit, reproduced the baseline arm exactly (overall 3.2, code
  2.6, process 3.8, B3 3.6, `ci_script_depth` 3).

## Result

24/24 rows completed in both arms. 21 reports byte-identical. 3 rows moved, all on
`B3.ci_script_depth`, all down: django 3 → 2 (B3 3.6 → 3.1, process 3.8 → 3.6, overall
3.2 → 3.1), vite 5 → 4 (no score change), alfred 5 → 4 (no score change). No verdict, no
placement, no other criterion or metric moved.

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

Raw per-row reports (`out/base/*.json`, `out/cand/*.json`) stay on the measuring host. The
private row's report is not public; the public rows' reports are reproducible from the harness.
