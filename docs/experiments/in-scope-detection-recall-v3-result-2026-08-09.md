# In-scope native detection-recall experiment v3 — result (2026-08-09)

Status: **CLAIM_BEARING on the fixed fixture set**

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Disposition

The one run authorized by
`in-scope-detection-recall-v3-preregistration-2026-08-09.md` completed without a retry. All six
out-of-denominator positive controls cited their exact named defect paths, so the precommitted gate
opened. All 60 evaluation entries then completed with no control, evaluation, or instrument error.

The primary held-out result is **16/30**. Its two-sided 95% Wilson interval is
**[36.14%, 69.77%]** (unrounded `[0.36142299619873297, 0.6976761109230025]`). The descriptive
full-cohort result is **32/60**.

The only licensed claim-bearing statement is:

> On this fixed, isolated, in-scope held-out fixture set, Cejel v0.4.0 using its explicit public
> default v17 rubric cited 16 of 30 named defect files; the two-sided 95% Wilson interval for that
> fixture-set proportion is [36.14%, 69.77%].

## Positive-control gate

| Control | Criterion | Outcome |
|---|---|---|
| `PC-A1` | A1 | caught |
| `PC-A2` | A2 | caught |
| `PC-A3` | A3 | caught |
| `PC-A4` | A4 | caught |
| `PC-A5` | A5 | caught |
| `PC-B6` | B6 | caught |

The superseded v2 `positiveControls` value was not decoded, materialized, scanned, or used. The
v3 controls remained outside every recall denominator.

## Frozen summaries

| Criterion | Held-out cited |
|---|---|
| A1 | 4/5 |
| A2 | 2/5 |
| A3 | 0/5 |
| A4 | 5/5 |
| A5 | 5/5 |
| B6 | 0/5 |

These per-criterion counts are descriptive. They have no per-class pass/fail threshold.

## Redacted per-seed outcomes

| Seed | Criterion | Partition | Outcome |
|---|---|---|---|
| A1-01 | A1 | calibration | caught |
| A1-02 | A1 | calibration | caught |
| A1-03 | A1 | calibration | caught |
| A1-04 | A1 | calibration | missed |
| A1-05 | A1 | calibration | caught |
| A1-06 | A1 | held-out | caught |
| A1-07 | A1 | held-out | caught |
| A1-08 | A1 | held-out | caught |
| A1-09 | A1 | held-out | missed |
| A1-10 | A1 | held-out | caught |
| A2-01 | A2 | calibration | missed |
| A2-02 | A2 | calibration | caught |
| A2-03 | A2 | calibration | missed |
| A2-04 | A2 | calibration | caught |
| A2-05 | A2 | calibration | missed |
| A2-06 | A2 | held-out | missed |
| A2-07 | A2 | held-out | caught |
| A2-08 | A2 | held-out | missed |
| A2-09 | A2 | held-out | caught |
| A2-10 | A2 | held-out | missed |
| A3-01 | A3 | calibration | missed |
| A3-02 | A3 | calibration | missed |
| A3-03 | A3 | calibration | missed |
| A3-04 | A3 | calibration | missed |
| A3-05 | A3 | calibration | missed |
| A3-06 | A3 | held-out | missed |
| A3-07 | A3 | held-out | missed |
| A3-08 | A3 | held-out | missed |
| A3-09 | A3 | held-out | missed |
| A3-10 | A3 | held-out | missed |
| A4-01 | A4 | calibration | caught |
| A4-02 | A4 | calibration | caught |
| A4-03 | A4 | calibration | caught |
| A4-04 | A4 | calibration | caught |
| A4-05 | A4 | calibration | caught |
| A4-06 | A4 | held-out | caught |
| A4-07 | A4 | held-out | caught |
| A4-08 | A4 | held-out | caught |
| A4-09 | A4 | held-out | caught |
| A4-10 | A4 | held-out | caught |
| A5-01 | A5 | calibration | caught |
| A5-02 | A5 | calibration | caught |
| A5-03 | A5 | calibration | caught |
| A5-04 | A5 | calibration | caught |
| A5-05 | A5 | calibration | caught |
| A5-06 | A5 | held-out | caught |
| A5-07 | A5 | held-out | caught |
| A5-08 | A5 | held-out | caught |
| A5-09 | A5 | held-out | caught |
| A5-10 | A5 | held-out | caught |
| B6-01 | B6 | calibration | missed |
| B6-02 | B6 | calibration | missed |
| B6-03 | B6 | calibration | missed |
| B6-04 | B6 | calibration | missed |
| B6-05 | B6 | calibration | missed |
| B6-06 | B6 | held-out | missed |
| B6-07 | B6 | held-out | missed |
| B6-08 | B6 | held-out | missed |
| B6-09 | B6 | held-out | missed |
| B6-10 | B6 | held-out | missed |

