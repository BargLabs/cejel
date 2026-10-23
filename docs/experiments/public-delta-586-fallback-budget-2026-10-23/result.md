# Result — #586 re-read time budget: no public row changed; every expected value held

**CONSTRAINTS-VERSION: 2026-08-01.5**

Run on 2026-10-23, between 22:53 and 22:56 UTC, by an AI agent (Claude Opus 5.5, Claude Code), after the preregistration was pushed.
- **Preregistration:** `PREREGISTRATION.md` at `fa4fc0a7b2bdfaaba0ef76530aff440417187d62`, a strict ancestor of this result.
- **Baseline:** `d175e210a41081bd41420b8109b9535540f6e01c`.
- **Candidate:** `62924091ca05fdf90b4fa2b54928132aa5c3867a`.
- **Harness:** v2, unchanged. Its self-test passed 27 of 27, and `norise.node-test.mjs` passed 10 of 10, before scoring.
- **`paired-result.json`:** copied unchanged from the scratch root. Its `planSha256` begins `9de7b2c5e16e`, the sha256 of this directory's `plan.json`. Raw reports stay local.

## Expected values

| | Expected | Observed | |
|---|---|---|---|
| E0 | 23 of 23 rows in each of the four runs, zero errors; target identity unchanged; each source checkout at its run's commit; an existing run output refused | 23 of 23 in each run, 0 errors. `compare.mjs` checked that each manifest binds its run, commit, rubric, plan digest and prereg commit. Both source checkouts were clean after the runs. The 23 target clones were fresh APFS copies of the verified board clones; after the runs they were clean and not shallow. A second `base-v17` invocation was refused with "run output already exists; never overwrite a run" | held |
| E1, `budget-v17` | scoringRowsMoved 0, placementsMoved 0, fingerprintsChanged 0, unexpectedCriteria empty, undeclaredFieldChanges empty, all 23 reports byte-identical | scoringRowsMoved 0, placementsMoved 0, fingerprintsChanged 0, unexpectedCriteria [], undeclaredFieldChanges [], identicalReports 23 | held |
| E2, `budget-v27` | as E1 | scoringRowsMoved 0, placementsMoved 0, fingerprintsChanged 0, unexpectedCriteria [], undeclaredFieldChanges [], identicalReports 23 | held |
| E3, `v27-shadow` | no row has a composite or criterion score higher under v27 than v17; nothing scored under v27 that v17 left null or absent | `norise.mjs`: "v27-shadow: 23 rows, 0 with a rise; insufficient_data under v27: A2 0, B2 0" | held |

**biomejs and react, the two rows that take the re-read,** have byte-identical reports in each pair, before and after (checked with `cmp` on the raw reports as well). Neither reached the budget.

**Recorded, not forecast:** `v27-shadow` has 4 scoring rows and 0 placement moves.
- flask, fastapi and pydantic move in A1 metrics at the same score.
- requests' A1 goes from 2.5 to 2.4.

These are the same four movers recorded in #572's experiments, which predate #567 (see #588's erratum). v27 adds no A2 or B2 abstention.

## What this does not show

It shows that the budget leaves the 23 public rows unchanged on the measured host. It does not exercise the budget itself; `src/witan/__tests__/a2-history-fallback-budget-586.test.ts` does that, with a test clock. It makes no precision, recall or calibration claim, and v27 stays prospective and opt-in.
