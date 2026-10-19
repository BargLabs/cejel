# False-assurance closure: classification, and the prospective v27 rubric (2026-10-19)

Issues: #517, #518, #519, #520, #442. Each issue has a repro on a pinned public repository. Every
repro was rebuilt here as a minimal synthetic fixture, constructed in the test (no vendored clone),
and each fails on `main` before this change. They are in
`src/witan/__tests__/fixtures/false-assurance-fixtures.ts`.

This document was written, and the classification below fixed, before any code changed.

## The definitions used

Two repository documents define what counts as scoring behaviour.

`docs/format-stability.md`, "The rubric behaviour fingerprint":

> It is the digest of the scoring-relevant output of a fixed committed corpus of synthetic
> repositories scored under the named rubric by the build that produced this report. It covers
> criterion scores and statuses, metric values, per-severity finding counts, the archetype,
> `contentReadSummary`, the verdict, the composite scores, and the insufficient-source reason; it
> excludes everything per-invocation and all prose.

`src/witan/rubric-fingerprint.ts`, `projectWitanScoringSurface`:

> EXCLUDED, deliberately: [...] prose: finding summaries, metric labels/units/descriptions,
> evidence labels, criterion titles and notes, `scanLimitations`. A wording improvement is not a
> scoring change [...] A finding APPEARING or DISAPPEARING still moves the severity counts, so
> the detector change is caught while the sentence it produces stays editable.
> - evidence pointers. Their paths are fixture-relative and their content hashes restate file
>   content the fixture already pins.

`docs/format-stability.md`, on `historyLimitations`:

> It is display-only: unlike `scanLimitations` it does not make the badge unrated or
> `--min-score` refuse

and on additive fields:

> A minor v1 change may add optional fields; consumers must ignore fields they do not understand.

From these, a change is classified here as:

- **presentation-only** when it changes only evidence labels, evidence order or which evidence a
  finding cites, criterion notes, finding text, or a `contentReadSummary` reason count that
  creates no abstention and changes no score, status, metric value or finding count; and
- **scoring** when it changes any criterion score, status, metric value, per-severity finding
  count, abstention, composite, verdict or `rubricBehaviourFingerprint`.

One case sits on the line and is called out: `contentReadSummary` is inside the fingerprint
projection. The #519 count below adds a `byReason` key only when it is non-zero, so every
existing report, and every corpus specimen, is byte-identical and every pinned fingerprint is
unchanged. On a repository that carries Git LFS pointers the projected `contentReadSummary`
differs, with no score, status, metric, finding count or abstention moving. This is classified
presentation-only under the brief's definition (it names `contentReadSummary` reasons as
presentation) and the acceptance test is the brief's: v17's fingerprint and every v17 score on
the regression and board fixtures unchanged.

## Classification

| Issue | Change | Class | Ships under |
|---|---|---|---|
| #519 | `contentReadSummary.byReason.lfsPointer`: a count of files whose checkout holds a Git LFS pointer instead of content. Present only when non-zero; summed into `skipped`. Records no abstention and attributes nothing to a criterion. | presentation-only (see the note above) | every rubric |
| #519 | Certificate, Markdown and terminal itemize the LFS pointer count, and the next steps say to fetch LFS content and re-scan. | presentation-only | every rubric |
| #519 | A1's evidence label for a test file that is an LFS pointer says so, instead of "Detected test file". | presentation-only (evidence label) | every rubric |
| #520 | A4's library/CLI note does not say a lockfile is "not required" when the repository's own automation requires one; it names the requiring file and line. | presentation-only (criterion notes) | every rubric |
| #520 | A4 evidence order: when automation requires a lockfile and none is committed, the requiring workflow or tox line is cited first; when some dependency specs lack a constraint (library) or a pin (application), the manifest holding them is cited first. The synthesized metric-derived finding cites `evidence[0]`, so it now cites the file that drove the metric. | presentation-only (which file a finding cites) | every rubric |
| #517 | Workflows that only publish, release or deploy (a publish/release/deploy step and no test, lint or type-check command) do not count toward B3's `ci_script_depth` or `default_branch_ci_depth`. | scoring (metric values) | v27 only |
| #518 | `conftest.py` is not a concrete test file for A1. | scoring (`test_to_source_ratio`) | v27 only |
| #518 | An unconditional run-wide skip, a pytest `pytest_collection_modifyitems` hook that marks every item skipped or clears the list, or a module-level `pytestmark = pytest.mark.skip`, marks the test files in its scope hollow. | scoring (`non_hollow_test_share`, status) | v27 only |
| #519 | A read of an LFS pointer is a content-read skip attributed to the criterion that read it, which then abstains (`insufficient_data`) as a read failure: it stays in the composite at 0, like any evidence Cejel expected to read and could not. | scoring (abstention) | v27 only |
| #520 | A4 library norms report `lockfile_coverage` as 0, instead of omitting it, when the repository's own automation requires a lockfile and none is committed. | scoring (metric value) | v27 only |
| #442 | On a shallow clone, A2 abstains unless a confirmed critical secret finding stands, and B2 abstains when the visible history is shorter than its commit window. Both are read-failure abstentions, kept in the composite at 0. | scoring (abstention) | v27 only |
| #442 | v27's `historyLimitations` sentence says what v27 did, rather than "Scores are computed exactly as for any other scan". | presentation (prose); v17's sentence unchanged | v27 only |

