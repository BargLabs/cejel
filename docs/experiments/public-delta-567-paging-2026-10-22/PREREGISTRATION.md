# Preregistration — #567: A2's whole-history reads paged at Cejel's own output limit, public before-and-after

**CONSTRAINTS-VERSION: 2026-08-01.5**

This preregistration is committed and pushed before any run is scored. It names the candidate and
the baseline by exact commit, and states its expected values in advance. **Nothing has been run
under this plan.** The operator decides whether it runs.

- **Written:** 2026-10-22, before any run under this plan, by an AI agent (Claude Opus 5.5, Claude
  Code), at the coordinator's direction.
- **Change under test:** cejel #572 (fixes #567). When one of A2's whole-history reads (`rev-list
  HEAD`, the tree enumeration, the `.env`-path log, the deleted-path log) stops at Cejel's own 8 MiB
  output limit or 30-second timeout, it is re-run over the commit list in pages and batches; a read
  that does not hit a limit runs exactly as before.
- **Candidate:** `da7d2d4f3dcae47fde129975af335e4ccaf14146` (#572's head; its only differences from
  the baseline are `src/witan/repo-signals.ts`, one test file, `CHANGELOG.md` and
  `leaderboard/RUBRIC_CHANGELOG.md`).
- **Baseline:** `c9d341d5f9dd577b44276e255f8657984fdce2bb`, `main` at this writing and the
  candidate's merge base (#560 and #575 merged). The baseline will move as #558, #579 and #580
  merge. **If `main` has moved when this is run, the run does not use a newer baseline under this
  plan: a successor preregistration names the new baseline and candidate, and this file is never
  edited.**
- **Harness:** `docs/experiments/public-delta-harness/` (#495), unchanged. `norise.mjs` and
  `norise.node-test.mjs` are the 0.6.8 successor confirmation's files
  (`../public-delta-0-6-8-successor-2026-10-21/`), copied byte for byte.
- **Corpus:** `leaderboard/corpus.json`, sha256
  `dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`, the 23 public rows.

## Disclosure

The forecasts below are not blind. They come from an informal measurement recorded in
`leaderboard/RUBRIC_CHANGELOG.md` (#567 entry): the 23 public rows scanned with the CLI's defaults
under v17 and v27, before and after this change, on the 0.6.8 confirmation's full-history clones.
That measurement used a different base (#560 at round 5, `5aaa0d314`), so it bears on the change's
own effect, not on this baseline's absolute scores. Where this baseline's values could differ (it
also carries #562's v27 change and #560's final rounds), they are recorded, not forecast.

## Runs and pairs

Four runs: `base-v17` and `base-v27` at the baseline, `cand-v17` and `cand-v27` at the candidate.
Three pairs (`plan.json`):

- **`paging-v17`** (`base-v17` → `cand-v17`): the change's effect on the calibrated default. Only A2
  may move. `contentReadSummary` is presentation-only. `scanLimitations` is deliberately **not**
  declared presentation-only, so its expected changes are counted and must match E1 exactly.
- **`paging-v27`** (`base-v27` → `cand-v27`): the same, under v27.
- **`v27-shadow`** (`cand-v17` → `cand-v27`): the no-rise check at the candidate, as in the 0.6.8
  confirmation.

## Expected values

- **E0 (carried over):** 23 of 23 public rows complete in each of the four runs, with zero errors;
  target identity unchanged across runs; each source checkout at its run's commit; an existing run
  output refused.
- **E1, `paging-v17`:**
  - `scoringRowsMoved` exactly 1: react, whose A2 info-finding count rises by one (a non-template
    `.env` tracked in history with no secret-shaped value). react's A2 status and score, and every
    composite, unchanged.
  - `placementsMoved` 0, `fingerprintsChanged` 0, `unexpectedCriteria` empty.
  - `undeclaredFieldChanges` exactly two: biomejs and react, each only `scanLimitations` (their
    Git-history output-limit limitations are gone). This is a v17 gating change: with no scan
    limitation left, both rows' v17 badges become rated and `--min-score` applies to them.
  - The other 21 reports byte-identical.
- **E2, `paging-v27`:**
  - `scoringRowsMoved` exactly 2. biomejs: A2 from `insufficient_data` at 0 to verified 3.2, and
    its overall and code_trust rise (values recorded, not forecast; the informal base gave 2.5 → 3.0
    overall and 1.8 → 2.9 code_trust). react: as in E1.
  - `fingerprintsChanged` 0, `unexpectedCriteria` empty, `undeclaredFieldChanges` exactly biomejs
    and react, `scanLimitations` only; the other 21 reports byte-identical.
  - Placement moves recorded, not forecast.
- **E3, `v27-shadow` (carried over from the 0.6.8 confirmation's E2), by `norise.mjs`:** no row has
  a composite (overall, code, process) or a criterion score higher under v27 than under v17, and no
  composite or criterion is scored under v27 where v17 left it null or absent. Recorded, not
  forecast: the number of rows that differ, the placement moves, and the A2 and B2 abstentions v27
  adds.

A result that misses any expected value is reported as a miss, with the rows; nothing is re-run to
make it hold.

## Procedure

`docs/experiments/public-delta-harness/RUN.md`, harness v2, with a fresh scratch root outside every
checkout and the same verified full-history target clones the 0.6.8 confirmation used. One detached
clean source checkout per distinct commit (two). Each run is scored once. This commit (the
preregistration) stays a strict ancestor of the result commit, and the branch is not squashed.

## What this does not show

It measures this change's effect on the 23 public rows at one baseline. It makes no precision,
recall or calibration claim. v27 stays prospective and opt-in. A row's composite rising under v27
in `paging-v27` is the change working as intended (a read that no longer fails at Cejel's own limit),
not a no-rise violation; the no-rise property is E3's comparison of v27 with v17 at one commit.
