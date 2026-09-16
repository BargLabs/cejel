# Cycle-12 estimation result — the measured figure

> **Published transcription, redacted.** Operator-signed source record, held in the private
> measurement repository. **One redaction:** the operator-machine filesystem location of the
> result artifact — see [`REDACTIONS.md`](REDACTIONS.md). Path, pull-request and commit
> references below are that repository's and do not resolve here; they are code spans, not
> links.

Status: **IN FORCE — operator-signed.** Not in force until the operator signature block is complete.

Produced under `cycle-12-estimation-protocol.md` (in force), the signed draw addendum
(119 ids, seed `cycle-12-estimation-draw-2026-09-05`), and `untouched-estimator-spec-v3.json`
via `scoreUntouchedFindingsV3` (both merged signed, #1307). Labels: operator-authored, blinded,
field-parity viewer, 119/119 verified equal to the signed draw before scoring. Estimator run
2026-09-05, bootstrap seed `cycle-12-estimation-run-2026-09-05`, 10,000/10,000 valid
replicates. Result artifact: `estimation-result-2026-09-05.json` — *[operator-machine path
withheld under the disclosure boundary; the artifact is held operator-side and is not
published]*.

## The figure

**In-scope detection recall, seven measured rules, 200-repository untouched cohort:**
**33.99%, 95% CI [20.99%, 53.51%].**
**False-positive rate: 0.77%, 95% CI [0.00%, 2.13%].**

> **Instrument and date — read this with the figure, every time.**
>
> Measured source commit: **`e434a40e`**
> (`e434a40e6596536ac9c2645fefa71fc9f0eda7cb`) — the cejel revision the detector ran at.
>
> **Package version: not stated in this record.** This signed result names the pin, the
> estimator spec, the estimator function and the run date, but no `@cejel/cejel` release
> version. It is recorded as absent rather than inferred; supplying it is a correction owed to
> this record, not a value this publication may fill in.
>
> This measurement **predates cejel #276, #277 and the 0.4.8 abstention-scoring change.** A
> re-measurement on the current release is owed, and this figure must not be read as describing
> it.

Design-weighted totals: TP 28.00 · FP 2.00 · FN 29.68 · TN 256.63 · candidate-IC 10.00 ·
control-IC 24.69.

## Validity verdict: VALID

All seven rule-waves `included`. Aggregate design-weighted control insufficient-context share
7.94% against the 20% ceiling — not tripped. No small-stratum floor tripped (largest per-rule
control-IC: `A1-NO-COVERAGE-CONFIG` 3/13). `missingRulePolicy` applies to the nine undrawn
rules per the draw addendum's scope consequence, not to any measured wave.

## Scope — inseparable from the figure

The figure describes the **seven candidate-bearing rules** of the cycle-10 frozen cohort under
the pin (`e434a40e…`), nothing more: not the full rule set (nine rules undrawn per the signed
budget), not out-of-scope defect classes, not any population beyond this cohort. Any
publication carries this scope in the same sentence as the number.

## Per-rule observations (descriptive, not separately estimated)

Candidate side: A1 rules flawless (18/18 supported); insufficient-context concentrated in the
A2 secret family (`COMMITTED-SECRET` 3/4, `HISTORY-SECRET` 2/2, `HISTORY-ENV` 2/5) and A5
(3/10). Control-side misses (weighted FN sources): `A2-HISTORY-ENV` 4/9 sampled controls
supported, `A2-HISTORY-SECRET` 4/10, `A1-NO-COVERAGE-CONFIG` 3/13, `A5-NO-RECONCILIATION`
1/14. The fixture-measured prospective recall was 24/30 (80.0%); the cohort figure is 34.0%
*[95% CI 20.99%–53.51% — interval inserted by this publication so the point never appears
alone; the source sentence reads "34.0%"]* — the fixture-to-cohort gap is now measured, and the
miss inventory above, with §2's base rates, is the natural v23 detection roadmap.

## Decisions and defects of the run itself, recorded

1. **Bootstrap cell (decided post-draw, pre-CI, operator-ratified):** the protocol's
   "repository-clustered stratified percentile bootstrap" did not name the stratum. Per-rule
   cells were refused by the spec's own 30-cluster guard at this budget (max 27 repositories
   per rule in-draw). The operator ratified a single wave-level cell, repository-clustered,
   before any CI was computed under either option; point estimates are identical under both.
   Honoring the guard by widening the cell, not lowering the guard.
2. **One voided scoring run:** an operator-side runner edit accidentally commented out the
   `kind` field, classifying all 119 cases as controls; detected immediately from impossible
   output (TP=0 with 28 supported candidates), voided, fixed, re-run. Point estimates from the
   valid per-rule-cell run and the valid wave-level run agree exactly.
3. A separate printer defect displayed computed intervals as null; the estimator's output
   artifact was correct throughout.

## Two validity notes are attached to this figure

*[Publisher's cross-reference, not part of the signed source record. Both notes are themselves
signed records and are published in this directory; the source result predates them.]*

Both were found 2026-09-06/07, after signing, and **neither is applied**:

- [`cycle-12-validity-note-control-review-circularity.md`](cycle-12-validity-note-control-review-circularity.md)
  — one identified false miss. Direction: recall marginally **understated**.
- [`cycle-12-validity-note-2-evidence-provenance-and-abstention.md`](cycle-12-validity-note-2-evidence-provenance-and-abstention.md)
  — one packet carried evidence from the wrong path and revision, and five abstained criteria
  were silently counted as detection misses. Direction of the second: recall **overstated**
  under a definition that excludes abstentions.

The corrections point in opposite directions, no net is computed, and neither is applied.
**33.99% [20.99%, 53.51%] stands as measured.**

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-09-05T18:00:24Z
- Signature: Houman Azimi-Nejadi — cycle-12 result recorded: in-scope detection recall 33.99% [20.99%, 53.51%], FPR 0.77% [0.00%, 2.13%], seven measured rules, verdict VALID; wave-level bootstrap cell ratified post-draw pre-CI; one voided run and one printer defect recorded
