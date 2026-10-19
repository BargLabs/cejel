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

## As built (added after the code; the sections above are as written before it)

Where the implementation is narrower than, or differs from, the classification table:

- **#520, what is read.** The lockfile requirement is read from CI workflows only, and only for the
  commands documented to fail without their lockfile. tox and nox
  configuration (for example `uv-venv-lock-runner`) is not read, so a requirement stated only
  there is not reported. The "manifest holding an unconstrained dependency is cited first" change
  applies under library norms only; application norms keep their citation unchanged.
- **#520, a withheld lockfile is present.** The public-board before/after found that fastapi's
  `uv.lock` is committed but withheld by the file walk (over the 512,000-byte content limit). A
  withheld lockfile now counts as present for this note and for v27's `lockfile_coverage`, and the
  sentence says "the scanned inventory holds no recognized lockfile" rather than "none is
  committed". Fixture `a4-uv-locked-lockfile-too-large` pins it.
- **#519, where pointers are recognised.** In `readRepoText`, the full-text read every collector
  uses, and (since the third review) in the semantic source gate's bounded prefix read when that
  read holds the whole file. Git-history blob reads do not recognise pointers.
- **#517, B2.** B2's `pr_trace_primitives` still counts a publish-only workflow as a CI workflow,
  under every rubric including v27. It is the same defect class in a criterion the issue did not
  name. Left open.
- **#442, findings withheld.** When A2 abstains on a shallow clone its warning and info findings
  are withheld with it (on the board: django loses one warning, vite one info).

- **Review.** An adversarial review of the first implementation found ten defects, listed in the
  changelog entry; the fixes narrow #517 (pull-request triggers, reusable workflows and a wider
  verification vocabulary keep a workflow counted), #518 (the share stays over v17's list; only
  top-level hooks; only .py files; no conditional pytestmark), #519 (a not-applicable result and a
  collector's critical finding are kept) and #520 (a fixed command list, per-command lockfiles,
  comments ignored, linear parsing). The `fixtures/false-assurance-fixtures.ts` entries marked
  `foundInReview` pin them.
- **Third review (2026-10-20), of the merged implementation.** It reported ten findings; eight
  reproduced and are fixed in the follow-up to #521, each pinned by a `review3-*` fixture or a
  timing guard:
  - **#520, missed claims.** `test` in the conditional-word list was matched against every word of
    a step, so a step running `npm ci` and `npm test`, and `cargo test --locked`, were never
    claimed. Conditional words are now read in command position only. CRLF workflows were not read
    at all (`.` does not match `\r`); they are now. The review described the CRLF case as a false
    claim from a job-level `if:` that is not seen; on the merged code no `run:` key was matched, so
    the effect was a miss, and the fixture pins both directions.
  - **#520, false claims.** A step or job with `continue-on-error`, a workflow that checks out
    another repository or downloads an artifact, a working directory or `cd` target this checkout
    does not hold, and a workflow command that names the lockfile (`cp ci/package-lock.json .`) each
    withhold the claim now.
  - **#520, scan time on the default rubric.** The step reader walked back through the file once
    per `run:` key and rescanned every command per requiring command. A 480 KB workflow of 24,000
    steps took 12 s under v17; 24,000 `run:` keys outside a list took 20 s. The reader is linear
    (about 0.25 s for each); `scan-path-regex-bounds.test.ts` kills the previous implementation.
  - **#520, citation order.** The primary manifest stays first whenever it holds an unconstrained
    dependency itself.
  - **#518.** Where `conftest.py` files are the only test-shaped files, v27 cites them as pytest
    configuration and measures A1 at a test ratio of 0; before, A1 could lose its only evidence and
    stop being scored, a path by which the composite could rise. A `conftest.py` is never credited
    as a live test under v27, so a suite a hook skips credits 0 rather than 1 of 3. A hook that
    empties `items` and refills it (`items.clear()` then `items.extend(ordered)`) is a reorder,
    not a removal.
  - **#519.** The bounded prefix read discloses a pointer as `readRepoText` does.
  - Not fixed: repeated reads of the same files within one scan (efficiency only; tracked as a
    `later:` issue).

