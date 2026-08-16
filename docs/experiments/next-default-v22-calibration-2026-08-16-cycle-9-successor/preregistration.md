# Next calibrated default candidate v22 — public cycle-9 successor preregistration

Status: **preregistered after the disclosed non-calibration census and before any cycle-9
candidate-universe metadata query, identity selection, order freeze, source acquisition, scan,
review, label, estimate, gate evaluation, terminal characterization, or promotion**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## This is a successor, not an amendment

`docs/experiments/next-default-v22-calibration-2026-08-16-cycle-9/` (this repo, PR #203, merged at
`b1564177225849b1a2b9dd028facc294cac38d67`) is **withdrawn, unexecuted** — see
`preregistration-withdrawn.md` in that directory. Its Alfred private binding
(`BargLabs/alfred#981`, squash `d0b432175d27d9a9467ebac9c9773595606639df`) is itself withdrawn:
its `selection-spec.json`'s `controlSeed` and `reviewOrderSeed` duplicated cycle 8's, not fresh.
This public counterpart carried no seed, candidate identity, or private figure of its own — the
defect was entirely on the private side. This document supersedes that withdrawn public
counterpart via a new directory; the withdrawn one stays byte-identical.

## Claim boundary

This redacted document is the public counterpart to the fresh private cycle-9 successor
preregistration. It does not amend or retry any retired v22 cycle, and it reveals no seed,
candidate identity, candidate metadata result, source, scan, review packet, label, estimate, or
gate result.

`witan-rubric-v17-2026-07-24` remains the sole calibrated public default. Its published figures
remain v17-only. Prospective `witan-rubric-v22-prospective-2026-08-10` inherits none of them; no
v22 claim or GO/NO-GO characterization is licensed before the operator's blinded review concludes
and the post-review record lands under house process. No v17 and v22 metrics may be pooled.

## Sole operator authority

The successor is authorized by the same verified signed Alfred commit
`25f38a8cbb2a614d1023160ab50ffe55aecc9a81`, preserved by the authorization document merged in
Alfred PR #980. Its document blob is `f202e47984ef437196b848265a9af4d9e910e413`. No new
authorization was sought or needed; withdrawing and superseding a preregistration does not
broaden the authorization that governs it.

## Disclosed census design input and coverage boundary

The private selection design cites the same non-calibration census cycles 8 and the withdrawn
cycle 9 used, merged in Alfred at `78d55c164a688a4f3f137def1ab8599528ae4a43`, path
`docs/orchestration/v22-stratum-census-2026-08-15.md`, Git blob
`7560d7fd52107733b552dbc591e36a83378ac01f`. No new census was run: the withdrawn cycle-9's defect
was a seed-freshness violation in its own identifiers, not a population or design defect.

Cycle 9 plans zero positions for `stress-generated-code`. Its three former positions remain
prospectively reallocated to the named sibling `stress-documentation`, whose allocation is four,
unchanged from cycle 8 and the withdrawn cycle 9. The private selection specification carries a
census-sized, preregistered rule for each of the 33 planned strata: positive allocations reduce to
`min(P, floor(E / 2))` when eligible population `E` is below `2P`, zero realized positions abort
only that stratum, retained zero allocations stay zero, and missing or failed queries remain fatal
instrument results. Population contact may reduce the realized cohort; it does not terminate the
chain.

Every resulting figure must carry this exact disclosed coverage boundary:

> stress-generated-code unmeasured this cycle: eligible population exhausted by prior-identity exclusions.

## Immutable cross-repository binding

The private successor preregistration merged in Alfred at
`8caa3222cfea220698480512dd8aa415ad2ad293` (PR #988). Its normative artifacts are:

| Private artifact | Git blob |
| --- | --- |
| `docs/calibration/next-default-v22-2026-08-16-cycle-9-successor/preregistration.md` | `66e6194aead155ff4f8f9291c12a5c65e838533d` |
| `docs/calibration/next-default-v22-2026-08-16-cycle-9-successor/selection-spec.json` | `70ed9fc8b07a122361de26ffdfa8a81f4d59455d` |
| `docs/calibration/next-default-v22-2026-08-16-cycle-9-successor/control-anchors.json` | `62012630a548d27b4a58ec69889406cbfebc8110` |

Any cycle-9 harness must authenticate this Cejel squash merge and document blob plus the Alfred
squash merge and all three private blobs as cross-repository immutable content bindings.
Source-branch commit identities have no authority. Git ancestry is asserted only inside the
repository containing each asserted commit.

## Frozen boundary and permitted stage

The private specification freezes Cejel commit
`b1564177225849b1a2b9dd028facc294cac38d67`, tree
`5d3afa5b18876019643c22d4d8b2edb5ff00c4a7`, and package `0.4.2` under benchmark
`cejel-next-default-v22-2026-08-16-cycle-9-successor`, the prospective v22 rubric, and
`container-network-none-plus-node-runtime-deny-hook-v4` execution policy. This is the same
candidate the withdrawn cycle-9 froze; the branch had not moved further between the withdrawal
and this successor. That revision is ancestry-proven to contain the explicit v22 driver, the
no-egress timeout repair, and the repaired metadata query and pre-boundary path-probe layer from
Alfred #959. The named driver, freezer, independent verifiers, frame, review/redaction protocol,
estimators, and eighteen gates are private content bindings. The ordinary public CLI remains v17
by default; this does not change it.

This preregistration also binds a full emitted-block rehearsal record (Alfred
`docs/rehearsal/v22-emitted-order-freeze-block/last-full-rehearsal.json`), re-earned as part of
Alfred PR #988 (the withdrawal/successor PR itself touched `packages/witan/scripts`, voiding the
prior record per the guard's own design) and re-verified live against that PR's own final commit
before it merged.

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
