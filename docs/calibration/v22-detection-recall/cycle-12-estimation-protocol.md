# Cycle-12 estimation protocol — recall/precision measurement

> **Published transcription.** Operator-signed source record, held in the private measurement
> repository. **Nothing is redacted from this file** — see [`REDACTIONS.md`](REDACTIONS.md).
> Path, pull-request and commit references below are that repository's and do not resolve here;
> they are code spans, not links. See [`README.md`](README.md) for the reading conventions.
>
> **Transcription note, not a correction.** The source record's status line reads
> `DRAFT — pending operator signature` while its own signature block at the end is complete
> (2026-09-05T12:35:06Z). By the document's own rule — "not in force until this block is
> complete" — it is in force; the stale status line was never updated after signing. It is
> reproduced unchanged here rather than tidied, because editing a signed record to look
> consistent is exactly the freedom this protocol family forbids. The same stale line appears
> on [`cycle-12-promotion-policy.md`](cycle-12-promotion-policy.md).

Status: **DRAFT — pending operator signature.** Per the convention reaffirmed at handover,
the signed commit is the authority record: nothing in this document authorizes a scan, a
draw, or a label until the Operator signature block at the end is complete. Everything above
that block is a proposal for review, not an instruction.

CONSTRAINTS-VERSION echoed from `docs/standing-constraints.md` at origin/main as of drafting:
**CONSTRAINTS-VERSION: 2026-08-01.5**

## 0. Eligibility and scope

Eligible per the Cycle-11 result (`docs/calibration/cycle-11-readjudication-protocol.md`,
operator-signed 2026-09-02, merged `7a1c4ddf` / PR #1282): insufficient_context 0 of 40 on the
changed-rule candidate population, decidability restored. That result cleared the diagnostic
gate Amendment 4 placed in front of any re-run; it is not itself an estimate.

This protocol is a **measurement**, not a diagnostic: pre-registered estimator, selection, and
decision rules, run once, reported including a null. It does not itself authorize v22
promotion. Cycle-10's terminal outcome (`docs/calibration/next-default-v22-2026-08-17-cycle-10/post-review-record.md`)
remains **INCONCLUSIVE-NO-GO**, and `witan-rubric-v17-2026-07-24` remains the sole calibrated
public default, until a separate signed act reads this result together with cycle-10's and
decides otherwise. That separate act is `docs/calibration/cycle-12-promotion-policy.md`
(companion document, drafted alongside this one) — see §5 for why the two are split and why
the promotion policy must be signed *before*, never after, this protocol's scan.

## 1. Population count — resolved, reconciliation closed

Mechanically recounted from the v8 sealed `key.json` (operator machine, 2026-09-04):
**964 repository-rule pairs = 217 candidates + 747 controls.** Independently re-summed here
from the per-rule table in §2 (candidates: 24+0+54+5+7+5+10+4+2+2+0+3+9+0+92+0 = 217; controls:
60+60+60+60+60+6+10+26+60+11+60+60+60+34+60+60 = 747) — both totals match exactly. **964,
not 977, is the confirmed v8 population figure**, superseding the earlier open item.

**Reconciliation — resolved 2026-09-04, no longer an open item.** The 977→964 gap (13) and the
160→148 gap (12) both close, and by the same mechanism: not missing data, but a property of
per-build sampled populations under pin-truth resampling.

The 12 spent-but-unsampled identities are fork-era candidates that are absent from v8's key
entirely — the pin never emitted their findings (so they are not candidates under pin-truth),
and the seeded per-rule control sampling did not separately select them as controls. They
exist in the cohort universe but not in v8's sampled population, by rule (identity-level list
held operator-side, per standing identity-boundary discipline — rule-level is what belongs in
this record):

| rule | count | source |
|---|---|---|
| `CORE-A1-NO-COVERAGE-CONFIG` | 4 | draw-1 |
| `CORE-A2-CURRENT-ENV` | 2 | draw-2 |
| `CORE-A2-TENANT-WITHOUT-RLS` | 2 | draw-2 |
| `CORE-A4-NO-LOCKFILE` | 3 | draw-2 |
| `CORE-A5-NO-RECONCILIATION` | 1 | pilot |
| **total** | **12** | |

**148 spent-and-present (76 candidates + 72 controls) + 12 spent-but-unsampled = 160.**