## v17 to v27 on the fixtures

Generated from `report.json`; every row either does not move or moves down.

| Row | Verdict | Overall | Code | Process | Criteria that moved, v17 → v27 |
|---|---|---|---|---|---|
| a1-conftest-is-the-only-test-directory-file | unverified | 1.2 → 1.1 | 1.1 → 0.9 | 1.3 | A1 critical 1.1 → critical 0.5 |
| a1-js-suite | at_risk | 1.9 | 2.5 | 1.3 | no move |
| a1-js-suite-as-lfs-pointers | at_risk → unverified | 1.8 → 1.4 | 2.2 → 1.4 | 1.3 | A1 critical 1.5 → insufficient_data 0 |
| a1-pytest-fixture-conftest | unverified | 1.4 | 1.5 | 1.3 | A1 metric only (test_to_source_ratio 3→2; score unchanged) |
| a1-pytest-hook-skips-every-test | unverified | 1.4 → 1.3 | 1.5 → 1.3 | 1.3 | A1 verified 2.3 → critical 1.7 |
| a1-pytest-hook-skips-slow-only | unverified | 1.4 | 1.5 | 1.3 | A1 metric only (test_to_source_ratio 3→2; score unchanged) |
| a1-pytest-suite | unverified | 1.4 | 1.5 | 1.3 | no move |
| a1-pytestmark-skip-every-module | unverified | 1.4 → 1.3 | 1.5 → 1.3 | 1.3 | A1 verified 2.3 → critical 1.7 |
| a4-library-no-lockfile-not-required | unverified | 1.4 | 1.5 | 1.3 | no move |
| a4-root-manifest-pinned | at_risk | 1.9 | 2.5 | 1.3 | no move |
| a4-root-manifest-unconstrained | at_risk | 1.7 | 2 | 1.3 | no move |
| a4-uv-locked-lockfile-deleted | unverified | 1.4 | 1.5 → 1.4 | 1.3 | A4 critical 0.5 → critical 0.3 |
| a4-uv-locked-lockfile-too-large | unverified | 1.4 | 1.5 | 1.3 | no move |
| a4-uv-locked-with-lockfile | at_risk | 1.6 | 1.8 | 1.3 | no move |
| b3-npm-publish-gated | at_risk | 2.3 | 2.5 | 2.1 | no move |
| b3-npm-publish-ungated | conditional → at_risk | 2.5 → 2.3 | 2.5 | 2.4 → 2.1 | B3 verified 1.6 → verified 1 |
| b3-pypi-publish-gated | at_risk | 1.8 | 1.5 | 2.1 | no move |
| b3-pypi-publish-ungated | at_risk | 2 → 1.8 | 1.5 | 2.4 → 2.1 | B3 verified 1.6 → verified 1 |
| b3-test-then-publish-workflow | conditional → at_risk | 2.5 → 2.3 | 2.5 → 2.1 | 2.4 | A4 warning 2.8 → warning 2.1 |
| history-full-clone | at_risk | 1.8 | 2 | 1.5 | no move |
| history-shallow-clone | at_risk → unverified | 1.7 → 0.8 | 2 → 1 | 1.3 → 0.5 | A2 verified 4 → insufficient_data 0; B2 warning 1.6 → insufficient_data 0 |
| history-shallow-clone-with-committed-secret | unverified | 1.3 → 0.9 | 1.3 | 1.3 → 0.5 | B2 warning 1.6 → insufficient_data 0 |
| review-a1-conditional-pytestmark | unverified | 1.4 | 1.5 | 1.3 | no move |
| review-a1-hook-defined-under-try | unverified | 1.4 | 1.5 | 1.3 | A1 metric only (test_to_source_ratio 3→2; score unchanged) |
| review-a1-name-shaped-conftest-rated-hollow | at_risk | 1.7 | 1.5 | 1.8 | A1 metric only (test_to_source_ratio 2→1; score unchanged) |
| review-a1-root-conftest-beside-vitest | at_risk | 2 → 1.9 | 2.3 → 2.1 | 1.6 | A1 verified 2.3 → warning 1.9 |
| review-a2-lfs-data-in-not-applicable-library | unverified | 1.4 → 1.2 | 1.5 → 1.1 | 1.3 | A2 not_applicable 0 → insufficient_data 0 |
| review-a2-secret-beside-planted-lfs-pointer | unverified | 1.4 → 1.2 | 1.4 | 1.3 → 0.9 | B6 not_applicable 0 → insufficient_data 0 |
| review-a4-bun-lock-committed | at_risk | 1.7 | 2.3 | 1.1 | no move |
| review-a4-cargo-install-locked | at_risk | 1.7 | 2.1 | 1.3 | no move |
| review-a4-npm-ci-in-trailing-comment | at_risk | 2.1 | 2.5 | 1.6 | no move |
| review-b3-tox-ci-with-tag-publish | unverified | 1.3 | 1.5 | 1.1 | no move |
| review2-a3-service-entrypoint-as-lfs-pointer | unverified | 0.7 → 0 | 1.4 → 0 | 0 | A2 not_applicable 0 → insufficient_data 0; A3 not_applicable 0 → insufficient_data 0; A4 warning 2.8 → insufficient_data 0 |
| review2-a4-lockfile-generated-first | at_risk | 2.1 | 2.5 | 1.6 | no move |
| review2-a4-npm-ci-guarded-by-if | at_risk | 2.1 | 2.5 | 1.6 | no move |
| review2-a4-npm-ci-guarded-by-test-and-or | at_risk | 2.1 | 2.5 | 1.6 | no move |
| review2-a4-npm-ci-in-disabled-job | at_risk | 2.1 | 2.5 | 1.6 | no move |
| review2-a4-npm-ci-in-echo-and-heredoc | at_risk | 2.1 | 2.5 | 1.6 | no move |

