> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — draw acceptance and estimand erratum

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Operator authority for the three
rulings below. Scoring of the cycle-13 cohort may not begin until the condition in Ruling 4 is met.

Governs: (private record) (signed, `f8d63102`).
Draw: (private record) — design `1e1de24f`, draw
`58db67b4`, merged in (private record). The preregistration is not edited; where this record changes the
meaning of one of its lines, it says so as an erratum.

Counts only. No repository identity appears in this record.

---

## Ruling 1 — the exclusion set is the full ledger (closes (private record))

Given in session on 2026-09-23, before the draw, and recorded until now only in a machinery record
((private record), "The full-ledger ruling is in a machinery record"). Signed here.

> Exclusion set: cycle 10's authenticated standing ledger (5,495 identities, authenticated at
> `535d97ba`) plus cycle 10's 200 members — **5,695 identities**, file
> (private record), sha256
> `c2e4a0ef18860a9176ddcb0b9bcec717fce324cc64e315af94eec1f57b07666a`.

Reason: B3 asks for repositories the programme has never seen. The preregistration's minimum
fence (cycle 10 and cycle 12) would have removed 196 of the frame; the full ledger removes 4,430.
The difference is 4,234 repositories that were exposed to earlier cycles' machinery without being
cohort members. Fresh means fresh to the programme, not only to the two named cohorts.

## Ruling 2 — 193 members across 33 strata is accepted (closes (private record))

The preregistration expected exactly 200 members across 34 strata. The draw realised **193 across
33**. The shortfall of 7 is caused by Ruling 1, which the preregistration did not anticipate:
`stress-recognized-cobol` has 1 eligible repository against a budget of 5, and
`stress-generated-code` has 0 eligible against a budget of 3. The card's rule was applied: the
shortfall was reported and never reallocated.

> Accepted: **193 members, 33 strata**, as drawn. No re-draw, no top-up, no reallocation.

193 lies inside B4's label budget of 150–200. `design.json` states an expected total of 196; its
own stated shortfalls give 193. That arithmetic slip was made before the draw, is recorded in the
draw record, and is left unedited because the design is fixed.

## Ruling 3 — erratum to the estimand

The preregistration's Ruling 3 names the estimand as "the 7,954 retrieved entries". That line is
corrected here in two respects, both mechanical, both verified on 2026-09-28 by recomputation from
the pinned universe (`manifest-wave-1.universe.jsonl` at `1a6a286c`, sha256 `1aa7e2a9…`), the
selection spec at the same commit, and the ledger above.

1. **Unit.** 7,954 counts search entries, not repositories: 7,834 distinct repositories, of which
   119 match more than one stratum, contributing 120 repeated entries. Each repository is assigned
   to its first matching stratum in selection-spec order (the frame's recorded policy).
2. **Population.** Of the 7,834, the ledger removes 4,430. Of the remaining 3,404, the frame's
   eligibility policy removes 241: 239 with no language-eligible stratum and 2 without a revision.
   **3,163 repositories are eligible.** The Horvitz–Thompson weights in `draw.json` sum to exactly
   3,163 in both `candidateWeight` and `controlWeight`.

> **Corrected estimand:** the **3,163 eligible repositories**: those retrieved on 2026-08-12 by the
> frame's queries, never seen by this programme (Ruling 1), and eligible under the frame's recorded
> policy. The 908,576 enumerated entries remain the frame's outer bound and are not the estimand.
> No `stress-generated-code` repository is in the estimand, and `stress-recognized-cobol` is
> represented by a single repository.

Any published figure from cycle 13 describes this population and says so, including that the frame
is the popularity-ranked prefix of each query (32 of 34 strata truncated), retrieved 2026-08-12 and
not re-retrieved.

## Ruling 4 — the cycle-12 fence is verified per member before scoring (private record)

Cycle 12 is fenced by containment: it drew cases from `packets-fullcohort-v8-2026-09-02`, built
from the 200 cycle-10 subjects, all of which are in the ledger. The draw record states that the
per-case identity map (the v8 sealed key) is not in this repository, so a per-member check is
operator-side.

> Scoring may begin only after the operator records the per-member overlap between the 193 drawn
> members and the v8 sealed key as **0**, with the number of cycle-12 members compared stated.
> A nonzero result stops the programme and is itself recorded.

## What this record does not do

It does not change P1 (≥ 0.90) or P2 (≥ 0.55), the paired v23/v17 design, shared control labels,
or the division of labour (labelling and case resolution remain operator-only). It does not alter
the cycle-12 board. It does not edit the preregistration.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-09-28T19:58:37Z`
- Exclusion set: full ledger, 5,695 identities, sha256 `c2e4a0ef…07666a`
- Accepted draw: 193 members across 33 strata, no reallocation
- Estimand: the 3,163 eligible repositories; 908,576 is the outer bound, not the estimand
- Scoring gate: per-member cycle-12 overlap against the v8 sealed key recorded as 0
- Signature: Houman Azimi-Nejadi — cycle-13 draw accepted as drawn; the full-ledger exclusion
  ruled on 2026-09-23 is signed here; the preregistration's estimand is corrected to the 3,163
  eligible repositories on which the draw's weights sum; no scoring before the per-member
  cycle-12 overlap is recorded as zero
