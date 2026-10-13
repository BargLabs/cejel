> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — instrument boundary amended from 0.4.9 to 0.4.11, before any scoring

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Amends Ruling 1 of
(private record) (signed, `f8d63102`). The
preregistration is not edited. No cycle-13 member has been scanned, scored or labelled at the time
of signing: the cohort was drawn on 2026-09-23 (private record) and accepted in
`docs/calibration/cycle-13-draw-acceptance-2026-09-28.md` (private record), and neither record contains a
scanner output.

---

## What changes

> Boundary commit: **`d30ac4bac505babc8521bd11e3a3aded147aa0a3`** (cejel tag `v0.4.11`)
> Boundary tree: `bc3e433ff5f37e0612a22982786e782b13866482`
> Package: `@cejel/cejel` **0.4.11**
> Replaces: `85eab44b61fa31be00191d8bd5c262e281e8d65c` (0.4.9), which is an ancestor of the new
> boundary.

Both arms run at this one commit: **v17** (`witan-rubric-v17-2026-07-24`, still
`WITAN_LAST_CALIBRATED_RUBRIC_VERSION` at `d30ac4ba`) and **v23**
(`witan-rubric-v23-prospective-2026-09-06`). Each arm is identified by the commit and the rubric
identifier together; a rubric identifier alone does not identify an instrument.

## Why, stated before any result exists

1. **The preregistration's own reason now points here.** Ruling 1 moved the boundary from 0.4.0 to
   0.4.9 because 0.4.9 was the released default, and fencing at a version nobody runs repeats the
   error B5 records for v22. The released default is now 0.4.11 ((private record):
   `version: '0.4.11'`, `gitHead: 'd30ac4ba…'`, verified live 2026-09-25).
2. **Scoring moved under both arms between 0.4.9 and 0.4.11 with no identifier bump.** cejel's
   `leaderboard/RUBRIC_CHANGELOG.md`, 0.4.11 entry: *"None is gated on rubric version, so each
   applies to every rubric, including the calibrated default."* This includes the A2 database-URL
   userinfo detection (#336) and the A3 error-boundary widening (#352, fixing #348, a verified miss
   under the default rubric). Under v23 it also includes the A3 health-route widening (#353,
   fixing #349). At 0.4.9 both arms would carry misses already fixed in the release customers run.
3. **Only 0.4.11 can tell an abstention from a miss.** From 0.4.11 every `report.json` (format 1.3)
   carries a `withheldPaths` array and every certificate one withheld-path statement (#351, fixing
   #350). At 0.4.9 a finding carried by a file withheld as too large is indistinguishable in the
   output from a pattern miss, and labelling needs that distinction.

## What the behaviour fingerprint does not establish

The behaviour-fingerprint pins (`src/witan/__tests__/fixtures/behaviour-fingerprint-pins.json`,
blob `da921d313b7b426a1017c1920df1b2702556220d`) are byte-identical at `cfd9b16`, at 0.4.9 and at
0.4.11, although the scoring changes above landed between them: the guard's fixture corpus does not
exercise those idioms. The fingerprint is therefore not evidence that an instrument is unchanged,
and is not used as one in cycle 13. Ruling 2's separate fingerprint-provenance declaration stands
as a record of 2026-09-23; at the new boundary the fixture path resolves at the boundary commit
itself, with the same blob.

## Requirements this adds to the scan

- Each member is scanned under both arms at `d30ac4ba`, from source at that commit or from the
  published 0.4.11 package whose `gitHead` is `d30ac4ba`; the scan record states which, per arm.
- `withheldPaths` is retained per member per arm. A member whose deciding evidence sits in a
  withheld path is recorded as an abstention, never scored as a miss.
- The scan pins `draw.json` by sha256 and scans exactly the 193 accepted members.

## What this does not change

The cohort, the exclusion set, the estimand (the 3,163 eligible repositories), P1 (≥ 0.90), P2
(≥ 0.55), shared control labels, the paired design, the Ruling 4 scoring gate (met on 2026-09-28,
recorded on (private record)), and the division of labour: labelling and case resolution remain
operator-only. Nothing here alters the cycle-12 board.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-09-28T20:50:31Z`
- New boundary: `d30ac4bac505babc8521bd11e3a3aded147aa0a3` (0.4.11), tree `bc3e433f…`
- Replaced boundary: `85eab44b…` (0.4.9), before any scoring
- Arms: v17 and v23 at the one boundary commit; instrument = commit plus rubric identifier
- Added requirement: `withheldPaths` retained per member per arm; withheld deciding evidence is an
  abstention
- Signature: Houman Azimi-Nejadi — cycle-13 instrument boundary amended to 0.4.11 before any
  member was scanned, because 0.4.11 is the released default and scoring moved under both arms
  since 0.4.9 without an identifier bump; the behaviour fingerprint is not treated as evidence of
  an unchanged instrument