The 977→964 gap (13) closes the same way via per-rule population deltas under pin-truth
resampling — candidate-demotion and control-resampling moving pairs in and out of v8's sampled
set. The full per-rule delta table is held operator-side (illustrative deltas: `A1-AUTHENTICATED-TEST-ABSENCE`
+24, `A1-NO-COVERAGE-CONFIG` −14, `A5-NO-RECONCILIATION` −10, plus others summing to −13
overall); this document has not independently re-derived that full table and relies on the
operator's direct computation against the sealed key for the exact total, the same way it
relies on the operator for anything requiring `out7/sealed/identity-mapping.json` access.

**Standing consequence for the exclusion set used in §4's draw:** the exclusion set is the
full 160-identity spent ledger. 148 of those resolve to a row in the v8 key and are what
actually get excluded from the sampling pool. The remaining 12 are retained in the ledger even
though they have no row to exclude in v8 — specifically so that a future build whose seeded
sampling re-admits them (a different resampling could, in principle, re-select one as a
control) still treats them as spent. This is not an error being carried forward; it is the
ledger doing the job it exists to do across builds whose sampled populations are not
identical.

## 2. Population, frame, and expected counts — stated before partitioning

Source: the v8 build's `key.json`. Each of its finding-review cases carries `caseId`,
`ruleId`, `repository`, `revision`, and a `samplingUnit: repository_rule` candidate/control
flag (per Amendment 2's discovery that the sampling unit is a repository-rule pair, not a
finding).

**The stratum list itself must be derived mechanically from the distinct `ruleId` values in
`key.json`, never hand-typed.** This is the D7 guard from prior incidents in this repo — a
hand-maintained rule list goes stale silently the moment the detector grows a rule, and stays
green. A count of "9 changed rules + 7 unchanged + 3 pin-native-no-candidate-rule families"
is what the record currently shows, but that list is a description of the past, not a
denominator for this cycle; re-derive it, don't copy it.

**Before any sample-size decision or draw, run a count-only pass — `ruleId` × candidate/control
flag, no identity field read — and record the result here as a table.** This step needs no
sealed mapping (it reveals counts, not repositories) and may run as an agent-side scan per the
execution split in §8.

**Computed 2026-09-04 (operator machine, v8 sealed `key.json`), independently re-summed above
in §1 to match 964 exactly:**

| ruleId | eligible candidates | eligible controls |
|---|---|---|
| `CORE-A1-AUTHENTICATED-TEST-ABSENCE` | 24 | 60 |
| `CORE-A1-EPHEMERAL-HEALTH` | 0 | 60 |
| `CORE-A1-NO-COVERAGE-CONFIG` | 54 | 60 |
| `CORE-A1-NO-TEST-FILES` | 5 | 60 |
| `CORE-A2-COMMITTED-SECRET` | 7 | 60 |
| `CORE-A2-CURRENT-ENV` | 5 | 6 |
| `CORE-A2-HISTORY-ENV` | 10 | 10 |
| `CORE-A2-HISTORY-SECRET` | 4 | 26 |
| `CORE-A2-NONCONSTANT-SECRET-COMPARE` | 2 | 60 |
| `CORE-A2-TENANT-WITHOUT-RLS` | 2 | 11 |
| `CORE-A2-UNSORTED-SIGNATURE` | 0 | 60 |
| `CORE-A3-NO-CI-DEPLOY` | 3 | 60 |
| `CORE-A4-NO-LOCKFILE` | 9 | 60 |
| `CORE-A4-SUSPICIOUS-DEPENDENCY` | 0 | 34 |
| `CORE-A5-NO-RECONCILIATION` | 92 | 60 |
| `CORE-B6-UNGATED-PRIVILEGE-ESCALATION` | 0 | 60 |
| **total** | **217** | **747** |

Cross-check against the signed record, rule by rule rather than by count alone:
`CORE-A2-CURRENT-ENV` and `CORE-A2-TENANT-WITHOUT-RLS` do have eligible candidates in the full
v8 key (5 and 2) — the Cycle-11 result's "zero unspent candidates" claim was about the
post-spend residue, not the raw population, and the two are consistent once spending is
applied (see §4: both appear fully exhausted). `CORE-B6-UNGATED-PRIVILEGE-ESCALATION` shows
zero candidates at the population level, not just post-spend — this is a changed-at-pin rule
(one of the original nine) with an apparent zero base rate on this real cohort, not an
unchanged rule; it was already named as one of the three currently-unevaluable rules in the
Cycle-11 result, for this reason. `CORE-A1-EPHEMERAL-HEALTH` and `CORE-A4-SUSPICIOUS-DEPENDENCY`
are the two named unchanged-at-pin exclusions from the original selection (`access-gated`
asserted-never-computed, and `fabricated` unevidenceable, respectively); their pool sizes here
(60 and 34) are close to but not identical to the fork-era figures cited when they were named
(58 and 32) — expected, since pool sizes shift across builds as already-drawn or already-labelled
items are excluded at different points, not a discrepancy worth chasing. `CORE-A2-UNSORTED-SIGNATURE`
is presumably one of the five unnamed "presence-asserting or history-scoped" unchanged rules
from the original selection record, never individually named there. The three
`pin-native-no-candidate-rule` families (Dockerfile with no active `HEALTHCHECK` — 9
occurrences; deployable manifest with neither build nor typecheck script — 8; HTTP entrypoint
with no health/readiness route — 2, per `docs/orchestration/v22-cycle11-backlog.md`) have no
row in this table at all, by construction — they have no candidate rule, so they cannot appear
as a `ruleId` with a candidate count.

