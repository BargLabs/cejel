# PR 23 independent review pass A — corrective commit 1

- Reviewer: `codex-review-a:pr23-87e6a99-20260722`
- Reviewer kind: `ai`
- Reviewed commit: `87e6a99d630f15bea7a9b8531093469d33a145d9`
- Verdict: `REQUEST_CHANGES`
- Review isolation: performed without access to pass B conclusions
- Cejel detector run on calibration cohorts: `no`

## Findings

1. **P1:** recall could be inflated because supplied label records were not required to cover a
   frozen, content-addressed inventory of every predefined defect opportunity.
2. **P1:** blind independent labeling was declared but not enforced; the passing fixture exposed
   detector output to both reviewers, and experimental GO did not require review-coverage minima.
3. **P2:** adjudication status and supersession lifecycle were not fully constrained.

## Verified fixes from the preceding review

Receiver provenance, item-level double-label denominator, active cohort replacements, explicit AI
review governance, evidence-derived measurement, correction-ledger structure, documented path
support, and the 30-minute runner limit were verified. Product tests were 327/327 and calibration
tests were 18/18.

## Freeze verdict

`HOLD`. The corrected cohort metadata was eligible, but the release gate could still produce an
unsupported recall result. Both isolated passes must rerun after fixes.
