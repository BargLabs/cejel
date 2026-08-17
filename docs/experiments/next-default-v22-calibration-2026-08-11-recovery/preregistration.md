# Next calibrated default candidate v22 — public recovery preregistration

Status: **preregistered before any new cohort metadata query, candidate source access, or
candidate scan**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and public claim boundary

This is the public, redacted counterpart to the complete normative private recovery selection
protocol for the next possible Cejel default. It evaluates the explicit prospective rubric
`witan-rubric-v22-prospective-2026-08-10`. It does not promote v22, publish a calibration
figure, or reinterpret any v17 result.

The public CLI default remains `witan-rubric-v17-2026-07-24`, the last calibrated rubric.
Published v17 calibration figures apply only to v17 and its frozen evaluation population.
Prospective v22 inherits none of those figures. It can become the public default only after this
experiment reaches terminal GO and a separate, dated promotion decision records the supported
scope and limitations.

## Why a recovery is required

The original v22 public record at
`docs/experiments/next-default-v22-calibration-2026-08-11/preregistration.md` and its private
counterpart correctly fixed the candidate boundary, but their private wrapper was not a complete
input accepted by the cohort freezer. It lacked the executable selection frame, strata, wave
geometry, exclusion inputs, and execution fields. Filling those choices while making the first
metadata query would introduce unpreregistered discretion.

No metadata query, candidate-repository source access, candidate scan, review-packet construction,
label, or result occurred under the original record. The original record remains an immutable,
unused predecessor; it is not edited or erased. This recovery freezes a complete private input
before the first authorized metadata query, while leaving the candidate unchanged.

The previous successor attempt is likewise an immutable unused predecessor. It closed before any
candidate query because its receipt-producing freezer did not produce its required artifacts. The
repair bound below makes artifact verification an independent post-freezer action; it supplies no
evidence about v22 quality.

## Immutable cross-repository binding

The complete private recovery protocol merged into Alfred at commit
`ebda6e654af6d10b2810b087917f553e44d9d219`. Its required artifact blobs are:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-11-recovery/preregistration.md` | `ce26208039d3db916b32aa6c1ae2c07c8e1e52a5` |
| `docs/calibration/next-default-v22-2026-08-11-recovery/selection-spec.json` | `dfc9abe79bbd713ac18ed440b0cc5ac3eed49d20` |
| `docs/calibration/next-default-v22-2026-08-11-recovery/control-anchors.json` | `f5edc20b99c6c86388617ad0adf4fd5c6bd2cda4` |

The recovery additionally requires Alfred commit
`066bc972d28fb5441eba594566168c260f736898` (#895). Its receipt-repair artifacts are:

| Repair artifact | Git blob |
| --- | --- |
| `packages/witan/scripts/run-v22-successor-order-freeze.mjs` | `a34d3fb0cd774f3d12598dabfefd2b1b83bee92a` |
| `packages/witan/scripts/verify-v22-order-freeze-artifacts.mjs` | `53323321ab2b063a5bc73fb9365dfd68dedb41cf` |
| `packages/witan/src/__tests__/v22-order-freeze-verifier.test.ts` | `d2e922cb5913b23eff82c3c7693afb8edf6f16bf` |

The freezer cannot write a completion receipt. Only the independent verifier may do so after the
freezer exits and it has listed and hashed the complete required artifact closure. Missing artifacts
therefore entail no receipt; a repair binding mismatch is terminal NO-GO.

Git ancestry does not cross repositories. Before the authorized private freezer runs, it must bind
this Cejel recovery's eventual merge commit and this document's Git blob as cross-repository
immutable content bindings. Within Alfred, the private recovery merge, receipt-repair commit, and
pushed recovery harness commit must be strict ancestors of the order-freeze result commit. An
embedded SHA or timestamp alone is not sufficient evidence.

## Candidate boundary

| Field | Frozen value |
| --- | --- |
| Cejel source commit | `45e59eeccee3010cb5bd059cc2ce3dec88f52cd9` |
| Cejel source tree | `ddcfbe06f854b161cad2c4a64c969b49e751ecc8` |
| Source package version | `0.4.0` |
| Candidate rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Public default | `witan-rubric-v17-2026-07-24` |
| Execution policy | `container-network-none-plus-node-runtime-deny-hook-v4` |

The candidate source tree, rubric, collectors, scoring, evidence contract, execution policy, and
private selection specification are frozen. A change to any of them is terminal NO-GO for this
benchmark and requires a new preregistration. Later detector work, including any proposed D6 rule,
is outside this candidate and must not be merged into or evaluated as its source boundary.

## Redacted design and execution boundary

The private recovery fixes one non-replaceable, stratified hash-ranked wave of 200 public GitHub
repositories whose metadata reports size below 500,000 KiB. It inherits the free-core v50 untouched
protocol's blinded review, packet-redaction audit, estimators, gates, and terminal artifact closure
through pinned private artifacts. Selection mechanics, seeds, exclusions, identities, query
responses, and later results remain private until their prescribed disclosure stages.

Every scan must run under the frozen v4 host-plus-runtime isolation lane: a locally pinned Docker
image with `--network none`, no default route inside the scan container, read-only detector and
source mounts, writable output only, reduced container privileges, and the Node runtime deny hook.
This is evidence of the tested execution boundary; a finite probe inventory is a lower bound on
coverage, not a proof of complete no-egress. Repository scripts, hooks, package-manager lifecycle
steps, builds, tests, imports, binaries, notebooks, and generated programs are forbidden from
execution.

## Terminal rule and authorization boundary

Only one complete frozen wave may produce a result. A public calibration statement is licensed
only if every inherited finding, criterion, score, abstention, review, packet-audit, estimator, and
hash-closure gate passes. It must name the exact v22 rubric and frozen source boundary and must not
pool or transfer figures with v17.

Any binding mismatch, source change, execution-integrity failure, redaction failure, missing
artifact, failed gate, retry, or replacement is terminal NO-GO. A terminal NO-GO retires the cohort;
it is not repaired by editing this record or rerunning selected identities.

After this public recovery and its private counterpart are merged and their bindings are
authenticated, the private protocol authorizes exactly one metadata-only order freeze. It does not
authorize candidate-repository source access, a candidate scan, a v22 default change, a
customer-facing claim, or a calibration result.
