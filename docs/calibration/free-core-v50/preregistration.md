# Free-core v50 preregistration

Date: 2026-07-24 UTC

Status: preregistered before holdout selection or scanning

Rubric: `witan-rubric-v17-2026-07-24`

This is the public, redacted methodological record. It intentionally omits
the population definition and every selection input or output from which the
holdout, its composition, or any individual review decision could be
reconstructed.

## Prospective methodology

The experiment contract and every gate below were frozen before selection.
A deterministic, single-pass procedure selected one fixed 200-repository
holdout. Selection and revision freezing completed atomically before any
source scan. The holdout was not replaced, expanded, or adaptively changed
after outcomes became available, and no result was used to tune the rubric
evaluated here.

Selection specifications, search frames, eligibility details, strata,
allocations, randomization inputs, exclusions, identities, revisions, and
population records are deliberately not published in this redacted record.

## Static safety envelope

- Network access was limited to discovery and immutable source retrieval.
- Scoring read tracked files only at each frozen revision.
- Repository scripts, tests, builds, hooks, imports, binaries, notebooks, and
  generated programs were never executed.
- Retrieval excluded tags, remote references, and later revisions; remotes
  were removed before scoring.
- Source inspection was bounded by prospectively frozen file-count and
  byte-count limits.
- Unsupported or insufficient source remained an evaluated outcome rather
  than a post-selection exclusion.
- A restricted-network replay had to reproduce the frozen artifact tree
  without new retrieval or recovery work.

## Blinded review and scoring

Finding, criterion, and abstention behavior were reviewed independently.
Review material was identity-redacted and audited before release. Reviewers
received bounded static evidence without repository identity, repository
score, verdict, weighting information, or score transforms.

The material required to reconnect review decisions to the frozen sources
remained closed until every review was complete and content-addressed. The
original review decisions were never edited. The frozen estimator then
authenticated its inputs and ran exactly once, using 10,000
repository-clustered stratified bootstrap replicates. Missing or undecidable
review outcomes were treated conservatively in the worst-case recall and
false-positive envelopes.

## Finding thresholds

- At least 100 decisive finding candidates and 200 decisive controls in
  aggregate.
- Aggregate precision 95% lower bound at least 80%.
- Per-rule precision 95% lower bound at least 70% for every rule with at
  least 30 decisive candidates.
- Aggregate worst-case recall lower envelope at least 50%.
- Aggregate worst-case false-positive-rate upper envelope at most 2%.
- Undecidable control share at most 20% in aggregate and at most 25% in each
  active rule, with at least one decisive control in every active rule.
- Undecidable candidate share at most 20%.
- Precision interval width at most 15 percentage points.
- Recall envelope width at most 20 percentage points.

## Criterion thresholds

- At least 300 decisive criterion reviews in aggregate.
- Applicability exact-agreement 95% lower bound at least 90%.
- Criterion-state exact-agreement lower bound at least 75% for cases where
  the criterion applies.
- Within-one-state-band agreement lower bound at least 90%.
- Two-or-more-band error 95% upper bound at most 5%.
- No language tier with at least 30 distinct decisive repositories may have
  a criterion-state exact-agreement lower bound below 65%.
- Scores and verdicts must remain absent when the independent abstention
  review determines that evidence is inadequate for scoring.

## Abstention thresholds

- At least 30 decisive reviews on each side of the score-or-abstain boundary.
- Inappropriate-scoring 95% upper bound at most 5%.
- Inappropriate-abstention 95% upper bound at most 10%.
- The pooled measured-stress family must include at least 30 decisive
  repositories and have an inappropriate-scoring 95% upper bound at most
  10%.

## Terminal stopping rule

V50 had one terminal wave. The complete scan had to finish with all 200
positions resolved and zero error rows. Any allocation, integrity,
authentication, identity-redaction, review-mapping, or non-recoverable
transport failure was terminal NO-GO.

Scoring could run only after all three review sets were complete and sealed.
GO required every frozen gate to pass; point estimates could not waive a
gate. A failed gate would have retired the holdout and required a separately
preregistered successor. A second wave, adaptive replacement, threshold
change, relabeling, favorable-subset result, or post-outcome protocol change
was prohibited.