Stating expected counts here, before sampling, is what makes an exhausted stratum a checked
fact during the draw rather than a surprise discovered mid-run (the failure mode Amendment 2
and Amendment 7 both hit and recorded honestly after the fact — this section exists so the
next cycle catches it before, not after).

## 3. Estimator — pre-registered before any draw

Version `docs/calibration/untouched-estimator-spec-v2.json` to **v3**, `"supersedes":
"untouched-estimator-spec-v2.json"`. Carry forward unchanged unless flagged below:
repository-clustered stratified percentile bootstrap, 10,000 replicates, R-type-7 quantiles,
95% CI, `candidateWeight: 1`, `controlWeight: eligiblePopulationSize/sampleSize`,
`missingRulePolicy: inconclusive-no-go` (a rule with zero eligible candidates or controls in
the final draw resolves via the existing exact-tuple convention `N=0, n=0, pi=0, d=0`, never
treated as coverage).

**Decided: the `controlInsufficientContext` ceilings carry forward as-is**
(`maximumAggregateDesignWeightedShare: 0.2`, `maximumPerRuleWaveDesignWeightedShare: 0.25`,
both gating to `inconclusive-no-go`). Rationale, recorded here because it will be asked again
later: the ceilings are adjudicability gates — they bound what fraction of undecidable labels
an estimate can tolerate before it is voided — and that purpose did not move when the
candidate population shifted between fork-era and pin-truth scans. The population shift
(e.g. `CORE-A1-NO-COVERAGE-CONFIG` 87→54, `CORE-A2-HISTORY-ENV` 22→10) changes stratum weights
and variance, which is the estimator's problem, not the ceiling's. Re-deriving the ceilings now
carries a named incentive problem: candidate IC is already known to be excellent (0/40, the
Cycle-11 result), and control IC is suspected to be the real risk (12-of-30 in draw-1's mixed
sample). Any re-derivation performed today is performed in sight of expected data and would
read as goalpost-moving no matter how principled the reasoning — so it does not happen. The
one exception: if a specific ceiling value is shown to have been derived *from* a fork-era
quantity, rather than from a general adjudicability principle, it is re-derived from that same
principle, with the derivation written down here — never re-derived from expected or observed
labels.

**Forced amendment — small-stratum floor on the per-rule ceiling. Decided: option (a),
`IC > max(1, 0.25 × n)`.** Pin-truth leaves strata of size 1 and 2 (§2's count-first table will
confirm exactly which). A single insufficient-context label in a 2-case stratum is a 0.50 share
and voids that wave through arithmetic, not evidence — the floor exists so no stratum can be
voided by arithmetic on a single label.

The deciding argument against the alternative (rolling small strata into the aggregate ceiling
instead of gating them individually) is cycle-10's own scar tissue: the failure mode this
workstream has actually lived is concentration hidden by aggregation. Draw 1's candidate-side
collapse (9-of-10 insufficient-context) was nearly invisible inside a mixed 21-of-40, and
Amendment 2 exists precisely because diluting a concentrated failure into a pooled number reads
as health. A roll-up floor reproduces that exact shape at the stratum level: a wholly
undecidable 6-case stratum (6 of 6 IC) would roll into the aggregate as 6/40 = 0.15 and pass.
Under the adopted floor, that stratum voids after its second IC label. The gate kept is the one
that catches the failure already met once.

**Exact rule, stated in plain arithmetic to be immune to ceiling-function ambiguity — this is
the sentence a reviewer checks on their fingers:** a stratum's wave voids when its
insufficient-context count `IC` and case count `n` satisfy **`IC ≥ 2` and `IC / n > 0.25`**.
(Confirmed algebraically identical to `IC > max(1, 0.25 × n)` for every integer `n ≥ 1` and
integer `0 ≤ IC ≤ n`, including every boundary where `0.25n` lands on an integer.)

