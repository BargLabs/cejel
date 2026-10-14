# Harness v2: provenance, tests and guard deletions

**CONSTRAINTS-VERSION: 2026-08-01.5**

This record covers building and testing the harness only. No run was scored against the public
corpus. No target was copied or cloned, and no scanner was imported against a corpus row. Every
plan, git repository, report and corpus used by the tests is synthetic. The tests create them in
the operating system's temporary directory.

## Provenance

The five harness files were copied byte for byte from
`../v17-delta-459-427-430-2026-10-13/harness/`, as of commit
`8d7e0c2493cb089d59ba8819e9806004a98d16d4` on `main`. Those files last changed in commit
`dd9e16a92d8b1dc46dd85635607e1210fc800d44`. Their Git blob ids matched file for file before any
edit. The precedent directory is not modified.

## Tests

`pnpm exec node --test docs/experiments/public-delta-harness/harness.node-test.mjs` runs 27 tests
and all pass. The precedent's own `harness.node-test.mjs` (4 tests) still passes unchanged.

## Translation

The precedent's committed `paired-result.json`
(`../v17-delta-459-427-430-successor-2026-10-13/`) cannot be reproduced value for value from
synthetic inputs. Its placements depend on every row's complete criteria. Its coverage text
depends on criterion categories and statuses. Neither is in the committed file, and the raw reports
were never committed. The test therefore does two other things:

1. It translates a synthetic three-arm plan into v2. It runs the precedent's own `compare.mjs` and
   v2's `compare.mjs` on identical synthetic per-row reports and manifests. It then asserts that
   every field the precedent emits is equal in v2's output, under the mapping `arms` to `runs`,
   `left` to `before` and `right` to `after`. The fixture is checked to be non-vacuous: scoring
   moves, placement moves, fingerprint changes, identical reports, an error row and an unexpected
   criterion each occur at least once.
2. It reads only the field names of the committed precedent `paired-result.json`, never its values.
   It asserts that each name appears in v2's output under the same mapping. The names under
   `expected` are excluded, because they are the plan's own forecast keys and are copied through
   unchanged.

## Guard deletions

Each guard was deleted alone, the suite was run, and the file was restored with
`git checkout -- docs/experiments/public-delta-harness/common.mjs`.

| Guard deleted (in `common.mjs`) | Named test | Result with guard deleted | Other tests |
|---|---|---|---|
| `verifyRunSource`: rubric must be in the run commit's selectable list | `refuses a rubric not selectable at the run's commit` | fail (26 pass, 1 fail) | all pass |
| `validatePlan`: a pair's `before` and `after` must be declared runs | `refuses a pair naming an undeclared run` | fail (26 pass, 1 fail) | all pass |
| `claimRunOutput`: refuse an existing `<scratch>/out/<run>` | `refuses an existing output directory` | fail (26 pass, 1 fail) | all pass |

With all three guards restored, the suite is back to 27 pass and 0 fail.

## Changes from the precedent

- **Plan-declared.** The precedent fixed the rubric, the three arm names, the pairs and their
  allowed criteria, and the public row count of 23 in code. In v2 the plan declares them all. The
  row count is still checked against the digested corpus.
- **Added checks.**
  - A target with a partial-clone filter is refused. The precedent required "no blob filter" in
    its protocol but did not check it in code.
  - The preregistration commit must be an ancestor of the protocol checkout and must hold the
    plan's exact bytes. The precedent left this to a manual step.
  - A scratch root inside the protocol or source checkout is refused.
  - `compare.mjs` binds each manifest to its run's name, commit, rubric and `generatedAt`, and
    each report to its run's rubric.
- **Generalised.** The precedent's one presentation-only field was the behaviour fingerprint,
  fixed in code. A pair now declares its own. `fingerprintChanged` and
  `identicalAfterFingerprintRemoval` are still emitted, so v2's output stays comparable with the
  precedent's.
