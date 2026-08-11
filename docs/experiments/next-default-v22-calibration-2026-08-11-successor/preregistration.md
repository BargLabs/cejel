# Next calibrated default candidate v22 — public successor preregistration

Status: **preregistered before any new cohort metadata query, candidate source access, or
candidate scan**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and public claim boundary

This is the public, redacted counterpart to the complete normative private successor selection
protocol for the next possible Cejel default. It evaluates the explicit prospective rubric
`witan-rubric-v22-prospective-2026-08-10`. It does not promote v22, publish a calibration
figure, or reinterpret any v17 result.

The public CLI default remains `witan-rubric-v17-2026-07-24`, the last calibrated rubric.
Published v17 calibration figures apply only to v17 and its frozen evaluation population.
Prospective v22 inherits none of those figures. It can become the public default only after this
experiment reaches terminal GO and a separate, dated promotion decision records the supported
scope and limitations.

## Why this successor is required

The existing public record at
`docs/experiments/next-default-v22-calibration-2026-08-11/preregistration.md` binds the
original private v22 wrapper. That wrapper did not contain the executable selection frame needed
by the freezer. The private successor supplies the complete frozen input before any selection
operation. No new cohort metadata query, candidate-repository source access, scan, review packet,
label, or result occurred under the original record. The original public record remains an
immutable, unused predecessor; it is not edited or erased.

## Immutable cross-repository binding

The complete private successor protocol merged into Alfred at commit
`18897f8848e5e7e0363c5d3ec59f9e1a7febab33`. Its required artifact blobs are:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-11-successor/preregistration.md` | `39f8969f1be2b584fd309dd902c5bedd231a038c` |
| `docs/calibration/next-default-v22-2026-08-11-successor/selection-spec.json` | `459ef92adda104ee1cd2fea365a618cd62a7056e` |

The successor retains the original private wrapper as an immutable predecessor at Alfred commit
`8b9c51d3c03529c9234624089fba55895d2c52a9`; it does not authorize a run.

Git ancestry does not cross repositories. Before the authorized private freezer runs, it must bind
this Cejel successor's eventual merge commit and this document's Git blob as cross-repository
immutable content bindings. Within Alfred, the private successor merge and the pushed freezer
harness commit must be strict ancestors of the order-freeze result commit. An embedded SHA or
timestamp alone is not sufficient evidence.

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
benchmark and requires a new preregistration. Later detector work, including any proposed D6
rule, is outside this candidate and must not be merged into or evaluated as its source boundary.

## Redacted design and execution boundary

The private successor fixes one non-replaceable, stratified hash-ranked wave of 200 public GitHub
repositories whose metadata reports size below 500,000 KiB. It inherits the free-core v50
untouched protocol's blinded review, packet-redaction audit, estimators, gates, and terminal
artifact closure through pinned private artifacts. Selection mechanics, seeds, exclusions,
identities, query responses, and later results remain private until their prescribed disclosure
stages.

Every scan must run under the frozen v4 host-plus-runtime isolation lane: a locally pinned Docker
image with `--network none`, no default route inside the scan container, read-only detector and
source mounts, writable output only, reduced container privileges, and the Node runtime deny hook.
This is evidence of the tested execution boundary; a finite probe inventory is a lower bound on
coverage, not a proof of complete no-egress. Repository scripts, hooks, package-manager lifecycle
steps, builds, tests, imports, binaries, notebooks, and generated programs are forbidden from
execution.

## Terminal rule and authorization boundary

Only one complete frozen wave may produce a result. A public calibration statement is licensed
only if every inherited finding, criterion, score, abstention, review, packet-audit, estimator,
and hash-closure gate passes. It must name the exact v22 rubric and frozen source boundary and
must not pool or transfer figures with v17.

Any binding mismatch, source change, execution-integrity failure, redaction failure, missing
artifact, failed gate, retry, or replacement is terminal NO-GO. A terminal NO-GO retires the
cohort; it is not repaired by editing this record or rerunning selected identities.

After this public successor and its private counterpart are merged and their bindings are
authenticated, the private protocol authorizes exactly one metadata-only order freeze. It does
not authorize candidate-repository source access, a candidate scan, a v22 default change, a
customer-facing claim, or a calibration result.