**Cost, stated rather than avoided:** for `n = 1` this gate is inert by construction — `IC ≥ 2`
cannot hold when the stratum has only one case, so the per-rule floor mathematically cannot
fire on a singleton. Singleton strata are policed by the aggregate 0.20 ceiling alone. This is
a documented limit, not a vacuous check discovered later.

**Design corollary, pre-committed now so it cannot be re-litigated mid-cycle under pressure:**
if control-side IC threatens the 0.20 aggregate ceiling, the correct response is already on
the table — control-side evidence packets showing what the rule's scan actually saw, giving
the reviewer more to adjudicate on — not a softer ceiling. A ceiling that bends to meet the
data measures nothing. Any mid-cycle proposal to relax either ceiling is out of scope for this
protocol and requires killing the cycle and re-registering, never amending in place.

## 4. Selection design

Same seeded-shuffle method as every prior draw in this lineage: within each stratum, order
case ids by `sha256(seed + caseId)`, take the first N. Seed fixed and recorded here before any
scan or draw runs.

Sample size per stratum is set against the §2 table, not against convenience. A stratum with
fewer available cases than the target allocation is recorded here as exhausted — same honesty
rule Amendments 2 and 7 already established — and is not backfilled from another stratum.

**Spent-case accounting — recomputed 2026-09-04 against the v8 sealed key:** 160
(repository, revision, rule) identities are spent, confirmed disjoint (the 120-identity union
recorded in Amendment 7, plus Amendment 7's own 40-case draw, independently re-verified as
non-overlapping). Of the current 964-pair population: **141 unspent candidates** (`A5-NO-RECONCILIATION`
68, `A1-NO-COVERAGE-CONFIG` 38, `A1-AUTHENTICATED-TEST-ABSENCE` 12, `A2-HISTORY-ENV` 10,
`A2-COMMITTED-SECRET` 7, `A2-HISTORY-SECRET` 4, `A2-NONCONSTANT-SECRET-COMPARE` 2 — sums to
141) and **675 unspent controls**. §1 records the full reconciliation of the 160-identity spent ledger against these
counts (148 resolve to a row in v8's key and are excluded from the pool directly; 12 are
spent-but-unsampled and are retained in the ledger regardless) — resolved, not an open item.

**Identity-resolution requirement, added after a contamination incident on this exact count:**
case ids are per-build positional — the same id string can point at a different
(repository, revision, ruleId) triple across different sealed keys. A recount for this
protocol was itself contaminated once by resolving v8 ids through the out7 key, producing 39
false identities before the error was caught. **Every spent-set or population computation in
this cycle must name which sealed key resolved each id it used**, recorded alongside the
number, not just the number itself — a count with no stated source key is not trustworthy
regardless of who computed it or how confident they were.

**Controls are drawn this cycle.** This is the defining change from Cycle-11, which was a
candidate-only diagnostic by design (Amendment 2). An estimate without controls has no
denominator for recall or false-positive rate.

## 5. Decision rule — fixed before looking

Primary output of THIS document: point estimate and 95% CI for recall and for the
FPR/precision-adjacent metric, per the v3 estimator, over the full stratified population
defined in §2 — plus a validity verdict (whether the §3 ceilings or `missingRulePolicy` were
tripped, and by which rule/wave if so).

Gate: any rule/wave whose insufficient-context share exceeds the §3 ceiling (as amended for
small strata), or that resolves via `missingRulePolicy`, is excluded from the aggregate
headline figure and reported separately — never silently pooled into the aggregate as if it
had been measured.

**Decided: this protocol outputs figure + CI + validity verdict only, never a GO/NO-GO
promotion recommendation.** Endorsed for three reasons already on the record: it is cycle-11's
own precedent (the result was signed as a measurement; eligibility for cycle-12 was a separate
reading of it, not a clause inside it); a protocol that can output GO invites designing toward
GO, which is the exact contamination this workstream exists to prevent; and promotion
genuinely weighs things a measurement protocol has no standing to weigh — v17's existing
customers, the site's public claim surfaces, publication posture.

**Refinement, so the separation cannot become a loophole:** this document pre-registers only
its own validity rules — the §3 ceilings, minimum-label counts, stopping rules — and outputs
figure + CI + validity verdict, nothing else. The promotion criteria — what point estimate, at
what CI width, under what validity verdict, permits promoting v22 over v17 — are pre-registered
separately, in the companion document `docs/calibration/cycle-12-promotion-policy.md`
(drafted alongside this one), **fixed and signed before this measurement's scan runs**, not
after. Both documents are fixed before looking; neither may move the other afterward. Signing
order matters: the promotion-policy record is signed first, or the same day, but never after
any measurement output exists — specifically so "a later signed act reads the figure" cannot
quietly become "we decide the threshold after seeing the number."