### Considered and not shipped

| Issue | Candidate | Why not |
|---|---|---|
| #520 | A dedicated "automation requires a lockfile" finding | Under the v17 scorer a `warning` finding returns status `warning` before the score thresholds (`statusForScoreAndFindings`), so a critical-by-score A4 would move to `warning`, a status rise. A `critical` finding sets the score to the 1.4 cap (`capScoreForFindings`), a score rise from anything below 1.4. Both are excluded by the no-rise rule. The note and citation above carry the reader-side fix; `lockfile_coverage` = 0 carries the scoring fix. |
| #518 | Excluding `conftest.py` from the test list under v17 | It moves `test_to_source_ratio`, a metric value. v27 only. |
| #519 | Withholding `non_hollow_test_share` for LFS pointers instead of abstaining A1 | The pointer files were rated hollow, so removing them from the denominator raises the share whenever some readable tests assert. Excluded by the no-rise rule. |
| #442 | Withholding only B2's `pr_merge_ratio` | B2's other metric, `pr_trace_primitives`, can score higher than `pr_merge_ratio`, so dropping it can raise B2. Withholding only A2's `secret_cleanliness` can also raise A2's status, because the calibrated A2 state needs that metric and the score-band fallback can land on a less severe status. Both are excluded by the no-rise rule; the whole-criterion read-failure abstention cannot raise anything. |
| #442 | Making A2's not-applicable gate abstain on a shallow clone (it reads history for a committed `.env` path) | Not in the issue's repro, and on a depth-1 clone it would move nearly every A2-not-applicable repository into the composite at 0. Left open for the operator. |
| #517 | Treating an ungated publish workflow as a B6 privileged-operation surface | New native detection scope. The direction for this work is to stop native rubric expansion. Left open. |

## Why every v27 movement can only lower a score

The scorer's monotonicity rules, read from `src/witan/scoring.ts`:

- `scoreMetrics` is a weighted mean of `min(value / max, 1)`. Lowering a metric value cannot raise
  it. Removing a metric can, unless its normalized value is the maximum.
- A read-failure abstention (no `insufficientDataReason`, or `unreadable` / `denied_path`) keeps
  the criterion in the composite at score 0 (`averageScore`, `readFailureAbstentions`). A
  self-imposed abstention is excluded from the composite, which can raise it. Every v27
  abstention is a read failure.
- Status comes from `calibratedCriterionStateV11` (metric positivity) before the score bands, and
  a `warning` finding short-circuits the bands. A change that only lowers metric values cannot
  move a calibrated state toward `verified`.

| v27 change | Mechanism | Why it cannot raise |
|---|---|---|
| #517 publish-only workflows | lowers two saturating counts | lower values; B3's calibrated state only loses positivity |
| #518 `conftest.py` | lowers `test_to_source_ratio` | lower value; `conftest.py` was never rated in `non_hollow_test_share` |
| #518 run-wide skip | `non_hollow_test_share` loses the files it disables | lower value; calibrated A1 goes critical when the share is 0 |
| #519 LFS pointer | read-failure abstention | score 0, kept in the composite |
| #520 `lockfile_coverage` = 0 | adds a zero-valued metric | a zero term cannot raise a weighted mean; calibrated A4 already reads its absence as no lockfile |
| #442 A2, B2 | read-failure abstention | score 0, kept in the composite |

This is an argument, not the proof. The measured proof is the before/after tables in the PR, on
the behaviour corpus, the calibration anchors, the new fixtures and the public board rows.
