# ADR-0019: The certificate is a relying-party artifact

**Status:** Accepted for the presentation workstream. One item (W2b) deferred to a rubric cycle.
**Date:** 2026-08-12
**Deciders:** Houman Azimi-Nejadi
**Supersedes:** nothing. Complements proposed ADR-0003 (trust anchor and signing model); see
*Boundary against ADR-0003* below.
**Origin:** review by Thomas Peterson, Partnerships Lead, 12 August 2026 — the first non-engineer
to read a Cejel certificate cold.

---

## Context

Tom read a certificate and could not use it. He asked what "labels" meant, what "57 ratio" meant,
what "capped", "static coverage", "verification script", "non-hollow", "secrets", "primitive
coverage", "workflow depth", "observability depth" and "rollback and migration-safety depth" meant.
He suggested tooltips and apologised for the number of questions.

He should not have apologised. Two of his questions are defects, and the pattern behind all of them
is a product problem, not a documentation gap.

**The product thesis names an audience the artifact does not serve.** The question Cejel exists to
answer is *"what evidence can the recipient independently inspect or reproduce for the exact
revision they are being asked to accept?"* That recipient — the relying party — is frequently not
an engineer: a delivery lead, a client-side acceptance owner, a diligence partner, a procurement
approver. The certificate today is written for the producer, the party being audited. A motivated,
friendly non-engineer could not read it. A relying party under time pressure will not either.

This is the same bias the commercial motion shows: every first touch in `outreach-log.csv` went to
a producer, none to a relying party. Two independent signals, one root cause.

**The two defects.**

1. **Ratios render without their denominator.** `src/witan/html.ts:352` — the capped branch emits
   `max unit (capped; value raw)` and drops the `/max` that the uncapped branch at 354–355
   includes. `Test-to-source file ratio 57 ratio (capped; 73 raw)` is 73 test files against 57
   source files, with credit saturating at parity. The denominator is displayed in the numerator's
   position and the comparison is invisible.

2. **`Static coverage percentage 0/100` conflates "no coverage report" with "zero coverage."**
   `src/witan/repo-signals.ts:1659` passes `coveragePercent ?? 0`, erasing the null before it
   reaches either the scorer or the renderer. Rendering `0` tells a customer their code is untested
   when the truth is that no coverage figure was readable without running their tests. This is the
   same class of error the public leaderboard already publishes two corrections for — Django scored
   a false critical on dependency hygiene, OpenSSF Scorecard a false critical on audit trail, both
   punitive scores for the absence of a ratable surface.

## Decision

**The certificate's primary audience is the relying party — the person deciding whether to accept
the code — not the engineer who wrote it.** Where the two audiences conflict, the relying party
wins, and engineer-facing detail is retained beneath rather than removed.

This is one workstream, not five tickets, because every item below follows from that single
audience decision and they constrain each other.

### W1 — Ratios render both numbers