## Immutable bindings and ancestry

| Artifact | Binding |
|---|---|
| V3 preregistration merge | `BargLabs/cejel@c8c98025bad80a5203671c3a9d8ffbc39f7e80ee` |
| V3 preregistration Git blob | `041d3f1b75f39157e29af39d95c92f1608b8b4f8` |
| V3 preregistration SHA-256 | `614979359032abf9365bf1fffa39671a3cccb14371acaf939a1fbbfa1bdcd070` |
| Cejel release | tag `v0.4.0` |
| Cejel commit | `03ef74bd05274ff079c8dcd09dcdfaa8a6f1e3ff` |
| Cejel Git tree | `a857f0b3df0cd38d69393b7a90383156ae2fdb82` |
| Rubric | `witan-rubric-v17-2026-07-24`, selected explicitly |
| Scan boundary | `scoreRepoWithPublicCejel`, no ingest and no auto-discovered ingest |
| Fixed `generatedAt` | `2026-08-09T00:00:00.000Z` |
| Private evaluation-corpus merge | `BargLabs/alfred@d4f6f0dfa0721d2e35b40b14f43f227e5ec79dbc` |
| Private evaluation-corpus Git blob | `84e1d7d55d73b0c0895809d40e9946758636c777` |
| Private evaluation-corpus SHA-256 | `331349ecd5be409f0800e396863d3a7869f330b7603baf0e484636733f878220` |
| Private v3-control merge | `BargLabs/alfred@11284d9ca97c5d6b216014cc3315df07d4e02549` |
| Private v3-control Git blob | `c705a2491d695b0f15028bd1d4fa55eb402edc2f` |
| Private v3-control SHA-256 | `0955e77b47e5da5d8010da29359cc9aa1e27b3fa85969405cdff199fc39e07d4` |
| Pushed private harness | `BargLabs/alfred@eed093476712ca4b119aa8687920a971d86e4cc7` |
| Private result commit | `BargLabs/alfred@2d4a5bf3a0e2938a4fdb8634e2161bae588af0d6` |
| Private result merge | `BargLabs/alfred@906a3861aafb4ffc29bf35c88fab41b9b9fa7d9c` |

The private evaluation-corpus merge, v3-control merge, and pushed harness are strict ancestors of
the private result commit. Alfred PR
[#868](https://github.com/BargLabs/alfred/pull/868) was merged without flattening that ancestry.
Commit timestamps were not used as ancestry evidence.

## Run integrity and private evidence hashes

- Run count: **1**
- Run window: `2026-08-09T21:07:07.085Z` to `2026-08-09T21:07:21.760Z`
- Control rows: **6**
- Evaluation rows: **60**
- Control, evaluation, and instrument errors: **0**
- Committed private result JSON SHA-256:
  `f87b08471178dbcf4bdd905a8d8e5cfe8654f8efa37d69920edc07d6701201cd`
- Committed private result Markdown SHA-256:
  `c62a3cb76e3bd58fbad3753defb3ca24ec31fe5dbc03e485680e499f7d47364a`
- Canonical JSON semantic hash:
  `a17360af8d0678e4e67fa322efe969a7e9b20426c978eb1809013ae780762e2b`

Repository formatting changed JSON whitespace after emission but did not change the canonical JSON
semantic hash. The frozen release tree's installed, lockfile-pinned `tsup 8.5.1` build succeeded
directly after the outer pnpm wrapper could not perform its registry-signature version lookup in
the offline environment. No source or dependency changed.

## Claim and privacy boundary

This is a fixed-fixture proportion, not repository-wide, ecosystem-wide, customer, vulnerability,
pack, or future-version recall. It must not be combined, averaged, or described as confirming the
seeded dual-control result, the three session-derived real anchors, the v50 agreement study, or any
LLM Pack measurement. The per-criterion counts are diagnostic, not acceptance decisions.

This public closeout deliberately omits private fixture contents, named defect paths, raw finding
paths, fixture commits, private absolute paths, and unrelated Alfred material. Those artifacts
remain private in Alfred. The earlier v1 pre-run void and v2 control void remain immutable and are
not recall outcomes.
