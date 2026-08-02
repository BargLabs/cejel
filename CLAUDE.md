# CLAUDE.md — Cejel

Canonical instructions for Claude Code in this repository. Non-Claude agents read
`AGENTS.md`, which carries the same constraints.

## Read this first — non-negotiable

**[`docs/standing-constraints.md`](docs/standing-constraints.md)**

Safety-relevant constraints on secrets, guards, experiment integrity and evidence
discipline. Several were earned from specific production incidents and the file names them.

**Echo the `CONSTRAINTS-VERSION` line from that file in your report.** A report without it
did not read the constraints, and nothing else about the report will reveal that.

## What Cejel is

An offline, no-LLM trust-certificate CLI. It scores a repository against a published rubric
(`witan-rubric-v*`) and writes a certificate with cited evidence. Distributed as
`@cejel/cejel` on npm and as standalone binaries for five native targets.

The product is an **assertion**, not a coverage claim. A certificate that asserts something
false is a category worse than one that misses something — recall gaps are a known limitation
of all static analysis and are priced in; false assertions are not.

## Hard rules

- **Offline by construction.** `src/__tests__/offline-boundary-guard.ts` is structural. Do not
  add a network dependency to the scan path. Do not weaken the guard.
- **Never weaken a rubric criterion or guard to produce a better score**, on this repo or any
  other.
- **Abstain rather than guess.** `insufficient_data` and `not applicable` with a stated reason
  are correct outputs. A fabricated score is not.
- **Preregistration commits stay strict ancestors of result commits.** Never edit a
  preregistration after a run. Corrections go in errata.

## Conventions

- Explicit paths on `git commit`. Never `git commit -am`.
- Push any branch with no remote ref before doing anything else with it.
- Do not touch a worktree held by a live process.
- Credential-shaped content is redacted at ingestion via the shared redactor. Do not write a
  second scrubber.
