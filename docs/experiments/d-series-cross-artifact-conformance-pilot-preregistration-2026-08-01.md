# D-series cross-artifact conformance pilot — preregistration

Status: **frozen before pilot implementation or execution**

This pilot asks whether a deterministic checker can detect one real D1 defect by comparing an
independently written normative contract with the behavior of its implementation. It is the first
non-fixture existence test for the D-series pack; it is not a recall estimate for D1 or for the
D-series generally.

No pilot detector or result has been written or run before this document is committed. The
historical defect, repair, and independent oracle were already public before selection.

## Frozen subject and revisions

The single subject is the Alfred dual-control result publisher repaired by Alfred PR #775.

| Role | Repository revision | Artifact | Git blob |
|---|---|---|---|
| Normative declaration | `d879c2f69488f4fb3f3c6b45667125812c2c7364` | `docs/experiments/dual-control-preregistration.md` | `e637b02f1a65796669612e18caa7fccda7820c52` |
| Defective implementation | `76a631be63cf1be2cd4d9c6b303626a7124864c4` | `packages/bede/src/dual-control/report.ts` | `e79f55cf0f4fd3a7865bde32d2f33e584a96d560` |
| Repair implementation | `21495c14bbd1caa1669d507ea374a1c4ac6940b2` | `packages/bede/src/dual-control/report.ts` | `eb16fadcd0814352538a9aa8730439d10bdbab73` |
| Merged repair control | `800983fb06c36641ad25b34b82b6465df638c756` | `packages/bede/src/dual-control/report.ts` | `eb16fadcd0814352538a9aa8730439d10bdbab73` |

The declaration commit is a strict ancestor of the defective revision. The defective revision is
the first parent of the original repair commit. The merged repair has the same `report.ts` blob as
the original repair.

## Frozen known positive

The preregistration requires claim-bearing refusal when either of these disjunctive conditions is
true:

1. held-out recall is **zero or perfect**; and
2. any defect class has **zero catches or no miss**.

At the defective revision, the publisher implemented only the perfect and no-miss arms. A recorded
run with held-out recall `0 / 8` and four class rows with zero catches therefore emitted
`claimBearing: true`. The repair added the omitted zero arms and re-derived five refusal reasons:
one `held_out_recall_is_zero` and four `defect_class_has_zero_catches:<class>` entries, with
`claimBearing: false`.

The independent oracle is the historical errata plus the red/green regression in Alfred PR #775.
The pilot may consume those facts but must not use its own finding as the oracle.

## Frozen detector contract

The pilot checker will consume:

- a small machine-readable manifest transcribing the two normative `A or B` clauses above;
- an adapter that invokes the exported Alfred result summarizer at a pinned revision; and
- generated boundary probes that satisfy each arm independently while holding the other inputs in
  a valid, non-refusing state where possible.

For each clause, every declared arm must map to an observable refusing outcome. An omitted arm is a
finding only when its probe leaves `claimBearing: true` or omits the clause's named refusal reason.
The finding must cite both the declaration path and
`packages/bede/src/dual-control/report.ts`; a source-only citation does not satisfy this pilot.

This is behavioral conformance, not natural-language inference. The declaration-to-probe manifest
is human-authored and therefore outside the detector's claim. The checker verifies that every
declared arm binds the implementation behavior; it does not discover arbitrary prose obligations.

## Acceptance and controls

The pilot passes only if all conditions hold:

1. the defective revision emits exactly one D1 conformance finding covering the two omitted zero
   arms and cites both frozen artifact paths;
2. the original repair and merged repair emit zero findings under the identical manifest and probe
   set;
3. the defective run reproduces `claimBearing: true`, while the repaired run reproduces exactly
   five zero-side refusal reasons and `claimBearing: false`;
4. changing either pinned artifact blob causes a fail-closed revision-mismatch result rather than a
   conformance verdict; and
5. no D1-D5 matcher, A1-B6 criterion, rubric version, score, dependency declaration, or leaderboard
   artifact changes as part of the pilot.

Any inability to execute the pinned revisions, load the same summarizer surface, or isolate the
declared boundary probes is a pilot failure, not an abstention presented as success.

## Claim boundary

If the gate passes, the only supported existence statement is:

> A deterministic cross-artifact conformance check detected the historical Alfred #775 D1 defect
> at its pinned defective revision and stayed clean on its pinned repair.

The denominator is one independently anchored real defect. It does not establish semantic D1
recall, performance on unstructured claims, or usefulness on an unselected repository population.
It does not alter the frozen dual-control `0 / 16`, D1 semantic `0 / 3`, D1-config exact-signature
`3 / 3`, or public precision `0 / 23` results.

## Commit and run order

1. Commit and merge this preregistration.
2. In a later commit, add the manifest, adapter, checker, and tests without running the pinned
   defective or repair revisions.
3. Freeze the checker commit and record its file hashes.
4. Execute the frozen pilot once against the pinned revisions.
5. Publish the result in a later commit even if it is null or adverse.

The preregistration commit must remain a strict ancestor of both the checker and first result
commits. Results must never be squashed into this commit.