## 6. Unevaluable rules — record, never substitute

If §2's fresh count confirms it, `CORE-A2-CURRENT-ENV`, `CORE-A2-TENANT-WITHOUT-RLS`, and
`CORE-B6-UNGATED-PRIVILEGE-ESCALATION` resolve via `missingRulePolicy`
(`inconclusive-no-go` for that rule alone), not by pooling their controls into another rule's
estimate.

The three `pin-native-no-candidate-rule` families (Dockerfile/HEALTHCHECK, deploy-manifest
build/typecheck, HTTP entrypoint health route) have no candidate rule to review against and
stay out of this cycle's estimate entirely — they remain a v23 rule-set design input
(`docs/orchestration/v22-cycle11-backlog.md`), not a proxy folded into cycle-12's numbers by
any means.

## 7. Falsifiability check for the estimator — mechanical, fixture-anchored

**Problem this closes:** a bootstrap/CI pipeline that cannot fail its own sanity check is not
a check — code and test can be wrong together and stay green (the D5 failure class already on
record in this repo: a sign inversion that thirty green tests missed).

**Fixture, committed now rather than described later:**
`cycle-12-estimator-falsifiability-fixture.json` (delivered alongside this draft). It is a
synthetic, non-production stratum — `ruleId: "FIXTURE-SANITY-CHECK-DO-NOT-TREAT-AS-REAL-RULE"`
— exercising only the weighting/aggregation arithmetic
(`candidateWeight × candidatePositive + controlWeight × controlPositive`, divided by the
weighted totals), not the bootstrap replicate loop. Its expected output is `1/3` exactly,
hand-verified by rational arithmetic (`fractions.Fraction`, no floating-point rounding in the
derivation). The fixture file also records three plausible-bug outputs it is confirmed to
discriminate from — control weighting dropped to 1 (0.4286), candidate/control weights
swapped (0.5385), controls excluded entirely (0.6667) — proving the check would actually fail
under a real implementation mistake, not just under an arbitrary one.

**Required test, to ship in the same PR as the v3 estimator implementation** (suggested path
`packages/witan/src/__tests__/cycle-12-estimator-falsifiability.test.ts`): feed the fixture's
stratum into the estimator's point-estimate function in isolation and assert the output equals
`1/3` within the fixture's stated tolerance. The test must fail on any of the three recorded
wrong outputs, not merely on a crash — "does not crash" is not a check, per the same lesson.

**Known limit of this fixture, stated rather than glossed over:** it covers only the
weighting/aggregation arithmetic. It does not exercise the bootstrap CI or the seeded
replicate draw. Those need their own falsifiability fixture before cycle-12's confidence
intervals — as opposed to its point estimate — are trusted, and that fixture does not yet
exist. Recorded as a requirement, not silently deferred.

## 8. Execution split (unchanged from Amendment 3)

**An agent session may:** run the mechanical rule-id/count extraction from `key.json` for §2
(no identity fields read); scan and build packets; run the independent byte-check; implement
and run the v3 estimator and its §7 fixture test.

**Operator-only, unchanged:** resolving drawn case ids against the sealed identity mapping
(`out7/sealed/identity-mapping.json`, mode 0600); labelling. No agent authors, suggests,
pre-fills, or edits a label. An agent session asked to do either must refuse and hand back,
per the standing rule.

## 9. Publication boundary

Per `CLAUDE.md`'s IP boundary (2026-08-18, authority: the operator's disclosure-boundary
decision): this protocol's methodology, and — after retirement — the drawn case-id list, are
open by design. Adjudication labels, live frame membership, and reviewer notes stay closed,
under any framing, on any public surface. Any draft of a public-facing figure derived from
this protocol's eventual result is checked against that boundary before publication, not
after.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: 2026-09-05T12:35:06Z (strengthened form; original signing 2026-09-05, same operator, same content)
- Signature: Houman Azimi-Nejadi — cycle-12 estimation protocol in force: population 964 (217/747) from the v8 build under the signed producer chain, estimator and selection design pre-registered before any draw, IC ceilings carried from v2 with the small-stratum floor, decision rule fixed before looking, falsifiability fixture binding, execution split per Amendment 3, publication boundary unchanged

This document is not in force, and nothing in it authorizes a scan, draw, or label, until
this block is complete.
