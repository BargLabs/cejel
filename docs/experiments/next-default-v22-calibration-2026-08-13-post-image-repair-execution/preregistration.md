# Next calibrated default candidate v22 — public post-image-repair execution preregistration

Status: **preregistered before any ordered candidate repository source is acquired, decoded,
scanned, reviewed, labelled, or estimated**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and public claim boundary

This is the public, redacted counterpart to Alfred's normative post-image-repair execution
preregistration. It authorizes one source-acquisition-and-scan traversal only. It discloses no
candidate identity, repository source, source revision, scan output, review packet, label, or
estimate. Review, labels, adjudication, estimation, calibration result, and promotion remain
separate later stages.

`witan-rubric-v17-2026-07-24` remains the sole calibrated public default. Published figures
remain v17-only. Prospective `witan-rubric-v22-prospective-2026-08-10` inherits none of those
figures and may become the default only after a terminal GO and a separate dated promotion
decision state the licensed scope and limitations. Metrics from v17 and v22 must never be pooled
or transferred.

## Immutable cross-repository binding

The private normative authorization merged in Alfred at
`30fc7f121b777ac68a97a8d868fc8d7089095772` (PR #932). Its two normative artifacts are:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-13-post-image-repair-execution/execution-preregistration.md` | `d7e7b218c8244156b5630ac308f00358d83d2cd8` |
| `docs/calibration/next-default-v22-2026-08-13-post-image-repair-execution/execution-spec.json` | `f11353a5fe21e02fec7e83c2b25e65e126cc0410` |

Any execution harness must authenticate the Alfred merge and both private document blobs, plus
this Cejel merge and document blob, as immutable cross-repository content bindings. Git ancestry
is required only within the repository that holds the asserted commit; it is not claimed across
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

The Cejel candidate must be a fresh conventional self-contained clone at its frozen commit—not a
linked worktree or checkout whose `.git` points outside the Docker-shared directory. Before any
ordered candidate source access, that clone must complete a frozen-lockfile offline install,
pinned build, local image preparation, the dynamically declared no-egress probe under Docker
`--network none`, and the v22 launcher's separately authored throwaway-source exercise with its
independent artifact verifier. These controls establish apparatus behavior only; they measure
nothing about v22.

No detector, collector, rubric, rubric version, evidence contract, score, source tree, execution
policy, control, completed-order artifact, source-safety envelope, output contract, review rule,
estimator, or gate may change within this benchmark. A change is terminal NO-GO and requires a
fresh preregistration.

## One permitted execution traversal

After this private and public record are both merged, a separately committed and pushed execution
harness must independently authenticate all stated bindings; its own local, remote-tracking, and
independent remote ref; a clean worktree; and absent output before it reads the completed order.
It must persist a durable named attempt record on failure or an independently derived receipt after
complete execution artifacts exist.

The sole traversal is exactly one in-order pass over the completed 200-position order. It allows no
replacement, reranking, extra wave, or retry after traversal begins. Each position may acquire only
its frozen Git revision and necessary ancestors, remove the remote, reject unsafe entries, never
run repository code or package scripts, and invoke only the frozen v22 launcher through the
host-plus-runtime no-egress wrapper with read-only detector/source mounts and an output-only
writable mount. The execution records acquisition and scan integrity only; it creates no review,
label, estimate, calibration, or promotion claim.

## Terminal rule

Any failed binding, self-contained-clone, image preparation, build, control, source-safety check,
acquisition, scan, output closure, identity-redaction check, receipt, replacement, reorder, retry,
or post-result amendment is terminal NO-GO for this authorization. An instrument failure measures
nothing about v22. Even a clean execution does not promote the default.
