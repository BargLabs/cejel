# D-series non-fixture existence proof — mechanical revalidation

Date: 2026-08-09
Status: **existing proof revalidated; no experiment rerun**

This record corrects the premise that a first anchored non-fixture D-series detection proof still
needed to be created. The proof already exists in the frozen cross-artifact conformance recovery
result. This review authenticated its history, artifacts, and Alfred subjects against current
repository state without executing the checker, materializing a fixture, or scanning a corpus.

## Cejel history and artifacts

Current Cejel `origin/main` was
`ba226c8edc68d96bb69354895e9b7ccf4b397dd1` during revalidation.

| Role | Commit | Mechanical result |
|---|---|---|
| Runtime-recovery preregistration | `1163749225e678063b4d8c75e09c0839dbd53b77` | strict ancestor of checker |
| Frozen recovery checker | `52cda115f10e1a36c1d46bc66cfb0fad253a850e` | strict ancestor of result |
| First recovery result | `30d8fe206eed37dc4a0362e63ea0cbd586cfc01b` | ancestor of current `origin/main` |

The result document's latest commit remains exactly the first result commit. Its blobs are
unchanged between that commit and current `origin/main`:

| Artifact | Git blob | Current SHA-256 |
|---|---|---|
| `d-series-cross-artifact-conformance-runtime-recovery-result-2026-08-01.md` | `b8f4071db95e65dc324abd6867c3482595fcb0d0` | `4726f7f15963df41568910d567d81182d551f175e6c9b767631c98cd0bacd45c` |
| `d-series-cross-artifact-conformance-runtime-recovery-result-2026-08-01.json` | `a6b14df8226156ff7f698db87f670c5e417f205e` | `6ef373c0252ef3b9eaf84cd3e506b618407b357a6adb694a9e1152b177bada03` |

The immutable JSON still records `result: pass`, denominator `1`, finding count `1`, no failures,
and three observations: one finding at the defective revision and zero findings at both repair
revisions.

## Alfred subject authentication

Current Alfred `origin/main` was
`88f25ea0161cab14d2518b0b221ac00201465f33` during revalidation. Every pinned subject commit below
is its ancestor.

| Subject | Commit | Path | Revalidated blob |
|---|---|---|---|
| Normative declaration | `d879c2f69488f4fb3f3c6b45667125812c2c7364` | `docs/experiments/dual-control-preregistration.md` | `e637b02f1a65796669612e18caa7fccda7820c52` |
| Defective implementation | `76a631be63cf1be2cd4d9c6b303626a7124864c4` | `packages/bede/src/dual-control/report.ts` | `e79f55cf0f4fd3a7865bde32d2f33e584a96d560` |
| Original repair | `21495c14bbd1caa1669d507ea374a1c4ac6940b2` | `packages/bede/src/dual-control/report.ts` | `eb16fadcd0814352538a9aa8730439d10bdbab73` |
| Merged repair control | `800983fb06c36641ad25b34b82b6465df638c756` | `packages/bede/src/dual-control/report.ts` | `eb16fadcd0814352538a9aa8730439d10bdbab73` |

The two repair blobs remain byte-identical and distinct from the defective blob.

## Supported conclusion

The existing result continues to support only the narrow existence statement already published:
a deterministic cross-artifact conformance check detected the pinned historical Alfred #775
defect and stayed clean on its pinned repairs.

It does not establish semantic D1 recall, automatic detection of unstructured defects, or
population usefulness. It does not revive the retired D-series rules as a production detector and
does not change any A1–B6 detector, rubric, score, release, or leaderboard artifact. It also does
not validate the newer opt-in decision-contract pack; that pack requires its own fresh
preregistered held-out evaluation.
