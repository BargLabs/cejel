---
role: record
---

# v17 and v23 detection recall and precision — the cycle-13 measurement record

This directory is the open calibration record for cycle 13: one preregistered estimate of
detection recall and detection precision for `witan-rubric-v17-2026-07-24` (the released default)
and `witan-rubric-v23-prospective-2026-09-06` (the candidate), on a 193-repository untouched cohort,
with the paired difference between them. It carries the protocol, its five amendments, the
instrument boundary, the draw acceptance and draw addendum, the estimator specification, the
promotion policy, the label seals, the washout record and its errata, the pre-run record and the result. Each is
republished from the operator's signed private record. Labels, evidence packets, reviewer notes
and counterparty specifics are not published here.

## 1. The figures

**v17 in-scope detection recall: 41.1% (95% CI 20.6–67.8%), measured on a 193-repository
untouched cohort under a preregistered protocol and design-weighted to 3,163 eligible public
repositories; measurement valid, no decidability ceiling tripped.**

**Detection precision 64.3% (95% CI 38.4–87.6%). Abstention share 11.4% (95% CI 3.6–20.0%).**

> Measured with the published @cejel/cejel@0.4.11 (gitHead `d30ac4ba`). Releases since then have
> changed scoring under v17, including 0.6.3's evidence fix (#433), so this figure does not
> describe the current release; a re-measurement on the current release is owed.

Both arms and the paired difference, copied from
[`cycle-13-result-2026-10-13.md`](cycle-13-result-2026-10-13.md):

| | v17 (released default) | v23 (candidate) | v23 − v17 |
|---|---|---|---|
| Precision | 0.643 [0.384, 0.876] | 0.636 [0.400, 0.840] | -0.008 [-0.059, 0.030] |
| Recall, headline (class X excluded; amendment 3 §2) | 0.411 [0.206, 0.678] | 0.452 [0.242, 0.726] | 0.040 [0.015, 0.076] |
| Recall, class X as miss (beside it) | 0.411 [0.206, 0.678] | 0.452 [0.242, 0.726] | 0.040 [0.015, 0.076] |
| Abstention share | 0.114 [0.036, 0.200] | 0.114 [0.036, 0.198] | — |

Point estimate, then the 95% interval. Exact values are in the custody `result.json`, whose sha256
the result record publishes.

**Validity.** Neither arm's aggregate insufficient-context ceiling tripped, so both estimates are
valid (spec v4 `validityForPromotion`). Seven case strata were voided by the small-stratum floor,
and one rule left the precision headline and two the recall headline under `missingRulePolicy`;
these are reported separately and do not void a headline. Every figure had all 10,000 replicates
valid.

The two recall rows coincide in both arms: no present-labelled class X unit entered either
denominator.

v17 is the calibrated default. This is a measurement publication. The same cycle measured the
prospective v23 beside it; under the signed promotion policy v23 was not promoted, and v17 remains
the default.

**Within-rater agreement.** Labelled by one rater, who authored the rubric. On 40 cases re-labelled
after a washout of at least seven days, he agreed with his own first labels on 85% of cases (Cohen's
kappa 0.73).

| Group | n | Raw agreement | Cohen's kappa |
|---|---|---|---|
| All 40 | 40 | 0.85 | 0.733 |
| Discordant | 10 | 1.00 | 1.000 |
| C/C | 10 | 0.60 | 0.412 |
| N/N | 10 | 0.80 | 0.565 |
| X/X | 10 | 1.00 | null: chance agreement is 1 (both passes used one label throughout) |

> No independent second rater adjudicated cycle 13. This figure is the operator's agreement with
> his own labels on a 40-case subsample re-labelled after a washout of at least 7 days. It
> measures consistency, not independence from the detector; the independent-rater requirement is
> not met for this cycle.

> Low agreement means the recall interval understates total uncertainty, because it contains
> sampling variance only.

## 2. What these figures are not

**Recall.** Three different measurements carry the word recall, and none of them stands in for
another:

- **this figure**, v17's in-scope detection recall on the cycle-13 cohort, 41.1% (95% CI
  20.6–67.8%);
- **v22's 34.0%** (95% CI 21.0–53.5%), cycle 12, in-scope detection recall of the prospective v22
  on a different cohort ([`v22-detection-recall/README.md`](../../calibration/v22-detection-recall/README.md));
