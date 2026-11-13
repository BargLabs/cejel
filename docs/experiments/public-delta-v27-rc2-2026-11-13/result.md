# Result — v17 against v27 on the 23 public rows at 0.7.0-rc.2: no rise; one scoring row, no score moved

**CONSTRAINTS-VERSION: 2026-08-01.5**

Run on 2026-11-13, between 00:31 and 00:34 UTC, by an AI agent (Claude Opus 5.5, Cowork), after the preregistration was pushed.
- **Preregistration:** `PREREGISTRATION.md` at `60ca538fae512a9d1a383d7cd86946a79952e019`, a strict ancestor of this result.
- **Commit under test:** `0f85660ed3cd90abfac219df7512624a7f81d41f` (`@cejel/cejel@0.7.0-rc.2`).
- **Harness:** v2, unchanged. Its self-test passed 27 of 27, and `norise.node-test.mjs` passed 10 of 10, before scoring.
- **`paired-result.json`:** copied unchanged from the scratch root. Its `planSha256` is `a02ab180…4f98`, the sha256 of this directory's `plan.json`. Raw reports stay local.
- **Host:** Linux x86_64. The 23 target clones were fresh full clones from each row's `url` and `commit`, made before the runs: HEAD at the corpus commit, clean, not shallow, no partial-clone filter. After the runs they were still clean and not shallow, and the source checkout was clean at `0f85660ed`.

## Expected values

| | Expected | Observed | |
|---|---|---|---|
| E0 | 23 of 23 rows in each run, zero errors; target identity unchanged; source checkout at `0f85660ed`; an existing run output refused | 23 of 23 in each run, 0 errors. `compare.mjs` checked that each manifest binds its run, commit, rubric, plan digest and prereg commit. Both runs report `sourceHead` `0f85660ed`. A second `rc2-v17` invocation was refused with "run output already exists; never overwrite a run" | held |
| E1, `v27-shadow` | no row has a composite or criterion score higher under v27 than v17; nothing scored under v27 that v17 left null or absent | `norise.mjs`: "v27-shadow: 23 rows, 0 with a rise; insufficient_data under v27: A2 0, B2 0" | held |
| E2, `v27-shadow` | no verdict better under v27 than v17; no verdict set where v17 had none | the preregistered `jq` read lists 23 rows with the same verdict under both rubrics | held |
| E3, `v27-shadow` | every scoring row, placement move, verdict move, unexpected criterion and undeclared field change listed | listed below | held |

## E3: what moved

The summary: scoringRowsMoved 1, placementsMoved 0, fingerprintsChanged 23, unexpectedCriteria [], undeclaredFieldChanges [], identicalAfterPresentationRemoval 17.

- **Scoring row (1): flask.** A1 stays verified at 2.3. Its `non_hollow_test_share` metric reads 27 of 28 under v27, against 28 of 28 under v17. No criterion score, composite, verdict or placement moves.
- **Verdict moves:** none. **Placement moves:** none.
- **Rows that differ in criterion text or evidence only (5):** fastapi (A1 evidence and notes; B3 disclosures and notes), biomejs (B3), requests (A1 evidence), pydantic (A1 evidence and notes), fmt (B3). In each, every criterion's score, status and finding count is the same under both rubrics. flask also differs in B3's disclosures and notes.
- **The other 17 rows** differ only in the declared presentation fields (`rubricVersion`, `rubricBehaviourFingerprint`).
- v27 adds no A2 or B2 abstention on these full clones.

Against #586's `v27-shadow` (at `62924091c`): requests' A1 no longer moves (it went from 2.5 to 2.4 there; it is 2.5 under both here). The other movers then (flask, fastapi, pydantic) again move in A1 metrics or evidence at the same score.

## What this does not show

It shows how v27 reads the 23 public rows against v17 at one commit, on one host. It makes no precision, recall or calibration claim. It does not change the default rubric, the board or any target pin.
