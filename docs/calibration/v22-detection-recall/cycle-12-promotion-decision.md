---
role: record
---

# Cycle-12 promotion decision — NO-GO

> **Published transcription.** Operator-signed source record, held in the private measurement
> repository. **Nothing is redacted from this file** — see [`REDACTIONS.md`](REDACTIONS.md).

Status: **IN FORCE — operator-signed.** Not in force until the operator signature block is complete.

This is the separate signed act `cycle-12-promotion-policy.md` §2 prescribes: it applies the
pre-registered criteria to `cycle-12-estimation-result.md`'s figure and does nothing else. The
criteria were fixed and signed before the measurement ran; this document changes none of them.

> **Instrument and date — read this with the figure, every time.**
>
> Measured source commit: **`e434a40e`**
> (`e434a40e6596536ac9c2645fefa71fc9f0eda7cb`) — the cejel revision the detector ran at.
>
> **Package version: not stated in the source result record.** It is recorded as absent rather
> than inferred; supplying it is a correction owed to that record.
>
> The measurement this decision reads **predates cejel #276, #277 and the 0.4.8
> abstention-scoring change.** A re-measurement on the current release is owed, and this figure
> must not be read as describing it.

## The reading, criterion by criterion

- **P0 (validity precondition):** MET — the estimation result's verdict is VALID (no ceiling
  tripped, all measured waves included).
- **P1 (precision):** the FPR analogue is strong (0.77% [0.00%, 2.13%]; 28/30 decided
  candidates supported). Not the binding constraint.
- **P2 (recall floors — point ≥ 0.55 AND 95% lower bound ≥ 0.40):** **NOT MET.**
  Measured: point 0.3399, lower bound 0.2099. Both floors fail.
- **P3 (non-regression on the published instrument):** not reached — P2 already decides.
- **P4 (coupled claim surfaces):** not reached — there is no promotion to couple.

## Decision

**NO-GO. v22 is not promoted. v17 remains the public default.**

Per the policy's own signed clause: *a NO-GO is a recorded outcome, not a retry ticket.*
Nothing in this decision authorizes a remeasurement; any further cycle requires its own
operator-signed protocol with the spent-identity ledger carried forward (279 identities after
this cycle: the 160 of the draw addendum plus its 119, to be recomputed from the records — a
count with no stated source key is not trustworthy).

## What this decision does not say

It does not say v22 is worse than v17 — v17's cohort recall has never been measured. It does
not retract the fixture results (16/30 released, 24/30 prospective; published with their
scope). It does not gate v23 development; the result's miss inventory is the natural detection
roadmap. And it does not diminish the FPR finding, which stands on its own as the
precision-side evidence the product thesis rests on.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-09-05T18:00:24Z
- Signature: Houman Azimi-Nejadi — NO-GO recorded per pre-registered P2 (point 0.3399 < 0.55, lower bound 0.2099 < 0.40); v17 remains default; no remeasurement authorized; a NO-GO is a recorded outcome, not a retry ticket