# A1 coverage-configuration recognition — 2026-10-14

**CONSTRAINTS-VERSION: 2026-08-01.5**

This is a recognition fix under every selectable rubric. It ships the way #459, #427, #430 and
#479 did: no identifier bump, and weights and thresholds unchanged. Fingerprints and goldens are
re-pinned, and each delta is recorded in `leaderboard/RUBRIC_CHANGELOG.md`. The release that
carries it runs a preregistered public before-and-after, and the operator runs the private
labelled-case check before that release. This change runs neither.

## The defect

When `isCoverageConfig` matches nothing, A1 reports "Test suite files are present, but no coverage
configuration was detected". The evidence that nothing matched is real. The conclusion is wrong
whenever coverage is configured somewhere the detector does not look. Under every rubric except
v23, the detector did not look in two kinds of place:

- Commands. A reachable `vitest run --coverage`, `pytest --cov` or similar flag was invisible.
  v23 alone carried this recognition.
- Configuration locations each tool documents but the detector did not read.

## The change

### 1. v23's command-flag recognition, under every rubric

`analyzeCoverageConfiguration` now runs under every rubric. That covers:

- coverage flags on commands reachable from a test entry point: CI run steps, reachable package
  scripts, reachable Make/just recipes, tracked shell wrappers;
- v23's disabled-value rules;
- the unresolved-reachability abstention: "the no-coverage absence claim was withheld".

Under every rubric except v23 the analysis is **added to** the v17 heuristics, never substituted
for them. v17's legacy coverage files keep their order ahead of the additions, because
`coverage_percent` reads the first four. The change can therefore only withdraw an absence, never
assert a new one.

Two v23 behaviours could assert a new finding, so they stay v23-only. Their gate is renamed from
`usesV23CommandCoverage` to `usesV23StrictCoverageAndRecipeRunners`:

- v23 replaces the v17 heuristics instead of adding to them;
- v23 counts a just/Make `test:` recipe as a configured test runner.

Under v17 a Makefile `test:` target already is one; a justfile is the v23-only case.

v23's behaviour does not change. The V23 declaration in `rubric-version.ts` now says that
mechanism 1's recognition ships under every rubric, and names what stays v23-only. The four
declared-scope tests (v23, v24, v25, v26) pin the renamed marker. The total
`WITAN_RUBRIC_VERSION_V23` reference count is unchanged at 11.

### 2. Documented configuration locations, every rubric

Each idiom was verified against the tool's own documentation. Published pages could not be
loaded from this session (web fetch was not permitted), so each project's documentation source
was read on GitHub at its default branch on 2026-10-14. Each URL below is the page that source
builds. Codecov is the exception noted in its row.

