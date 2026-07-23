# PR 23 AI review pass B — measurement and claims

- Reviewer: `codex-ai-review-b`
- Reviewed commit: `24bb80f321aa17e4534335a314708b2f1377b42c`
- Review type: separate AI reasoning pass; not human review
- Cohort scans performed: no
- Result: `REQUEST_CHANGES`

## Independent checks

- Re-derived the untouched-only aggregate and per-rule denominators from labels, opportunities,
  findings, abstentions, and not-applicable states.
- Checked cohort cardinality/order/disjointness, opportunity-discovery completeness, blind label
  binding, finding-to-opportunity matching, threshold hashes, public-claim classes, and the
  trusted-run chronology.
- Re-ran adversarial tests for modified bindings, incomplete labels, substituted source spans,
  wrong workflow ancestry, edited timestamps, and artifact tampering.

## Findings

1. **P1 — The public-claim gate authenticates snapshots, not the named external surfaces.** The
   locked URL inventory is complete, but no release-time network verifier fetches those URLs and
   proves that the evaluated content came from them. The automatic NO-GO can therefore pass while
   a live listing makes a prohibited claim.
2. **P1 — The free-core automatic NO-GO remains authorable evidence.** The detector build is
   checked, but neither the baseline identity nor the parity execution is covered by the public
   run's immutable evidence bundle. This is insufficient for a release-blocking compatibility
   claim.

The counting logic otherwise remained denominated and untouched-only. This revision is not
approved; both findings require correction and a new exact-commit review.
