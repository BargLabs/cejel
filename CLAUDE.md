# CLAUDE.md — Cejel

Canonical instructions for Claude Code in this repository. Non-Claude agents read
`AGENTS.md`, which carries the same constraints.

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
