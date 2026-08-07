# Addendum — v17 source reachability and public-artifact provenance

**Date:** 2026-08-06 UTC

**Status:** evidence addendum; not part of the sealed v50 artifact closure

This addendum records a post-decision source-reachability and npm-artifact
provenance check. It does not amend, relabel, rescore, or replace
[`terminal-go.md`](./terminal-go.md). That file remains an immutable, hash-bound
record: its digest in [`VERIFY.md`](./VERIFY.md) continues to bind its exact
published bytes.

## Question

The frozen free-core v17 detector source is
`BargLabs/alfred@8eff810a44014d06e257faa06cc2286e8ce639ae`. The nearest public
Cejel source release is tag `v0.1.10` at
`BargLabs/cejel@e51dac201b68a09ff7145c9e75284e5ac5bf776d`.

The question is not whether every source difference has a classification label.
It is whether the differences are reachable from the free-core scoring path that
produced the terminal-GO figures, and whether npm independently binds the public
`@cejel/cejel@0.1.10` artifact to that public source revision.

## Static source reachability

The public execution path is:

```text
src/index.ts → runCejelScan → scoreRepoWithPublicCejel
             → buildWitanInputFromRepo → createWitanReport
```

On that path, `buildWitanInputFromRepo` calls the pre-existing internal
`buildReviewableSourceProof` helper directly. The public-only
`buildV17ReviewableSourceProof` wrapper in `src/witan/repo-signals.ts` has no
non-test caller and is not re-exported from `src/witan/index.ts`; the package
declares CLI binaries only, not a source-subpath export.

The differing `dispatch_log` and `maeve_trace` enum members, and the
quant-integrity and healthcare-integrity criterion-ID constants, likewise have
no non-test Witan production references in the public source. No such reference
from the public free-core route reaches those constants. Both frozen and public
`createWitanReport` calls default to `WITAN_RUBRIC`.

**Static conclusion:** the identified source differences are not reachable from
the sealed free-core v17 scoring path. This supports the narrower statement that
those differences do not, by themselves, show that the terminal-GO figures were
computed differently from the public source route.

This is a source-level result only. It does not prove runtime equivalence,
exclude unsupported external imports, or establish bundler/tree-shaking behavior.

## Independent source-comparison record

Two independent source comparisons reached this conclusion with different
methods and file-set definitions. The blind pass compared production files under
Alfred `packages/witan/src/**` and Cejel `src/witan/**`, excluding paths below
`__tests__/` but retaining declarations and fixtures outside those directories.
It also compared Alfred `packages/shared/src/schemas/witan.ts`, resolved through
`@alfred/shared`, with Cejel `src/witan/schemas.ts`.

Its independently recorded checks were:

- the free-core criterion-ID set is identical: `A1`, `A2`, `A3`, `A4`, `A5`,
  `B1`, `B2`, `B3`, `B4`, `B5`, `B6`;
- both revisions use rubric value `witan-rubric-v17-2026-07-24`;
- `witanVerdictForScore` is byte-identical, SHA-256
  `e6309f83359de77ddf2a95a6a36d772779bb9ff09a2f4746bfbbec368a11e6e9`;
- no Alfred-only module is reachable from the sealed
  `scoreRepoWithPublicCejel` free-core scan closure; and
- Cejel-only `schemas.ts` is the vendored counterpart of Alfred's reachable
  schema source, not an unmatched feature module.

Every differing path in that comparison was classified **NON-BEHAVIOURAL** for
the v17 free-core scan path:

