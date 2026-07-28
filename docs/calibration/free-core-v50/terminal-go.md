# Free-core v50 terminal GO

Decision date: 2026-07-25 UTC

Rubric: `witan-rubric-v17-2026-07-24`

Detector revision: `8eff810a44014d06e257faa06cc2286e8ce639ae`

Decision: **GO — every frozen finding, criterion, and abstention gate passed.**

## Authorized claim

Cejel free-core rubric v17 passed a preregistered, untouched 200-repository
open-source holdout: 96.43% finding precision (95% lower bound 94.16%), 95.64%
worst-case recall (lower bound 92.23%), and 0.66% worst-case false-positive
rate (upper bound 1.10%), with every criterion and abstention gate passing.

## Frozen result

| Family | Estimate | 95% interval or envelope | Gate | Result |
|---|---:|---:|---:|---|
| Finding precision | 96.43% | 94.16%–98.40% | lower bound at least 80% | PASS |
| Finding worst-case recall | 95.64% | 92.23%–98.67% | lower bound at least 50% | PASS |
| Finding worst-case FPR | 0.66% | 0.29%–1.10% | upper bound at most 2% | PASS |
| Aggregate candidate insufficiency | 0.00% | descriptive | at most 20% | PASS |
| Aggregate control insufficiency | 0.00% | descriptive | at most 20% | PASS |
| Maximum active-rule control insufficiency | 0.00% | descriptive | at most 25% | PASS |
| Criterion applicability exact | 100.00% | 100.00%–100.00% | lower bound at least 90% | PASS |
| Criterion state exact | 91.77% | 89.73%–93.65% | lower bound at least 75% | PASS |
| Criterion within one state | 99.38% | 98.85%–99.81% | lower bound at least 90% | PASS |
| Criterion two-or-more error | 0.62% | 0.19%–1.15% | upper bound at most 5% | PASS |
| Inappropriate scoring | 0.00% | 0.00%–0.00% | upper bound at most 5% | PASS |
| Inappropriate abstention | 0.00% | 0.00%–0.00% | upper bound at most 10% | PASS |
| Measured-stress inappropriate scoring | 0.00% | 0.00%–0.00% | upper bound at most 10% | PASS |

All evidence-minimum, aggregate and active-rule precision, missingness,
interval-width, criterion, language-tier, and abstention gates passed.

## Claim boundary

This is finding-level calibration of the v17 free-core rule set on the
preregistered, untouched holdout. It measures whether the rule set's findings
are backed by bounded, inspectable static evidence under the frozen
protocol. It is not customer validation, a universal security guarantee, a
claim of vulnerability completeness, or evidence of dynamic-execution
coverage. It does not establish performance for other packs or populations.

---
## Prior-iteration and multiple-comparisons disclosure

Rubric `witan-rubric-v17` was evaluated exactly once, on the never-before-scanned v50 holdout, with
every repository from all prior holdouts authenticated and excluded from the v50 cohort. No rubric
revision was re-run against a second holdout after a decision: each revision in the development
sequence (rubric v7 through v17) was tested at most once, each on its own freshly drawn
200-repository cohort with rotated selection and control seeds and all earlier orders excluded.
Earlier revisions that did not pass were retired as immutable NO-GO records and used only as
development evidence to fix documented, named defects — not resampled and not folded into any later
claim. An earlier revision (rubric v15) had independently passed its own fresh-holdout gate on a
separate never-seen cohort before v17 was tested, so the v50 GO replicates the passing behaviour on
a second independent cohort rather than standing on a single draw. The reported v50 confidence
intervals are the intervals for the v50 cohort under the frozen estimator; they are not adjusted for
the number of prior revisions evaluated. The anti-leakage design — a fresh, prior-excluded cohort
for every revision, each tested once, with independent replication at v15 — is what makes the v50
result an out-of-sample measurement of rubric v17 rather than a selection artifact.
---

The record is immutable terminal GO. It must not be rescored, relabeled,
amended, or replaced with a favorable subset.

## Approved integrity hashes

| Record | SHA-256 |
|---|---|
| Source preregistration | `ae7c77f7f2d2c40292507f8792298afec253c8716cfa43e4d79bcf8ee6eb4611` |
| Frozen manifest | `b277944058f558066f762ebcbe45dc69f6e043ee3fc4f8dceae211c07164a7a3` |
| Hash trust root | `a215d59b11d2d58ce697bff671ec63103968a731f728946d6717fe577f498a32` |
| Sealed result | `249284f7093e5e3c6cc48f9ed82c62f5cdc2a31c069b5e7ce7ebc443862d1037` |
| Freeze record | `0a800ae75e7e453508f09376dc96d5cf3f9133fc15abe67d0e581a30b515ef75` |
| Final sealed artifact tree | `567fa34cb2c3e2f40a6fd363da6827352c653662b469589073c14f8813c10bae` |
