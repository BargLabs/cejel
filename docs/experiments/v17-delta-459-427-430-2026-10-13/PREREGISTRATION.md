# Preregistration — v17 public delta for #459, #427 and #430

**CONSTRAINTS-VERSION: 2026-08-01.5**

This protocol is committed and pushed before any corpus arm is scored. Its commit must remain
a strict ancestor of the result commit. Do not edit it after execution; corrections are separate
errata. Merge this branch with a merge commit, preserving the preregistration/result ancestry.

## Immutable arms

- before459: 988721e957dedd6c7649a1fb8cb4475459c573a8, #459's first parent. Its src/witan tree is identical to released v0.6.3.
- after459: b673493ee1a640026530f7cc65ac94aff8139bf1, #459's merge.
- fixes: 22f89a30a9a45a700ea1b684933d80ea3542b45d, the committed AVA and public-digest corrections.

The bindings, corpus digest and expected values are in plan.json. All three use calibrated default
v17, generatedAt 2026-10-13T00:00:00.000Z, the same machine, unchanged target commits, and full
history with no blob filter. Package version is 0.6.3 in each; scorer identity is its full commit,
not its package version. No v25 calibration or default promotion is part of this run.

## Scope and prior knowledge

All 23 public entries of leaderboard/corpus.json, pinned by the complete file digest in plan.json.
Reuse verified full-history copies of the 0.6.3 board checkouts, preserving each manifest commit.
Reject a dirty, shallow or mismatched target before scoring. Non-public entries are deliberately
excluded: no private implementation, pin, report, values or label-class material is published or
claimed evaluated. This record discharges the public delta in #460, not a private-row obligation.
Raw reports and any error details stay in local scratch storage. Commit only scalar scoring and
placement comparisons, byte-equality results, and changed field names; no evidence text or paths.

Previously observed: #459's synthetic handler changes; the 33 regression controls; and diagnostic
scans of slugify and dunstan at the two issue pins (both are outside this published corpus).
All original 16 synthetic fingerprint specimens are unchanged by the two fixes; two new specimens
move under A1 and A2. Public checkout HEAD, cleanliness and full-history metadata were checked
before this protocol. No new three-arm corpus score or per-row result was read before committing
this preregistration. Prior published records exist; this is a descriptive behavior delta, not
blinded evaluation, calibration, precision or recall measurement.

## Falsifiable expected values

E0: 23/23 public rows complete in each arm, with zero errors. Each target's pin, cleanliness,
full-history state and commit count remain identical throughout. Scorer HEAD and clean tracked
source are checked before importing the scanner. A result directory must not already exist.

E1: before459 to after459 changes scoring only through A3's prod_readiness_primitives error-boundary
component. No other criterion changes at scoring level. Fingerprint metadata changes on every row.

E2: after459 to fixes changes scoring only in A1 (non_hollow_test_share) and A2 (the digest
comparison warning/hygiene surface, including not-applicable transitions). Composite headlines
and verdicts may move through these criteria and their denominators; neither fix changes weights.

E3: point forecast: zero public rows move at scoring level in either pair, and zero placements
move. This forecast is uncertain: the published reports do not expose every latent callback or
comparison shape. It is a prediction rather than a bound or permission to reject an unexpected
row. Record every miss unchanged, explaining measured movements without rewriting this forecast.

E4: fingerprints change on all 23 rows in each pair, so zero complete reports are byte-identical.
After removing only the fingerprint field, differences are recorded independently. Every row is
included in the scalar result, whether it moves or not. Placement uses the existing 0.6.3 public
comparison's equal-weight measured-criterion mean and ordinal/name tie rule; cejel is transparency.
This is modeled placement within these fixed public arms, not an update to the published board.

E5: no adjudication or label-class data enters the comparison. All unexpected scoring-criterion
changes, top-level report changes, errors and completion failures are retained. Each arm runs
once; errors are recorded, never repaired and rerun to make the expectation hold. A protocol
failure before any score may be corrected without changing this file; after scoring starts,
write an erratum and a successor protocol rather than reuse outputs under a changed procedure.