- **the 95.64% rubric-agreement recall**, the July free-core holdout's "Finding worst-case recall"
  for v17 ([`free-core-v50/terminal-go.md`](../../calibration/free-core-v50/terminal-go.md)), which
  measures agreement between findings and blinded reviewers over bounded static evidence, not
  detection recall against defects present in a repository.

Not comparable with v22's 34.0%: different rubric, cohort, rule set and instrument; the two
intervals overlap almost entirely. 41.1% is not comparable with 34.0%: they are two
measurements, not a trend.

**Precision.** The 64.3% detection precision here and the July holdout's 96.43% finding precision
count different things, under different raters and instruments.

- **Cycle 13 (64.3%)** counts (repository, rule) units, drawn by stratified sample and
  design-weighted to the 3,163 eligible repositories. One label per unit records whether the
  rule's defect is present at the pinned revision, judged from an evidence packet
  ([protocol §2](cycle-13-estimation-protocol.md)). One rater labelled them: the operator, who
  authored the rubric. The instrument is the published 0.4.11 (`d30ac4ba`).
- **The July holdout (96.43%)**, in its own public record's words: "96.43% finding precision (95%
  lower bound 94.16%)"; "This is finding-level calibration of the v17 free-core rule set on the
  preregistered, untouched holdout. It measures whether the rule set's findings are backed by
  bounded, inspectable static evidence under the frozen protocol." Its threshold was "At least 100
  decisive finding candidates and 200 decisive controls in aggregate." Its review: "Finding,
  criterion, and abstention behavior were reviewed independently. Review material was
  identity-redacted and audited before release. Reviewers received bounded static evidence without
  repository identity, repository score, verdict, weighting information, or score transforms." Its
  detector revision was `8eff810a44014d06e257faa06cc2286e8ce639ae`.
  ([`terminal-go.md`](../../calibration/free-core-v50/terminal-go.md),
  [`preregistration.md`](../../calibration/free-core-v50/preregistration.md).)

Both figures stand. **The gap between them is not yet explained.**

## 3. The records

Each file below was republished from the operator's private calibration records at private commit
`15adb0506d5e6693193c959257fa2c44c47b7cd9`. The result is the version added by `315964e4d`. Each
is copied as written, with three kinds of change only: a republication line at the top; a
reference a public reader cannot open replaced by "(private record)"; and one redaction made in
place. [`REDACTIONS.md`](REDACTIONS.md) lists every change.

