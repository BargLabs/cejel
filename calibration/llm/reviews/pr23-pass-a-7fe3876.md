# PR 23 independent review pass A — corrective commit 2

- Reviewer: `codex-review-a:pr23-7fe3876-r3-20260722`
- Reviewer kind: `ai`
- Reviewed commit: `7fe38769f2caedd9eea9f607ac3803582993d362`
- Verdict: `REQUEST_CHANGES`
- Review isolation: performed without access to pass B conclusions
- Cejel detector run on calibration cohorts: `no`

## Findings

1. **P1:** finding-to-opportunity matching did not enforce evidence path/span overlap.
2. **P1:** source evidence hashes were not proven against bytes under the pinned Git tree.
3. **P1:** free-core parity and prohibited-claim automatic checks still accepted opaque arbitrary
   artifact hashes.
4. **P1:** cohort witness candidate hashes used a different contract from the freeze tool.
5. **P2:** post-run finding-review timestamps were not required to follow execution completion.

## Freeze verdict

`HOLD`. Cohort metadata resolved, remained disjoint, and had not been scanned, but measurement
evidence could still support incorrect attribution or fabricated inputs.
