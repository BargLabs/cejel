# D-series cross-artifact conformance pilot — runtime-recovery result

Status: **pass; first non-fixture D-series existence proof**

The frozen recovery checker detected the historical Alfred #775 D1 defect at its pinned defective
revision and emitted no finding on either the original or merged repair. The planned real-defect
denominator is one; this is an existence result, not a recall estimate.

The earlier failed result remains recorded at
`d-series-cross-artifact-conformance-pilot-result-2026-08-01.md`. It failed before subject
observation and is not replaced by this result.

## Result

| Subject | Zero boundary | Perfect boundary | Conformance finding |
|---|---|---|---:|
| Defective `76a631be` | `claimBearing: true`; no reasons | refused with five perfect/no-miss reasons | **1** |
| Original repair `21495c14` | refused with five zero-side reasons | refused with five perfect/no-miss reasons | **0** |
| Merged repair `800983fb` | refused with five zero-side reasons | refused with five perfect/no-miss reasons | **0** |

The finding cites both independently authored evidence surfaces:

- declaration: `docs/experiments/dual-control-preregistration.md` at
  `d879c2f69488f4fb3f3c6b45667125812c2c7364`; and
- implementation: `packages/bede/src/dual-control/report.ts` at
  `76a631be63cf1be2cd4d9c6b303626a7124864c4`.

The missing arms were `held_out_recall_is_zero` and
`defect_class_has_zero_catches`. The repair controls produced exactly one held-out and four
per-class zero-side refusal reasons, with `claimBearing: false`.

## Frozen sequence and runtime

| Artifact | Commit or value |
|---|---|
| Initial preregistration | `e61be2079b467ce92eb007334af948ea55726705` |
| Adverse first-result record | `051a269e897ecc18aad889a40e2acbe67a140f1c` |
| Runtime-recovery preregistration | `1163749225e678063b4d8c75e09c0839dbd53b77` |
| Frozen recovery checker | `52cda115f10e1a36c1d46bc66cfb0fad253a850e` |
| `tsx` version | `4.22.3` |
| `tsx` CLI SHA-256 | `5c916fa6ecad44aedbb01ca5815536d00ea07de6b73eeb9443d317326b0218d8` |

Both preregistrations are strict ancestors of the recovery checker, which was pushed before
execution. Every subject matched its revision, implementation blob, lockfile blob, package blob,
runtime version, and runtime hash before observation.

The first process launch was blocked before adapter execution by sandbox IPC permissions. The
identical frozen command was then run with the required filesystem/process permission; that was the
only launch to produce any subject observation or conformance verdict. No detector, manifest,
runtime, or subject input changed between those launches.

## Claim boundary

This result supports exactly this statement:

> A deterministic cross-artifact conformance check detected the historical Alfred #775 D1 defect
> at its pinned defective revision and stayed clean on its pinned repair.

It does not establish semantic D1 recall, performance on unstructured claims, or usefulness on an
unselected repository population. It does not alter the frozen dual-control `0 / 16`, D1 semantic
`0 / 3`, D1-config exact-signature `3 / 3`, or public precision `0 / 23` results. No D1–D5 matcher,
A1–B6 criterion, rubric version, score, dependency declaration, or leaderboard artifact changed.

See [the dual-control downstream-labelling erratum](dual-control-downstream-labelling-erratum-2026-08-05.md) for the scope correction to the historical dual-control citation.