| File | What it is |
|---|---|
| [`cycle-13-draw-acceptance-2026-09-28.md`](cycle-13-draw-acceptance-2026-09-28.md) | Accepts the drawn cohort (193 members, 33 strata), the full-ledger exclusion set, and the corrected estimand: the 3,163 eligible repositories. |
| [`cycle-13-instrument-boundary-amendment-2026-09-28.md`](cycle-13-instrument-boundary-amendment-2026-09-28.md) | Moves the instrument from 0.4.9 to 0.4.11 (`d30ac4ba`) before any member was scanned, and says why. |
| [`cycle-13-estimation-protocol.md`](cycle-13-estimation-protocol.md) | The estimation protocol: the (member, rule) unit, the rule table, unit classes, census and stratified sample, estimator, validity rules, and three operator rulings. |
| [`cycle-13-estimation-protocol-amendment-1-2026-09-29.md`](cycle-13-estimation-protocol-amendment-1-2026-09-29.md) | Amendment 1: maps the eight unclassified finding wordings to rules, admits a third A3 rule, and fixes the allocation arithmetic. |
| [`cycle-13-estimation-protocol-amendment-2-2026-10-01.md`](cycle-13-estimation-protocol-amendment-2-2026-10-01.md) | Amendment 2: v24 as a conditional third arm, with a fallback to two arms if v24's paired rescore was a NO-GO, which it was. |
| [`cycle-13-promotion-policy.md`](cycle-13-promotion-policy.md) | The promotion criteria P0–P5, signed before the first label. |
| [`cycle-13-draw-addendum.md`](cycle-13-draw-addendum.md) | The census `D = 33`, the concordant allocation, the exhausted strata and the 177 drawn unit ids (`repo-NNN:RULE`; `repo-NNN` is a draw index, never a repository name). |
| [`untouched-estimator-spec-v4.json`](untouched-estimator-spec-v4.json) | The estimator specification the run executed: two-stage weights, member-clustered Rao-Wu bootstrap, the paired difference inside each replicate, and validity rules. |
| [`cycle-13-estimation-protocol-amendment-3-2026-10-01.md`](cycle-13-estimation-protocol-amendment-3-2026-10-01.md) | Amendment 3: restores B1 (headline recall excludes class X, reported beside it), adds a second-rater subsample, and binds the packet build to adjudication requirements A.1–A.7. |
| [`cycle-13-estimation-protocol-amendment-4-2026-10-02.md`](cycle-13-estimation-protocol-amendment-4-2026-10-02.md) | Amendment 4: replaces the unavailable independent second rater with an operator re-label after a 7-day washout, and commits the agreement statements to publication. |
| [`cycle-13-operator-label-seal-2026-10-05.md`](cycle-13-operator-label-seal-2026-10-05.md) | Seals the operator's first-pass label set (177 cases) by hash. No label or label count appears in it. |
| [`cycle-13-washout-exposures-and-known-limitations-2026-10-12.md`](cycle-13-washout-exposures-and-known-limitations-2026-10-12.md) | What the operator was shown about the instrument between the two labelling passes, and the instrument limitations declared before the estimate. |
| [`cycle-13-washout-exposures-erratum-1-2026-10-12.md`](cycle-13-washout-exposures-erratum-1-2026-10-12.md) | Erratum 1: corrects which code produced the arms, confirms the limitations at `d30ac4ba`, and adds one later exposure. |
| [`cycle-13-washout-exposures-erratum-2-2026-10-12.md`](cycle-13-washout-exposures-erratum-2-2026-10-12.md) | Erratum 2: one further exposure before the second pass, a design-partner call. Published redacted (counterparty specifics). |
| [`cycle-13-operator-relabel-seal-2026-10-12.md`](cycle-13-operator-relabel-seal-2026-10-12.md) | Seals the operator's re-label set (40 cases) by hash, and discloses the rater-name correction and the unused second labelling. |
| [`cycle-13-estimation-protocol-amendment-5-2026-10-12.md`](cycle-13-estimation-protocol-amendment-5-2026-10-12.md) | Amendment 5: maps the estimator's carried seal fields to cycle 13, signed after labelling and before scoring, and discloses that it came late. |
| [`cycle-13-estimate-pre-run-2026-10-13.md`](cycle-13-estimate-pre-run-2026-10-13.md) | Fixes the run commit and the implementation seal's sha256 before the one scoring run (amendment 5 §3). |
| [`cycle-13-result-2026-10-13.md`](cycle-13-result-2026-10-13.md) | The one estimate: run identity and custody hashes, both arms and the paired difference, validity, the promotion policy applied (no candidate promoted), within-rater agreement and disclosures. |
| [`REDACTIONS.md`](REDACTIONS.md) | Per file, what this publication changed and what it withheld. |

**Reading the republished files.**

- "(private record)" stands for a pull request, path, branch or record in the operator's private
  repository that a public reader cannot open.
- A path of the form `docs/calibration/cycle-13-….md` or `docs/calibration/untouched-estimator-spec-v4.json`
  names a file republished in this directory under the same file name.
- `docs/calibration/untouched-estimator-spec-v3.json` and the cycle-12 records are published in
  [`v22-detection-recall/`](../../calibration/v22-detection-recall/README.md).
- A bare `#NNN` is a BargLabs/cejel issue or pull request.
- Commit ids and hashes are kept as written. Unless the text names cejel, a commit id belongs to
  the private repository.
- File names without a directory (`draw.json`, `units.jsonl`, `estimate/result.json`,
  `labels/operator.sealed.json` and the like) name custody artifacts so that each hash beside them
  is bound to something. Their contents are not published.

**Not published, under the disclosure boundary:** the 177 first-pass and 40 re-label adjudication
labels and every per-label count, arm total and rule-level result; evidence packets, excerpts and
the sealed key; reviewer notes; custody outputs (`result.json`, `agreement.json`, `run.json`, whose
hashes are published in the result record); cohort membership; and counterparty specifics.

## 4. Frame membership

The cohort's membership is not published. The drawn unit ids in the draw addendum carry a draw
index, never a repository name. If the members were revealed, a reader who reran 0.4.11 on them
could match many unit ids to repositories, and the published recall figures would then say
something about how individual units were labelled. Labels are closed under the disclosure
boundary, so on 2026-10-13 the operator ruled to keep membership closed. No file in this directory
names a cohort member.
