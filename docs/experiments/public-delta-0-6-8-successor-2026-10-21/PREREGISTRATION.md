# Successor preregistration — 0.6.8 public confirmation, after the #521 review fixes

**CONSTRAINTS-VERSION: 2026-08-01.5**

This is a new preregistration. It is committed and pushed before any successor run is scored. It
names a new candidate commit and declares one more presentation-only field (`toolVersion`, below).
Nothing else changes.

- **Written:** 2026-10-21, before any successor run.
- **The original protocol is not edited.** That is
  `../public-delta-0-6-8-2026-10-21/PREREGISTRATION.md` at
  `581f2dc8c6c60faabd1d15d3a934b9c3ce9c4dac`.
- **What the original found.** It was run in full: all three expected values held, as its
  `result.md` and erratum record. Its candidate `224f605ae` was then superseded. A post-merge
  review of #521 found a credential that A4's lockfile text printed verbatim under every rubric,
  undetected CRLF LFS pointers, and three v27 false assertions. Those fixes (#553, merged into `release/0.6.8` as `af156af2f`, plus `4016f659e`) change
  `src/`, so `224f605ae` is no longer the source being released.
- **Disclosure.** Unlike the #468 precedent, this session knows the original run's per-row
  outcomes. The expected values below are therefore carried over from the original word for word,
  and none is revised from any outcome. The original's erratum (`norise.mjs` counts abstentions
  v27 *adds*) applies equally here.
- **Harness:** `docs/experiments/public-delta-harness/` (#495), unchanged. `norise.mjs` and
  `norise.node-test.mjs` are the original's files, copied byte for byte.
- **`plan.json` differs from the original in two places only:**
  - the candidate commit;
  - `toolVersion` is added to `release-v17`'s presentation-only fields. The candidate already
    carries the 0.6.8 release identity (`32c4d5573`), so `toolVersion` reads 0.6.8 against v0.6.7's
    0.6.7.

  `toolVersion` is not a scoring field, and declaring it relaxes no scoring, placement or
  fingerprint check. `generatedAt` is unchanged.

## What changed between the original candidate and this one

`224f605aec3e0a938c192e066d3c7bd6d256a36c` → `4016f659e061de927552c2da0445bf946e33d6ab` (`release/0.6.8` after the #521 review
fixes; it also carries the 0.6.8 version identity and records). Source differences:
- **Every rubric:** A4's quoted lockfile command no longer carries argument text between the
  subcommand and the flag.
- **LFS:** pointers with CRLF line endings are detected.
- **v27:**
  - the collection-hook and `pytestmark` rules claim only on their stated evidence;
  - a publish-only workflow is now one that only checks out, configures credentials and uploads an
    already-built artifact (#517's own repros are counted again);
  - `LD_AUDIT` is a code-loading variable.

Outside tests, the other `src/` change is the removal of an unreachable quote strip from
`isCodeLoadingEnvKey`. The changed files are `src/witan/repo-signals.ts` and
`src/witan/content-reads.ts`. `pnpm-lock.yaml` and `leaderboard/corpus.json` are unchanged from
v0.6.7. `package.json` differs only in `version` (0.6.8).

## Runs and pairs

As the original, with `cand-v17` and `cand-v27` at `4016f659e061de927552c2da0445bf946e33d6ab`. `v067-v17` stays at
`c5d05c7e6febd2e52ec007d15869c6fbf74ab2fa` and is scored again in a fresh scratch root; the
original's outputs are not reused.

## Expected values (carried over unchanged)

- **E0:**
  - 23 of 23 public rows complete in each of the three runs, with zero errors;
  - target identity unchanged across runs;
  - each source checkout at its run's commit;
  - an existing run output refused.
- **E1, `release-v17`:**
  - `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0;
  - `unexpectedCriteria` empty and `undeclaredFieldChanges` empty;
  - the number of byte-different reports is not forecast.
- **E2, `v27-shadow`, by `norise.mjs`:**
  - no row has a composite (overall, code, process) or a criterion score higher under v27 than
    under v17;
  - no composite or criterion is scored under v27 where v17 left it null or absent;
  - recorded, not forecast: the number of rows that differ, the placement moves, and the A2 and B2
    abstentions v27 adds.

## Procedure

As the original, with a fresh scratch root and the same verified full-history target clones.
Each run is scored once.

## What this does not show

The same limits as the original. It makes no precision, recall or calibration claim. v27 stays
prospective and opt-in.
