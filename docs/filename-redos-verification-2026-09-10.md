# Filename ReDoS remediation — 2026-09-10

**CONSTRAINTS-VERSION: 2026-08-01.5**

Card 1, RED; PR https://github.com/BargLabs/cejel/pull/299.
Baseline freshly fetched origin/main: `e09f82174c80867e3e2ee7871a16fcc4d55901fa`.
Policy read with `git show origin/main:CLAUDE.md` and
`git show origin/main:docs/standing-constraints.md`.
Work performed in an isolated clone, branch `codex/cejel-regex-redos-20260910`.
PR #290 was OPEN at `a31b4ddd3fac5c07164adc20231676807ead32ab`; its only changed file
was `src/witan/__tests__/pem-private-key-v23.test.ts`, so there was no source overlap.

## Boundary and compatibility

Repository filenames reach `collectA2IsolationEvidence` through the public scan's file inventory.
Both current-tree and Git-history classification use `isEnvTemplatePath`. Both constants now
use `(?:\.[^/]+)?`, preserving the rest of each expression. V47's six translated suffixes
are intentional; each expression is compared only with its own previous version.

A nonempty sequence of old repeated groups concatenates to one dot followed by at least one
non-slash character, since that character class already accepts dots. Thus one optional group
accepts exactly the same language. Removing the repeated group removes exponential partitioning;
the optional group and fixed suffix alternatives take linear work within each slash-delimited
component. This reasoning accompanies, rather than replaces, executed compatibility tests.

The 349-name corpus includes positives, negatives, no-dot names, consecutive dots, a dot-only
middle segment, a trailing dot, and a slash within the middle segment. Both comparisons have an
empty diff. The initially prescribed dot-excluding replacement was withdrawn after counterexamples;
it was never applied to production source.

## Regression guard: red then green

The AST inventory tests **all 458 regex literals in 25 production `src/witan` TypeScript files**,
a superset of literals applied to filenames. It excludes tests and includes content regex literals.
Eight adversarial families produce 3,664 checks. Each has a VM-enforced 50 ms timeout that interrupts
regex execution, rather than a Promise timeout unable to interrupt synchronous work. Failures name
the source location, expression and input family. The inventory is recomputed on each run.
This bounded literal inventory does not cover `new RegExp` constructors, dependencies, other source
directories, or all possible inputs; it is not a scanner-wide absence-of-ReDoS claim.

Command, run at test-only commit `d13a5f8` before applying the source fix, exit 1:

```sh
node node_modules/vitest/vitest.mjs run src/__tests__/regex-redos-guard.test.ts
```

```text

 RUN  v2.1.9 /private/tmp/cejel-orch-20260910-codex

stdout | src/__tests__/regex-redos-guard.test.ts > scan regex literals finish each adversarial family within 50 ms
Examined 458 regex literals across 25 production witan files; 8 families each; 4 failures.

stdout | src/__tests__/regex-redos-guard.test.ts > each env-template pattern preserves its own previous classifications
ENV_TEMPLATE_PATTERN: 349 filenames; diff=[]
ENV_TEMPLATE_PATTERN_V47: 349 filenames; diff=[]

 ❯ src/__tests__/regex-redos-guard.test.ts (2 tests | 1 failed) 977ms
   × scan regex literals finish each adversarial family within 50 ms 975ms
     → src/witan/repo-signals.ts:4766 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist)$/i family=env-dotted-rejection: Error: Script execution timed out after 50ms
src/witan/repo-signals.ts:4766 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist)$/i family=env-dotted-rejection-255: Error: Script execution timed out after 50ms
src/witan/repo-signals.ts:4768 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i family=env-dotted-rejection: Error: Script execution timed out after 50ms
src/witan/repo-signals.ts:4768 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i family=env-dotted-rejection-255: Error: Script execution timed out after 50ms: expected [ …(4) ] to deeply equal []

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/regex-redos-guard.test.ts > scan regex literals finish each adversarial family within 50 ms
AssertionError: src/witan/repo-signals.ts:4766 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist)$/i family=env-dotted-rejection: Error: Script execution timed out after 50ms
src/witan/repo-signals.ts:4766 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist)$/i family=env-dotted-rejection-255: Error: Script execution timed out after 50ms
src/witan/repo-signals.ts:4768 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i family=env-dotted-rejection: Error: Script execution timed out after 50ms
src/witan/repo-signals.ts:4768 /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i family=env-dotted-rejection-255: Error: Script execution timed out after 50ms: expected [ …(4) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "src/witan/repo-signals.ts:4766 /(^|\\/)\\.env(?:\\.[^/]+)*\\.(?:example|sample|template|dist)$/i family=env-dotted-rejection: Error: Script execution timed out after 50ms",
+   "src/witan/repo-signals.ts:4766 /(^|\\/)\\.env(?:\\.[^/]+)*\\.(?:example|sample|template|dist)$/i family=env-dotted-rejection-255: Error: Script execution timed out after 50ms",
+   "src/witan/repo-signals.ts:4768 /(^|\\/)\\.env(?:\\.[^/]+)*\\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i family=env-dotted-rejection: Error: Script execution timed out after 50ms",
+   "src/witan/repo-signals.ts:4768 /(^|\\/)\\.env(?:\\.[^/]+)*\\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i family=env-dotted-rejection-255: Error: Script execution timed out after 50ms",
+ ]

 ❯ src/__tests__/regex-redos-guard.test.ts:62:41


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  19:02:03
   Duration  1.27s (transform 14ms, setup 0ms, collect 159ms, tests 977ms, environment 0ms, prepare 30ms)

```

