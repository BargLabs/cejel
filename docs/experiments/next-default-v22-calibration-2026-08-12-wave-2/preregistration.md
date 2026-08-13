# Next calibrated default candidate v22 — public wave-2 preregistration

Status: **preregistered before any candidate-universe metadata query, identity selection, order
freeze, source acquisition, scan, review, label, or estimate**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and public claim boundary

This is the public, redacted counterpart to the private normative wave-2 preregistration. It
authorizes no default change and discloses no selection, control, review-order seed, identity,
repository source, scan output, review packet, label, or estimate.

The public/default rubric remains `witan-rubric-v17-2026-07-24`, the last calibrated rubric.
Published figures remain v17 figures. Prospective
`witan-rubric-v22-prospective-2026-08-10` inherits none of them and may become the default only
after a terminal GO and a separate, dated promotion decision states the licensed scope and
limitations. Metrics from v17 and v22 must never be pooled or transferred.

## Immutable cross-repository binding

The private normative authorization merged in Alfred at
`28d3f2c3270d4a2dae6e1511f82eae09d91bc601` (PR #906). Its two normative artifacts are:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-12-wave-2/preregistration.md` | `4284a0f4a1d53850ad30f0f13f8355171c8ac13e` |
| `docs/calibration/next-default-v22-2026-08-12-wave-2/selection-spec.json` | `31a11de406c1fd44d88093e355c6b868a4f61890` |

Any future order-freeze and execution harness must authenticate the Alfred merge and both blobs,
plus this Cejel merge and document blob, as immutable cross-repository content bindings. Git
ancestry is required only within the repository that holds the asserted commit; it is not claimed
across repositories.

## Frozen candidate and execution boundary

| Field | Frozen value |
| --- | --- |
| Cejel source commit | `52d174ecc9b89af9387d1586f8d87dda9151a31c` |
| Cejel source tree | `348cd5f1fadfcd00b5e90e6dc7c1057ad1c6de55` |
| Package version | `0.4.0` |
| Candidate rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Retained public default | `witan-rubric-v17-2026-07-24` |
| Execution policy | `container-network-none-plus-node-runtime-deny-hook-v4` |
| Required launcher | `calibration/llm/scripts/run-v22-public-calibration.mjs` |
| Required verifier | `calibration/llm/scripts/v22-public-calibration-artifacts.mjs` |

No detector, collector, rubric, rubric version, evidence contract, score, source tree, execution
policy, control, review procedure, estimator, gate, selection specification, or named entrypoint
may change within this benchmark. A change is terminal NO-GO and requires a fresh preregistration.
Subsequent D-series work is outside the frozen candidate.

The execution stage may invoke exactly the named launcher under the frozen no-egress policy. The
independent verifier runs only after launcher exit, derives its receipt from the required output
closure, and must fail loudly without a receipt when an artifact is absent. Before any execution
one-shot is spent, the frozen revision's driver test suite must pass, including the missing-artifact
loud-failure test; failure is terminal NO-GO and measures nothing about v22.

## Cohort, review, and terminal rule

The private specification defines one fresh, terminal, immutable, stratified hash-ranked wave of
exactly 200 public repositories below 500,000 KiB. It inherits the v50 blinded review,
packet-redaction, identity-audit, label-seal, estimator, and terminal-gate procedures by exact
private bindings. It uses fresh private seeds and excludes the identities exposed by the retired
wave-1 cohort. There are no replacement positions.

All declared no-egress controls must pass before candidate source is decoded or scanned. A finite
probe count is a lower bound on coverage, not a proof of complete no-egress. Any binding mismatch,
metadata-integrity failure, source-boundary mismatch, failed control, execution-integrity failure,
missing output, identity-redaction failure, failed review or estimator gate, replacement, retry
after candidate execution begins, or post-result amendment is terminal NO-GO. The terminal record
must distinguish an instrument failure, which measures nothing about v22, from a failed
precommitted measurement gate.

Only terminal GO licenses a bounded public v22 calibration statement tied to this exact source
boundary. Even then, default promotion remains a separate dated decision. Until then, v17 remains
the sole calibrated public default.
