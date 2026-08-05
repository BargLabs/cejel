# Dual-control downstream-labelling erratum — 2026-08-05

Status: **correction to downstream descriptions; the frozen experiment record is unchanged**

## Scope of the frozen experiment

The dual-control preregistration scoped the measurement to two Cejel surfaces. Its guard 4 clause
states:

> Every seeded and clean phase must also record successful invocation of both Cejel surfaces
> (`static_rubric` and `quant_integrity_pack`); absence of either invocation invalidates the run
> before any rate is rendered.

The sixteen seeds were classified under the D-series taxonomy, but that classification did not make
the D-series pack an exercised surface. The supported future phrasing is:

> `static_rubric` and `quant_integrity_pack` caught 0 of 16 seeds classified under D-series taxonomy.

The experiment did not invoke or measure the D-series pack, nor did it establish recall for the
D1–D5 rules. The distinction matters because a class-labelled denominator describes the seeds, while
a rule-recall claim describes the detector that was run.

## Claim status

The re-derived result publisher classifies this outcome as non-claim-bearing. It refused a
claim-bearing result for these five recorded reasons:

- `held_out_recall_is_zero`
- `defect_class_has_zero_catches:decorative_predicate`
- `defect_class_has_zero_catches:fail_open_metadata`
- `defect_class_has_zero_catches:claim_artifact_mismatch`
- `defect_class_has_zero_catches:scope_aggregation`

This correction does not alter the frozen preregistration, raw artifact, baseline result, or its
existing errata.

## Affected downstream citations

The first two entries are borderline wording rather than false assertions: each appears in a
non-alteration list, but placing “the frozen dual-control `0 / 16`” alongside “D1 semantic `0 / 3`”
can imply that the former measured D-series rules. The ADR entries are substantive mislabellings,
including an unsupported completion claim.

| Citation | Downstream wording | Correct reading |
| --- | --- | --- |
| `docs/experiments/d-series-cross-artifact-conformance-pilot-preregistration-2026-08-01.md:90-91` | “It does not alter the frozen dual-control `0 / 16`, D1 semantic `0 / 3`, D1-config exact-signature `3 / 3`, or public precision `0 / 23` results.” | A historical two-surface result over D-series-classified seeds; it is not a D-series-pack measurement. This preregistration remains unannotated. |
| `docs/experiments/d-series-cross-artifact-conformance-runtime-recovery-result-2026-08-01.md:59-62` | “It does not alter the frozen dual-control `0 / 16`, D1 semantic `0 / 3`, D1-config exact-signature `3 / 3`, or public precision `0 / 23` results.” | The same historical two-surface result, not a D-series-pack measurement. That result carries the permitted pointer to this erratum. |
| `BargLabs/alfred` `docs/adr/0013-d-series-detection-rules.md:10` | “The dual-control recall experiment returned its first honest number on 2026-07-31: **0 of 16** seeded defects cited … D-series denominator: **D1 0 / 3; D2 not represented (n = 0); D3 0 / 5; D4 0 / 4; D5 0 / 4; D6 not represented (n = 0)**.” | The denominator classifies seeds under the D-series taxonomy; the measured surfaces were `static_rubric` and `quant_integrity_pack`. |
| `BargLabs/alfred` `docs/adr/0013-d-series-detection-rules.md:302-312` | “Re-run the dual-control experiment after D1/D2/D5 land, and publish both numbers with both denominators.” | This completion claim was unsupported: the cited 2026-07-31 baseline predated those rules and recorded only `static_rubric` and `quant_integrity_pack`. Alfred PR #818 corrects the checklist by leaving the rerun unchecked and recording that scope. |

Twenty-five other Phase 1 citations were already correctly scoped and remain untouched. This is a
limited correction to four downstream descriptions, not a change to the experiment or a new
programme-wide convention.
