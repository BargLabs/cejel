# Session-derived real-anchor recall scoring result — 2026-08-06

Status: non-claim-bearing refusal under the preregistered zero-outcome guard

## Scope and protocol

This result executes
`session-derived-recall-scoring-preregistration-2026-08-06.md`, committed as
`bded8cacbe0491b6e38f6f6f3016760f69911694` before the first scan. The scanner
source revision was `f8f0b23f144215be1e216ce8871447683bb2465b`; the protocol
commit itself added documentation only. Every scan used the specified detached
defective revision, with no supplemental ingest or fixture modification.

The population is **3 session-derived real anchors**. It is not either other
sixteen: the seeded dual-control population is 16 injected defects (with 8
held-out), while the real-anchor inventory is 13 GitHub A1–A3 anchors plus these
3 session-derived anchors. This result does not score the 13 GitHub anchors and
does not calculate a 16-real-anchor figure.

The catch predicate is exactly the preregistered dual-control predicate:
`cited` inspects exact defect-file equality only at
`criterion.findings[].evidence.path`. A positive-evidence path, an unrelated
finding path, or a criterion name alone does not catch an anchor.

## Per-anchor outcomes

| ID | Defective revision | Defect-file path | Outcome | Criterion | Finding evidence path |
|---|---|---|---|---|---|
| ST-01 (Edwin PR 391) | `45a43456e7e69df15cac2ebce2361955827c4cca` | `egbert_core/execution/fx_strategy_ownership_guard.py` | Missed | None | None |
| ST-02 (Edwin PR 376) | `639095941cb3ccbd2ae21873d8f6a9564745bf58` | `egbert_core/alpha/model_risk.py` | Missed | None | None |
| ST-03 (Edwin PR 365) | `16502580919b9d335e20674d3b376093c61cd423` | `egbert_core/api/routes/explanations.py` | Missed | None | None |

No anchor was dropped, replaced, remapped, or unscoreable. The scanner emitted
unrelated finding evidence paths in all three runs, but none was equal to the
anchor's defect-file path and so none satisfies `cited`.

## Publication status

The preregistered zero-outcome guard refuses claim-bearing output. The measured
table therefore records a zero-catch **refusal**, not a printable recall claim.
The perfect-outcome guard remains equally binding, though it was not reached.

This result is adjacent in subject matter to the seeded dual-control experiment,
but does not combine, average, or treat either measurement as confirmation of the
other. No conclusion is drawn from a combined denominator.
