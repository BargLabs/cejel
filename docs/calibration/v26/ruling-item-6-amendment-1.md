# Ruling — v26 item 6, amendment 1: A5's reconciliation-artifact metric under v26

**CONSTRAINTS-VERSION: 2026-08-01.5**

- **Status:** ruled by the operator; this file's commit carries the operator's signature.
- **Date:** 2026-10-14.
- **Amends:** `docs/calibration/v26/ruling-item-6.md`, whose text is unchanged.
- **Applies to:** `witan-rubric-v26-prospective-2026-10-14` only. The public default stays v17.

## What the ruling left open, and what implementing it showed

The ruling kept every metric unchanged under v26. That included A5's `reconciliation_artifact_depth`,
which counts files in Cejel's own reconciliation-artifact format and scores 0 when there are none.
Whether that metric should stop scoring an absence was left to the metric-class question of
proposed ADR-0020.

Implementing the ruling showed a consequence it did not foresee. Under v17 through v25, the A5
"no dedicated claim-reality reconciliation artifact" warning held A5's status at `warning`. Under
v26 that finding no longer fires unless its settling evidence is present. A5's status then falls to
its score band, and the scorer adds a "metric-derived score … critical band" finding to explain it.

On the behaviour corpus, A5 moves from `warning` to `critical` on most specimens. The main
contributor is `reconciliation_artifact_depth` scoring 0 for the absence of Cejel's own format.
So the rule that now abstains because absence settles nothing would leave a metric that still
penalises the same absence, and the result is a harsher status than before.

## Ruling

Under v26 only, `reconciliation_artifact_depth` follows the same principle as the A5 finding.

- **No Cejel-format artifact is present and the repository names none:** the metric is not
  scored. It is omitted from A5's metric set, and the remaining A5 metrics carry A5's score at
  their declared relative weights. The ruling's existing disclosure sentence ("Whether this
  repository's claims are reconciled against its implementation cannot be settled from static
  evidence; Cejel makes no finding on it.") already states why. The certificate adds nothing
  else.
- **The repository names an artifact that is absent (S-A5 holds):** the metric is scored as today,
  at 0, beside the finding.
- **A Cejel-format artifact is present:** the metric is scored as today.

ADR-0020 rejects omitting a metric silently, because the evidence base shrinks while the
certificate shows unchanged confidence. Here the omission always comes with a disclosed sentence
that says why, so it is not silent. This amendment decides the metric for v26 alone. ADR-0020's
general metric-class decision stays open for every other metric and every other rubric.

## What is unchanged

- the two findings, their settling evidence and their wording;
- every other metric, in every criterion;
- v17 and v22–v25, which stay byte-stable;
- A5's status rules. If A5's remaining metrics still place it in the critical band, that band is
  reported as it is, because the score is speaking, not the absence of Cejel's format.

## Constraints on the implementation

- **Gating:** gated on the v26 identifier alone.
- **Fixtures**, each asserting status, score and findings:
  - no artifact and none named: the metric is absent, and the disclosure is present;
  - named and absent: the metric is 0, and the finding fires;
  - present: unchanged.
- **The change record** states, measured on the behaviour corpus, how many specimens change A5
  status under v26 against v25, in each direction, read from the measurement output and not
  estimated.
