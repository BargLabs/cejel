# AGENTS.md — Cejel

Conventions and context for AI agents working in this repository (Codex, Cursor, Cline,
Aider, and any non-Claude-Code agent that reads `AGENTS.md` by convention).

For Claude Code specifically, also read `CLAUDE.md`.

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
`b7dea9f8971af80de061369e988f94b5cd50962bdf4399dab3e6bc1b2dc31717`. Cross-repo parity must be
checked explicitly on every change: compare both files, copy the canonical bytes, bump
`CONSTRAINTS-VERSION`, and update both local pins.

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

## Recording lessons

When a session identifies a defect, a correction, a false claim, or a rule that would prevent a
recurrence, record it in this repository as part of the PR you are already opening — not as a chat
attachment, and not staged to `lab_notes/_maeve/`, which is for agents that cannot commit.

Stage the record as part of the PR in this repository, then promote it: sync discovers batches
only in alfred's `docs/orchestration/maeve-lesson-batches/`, named `cejel_<topic>_<date>.json` —
the exact `cejel_` filename prefix is load-bearing, and a batch that exists only in this
repository is invisible to sync. Records with no qualifying fix commit go to alfred's
`maeve-unanchored-lessons/`. Anchor only to a commit
already on `origin/main` — a squash merge rewrites a branch SHA and orphans any anchor pointing at
it — and confirm the commit's diff exhibits what the summary claims. The seed schema is a JSON
array with `statement` (≤1000 chars), `scope[]`, `tags[]`, `anchors[]`, `lastSeenAt`; unknown fields
are silently stripped at ingestion, so fold anything essential into `statement` before writing.
Cite the commit, never an author.

## Before you commit

- `pnpm build`, the full test suite, and the offline-boundary guard must pass.
- Explicit paths on `git commit`. Never `git commit -am` — multiple agents write to these
  trees concurrently and `-am` has swept unrelated work into the wrong commit before.
- Push any branch that has no remote ref before doing anything else with it.
