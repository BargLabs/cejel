# PR 23 independent review pass A — corrective commit 3

- Reviewer: `codex:gpt-5.6-sol:pr23-review-a-d9bd16c7`
- Reviewer kind: `ai`
- Reviewed commit: `d9bd16c7e7e9036ce9008a9f7c13c05285678813`
- Verdict: `REQUEST_CHANGES`
- Review isolation: performed without access to pass B conclusions
- Cejel detector run on calibration cohorts: `no`

## Findings

1. **P1:** matched findings with `not_applicable` or `insufficient_source` labels could disappear
   from precision, false-discovery, and critical-false-positive gates instead of resolving to a
   true or false positive.
2. **P1:** automatic audit evidence remained semantically forgeable because magic assertion names
   and arbitrary content hashes were accepted without check-specific substantive derivation.
3. **P1:** destructured JavaScript parameters could retain imported SDK provenance and create false
   critical findings.
4. **P1:** the correction ledger was not proven to contain the exact set of missed defects derived
   from the committed golden labels and result matching.
5. **P1:** documentation said a LangChain import established applicability although v1 detection
   only recognizes supported provider and Vercel call forms.
6. **P2:** the cohort witness did not bind every normative review artifact and the final manifest
   did not bind the candidate-byte digest.

## Freeze verdict

`HOLD`. No calibration cohort was scanned. The measurement and evidence contracts require another
corrective commit and two fresh exact-commit reviews before cohort freeze.
