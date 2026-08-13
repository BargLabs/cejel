# ADR-0020 (proposed): Unmeasurable evidence reduces confidence; absent evidence still scores

**Status:** Proposed. Layer 1 accepted for implementation; Layers 2 and 3 gated.
**Date:** 2026-08-12
**Proposed deciders:** Houman Azimi-Nejadi
**Lineage:** extends accepted ADR-0001 (*Coverage is disclosed, never discounted*) from file-level
read coverage to metric-level measurability. Complements ADR-0019, from which this was descoped.
**Origin:** Thomas Peterson's certificate review, 12 August 2026.

---

## Context

Cejel has now published two public corrections for the same defect: Django scored a false critical
on dependency hygiene, and OpenSSF Scorecard a false critical on audit trail. Both were punitive
scores for **the absence of a ratable surface** rather than a real weakness. Each was patched
individually — archetype gating for the first, an insufficient-data gate for the second.

`Static coverage percentage 0/100` is the third instance, and it was about to be patched
individually too. The pattern is the point: there is no stated general rule for what a score means
when part of a criterion's defined evidence could not be measured, so each occurrence is
rediscovered as a bug and fixed locally.

**The distinction the current model cannot express.** A missing coverage report is not the
repository's gap — it is Cejel's boundary. The scanner declines to run tests by design, so no
coverage figure is readable. Scoring zero charges the customer for an architectural choice of ours.
That is categorically different from a repository having no CI workflows at all, which is a genuine
finding about the repository. The certificate today cannot tell a reader which kind of absence it
is looking at.

**What three failed designs established.** Between them, three attempts at the narrow coverage fix
ruled out the obvious mechanisms and are recorded in ADR-0019:

- Routing absence to metric-level `insufficient_data` is **not implementable** — metrics carry a
  required numeric `value` and no status field. `insufficientData` exists only on the criterion
  signal, where it dominates all sibling evidence unconditionally (score `0`, status
  `insufficient_data`, `metrics: []`), so it would abstain an entire criterion while measurable
  evidence sat beside it. That is the definition of *inappropriate* abstention, the gate that
  produced the v49 terminal NO-GO.
- Bare omission is **structurally safe but semantically wrong**. Nothing downstream asserts arity
  or indexes positionally, but `scoreMetrics()` divides by the weight of metrics *present*, so
  dropping one reweights the survivors to 100% and presents a reduced evidence base with unchanged
  confidence. That removes the penalty and the disclosure together — ADR-0001's requirement failed
  from the other side.
- Absence of a named metric also makes calibrated criterion status return `undefined` and fall back
  to a generic numeric band, silently.

## Proposed decision

**Unmeasurable evidence reduces confidence. Absent evidence still scores.**

Every metric is declared, in advance, as belonging to exactly one class:

- **Repository-attributable.** Absence is information about the subject. It scores, as today.
- **Reach-limited.** Absence reflects a boundary of the scanner, the deny-list, the size gate, or a
  deliberate design choice such as never executing tests. It does not score; it reduces the
  criterion's measured-evidence fraction.

The classification is a property of the metric, declared with the metric, not inferred at runtime
and not decided per repository.

### Layer 1 — disclose confidence. Accepted; implement now.

Publish, per criterion, the fraction of its defined metric weight that was measurable, and surface
it on the certificate. **Gates nothing.** No score, status, finding or verdict changes.

Precedent: the public leaderboard already publishes a measured-coverage indicator per row and shows
rows below a confidence floor as unranked rather than ordered. This applies the same idea one level
down.

**No new calibration is required for Layer 1.** The published figures — precision,
rubric-agreement recall, worst-case false-positive rate — are all properties of the *finding*
population, and Layer 1 changes no finding. It costs a report-schema addition and therefore a
digest change; it does not touch the rubric.

### Layer 2 — reach-limited metrics stop scoring zero. Gated.

Apply the classification: reach-limited metrics are excluded from the weighted composite, with the
measured-evidence fraction from Layer 1 carrying the disclosure that omission alone would destroy.

**This requires new calibration**, for two independent reasons. Governance: v17 is the sole
calibrated rubric and successors inherit none of its figures until a fresh preregistered untouched
holdout passes every gate. Substance: criterion statuses are metric-derived and statuses generate
findings, so changing aggregation can move the finding population — which is precisely what
precision measures.

**Bundle into the v22-successor cycle** already required after the order-freeze instrument repair
is independently verified, rather than forcing an additional cycle. Note the cost of bundling: a
cycle carrying several changes that fails a gate cannot attribute the failure. Prefer this change
in a preregistration where it can be isolated.

### Layer 3 — confidence gates verdict issuance. Deferred; decide after Layer 1 data exists.

Below a declared floor, issue no verdict. This is the mechanism that would make proposed ADR-0017's
*abstained, with a machine-readable reason* reachable for the right reason rather than only through
the all-or-nothing `insufficientData` path.

**Deferred deliberately.** It introduces abstentions, landing directly on the gate that failed v49,
and would require demonstrating the new abstentions are *appropriate* rather than merely more
numerous. Layer 1 produces the confidence distribution across the corpus for free; decide the floor
against that distribution rather than in advance of it.

## Preregistration constraint

**The per-metric classification must be committed before any corpus delta is run.**

A classification chosen after observing how it moves scores is post-hoc scope selection — the same
error class that makes the v1.9 ten-row scope extension unclaimable. The classification is a
statement about what each metric means, decidable from the metric's definition alone, and it must
be recorded as such before results are visible.

## Evidence gates

1. Every metric classified, in a committed artifact, before any delta is computed.
2. Layer 1 shipped and the confidence distribution across the corpus published.
3. Layer 2 carried in a preregistration that can attribute its own effect, with a committed
   directional prediction.
4. Layer 2's corpus-wide before/after delta published in `docs/leaderboard/RUBRIC_CHANGELOG.md`
   with score, verdict and rank for every repository.
5. For Layer 3 only: demonstrated appropriateness of abstentions introduced by the floor, against
   the 95% upper-bound cap on inappropriate abstention.

## Consequences

**Easier.** One stated rule replaces case-by-case patching of a defect that has now recurred three
times. A reader can finally distinguish "this repository lacks X" from "we could not see X." The
question a serious diligence buyer will ask — *what does a 2.8 mean, and how much of my repository
did you look at* — becomes answerable.

**Harder.** Confidence must gate something eventually or it is decorative; Layer 1 alone publishes
a number nobody acts on, and that is an accepted interim state, not the end state. Layer 2 spends
the v17 inheritance. If Layer 3 proceeds, published precision and recall become conditioned on the
confident subset and acquire a qualifier that must travel with every citation.

**Score movement.** Layer 2 raises scores wherever reach-limited metrics currently score zero,
including Cejel's own leaderboard row. That delta is public by construction.

## Open questions

1. Does A1's calibrated status depend on `coverage_percent`? It appears to read only
   `non_hollow_test_share` and `verification_script_ratio`, inferred from a partial read.
2. Which existing metrics are reach-limited rather than repository-attributable? The coverage
   metric is the clear case; the size gate and deny-list exclusions ADR-0001 already names are
   candidates at a different level.
3. Where should the measured-evidence fraction live in the report schema so that it is available to
   renderers without implying a verdict?

**CONSTRAINTS-VERSION: 2026-08-01.3**