| Idiom | Rule | Documentation |
| --- | --- | --- |
| `.codecov.yml`, `.codecov.yaml` | file present | <https://docs.codecov.com/docs/codecov-yaml>; filenames confirmed in Codecov's own CLI source (`codecov_cli/helpers/config.py`: `codecov.yml`, `codecov.yaml`, `.codecov.yml`, `.codecov.yaml`). The docs page was not loaded from this session. |
| `.nycrc`, `.nycrc.json`, `.nycrc.yml`, `.nycrc.yaml` | file present | <https://github.com/istanbuljs/nyc#readme> (configuration-files table). `.nycrc.yaml` is in the same table as the card's three forms. |
| `.c8rc`, `.c8rc.json` | file present | <https://github.com/bcoe/c8#readme> ("c8 searches for files named `.c8rc`, `.c8rc.json`, `.nycrc`, or `.nycrc.json`") |
| `setup.cfg` / `tox.ini` `[coverage:run]` / `[coverage:report]` | an uncommented section header | <https://coverage.readthedocs.io/en/latest/config.html> ("In setup.cfg or tox.ini, the section names have 'coverage:' prefixed") |
| `package.json` `"jest"` key | `collectCoverage: true`, a `coverageThreshold` object, or a `coverageProvider` string (the same keys v23 reads in `jest.config`) | <https://jestjs.io/docs/configuration> |
| `vite.config.[cm]?[jt]s` `test.coverage` | the `test` block's own `coverage` property, under v23's disabled-value rules; not credited when a sibling `vitest.config.*` exists unless it merges `./vite.config` | <https://vitest.dev/config/> ("add `test` property in your Vite config"; `vitest.config` takes priority over `vite.config`) |
| Ruby `.simplecov` | an uncommented line referencing `SimpleCov` | <https://github.com/simplecov-ruby/simplecov#readme> ("Configuration goes in your start block, or in a `.simplecov` file at the project root") |
| PHP `phpunit.xml(.dist)` `<coverage>` | the element outside XML comments | PHPUnit manual, XML configuration file chapter, "The `<coverage>` Element" (<https://docs.phpunit.de/en/13.3/>; read from the documentation source, exact page slug not verified) |
| JaCoCo in `pom.xml` | `jacoco-maven-plugin` in a `<plugin>` outside `<pluginManagement>` and XML comments, not `<skip>true</skip>`, no `<jacoco.skip>true</jacoco.skip>` | <https://www.jacoco.org/jacoco/trunk/doc/maven.html>; `<pluginManagement>` "only configures plugins that are actually referenced within the plugins element": <https://maven.apache.org/pom.html> |
| JaCoCo in `build.gradle(.kts)` | `id 'jacoco'` / `id("jacoco")` / Kotlin `jacoco` inside `plugins { }`, or `apply plugin: 'jacoco'`, outside comments | <https://docs.gradle.org/current/userguide/jacoco_plugin.html> |
| Rust `tarpaulin.toml`, `.tarpaulin.toml` | file present | <https://github.com/xd009642/tarpaulin#readme> ("if a `.tarpaulin.toml` or `tarpaulin.toml` is present … that will be used") |

**Dropped candidate: `coverlet` referenced in a `.csproj`.** Coverlet's own documentation says a
package reference does not collect anything. Collection needs `dotnet test --collect:"XPlat Code
Coverage"` (coverlet.collector) or `/p:CollectCoverage=true` (coverlet.msbuild):
<https://github.com/coverlet-coverage/coverlet>, `Documentation/VSTestIntegration.md` and
`Documentation/MSBuildIntegration.md`.
The same documentation says `coverlet.collector` "is included by default with xunit template test
(`dotnet new xunit`)". Crediting the reference would therefore credit every templated test
project: a dependency proving nothing, which v23's own rule already excludes. Setting
`<CollectCoverage>` as a csproj property is not documented there either. The documented command
forms are recognized under item 3 instead. A near-miss test pins the drop.

### 3. Coverage flags on test commands, every rubric

These go through the shared evaluator, so they apply to CI run steps (the card's scope) and to
reachable scripts and recipes alike, under the same flag-ownership rules.

| Idiom | Ownership rule | Documentation |
| --- | --- | --- |
| `pytest --cov` | already a v23 runner; now under every rubric | <https://pytest-cov.readthedocs.io/> (configuration: `--cov`, `--no-cov`) |
| `python -m pytest --cov` | `-m pytest` must be the first interpreter argument | <https://docs.pytest.org/en/stable/how-to/usage.html> ("calling via `python` will also add the current directory to `sys.path`", otherwise equivalent) |
| `go test -cover` / `-coverprofile` / `-covermode` / `-coverpkg` | `go test` only; flags after `-args` belong to the test binary; `-cover=false` disables; a `$` value is unresolved | <https://pkg.go.dev/cmd/go> (testing flags: `-covermode`, `-coverpkg`, `-coverprofile` each "Sets -cover") |
| `dotnet test --collect "XPlat Code Coverage"` / `"Code Coverage"`, `/p:CollectCoverage=true` | `dotnet test` only; arguments after `--` are RunSettings, not options | <https://learn.microsoft.com/dotnet/core/testing/unit-testing-code-coverage>, <https://learn.microsoft.com/dotnet/core/tools/dotnet-test-vstest>, coverlet MSBuildIntegration.md |
| `cargo llvm-cov` | collects unless `report`, `clean`, `show-env`, `run` or `--no-run` (no tests run) | <https://github.com/taiki-e/cargo-llvm-cov#readme> |

Where ownership cannot be resolved, for example `go test -cover=$WITH_COVERAGE`, the existing
abstention applies and the absence is withheld with the note.

### Pattern sets

Each finding's derivation is the public identity of the matcher family. The code's own rule is
that changing a branch requires a new ID. So `cejel.core-a1.coverage-configuration.v1` (10,
every rubric but v23) and `.v2` (14, v23) are retired:

- `.v3` (29) applies to every rubric but v23;
- `.v4` (25) applies to v23.

The branch enumeration is in the comment above `INVENTORY_SCAN_PATTERN_SETS`.

## Red first

`src/witan/__tests__/coverage-config-recognition.test.ts` was run against the unfixed source
(e43ab760): 93 tests, 46 failed, 47 passed.

- **Failed:** every positive (v17 was blind to each idiom), plus the pattern-set disclosure test.
- **Passed:** every near-miss and every control.

After the fix there are 94 tests, all passing. One near-miss was added during the guard-deletion
step (see below). `coverage-command-recognition-v23.test.ts`: 27 of 27.

**One v23 test changed.** Its first case, "keeps v17 as the public default and leaves v22 coverage
recognition unchanged", asserted that v22 still fired the absence for a reachable
`vitest --coverage`, under pattern set v1/10. That assertion pinned the gate this card removes, so
it cannot pass unchanged under item 1. Its v22 half now asserts the extension. Its v17-default and
v23 halves are unchanged. Every other v23 test passes unchanged.

## Guard deletions

Each guard was deleted alone from the fixed source, the new suite run, and the source restored.

| Guard deleted | Red | Named test(s) |
| --- | --- | --- |
| vite disabled-value rule (any `coverage` key in `test` counts) | 2 | `near-miss: coverage disabled with enabled: false`, `near-miss: coverage: false` |
| comment stripping, `vite.config` | 1 | `near-miss: coverage inside a multi-line block comment` |
| comment stripping, XML (phpunit, pom) | 2 | `PHPUnit … near-miss: the element inside an XML comment`, `Maven … near-miss: the plugin inside an XML comment` |
| comment stripping, Gradle | 2 | `near-miss: the plugin line commented out`, `near-miss: the plugin inside a block comment` |
| comment-line exclusion, `.simplecov` | 1 | `near-miss: every line commented out` |
| comment anchor, `setup.cfg`/`tox.ini` section header | 1 | `near-miss: a commented-out section` |
| flag ownership: `go test -args` cutoff | 1 | `near-miss: a cover flag after -args belongs to the test binary, not go test` |
| flag ownership: `dotnet test --` cutoff | 1 | `near-miss: --collect after -- is a RunSettings argument, not a dotnet test option` |
| flag ownership: `test` subcommand on go/dotnet | 2 | `near-miss: -cover on go vet`, `near-miss: --collect on dotnet build` |
| flag ownership: `-m pytest` module | 1 | `near-miss: --cov handed to a different python module` |
| flag ownership: cargo llvm-cov no-test exclusions | 3 | `near-miss: cargo llvm-cov report / --no-run / clean runs no tests` |
| legacy union (v17 uses v23's analysis alone) | 1 | `adds to v17 recognition rather than replacing it: a script named coverage still counts` |

**The first vite comment-stripping deletion turned nothing red.** The near-miss then in the suite
was a `// coverage: …` line comment. The property pattern already refuses a line that starts with
`//`, so that fixture never reached the stripper. A multi-line block comment with `coverage:` on
its own line does reach it, and that near-miss was added. With it, the deletion turns 1 test red.

## Behaviour corpus

Three synthetic specimens extend the corpus from 19 to 22:

- `coverage-config-setup-cfg`;
- `coverage-config-maven-jacoco`;
- `coverage-command-go-ci`.

The previous scanner (e43ab760, in a detached worktree) and this change each scored the same
22-specimen corpus under all ten selectable rubrics. All 22 fixture HEAD SHAs were equal in both
runs.

Before trusting the numbers, the pipeline's own output was checked against the committed record.
On e43ab760 it reproduces all ten committed fingerprints over the original 19 specimens. On this
change it reproduces v23's alone, because only `complete-node-service` moves, and not under v23.

220 specimen/rubric surfaces were compared, and 39 moved.

**The card expected every existing specimen to stay identical. One cannot.** The existing
`complete-node-service` specimen's `test` script is `vitest run --coverage`, a reachable coverage
flag that v23 already credited. Every other rubric fired a false absence on it. Item 1 exists to
withdraw exactly that, so the specimen moves under the nine rubrics other than v23. The other 18
existing specimens are identical under all ten rubrics (180 of 180).

| Specimen | Rubrics | A1 | A1 info findings | Metric | Code trust | Overall |
| --- | --- | --- | --- | --- | --- | --- |
| `complete-node-service` (existing) | v17-v22, v24-v26 (not v23) | 2.2 → 2.4 | 1 → 0 | `verification_script_ratio` 3 → 4 | +0.1 (v17 2.5 → 2.6; v18-v24 2.7 → 2.8; v25/v26 2.8 → 2.9) | unchanged, except v25/v26 3.0 → 3.1 |
| `coverage-config-setup-cfg` (new) | all ten | 2.1 → 3.1 | 1 → 0 | `coverage_percent` 0 → 85 (`fail_under = 85`) | 2.1 → 3.1 | 1.6 → 2.1 |
| `coverage-config-maven-jacoco` (new) | all ten | 2.1 → 2.1 | 1 → 0 | none | unchanged | unchanged |
| `coverage-command-go-ci` (new) | all ten | 2.1 → 2.3 | 1 → 0 | `verification_script_ratio` 1 → 2 | 1.3 → 1.4 | 1.2 → 1.3 |

The v25/v26 declared collision still holds.

## Golden re-pins

No pinned v17 metric moved; those assertions run before every hash assertion. What moved, and
how each previous pin is recovered:

- **v17 golden, four fixtures.** The fingerprint moved. Two fixtures (`delegating-test-script`,
  `pr-template-directory-form`) also carry the A1 no-coverage finding, whose derivation now names
  v3/29. Restoring exactly the previous fingerprint and v1/10 on that one derivation reproduces
  all four previous pins byte for byte. Restoring the fingerprint alone recovers the two fixtures
  that have no coverage finding, and does not recover the two that have one. Every older
  recovery chain starts from the restored report.
- **CLI byte pin, and F2 reads-disclosure under v17, v22, v23 and v25.** Neither fixture carries a
  coverage finding. Restoring only the previous fingerprint reproduces each previous pin.
- **`v23-declared-scope-byte-stability`, v17 and v22.** This fixture's test script is
  `vitest run --coverage`, so its A1 signal really changes: the false absence is withdrawn, and
  `package.json` is cited as coverage. The test now proves three things mechanically:
  - the output outside the A1 signal is byte-identical to e43ab760's (pins captured there);
  - substituting the previous A1 signal (captured from e43ab760, the same under v17 and v22)
    reproduces the previous pin;
  - the pre-1.3 `withheldPaths` recovery still holds from that restored output.
- **`derivation-emission`.** v23 now emits pattern set v4/25.

## Verification

Filled in at the end of the run; see the PR body.
