# Ruling — v26 item 8: when A3 "no build or type-check script" may fire

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Status:** ruled by the operator; this file's commit carries the operator's signature.
- **Date:** 2026-10-15.
- **Applies to:** `witan-rubric-v26-prospective-2026-10-14` only. It is prospective and
  explicit-only; the public default stays v17.

## Authority

The operator ruled on 2026-10-15 that this finding, like the two in item 6
(`docs/calibration/v26/ruling-item-6.md`), fires only when the repository's own bytes settle it.
Otherwise it abstains. This record states the evidence that settles it, before any code.

## What the finding asserts today

Under v20 through v26, A3 reports an info finding ("A deployable service package manifest declares
neither a build nor a typecheck script.") when A3 has a deployable-service signal and no read
`package.json` script is named `build` or `typecheck`. Since #479 the root and the declared
workspace packages are read. The finding does not fire under v17, v18 or v19.

## Why the current check does not settle it

The finding's claim is that the deployed package has no build or type-check step. The check reads
only two script names. A step can exist and not be found:
- a script under another name whose command compiles or type-checks (`compile`, `tsc`, `check`);
- a CI step that runs the compiler directly;
- a container build stage that runs it;
- a task-runner target (`Makefile`, `justfile`).

And a package can have no step to perform: plain JavaScript run as written has nothing to compile
and no type checker configured.

## Evidence that settles it — the finding fires only when all three hold

1. **B-1, there is something to build or check.** The package the manifest belongs to contains
   authored TypeScript source (`.ts`, `.tsx`, `.mts`, `.cts`, excluding `.d.ts`) or a
   `tsconfig*.json`. A package with neither is outside the rule: no finding and no disclosure line,
   because nothing was left unsettled.
2. **B-2, no step performs it in anything read.** None of these runs a compiler, type checker or
   bundler from a fixed, tested vocabulary (for example `tsc`, `vue-tsc`, `tsup`, `esbuild`,
   `swc`, `babel`, `rollup`, `webpack`, `vite build`, `next build`, `nest build`, `ncc`, and a
   task runner's `build` or `typecheck` target):
   - any script, under any name, in the root or a declared workspace `package.json`;
   - any `run` command in a CI workflow the scan read, including a package-manager call to a script
     that does;
   - any `RUN` instruction in a tracked Dockerfile, on the same terms;
   - any target in a tracked `Makefile`, `GNUmakefile` or `justfile`, on the same terms.

   When a step is found, there is no finding and nothing to disclose.
3. **B-3, every place a step could be was read.** No CI workflow was withheld from reading, no CI
   step delegates to a reusable workflow or local action the scan did not read, no Dockerfile or
   task-runner file was withheld, and the workspace read cap left no manifest unread.

   When B-1 holds, B-2 finds nothing, and B-3 fails, there is no finding. The certificate's "What
   was not established" section carries: "Whether this package has a build or type-check step
   outside the files read cannot be settled from static evidence; Cejel makes no finding on it."

When all three hold, the finding fires with its current wording and cites the manifest, as today.

## What is unchanged

- every metric, including A3 `prod_readiness_primitives` and its "build or type-check command"
  component. Whether that component should credit a step found outside the package scripts is not
  decided here;
- the other A3 findings and their wording;
- the existing order of A3's explicit-gap checks. They are one if / else-if chain: where this
  finding stops firing, the Dockerfile `HEALTHCHECK` and health-route checks that follow it are
  evaluated, as #479 already records. That consequence is reported, not prevented;
- v17 and v18–v25, which stay byte-stable.

## Constraints on the implementation

- **Gating:** gated on the v26 identifier alone.
- **Abstention form:** the disclosure line plus the absence of the finding, never criterion-level
  `insufficient_data`.
- **The vocabulary** in B-2 is a fixed list in the implementation, matched as a command word after
  shell splitting, not as a substring, and tested positively and negatively. A command it cannot
  parse is not read as an absence: it is treated like an unread place under B-3, so the finding
  does not fire and the disclosure line is carried.
- **Fixtures:** synthetic only. One positive and one negative fixture for each of B-1, B-2 (each of
  the four places) and B-3 (each unread kind), plus a fixture asserting the disclosure line.
- **The change record** states, measured on the behaviour corpus, how many specimens change A3
  findings and A3 status under v26 against v25, in each direction, including any specimen where a
  following explicit-gap check now fires, read from the measurement output and not estimated.
