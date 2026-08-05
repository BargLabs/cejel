# v17 evidence-hash label partition — preregistration

Status: preregistered before recomputing any packet hash or partition.

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Scope and immutable inputs

This is a partition of the labels used by the completed v17 re-bind at
`BargLabs/cejel@d53066e0073de66d32b7e4aa58286c7c7354fedb`; it is neither a corpus
scan nor a detector, rubric, threshold, score-derivation, label, original-packet, or GO-record
change. The 200/200 re-bind run remains the run recorded at
`88ede8569eb00c44e0ceabcf448612500ad2bfad`.

The frozen sources are the original criterion and finding packets and keys at
`BargLabs/alfred@7354b40`, under
`docs/calibration/free-core-untouched-holdout-v50-2026-07-24/wave-1/`. Alfred is read-only.
The frozen populations are 2,200 criterion-review cases and 1,005 finding-review cases.

## Fixed partition rule

For every frozen case, regenerate its public packet case from the already-recorded current report,
using the original packet generator and hash implementation at
`BargLabs/alfred@7354b40:packages/witan/src/untouched-wave.ts`. A frozen case **carries** its
sealed label only when both packet identity values match literally:

- criterion cases: `promptHash` and `evidenceHash`;
- finding cases: the packet's proposition/prompt identity hash (`propositionHash`) and
  `evidenceHash`.

Every other frozen case goes to **adjudication**. There is no third category. Per-snippet hashes
are authenticated diagnostic detail; they do not relax this two-value carry rule.

There is **no supplementary normalisation**. Specifically, this partition adds no field deletion,
field renaming, key sorting, array sorting, whitespace rewriting, metadata suppression, path
rewriting, or hash substitution. The only serialization is the original generator's exact
`JSON.stringify` input to SHA-256, including its original redaction and field construction. A
rendering-only difference that changes either stored hash therefore goes to adjudication.

An emitted current finding that has no frozen finding-case identity is additive: it goes to
adjudication and is recorded separately from the 1,005 frozen cases. It is never silently dropped,
substituted for a control, or treated as a false negative merely because the frozen detector did
not emit it.

## Predictions recorded before partition

The preceding report-surface review predicts approximately:

| Population | Expected carry | Expected adjudication | Basis |
|---|---:|---:|---|
| Criterion (2,200 frozen cases) | 2,191 | 9 | Nine reports changed a metric fact or assertion; 15 are believed cosmetic evidence presentation. |
| Finding (1,005 frozen cases) | 998 | 7 | Five reports add an assertion and two re-anchor evidence; no cosmetic difference is normalised away. |

The prediction is about hash outcomes, not a permission to force those outcomes. A material
departure—especially hundreds of cases—means the hash boundary and earlier surface comparison
disagree. It is a finding to investigate before adjudication or any metric calculation.

## Fixed post-adjudication estimator treatment

The only labels used after this partition are carried frozen labels plus new blind adjudications.
The frozen review key continues to supply each carried case's candidate/control identity and its
original control stratum and design weight.

For an adjudicated frozen case, its original key role is retained. For an additive current emitted
finding, the generated adjudication key records it as a candidate under its current rule and
repository. Its blind label contributes as follows:

- `supported` is a true positive and `not_supported` a false positive in the finding-precision
  candidate denominator; `insufficient_context` remains candidate missingness.
- The same candidate true-positive contribution enters the numerator of complete-case and
  worst-case finding recall. It does not manufacture a false negative or alter the frozen
  control-population weights.
- An additive finding never enters a control stratum. Thus a detector that correctly emits a new
  true positive is not penalised for lacking an earlier emitted-finding label.

Criterion applicability and state estimates use carried plus adjudicated labels, retaining the
already-fixed answered denominator and reporting it beside the 2,200-row accounting. Finding
precision, worst-case recall, and worst-case FPR use the original estimator and clustered bootstrap
with these replacement/additive contributions. Every resulting figure must show carried and
adjudicated counts, additive current findings if any, and its answered denominator. The existing
interval rule remains fixed: inside the published interval is reproduced; outside it in either
direction is drift; an unsound denominator is not comparable.

## Blind adjudication boundary

Before any adjudication, `finding-review/override-audit.csv` will be read from the frozen Alfred
wave. A new packet will use the original packet structure, bounded-evidence rules, sealing, and
key separation. The adjudicator sees neither the old label nor whether a case is new, re-anchored,
or capable of moving a published figure.

No partition result, adjudication, or metric is computed by this document. Once committed, this
preregistration is immutable; any correction requires a later erratum rather than an edit.
