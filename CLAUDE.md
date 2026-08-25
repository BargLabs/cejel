# CLAUDE.md — Cejel

Canonical instructions for Claude Code in this repository. Non-Claude agents read
`AGENTS.md`, which carries the same constraints.

## Read this first — non-negotiable

**[`docs/standing-constraints.md`](docs/standing-constraints.md)**

Safety-relevant constraints on secrets, guards, experiment integrity and evidence
discipline. The canonical lowercase file is a historical snapshot written at the close of the
2026-08-01 session; its final open-items section records that point in time, not current repo state.
Current resolution note: ADR-0013 records D1-D5 as exact signatures, merged in #794 at
`a33579f`. **D-series detection was retired on 2026-08-02.** The rules fire on constructed
acceptance specimens only; across four real-world evaluations — 16 seeded fixtures, 23 public
repositories, and Alfred's Maeve production surface — they produced zero findings. D1-D6 remain a
taxonomy for organising findings, review prompts and future detection targets. They are not a
production detector: a zero-result D-series scan means no rule matched, never that a repository is
clean, and D-series output must not gate a release, support a precision or recall claim, or appear
in customer-facing material as a shipped capability. A preregistered base-rate scan is in
progress; only a rule firing on a real, unconstructed defect changes this. Historical counts and
open-item labels must be mechanically reverified against current repository state before action.

The Alfred and Cejel copies share a point-in-time SHA-256 pin. Each repository pins only its local
file. This is a shared point-in-time parity record and local immutability guard; neither test proves
current cross-repository byte equality. The current local SHA-256 pin is
`f871f0b6dfce6cea9fcce3bfc6e195d02da5d2bbe2d0afaca1764f05d3d9be22`. Cross-repo parity must be
checked explicitly on every change: compare both files, copy the canonical bytes, bump
`CONSTRAINTS-VERSION`, and update both local pins. This is checked mechanically by
[`scripts/constraints-parity-guard.sh`](scripts/constraints-parity-guard.sh) in CI — wired into
both repos on any PR touching the file, on push to `main`, and on a daily schedule; drift or an
unreadable sibling fails the check loud, it never silently skips.

**Echo the exact `CONSTRAINTS-VERSION` line from that file in every report.** This is an observable
delivery handshake: omission flags non-delivery or non-compliance, but does not logically prove the
whole file was unread.

**If the constraints file cannot be resolved at that path, report the absence explicitly and
name what governed the run instead; never proceed silently.**

## IP boundary (2026-08-18 — governs all public-facing work)

You give away the exam, never the answer key. Open by design: methodology, rubric, spent
calibration-frame membership (revealed at retirement), records, failures. CLOSED — never
published, quoted, summarized, or decrypted into anything public, under any framing:
adjudication labels, reviewer notes, evidence corpora, live frame membership, alfred
implementation, keys, counterparty specifics. A retirement-reveal contains members + pinned
commits ONLY. Any task that appears to need label-class material on a public surface stops
and hands back to the operator. Authority: the operator's disclosure boundary decision
(`_studio/disclosure_boundary_2026-08-18.md`, 2026-08-18) — that file lives in the operator's
private lab notes, not this repository; ask the operator if you need to read it directly.

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
