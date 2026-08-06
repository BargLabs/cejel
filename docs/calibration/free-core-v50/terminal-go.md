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

## Addendum — source and npm artifact provenance (2026-08-06 UTC)

This is an additive disclosure. It does not revise the decision, estimates, protocol, or sealed
result above.

### Frozen detector and public source counterpart

The detector revision named above, `alfred@8eff810a44014d06e257faa06cc2286e8ce639ae`, is a private
commit and has no public Cejel counterpart at that SHA. Its behavioural public counterpart for the
v17 free core is `BargLabs/cejel@e51dac201b68a09ff7145c9e75284e5ac5bf776d` (tag `v0.1.10`).

Two independent source comparisons reached the same result with different file-set definitions and
methods. The blind pass compared production files under Alfred `packages/witan/src/**` and Cejel
`src/witan/**`, excluding paths below `__tests__/` but retaining declarations and fixtures outside
those directories; it also compared Alfred `packages/shared/src/schemas/witan.ts`, resolved through
`@alfred/shared`, with Cejel `src/witan/schemas.ts`. It found no behavioural difference in the free
core.

The following checks agreed:

- The free-core criterion-id set is identical: `A1`, `A2`, `A3`, `A4`, `A5`, `B1`, `B2`, `B3`,
  `B4`, `B5`, `B6`.
- Both revisions use rubric value `witan-rubric-v17-2026-07-24`.
- `witanVerdictForScore` is byte-identical (SHA-256
  `e6309f83359de77ddf2a95a6a36d772779bb9ff09a2f4746bfbbec368a11e6e9`).
- No Alfred-only module is reachable from the sealed `scoreRepoWithPublicCejel` free-core scan
  closure. Cejel-only `schemas.ts` is the vendored counterpart of Alfred's reachable schema source,
  not an unmatched feature module.

Every differing path in that comparison is classified **NON-BEHAVIOURAL** for the v17 free-core
scan path:

| Paths | Classification and reason |
|---|---|
| `abstention.ts`, `attestation.ts`, `badge.ts`, `coverage.ts`, `external-findings.ts`, `finding-limits.ts`, `finding-presentation.ts`, `generic-adapter.ts`, `ingest.ts`, `markdown.ts`, `public-scan.ts`, `sarif-adapter.ts`, `scorecard-adapter.ts`, `scoring.ts` | NON-BEHAVIOURAL — schema import-resolution changes only. |
| `html.ts` | NON-BEHAVIOURAL — module resolution to the byte-identical verdict helper only. |
| `index.ts` | NON-BEHAVIOURAL — symbol visibility and additive exports outside the sealed public-scan closure. |
| `repo-signals.ts` | NON-BEHAVIOURAL — Cejel additionally exports `buildV17ReviewableSourceProof`; the sealed scan calls the same unexported implementation. |
| `rubric.ts` | NON-BEHAVIOURAL — comment-only `.js`/`.ts` reference. |
| Alfred `packages/shared/src/schemas/witan.ts` and Cejel `src/witan/schemas.ts` | NON-BEHAVIOURAL — Cejel vendors the free-core schema; Alfred-only schema additions are quant/healthcare ids and unused evidence kinds, with no free-core-closure references. |
| Alfred-only `archetype-ratio-golden-set.ts`, `batch-cli.ts`, `batch.ts`, `browser.ts`, `calibration-review.ts`, `cejel-package-name.ts`, `claim-reality.ts`, `cli-onprem-entry.ts`, `cli.ts`, `cohort-selection-script.d.ts`, `healthcare-integrity.ts`, `healthcare-rubric.ts`, `leaderboard-cli.ts`, `leaderboard-freshness-cli.ts`, `leaderboard-freshness.ts`, `leaderboard-reproducibility-cli.ts`, `leaderboard-reproducibility.ts`, `leaderboard.ts`, `license.ts`, `quant-blind-review-cli.ts`, `quant-calibration-cli.ts`, `quant-evidence-contract-v1-cli.ts`, `quant-evidence-contract-v1-evaluator.ts`, `quant-evidence-contract-v1.ts`, `quant-integrity.ts`, `quant-metrics-grading.ts`, `quant-metrics.ts`, `quant-rubric.ts`, `quant-rule-registry.ts`, `quant-run-tier-grading.ts`, `quant-terminal-adjudication.ts`, `quant-terminal-estimator-cli.ts`, `quant-terminal-execution.ts`, `quant-terminal-wave-cli.ts`, `quant-trial-provenance.ts`, `quant-v23-cache-evidence.ts`, `repo-clone.ts`, `spot-check-cli.ts`, `untouched-estimator-v2-cli.ts`, `untouched-estimator-v2.ts`, `untouched-label-seal-cli.ts`, `untouched-negative-control.ts`, `untouched-packet-audit-cli.ts`, `untouched-packet-audit.ts`, `untouched-wave-cli.ts`, `untouched-wave.ts`, `watermark.ts` | NON-BEHAVIOURAL — additive non-free-core functionality or calibration tooling outside the sealed scan closure. |
| Alfred-only `run-tier/cli.ts`, `run-tier/command-backend.ts`, `run-tier/docker-backend.ts`, `run-tier/docker-probe.ts`, `run-tier/index.ts`, `run-tier/isolation.ts`, `run-tier/manifest.ts`, `run-tier/run-tier.ts`, `run-tier/sandbox-runner.ts`, `run-tier/strategy-adapter-config.ts`, plus every file below `run-tier/__fixtures__/` | NON-BEHAVIOURAL — additive run-tier subsystem and fixtures outside the sealed scan closure. |