Same command after source fix `a34c85f`, exit 0:

```text

 RUN  v2.1.9 /private/tmp/cejel-orch-20260910-codex

stdout | src/__tests__/regex-redos-guard.test.ts > scan regex literals finish each adversarial family within 50 ms
Examined 458 regex literals across 25 production witan files; 8 families each; 0 failures.

 ✓ src/__tests__/regex-redos-guard.test.ts (2 tests) 753ms
   ✓ scan regex literals finish each adversarial family within 50 ms 751ms
stdout | src/__tests__/regex-redos-guard.test.ts > each env-template pattern preserves its own previous classifications
ENV_TEMPLATE_PATTERN: 349 filenames; diff=[]
ENV_TEMPLATE_PATTERN_V47: 349 filenames; diff=[]


 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  19:02:34
   Duration  1.04s (transform 13ms, setup 0ms, collect 161ms, tests 753ms, environment 0ms, prepare 25ms)

```

## Timing table

```sh
node scripts/env-template-regex-timings.mjs e09f82174c80867e3e2ee7871a16fcc4d55901fa
```

Node v26.7.0; baseline e09f82174c80867e3e2ee7871a16fcc4d55901fa; 1000 ms hard timeout per case.
| Pattern | Bytes | Before ms | After ms |
|---|---:|---:|---:|
| ENV_TEMPLATE_PATTERN | 14 | 0.051 | 0.072 |
| ENV_TEMPLATE_PATTERN | 18 | 0.036 | 0.038 |
| ENV_TEMPLATE_PATTERN | 22 | 0.003 | 0.001 |
| ENV_TEMPLATE_PATTERN | 64 | TIMEOUT (>1000) | 0.004 |
| ENV_TEMPLATE_PATTERN | 255 | TIMEOUT (>1000) | 0.004 |
| ENV_TEMPLATE_PATTERN_V47 | 14 | 0.067 | 0.201 |
| ENV_TEMPLATE_PATTERN_V47 | 18 | 0.041 | 0.115 |
| ENV_TEMPLATE_PATTERN_V47 | 22 | 0.005 | 0.004 |
| ENV_TEMPLATE_PATTERN_V47 | 64 | TIMEOUT (>1000) | 0.004 |
| ENV_TEMPLATE_PATTERN_V47 | 255 | TIMEOUT (>1000) | 0.005 |

Each input is exactly the stated number of ASCII bytes: `.env`, a dotted-a prefix truncated to
fill the required length, then `!`. Single-case wall-clock measurements include first-use compilation;
short timings are noisy and are not a fitted growth curve. The 64/255-byte baseline cases were
interrupted at the hard one-second timeout. After-fix 255-byte cases returned below 0.01 ms.

## Required checks

```sh
PREFLIGHT_NO_INSTALL=1 bash scripts/preflight_fast.sh
```

```text
=== Cejel fast preflight (tsc — same check as CI's ci.yml typecheck step) ===

--- pnpm run typecheck (tsc --noEmit) ---

> @cejel/cejel@0.4.9 typecheck /private/tmp/cejel-orch-20260910-codex
> tsc --noEmit -p tsconfig.json

PASS: typecheck

preflight_fast: OK — typecheck passed.
```

Dependencies were copied into this isolated clone from the existing installation. The initial
sandboxed preflight could not fetch/verify the pinned pnpm release. The test-only commit was pushed
while that first preflight was still pending; this was a sequencing deviation. Direct `tsc` passed
before the source-fix commit; the exact preflight later passed with network access before subsequent
commits. No guard or package-manager verification was disabled.

```sh
node node_modules/vitest/vitest.mjs run src/witan
```

```text
 Test Files  33 passed (33)
      Tests  518 passed (518)
   Start at  19:03:35
   Duration  15.70s (transform 846ms, setup 0ms, collect 3.69s, tests 77.99s, environment 3ms, prepare 1.41s)

```

The first full-suite attempt had 31 passing files and two Chrome startup failures caused by the
sandbox's denied Mach-port registration. The full rerun with Chrome launch permission passed all
33 files / 518 tests. No test was skipped or modified to bypass that failure. No CI wait was used.

The staged lesson has `stagingVersion: 2`, empty anchors, a `pr-merged` move condition naming
BargLabs/cejel #299, and a measured 665-character statement. General lesson: remove ambiguous
repetition without changing the accepted language; prove compatibility on edge cases and bound
adversarial execution with an interruptible guard. An input-driven scanner hang defeats its purpose.

## Delivery limits

Version and changelog are prepared for 0.4.9. No merge, tag, npm publication, binaries, Homebrew,
MCP registry, Docker/Action distribution, or site update was performed. Those remain the release
lane's work. Root `DEPLOY.md` named by the card is absent in this repository; the available
`docs/release-process.md` was read. Merging is not publication. Other audit items concerning public
material, site currency, fast-uri and third-party notices remain separate decisions.

The RED card requires the operator to read the diff and run the exploit before merging.
Next-session reap preview: `alfred reap` (not run here); this isolated clone is not a `.worktrees`
entry and therefore is not managed by that command.
