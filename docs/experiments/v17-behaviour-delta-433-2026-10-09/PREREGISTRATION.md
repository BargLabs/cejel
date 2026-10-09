# Preregistration — v17 behaviour delta for #433 (v0.6.2 → #441's merge commit)

This file was written and committed **before either arm was scored**. It is pushed as its own
commit, ahead of the harness, so the ordering can be checked in git history. The result commit
must have this commit as a strict ancestor (`docs/standing-constraints.md`, Guard 5). This file
is not edited after the run; corrections go in an erratum beside it.

Every expected value below was derived from code and from the published board reports. No corpus
repository was cloned, checked out, read or scanned to write it, and neither arm was run, not even
on one row.

## Arms

- **Baseline:** tag `v0.6.2`, commit `7c9170f653fc5a2cd3e3f06d45b9fa3fe6e013a8` (tag object
  `b44f395fd90cb52ca4e730e20d125f5dea5d24e9`). This is the current release.
- **Candidate:** #441's merge commit on `main`, `3c6d16137b48e9a9c4a78bd65dc4005d4276bd95`.
  `gh pr view 441 --repo BargLabs/cejel --json state,mergeCommit` returned `MERGED` with this
  `mergeCommit` on 2026-10-09.

`package.json` and `pnpm-lock.yaml` are byte-identical between the arms. Outside `src/witan` and
`docs/`, the arms differ only in `CHANGELOG.md`, `leaderboard/RUBRIC_CHANGELOG.md`, `plugins/cejel/README.md`
and `src/__tests__/index.test.ts`.

**Corpus:** all 24 rows of `leaderboard/corpus.json`. The file is blob
`d563653c6f1d7ee733693c0e9612fa52c323b162` at both arms and at this commit. That blob is the one
the v19 B4 and v23 A2 records list with SHA-256
`dc723f53a201542e0febb98964093ba4a3e7173221e746ba56aab6f726400d00`, so the file **equals**
`dc723f53…`. This was derived from blob identity. No digest tool is available on the runner that
wrote this file, so the SHA-256 was not recomputed here. `harness/RUN.md` has the operator
recompute it before scoring.

**Scoring:** both arms run from source with the calibrated default `witan-rubric-v17-2026-07-24`,
the fixed `generatedAt` `2026-09-15T00:00:00.000Z` (the same value as the 0.4.9 and 0.4.11 runs),
on one machine.

**Checkouts:** the 0.4.9 and 0.4.11 protocols fetched each public row `--depth=1` at its pin. The
record is `../v17-behaviour-delta-0.4.9-2026-09-15/harness/prepare-checkouts.sh`, and the corpus
manifest calls them blobless. That script fetches with `--depth=1` and **no** `--filter`. The goal
card describing this run calls the checkouts "blob-filtered", which does not match the recorded
command. This run follows the recorded command. A blob filter would not change the checked-out tree
or the single commit. The private row is checked out at the commit the 0.4.11 run used. The operator
holds that commit, and it is not named here.

