# Next calibrated default candidate v22 — public cycle-10 preregistration

Status: **preregistered after the disclosed non-calibration census and before any cycle-10
candidate-universe metadata query, identity selection, order freeze, source acquisition, scan,
review, label, estimate, gate evaluation, terminal characterization, or promotion**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Claim boundary

This redacted document is the public counterpart to the private cycle-10 preregistration. It does
not amend or retry any prior v22 cycle, and it reveals no seed, candidate identity, candidate
metadata result, source, scan, review packet, label, estimate, or gate result.

`witan-rubric-v17-2026-07-24` remains the sole calibrated public default. Its published figures
remain v17-only. Prospective `witan-rubric-v22-prospective-2026-08-10` inherits none of them. No
v22 claim or GO/NO-GO characterization is licensed before the operator's blinded review concludes
and the post-review record lands under house process. No v17 and v22 metrics may be pooled.

## Sole operator authority

Cycle 10 is authorized by verified signed Alfred commit `12208cbddda0ef7d0768f2e479c8ae8669165379`,
merged as squash `aa88e588b9c4843da708d41fd7639b17deb99cc3` (Alfred PR #998). The authorization
document's Git blob is `fd51072184c08541cbe65968681e48a04d0ff4b0`.

## Why cycle 9 stopped, and what changed before cycle 10

Cycle 9's real order-freeze one-shot stopped post-boundary on a stale protocol-binding pin (its
generator had carried a citation table forward unrecomputed instead of verifying it fresh). Before
cycle 10, the generator that produces these specifications was changed so that class of pin can no
longer be claimed unchanged — it must be recomputed against the harness every time, or generation
itself fails. All pre-boundary authentication that can run without the network or a consequential
write now runs before any one-shot boundary crosses, not after.

## Disclosed census design input and coverage boundary

The private selection design cites the same non-calibration census cycles 7, 8, and 9 used, merged
at Alfred `78d55c164a688a4f3f137def1ab8599528ae4a43`, path
`docs/orchestration/v22-stratum-census-2026-08-15.md`, Git blob
`7560d7fd52107733b552dbc591e36a83378ac01f`. No new census was run for cycle 10.

Cycle 10 plans zero positions for `stress-generated-code`. Its three former positions remain
prospectively reallocated to the named sibling `stress-documentation`, whose allocation is four,
unchanged from cycles 8 and 9. The private selection specification carries a census-sized,
preregistered rule for each of the 33 planned strata: positive allocations reduce to
`min(P, floor(E / 2))` when eligible population `E` is below `2P`, zero realized positions abort
only that stratum, retained zero allocations stay zero, and missing or failed queries remain fatal
instrument results. Population contact may reduce the realized cohort; it does not terminate the
chain.

Every resulting figure must carry this exact disclosed coverage boundary:

> stress-generated-code unmeasured this cycle: eligible population exhausted by prior-identity exclusions.

## Immutable cross-repository binding

The private preregistration merged in Alfred at `229af67a5e9cbe0efd45e43d7fd76c19c97d2cc4`
(PR #999). Its normative artifacts, as merged:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-17-cycle-10/preregistration.md` | `8112682d6f38d0a828905d295e7c841699d23153` |
| `docs/calibration/next-default-v22-2026-08-17-cycle-10/selection-spec.json` | `9a24ec61384fd332342d48e268badf7882a7d925` |
| `docs/calibration/next-default-v22-2026-08-17-cycle-10/control-anchors.json` | `83a0a8afd6ccc01ea2cf564a046806894a19df18` |

A same-day Alfred follow-up (PR #1000) binds `harnessAncestorCommit` on that same
`selection-spec.json` to `229af67a`'s own squash — a value that cannot exist before the
preregistration merges, disclosed in the private preregistration itself as a planned two-pass step,
not a later amendment to what was decided. It changes no seed, allocation, threshold, exclusion,
candidate boundary, or coverage boundary. This document's citation of `selection-spec.json`'s blob
above is the pre-follow-up state; any harness that authenticates this cross-repository binding
authenticates the current on-disk content directly, not this table.

Any cycle-10 harness must authenticate this Cejel squash merge and document blob plus the Alfred
squash merge and all three private blobs as cross-repository immutable content bindings.
Source-branch commit identities have no authority. Git ancestry is asserted only inside the
repository containing each asserted commit.

## Frozen boundary and permitted stage

The private specification freezes Cejel commit `84cd5876e25fcd7c368660d67b704272da1ef996`, tree
`76c6ab8d3ea4e4691a4fb56e9447f91133190d81`, and package `0.4.3` under benchmark
`cejel-next-default-v22-2026-08-17-cycle-10`, the prospective v22 rubric, and
`container-network-none-plus-node-runtime-deny-hook-v4` execution policy. That revision is
ancestry-proven to contain the explicit v22 driver, the no-egress timeout repair, and the repaired
metadata query and pre-boundary path-probe layer. The named driver, freezer, independent verifiers,
frame, review/redaction protocol, estimators, and eighteen gates are private content bindings. The
ordinary public CLI remains v17 by default; this does not change it.

This preregistration also binds a full emitted-block rehearsal record (Alfred
`docs/rehearsal/v22-emitted-order-freeze-block/last-full-rehearsal.json`) as an invariant: the guard
that enforces it recomputes both harness and emitted-command digests live at invocation time and
compares them against the checked-in record, unconditionally — not against a value fixed once at
drafting time and left to go stale, the pattern that produced repeated staleness in earlier cycles.

After both counterpart merges, the independently pushed harness must authenticate the frozen
boundary and both cross-repository bindings and apply the preregistered drift guard before any
one-shot. The private protocol permits one metadata-only order freeze and, only after its complete
independently verified receipt, one v4 no-egress execution ending at independently verified
redacted review packets.

Both one-shots are operator-invoked from an external terminal in distinct, quiesced windows. No
agent may invoke either one-shot. A pre-boundary preparation stop spends neither one-shot.

This public counterpart reveals none of the private frame seeds or identities and licenses no
source disclosure, label, estimate, calibration figure, gate decision, terminal claim, default
promotion, or pooled v17/v22 figure. Blinded review and the packet-redaction audit remain operator
work after packet handoff.
