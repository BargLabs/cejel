> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — estimation protocol, amendment 4: the second rater replaced by an operator re-label

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** Amends
`docs/calibration/cycle-13-estimation-protocol-amendment-3-2026-10-01.md` (`fc2ff4e2`) §3 only. No
other record is edited.

**State at signing.** The packets are built, sealed and accepted
((private record), sealed key `5ef29d7a…`). The 40 subsample unit ids
were committed before any packet (`39a4698b`). **No label exists.**

## 1. Why

Amendment 3 §3 requires a second rater who did not build the rubric or the detector and has had no
access to either arm's output on this cohort. No such rater is available for cycle 13 (operator,
2026-10-02). The operator built the rubric, and while the packets were built one clause of the
`CORE-A2-HISTORY-ENV` matching logic reached a record the operator read (acceptance, R7). The
operator cannot be that rater. Labelling the subsample twice is still worth doing, but it measures
something different, and this amendment says what, before any label.

## 2. §3 replaced: the operator re-labels the subsample

- **Items: unchanged.** The same 40 units, 10 per group, selected with seed
  `cycle-13-second-rater-2026-10-01` and committed in `39a4698b`.
- **Rater: the operator, a second pass.** The first pass is the operator's labelling of all 177
  cases, which the estimate uses.
- **Washout.** The second pass begins no earlier than **7 days** after the operator's first
  label set is sealed, by the seal time recorded in custody (`labels/operator.sealed.json`).
- **Blinding.** The second pass sees the same packets and nothing else: no first-pass label, no
  detector output, no arm, class or group. The 40 case ids are read from the sealed key only after
  the first set is sealed. They are presented in a fresh order: ascending
  `sha256("cycle-13-relabel-order-2026-10-02" + NUL + caseId)`. The operator does not consult the
  first-pass labels, notes or exports during the second pass. Each set is sealed separately, with
  its own hash, before they are compared.
- **Statistic: unchanged in form.** Raw agreement and Cohen's kappa over the four labels
  (`present`, `absent`, `insufficient-context`, `withheld-evidence`, the last derived mechanically
  under ruling W), overall and for each of the four groups.
- **What it measures.** Within-rater consistency over time (test–retest). It does **not** measure
  independence from the detector: agreement concentrated where a detector fired can no longer be
  read as contamination, because the same person labelled both passes. The per-group figures are
  reported, without that reading.
- **The estimate uses the first-pass labels only.** The second pass never changes a figure, an
  interval or a validity verdict.

## 3. Requirement status, stated now

- **B11 Ruling 3 (the independent second rater giving A.4 its mechanism): not met for cycle 13.**
  It is carried forward as open to the next cycle's register.
- **A.4 by construction** (amendment 3 §4.1, no detector output in any packet): met, unchanged.
- **Disclosed:** the operator built the rubric; the R7 exposure on the 8 `CORE-A2-HISTORY-ENV`
  packets.

## 4. Publication, committed now

Whatever value returns is published beside the recall figure, under the same scope sentence, as
**within-rater agreement**, never as inter-rater agreement, with these statements:

> No independent second rater adjudicated cycle 13. This figure is the operator's agreement with
> his own labels on a 40-case subsample re-labelled after a washout of at least 7 days. It
> measures consistency, not independence from the detector; the independent-rater requirement is
> not met for this cycle.

> Low agreement means the recall interval understates total uncertainty, because it contains
> sampling variance only.

No result is withheld for being unflattering.

## 5. Tooling

The label tooling's second-rater path (private record) gates on this file instead of a naming record: the
re-label case list is produced only when the operator's first set is sealed and still matches its
seal, this amendment is on `origin/main` added by a signed commit, and the washout has elapsed.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Signed at: `2026-10-02T18:02:36Z`
- §2: the second rater is replaced by an operator re-label of the same 40 units, washout 7 days, fresh order seed `cycle-13-relabel-order-2026-10-02`
- §3: B11 Ruling 3 not met for cycle 13; carried forward
- §4: published as within-rater agreement, with the statements above
- Signature: Houman Azimi-Nejadi — before any label
