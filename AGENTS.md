# AGENTS.md — Cejel

Conventions and context for AI agents working in this repository (Codex, Cursor, Cline,
Aider, and any non-Claude-Code agent that reads `AGENTS.md` by convention).

For Claude Code specifically, also read `CLAUDE.md`.

## Read this first — non-negotiable

**[`docs/standing-constraints.md`](docs/standing-constraints.md)**

Safety-relevant constraints on secrets, guards, experiment integrity and evidence
discipline. The canonical lowercase file is a historical snapshot written at the close of the
2026-08-01 session; its final open-items section records that point in time, not current repo state.
Current resolution note: ADR-0013 now records D1–D5 as exact signatures, merged in #794 at
`a33579f`. Historical counts and open-item labels must be mechanically reverified against current
repository state before action.

The Alfred and Cejel copies share a point-in-time SHA-256 pin. Each repository pins only its local
file. This is a shared point-in-time parity record and local immutability guard; neither test proves
current cross-repository byte equality. The current local SHA-256 pin is
`118d4ea48d299d8a12e7e31c1a334e694121c63c4d7ee3345ae2d36dd3c84063`. Cross-repo parity must be
checked explicitly on every change: compare both files, copy the canonical bytes, bump
`CONSTRAINTS-VERSION`, and update both local pins.

**Echo the exact `CONSTRAINTS-VERSION` line from that file in every report.** This is an observable
delivery handshake: omission flags non-delivery or non-compliance, but does not logically prove the
whole file was unread.

**If the constraints file cannot be resolved at that path, report the absence explicitly and
name what governed the run instead; never proceed silently.**

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