### Artifact binding strength

The source comparison is not an artifact binding. npm's public attestation endpoint for
`@cejel/cejel@0.1.10` returned 404, and its registry metadata contains no `gitHead`. The tarball
identifies itself as version `0.1.10` and names repository `BargLabs/cejel`, but embeds no commit.

The available release-event evidence is circumstantial: public tag `v0.1.10` points to `e51dac2`,
whose message is `release: Cejel v0.1.10 + CHANGELOG.md`; its author timestamp is 68 minutes before
the npm publish timestamp (its committer timestamp is approximately 25 minutes before it). Those
facts are coherent with a release event, but they do not bind the bundled npm artifact to that
source commit cryptographically or reproducibly.

### Current npm-release traceability finding

This limitation is not confined to the historical v0.1.10 release. The current npm version at the
time of this addendum, `@cejel/cejel@0.2.2`, records gitHead
`e645faeb0722e47ee6eeaa16f6fe77790dc20387`. The public `v0.2.2` tag instead resolves to reviewed
commit `10548118ae96d846172a8eca6e2668b44ae5496d` (`release: align 0.2.2 distribution metadata
(#46)`). No public branch or tag contains the recorded gitHead. Therefore the source revision named
by the currently published npm artifact is not obtainable from the public repository; this record
does not infer why the two commits differ or that their trees are equivalent.

The signed standalone-binary provenance described elsewhere is a claim about those binary release
assets, not an npm provenance binding, and is not assessed by this addendum.

A separate pending release-control change adds a GitHub Actions OIDC npm-publish workflow that
requires the chosen tag to be an ancestor of `origin/main` and publishes with npm provenance. npm
trusted-publisher configuration is additionally required at the package registry. If both controls
are in place for a future public release, npm can issue the cryptographic source-to-artifact binding
that v0.1.10 and v0.2.2 lack.

## Approved integrity hashes

| Record | SHA-256 |
|---|---|
| Source preregistration | `ae7c77f7f2d2c40292507f8792298afec253c8716cfa43e4d79bcf8ee6eb4611` |
| Frozen manifest | `b277944058f558066f762ebcbe45dc69f6e043ee3fc4f8dceae211c07164a7a3` |
| Hash trust root | `a215d59b11d2d58ce697bff671ec63103968a731f728946d6717fe577f498a32` |
| Sealed result | `249284f7093e5e3c6cc48f9ed82c62f5cdc2a31c069b5e7ce7ebc443862d1037` |
| Freeze record | `0a800ae75e7e453508f09376dc96d5cf3f9133fc15abe67d0e581a30b515ef75` |
| Final sealed artifact tree | `567fa34cb2c3e2f40a6fd363da6827352c653662b469589073c14f8813c10bae` |
