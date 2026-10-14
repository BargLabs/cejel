# A1 coverage-configuration recognition — 2026-10-14

**CONSTRAINTS-VERSION: 2026-08-01.5**

WIP record, written through as the work runs. Sections below are filled as each step completes.

## Red first

`src/witan/__tests__/coverage-config-recognition.test.ts` against the unfixed source (e43ab760):
93 tests, 46 failed, 47 passed. Every positive failed (v17 was blind to each idiom), plus the
pattern-set disclosure test. Every near-miss and every control passed. After the fix: 93 of 93 pass;
`coverage-command-recognition-v23.test.ts` 27 of 27 (one test's v22 half re-stated, see below).

## Behaviour corpus (measured)

Three synthetic specimens extend the corpus from 19 to 22: `coverage-config-setup-cfg`,
`coverage-config-maven-jacoco`, `coverage-command-go-ci`. The previous scanner (e43ab760, a
detached worktree) and this change each scored the same 22-specimen corpus under all ten
selectable rubrics. All 22 fixture HEAD SHAs were equal in both runs. 220 specimen/rubric
surfaces compared, 39 moved:

- `complete-node-service` (existing) under the nine rubrics other than v23: A1 2.2 → 2.4, A1 info
  findings 1 → 0, `verification_script_ratio` 3 → 4; code trust +0.1 (v17 2.5 → 2.6; v18-v24
  2.7 → 2.8; v25/v26 2.8 → 2.9); overall unchanged except v25/v26 3.0 → 3.1. Its `test` script is
  `vitest run --coverage`, a reachable coverage flag v23 already credited. v23 does not move.
- `coverage-config-setup-cfg` under all ten: A1 2.1 → 3.1, info 1 → 0, `coverage_percent` 0 → 85
  (the `fail_under = 85` threshold); code trust 2.1 → 3.1; overall 1.6 → 2.1.
- `coverage-config-maven-jacoco` under all ten: A1 info 1 → 0; no score moves (2.1).
- `coverage-command-go-ci` under all ten: A1 2.1 → 2.3, info 1 → 0, `verification_script_ratio`
  1 → 2; code trust 1.3 → 1.4; overall 1.2 → 1.3.

The other 18 existing specimens are identical under all ten rubrics (180 of 180).
