# ADR-0022: Certificate legibility, round 2 (Latchkey design-partner feedback)

**Status:** Accepted. Ruled by the operator 2026-09-04 ("scope accepted as written") in
`0.4.7_scope_2026-09-04.md` (lab_notes, private). This record transcribes that ruling into an
issue-ready spec; it does not reopen the scope decision.
**Date:** 2026-09-04
**Deciders:** Houman Azimi-Nejadi
**Supersedes:** nothing. Continues the presentation workstream opened by
[ADR-0019](0019-certificate-is-a-relying-party-artifact.md) ("the certificate is a relying-party
artifact") — this is that same audience decision applied to a second round of outside feedback,
not a new principle.
**Origin:** Daniel (Latchkey CEO, design partner) ran `cejel scan` 0.4.6 on `latchkey` and
`gusset` and gave five items. Four are presentation (this ADR, Track A below); the fifth changes
scoring and is handled separately as a rubric-versioned experiment — see
`docs/experiments/a2-secret-posture-content-context-v23-2026-09-04/preregistration.md`
("Track B"). This ADR is Track A only.
**Provenance:** this document was written 2026-09-07, from the intent already recorded in issues
#264, #265, and #266, after implementation. It records the operator's 2026-09-04 ruling; it is not
a preregistration made in advance of the work it describes, and must not be read as one.

---

## Context

ADR-0019 shipped most of its own workstream: ratio rendering with both numbers (W1), absent-
coverage disclosure (W2a), plain-language per-metric descriptions and a glossary (W3, `#231`,
0.4.5), and a four-field relying-party summary — "what was examined / what was established / what
was not established / what to do next" (W4, shipped; see `renderRelyingPartySummary` in
`src/witan/html.ts`). `cejel render` (W5) has not shipped.

Daniel read a 0.4.6 certificate after all of that and still called it "too text-heavy," and asked
for four specific things. Each is a real, specific gap in the current renderer, not a restatement
of what ADR-0019 already fixed:

1. **Verdict and score already lead** (the hero's `score-panel` aside), but nothing summarizes
   *findings* before the reader reaches four paragraphs of prose (`renderRelyingPartySummary`) and
   then a scan-limitations block, then a content-read-summary block — all ahead of the first
   criterion card, where findings actually live (`renderFindingEvidence`, nested inside
   `renderCriterionCard`). A reader who wants "what's wrong" scrolls past three prose sections to
   find it.
2. **Measurement method is already shown per metric** — `renderMetric` (`src/witan/html.ts:417`)
   renders each metric's glossary-defined description as a tooltip. **Weight is not.**
   `metric.weight` already exists in the data model
   (`src/witan/schemas.ts:195,334` — it is scored on, not merely stored) but no renderer surfaces
   it. This is a pure renderer gap, not a data gap.
3. **No collapsible disclosure exists anywhere.** Every section in `html.ts` is a fully expanded
   static `<section>`. There is no `<details>` element, no inline visual artifact, nothing to
   click.
4. **The "what to do next" field is one static sentence, byte-identical on every certificate**
   (`buildRelyingPartySummary`, `certificate-presentation.ts:538-539`: *"Review the cited evidence
   and open or unverified items, reproduce the scan..."*). The adjacent `notEstablished` field
   already lists specific absent-evidence gaps in prose (coverage not measured, N/A criteria, scan
   limitations), but nothing prioritizes them or turns them into per-finding remediation guidance.

A fifth, unprompted item rides along: writing `github.run_attempt` into the certificate, motivated
by the open `ci.yml` flake investigation (5 first-attempt failures that re-run to green with no
retry config — see the eng-plan open-engineering note). Zero references to `run_attempt` exist
anywhere in `src/`, `action/`, or `.github/workflows/` today; this is new, not a gap in something
partial.

## Decision

Ship all five items as presentation-layer changes to the human-readable certificate. **None of
these five items may change `report.json`, `attestation.json`, `summary.json`, or badge bytes for
an unrelated scan** — every item below is renderer-only or additive-optional, following the exact
discipline `#231` and ADR-0019 already established (state explicitly, per item, what changes and
what stays byte-identical; a registry-to-glossary-style guard test accompanies any new reader-
facing field). Where an item surfaces an already-scored value (weight), it is exposed, not
recomputed — Cejel already trusts `metric.weight` for the composite; this only trusts the reader
with the same number.

**IP-boundary constraint that binds every item:** the certificate may name what evidence is
*absent* (the exam) — it must never expose adjudication internals, calibration thresholds, or
scoring mechanics beyond what is already public in the glossary (the answer key). Item 4 in
particular is phrased as evidence-absence ("here is what is missing"), never as a score-promise
("do X and your score becomes Y").

### Track A1 — Findings-first restructure

Insert a findings summary between the hero (`<header class="hero">`) and the existing relying-
party prose summary (`renderRelyingPartySummary`), so a reader reaches "what's wrong" before "how
to read this certificate." Content: critical and warning-severity findings across all criteria,
each already rendered by the existing `renderFindingEvidence`/`renderFindingSummary` machinery —
this item reorders and surfaces, it does not invent new finding text. The existing four-field
prose summary is retained (it answers a different question — scope and completeness, not "what's
wrong") but sits structurally after the findings, not before.

Acceptance:
- [ ] A certificate with at least one critical or warning finding shows that finding, with its
      severity and evidence pointer, before any `<section>` currently ranked ahead of the trust
      grid.
- [ ] A certificate with zero critical/warning findings states that plainly (not a silent empty
      section) before the prose summary.
- [ ] `report.json`, `attestation.json`, `summary.json`, badge bytes: unchanged. Only
      `certificate.html` (and, if Markdown/terminal renderers are updated in step, those two
      surfaces) change, per the cross-renderer parity discipline ADR-0019/W1 established.

### Track A2 — Per-criterion cards show weight

`renderMetric` gains the metric's weight, rendered next to the existing label/value pair (e.g.
"weight 0.30 of A1" or the criterion's locally normalized share — resolve the exact phrasing
against `scoreMetrics()`'s renormalization behavior noted in ADR-0019/W2b, since a criterion with
an absent metric already renormalizes surviving weights to sum to 1.0; the displayed weight should
reflect what actually applied to this report, not the metric's nominal declared weight, so a
reader is not confused when weights across a criterion's cards do not sum to 100%).

Acceptance:
- [ ] Every rendered metric shows its applied weight alongside its existing label and value.
- [ ] `report.json` unchanged (the field already exists and is already scored on) —
      `certificate.html`, Markdown, and terminal renderers change; a byte-diff test proves no
      other surface changed.

### Track A3 — Collapsible sections, single-file constraint

Long or secondary content (candidates: the glossary, the "not applicable" group, per-criterion
evidence lists beyond a short head) becomes progressively disclosed using native
`<details>`/`<summary>` — zero JavaScript required, so the certificate remains a single, offline,
self-contained HTML file with no new external asset and no runtime dependency, consistent with the
offline-by-construction hard rule and with the eventual `cejel render` (W5) round-trip-purity
requirement.

**Open question (design, not blocking the rest of this ADR):** the scope document says
"collapsible sections revealing visual artifacts inline" without defining what a visual artifact
*is* in this codebase — the certificate today has no charts, diagrams, or images anywhere, and
introducing one is a larger question (an inline SVG bar for weight/score distribution? a table?)
than "make text collapsible." Resolve with a short design pass before or during implementation;
does not block A1/A2/A4/A5, which have no dependency on it.

Acceptance:
- [ ] At least one currently-always-expanded, secondary section is collapsed by default behind
      `<details>`/`<summary>` and expands without JavaScript.
- [ ] `certificate.html` opened directly from disk (no server) still renders and expands
      correctly — the existing single-file, offline guarantee is asserted by a test, not just
      assumed.

### Track A4 — Remediation output: evidence-absence, prioritized

Replace the static `next` sentence in `buildRelyingPartySummary` with content derived from the
same gap-detection logic that already populates `notEstablished` (unmeasured criteria, N/A
criteria, scan limitations, skipped content reads) plus, for at least critical/high findings, a
per-finding statement of what evidence is currently absent that bears on it — never a promise
about what score would result. Prioritize: whatever most changes the picture (an unmeasured
criterion that could flip the verdict) ranks above a cosmetic gap.

Acceptance:
- [ ] Two reports with different gap profiles (e.g., one missing coverage data, one with an N/A
      criterion) produce different, specific `next` content — the static-sentence regression this
      item exists to fix is covered by a test asserting non-identical `next` output across two
      differently-gapped fixtures.
- [ ] Every sentence in the remediation output names an absence (missing evidence, an unmeasured
      metric, a scan limitation) — none states or implies a specific score outcome. A guard
      (grep-style test over the glossary/remediation copy, mirroring the existing registry-to-
      glossary CI guard) enforces this so a future edit cannot silently reintroduce a
      score-promise.
- [ ] `report.json`/`attestation.json`/`summary.json`/badges: unchanged.

### Track A5 — Rider: `github.run_attempt` into the certificate

When running under the GitHub Action (`action/`), capture `GITHUB_RUN_ATTEMPT` from the runner
environment and thread it through to wherever the report/attestation is written, then surface it
as an explicit field on the human-readable certificate ("run attempt 2 of 3" or similar). Outside
GitHub Actions (local CLI, other CI), the field is absent — never fabricated, never defaulted to
`1`. Motivation: the open `ci.yml` flake investigation needs exactly this signal to distinguish
"passed clean" from "passed on retry," and a self-certifying tool should be able to say which one
happened to itself.

This is a rider, not one of Daniel's four asks — it can slip independently of A1–A4 without
affecting the acceptance test below.

Acceptance:
- [ ] A certificate produced by the GitHub Action shows its run attempt number.
- [ ] A certificate produced by the local CLI (no `GITHUB_RUN_ATTEMPT` in the environment) shows
      no fabricated attempt number and no error.
- [ ] Schema impact stated explicitly once implemented (this is new data, unlike A1–A4 — expect an
      additive optional field on `attestation.json` or `report.json`'s invocation metadata; name
      exactly which file changes and confirm the addition is additive/backward-compatible).

## Out of scope

Per the ruled 0.4.7 scope document:

- "Cejel as a dynamic check layer replacing YAML" (Daniel's idea, raised separately from his four
  presentation asks) — an ADR-frame conversation for the next Latchkey meeting: Cejel emits
  findings that gates consume; Cejel never becomes the gate itself. Not a release item.
- Any rubric/scoring change beyond Track B (which is out of scope for this ADR specifically —
  see the separate preregistration).
- Anything MCP.
- Anything gate-shaped.
- `cejel verify --artifact`: excluded, and correctly so — it remains blocked on an unresolved
  offline-boundary design question (attestation fetch is a network call; the only admissible shape
  is verification from a locally supplied bundle), so it is not release-shaped. Holding it out
  keeps 0.4.7 one release, one theme: legibility.
- `cejel render` (ADR-0019/W5): not requested by Daniel in this round and not required by any item
  above; remains open from ADR-0019, not pulled forward by this ADR.

## Acceptance (whole-ADR)

**Daniel re-runs 0.4.7 on `latchkey` and `gusset`; each of his four asks has a visible answer in
the certificate.** This is the acceptance test — a design-partner re-run, not a synthetic fixture
pass. Secondary check: the alarm-delivery finding he called out as his top issue (21 workflows)
renders with weight, measurement method, and evidence per Track A2's requirement.

## Sequencing

Starts only after the 0.4.6 chain closes (MCP Registry republish, `v1` tag move, cejel.dev update
— tracked in `release_session_handoff_2026-09-04.md`), per the ruled scope document. No item in
this ADR has an external dependency once started — Track A1–A5 can proceed in any order or in
parallel; A3's open design question is the only internal blocker, scoped to A3 alone. Target: land
a few days before the next Latchkey meeting, since Daniel's re-run is the acceptance test, not a
synthetic one.

## Consequences

**Easier.** A reader who wants "what's wrong" no longer scrolls past three prose sections to find
it. A reader questioning "why does this criterion matter more than that one" gets an answer instead
of an unexplained score. The certificate's promise (ADR-0019: readable by a relying party under
time pressure) gets a second, harder test — a design partner who has already read one version and
found it wanting.

**Harder.** A4's remediation copy is customer-facing claim surface exactly as ADR-0019 flagged for
its own plain-English layer — it needs the same permanent review discipline against the claim
register, and the added guard test is there because the wording is uniquely easy to accidentally
turn into a promise about scores.

**Deferred honestly.** A3's "visual artifact" content is not designed yet; shipping A1/A2/A4/A5
without it, if the design pass runs long, is an acceptable partial — Daniel's four asks then have
three-of-four visible answers, and that gap is disclosed rather than asserted complete.

**CONSTRAINTS-VERSION: 2026-08-01.5**
