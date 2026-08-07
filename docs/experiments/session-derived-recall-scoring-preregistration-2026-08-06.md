# Session-derived real-anchor recall scoring preregistration — 2026-08-06

Status: preregistered before any Cejel scoring run

## Purpose and fixed population

This protocol scores the three qualifying session-derived defects catalogued in
`session-trace-recall-result-2026-08-01.md` (Edwin PRs 391, 376, and 365). It does
not select, remove, add, or remap an anchor. The scoring denominator is **3
session-derived real anchors**, not the separate 16 seeded dual-control defects
and not the 16 combined real anchors (13 GitHub A1–A3 plus these three).

The three anchors, their frozen defective revisions, and their defect-file paths
are fixed by the existing qualification catalog:

| ID | Anchor | Defective revision | Defect-file path |
|---|---|---|---|
| ST-01 | Edwin PR 391 | `45a43456e7e69df15cac2ebce2361955827c4cca` | `egbert_core/execution/fx_strategy_ownership_guard.py` |
| ST-02 | Edwin PR 376 | `639095941cb3ccbd2ae21873d8f6a9564745bf58` | `egbert_core/alpha/model_risk.py` |
| ST-03 | Edwin PR 365 | `16502580919b9d335e20674d3b376093c61cd423` | `egbert_core/api/routes/explanations.py` |

The Cejel scanner revision is this commit's parent,
`f8f0b23f144215be1e216ce8871447683bb2465b` (`origin/main` when this protocol was
created). All scans use a detached checkout of the listed defective revision;
the scan receives no fixture change, supplemental ingest, or manual finding.

## Catch predicate

`cited` reuses the dual-control predicate exactly: it inspects exact
defect-file equality only at `criterion.findings[].evidence.path`. A defect is
**caught** only when at least one native criterion's finding evidence path equals
that anchor's defect-file path exactly. Otherwise it is **missed**. A criterion
identifier or a positive-evidence path alone is not a catch.

This is intentionally narrower than “any structured path.” Six of 11 native
criteria (A1–A5 and B6) can emit finding paths; B2–B4 emit only
positive-evidence paths; B1 and B5 emit no path. No `6 / 11` multiplier applies.

## Mapping and reporting

No defect-to-Cejel-criterion mapping is preregistered. The D-series labels in
the qualification catalog describe defect shape, not an advance prediction of a
Cejel criterion. Each result row will report the observed caught/missed status,
the criterion if caught, and the exact evidence path if caught. An anchor that
cannot be checked out or scanned will be reported as **unscoreable** with its
reason and remains in the named denominator; it is not dropped or replaced.

The result will show all three rows before stating any count. It will not pool
these three session-derived real anchors with the 13 GitHub A1–A3 real anchors,
and it will not state a combined recall figure.

## Publication guards

This scoring uses the dual-control publication boundary: both zero and perfect
outcomes refuse claim-bearing output. A zero-catch outcome is a refusal, and a
perfect-catch outcome is a refusal. No guard will be weakened, bypassed, or
reinterpreted to print a recall claim. The result is an evidence record, not a
claim-bearing certificate.

## Independence

This protocol is an additive companion to the session-trace yield protocol. It
does not modify `dual-control-preregistration.md`,
`dual-control-result-2026-07-31.md`, or its errata.
