# v27 A1: how a fixture data file is counted (investigation, no code change)

goal_cejel_v27_a1_fixture_data_not_cited_as_test_2026-11-19, item C. Refs #518. This record
reports how the counts stand. It changes no code, and it proposes one fix for the operator to rule
on. The fix is not implemented.

## The question

`non_hollow_test_share` describes itself as follows: "test-directory support scaffolding
(helpers/fixtures with no test in them) is excluded from the denominator". Under every rubric, is
a fixture data file like the one in item A counted in `test_to_source_ratio`? Is it counted in the
share's denominator? Does that agree with the description?

## How the code counts it

Both metrics read the same list: `findConcreteTestFiles` at v17 (`v17TestFiles` in
`collectA1TestIntegrityEvidence`), under every rubric. A file under a test directory (`tests/`,
`test/`, `specs/`, `__tests__/`, ...) with a source extension is on that list, whatever its name.

- **`test_to_source_ratio`** counts every file on the list. A fixture data file under a test
  directory is counted as test surface under every rubric. This is the same reading the #518
  follow-up gave conftest.py (goal_cejel_v27_a1_test_count_overmatch_2026-11-01, item C): the ratio
  measures test surface, and fixtures are test surface.
- **The share** (`measureNonHollowTestShare`) counts a file in its denominator when it holds an
  assertion (`readsAsAsserting`), or when its *name* declares a test
  (`NAME_SHAPED_TEST_FILE_PATTERN`). One alternative in that pattern is any path under
  `__tests__/`. A fixture data file with no assertion is therefore:
  - left out of the denominator when it sits under `tests/fixtures/`, `tests/__fixtures__/` or
    `tests/helpers/`, which agrees with the description;
  - **counted as hollow** in the denominator when it sits anywhere under `__tests__/`, for example
    `src/__tests__/__fixtures__/users.ts`. **This does not agree with the description.**
  - counted as non-hollow, in both numerator and denominator, when its mock data happens to match
    an assertion pattern (for example a string holding `expect(` or `assert `). This is the share's
    general text-match reading, not something particular to fixtures.

## Measured (synthetic fixtures, this branch)

`src/witan/__tests__/v27-a1-fixture-data.test.ts`, describe "item C", pins these under all eleven
selectable rubrics. The values are the metric's value and max as the report writes them.

| Fixture | `test_to_source_ratio` | `non_hollow_test_share` |
| --- | --- | --- |
| card repository: 9 tests, `tests/conftest.py`, `tests/fixtures/auth.fixtures.ts`, 2 source files | 11 / 2 under every rubric | 10 / 10 under v17 to v26; 9 / 10 under v27 (the conftest.py is rated hollow, #518) |
| `src/__tests__/users.test.ts` and `src/__tests__/__fixtures__/users.ts`, 1 source file | 2 / 1 under every rubric | 1 / 2 under every rubric: the fixture data file is rated hollow |

Items A and B of this goal change neither row.

## Proposed fix (for a ruling; not implemented)

**Under v27, correct the share's description, and change no count.** The v27 description of
`non_hollow_test_share` would read: "Penalizes skipped or placeholder-only test files;
test-directory support scaffolding (helpers/fixtures with no test in them) is excluded from the
denominator, except under `__tests__/`, where every file is read as a test file and one with no
test in it is rated hollow."

- **What it changes:** the description string of one metric in A1 of every v27 report. It changes
  no value, score, status, finding, composite or verdict. Every other rubric is byte-identical.
- **No rise:** it changes no number, so v27 cannot rise above v17 on any commit.
- **Why not change the count instead.** Leaving a `__tests__/` fixture data file out of the share's
  denominator under v27 would make the code match the existing sentence. But it removes a file
  that v17 rates hollow, so the share rises. On the second fixture above, the v27 share would be
  1 / 1 against v17's 1 / 2, and A1 would score above v17 on the same commit. That breaks the
  no-rise property. Leaving the file out of `test_to_source_ratio` instead could only lower v27.
  But it would reverse the test-surface reading already ruled for conftest.py, and it would still
  leave the share's sentence wrong.

No holdout or calibration ran for this investigation.
