# A3/B3 read declared workspace package scripts — 2026-10-14

**CONSTRAINTS-VERSION: 2026-08-01.5**

A recognition fix under every selectable rubric, shipped the way #459, #427 and #430 were: no
identifier bump, weights and thresholds unchanged, fingerprints and goldens re-pinned with each
delta recorded in `leaderboard/RUBRIC_CHANGELOG.md`. The release that carries it runs a
preregistered public before-and-after, and the operator runs the private check before that
release. This change runs neither.

## The defect

In npm, yarn and pnpm workspaces the root `package.json` often only orchestrates, and the scripts
live in the workspace packages. Two checks read the root alone and so asserted an absence the
repository does not have:

- A3's v20+ explicit-gap finding, "A deployable service package manifest declares neither a build
  nor a typecheck script" (v20 through v26; v17-v19 do not carry it).
- B3's `ci_script_depth` package-script component, under every rubric including v17.

## The change

Declared workspace packages are discovered from what the workspace declares, and nothing else:

- the root `package.json` `workspaces` field, array form
  (<https://docs.npmjs.com/cli/v10/using-npm/workspaces>) and yarn's `{ packages: [...] }` form
  (<https://classic.yarnpkg.com/lang/en/docs/workspaces/>);
- the `packages:` list of a root `pnpm-workspace.yaml` (<https://pnpm.io/pnpm-workspace_yaml>).

Globs are matched against package directories in the scan's existing file inventory (the git
tracked list), never a filesystem walk. `*`, `?` and whole-segment `**` are supported; wildcards
do not match a leading-dot segment. A `!` pattern excludes what it matches. Each manifest must pass
A1's authored-production predicate (`isAuthoredProductionPath`). Bounds: at most 64 patterns (more
discards the declaration) and at most 200 manifests read, in path order. Failure goes toward the
old root-only behaviour, never toward a credit: an unparseable negation or an unreadable
declaration discards the whole declaration, and an unparseable positive pattern matches nothing.
No declaration means no change: workspaces are never inferred from directory shape.

- **A3.** The finding's `hasBuildOrTypecheck` is true when the root or any declared workspace
  package declares `build` or `typecheck`. A capped read with no match does not assert the
  absence. When the finding fires it still cites the root `package.json`, and its evidence label
  states how many declared workspace manifests were read. The summary sentence is unchanged.
- **B3.** `ci_script_depth` counts a script category once when the root or any declared workspace
  package declares it (`test` still needs a credible runner). The #467 disclosure line states the
  count read, for example `package scripts for this metric are read from the root package.json and
  7 declared workspace package.json files`.

Deliberately unchanged: A3's `prod_readiness_primitives` "build or type-check command" component
still reads the root alone, and its #467 root-only disclosure still says so. The card scoped A3 to
the v20+ finding ("v17 does not carry this finding, so this part affects v20 through v26"), and
moving that component would move v17 A3. B3's evidence gate is also unchanged: a workspace script
adds metric credit but no evidence pointer, so a monorepo with no root scripts and no CI workflow
still abstains on B3 as before.

## The coupling

In `collectA3ProdReadinessEvidence`, the v20 explicit-gap findings form one `if / else if` chain:
(1) a manifest without a build or typecheck script; else (2) a runtime Dockerfile without an
active HEALTHCHECK; else (3) an HTTP entrypoint without a health route. When branch 1 stops firing
on a workspace monorepo, branches 2 and 3 start running there. The chain is not restructured. The
test `the A3 explicit-gap chain after branch 1 stops firing on a workspace monorepo` pins it: a
workspace monorepo with `build` in a package and a runtime Dockerfile without HEALTHCHECK gets the
HEALTHCHECK finding after the fix, under v20 through v26.

## Red first

`src/witan/__tests__/workspace-package-scripts.test.ts` against the unfixed source (6bf2d929):
59 tests, 50 failed, 9 passed. The 9 that passed are the controls that must not move: the seven
no-declaration A3 cases and the two B3 no-declaration and placeholder cases. After the fix: 60
tests (the read-cap case was added with the fix), all passing.

## Guard deletions

Each guard was deleted alone from the fixed source, the new suite run, and the source restored.

| Guard deleted | Tests turned red | Named test |
| --- | --- | --- |
| `!` negation handling (exclusion list ignored) | 14 | `a \`!\` negation that excludes the only package with build leaves the finding firing` and `a pnpm \`!\` negation is honoured the same way`, v20-v26 each |
| authored-production filter (`isAuthoredProductionPath`) | 7 | `vendored and generated manifests a workspace glob reaches are not counted`, v20-v26 |
| workspace-declaration requirement (no declaration read as `**`) | 8 | `no workspace declaration: a nested manifest with build changes nothing`, v20-v26, and `without a workspace declaration the nested test script is not read under v17 (unchanged)` |

The vendored case needs a `generated/` manifest to go red. A tracked `node_modules/**/package.json`
never reaches the scan inventory: `HARD_EXCLUDED_PATH_PATTERN` drops it before any collector. With
the authored-path filter deleted and only the `node_modules/` manifest in the fixture, all 60 tests
passed. So the `node_modules/` assertion is real but guarded upstream; the `generated/` one is what
the filter alone protects.
