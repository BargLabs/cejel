# PR 23 independent review pass B — corrective commit 2

- Reviewer: `codex-ai-review-b:pr23:7fe38769:2026-07-23`
- Reviewer kind: `ai`
- Reviewed commit: `7fe38769f2caedd9eea9f607ac3803582993d362`
- Verdict: `REQUEST_CHANGES`
- Review isolation limitation: a broad repository search inadvertently returned two short lines
  from review-directory filenames; findings were independently reproduced, but this pass is not
  represented as perfectly isolated
- Cejel detector run on calibration cohorts: `no`

## Findings

1. **P1:** witness candidate byte hashes were stale.
2. **P1:** JavaScript destructuring and Python tuple assignment retained invalid SDK provenance.
3. **P1:** findings could be matched to the wrong same-rule frozen opportunity.
4. **P1:** automatic audit artifacts could be fabricated behind opaque hashes.
5. **P1:** blind-label hashing alone did not independently timestamp pre-result existence.
6. **P1:** finding-review chronology was unenforced.
7. **P1:** report findings could contradict rule states.
8. **P2:** the correction ledger could not honestly represent a missed defect without a finding.
9. **P2:** README and correction-ledger template wording was stale.

## Freeze verdict

`HOLD`. A fresh, fully isolated pass is required after fixes because this pass had the disclosed
search-contamination limitation.
