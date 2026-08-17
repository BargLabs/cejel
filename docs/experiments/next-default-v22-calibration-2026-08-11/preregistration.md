# Next calibrated default candidate v22 — public preregistration

Status: **preregistered before any new cohort metadata query or candidate source scan**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and public claim boundary

This is the public, redacted counterpart to the normative private selection protocol for the
next possible Cejel default. It defines an authenticated untouched-holdout calibration of the
explicit prospective rubric `witan-rubric-v22-prospective-2026-08-10`. It does not promote v22,
publish a new calibration figure, or reinterpret any v17 result.

The public CLI default remains `witan-rubric-v17-2026-07-24`, the last calibrated rubric.
Published v17 calibration figures apply only to v17 and its frozen evaluation population.
Prospective v22 inherits none of those figures. It can become the public default only after this
experiment reaches terminal GO and a separate, dated promotion decision records the supported
scope and limitations.

## Immutable cross-repository binding

The private normative protocol merged into Alfred at commit
`8b9c51d3c03529c9234624089fba55895d2c52a9`. Its two required artifact blobs are:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-11/preregistration.md` | `755c84b6d04a708dbd3827bb2bc6ff8700a3cfe0` |
| `docs/calibration/next-default-v22-2026-08-11/selection-spec.json` | `48b87ca65f5b1051b7d189e154a4bacd48e90322` |

Git ancestry does not cross repositories. Any future private harness must bind the eventual
merged Cejel commit and this document's blob as cross-repository immutable content bindings;
within Alfred, the private protocol merge and harness commit must be strict ancestors of the
result commit. An embedded SHA or timestamp alone is not sufficient evidence.

## Candidate boundary

| Field | Frozen value |
| --- | --- |
| Cejel source commit | `45e59eeccee3010cb5bd059cc2ce3dec88f52cd9` |
| Cejel source tree | `ddcfbe06f854b161cad2c4a64c969b49e751ecc8` |
| Source package version | `0.4.0` |
| Candidate rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Public default | `witan-rubric-v17-2026-07-24` |
| Execution policy | `container-network-none-plus-node-runtime-deny-hook-v4` |

The candidate source tree, rubric, collectors, scoring, evidence contract, execution policy,
and selection specification are frozen. A change to any of them is terminal NO-GO for this
benchmark and requires a new preregistration. Later detector work, including any proposed D6
rule, is outside this candidate and must not be merged into or evaluated as its source boundary.

## Design

The private protocol fixes a single, non-replaceable, stratified hash-ranked wave of 200 public
GitHub repositories whose metadata reports size below 500,000 KiB. It inherits the free-core v50
untouched protocol's stratum design, independent blinded-review process, packet-redaction audit,
estimators, gates, and terminal artifact closure through explicitly pinned private blobs.

Fresh selection, control, and review-order seeds are private until the appropriate order-freeze
and disclosure stages. Every previously exposed calibration, development, leaderboard, dogfood,
customer-zero, BargLabs, invalidated, and known-exposed identity is excluded before selection.
Unavailable or invalid members are recorded; they are never replaced. No cohort identity, query
response, repository source, scanner output, label, or result has been accessed for this
experiment before this public preregistration.

Every scan must run under the frozen v4 host-plus-runtime isolation lane: a locally pinned Docker
image with `--network none`, no default route inside the scan container, read-only detector and
source mounts, writable output only, reduced container privileges, and the Node runtime deny
hook. This is evidence of the tested execution boundary; a finite probe inventory is a lower
bound on coverage, not a proof of complete no-egress.

Repository scripts, hooks, package-manager lifecycle steps, builds, tests, imports, binaries,
notebooks, and generated programs are forbidden from execution.

## Terminal rule

Only one complete frozen wave may produce a result. A public calibration statement is licensed
only if every inherited finding, criterion, score, abstention, review, packet-audit, estimator,
and hash-closure gate passes. It must name the exact v22 rubric and frozen source boundary and
must not pool or transfer figures with v17.

Any binding mismatch, source change, execution-integrity failure, redaction failure, missing
artifact, failed gate, retry, or replacement is terminal NO-GO. A terminal NO-GO retires the
cohort; it is not repaired by editing this preregistration or rerunning selected identities.

## Authorization boundary

Merging this public record authorizes only the later metadata-only order freeze described in the
private protocol. It does not authorize a v22 default change, a customer-facing claim, a
calibration result, or discovery before the private/public protocol bindings are authenticated.
