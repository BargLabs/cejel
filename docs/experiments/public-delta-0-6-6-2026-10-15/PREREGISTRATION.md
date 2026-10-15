# Preregistration — the 0.6.6 security fixes leave public scoring unchanged

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Written:** 2026-10-15, before any run. Nothing in this directory has been scored.
- **Harness:** `docs/experiments/public-delta-harness/` (#495), unchanged. Byte identity uses
  `docs/experiments/public-delta-0-6-5-2026-10-15/byte-identity.mjs` (#497), unchanged.
- **Plan:** `plan.json` beside this file. Its expected values E0–E2 are this preregistration's
  forecasts; they are copied here and not revised after any run.

## What changed between the two commits

`v0.6.5` (`a8e582a0f7e2505605f0cd01bab04db6ab678e0e`) and the fix commit
(`82cba330b38d3773a6645e7471a11da6443c92bc`, the #500 merge) differ in source by two pull requests:

- **#502:** a `pnpm run /<regex>/` selector in a repository's scripts is no longer compiled; it takes
  the existing unresolved-reference path, which withholds both A1 coverage credit and the
  "no coverage configuration" finding. Declared workspace globs are matched by a linear matcher
  instead of a regex, with length and segment caps; the reviewer's comparison on 181,535 seeded
  random pairs found no disagreement with the regex it replaces.
- **#500:** the HTTP server refuses uploaded Git control metadata and confines Git discovery for
  uploaded snapshots; the terminal certificate strips control characters from untrusted fields.
  Neither path is used by this harness, which calls the scanner directly and reads `report.json`.

`package.json`, the lockfile and `leaderboard/corpus.json` are identical at both commits.

## Runs and pairs

| Run | Commit | Rubric |
|---|---|---|
| `v065-v17` | `a8e582a0…` (tag v0.6.5) | `witan-rubric-v17-2026-07-24` |
| `fix-v17` | `82cba330…` | `witan-rubric-v17-2026-07-24` |
| `v065-v26` | `a8e582a0…` | `witan-rubric-v26-prospective-2026-10-14` |
| `fix-v26` | `82cba330…` | `witan-rubric-v26-prospective-2026-10-14` |

Pairs `fixes-v17` and `fixes-v26` compare each rubric across the two commits. Allowed criteria: A1
only, because the selector change can move A1 and nothing else. Presentation only: the behaviour
fingerprint.

## Expected values

- **E0:** 23 of 23 public rows complete in each of the four runs, with zero errors; target identity
  unchanged across runs; each source checkout at its run's commit; an existing run output refused.
- **E1:** both pairs: all 23 report files byte-identical (`byte-identity.json` `identicalReports`
  23), `scoringRowsMoved` 0, `fingerprintsChanged` 0, `unexpectedCriteria` empty,
  `undeclaredFieldChanges` empty.
- **E2:** if any row differs, it differs only in A1, and only where the row's `package.json` scripts
  contain a `pnpm run /` selector; such a row is a miss of E1 and is reported with that fact. A
  difference anywhere else is a miss with no stated cause.

## Procedure

As `docs/experiments/public-delta-0-6-5-2026-10-15/OPERATOR-RUN.md`, with this directory's plan,
this commit as the preregistration commit, a fresh scratch root, and the same verified full-history
target copies. Each run is scored once; an existing output is refused and never overwritten. The
result records every miss as it fell.

## What this does not show

It measures whether the fixes change scoring on 23 public repositories. It does not test the fixes
themselves; their tests are in #500 and #502. It makes no precision or recall claim.
