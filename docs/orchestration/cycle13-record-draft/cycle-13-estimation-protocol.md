> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — estimation protocol: paired v23/v17 recall and precision on the fresh cohort

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** The three rulings marked
`OPERATOR RULING` were made by the operator on 2026-09-28 and are restated in the signature block. Nothing here takes effect, and no
case may be drawn, packeted or labelled, until the signature block is complete.

## 0. Standing and scope

Governed by, in order: (private record)
(signed, `f8d63102`); `docs/calibration/cycle-13-draw-acceptance-2026-09-28.md` (private record);
`docs/calibration/cycle-13-instrument-boundary-amendment-2026-09-28.md` (private record). This protocol
adds what those records leave open: the case population, the case-level selection design, the
estimator, and the validity rules. Where it differs from them, they win.

This is a **measurement**: figure, 95% interval and validity verdict per arm, plus the paired
difference. It does not promote any rubric. P1 (precision ≥ 0.90) and P2 (recall ≥ 0.55) from the
preregistration are reported against each arm's figure; a promotion decision, if any, is a
separate signed act. If a promotion policy is wanted, it is signed **before the first label is
applied**: scanner output exists (private record), labels do not, and labels are what "looking" means here.

**State at drafting (2026-09-28), counts only.** Scan complete: 193 members, 386 reports, every
report checked for tool version, rubric version and pinned revision, 0 failures (record at
(private record)). Detector-output inventory in
custody (`finding-inventory.json`, 13,338 bytes; templates carried by fewer than 3 members
suppressed). No packet exists; no case has been drawn; no label exists.

## 1. What the inventory says, stated before any design choice rests on it

- The arms emit the same findings on almost every member. Every candidate-bearing template
  below is identical between arms except where noted.
- v23-only findings: A3 "runtime Dockerfile declares no active HEALTHCHECK" (8 members) and A3
  "deployable service package manifest declares neither a build nor a typecheck script"
  (7 members). A1 coverage-configuration differs on 4 members (2 each way). A2 critical status
  is 7 members under v17 and 9 under v23; the extra findings sit in suppressed templates.
- `withheldPaths` is identical across arms: 126 members, 3,644 paths.
- `insufficient_data` counts are identical in every criterion across arms: v23's withheld-path
  abstention changed no criterion status on this cohort.

**Consequence, stated now so it cannot be read as an excuse later:** the v23-minus-v17
difference is determined entirely by units on which the arms disagree, of the order of 20 to 40.
The difference is most likely small and its interval wide. A null result is a valid result under
the preregistration and does not license a re-draw or a design change.

## 2. The case unit and the rule taxonomy

**Unit:** a (member, rule) pair. One label per unit, about the repository at its pinned
revision, **independent of either arm**. That is what "shared control labels" means here: the
label records whether the defect the rule describes is present; each arm is then scored against
the same label by whether it emitted that rule's finding.

**Rules for 0.4.11 wording.** Each pattern below was checked on 2026-09-28 against every
unsuppressed template in the inventory, both arms: each candidate template matched exactly one
pattern and no metric-band or pin-native template matched any. The unit-table build (§7) re-proves
the mapping on the raw summaries, since the inventory's templates replace quoted strings, paths
and numbers. Mapping is total and exclusive: every finding in
the 386 reports lands in exactly one rule, one non-candidate family, or `unclassifiable`, and
any `unclassifiable` finding stops the unit-table build and hands back to the operator, who
extends this table by signed amendment before any draw.

| Rule | Criterion | Pattern (0.4.11 summary) | Members emitting (v17 / v23) |
|---|---|---|---|
| `CORE-A1-AUTHENTICATED-TEST-ABSENCE` | A1 | `matched no concrete test file, configured test runner, CI test command, or coverage configuration` | 51 / 51 |
| `CORE-A1-NO-COVERAGE-CONFIG` | A1 | `Test suite files are present, but .* matched no coverage configuration\.$` | 49 / 49 (2 and 2 discordant) |
| `CORE-A2-CURRENT-ENV` | A2 | `A tracked non-template \.env file is present, while the bounded scan` | 5 / 5 |
| `CORE-A2-HISTORY-ENV` | A2 | `A non-template \.env file was tracked in git history` | 6 / 6 |
| `CORE-A2-COMMITTED-SECRET` | A2 | `Secret-shaped value appears committed in the scanned repository` | 4 / 4 |
| `CORE-A3-NO-CI-DEPLOY` | A3 | `matched no CI workflow or release-deployment automation` | 5 / 5 |
| `CORE-A4-NO-LOCKFILE` | A4 | `Dependency manifest is present, but .* matched no recognized lockfile\.$` | 12 / 12 |
| `CORE-A5-NO-RECONCILIATION` | A5 | `matched no dedicated claim-reality report artifact` (both variants) | 94 + 7 / 94 + 7 (two wording variants; overlap not established) |

