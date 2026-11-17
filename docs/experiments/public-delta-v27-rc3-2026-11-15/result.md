# Result — v17 against v27 on the 23 public rows at 0.7.0-rc.3: no rise; one scoring row, no score moved

**CONSTRAINTS-VERSION: 2026-08-01.5**

Run on 2026-11-15, between 01:31 and 01:36 UTC, by an AI agent (Claude Opus 5.5, Cowork), after the preregistration was pushed.
- **Preregistration:** `PREREGISTRATION.md` at `292f9f094c98dbc8aaff786e9d93c24e0a256d4c`, a strict ancestor of this result.
- **Commit under test:** `3b68ba2b0f5901f0def6d16a881550d0106235c1` (`@cejel/cejel@0.7.0-rc.3`).
- **Harness:** v2, unchanged. Its self-test passed 27 of 27, and `norise.node-test.mjs` passed 10 of 10, before scoring.
- **`paired-result.json`:** copied unchanged from the scratch root. Its `planSha256` is `dba7ba6f…4b3b`, the sha256 of this directory's `plan.json`. Raw reports stay local.
- **Host:** Linux x86_64. The 23 target clones were fresh full clones from each row's `url` and `commit`, made before the runs: HEAD at the corpus commit, clean, not shallow, no partial-clone filter. After the runs they were still at the corpus commit, clean and not shallow, and the source checkout was clean at `3b68ba2b0`.

## Expected values

| | Expected | Observed | |
|---|---|---|---|
| E0 | 23 of 23 rows in each run, zero errors; target identity unchanged; source checkout at `3b68ba2b0`; an existing run output refused | 23 of 23 in each run, 0 errors. `compare.mjs` checked that each manifest binds its run, commit, rubric, plan digest and prereg commit. Both runs report `sourceHead` `3b68ba2b0`. A second `rc3-v17` invocation was refused with "run output already exists; never overwrite a run" | held |
| E1, `v27-shadow` | no row has a composite or criterion score higher under v27 than v17; nothing scored under v27 that v17 left null or absent | `norise.mjs`: "v27-shadow: 23 rows, 0 with a rise; insufficient_data under v27: A2 0, B2 0" | held |
| E2, `v27-shadow` | no verdict better under v27 than v17; no verdict set where v17 had none | the preregistered `jq` read lists 23 rows with the same verdict under both rubrics | held |
| E3, `v27-shadow` | every scoring row, placement move, verdict move, unexpected criterion and undeclared field change listed | listed below | held |

## E3: what moved

The summary: scoringRowsMoved 1, placementsMoved 0, fingerprintsChanged 23, unexpectedCriteria [], undeclaredFieldChanges [], identicalAfterPresentationRemoval 17.

- **Scoring row (1): flask.** A1 stays verified at 2.3. Its `non_hollow_test_share` metric reads 27 of 28 under v27, against 28 of 28 under v17. No criterion score, composite, verdict or placement moves.
- **Verdict moves:** none. **Placement moves:** none.
- **Rows that differ in criterion text or evidence only (5):** fastapi (A1 evidence and notes; B3 disclosures, evidence, metric presentation and notes), biomejs (B3 notes), requests (A1 evidence), pydantic (A1 evidence and notes), fmt (B3 disclosures, evidence, metric presentation and notes). In each, every criterion's score, status and finding count is the same under both rubrics. flask also differs in A1 evidence and notes, and in B3's disclosures, evidence, metric presentation and notes.
- **B3 on flask, fastapi and fmt:** under v27, B3's evidence holds 2 pointers against v17's 1, and the `default_branch_ci_depth` metric carries the presentation condition "1 CI workflow file that publishes, releases or deploys with no pull-request trigger is not counted". This is #723's citation of a workflow B3 does not count. B3's score, status and finding count are unchanged in all three (flask 2.1, fastapi 2.7, fmt 3.1; each verified, 0 findings).
- **The other 17 rows** differ only in the declared presentation fields (`rubricVersion`, `rubricBehaviourFingerprint`).
- v27 adds no A2 or B2 abstention on these full clones.

Against the 0.7.0-rc.2 run (`../public-delta-v27-rc2-2026-11-13/`, at `0f85660ed`): the same six rows differ from v17, the same row (flask) is the one scoring row, in the same A1 metric, and no score moves in either run.

## What this does not show

It shows how v27 reads the 23 public rows against v17 at one commit, on one host. It makes no precision, recall or calibration claim. It does not change the default rubric, the board or any target pin.
