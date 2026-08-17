# Next calibrated default candidate v22 — public execution preregistration

Status: **preregistered before any frozen candidate repository source is acquired, scanned,
reviewed, labelled, or estimated**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and public claim boundary

This is the public, redacted counterpart to Alfred's normative v22 recovery execution
preregistration. It authorizes no default change and discloses no selected identity, repository
source, scan output, review packet, label, or estimate.

The public/default rubric remains `witan-rubric-v17-2026-07-24`, the last calibrated rubric.
Published figures remain v17 figures. Prospective
`witan-rubric-v22-prospective-2026-08-10` inherits none of them and may become the default only
after a terminal GO and a separate, dated promotion decision states the licensed scope and
limitations.

## Immutable cross-repository binding

The private execution authorization merged in Alfred at
`9863207fda2b59db9e7956a921edd8304888f17d` (PR #902). Its normative document is:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-11-recovery/execution-preregistration.md` | `c2b6d861d3073645ec6b2b8db8d71742983cd30f` |

It binds the one completed metadata-only order-freeze record at Alfred PR #900, including its
independently verified receipt and the immutable manifest, order, universe, and hash artifacts.
That order supplied no source scan or calibration result. The execution harness must authenticate
both the Alfred private merge/document blob and this Cejel merge/document blob as immutable
cross-repository content bindings; Git ancestry is required only within the repository that holds
the result, because Git ancestry does not cross repositories.

## Frozen candidate and execution boundary

| Field | Frozen value |
| --- | --- |
| Cejel source commit | `45e59eeccee3010cb5bd059cc2ce3dec88f52cd9` |
| Cejel source tree | `ddcfbe06f854b161cad2c4a64c969b49e751ecc8` |
| Package version | `0.4.0` |
| Candidate rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Retained public default | `witan-rubric-v17-2026-07-24` |
| Execution policy | `container-network-none-plus-node-runtime-deny-hook-v4` |

No detector, collector, rubric, rubric version, evidence, score, source tree, execution policy,
control, review procedure, estimator, or gate may change within this benchmark. A change is
terminal NO-GO and needs a fresh preregistration. Subsequent D-series work is outside the frozen
candidate.

No candidate source may be decoded or scanned until a separately reviewed execution harness is
pushed, independently authenticated, and its synthetic end-to-end tests prove all required
artifacts and an independent post-freezer receipt verifier. The source checkout and build must
authenticate the exact frozen commit/tree/package boundary and succeed offline; a mismatch or
failure is terminal NO-GO.

Each scan uses a pinned Docker image with `--network none`, no default route, read-only detector
and source mounts, writable output only, reduced privileges, and the Node runtime deny hook.
Repository scripts, hooks, package scripts, imports, binaries, notebooks, builds, tests, and
generated programs never execute. The control inventory is derived from the hook checks and
includes direct `node:dns/promises` and resolver API coverage. Probe counts are lower bounds on
coverage, never proofs of complete no-egress. All controls must pass before a candidate source is
decoded or scanned.

## Review, estimation, and terminal rule

The private protocol applies the prebound free-core blinded-review, packet-redaction, identity
audit, label seal, control, adjudication, estimator, and terminal gate procedures to the single
frozen order. Reviewers receive only audited redacted packets and cannot be detector authors,
scanner operators, protocol authors, or holders of identity keys or prior labels/metrics before
sealing their labels.

Any control failure, source-boundary mismatch, scan-integrity failure, missing artifact,
identity-redaction failure, failed review/estimator gate, replacement, retry after candidate
execution begins, or post-result amendment is terminal NO-GO. The terminal record must say
whether a NO-GO came from an instrument failure (which measures nothing about v22) or a failed
precommitted measurement gate.

Only a complete terminal GO licenses a bounded public v22 calibration statement, clearly labelled
with its rubric and source boundary. A default-rubric promotion remains a separate decision even
then. Until such a decision, v17 is the sole calibrated public default.
