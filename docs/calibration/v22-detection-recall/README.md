# v22 in-scope detection recall — the cycle-12 measurement record

This directory is the open calibration record for the one cohort detection-recall measurement
this lineage has produced: cycle-12, run 2026-09-05 against a 200-repository untouched cohort
under a protocol and a promotion policy both signed before the draw.

It exists so that no number published anywhere about v22 detection recall is un-openable. The
site card that follows this one may cite the figure; this record is what a reader opens when
they do.

## The figure

**v22 in-scope detection recall: 34.0% (95% CI 21.0-53.5%), measured across seven rules on a
200-repository untouched cohort under a preregistered protocol; measurement valid, no
decidability ceiling tripped (aggregate control insufficient-context 7.94% against a 20%
ceiling).**

**False-positive rate 0.77% (95% CI 0-2.1%).**

> **Instrument and date — read this with the figure, every time.**
>
> Measured source commit: **`e434a40e`**
> (`e434a40e6596536ac9c2645fefa71fc9f0eda7cb`) — the cejel revision the detector ran at.
>
> **Package version: not stated in the source record.** The signed estimation result names the
> pin, the estimator spec, the estimator function and the run date, but no `@cejel/cejel`
> release version. It is recorded here as absent rather than inferred. Supplying it is a
> correction owed to the source record, not a value this publication may fill in.
>
> This measurement **predates cejel #276, #277 and the 0.4.8 abstention-scoring change.** A
> re-measurement on the current release is owed, and this figure must not be read as describing
> it.

The interval never separates from the point, and "in-scope" and "v22" never drop. Those two
sentences above are the only approved prose statements of this figure; anything else is a
derivative claim this record does not support.

## The decision that followed

**NO-GO.** The pre-registered promotion floors were a point estimate ≥ 0.55 and a 95% lower
bound ≥ 0.40. Measured: point 0.3399, lower bound 0.2099. Both fail. `witan-rubric-v17-2026-07-24`
remains the released public default, and nothing in this record authorizes a remeasurement — a
NO-GO is a recorded outcome, not a retry ticket.

This record does not say v22 is worse than v17. v17's cohort recall has never been measured.

## The records

| File | What it is |
|---|---|
| [`cycle-12-estimation-protocol.md`](cycle-12-estimation-protocol.md) | The pre-registered measurement protocol: population, estimator, selection design, decidability ceilings, decision rule, execution split. |
| [`cycle-12-draw-addendum.md`](cycle-12-draw-addendum.md) | The budget, allocation, and seed. Drawn case ids withheld — see below. |
| [`untouched-estimator-spec-v3.json`](untouched-estimator-spec-v3.json) | The estimator specification the run executed against. |
| [`cycle-12-estimator-falsifiability-fixture.json`](cycle-12-estimator-falsifiability-fixture.json) | The synthetic fixture that makes the estimator's weighting arithmetic able to fail its own check. |
| [`cycle-12-estimation-result.md`](cycle-12-estimation-result.md) | The measured figure, the validity verdict, the per-rule miss counts, and the defects of the run itself. |
| [`cycle-12-promotion-policy.md`](cycle-12-promotion-policy.md) | The promotion criteria, signed before the measurement ran. |
| [`cycle-12-promotion-decision.md`](cycle-12-promotion-decision.md) | The NO-GO, applying those criteria to that figure. |
| [`cycle-12-validity-note-control-review-circularity.md`](cycle-12-validity-note-control-review-circularity.md) | Defect found after signing: control-side review was not independent of the instrument. Direction: conservative. |
| [`cycle-12-validity-note-2-evidence-provenance-and-abstention.md`](cycle-12-validity-note-2-evidence-provenance-and-abstention.md) | Two further defects found after signing: one packet carried evidence from the wrong path and revision; abstentions were silently counted as detection misses. Direction: the second overstates recall. |
| [`REDACTIONS.md`](REDACTIONS.md) | Per file, what was withheld and under which closed-class item. Files with nothing withheld say so. |

**Both validity notes push the figure in opposite directions, and neither correction is
applied.** A record that applied only the flattering correction, or that quietly netted the two,
would be curating toward a number. Recording both and applying neither is what makes the figure's
integrity checkable by someone who does not trust us.

## What is published here, and what is not

Open by design, and published in full: the protocol, the draw addendum's method and allocation,
the estimator spec and its falsifiability fixture, the promotion policy, the promotion decision,
both validity notes, and the estimation result at aggregate level — the figure, the interval, the
false-positive rate and its interval, the per-rule miss counts as counts, the control
insufficient-context rate against its ceiling, the bootstrap design, and the NO-GO verdict with
its pre-registered thresholds.

