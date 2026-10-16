# Preregistration — 0.6.7: the output-symlink fix leaves public scoring unchanged, and v26 item 8 moves only A3 findings and notes

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Written:** 2026-10-16, before any run. Nothing in this directory has been scored.
- **Harness:** `docs/experiments/public-delta-harness/` (#495), unchanged. Byte identity uses
  `docs/experiments/public-delta-0-6-5-2026-10-15/byte-identity.mjs` (#497), unchanged. E3 uses
  `confinement.mjs` beside this file, written with this preregistration and tested by
  `confinement.node-test.mjs` (14 cases) before any run.
- **Plan:** `plan.json` beside this file. Its expected values E0–E3 are this preregistration's
  forecasts; they are copied here and not revised after any run.

## What changed between the two commits

`v0.6.6` (`6aec9d93f8dd27faea532ff1d96d1bf732895865`) and the fix commit (`f5348fb33503964373eb28b0ad6a7311a6ef594e`, main
after both merges) differ in source by two pull requests, both based on `v0.6.6`:

- **#508:** the CLI refuses to write scan, issue and export output through a symbolic link at the
  output directory or an output file. It touches `src/index.ts` and adds `src/output-files.ts`. The
  harness calls the scanner directly and reads `report.json` from its own output path, so it never
  reaches this code.
- **#509:** v26 item 8, under `witan-rubric-v26-prospective-2026-10-14` only, as ruled in
  `docs/calibration/v26/ruling-item-8.md`. A3's info finding "A deployable service package manifest
  declares neither a build nor a typecheck script." now also needs B-1, B-2 and B-3. Where a place
  went unread, A3's notes carry the ruling's sentence instead. Where the finding stops, the
  if/else-if chain after it runs: a Dockerfile HEALTHCHECK finding or a health-route finding can
  then fire. No metric changes. Its author compared full `report.json` bytes for v17–v25 on 58
  synthetic and corpus specimens and found them identical.

`package.json`, the lockfile and `leaderboard/corpus.json` are identical at both commits. The check
that only these two PRs' source files differ is run before this file is committed.

## Runs and pairs

| Run | Commit | Rubric |
|---|---|---|
| `v066-v17` | `6aec9d93…` (tag v0.6.6) | `witan-rubric-v17-2026-07-24` |
| `fix-v17` | `f5348fb3` | `witan-rubric-v17-2026-07-24` |
| `v066-v26` | `6aec9d93…` | `witan-rubric-v26-prospective-2026-10-14` |
| `fix-v26` | `f5348fb3` | `witan-rubric-v26-prospective-2026-10-14` |

- **`fixes-v17`:** no criterion may move. Presentation only: the behaviour fingerprint.
- **`item8-v26`:** only A3 may move. The harness counts a criterion as moved when its status,
  score, metrics or per-severity finding counts change, so a row where the build finding goes
  without a following finding counts in `scoringRowsMoved` with its scores unchanged; a row where a
  following info finding replaces it does not. Presentation only: the behaviour fingerprint.

## Expected values

- **E0:** 23 of 23 public rows complete in each of the four runs, with zero errors; target identity
  unchanged across runs; each source checkout at its run's commit; an existing run output refused.
- **E1:** `fixes-v17`: all 23 report files byte-identical (`byte-identity.json`
  `identicalReports` 23), `scoringRowsMoved` 0, `placementsMoved` 0, `fingerprintsChanged` 0,
  `unexpectedCriteria` empty, `undeclaredFieldChanges` empty.
- **E2:** `item8-v26`: on all 23 rows the overall, code and process scores, verdict, coverage and
  comparable score are unchanged; `placementsMoved` 0; `fingerprintsChanged` 0;
  `unexpectedCriteria` empty; `undeclaredFieldChanges` empty. The number of rows that differ is not
  forecast.
- **E3:** `item8-v26`, by `confinement.mjs`: every row that differs differs only in criterion A3,
  and inside A3 only in findings and notes.
  - The only finding that goes is the build finding above.
  - The only findings that appear are the info findings "A runtime Dockerfile declares no active
    HEALTHCHECK instruction." and "A production HTTP entrypoint handles requests directly but
    declares no health or readiness route.", and only on a row that lost the build finding.
  - No row gains the build finding.
  - Notes change only to the item-8 disclosure sentence, and only on a row that lost the build
    finding or did not carry it at v0.6.6. The second case is possible where v25 already withheld
    the finding because the workspace cap left manifests unread; `confinement.mjs` names it.

## Procedure

As `docs/experiments/public-delta-0-6-5-2026-10-15/OPERATOR-RUN.md`, with:
- this directory's plan;
- this commit as the preregistration commit;
- a fresh scratch root;
- the same verified full-history target copies.

Then run `node confinement.mjs plan.json <scratch>` for E3. Each run is scored once; an existing
output is refused and never overwritten. The result records every miss as it fell.

## What this does not show

- For #508, byte identity shows only that the fix does not touch scoring; its tests are in #508.
- For item 8, it shows where on 23 public repositories the finding stops, and what replaces it. It
  does not show whether stopping was right on any of them.
- It makes no precision or recall claim. v26 remains prospective and explicit opt-in; the public
  default stays v17.
