# Result — 0.6.8: v17 scoring unchanged on the public corpus; v27 never higher than v17 on full history

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Preregistration:** `581f2dc8c6c60faabd1d15d3a934b9c3ce9c4dac`, a strict ancestor of this
  result. `plan.json`, `PREREGISTRATION.md`, `norise.mjs` and `norise.node-test.mjs` are unchanged
  since that commit.
- **Runs:** in the preregistering session, on 2026-10-21, once each, per
  `docs/experiments/public-delta-harness/RUN.md`.
  - Source checkouts: detached at `c5d05c7e6` (v0.6.7) and `224f605ae` (the candidate).
  - Targets: full-history clones of the 23 public rows, made from `leaderboard/corpus.json` (`url`
    and `commit` only), none shallow, copied into a fresh scratch root outside every checkout.
- **Records:** `paired-result.json` is as the harness wrote it, unedited (sha256 `7cb86912…6e1ae`).
  Raw reports stay local.

## Summary

All three expected values held.
- **Under v17**, no public score, status, metric value, finding count, placement or fingerprint
  moves between v0.6.7 and the release candidate. 17 of the 23 reports differ in presentation
  only.
- **Under v27**, on the board's full-history method, no composite and no criterion score is higher
  than under v17. **v27 abstains neither A2 nor B2 on any row.** The depth-1 tables of 2026-10-19
  (B2 on 22 rows, A2 on 8) measured clone depth, as their 2026-10-21 correction says.

| | Expected | Measured | |
|---|---|---|---|
| E0 | 23/23 complete per run, zero errors; targets unchanged; source at the run commit; existing output refused | 23/23 and 0 errors in all three runs. Every manifest row has the same commit and commit count across runs. Each manifest's `sourceHead` equals its run commit. The overwrite was refused in all three runs | held |
| E1 | `release-v17`: `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0, no unexpected criterion, no undeclared field change | `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0, `unexpectedCriteria` empty, `undeclaredFieldChanges` empty. `identicalReports` 6 (byte counts were not forecast) | held |
| E2 | `v27-shadow`, by `norise.mjs`: no composite or criterion higher under v27; nothing scored under v27 that v17 left null or absent | `norise.mjs`: "23 rows, 0 with a rise; insufficient_data under v27: A2 0, B2 0" (exit 0) | held |

## Notes

- **Overwrite check.** As in the 0.6.6 and 0.6.7 runs, the refusal check printed two matching lines
  per run: Node's echo of the throwing source line, which contains the message, and the `Error:`
  line. That is one refusal each.
- **E1, what differs.** For all 17 differing rows, the only changed top-level field is `criteria`,
  and inside it only text the scoring projection excludes. The rows are react, vue, svelte, flask,
  fastapi, vite, esbuild, biomejs, requests, pydantic, axios, zod, ripgrep, guava, sinatra,
  automapper and cejel. Read from the raw reports locally (only these facts are recorded):
  - B2's evidence labels differ on 16 rows (#540's trigger labels);
  - A4's evidence differs on flask, zod and biomejs, and A4's finding text (with the same counts) on
    flask and zod (#521, #533, #548);
  - no other criterion differs, and no row gains an A2 or B3 disclosure.

  `contentReadSummary` did not change on any row, so no public row holds an LFS pointer.
- **E2, what moved.** Six rows move under v27. Only one criterion score moves, down. No composite,
  verdict or placement moves.

| Row | Criterion | v17 → v27 |
|---|---|---|
| requests | A1 | verified 2.5 → verified 2.4; `test_to_source_ratio` 15 → 14 |
| flask | A1 | score unchanged (2.3); `non_hollow_test_share` 28 → 27, `test_to_source_ratio` 59 → 56 |
| pydantic | A1 | score unchanged (2.8); `non_hollow_test_share` 213 → 212, `test_to_source_ratio` 292 → 290 |
| fastapi | A1 | score unchanged (2.3); `test_to_source_ratio` 604 → 603 |
| svelte | B3 | score unchanged (4); `default_branch_ci_depth` 5 → 4 |
| biomejs | B3 | score unchanged (3.6); `default_branch_ci_depth` 13 → 12 |

  These match v27's two scoring rules that can fire on these rows: `conftest.py` is not a test
  file (A1), and a publish-only workflow is not CI depth (B3). Attribution by rule was not checked
  against the raw reports and is not claimed here.

## What this does not show

- **E1** shows that the release's v17 changes move no public score, status, metric, finding count,
  placement or fingerprint. It does not show that the new sentences (B2 labels, A4 notes, A2/B3
  disclosures) are true on these rows.
- **E2** is a no-rise check of v27 against v17 on 23 public repositories at one candidate. It is
  not the one-release shadow board that condition 5 of the #526 ruling requires. It is not
  evidence that any v27 move is right, and it makes no claim about repositories outside this
  corpus.
- **No precision or recall claim.** v27 stays prospective and opt-in, the public default stays
  v17, and no calibration claim follows.
- **Conflict of interest.** The preregistering and running session also wrote several of the
  measured changes. The forecasts were fixed at `581f2dc8c` before any run, and every value above
  is as the harness and `norise.mjs` printed it.

## Erratum (2026-10-21, after review of #552)

The text above is left as written. These corrections were found by the second review pass on #552.

- **"v27 abstains neither A2 nor B2 on any row" is wrong.** `norise.mjs` counts an A2 or B2
  abstention only when that criterion appears among the moved criteria. It therefore counts
  abstentions that v27 **adds**, not abstentions that exist. The preregistration and `norise.mjs`'s
  header describe its output as "the A2 and B2 `insufficient_data` counts under v27". That
  describes a different quantity, and `norise.mjs` is unchanged here.
  - Read from the raw reports locally: B2 is `insufficient_data` on **carddemo under both v17 and
    v27**, a row with no ratable source under either. A2 is `insufficient_data` on no row under
    either rubric.
  - The correct statement: **v27 added no A2 or B2 abstention on any row.** The depth-1 tables of
    2026-10-19 showed 8 A2 and 22 B2 abstentions added.
- **E2 covers less than part 2 of the #526 rule.** `norise.mjs` checks scores and composites only,
  not statuses, finding counts or verdicts. Read from `paired-result.json`, none of these changed
  on any row: no moved criterion changed status or finding counts, and no verdict changed. This
  record still should not be cited for part 2 beyond that.
- **Rows that differ.** The preregistration said the number of rows that differ would be recorded,
  and the text above gives only the six scoring moves. Under v27, 8 rows differ beyond the declared
  presentation fields (`identicalAfterPresentationRemoval` 15): the six above, plus ripgrep and
  cejel, which differ only in B3's notes.
- **E0's commit counts** come from the local run manifests, not from `paired-result.json`.
- **Run times.** The arms ran in this session between the preregistration push (18:02 UTC) and the
  result push (18:06 UTC), from full-history clones made earlier in the session. No other run of
  this plan exists.

