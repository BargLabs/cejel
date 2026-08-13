# Next calibrated default candidate v22 — public post-image-repair order preregistration

Status: **preregistered before any candidate-universe metadata query, identity selection, order
freeze, source acquisition, scan, review, label, or estimate**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and public claim boundary

This is the public, redacted counterpart to Alfred's normative post-image-repair order
preregistration. It authorizes no default change and discloses no selection seed, control seed,
review-order seed, identity, repository source, scan output, review packet, label, or estimate.

`witan-rubric-v17-2026-07-24` remains the sole calibrated public default. Published figures
remain v17-only. Prospective `witan-rubric-v22-prospective-2026-08-10` inherits none of those
figures and may become the default only after a terminal GO and a separate, dated promotion decision
states the licensed scope and limitations. Metrics from v17 and v22 must never be pooled or
transferred.

## Immutable cross-repository binding

The private normative authorization merged in Alfred at
`9fd6ec881c9ffbab8ac5678c90dddddf956c6685` (PR #930). Its two normative artifacts are:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-13-post-image-repair/preregistration.md` | `acd76c8cc3bd6028b76c73ac4939067f491a43dd` |
| `docs/calibration/next-default-v22-2026-08-13-post-image-repair/selection-spec.json` | `693704501388df13d6c8f4b90ebde62c57157ee5` |

Any order-freeze harness must authenticate the Alfred merge and both private document blobs, plus
this Cejel merge and document blob, as immutable cross-repository content bindings. Git ancestry is
required only within the repository that holds the asserted commit; it is not claimed across
repositories.

## Frozen candidate and execution boundary

| Field | Frozen value |
| --- | --- |
| Cejel source commit | `90f8fd473f1410eac512d38911e3df9bca96dae3` |
| Cejel source tree | `feeb978ac040946fc6e24194948167f69040afab` |
| Package version | `0.4.1` |
| Candidate rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Retained public default | `witan-rubric-v17-2026-07-24` |
| Execution policy | `container-network-none-plus-node-runtime-deny-hook-v4` |
| Required launcher | `calibration/llm/scripts/run-v22-public-calibration.mjs` |
| Required verifier | `calibration/llm/scripts/v22-public-calibration-artifacts.mjs` |
| Required image preparer | `calibration/llm/scripts/prepare-no-egress-image.sh` |

The frozen Cejel boundary contains the explicit v22 driver commit
`52d174ecc9b89af9387d1586f8d87dda9151a31c` as an ancestor. Cejel #189 synthetically exercised
the repaired image lifecycle in a self-contained detector clone: it prepares the local image, the
exact wrapper resolves the tag, the no-egress probe runs under Docker `--network none`, the v22
launcher scans a throwaway subject, and the independent verifier derives a receipt. This is evidence
about the apparatus on synthetic subjects only; it measures nothing about v22.

No detector, collector, rubric, rubric version, evidence contract, score, source tree, execution
policy, control, selection specification, or named entrypoint may change within this benchmark. A
change is terminal NO-GO and requires a fresh preregistration.

## One permitted metadata-only order freeze

The private specification defines one fresh, terminal, immutable, stratified hash-ranked wave of
exactly 200 public repositories below 500,000 KiB. It retains the blinded-review, packet-redaction,
identity-audit, label-seal, estimator, gate, and terminal procedures by exact private binding;
excludes identities from retired orders; and allows no replacement positions.

After the private and public records are both merged, one and only one metadata-only order-freeze
invocation may occur. Before it, a separately committed and pushed harness must independently
authenticate all stated bindings, its own local/remote-tracking/independent remote ref, a clean
worktree, and absent output. It must persist either a named independent failure record or a
verifier-derived completion receipt. A binding failure creates the named record and does not start
the freezer.

The sole freezer invocation may query only the precommitted GitHub metadata frame. It must not
clone, read, scan, review, label, estimate, or otherwise materialize candidate source. It may not
retry, replace a position, rerank, or create another wave. Its independent verifier derives the
receipt only from complete manifest, order, universe, and hashes artifacts.

## Terminal rule and later stages

Missing output, a mismatched binding, unavailable image, Docker access failure, failed synthetic
control, absent receipt, any candidate-source access, or any retry, replacement, or reorder is
terminal NO-GO for this order-freeze authorization. An instrument failure is not evidence about v22.
Source acquisition and scanning require a later private/public preregistration with fresh bindings;
review, labels, estimates, results, and promotion remain later separate stages.
