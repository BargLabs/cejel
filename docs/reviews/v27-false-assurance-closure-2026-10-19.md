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
    steps took 12 s under v17; 24,000 `run:` keys outside a list took 20 s. The reader became linear
    in its number of steps (about 0.25 s for each); `scan-path-regex-bounds.test.ts` kills the
    previous implementation. *Note added 2026-10-21:* it was still depth × size on nested steps,
    and that was fixed in #548.
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

*Note added 2026-10-21 (#542), with the text above left as written.* Two statements in Option 1 no
longer hold:
- **"v27 meets (a)-(c) as of this change".** The ruling below supersedes it: the third review (#533)
  reproduced eight defects after it was written, and the no-rise property is shown on curated
  fixtures only (#531).
- **"The public board fetches depth-1 clones".** That is wrong. The board has been scored on
  full-history clones since the 0.6.3 regeneration (`leaderboard/RUBRIC_CHANGELOG.md`, 2026-10-11;
  #431, #452, #455). The v27 board table measured depth-1 checkouts, not the board's method.

**Option 2: leave v27 prospective.** No policy change. The default stays v17, now with the
presentation fixes (the LFS pointer count and label, the A4 note and citation) beside the existing
shallow-clone disclosure. v27 stays available through `--rubric-pin` with the prospective notice.

- What the default certificate keeps saying: everything v17 says now, including the five
  assurances these issues identify. The presentation fixes tell a reader where two of them do not
  hold (LFS content, a lockfile the repository's own CI requires) without changing the score.
- What a v27 certificate says: nothing beyond its own evidence. No calibration claim, as for v18-v26.
- Given the direction to stop new holdouts, under this option v27 may never become the default.

## Ruling (2026-10-21)

**Author:** an AI agent (Claude Opus 5.5, Claude Code), at the operator's request on 2026-10-21, in
#542. Promotion is the operator's decision (above). This ruling is a recommendation and becomes the
operative position only when the operator accepts it, by merging #542 or closing #526 with
acceptance. It replaces the 2026-10-19 ruling on #526
([comment 6273920491](https://github.com/BargLabs/cejel/issues/526#issuecomment-6273920491)) and that
ruling's correction
([comment 6279919423](https://github.com/BargLabs/cejel/issues/526#issuecomment-6279919423)). It was
revised after two recorded review passes on #542.

Disclosure: I did not build v27, and I did not run any of its three reviews. I wrote #540, which
changes certificate wording under every rubric, v27 included. I am the same kind of agent (the same
model family) as v27's author and reviewers.

**Ruling.** v27 is not promoted. The default stays `witan-rubric-v17-2026-07-24`, and the
calibration-claim policy in `src/witan/rubric-version.ts` is unchanged.

v27 may reach the default by the correctness-only route (Option 1 plus part 3 of the rule below, independent review). The
reason is the operator's direction that no new holdout will run (Option 2 above). That direction is
not recorded in this repository, and the operator confirms it on accepting this ruling. Under the
current policy, a rubric that needs a holdout would never be promoted. Until every condition below
holds, Option 2 applies.

**The rule.** This is the four-part rule from the 2026-10-19 ruling, word for word. Parts 1, 2 and 4 are
Option 1's (a)-(c); part 3, independent review, is new.

> A prospective version may become the default without a holdout only when all of the following
> hold:
> 1. Every difference from the current default is a documented removal of an assertion the tool did
>    not read or misread, and each has a public regression fixture.
> 2. A measured before/after shows no score, status or composite rising, on the behaviour corpus, the
>    calibration anchors, the regression fixtures and the public board.
> 3. An independent adversarial review, not by the author, found no rise.
> 4. The rubric changelog carries the tables.
>
> The resulting default carries no calibration claim of its own.

All four parts become standing requirements for any later correctness-only promotion, together with
conditions 2 and 4 below.

**Why not now.** The facts below are as of `origin/main` `1d0d4388d`.

- **v27 has not shipped.** It is listed under Unreleased in `CHANGELOG.md`, and `v0.6.7` is the
  latest release. The soak that the 2026-10-19 ruling required has not started.
- **Parts 1 and 2 are not established yet.**
  - The no-rise test runs over the curated fixtures only (#531). For criteria that become
    `insufficient_data`, it skips the status comparison and never checks that the abstention is a
    read failure. It also skips null composites. The one rise found so far was outside the curated
    set.
  - The three reviews reproduced 10, 8 and 8 defects. No review has run since #533.
- **v27 keeps at least two false assurances of the class #517 removes**, CI credit for a workflow
  that runs no check:
  - B2 credits a publish-only workflow as CI (#527), while v27 already removes that credit from B3.
  - B3's PR-gate count credits a workflow whose steps only print, and one whose triggers are
    confined to a branch that does not exist (#535).

  A rubric promoted as "v17 with five false assurances removed" should not keep known ones of the
  same class.
- **No v27 board has run on the board's own method.** The board has used full-history clones since
  the 0.6.3 regeneration (2026-10-11). The v27 board table in `leaderboard/RUBRIC_CHANGELOG.md`
  (2026-10-19) was measured on depth-1 checkouts, so it does not show what v27 would publish.
- **Work of this kind needs an independent review before anyone trusts it.** The review of #540
  found three defects in code written to remove false assurance. Two were false statements, and one
  crashed the scan:
  - "runs only on master" for a workflow that also runs on a schedule;
  - "no master branch" read from a depth-1 clone;
  - a label long enough to crash the scan.
- **ADR-0001 has not been applied to v27's shallow-clone abstentions.** ADR-0001 (Accepted) endorses
  the mechanism v27 uses: "Read-failure abstentions retain the full denominator with a conservative
  zero contribution." But its Context treats a read failure as "rare and accidental", while a
  systematic coverage limit falls under "Coverage never discounts a score". v27's shallow-clone
  abstentions are systematic: on a depth-1 checkout, which is the `actions/checkout` default, the
  composite falls wherever v17 scored B2 or A2. Whether such an abstention is a read failure under
  ADR-0001 or a coverage discount is the operator's call, not this ruling's.

**Conditions, all required before the default changes.** "The candidate" means one v27 behaviour,
identified by its `rubricBehaviourFingerprint` at a named commit.

1. The candidate ships prospective in a tagged release.
2. #531 is done for the candidate. Its items (a)-(c) pass: abstentions are checked to be read
   failures, null composites are compared, and generated repository shapes are covered.
3. #527 and #535 are fixed in v27 before the candidate is pinned. B2 and B3 stop crediting workflows
   that run no check.
4. An independent adversarial review of the candidate reproduces no defect that makes a false
   assertion or raises a score. It covers the full v17-to-v27 scoring diff at the candidate's
   commit.
   - The reviewer is a human where one is available. A reviewer is not independent if they wrote
     any v27 commit or belong to the session or task that produced one.
   - The review records the fields `docs/review-policy.md` requires and, in addition, any
     model-family overlap with v27's authors.
   - If the review finds such a defect, it is fixed, the fix makes a new candidate, and the gate is
     the next review, not the fix.
5. A v27 shadow board, on the board's full-history method, is published beside v17 for at least one
   release, with the A2 and B2 abstention counts recorded.
6. The operator records whether a shallow-clone abstention kept at 0 in the composite conforms to
   ADR-0001, or amends ADR-0001, or writes a new ADR. This ruling does not decide that question.

Any later change to v27's scoring makes a new candidate and resets conditions 1, 2, 4 and 5.

**The release PR that changes the default** carries all of the following:

- **The evidence record:** a dated record, in this file or an ADR, written at the release PR's head.
  For each part of the rule and each condition, it cites the evidence that the candidate meets it.
  The PR also shows that the default it sets has the candidate's fingerprint. The operator's
  decision is entered in that record. Approving the PR is not the record.
- **The policy amendment:** the rule above, in `src/witan/rubric-version.ts`,
  `docs/format-stability.md` and the README. `WITAN_LAST_CALIBRATED_RUBRIC_VERSION` stays
  `witan-rubric-v17-2026-07-24`.
- **The release note:**
  - composites fall;
  - on depth-1 checkouts B2 abstains, and A2 does too unless a confirmed critical secret finding
    stands or A2 is not applicable, so use `fetch-depth: 0`;
  - `--min-score` gates may start failing;
  - `--rubric-pin witan-rubric-v17-2026-07-24` keeps the old behaviour.
- **Wording on every user-facing surface:** the certificate, CLI help (`src/index.ts`, the
  `--rubric-pin` text), certificate prose (`src/witan/certificate-presentation.ts`), the README, the
  leaderboard and the site.
  - Nothing calls the new default calibrated.
  - Default certificates state that they carry no calibration claim, and that v17's holdout results
    do not carry over to v27.

**What this ruling does not do.** It changes no code, policy text or default, and it is not a
release. It does not promise that v27 will become the default.

## Addition (2026-10-22): #527 and #535 in v27, a new candidate

*Added 2026-10-22 by an AI agent (Claude Opus 5.5, Claude Code), at the coordinator's request, for
condition 3 of the ruling above. The text above is left as written.*

**What changed.** Under v27 only, B2 and B3 decide credit for a CI workflow with one predicate. A
workflow that only publishes (`isPublishOnlyWorkflow`, #553's upload-only rule) or whose every step
only checks out and prints (`isPrintOnlyWorkflow`, #540's reader) is not credited:
- B2's `pr_trace_primitives` loses that workflow's CI component (#527);
- B3's `ci_script_depth` and `default_branch_ci_depth` do not count it (#535, the no-check half).

A reader admits a workflow only when every line of its jobs section fits its grammar, every job's
`runs-on` names a GitHub-hosted Ubuntu or macOS runner (bash, #564), and every step is on its
allowlist. Anything else keeps the credit. The certificate names uncredited workflows under "What was
not established", and no sentence says that a workflow runs no check. v17's scores and fingerprint
are unchanged. Its only change is that the #540 disclosure no longer misnames pwsh or self-hosted
workflows as print-only (#564). v18-v26 rest on gating and their unchanged fingerprints. The
measured tables are in `leaderboard/RUBRIC_CHANGELOG.md` (2026-10-22):
- 15 fixture rows score below v17 and none above;
- no public row moves;
- v27's fingerprint moves from `sha256:fb4edfa0…` to
  `sha256:6e03aa1bf63a31c5ec58a68cb49fb8ef571ba233cf79059a311ec55aecea5bb3`.

**This is a new candidate.** The ruling's last condition paragraph applies: "Any later change to
v27's scoring makes a new candidate and resets conditions 1, 2, 4 and 5." The candidate is the fingerprint
above plus #562's merge commit, which is recorded after merge (#563). Conditions 1, 2, 4 and 5 are
reset for it. #562 moves neither `b3-master-target-*` surface pin. PR #560 touches the same records;
whichever of the two lands second reconciles them. A release carrying an earlier v27 fingerprint does not count
toward condition 1 for this one.

**Condition 3 is met by the no-check half. The operator ruled the branch half out of it on
2026-10-22.** #535 also names a workflow confined to a branch the repository does not have. That
half is not changed. Fixture `b3-master-confined-workflow-on-main-still-counted` pins the behaviour
the operator ruled on.

**The operator's decision.** The operator's words, relayed on #526
([comment](https://github.com/BargLabs/cejel/issues/526#issuecomment-6336750983)) and #535 ([comment](https://github.com/BargLabs/cejel/issues/535#issuecomment-6336751428)), were "yes to both recommendations". The
recommendation on this point was to rule the branch half out of condition 3. The other options were
declined: binding the default branch in the report, and dropping all branch-filtered credit. The
optional ref-free disclosure offered with the recommendation was not separately approved and is not
added. #535's comment records that the question can be revisited if the default branch is ever bound
in the report and attestation (a format change).

**The reasoning offered for that recommendation** (the author's, not the operator's). Deciding the
branch half needs the default branch or the branch list, which is ref state. The attestation's only
repository revision is `repo.headSha` (`src/witan/attestation.ts`), and ref state is not a function
of it. Reading `origin/HEAD` offline, as #535 suggested, has one of two outcomes:
- the same commit scores differently with different refs, unless the value is bound in the report;
- abstaining when the value cannot be read removes credit on most checkouts.

#540 already removed a sentence read from refs because `cejel issue` then refused honest
reproductions of the same commit. No rule decidable from the commit's tree was found that removes
only false credit. Two candidates were measured on the 23 public rows, under v27:
- **Credit only workflows with an unfiltered pull-request trigger.** 16 rows' PR-gate counts move
  and 8 composites fall. It drops every `branches: [main]` gate, which is usually correct.
- **Drop a workflow whose filters name `master` and not `main`.** 3 rows move (fastapi, express,
  guava), and all three repositories' default branch is `master`. Every removal would be a false
  assertion.
