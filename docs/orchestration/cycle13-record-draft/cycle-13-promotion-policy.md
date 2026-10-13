> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle-13 promotion policy

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Its two new rulings (P5, §2) were made by the operator on 2026-10-01. It must be signed before the first cycle-13 label is
applied. A promotion policy written after seeing an estimate is not a preregistration. This record
is modelled on `docs/calibration/cycle-12-promotion-policy.md` and changes its criteria only where
marked.

## 0. Scope

One question: does cycle 13's estimate (figure, interval and validity verdict per arm, under
`cycle-13-estimation-protocol.md` and its amendments) meet the bar for promoting a candidate,
`witan-rubric-v23-prospective-2026-09-06` or `witan-rubric-v24-prospective-2026-09-15`, over
`witan-rubric-v17-2026-07-24` as the released default.

This document never absorbs the estimation protocol's validity machinery (insufficient-context
ceilings, small-stratum floor, `missingRulePolicy`). The two documents cannot trade slack.

## 1. Criteria, applied to each candidate separately

**P0 — validity precondition.** The estimate for that candidate is VALID under the estimation
protocol's own rules. Invalid means no promotion, with no override.

**P1 — precision.** Design-weighted candidate precision point estimate ≥ 0.90, and its 95% lower
bound ≥ 0.80. Carried from cycle 12 unchanged.

**P2 — recall.** Design-weighted in-scope detection recall point estimate ≥ 0.55, and its 95% lower
bound ≥ 0.40, with class X units counted as misses (protocol Ruling 3). Carried from cycle 12
unchanged.

**P3 — claims consistency with v17's published record.** As cycle 12's P3, unchanged: either the
same rubric-agreement instrument that produced v17's published figures is re-run with the candidate
meeting or exceeding them, or the promotion act updates or retires those figures on every surface
that cites them, in the same coupled change.

**P4 — claims hygiene.** Promotion executes as coupled changes across every claim surface. No
surface cites a figure beyond what it measured.

**P5 — not worse than the incumbent on the same cohort. NEW (operator, 2026-10-01).** Cycle 12 could not
have this criterion because v17 had no cohort figure. Cycle 13 measures v17 on the same cohort with
the same labels, so a candidate can be compared with what it would replace. The 95% lower
bound of the paired difference (candidate − v17) is at least **−0.05** for both precision and
recall. A candidate that clears P1 and P2 but is measurably worse than v17 on either is not
promoted.

> P5: **adopted as proposed** (operator, 2026-10-01, in session).

**Additional condition for v24 only.** Its public paired rescore under `ef253a8` recorded a GO. (If
it did not, v24 is not an arm, per amendment 2 §2.)

## 2. If both candidates meet every criterion (operator, 2026-10-01)

**v24 is promoted**, because it carries the A2 content-context change that v23 does not, and
v24's own preregistration exists to make that change the default.

> Ruling: **promote v24** (operator, 2026-10-01, in session).

## 3. Outcomes, fixed now

- **One candidate meets every criterion:** the operator alone executes a signed promotion record
  applying this policy to the figures, in the same change set as every claim-surface update (P4).
  No agent authors or pre-fills its signature block.
- **Neither does:** v17 remains the released default. The figures are recorded as informational.
  A further cycle needs its own signed protocol; this policy pre-authorizes no remeasurement.
- **P0 fails for a candidate:** that candidate is not evaluated further.

**v17's own figure.** Whatever the outcome, cycle 13 produces v17's first cohort detection recall
and precision. Publishing them on any public surface requires its own publication card under the
site's claims discipline (interval, scope fences, instrument sentence and the disambiguation
block), ruled separately. This policy does not authorize publication.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-10-01T12:39:21Z`
- P1, P2, P3, P4: as cycle 12, unchanged
- P5: adopted, paired-difference 95% lower bound ≥ −0.05 for precision and recall
- Both candidates pass: v24 is promoted
- Signature: Houman Azimi-Nejadi — cycle-13 promotion policy in force before the first label;
  candidates v23 and v24 judged separately against v17 on the same cohort and labels