| Paths | Classification and reason |
|---|---|
| `abstention.ts`, `attestation.ts`, `badge.ts`, `coverage.ts`, `external-findings.ts`, `finding-limits.ts`, `finding-presentation.ts`, `generic-adapter.ts`, `ingest.ts`, `markdown.ts`, `public-scan.ts`, `sarif-adapter.ts`, `scorecard-adapter.ts`, `scoring.ts` | NON-BEHAVIOURAL — schema import-resolution changes only. |
| `html.ts`, `index.ts`, `repo-signals.ts`, `rubric.ts` | NON-BEHAVIOURAL — respectively, resolution to the byte-identical verdict helper; symbol visibility/additive exports outside the sealed closure; an additive wrapper while the sealed scan calls the shared implementation; and a comment-only `.js`/`.ts` reference. |
| Alfred `packages/shared/src/schemas/witan.ts` and Cejel `src/witan/schemas.ts` | NON-BEHAVIOURAL — Cejel vendors the free-core schema; Alfred-only schema additions are quant/healthcare IDs and unused evidence kinds, with no free-core-closure references. |
| Alfred-only `archetype-ratio-golden-set.ts`, `batch-cli.ts`, `batch.ts`, `browser.ts`, `calibration-review.ts`, `cejel-package-name.ts`, `claim-reality.ts`, `cli-onprem-entry.ts`, `cli.ts`, `cohort-selection-script.d.ts`, `healthcare-integrity.ts`, `healthcare-rubric.ts`, `leaderboard-cli.ts`, `leaderboard-freshness-cli.ts`, `leaderboard-freshness.ts`, `leaderboard-reproducibility-cli.ts`, `leaderboard-reproducibility.ts`, `leaderboard.ts`, `license.ts`, `quant-blind-review-cli.ts`, `quant-calibration-cli.ts`, `quant-evidence-contract-v1-cli.ts`, `quant-evidence-contract-v1-evaluator.ts`, `quant-evidence-contract-v1.ts`, `quant-integrity.ts`, `quant-metrics-grading.ts`, `quant-metrics.ts`, `quant-rubric.ts`, `quant-rule-registry.ts`, `quant-run-tier-grading.ts`, `quant-terminal-adjudication.ts`, `quant-terminal-estimator-cli.ts`, `quant-terminal-execution.ts`, `quant-terminal-wave-cli.ts`, `quant-trial-provenance.ts`, `quant-v23-cache-evidence.ts`, `repo-clone.ts`, `spot-check-cli.ts`, `untouched-estimator-v2-cli.ts`, `untouched-estimator-v2.ts`, `untouched-label-seal-cli.ts`, `untouched-negative-control.ts`, `untouched-packet-audit-cli.ts`, `untouched-packet-audit.ts`, `untouched-wave-cli.ts`, `untouched-wave.ts`, `watermark.ts` | NON-BEHAVIOURAL — additive non-free-core functionality or calibration tooling outside the sealed scan closure. |
| Alfred-only `run-tier/cli.ts`, `run-tier/command-backend.ts`, `run-tier/docker-backend.ts`, `run-tier/docker-probe.ts`, `run-tier/index.ts`, `run-tier/isolation.ts`, `run-tier/manifest.ts`, `run-tier/run-tier.ts`, `run-tier/sandbox-runner.ts`, `run-tier/strategy-adapter-config.ts`, and every file below `run-tier/__fixtures__/` | NON-BEHAVIOURAL — additive run-tier subsystem and fixtures outside the sealed scan closure. |

## npm artifact provenance

The npm registry record for `@cejel/cejel@0.1.10` names the package and version,
and publishes the following tarball integrity values:

| Value | Published / verified value |
|---|---|
| SHA-1 | `a62562a4a063c4011525f319bf55fb2a14f310a7` |
| SHA-512 (base64) | `m46JuAxZYw4pexM2fWXRGL6bcyRHvDkJUYgdvo0e4eje/wAGr07tbn899XS+UalX6GsLSXlTYsb10VMmQgoq+w==` |

The downloaded public tarball matched both values. Its embedded `package.json`,
and the npm version metadata, contain no `gitHead`; it names the `BargLabs/cejel`
repository but embeds no commit. The npm attestation endpoint returned no
provenance statement for this version.

The available release-event evidence is circumstantial: public tag `v0.1.10`
points to `e51dac201b68a09ff7145c9e75284e5ac5bf776d`, whose subject is
`release: Cejel v0.1.10 + CHANGELOG.md`. Its author timestamp is 68 minutes
before the npm publish timestamp; its committer timestamp is approximately 25
minutes before it. Those facts are consistent with a release event, but do not
cryptographically or reproducibly bind the tarball to that source commit.

**Artifact conclusion:** these checks bind the downloaded bytes to npm's
published `0.1.10` tarball, but they do **not** cryptographically bind that
tarball to `e51dac201b68a09ff7145c9e75284e5ac5bf776d`. A source-commit claim for
the npm artifact remains unproven by the available registry evidence.

## Current npm-release traceability finding

This limitation is not confined to the historical `0.1.10` release. The current
npm version at the time of this addendum, `@cejel/cejel@0.2.2`, records gitHead
`e645faeb0722e47ee6eeaa16f6fe77790dc20387`. The public `v0.2.2` tag instead
resolves to reviewed commit `10548118ae96d846172a8eca6e2668b44ae5496d`
(`release: align 0.2.2 distribution metadata (#46)`). No public branch or tag
contains the recorded gitHead. The published `0.2.2` artifact therefore was not
published from the tagged commit, and the source revision named by the current
npm artifact is not obtainable from the public repository. This record does not
infer why the commits differ or that their trees are equivalent.

The signed standalone-binary provenance described elsewhere is a claim about
those binary release assets, not an npm provenance binding, and is not assessed
by this addendum.

A separate pending release-control change adds a GitHub Actions OIDC npm-publish
workflow that requires the chosen tag to be an ancestor of `origin/main` and
publishes with npm provenance. npm trusted-publisher configuration is additionally
required at the package registry. If both controls are in place for a future
public release, npm can issue the cryptographic source-to-artifact binding that
`v0.1.10` and `v0.2.2` lack.

## Communication boundary

The terminal-GO figures remain bound to their recorded frozen detector revision,
protocol, and sealed result. The static reachability result supports describing
the public source route as free-core-equivalent with respect to the identified
differences. Until an independently verifiable build provenance statement binds
the npm tarball to the public source revision, this addendum does not authorize
describing the terminal-GO figures as measurements of the published npm artifact
itself.

## Scope and limits

- Both source comparisons used the named Git revisions, not a rerun of the frozen
  cohort or an execution-equivalence test.
- The npm checks were made on 2026-08-06 UTC against the public registry record
  and tarball for version `0.1.10`.
- This file is an after-the-fact provenance disclosure. It is outside the sealed
  artifact tree and does not change any pre-registered gate, metric, or digest.
