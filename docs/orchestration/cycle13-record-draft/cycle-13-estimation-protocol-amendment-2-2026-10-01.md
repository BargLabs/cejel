> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — estimation protocol, amendment 2: v24 as a third arm, the cohort as v24's holdout

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Amends
`docs/calibration/cycle-13-estimation-protocol.md` (private record) and its amendment 1 (private record), and the
instrument boundary of `docs/calibration/cycle-13-instrument-boundary-amendment-2026-09-28.md`
(private record). None of those files is edited.

**State at signing.** No case has been drawn under a signed addendum, no packet exists, and no
label exists. The unit table and a draft draw were built from two arms (private record); that draw is not
signed and is superseded by §4. No `witan-rubric-v24-prospective-2026-09-15` output exists for any
cohort member.

## 1. The ruling this records

Operator, 2026-10-01, in session, adopted as written:

> The cycle-13 fresh cohort (193 members, draw `7244280c2479f82ae644f79cf69bcf4800a3b79e1b7bc5901f2bd3e0ee0f2eed`)
> is accepted as `witan-rubric-v24-prospective-2026-09-15`'s authenticated untouched holdout,
> subject to all of:
> 1. v24 is frozen at a released package whose `gitHead` contains the v24 scoring-parity fix
>    (#381), issued only after the v24 public paired rescore is a GO. If that rescore is a NO-GO,
>    v24 is not added and cycle 13 proceeds with v17 and v23 only.
> 2. All three arms (v17, v23, v24) are scanned at that one release before any case is drawn. The
>    0.4.11 scan is retained as the first scan and disclosed, never discarded.
> 3. The unit table and case draw are rebuilt from three arms; the census covers every unit where
>    either candidate disagrees with v17; the budget stays within B4 (150–200).
> 4. A promotion policy covering both candidates is signed before the first label.
> 5. The record discloses that v17's and v23's aggregate detector output on this cohort was
>    inspected before v24 was added, and that no v24 output, member identity or label was seen.

v24's own preregistration (`ef253a8`) requires "a separately preregistered authenticated untouched
holdout" before v24 could become the default. This amendment is that preregistration for this
cohort.

## 2. The instrument boundary, replaced (condition 1 and 2)

The boundary becomes **the first `@cejel/cejel` release whose `gitHead` has cejel #381's merge
commit as an ancestor and which is published after the v24 public paired-rescore result records a
GO.** The scan card verifies this before the first member, against the npm registry's `gitHead`,
the tarball integrity, and `git merge-base --is-ancestor`, and records the version and `gitHead` in
the scan record. All three arms run at that one release, each with an explicit `--rubric-pin`.

The 0.4.11 scan (private record) is retained and cited
as the first scan. It is not used for any estimate once the three-arm scan exists.

**If the paired rescore is a NO-GO** (or does not complete), the boundary of (private record) stands, the
0.4.11 scan is the scan, and the census and draw are rebuilt from the two existing arms under
amendment 1 alone. That fallback is fixed now so that the rescore's outcome cannot reopen design.

## 3. Units and classes with three arms

Unchanged from the protocol §3 except that each unit carries three classes, one per arm. A unit is
**discordant** when its three classes are not all equal. The rule table is the protocol's §2 as
amended by amendment 1. v24 may emit A2 wording the table has not seen; such a finding is
`unclassifiable` and stops the build before any draw, exactly as amendment 1 required, and is
resolved only by a further signed amendment.

## 4. Selection (condition 3)

- **Census:** every discordant unit, case weight 1.
- **Concordant strata:** rule × class (`C/C/C`, `N/N/N`, `X/X/X`), sampled as the protocol §4 and
  amendment 1 §3 specify (shares `floor(R / 3)` and remainder; floor-then-re-split; largest
  remainder; seed `cycle-13-case-draw-2026-09-28`).
- **Budget:** `B = 180`, raised only as far as needed so that the census plus a floor of 2 per
  non-empty concordant stratum fits, and never above 200. If the census plus floors exceed 200, the
  draw stops and is handed back.
- The draft draw of (private record) is superseded and never signed.

## 5. Estimates

Per arm, as the protocol §5 defines them, with Ruling 3 (a class X unit labelled present is a miss
in the headline recall). Two paired differences, **v23 − v17** and **v24 − v17**, each computed
inside every bootstrap replicate on the same resample. One label set serves all three arms; labels
remain blind to arm and class.

## 6. Disclosure (condition 5)

Before v24 was added, the following had been seen on this cohort: v17's and v23's detector output
in aggregate (finding-template counts per arm, suppressing templates under three members), the eight
summaries that amendment 1 mapped, and the per-row counts of the 0.4.11 scan record. No v24 output
for any member, no member identity outside operator custody, and no label had been seen. The rule
table those inspections shaped governs case classification only; it is not part of v24's detector.

## 7. Order of work

1. Merge cejel #381 (v24 scoring parity).
2. Run the v24 public paired rescore once (#378's harness); operator hand review of new criticals;
   result recorded. NO-GO: stop here and apply §2's fallback.
3. Release the package that §2 names.
4. Sign the cycle-13 promotion policy (condition 4).
5. Three-arm scan at that release (all 193 members), counts-only record.
6. Three-arm unit table and draw; operator signs the draw addendum.
7. Estimator v4 extended to two paired differences, with its falsifiability test; packets and
   sealed key; operator labels; one estimate.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-10-01T12:37:04Z`
- Ruling: as §1, adopted 2026-10-01
- Boundary: first release containing #381's merge, published after a v24 paired-rescore GO; fallback to (private record) on NO-GO
- Signature: Houman Azimi-Nejadi — cycle 13 gains v24 as a third arm on its untouched fresh cohort,
  measured at one released instrument for all three arms, before any case is drawn or labelled
