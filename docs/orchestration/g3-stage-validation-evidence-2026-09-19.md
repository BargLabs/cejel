# Stage-time seed validation evidence

**CONSTRAINTS-VERSION: 2026-08-01.5**

Tested code tree: `f4d02b313bc74c7a9c38bb839f5c2a9d264cfe1c` (before adding this report).
Execution mode: isolated macOS worktree, Node 26.7.0, pnpm 9.0.0, authorized local execution.
Canonical validator checkout: Alfred `2ea67e308f9bc364799e8ebfdfe363cdfd05ab5b`.
No private validator implementation is copied into this repository.

The selection was declared before measurement: one staged public lesson; expected one accepted
record on the fixed tree. The actual canonical validator accepted it. With the file and move
condition still present, setting its PR number to zero refused; removing stagingVersion refused.
An empty staged selection refused with `maeve_staging_zero_examined`, distinct from the successful
nonempty report's `invalidSeeds: 0`.

Derived CLI invocation (the parser accepts staged or tree mode and an explicit installed checkout):

```sh
node --import tsx scripts/validate-staged-maeve-seeds.mjs --mode staged --alfred-root /path/to/alfred
```

`staged` reads Git index blobs. `tree` reads HEAD blobs. The pre-commit hook deliberately excludes
pure deletions and declares seed validation non-applicable when no seed additions/edits exist;
the explicit validator never treats an empty selection as a validation success.

Focused selection: `pnpm exec vitest run src/__tests__/maeve-stage-validation.test.js`.
All six tests passed. Removing the canonical validation call produced two failed tests and four
passed. Removing the zero-examined refusals produced two failed tests and four passed. Original
source was restored before the full suite. These are adapter defence-removal tests, not a claim
that the public CI runner loads the private schema. Canonical property checks above were local.

Required checks: `pnpm build` passed; `pnpm test` passed 1,412 tests in 92 files, including the
41-test offline guarantee selection. No scoring or network boundary changed.

The prior main-tree missing metadata is now delivered through Cejel #338 and Alfred #1600.
This branch's new lesson is the nonempty fixed-tree specimen. The local hook needs an installed
Alfred checkout and refuses when unavailable. Public CI exercises the adapter and hook contract;
the destination harvester continues to enforce the canonical schema independently.