**Measurement limit:** the public rows are depth-1, so history-reading signals (A2's history scan
and B2's `pr_merge_ratio`) see one commit in both arms. Both arms are at or after v0.6.2, so both
attach `historyLimitations` to every shallow row (#428, display-only, attached after scoring), and
they attach it identically.

## Every score-capable change between the arms

`git log 7c9170f..3c6d161 -- src/witan` lists four commits. Excluding tests and fixtures, they
change two files:

| Commit | Non-test files | Effect |
|---|---|---|
| `faf2751` | `src/witan/repo-signals.ts` | the #433 detector changes (parts 1 to 5 below) |
| `40b2173` | `src/witan/repo-signals.ts` | the B6 evidence label split (part 6), worded under the 300-character schema cap |
| `5dbbc4e` | `src/witan/repo-signals.ts`, `src/witan/rubric-fingerprint.ts` | re-pinned behaviour fingerprints. No detector logic. |
| `ea567fe` | none (test only) | none |

These are exactly #441's six parts, as `leaderboard/RUBRIC_CHANGELOG.md` (2026-10-09) lists them.
No other score-capable change lies between the arms. None of the six is gated on rubric version.

1. **B6 `fail_closed_privilege_check` and `kill_switch_fail_safe_present`. Direction: down.**
   Implementation evidence no longer comes from a test, fixture or `calibration/` path, or from a
   match that lies only inside a comment.
2. **A3 `prod_readiness_primitives`, error-boundary filename. Direction: down.** The filename is
   anchored to a path segment, and a `calibration/` path no longer counts. Under v17,
   `useV27Detectors` receives `usesV8Detectors` (`repo-signals.ts`, the `collectRepoSignals` call),
   which is true. Test, generated and vendor paths were therefore already excluded, so the only new
   path exclusion here is `calibration/`.
3. **A3 Express error-handler content check. Direction: down.** The handler shape must lie outside
   comments, and block comments are now stripped for both halves.
4. **B6 `human_gate_documented` and the documented-policy branch of `protected_path_review_gate`.
   Direction: down.** No credit from changelogs, experiment, calibration, review-note or `reports/`
   trees, test or fixture trees, or a committed Cejel Markdown certificate.
5. **CODEOWNERS location, B6 `protected_path_review_gate` and B2 `pr_trace_primitives`.
   Direction: down.** Only the root, `.github/CODEOWNERS` or `docs/CODEOWNERS` count.
6. **B6 protected-path evidence label. No score effect.** The label names the branch that fired.
   Also unconditional, and also with no score effect: the `protected_path_review_gate` metric's
   `description` text changed.

Every part removes a credit, so no metric can rise. A criterion can still leave the composite
denominator. B6 with no evidence and no finding returns `not_applicable`, and B2 with no evidence
returns no signal, which the #441 entry records as insufficient data. **So an overall score can move in either direction**, as the #441 entry
explains.

## How the predictions read the published reports

The published board reports are the JSON files under `leaderboard/reports/` in cejel-site. They
were last changed in `026774b25ed77c692392ee85c4d626b499780823` (2026-09-16, "site: prepare 0.4.9
board and release disclosures") and carry `toolVersion` `0.4.9`. The GitHub compare API shows no
report JSON changed between that commit and `13e3f643b8dedf50db1a1eaa845af1c6a2eeb589` (the
reviewer's inventory commit), or between that and the site's `main`,
`7676f75432bdc0539edb8a649baa28d4c834c381`. The only later change to that directory, `60c6996`,
touches HTML files only. This repository has no copy of the reports under `leaderboard/`, so the
23 public reports were read from a local site checkout at `7676f75`. The private row's report was
not read.

**The reviewer's evidence inventory matches the reports exactly.** Across the 23 public reports, the
only B2 review-gate, B6 or A3 error-boundary citations are these:

- cejel: B6 human gate, from a committed Cejel certificate of another corpus row under
  `leaderboard/reports/`.
- cejel: B6 fail-closed check, from `src/witan/__tests__/repo-signals.test.ts`.
- sinatra: B2 and B6, from `.github/workflows/CODEOWNERS`.
- axios, biomejs, fmt, requests and scorecard: B2 and B6, from `.github/CODEOWNERS`.
- vite: A3 error boundary, from `packages/vite/src/node/server/middlewares/error.ts`.

No public report cites a kill switch. B6 is scored on exactly seven public rows: axios, biomejs,
cejel, fmt, requests, scorecard and sinatra.

**Two code facts that the predictions rely on:**

- `repoFiles` is a JS `sort()` of the tracked paths (`listRepoFiles`). Each credit takes the
  **first** match in that order (`find`). A cited file is therefore also a record that every file
  sorting before it failed the baseline predicate. The candidate's predicates are strictly
  narrower, so those files fail again. When a cited file is removed, a replacement can only be a
  file that sorts **after** it, and the baseline never read those files for that credit.
- `codeownersFile ?? reviewGateDoc`: B6 evaluates the documented-policy fallback on every run but
  cites it only when there is no CODEOWNERS file. A report cannot show whether that fallback would
  match.

## Expected values

**E0: completion.** 24 of 24 rows complete in both arms, with 0 errors.

### Expected value 1: the baseline against the published board

**The record, checked rather than carried forward.** The published board was generated by 0.4.9.
These are the v17 score-capable changes between 0.4.9 and `v0.6.2`, from
`git log v0.4.9..v0.6.2 -- src/witan` (non-test) and the RUBRIC_CHANGELOG and CHANGELOG entries:

- **v0.4.9 → v0.4.10:** no scorer source changed (recorded in the 0.4.11 entry).
- **v0.4.10 → 0.4.11 (`5ae73b2`):** #336 (A2 database-URL userinfo, down), #352 (A3 idioms, up),
  and #352/#358 (commented-out `.use(`, down). All three are score-capable. The 0.4.11 record
  (`../v17-behaviour-delta-post-0.4.10-2026-09-23/`) measured the baseline reproducing the board
  on 24 of 24 rows, and 0 rows moving under these three changes. This is the record the 0.4.11
  entry failed to check: it predicted 20 of 24 from the 0.4.9 entry.
- **`5ae73b2` → `v0.6.2`:** none is score-capable under v17. Each change was read in the diff:
  - `41c930f`, `d1f58a6`: A2 content-context, gated on `WITAN_RUBRIC_VERSION_V24` alone. Every new
    parameter defaults to off.
  - `8ec3531`, `f25c5de`, `c5ce0f9`: V24 added to the v22 allowlists, and the fingerprints
    re-pinned. The v17 fingerprint constant moved `ff0f01ab…` → `eabdc784…`. That is a report
    field, not a score, and the board check does not compare it.
  - `8f66a41` (#369/#388): HTTP MCP statelessness, and the `--min-score` exit code on thin coverage.
    It adds `computeApplicableMeasuredCoverage` and leaves `computeMeasuredCoverage` unchanged.
  - `4a77d1d` (#370/#389): the `appliedWeightShare` report field, computed from the same
    denominator. The board check compares metric `value` only.
  - `afd9dcf` (#415): certificate text and layout only.
  - `f6766d1` (#428/#432): `historyLimitations`, attached after scoring.
  - #401 (GitLab export), #414/#419 (D-series subpath) and MCP registration: outside the scan path.

**E1: the baseline reproduces the published board at scoring level on 24 of 24 rows.** "Scoring
level" means headline, criterion score and status, and metric value (`compare.mjs`). This assumes
the private row is checked out at the same commit as in 0.4.11.

### Expected value 2: candidate against baseline, per row

Overall and category scores below use the scoring code: a category is the rounded mean of its
measured criteria, and overall is the rounded mean of the two categories. That arithmetic
reproduces every published headline used here (cejel 2.3 / 3.2 / 2.8, sinatra 2.0 / 2.8 / 2.4).

**Rows that do not move (21 public rows):** react, vue, svelte, django, flask, fastapi, express,
vite, esbuild, biomejs, requests, pydantic, axios, zod, scorecard, ripgrep, guava, cobra,
automapper, fmt and carddemo. No headline, criterion score or status, or metric value changes.
The reasons:

- **axios, biomejs, fmt, requests, scorecard:** their CODEOWNERS file is at `.github/CODEOWNERS`,
  which the candidate still credits. Under both arms it is the first match, so B2 and B6 cite the
  same file. Only the B6 evidence label and the metric description text change (E5).
- **vite:** `packages/vite/src/node/server/middlewares/error.ts` matches the anchored filename rule
  and is not under `calibration/`. A3 is unchanged, and the content check still never runs.
- **The other 15:** none cites a credit of any #433 shape. Each part only removes credits, and the
  candidate's file sets are subsets of the baseline's. No new credit can appear. An existing
  uncited credit would have had to be cited, and none is.

**cejel: moves. B6 down or not applicable. B2 and A3 do not move.**

- **`human_gate_documented` falls 1 → 0** (expected). The cited certificate lies under a
  `reports/` directory and is a Cejel certificate, so it is removed twice over. A replacement would
  have to be a policy-shaped `.md`/`.mdx` file that sorts after the cited path, is outside every
  excluded tree and is not a certificate. It would also have to match the human-gate marker. The
  reports do not show whether one exists, so this is **conditional**.
- **`fail_closed_privilege_check` falls 1 → 0** (expected). The cited file is a test, which is
  removed. A replacement would be a non-test, non-calibration implementation file that sorts after
  `src/witan/__tests__/repo-signals.test.ts` and matches both `GATED_PRIVILEGE_CHECK_PATTERN` and
  `SET_ROLE_PATTERN` outside comments. That range includes the detector's own non-test sources,
  whose string contents at the pin were not read. This is the least certain prediction here and is
  **conditional**.
- `privilege_escalation_cleanliness` and `protected_path_review_gate` do not move (1 and 0). cejel
  has no CODEOWNERS file in any location.
- The four reachable outcomes (B6 / process / overall / verdict):

  | human gate | fail-closed | B6 | process | overall | verdict |
  |---|---|---|---|---|---|
  | lost | lost (**expected**) | not applicable | 3.2 (unchanged) | 2.8 (unchanged) | conditional |
  | kept | lost | 2.3 | 2.9 | 2.6 | conditional |
  | lost | kept | 2.0 | 2.8 | 2.5 or 2.6 (2.55 rounded in floating point) | conditional |
  | kept | kept | 3.3 (evidence path changes) | 3.2 | 2.8 | conditional |

  In the expected case, the overall score does not move even though B6 does. That is the
  denominator effect: the removed 3.3 is close to the mean of the process criteria that remain.
  Process coverage falls from 3/6 to 2/6. Placement is `transparency` in every case, because the
  harness never ranks a publisher-owned row.

**sinatra: moves. B6 becomes not applicable (expected). B2 changes metric value, not score.**

- **B2:** `.github/workflows/CODEOWNERS` no longer counts. `pr_trace_primitives` falls **3 → 2**
  (CI workflow 2, PR template 0, review-gate record 1 → 0). The metric saturates at max 2, so the
  **B2 score stays 4.0** and its status stays `verified`. `pr_merge_ratio` is unchanged. This is
  conditional on no name-shaped (`branch…protection`, `review…gate`) or GitHub-location CODEOWNERS
  path sorting after `.github/workflows/CODEOWNERS`.
- **B6 becomes `not_applicable`** (expected). B6's only evidence was that CODEOWNERS file, and its
  metrics show no privileged-operation surface (cleanliness 0.4 and review gate 0.6 weights). This
  is conditional on two things the reports cannot show. First, no root or `docs/` CODEOWNERS (these
  sort after `.github/…`; `.github/CODEOWNERS` sorts before the cited path, so it does not exist).
  Second, no policy document matching `required review|branch protection|protected branch`: that
  is the uncited `reviewGateDoc` fallback. If either exists, B6 stays 4.0 and only its evidence
  changes.
- In the expected case, process goes 2.8 → **2.4**, overall 2.4 → **2.2** (down), the verdict stays
  `at_risk`, and process coverage goes 4/6 → 3/6. Placement stays `unranked`: code coverage is 2/5,
  below one half, in both arms.

**The private row:** not predictable from public evidence.

**Credits the published reports do not cite.** The predictions above are conditional on these:

1. sinatra's B6 documented-policy fallback (`reviewGateDoc`), which is evaluated but not cited
   when a CODEOWNERS file wins.
2. Replacement files that sort after a removed citation: the cejel human gate, the cejel
   fail-closed check, and the sinatra B2 review-gate record and B6 CODEOWNERS.
3. Whether a match lies inside a comment. A report cites a file, not the matching text. This
   matters only for the cejel fail-closed replacement in item 2. No other cited implementation
   credit is in play.

`executableFiles` (B6's SQL-execution surface, also uncited) feeds only the weights, and it is the
same in both arms. It cannot move any row above.

**E2 summary:** exactly two public rows move at scoring level: cejel (criteria: B6) and sinatra
(criteria: B6; metric: B2 `pr_trace_primitives`). In the expected case, two public headlines move:
sinatra's overall and process scores. cejel's headline does not move. The private row is not
predicted.

### Expected value 3: board placement

**No ranked placement changes.** The only public rows expected to move are cejel, which is never
ranked (`transparency`), and sinatra, which is `unranked` in both arms. No ranked row's comparable
score moves, so no rank changes. The harness never ranks a publisher-owned row
(`PUBLISHER_OWNED`), so the private row's unpredicted outcome cannot change a ranked placement
either.

### Expected value 4: the behaviour fingerprint

`rubricBehaviourFingerprint` **differs between the arms on 24 of 24 rows**. It is
`sha256:eabdc78425373baf23f50c23b0b025bae4116461f3bc5ddc7d5b8496df03f653` in every baseline report
and `sha256:2da86acf64c39d2edb7824df46250ea23c396264266a2cd925953e9c6ad25858` in every candidate
report. This is the pin #441 moved, and it is a constant per rubric, so the row does not matter.
Unlike 0.4.11, the fingerprint sees this change.

### Expected value 5: byte level

**0 of 24 reports are byte-identical** (E4 alone guarantees this). These are the only fields that
can differ between the arms:

1. `rubricBehaviourFingerprint`: all 24 rows.
2. B6 `metrics[protected_path_review_gate].description`: every row where B6 is scored in both
   arms. In the expected case these are axios, biomejs, fmt, requests and scorecard; cejel and
   sinatra fall under item 4. For the private row, it depends on its B6.
3. B6 evidence `label` for the protected-path pointer:
   `CODEOWNERS/required-review gate on protected paths` →
   `CODEOWNERS file in a location GitHub reads (protected-path review gate)` on axios, biomejs,
   fmt, requests and scorecard. On sinatra it becomes
   `Documented required-review/branch-protection policy` only in the fallback case.
4. **On the rows that move at scoring level** (cejel, sinatra and possibly the private row): the
   `criteria` entries for A3, B2 and B6 only, plus `overallScore`, `codeTrustScore`,
   `processTrustScore` and `verdict`. On cejel in the expected case, the whole B6 entry becomes the
   not-applicable shape and the headline does not change. On sinatra it is B2 (evidence, metric
   value and components) and B6, plus `processTrustScore` and `overallScore`.
5. `withheldPaths[].signalsAdmitting` can lose `A3.prod_readiness_primitives`. The A3 content-check
   file predicate (`errorBoundaryFileReads`) gained `isImplementationEvidencePath`, and this
   disclosure shares that predicate even though v17 does not act on it. Because test and vendor
   paths were already excluded, this happens only for a withheld implementation file under a
   `calibration/` directory on a row with no filename error boundary. **Expected on 0 public rows.**
   This is not checked against the checkouts.
6. `contentReadSummary.affectedCriteria` (and the A3/B6 abstention notes): only on cejel, whose B6
   searches now read past their baseline stopping points. A read skip there would attribute to B6.
   **Expected not to happen.** cejel's published report shows no unreadable or non-regular file,
   and its one oversized file is withheld from the walk itself, so `repoFiles` never contains it.

**Everything else is byte-identical**, including `withheldPaths` membership and reasons,
`historyLimitations`, `appliedWeightShare` on unchanged metric sets, and every evidence
`contentHash`. Concretely: after `harness/compare-bytes.mjs` removes items 1 to 3 and item 5 (each
only in its predicted direction), **21 public rows are byte-identical**. On cejel and sinatra the
remaining difference is confined to item 4's fields. The private row is reported but not predicted.

## Protocol

The corpus is scored once per arm. Errors are preserved, not repaired. If an expected value fails,
the result records the failure as measured and nothing is adjusted to close the gap. If more rows
move than E2 predicts, each one is reported in full, with the metric that moved it. Raw per-row
reports are kept locally and not committed, because the private row's report is not public. The
committed record is the output of `harness/compare.mjs` (`paired-result.json`) and
`harness/compare-bytes.mjs` (`bytes-result.json`). In both, the private row appears only as
`private-row`.
