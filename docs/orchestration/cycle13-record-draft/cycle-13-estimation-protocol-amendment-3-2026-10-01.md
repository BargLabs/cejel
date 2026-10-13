> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — estimation protocol, amendment 3: the carried-requirements register folded in

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Amends
`docs/calibration/cycle-13-estimation-protocol.md` (private record), its amendments 1 (private record) and 2 (private record),
`docs/calibration/cycle-13-promotion-policy.md` (private record) and
`docs/calibration/untouched-estimator-spec-v4.json` (private record). None of those files is edited.

**State at signing.** The draw is signed (`cycle-13-draw-addendum.md`, 177 units spent). Estimator
v4 is merged (private record). No packet exists and no label exists.

## 1. Why this amendment exists

(private record) says of itself: "When a cycle-13 protocol is
written, these are folded into it and it — not this file — governs." The protocol was drafted
without reading it. Two operator decisions recorded there were left out or contradicted, and the
adjudication requirements it reproduces from signed cycle-12 records were never stated for cycle
13. This was found on 2026-10-01 at the packets step, before any packet or label. This amendment
folds them in. Where it and an earlier cycle-13 record disagree, this amendment governs.

## 2. Abstention — B1 restored (operator, 2026-10-01)

B1 (operator, 2026-09-06): abstained criteria form a third stratum, reported separately and never
pooled into the headline. Protocol Ruling 3(a) (2026-09-28) counted a present-labelled class X unit
as a miss in the headline recall. **B1 is restored and Ruling 3(a) is superseded for the headline:**

- **Headline recall**, per arm, excludes every class X unit from numerator and denominator. It is
  the figure estimator v4 reports as `recallExcludingX`.
- **The X stratum is reported separately**, never pooled: its design-weighted share, its
  present-labelled count and share, and the X-as-miss recall (estimator v4's `recall`), beside the
  headline, always.
- **Precision** is unchanged: a class X unit makes no claim and never entered it.
- **Promotion policy.** P2 reads the headline above: point estimate ≥ 0.55 and 95% lower bound
  ≥ 0.40. P5's recall difference is the paired difference of that headline, v23 − v17, computed
  inside each replicate. The thresholds are unchanged.
- **Estimator.** Spec v4's `metrics` headline is read as `recallExcludingX`. Estimator v4 computes
  the paired recall difference only on X-as-miss recall, so before any estimate it gains the paired
  difference of `recallExcludingX`, with a test and a mutation that turns red when the difference is
  taken on the wrong figure. Both differences are reported; the headline difference is the B1 one.

Rationale of record, from B1: the distinction between "I could not look" and "I looked and saw
nothing" is the distinction the product sells, and a measurement that blurs it measures something
other than what is claimed. The concern behind Ruling 3(a), that excluding abstention lets
abstention raise recall, is answered by reporting the X stratum and the X-as-miss figure beside the
headline every time, never omitted.

## 3. A second rater — B11 Ruling 3 (operator, 2026-10-01)

B11 Ruling 3 (2026-09-17) gives requirement A.4 a mechanism: a preregistered subsample adjudicated
independently by a second rater. For cycle 13:

- **Items: 40 of the 177 drawn units**, 10 from each of four groups by paired class: discordant
  (the census), `C/C`, `N/N`, `X/X`. Within each group, units are ordered by
  `sha256(seed + NUL + unitId)` ascending and the first 10 taken. Seed:
  **`cycle-13-second-rater-2026-10-01`**. A group with fewer than 10 units is taken whole and
  recorded; it is not backfilled. The selection is computed mechanically and recorded, by unit id,
  in the packets record before either rater sees any packet.
- **Second rater:** **to be named in a separate operator-signed record before the second rater's first label**, who did not build the rubric or the detector
  and has had no access to either arm's output on this cohort.
- **Blinding.** The second rater sees the same packets as the operator and nothing else: no
  detector output from either arm, no arm, no class, no group, no operator label. The two raters do
  not discuss any item until both label sets are sealed. Each set is sealed separately, with its
  own hash, before the other is opened.
- **Statistic.** Raw agreement and Cohen's kappa over the four labels (`present`, `absent`,
  `insufficient-context`, `withheld-evidence`), overall and for each of the four groups. The
  per-group figures are the "conditioned on detector outcome" figures B11 requires: contamination
  shows as agreement concentrated where a detector fired.
- **The estimate uses the operator's labels only.** The second rater's labels never change a
  figure, an interval or a validity verdict.
- **Publication, committed now.** Whatever value returns is published beside the recall figure,
  under the same scope sentence, with this statement: low agreement means the recall interval
  understates total uncertainty, because it contains sampling variance only. No result is withheld
  for being unflattering.

## 4. Adjudication requirements A.1–A.7 bind the packets

Reproduced from the register's section A, which reproduces two signed cycle-12 validity notes
(both in force). For cycle 13, where labels are blind to arm and class:

1. **No detector output in any packet.** No finding, status, score, metric or inventory count from
   either arm, labelled or not. This satisfies A.1 and A.4 by construction and goes beyond them.
2. **A.2, A.3.** Each packet carries raw excerpts from the member's pinned revision sufficient to
   judge the rule's defect proposition (protocol §2 as amended) without any detector conclusion,
   including command reachability where it decides the question.
3. **A.5.** A case the raw evidence cannot decide is labelled `insufficient-context`; nothing the
   detector produced resolves it.
4. **A.6, provenance, fail loud.** Every excerpt is bound to its unit's member, that member's pinned
   revision from the draw, and the excerpt's path at that revision, by content hash. Any mismatch
   stops the packet build; it never reaches a rater.
5. **A.7, abstention visible.** Abstention is visible in the unit table, the X stratum and every
   estimate (§2). It is not shown to the raters, because the protocol blinds them to class.
6. **Identity redaction** by the existing independent byte-check, as an acceptance authority
   separate from the build (register section C).

## 5. B11 Amendment 2, and why the census is not a stratifier

B11 Amendment 2 found that arms disagreement is a poor miss-finder and withdrew it as a
stratifier. Cycle 13's discordant census does not use disagreement to find misses: it exists
because only discordant units carry the paired difference, every unit is weighted by its known
inclusion probability (1 for the census, `N_s / n_s` otherwise), and the estimate is unbiased
whichever strata the misses fall in. This is recorded so the two records are not read as
contradicting each other.

## 6. Items of the register not re-verified here

B2 to B10 and B12 govern the instrument, the cohort and the frame. They were engaged by the
boundary amendment (private record), the draw acceptance record (private record) and the scan record (private record), but this
amendment does not re-verify each against them. The operator confirms by signing that none is
contradicted, or names the one that is.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-10-01T15:24:23Z`
- §2: B1 restored; headline recall excludes class X; X stratum and X-as-miss recall reported beside
- §3: second rater, 40 units (10 per group), seed `cycle-13-second-rater-2026-10-01`, rater named in a later signed record before any second-rater label
- §4: A.1–A.7 bind the packet build
- Signature: Houman Azimi-Nejadi — cycle-13 records reconciled with the carried-requirements
  register before any packet or label
