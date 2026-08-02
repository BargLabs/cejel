# AGENTS.md — Cejel

Conventions and context for AI agents working in this repository (Codex, Cursor, Cline,
Aider, and any non-Claude-Code agent that reads `AGENTS.md` by convention).

For Claude Code specifically, also read `CLAUDE.md`.

## Read this first — non-negotiable

**[`docs/standing-constraints.md`](docs/standing-constraints.md)**

Safety-relevant constraints on secrets, guards, experiment integrity and evidence
discipline. Several were earned from specific production incidents and the file names them.

**Echo the `CONSTRAINTS-VERSION` line from that file in your report.** A report without it
did not read the constraints, and nothing else about the report will reveal that.

## Project

Cejel — an offline, no-LLM trust-certificate CLI. It scores a repository against a published
rubric and writes a certificate. Published as `@cejel/cejel` on npm, plus standalone binaries
for five native targets on GitHub releases.

## Hard rules

- **Offline by construction.** The offline-boundary guard is a structural test, not a
  convention. Do not add a network dependency to the scan path, and do not weaken the guard
  to make anything pass.
- **The product is an assertion, not a coverage claim.** A certificate that says something
  false is worse than one that misses something. Precision over recall, always.
- **Never weaken a rubric criterion or a guard to make a scan produce a nicer number.**
- **Preregistration commits must remain strict ancestors of result commits.** Do not edit a
  preregistration after a run; corrections go in a separate errata document.

## Before you commit

- `pnpm build`, the full test suite, and the offline-boundary guard must pass.
- Explicit paths on `git commit`. Never `git commit -am` — multiple agents write to these
  trees concurrently and `-am` has swept unrelated work into the wrong commit before.
- Push any branch that has no remote ref before doing anything else with it.
