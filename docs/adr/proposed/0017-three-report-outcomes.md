# ADR-0017 (proposed): A scan reports three outcomes, not two

**Scope:** Future Cejel rule and report-schema design. This is a proposal, not a statement that the current runtime already has these outcomes.
**Status:** Proposed — awaiting an explicit acceptance decision
**ADR number:** 0017
**Date:** 2026-08-12.
**Supersedes in part:** `ADR-draft-unobserved-controls-are-absent-2026-08-11`, which assumes a rule
either fires or is silent.


> **Current Cejel status note:** The D-series is retired. Any D6 examples below are historical context only and cannot support a production detection, coverage, precision, or recall claim.

---

## Context

This proposal addresses a report design in which a scan produces findings but absence of a finding is not
represented. In such a design, silence can read — in the report, in the certificate, and to a customer —
as *examined and clean*.

That equivalence is false wherever a rule cannot examine its subject. The historic D6 unobserved-control
proposal in PR #174 made this concrete: `candidatesForFile` returned an empty list for any file whose
extension is not `.sh` or `.bash`, so every TypeScript, Python, Go and YAML file in a repository is
passed over silently. The rule's precision gate records zero findings across its calibration corpus, a
result equally consistent with high precision and with the rule never having looked at anything.

The same ambiguity exists for any rule that abstains for a structural reason: an unsupported language, an
unparseable file, a file above a size limit, a timeout, a heuristic that declines when confidence is low.
All of these currently render as silence, and silence renders as clean.

This is a defect family for which D-series labels were previously used: a control reports a result it did
not establish. D-series detection is retired; this proposal concerns a future report-schema design.

## Decision

**Every rule, for every file in scope, resolves to exactly one of three outcomes:**

1. **`finding`** — the rule examined the subject and identified a defect.
2. **`clean`** — the rule examined the subject and identified no defect.
3. **`abstained`** — the rule did not examine the subject, with a machine-readable reason
   (`unsupported-language`, `unparseable`, `size-limit`, `timeout`, `low-confidence`, `out-of-scope`).

**`abstained` is never aggregated into `clean`.** Report schema, certificate vocabulary, calibration
manifests and any public coverage claim carry the three counts separately.

**A rule's declared scope is what it examined, not what it was pointed at.** A rule that runs over a
repository of 4,000 files and examines 60 of them reports coverage of 60, not 4,000.

**Calibration manifests state the abstention denominator.** A precision or recall figure computed over
examined subjects only is valid, but must say so; the same figure presented against the full corpus is a
different and much larger claim.

### Boundary: an inert, evidenced control is not an unobserved control

The historical note `ADR-draft-unobserved-controls-are-absent-2026-08-11` supplies a useful
distinction. When a declared control is within the evidence boundary and the available repository
evidence establishes that its result cannot affect the recorded outcome, a future rule may report
that **bounded evidentiary condition** as a finding. It must not infer that the underlying property
is false, that an external control did not run, or that the subject is unsafe.

Where Cejel cannot inspect the control, its inputs, or the condition under which it matters, the
outcome is `abstained`, not a finding. This proposal does not state that the current runtime detects
inert controls; the historical D6 work is retired and cannot support a shipped capability or
performance claim.

## Consequences

**Accepted costs.** The report grows a dimension, and some outputs will look worse — a scan that appeared
to cover a repository will now visibly cover part of it. Certificate copy needs rewriting. Existing
calibration manifests need an abstention denominator added retroactively or an explicit note that they
predate this decision.

**What this buys.** The failure mode it removes is the one that ends a customer relationship: a defect
found later in a file the report implied was checked. "We do not analyse Python" is a product limitation.
"We reported your Python clean without reading it" is a different category, and no amount of subsequent
precision recovers from it.

**It also makes rule proposals honest.** Under this decision, #174's abstention fixtures could not have
been presented as evidence of judgment — `runtime-registry.ambiguous.fixture.mjs` would resolve to
`abstained: unsupported-language`, which is what actually happens, rather than to a silence that reads as
deliberate restraint.

**Downstream.** The three-outcome shape should reach the pack-authoring interface, so a rule author must
return an outcome rather than optionally returning a finding. A rule that can return nothing at all will
eventually return nothing when it should have returned something.

## Open questions

- Whether `clean` is worth materialising per-file per-rule, or whether it is the complement of the other
  two within declared scope. Storage cost versus auditability.
- Whether `low-confidence` belongs here or is a finding with a confidence band. Two different claims:
  *I did not look* versus *I looked and am unsure*.
- Whether abstention counts appear on the customer-facing certificate or only in the machine-readable
  report. Recommendation: both, because the certificate is the artifact that gets forwarded.

**CONSTRAINTS-VERSION: 2026-08-01.3**