**Non-candidate families** (no rule; never drawn): metric-derived band findings ("metric-derived
score … in the … band — no single finding drove this"); and, unless Ruling 1 admits them, the
pin-native families "runtime Dockerfile declares no active HEALTHCHECK" and "deployable service
package manifest declares neither a build nor a typecheck script".

**Suppressed templates** (7 under v17, 10 under v23; 10 paired templates) are classified by the
same table when the unit table is built. They are not assumed to be candidates.

### OPERATOR RULING 1 — are v23's two pin-native families measured this cycle?

They are most of what v23 emits and v17 does not (15 of the roughly 20 visible discordant
members). Cycle 12's protocol (§6) excluded them as having no rule to review against.

- **(a) Admit them as two rules**, `CORE-A3-DOCKERFILE-NO-HEALTHCHECK` and
  `CORE-A3-NO-BUILD-TYPECHECK-SCRIPT`, each with a written defect proposition fixed in this
  protocol before any label. v17 never emits them, so every one of their candidates is a
  discordant unit, and their controls come from members where A3 was measured.
- **(b) Keep them out**, as cycle 12 did. The paired difference then measures v23 only on the
  rules both arms share, and v23's main addition is reported as unmeasured.

Recommended: **(a)**. B5 asks whether v23 finds more than v17; leaving out the one place it
emits more answers a narrower question than the one preregistered. The cost is two defect
propositions written now, before any label.

> Ruling 1: **(a), admitted** (operator, 2026-09-28, in session).
>
> Defect propositions, confirmed by the operator as written. A label is
> `present` only if the proposition holds on the repository at its pinned revision, judged from
> tracked files:
>
> - `CORE-A3-DOCKERFILE-NO-HEALTHCHECK`: the repository ships a runtime container image for a
>   long-running service, and no tracked file declares a health or readiness check for that
>   service: not the Dockerfile's `HEALTHCHECK`, and not a compose, orchestration or platform
>   manifest's health or readiness probe. A Dockerfile for a one-shot job, build stage, test
>   image or development container is `absent` (the rule does not describe it).
> - `CORE-A3-NO-BUILD-TYPECHECK-SCRIPT`: a package the repository deploys as a service has no
>   tracked build or type-check step anywhere: not a package-manifest script, not a CI step, not
>   a build-tool or container build configuration that performs it. A package in a language or
>   runtime with no build or type-check step to perform is `absent`.
>
> Confirmed as written (operator, 2026-09-28, in session).

## 3. Unit classes per arm

For each (member, rule) and each arm:

- **C, candidate:** the arm emitted a finding mapped to the rule.
- **N, control:** the rule's criterion was measured by the arm (status `verified`, `info`,
  `warning` or `critical`) and no finding mapped to the rule.
- **X, instrument abstention:** the criterion's status is `insufficient_data`.
- **Out of population:** the criterion's status is `not_applicable`. The rule does not apply;
  the unit is never drawn and never counted.

Paired class of a unit: the pair (v17 class, v23 class), for example `C/C`, `N/N`, `N/C`, `C/X`.
**Concordant** units have the same class in both arms; **discordant** units differ.

## 4. Selection design

**Discordant units: census.** Every discordant unit is labelled, weight 1 at the case level. They
alone determine the paired difference.

**Concordant units: stratified sample.** Strata are rule × concordant class (`C/C`, `N/N`,
`X/X`). Within each stratum, order unit ids by `sha256(seed + NUL + unitId)` and take the first
`n_s`. Seed: **`cycle-13-case-draw-2026-09-28`**, fixed here. A stratum with fewer units than its
allocation is recorded as exhausted and is not backfilled from another stratum.

**Allocation**, applied mechanically to the unit table once it exists (§7):

1. Budget `B` (Ruling 2) minus the discordant census `D` leaves `B − D` for concordant strata.
2. The non-emitting side (`N/N` and `X/X` together) receives two thirds of `B − D`, candidates
   (`C/C`) one third, as in cycle 12: recall's denominator lives on the non-emitting side.
3. Within each side, allocate across rules in proportion to stratum size, with a floor of 2 per
   non-empty stratum, largest remainder, ties by rule id.
4. `X/X` strata are drawn like `N/N` strata. Without labels on abstained units, Ruling 3 could not
   be applied and the cost of abstention would be unmeasured: a present-labelled `X/X` unit is
   exactly the defect an abstaining arm did not report.

If `D` alone exceeds `B`, the protocol stops and hands back: the census is not sampled.

### OPERATOR RULING 2 — the label budget

B4 fixes 150–200. Recommended **180**: enough for a census of up to about 40 discordant units
and at least 2 cases in every concordant stratum, with headroom below 200 for replacements
under §6's ceilings (replacement is not backfill: a void stratum stays void).

> Budget B: **180** (operator, 2026-09-28, in session).

## 5. Estimator

`docs/calibration/untouched-estimator-spec-v3.json` is versioned to **v4**
(`"supersedes": "untouched-estimator-spec-v3.json"`). Carried forward unchanged: repository-
clustered stratified percentile bootstrap, 10,000 replicates, R type-7 quantiles, 95% interval,
the seeded draw algorithm, `missingRulePolicy: inconclusive-no-go`.

