# Cejel rubric changelog

Every change to how Cejel scores a repository is recorded here, with a full before/after
delta across the published corpus — score, verdict, and rank for every repository,
"no repository moved" stated explicitly when that is the result. A rubric version bump
that ships without an entry here is a bug, not a release.

**Two controls enforce that rule, and they see different things.** The first is the
rubric-rescore-protocol regression guard in the source monorepo's test suite, which fails the
build if `WITAN_RUBRIC_VERSION` changes without a matching entry below. It is keyed on an
identifier this project's own authors control, so it cannot see a scoring change made *under an
unchanged identifier* — and that is not a hypothetical, it happened five times in 0.4.9 under the
calibrated public default (see the entry below it, and the 2026-09-16 entry that records the
miss). The second, added on 2026-09-16, does not read the identifier at all:
`src/witan/__tests__/rubric-behaviour-fingerprint.test.ts` scores a committed corpus of synthetic
repositories under every selectable rubric and fails when the measured result moves away from a
committed pin, naming the rubric and the criteria. Every fingerprint it pins is cited in this file,
so re-pinning one requires writing here.

This changelog exists because a public leaderboard that can silently re-score another
repository is not a standard, it is a rumor with a number attached — see this repository's
README, "The public leaderboard: what we redact, what we exclude, and where we were wrong"
section, which this changelog continues.

## 2026-10-21 — A2, B2 and B3 say what they set aside or did not check (every rubric, presentation only); no published score moved

**Status.** Presentation only, under `witan-rubric-v17-2026-07-24` and every selectable rubric. No
score, status, metric value, finding count, abstention or fingerprint moves, and no rubric
identifier changes. Found on a constructed demo repository scanned by 0.6.7 under v17. Two of its
certificates asserted more than Cejel had checked: "Secret cleanliness: clean" beside a committed
env file holding credential-shaped values Cejel had read and silently discarded, and
"Pull-request CI workflow" on a workflow that only runs by hand. **No holdout or calibration ran, and
this entry makes no precision or recall claim.** Changing which values or workflows count is
scoring, left to a prospective rubric: #535 (B3 count), #536 (B3 lint and type-check categories),
#537 (A2 surface and the placeholder rule).

**Every rubric (presentation).**
- A2: a value that is credential-shaped (`looksLikeSecretValue`) but that `isPlaceholderSecretValue`
  sets aside is counted by file, using the same assignment grammar and the same file set as the
  current-tree scan. The AWS documentation pair is an example: it contains "EXAMPLE". Count and
  paths, never the value, appear on the secret-cleanliness metric line (`presentation.condition`),
  in A2's `criteria[].disclosures` (report format 1.8) whether A2 scored, abstained or was not
  applicable, and under "What was not established". The count is taken inside the detection pass
  (`observeValue`), not by a second scan. Under v24 a value its classifier reports is never also
  described as set aside. A scan that stopped at a confirmed secret names nothing, because it did
  not read the rest. The placeholder rule itself is unchanged.
- A2: the evidence label ".env files are gitignored" is replaced, when the scanned tree includes a
  non-template env-format file (`.env`, `.env.<name>`, `<name>.env`), by one naming that file. A
  `.gitignore` rule does not untrack a committed file. The pointer and the `env_handling_depth`
  component it supports stay.
- B2: each cited workflow is labelled by its own top-level `on:` triggers. One with a
  `pull_request`, `pull_request_target` or `merge_group` trigger keeps "Pull-request CI workflow".
  One without reads "CI workflow with no pull-request trigger (on: ...)". A non-GitHub CI file, or
  a workflow whose triggers the reader cannot place, reads "CI workflow (trigger not read)". The
  label names three triggers, then two, one or none, whichever first fits the 180-character
  evidence label limit with its count suffix. Which files are cited and every count are unchanged. The re-read is attributed to no criterion
  (`withoutContentReadAttribution`), so it cannot make B2 abstain.
- B3: workflows that `default_branch_ci_depth` counted but whose every step only prints text are
  named on that metric line, in B3's `criteria[].disclosures` and under "What was not
  established", including a monorepo root's counted workflows ("at the monorepo root"). The claim is
  about every step, so it is made only when every line of the workflow's `jobs:` section fits a small
  grammar: each job holds only `runs-on`, `name`, `timeout-minutes` and `steps`; each step holds only
  `name` and either `uses: actions/checkout@<ref>` or `run:`; every run line, one-line or in a
  `|`/`>` block, only prints (`echo`, `printf`, `true`, `:`, `exit 0`, with no pipe, `&&`, `;`,
  substitution or redirect), with its quotes balanced on the line. Any other key (`env`, `shell`,
  `services`, `with`, `if`, a quoted or capitalised key), a workflow-level `env` or `defaults`, a
  flow collection, or any line the grammar does not place claims nothing.
  When B3 abstains wholesale, its disclosure goes with the count it names. The count is unchanged.
