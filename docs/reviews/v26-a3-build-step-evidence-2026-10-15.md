# Review record — v26 item 8: A3 build or type-check finding fires on settling evidence only

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Card:** `goal_cejel_v26_a3_build_step_evidence_2026-10-15`.
- **Specification:** `docs/calibration/v26/ruling-item-8.md`, operator-signed (`269fc915`, #496).
- **Gate:** `usesV26BuildStepEvidence = rubricVersion === WITAN_RUBRIC_VERSION_V26` in
  `src/witan/repo-signals.ts`; the work is in `settleV26BuildStepEvidence`.
- **Fixtures:** synthetic only, `src/witan/__tests__/fixtures/build-step-evidence-fixtures.ts`.
  Tests: `src/witan/__tests__/v26-a3-build-step-evidence.test.ts`.

## Preconditions, checked on `origin/main` `6aec9d93` before any change

1. The tag `v0.6.5` exists (`refs/tags/v0.6.5`, object `32e7f3be`).
2. `docs/calibration/v26/ruling-item-8.md` has one commit, `269fc915`, and its signature reads
   `Good "git" signature` (read with `git show -s --format=%GG`, because `%G?` is refused on this host).
3. `WITAN_RUBRIC_VERSION_V26` exists.

## Red first

The tests were committed and pushed before any implementation, as a WIP commit: 82 failed and 37
passed. The 37 that passed were the v25 baselines, the fixtures meant to fire under both rubrics,
and the metric-identity checks.

## Choices where the ruling is silent (each one fires less)

1. **v26 only narrows v25.** The v20–v25 condition stays a precondition: a script named `build` or
   `typecheck` in the root or a read workspace manifest, or the read cap, still stops the finding.
   So v26 fires on a subset of the repositories where v25 fires.
2. **B-1, "the package the manifest belongs to".** This is the root package. A file under a
   directory with its own `package.json` belongs to that package, whether or not it is a declared
   workspace. Only authored, scanned paths count (`isAuthoredProductionPath`; withheld paths do not
   count). `.d.mts` and `.d.cts` are excluded like `.d.ts`. `tsconfig*.json` is matched by basename.
3. **Vocabulary.** The ruling's examples, plus the documented build or check command of
   `webpack-cli`, `svelte-check`, `parcel build`, `bun build` and `ng build`. The task runners are
   npm, pnpm, yarn, bun, make/gmake, just, turbo, nx and lerna. A `build` or `typecheck` argument
   anywhere in such a call counts, as does Nx's `project:build`. A defined Makefile or justfile
   target named `build` or `typecheck` counts whatever it runs. An invocation such as `make build`
   counts even when no such target was read.
4. **"A package-manager call to a script that does."** Every script in every read manifest is
   scanned under any name, so a call to such a script is found through the script itself. A call
   to a script in a manifest that was not read is not resolved.
5. **Dockerfiles** are every tracked path named `Dockerfile` or `Containerfile`, case-insensitive,
   with an optional suffix, plus `*.dockerfile`. **Recipe files** are every tracked
   `isRecipeFile` path. Neither is limited to authored paths.
6. **CI.** The workflows read are A3's own set. Only GitHub Actions `run` values are read as
   commands. A GitLab, CircleCI, Azure Pipelines or Jenkins file is an unread place.
7. **Unparseable means unsettled.** This covers:
   - an unterminated quote or escape;
   - a command word that is an expansion (`$VAR`, `${{ … }}`, a backtick);
   - a package manager's `run $X`;
   - a Dockerfile heredoc, an exec form that is not a JSON array of strings, an `escape` parser
     directive, or an empty `RUN`;
   - a `package.json` that is not a JSON object, or a script that is not a string;
   - shell nesting deeper than four levels.
8. **B-3 beyond the ruling's list.** A workspace declaration that is discarded, or an include
   pattern that cannot be parsed, leaves the question unsettled. So do a withheld authored
   `package.json` and a non-regular file in any place.
9. **Shell reading.**
   - The leading keywords `if`, `then`, `else`, `elif`, `do`, `while`, `until`, `exec`, `!` and `{`
     are dropped.
   - A subshell's parentheses, split apart by segment splitting, are dropped.
   - `$(MAKE)` is read as `make`.
   - A recipe line's trailing `\` is dropped, and its continuation is read as a command of its own.
   - BuildKit `RUN --flag`s are dropped, and Dockerfile continuation lines are joined.
10. **Read failure.** A read failure on a file read only under v26 goes through the existing
    content-read contract. On the non-v23 path, that abstains A3 as a whole. Files are checked with
    `isRegularFile` before they are read, so this needs a read error after that check.

## Guard deletions

Each deletion was made alone, and only `v26-a3-build-step-evidence.test.ts` was run (119 tests).
The source was restored with `git checkout -- src/witan/repo-signals.ts` after each one.

| Deletion | Red | Named tests that turned red |
|---|---|---|
| G0 drop the v26 gate (`usesV26BuildStepEvidence` false) | 21 | every B-1, B-2 and B-3 abstention test, and the chain test |
| G1 B-1 (`hasSomethingToBuild` treated as true) | 4 | JavaScript service, declaration only, nested-package TypeScript, chain |
| G2a B-2 package scripts place | 3 | `compile` runs tsc; Dockerfile `pnpm run build:server`; unparseable workspace manifest |
| G2b B-2 CI place | 2 | a `run:` step calling `tsc --noEmit` through npx; a command Cejel cannot parse |
| G2c B-2 Dockerfile place | 2 | a continued `RUN` line calling `tsc -p .` through npx; exec form |
| G2d B-2 Makefile/justfile place | 2 | Makefile `tsc -p .`; justfile `build` target |
| G3 B-3 (unsettled read as fires) | 10 | every B-3 fixture |

## Measured

The measurements are in `leaderboard/RUBRIC_CHANGELOG.md` (2026-10-15).
- Before and after against `origin/main` `6aec9d93`, full `report.json` bytes: v17 through v25
  are 522 of 522 identical.
- Under v26, 1 of the 30 corpus specimens moves (`start-declared-http-entrypoint`: the build finding
  goes off and the health-route finding comes on), and 21 of the 28 synthetic fixtures move.
- No behaviour-fingerprint pin moved.

## Checks run

- Full suite: 129 files, 3019 tests, green.
- `pnpm run typecheck`: green.
- The offline-boundary guard is part of the suite.
