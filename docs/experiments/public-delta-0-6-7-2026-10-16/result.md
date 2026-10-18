# Result — 0.6.7: the output-symlink fix and v26 item 8 leave every public report unchanged

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Preregistration:** `2b767b56f5c48b3c2a99b2ac00e75efd602cb91e` (#510), a strict ancestor of
  this result. `plan.json`, `PREREGISTRATION.md`, `confinement.mjs` and
  `confinement.node-test.mjs` are unchanged since that commit.
- **Runs:** on the operator's host, once each, per the 0.6.5 run sheet applied to this plan.
- **Records:** `paired-result.json` and `byte-identity.json` are as the harness wrote them,
  unedited. Raw reports stay local.

## Summary

All four expected values held. Under v17 and under v26, every one of the 23 public reports is
byte-identical between v0.6.6 (`6aec9d93`) and the fix commit (`f5348fb3`).

**v26 item 8 was not exercised by this corpus.** No public row carries A3's build finding at
v0.6.6 under v26, so item 8 had nothing to narrow. This run therefore shows only that item 8 moves
nothing on these 23 rows. It is not evidence about where the finding stops.

| | Expected | Measured | |
|---|---|---|---|
| E0 | 23/23 complete per run, zero errors; targets unchanged; source at the run commit; existing output refused | 23/23 and 0 errors in all four runs; `targetIdentityIdenticalAcrossRuns: true`; each manifest's `sourceHead` equals its run commit; the overwrite was refused in all four runs | held |
| E1 | `fixes-v17`: 23 byte-identical reports, no scoring, placement or fingerprint move, no unexpected criterion or undeclared field change | `identicalReports` 23, `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0, `unexpectedCriteria` empty, `undeclaredFieldChanges` empty | held |
| E2 | `item8-v26`: scores, verdict, coverage, comparable score and placement unchanged on 23/23; no fingerprint change; no unexpected criterion or undeclared field change; count of differing rows not forecast | `identicalReports` 23, so every field is unchanged; `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0, `unexpectedCriteria` empty, `undeclaredFieldChanges` empty | held |
| E3 | `item8-v26`: every differing row differs only in A3 findings and notes, of the named kinds | `confinement.mjs`: 23 rows, 0 differ, 0 outside E3 | held, with nothing to confine |

## Why item 8 had nothing to act on

The operator counted A3's build finding ("A deployable service package manifest declares neither a
build nor a typecheck script.") in the raw reports, locally:

| Run | Rubric | Rows | With the build finding | With A3 notes |
|---|---|---|---|---|
| `v066-v17` | v17 | 23 | 0 | 17 |
| `v066-v26` | v26 | 23 | 0 | 17 |
| `fix-v26` | v26 | 23 | 0 | 17 |

Item 8 only narrows when that finding fires, so with no row carrying it there was nothing for item
8 to change. The 17 rows with A3 notes carry notes that predate item 8, under v17 as well as v26.
They are byte-identical across the pair, so none of them carries the item-8 disclosure. v17 never
emits the build finding; the zero in its row is the expected baseline, not a measurement of item 8.

## Notes

- **Overwrite check.** As in the 0.6.5 and 0.6.6 runs, the refusal check printed two matching lines
  per run: Node's echo of the throwing source line, which contains the message, and the `Error:`
  line. That is one refusal each.
- **What the identity covers.**
  - #508 changes only where the CLI writes its output, which this harness does not use. Its tests
    are in #508.
  - #509 is v26-only. Byte identity under v26 here follows from the absence above, not from item
    8's logic. Item 8's evidence remains its own tests in #509, the reviewer's byte-identical
    equivalence check of its Dockerfile parsing, and the v26 dev-set check still to come.

## What this does not show

- It does not show whether item 8 stops the finding where it should, on any repository.
- It makes no precision or recall claim, on this corpus or any other.
- v26 remains prospective and explicit opt-in; the public default stays v17.
