# v17 A1 coverage-command detector: investigation, 2026-10-06

Found while making the certificate legible to a first-time reader
(goal_cejel_certificate_first_reader_legibility_2026-10-06). **Investigation only. Not fixed,
because a fix moves A1 scores.** The goal asked for this to be filed as an issue. The run that
wrote it could not create issues (`gh issue create` was outside its permitted commands). This
record is the durable copy until the operator files the issue; the pull request body carries the
same text.

## What a reader sees

On the 0.6.0 certificate for `expressjs/express@7ef98448` (rubric `witan-rubric-v17-2026-07-24`),
one A1 card says both:

- evidence: `Coverage configuration package.json:1`
- Verification script ratio: `missing: coverage command`

Express's `package.json` has `test-cov` and `test-ci` scripts that run `nyc ... npm test`. CI runs
`npm run test-ci`. An express-like synthetic fixture reproduces the same two lines.

## Code path (at `af15ce7`)

Two different predicates read the same `package.json` scripts:

1. **Evidence: recognises nyc in any script.** `collectA1TestIntegrityEvidence` →
   `findCoverageConfigFiles` → `isCoverageConfig` (`src/witan/repo-signals.ts:6428`) →
   `packageJsonHasCoverageTooling` → `commandInvokesCoverageTool(command)` (`:7195`), applied to
   every script value. That makes `package.json` a coverage file, which emits the
   `Coverage configuration` evidence pointer (`:2024`).
2. **Verification-script component: recognises only a script named `coverage`.**
   `src/witan/repo-signals.ts:1932-1938`:
   ```ts
   const analysis = useV23CommandCoverage
     ? analyzeCoverageConfiguration(repoPath, repoFiles, useV27Detectors)
     : {
         coverageFiles: findCoverageConfigFiles(repoPath, repoFiles, useV27Detectors),
         unresolvedFiles: [],
         hasCoverageCommand: packageScripts.has('coverage'),
       };
   ```
   `useV23CommandCoverage` is true only for `WITAN_RUBRIC_VERSION_V23` (`:549`). Every other
   rubric, including the calibrated default v17 that the public board uses, takes the `else`
   branch. There, `hasCoverageCommand` is true only when a script is literally named `coverage`.
   `nyc` inside `test-cov`/`test-ci` is not credited, so the `coverage command` component
   (`:1982`) is 0.

So yes: under v17 the verification-script detector misses coverage commands that run a coverage
tool inside a differently named script. Under v23, `analyzeCoverageConfiguration` credits a
script that collects coverage and is reachable from a test entry point. In express, CI runs
`npm run test-ci`, so v23 would credit it.

## What a fix would move (counted, not applied)

A fix (for example, setting the v17 `hasCoverageCommand` from the same
`commandInvokesCoverageTool` predicate) changes only the `coverage command` component of
`verification_script_ratio`.

- Per row: if the raw verification count is below the cap of 4, it rises by 1. Under
  `scoreMetrics` (`src/witan/scoring.ts:668`), with A1 weights 0.3/0.3/0.25/0.15, A1 rises by
  `4 × 0.25 × 1/4 = +0.25` before rounding. Rows already at or above the cap move 0. Code trust
  moves by that amount divided by the number of measured code criteria; overall moves by half of
  that. Bands and verdicts can move at boundaries.
- Express-like fixture: raw 2 → 3, so A1 goes from 2.0 to 2.25 before rounding. The rounded
  value was not computed.
- **Board rows: count not measured.** The run had no network (clone and web fetch were both
  outside its permissions). The published board shows no per-criterion A1 values. What is known:
  - Only rows whose scanned root has a `package.json` can move (`findRootPackageJson`, `:8165`).
    Which of the 24 corpus rows have one was not checked. The obvious candidates are the JS/TS
    rows (react, vue, svelte, express, vite, esbuild, biomejs, axios, zod, cejel), but a non-JS
    repository with a root `package.json` would also qualify.
  - The `cejel` row (pin `0be03171`) has no script that runs a coverage tool
    (`git show 0be03171:package.json`). It moves 0.
  - The `alfred` row is private and was not examined.
- To produce the exact count: for each row at its `leaderboard/corpus.json` pin, read the root
  `package.json` scripts. Count the rows where (a) no script is named `coverage`, (b) some script
  satisfies `commandInvokesCoverageTool`, and (c) the row's v17 `verification_script_ratio` raw
  value is below 4.

## Not in scope here

No detector change was made. Any fix is a scoring change under the calibrated default rubric. It
needs the rubric-change process (`leaderboard/RUBRIC_CHANGELOG.md`, behaviour-fingerprint re-pin,
paired re-score), not a presentation patch.
