# Goal 1 — did #276/#277 move v22's (or v17's) coverage decisions?

**CONSTRAINTS-VERSION: 2026-08-01.5** (identical bytes on `origin/main` in both `cejel` and
`alfred` as of 2026-09-08; confirmed by direct diff, not assumed).

Status: **MEASURED. No divergence found on the fixture set below.**

## Why this was asked

`eb0db70` (#276, "recognize reachable command-flag coverage") and `0ab4bd6` (#277, "strengthen
coverage negation guards") landed on `cejel` after the cycle-12 measurement pin
(`e434a40e6596536ac9c2645fefa71fc9f0eda7cb`, per
[`cycle-12-estimation-result.md`](https://github.com/BargLabs/alfred/blob/main/docs/calibration/cycle-12-estimation-result.md)
on `BargLabs/alfred`, operator-signed 2026-09-05). #276 gates its recognition work behind
`usesV23CommandCoverage`, but #277's declared scope — "test strength plus an observability
seam, no recognition change" — modifies shared control flow in `analyzeCoverageConfiguration`,
`packageScriptCoverageState`, and `recipeCoverageState`, and `A1-NO-COVERAGE-CONFIG` is one of
the seven measured rules behind the signed 33.99% recall figure. This is "exposure 5" of the
2026-09-08 determinism incident (operator-held notes, not in this repository; summarised in the
dispatch that requested this measurement). Reading the diff suggested the change is cleanly
gated; this measurement checks that against running code rather than trusting the read.

## What was NOT done

No file under `src/witan` was changed. No file under `docs/calibration/` or `docs/experiments/`
was touched. No cohort repository name, owner, URL, path, or content appears anywhere in this
PR — every fixture below is synthetic, built from obviously-fake values (`fixture-a1`,
`my-test-runner`, etc.), not drawn from or modeled on any specific real repository.

## Method

Two fresh git worktrees off the `cejel` repository, `node_modules` symlinked from the primary
checkout (`package.json`'s only diff between the two pins is the `0.4.5` → `0.4.7` version
bump; `pnpm-lock.yaml` is unchanged — confirmed by `git diff --stat`, not assumed):

- `e434a40e6596536ac9c2645fefa71fc9f0eda7cb` — the cycle-12 measurement pin.
- `origin/main` at `b506a0feb332decb4bbc93232e90b83c04c8f1f3` (2026-09-08) — includes #276 and
  #277, plus everything else landed since the pin.

A driver script (`docs/fixtures/goal1-coverage-move-2026-09-08/driver.ts`, included in this PR
for reproducibility) calls the exported `buildWitanInputFromRepo` directly against each fixture
below, once per `(pin, rubricVersion)` combination, and dumps the resulting A1 criterion signal
(`findings`, `metrics`, `insufficientData`, `notes`) plus the payload's `scanLimitations` as
JSON. Run from inside each worktree so the import resolves to that worktree's own
`src/witan` — this is what makes the comparison meaningful; a shared checkout would just measure
itself twice.

## Shape enumeration (mechanical, from `origin/main` `src/witan/repo-signals.ts`)

`analyzeCoverageConfiguration` (the function `#276` introduced and `#277` modified) recognizes
coverage through these mechanisms:

| # | Shape | Recognizer |
|---|---|---|
| A1 | Direct coverage-tool invocation (`nyc`/`c8`/`istanbul` as the command) | `commandInvokesCoverageTool` |
| A2 | Recognized flag-runner (`jest`/`vitest`/`bnt`/`pytest`/`py.test`/`bun test`/`deno test`/`node --test`), coverage flag **on** | `coverageFlagCommandState` → `collects` |
| A3 | Same, coverage flag **negated** (`--no-coverage`, `--no-cov`, …) | `flagState` → `none` |
| A4 | Same, `--flag=false` / `--flag=0` / `--flag=off` negation form | `flagState` |
| A5 | Both an enabling and a disabling flag in one command | `flagState` → `unresolved` |
| A6 | Recognized runner invoked with **no** coverage flag at all | `coverageFlagCommandState` → `none`, not recognized |
| A7 | Coverage-flag syntax on an **unrecognized** but test/spec/runner-shaped executable | the `hasCoverageSyntax && potentialFlagState !== 'none' && executable matches /test\|spec\|runner/i && excludes docs/map/report/upload/codecov/coveralls` heuristic → `unresolved` |
| A8 | Dynamic/unresolvable script reference (`pnpm run $VAR`, or the `pnpm run /regex/` selector form) reaching a script that itself has coverage syntax | `packageScriptReferences.dynamic` → `unresolved` |
| A9 | Reachable local shell-script wrapper (`./scripts/x.sh`) whose contents invoke coverage | `reachableShellWrapper`, recursive `coverageCommandEvaluation` |
| A10 | CI-workflow `run:` step directly invoking coverage (no package-script reference at all) | the `ciCommandsByFile`/`isCiWorkflow` loop at the top of `analyzeCoverageConfiguration` |
| B1 | `vitest.config.*` with a truthy `coverage` object | `isV23CoverageConfig` |
| B2 | `vitest.config.*` with `coverage: false` (or `{ enabled: false }`) | `isV23CoverageConfig` excludes; **old-path `isCoverageConfig` does not** — a pre-existing quirk of the unmodified old path, not introduced by #276/#277 |
| B3 | `jest.config.*` with `collectCoverage: true` | `isV23CoverageConfig` |
| B4 | `jest.config.*` with `collectCoverage: false` and no other coverage keys | `isV23CoverageConfig` excludes; old-path again does not (same pre-existing quirk) |
| B5 | `package.json` static `nyc`/`c8`/`istanbul` config object | `packageJsonHasStaticCoverageTooling` (new) vs. `packageJsonHasCoverageTooling` (old, also checks scripts) |
| B6 | Filename-recognized coverage config (`.nycrc`, `codecov.yml`, `lcov.info`, `.coveralls.yml`) | `isV23CoverageConfig` delegates straight to the unmodified `isCoverageConfig` for these — identical in both paths by construction |
| B7 | `pyproject.toml` `[tool.coverage…]` | same delegation as B6 — identical in both paths |
| C1–C4 | Recipe files (`Makefile`/`Justfile`) — `test`/`tests`/`check` targets, CI-reachable non-default targets, and unreachable targets | `recipeCoverageState`, `readRecipeTargets`, `isRecipeTestEntry` — **entirely new in #276; no pre-#276 equivalent exists** |
| E | No coverage evidence anywhere | negative control |

**Gaps — shapes the code distinguishes that the fixture set below does NOT cover:**
recipe dependency-chain traversal beyond one hop (`deps:`/`$(MAKE)` recursion); CI YAML
block-scalar (`run: |`) parsing; shell-operator segment splitting (`&&`/`||`/`;`/inline `#`
comments) inside a single command; monorepo nested-package coverage detection
(`resolveMonorepoContext`); package-script lifecycle hooks (`pretest`/`posttest`) chained
through coverage; the `pnpm run /regex/flags/` dynamic-selector form specifically (only the
`$VAR` dynamic form was exercised); the `containsPotentialCoverageFlag` exclusion list's
negative case (an executable named e.g. `codecov-test` that should NOT trigger the A7
heuristic); wrapper-script chains deeper than one hop; `jest`/`vitest` config expressed as
`package.json`'s own `"jest"` field or as `.json`/`.yml`/`.mjs` variants outside the regexed
filename patterns; and actual coverage-percentage value extraction
(`parseCoverageSummaryPercent`/`parseCoverageThresholdPercent`) — every fixture here reports
`coverage_percent: 0` because none contains a populated coverage-report file. **Absence of
divergence on the shapes below is not evidence about these.**

## Results

24 fixtures (`docs/fixtures/goal1-coverage-move-2026-09-08/`, generated by the included
`generate-fixtures.sh`), each run at both pins under both `v22`
(`witan-rubric-v22-prospective-2026-08-10`) and `v17` (`witan-rubric-v17-2026-07-24`).

**Every one of the four output files is byte-for-byte identical** (same SHA-256, `diff` exit 0
both ways):

```
ec403dcc098103f6036f4fa6f7f50de3f4cb4214f446d1fec5598a80b5379190  e434a40e-v17.json
ec403dcc098103f6036f4fa6f7f50de3f4cb4214f446d1fec5598a80b5379190  e434a40e-v22.json
ec403dcc098103f6036f4fa6f7f50de3f4cb4214f446d1fec5598a80b5379190  main-v17.json
ec403dcc098103f6036f4fa6f7f50de3f4cb4214f446d1fec5598a80b5379190  main-v22.json
```

`diff e434a40e-v22.json main-v22.json` → exit 0 (no output). `diff e434a40e-v17.json
main-v17.json` → exit 0 (no output). v17 and v22 are also identical to *each other* at both
pins — expected, not a new finding: `collectA1TestIntegrityEvidence` receives the same boolean
detector-gate values for both (`usesV17DetectorClosure` covers v17 through v22 uniformly, and
`useV23CommandCoverage` is `false` for both), so A1's detection logic was already byte-identical
between v17 and v22 before this measurement.

Per-fixture summary (v22 shown; v17 and the pin are identical, per the checksums above —
`test`/`cov_cmd`/`runner_cfg` are the `verification_script_ratio` component counts,
`coverage_percent` is that metric's value, `findings` is the A1 findings-array length):

| Fixture | Result |
|---|---|
| A1_direct_nyc | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A2_flag_jest_on | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A3_flag_jest_negated | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A4_flag_eq_false | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A5_flag_conflict | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A6_runner_no_flag | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A7_unclear_flag_heuristic | **abstained** — A1 signal is `null` (no findings at all: no test files, no recognized runner config, no CI, no coverage config — see below) |
| A8_dynamic_unresolved | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A9_wrapper_reachable | test=0 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A10_ci_direct | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A11_pytest_cov | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| A12_node_experimental_coverage | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| B1_vitest_object_true | test=1 cov_cmd=0 runner_cfg=1 coverage_percent=0 findings=1 |
| B2_vitest_false | test=1 cov_cmd=0 runner_cfg=1 coverage_percent=0 findings=1 |
| B3_jest_collectCoverage_true | test=1 cov_cmd=0 runner_cfg=1 coverage_percent=0 findings=1 |
| B4_jest_collectCoverage_false | test=1 cov_cmd=0 runner_cfg=1 coverage_percent=0 findings=1 |
| B5_package_nyc_static | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| B6_nycrc_file | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=1 |
| B7_pyproject_toml | test=0 cov_cmd=0 runner_cfg=1 coverage_percent=0 findings=1 |
| C1_makefile_test_nyc | test=0 cov_cmd=0 runner_cfg=1 coverage_percent=0 findings=1 |
| C2_makefile_ci_reachable | **abstained** — A1 signal is `null` |
| C3_justfile_test | **abstained** — A1 signal is `null` |
| C4_makefile_unreachable | **abstained** — A1 signal is `null` |
| E1_no_coverage | test=1 cov_cmd=0 runner_cfg=0 coverage_percent=0 findings=0 |

Full JSON for all four runs is attached at
`docs/fixtures/goal1-coverage-move-2026-09-08/{e434a40e,main}-{v22,v17}.json`; the byte-for-byte
diff is the actual comparison, not the compact table above.

### The four `null` A1 signals, explained

`A7_unclear_flag_heuristic`, `C2_makefile_ci_reachable`, `C3_justfile_test`, and
`C4_makefile_unreachable` were deliberately built to exercise the **new v23-only** recognition
surface (the A7 heuristic path and the entire recipe-file scanning path, neither of which has a
pre-#276 equivalent). Under v22/v17 none of that new surface runs — `collectA1TestIntegrityEvidence`
finds literally no test files, no recognized runner config, no CI-run evidence, and no coverage
config for these four fixtures (`my-test-runner` is not a recognized runner; `Makefile`/`Justfile`
targets are invisible to the old path), so `repo-signals.ts:1925`'s `if (!firstEvidence) return
null;` abstains the whole criterion. This is confirmed to be the same, intentional "nothing to
show" abstention path at both pins (not an exception — no fixture produced an `error` key; no
`scanLimitations` were recorded) — the strongest form of "no move" available for exactly the
fixtures purpose-built to hit the new code, since the new code is provably unreached.

## Source confirmation (why the empirical result matches the read)

`collectA1TestIntegrityEvidence` (`src/witan/repo-signals.ts:1726-1728` on `origin/main`)
branches on `useV23CommandCoverage`, which is computed once as `rubricVersion ===
WITAN_RUBRIC_VERSION_V23` (`repo-signals.ts:368`) and is `false` for both `v22` and `v17` at
both pins (`WITAN_RUBRIC_VERSION_V22`/`_V17` are unchanged strings between the two pins —
confirmed by `git show` at both revisions, not assumed):

```ts
const { coverageAnalysis, coveragePercent } = withContentReadSignal('A1', 'coverage_percent', () => {
  const analysis = useV23CommandCoverage
    ? analyzeCoverageConfiguration(repoPath, repoFiles, useV27Detectors)
    : {
        coverageFiles: findCoverageConfigFiles(repoPath, repoFiles, useV27Detectors),
        unresolvedFiles: [],
        hasCoverageCommand: packageScripts.has('coverage'),
      };
  ...
```

`analyzeCoverageConfiguration`, `packageScriptCoverageState`, `recipeCoverageState`,
`coverageConfigurationDecision`, `isV23CoverageConfig`, and `isRecipeTestEntry` are all **new**
functions introduced by #276 (confirmed against the commit diff — each appears for the first
time in `eb0db70`'s patch, not as a modification of `findCoverageConfigFiles`/`isCoverageConfig`,
which remain byte-unchanged). `usesV23CommandCoverage` itself is otherwise unreferenced anywhere
in `src/` outside this one gate (`grep -rn usesV23CommandCoverage src/` returns exactly the
computation at line 368 and the pass-through at line 463 — no test exercises it directly either).
Source reading and the empirical run agree; the empirical run is what settles it per the goal's
own instruction not to reason from source alone.

## Answer

**No — #276 and #277 did not move v22's (or v17's) A1-NO-COVERAGE-CONFIG coverage decisions.**
All four `(pin × rubricVersion)` combinations produced byte-identical A1 signals across all 24
fixtures. This is scoped to the shapes enumerated above and the gaps named alongside them —
absence of divergence on tested shapes is not evidence about untested ones (recipe dependency
chains beyond one hop, monorepo nesting, lifecycle-hook chaining, and the `pnpm run /regex/`
dynamic-selector form most notably). Within that scope, the cycle-12 figure's exposure to #276/
#277 through `A1-NO-COVERAGE-CONFIG` is not supported by this measurement.

## Refused

Nothing in `src/witan` was changed. No divergence was found, so there was nothing to leave
written down as a stop-and-report divergence. No file under `docs/calibration/` or
`docs/experiments/` was touched.