- B3 does **not** name a workflow confined by its branch filters to a `master` (or `main`) branch
  that does not exist (#535). Whether a branch exists is checkout state, outside the scanned
  revision: a report must reproduce byte for byte from the revision alone (`cejel issue`).
- Repository paths reaching the terminal through "What was not established" and metric values go
  through `stripTerminalControls`, as other repository text already did.

**Measured, main (`1d0d4388d`) against this change.** Every report was compared by scoring-surface
projection (`projectWitanScoringSurface`) and by full `report.json` bytes.

| Set | Rubrics | Reports | Scoring-surface moves | Byte differences |
|---|---|---|---|---|
| Behaviour corpus (30) | v17-v27 | 330 | 0 | 6 fixtures × 11 rubrics: B2 label on a workflow with no pull-request trigger; `workspace-package-scripts` also gains the B3 note (its CI runs only `echo ok`) |
| False-assurance fixtures (52) | v17-v27 | 572 | 0 | 5 fixtures × 11 rubrics, B2 label |
| Calibration anchors (5) | v17-v27 | 55 | 0 | not comparable: the fixtures are not hermetic, so head shas differ between runs |
| New fixtures (24, `disclosure-gap-fixtures.ts`) | v17-v27 | 264 | 0 | 11 fixtures, the intended disclosures; all 13 controls and corners are byte-identical, including every master-only corner (full clone, extra branch, detached, depth-1, single-branch, CI-style fetch, schedule, dispatch) |
| Public board, 23 public rows at their pinned commits, depth 1 | v17 | 23 | 0 | 16 rows, B2 labels only (for example react `compiler_prereleases.yml`, "on: workflow_call"; vue `close-cant-reproduce-issues.yml`, "on: schedule"; cejel `publish-distribution.yml`, "on: workflow_dispatch") |
| The demo repository at its scanned commit | v17 | 1 | 0 | A2 set-aside and citation, B2 manual-dispatch label, B3 names the echo-only workflow; the master-only workflow is not named (see above); the base digest reproduced the digest recorded for 0.6.7 |

No board row has a set-aside value or a committed env file beside a `.gitignore` rule, and no board
row gets the B3 note. The board rows above were scored on depth-1 checkouts, not the board's
full-history method (2026-10-11 entry). The release's preregistered public confirmation scores
full-history clones and is the measurement of this change on the board's own method. The
private board row was not run. `src/witan/__tests__/disclosure-gaps.test.ts` pins each new
fixture's scoring surface under every selectable rubric to main's value (fixtures needing a
read-denied file are skipped when tests run as root, where `chmod 000` denies nothing). Two
`v17-scoring-surface-golden.test.ts` report hashes moved, because their CI is `on: [push]`.
Restoring exactly the old B2 label recovers the previous pins byte for byte.

**Found in review of #540.** Three defects added by this change, all fixed before merge:
- **The new label could crash a scan.** It had no length cap. A workflow whose trigger names made it
  exceed 180 characters failed `WitanReportSchema` and the whole scan exited 1 (reproduced with a
  170-character trigger name). The label now drops trigger names to fit.
- **"Runs only on master" ignored other triggers.** A workflow confined to `master` by its push and
  pull-request filters but also on `schedule` or `workflow_dispatch` does run on `main`.
- **"No master branch" was read from incomplete clones.** A `--depth 1` or `--single-branch` clone
  holds only the default branch even when `master` exists upstream (reproduced). So does a checkout
  built as `actions/checkout` builds one: a full `refs/heads/*` refspec, then a depth-1 fetch of one
  branch.

**Found in the second review round of #540** (two recorded passes on `530ea357b`), all fixed:
- **The branch sentence broke reproduction.** It read branch state outside the scanned revision, so
  for the same commit a detached checkout, a fresh clone, or one more branch gave different
  `report.json` bytes, and `cejel issue` refused honest reproductions. Its git calls were also
  outside the hardened read-only allowlist, so under the calibration no-egress hook the sentence
  vanished silently. The branch sentence is removed, with both earlier branch fixes above; a test
  pins that the same commit gives the same report on a branch, with an extra `master` branch, and
  detached. A slash-named remote also defeated its `master` lookup.
- **"Only prints text" was asserted about workflows that run checks**, on six step shapes the
  reader skipped: flow-mapping steps, quoted keys, a plain value continued on the next line, and a
  double-quoted value with an escaped newline. The reader now claims only steps it places.
- **Repository paths reached the terminal unstripped** on a directory scan (escape sequences in a
  file name). They now go through `stripTerminalControls`.
- **The trigger reader was quadratic** in a branch list (26 s for ten 511 KB workflows). It now
  reads trigger names only, linearly.
- **A wholesale-abstained B3 kept a disclosure** naming a count the report no longer showed.

**Found in the third and fourth review rounds** (re-runs on `17317dc3c` and `d0b3056e2`), all fixed:
- **A quoted `#` in a block body hid a check.** The reader stripped `#…` from shell lines as if it
  were a YAML comment, so `echo "Running shard #1" && pnpm test` read as print-only. Block bodies
  are now matched whole.
- **Step settings that run code were ignored:** a custom `shell:` program, `BASH_ENV`/`ENV`, an
  explicit `? key`, an escaped quoted key and a capitalised `Run:` now claim nothing.
- **The stricter reader was quadratic** in a long blank tail (a per-line slice). It is linear, and pinned.
- **A quote left open into a `#` line hid a command**, a quoted `'shell'` key slipped past, and the
  regex added to refuse side-execution settings was super-linear on a quote followed by backslashes
  (one 500 KB workflow: 0.37 s at main, 172 s). Three rounds of refusing shapes had each left one
  more, so the reader was rewritten as the allowlist above. The super-linear regex is gone, and the
  ReDoS guard gains quote-and-backslash families.
- **Fifth round:** a top-level `env`/`defaults` placed after `jobs:` and another key slipped past (the
  scan now reads every top-level key, and refuses a repeated `jobs:` or a document marker); a lone CR
  or NEL, which YAML treats as a line break, hid a command and drove the readers' `.*` regexes
  quadratic (such workflows are now not read, and the regexes use `[^]*`); and a line mixing `"` and
  `'` could leave a quote open (one quote kind per line now).
- **Sixth round:** a workflow-level `env`/`defaults` written with a byte-order mark, an anchor, a tag,
  a merge key or an alias key slipped past the top-level scan. The top level is now an allowlist
  too (`name`, `run-name`, `on`, `true`, `permissions`, `concurrency`, `jobs`, written plain), and a
  line starting with any blank other than a space or tab claims nothing.

The review also moved the sentences out of `notes` into `criteria[].disclosures`, which fixes #539
(a partial or wholesale abstention rewrote the notes and dropped them) and stops a not-applicable
A2 printing the sentence twice. Report format moves to 1.8; a report with no disclosure is
byte-identical to 1.7.

**Found while measuring.** The first trigger reader did not read YAML compact sequences: a filter
list at its key's indent (ripgrep `ci.yml`) and a trigger list at column 0 (cobra `labeler.yml`).
It cited both as "trigger not read". Both are fixed and pinned by unit tests.

**Mutations.** Dropping the credential-shape requirement fails one test. After the first review, each new guard was removed in turn and
each removal fails at least one test: the label fit (2: the label test, and the pinned scan that
no longer completes), keeping disclosures through a wholesale abstention (1: #539), the set-aside
count inside the detection pass (5), and naming monorepo-root workflows (1). The branch guards
measured then were removed with the branch sentence. After the second and third reviews: removing the
placed-step checks fails 15; after the fourth, the round-3 reader fails 6 of the allowlist's new pins
(a quote left open into a `#` line, twice; a quoted `shell` key, twice; a checkout with inputs; a job
with `services`); after the fifth, the round-4 reader fails all 8 new pins; the sixth adds 7 pins (one per shape); keeping B3's disclosure through its abstention fails 1, and the
pre-rework source fails the reproduction, terminal, linear-time and literal-pattern pins (4). Dropping the attribution guard on the B2 and B3 re-reads fails
nothing. Cejel already attributes a skipped CI-workflow path to B2 and B3 by path, so the guard is
redundant with existing behaviour. It is kept as the documented pattern for presentation-only
reads, and the LFS-pointer and unreadable-workflow fixtures pin the scoring surface either way.

**Fingerprints.** Unchanged. v17 stays
`sha256:5cd48f8c642300ae8736a09d4a24ce3a4f8885f6e099b5f27f99d950e0c944b4`, v27 stays
`sha256:fb4edfa0bdf0d8153af3f84a4b72d4eab6da3fd6e0b2e3e494cea9542ded45a0`.

**Not fixed.** The unnamed "excluded by extension" entry (#538). A workflow file can still be read
more than once per scan by B2 and B3 under different read attributions (#534).

## 2026-10-20 — third review of the v27 closure: eight corrections; no published score moved

**Status.** A third adversarial review, of the merged #521, reported ten findings. Eight
reproduced. The A4 note and citation corrections ship under every rubric and move no v17 score,
status, metric, finding count or fingerprint. The A1 and `lockfile_coverage` corrections ship only
under `witan-rubric-v27-prospective-2026-10-19`, which keeps its identifier: it is unreleased,
opt-in, and its pinned fingerprint does not move. The default stays v17. **No holdout or
calibration ran, and this entry makes no precision or recall claim.** Details and the fixture for
each finding: `docs/reviews/v27-false-assurance-closure-2026-10-19.md`, "Third review".

**Every rubric (presentation under v17).**
- The CI lockfile-requirement note was missed where a step also ran tests (`npm ci` then
  `npm test`), for `cargo test --locked`, and for any workflow saved with CRLF line endings. It now
  fires there.
- It was made where it is not true: a step or job with `continue-on-error`, a workflow that checks
  out another repository or downloads an artifact, a working directory or `cd` target the checkout
  does not hold, and a workflow that names the lockfile in a command. It is withheld there.
- The workflow step reader was quadratic in the number of steps: a 480 KB workflow of 24,000 steps
  took 12 s to scan under v17. It is linear (about 0.25 s); a timing guard kills the previous
  implementation.
- Under library norms, A4 no longer cites a secondary manifest ahead of the primary one when the
  primary holds an unconstrained dependency itself.
- The bounded prefix read used by the semantic source gate now counts a Git LFS pointer in
  `contentReadSummary.byReason.lfsPointer`, as the full read does.

**v27 only.**
- A1 never credits a `conftest.py` as a live test, so a suite a hook skips credits 0. Where
  `conftest.py` files are the only test-shaped files, A1 cites them as pytest configuration and
  scores a test ratio of 0. Before, A1 could lose its only evidence and stop being scored, which
  could raise the composite. This was not observed as a rise on any recorded set.
- A pytest hook that empties `items` and refills it is read as a reorder, not as removing the
  suite.
- `lockfile_coverage` follows the note above in both directions.

**Measured, main (`7db216363`) against this change.**

| Set | v17: scoring-surface moves | v17: reports byte-identical | v27: scoring-surface moves | v27 no-rise against v17 |
|---|---|---|---|---|
| Behaviour corpus (30) | 0 | 30 | 0 | 0 violations |
| Calibration anchors (5) | 0 | 5 | 0 | 0 violations |
| Public board, 23 rows | 0 | 23 | 2 (metric only) | 0 violations |
| False-assurance fixtures (52) | 0 | 43 (the 9 that differ are the new `review3-a4-*` notes and citations) | 11 (the new `review3-*` fixtures) | 0 violations |

On the board under v27, flask and pydantic each had one `conftest.py` credited as a live test:
`non_hollow_test_share` falls 28 to 27 and 213 to 212, and neither A1 score moves at the reported
precision. No other v27 board row moves.

**Fingerprints.** Unchanged. v17 stays
`sha256:5cd48f8c642300ae8736a09d4a24ce3a4f8885f6e099b5f27f99d950e0c944b4`, v27 stays
`sha256:fb4edfa0bdf0d8153af3f84a4b72d4eab6da3fd6e0b2e3e494cea9542ded45a0`: no corpus fixture has
any of these shapes.

**Not fixed.** Repeated reads of the same files within one scan (efficiency only), tracked as an
issue.

## 2026-10-19 — false-assurance closure: presentation fixes under every rubric, prospective v27 for the scoring fixes (#517, #518, #519, #520, #442); no published score moved

**Status.** Two parts. The presentation fixes ship under `witan-rubric-v17-2026-07-24` and every
selectable rubric, and move no score, status, metric, finding count, abstention or fingerprint.
The scoring fixes ship only under a new prospective rubric, `witan-rubric-v27-prospective-2026-10-19`,
which inherits v17 (not v18-v26) and changes only these behaviours. v27 is explicit opt-in. The
public default stays v17 and the public board is scored under v17, so no published score, verdict
or rank moves. **No holdout or calibration ran for v27, and this entry makes no precision or recall
claim.** Classification and the reasons for each design choice:
`docs/reviews/v27-false-assurance-closure-2026-10-19.md`.

**Presentation, every rubric.**
- #519: a file whose checkout holds a Git LFS pointer is counted in
  `contentReadSummary.byReason.lfsPointer` (report format 1.6; present only when non-zero, so no
  other report's bytes change), itemized on the certificate, and labelled as a pointer in A1's
  evidence. No criterion abstains on it under these rubrics: the reader is told the content was
  not read, and the score is unchanged.
- #520: A4's library note no longer says a lockfile is "not required" when an unconditional
  GitHub Actions step runs a command documented to fail without its lockfile (`npm ci`, `pnpm
  install --frozen-lockfile`, `uv run|sync --locked|--frozen`, `cargo
  build|test|check|clippy|doc|run|bench --locked|--frozen`, `poetry check --lock`) and that
  lockfile is absent everywhere the scan knows of. Cejel claims nothing when the step or its job has
  an `if:`, the step's shell is conditional (`if`, `[`, `test`, `||`, ...) or holds a heredoc, the
  tool is not in command position (echoed text, a step name), or the workflow also runs a command
  that writes that lockfile (`npm install`, `uv run` without `--locked`, ...). Steps are read as
  words before any comment, in linear time. The note names the command, file, line and needed
  lockfile, and that line is cited first, so the metric-derived finding cites it. A lockfile the file walk withheld (for example, over the size
  limit) counts as present for this purpose. Under library norms the manifest holding a dependency
  declared with no version constraint is cited first when it is not the primary manifest.

**Scoring, v27 only.**
- #517 (B3): a workflow with a publish, release or deploy step, no pull-request or merge-queue
  trigger, no reusable-workflow call, and no test, lint, type-check or other recognised
  verification command (tox, nox, pre-commit, gradle, maven, make check, ...) counts toward neither
  `ci_script_depth` nor `default_branch_ci_depth`. Any doubt keeps it counted.
- #518 (A1): `conftest.py` is not a concrete test file for `test_to_source_ratio` or the
  evidence; `non_hollow_test_share` stays measured over v17's list, so its denominator cannot
  shrink. A top-level `pytest_collection_modifyitems` hook in a conftest.py that, with no
  conditional anywhere in it, skips or removes every item makes the pytest files in its directory
  hollow, and is named in a warning finding; so does an unconditional one-line module-level
  `pytestmark = pytest.mark.skip`.
- #519 (every criterion): reading an LFS pointer is a content-read skip attributed to the reading
  criterion, which abstains as a read failure (kept in the composite at 0), including one that
  would otherwise be not applicable, since applicability is decided from content. The exception is
  a criterion whose collector made a critical finding: it scores as under v17, so a pointer-shaped
  file cannot erase a confirmed finding.
- #520 (A4): under library norms, `lockfile_coverage` is 0, not omitted, when the repository's CI
  requires a lockfile and the inventory holds none.
- #442 (A2, B2): on a shallow clone A2 abstains unless a confirmed critical finding stands, and B2
  abstains when fewer than 12 commits are visible. Both are read failures, kept in the composite at
  0. A2's abstention also withholds its warning and info findings.

**Why nothing can rise.** Every v27 change either lowers a metric value (B3 depths, A1
`test_to_source_ratio` and `non_hollow_test_share`, A4 `lockfile_coverage` = 0) or is a
read-failure abstention, which scores 0 and stays in the composite. Withholding a single metric and
self-imposed abstention were both rejected because each can raise a score; a new `critical` or
`warning` A4 finding was rejected because the v17 scorer sets a critical-finding criterion to 1.4
and lets a warning finding pre-empt the critical score band. The no-rise property is a test
(`src/witan/__tests__/false-assurance-v27.test.ts`) on every new fixture, and was checked on every
corpus specimen and board row below.

**Measured.** Previous scanner: `origin/main` `1e17e8ce3`. Full `report.json` bytes and the
fingerprint projection were compared before and after.

| Set | Rubrics | Reports | Scoring-surface moves | Byte-identical | Byte differences |
|---|---|---|---|---|---|
| Behaviour corpus (30 specimens) | v17-v26 | 300 | 0 | 290 | 10: `pr-template-directory-form` under every rubric, A4 note and citation (its CI runs `npm ci`, no lockfile) |
| Calibration anchors (5 fixtures) | v17-v26 | 50 | 0 | not comparable | the fixtures are not hermetic, so every head sha differs between builds |
| Public board, 23 public rows at their pinned commits, depth 1 as the board fetches them | v17 | 23 | 0 | 20 | 3: biomejs, flask, zod, A4 citation order |
| New fixtures (38, `false-assurance-fixtures.ts`, 16 of them from review) | v17 | 38 | 4: the four LFS fixtures, `contentReadSummary.byReason.lfsPointer` only | 31 | 7: the LFS fixtures (count, labels), two A4 fixtures and `b3-test-then-publish-workflow` (A4 note and citation; its CI runs `npm ci`) |

The private board row was not run for this entry. `report.json` comparisons are above;
`attestation.json` changes on every scan, because it records report format 1.6.

**Found in review.** An adversarial review of the first implementation of this change reproduced
a score rise under v27 (a `conftest.py` that v17 rates hollow left A1's non-hollow denominator),
false lockfile-requirement notes under v17 (`cargo install --locked`, a committed `bun.lock`, a
trailing comment), a quadratic regex on the v17 path, and v27 over-reach (an LFS pointer erasing a
critical finding; conditional hooks and pytestmarks read as unconditional; tox CI read as
publish-only). Each is fixed and pinned by a fixture or by a timing guard
(`scan-path-regex-bounds.test.ts`; the previous implementation's scan is killed at 20 s).
A second review, of those fixes, reproduced six more false lockfile notes (a step guarded by
`if [ -f package-lock.json ]`, `[ ... ] && npm ci || npm install`, echoed text, a heredoc line, a
disabled job, a lockfile generated earlier in the job), a not-applicable result kept from an LFS
pointer, and an evidence-sample shift; those are fixed and pinned the same way.

**Fingerprints.** Every existing pin is unchanged; v17 stays
`sha256:5cd48f8c642300ae8736a09d4a24ce3a4f8885f6e099b5f27f99d950e0c944b4`. v27 is pinned at
`sha256:fb4edfa0bdf0d8153af3f84a4b72d4eab6da3fd6e0b2e3e494cea9542ded45a0`. On the corpus it
differs from v17 only in the A4 component (`pr-template-directory-form`: A4 critical 0.5 to 0.3,
`lockfile_coverage` 0); no report-level component differs.

**v17 to v27 on the public board** (prospective; nothing published moves). Twenty-two of the 23
rows are scored; carddemo abstains as `insufficient_source` under both. Every scored row is a
depth-1 clone, so B2 abstains on all 22 and A2 on the 8 where it is applicable and no confirmed
critical finding stands. Every composite falls; none rises.

| Row | Verdict | Overall | Code | Process | Criteria that moved, v17 → v27 |
|---|---|---|---|---|---|
| automapper | at_risk → unverified | 2.2 → 1.2 | 2 | 2.3 → 0.3 | B2 verified 4 → insufficient_data 0 |
| axios | conditional → at_risk | 3.3 → 2.4 | 2.6 → 1.8 | 3.9 → 2.9 | A2 verified 3.6 → insufficient_data 0; B2 verified 4 → insufficient_data 0 |
| biomejs | conditional → at_risk | 3 → 2 | 2.9 → 1.8 | 3.1 → 2.2 | A2 verified 3.2 → insufficient_data 0; B2 verified 4 → insufficient_data 0; B3 metric only (default_branch_ci_depth 13→12; score unchanged) |
| carddemo | insufficient_source | — | — | — | no move |
| cejel | conditional → at_risk | 2.8 → 1.5 | 2.3 → 1.7 | 3.2 → 1.2 | A2 verified 3.3 → insufficient_data 0; B2 verified 4 → insufficient_data 0 |
| cobra | conditional → at_risk | 2.5 → 1.5 | 2.6 | 2.3 → 0.3 | B2 verified 4 → insufficient_data 0 |
| django | conditional → at_risk | 3.1 → 1.6 | 2.6 → 1.6 | 3.6 → 1.6 | A2 warning 2.8 → insufficient_data 0; B2 verified 4 → insufficient_data 0 |
| esbuild | conditional → at_risk | 2.5 → 2 | 2.6 | 2.4 → 1.3 | B2 warning 3.2 → insufficient_data 0 |
| express | conditional → at_risk | 3.1 → 2.4 | 3 | 3.2 → 1.8 | B2 verified 4 → insufficient_data 0 |
| fastapi | conditional | 3 → 2.5 | 2.8 | 3.2 → 2.1 | A1 metric only (test_to_source_ratio 604→603; score unchanged); B2 warning 3.2 → insufficient_data 0 |
| flask | conditional → at_risk | 2.9 → 1.9 | 2.7 → 1.9 | 3 → 1.9 | A1 metric only (test_to_source_ratio 59→56; score unchanged); A2 verified 3.2 → insufficient_data 0; B2 warning 3.2 → insufficient_data 0 |
| fmt | conditional → at_risk | 2.6 → 2.2 | 2 | 3.2 → 2.4 | B2 warning 3.2 → insufficient_data 0 |
| guava | at_risk → unverified | 1.9 → 1.1 | 1.6 | 2.2 → 0.6 | B2 warning 3.2 → insufficient_data 0 |
| pydantic | conditional | 3.2 → 2.6 | 2.9 | 3.5 → 2.2 | A1 metric only (test_to_source_ratio 292→290; score unchanged); B2 verified 4 → insufficient_data 0 |
| react | conditional → at_risk | 3 → 2.4 | 2.1 | 3.9 → 2.6 | B2 verified 4 → insufficient_data 0 |
| requests | conditional → at_risk | 2.9 → 2.4 | 2.4 | 3.4 → 2.4 | A1 verified 2.5 → verified 2.4; B2 verified 4 → insufficient_data 0 |
| ripgrep | at_risk | 2.1 → 1.6 | 2.1 | 2 → 1 | B2 warning 3.2 → insufficient_data 0 |
| scorecard | conditional → at_risk | 2.9 → 2.2 | 2.2 | 3.6 → 2.2 | B2 verified 4 → insufficient_data 0 |
| sinatra | at_risk | 2.2 → 1.5 | 2 | 2.4 → 1 | B2 verified 4 → insufficient_data 0 |
| svelte | conditional → at_risk | 3.1 → 2 | 2.9 → 2 | 3.3 → 2 | A2 verified 3.6 → insufficient_data 0; B2 verified 4 → insufficient_data 0; B3 metric only (default_branch_ci_depth 5→4; score unchanged) |
| vite | conditional | 3.4 → 2.5 | 2.8 → 2.2 | 4 → 2.7 | A2 verified 3.2 → insufficient_data 0; B2 verified 4 → insufficient_data 0 |
| vue | conditional → at_risk | 2.9 → 2.3 | 2.4 | 3.4 → 2.3 | B2 warning 3.2 → insufficient_data 0 |
| zod | conditional → at_risk | 3.2 → 2 | 3.1 → 1.9 | 3.2 → 2.1 | A2 verified 3.6 → insufficient_data 0; B2 warning 3.2 → insufficient_data 0 |

Fixture-level movements are in `docs/reviews/v27-false-assurance-closure-2026-10-19.md`.

## 2026-10-15 — v26 item 8: A3's build or type-check finding fires on settling evidence only (v26 alone); no repository moved

**Status.** The second change `witan-rubric-v26-prospective-2026-10-14` makes of its own,
implemented from the operator-signed ruling `docs/calibration/v26/ruling-item-8.md` (#496). It is
gated on v26 alone, so v17 through v25 are byte-identical before and after. v26 is explicit opt-in
only and the public board is scored under v17, so no published score, verdict or rank moves: no
repository moved. **No public paired rescore has run, and this entry makes no precision or recall
claim.** The release that carries this change is preceded by the operator's private check and a
preregistered public before-and-after. Neither has run, and neither is cited here.

**The change.** "A deployable service package manifest declares neither a build nor a typecheck
script." claims that the package has no build or type-check step, and two script names do not
settle that. Under v26 the finding keeps the v20–v25 condition (no `build` or `typecheck` script in
the root or a declared workspace `package.json`, and no manifest left unread by the cap). It also
needs all three of the ruling's conditions:
- **B-1, something to build or check.** The root package has authored TypeScript (`.ts`, `.tsx`,
  `.mts`, `.cts`, but not a `.d.ts`, `.d.mts` or `.d.cts` declaration file) or a `tsconfig*.json`.
  Otherwise there is no finding and nothing to disclose.
- **B-2, no step in any place read.** No command runs a compiler, type checker or bundler from a
  fixed vocabulary, matched as the command word after shell splitting and never as a substring:
  `tsc`, `vue-tsc`, `tsup`, `esbuild`, `swc`, `babel`, `rollup`, `webpack`, `webpack-cli`, `ncc`,
  `svelte-check`, `vite build`, `next build`, `nest build`, `parcel build`, `bun build` and
  `ng build`, or a task runner's `build` or `typecheck` target (npm, pnpm, yarn, bun, make, just,
  turbo, nx, lerna). The places read are any script in the root or a declared workspace
  `package.json`, any GitHub Actions `run` command, any Dockerfile `RUN`, and any Makefile,
  GNUmakefile or justfile target. If a step is found, there is no finding and nothing to disclose.
- **B-3, every such place read.** Any of the following leaves the question unsettled: a withheld CI
  workflow, Dockerfile, recipe file or authored `package.json`; a CI step that delegates to another
  repository's reusable workflow or to a local action; a CI file from a system whose commands are not
  read as `run` steps; the workspace read cap; a workspace declaration that cannot be read; or a
  command or manifest that cannot be parsed. Then there is no finding, and the certificate's "What
  was not established" carries: "Whether this package has a build or type-check step outside the
  files read cannot be settled from static evidence; Cejel makes no finding on it." This is never
  criterion-level `insufficient_data`.

When all three hold, the finding fires with its current wording and evidence.

**Unchanged.** Every metric, including `prod_readiness_primitives` and its "build or type-check
command" component; A3's other findings and their wording; and the if / else-if order of A3's
explicit-gap checks. Where this finding stops firing, the Dockerfile `HEALTHCHECK` and health-route
checks after it are evaluated, and that consequence is reported below, not prevented.

**Measured on the behaviour corpus.** The corpus is unchanged at 30 specimens. The previous
scanner is `origin/main` `6aec9d93`. Full `report.json` bytes were compared under every selectable
rubric, on the 30 specimens and on this change's 28 synthetic fixtures, before and after.
- **v17 through v25:** 522 of 522 reports byte-identical.
- **v26, behaviour corpus, v25 against v26.** A3 findings change on 1 of 30 specimens.
  `start-declared-http-entrypoint` is JavaScript run as written, so B-1 fails and the build
  finding stops firing. It fires under v25 and not v26 on 1 specimen, and under v26 and not v25 on
  0. The health-route check after it in the chain then fires: 1 specimen gains it under v26, and 0
  lose it. A3 status changes on
  0 specimens in either direction. The disclosure sentence appears on 0. A3 metrics, evidence and
  score change on 0. `control-described-not-built` carries the build finding under both rubrics.
- **v26, synthetic fixtures:** 21 of 28 move, as designed. The 7 that do not are the fixtures built
  to fire under both rubrics.

| Measurement, v25 → v26 on 30 specimens | Moves under v26 only | Moves under v25 only | Unchanged |
|---|---|---|---|
| A3 build finding present | 0 | 1 | 29 |
| A3 health-route finding present (following check) | 1 | 0 | 29 |
| A3 status | 0 more severe | 0 less severe | 30 |
| A3 disclosure sentence | 0 | 0 | 30 |

**Fingerprints.** No pin moved, v26's included. On the one moved specimen, one info finding
replaces another, and the fingerprint counts findings by severity, not by wording. v26 stays
`sha256:4530317d56fc73eb89287e344ad626e2b9a96908ef12eb9e9c13b839bd599dae` and v25 stays
`sha256:0f2638a5088f95a610a0e12012442f1067af3e985b955f96ec71853d549693b9`. The substitution is
pinned instead in `src/witan/__tests__/v26-v25-parity.test.ts`, which compares whole criterion
fields.

**Report format.** No new `report.json` field. Under v26 the sentence travels in A3's criterion
`notes`, and the certificate lifts it from there. v26 `report.json` and certificate bytes change
where A3's findings or notes change.

The synthetic suite, the choices made where the ruling is silent, and the guard-deletion table are
in `docs/reviews/v26-a3-build-step-evidence-2026-10-15.md`.

## 2026-10-14 — A2 HMAC digest compare by keyed computation (every rubric, no identifier bump); public paired rescore not run

**Status.** A recognition fix that restores a true finding. It ships under
`witan-rubric-v17-2026-07-24` and every selectable rubric with no identifier bump and with weights
and thresholds unchanged, as #430 did. **The public-corpus before-and-after has not run.** The
release that carries this change runs a preregistered public delta, and the operator's private
check precedes that release. This entry makes no statement about a public-corpus score, verdict,
rank, placement, calibration, precision or recall.

**The defect.** #430 (0.6.4) removed `digest` from A2's insecure-compare line pattern under every
rubric, because a bare digest name is no evidence of a secret: public content and grammar hashes
use it too. 0.6.4 stated the cost: "an HMAC result held in a variable named only `digest` is no
longer flagged." Whether a value is secret is decided by what produced it, not by its name.

**The change, every rubric.** A comparison is flagged when all of these hold:
- the left-hand identifier contains `digest`, is not a property, and is compared with `===` /
  `!==` (`==` / `!=` in Python, Go and Ruby) against something other than a literal, `undefined`,
  `null`, `None`, `nil` or a numeric-shaped operand;
- the same file assigns that identifier, before the comparison, from a keyed HMAC computation:
  directly, or by reading one earlier HMAC binding (an HMAC object's digest method, or a value
  already produced). One hop, never a chain;
- the assignment, the computation and the comparison are all live code, outside comments and
  strings.

The computations are each runtime's documented API:
- **Node:** `createHmac(algorithm, key)` with `.digest(` (nodejs.org/api/crypto.html);
- **Web Crypto:** `crypto.subtle.sign('HMAC' | { name: 'HMAC' }, key, data)` (MDN
  `SubtleCrypto.sign`);
- **Python:** `hmac.new(key, msg, digestmod)` with `.digest()` / `.hexdigest()`, and
  `hmac.digest(key, msg, digest)` (docs.python.org `hmac`);
- **Go:** `hmac.New(h, key)` then `.Sum(` (`crypto/hmac`);
- **Ruby:** `OpenSSL::HMAC.digest` / `.hexdigest` / `.base64digest`, or an `OpenSSL::HMAC.new`
  instance's digest. An `OpenSSL::HMAC` instance itself is never bound: its `==` compares in
  constant time.

**Not changed:** the #430 line pattern and every one of its regression tests. The new rule runs
beside it, and the first flagged line in a file is reported. A2 reports at most one timing finding,
as before.

**Expected direction on the public delta.**
- **A2 can newly fire** on a repository that compares a keyed-HMAC digest with ordinary equality,
  and only there. Its `crypto_comparison_hygiene` metric reads 0.
- **On a repository with no other A2 surface, A2 moves from not applicable to scored.** The A2
  score then enters the code-trust mean, which can raise the code-trust and overall scores even
  though the change only adds a warning. The specimen below shows this.
- **Nothing can stop firing.** The existing pattern is untouched. Where a repository already had a
  timing finding, its cited file and line can move to an earlier production file that the new rule
  matches. Every selectable rubric scans production paths only here, so a test file cannot take
  the finding over.

**Measured on the behaviour corpus.** Two synthetic specimens extend the corpus from 28 to 30:
`hmac-digest-compare` (a `createHmac` digest compared with `===`) and `unkeyed-digest-controls` (a
plain `createHash` digest compared, and an HMAC computed into `mac` beside an unrelated
`contentDigest === etag`). The previous scanner is `origin/main` `457c9292`, run on the same
30-specimen corpus. Every fixture reproduced its committed head in both runs. As a pipeline check,
`457c9292` on the committed 28-specimen corpus reproduced all ten committed fingerprints. 300
specimen/rubric surfaces were compared, and 10 moved: `hmac-digest-compare` under every rubric, A2
only. The other 29 specimens, `unkeyed-digest-controls` among them, are identical under all ten
rubrics (290 of 290).

Every rubric moves the specimen identically:

| Specimen | A2 | A2 status | A2 findings | `crypto_comparison_hygiene` | Code trust | Overall | Verdict |
|---|---|---|---|---|---|---|---|
| `hmac-digest-compare` | not applicable → 2.3 | not applicable → warning | none → 1 warning | absent → 0 | 1.3 → 1.6 | 0.9 → 1.1 | unchanged |

A2 now also reports `env_handling_depth` 0 and `secret_cleanliness` 1, which come with any scored A2.

Measured fingerprints:

| Rubric | Previous scanner, expanded corpus | This change |
| --- | --- | --- |
| `witan-rubric-v17-2026-07-24` | `sha256:15721c3ad60dae307d1823b5b22b3574d0dbbfe0a9d9a0ba093f589957c1ddb9` | `sha256:5cd48f8c642300ae8736a09d4a24ce3a4f8885f6e099b5f27f99d950e0c944b4` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:b5f6159ba329303308b48005b484e745b51aeaef5a04c7bcf3444461e79ba495` | `sha256:4a5d17c84e265ec20cf54216d2e794dec1d299d859c69ac8ef1ab317fc479e2f` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:2cbb8d2db1436a585434491bbbdb60b907c365cc0849219edae0bde099815bc3` | `sha256:73dc0282a9ea2a481db8e86a9a5dc227a8b108356c358de029901f2dc38cef79` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:5e4981ee5f70eb50d06736595d7983c3b69d5150f68f7b2a733852be88b82356` | `sha256:b5f4254a6056ff792d79a2d85892cdf05484eabded85ba13251a2c8fd5ac6336` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:d859442939c0c8c2122207d62fa13c28228cba518018a92276a7a81c648ef22d` | `sha256:f599d06354adb45af018639594cb6f44e7cb40445b84a0dcdd4438b8d7d069d0` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:40817f363e1b2de86fc2346c8d3b40a5e28dd1f9b0ce45beb93c14803e46281e` | `sha256:34fb6ac5d1f6faf0912aa4d00924837eeee543614d7971247d005312b89928e1` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:23c55fb078e7b2b158f095e62d10d02b5af74af2a570cf812348a81c65eebf06` | `sha256:ce24235861ce0f0dc4dafd22059a78d31f348e5c741e4056475867c29cc8b814` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:a2a5d3da7f18e2c40784011b1609e1589db3fb371893727207e176da74aa1140` | `sha256:b221907d60d209cd3d57437892ae3dd873f4fa221ad8743954a30c8575d4e77c` |
| `witan-rubric-v25-prospective-2026-10-12` | `sha256:68952f0c9b5be512852dfbb24c23aaef25025da0a7b8d5b469cedfe173eb95fc` | `sha256:0f2638a5088f95a610a0e12012442f1067af3e985b955f96ec71853d549693b9` |
| `witan-rubric-v26-prospective-2026-10-14` | `sha256:f1bcbe59bfcdc67ff378fbb94c853d938722772ecff961194fe76a80a536133b` | `sha256:4530317d56fc73eb89287e344ad626e2b9a96908ef12eb9e9c13b839bd599dae` |

**Report format.** No field changes. The v17 goldens, the CLI byte pin and the F2 reads-disclosure
pins moved by their fingerprint alone: restoring only the previous fingerprint reproduces each
previous pin byte for byte.

The API sources, the red-first run and the guard-deletion table are in
`docs/reviews/hmac-digest-compare-2026-10-14.md`.

## 2026-10-14 — A1 test-framework recognition (every rubric, no identifier bump); public paired rescore not run

**Status.** A recognition fix that removes a false absence. It ships under
`witan-rubric-v17-2026-07-24` and every selectable rubric with no identifier bump and with weights
and thresholds unchanged, as #427 (AVA) did. **The public-corpus before-and-after has not run.**
The release that carries this change runs a preregistered public delta, and the operator's private
check precedes that release. This entry makes no statement about a public-corpus score, verdict,
rank, placement, calibration, precision or recall.

**The defect.** A1 `non_hollow_test_share` counts a test file as non-hollow when an assertion
idiom matches. The patterns knew JS/TS, C++, Python, Go, Rust, JUnit, Ruby, PHP and AVA. Test
files written for xUnit, NUnit, MSTest, XCTest, ScalaTest, Kotest, tape and tap matched nothing, so
their assertions were invisible (#406 for .NET). Where every test file was unread this way, the
share was 0, and a zero share holds A1's status at `critical`.

**The change, every rubric.** Each idiom comes from the framework's own documentation. It counts
only in live code, outside comments and string literals:
- **xUnit, NUnit, MSTest:** `Assert.X(` (generic forms included), `ClassicAssert`,
  `CollectionAssert` and `StringAssert`. There is no import gate, because the xUnit and MSTest
  templates import their namespace project-wide.
- **XCTest:** `XCTAssert…(`, `XCTFail(` and `XCTUnwrap(`.
- **ScalaTest:** `assert(`, `assertResult(`, `assertThrows[` and `intercept[` count only with an
  `org.scalatest` import. Should/must matchers (`shouldBe`, `should be`, `should equal`, `mustBe`,
  …) count only with a ScalaTest matchers import.
- **Kotest:** `shouldX` matchers count only with an `io.kotest.matchers` or `io.kotest.assertions`
  import. Import lines themselves never count.
- **tape and tap:** `t.<assertion>(`, for the methods each documents, counts only with a `tape` or
  `tap` import or require whose keyword is itself live code.
- **Documented suite-level skips make a file hollow.** These are NUnit or MSTest `[Ignore]` on the
  fixture class, ScalaTest `@Ignore` on the suite class, and Kotest `@Ignored` on the spec.
  Per-test skips do not: `[Fact(Skip = …)]`, `[Ignore]` on a method, ScalaTest `ignore(…)`. xUnit,
  XCTest, tape and tap document no suite-level skip.
- **Naming.** `*Tests.cs` / `*Test.cs` and `*Spec.scala` / `*Test.scala` / `*Suite.scala` join the
  hollow denominator only when a documented suite-level skip disables the file. An assertion
  library this rule does not read (FluentAssertions, Shouldly, specs2) is not evidence of a
  placeholder, so such a file stays out of the denominator, as it was before.
- **Not changed:** which files count as tests (`findConcreteTestFiles`, and with it
  `test_to_source_ratio`), and every existing pattern, which still runs on raw text as before.

**Expected direction on the public delta.**
- **Up or unchanged where a repository's test files use these frameworks:**
  `non_hollow_test_share` rises, and an A1 status held at `critical` by a zero share can lift.
- **Down only on positive evidence:** a file under a documented suite-level skip stops counting as
  non-hollow. A `*Tests.cs` or `*Spec.scala` file under such a skip also enters the denominator.
  So the change is not monotone. It can lower a share where a repository skips whole suites.
- **No other metric or criterion reads these patterns.**

**Measured on the behaviour corpus.** Six synthetic specimens extend the corpus from 22 to 28:
`xunit-assertions`, `nunit-ignored-fixture`, `xctest-assertions`, `scalatest-assertions`,
`kotest-matchers` and `tape-assertions`. The previous scanner is `origin/main` `4ca642ef`, run on the
same 28-specimen corpus. Every fixture reproduced its committed head in both runs. As a pipeline
check, `4ca642ef` on the committed 22-specimen corpus reproduced all ten committed fingerprints.
280 specimen/rubric surfaces were compared, and 60 moved: the six new specimens under every rubric,
A1 only. All 22 existing specimens are identical under all ten rubrics (220 of 220).

Every rubric moves each new specimen identically:

| Specimen | A1 | A1 status | `non_hollow_test_share` | Code trust | Overall | Verdict |
|---|---|---|---|---|---|---|
| `xunit-assertions` | 1.2 → 1.8 | critical → warning | 0/1 → 1/1 | 1.2 → 1.8 | 0.6 → 0.9 | unverified, unchanged |
| `nunit-ignored-fixture` | 1.2 → 1.5 | critical → warning | 0/1 → 1/2 | 1.2 → 1.5 | 0.6 → 0.8 | unverified, unchanged |
| `xctest-assertions` | 1.2 → 1.8 | critical → warning | 0/1 → 1/1 | 1.2 → 1.8 | 0.6 → 0.9 | unverified, unchanged |
| `scalatest-assertions` | 1.2 → 1.8 | critical → warning | 0/1 → 1/1 | 1.2 → 1.8 | 0.6 → 0.9 | unverified, unchanged |
| `kotest-matchers` | 1.2 → 1.8 | critical → warning | 0/1 → 1/1 | 1.2 → 1.8 | 0.6 → 0.9 | unverified, unchanged |
| `tape-assertions` | 1.2 → 1.8 | critical → warning | 0/1 → 1/1 | 2.0 → 2.3 | 1.0 → 1.2 | unverified, unchanged |

On each, A1's finding counts move from one critical to one warning. In `nunit-ignored-fixture`, the
`[TestFixture, Ignore(…)]` file is the hollow half of 1/2.

Measured fingerprints:

| Rubric | Previous scanner, expanded corpus | This change |
| --- | --- | --- |
| `witan-rubric-v17-2026-07-24` | `sha256:9922d6d47e53f4c570aa445ca59e4d6b6522c176bc8c0627f6fa3196aa858e54` | `sha256:bb52dcba7d5967723b2ee256d6ea465f313cd265fd2cf61467efd632103e1007` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:19ff0b4a32f648dfb733afa748a75b650ee8bd98e225f7acc5916a73d4b5d0a9` | `sha256:36a5eef983d589abe1eabf15269466ecd45b9eb8e194d19e5d972ee1fe6d9692` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:c3596cf191d934df793fddcc336895540f844724edf63419bd14753a871bd252` | `sha256:1d44e1b7124c62869a76949baacb976f60b2f011934d811ddf0dd1129aafe70a` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:8e2cc62d02444a8c6d10b4639b1ea73461a6dfa11a24f9d7353988fed1434401` | `sha256:ddaa0f3b7d927ae43b7aec46555817a137ee6405a71ea3105a039f7513688943` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:13e47670f3e3aabbc9e03d4d5df5543562c93908199c87c4df467ea7efddd49b` | `sha256:56240481595220b50639a5c7acf889fcabe2efcc42751c293714993c6de32f39` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:c82f209ad703b7acb0155c2f879344c5750bb8b4b217071c8cb2d0085bae5afd` | `sha256:54642ad53c521e2ef236ba41b9f8040b044e749437b931053250ec929a19daf7` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:6fd04238727d257e2e39c71d7900117e1d46a6a97d489eb26f416dcee978ce40` | `sha256:f6d939ec4a0ceed2375037f8a722f564b60c781eecbc2ec0060b09bce92f5cb9` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:1e8ac73dbc676380852b9196653bd7691fe53b50dc3893478229cd06c0342f8d` | `sha256:efb8e3d58780df9febca670f812187679951bbdc9d5dbd3054e97bd98827a662` |
| `witan-rubric-v25-prospective-2026-10-12` | `sha256:201a5d7d8661b9aeaabeb33ac97e53f47df1b3955468d9c0050a3b8c1e843c98` | `sha256:2e87656428c7a7478f03437dc125cf543abff5a27e0323ad7e9160fc70a7fb5c` |
| `witan-rubric-v26-prospective-2026-10-14` | `sha256:c45a7252d2cd86ba606da572d5a8f8e8b43123628b0b28676ff0e405080449d5` | `sha256:28d8eb7cfd8809bb960e70027426d3178dee866b533674cd542e71edc8afd459` |

**Report format.** No field changes. The v17 goldens, the CLI byte pin and the F2 reads-disclosure
pins moved by their fingerprint alone: restoring only the previous fingerprint reproduces each
previous pin byte for byte.

**#409 is not part of this change.** It is about A1's verification-command matching (tests run
through `Build.ps1`, `$CARGO` or `./mvnw`, and type-check and lint patterns for compiled
languages), not test-file or assertion recognition. The issue itself calls each option a
measurement decision for a prospective rubric.

The idiom sources, the red-first run and the guard-deletion table are in
`docs/reviews/test-framework-recognition-2026-10-14.md`.

## 2026-10-14 — v26 item 6: A5 and A2 tenant findings fire on settling evidence only, and A5 does not score the absence of Cejel's own format (v26 alone); no repository moved

**Status.** The one change `witan-rubric-v26-prospective-2026-10-14` makes of its own, implemented
from the operator-signed ruling `docs/calibration/v26/ruling-item-6.md` and its operator-signed
amendment 1 (`docs/calibration/v26/ruling-item-6-amendment-1.md`). Gated on v26 alone: v17 through
v25 are byte-identical before and after. v26 is explicit opt-in only and the public board is scored
under v17, so no published score, verdict or rank moves: no repository moved. **No public paired
rescore has run, and this entry makes no precision or recall claim.**

**The change.** Both findings claim something about the world, and a missing file does not settle
either.
- **A5, "no dedicated claim-reality reconciliation artifact".** Under v26 it fires only when the
  repository itself names a claim-reconciliation artifact and that path is absent from its tree
  (S-A5). The name may appear as a relative link or code-span path in the README, a top-level
  `docs/` page or `CONTRIBUTING.md`, or as a path in a GitHub Actions workflow step. Its basename
  must be `claim` or `claims` with `reconciliation`, `register` or `ledger`, and an optional
  `reality` between. The finding names the path and cites the declaring line. A present
  Cejel-format artifact is unchanged: evidence and `reconciliation_artifact_depth` credit as before.
  A path a workflow step writes or uploads is that step's output, not a declaration: a path after
  `>`, `>>`, `tee`, `-o` or an `--out…` option on its line (or on a `\` continuation of that line),
  and anything in an `actions/upload-artifact` or `actions/download-artifact` step, declares
  nothing. A step that only reads the path still declares it.
- **A2, "tenant-scoped schema without row-level-security policies".** Under v26 it fires only when
  all three hold: the data layer's SQL contains an `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`
  statement (T-1); a `CREATE TABLE` defines a tenant column under a readable name (T-2); and no
  `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY ... ON` names that table, a later `DISABLE`
  counting as uncovered (T-3). It names the table and cites its `CREATE TABLE` line. A table a
  later migration in the same directory drops (`DROP TABLE`, with or without `IF EXISTS` or a
  schema) is no longer a candidate. A table a later `ALTER TABLE ... RENAME TO` renames keeps its
  coverage history and is named by its new name. Across directories there is no readable order, so
  a `DROP` or `RENAME TO` of the table there means it is not named. A `DROP` or `RENAME TO` whose
  name cannot be read, or one inside a string or dollar-quoted body, abstains on every table.
- **Otherwise each abstains:** no finding, and the ruling's sentence in the certificate's "What was
  not established". The abstention is never criterion-level `insufficient_data`.

**Metrics.** Under v26, amendment 1 applies the same principle to A5's
`reconciliation_artifact_depth`. When no Cejel-format artifact is present and the repository names
no claim-reconciliation artifact, the metric is not scored: it is omitted, and `claim_match_rate`
(0.5) and `claim_source_depth` (0.35) carry A5's score at those relative weights. The disclosure
sentence already says why, and the certificate adds nothing else. When the repository names an
artifact (absent or present), or a Cejel-format artifact is present, the metric is scored as before.
Every other metric is unchanged, including `rls_policy_count` and `tenant_scope_ratio`. ADR-0020's
general metric-class question stays open for every other metric and rubric.

**Direction, stated plainly.** v17 through v25 fire A2 only when no policy exists at all. v26 fires
only when policies exist and a tenant table lacks one. So under v26, A2 fires on a disjoint set of
repositories from v17's. A5 under v26 fires on far fewer repositories: only those that declare an
artifact they do not have. Where A5 abstains and names nothing, its score rises, because a 0 no
longer counts against it.

**Status rules are unchanged.** A5 has no calibrated status rule, so its status comes from its
findings when it has one and from its score band when it does not. Without amendment 1, removing
the v25 finding left an A5 score below 1.5 showing `critical` where v25 showed `warning`. With it,
that score is computed without the absence of Cejel's format. On this corpus no specimen's A5
status changes (table below). On a repository whose remaining A5 metrics still fall in the critical
band, `critical` is reported as it is, because the score is speaking.

**Measured on the behaviour corpus.** The corpus is unchanged at 22 specimens. The previous scanner
is `origin/main` `52565fb9`, where v26 scores exactly as v25 does. Every behaviour fixture
reproduced its committed head before anything was measured.
- **v17 through v25:** every report is byte-identical before and after: 198 of 198 corpus reports
  and 495 of 495 on the 55 synthetic fixtures.
- **v26:** 15 specimens move. The 7 that do not are `minimal-source-no-process`,
  `docs-only-repository`, `ava-live-assertions`, `public-digest-lookup`,
  `coverage-config-setup-cfg`, `coverage-config-maven-jacoco` and `coverage-command-go-ci`, where A5
  is not applicable or has insufficient data.
- **On all 15:** the v25 A5 finding is gone, `reconciliation_artifact_depth` is omitted, A5's
  status stays `warning`, and the verdict is unchanged. A5's score rises: 1.4 to 1.6 on 11, 1.7 to
  2.0 on 1, and 1.9 to 2.2 on 3. Code trust rises 0.1 on 10, and the overall score rises 0.1 on 6.
- **A2:** on 2 (`complete-node-service`, `privileged-migrations`, whose orders table is covered) A2
  gains only the disclosure sentence in its notes.

A5 status under v25 and under v26, on the 22 corpus specimens:

| Measurement | More severe under v26 | Less severe under v26 | Unchanged |
|---|---|---|---|
| Item 6 without amendment 1 (#482's `f372ef1d` synced with `52565fb9`, as `47867b72`) | 11 (`warning` to `critical`) | 0 | 11 |
| Item 6 with amendment 1 (this entry) | 0 | 0 | 22 |

Measured fingerprints:

| Rubric | Before (`52565fb9`) | After |
|---|---|---|
| `witan-rubric-v25-prospective-2026-10-12` | `sha256:2ce60ad90a956bf8b26372432b531fa7eaaa48eff8b11ef55ebaac81bc791c21` | unchanged |
| `witan-rubric-v26-prospective-2026-10-14` | `sha256:2ce60ad90a956bf8b26372432b531fa7eaaa48eff8b11ef55ebaac81bc791c21` | `sha256:e1fa40eb65bbfa777affea7951850b9d4c5302a08008a9af172f704f06621312` |

v26's A5 component pin moved, as did the report components of the 10 specimens whose code-trust
score moved. No other rubric's fingerprint or pin changed. v25 and v26 are no longer behaviourally
identical on the behaviour corpus, so the fingerprint guard's declared collision is removed in this
change. An earlier draft of this entry cited
`sha256:b157f45f873973cdd296199b13dc464727e2c72dc58d56eddf740e061d9f0ca8`, measured on the 19-specimen
corpus without amendment 1. It was never released and is superseded.

**Report format.** No new `report.json` field. Under v26 the abstention sentence travels in the A2
and A5 criterion `notes` every report already has, and the certificate lifts it from there. Where
amendment 1 applies, A5's `metrics` array has two entries instead of three. v26 `report.json` and
certificate bytes change.

The synthetic suite, the choices made where the ruling is silent, and the guard-deletion table are
in `docs/reviews/v26-a5-a2-settling-evidence-2026-10-14.md`.

## 2026-10-14 — A1 coverage-configuration recognition (every rubric, no identifier bump); public paired rescore not run

**Status.** A recognition fix that removes a false absence. It ships under
`witan-rubric-v17-2026-07-24` and every selectable rubric with no identifier bump and with weights
and thresholds unchanged, as #459, #427, #430 and the workspace-scripts fix above did. **The
public-corpus before-and-after has not run.** The release that carries this change runs a
preregistered public delta, and the operator's private check precedes that release. This entry
makes no statement about a public-corpus score, verdict, rank, placement, coverage, calibration,
precision or recall.

**The defect.** A1 reports "Test suite files are present, but no coverage configuration was
detected" when its coverage classifier matches nothing. The match result is real; the conclusion
was wrong wherever coverage is configured somewhere the classifier did not look. Under every
rubric except v23, that included:
- coverage flags on reachable test commands, which v23 alone recognized;
- configuration files each tool documents but the classifier did not read.

**The change.**
1. **v23's command-flag recognition now runs under every rubric**, together with its disabled-value
   rules and its unresolved-reachability abstention ("the no-coverage absence claim was withheld").
   Under every rubric except v23 it is added to the v17 coverage heuristics, never substituted for
   them, so it can withdraw an absence but cannot assert one. Two v23 behaviours could assert a
   finding, so they stay v23-only:
   - v23 replaces those heuristics instead of adding to them;
   - v23 counts a just/Make `test:` recipe as a configured runner.
   v23's own behaviour on the existing corpus is unchanged.
2. **Documented configuration locations**, each from the tool's own documentation:
   - `.codecov.yml` / `.codecov.yaml`;
   - `.nycrc`, `.nycrc.json`, `.nycrc.yml`, `.nycrc.yaml`;
   - `.c8rc`, `.c8rc.json`;
   - `setup.cfg` / `tox.ini` `[coverage:run]` / `[coverage:report]`;
   - a `package.json` `"jest"` key with `collectCoverage: true`, `coverageThreshold` or
     `coverageProvider`;
   - `vite.config.*` `test.coverage`, under v23's disabled-value rules, and only when no sibling
     `vitest.config.*` overrides it;
   - `.simplecov`;
   - a `phpunit.xml(.dist)` `<coverage>` element;
   - JaCoCo applied as a plugin in `pom.xml` (not via `<pluginManagement>` alone, not skipped) or
     `build.gradle(.kts)`;
   - `tarpaulin.toml` / `.tarpaulin.toml`.
   Commented-out, disabled and misnamed forms do not count. A coverlet package reference in a
   `.csproj` was a candidate and is **not** recognized: coverlet's own documentation says a
   reference collects nothing, and `dotnet new xunit` adds one by default.
3. **Coverage flags on test commands**, under the same flag-ownership rules:
   - `python -m pytest --cov` (joining `pytest --cov`);
   - `go test -cover` / `-coverprofile` / `-covermode` / `-coverpkg`, but nothing after `-args`;
   - `dotnet test --collect "XPlat Code Coverage"` / `"Code Coverage"` and
     `/p:CollectCoverage=true`, but nothing after `--`;
   - `cargo llvm-cov`, except `report`, `clean`, `show-env`, `run` and `--no-run`.
4. **Pattern sets.** The A1 no-coverage finding's derivation names the widened matcher family.
   `cejel.core-a1.coverage-configuration.v1` (10 branches) and `.v2` (14, v23) are retired for
   `.v3` (29) and `.v4` (25, v23).

**Expected direction on the public delta.**
- **A1, every rubric: up or unchanged, never down.** A repository moves only if it configures
  coverage in one of the recognized ways and the previous detector saw none of it. Then:
  - the info-severity no-coverage finding disappears, or is withheld with the unresolved note;
  - `verification_script_ratio` can rise by one when a coverage command is newly recognized below
    the cap;
  - `coverage_percent` can rise from 0 when a newly read file states a threshold, for example
    `fail_under`.
  Legacy coverage files keep their order ahead of the additions, so a value the previous detector
  read is unchanged.
- **No other criterion reads the classifier.**

**Measured on the behaviour corpus.** Three synthetic specimens extend the corpus from 19 to 22:
- `coverage-config-setup-cfg`: a `[coverage:report]` section with `fail_under = 85`;
- `coverage-config-maven-jacoco`: JaCoCo in `<build><plugins>`;
- `coverage-command-go-ci`: `go test -race -coverprofile=coverage.out ./...` in CI.

The previous scanner is `origin/main` `e43ab760`, run on the same expanded corpus. All 22
fixtures reproduce. 220 specimen/rubric surfaces were compared, and 39 moved:

| Specimen | Rubrics | A1 | A1 info findings | Metric | Overall |
|---|---|---|---|---|---|
| `complete-node-service` (existing) | all but v23 | 2.2 → 2.4 | 1 → 0 | `verification_script_ratio` 3 → 4 | unchanged; v25/v26 3.0 → 3.1 |
| `coverage-config-setup-cfg` | all ten | 2.1 → 3.1 | 1 → 0 | `coverage_percent` 0 → 85 | 1.6 → 2.1 |
| `coverage-config-maven-jacoco` | all ten | 2.1 → 2.1 | 1 → 0 | none | unchanged |
| `coverage-command-go-ci` | all ten | 2.1 → 2.3 | 1 → 0 | `verification_script_ratio` 1 → 2 | 1.2 → 1.3 |

**One existing specimen moves, by design.** `complete-node-service`'s test script is
`vitest run --coverage`. v23 already credited that reachable flag, and every other rubric fired a
false no-coverage absence on it. Code trust rises 0.1 under each of the nine rubrics that move.
The other 18 existing specimens are identical under all ten rubrics (180 of 180).

Measured fingerprints:

| Rubric | Previous scanner, expanded corpus | This change |
|---|---|---|
| `witan-rubric-v17-2026-07-24` | `sha256:9aa13057b01a5552d89aae0bdb3b28dbdaf40627ea07ee061087d6159de18d11` | `sha256:8492999e2ebd981bfd02b63c13217e012d6979c0365017e73be292b8d9dcc03d` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:7161f55209efac92744363f2e92937cbb7c6ce72f6bcd3847cf22e37b336a63d` | `sha256:65a1d857eb62f6c22567ae2758c080b6383b6503ecae6e970f043e7245ee2846` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:6aa3e1a198a4a76a6f14090827e603ef7ccac6492495763edad30c59f02eae07` | `sha256:15752e967183076da2dfa5aab13bd373a2524874cf874cc61709b9e793d44f23` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:7f64e5745fe08edcc5118bcdcf569d48f1661e4cc9b60d072c304a5409955fb2` | `sha256:20012a811d24bd3e4ca3ae2139a9aa7f9da739916eea4c954822fdfcee00b682` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:868c9b29adac64d522d764853d17eb28ac8235925aba525e93d28f177804f543` | `sha256:13d6a8f8c0b49c7f895e7307f5ac2287f9f7b2202120c3339d822e195be3c6b7` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:936fc59ab474d4a7e7b5c697932a5c652c04236c9644fb47e813df52a7328246` | `sha256:da495e0290df89b2c0e5454bd395e59c5bd5dc98e506418b00b0277322240787` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:00f2df4fc9c07d45a6fbdfed165e9168480c7ad09a7a0fc4e3c6e44b8a843b7b` | `sha256:f4a17960b210013e615e93ea1d7333f73879f1a0aed7c80494929760c8e72aef` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:329efec2cedd6b0f6c5109a812ebf6d5af1b6d1e007fb128877a33d068aa5efc` | `sha256:eff4e6d1ad95583923563cf5548db96bd9ab5b133e7d876807993dc7abc07bd1` |
| `witan-rubric-v25-prospective-2026-10-12` | `sha256:4a934741cb8cad0a9cd10231388c60f245ddcea8abdfe92fa21810f127ab9cf1` | `sha256:2ce60ad90a956bf8b26372432b531fa7eaaa48eff8b11ef55ebaac81bc791c21` |
| `witan-rubric-v26-prospective-2026-10-14` | `sha256:4a934741cb8cad0a9cd10231388c60f245ddcea8abdfe92fa21810f127ab9cf1` | `sha256:2ce60ad90a956bf8b26372432b531fa7eaaa48eff8b11ef55ebaac81bc791c21` |

The middle column separates the two causes. Adding the specimens alone moves each fingerprint from
its previous pin to the middle column; the scoring change then moves it to the right-hand column.
The same measurement without the new specimens reproduces every previous pin exactly on
`e43ab760`, for example v17's
`sha256:79fe791e46563e2b8524fbc92ab0acab4dc67946870083a4b42186a9e3799bbf`. On this change it
reproduces v23's alone, `sha256:6410874e6fb44c1ac29b3fcac49c57799a2eb13bd50444c3a7ce93ebf556577f`.
v25 and v26 still collide, as declared.

Re-pinned, with no pinned v17 metric moved on any of them:
- **The v17 golden.** Two of its fixtures carry the no-coverage finding, so restoring the previous
  fingerprint and v1/10 on that one derivation reproduces each previous pin byte for byte.
- **The F2 reads-disclosure pins and the CLI byte pin.** Restoring the previous fingerprint alone
  reproduces each previous pin.
- **The v17/v22 byte-stability fixture.** It runs `vitest run --coverage`, so its A1 signal moves
  and nothing else does: its output outside A1 is byte-identical to `e43ab760`'s, and restoring
  the previous A1 signal reproduces its previous pin.

All of these recoveries are asserted in the tests. Record:
`docs/reviews/coverage-config-recognition-2026-10-14.md`.

## 2026-10-14 — A3 and B3 read declared workspace package scripts (every rubric, no identifier bump); public paired rescore not run

**Status.** A recognition fix that removes a false absence. It ships under
`witan-rubric-v17-2026-07-24` and every selectable rubric with no identifier bump and with weights
and thresholds unchanged, as #459, #427 and #430 did. **The public-corpus before-and-after has not
run.** The release that carries this change runs a preregistered public delta, and the operator's
private check precedes that release. This entry makes no statement about a public-corpus score,
verdict, rank, placement, coverage, calibration, precision or recall.

**The defect.** In npm, yarn and pnpm workspaces the root `package.json` often only orchestrates,
and the scripts live in the workspace packages. Two checks read the root alone:
- B3 `ci_script_depth`'s package-script component, under every rubric including v17;
- A3's "A deployable service package manifest declares neither a build nor a typecheck script"
  finding, under v20 through v26 (v17-v19 do not carry it).

**The change.** Both now also read the `package.json` of each package the workspace declares: the
root `package.json` `workspaces` field (array, or yarn's `{ packages }` form) and a root
`pnpm-workspace.yaml` `packages:` list. Globs are expanded against the tracked file list, with no
filesystem walk, and `!` negations are honoured. Each manifest must pass A1's authored-production
predicate, so vendored, generated and test trees never count. At most 64 patterns and 200
manifests are read. With no declaration nothing changes: workspaces are never inferred from
directory shape.
- B3 counts a script category once when the root or any declared package declares it, with `test`
  still needing a credible runner. The metric line states how many declared manifests were read.
- A3's finding no longer fires when any declared package declares `build` or `typecheck`. When it
  does fire, it still cites the root manifest, and its evidence label states how many declared
  manifests were read. A read cut short by the cap does not assert the absence.
- A3's `prod_readiness_primitives` "build or type-check command" component still reads the root
  alone, so v17 A3 does not move. B3's evidence gate is unchanged.

**Expected direction on the public delta.**
- **B3, every rubric including v17: up or unchanged, never down.** A repository moves only if it
  declares workspaces and a declared package holds a `test`, `lint`, `typecheck` or `build` script
  its root lacks. A low-depth B3 warning can disappear with it.
- **A3, v20 through v26: the manifest finding stops firing on such repositories.** The v20
  explicit-gap findings are one `if / else if` chain: (1) a manifest without a build or typecheck
  script; else (2) a runtime Dockerfile without an active HEALTHCHECK; else (3) an HTTP entrypoint
  without a health route. When branch 1 stops firing on a workspace monorepo, branches 2 and 3 start
  running there. So a repository can trade the manifest finding for the HEALTHCHECK or the
  health-route finding, keeping the same info-finding count, or lose the finding outright. The chain
  is not restructured; `workspace-package-scripts.test.ts` pins the HEALTHCHECK case under v20-v26.
- **A3, v17-v19: unchanged.**

**Measured on the behaviour corpus.** One synthetic specimen, `workspace-package-scripts`, extends
the corpus from 18 to 19: a root that declares `workspaces: ["packages/*"]` and holds only a `start`
script, a package holding `build` and `test`, and a CI workflow that runs neither. The previous
scanner is `origin/main` `6bf2d929`, run on the same expanded corpus. All 18 earlier specimens
reproduce, and their projected scoring surfaces are identical before and after under all ten
selectable rubrics (180 of 180 pairs). Only the new specimen moves:

| Rubric | B3 | `ci_script_depth` | A3 info findings | Overall |
|---|---|---|---|---|
| v17, v18, v19 | 0.6 warning → 1.5 verified | 0 → 2 | unchanged | 0.9 → 1.1 |
| v20 through v26 | 0.6 warning → 1.5 verified | 0 → 2 | 1 → 0 | 0.9 → 1.1 |

Process trust moves 1.1 → 1.6 under every rubric, and B3 loses its one warning finding.

Measured fingerprints:

| Rubric | Previous scanner, expanded corpus | This change |
|---|---|---|
| `witan-rubric-v17-2026-07-24` | `sha256:58667d880b9d2fee1196eeba30a1ed93a1abacccdcde2f118e51766c618b4185` | `sha256:79fe791e46563e2b8524fbc92ab0acab4dc67946870083a4b42186a9e3799bbf` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:514403c89aa0f88eac1565bfec0a22763e7f2d7096025af841c9c17a84305fbf` | `sha256:161d7686d22536f6287904ae1d34bfa106200c1bab9b3b357117745da3446124` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:e5fb794bb5c25b39f3f05010a5bc23ba7ee50f5e9b535cd885c04eadaf636863` | `sha256:b6e0002bcfe14c71c0ac831e0788f93ebf4c56215f7dccd4c981a23fb59f78e1` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:eac898bef8bca4ed355e7133fd6671cbf5acfed521102b1c5cdf505a2a118824` | `sha256:d972019b19dccf58f7dab985c6ef89faa3e3bba73c2f5ff8373f7854ba13c3c7` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:358ca99eac3e7ffe3f0c45d0bd9589030deef8d53847145cb882f6644b989aff` | `sha256:f25bb1f6984d6de87121f2aaf5535a45ff24f08af4b2b508b504017668e4bad9` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:1e62d3c4409ad5e7e54de8d0c14fd004231176a9de199d9b3b584f6bee8a10a7` | `sha256:3efa6907cf365294e4180332d4d55685532f3beb59454ae73856c9360028389c` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:87ee18c9bf076d80f6601ab8ed06566228ba6ba6a28eb0a270f5230c7f9d3303` | `sha256:6410874e6fb44c1ac29b3fcac49c57799a2eb13bd50444c3a7ce93ebf556577f` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:c2c68af7045917750ec6afd3a04c7973f45eb395dfa070bcbb37258dd13a6d42` | `sha256:323fca138becf8a0738dd81023101e87ec341a7083ad9797b8cee5581e342ff0` |
| `witan-rubric-v25-prospective-2026-10-12` | `sha256:00739597347afd6e741dc5f4635726c27300987e110132d6b2e808cb75af4bfc` | `sha256:909235faa0171fd3201c58d1024283259db0b0916c809557df9fb491282a99e3` |
| `witan-rubric-v26-prospective-2026-10-14` | `sha256:00739597347afd6e741dc5f4635726c27300987e110132d6b2e808cb75af4bfc` | `sha256:909235faa0171fd3201c58d1024283259db0b0916c809557df9fb491282a99e3` |

The middle column separates the two causes. Adding the specimen alone moves each fingerprint from
its previous pin to the middle column; the scoring change then moves it to the right-hand column.
The same measurement without the new specimen reproduces every previous pin exactly, for example
v17's `sha256:6a31f7cb96ebf17046ba0620d74b1fadb66582c4b4ae5cb0b5af04480df6dbf2`. v25 and v26 still
collide, as declared. The v17 golden, the F2 reads-disclosure pins and the CLI byte pin are
re-pinned. No pinned v17 metric moved on any of them, and restoring only the previous fingerprint
reproduces each previous pin byte for byte, asserted in the tests. Record:
`docs/reviews/workspace-package-scripts-2026-10-14.md`.

## 2026-10-14 — prospective v26 declared as v25's complete closure; no scoring change, no repository moved

**Status.** A new prospective identifier, `witan-rubric-v26-prospective-2026-10-14`, with no
scoring change of its own. Explicit opt-in only (`--rubric-pin`), like every rubric after v17: the
public default stays `witan-rubric-v17-2026-07-24`. **Declared with no precision or recall claim;
no public paired rescore has run.** The public board is scored under v17, which does not move, so
no published score, verdict or rank moves: no repository moved.

**What v26 inherits.** v25's complete closure: the v22 chain (v17's detector closure, v18's native
RLS evidence, v19's commit-year freshness, v20's A3 explicit gaps, which include the Dockerfile
`HEALTHCHECK` finding, v21's executed escalations and v22's package-start entrypoint) plus v25's
inline health-route credit in `prod_readiness_primitives`. Every rubric-version gate in
`src/witan/repo-signals.ts` and `src/witan/scoring.ts` that names v25 also names v26: 11 sites
before this change named v25 and none named v26, and 11 name both after it.

**What v26 does not inherit.** v23's four mechanisms and v24's A2 secret content context. Those
gates still name v23 or v24 alone, for the reason v24's and v25's declarations give. A v23
mechanism that should apply more widely is extended by its own change.

**Why a new identifier with no change.** v26 is the next calibration candidate that v25's
declaration anticipates. Recognition fixes that remove a false absence ship under every selectable
rubric with no identifier bump, as #459, #427 and #430 did, so v26 carries them through the closure
it inherits. The one change planned under v26 alone is definitional: the A5 no-reconciliation and
A2 tenant-without-RLS findings fire only on the evidence a signed ruling names, and otherwise
abstain with a disclosure. It is gated on v26 and measured against a v26 that scores exactly as
v25 does, so its delta is that change alone.

**Measured, not declared.** On every behaviour-corpus specimen the v26 report equals the v25 report
in every field except `rubricVersion`, with and without ingested signals
(`src/witan/__tests__/v26-v25-parity.test.ts`). The behaviour fingerprint excludes the rubric
identifier by design, so v26's equals v25's, and its component pins are byte-identical to v25's:

| Rubric | Fingerprint |
|---|---|
| `witan-rubric-v25-prospective-2026-10-12` (unchanged) | `sha256:31a751882d02c8f053dcc8f3e90b3e4ecd57279f3250e420e95a3af875b9f019` |
| `witan-rubric-v26-prospective-2026-10-14` (new) | `sha256:31a751882d02c8f053dcc8f3e90b3e4ecd57279f3250e420e95a3af875b9f019` |

`witan-rubric-v25-prospective-2026-10-12` and `witan-rubric-v26-prospective-2026-10-14` are behaviourally identical on the behaviour corpus, by declaration and by measurement.
The fingerprint guard's check that every selectable rubric is distinguishable from every other
now takes this pair as its one declared exception, and requires the measured collisions to equal
the declared ones exactly. The first v26 item change that separates them fails that check until
the declaration is removed. No other rubric's fingerprint or pin changed; v17's is
`sha256:6a31f7cb96ebf17046ba0620d74b1fadb66582c4b4ae5cb0b5af04480df6dbf2`, as before.

## 2026-10-13 — AVA assertion evidence and public digest false assertion (#427, #430)

Default v17 and all selectable rubrics change under their existing identifiers. Weights and
thresholds are unchanged. A1 now credits AVA assertions in active inline callbacks registered
through an imported AVA runner. Skipped/todo callbacks, comments, strings, unrelated context
objects and assertions solely in nested unused functions do not earn this new credit. Macros
and non-inline callback references remain outside this bounded recognition rule.

A2 no longer treats a bare digest identifier as secret comparison evidence. Public content
hashes and lookup identifiers are digests too. HMAC/MAC/signature names, including hmacDigest,
remain covered. An authentication digest named only digest now needs other evidence to be
recognized; this narrowing favors avoiding a false assertion over inferring secret semantics.

Two synthetic public-idiom specimens extend the behaviour corpus from 16 to 18. Against main
b673493 on the same expanded corpus, every original specimen is unchanged in every rubric;
only the two new specimens differ. Under v17, ava-live-assertions moves A1 1.5 to 2.1,
non_hollow_test_share 0 to 1, overall 1.4 to 1.5. public-digest-lookup loses its false warning;
A2 becomes not_applicable from 2.3/warning, overall 1.1 to 0.9. The latter illustrates a
composite denominator change, not a claim that a false-assertion fix must raise the headline.

The public-corpus paired run is complete under the successor preregistration at c7af18f.
All 23 public rows completed in all three arms, with no score or modeled placement changes
from #459 or these fixes. The only report-byte difference is the fingerprint line. Full scalar
rows and exact byte comparisons are in
`docs/experiments/v17-delta-459-427-430-successor-2026-10-13/result.md`. The original partial
protocol and its source-correction erratum are retained. No private material was evaluated or
published; no precision, recall or calibration claim follows from this delta.

Measured fingerprints (the expanded corpus is independently recomputed by CI):

| Rubric | Fingerprint |
| --- | --- |
| `witan-rubric-v17-2026-07-24` | `sha256:6a31f7cb96ebf17046ba0620d74b1fadb66582c4b4ae5cb0b5af04480df6dbf2` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:9c54aa1493ff42b001ae2d1828f4bda92b3ebff500551eb36ef8a2b9d2fc391f` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:ed3fa7ff11aa0c0ecf7fc23fccab2c40337c55c5b06abae14eb10e9d73bbcffa` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:eb6ed39afd0e3f3d73e6a85df90787a3490087eaa34aad19fb5fbb31b4502ce5` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:7a890ac663793f807e240e38047ff9fbc069853d118ebf9a765cc103a8bed2a3` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:ac4db093dc7c37369579b49ccd7855d36eec49d9f52136964251ee7bbd69e101` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:7d48de4ac8ef3233e7ef8f4d4312830bf76294485e9766a47a671cd5440676aa` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:0af37b616891a1940f7ba43c86ef2134d6e40f235feef17bf1774cae951afee2` |
| `witan-rubric-v25-prospective-2026-10-12` | `sha256:31a751882d02c8f053dcc8f3e90b3e4ecd57279f3250e420e95a3af875b9f019` |

**2026-10-13 completion note for #459:** the preregistered successor public delta above
measured zero score and modeled placement changes on 23/23 public rows. The historical
2026-10-12 statement below records that the run was still owed at that time.

## 2026-10-12 — A3 error-handler shape widening (all rubrics, no identifier bump) and prospective v25; public paired rescore not run

**Status.** Two changes, recorded together because one corpus fixture and one re-pin carry both.
**The public-corpus before-and-after has not run for either.** This entry makes no statement about
a public-corpus score, verdict, rank, placement, coverage, calibration, precision or recall.

**1. Behaviour change under every selectable rubric, no identifier bump, direction up.** A3's
Express error-handler shape pattern (`EXPRESS_ERROR_MIDDLEWARE_PATTERN`) now also matches a
leading underscore on the second and third parameter (`(err, _req, res, next)`,
`(err, req, _res, next)`) and one trailing comma after the fourth parameter and its optional type
(`(err, req, res, next,)`, Prettier's default for a multi-line parameter list). Both are ordinary
lint and formatter output. The change adds recall to `prod_readiness_primitives`' `error boundary`
component only. It is not gated on rubric version, like the #433 fix, because a missed credit for
a real handler is wrong under every rubric. The named-parameter rule, the reachability requirement
(`.use(` or an export, outside comments), the test/fixture exclusion and the three-parameter limit
are unchanged; fixtures D6, D7 and D8 in `a3-error-boundary-idioms.test.ts` pin a never-registered
stub, a stub in a test file and a commented-out registration as still uncredited.

**2. Prospective rubric `witan-rubric-v25-prospective-2026-10-12`.** Explicit opt-in only, like
every rubric after v17: the public default stays `witan-rubric-v17-2026-07-24`. It inherits the
complete v22 closure (not v23, not v24, for the reason v24's declaration gives) and adds one
mechanism: the `prod_readiness_primitives` "health or readiness signal" component also credits a
route matched by `V20_HEALTH_OR_READINESS_ROUTE_PATTERN`, with comments stripped, in a file that
passes `healthReadinessRouteReads`, the file-selection test the info-severity
`health_readiness_route` finding already uses. No new pattern; every negative case that finding
guards (outbound URLs, tests, README, query strings, bare keyword literals) is exercised against
v25 in `a3-health-route-idioms.test.ts`, plus a commented-out route. Under every other rubric the
component stays filename-only by design (a dedicated health or readiness file, a Dockerfile
`HEALTHCHECK`, Kubernetes probes), so a route declared inline in an application file earns nothing
there. **Declared with no precision or recall claim; the public paired rescore has not run.** It is
batched as its own rubric rather than shipped alone because the next calibration should take it
together with other recognition changes, so it is calibrated once.

**Also in this change, no score moves.** The `healthReadinessRouteReads` file selection, which feeds
the info-severity `health_readiness_route` finding (v20 onward) and v25's credit, now also admits
a repo-root `server`/`index`/`app`/`main` file and a `server/`, `backend/` or `api/` tree. Because
the same predicate decides which withheld files a signal would have read, a withheld oversized file
in those locations is now disclosed as admitted by that signal under v20 onward
(`withheld-paths-always-disclosed.test.ts`, v23 row). The certificate and README now state which
forms count as a health or readiness signal and that an inline route does not under the calibrated
rubric. That is presentation: the glossary text is not part of `report.json`.

**Measured mechanically on the sixteen-fixture corpus**, scoring at the guard's fixed `generatedAt`.
"Previous" is `origin/main` `988721e`, run on the same fixtures.

| Fixture | Rubric | A3 previous → now | `prod_readiness_primitives` | Overall previous → now |
|---|---|---|---|---|
| `complete-node-service` | v17 | 1.6 → 2.0 | 3/6 → 4/6 (error boundary 0 → 1) | 2.8 → 2.9 |
| `complete-node-service` | v18–v24 | 1.6 → 2.0 | 3/6 → 4/6 (error boundary 0 → 1) | 3.0 → 3.0 |
| `complete-node-service` | v25 | n/a → 2.4 | 5/6 (error boundary 1, health 1) | 3.0 |
| `inline-health-route-and-prettier-handler` (new) | v17–v24 | 0.4 → 0.7 | 1/6 → 2/6 (error boundary 0 → 1) | 1.3 → 1.3 |
| `inline-health-route-and-prettier-handler` (new) | v25 | n/a → 1.1 | 3/6 (error boundary 1, health 1) | 1.4 |

- The two moves under v17–v24 are the error-handler widening alone. `complete-node-service` already
  declared `(err, _req, res, _next)`; the new fixture declares the Prettier multi-line shape.
- v25 differs from v22 on **A3 only, and only on the two fixtures that declare a health route
  inline in an application file**; it is byte-identical to v22 on every other criterion and fixture,
  with and without ingested signals (`v25-v22-non-a3-parity.test.ts`).
- **Re-digesting the first fifteen fixtures with the previous detector would reproduce each
  rubric's previous component pins except A3 on `complete-node-service`.** No other pre-existing
  fixture moved under any rubric.
- The two goldens that hash a whole v17 report (`src/__tests__/index.test.ts`,
  `v17-scoring-surface-golden.test.ts`) were re-pinned. None of their fixtures holds either shape.
  In each, restoring the previous v17 fingerprint in place reproduces the previous pin byte for
  byte, which is asserted mechanically.
- Every rubric's fingerprint moves, because a fixture was added *and* because the error-handler
  widening changed A3 on `complete-node-service` under v17–v24.

| Rubric | Previous fingerprint (2026-10-09) | Fingerprint from 2026-10-12 |
|---|---|---|
| `witan-rubric-v17-2026-07-24` (calibrated public default) | `sha256:2da86acf64c39d2edb7824df46250ea23c396264266a2cd925953e9c6ad25858` | `sha256:d621dcbbd44a47b2272417e85c9b60d0116471ce2833679728bcf1cef159bf23` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:60917d1d81efe7cda6f6adbfaa05293e2d9bf1db37b39d084e47f9011a996b67` | `sha256:f9609ec58bd64e771c3479ba9bcc63767d8770f5f5f3123898eb951da13da49f` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:e050ce8563de0736d9cfb6c23e2ba04725d88465d378a8632576269b9bc9f269` | `sha256:4715008e6148e8cd6a3753bbf3f21b04fc35c1cbb16bdf6f1118eceb5cb811ec` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:0433adc34b58c0fd5500a0bdeaa910c854eedbadbeaabb9045238d4ba9be8878` | `sha256:06e8576ff60188edec14993c796cd5a65b17218ef98b09302c5455eefe0b9f23` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:d3796b78a45ea3593f6abe71c77c2d00a0056d0f2d88476a01329dc342166aa6` | `sha256:e614248a22790a7da566ec90ac0dbcc930a24806b6753036ea10edf4b528f622` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:932bc09cbe555c6058a95be581ccf7a286c43887f90d32698f5273b7623824bf` | `sha256:643a5110761581aef265ce73dbe38d9325ed3058e6d6ff5d3c836fb727caf5d1` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:db97dc999d37e3c39c3bd3e4b1778c94eb9ad3176fb5c7d7264a7e510b162fc1` | `sha256:f7bace88af1acd1048639f2cb2747e0c51a928164de7716360de5ab61bb214be` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:e313fab25ae1779a11e86b23696881cd6f8fe2a845609dc93e2ff6f3ff8c16d5` | `sha256:df16c0bad617a38520033fd0196d2c1680b97bddaa18c93cac06187152519b8d` |
| `witan-rubric-v25-prospective-2026-10-12` | none (new) | `sha256:a7dfc0a75e34adc8566614422bbac4ed743d03086840513b4ab708ca43d92999` |

A certificate issued under v17 before this change carries `2da86acf…`, and one issued after it
carries `d621dcbb…`. The two describe **different** v17 scoring on a repository that holds the
error-handler shapes above: the pair (`rubricVersion`, `rubricBehaviourFingerprint`) differs because
behaviour differs.

**Not run, and owed.** The paired public-corpus delta at unchanged corpus commits for the
error-handler widening (the 0.4.9 precedent, #306) belongs to the next release card. No statement
is made here about which public rows will move. The v25 public paired rescore has not run and is a
prerequisite for any calibration or default-promotion claim.

## 2026-10-11 — board regenerated on 0.6.3: full-history clones and shared ranks; no rubric change

**Status.** A board method change, not a rubric change. No scoring rule, criterion, weight or
rubric identifier changes in this entry, and the behaviour fingerprint is not re-pinned. The
published board is regenerated with `@cejel/cejel@0.6.3` under `witan-rubric-v17-2026-07-24`.
Issue: #431.

**What changes in the method.**
- Public rows are scored on full-history clones: no depth limit, no blob filter. Earlier boards
  fetched one commit per public row, so A2's history pass and B2's pull-request merge ratio read
  a single commit. The clone-depth record (#448) measured that change alone on 0.4.9: no verdict
  changed, and overall moved by 0.1 on six of the 23 public rows.
- Rows with the same comparable score to one decimal share a rank (standard competition ranking).
  Earlier boards broke such ties by name.

**Preregistered and measured.** This regeneration's preregistration is #452 and its result is
#455; every preregistered value held.

**Before and after, every row.** "Before" is the published 0.4.9 board; "after" is this board.
Each change therefore combines the 0.6.3 scoring change recorded in the 2026-10-09 entry below,
the move to full-history clones, and shared ranks. No verdict changes. Four rows share first
place and four share tenth. fastapi enters the ranking because, under full history, A2 becomes
applicable and its coverage clears the floor.

**Cejel's own row is now marked low confidence.** It is measured on 2 of 6 process criteria, down
from 3 of 6, which puts it under the half-measured line. The criterion that dropped out is B6,
privileged-operation human gating. The 0.4.9 board scored it 3.3. Under the #433 evidence fix
released in 0.6.3 (#449), it is not applicable to this repository, because no privileged-operation
surface is detected. Clone depth is not the cause: the row records no history limitation, and full
history moved only B2 (4.0 → 3.8).

| row | overall | comparable | verdict | rank |
|---|---|---|---|---|
| axios | 3.3 → 3.3 | 3.2 → 3.2 | conditional → conditional | 2 → 1 |
| pydantic | 3.2 → 3.2 | 3.2 → 3.2 | conditional → conditional | 3 → 1 |
| vite | 3.4 → 3.4 | 3.3 → 3.2 | conditional → conditional | 1 → 1 |
| zod | 3.2 → 3.2 | 3.1 → 3.2 | conditional → conditional | 5 → 1 |
| fastapi | 3.0 → 3.1 | 3.0 → 3.1 | conditional → conditional | unranked → 5 |
| requests | 2.9 → 3.0 | 3.0 → 3.0 | conditional → conditional | 7 → 6 |
| svelte | 3.1 → 3.1 | 3.1 → 3.0 | conditional → conditional | 4 → 6 |
| biomejs | 3.0 → 3.0 | 3.0 → 2.9 | conditional → conditional | 6 → 8 |
| vue | 2.9 → 3.0 | 2.8 → 2.9 | conditional → conditional | 11 → 8 |
| flask | 2.9 → 2.9 | 2.8 → 2.8 | conditional → conditional | 8 → 10 |
| fmt | 2.6 → 2.7 | 2.7 → 2.8 | conditional → conditional | 12 → 10 |
| react | 3.0 → 3.0 | 2.8 → 2.8 | conditional → conditional | 9 → 10 |
| scorecard | 2.9 → 2.9 | 2.8 → 2.8 | conditional → conditional | 10 → 10 |
| esbuild | 2.5 → 2.6 | 2.5 → 2.5 | conditional → conditional | 13 → 14 |
| ripgrep | 2.1 → 2.1 | 2.1 → 2.1 | at_risk → at_risk | 14 → 15 |
| automapper | 2.2 → 2.1 | 2.1 → 2.0 | at_risk → at_risk | unranked → unranked |
| carddemo | — → — | — → — | insufficient_source → insufficient_source | unrated → unrated |
| cejel | 2.8 → 2.7 | 2.7 → 2.5 | conditional → conditional | transparency → transparency |
| cobra | 2.5 → 2.5 | 2.4 → 2.4 | conditional → conditional | unranked → unranked |
| django | 3.1 → 3.1 | 3.0 → 2.9 | conditional → conditional | unranked → unranked |
| express | 3.0 → 3.0 | 3.0 → 3.0 | conditional → conditional | unranked → unranked |
| guava | 1.9 → 1.9 | 1.8 → 1.8 | at_risk → at_risk | unranked → unranked |
| sinatra | 2.4 → 2.2 | 2.5 → 2.2 | at_risk → at_risk | unranked → unranked |
| the private row | 3.2 → 3.2 | 3.2 → 3.2 | conditional → conditional | transparency → transparency |

## 2026-10-09 — behaviour change under witan-rubric-v17-2026-07-24 (no identifier bump), direction down; public-corpus before-and-after not yet run

**Status.** This is a disclosed behaviour change under the existing calibrated public default,
made the way 0.4.11 was. It is **not a recalibration**, and the rubric identifier does not change.
It is **not gated on rubric version**, so it applies to every selectable rubric, v17 through v24.
Issue: #433.

**The public-corpus before-and-after is not yet run.** It will be preregistered as a separate
change before it is run, with this change's merge commit as its candidate arm. **This entry makes
no claim about any corpus row, score, verdict, rank, placement, coverage, recall or precision.**
Nothing below says that any published repository moved or did not move.

**What changed.** A positive credit names a file as evidence that a control exists. Cejel gave
that credit to text that only *describes* the control. Each change below removes such a credit.

1. **B6 `fail_closed_privilege_check` and `kill_switch_fail_safe_present` (direction: down).**
   Implementation evidence no longer comes from:
   - a test or fixture path (the shared production-source classifier);
   - a `calibration/` tree;
   - a match that lies only inside a comment. `//` and `/* */` comments are stripped, plus
     whole-line `#` comments in Python and Ruby.

   Before, any source file under `src/`, `app/`, `lib/` and similar qualified, tests included.
2. **A3 `prod_readiness_primitives`, error-boundary filename (direction: down).** The rule is
   anchored to a path segment, `(^|/)(error-boundary|error)\.(tsx|jsx|ts|js)$`. Unanchored, any
   file whose name ended in `error.ts`, such as `swallowed-error.ts`, was an error boundary. A
   `calibration/` path no longer counts. Test paths were already excluded under every selectable
   rubric.
3. **A3 `prod_readiness_primitives`, Express error-handler content check (direction: down).** The
   four-parameter handler shape must now lie outside comments. Before, only the registration half
   (#352) ignored comments, so a comment quoting `app.use((err, req, res, next) => …)` in any file
   that exported something was credited. Block comments are now stripped for both halves. A
   `calibration/` path no longer counts.
4. **B6 `human_gate_documented` and the documented-policy branch of
   `protected_path_review_gate` (direction: down).**
   - **Removed sources, each with its reason:**
     - Changelogs (`CHANGELOG`, `CHANGES`, `HISTORY`, `NEWS`, `RELEASE_NOTES`, `RELEASES`, and
       `.changeset/`, `changelog/` and `changelog.d/` directories). A changelog reports that
       something changed, often the detector itself. It does not state a policy.
     - Experiment and calibration records (`experiments/`, `calibration/`). They describe a
       measurement, not a governance rule.
     - Review notes (`reviews/`, `review-notes/`). They describe a review that happened.
     - Generated reports (`reports/`). They describe some repository's state.
     - Test and fixture trees. They are inputs to tests.
     - A committed Cejel Markdown certificate wherever it lies, recognised by its
       `# Cejel Trust Report` title and `- Rubric:` line. Its evidence labels quote the very
       phrases these detectors look for, about another repository.
   - **Kept:** every other `.md`/`.mdx` file. That includes README, SECURITY, CONTRIBUTING,
     governance, runbook, operations and ADR documents.
5. **CODEOWNERS location, B6 `protected_path_review_gate` and B2 `pr_trace_primitives`
   (direction: down).** A CODEOWNERS file counts only at the repository root, `.github/CODEOWNERS`
   or `docs/CODEOWNERS`, the three locations GitHub reads. A file of that name anywhere else gates
   nothing. In B2, the other name-shaped review-gate alternatives (`branch…protection`,
   `review…gate`) are unchanged.
6. **B6 protected-path evidence label (no score effect).** The label now names the branch that
   fired. A CODEOWNERS credit and a documented-policy credit carry different labels, where before
   both carried one fixed label. Evidence labels are outside the behaviour fingerprint.

**Direction, stated precisely.** Every change removes a credit, so each metric it touches can only
fall. Two criteria can also lose their only evidence:

- B6 decides whether a repository has a privileged-operation surface partly from the
  human-gate and fail-closed credits. Removing a false one can change which B6 metrics are scored
  and with what weight, or make B6 not applicable.
- B2 with no remaining evidence reports insufficient data.

A criterion that stops being scored leaves the composite denominator, so **a composite score can
move in either direction** even though no metric moves up. The synthetic fixture below shows one
such case under v17. Its overall falls from 1.6 to 1.0 and its verdict moves from `at_risk` to
`unverified`, because B6 (previously 4.0 on false evidence) becomes not applicable and B2 becomes
insufficient data.

**The behaviour fingerprint sees this change.** The 0.4.11 entry recorded that the fingerprint
could not see that release's v17 change, because the corpus held none of the shapes it acted on.
The corpus now gains one synthetic fixture, `control-described-not-built`, in which every control is
only described:

- the fail-closed check in a test file;
- the kill switch in a block comment;
- the error handler quoted in a `//` comment;
- `src/packs/swallowed-error.ts`;
- the human-gate phrase in `CHANGELOG.md`;
- the required-review phrase in a calibration review note;
- a CODEOWNERS file under `.github/workflows/`.

**Measured mechanically on the fifteen-fixture corpus**, scoring at the guard's fixed `generatedAt`.
The previous detector is `repo-signals.ts` at `origin/main` `7c9170f`.

- Under every one of the eight selectable rubrics, the previous detector and this one differ on
  exactly the criteria **A3, B2 and B6**.
- Under every rubric, the only report-level outcome that differs is the new fixture's.
- **Re-digesting the first fourteen fixtures alone reproduces every rubric's previous component
  pins and previous fingerprint byte for byte.** So no pre-existing fixture moved under this
  behaviour change, under any rubric. The 0.4.9 and 0.4.11 lesson holds: a v17 behaviour change
  is visible only on a shape the corpus contains.
- Every rubric's fingerprint moves, because a fixture was added *and* because v17–v24 scoring
  changed on that fixture.

| Rubric | Previous fingerprint | Previous detector, fifteen-fixture corpus | Fingerprint from 2026-10-09 |
|---|---|---|---|
| `witan-rubric-v17-2026-07-24` (calibrated public default) | `sha256:eabdc78425373baf23f50c23b0b025bae4116461f3bc5ddc7d5b8496df03f653` | `sha256:a9da3a3c4232fec0389c530c48047bb1e45390f072ab7c64ae8b392aa6bda7c9` | `sha256:2da86acf64c39d2edb7824df46250ea23c396264266a2cd925953e9c6ad25858` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:23cde3839b54875cf78eb8b4295779bc66327f7f5b331628a17839c2fb9562f1` | `sha256:aaeac89567146f026c5da650fef0de461b56cef3ab983010f41bb7e78e84f5a4` | `sha256:60917d1d81efe7cda6f6adbfaa05293e2d9bf1db37b39d084e47f9011a996b67` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:07e06ce68ba5ca365242f099e8860e1e466fa503dbcdac99986aab1e65c7c867` | `sha256:b162553c7765de58d6d4ca8cfce2b27034bf353bd6a45a65deeca0af21dea5a1` | `sha256:e050ce8563de0736d9cfb6c23e2ba04725d88465d378a8632576269b9bc9f269` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:4fb83b8972b76fb28cc6b59796f18ecfa16a37be52997c139f5cb14f60fd3717` | `sha256:a8eb836998b950e341b7241fa5c71d3c7906643e2bd55d3a8bac5bc15e46cbfe` | `sha256:0433adc34b58c0fd5500a0bdeaa910c854eedbadbeaabb9045238d4ba9be8878` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:009f82a0ccaae4e9efcb1bb33776bf6cff2f268ddb21db0fb43f4b505563f645` | `sha256:c78834129cfbf0a0700cb9f66329ae1b756e4811db7481abc9b3b036aa3cbbb0` | `sha256:d3796b78a45ea3593f6abe71c77c2d00a0056d0f2d88476a01329dc342166aa6` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:df8fcacf9a6f0d57c0ff00cafc51149e1bebafd3bec03f13316803b4ae27f0cc` | `sha256:b1f3986f6841054cae8caecc96704f36a46e44be8735144c8a973ae09c040be1` | `sha256:932bc09cbe555c6058a95be581ccf7a286c43887f90d32698f5273b7623824bf` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:01ec9f9057f649f4bc737dc2f972bcec227237416cda5a4255db2c23d874ec5c` | `sha256:663bce2a49743ba76a8bd1ae59f050c938cdae63af4fc95470d2b0e51c86bec0` | `sha256:db97dc999d37e3c39c3bd3e4b1778c94eb9ad3176fb5c7d7264a7e510b162fc1` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:4452f3b033552b7feb205048a07d6d851d1dc459a06f39befa86d22281e201fb` | `sha256:f079ec177015f3241cab883c80316df1c5e9a1a9a887e38585e901405b5953bc` | `sha256:e313fab25ae1779a11e86b23696881cd6f8fe2a845609dc93e2ff6f3ff8c16d5` |

The middle column is the number a build without this change would publish on the extended
corpus. It is recorded so the separation is visible, and it is not pinned anywhere. Two goldens
hash a whole v17 report: `src/__tests__/index.test.ts` and `v17-scoring-surface-golden.test.ts`.
Both were re-pinned, and none of their fixtures holds a #433 shape. In each, restoring the previous
v17 fingerprint in place reproduces the previous pin byte for byte.

A certificate issued under v17 before this change carries `eabdc784…`, and one issued after it
carries `2da86acf…`. Unlike the 2026-10-01 correction, the two describe **different** v17 scoring:
the pair (`rubricVersion`, `rubricBehaviourFingerprint`) differs because behaviour differs.

### Public-corpus before-and-after — measured 2026-10-09

The entry above is left as written. The preregistered run it announced has been performed:
`docs/experiments/v17-behaviour-delta-433-2026-10-09/` (preregistration `aab5647`, final wording
`cef7d30`; result beside it). Baseline `v0.6.2`, candidate #441's merge, all 24 corpus rows at
their pins, depth-1 public checkouts as on the published board. **All five preregistered expected
values held.**

- **Two public rows moved, as predicted.** cejel: B6 3.3 verified → not applicable (both false
  credits removed, none replaced); overall 2.8 unchanged. sinatra: B6 4.0 verified → not
  applicable and B2 `pr_trace_primitives` 3 → 2 with the B2 score unchanged; overall
  **2.4 → 2.2**, verdict at risk unchanged, unranked.
- **No other public row moved** at score, status or metric level, and **no ranked placement
  changed.** The baseline reproduced the published board on 24 of 24 rows.
- The private row's scores, statuses and metrics did not move; its B6 entry differs at byte level.
- `rubricBehaviourFingerprint` differs on all 24 rows; after removing each predicted field in its
  predicted direction, 21 public rows are byte-identical.

The full per-row table is in the result record. The published board changes with the 0.6.3
regeneration, which also moves public rows to full-history clones (#431).

## 2026-09-30 — v24 synthetic-corpus behaviour fingerprint; public paired rescore still unrun

`witan-rubric-v24-prospective-2026-09-15` was made selectable with its content-context A2
change but its required behaviour-fingerprint record was omitted. This repair adds the measured
component pins in `src/witan/__tests__/fixtures/behaviour-fingerprint-pins.json` and the digest
the certificate carries: `sha256:8ae71919e169fe58e7bd1496c77bc2ba836efa27ac86efc7f109d4169f9cd88b`.
The frozen synthetic corpus reproduced at its committed fixture heads and was scored at the
fingerprint guard's fixed `generatedAt` of `2026-09-15T00:00:00.000Z`.

This is an identity measurement for the committed synthetic behaviour corpus only. It is **not**
the v24 24-row public paired rescore, makes no statement about a public-corpus score, verdict,
rank, placement, coverage, calibration, precision, or recall, and does not say that no repository
moved. That preregistered run remains unperformed under
`docs/experiments/a2-secret-posture-content-context-v24-2026-09-15/preregistration.md`; its
one-shot result and complete before/after public-corpus delta remain required before any such
claim.

### Correction — 2026-10-01: the digest above measured v24 on the legacy scoring path

The entry above is left as written; this correction supersedes its digest. The v24 fingerprint
recorded above, `sha256:8ae71919e169fe58e7bd1496c77bc2ba836efa27ac86efc7f109d4169f9cd88b`, was a
faithful measurement of a defective build. It did not measure the rubric the v24
preregistration (`ef253a8`) defines, which is v22 exactly with only A2's current-tree
classification changed. Four rubric-version allowlists in `src/witan/scoring.ts` ended at
`WITAN_RUBRIC_VERSION_V23` and omitted V24: `usesV17DetectorClosure`, the signal-adjustment
status gate, `usesMetricScoring`, and the synthesized-finding gate. v24 therefore fell to the
legacy non-metric scoring path. Its component pins differed from v22's on nine criteria (A1 A2
A3 A4 A5 B2 B3 B4 B6) where only A2 should differ. They were identity pins, so they recorded
the defect rather than catching it. The harness card found it (cejel #378, `edfc12f`).

**Repair.** V24 is now in all four allowlists, in V22's position. A new guard,
`src/witan/__tests__/v24-v22-non-a2-parity.test.ts`, scores every behaviour-corpus fixture
under v22 and v24, both plain and with fixed ingested signals, and requires every criterion
other than A2 to be byte-identical. It was red on the unfixed tree. It turns red again if V24
is removed from any one of the four allowlists. `v24-declared-scope.test.ts` now also covers
`scoring.ts` and every `src/witan` v22 comparison.

**Why every fingerprint moved, not only v24's.** Once v24 took v22's scoring path, the thirteen
fixtures could no longer tell the two apart. v24's digest equalled v22's, so "distinguishes
every selectable rubric" failed. No fixture contained the shape v24 changes. The corpus gained
one synthetic fixture, `real-credential-in-docs`: a real-shaped credential committed under
`docs/`. v22's path exemption never reads it, and v24 flags it. A fixture changes every
per-criterion digest for every rubric. **For v17–v23 scoring did not change and this corpus
moved for another reason: a fixture was added.** That statement is mechanical. Re-digesting the
first thirteen fixtures alone reproduces each of v17–v23's previous component pins byte for
byte, and no existing fixture's report-level outcome moved under any rubric. For v24 against
v22 on the fourteen-fixture corpus, the only differing criterion is **A2** and the only
differing fixture is `real-credential-in-docs`. The two goldens that hash a whole v17 report
(`src/__tests__/index.test.ts`, `v17-scoring-surface-golden.test.ts`) were re-pinned. In each,
restoring the previous v17 fingerprint in place reproduces the previous pin byte for byte.

| Rubric | Previous fingerprint | Fingerprint from 2026-10-01 |
|---|---|---|
| `witan-rubric-v17-2026-07-24` (calibrated public default) | `sha256:ff0f01abe8c12daa60375d0e18c1aca4a1135a55ab2a80b15f4c037bfc18b4b1` | `sha256:eabdc78425373baf23f50c23b0b025bae4116461f3bc5ddc7d5b8496df03f653` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:abc35df0fdc0749aa941f47b295059d06c96dd9800af7f79cfef2bc8dae917da` | `sha256:23cde3839b54875cf78eb8b4295779bc66327f7f5b331628a17839c2fb9562f1` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:f670fa2cc44beef066fa38767bd587e1a16fb28b03bc904756daaea5a6465e96` | `sha256:07e06ce68ba5ca365242f099e8860e1e466fa503dbcdac99986aab1e65c7c867` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:9276ce2ce865c2d50c52882ee45bbf1df5fe3c8b6038858b4a147f7a4cedfa98` | `sha256:4fb83b8972b76fb28cc6b59796f18ecfa16a37be52997c139f5cb14f60fd3717` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:d86411a7fe108bba4d2b8fe7ff9d4f7f69a60f11ca0c5c3fef8e88f66a9af53a` | `sha256:009f82a0ccaae4e9efcb1bb33776bf6cff2f268ddb21db0fb43f4b505563f645` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:1bb57dd98d29b43b170f3a4f1c8b3b379b433a2aa9df0821ab9d5115f48cfb2f` | `sha256:df8fcacf9a6f0d57c0ff00cafc51149e1bebafd3bec03f13316803b4ae27f0cc` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:b558c0aa4b2f85b734bed2e077298fd55851a1086234d678f10a71cf913ec3cf` | `sha256:01ec9f9057f649f4bc737dc2f972bcec227237416cda5a4255db2c23d874ec5c` |
| `witan-rubric-v24-prospective-2026-09-15` | `sha256:8ae71919e169fe58e7bd1496c77bc2ba836efa27ac86efc7f109d4169f9cd88b` (legacy path) | `sha256:4452f3b033552b7feb205048a07d6d851d1dc459a06f39befa86d22281e201fb` |

A certificate already issued under v17 carries `ff0f01ab…`, and one issued after this change
carries `eabdc784…`. The two describe identical v17 scoring measured against different corpora;
the pair (`rubricVersion`, `rubricBehaviourFingerprint`) remains the comparable identity. **No
public-corpus run was performed.** For v17–v23 that is because scoring did not change. For v24
it is the same unperformed preregistered paired rescore the entry above names. This correction
says nothing about any public-corpus score, verdict, rank, placement, coverage, calibration,
precision or recall.

## 2026-09-25 — 0.4.11: behaviour change under witan-rubric-v17-2026-07-24 (no identifier bump); no corpus row moved

**Status.** Disclosed behaviour change under the existing calibrated public default. **Not a
recalibration**, and the rubric identifier does not change. **No repository in the published
corpus moved:** no score, verdict, rank, placement or coverage figure changed on any of the 24
rows. The comparison was **preregistered**. Three of its five expected values held, and two
failed. Neither failure concerns scoring, and both are recorded below as measured.

**What changed.** Three changes since 0.4.10 alter how a repository can score under
`witan-rubric-v17-2026-07-24`. None is gated on rubric version, so each applies to every rubric,
including the calibrated default.

1. **A2 database-URL userinfo credentials (#336, direction: down).** A populated
   `DATABASE_URL=postgres(ql)://user:password@…` in a non-template `.env`/`.env.*` file is now a
   committed-secret finding, in both the current-tree and the history scan, and is not
   double-reported when unchanged across the two. The password is judged by content: a
   placeholder-shaped password is not flagged. This change was also missing from the Unreleased
   section of `CHANGELOG.md` and is added there with this entry.
2. **A3 `prod_readiness_primitives` error-boundary idioms (#352, direction: up).** The content
   check for Express error-handling middleware now also credits a first or fourth parameter
   renamed `_err`/`_next`, a handler method on an `export class` registered via `.bind(this)`, and
   a handler file under a `server/` root with a `.mjs`/`.cjs` extension.
3. **A3 commented-out registration (#352, refined by #358, direction: down).** Reachability is now
   tested with `//` comments stripped, so a commented-out `// app.use(errorHandler);` no longer
   credits a handler that is never registered. #358 narrowed the strip so that the `//` of a URL
   scheme (`'https://…'`) is not treated as a comment, while a trailing comment after code still
   is. The first version of that refinement stripped only whole comment lines. That credited a
   dead stub behind a trailing comment, and it was caught and corrected before merge.

Three further changes in the same range **cannot move a score under the calibrated default**.
They are recorded so that the list above is not mistaken for the whole release, and each was
measured, not assumed inert. #353 widens the health/readiness-route idioms, which feed only an
info-severity finding emitted only under prospective rubrics. #351 adds the always-present
`withheldPaths` array (report format 1.3) and a disclosure sentence on every certificate. #331
adds signed issuance, outside the scan path.

**Measurement.** All 24 corpus rows at their pinned commits (`leaderboard/corpus.json`, sha256
`dc723f53…`, byte-identical to the corpus the 0.4.9 delta measured). Each was scored twice from
source with the calibrated default, with `generatedAt` fixed, on one machine: baseline `d2a8018`
(the `v0.4.10` commit, the current release) and candidate `5ae73b2` (main after #358). No scorer
source changed between `v0.4.9` and `v0.4.10`, so the baseline is also what 0.4.9 scored.
Canonical evidence and the harness:
`docs/experiments/v17-behaviour-delta-post-0.4.10-2026-09-23/`. The scoring comparison is in
`paired-result.json` and the byte-level comparison in `bytes-result.json`. Raw per-row reports
were kept locally and not committed, because the private row's report is not public. The public
rows' reports are reproducible from the harness. A non-preregistered confirmation re-run of the
same two arms on 2026-09-25 reproduced this scoring result exactly, as recorded under
"Confirmation run, 2026-09-25" in that directory's `result.md`.

**Preregistered.** `PREREGISTRATION.md` was committed as `12549c4` before either arm was scored.
It names both arms, the score-capable changes, the expected value for each, and the reason for
each expected zero, checked against the checkouts. It is a strict ancestor of the result commit.

**Why nothing moved, and why that is not a claim that nothing will.** A3 is `not_applicable` on
17 of 24 rows. Of the other seven, vite and the private row already match the error-boundary
filename convention, so the content check never runs for them. On the remaining five, the old and
new predicates disagree on **zero** files: the only files in the whole corpus with the
four-parameter handler shape are express test files, and express's A3 is not applicable. For
#336, the corpus contains no non-template `.env` file at all. Every change moves on the shapes its
own fixture suite pins (`database-url-userinfo.test.ts`, and `a3-error-boundary-idioms.test.ts`, whose 20 cases
include the D4/D5 dead-stub controls). A customer repository containing those shapes will
score differently on the next release than on 0.4.10, even though no board row does. This entry
is the disclosure for that.

**Expected values that failed, stated as measured.**
- **Board check.** Expected: the baseline reproduces the published board on 20 of 24 rows, as the
  0.4.9 entry recorded. Measured: **24 of 24**. The board was regenerated at 0.4.9 in cejel-site
  `026774b` on 2026-09-16, after that entry was measured, and the prediction relied on the older
  record without checking. The measured state is the better one: the published board now agrees
  with the current release on every row.
- **Withheld paths.** Expected: `withheldPaths` non-empty on 24 rows. Measured: **17**. The
  prediction treated `contentReadSummary.skipped` as the withheld count. `skipped` includes files
  excluded by extension, which are still walked and so are not withheld from any signal. The seven
  empty rows skip files only by extension.

**Byte level.** 0 of 24 reports are byte-identical, because every candidate report carries
`withheldPaths`. **With that one field deleted, every candidate report reproduces its baseline
report byte for byte on 24 of 24 rows.** So #351's field is the only difference between the arms,
as its PR stated and #358 turned into a test.

**The behaviour fingerprint did not see this change, as predicted.**
`rubricBehaviourFingerprint` is identical in both arms on all 24 rows. It is a committed constant
per rubric (`src/witan/rubric-fingerprint.ts`), and its synthetic corpus contains none of the
shapes these three changes act on, so a real v17 behaviour change passed under an unchanged
fingerprint. The 2026-09-16 entry below introduced that control to catch changes under a fixed
identifier. This is the first entry where it demonstrably could not, and the reason is fixture
coverage, the same cause as the 0.4.9 miss. **Operator decision, not made here:** whether the
fingerprint corpus should gain the `.env` database-URL and error-middleware shapes, which would
move the v17 fingerprint and require a re-pin cited in this file. Also undecided: whether
behaviour changes of this kind should force an identifier bump.

**Observed while checking, not a scoring change.** On biomejs, seven withheld paths carry two
reasons each, and the report shows only the alphabetically first. On esbuild,
`byReason.tooLarge` counts one more event than there are oversized tracked files. Both are
identical in the two arms. Details are in `result.md` beside the record.

**Measurement limits.** Public rows are depth-1 checkouts, as in the 0.4.9 and v19 protocols, so
history-dependent signals (A2's history scan, and with it #336's history half) see one commit in
both arms. The published `@cejel/cejel@0.4.10` npm artifact was not executed. The baseline is the
`v0.4.10` source commit.

**Full v0.4.10 → main delta under witan-rubric-v17-2026-07-24 (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Coverage | Board placement | Criteria that moved (score/status) | Metrics that moved |
|---|---:|---:|---:|---|---|---|---|---|
| react | 3 | 2.1 | 3.9 | Conditional | code_trust 5/5; process_trust 3/6 | 9 | none (report differs elsewhere) | none |
| vue | 2.9 | 2.4 | 3.4 | Conditional | code_trust 4/5; process_trust 3/6 | 11 | none (report differs elsewhere) | none |
| svelte | 3.1 | 2.9 | 3.3 | Conditional | code_trust 4/5; process_trust 3/6 | 4 | none (report differs elsewhere) | none |
| django | 3.1 | 2.6 | 3.6 | Conditional | code_trust 3/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| flask | 2.9 | 2.7 | 3 | Conditional | code_trust 4/5; process_trust 3/6 | 8 | none (report differs elsewhere) | none |
| fastapi | 3 | 2.8 | 3.2 | Conditional | code_trust 2/5; process_trust 3/6 | unranked | none (report differs elsewhere) | none |
| express | 3 | 2.8 | 3.2 | Conditional | code_trust 2/5; process_trust 3/6 | unranked | none (report differs elsewhere) | none |
| vite | 3.4 | 2.8 | 4 | Conditional | code_trust 5/5; process_trust 3/6 | 1 | none (report differs elsewhere) | none |
| esbuild | 2.5 | 2.6 | 2.4 | Conditional | code_trust 3/5; process_trust 3/6 | 13 | none (report differs elsewhere) | none |
| biomejs | 3 | 2.9 | 3 | Conditional | code_trust 3/5; process_trust 4/6 | 6 | none (report differs elsewhere) | none |
| requests | 2.9 | 2.4 | 3.4 | Conditional | code_trust 3/5; process_trust 4/6 | 7 | none (report differs elsewhere) | none |
| pydantic | 3.2 | 2.9 | 3.5 | Conditional | code_trust 3/5; process_trust 3/6 | 3 | none (report differs elsewhere) | none |
| axios | 3.3 | 2.6 | 3.9 | Conditional | code_trust 5/5; process_trust 4/6 | 2 | none (report differs elsewhere) | none |
| zod | 3.2 | 3.1 | 3.2 | Conditional | code_trust 3/5; process_trust 3/6 | 5 | none (report differs elsewhere) | none |
| scorecard | 2.9 | 2.2 | 3.6 | Conditional | code_trust 4/5; process_trust 3/6 | 10 | none (report differs elsewhere) | none |
| ripgrep | 2.1 | 2.1 | 2 | At risk | code_trust 3/5; process_trust 3/6 | 14 | none (report differs elsewhere) | none |
| guava | 1.9 | 1.6 | 2.2 | At risk | code_trust 3/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| cobra | 2.5 | 2.6 | 2.3 | Conditional | code_trust 2/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| sinatra | 2.4 | 2 | 2.8 | At risk | code_trust 2/5; process_trust 4/6 | unranked | none (report differs elsewhere) | none |
| automapper | 2.2 | 2 | 2.3 | At risk | code_trust 3/5; process_trust 2/6 | unranked | none (report differs elsewhere) | none |
| fmt | 2.6 | 2 | 3.2 | Conditional | code_trust 3/5; process_trust 4/6 | 12 | none (report differs elsewhere) | none |
| carddemo | scoreless | scoreless | scoreless | Insufficient source | code_trust 0/5; process_trust 0/6 | unrated | none (report differs elsewhere) | none |
| alfred | 3.2 | 3.1 | 3.3 | Conditional | code_trust 5/5; process_trust 4/6 | transparency | none (report differs elsewhere) | none |
| cejel | 2.8 | 2.3 | 3.2 | Conditional | code_trust 5/5; process_trust 3/6 | transparency | none (report differs elsewhere) | none |

## 2026-09-16 — the enforcement named above could not see the change it was written to catch

**Status.** No scoring change. This entry records a MISS in this changelog's own enforcement, and
the control added to close it. No repository's score, verdict, or rank moves because of anything
recorded here; the published corpus is untouched and was not re-scored. `WITAN_RUBRIC_VERSION`
does not change. What changes is what can be detected, and what a certificate discloses.

**The miss, stated plainly.** Until today the single enforcement this file named was a guard that
fails the build when `WITAN_RUBRIC_VERSION` changes without a matching entry here. That guard is
keyed on an identifier this project's own authors control. **A change to how Cejel scores a
repository, made under an unchanged identifier, is invisible to it — not by accident, but by
construction.** The guard is correct on its own terms and will never fire for that case.

This is not a theoretical gap. On 2026-09-15, five changes in the unreleased 0.4.9 altered scoring
under `witan-rubric-v17-2026-07-24` — the calibrated public default — with the identifier
unchanged. Two raised scores, one lowered them, two more widened detectors. The guard did not
fire. Nothing else noticed until a human compared two arms by hand. The entry immediately below
this one records that delta in full; this entry records that the control which was supposed to
compel that entry had no way of knowing it was needed.

The consequence is the one this product exists to prevent. Two certificates can both say
`witan-rubric-v17-2026-07-24`, be produced at the same revision by different tool versions, carry
different scores, and neither artifact nor the build record says why. The recorded defence against
a well-resourced clone is that the public calibration record gives certificates their meaning. A
record that cannot tell when behaviour changed is not a defence.

**What now detects it.** `src/witan/__tests__/rubric-behaviour-fingerprint.test.ts`, which never
reads `rubricVersion` to decide whether anything moved. It builds a committed corpus of thirteen
synthetic repositories (`src/witan/__tests__/fixtures/behaviour-corpus.ts`), scores every one of
them under every selectable rubric, projects each report down to its scoring-relevant output, and
compares that against committed pins. The failure names the rubric that moved and the criteria
that moved, because the pins are decomposed per criterion and per fixture before they are
digested. It runs in CI on every pull request (about nine seconds).

Per rubric, never aggregate: a combined digest would hide a change that moves a prospective rubric
and leaves the calibrated default alone. **The v17 digest moving is the serious case, and it is
separately visible.**

**What the digest covers**: criterion scores and statuses (which is where `insufficient_data`
surfaces), per-criterion metric values, per-criterion finding counts by severity, the repo
archetype, `contentReadSummary`, the report verdict, the composite scores, and the
insufficient-source abstention reason. **What it deliberately excludes**: everything
per-invocation (product identity, repository path, `generatedAt`, `toolVersion`, and the
fingerprint field itself), and all prose (finding summaries, metric labels, evidence labels,
criterion notes, `scanLimitations`) — a wording improvement is not a scoring change, and a guard
that fires on copy edits is one people learn to re-pin without reading. A finding appearing or
disappearing still moves its severity count, so the detector change is caught while the sentence
it produces stays editable.

**What it does not claim.** A matching fingerprint says no *corpus-visible* scoring behaviour
changed. It is not a coverage claim and must never be quoted as one. The corpus measures A1, A2,
A3, A4, A5, B2, B3, B4 and B6. It does not measure **B1 (dispatch trace completeness)** or **B5
(verified learning trace)**, and no fixture could: both lost their collectors in
`witan-rubric-v3-2026-07-13` because they were reachable only from the source monorepo's own file
paths, and no public repository scan has emitted a signal for either since. The guard asserts that
this gap is exactly `{B1, B5}`, so it can neither widen nor quietly close.

**A determinism limitation this corpus made visible.** Up to and including
`witan-rubric-v18-prospective-2026-07-25`, B4's audit-freshness metric rates an audit artifact
against the *scan* year rather than anything in the repository — `witan-rubric-v19` is the
correction, and the `stale-audit-trail` fixture is where the corpus shows the difference. The
fingerprints below are therefore measured at a pinned `generatedAt` of `2026-09-15`. For v17 and
v18 the fingerprint is an identity for scoring *at that scan year*; a scan run in a later calendar
year can score a repository with a dated audit trail differently under those two rubrics without
any code changing. That has been true since v17 shipped and is not introduced here. It is written
down here because a behaviour fingerprint that quietly depended on a clock would be the same class
of defect this entry is about.

**Emitted in the artifact.** `report.json` now carries `rubricBehaviourFingerprint` beside
`rubricVersion`, so rubric identity and behavioural identity are separately checkable by whoever
receives the certificate rather than only by this project's CI. That bumps the report contract to
`reportFormatVersion` 1.2 (`docs/format-stability.md`); the field is additive-optional, so a
consumer following the v1 contract to ignore unknown optional fields remains compatible.
Strict field-allowlist readers require an update; release verification found the
published-package board reader rejecting this new key until its schema was updated. **Reports produced by earlier versions do not carry
the field and their existing attestations remain valid** — absence means "produced before report
format 1.2", never "behaviour unknown and therefore suspect". The value is a committed constant
rather than something recomputed per scan (recomputing it costs thirteen git repositories and
ninety-one scans); what makes it true is the guard above, which re-derives it from the corpus on
every CI run and fails if it has drifted.

**This does not weaken report reproducibility.** `report.json` remains byte-identical for the same
tool version scanning the same revision under the same rubric. The new field is a property of the
(build, rubric) pair, derived from nothing but `rubricVersion`; it contains no timestamp, no path,
and no per-run state. It changes report bytes across *versions*, exactly as `toolVersion` already
does, and not across *runs*.

**The fingerprints, as of this entry.** Measured on the corpus at its pinned commits, at
`generatedAt` `2026-09-15T00:00:00.000Z`. Changing any of these values requires a new entry in
this file quoting the new digest — that is the mechanism that stops a re-pin from being a silent
repair, and it is checked mechanically.

| Rubric | Behaviour fingerprint |
| --- | --- |
| `witan-rubric-v17-2026-07-24` (calibrated public default) | `sha256:ff0f01abe8c12daa60375d0e18c1aca4a1135a55ab2a80b15f4c037bfc18b4b1` |
| `witan-rubric-v18-prospective-2026-07-25` | `sha256:abc35df0fdc0749aa941f47b295059d06c96dd9800af7f79cfef2bc8dae917da` |
| `witan-rubric-v19-prospective-2026-08-09` | `sha256:f670fa2cc44beef066fa38767bd587e1a16fb28b03bc904756daaea5a6465e96` |
| `witan-rubric-v20-prospective-2026-08-10` | `sha256:9276ce2ce865c2d50c52882ee45bbf1df5fe3c8b6038858b4a147f7a4cedfa98` |
| `witan-rubric-v21-prospective-2026-08-10` | `sha256:d86411a7fe108bba4d2b8fe7ff9d4f7f69a60f11ca0c5c3fef8e88f66a9af53a` |
| `witan-rubric-v22-prospective-2026-08-10` | `sha256:1bb57dd98d29b43b170f3a4f1c8b3b379b433a2aa9df0821ab9d5115f48cfb2f` |
| `witan-rubric-v23-prospective-2026-09-06` | `sha256:b558c0aa4b2f85b734bed2e077298fd55851a1086234d678f10a71cf913ec3cf` |

These seven values are pairwise distinct, and the guard asserts it: the corpus can tell every
selectable rubric apart from every other, which is the minimum evidence that it reaches what
separates them. Each prospective rubric moves at least one criterion on at least one fixture
relative to its predecessor — v18 on A2 (native RLS policy reading), v19 on B4 (freshness year),
v20 on A3 (direct HTTP entrypoint), v21 on B6 (authored administrative SQL), v22 on A3
(start-declared entrypoint), v23 on A1 (coverage-capable command flags) and A5 (withheld-path
abstention).

**What this control still cannot do.** It cannot tell whether the changelog entry a re-pin cites
is *truthful* — only that one exists and names the new digest. It cannot see a scoring change on a
repository shape the corpus does not contain; recall gaps are a known limitation of every static
control here and are priced in. And it cannot detect a change made by an author willing to edit
the guard, the corpus and this file together. It closes the specific hole that a change made in
good faith, under an unchanged identifier, ships with nobody knowing.

**Scope note.** The fixture corpus is a *detector*, not a calibration record. It is synthetic,
invented for this purpose, and carries no precision, recall, or false-positive claim. The
published corpus (`leaderboard/corpus.json`) remains the only thing a before/after delta in this
file is measured on.

## 0.4.9 — behaviour change under witan-rubric-v17-2026-07-24 (no identifier bump)

**Status.** Disclosed behaviour change under the existing calibrated public default. **Not a
recalibration** — the v17 calibration frame is retired and this entry does not touch it. The
rubric identifier does not change. `WITAN_RUBRIC_VERSION` was deliberately not bumped by the
author of this entry; whether it should have been is handed to the operator below. Unlike the
two entries below it, this delta was **preregistered**: expected values were committed before
the comparison ran, and the result matched them in full.

**What changed.** Five changes in CLI release 0.4.9 change how a repository scores under
`witan-rubric-v17-2026-07-24` with no change to the identifier. None is gated on rubric
version; each applies to every rubric, the calibrated default included.

1. **`test`-script content check (direction: down).** A `package.json` `test` script was
   credited by key presence alone, so npm's default placeholder (`echo "Error: no test
   specified" && exit 1`) scored identically to a real runner in both A1's
   `verification_script_ratio` and B3's `ci_script_depth`. Both now require the script's
   content to match a known test-runner invocation.
2. **A1 authenticated-absence credits (direction: up).** On a revision with package-level
   `lint`/`typecheck` scripts but no test files, A1 zeroed its whole verification-script signal
   while B3 credited the same scripts. A1 now credits lint/typecheck/coverage on that path;
   only the test-file-dependent metrics stay at zero.
3. **Pull-request-template directory form (direction: up).** `.github/PULL_REQUEST_TEMPLATE/<name>.md`
   read as no template; it is now recognised alongside the single-file form.
4. **A3 observability-depth pattern widening (direction: up).** The file-content pattern behind
   `A3.observability_depth` matched a vendor-product list (`sentry`, `otel`, `opentelemetry`,
   `datadog`, `prometheus`, `logtail`) plus the generic substrings `logger` and `metrics`, and so
   missed the common Node structured-logging libraries (`pino`, `winston`, `bunyan`), the Express
   request-logging convention (`morgan`) and the request-correlation idiom (`correlation`,
   `request` or `trace` plus an optional separator and `id`, and `AsyncLocalStorage`). All of
   those now match, each word-bounded.
5. **A3 `prod_readiness_primitives` error boundary (direction: up).** The "error boundary"
   component matched a frontend filename convention only (`error-boundary.*`,
   `*.error.(tsx|jsx|ts|js)`) and read no file content, so an Express error-handling middleware
   layer — which can live in any file under any name — never moved it. It now also recognises the
   canonical four-argument `(err, req, res, next)` signature by content, across implementation
   files, checked only when the filename convention finds nothing.

Two further changes in this release are **not capable of moving a score under the calibrated
default** and are recorded so that the list above is not mistaken for the whole release: the
health/readiness route widening (gated on `useV20ExplicitGaps`, prospective `witan-rubric-v20`+,
and feeding an info-severity absence finding rather than a scored metric), and the `too_large`
abstention-disclosure split (gated to prospective `witan-rubric-v23`). Both were measured rather
than assumed inert: they moved nothing, as predicted.

**Why the cited guard did not fire, stated plainly.** The rubric-rescore-protocol guard this
changelog's preamble cites lives in the source monorepo (BargLabs/alfred,
`packages/witan/src/__tests__/rubric-rescore-protocol.test.ts`). It has two halves: a check
that `WITAN_RUBRIC_VERSION` has a changelog entry, and golden fixture scores keyed by rubric
version that *would* catch a behaviour change under an unchanged identifier — if the fixture
exercised the changed behaviour. Three things made it inert here. The identifier did not
change, so the first half had nothing to key on. The golden fixture carries
`test: 'vitest run'` with test files present and no PR template, so none of the three shapes
above exist in it. And it runs against alfred's copy of the scanner, which has diverged from
this repository's (6,522 lines against 8,913 at the time of writing); this repository carried
no equivalent guard of its own. A control keyed to a version string, with a fixture that does
not contain the changed shape, in a different repository, is the same defect class the fixes
above were closing: a check that reports on something it did not examine. This release adds
the cejel-native guard, `src/witan/__tests__/v17-scoring-surface-golden.test.ts`, whose four
fixtures are exactly the four shapes in this entry; it fails 4/4 against the v0.4.8 source and
passes 4/4 against 0.4.9, naming the metric and direction each time.

**Measurement.** All 24 corpus rows at their pinned commits (`leaderboard/corpus.json`,
sha256 `dc723f53…`, byte-identical to the corpus the v19 protocol froze), scored twice from
source with the calibrated default, `generatedAt` fixed, on one machine within one hour:
baseline `7606392` (the `v0.4.8` commit) and `9df6f31`, the final measured scoring tree.
The immutable `v0.4.9` tag resolves to `cd75fc435d33bccc84293c8d1ce1a5a99685d6c0`.
A comparison of these two candidate commits finds only the CLI changelog, this rubric
changelog, and the paired-result JSON/Markdown record changed; no scorer or package source
changed. The candidate arm was re-scored after every 0.4.9 code change had landed. The scoring work it carries
arrived as `dad7841` (A3 runtime-pattern coverage), `90371ea` (certificate scope disclosure) and
`cfd9b16` (the behaviour fingerprint and report format 1.2). The published `@cejel/cejel@0.4.8` npm artifact reproduces the baseline arm
exactly on the row that moved most (django: 3.2 / 2.6 / 3.8, B3 3.6, `ci_script_depth` 3), so
the baseline is what a customer has, not an assumption about it. Canonical evidence:
`docs/experiments/v17-behaviour-delta-0.4.9-2026-09-15/paired-result.json`; the harness that
produced it is beside it. Raw per-row reports were retained locally and not committed (the
private row's report is not public; the public rows' reports are reproducible from the
harness).

**Preregistered, and the prediction held.** This repository's convention for a measurement whose
result matters is a preregistration commit that is a strict ancestor of the result commit
(`docs/standing-constraints.md`, Guard 5). The two entries below this one could not claim that
and said so. This one can, twice: `PREREGISTRATION.md` was committed as `0f80959`
before the first `compare.mjs` run, and `PREREGISTRATION-2.md` as `680b9d3` before the re-run
against both PRs' post-review heads. Each names both arms, the score-capable changes, the rows
expected to move and the exact metric values expected. Each measured result matched its
prediction in full; the second is byte-identical to the first on all 24 rows once `toolVersion`
is excluded, so the review fixes changed no figure here. What the first prediction named is what
both runs measured: the same four rows, the same two metrics, the same single headline change,
the same 20 byte-identical reports. No gap between prediction and result had to be explained
away, and none was closed by adjusting anything. Preregistration 2 also withdrew an expectation
before its run rather than after: an earlier, looser approximation of #308's widened
error-middleware pattern matched one file in vite, and the pattern as committed matches none, so
the prediction of a vite movement was retracted in the preregistration commit itself.

**Expected values, committed before the comparison ran** (`PREREGISTRATION.md`, `0f80959`; the
re-run's are in `PREREGISTRATION-2.md`, `680b9d3`).
For change 1, the rows expected to move are those whose `test` script contains no runner the
content check names: from the corpus `package.json` files, django (`grunt test --verbose`), vite
(`pnpm test-unit && pnpm test-serve && pnpm test-build`) and the private alfred row — **3 rows,
all down**. Every other JavaScript row names a runner (`vitest`, `mocha`, `jest-cli.js`,
`npm run test:vitest`) and was expected not to move. For change 2, the only row on A1's
authenticated-absence path is carddemo, which has no `package.json` — **0 rows**. For change 3,
no corpus checkout contains a `.github/PULL_REQUEST_TEMPLATE/` directory — **0 rows**. For
change 4, A3 is `not_applicable` on 17 of 24 rows, leaving seven that can move on any A3 signal
at all; of those, the widened pattern selects a file the old one did not on react and alfred
only — **2 rows, both up**. vue's single candidate file matches `requestIdleCallback`, which the
shipped word-bounded `\b(?:correlation|request|trace)[-_]?id\b` correctly rejects; axios's three
candidates already matched the existing terms and two are test files the implementation-file
filter excludes; vite, scorecard and cejel contain none; svelte contains two matching files but
its A3 is `not_applicable`. For change 5, no file in any of the seven A3-applicable rows matches
the four-argument `(err, req, res, next)` pattern — **0 rows**. An empty result for changes 2, 3
and 5 is therefore the expected value, checked against the checkouts, not a convenient absence.

**Result.** 24 of 24 rows completed in both arms. **0 reports byte-identical — see the note below, which is not a scoring result. 4 rows moved,
exactly the 4 predicted, on exactly the 2 predicted metrics: `B3.ci_script_depth` down on
django, vite and alfred, and `A3.observability_depth` up on react (68 → 108) and alfred
(64 → 73).** One headline changed: django 3.2 → 3.1 overall (process 3.8 → 3.6, B3 3.6 → 3.1),
verdict and placement unchanged (unranked, low-confidence coverage). vite and alfred lost one
`ci_script_depth` point each with no score change (the metric saturates), and neither
observability movement changed a criterion score or status (react's A3 stays 2.3/warning,
alfred's 3.6/verified). No verdict changed. No placement changed. No coverage figure changed.
Changes 2, 3 and 5 moved nothing on this corpus, which is what the checkouts predicted — not
evidence that they move nothing in general: the guard fixtures shipped with each change show
them moving on the shapes they were written for. The four pinned shapes in
`src/witan/__tests__/v17-scoring-surface-golden.test.ts` stay 4/4 green on the candidate, as
predicted, and the two guards shipped with changes 4 and 5 pass on it (20 assertions across the
three files).

**Finding: the content check over-reaches, disclosed rather than adjusted.** None of the three
rows that moved on `ci_script_depth` carries the placeholder that fix was written for. All three
run a real test entrypoint that delegates to a runner the check's allowlist does not name. The
fix converted "credits a placeholder" into "does not credit a delegating script" — a new false
assertion of the absence of a test capability, in the direction that lowers a score. Per the
constraint that governs this entry, nothing was adjusted to shrink the delta: the check ships as
written, the three rows move, and this paragraph says why. **Operator decision:** whether the
check should recognise delegation (a `test` script that is not the npm placeholder, or one that
invokes `npm run`/`pnpm`/`turbo`/`grunt`/`make`), which would need its own entry here and a
re-pin of the guard; and separately whether a behaviour change of this kind under a fixed
identifier should have forced a rubric version bump. Neither is decided by this entry.

**Why no report is byte-identical, and why that is not a scoring statement.** Every one of the
24 reports differs from its 0.4.8 counterpart at byte level, because 0.4.9 adds
`rubricBehaviourFingerprint` beside `rubricVersion` and moves the report format from 1.1 to 1.2.
All 24 carry the new field. An earlier draft of this entry recorded 20 of 24 byte-identical,
measured before that field existed; the number was true of the tree measured and false of the
tree that ships, so it is corrected here rather than left to read as a scoring claim.

The scoring result is unchanged by it: the same four rows move, on the same two metrics, by the
same amounts, and the baseline still reproduces the published board on 20 of 24 rows. That split
is the point — the metric comparison is the scoring assertion and the byte comparison is a
format assertion, and a format change moves only the second. From 0.4.9 the fingerprint is the
better instrument for the question the byte count was standing in for: whether two reports were
produced by the same scoring, rather than by the same bytes.

**Note on the two upward metric movements.** `observability_depth` is a raw count of matching
files, so react's 68 → 108 and alfred's 64 → 73 are the same repositories at the same commits
counted by a wider pattern, not repositories that became more observable. The count is not
comparable across releases as a quantity, and neither movement crossed a score band. A board
republished on 0.4.9 will show the new counts on those two rows with unchanged scores.

**Prior undisclosed movement found while measuring.** Checking the baseline arm against the
board published on cejel.dev at scoring level (headline, per-criterion score/status, per-metric
value) showed 20 of 24 rows reproduce and the board predates 0.4.8 on four: fastapi A4
`lockfile_coverage` 1 → abstained, A4 3.6 → 3.4, headline overall 3.1 → 3.0 and code trust
3.0 → 2.8; biomejs B4 `audit_artifact_depth` 16 → 15 and `audit_freshness_depth` 2 → 1;
fmt A1 `non_hollow_test_share` 29 → 28 and `test_to_source_ratio` 55 → 54; alfred A3
`rollback_safety_depth` 806 → 753 — the last three at metric level with no score change. All
are consistent with 0.4.8's abstention-scoring change, which shipped with a CHANGELOG line and
no entry here. So the published board already disagrees with the shipped 0.4.8 binary on one
headline score, and this entry is the second undisclosed v17 movement in two releases, not the
first. Republishing the board is release execution and is not done here. (The first version
of this check compared whole report objects and reported a difference on all 24 rows regardless
of input, because 0.4.8 added a `derivation` field to every finding; the four rows above were
found by hand and the check was then rewritten to compare at scoring level, which reproduces
exactly those four — review finding on #306.)


**Measurement limits.** Public rows were fetched with `--depth=1`; both arms score the same
shallow checkouts, so the base → candidate delta is unaffected, but history-dependent signals
(A2's recent-history secret scan, B4's commit-year freshness) saw one commit of history, as in
the v19 protocol. `harness/RUN.md` records the exact invocation and a verification that the
committed harness reproduces the candidate arm from its committed location.


**Full v0.4.8 → 0.4.9 delta under witan-rubric-v17-2026-07-24 (all 24 rows, candidate = main + both remaining 0.4.9 scoring branches):**

| Repository | Overall | Code trust | Process trust | Verdict | Coverage | Board placement | Criteria that moved (score/status) | Metrics that moved |
|---|---:|---:|---:|---|---|---|---|---|
| react | 3 | 2.1 | 3.9 | Conditional | code_trust 5/5; process_trust 3/6 | 9 | none (report differs elsewhere) | A3.observability_depth 68 to 108 |
| vue | 2.9 | 2.4 | 3.4 | Conditional | code_trust 4/5; process_trust 3/6 | 11 | identical | none |
| svelte | 3.1 | 2.9 | 3.3 | Conditional | code_trust 4/5; process_trust 3/6 | 4 | identical | none |
| django | 3.2 to 3.1 | 2.6 | 3.8 to 3.6 | Conditional | code_trust 3/5; process_trust 2/6 | unranked | B3 3.6/verified to 3.1/verified | B3.ci_script_depth 3 to 2 |
| flask | 2.9 | 2.7 | 3 | Conditional | code_trust 4/5; process_trust 3/6 | 8 | identical | none |
| fastapi | 3 | 2.8 | 3.2 | Conditional | code_trust 2/5; process_trust 3/6 | unranked | identical | none |
| express | 3 | 2.8 | 3.2 | Conditional | code_trust 2/5; process_trust 3/6 | unranked | identical | none |
| vite | 3.4 | 2.8 | 4 | Conditional | code_trust 5/5; process_trust 3/6 | 1 | none (report differs elsewhere) | B3.ci_script_depth 5 to 4 |
| esbuild | 2.5 | 2.6 | 2.4 | Conditional | code_trust 3/5; process_trust 3/6 | 13 | identical | none |
| biomejs | 3 | 2.9 | 3 | Conditional | code_trust 3/5; process_trust 4/6 | 6 | identical | none |
| requests | 2.9 | 2.4 | 3.4 | Conditional | code_trust 3/5; process_trust 4/6 | 7 | identical | none |
| pydantic | 3.2 | 2.9 | 3.5 | Conditional | code_trust 3/5; process_trust 3/6 | 3 | identical | none |
| axios | 3.3 | 2.6 | 3.9 | Conditional | code_trust 5/5; process_trust 4/6 | 2 | identical | none |
| zod | 3.2 | 3.1 | 3.2 | Conditional | code_trust 3/5; process_trust 3/6 | 5 | identical | none |
| scorecard | 2.9 | 2.2 | 3.6 | Conditional | code_trust 4/5; process_trust 3/6 | 10 | identical | none |
| ripgrep | 2.1 | 2.1 | 2 | At risk | code_trust 3/5; process_trust 3/6 | 14 | identical | none |
| guava | 1.9 | 1.6 | 2.2 | At risk | code_trust 3/5; process_trust 2/6 | unranked | identical | none |
| cobra | 2.5 | 2.6 | 2.3 | Conditional | code_trust 2/5; process_trust 2/6 | unranked | identical | none |
| sinatra | 2.4 | 2 | 2.8 | At risk | code_trust 2/5; process_trust 4/6 | unranked | identical | none |
| automapper | 2.2 | 2 | 2.3 | At risk | code_trust 3/5; process_trust 2/6 | unranked | identical | none |
| fmt | 2.6 | 2 | 3.2 | Conditional | code_trust 3/5; process_trust 4/6 | 12 | identical | none |
| carddemo | scoreless | scoreless | scoreless | Insufficient source | code_trust 0/5; process_trust 0/6 | unrated | identical | none |
| alfred | 3.2 | 3.1 | 3.3 | Conditional | code_trust 5/5; process_trust 4/6 | transparency | none (report differs elsewhere) | A3.observability_depth 64 to 73; B3.ci_script_depth 5 to 4 |
| cejel | 2.8 | 2.3 | 3.2 | Conditional | code_trust 5/5; process_trust 3/6 | transparency | identical | none |

**Correction, 2026-09-26.** This entry says the preregistration commits `0f80959` and `680b9d3`
are strict ancestors of the result commit. The 0.4.9 release was squash-merged, so neither is an
ancestor of any commit on `main` that carries this entry. The ancestry holds on the pre-squash
history, which is pinned by the signed tag `evidence/v17-delta-0.4.9-preregistrations` (target
`1bc56cd`). The erratum in `docs/experiments/v17-behaviour-delta-0.4.9-2026-09-15/result.md`
gives the commands to check it. No figure changes.

## witan-rubric-v19-prospective-2026-08-09 — recovery GO

**Status.** Prospective only; recovery protocol **GO**. V19 is available only by explicit
selection. The calibrated public default remains `witan-rubric-v17-2026-07-24`; this result does
not authorize default promotion or rewrite the preserved first-run NO-GO below.

**What changed.** V19 inherits prospective v18 and changes only B4's numeric freshness marker:
the scanned `HEAD` commit's committer year replaces the scan wall clock. Static
`recent|latest|current` markers remain. V17 and v18 retain their historical generated-at-year
behavior.

**Result.** The separately preregistered recovery measured only the missing private Alfred row at
its frozen commit and combined it with the original run's 23 successful rows byte-for-byte. All
24 rows completed. No row changed raw B4 freshness, B4 score or status, headline score, verdict,
coverage, board placement, or any non-B4 criterion. The recovery preregistration merged at
`8f937a6d326d9aacc1c0fd607f79f815e148c165`; the frozen recovery harness merged later at
`7c498ef3c7ac4fefcc08b8f03d2be31bde3476eb`, which is the execution commit.

Canonical recovery evidence:
`docs/experiments/b4-commit-year-v19-recovery-2026-08-09/alfred-recovery-result.json`; canonical
combined evidence:
`docs/experiments/b4-commit-year-v19-recovery-2026-08-09/combined-result.json`; human renderings
are beside those files.

**Full prospective-v18 to prospective-v19 combined delta (all 24 rows):**

| Repository | Raw B4 freshness | B4 score/status | Overall | Code trust | Process trust | Verdict | Coverage | Board placement | Non-B4 criteria |
|---|---:|---|---:|---:|---:|---|---|---|---|
| react | 4 to 4 | 3.8/verified to 3.8/verified | 3.0 to 3.0 | 2.1 to 2.1 | 3.9 to 3.9 | Conditional to Conditional | code 5/5; process 3/6 to code 5/5; process 3/6 | 9 to 9 | identical |
| vue | 2 to 2 | 2.9/verified to 2.9/verified | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 11 to 11 | identical |
| svelte | 1 to 1 | 1.9/verified to 1.9/verified | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 4 to 4 | identical |
| django | n/a to n/a | 0/not applicable to 0/not applicable | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | code 3/5; process 2/6 to code 3/5; process 2/6 | unranked to unranked | identical |
| flask | 2 to 2 | 3.7/verified to 3.7/verified | 2.9 to 2.9 | 2.7 to 2.7 | 3.0 to 3.0 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 8 to 8 | identical |
| fastapi | 48 to 48 | 3.6/verified to 3.6/verified | 3.1 to 3.1 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | code 2/5; process 3/6 to code 2/5; process 3/6 | unranked to unranked | identical |
| express | 1 to 1 | 1.9/verified to 1.9/verified | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | Conditional to Conditional | code 2/5; process 3/6 to code 2/5; process 3/6 | unranked to unranked | identical |
| vite | 5 to 5 | 4.0/verified to 4.0/verified | 3.4 to 3.4 | 2.8 to 2.8 | 4.0 to 4.0 | Conditional to Conditional | code 5/5; process 3/6 to code 5/5; process 3/6 | 1 to 1 | identical |
| esbuild | 1 to 1 | 1.9/verified to 1.9/verified | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | code 3/5; process 3/6 to code 3/5; process 3/6 | 13 to 13 | identical |
| biomejs | 2 to 2 | 3.3/verified to 3.3/verified | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | code 3/5; process 4/6 to code 3/5; process 4/6 | 6 to 6 | identical |
| requests | 2 to 2 | 2.9/verified to 2.9/verified | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | code 3/5; process 4/6 to code 3/5; process 4/6 | 7 to 7 | identical |
| pydantic | 2 to 2 | 2.9/verified to 2.9/verified | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | code 3/5; process 3/6 to code 3/5; process 3/6 | 3 to 3 | identical |
| axios | 3 to 3 | 3.6/verified to 3.6/verified | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | code 5/5; process 4/6 to code 5/5; process 4/6 | 2 to 2 | identical |
| zod | 2 to 2 | 2.9/verified to 2.9/verified | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | code 3/5; process 3/6 to code 3/5; process 3/6 | 5 to 5 | identical |
| scorecard | n/a to n/a | 0/not applicable to 0/not applicable | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 10 to 10 | identical |
| ripgrep | 1 to 1 | 1.9/verified to 1.9/verified | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | code 3/5; process 3/6 to code 3/5; process 3/6 | 14 to 14 | identical |
| guava | n/a to n/a | 0/not applicable to 0/not applicable | 1.9 to 1.9 | 1.6 to 1.6 | 2.2 to 2.2 | At risk to At risk | code 3/5; process 2/6 to code 3/5; process 2/6 | unranked to unranked | identical |
| cobra | n/a to n/a | 0/not applicable to 0/not applicable | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | code 2/5; process 2/6 to code 2/5; process 2/6 | unranked to unranked | identical |
| sinatra | 1 to 1 | 2.5/verified to 2.5/verified | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | code 2/5; process 4/6 to code 2/5; process 4/6 | unranked to unranked | identical |
| automapper | n/a to n/a | 0/not applicable to 0/not applicable | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | code 3/5; process 2/6 to code 3/5; process 2/6 | unranked to unranked | identical |
| fmt | 1 to 1 | 2.5/verified to 2.5/verified | 2.6 to 2.6 | 2.0 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | code 3/5; process 4/6 to code 3/5; process 4/6 | 12 to 12 | identical |
| carddemo | n/a to n/a | 0/not applicable to 0/not applicable | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | code 0/5; process 0/6 to code 0/5; process 0/6 | unrated to unrated | identical |
| alfred | 73 to 73 | 3.9/verified to 3.9/verified | 3.4 to 3.4 | 2.8 to 2.8 | 3.9 to 3.9 | Conditional to Conditional | code 5/5; process 4/6 to code 5/5; process 4/6 | transparency to transparency | identical |
| cejel | n/a to n/a | 0/not applicable to 0/not applicable | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | code 5/5; process 3/6 to code 5/5; process 3/6 | transparency to transparency | identical |

## witan-rubric-v19-prospective-2026-08-09 — first paired run NO-GO

**Status.** Prospective only; protocol **NO-GO**. The calibrated public default remains
`witan-rubric-v17-2026-07-24`. This failed run does not authorize default promotion, rewrite any
historical report, or change the published board.

**What changed.** V19 inherits prospective v18 and changes only B4's numeric freshness marker:
the scanned `HEAD` commit's committer year replaces the scan wall clock. Static
`recent|latest|current` markers remain. V17 and v18 retain their historical generated-at-year
behavior. The implementation and one-shot harness merged at
`ce6af76376264540a4d12494a8ac8d4ab92082ee`, strictly after preregistration commit
`9eefecbc1c7f83ec2ba795ea823a3edb43b12bf1`.

**Result.** The one permitted run completed 23 of 24 frozen rows. All 23 completed rows had
byte-identical non-B4 criteria and zero B4-score, status, headline-score, verdict, coverage, or
placement changes. No completed row changed the raw freshness numerator. The private Alfred row
failed before checkout or scanning: the harness correctly denied file transport globally, but
then attempted a local clone that required that same denied transport. The failure is preserved;
the run was not repaired or retried. A recovery measurement requires a separately merged
preregistration and a new one-shot protocol.

Canonical evidence:
`docs/experiments/b4-commit-year-v19-2026-08-09/paired-result.json`; human rendering:
`docs/experiments/b4-commit-year-v19-2026-08-09/result.md`.

**Full prospective-v18 to prospective-v19 first-run delta (all 24 rows):**

| Repository | Raw B4 freshness | B4 score/status | Overall | Code trust | Process trust | Verdict | Coverage | Board placement | Non-B4 criteria |
|---|---:|---|---:|---:|---:|---|---|---|---|
| react | 4 to 4 | 3.8/verified to 3.8/verified | 3.0 to 3.0 | 2.1 to 2.1 | 3.9 to 3.9 | Conditional to Conditional | code 5/5; process 3/6 to code 5/5; process 3/6 | 9 to 9 | identical |
| vue | 2 to 2 | 2.9/verified to 2.9/verified | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 11 to 11 | identical |
| svelte | 1 to 1 | 1.9/verified to 1.9/verified | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 4 to 4 | identical |
| django | n/a to n/a | 0/not applicable to 0/not applicable | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | code 3/5; process 2/6 to code 3/5; process 2/6 | unranked to unranked | identical |
| flask | 2 to 2 | 3.7/verified to 3.7/verified | 2.9 to 2.9 | 2.7 to 2.7 | 3.0 to 3.0 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 8 to 8 | identical |
| fastapi | 48 to 48 | 3.6/verified to 3.6/verified | 3.1 to 3.1 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | code 2/5; process 3/6 to code 2/5; process 3/6 | unranked to unranked | identical |
| express | 1 to 1 | 1.9/verified to 1.9/verified | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | Conditional to Conditional | code 2/5; process 3/6 to code 2/5; process 3/6 | unranked to unranked | identical |
| vite | 5 to 5 | 4.0/verified to 4.0/verified | 3.4 to 3.4 | 2.8 to 2.8 | 4.0 to 4.0 | Conditional to Conditional | code 5/5; process 3/6 to code 5/5; process 3/6 | 1 to 1 | identical |
| esbuild | 1 to 1 | 1.9/verified to 1.9/verified | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | code 3/5; process 3/6 to code 3/5; process 3/6 | 13 to 13 | identical |
| biomejs | 2 to 2 | 3.3/verified to 3.3/verified | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | code 3/5; process 4/6 to code 3/5; process 4/6 | 6 to 6 | identical |
| requests | 2 to 2 | 2.9/verified to 2.9/verified | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | code 3/5; process 4/6 to code 3/5; process 4/6 | 7 to 7 | identical |
| pydantic | 2 to 2 | 2.9/verified to 2.9/verified | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | code 3/5; process 3/6 to code 3/5; process 3/6 | 3 to 3 | identical |
| axios | 3 to 3 | 3.6/verified to 3.6/verified | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | code 5/5; process 4/6 to code 5/5; process 4/6 | 2 to 2 | identical |
| zod | 2 to 2 | 2.9/verified to 2.9/verified | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | code 3/5; process 3/6 to code 3/5; process 3/6 | 5 to 5 | identical |
| scorecard | n/a to n/a | 0/not applicable to 0/not applicable | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | code 4/5; process 3/6 to code 4/5; process 3/6 | 10 to 10 | identical |
| ripgrep | 1 to 1 | 1.9/verified to 1.9/verified | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | code 3/5; process 3/6 to code 3/5; process 3/6 | 14 to 14 | identical |
| guava | n/a to n/a | 0/not applicable to 0/not applicable | 1.9 to 1.9 | 1.6 to 1.6 | 2.2 to 2.2 | At risk to At risk | code 3/5; process 2/6 to code 3/5; process 2/6 | unranked to unranked | identical |
| cobra | n/a to n/a | 0/not applicable to 0/not applicable | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | code 2/5; process 2/6 to code 2/5; process 2/6 | unranked to unranked | identical |
| sinatra | 1 to 1 | 2.5/verified to 2.5/verified | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | code 2/5; process 4/6 to code 2/5; process 4/6 | unranked to unranked | identical |
| automapper | n/a to n/a | 0/not applicable to 0/not applicable | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | code 3/5; process 2/6 to code 3/5; process 2/6 | unranked to unranked | identical |
| fmt | 1 to 1 | 2.5/verified to 2.5/verified | 2.6 to 2.6 | 2.0 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | code 3/5; process 4/6 to code 3/5; process 4/6 | 12 to 12 | identical |
| carddemo | n/a to n/a | 0/not applicable to 0/not applicable | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | code 0/5; process 0/6 to code 0/5; process 0/6 | unrated to unrated | identical |
| alfred | error | error | error | error | error | error | error | error | not compared |
| cejel | n/a to n/a | 0/not applicable to 0/not applicable | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | code 5/5; process 3/6 to code 5/5; process 3/6 | transparency to transparency | identical |

## witan-rubric-v18-prospective-2026-07-25

**Status.** Prospective only. The public `npx @cejel/cejel@latest` default remains the
holdout-calibrated `witan-rubric-v17-2026-07-24`. V18 must be selected explicitly and is not
eligible to replace that default until a fresh authenticated untouched v51 holdout clears every
preregistered gate. The public leaderboard selects v18 explicitly, with verdict bands withheld,
so it can disclose the correction without representing the changed detector as calibrated.

**What changed.** V18 inherits the complete v17 detector and scoring closure except for D7
multi-tenancy evidence. Positive isolation credit is now derived from each repository's own
`CREATE POLICY ... USING (...)` and `WITH CHECK (...)` clauses. Identifiers parsed from those
clauses define the repository-native scope vocabulary and are traced across the data-layer
surface; a fixed tenant-token dictionary cannot create positive isolation credit. The
`rls_policy_count` denominator is derived from that same scoped surface rather than saturating at
a hand-typed three policies.

The negative rule remains fail-closed. A tenant-shaped schema with zero RLS policies still emits
`CORE-A2-TENANT-WITHOUT-RLS`; it is never silently relabeled single-tenant. The conservative
non-policy schema premise exists only to emit that gap finding and cannot award isolation metrics.
A regression fixture now exercises this exact zero-policy case under calibrated v17 and
prospective v18.

**Why.** The v0.2.0 board exposed two distinct protocol defects. Its headline used a 50/50 mean
of category means, allowing a thin four-criterion process bucket to receive half the headline;
the board now uses the pre-statable, uniform rule that thin buckets must not receive
disproportionate headline weight, implemented as equal weight per measured comparable criterion.
Separately, the attempted D7 correction initially changed v17 in place. That would have shipped a
different detector under the same identifier used by the v50 GO. Versioning D7 as prospective
v18 preserves the exact calibrated detector and its measured claim while making the correction
auditable. The finding-level v50 GO and `terminal-go.md` are unchanged.

All 24 pinned corpus rows were compared at their existing immutable commits. The only rubric-score
move is the private Alfred transparency snapshot; no third-party repository changes score,
verdict, coverage class, or board placement. Publisher-owned rows remain outside the calibrated
public population. Board verdict bands are withheld because the historical 3.5 cutoff has not
been calibrated for the comparative score.

**Full v17 to prospective-v18 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Native verdict | Board placement |
|---|---:|---:|---:|---|---|
| react | 3.0 to 3.0 | 2.1 to 2.1 | 3.9 to 3.9 | Conditional to Conditional | 9 to 9 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 4 to 4 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.9 to 2.9 | 2.7 to 2.7 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| fastapi | 3.1 to 3.1 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | unranked to unranked |
| express | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | Conditional to Conditional | unranked to unranked |
| vite | 3.4 to 3.4 | 2.8 to 2.8 | 4.0 to 4.0 | Conditional to Conditional | 1 to 1 |
| esbuild | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 13 to 13 |
| biomejs | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 6 to 6 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 7 to 7 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 3 to 3 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 2 to 2 |
| zod | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 5 to 5 |
| scorecard | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | 14 to 14 |
| guava | 1.9 to 1.9 | 1.6 to 1.6 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.6 to 2.6 | 2.0 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | 12 to 12 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | unrated to unrated |
| alfred | 3.5 to 3.3 | 3.0 to 2.6 | 3.9 to 3.9 | Verified to Conditional | transparency to transparency |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | transparency to transparency |

## witan-rubric-v17-2026-07-24

**What changed.** V17 is the first free-core rubric promoted after a preregistered untouched
holdout cleared every gate. It carries forward the v9 evidence boundary and adds the measured
v17 corrections: bounded reviewable-source proof for absence propositions, authenticated A1
configured-runner absence, full test-inventory discovery, and narrowly scoped structural rescue
only after a positive core signal. Blind abstention uses authored production source and the
configured-runner premise; it does not infer a healthy result from metadata alone. The public
default is promoted only after the v50 terminal GO, not from a development score or a
configured-runner premise without evidence. The commercial score remains bounded to observable
repository evidence; it is not a security guarantee.

**Why.** The v49 untouched holdout's only failure was inappropriate abstention (16 of 189,
upper envelope 12.70% against a 10% gate). V50 tested the v17 revision on a fresh 200-repository
cohort with three independent blind reviews and the frozen clustered estimator. It passed finding
precision, worst-case recall, FPR, criterion, missingness, and abstention gates. The measured
finding precision was 96.43% (95% lower bound 94.16%), worst-case recall 95.64% (lower bound
92.23%), and worst-case FPR 0.66% (upper bound 1.10%). The terminal claim's precision threshold
is 80%; this is a calibration result for the frozen free-core population, not universal recall.

All 24 pinned corpus rows were rescored at their existing immutable commits with zero scan or
score errors on 2026-07-25 UTC. CardDemo remains scoreless `insufficient_source`. The private
Alfred transparency row is labeled private and is not independently reproducible from public
source. The table below is the complete v9-to-v17 delta. The historical **Full v8 to v9 delta**
remains below; it is not silently replaced by this prospective rescore.

**Full v9 to v17 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Rank |
|---|---:|---:|---:|---|---:|
| react | 3.2 to 3.0 | 2.5 to 2.1 | 3.9 to 3.9 | Conditional to Conditional | 5 to 7 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 6 to 5 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.9 to 2.9 | 2.7 to 2.7 | 3.0 to 3.0 | Conditional to Conditional | 13 to 13 |
| fastapi | 3.1 to 3.1 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | unranked to unranked |
| express | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | Conditional to Conditional | unranked to unranked |
| vite | 3.4 to 3.4 | 2.8 to 2.8 | 4.0 to 4.0 | Conditional to Conditional | 1 to 2 |
| esbuild | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 15 to 15 |
| biomejs | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 9 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 4 to 4 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 3 to 3 |
| zod | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 7 to 6 |
| scorecard | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | 16 to 16 |
| guava | 1.9 to 1.9 | 1.5 to 1.6 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.6 to 2.6 | 2.0 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | 14 to 14 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.2 to 3.5 | 2.4 to 3.0 | 4.0 to 4.0 | Conditional to Verified | 2 to 1 |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | 12 to 12 |

## witan-rubric-v9-2026-07-22

**What changed.** V9 is the failure-derived remediation from the immutable free-core v32
NO-GO. A1 now requires the same configured-runner premise its no-coverage proposition claims,
and it never infers a missing-test finding from a coverage artifact alone. Scheduled-health
recognition covers common non-npm test commands, while claim packets carry a bounded excerpt for
each conjunct from the finding's own file. A2 excludes generated, vendored, test, fixture, and
example paths from current and historical production-secret claims; qualified environment
templates such as `.env.production.example` are templates; and non-secret environment-file
hygiene remains visible without forcing the whole criterion into warning.

Headline scoring now requires at least 80% of source-shaped files to belong to a published Cejel
source family when a competing unread language exists. Native web component/template formats and
non-source translations, certificates, snapshots, and data artifacts are classified explicitly so
the stricter boundary does not turn mature public projects into false abstentions. Blind abstention
packets sample authored production source across extension families and start excerpts at
substantive code rather than repeated license headers. Criterion states use evidence-derived
materiality floors for non-hollow tests, production readiness, PR outcomes, CI depth, audit depth,
dependency sanity, and explicit human/fail-closed privilege gates.

**Why.** The sealed v32 result passed recall but failed precision, FPR, criterion state-exactness,
and inappropriate-scoring gates. All 17 false positives for `CORE-A1-NO-COVERAGE-CONFIG` had zero
configured runner surfaces, while all 25 supported candidates had at least one. Five of six
committed-secret candidates were generated or fixture evidence. The criterion errors clustered at
repeatable materiality boundaries, and 16 repositories were scored when the blind packet did not
materially represent their source—principally because excerpts stopped in license headers or an
unread source family was substantial. These corrections are prospective; they do not reinterpret
v32 or claim calibration GO. V33 still requires fresh seeds, a fresh untouched cohort, blind
review, sealing, and the frozen GO estimator.

All 24 pinned corpus rows rescored with zero scan errors. No verdict band or rank changed.
CardDemo remains scoreless `insufficient_source`. React, Flask, Express, Vite, and Alfred gain small
score corrections from the evidence/state changes; every other headline score is unchanged.

**Full v8 to v9 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Rank |
|---|---:|---:|---:|---|---:|
| react | 3.1 to 3.2 | 2.3 to 2.5 | 3.9 to 3.9 | Conditional to Conditional | 5 to 5 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 6 to 6 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.9 | 2.5 to 2.7 | 3.0 to 3.0 | Conditional to Conditional | 13 to 13 |
| fastapi | 3.1 to 3.1 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | unranked to unranked |
| express | 2.9 to 3.0 | 2.8 to 2.8 | 3.0 to 3.2 | Conditional to Conditional | unranked to unranked |
| vite | 3.3 to 3.4 | 2.6 to 2.8 | 4.0 to 4.0 | Conditional to Conditional | 1 to 1 |
| esbuild | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 15 to 15 |
| biomejs | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 9 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 4 to 4 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 3 to 3 |
| zod | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 7 to 7 |
| scorecard | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | 16 to 16 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.6 to 2.6 | 2.0 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | 14 to 14 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.2 to 3.2 | 2.4 to 2.4 | 3.9 to 4.0 | Conditional to Conditional | 2 to 2 |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | 12 to 12 |

## witan-rubric-v8-2026-07-21

**What changed.** V8 activates the failure-derived detector and evidence-boundary corrections
staged after the immutable free-core v26 NO-GO. A1 recognizes lean tests in nested workspaces while
excluding generated, vendored, fixture, and example manifests from the production toolchain. A2
reports current and historical credential evidence independently, including a current-tree hygiene
warning for a committed non-template `.env` without a confirmed secret. A3 evaluates each multi-stage
Dockerfile's effective final stage, recognizes bounded Rack services, and requires a runtime command
rather than a generic entrypoint name. A4 applies app-runtime expectations only to strongly evidenced
packaged Electron/Tauri software. A5 accepts only content-authenticated reconciliation artifacts and
rejects generated-source claims. The same authored-production boundary governs the V8 control and
applicability premises used by blind calibration packets.

**Why.** Free-core v26 failed because decisive controls and criterion labels showed that the prior
detectors conflated workspace metadata with production evidence, collapsed current and historical
credential states, treated container build stages as deployed services, under-modeled packaged apps,
and accepted generic reconciliation filenames without authenticating their content. V8 corrects
those observed failure families before any v27 cohort is selected or scanned. It does not reinterpret
v26, weaken any GO gate, or claim calibration GO.

All 24 pinned corpus rows rescored with zero scan errors. No verdict band changed, and CardDemo
remains scoreless `insufficient_source`. FastAPI gains corrected A1 evidence but becomes unranked
because A5 now abstains instead of scoring an unauthenticated claim artifact, leaving only five of
eleven dimensions measured. The remaining rank movement follows the score corrections, FastAPI
leaving the ranked table, and Alfred's refreshed private transparency snapshot. That Alfred
snapshot advances from `b608b99` to the main-reachable V8 activation commit `fecc4d3`; its source
remains explicitly non-public. The published row was corrected from the activation branch's
pre-squash source commit to that merge commit. The table below therefore reports V7 directly to
the current V8 board. Alfred's headline Overall (3.2), Code trust (2.4), Process trust (3.9), and
verdict are unchanged by the correction; its common-dimension ranked score rises from 3.1 to 3.2
and B2 rises from 3.5 to 3.7 as the recent-PR merge ratio moves from 5/12 to 8/12 at the reachable
merge snapshot.

**Full v7 to v8 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Rank |
|---|---:|---:|---:|---|---:|
| react | 3.2 to 3.1 | 2.4 to 2.3 | 3.9 to 3.9 | Conditional to Conditional | 4 to 5 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 12 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 6 to 6 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.6 to 2.5 | 3.0 to 3.0 | Conditional to Conditional | 14 to 13 |
| fastapi | 2.9 to 3.1 | 2.6 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | 9 to unranked |
| express | 2.9 to 2.9 | 2.8 to 2.8 | 3.0 to 3.0 | Conditional to Conditional | unranked to unranked |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | Conditional to Conditional | 2 to 1 |
| esbuild | 2.5 to 2.5 | 2.6 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 16 to 15 |
| biomejs | 3.0 to 3.0 | 2.9 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 10 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 3 to 4 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 1 to 3 |
| zod | 3.2 to 3.2 | 3.1 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 7 to 7 |
| scorecard | 2.9 to 2.9 | 2.2 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 11 to 10 |
| ripgrep | 2.1 to 2.1 | 2.1 to 2.1 | 2.0 to 2.0 | At risk to At risk | 17 to 16 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.5 to 2.5 | 2.6 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 2.2 to 2.2 | 2.0 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.6 | 2.1 to 2.0 | 3.2 to 3.2 | Conditional to Conditional | 15 to 14 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.1 to 3.2 | 2.3 to 2.4 | 3.9 to 3.9 | Conditional to Conditional | 5 to 2 |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | 13 to 12 |

## witan-rubric-v7-2026-07-21

**What changed.** V7 is the failure-derived free-core v26 implementation. Secret findings now
point to the exact matched line and expose only redacted value shape. Finding and control packets
for no-tests, no-coverage, no-CI/release-deploy, and no-lockfile propositions carry the same exact
tracked-inventory proof and applicability premises. Criterion packets publish unweighted raw
metric facts plus frozen label definitions without exposing scores, states, score thresholds, or
weights.

Repository evidence discovery also changes. Coverage files must contain coverage configuration;
Makefiles and CMake files must contain actual test targets before counting as runner configuration;
recognized source files under ecosystem-specific test directories count as tests. Nested deploy
targets count only outside tests, fixtures, examples, samples, and demos; a Dockerfile remains a
container-build signal, not release automation. B6 excludes test/fixture SQL rather than emitting a
logging-only finding, and A5 limits claims to root/product documentation or dedicated
claim-reconciliation artifacts. Cohesive Fortran, CUDA/HIP, and web-template/style trees are
recognized at explicitly unmodeled depth, while prospectively frozen size/ratio/remainder rules
abstain from generated/vendor-dominated and independent solution-catalog trees. CardDemo remains
scoreless and `insufficient_source`.

**Why.** Free-core v25 closed NO-GO. Its decisive error families and packet missingness showed that
reviewers could not verify absence propositions from positive excerpts, criterion labels lacked
the measured denominators, secret evidence could point at the wrong line, test and fixture paths
crossed production applicability boundaries, and structural source eligibility was incomplete.
These are detector and review-protocol corrections, not a retroactive v25 reinterpretation. Both
v25 waves are excluded from the future v26 cohort; v25 Wave 2 remains unreviewed and unlabeled.

All 24 sealed corpus rows rescored with zero scan errors. No verdict band changed. CardDemo remains
scoreless and unranked. Express becomes unranked because the corrected A5 scope removes an
unsupported measured dimension, leaving five of eleven dimensions measured; this is a coverage
classification change, not a score penalty. The other rank changes below follow the published
score/evidence corrections and Express leaving the ranked table. The Alfred transparency row also
advances from self snapshot `707b7b5` to the reachable v7 implementation snapshot `b608b99`.

**Full v6 to v7 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | Verdict | Rank |
|---|---:|---:|---:|---|---:|
| react | 3.2 to 3.2 | 2.5 to 2.4 | 3.9 to 3.9 | Conditional to Conditional | 4 to 4 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 11 to 12 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | Conditional to Conditional | 5 to 6 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.5 to 2.6 | 3.0 to 3.0 | Conditional to Conditional | 15 to 14 |
| fastapi | 2.9 to 2.9 | 2.5 to 2.6 | 3.2 to 3.2 | Conditional to Conditional | 14 to 9 |
| express | 2.8 to 2.9 | 2.6 to 2.8 | 3.0 to 3.0 | Conditional to Conditional | 13 to unranked |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | Conditional to Conditional | 2 to 2 |
| esbuild | 2.6 to 2.5 | 2.7 to 2.6 | 2.4 to 2.4 | Conditional to Conditional | 17 to 16 |
| biomejs | 2.9 to 3.0 | 2.8 to 2.9 | 3.0 to 3.0 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | Conditional to Conditional | 9 to 10 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | Conditional to Conditional | 3 to 3 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | Conditional to Conditional | 1 to 1 |
| zod | 3.0 to 3.2 | 2.8 to 3.1 | 3.2 to 3.2 | Conditional to Conditional | 7 to 7 |
| scorecard | 3.0 to 2.9 | 2.3 to 2.2 | 3.6 to 3.6 | Conditional to Conditional | 10 to 11 |
| ripgrep | 2.2 to 2.1 | 2.4 to 2.1 | 2.0 to 2.0 | At risk to At risk | 18 to 17 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | At risk to At risk | unranked to unranked |
| cobra | 2.6 to 2.5 | 2.8 to 2.6 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | At risk to At risk | unranked to unranked |
| automapper | 1.9 to 2.2 | 1.5 to 2.0 | 2.3 to 2.3 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.7 | 2.2 to 2.1 | 3.2 to 3.2 | Conditional to Conditional | 16 to 15 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.0 to 3.1 | 2.2 to 2.3 | 3.8 to 3.9 | Conditional to Conditional | 6 to 5 |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | Conditional to Conditional | 12 to 13 |

## witan-rubric-v6-2026-07-21

**What changed.** Cejel now recognizes AVA's root-level `test.js` and `test-*.js`
conventions as concrete JavaScript test files. Version 0.1.7 recognized AVA as a configured
runner but missed those filenames, producing a false missing-tests finding on
`sindresorhus/slugify` even though its root `test.js` was present.

**Why.** This was a detection gap in Cejel, not evidence about the repository. The correction
adds the convention to both A1 test-file discovery and the non-hollow-test classifier, with a
regression fixture that reproduces the real repository shape. The fix does not execute tests
or broaden the scanner beyond tracked source evidence.

No externally pinned corpus score, verdict, or rank moved. None of the 22 external pinned
entries uses the newly recognized filename shape as previously missing evidence, and the two
rubric-protocol golden fixtures are unchanged. The Alfred transparency row advanced from the
previous self snapshot to implementation commit `707b7b5`: unrelated intervening source changes
move its Overall **3.1 to 3.0**, Code trust **2.4 to 2.2**, and rank **5 to 6**. Svelte moves rank
**6 to 5** only because Alfred moves below it; Svelte's score and evidence are unchanged. The
public Cejel row remains pinned to the same public commit and is unchanged.

**Full v5 to v6 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | A1 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 to 3.2 | 2.5 to 2.5 | 3.9 to 3.9 | 2.3 to 2.3 | Conditional to Conditional | 4 to 4 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 2.5 to 2.5 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | 2.6 to 2.6 | Conditional to Conditional | 6 to 5 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | 2.8 to 2.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.5 to 2.5 | 3.0 to 3.0 | 2.3 to 2.3 | Conditional to Conditional | 15 to 15 |
| fastapi | 2.9 to 2.9 | 2.5 to 2.5 | 3.2 to 3.2 | 2.0 to 2.0 | Conditional to Conditional | 14 to 14 |
| express | 2.8 to 2.8 | 2.6 to 2.6 | 3.0 to 3.0 | 2.3 to 2.3 | Conditional to Conditional | 13 to 13 |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | 2.5 to 2.5 | Conditional to Conditional | 2 to 2 |
| esbuild | 2.6 to 2.6 | 2.7 to 2.7 | 2.4 to 2.4 | 2.5 to 2.5 | Conditional to Conditional | 17 to 17 |
| biomejs | 2.9 to 2.9 | 2.8 to 2.8 | 3.0 to 3.0 | 2.7 to 2.7 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 2.5 to 2.5 | Conditional to Conditional | 9 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | 2.8 to 2.8 | Conditional to Conditional | 3 to 3 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | 2.8 to 2.8 | Conditional to Conditional | 1 to 1 |
| zod | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | 2.5 to 2.5 | Conditional to Conditional | 7 to 7 |
| scorecard | 3.0 to 3.0 | 2.3 to 2.3 | 3.6 to 3.6 | 2.4 to 2.4 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.2 to 2.2 | 2.4 to 2.4 | 2.0 to 2.0 | 1.9 to 1.9 | At risk to At risk | 18 to 18 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | 1.3 to 1.3 | At risk to At risk | unranked to unranked |
| cobra | 2.6 to 2.6 | 2.8 to 2.8 | 2.3 to 2.3 | 2.3 to 2.3 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | 1.8 to 1.8 | At risk to At risk | unranked to unranked |
| automapper | 1.9 to 1.9 | 1.5 to 1.5 | 2.3 to 2.3 | 0.3 to 0.3 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.7 | 2.2 to 2.2 | 3.2 to 3.2 | 2.8 to 2.8 | Conditional to Conditional | 16 to 16 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | 0.0 to 0.0 | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | **3.1 to 3.0** | **2.4 to 2.2** | 3.8 to 3.8 | 2.3 to 2.3 | Conditional to Conditional | **5 to 6** |
| cejel | 2.8 to 2.8 | 2.3 to 2.3 | 3.2 to 3.2 | 2.0 to 2.0 | Conditional to Conditional | 12 to 12 |

## witan-rubric-v5-2026-07-18

**What changed.** Git-history evidence is now read only from commits reachable from the
checked-out `HEAD`. Previous versions used `--all`, so unrelated local branches and
remote-tracking refs could alter A2 evidence, measured coverage, and the score of the same
pinned source commit. V5 binds the history scan to the immutable revision being certified.

**Why.** The required public-path reproduction job caught the same pinned Alfred/Cejel
snapshots producing different evidence in a developer worktree and a clean CI clone. The
clone's extra refs exposed a historical `.env` path that the generation environment did not
see. That was ambient clone state, not evidence for a different source snapshot. A regression
test now adds credential history on a non-HEAD branch and proves it cannot affect A2.

All 21 externally pinned rows are unchanged. Alfred's score is also unchanged, although its
complete evidence set is now reproducible. The Cejel self row gains the HEAD-ancestor history
signal that clean-clone reproduction had already exposed: A2 moves **0.0 to 3.2**, Code trust
**2.5 to 2.7**, and Overall **3.3 to 3.4**. It remains low-coverage and unranked; no ranked
position, verdict, or external score moves. The self snapshot moves from `d6248edd47f6` to
`25627e00c6eb`, the clean v5 implementation commit; external source pins do not move.

**Full v4 to v5 delta (all 24 rows):**

| Repository | Overall | Code trust | Process trust | A2 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 to 3.2 | 2.5 to 2.5 | 3.9 to 3.9 | 2.4 to 2.4 | Conditional to Conditional | 4 to 4 |
| vue | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 0.0 to 0.0 | Conditional to Conditional | 11 to 11 |
| svelte | 3.1 to 3.1 | 2.9 to 2.9 | 3.3 to 3.3 | 3.6 to 3.6 | Conditional to Conditional | 5 to 5 |
| django | 3.2 to 3.2 | 2.6 to 2.6 | 3.8 to 3.8 | 2.8 to 2.8 | Conditional to Conditional | unranked to unranked |
| flask | 2.8 to 2.8 | 2.5 to 2.5 | 3.0 to 3.0 | 2.4 to 2.4 | Conditional to Conditional | 14 to 14 |
| fastapi | 2.9 to 2.9 | 2.5 to 2.5 | 3.2 to 3.2 | 0.0 to 0.0 | Conditional to Conditional | 13 to 13 |
| express | 2.8 to 2.8 | 2.6 to 2.6 | 3.0 to 3.0 | 0.0 to 0.0 | Conditional to Conditional | 12 to 12 |
| vite | 3.3 to 3.3 | 2.6 to 2.6 | 4.0 to 4.0 | 2.4 to 2.4 | Conditional to Conditional | 2 to 2 |
| esbuild | 2.6 to 2.6 | 2.7 to 2.7 | 2.4 to 2.4 | 0.0 to 0.0 | Conditional to Conditional | 16 to 16 |
| biomejs | 2.9 to 2.9 | 2.8 to 2.8 | 3.0 to 3.0 | 3.2 to 3.2 | Conditional to Conditional | 8 to 8 |
| requests | 2.9 to 2.9 | 2.4 to 2.4 | 3.4 to 3.4 | 0.0 to 0.0 | Conditional to Conditional | 9 to 9 |
| pydantic | 3.2 to 3.2 | 2.9 to 2.9 | 3.5 to 3.5 | 0.0 to 0.0 | Conditional to Conditional | 3 to 3 |
| axios | 3.3 to 3.3 | 2.6 to 2.6 | 3.9 to 3.9 | 3.6 to 3.6 | Conditional to Conditional | 1 to 1 |
| zod | 3.0 to 3.0 | 2.8 to 2.8 | 3.2 to 3.2 | 3.6 to 3.6 | Conditional to Conditional | 7 to 7 |
| scorecard | 3.0 to 3.0 | 2.3 to 2.3 | 3.6 to 3.6 | 0.0 to 0.0 | Conditional to Conditional | 10 to 10 |
| ripgrep | 2.2 to 2.2 | 2.4 to 2.4 | 2.0 to 2.0 | 0.0 to 0.0 | At risk to At risk | 17 to 17 |
| guava | 1.9 to 1.9 | 1.5 to 1.5 | 2.2 to 2.2 | 0.0 to 0.0 | At risk to At risk | unranked to unranked |
| cobra | 2.6 to 2.6 | 2.8 to 2.8 | 2.3 to 2.3 | 0.0 to 0.0 | Conditional to Conditional | unranked to unranked |
| sinatra | 2.4 to 2.4 | 2.0 to 2.0 | 2.8 to 2.8 | 0.0 to 0.0 | At risk to At risk | unranked to unranked |
| automapper | 1.9 to 1.9 | 1.5 to 1.5 | 2.3 to 2.3 | 0.0 to 0.0 | At risk to At risk | unranked to unranked |
| fmt | 2.7 to 2.7 | 2.2 to 2.2 | 3.2 to 3.2 | 0.0 to 0.0 | Conditional to Conditional | 15 to 15 |
| carddemo | scoreless to scoreless | scoreless to scoreless | scoreless to scoreless | 0.0 to 0.0 | Insufficient source to Insufficient source | insufficient to insufficient |
| alfred | 3.0 to 3.0 | 2.4 to 2.4 | 3.6 to 3.6 | 2.4 to 2.4 | Conditional to Conditional | 6 to 6 |
| cejel | **3.3 to 3.4** | **2.5 to 2.7** | 4.0 to 4.0 | **0.0 to 3.2** | Conditional to Conditional | unranked to unranked |

No external score, verdict, evidence-derived rank, or source pin moved. No ranked row moved.

## witan-rubric-v4-2026-07-18

**What changed.** Repository evidence discovery now accepts only tracked regular files. It
does not follow tracked symlinks, because a symlink target can escape the immutable checkout
and make both evidence and scores depend on ambient host files. The scorer still records the
symlink in Git history, but never reads its target as repository evidence.

**Why.** The pinned Zod snapshot has a root `README.md` symlink. V3 followed that link while
also discovering the target `packages/docs/README.md`, which counted one claim source twice
and credited depth that did not exist. V4 reads only the regular target file. Zod A5 falls
from **2.2 to 2.0**; its rounded Code trust, Overall, verdict, and rank do not move. No other
externally pinned repository changes score, verdict, or rank.

The same regeneration moved the two self rows from source snapshot `75fa69511494` to the
clean v4 prerequisite commit recorded in their reports. Those are disclosed as a separate
corpus-pin act, not attributed to the symlink rubric change: Alfred falls **3.1 to 3.0** and
rank 5 to 6; Cejel falls **3.4 to 3.3** and remains unranked for low coverage. Svelte moves
rank 6 to 5 only because Alfred moves below it. CardDemo remains scoreless with
`insufficient_source`.

**Full v3→v4 delta (all 24 rows; external source pins unchanged):**

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 → 3.2 | 2.5 → 2.5 | 3.9 → 3.9 | 2.2 → 2.2 | Conditional → Conditional | 4 → 4 |
| vue | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 11 → 11 |
| svelte | 3.1 → 3.1 | 2.9 → 2.9 | 3.3 → 3.3 | 2.2 → 2.2 | Conditional → Conditional | 6 → 5 |
| django | 3.2 → 3.2 | 2.6 → 2.6 | 3.8 → 3.8 | 0.0 → 0.0 | Conditional → Conditional | unranked → unranked |
| flask | 2.8 → 2.8 | 2.5 → 2.5 | 3.0 → 3.0 | 2.2 → 2.2 | Conditional → Conditional | 14 → 14 |
| fastapi | 2.9 → 2.9 | 2.5 → 2.5 | 3.2 → 3.2 | 2.0 → 2.0 | Conditional → Conditional | 13 → 13 |
| express | 2.8 → 2.8 | 2.6 → 2.6 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 12 → 12 |
| vite | 3.3 → 3.3 | 2.6 → 2.6 | 4.0 → 4.0 | 2.7 → 2.7 | Conditional → Conditional | 2 → 2 |
| esbuild | 2.6 → 2.6 | 2.7 → 2.7 | 2.4 → 2.4 | 2.4 → 2.4 | Conditional → Conditional | 16 → 16 |
| biomejs | 2.9 → 2.9 | 2.8 → 2.8 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 8 → 8 |
| requests | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 9 → 9 |
| pydantic | 3.2 → 3.2 | 2.9 → 2.9 | 3.5 → 3.5 | 2.4 → 2.4 | Conditional → Conditional | 3 → 3 |
| axios | 3.3 → 3.3 | 2.6 → 2.6 | 3.9 → 3.9 | 2.4 → 2.4 | Conditional → Conditional | 1 → 1 |
| zod | 3.0 → 3.0 | 2.8 → 2.8 | 3.2 → 3.2 | **2.2 → 2.0** | Conditional → Conditional | 7 → 7 |
| scorecard | 3.0 → 3.0 | 2.3 → 2.3 | 3.6 → 3.6 | 2.6 → 2.6 | Conditional → Conditional | 10 → 10 |
| ripgrep | 2.2 → 2.2 | 2.4 → 2.4 | 2.0 → 2.0 | 2.2 → 2.2 | At risk → At risk | 17 → 17 |
| guava | 1.9 → 1.9 | 1.5 → 1.5 | 2.2 → 2.2 | 2.2 → 2.2 | At risk → At risk | unranked → unranked |
| cobra | 2.6 → 2.6 | 2.8 → 2.8 | 2.3 → 2.3 | 0.0 → 0.0 | Conditional → Conditional | unranked → unranked |
| sinatra | 2.4 → 2.4 | 2.0 → 2.0 | 2.8 → 2.8 | 2.2 → 2.2 | At risk → At risk | unranked → unranked |
| automapper | 1.9 → 1.9 | 1.5 → 1.5 | 2.3 → 2.3 | 1.4 → 1.4 | At risk → At risk | unranked → unranked |
| fmt | 2.7 → 2.7 | 2.2 → 2.2 | 3.2 → 3.2 | 2.2 → 2.2 | Conditional → Conditional | 15 → 15 |
| carddemo | scoreless → scoreless | scoreless → scoreless | scoreless → scoreless | 0.0 → 0.0 | Insufficient source → Insufficient source | insufficient → insufficient |
| alfred | **3.1 → 3.0** | 2.4 → 2.4 | **3.8 → 3.6** | 2.4 → 2.4 | Conditional → Conditional | **5 → 6** |
| cejel | **3.4 → 3.3** | **2.7 → 2.5** | 4.0 → 4.0 | 2.2 → 2.2 | Conditional → Conditional | unranked → unranked |

No external source pin moved. Apart from Zod's A5 correction, no externally pinned score,
verdict, or rank moved. The self-source movement and its induced Svelte rank change are
identified separately above.

## witan-rubric-v3-2026-07-13

**What changed.** The leaderboard no longer has a privileged scoring route for internal
rows. The public CLI, batch scanner, and board generator now call one sealed public scorer;
the required board guard re-scores **every** corpus row through that function and compares
score, criterion status, verdict, measured coverage, and the complete evidence-pointer set
with the published report. This is a structural equivalence check, not a blacklist of known
collector names: adding any differently named board-only input changes the claims and makes
the required check RED.

Every external corpus entry now pins a 40-character source commit. Re-scoring at the same
pins is a rubric change and publishes the delta below. Moving a pin is a separate corpus
change that must be declared as such; upstream default-branch movement can no longer masquerade
as a rubric effect. Alfred and Cejel are likewise reproduced from the exact local commit
recorded in their published reports.

The repository scanner also states its B1/B5 behavior precisely: it evaluates neither
dimension for any repository, including Alfred. Both are always `not_applicable` for this
input type. They remain part of the wider rubric for
structured substrate evidence, and the board excludes them fail-closed if it encounters a
legacy or separately produced structured report.

**Why.** The previous board generator could append private, internal-only collectors after
the public scan. A collector-name blacklist asserted that known private inputs were absent,
but could not prove the published row was obtainable from the public product. Removing that
second path exposes the honest Alfred result: Code trust falls from **2.5 to 2.4**, driven by
A5 falling from **2.9 to 2.4**. The headline remains 3.1 because process evidence moves from
3.6 to 3.7 when B1/B5 stop contributing internal-only scores. The lower Code number is the
point of this release, not an artifact to explain away.

**Corpus-wide v2→v3 delta (all 17 repositories, same pinned source snapshots):**

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| react | 3.2 → 3.2 | 2.5 → 2.5 | 3.9 → 3.9 | 2.2 → 2.2 | Conditional → Conditional | 4 → 4 |
| vue | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 11 → 11 |
| svelte | 3.1 → 3.1 | 2.9 → 2.9 | 3.3 → 3.3 | 2.2 → 2.2 | Conditional → Conditional | 6 → 6 |
| django | 3.2 → 3.2 | 2.6 → 2.6 | 3.8 → 3.8 | 0.0 → 0.0 | Conditional → Conditional | unranked → unranked |
| flask | 2.8 → 2.8 | 2.5 → 2.5 | 3.0 → 3.0 | 2.2 → 2.2 | Conditional → Conditional | 14 → 14 |
| fastapi | 2.9 → 2.9 | 2.5 → 2.5 | 3.2 → 3.2 | 2.0 → 2.0 | Conditional → Conditional | 13 → 13 |
| express | 2.8 → 2.8 | 2.6 → 2.6 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 12 → 12 |
| vite | 3.3 → 3.3 | 2.6 → 2.6 | 4.0 → 4.0 | 2.7 → 2.7 | Conditional → Conditional | 2 → 2 |
| esbuild | 2.6 → 2.6 | 2.7 → 2.7 | 2.4 → 2.4 | 2.4 → 2.4 | Conditional → Conditional | 15 → 15 |
| biomejs | 2.9 → 2.9 | 2.8 → 2.8 | 3.0 → 3.0 | 2.0 → 2.0 | Conditional → Conditional | 8 → 8 |
| requests | 2.9 → 2.9 | 2.4 → 2.4 | 3.4 → 3.4 | 2.2 → 2.2 | Conditional → Conditional | 9 → 9 |
| pydantic | 3.2 → 3.2 | 2.9 → 2.9 | 3.5 → 3.5 | 2.4 → 2.4 | Conditional → Conditional | 3 → 3 |
| axios | 3.3 → 3.3 | 2.6 → 2.6 | 3.9 → 3.9 | 2.4 → 2.4 | Conditional → Conditional | 1 → 1 |
| zod | 3.0 → 3.0 | 2.8 → 2.8 | 3.2 → 3.2 | 2.2 → 2.2 | Conditional → Conditional | 7 → 7 |
| scorecard | 3.0 → 3.0 | 2.3 → 2.3 | 3.6 → 3.6 | 2.6 → 2.6 | Conditional → Conditional | 10 → 10 |
| alfred (private) | 3.1 → 3.1 | **2.5 → 2.4** | 3.6 → 3.7 | **2.9 → 2.4** | Conditional → Conditional | 5 → 5 |
| cejel (private) | 3.4 → 3.4 | 2.7 → 2.7 | 4.0 → 4.0 | 2.2 → 2.2 | Conditional → Conditional | unranked → unranked |

**No external repository's score, verdict, evidence-derived rank, or A5 result moved.**
The only score changes are Alfred's disclosed correction above. The corpus pins are the
source commits already recorded by the v2 reports, so this table isolates the rubric/public-
path change from upstream repository movement.

**Separate corpus act composed in the same release (17 → 22 repositories).** The language-
calibration work adds one pinned, healthy repository in each of five ecosystems. These rows
did not exist in the v2 corpus, so `new` is the honest before-state; their low results expose
documented B3 CI-depth and Maven A4 calibration gaps rather than being hidden or normalized.

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| ripgrep | new → 2.2 | new → 2.4 | new → 2.0 | new → 2.2 | new → At risk | new → 16 |
| guava | new → 1.9 | new → 1.5 | new → 2.2 | new → 2.2 | new → At risk | new → unranked |
| cobra | new → 2.6 | new → 2.8 | new → 2.3 | new → 0.0 | new → Conditional | new → unranked |
| sinatra | new → 2.4 | new → 2.0 | new → 2.8 | new → 2.2 | new → At risk | new → unranked |
| automapper | new → 1.9 | new → 1.5 | new → 2.3 | new → 1.4 | new → At risk | new → unranked |

**Further corpus-only addition (22 → 23 repositories, 2026-07-15, #488).** One dedicated
C++ reference row, the same "widen ecosystem coverage" act as the five rows above, composed
later in the same v3 release rather than in the original batch. No rubric behavior changed;
`new` is the honest before-state for this row alone.

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| fmt | new → 2.7 | new → 2.2 | new → 3.2 | new → 2.2 | new → Conditional | new → 15 |

**No repository's score, verdict, or A5 result moved. Two ranks did**, mechanically and only
because a new row sorted above them: **esbuild 15 → 16, ripgrep 16 → 17.** A rank is a position
in a list, not a property of a repository — adding a row necessarily moves the rows beneath it.
Nothing was re-scored to produce that shift.

**Archetype classification: dominance, not presence (2026-07-15).** A behavior change, published
here because it changes which repositories Cejel is willing to score at all. `classifyRepoArchetype`
previously short-circuited to `source` when **any** recognised-extension file existed
(`sourceFileCount > 0`). One recognised file in a thousand was enough. The rule is now a ratio:
recognised source must reach `SOURCE_DOMINANCE_RATIO_THRESHOLD` (0.2) of tracked files, or the
repository is `unrecognised_ecosystem` and gets no score, no rank, and no verdict.

**Why.** The previous rule was correct at the ratios it was tested at and catastrophic below them.
A 99%-COBOL mainframe repository carrying nine incidental `.sh` deploy scripts — 2.7% of its
tracked files, 3.6% of its source-shaped ones — classified as `source`, was scored on those nine
files, and drew a confident **0.0 / Unverified** on a healthy codebase. Every real legacy
repository has a deploy script, so the abstention path was unreachable for essentially all of them
while every test passed. The threshold was calibrated against a ratio golden set — eight cases
spanning the ratio space, each with an expected outcome recorded and committed **before** the
threshold number was chosen — and the choice is insensitive within a wide band: 15%, 20% or 25%
all abstain this repository and all preserve a 50/50 mixed-language tree as `source`. The number
was not reverse-engineered from the repository that exposed the bug.

**No existing corpus row changed archetype, score, verdict, or rank.** Every scored repository's
recognised source is dominant by a wide margin; the 0.2 threshold is nowhere near any of them. The
change is visible only in what Cejel now declines to score.

**Corpus addition composed with it (23 → 24 repositories).** The first repository on this board
that Cejel refuses to rate. It is published, not omitted.

| Repository | Overall | Code trust | Process trust | A5 | Verdict | Rank |
|---|---:|---:|---:|---:|---|---:|
| carddemo | new → unrated | new → unrated | new → unrated | new → unrated | new → Insufficient source | new → unranked |

`unrated` is the honest before/after state: there is no score to report, and a `0.0` here would be
a claim about AWS's COBOL that we have not earned. The row's published reason names the extensions
found (`.cpy`, `.jcl`, `.cbl`, `.bms`, `.ps`, `.ctl`) and the measured ratio (9 of 329 tracked
files, 2.7%) rather than a bare verdict.

## Board presentation correction — 2026-07-12

No rubric version changed and no repository was re-scored. The board's public
"Overall" column now prints the same own-certificate overall score shown in each
repository's certificate/report, instead of a comparative-ranking-only value with the
same label. Four repositories' displayed headline numbers moved by 0.1; the underlying
reports, verdicts, and ranking basis did not change.

## witan-rubric-v2-2026-07-12

**What changed.** A1's scheduled-product-health-workflow sub-signal — previously a literal
check for the filename of this repository's own internal QA workflow (a private-repo path,
withheld here per the redaction policy below) — is now detected by **shape**: a CI workflow
with a `schedule:`/`cron:` trigger that runs the verification suite. Our own internal nightly
QA workflow is one recognized instance of that shape, not its definition; a differently-named
nightly workflow with the same shape is detected identically, and a workflow merely sharing
the same filename without the shape (no schedule trigger, no test-run command) is no longer
flagged at all.

A workflow matching the shape is then classified on whether its results are durably
published (a public pages deploy, a commit back to the repo, a PR/issue comment) or handed
only to an ephemeral, access-gated CI artifact (`actions/upload-artifact` with no other
publish step). Only the latter earns a warning; a repository with no scheduled health
workflow is `not_applicable` (nothing to rate), and a repository whose workflow's
publication status cannot be determined from a static file-tree read is `insufficient_data`
— never a warning.

**Why.** The public OSS rubric hardcoding our own internal agent's filename as a detector
constant was a home-field bias: inert for every external repository by construction, and a
free shot to hand a critic in week one (see `cejel-process-rubric-homefield-bias` in
project memory). Generalizing it to the concept it actually measures is the fix; this
changelog — and the Guard 1 regression test that enforces it going forward — is what makes
future rubric edits on a public board a public, versioned, delta-reported act instead of a
silent re-score of someone else's reputation.

**Corpus-wide before/after delta (all 17 repositories, regenerated 2026-07-12 in
goal_cejel_generalize_homefield_rule_and_rescore_protocol_2026-07-12):**

| Repository | Overall before | Overall after | Verdict before | Verdict after | Rank change | A1 finding |
|---|---|---|---|---|---|---|
| react | 3.2 | 3.2 | Conditional | Conditional | none | Same score/status (2.3 warning); the pre-existing synthetic "no single finding drove this" placeholder is replaced by a real, specific finding — react's `.github/workflows/devtools_regression_tests.yml` (schedule-triggered, `actions/upload-artifact`-only) is now the named cause. |
| vue | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| svelte | 3.1 | 3.1 | Conditional | Conditional | none | unchanged |
| django | 3.2 | 3.2 | Conditional | Conditional | none | unchanged |
| flask | 2.8 | 2.8 | Conditional | Conditional | none | unchanged |
| fastapi | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| express | 2.8 | 2.8 | Conditional | Conditional | none | unchanged |
| vite | 3.3 | 3.3 | Conditional | Conditional | none | unchanged |
| esbuild | 2.6 | 2.6 | Conditional | Conditional | none | unchanged |
| biomejs | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| requests | 2.9 | 2.9 | Conditional | Conditional | none | unchanged |
| pydantic | 3.2 | 3.2 | Conditional | Conditional | none | unchanged |
| axios | 3.3 | 3.3 | Conditional | Conditional | none | unchanged |
| zod | 3.0 | 3.0 | Conditional | Conditional | none | unchanged |
| scorecard | 3.0 | 3.0 | Conditional | Conditional | none | unchanged |
| alfred (private) | 3.1 | 3.1 | Conditional | Conditional | none | Same warning, now worded generically: "results are handed only to an ephemeral, access-gated CI artifact" instead of naming an internal component. A1's sub-score moved 2.2 -> 2.3 from ordinary repo growth between the two scan commits (more test files at HEAD), not from the rubric change — see A1's `test_to_source_ratio`/`non_hollow_test_share` metric inputs in the evidence report. |
| cejel (private) | 3.4 | 3.4 | Conditional | Conditional | none | unchanged |

**Erratum — 2026-08-23 (disclosure redaction):** The internal row above was edited to replace a
closed internal product codename with the generic phrase "an internal component." This is a
disclosure-only correction: it changes no score, verdict, rank, metric input, or rubric behavior.
The original published wording remains in immutable Git history; Cejel does not rewrite history
because certificates and attestations pin commits.

**No external repository's score, verdict, or rank moved.** One external repository
(react) gained a more specific, correct finding for an already-existing warning at an
unchanged score and status — not a new penalty. No repository gained a new warning or
critical finding it did not already have. Alfred (internal) kept its own honest warning
(Guard 4), reworded to the generalized concept.

## witan-rubric-v1-2026-06-24

Predates this changelog. Introduced metric-based scoring (continuous, weighted per-criterion
metrics replacing v0's presence/absence scoring) — see this package's `src/witan/scoring.ts`'s
`usesMetricScoring` and the golden-set calibration work done in the source monorepo at the
time. No corpus-wide delta was recorded for this version; the leaderboard did not yet exist
at the time of this bump.