Shared formatter, both branches, all renderers. `capped` currently appears in `src/summary.ts`,
`src/http/server.ts`, `src/finding-presentation.ts`, `src/witan/markdown.ts` and
`src/witan/html.ts`. Fixing one renderer creates a divergence between certificate, terminal,
markdown and HTTP surfaces — precisely the defect the public README already apologises for
("our board and our own certificates disagreed on four repositories' headline scores by 0.1 …
'Overall' is now byte-identical everywhere it appears"). **A cross-renderer parity test is part of
this item, not a follow-up.**

### W2a — Absent coverage says so, without changing scores

Preserve the null through to the renderer; display "no coverage report found — Cejel does not run
your tests". **The scorer continues to treat absent coverage as `0`, exactly as today.** Score
neutrality is asserted by a test that scores a fixture before and after and requires equality.

### W2b — Absent coverage stops scoring as zero *(deferred)*

**Withdrawn and replaced, 12 August 2026.** The original wording — *"emit `coverage_percent` as
`insufficient_data`"* — was **not implementable and would have been actively harmful.** There is no
metric-level `insufficientData` in the model: a metric has a required numeric `value` and no status
field. `insufficientData` exists only on the criterion signal, and if any merged signal carries it,
it **dominates all sibling evidence unconditionally** — the scorer emits criterion score `0`, status
`insufficient_data`, `metrics: []`, regardless of how strong the other metrics are.

Mapping absent coverage that way would therefore have abstained **the whole of A1** for every
repository without a coverage report, while test files, verification scripts and non-hollow share
were all measurable. That is the textbook definition of *inappropriate* abstention — abstaining
where the evidence is determinable — which is the gate that produced the v49 terminal NO-GO. The
proposal would have driven the metric it was assumed to leave untouched.

**The replacement, derived from `scoring.ts:594–606` rather than assumed:**

> When no static coverage report or configured threshold is present, **do not emit the
> `coverage_percent` metric at all**, rather than emitting it as `0/100` at weight `0.3`.

No new mechanism is required. The composite already normalises over present metrics —
`weightedTotal += normalized * metric.weight; totalWeight += metric.weight;` returning
`(weightedTotal / totalWeight) * 4` — so omitting a metric renormalises the remaining A1 weights
automatically (0.3 + 0.25 + 0.15 = 0.70). Abstention machinery is never touched, so the abstention
gate is not engaged at all. Variable-length `metrics` arrays are already expected; the abstention
path itself emits `metrics: []`.

**This is ADR-0001 applied, not a new principle.** ADR-0001 — *"Coverage is disclosed, never
discounted"* — is already accepted, and its context describes this exact failure mode: a size gate
returning `null` before reading, and that `null` being wrongly routed into an `insufficient_data`
abstention. Absent coverage should be **disclosed** (W2a) and must not **discount** the score. W2b
is the application of an existing decision to a metric that was missed, not a new rubric
philosophy.

**Still deferred, for one reason only: it changes scores.** That requires a
`WITAN_RUBRIC_VERSION` bump and a corpus-wide before/after delta in
`docs/leaderboard/RUBRIC_CHANGELOG.md`, with a build that fails without both. And v17 is the sole
calibrated rubric — a successor inherits none of the published precision, rubric-agreement recall
or false-positive figures until a fresh preregistered untouched holdout passes every gate.
**Deferred to the v22-successor cycle, after the order-freeze instrument repair is independently
verified.** v50 supplies a regression delta only; that cohort is retired and cannot produce a
claim-bearing result.

**Also withdrawn, 12 August 2026. Bare omission is structurally safe but semantically wrong.**

Downstream is clear — the schema allows variable-length metric arrays and asserts no arity,
renderers iterate with `.map()` and reference names only for the `pr_merge_ratio` warning, the
leaderboard guard compares criterion scores and statuses rather than metric arrays, and no
production code indexes metrics positionally. So nothing breaks.

But `scoreMetrics()` (`scoring.ts:593`) divides by the total weight of the metrics **present**, so
dropping `coverage_percent` reweights the surviving three A1 metrics from 0.70 to **1.00**. A
criterion scored on a reduced evidence base is then presented identically to one scored on the full
set, with no disclosure that a quarter of its defined evidence was unavailable.

**That is ADR-0001's disease in the opposite direction.** ADR-0001 requires coverage to be
*disclosed*, never *discounted*. Emitting `0/100` discounts. Silently omitting removes the penalty
but also removes the disclosure, and presents a less-evidenced score with unchanged confidence.
Neither satisfies the accepted decision.

A second hazard: calibrated criterion states require **named metric subsets** — B2 requires both
`pr_trace_primitives` and `pr_merge_ratio`, A3 requires four named metrics — and when a required
metric is absent, calibration returns `undefined` and status silently falls back to generic numeric
bands. A1's calibrated status reads `non_hollow_test_share` and `verification_script_ratio` and
does **not** appear to reference `coverage_percent`, so A1 should be unaffected; **confirm that
before relying on it.** The general point stands: omission can silently downgrade a criterion from
calibrated status to a generic band, which is exactly the "why the labels differ" behaviour Tom
asked about.

### W2b is descoped from this ADR

W2b is no longer a display fix with a rubric consequence. It requires a **new concept — explicit
missing-metric aggregation** — and that is a scoring-model decision deserving its own record, its
own evidence gates and its own preregistration. Keeping it here would make this ADR unshippable.

**Requirements the eventual design must satisfy** (stated deliberately as requirements, not as a
mechanism):

1. Absent evidence must not penalise the score. *(ADR-0001: never discounted.)*
2. A reduced evidence base must be visible to the reader. *(ADR-0001: always disclosed.)*
3. A criterion scored on fewer metrics must not present the same confidence as one scored on all
   of them. Precedent exists: the leaderboard already publishes a measured-coverage indicator and
   leaves rows below a confidence floor unranked rather than ordered.
4. It must not route absence into criterion-level `insufficientData`, which dominates unconditionally.
5. It must not silently degrade a calibrated status to a generic numeric band.

**No mechanism is proposed here, and that is deliberate.** Three mechanisms were proposed for W2b
in one day and all three were wrong: routing to `insufficient_data` (un-implementable, and would
have abstained all of A1 — the v49 failure mode); predicting a zero abstention delta (assumed, not
read); and bare omission (structurally fine, semantically wrong). Every error came from designing
against a remembered model rather than the code. The next version of W2b should be written by
someone reading `scoreMetrics`, the calibrated-status subsets and the leaderboard confidence floor
together, and it should carry its committed prediction before any cohort is touched.

Until then, **W2a stands as the shipped behaviour**: absent coverage is disclosed in the
certificate and continues to score as today.

### W3 — Plain-language descriptions, renderer-side

Every metric already carries a `description` (`repo-signals.ts:6988`), never rendered, and written
for engineers. Plain-language text is **additional**, keyed by `metric.name`, and lives **outside
the report schema**. `metric.description` is serialised into `report.json`, so adding a sibling
field there would change newly generated report digests for text that exists only to be read by a
human. Disclosure is CSS-only with `:focus-within`; not the bare `title` attribute, which is
unreachable by keyboard for exactly the audience this serves.

### W4 — A plain-English layer

Four sections at the head of the certificate: **what was examined · what was established · what was
not established · what to do next.**

Two constraints, both load-bearing. It must be a **pure template function of `report.json`** — no
clock, no environment, no locale, no config, no model call. And it must **never characterise the
software**: it states what was measured and what was not, and never drifts from "three criteria
abstained" into "the code is fine."

### W5 — `cejel render <report.json> <attestation.json>`

Regenerate `certificate.html` from the artifact pair. The pair, not the report alone: `cliVersion`
is not recoverable from `report.json` — it exists only as `predicate.tool.version` in
`attestation.json`. Taking both mirrors the existing `cejel verify` signature and uses the two
files a recipient already holds.

**Folded in: the path-determinism batch.** W5 makes rendering reproducible with respect to *time*;
leaving `repo.path` in place leaves reports non-reproducible with respect to *location*. Same
contract, so they ship together:

1. **Cut a cejel release containing `e11f6a0`** ("fix: make report artifacts checkout-path
   independent", #166). It is in `main` and is **not** an ancestor of `v0.4.0`, so the published
   package still emits path-dependent bytes. Nothing else here matters until this ships.
2. Port to Alfred — `alfred/packages/witan/src/repo-signals.ts:182` still emits `options.repoPath`.
   Not automatic: the two repositories share a point-in-time copy and parity requires explicit
   comparison.
3. Keep legacy `repo.path` readable but optional in the schema.
4. Fall back to `productSlug` in HTML and Markdown rendering.
5. Two-checkout-path byte-identity guard.
6. Confirm historical report/attestation pairs containing `repo.path` still verify.
7. Document that new reports gain cross-path determinism while old pairs remain valid.

## Boundary against ADR-0003 — what `cejel render` does not prove

ADR-0003 (proposed) states: *"No unsigned local attestation may be described as an Arista-style
publisher anchor or as a relying-party-verifiable certificate."*

**`cejel render` does not create one, and must never be described as though it does.**

Reconstruction proves **rendering fidelity**: that this HTML is what this report produces. It does
**not** prove **authenticity** — anyone can re-render a forged report and get a self-consistent
certificate. Authenticity still requires the trust anchor ADR-0003 defers.

Claimable: *"the certificate is a deterministic rendering of the bound report; you can regenerate
it from the report and attestation and confirm that what you read matches what was bound."*

Not claimable: that the certificate is attested, signed, independently verified, or
relying-party-verifiable. Only `report.json` is digested — `hashWitanReport`
(`src/witan/attestation.ts:36`) hashes the serialised report alone, the attestation subject is
`${productSlug}/report.json`, and `certificate.html` is written separately at `src/index.ts:231`.

Also not claimable: that the digest identifies the producing CLI, or that the whole artifact set is
byte-identical. The precise statement is: **for the same scanner version, rubric, repository
revision and evidence, `report.json` is byte-identical; provenance requires retaining the
report/attestation pair.**

## Consequences

**Easier.** The relying party can read the artifact, which is the moment the product exists for.
Two false signals leave customer-facing output. The question any evidentiary buyer will ask — what
stops the human-readable HTML from disagreeing with the bound JSON — gains a shipped answer. The
checkout-path caveat that currently qualifies every reproducibility statement can be retired on
release, which removes a hedge from technical conversations already in progress.

**Harder.** Plain-language text becomes customer-facing claim surface and falls under the claim
register like any other outbound copy. The plain-English layer is the easiest place in the product
to accidentally assert safety, and needs review discipline permanently. Renderer purity becomes a
maintained invariant, guarded by W5's round-trip test.

**Accepted cost.** W2a knowingly ships a display that says "not measured" while the scorer still
treats it as zero. That gap is honest but real, and it persists until W2b lands. Recorded here so
nobody rediscovers it as a defect.

## Sequencing

| | Item | Rubric change | Size |
|---|---|---|---|
| 1 | Release containing `e11f6a0`; Alfred port | No | release |
| 2 | W1 ratio rendering + parity test | No | 0.5d |
| 3 | W2a coverage label, score-neutral | No | 0.5d |
| 4 | W5 `cejel render` + round-trip byte test | No | 1d |
| 5 | W3 plain-language descriptions | No | 1–2d |
| 6 | W4 plain-English layer | No | design pass |
| — | ~~W2b~~ | descoped | separate ADR; see above |

W5 precedes W3 and W4 deliberately: its round-trip test is the guard that keeps the plain-English
layer pure. Writing the guard after the thing it guards is how the layer quietly becomes impure.

## Acceptance evidence

- Cross-renderer parity test passes for ratio display.
- Score-equality test passes across W2a.
- Two-checkout byte-identity guard passes.
- Historical report/attestation pairs still verify.
- Round-trip test: scan a fixture, re-render from the pair, assert byte equality with the
  certificate written by the scan.
- **Tom reviews the output, not only the input.** He is currently the only non-engineer reader
  available, and his confusion is a measurement instrument.

## Resolved question

*Can a metric marked `insufficient_data` propagate to criterion-level abstention?* **No — not at
metric level in the current model.** A metric carries a required numeric `value` and no status
field; `insufficientData` exists only on the criterion signal, where it dominates all sibling
evidence unconditionally (score `0`, status `insufficient_data`, `metrics: []`). Weak metrics stay
numeric and produce a low score; they never abstain. Criterion-level `insufficient_data` becomes
report-level `insufficient_source` only when every free-core criterion is `not_applicable` or
`insufficient_data`; a read-failure criterion is retained as zero in its category denominator so
missing evidence cannot improve the score.

For the record, since it was misstated twice: the abstention gate caps the **95% upper bound** of
**inappropriate** abstention, not the raw rate. v50 ran at 18.97% raw and passed with 0%
inappropriate; v49 failed with a point estimate of 16/189 = 8.47% and an upper bound of 12.70%.

## Open question

Does A1's calibrated status depend on `coverage_percent`? It appears to read only
`non_hollow_test_share` and `verification_script_ratio`, but this was inferred from a partial read
and matters for any future W2b design — absence of a required metric makes calibration return
`undefined` and the status fall back to a generic numeric band.

## Housekeeping hazard found while filing this

The accepted and proposed ADR series share a number space — accepted `0002` and proposed `0002` are
different decisions. This record is numbered 0019 to avoid colliding with proposed `0003`, which it
complements. Recommend renumbering the proposed series into its own range before the collision
causes a misfiled citation.

**CONSTRAINTS-VERSION: 2026-08-01.3**
