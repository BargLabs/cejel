> Republished from the operator's private calibration records, signed there; this copy is the public record.

# Cycle 13 — result

**CONSTRAINTS-VERSION: 2026-08-01.5**

**Status: SIGNED by the operator commit that adds this file.** The one estimate run of cycle 13
(protocol §7 step 6), recorded with the promotion policy applied to it. Figures are design-weighted
to the 3,163 eligible repositories (popularity-ranked prefixes, retrieved 2026-08-12), measured with
cejel 0.4.11 (`d30ac4ba`) under `witan-rubric-v17-2026-07-24` and
`witan-rubric-v23-prospective-2026-09-06`, on the operator's first-pass labels of 177 drawn units.
Intervals are 95%, member-clustered Rao-Wu bootstrap, 10,000 replicates (spec v4).

## The run

| Item | Value |
|---|---|
| Run commit | `5e72e91be0358884781a03d00a12d0fe1427e3f6` (merge of (private record)) |
| Pre-run record | (private record), added by `619cfc616` |
| Implementation hashes.json sha256 | `1e732751f1c69fc6b86e08e1e82847e0fcb34003aad7a8628476737bd84526a8` |
| Runner sha256 | `f6dcdbff09b9a9c4fc98661bc35f9218cd1f8c701ad6c05fb2b51e02c5ab72b3` (the blob reviewed in (private record)) |
| Estimator configuration | `UNTOUCHED_ESTIMATOR_V4_DEFAULTS`, equal to the signed spec v4 |
| `estimate/result.json` sha256 (custody) | `d212516372fef3f7a6ef78dc0afd9d60a6d2d2968c203936055c5d21cb0fd7c2` |
| `estimate/agreement.json` sha256 (custody) | `b51e5ab7a98926833620d1c8491f99fa1cfdd99292617fecd4d1c38120d95b0d` |
| `estimate/run.json` sha256 (custody) | `389c6a74b47a9abd95e664723da6d6e8fd0eebedc19aeffee0805c4e3d3b9182` |

## Figures

| | v17 (released default) | v23 (candidate) | v23 − v17 |
|---|---|---|---|
| Precision | 0.643 [0.384, 0.876] | 0.636 [0.400, 0.840] | -0.008 [-0.059, 0.030] |
| Recall, headline (class X excluded; amendment 3 §2) | 0.411 [0.206, 0.678] | 0.452 [0.242, 0.726] | 0.040 [0.015, 0.076] |
| Recall, class X as miss (beside it) | 0.411 [0.206, 0.678] | 0.452 [0.242, 0.726] | 0.040 [0.015, 0.076] |
| Abstention share | 0.114 [0.036, 0.200] | 0.114 [0.036, 0.198] | — |

Point estimate, then the 95% interval. Exact values are in the custody `result.json` above.

**Validity.** Neither arm's aggregate insufficient-context ceiling tripped, so both estimates are
valid (spec v4 `validityForPromotion`). Seven case strata were voided by the small-stratum floor,
and one rule left the precision headline and two the recall headline under `missingRulePolicy`;
these are reported separately and do not void a headline. Every figure had all 10,000 replicates
valid.

The two recall rows coincide in both arms: no present-labelled class X unit entered either
denominator.

## Promotion policy (`docs/calibration/cycle-13-promotion-policy.md`), applied

v24 is not an arm (amendment 2 §2 fallback after its NO-GO), so v23 is the only candidate.

| Criterion | Requirement | v23 | Met |
|---|---|---|---|
| P0 validity | estimate valid | valid | yes |
| P1 precision | point ≥ 0.90 and lower bound ≥ 0.80 | 0.636, lower 0.400 | **no** |
| P2 recall (headline) | point ≥ 0.55 and lower bound ≥ 0.40 | 0.452, lower 0.242 | **no** |
| P5 precision difference | lower bound ≥ −0.05 | lower -0.059 | **no** |
| P5 recall difference | lower bound ≥ −0.05 | lower 0.015 | yes |
| P3, P4 | claims consistency and hygiene | not reached | — |

**Outcome (policy §3, fixed before any label): no candidate meets every criterion. v17 remains the
released default. These figures are recorded as informational. The policy pre-authorizes no further
cycle.**

What the paired difference does show: on the same cohort and labels, v23's headline recall is higher
than v17's, by about 4 points with an interval that excludes zero; its precision difference
is close to zero, with a lower bound just below P5's margin.

## Within-rater agreement (amendment 4 §2 and §4)

| Group | n | Raw agreement | Cohen's kappa |
|---|---|---|---|
| All 40 | 40 | 0.85 | 0.733 |
| Discordant | 10 | 1.00 | 1.000 |
| C/C | 10 | 0.60 | 0.412 |
| N/N | 10 | 0.80 | 0.565 |
| X/X | 10 | 1.00 | null: chance agreement is 1 (both passes used one label throughout) |

Final labels (after ruling W) and raw labels give identical figures on these 40 cases.

> No independent second rater adjudicated cycle 13. This figure is the operator's agreement with
> his own labels on a 40-case subsample re-labelled after a washout of at least 7 days. It
> measures consistency, not independence from the detector; the independent-rater requirement is
> not met for this cycle.

> Low agreement means the recall interval understates total uncertainty, because it contains
> sampling variance only.

## Disclosures

- Amendment 5 mapped the estimator's carried seal fields to cycle 13 after labelling and before
  scoring, not before labelling as spec v4 required.
- The re-label set was first exported under the first-pass rater name and sealed after a one-field
  correction; a second labelling of the same 40, 13 minutes later, is kept unsealed and unused
  (`docs/calibration/cycle-13-operator-relabel-seal-2026-10-12.md`).
- Exposures between the passes are recorded in the washout record and its errata 1 and 2. The
  instrument limitations declared there (A1 reads unrecognised test frameworks as hollow; B6 and
  A3 credit text that only describes a control) were confirmed at `d30ac4ba` in erratum 1 and
  apply to both arms.
- The runner's review (private record) found three guards without tests, filed as a `later:` issue; the run
  used the reviewed blob.
- No independent second rater (B11 Ruling 3 not met; carried forward).

## Publication

This record authorizes no publication. v17's cohort figures are its first precision and recall on
a cohort; putting them on any public surface needs its own publication card under the site's claims
discipline (policy §3). If a recall figure from this cycle is published, the within-rater agreement
and the two statements above are published beside it (amendment 4 §4). No result is withheld for
being unflattering.

## Operator signature

- Operator: Houman Azimi-Nejadi
- Recorded at: `2026-10-13T03:56:14Z`
- Signature: Houman Azimi-Nejadi — cycle-13 result recorded; no candidate promoted; v17 remains the released default