The public-board table is in `leaderboard/RUBRIC_CHANGELOG.md` (2026-10-19).

## Promotion: two options for the operator

Promotion is the operator's ruling. The standing policy (`src/witan/rubric-version.ts`,
"Calibration-claim policy") is that promotion to the public default "requires a fresh authenticated
untouched holdout and a separately recorded default decision". v27 was built so that either option
below is open.

**Option 1: a declared correctness-only promotion rule, no new holdout.** Amend the policy to say:
a prospective version may become the default without a holdout when (a) every difference from the
current default is a documented false-assurance removal, each with a public regression fixture;
(b) a measured before/after on the behaviour corpus, the calibration anchors, the regression
fixtures and the public board shows no score, status or composite rising; and (c) the change is
recorded in `leaderboard/RUBRIC_CHANGELOG.md` with that table. v27 meets (a)-(c) as of this
change.

- What a v27 certificate could then say: it was scored under the default rubric, which is the
  calibrated v17 minus the listed assurances; on the recorded sets no result rose against v17.
- What it could not say: v17's holdout precision or recall does not transfer. Removing assertions
  changes which repositories carry each status, so no precision or recall figure applies to v27
  until one is measured.
- Consequences to plan for: the public board fetches depth-1 clones, so under v27 B2 abstains on
  every scored row and A2 on eight. The board would need full-history clones, or would stay
  pinned to v17. Every `--min-score` gate built on v17 composites would see lower scores, so a
  default change needs a release note and the `--rubric-pin witan-rubric-v17-2026-07-24` escape
  hatch named in it.

**Option 2: leave v27 prospective.** No policy change. The default stays v17, now with the
presentation fixes (the LFS pointer count and label, the A4 note and citation) beside the existing
shallow-clone disclosure. v27 stays available through `--rubric-pin` with the prospective notice.

- What the default certificate keeps saying: everything v17 says now, including the five
  assurances these issues identify. The presentation fixes tell a reader where two of them do not
  hold (LFS content, a lockfile the repository's own CI requires) without changing the score.
- What a v27 certificate says: nothing beyond its own evidence. No calibration claim, as for v18-v26.
- Given the direction to stop new holdouts, under this option v27 may never become the default.
