# Result — #567 paged A2 history reads on the merged code: every expected value held

**CONSTRAINTS-VERSION: 2026-08-01.5**

Run on 2026-10-23, between 00:07 and 00:10 UTC, by an AI agent (Claude Opus 5.5, Claude Code), after the preregistration was pushed.
- **Preregistration:** `PREREGISTRATION.md` at `db2a09f2a99f2e2b39838ab3356f378ddeaa8eb6`, a strict ancestor of this result. It is the third for #567, after the original (`09f017229`) and the successor (`5450b687f`), whose expected values it carries over unchanged.
- **Baseline:** `fd64796c702d35f90aa4917b3db2331a87a67f3e` (`main`, with #558, #571, #580 and #582).
- **Candidate:** `ef08a9770450c94eb06a72f2290202c4f6a158f4`, the merge of that baseline into #572's branch.
- **Harness:** v2, unchanged (`../public-delta-harness/`). Its self-test passed 27 of 27, and `norise.node-test.mjs` passed 10 of 10, before scoring.
- **`paired-result.json`:** copied unchanged from the scratch root. Its `planSha256` is `8c5f207a…`, the sha256 of this directory's `plan.json`. Raw reports stay local.

## Expected values

| | Expected | Observed | |
|---|---|---|---|
| E0 | 23 of 23 rows complete in each of the four runs, zero errors; target identity unchanged; each source checkout at its run's commit; an existing run output refused | 23 of 23 in each run, with 0 errors. `compare.mjs` checked that every manifest binds its run, commit, rubric, plan digest and prereg commit. Both source checkouts were clean at their commits after the runs. The 23 target clones were fresh APFS copies of the verified board clones; after the runs they were clean, not shallow, and at their corpus commits. A second `base-v17` invocation was refused with "run output already exists; never overwrite a run" | held |
| E1, `paging-v17` | scoringRowsMoved exactly 1 (react: A2 info-finding count +1; status, score and composites unchanged); placements 0; fingerprints 0; unexpectedCriteria empty; undeclaredFieldChanges exactly biomejs and react, `scanLimitations` only; the other 21 byte-identical | scoringRowsMoved 1: react, A2 critical 1.4, with findings going from critical 1 / info 0 to critical 1 / info 1; composites unchanged. Placements 0, fingerprints 0, unexpectedCriteria []. undeclaredFieldChanges: react `scanLimitations`, biomejs `scanLimitations`. 21 reports identical | held |
| E2, `paging-v27` | scoringRowsMoved exactly 2 (biomejs: A2 `insufficient_data` 0 → verified 3.2, overall and code_trust rise; react as E1); fingerprints 0; unexpectedCriteria empty; undeclaredFieldChanges exactly biomejs and react, `scanLimitations` only; the other 21 byte-identical; placements recorded | scoringRowsMoved 2. biomejs: A2 goes from `insufficient_data` 0 to verified 3.2; overall 2.5 → 3.0; code_trust 1.8 → 2.9; process_trust 3.1 unchanged; coverage code_trust 2/5 → 3/5. react as in E1. Fingerprints 0, unexpectedCriteria [], undeclaredFieldChanges react and biomejs `scanLimitations`, 21 reports identical | held |
| E3, `v27-shadow` | no row has a composite or criterion score higher under v27 than v17; nothing scored under v27 that v17 left null or absent | `norise.mjs`: "v27-shadow: 23 rows, 0 with a rise; insufficient_data under v27: A2 0, B2 0" | held |

**What changed in `scanLimitations`:**
- **biomejs** (v17 and v27): two lines are gone, "Cejel: local git history tree enumeration exceeded the 8 MiB output limit…" and "…environment-file history scan exceeded the 8 MiB output limit…".
- **react** (v17 and v27): the tree-enumeration line is gone.

Neither row has a scan limitation left. Under the v17 gating rule, their v17 badges are therefore rated rather than "unrated: limited evidence", and `--min-score` applies to them. No v17 score, status, metric value or verdict moves.

**#571's wording, observed.** axios's one control-character limitation is the same line in both runs of each pair, under v17 and v27: "Git history contained a pathname with control characters that is not credential-shaped. Cejel did not read that path in its history scans." biomejs and react have no control-character limitation on either side. The preregistration's code-based conclusion matches this: #571 left no expected value to be recorded rather than forecast.

**Recorded, not forecast:**
- **`paging-v27` placements:** 10 moves. biomejs goes from unranked to 6. Nine rows move down one place: react 11→12, vue 8→9, svelte 7→8, flask 9→10, esbuild 13→14, requests 6→7, scorecard 12→13, ripgrep 14→15 and fmt 10→11.
- **`v27-shadow` at the candidate:** 4 rows move. flask, fastapi and pydantic move in A1 metrics at the same score. requests' A1 goes 2.5 → 2.4. No placement moves. v27 adds no A2 or B2 abstention.

**Against the successor's result.** Apart from commits and digests (`planSha256`, `preregCommit` and each run's `sourceHead`), this `paired-result.json` is identical to the successor's (`6adf3a398`). That was checked by loading both files and comparing them with those fields removed.

## Earlier runs, disclosed

- **The original plan at its pins** (`c9d341d5f` and `da7d2d4f3`, prereg `09f017229`): scored once before `main` moved, then set aside unused.
- **The successor's result** (`6adf3a398`, at `75c951e40` and `5b154064a`): it stands for that code. For the code that will merge, this result supersedes it.

This result comes from a fresh scratch root, with fresh copies of the target clones and new detached checkouts.

## What this does not show

It measures #567's effect on the 23 public rows at one baseline. It makes no precision, recall or calibration claim. v27 stays prospective and opt-in. biomejs's v27 rise is the change working as intended: a read that no longer stops at Cejel's own output limit. It is not a no-rise violation; that property is E3's comparison of v27 with v17 at one commit.
