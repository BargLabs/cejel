# Result — 0.6.8 successor confirmation: v17 scoring unchanged; v27 never higher than v17 on full history

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Preregistration:** `437ad684a854e25181fd7cd5a871fd87e5dd2a7a`, a strict ancestor of this
  result. `plan.json`, `PREREGISTRATION.md`, `norise.mjs` and `norise.node-test.mjs` are unchanged
  since that commit.
- **Runs:** in the preregistering session, on 2026-10-21, after the preregistration push. The arms
  finished at 20:14 UTC, once each, in a fresh scratch root.
  - Source checkouts: detached at `c5d05c7e6` (v0.6.7) and `4016f659e` (the candidate).
  - Targets: the same full-history clones as the original confirmation, none shallow.
- **Records:** `paired-result.json` is as the harness wrote it, unedited (sha256 `f766d907…82909`).
  Raw reports stay local.
- **Wording note (after review of #552).** The forecasts E0-E2 are carried over verbatim, and
  `plan.json`'s `expected` is the original's word for word. In `PREREGISTRATION.md`, two
  *unforecast* bullets were reworded:
  - E1's "B2 labels and A4 notes are expected to differ on some rows" was dropped;
  - E2's recorded quantity reads "the A2 and B2 abstentions v27 adds" instead of "the A2 and B2
    `insufficient_data` counts under v27".

  So "word for word" there holds for the forecasts, not for every line. This result reports both
  the states and the additions.
- **The original lesson applied.** Abstention counts below are read from the raw reports as
  states. `norise.mjs`'s count is what v27 *adds* (see the original's erratum).

## Summary

All three expected values held.

| | Expected | Measured | |
|---|---|---|---|
| E0 | 23/23 complete per run, zero errors; targets unchanged; source at the run commit; existing output refused | 23/23 and 0 errors in all three runs. Every manifest row has the same commit and commit count across runs (from the local manifests). Each `sourceHead` equals its run commit. The overwrite was refused in all three runs (two matching lines each, as before) | held |
| E1 | `release-v17`: `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0, no unexpected criterion, no undeclared field change | `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0, `unexpectedCriteria` empty, `undeclaredFieldChanges` empty. `identicalReports` 0: every report's `toolVersion` reads 0.6.8 against 0.6.7, as declared | held |
| E2 | `v27-shadow`, by `norise.mjs`: no composite or criterion higher under v27; nothing scored under v27 that v17 left null or absent | `norise.mjs`: "23 rows, 0 with a rise; insufficient_data under v27: A2 0, B2 0" (abstentions added: none), exit 0 | held |

## Notes

- **E1, what differs beyond `toolVersion`.** Read from the raw reports locally; only these facts
  are recorded:
  - B2's evidence labels differ on 16 rows: react, vue, svelte, flask, fastapi, vite, esbuild,
    requests, pydantic, axios, zod, ripgrep, guava, sinatra, automapper and cejel.
  - A4's evidence differs on flask, zod and biomejs, and A4's finding text (with the same counts)
    on flask and zod.
  - No other criterion and no other top-level field differs. No row gains an A2 or B3 disclosure,
    and `contentReadSummary` is unchanged everywhere, so no public row holds an LFS pointer in
    either line-ending form.
  - This matches the original confirmation. #553's A4 command change does not reach any public
    row's quoted command.
- **Abstentions, as states.** Under both v17 and v27, B2 is `insufficient_data` on carddemo only, a
  row with no ratable source. A2 is `insufficient_data` on no row. v27 added none.
- **E2, what moved.** Four rows move under v27, all in A1. Only one score moves, down. No status,
  finding count, composite, verdict or placement changes. 19 of 23 rows are identical beyond the
  declared presentation fields.

  | Row | Criterion | v17 → v27 |
  |---|---|---|
  | requests | A1 | verified 2.5 → verified 2.4; `test_to_source_ratio` 15 → 14 |
  | flask | A1 | score unchanged (2.3); `non_hollow_test_share` 28 → 27, `test_to_source_ratio` 59 → 56 |
  | pydantic | A1 | score unchanged (2.8); `non_hollow_test_share` 213 → 212, `test_to_source_ratio` 292 → 290 |
  | fastapi | A1 | score unchanged (2.3); `test_to_source_ratio` 604 → 603 |

  The original confirmation also moved svelte and biomejs, in B3 `default_branch_ci_depth`, and gave
  ripgrep and cejel different B3 notes. None of those differ here, which fits #553's narrowed
  publish-only rule. The A1 moves fit "`conftest.py` is not a test file". Attribution by rule was
  not checked against the raw reports and is not claimed.

## What this does not show

- **E1** does not show that the new sentences are true on these rows.
- **E2** is a no-rise check of scores and composites on 23 public repositories at one candidate. It
  is not the #526 ruling's one-release shadow board, not evidence that any v27 move is right, and
  not a check of statuses beyond the facts recorded above.
- **No precision or recall claim.** v27 stays prospective and opt-in, the public default stays v17,
  and no calibration claim follows.
- **Conflict of interest.** The preregistering and running session also wrote or coordinated the
  measured changes, and it knew the original confirmation's outcomes. The forecasts were carried
  over unchanged at `437ad684a`, before any successor run.