v4 adds two things, both fixed here:

1. **Two-stage weights.** A unit's weight is its member's cohort weight from `draw.json`
   (`controlWeight`, summing to 3,163 over the 193 members, per the acceptance record's estimand)
   times its case-level weight (1 for the discordant census; `N_s / n_s` for a concordant
   stratum). Every figure describes the 3,163 eligible repositories and says so.
2. **Paired difference.** Each bootstrap replicate resamples members within cohort strata once
   and computes both arms' recall and precision on that one resample; the difference is taken
   inside the replicate. The two arms are never bootstrapped independently.

Per arm, with labels `present`, `absent`, `insufficient-context` (IC) and `withheld-evidence`:

- recall = weighted true positives / (weighted true positives + weighted false negatives)
- precision = weighted true positives / (weighted true positives + weighted false positives)

A `withheld-evidence` label (the deciding evidence sits only in a path the report lists as
withheld) is an abstention for that unit in both arms, per the boundary amendment: never scored as
a miss, excluded from both denominators, and counted in the abstention share. IC labels are
excluded from the denominators and counted against the §6 ceilings.

### OPERATOR RULING 3 — how an instrument abstention (class X) counts for recall

When a criterion reports `insufficient_data` and the label says the defect is present:

- **(a) Conservative: a miss.** The defect was present and the arm did not report it. Recall is
  judged on this figure.
- **(b) Excluded**, like withheld evidence.

Recommended **(a)** for the headline, with (b) published beside it and the abstention share
always shown. The boundary amendment covers withheld evidence, where the instrument disclosed
why it could not see; a criterion-level `insufficient_data` is the instrument declining to
measure, and excluding it would let abstention raise recall. The lineage's own terminal
checklist (cejel #135) treats undecidable outcomes conservatively.

> Ruling 3: **(a)**, a present-labelled class X unit is a miss in the headline recall; the figure
> excluding class X is published beside it (operator, 2026-09-28, in session).

## 6. Validity rules — carried forward, not re-derived

The cycle-12 insufficient-context ceilings carry forward unchanged, for the reason cycle 12
recorded: re-deriving a gate in sight of expected data reads as moving it. Aggregate
design-weighted IC share above 0.20 voids the headline. A stratum voids when `IC ≥ 2` and
`IC / n > 0.25`. A voided stratum is excluded from the headline and reported separately, never
pooled. A mid-cycle proposal to relax either ceiling ends the cycle and requires a new
preregistration.

The abstention share (withheld-evidence labels plus class X units, design-weighted) is reported
with every figure. It gates nothing; it is never omitted.

## 7. Order of work

1. **Unit table (agent, counts only).** Build every (member, rule) unit and its paired class from
   the 386 custody reports using §2's table. Outputs to custody; the repository receives a
   counts-only table per rule × paired class and the count of `unclassifiable` findings, which
   must be 0 to proceed.
2. **Draw addendum (operator-signed).** Records `D`, the concordant allocation, exhausted strata,
   and the drawn unit ids, all computed mechanically from the table. Same pattern as
   `cycle-12-draw-addendum.md`.
3. **Estimator v4 and its falsifiability fixture (agent).** The fixture test ships with the
   estimator and must fail on a dropped cohort weight, swapped case weights, arms bootstrapped
   independently, and an X unit silently excluded under Ruling 3(a).
4. **Packets and sealed key (agent).** Identity-redacted evidence packets for the drawn units only;
   the identity mapping sealed in custody.
5. **Labels (operator only).** Blinded to arm and to class. No agent authors, suggests, pre-fills
   or edits a label.
6. **Estimate (agent, once).** Figure, interval and validity verdict per arm, and the paired
   difference, including a null.

## 8. Publication boundary

Per the IP boundary (2026-08-18): methodology, this protocol and, after retirement, the drawn
unit ids are open. Labels, reviewer notes, evidence packets and live cohort membership stay
closed. Any public figure from this cycle carries its population (the 3,163 eligible
repositories, popularity-ranked prefixes, retrieved 2026-08-12), its instrument (cejel 0.4.11,
`d30ac4ba`) and its abstention share.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-09-28T22:14:41Z`
- Ruling 1 (pin-native families): admitted as two rules, with the propositions in §2 as confirmed
- Ruling 2 (budget B): 180
- Ruling 3 (class X for recall): (a), a miss in the headline; the excluded figure published beside it
- Seed: `cycle-13-case-draw-2026-09-28`
- Signature: Houman Azimi-Nejadi — cycle-13 estimation protocol fixed before any case is drawn,
  packeted or labelled: unit is (member, rule) with one arm-independent label; discordant units
  labelled in full, concordant units sampled by rule and class; two-stage weights to the 3,163
  eligible repositories; paired difference computed within each bootstrap replicate; cycle-12
  ceilings carried forward unchanged
