# ADR-0015 (proposed): A preregistration binds the protocol, not the population

**Scope:** Barg Labs measurement practice; applies to Cejel calibration and any future preregistered measurement. Alfred examples are recorded as background.
**Status:** Proposed — awaiting an explicit acceptance decision
**ADR number:** 0015
**Date:** 2026-08-12.


> **Current Cejel status note:** This ADR governs applicability review before execution. It does not permit editing a preregistration after a result is visible; corrections and superseding protocols remain separate records.

---

## Context

Preregistration is used here to prevent a measurement from being tuned after its result is visible: the
protocol, the dispositions, the outputs and the exclusions are fixed in advance, at a named commit, and
the measurement is then executed as written.

That discipline governs *how* a thing is measured. It says nothing about *what* is measured, and the
subject moves.

The disposition review preregistered at `d5dd3fa4` around 2026-08-06 is the working example. Since it was
written, the corpus it addresses has changed materially: five squash-orphaned anchors were repaired, one
seed was re-anchored to a different commit, an ancestry check was added so that a valid anchor now means
something stricter than it did, an evidence-quote validator merged and a byte-pin registry was re-pinned
across seven batches, and a further tranche of orphaned seed files is pending reconciliation.

Running that protocol unchanged would produce a clean, preregistered, internally consistent result
describing a population that no longer exists — and it would carry the authority of the original design
while doing so. That is worse than no result, because a result nobody trusts gets re-examined and a
result everybody trusts does not.

The same exposure applies to the historical reproduction proposed in cejel #51, where a figure produced
under one scope is at risk of being read as a control for work done under another.

## Decision

**Before a preregistered protocol is executed, its applicability to the current population must be
established and recorded.**

The applicability pass is a distinct step with its own output, performed by someone or something that is
not simultaneously running the review. It:

1. **Quotes** the preregistration's population specification verbatim — not a paraphrase, because the
   question turns on exactly how membership was defined.
2. **Reconstructs membership at the preregistration commit** and compares it to membership now,
   reporting every difference by identifier.
3. **Separates cosmetic drift from disposition-relevant drift** — a changed anchor, a newly failing
   validity check, a repaired or quarantined record is disposition-relevant; a reformatted file is not.
4. **Concludes with exactly one verdict:** *applies unchanged*, *applies with stated drift* (naming every
   drifted member and why it does not bear on the measurement), or *does not apply as written*.

**No disposition may be assigned during the applicability pass.** Assigning even one contaminates the
review it exists to protect.

**If the population cannot be reconstructed at the preregistration commit, that is the entire finding.**
An irreproducible population means the preregistration has already failed, and no care in execution
recovers it.

**Amending a preregistration after observing the corpus is a scope decision requiring an operator**, is
recorded as an amendment with its reasoning, and does not inherit the original's authority.

**Preregistrations carry an expiry or a stated staleness condition** — a date, a commit range, or a
condition under which they cease to apply — so that applicability is a scheduled question rather than one
somebody happens to raise.

## Consequences

**Accepted costs.** Every preregistered measurement acquires a preceding pass, and some will conclude
that the protocol no longer applies — which feels like wasted design but is the mechanism working. The
225-seed disposition review is currently gated on exactly this, and has been for six days.

**What this buys.** It removes the failure mode where methodological rigour is used to launder a subject
mismatch. A preregistered protocol run on a shifted population is more dangerous than an ad-hoc
measurement, because its provenance suppresses the scrutiny that would have caught it.

**Interaction with the gate-in-force decision.** The applicability pass is itself a control, and is
therefore subject to demonstrating a rejection: it must be shown concluding *does not apply as written*
on a case constructed to drift, before its *applies unchanged* verdicts are relied upon.

**Immediate application.** The disposition-review applicability goal
(`codex_goal_alfred_disposition_review_applicability_2026-08-11.md`) is the first instance and is written
to this shape already. cejel #51 is the second and should not be decided before this ADR is settled.

**CONSTRAINTS-VERSION: 2026-08-01.3**