Closed, and withheld here under the disclosure boundary
(`CLAUDE.md` / `AGENTS.md`, IP boundary of 2026-08-18): the 119 blinded operator adjudication
labels; reviewer notes and per-repository reasoning; per-repository findings, packet excerpts and
evidence excerpts; cohort member identities; and counterparty specifics of any kind.

Every withholding in this directory is marked in place and listed in
[`REDACTIONS.md`](REDACTIONS.md). A silent omission would be a false record.

## Membership: committed to, not yet revealed

The cycle-12 cohort is **spent** — no remeasurement is authorised — but retirement is a separate
signed act that has not occurred. Member identities and the drawn case-id list are therefore
withheld. What is published instead is the commitment, so that membership is fixed now and
checkable later:

- **Cohort pin:** `e434a40e6596536ac9c2645fefa71fc9f0eda7cb`.
- **Draw seed:** `cycle-12-estimation-draw-2026-09-05`.
- **Selection method:** within each (rule, kind) stratum, order case ids by
  `sha256(seed + caseId)` and take the first N, over the v8 sealed key minus the 160-identity
  spent ledger. N per stratum is the allocation table in
  [`cycle-12-draw-addendum.md`](cycle-12-draw-addendum.md).
- **Case count:** 119 — 40 candidates, 79 controls, all distinct.

Seed plus method plus allocation plus key determines the drawn set exactly. At retirement, the
revealed list is recomputable from these four things and can be checked against them; it is not
a list this record asks anyone to take on trust.

**A separate manifest digest over the 119 drawn ids is owed and is not in this record.** It is
specified here but not computed, and a digest slot is not a place to write a value nobody
computed. The specification is published now so that the value is fixed in advance rather than
open to choice when it is filled in:

```
commitment object (rfc8785-sha256-v1, per docs/calibration/hash-conventions.md;
digest computed over the canonical UTF-8 bytes, no trailing newline, with
manifest_sha256 itself excluded):

{
  "caseCount": 119,
  "commitmentId": "cejel-v22-cycle-12-estimation-draw-2026-09-05",
  "drawnCases": [ "<ruleId>|<kind>|<caseId>", ... ],
  "hashContract": "rfc8785-sha256-v1; manifest excludes manifest_sha256",
  "pin": "e434a40e6596536ac9c2645fefa71fc9f0eda7cb",
  "schemaVersion": 1,
  "seed": "cycle-12-estimation-draw-2026-09-05"
}

drawnCases order: strata in ascending code-unit order of ruleId; within a stratum,
candidate entries before control entries; within a (rule, kind) stratum, the exact
order printed in the signed draw addendum. Code-unit comparison only — never
localeCompare, per docs/calibration/hash-conventions.md.
```

Note what this digest would and would not be worth. It commits to the drawn set from the moment
it is published, but it is computed **after** the draw, not at draw time, so it is a post-hoc
commitment of the same class as the v17 holdout reveal's — weaker than a freeze-time digest and
stated as such. The real temporal anchor is the operator signature on the draw addendum,
2026-09-05T14:42:16Z, which predates every labelling and scoring act in this cycle.

## Reading the transcriptions

These files are transcriptions of operator-signed records held in the private measurement
repository. Two conventions follow from that:

- **Path references inside a transcription point at the private measurement repository, not at
  this one.** They appear as plain code spans (`docs/calibration/…`, `packages/witan/…`) and are
  deliberately not links, because they do not resolve here. Pull-request and commit references
  inside a transcription are likewise that repository's, not this one's.
- **Redaction markers are inserted by this publication, never by the signed source.** They read
  `withheld under the disclosure boundary; digest published` where a digest exists, and are
  always accompanied by an entry in [`REDACTIONS.md`](REDACTIONS.md).

## What this record is not

It is not a board and it is not a score table. [The public board](https://cejel.dev/leaderboard/)
is the sole current scored surface; nothing here ranks or scores a repository.

It is not a coverage claim. Recall gaps are a known limitation of all static analysis and are
priced in; this record measures one, on one cohort, on seven rules, at one pinned commit. The
nine undrawn rules were not measured and resolve to `inconclusive-no-go` for those rules alone.

It is not evidence about the shipped default. The released public default remains
`witan-rubric-v17-2026-07-24`, whose own published figures come from a different instrument
measuring a different quantity — rubric agreement over bounded static evidence, not detection
recall against defects present in a repository. Holding one to the other's numbers is a category
error.
