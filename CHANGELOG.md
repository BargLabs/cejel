# Changelog

All notable changes to `cejel` are recorded here.

Cejel has two version tracks. This file covers **CLI releases** — changes to the binary,
npm package, GitHub Action, Docker image, and MCP server. Changes to the **scoring rubric**
are tracked separately in
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md),
which publishes a full before/after corpus delta for every repository on the board whenever
scoring behavior changes.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.6.8] — 2026-10-22

**Public corpus.** A preregistered confirmation scored the 23 public corpus repositories from
full-history clones: under v17 at v0.6.7 and at the release candidate (`4016f659e`), and under v27
at the candidate. The candidate differs from this release only in records, with no change under
`src/`.
- Under v17, no score, status, metric value, finding count, placement or fingerprint moved. Beyond
  `toolVersion`, 17 reports differ only in B2's evidence labels and A4's evidence and finding text.
- Under v27, no composite and no criterion score was higher than under v17. v27 added no A2 or B2
  abstention on any row (B2 stays unscored on carddemo under both rubrics), and one score moved
  (requests A1, 2.5 to 2.4).

See [`docs/experiments/public-delta-0-6-8-successor-2026-10-21/result.md`](./docs/experiments/public-delta-0-6-8-successor-2026-10-21/result.md).
It succeeds an earlier confirmation of a candidate the #521 review fixes superseded, which is kept
with its erratum (`docs/experiments/public-delta-0-6-8-2026-10-21/`). v27 stays prospective and
opt-in. This makes no precision, recall or calibration claim.

### Security

- **A4 could print a credential from a CI command (#553).** Under every rubric, including the
  default, A4's note and evidence label quoted every word of a lockfile-requiring CI command up to
  its flag. For `uv sync --extra-index-url https://user:<token>@host --locked`, the token appeared
  in `report.json` and `certificate.html` unredacted. The quoted command is now built from Cejel's
  own words only, the tool, the subcommand and the flag's name, with `…` where words were left out:
  `uv sync … --locked`. A flag's `=value` is never quoted. Introduced in this release's #521, never
  shipped. No score, status, metric value, finding count or fingerprint moves.
- **Some repository lines could stall a scan.** Thirteen strip and match sites on repository and
  ingest text used regular expressions that retried from every position of a long run:
  - blanks before `#` or `)`: `/\s+#.*$/`, `/\s+#.*$/u`, `/\s*\)+$/u`;
  - slashes: `/\/+$/` and `/\/+$/u` at three sites, and `/(?:^|\/)\.?[^\s]*\.sh$/i`;
  - blank lines before a schedule trigger;
  - many `#`/`?` candidates before a lone line terminator: `/(^|\s)#.*$/`, and `/[?#].*$/`, the
    second also in ingest repository identities;
  - a `run:` key followed by blanks and a lone CR;
  - a run of version operators in a `pyproject.toml` dependency (`/([><=~!^]+[\d.]+)/`).

  An 80,000-character line took 3-4 s, and single 500 KB files scanned in 89-681 s. Each is now a
  linear scan with exactly the same result, which a test checks against the old expression.
  The ReDoS guard gains blank-run and line-terminator families. Present in 0.6.7 and earlier; no
  score, status or report byte changes. A wider class of `^\s*…` patterns under the `m` flag is
  tracked separately.

### Fixed

- **A "clean" secrets result and the CI citations now say what Cejel set aside or did not check.**
  Under every rubric, including the default:
  - A2 names credential-shaped values it read and then set aside as documentation placeholders
    (for example the AWS documentation key pair, which contains "EXAMPLE"), by count and path. The
    names appear on the secret-cleanliness line and under "What was not established", including
    when A2 is not applicable or abstains. No value is printed, and the placeholder rule itself is
    unchanged.
  - A2 no longer cites ".env files are gitignored" beside a committed env file. A `.gitignore` rule
    does not untrack a committed file, so the citation names the file instead.
  - B2 labels each cited workflow by its own trigger. A workflow with no pull-request trigger is no
    longer called "Pull-request CI workflow", and a non-GitHub CI file is cited as "trigger not
    read". Trigger names are dropped from the label as needed to keep it within the 180-character
    evidence label limit.
  - B3 names workflows its PR-gate count includes whose only steps print text, its own and a
    monorepo root's. The count is unchanged. A workflow confined to a branch that does not exist is
    not named: whether a branch exists is checkout state, not part of the scanned revision, and a
    report must reproduce from the revision alone (#535 tracks counting it).
  - These sentences are a new `criteria[].disclosures` field (report format 1.8), kept apart from
    `notes`, so an abstention or a merge that rewrites the notes no longer drops them (#539). The
    `report.json` of a scan with nothing to disclose is byte-identical to a 1.7 one; its
    `attestation.json` records report format 1.8.
  - Repository paths in "What was not established" and on metric lines are stripped of terminal
    control characters before they are printed, as other repository text already was.

  No score, status, metric value, finding count or fingerprint moves. Changing which values or
  workflows count is left to a prospective rubric (#535, #536, #537).

- **Certificates now say where they read less than they score (#519, #520).** Under every rubric,
  including the default: a file whose checkout holds a Git LFS pointer is counted in
  `contentReadSummary.byReason.lfsPointer` (report format 1.6) and labelled as a pointer in A1's
  evidence, including a pointer whose lines end in CRLF, as a `core.autocrlf=true` checkout leaves
  it (#553); A4 no longer says a lockfile is "not required" when the repository's own CI requires
  one, and cites the requiring line, or the manifest holding an unconstrained dependency, first.
  A4 quotes the requiring command as tool, subcommand and flag only (see Security). No score,
  status or fingerprint moves.
- **The CI lockfile note is right in more cases, and the workflow reader is linear in its number
  of steps.** Under every rubric: the note fires for a step that also runs tests, for
  `cargo test --locked` and for CRLF workflows, and is withheld for `continue-on-error`, another
  repository's checkout, a downloaded artifact, a working directory the checkout does not hold, and
  a lockfile a workflow command names. A 480 KB workflow of 24,000 steps scanned in 12 s; it now
  scans in about 0.25 s. No v17 score, status or fingerprint moves.
- **The CI lockfile note is withheld where the change above made it false, and the reader is
  linear however deeply a workflow nests.** Under every rubric, the note is withheld for: a guard
  behind `(`, `{` or `!` (`( [ -n "$X" ] && npm ci )`), an arithmetic `((` guard, `set +e`, and a
  `cd` inside a subshell; a directory or manifest passed as a flag that the scanned inventory does
  not hold (`npm ci --prefix`, `pnpm --dir`/`-C`, `uv --directory`/`--project`,
  `cargo --manifest-path`); and a `run:` or `steps:` line inside a block scalar (a heredoc, an
  action's script), which is text, not a workflow key; for the same reason it now fires for a
  `run: | # comment` block and past a `- ` line inside an earlier block. Which directories the checkout holds is now
  read from the scanned inventory, exact-case, never from the scanning host: a tracked symlink, a
  case-insensitive volume or an untracked empty directory no longer changes the certificate. The
  "linear" above held for flat workflows only: eight workflows of 990 nested items or 490 nested
  `steps:` keys took 7.2 s; they now take 0.3 s. A `cd` target or `working-directory` of 480,000
  slashes before a letter took about 80 s per workflow (a quadratic trailing-slash trim); it now
  takes 0.3 s. Under v27, a pytest hook that empties
  `items` and puts back nothing (`items.extend([])`) is read as removing the suite, and
  `items.clear(); items.extend(ordered)` written on one line as a reorder. No v17 score, status or
  fingerprint moves.

### Added

- **`witan-rubric-v27-prospective-2026-10-19` (#517, #518, #519, #520, #442).** A prospective
  rubric, opt-in through `--rubric-pin`, that is v17 with five false assurances removed: publish-only
  workflows are not CI depth, a suite a pytest hook skips entirely is hollow and `conftest.py` is
  not a test, LFS pointers abstain, a lockfile the repository's CI requires scores 0 when absent,
  and A2 and B2 abstain on shallow clones. No score rises against v17 on any recorded set. The
  default stays v17. See `leaderboard/RUBRIC_CHANGELOG.md`.
  Corrected before first shipping, under the same identifier (#553), where v27 itself asserted
  more than it read:
  - a publish-only workflow is one that only checks out, configures credentials and uploads an
    already-built artifact; any install, build or package step keeps it counted. Every line of
    its jobs section must be placed by a strict reader (a flow-mapping step, a quoted or
    capitalised key, or a key outside a short allowlist places nothing). Admitted uploads are
    `twine upload`, `uv publish`, `poetry publish` without `--build`, `gh release create`/`upload`,
    `cargo publish --no-verify`, the PyPI publish action, `softprops/action-gh-release` with
    files, and an npm/pnpm/yarn `publish` only when the root `package.json` runs no script on
    publish and no workspace, native-addon or package-manager configuration file exists.
    Admitted setup is checkout, named toolchain, cache and artifact actions that install
    nothing, `docker/login-action`, and registry configuration. **Recorded recall reduction:**
    #517's own repros, which install or build before they publish, are now counted under v27,
    as under v17, as are changesets and semantic-release workflows; v27 removes CI credit only
    from upload-only workflows;
  - a collection hook is read as skipping or removing every test only when it is the last
    top-level definition, the hook name is bound nowhere else in the module, and the skip marker
    is applied to the loop variable of a loop over `items`, or `items` is cleared, at the hook
    body's own first indent; not when a loop and a skip merely co-occur, nor when the loop or the
    clear sits in a nested function or another loop;
  - a module-level `pytestmark` skip is unconditional only when the module names `pytestmark` once
    (two statements on one line count twice), the skip is named in code rather than in a string,
    and no line of the statement, including one reached by a bracket, holds an `if`; a `\`
    continuation is never read as unconditional.

  Each correction can only remove a v27-only reduction, so v27 still scores no higher than v17 on
  any recorded set (no-rise is shown on recorded sets only; see #531). The
  CRLF pointer detection under Fixed also makes v27 abstain on such pointers, as it does on LF
  ones, which can only lower it.
- **Ingest: every ingested document is bound to its subject, and recorded (report format 1.7).**
  `report.json` gains `inputBinding`, present only when something was ingested: per document, the
  sha256 of its exact bytes, its format, the producer and subject its own format declares
  (Scorecard `repo.name`, `repo.commit`, `date`, `scorecard.version`/`commit`; SARIF
  `versionControlProvenance`, `tool.driver`, `invocations`; generic contract 1.1 `subject`,
  `producer`, `observedAt`), and a binding status: `matched`, `mismatched-repository`,
  `mismatched-commit`, `stale`, `unbound` or `unverifiable`. Freshness is measured against the
  scanned HEAD's committer time with a declared one-day window, never the wall clock. Duplicates
  keep the existing deduplication and are recorded as `same-path` or `same-content`. **Default
  scoring is unchanged:** the record is attached after scoring. Docs: `docs/input-binding.md`.
- **`--strict-ingest`** refuses mismatched, stale and duplicate inputs before scoring, with an
  error naming each file and what it was compared against. **`--subject-repository <repo>`** names
  the scanned repository for the comparison; it is never inferred from clone state.
- **`cejel verify ... --input <file>`** checks a set of input files against the digests
  `report.json` records, and fails on a swapped, missing or extra input. `cejel issue` reads the
  binding policy and subject repository from the report it reproduces.
- **Input binding, hardened before release (#525 review follow-up).** A repository identity Cejel
  cannot normalize is withheld (`subjects[].repositoryWithheld`), never recorded verbatim, so URL
  credentials cannot reach `report.json`, the certificate or the terminal; with
  `--subject-repository` it counts as a mismatch. Every declared subject is checked, not only the
  eight recorded (`subjectsOmitted` counts the rest), so a foreign subject cannot hide past the cap
  under `--strict-ingest`. A SARIF document with a run that declares no commit is `unbound`, not
  `matched`. Times outside years 0000-9999 in UTC, including a HEAD committer time, are treated as
  not declared, so a scan can no longer crash on one or write a report `cejel verify` rejects; the
  final report is validated before it is written, and `inputs` stays within its 256 bound. An
  ingested `ruleId` such as `constructor` no longer crashes the scan. `verify --input` reads files
  under ingest's path checks. Default scoring is unchanged.
- **Generic ingest contract 1.1:** optional `subject.repository`, `subject.commit`,
  `producer.name`, `producer.version` and `observedAt`. A 1.0 document is unchanged.
- **`criteria[].nativeStatus`** (report format 1.7), beside `nativeScore` when ingested signals
  adjusted a criterion. The certificate now says when imported evidence moved a status, and that
  the move is not a native finding. Scorecard Dependency-Update-Tool and Security-Policy findings
  are labelled as restating evidence Cejel reads natively, and Scorecard SAST as not a secrets
  finding. Labels only; no score changes.

## [0.6.7] — 2026-10-18

### Security

- **CLI: a scanned checkout could redirect where a scan writes its output (#508).** The default
  output directory, `.cejel`, is inside the checkout being scanned. A checkout could commit
  `.cejel`, or a file in it such as `.cejel/report.json`, as a symbolic link, and a scan then
  wrote through the link, overwriting a file the user could write outside the checkout. `scan`,
  `issue` and `export` now refuse, before writing anything, when the output directory or an output
  file is a symbolic link, including a dangling one, and exit non-zero; the path is resolved first,
  so `.cejel/` and `.cejel/.` are refused like `.cejel`. Each file is also opened without following
  a link where the platform allows it (not on Windows). An explicit `--out` follows the same rule,
  so on macOS `--out /tmp` is refused, because `/tmp` is itself a link; name a directory inside it.
  A link in an earlier part of an explicit `--out` path is still followed. Affects CLI scans of
  untrusted checkouts; the HTTP server is unchanged.

### Added

- **v26 item 8: A3's "declares neither a build nor a typecheck script" fires only on settling evidence.** Under `witan-rubric-v26-prospective-2026-10-14` alone, which stays explicit opt-in (`--rubric-pin`; the public default stays v17), as ruled in the operator-signed `docs/calibration/v26/ruling-item-8.md` (#496): the root package must have authored TypeScript or a tsconfig, no compiler, type checker or bundler from a fixed vocabulary may run in any package script, CI `run` step, Dockerfile `RUN` or Makefile/justfile target read, and every such place must have been read; where one was not, the certificate's "What was not established" says so instead. No metric changes, and no precision or recall claim.

**Public corpus.** A preregistered confirmation scored the 23 public corpus repositories under v17
and v26, at v0.6.6 and at the fix commit (`f5348fb3`), which differs from this release only in
version identity and records, with no change under `src/` outside tests. All 23 reports were
byte-identical under both rubrics, so neither change moved any public repository. No public
repository carries A3's build finding at v0.6.6 under v26, so item 8 had nothing to narrow there:
the run is not evidence about where item 8 stops the finding
([`docs/experiments/public-delta-0-6-7-2026-10-16/result.md`](./docs/experiments/public-delta-0-6-7-2026-10-16/result.md)).

## [0.6.6] — 2026-10-15

### Security

- **A repository could stall a scan with a regular expression or a workspace glob (#502).**
  - A `pnpm run /<regex>/` selector in a package script was compiled and run against the
    repository's own script names, so a crafted pattern could backtrack for minutes. Present since
    0.4.7 (#276). Cejel no longer evaluates it: the reference is treated as unresolved, which
    withholds both A1 coverage credit and the "no coverage configuration" finding. **This is the one
    scoring change:** a repository whose only route to its coverage script is a regex selector loses
    that credit, under every rubric.
  - Declared workspace globs (#479, new in 0.6.5) were translated to regular expressions, and a glob
    with many `*`s backtracked polynomially against a long directory name. They are now matched
    without a regex, in time linear in the path, with a cap of 256 characters and 32 segments. A
    longer pattern is treated like any pattern Cejel cannot parse: an include pattern is skipped,
    and an exclusion pattern makes Cejel read only the root `package.json`. Matching is otherwise
    unchanged.
- **HTTP server: an uploaded snapshot could make Git read another repository on the host (#500).**
  An upload containing a `.git` entry could point Git at another checkout, and the certificate could
  then carry that repository's commit and a tracked file name. Upload paths with a `.git` segment are
  now refused, compared case-insensitively and including Windows aliases (trailing dots or spaces, an
  NTFS stream suffix, the `GIT~1` short name). Git discovery for an uploaded snapshot cannot leave the
  snapshot directory. Affects HTTP-server deployments where another checkout is readable on the host;
  CLI scans are unchanged.
- **Terminal certificate: control characters from ingested findings reached the terminal (#500).**
  Repository- and ingest-derived fields are stripped of C0 controls, DEL and C1 controls before they
  are printed; a newline or tab inside a field becomes a space. Cejel's own text and `report.json` are
  unchanged.

**Public corpus.** A preregistered confirmation scored the 23 public corpus repositories under v17
and v26, at v0.6.5 and at the fix commit (`82cba330`), which differs from this release only in
version identity and records, with no change under `src/` outside tests. All 23 reports were
byte-identical under both rubrics, so neither fix moved any public repository
([`docs/experiments/public-delta-0-6-6-2026-10-15/result.md`](./docs/experiments/public-delta-0-6-6-2026-10-15/result.md)).

## [0.6.5] — 2026-10-15

### Added

- **New prospective rubric `witan-rubric-v26-prospective-2026-10-14`, explicit opt-in only
  (#478).** Select it with `--rubric-pin`; the public default stays v17. v26 carries no precision or
  recall claim. It is the next calibration candidate: v25's complete closure (the v22 chain plus
  v25's inline health-route credit), without v23's or v24's mechanisms, plus one change of its own,
  item 6, below. Recorded in `leaderboard/RUBRIC_CHANGELOG.md` (2026-10-14).
- **v26 item 6: A5's no-reconciliation finding and A2's tenant-without-RLS finding fire only on the
  evidence that settles them (#482).** Under `witan-rubric-v26-prospective-2026-10-14` alone, as
  ruled in the operator-signed `docs/calibration/v26/ruling-item-6.md` (#477) and its amendment 1,
  `docs/calibration/v26/ruling-item-6-amendment-1.md` (#483).
  - **A5** fires only when the repository itself names a claim-reconciliation artifact that is
    absent from its tree, and it cites the declaring line. The artifact's basename is `claim` or
    `claims` with `reconciliation`, `register` or `ledger`, and an optional `reality` between. The
    name counts as a relative link or code-span path in the root README, a top-level `docs/` page or
    the root `CONTRIBUTING.md`, or as a path in a GitHub Actions workflow step. A path a workflow
    step writes (after `>`, `>>`, `tee`, `-o` or an `--out…` option) names nothing, and nor does
    anything in an `actions/upload-artifact` or `actions/download-artifact` step.
  - **A2** fires only when the repository's own `.sql` enables row-level security or creates a
    policy somewhere, and a `CREATE TABLE` with a tenant column names a table that no
    `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY ... ON` covers (a later `DISABLE` in the same
    directory uncovers it). It names the table and cites its `CREATE TABLE` line. Within one
    migration directory, a table a later `DROP TABLE` removes is not named, and one a later
    `ALTER TABLE ... RENAME TO` renames is named by its new name with its coverage carried over. A
    drop or rename of it in another directory means it is not named. Where Cejel cannot read the SQL
    that would settle it (dynamic SQL, row-level security outside `.sql` files, a policy, drop or
    rename whose table name it cannot read), it abstains on every table.
  - **Otherwise each abstains:** no finding, and one sentence in the certificate's "What was not
    established".
  - **Amendment 1:** when no Cejel-format artifact is present and none is named, A5's
    `reconciliation_artifact_depth` is omitted, and `claim_match_rate` and `claim_source_depth`
    carry A5's score at their declared relative weights. Every other metric and every status rule
    is unchanged.
  - **Direction:** under v26, A2 fires on a disjoint set of repositories from v17's, which fires
    only when no policy exists at all. Where A5 abstains and nothing is named, a 0 no longer counts
    against its score. On the behaviour corpus no specimen's A5 status differs from v25's; without
    the amendment, 11 of 22 went from `warning` to `critical`.
  - **Report format:** no new field. Under v26 the abstention sentence travels in the existing A2
    and A5 criterion `notes`, and where amendment 1 applies A5's `metrics` array has two entries,
    so v26 `report.json` and certificate bytes change. On the behaviour corpus and the synthetic
    fixtures, item 6 left every v17 through v25 report byte-identical. v26's behaviour fingerprint
    moved (the A5 component and the report components of the specimens whose composite scores
    moved), and v25 and v26 no longer collide.
  - **Public corpus (#497).** In the preregistered before-and-after on the 23 public corpus
    repositories (v25 against v26, both at `98dbf250`), the A5 finding stopped firing on all 16
    repositories that carried it under v25, and A5 rose on each. No repository carries an A2
    tenant-without-RLS finding under either rubric, so the public corpus does not test the A2 rule.
    No other criterion moved.
- **v26 item 8 ruling recorded, not implemented (#496).** The operator-signed
  `docs/calibration/v26/ruling-item-8.md` sets when A3's "declares neither a build nor a typecheck
  script" finding may fire under v26. This release contains the record only. No behaviour changes
  under any rubric.

### Changed

**Scoring under `witan-rubric-v17-2026-07-24` and every selectable rubric (#479, #484, #487,
#489).** This release changes v17 scoring with no identifier bump, as 0.6.3 and 0.6.4 did. Each
change is a recognition fix: it reads evidence Cejel did not read before. Weights and thresholds
are unchanged. Each added synthetic specimens to the behaviour corpus, re-pinned the fingerprints
and report goldens, and recorded its before-and-after on that corpus in
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) (2026-10-14 entries).

**Public corpus (#497).** A preregistered before-and-after scored the 23 public corpus
repositories under v17 at v0.6.4 (`093de2a1`) and at the #490 merge (`98dbf250`), which differs
from this release only in version identity, records and experiments, with no change under
`src/witan/`. Every expected value held
([`docs/experiments/public-delta-0-6-5-2026-10-15/result.md`](./docs/experiments/public-delta-0-6-5-2026-10-15/result.md)).
Five repositories moved at scoring level, all up or unchanged, none down: two in B3 through #479,
both declaring workspaces, and three in A1. No other criterion moved, and the #489 rule changed no
public repository. With only the behaviour fingerprint removed, 7 of 23 reports are
byte-identical; the other 16 differ in scores, metric components or evidence labels. This measures
movement, not whether any finding is correct.

- **B3 `ci_script_depth` reads the scripts of declared workspace packages (#479).** In npm, yarn
  and pnpm workspaces the root `package.json` often only orchestrates, and the scripts live in the
  workspace packages, so reading the root alone undercounted them. B3 now also reads the
  `package.json` of each package that the root `workspaces` field or a root `pnpm-workspace.yaml`
  declares. Globs are expanded against tracked files and `!` negations are honoured. At most 64
  patterns and 200 manifests are read, and vendored, generated and test trees never count. With no
  workspace declaration nothing changes. **Direction:** B3 is up or unchanged under every rubric,
  never down.
  - **A3, v20 through v26:** the "declares neither a build nor a typecheck script" finding no
    longer fires when a declared package declares `build` or `typecheck`. A read cut short by the
    cap does not assert the absence. On such a repository the Dockerfile `HEALTHCHECK` or
    health-route finding can fire in its place.
  - **Not changed:** A3's `prod_readiness_primitives` build-or-type-check component still reads
    the root `package.json` only, so v17 A3 does not move. Whether it should read declared packages
    is left open.

  The B3 metric line and the A3 finding's evidence label state how many declared manifests were
  read, so `report.json` and certificate bytes change for repositories that declare workspaces.
- **A1 recognizes more coverage configuration before it says there is none (#484).** A1's "no
  coverage configuration was detected" finding now withdraws when coverage is configured in a way
  the tool's own documentation defines:
  - **Command flags.** v23's recognition of a coverage flag on a test command reachable from a
    test entry point now runs under every rubric. Outside v23 it is added to the v17 rules, not
    substituted for them. Every rubric, v23 included, also newly reads `python -m pytest --cov`;
    `go test -cover` / `-coverprofile` / `-covermode` / `-coverpkg`; `dotnet test --collect "XPlat
    Code Coverage"`, `"Code Coverage"` or `/p:CollectCoverage=true`; and `cargo llvm-cov`. Where a
    flag's ownership or reachability can't be resolved, the absence is withheld with a note instead
    of asserted.
  - **Configuration files.** Codecov, nyc and c8 dotfiles; `setup.cfg` / `tox.ini` coverage.py
    sections; a `package.json` `"jest"` coverage key; `vite.config` `test.coverage`; `.simplecov`;
    PHPUnit's `<coverage>`; JaCoCo applied in Maven or Gradle; `tarpaulin.toml`.
  - **Not counted.** Disabled, commented-out and misnamed forms. A bare coverlet package reference
    does not count either, because coverlet's documentation says it collects nothing on its own.

  **Direction:** up or unchanged under every rubric, never down. A finding can disappear but none
  can appear. The two v23 behaviours that could assert one stay v23-only. A1
  `verification_script_ratio` and `coverage_percent` can rise. The finding's derivation names the
  widened pattern set (`cejel.core-a1.coverage-configuration.v3`, or `.v4` under v23). A1 now also
  reads shell wrappers a test script calls, justfiles, `setup.cfg`, `vite.config`, `pom.xml` and
  `build.gradle`. Outside v23, a content-read skip abstains the whole criterion, so one of these
  files becoming unreadable between inventory and read can abstain A1 where it did not before.
- **A1 reads test assertions in more frameworks before it calls a test file hollow (#487).**
  A1 `non_hollow_test_share` now recognizes each framework's documented assertion idioms (the .NET
  case was reported in #406):
  - xUnit, NUnit and MSTest (`Assert.Equal(`, `Assert.That(`, `Assert.AreEqual(`, `ClassicAssert`,
    `CollectionAssert`, `StringAssert`);
  - XCTest (`XCTAssert…(`, `XCTFail(`, `XCTUnwrap(`);
  - ScalaTest (`assert(`, `assertResult(`, `assertThrows[`, `intercept[` with an `org.scalatest`
    import; should/must matchers with a ScalaTest matchers import);
  - Kotest (`shouldBe` and other `shouldX` matchers with a Kotest matchers import);
  - tape and tap (`t.equal(`, `t.ok(`, `t.same(` and the other documented assertions, with a
    `tape` or `tap` import or require).

  An idiom counts only outside comments and string literals. Documented suite-level skips make a
  file hollow: NUnit or MSTest `[Ignore]` on the fixture class, ScalaTest `@Ignore` and Kotest
  `@Ignored` on the suite class. Per-test skips do not. `*Tests.cs` and `*Spec.scala`-style files
  enter the hollow denominator only under such a skip, never because their assertions went
  unrecognized. Which files count as tests is unchanged. **Direction:** the share can rise for
  repositories using these frameworks, and an A1 status held at `critical` by a zero share can
  lift. It falls only where a whole suite is skipped. **Not changed:** #409 (tests run through
  build wrappers), which concerns A1's verification commands, not this recognition; and #486,
  filed as a follow-up: the existing `should\.` alternative credits ScalaTest's
  `matchers.should.Matchers` import line by itself.
- **A2 flags a digest compare when the same file computes the digest with a keyed HMAC (#489).**
  This narrows the cost 0.6.4 stated for #430, that "an HMAC result held in a variable named only
  `digest` is no longer flagged". A2's timing side-channel finding now also fires when:
  - an identifier containing `digest`, not a property, is compared with `===`/`!==` (`==`/`!=` in
    Python, Go and Ruby) against a non-literal; and
  - the same file assigns that identifier, before the comparison, from a keyed HMAC computation,
    directly or by reading one earlier HMAC binding.

  The recognized computations are each runtime's documented API: Node `createHmac(…)….digest(…)`,
  Web Crypto `crypto.subtle.sign('HMAC' | { name: 'HMAC' }, …)`, Python `hmac.new(…)` with
  `.digest()` / `.hexdigest()` and `hmac.digest(…)`, Go `hmac.New(…)` then `.Sum(`, and Ruby
  `OpenSSL::HMAC.digest` / `.hexdigest` / `.base64digest` or an `OpenSSL::HMAC.new` instance's
  digest. Assignments and comparisons are read outside comments and strings. A digest from a plain
  unkeyed hash, an unrelated digest-named value, a property, and an `OpenSSL::HMAC` instance (whose
  `==` is constant-time) are not flagged. The #430 line pattern and its regression tests are
  unchanged. **Direction:** A2 can newly fire, and nothing stops firing. On a repository with no
  other A2 surface, A2 moves from not applicable to scored. A scored A2 enters the code-trust mean,
  so this can raise code-trust and overall scores even though it adds a warning. Where a
  repository already had a timing finding, its cited file and line can move to an earlier
  production file the new rule matches.

**Presentation only, under every selectable rubric (#490).** No score, weight, detector, file
selection or finding changes, and `RUBRIC_CHANGELOG.md` has no entry.

- **The certificate states which delegated CI it did not read (#490).** B3 reads every recognised
  workflow's commands, but a GitHub Actions workflow can hand its work to code Cejel does not read:
  - a job that calls a reusable workflow as `owner/repo/.github/workflows/<file>@<ref>`, counted as
    another repository's even when it names this one, because Cejel does not read that ref;
  - a step that runs a local action: `uses: ./path`, whose directory holds `action.yml` or
    `action.yaml`. The certificate calls it a local action because the check reads only that the
    `action.yml` (or `action.yaml`) exists. It does not open the file, so it cannot tell a
    composite action from a JavaScript or Docker one, and counts each the same way.

  A test or lint command inside that code is unseen, and the certificate read as if it were absent.
  The B3 citation that states how many workflow files were read (#467, 0.6.4) now also says, for
  example, `CI workflow (2 workflow files read; 1 cited; 2 delegated steps not read (1 reusable
  workflow in another repository, 1 local action))`. If that would pass the evidence label's
  180-character limit, only the per-kind breakdown is dropped and the count stays. Not counted:
  - a local reusable workflow (`uses: ./.github/workflows/x.yml`), one of the workflows already
    read;
  - a marketplace action such as `actions/checkout@v4`, which runs no repository command;
  - a `./` path whose directory has no `action.yml` or `action.yaml`;
  - a commented-out `uses:` line, or one inside a `run: |` script.

  When nothing is delegated, nothing is added. No dependency is added. A3 and B2 count workflow
  paths and read no step, so their citations are unchanged. The text is carried in the existing
  evidence `label` field: no schema change, no report-format bump. `report.json` and certificate
  bytes change only for repositories whose workflows delegate this way. Rubric behaviour
  fingerprints, the v17 golden pins and every score are unmoved.

## [0.6.4] — 2026-10-13

### Added

- **`cejel` warns when npx ran a different cejel than it resolved (#436, #462).** Inside a checkout
  of this repository, `npx @cejel/cejel@<version>` can run whichever `cejel` is on `PATH`. When the
  requested version is known (an exact `-p @cejel/cejel@<version>` spec, or npx resolving the
  request to the checkout and installing nothing) and differs from the version running, Cejel
  prints one `warning:` line to stderr naming both and the path that ran. Elsewhere, and in npx
  command mode (`--call`/`-c`), it stays silent. The run and its exit code are unchanged, and
  `--quiet` does not hide it. This narrows #436; it does not fix it. The warning comes from the
  `cejel` that ran, so one older than 0.6.4 on `PATH` prints nothing; run npx from another
  directory. `CONTRIBUTING.md` explains the trap.

### Fixed

- AVA assertion calls in active inline callbacks now count toward A1 non-hollow test share;
  skipped/todo callbacks, comments, strings and unrelated objects do not receive this new credit (#427).
- A2 no longer asserts a timing side-channel from a bare public digest identifier. Comparisons whose
  left-hand name contains hmac or signature, or begins with mac, remain covered; an HMAC result
  held in a variable named only `digest` is no longer flagged (#430). A digest name alone supplies
  no evidence that it is secret.

These are scoring changes under the existing rubric identifiers, with weights and thresholds
unchanged. The behaviour corpus has two new synthetic specimens; fingerprints and report goldens
are re-pinned with the deltas recorded in RUBRIC_CHANGELOG. The preregistered public-corpus delta has run: 23/23 public rows completed in each of the
pre-#459, post-#459 and corrected-fixes arms, with zero score or modeled placement changes.
Records: docs/experiments/v17-delta-459-427-430-successor-2026-10-13/result.md.

### Changed

**Certificate states what it read (#467), presentation only: no score, weight, detector or file selection
changes under any rubric.** The CI-workflow evidence in A3, B2 and B3 cites one workflow file (B2:
up to three) and read as if only that file was checked. When a criterion counted or read more
workflow files than it cites, the citation now says so beside it, for example
`CI workflow (10 workflow files read; 1 cited)`. B3 opens every workflow's content (`read`); A3 and
B2 count the workflows their path predicate recognises (`counted`). A workflow Cejel withheld
under the existing content-read skip reasons (for example `too_large`) is stated as
`1 not read (too_large)`, never counted as read. Separately, A3's build/type-check component and
B3 `ci_script_depth` read package scripts from the root `package.json` only; when other authored
`package.json` files exist (A1's own predicate, so vendored and dependency trees are not counted),
the metric line now says `package scripts for this metric are read from the root package.json only;
K other package.json files present`, or `no root package.json found; …` when there is none. A
repository with one workflow file and no other authored `package.json` renders byte-identically.
Carried in existing fields (evidence `label`, metric `presentation.condition`): no schema change,
no report format bump. Certificate and `report.json` bytes change for repositories with more
workflow files than cited or with other authored `package.json` files, so byte-reproducibility
records made with earlier versions will differ for those repositories. Rubric behaviour
fingerprints, the v17 golden pins and every score are unmoved, so `RUBRIC_CHANGELOG.md` has no
entry.

**Scoring behaviour change under `witan-rubric-v17-2026-07-24` (and every selectable rubric), no
identifier bump: direction up, on `prod_readiness_primitives` (A3) only (#459).** The A3 Express
error-handler shape check now recognises two ordinary spellings it missed, both public-documentation
idioms rather than anything specific to one codebase: a lint-underscored second or third parameter
(`(err, _req, res, next)`, `(err, req, _res, next)`) and a trailing comma after the fourth parameter
(`(err, req, res, next,)`, Prettier's default for a multi-line parameter list). Reachability is
unchanged: a handler still needs a `.use(` registration or an export in the same file, outside
comments, and never counts in a test file. Measured on the behaviour corpus: `complete-node-service`
A3 1.6 → 2.0 and the new `inline-health-route-and-prettier-handler` fixture A3 0.4 → 0.7, error
boundary 0 → 1 in both; overall unchanged at one decimal except `complete-node-service` under v17
(2.8 → 2.9). Recorded in `leaderboard/RUBRIC_CHANGELOG.md` (2026-10-12). This is a recall change on
a default-rubric metric: the paired public-corpus delta at unchanged corpus commits (the 0.4.9
precedent, #306) has now run: 23/23 public rows completed in both arms, with zero score or modeled placement
changes. See the successor three-arm result linked above; private material was excluded.

- **New prospective rubric `witan-rubric-v25-prospective-2026-10-12` (#459)** (explicit opt-in via
  `--rubric-pin`; the public default stays v17). It inherits v22 and adds one mechanism: the
  "health or readiness signal" component also credits a route declared inline in an application
  file. No precision or recall claim; the public paired rescore has not run. It is batched into its
  own rubric so the next calibration takes it together with other recognition changes.
- **Certificate and docs state which forms count as a health or readiness signal** (a dedicated
  health/readiness file, a Dockerfile `HEALTHCHECK`, Kubernetes probes) and that a route declared
  inline in an application file does not, under the calibrated rubric. Presentation only:
  `report.json` bytes are unchanged by this item.
- **The info-severity `health_readiness_route` finding (v20 and later) now reads** a repo-root
  `server`/`index`/`app`/`main` file and `server/`, `backend/` and `api/` trees, previously not
  admitted, so an inline `/health` route there stops being reported as missing. No score moves. A
  withheld oversized file in those locations is now also disclosed as withheld for this signal.
- **The certificate glossary's "Protected-path review gate" entry matches what the metric counts
  (#445, #463):** a CODEOWNERS file at the repository root, `.github/` or `docs/`, or a document
  stating a required-review or branch-protection policy, and not a changelog, experiment or
  calibration record, review note or report. It had still described any CODEOWNERS file or review
  documentation, the pre-0.6.3 rule. Presentation only.
- **The B6 protected-path gate's "missing" line names the same evidence (#465, #466):** no
  CODEOWNERS file in a location GitHub reads, and no documented required-review or
  branch-protection policy. It had said "no CODEOWNERS", which read as false for a repository with
  a CODEOWNERS file elsewhere. Presentation only.
- **The GitLab CI template asks for full history (#456, #461).** It sets `GIT_DEPTH: "0"` on the
  `cejel` job only, so that A2 and B2 can read full commit history instead of GitLab's default
  shallow clone, which the certificate discloses as a history limitation. It takes effect for an
  include pinned to `v0.6.4` or later. `docs/gitlab-ci.md` says how to keep it when copying the job
  and which variables override it, from GitLab's documentation. The template has still not been
  run on a GitLab runner.

### Plugin

- **The plugin README's #436 note is narrowed, not retired:** it now says that from 0.6.4 Cejel
  prints a warning when npx ran a different cejel than it resolved, that an older `cejel` on
  `PATH` prints nothing, and keeps the remedy, run it from another directory.

### Docs

- **The cycle-13 calibration record is published in `docs/calibration/cycle-13/` (#469, #470):**
  the preregistered v17 and v23 detection recall and precision estimate, its protocol, amendments,
  seals and errata, and a signed erratum to the v22 record. Frame membership, labels and reviewer
  notes are not published. It was measured with `@cejel/cejel@0.4.11` and does not describe this
  release.

### Internal

- **The cited-commits check keys errata by an exact context excerpt, not `file:line` (#444,
  #464)**, so a new entry written above a corrected citation no longer leaves the citation flagged
  and its erratum stale. A repository check only: nothing shipped changes.

## [0.6.3] — 2026-10-10

### Changed

Scoring behaviour change under `witan-rubric-v17-2026-07-24`, no identifier bump, not
version-gated (#433). Each change removes a credit Cejel gave to text that only describes a control.
Recorded in `leaderboard/RUBRIC_CHANGELOG.md` (2026-10-09).

The public-corpus before-and-after has run: preregistration
`docs/experiments/v17-behaviour-delta-433-2026-10-09/PREREGISTRATION.md`, result
`docs/experiments/v17-behaviour-delta-433-2026-10-09/result.md`. All five preregistered expected
values held. Two public rows moved: cejel B6 → not applicable, overall unchanged at 2.8; sinatra
B6 → not applicable, overall 2.4 → 2.2. No ranked placement changed.

- **B6 fail-closed privilege check and kill switch** no longer credit a test, fixture or
  `calibration/` file, or a match that lies only inside a comment.
- **A3 error-boundary filename rule is anchored to a path segment**, so `swallowed-error.ts` is no
  longer an error boundary, and no file under `calibration/` counts.
- **The A3 Express error-handler check no longer credits a handler that appears only inside a
  comment.** Before, only the registration half ignored comments. Block comments are now stripped
  as well as `//` comments.
- **B6 human-gate and required-review documentation** no longer credit a changelog, an experiment
  or calibration record, a review note, a `reports/` file, a test or fixture tree, or a committed
  Cejel certificate.
- **CODEOWNERS counts only at the repository root, `.github/` or `docs/`**, the locations GitHub
  reads, in B6 and B2.
- **B6's protected-path evidence label names the branch that fired.** A CODEOWNERS file and a
  documented review policy now carry different labels. This has no score effect.
- **The behaviour-fingerprint corpus gains `control-described-not-built`**, and every selectable
  rubric's fingerprint is re-pinned.

### Plugin

- **The plugin README's #433 known issue is retired**: it now says the three false citations it
  named on Cejel's own certificate are fixed in 0.6.3. The #436 note stays; #436 is not fixed.

## [0.6.2] — 2026-10-08

### Added

- **A Claude Code plugin, `plugins/cejel/`, listed by a marketplace at the repository root (#429).**
  `/plugin marketplace add BargLabs/cejel`, then `/plugin install cejel@cejel`, gives Claude the
  `scan` tool (started through `npx`, pinned to this release) and a `cejel-scan` skill on when to
  scan and how to read a certificate without overstating it. Scoring is unchanged and stays
  offline. The plugin's manifest version and its npx pin move with every release:
  `scripts/bump-release-version.mjs` moves them with `package.json`, `validate:distribution` and
  the release driver's preflight refuse a mismatch, and the release-currency check reads them at
  the tag as a fourteenth surface.
- **`cejel mcp` serves the MCP server over stdio (#432)**, the same server as the `cejel-mcp` bin, which
  keeps working. The Claude plugin now launches it as `npx -y @cejel/cejel@<version> mcp`, the
  pinned-launcher form the Claude directory reads, and the release checks read only that form.
  `cejel mcp` takes no arguments; a repository directory named `mcp` is scanned with
  `cejel scan mcp` or `cejel ./mcp`.
- **A shallow clone is disclosed on the certificate (#428, #432).** When the scanned repository is a
  shallow clone, `report.json` carries `historyLimitations` naming the criteria that read commit
  history, A2 and B2, and the terminal, HTML and markdown certificates show it. It is
  display-only: no score, status, abstention, badge or `--min-score` outcome changes, and it is not
  a scan limitation. Report format 1.4 -> 1.5 (additive optional). The README's Action examples
  now check out with `fetch-depth: 0`.
- **The MCP `scan` tool carries a title and safety annotations (#429).** It is registered with
  `registerTool` as "Scan repository trust" with `readOnlyHint: true`, `destructiveHint: false`,
  `idempotentHint: true` and `openWorldHint: false`, and both resources carry titles. Its input,
  output and behaviour are unchanged.

### Changed

- **The Docker image builds `dist/` once, natively, and runs nothing under emulation (#421).** The
  build stage now runs on the builder's own platform for both linux/amd64 and linux/arm64, and
  the final stage copies its bin links, executable bits and `/workspace` instead of creating them
  with `RUN`. Before this, the arm64 image ran `pnpm install` under QEMU, which hung 2 of 20
  release-shape builds in a preregistered measurement
  (`docs/experiments/dist-determinism-2026-10-07/`) and hung v0.6.1's first publish run for 53
  minutes. One build also means the SBOM and both images describe the same `dist/` bytes, which
  removes the mismatch in #418. A new check confirms each platform's image has the same runtime
  shape as before: executable entry points, the `cejel` and `cejel-mcp` links, the entrypoint,
  and `/workspace` owned by the `node` user. Who is affected: nobody using the image. Its contents
  and behaviour are meant to be unchanged; only how it is built changes.

### Deprecated

- **The `@cejel/cejel/d-series` subpath is deprecated and will be removed in 0.7.0 (#419).**
  D-series detection was retired on 2026-08-02: the D1-D6 rules are a taxonomy for organising
  findings, not a production detector, and a zero-result D-series scan does not mean a repository
  is clean. Loading the subpath now emits one Node `DeprecationWarning` with code
  `CEJEL_DEP_D_SERIES`. Silence only this warning with
  `--disable-warning=CEJEL_DEP_D_SERIES` (Node 20.11 and later), or all deprecation warnings with
  `--no-deprecation`. Every export still works until 0.7.0.
  The 0.6.1 entry below listed the subpath's rule tier table under Added; that table is deprecated
  with the rest of the subpath. Who is affected: code that imports `@cejel/cejel/d-series`.
  `cejel scan`, `cejel-mcp`, `@cejel/cejel/decision-contracts`, scores, bands and report fields
  are unchanged.

## [0.6.1] — 2026-10-06

### Added

- **The `@cejel/cejel/d-series` and `@cejel/cejel/decision-contracts` subpaths export a rule tier
  table (#414).** `D_SERIES_RULE_TIERS` and `DECISION_CONTRACT_RULE_TIERS` give, for each rule,
  its analysis tier (`lexical`, `structural` or `semantic`, as ADR-0016 defines them), the source
  file of its matcher, and one line saying what the matcher does. The table describes how each
  matcher works. It says nothing about how well a rule detects anything. No matcher changed.
  Who is affected: code that imports either subpath. `cejel scan` runs neither pack, and no
  score, band or report field changes.

### Changed

- **Release SBOMs list what each binary and the image bundle, and are attested (#404).** Each
  standalone binary's SPDX SBOM is now generated from the build: it lists the packages bundled
  into the binary with their exact versions, the Node.js runtime it embeds, and the binary's
  SHA-256. The 0.6.0 SBOMs listed only the scanned directory and the binary. Each SBOM is now
  attested to its binary, so it can be checked with
  `gh attestation verify <binary> -R BargLabs/cejel --predicate-type https://spdx.dev/Document/v2.3`.
  The Docker image keeps its SBOM of base-image packages and gains a second SPDX attestation
  listing the packages Cejel bundles. A release whose SBOM is empty, or is missing a required
  package, now fails before anything is published or attested. 0.6.1 is the first release built
  this way. Who is affected: anyone who reads or verifies the release SBOMs. The npm package does
  not carry an SBOM. No score, band or report field changes.

- **The certificate reads correctly the first time (#415).** Five changes to wording and layout on the
  terminal, HTML and Markdown certificates. They come from a first read of the 0.6.0 certificate
  for `expressjs/express`.
  - A static coverage percentage of 0 is no longer shown as `0/100 percent`, which read as "0%
    coverage". When coverage configuration is present it now says no published coverage
    percentage above 0 was found, that Cejel does not run tests, and that the rubric scores this
    as 0 of 100. When no coverage configuration is present it says that instead, with the same
    scoring.
  - The summary box and "What was established" now count dimensions the same way (for example
    `code 2 of 5, process 3 of 6`) and say how many do not apply. "Low confidence" now names the
    counts that set it. It also says that dimensions which do not apply count as not measured.
  - "What to do next" no longer tells you to make files readable when Cejel skipped them only
    because of their file type. Those are named as outside what Cejel reads. Advice remains for
    entries skipped as unreadable, too large, on a denied path, or not a regular file.
  - A Conditional, At risk or Unverified verdict with no critical or warning finding now has one
    sentence. It says the verdict comes from the overall score's band and names the
    lowest-scoring measured dimensions.
  - The note about the product name is in plain English. It now appears below the run, CLI and
    rubric rows, and below the headline scores on the terminal.

  Who is affected: anyone reading a certificate, and anyone who parses certificate text. No
  score, band, verdict or abstention moves. `report.json`, `summary.json`, `badge.json` and
  `badge.svg` are byte-identical, so `attestation.json` binds the same report digest, and
  `reportFormatVersion` stays `1.4`.

## [0.6.0] — 2026-10-03

### Added

- **`cejel export gitlab-codequality <report.json> [-o gl-code-quality-report.json]` (#401).**
  Writes a Cejel report's located findings as a GitLab Code Quality report, offline. Only
  findings with both a file and a measured line are exported. Findings scoped to a whole file
  (`line: null`) and ingested third-party findings are not exported; a footer on stderr counts
  them, so nothing is silently dropped. Severity maps `critical` to `critical`, `warning` to
  `major` and `info` to `info`; `minor` and `blocker` are never emitted. No score, band or
  report field changes.
- **A GitLab CI template, `ci/gitlab/cejel.gitlab-ci.yml` (#401),** documented in
  [`docs/gitlab-ci.md`](./docs/gitlab-ci.md). It is an includable job that runs the scan,
  publishes the Code Quality report as `artifacts:reports:codequality`, keeps `.cejel/` as an
  artifact, and fails the job below an optional `CEJEL_MIN_SCORE`. Include it from this
  release's tag. The template is covered by structural tests in this repository; it has not yet
  been run on a GitLab instance by us.

### Changed

- **The GitHub Action's description is shorter (#402),** to fit GitHub Marketplace's limit of
  125 characters. Inputs, outputs and behaviour are unchanged.

## [0.5.0] — 2026-10-02

### Changed

- **`--min-score` now exits non-zero when fewer than half of the applicable dimensions were
  measured, even when the score clears the minimum.** Before this, a score resting on a handful
  of measured dimensions passed the gate as readily as a fully measured one. Now the gate refuses
  if the measured share of applicable (not `not_applicable`) dimensions is below one half,
  overall or in any category. Who is affected: CI jobs that run `--min-score` on
  low-coverage repositories, such as a small or newly created codebase where most dimensions
  return `insufficient_data`. Those jobs used to pass and will now fail. How to see why: stderr
  reads `Cejel: cannot evaluate the required minimum N/4.0 because fewer than half of the
  applicable dimensions were measured in at least one score (…)`, with the measured/applicable
  counts in the parentheses. The scores in the report do not change; only the exit code does.

- **The HTTP MCP server is stateless: certificates and badges come back with the scan that
  produced them (#369, merged as #388).** The `cejel://last-scan/certificate.html` and
  `cejel://last-scan/badge.svg` resources are removed. They never worked over HTTP: each request
  builds a fresh server, so a resource read could not see the scan from an earlier request and
  always answered "No scan has run yet". The `scan` tool now takes an optional
  `artifacts` list (`certificate`, `badge`) and returns the requested HTML certificate and SVG
  badge in the same response. Who is affected: HTTP MCP clients that read those two resources
  after calling `scan`; pass `artifacts` to the `scan` call instead. The stdio MCP server and
  the CLI are unchanged.

- **Report format 1.4: each metric records the weight share it actually contributed (#370,
  merged as #389).** Metrics gain `appliedWeightShare`, and the HTML certificate reads it from
  the report instead of recomputing it at render time, so the weights a certificate shows are
  the ones the signed report carries. `reportFormatVersion` moves from `1.3` to `1.4`. No score,
  band or behaviour fingerprint changes; a test pins that the field moves neither. Who is
  affected: consumers that validate reports against a closed 1.3 schema.

### Fixed

- **The HTTP MCP `summary` response no longer rejects valid scan results (#369, merged as
  #388).** Its strict schema did not allow the per-finding `dimensionBand` and `displaySummary`
  fields or the content-read summary that scan results carry, so some valid scans failed
  schema validation on the way out.

---

## [0.4.11] — 2026-09-25

### Fixed

- **A2 under the default rubric missed a populated PostgreSQL password in a committed `.env`
  file's `DATABASE_URL` (#336).** A `DATABASE_URL=postgres(ql)://user:password@…` in a
  non-template `.env`/`.env.*` file is now a committed-secret finding, in both the current-tree
  and the history scan, and an unchanged value is not reported twice. A placeholder-shaped
  password is not flagged, and `.env.example`-style templates are not read. This is a change to
  A2 under the calibrated default. It moved no row of the published corpus, which contains no
  non-template `.env` file. See the 0.4.11 entry in `leaderboard/RUBRIC_CHANGELOG.md`.

- **A3 `prod_readiness_primitives` under the default rubric missed a real, registered Express
  global error handler.** An independent evaluator ran 0.4.10 against five pinned revisions of
  his production system; every revision reported no error boundary despite a real handler being
  present and wired in. We do not have his code, so this widens on a fixture catalogue of public
  Express idioms instead of his specific file (`src/witan/__tests__/a3-error-boundary-idioms.test.ts`
  has the full table). Now credited: a handler with its first parameter renamed `_err` or its
  fourth renamed `_next`; a class method registered via `.bind(this)` from an `export class`
  (TypeScript); and a handler file under a conventional `server/` root using a `.mjs`/`.cjs`
  extension. Also fixed a related false positive found while building the catalogue: a
  commented-out `// app.use(errorHandler);` line was wrongly making an otherwise-dead,
  never-registered stub count as reachable, because the reachability check read raw file text
  without stripping comments. Stated limits, not silently widened: a three-parameter handler with
  `next` omitted entirely stays uncredited (Express recognizes error middleware by arity, and
  matching on names alone there would be the arity-only false positive this detector's shape
  pattern exists to avoid). This is a recall change on `prod_readiness_primitives` under the
  default rubric; it carries a paired before/after delta record at unchanged corpus commits in
  `docs/experiments/v17-behaviour-delta-post-0.4.10-2026-09-23/`. No fixture in the existing v17/v22 byte-stability or
  A3 suites changed output — this widening only reaches repositories that hit the newly-credited
  idioms.

- **The (prospective, `witan-rubric-v23`) `health_readiness_route` info-severity finding missed a
  real Express health route under several ordinary, public-documentation idioms**, cataloged and
  regression-guarded in `src/witan/__tests__/a3-health-route-idioms.test.ts`. This finding is
  info-severity, not a scored metric — no A3 score moves; a certificate's "what to do next" does.
  Now also credits:
  - a segment-internal `_`/`-` prefix directly after the route's leading slash (`/_health`);
  - the Rails convention `/up`, slash-anchored only — never as a bare decorator string, which
    would also match unrelated direction/toggle literals (`'up' | 'down'`);
  - the NestJS decorator idiom with no leading slash (`@Get('health')`), requiring `@Get(...)`
    context for bare `health`; context-free bare keywords are limited to `healthz`, `readiness`,
    and `liveness`, so ordinary `'ready'`, `'live'`, and `'health'` strings do not match;
  - a `functions/` serverless-functions directory (Firebase/Netlify convention), added to this
    one signal's file-selection predicate rather than to the shared implementation-file allowlist
    other A3 signals also use.

  Deliberately left as stated limits, not silently dropped: `/ping`, `/status`, and `/alive` (too
  generic, or not a named convention the way `/up` and `/healthz` are); a trailing query string
  (`/health?probe=1` — crediting it would also credit an outbound probe/test URL, and a false
  assertion is worse than a miss here); and a health-check library imported with no literal path
  anywhere in the repo (`express-healthcheck`, `@godaddy/terminus`, `lightship`) — whether the
  import itself should count as evidence is an open decision, not made in this change.

  Two of the three file-selection examples this gap was originally reported against
  (`src/server/health.controller.ts`, `app/api/health/route.ts`) turned out to already be
  admitted by the existing predicate once checked against the running detector; only the
  `functions/` case was a genuine gap.

- **A certificate that withheld content could print no disclosure line at all, and a reader could
  not tell a correct no-intersection ("no signal would have read it") from a disclosure that
  simply failed to print.** On the 2026-09-21 reruns, a revision with two oversized withheld files
  produced identical certificates under the default rubric and the prospective `witan-rubric-v23`
  — no withheld-path line under either — leaving open whether v23's withheld-path abstention
  correctly found no intersection or should have fired and silently did not. The certificate's
  "What was not established" section now carries exactly one withheld-path sentence on every
  certificate, never conditionally: "No content was withheld from any signal" when nothing was
  withheld; a "no signal that would have read them selected them" sentence when something was
  withheld but earns no signal's own file-selection test; the existing per-signal abstention
  disclosure, plus the count, when the intersection is earned and `witan-rubric-v23`'s mechanism
  acted on it; and, new for every other rubric (including the calibrated public default), a
  sentence naming which signal *would* have read the withheld content and stating plainly that
  this rubric reports on what it read while the prospective v23 rubric abstains instead — the exact
  sentence the 2026-09-21 default-rubric certificate was missing if the second reading is the true
  one. `report.json` (report format 1.3) gains an additive `withheldPaths` array — one entry per
  withheld path, always present (empty when nothing was withheld), each carrying its skip reason,
  every signal whose own file-selection test would have read it, and whether the running rubric's
  mechanism acted on that intersection — computed from the same predicate calls the abstention
  itself consults, so the disclosure and the abstention can never drift apart. No scored metric
  moved on any fixture under any rubric.

## [0.4.10] — 2026-09-17

### Release integrity

**0.4.9 was published to npm by hand, by me, from a machine holding the package token, outside the workflow that generates provenance.** The registry shows publisher `cejel` rather than GitHub Actions, no `gitHead`, and no attestation. The package installs and runs as 0.4.9 and its report output matched the native binaries on the test fixture, but nothing proves the whole artifact came from the tagged build, and a consumer who requires provenance is right to reject it. It cannot be repaired: npm versions are immutable. I will publish 0.4.10 through `publish-npm.yml` with `--provenance` and verify its attestation after publication. The account now lists no access tokens, trusted publishing is configured for that workflow, and the package disallows bypass-2FA tokens. This closes the bypass-token path; it does not make workflow publishing exclusive, because npm still permits a maintainer to publish manually with 2FA. I will publish releases through the workflow and verify their attestations before advancing any other release surface. The release-currency verifier reported 12 of 13 on 0.4.9 and caught it; it did not prevent it. A workflow that is correct but can be bypassed is not an exclusive control. The settings change restricts token access; manual publication remains a residual path, and I will not claim it has been eliminated.

### Fixed

- Measurement-freeze markers can be superseded by an explicit predecessor chain and
  an operator SSH signature. Deletion, unsigned edits, conflicting successors, and
  scoring-source changes still refuse. The live pin is unchanged.

- **Example, placeholder and dummy credentials written into documentation, tutorials and learning
  pages scored as real committed secrets, so A2 asserted a secrets-posture problem that did not
  exist.** A certificate that asserts something false is a category worse than one that misses
  something, which is why this is a fix rather than a precision tweak. The existing mitigation was
  path-based — `docs/`, `documentation/`, `lessons/`, `cookbooks/` and every `.md`/`.mdx`/`.rst`/
  `.adoc` file were removed from A2's current-tree secret scan — and a path rule cannot tell a
  placeholder written into a documentation page from a live credential accidentally committed to
  one. It silences the second in order to suppress the first, and it leaves every instructional
  path it does not enumerate (`tutorials/`, `guides/`, documentation-site sources) flagging
  placeholders as before.
  Under the new prospective `witan-rubric-v24` rubric, A2 classifies a secret-shaped value from
  the value itself and a bounded window of its own file's text, never from the file's path,
  directory or extension. Three outcomes: an intrinsically instructional value produces no
  finding; a value clearing the unchanged high-confidence bar flags at unchanged severity
  *wherever it lives*, so a real credential committed under `docs/` now flags where it previously
  could not be seen at all; and a value Cejel cannot classify from content **abstains** — the
  `secret_cleanliness` metric is withheld, not scored clean, with the reason stated in the
  certificate. An abstention never removes a zero that a confirmed finding earned. Git history
  scanning is unchanged.
  v24 is explicit-only via `cejel scan --rubric-pin witan-rubric-v24-prospective-2026-09-15`,
  inherits no calibration claim, and inherits v22 rather than v23 so that v23's four
  v23-specific mechanisms stay v23-specific. The calibrated public default
  (`witan-rubric-v17`), v22 and v23 are unchanged. The preregistered paired rescore for this
  change is written and has not been run: see
  `docs/experiments/a2-secret-posture-content-context-v24-2026-09-15/preregistration.md`.

## [0.4.9]

### Added

- **`docs/calibration/**` is an authority path in this repository, and nothing here could
  establish that authority.** Measured across every commit that has ever touched it: five
  unsigned, three signed by a key this repository does not list, none verifiable. No
  allowed-signers file existed and no check read a signature, so the `--merge`-not-`--squash`
  discipline that protects a calibration signature preserved something no reader could confirm.
  A signature guard now verifies every commit touching a guarded path against
  `docs/security/allowed-signers`, failing closed on a missing or key-less file — "nobody may
  sign" must not read the same as "anybody may" — and treating a signature from an unlisted key
  exactly as it treats an unsigned commit. It is forward-only: `docs/security/README.md` lists
  the eight earlier commits and states that they remain permanently unverifiable, because
  "signed" and "unverifiable" look identical to anyone who does not check by hand. The guard
  establishes provenance, never correctness.


- **`report.json` now states the rubric's behaviour, not only its name** (report format `1.1` →
  `1.2`). `rubricVersion` is an identifier this project's authors control: it says which rubric a
  build believed it ran, and it stayed unchanged through five scoring changes in 0.4.9. The new
  optional `rubricBehaviourFingerprint` field beside it is a `sha256:` digest of the
  scoring-relevant output of a committed corpus of synthetic repositories under that rubric, so
  two certificates naming the same rubric can be checked for behavioural agreement rather than
  assumed into it. Additive-optional: consumers following the report-format v1 rule to ignore
  unknown optional fields remain compatible. Readers with strict field allowlists must add
  support for this field; the published-package board reader needed that update during release
  verification. Reports produced by earlier versions do not carry the field, and their existing
  attestations remain valid. `report.json` is still byte-identical for the same version at the same revision —
  the value depends on `rubricVersion` alone. See `docs/format-stability.md`.
- **A guard that can see a scoring change made under an unchanged rubric identifier.**
  `src/witan/__tests__/rubric-behaviour-fingerprint.test.ts` scores thirteen committed synthetic
  fixtures under every selectable rubric and fails when the measured result leaves its pin,
  naming the rubric and the criteria that moved. It never reads `rubricVersion` to decide whether
  anything changed. Full account, including what it does not cover: the 2026-09-16 entry in
  [`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md).


- **Every certificate now states its own scope, in its own voice.** Scoring only the repository
  tree at one pinned revision is deliberate and correct — a certificate that reached outside that
  tree could not be reproduced by whoever received it — but nothing on the certificate previously
  told a reader which kind of statement they were holding: a repository whose test suite lives in
  a separate repository, run by its own CI, was reported (correctly) as having zero test files
  against its source files, and a reader had no way to tell that statement apart from a claim
  about the whole system. The "How to read this certificate" section on every surface (HTML,
  Markdown, terminal) now opens with a standing scope line: the certificate describes the pinned
  tree, not the system it belongs to, and evidence outside that tree is neither seen nor claimed
  to be absent. This is additive — no finding's wording changed.
- Under the prospective `witan-rubric-v23` rubric, a large implementation file that exceeds the
  content-read size limit now gets its own named disclosure line — "declined a large
  implementation file that exceeded the repository content size limit" — when it is the reason a
  signal has nothing to measure, instead of folding into the generic coverage-limit sentence used
  for an extension exclusion or a non-regular file. Covers the seven signals that attribute a
  withheld path to themselves: A3's `health_readiness_route`, `observability_depth` and
  `prod_readiness_primitives`, and A5's `claim_match_rate`, `claim_source_depth`,
  `reconciliation_artifact_depth` and `negative_space_documentation`.

### Scoring under the calibrated default

Five of the fixes below change how repositories score under `witan-rubric-v17-2026-07-24`,
the calibrated public default, without any change to the rubric identifier: the `test`-script
content check in both A1's `verification_script_ratio` and B3's `ci_script_depth` (scores
down), A1's authenticated-absence credits (scores up), the pull-request-template directory
form in B2 (scores up), and two A3 production-readiness widenings — the observability-depth
file pattern and the `prod_readiness_primitives` error-boundary check (both up). The
health/readiness-route widening, the `too_large` abstention-disclosure split and the withheld-path
abstention (A3's three signals and A5's four) ship in this release too but are gated to
prospective rubrics and cannot move a score under the calibrated default; the entry below confirms
by measurement that they did not. **The corollary is worth stating plainly rather than leaving to
inference: a default scan still moves a score when Cejel withholds a file from its own file list.
That is unfixed for every user who does not pass an explicit rubric pin.** The full 24-row
before/after corpus delta, per criterion and per metric, is in
[`leaderboard/RUBRIC_CHANGELOG.md` § "0.4.9 — behaviour change under witan-rubric-v17"](./leaderboard/RUBRIC_CHANGELOG.md).
Measured result: 4 of 24 repositories moved — django, vite and the private alfred row on
`B3.ci_script_depth`, all downward, and react and the alfred row on
`A3.observability_depth`, both upward with no score change; one headline moved (django, 3.2 to 3.1).
All 24 reports differ at byte level: report format 1.1 → 1.2 adds
`rubricBehaviourFingerprint` to every report. That format change is separate from the
four rows with scoring-metric changes; it is not evidence that all 24 scores moved. The delta was preregistered before it was run and the
result matched the prediction in full. That entry also records that three of the five changes
moved no corpus row and why, that the rescore guard the changelog cites could not have fired
for this repository, and one over-reach in the content check that is handed to the operator
rather than adjusted.

### Changed

- Removed the stale prospective-rubric board and its certificates from this repository. The
  README now points to the single board on cejel.dev and acknowledges the withdrawal. A
  public-surface guard checks all three site formats and refuses a second scored copy.
- Corrected the `witan-rubric-v23` declaration comment, which claimed v23 "adds only bounded
  recognition of coverage-capable test-runner flags" while the scanner gates three v23-specific
  mechanisms on it: A1 command-flag coverage, A2 PEM private-key grammar, and per-signal rather
  than whole-criterion abstention. The declaration now names all three, and a
  declared-scope guard fails the build if a fourth mechanism is gated on v23 without being
  declared. No scoring behaviour changed under any rubric.

### Fixed

- **A file withheld by Cejel's own content size ceiling was deleted from the scanned file list
  before any collector saw it, so a signal whose pattern would have matched that file reported a
  plain absence instead of abstaining.** The skip was counted and disclosed in
  `contentReadSummary`, but nothing told the collector a file had been withheld from it: a
  `repoFiles.some(...)` over a list the file was removed from returns false, identically to a
  repository that genuinely lacks the thing. Under the prospective `witan-rubric-v23` rubric, a
  withheld path (over the size limit, not a regular file, unreadable, or excluded by policy) is
  now recorded and can abstain a signal — but only a signal whose *own* file-selection test
  admits that path, so an oversized file a signal was never going to open still abstains nothing.
  **This mechanism covers exactly seven signals and nothing else**: A3's
  `health_readiness_route`, `observability_depth` and `prod_readiness_primitives`, and A5's
  `claim_match_rate`, `claim_source_depth`, `reconciliation_artifact_depth` and
  `negative_space_documentation`. Every other signal that filters the file list still reports a
  plain absence when its matching file was withheld. Counts in `contentReadSummary` are unchanged.
  **This applies to the prospective `witan-rubric-v23` rubric only. The calibrated public default
  (`witan-rubric-v17`) is unchanged and still moves a score when a file is withheld from the file
  list; so is v22. A default scan — any scan without an explicit rubric pin — behaves exactly as
  it did in 0.4.8.** Reading this entry as a general fix would be wrong, and the reason the gate
  has not moved is recorded in
  [`docs/adr/proposed/0024-withheld-path-abstention-and-the-v17-default.md`](./docs/adr/proposed/0024-withheld-path-abstention-and-the-v17-default.md),
  which is an open operator decision, not a shipped one.
- **A5's claim-reality file counts moved when Cejel withheld a file they would have counted.**
  A5's three metrics are file-count proxies over the scanned file list, and `claim_match_rate` is
  implementation files over implementation-plus-claim-source files — so withholding one authored
  implementation file removed it from both sides of the ratio and the ratio fell, with the skip
  visible only as an anonymous count. Worse, a withheld README made A5 report "nothing is claimed
  about this repo" — an assertion of inapplicability about a claim source Cejel declined to read.
  Under `witan-rubric-v23`, each of A5's four file-list-walking signals now abstains on a withheld
  path its own selection test admits, and a withheld claim source abstains the criterion outright
  with `insufficientDataReason: 'too_large'` rather than asserting inapplicability. **Known
  consequence, disclosed rather than adjusted:** abstaining a metric redistributes its weight over
  the metrics that remain, so where the abstained metric was the criterion's strongest — as
  `claim_match_rate` is, at half of A5's weight — the criterion's score falls rather than
  staying put. That is in tension with ADR-0001 ("coverage is disclosed, never discounts a
  score"), applies equally to A3's already-shipped wiring, and is handed to the operator in the
  same decision record rather than resolved here. Unchanged under `witan-rubric-v17` and v22.
- Fixed a reproduced scan hang on a legal 255-byte filename in the default scan path, shared by
  the CLI and MCP servers. The environment-template filename classifiers now use one optional
  segment instead of an ambiguous repeated group. No scoring behaviour changed: both classifiers
  retain their previous filename language, including consecutive dots and the V47 translated
  suffixes.
- **Script-depth scoring credited a `package.json` `test` script by key presence only, so the
  npm-generated placeholder (`"test": "echo \"Error: no test specified\" && exit 1"`) scored
  identically to a real test runner.** Both A1's verification-script signal and B3's
  CI-script-depth signal now require the `test` script's *content* to match a known test-runner
  invocation, the same content check already used elsewhere to detect a configured test runner.
  `lint`/`typecheck`/`build` scripts remain presence-checked — none has an equivalent universal
  auto-generated placeholder. **Known over-reach, disclosed rather than adjusted:** the content
  check names specific runners, so a real `test` script that delegates to one it does not name
  (`grunt test`, `pnpm test-unit && …`, a monorepo task runner's `test` task) is also no longer
  credited. That is what moved the three corpus rows in the rubric changelog entry. Whether the
  check should recognise delegation is an operator decision recorded there; this release ships
  the check as written.
- The pull-request-template detector recognized only the single-file form
  (`pull_request_template.md`); the directory form
  (`.github/PULL_REQUEST_TEMPLATE/<name>.md`, GitHub's documented way to offer multiple
  templates) is now recognized too.
- **On a revision with a package-level `lint`/`typecheck` script but no test files, A1 fell
  through to its authenticated-absence path, which zeroed its entire verification-script signal
  — including `lint` and `typecheck`, neither of which depends on test-file presence — while B3
  independently credited the same scripts. A1 and B3 reported opposite conclusions about the
  same package.json fact on the same revision.** A1's authenticated-absence path now credits
  the same lint/typecheck/coverage signals B3 credits; only the test-file-dependent metrics
  (test-to-source ratio, non-hollow test share) stay at zero when no test files exist.
- Corrected `docs/format-stability.md`'s stated `predicate.reportFormatVersion` from `1.0` to
  `1.1`, matching the version Cejel currently emits. A guard test now fails the build if the
  documented value and the code constant drift apart again.
- **Three A3 production-readiness signals each recognized only one narrow spelling of the
  capability they name, so a user who fixed the exact gap a finding described saw the finding
  unchanged on rerun.** All three widenings are bounded to public-documentation idioms:
  - The (prospective, `witan-rubric-v20`+) health/readiness-route pattern required the route
    literal to contain nothing but the bare keyword. It now also recognizes the Kubernetes
    convention (`/healthz`, `/readyz`, `/livez`), a mount prefix (`/api/health`), a suffix
    (`/health/live`), and a template literal with an interpolated prefix
    (`` `${BASE_PATH}/health` ``). A route defined by a router mounted at `/health` with its own
    relative `/` handler is a cross-expression case this pattern still cannot see — a stated,
    not silent, limitation.
  - Observability depth counted files against a vendor-product list (Sentry, Datadog,
    Prometheus, ...) plus `logger`/`metrics`, which missed the most common Node
    structured-logging libraries (`pino`, `winston`, `bunyan`), the Express request-logging
    convention (`morgan`), and the request-correlation idiom (`correlationId`/`requestId`/
    `traceId`/`x-request-id`/`AsyncLocalStorage`). `httpLogger` and `@opentelemetry/*` imports
    were already covered as substrings of the existing `logger`/`opentelemetry` terms.
  - The `prod_readiness_primitives` "error boundary" component matched only a frontend/React
    filename convention (`error-boundary.*`, `*.error.(tsx|jsx|ts|js)`) and read no file content,
    so an Express error-handling middleware layer — which can live in any file, under any name —
    never moved it. It now also recognizes the canonical four-argument
    `(err, req, res, next)` signature (optionally TypeScript-typed) by content, wherever it
    appears in an implementation file, checked only when the filename convention finds nothing.

## [0.4.8]

### Fixed

- **A repository content skip under Cejel's own 512,000-byte read limit could abstain criteria it
  had readable evidence for, and those abstentions were then scored 0 in the composite — affected
  0.4.6 and 0.4.7.** Two compounding defects:
  - A file over the size limit was mapped to affected rubric criteria by **path shape** (a
    dependency-manifest-shaped, CI-shaped, test-shaped, implementation-shaped, doc-shaped, or
    audit-shaped filename) at file-inventory time, before any criterion's collector ran on the
    files that *were* readable — pre-emptively wiping a criterion even when other readable content
    fully answered it. Removed: a criterion now abstains only when its own collector genuinely has
    no readable evidence to measure from.
  - The abstention this produced was recorded with the same `insufficientData` flag as a genuine
    read failure (a file Cejel could not read at all), so the scorer could not tell "declined under
    the size limit" from "expected to read this and could not" — and treated both as evidence loss,
    keeping the abstained criterion in the composite denominator at a punitive 0 instead of
    excluding it like ordinary `insufficient_data`. `report.json`'s `signals` now carry the skip
    **reason**: `unreadable`/`denied_path` (or no reason recorded, the historical conservative
    default) stay a genuine read failure and remain in the composite at 0; `too_large`,
    `excluded_by_extension`, and `non_regular_file` are Cejel's own disclosed coverage limits and
    are excluded from the composite exactly like ordinary `insufficient_data` — never scored.
  - Measured effect, a design partner's same-commit comparison at rubric v17: **3.1/4.0 measuring
    9/9 criteria under 0.4.5, 1.5/4.0 measuring 5/10 criteria under 0.4.7** — the only difference
    was two oversized test-data fixtures whose path shape mapped to five criteria that each had
    real, readable evidence.
  - What 0.4.8 does instead: an oversized or extension-excluded file's skip is disclosed in
    `contentReadSummary` and never moves the score; every criterion measures from whatever content
    Cejel actually read. ADR-0001: coverage is disclosed, never discounts a score.
- The certificate's disclosure text no longer says a file "could not be read" when Cejel itself
  declined to read it under the size limit or an extension exclusion — that phrasing is now
  reserved for genuine read failures (`unreadable`/`denied_path`). A size-declined or
  extension-excluded skip is worded as declined under Cejel's own limit, distinctly from an
  unreadable file.

### Added

- `report.json` gains an optional `toolVersion` field recording the `@cejel/cejel` version that
  produced the report (bumps the report contract to `reportFormatVersion` 1.1, carried on
  `attestation.json`). Constant within a version — re-running the same installed version on the
  same commit stays byte-identical, the same property v0.3.1 removed `generatedAt` to protect —
  and differs across versions, letting an external consumer key incremental reuse on it. Absent
  from historical reports and from any caller that does not supply one.

## [0.4.7] — 2026-09-07

### Added

- Findings-first certificate restructure (Track A1, #268): `certificate.html` now surfaces
  critical- and warning-severity findings across all criteria, critical first, in a new section
  between the hero and the relying-party prose summary — a reader reaches "what's wrong" before
  scope/completeness prose. States plainly when there are none, rather than a silent empty
  section. Presentation-only: `report.json`, `attestation.json`, `summary.json`, and badge bytes
  are unchanged.
- Per-criterion cards show applied weight (Track A2, #271): every rendered metric now shows the
  weight actually applied to the score — renormalized across surviving metrics, matching
  `scoreMetrics()`'s own renormalization — instead of its nominal declared weight, identically on
  the HTML, Markdown, and terminal certificates. Presentation-only: `report.json` and the other
  machine artifacts are unchanged.
- `--rubric-pin` now accepts `witan-rubric-v23-prospective-2026-09-06` (explicit opt-in only; the
  public default stays calibrated v17). v23 adds bounded recognition of coverage-capable
  test-runner flags on commands reachable from a test entry point, with negation guards against
  flags like `--no-coverage` (#276, #277), and narrows A1's abstention from whole-criterion to
  per-signal so a skip on one unreadable file no longer discards findings/metrics computed from
  files that read fine (#278). No other criterion is signal-scoped yet. Carries no
  precision/recall claim.
- `--run-attempt <n>` (Track A5 rider, #282): records which CI run attempt produced a certificate.
  The GitHub Action forwards it automatically from `GITHUB_RUN_ATTEMPT`; a local scan or any other
  CI never fabricates or defaults one. Surfaced on the HTML/Markdown certificates and as an
  additive-optional `predicate.githubRunAttempt` field on `attestation.json` — never inside
  `report.json`, whose byte-reproducibility guarantee for a pinned revision excludes per-invocation
  values. Verified with a test that scans one revision twice with differing run attempts and
  asserts `report.json` stays byte-identical while the attestation differs.
- Certificate remediation output is now prioritized evidence-absence, not one static sentence
  (Track A4, #283): the "what to do next" field is derived from the same gap-detection logic that
  already populates "what was not established" — an unmeasured criterion that could change the
  verdict ranks first, then a capped, per-finding evidence-absence statement for critical/warning
  findings, then the existing coverage/PR-merge-ratio/not-applicable/scan-limitation gaps — with
  every sentence naming an absence, never a score-promise. `report.json`/`attestation.json`/
  `summary.json`/badges unchanged.
- The HTML certificate's plain-language glossary and "not applicable to this repository" group now
  collapse by default behind native `<details>`/`<summary>` (Track A3, #285) — zero JavaScript, so
  the certificate stays a single, offline, self-contained file. Collapsed content stays in the
  markup; a reader with JS disabled or a machine parser still sees it all.

### Fixed

- The MCP Registry publish validator (`validate-distribution-metadata.mjs`) compared `server.json`
  against the last observed-live registry state instead of the intended release
  (`package.json`), so a release-prep commit that missed bumping `server.json` could still pass
  the check. Root cause of registry issue #1615: v0.4.6 published "0.4.5" to the registry on both
  attempts. Fixed to compare against `package.json`'s version, and `docs/release-process.md` now
  states that release-identity metadata must be bumped in the same commit that gets tagged (#273).
- `verify-release-currency`'s `cejel.dev` check grepped the homepage for a "Current · v<version>"
  marker that moved to `/for-engineers/` on 2026-08-31, so it silently reported the surface as
  missing regardless of actual site currency. Split into two checks: the homepage now asserts
  every pinned `@cejel/cejel@<version>` invocation string names the release version, and
  `/for-engineers/` keeps the original marker check (#257).
- Fixed a CI flake in `html-metric-layout.test.ts`: the first headless-Chrome invocation in a test
  run pays Chrome's one-time cold-start cost against a shared 15s timeout, which occasionally
  exceeded it on a busy runner. That cost is now paid once in `beforeAll`, outside any per-viewport
  test's timing budget.

### Docs

- Publishes a defect-class census (`docs/defect-class-census.md`) mechanically classifying the
  shipped rule inventory against the 2024 CWE Top 25, the 2021 OWASP Top 10, and Cejel's own
  D1-D8 taxonomy, with a CI check that fails on drift between the committed table and a fresh
  derivation (#274, #275). Breadth only — no recall/precision claim.
- README now publishes v17's calibrated 16/30 and prospective v22's 24/30 in-scope recall figures
  together, with fixture scope and Wilson intervals in the same sentence, guarded so neither
  number can appear without its qualifying context (#259).

## [0.4.6] — 2026-09-02

### Added

- Adds a generic `--ingest` contract v1 (`version: "1.0"`) and its published JSON Schema, with
  additive-minor / breaking-major compatibility rules: unknown same-major fields stay reserved
  for additive evolution, but an unversioned document, a malformed stable field, or an unknown
  major is rejected loudly instead of guessed at or silently dropped. The de-facto adapter this
  formalizes previously had no contract version: it accepted `tool` + `signals` structurally,
  defaulted missing or non-finite weights to 0.5, clamped out-of-range weights, silently dropped
  unknown dimensions and severities, invented missing `ruleId`/`message` values, and dropped
  signals with no surviving findings. New attestations carry
  `predicate.reportFormatVersion: "1.0"` and human-readable certificates carry a
  `cejel-certificate-format` field; `report.json` is unchanged by this alone.

### Security

- The GitHub Action now runs every invocation in a fresh directory under `RUNNER_TEMP`, outside
  the scanned repository, and publishes only the summary that invocation wrote. Previously, an
  early CLI failure fell through to reading a workspace `out-dir`, so a committed
  `.cejel/summary.json` could be rendered into `GITHUB_STEP_SUMMARY` and `GITHUB_OUTPUT`. A
  caller-selected `out-dir` is now only ever an export destination, populated after a
  current-run summary exists; it is never evidence provenance. Repeat runs still archive prior
  named Cejel artifacts into export history, preserve caller-owned entries, reject a symlinked
  export/backup boundary, and encode every `GITHUB_OUTPUT` value with GitHub's delimiter-based
  multiline format. The verified export location is now also exposed as the `artifact-dir`
  output.
- The existing 512,000-byte repository-content cap now applies to Git tracked inventory and the
  shared read boundary, not only ad hoc reads; an oversized recognized file marks the criteria
  its absence could affect `insufficient_data` rather than asserting false absence. All four
  public ingest paths now share one file validator that rejects symlink and non-regular
  candidates and enforces realpath containment. Public ingest is bounded at 128 canonical
  documents, 8,388,608 bytes per document, and 10,000 finding candidates/retained findings, with
  glob/auto-discovery enumeration stopping as soon as the document limit is provably exceeded.
  Dynamic Markdown at both the report and Action-summary sinks is now escaped through the
  existing control-character sanitizer, applied uniformly to explicit, package, basename, and
  programmatic product identity.
- The disclosure-boundary guard gains a scheduled full-tree consistency mode alongside its
  existing pull-request path-check mode, failing closed on drift or an incomplete read.

### Fixed

- The B6 human-gate finding now states the file-scoped proxy it actually computed, instead of
  reading as a repository-wide "no documented human gate" claim when a matching gate document
  exists elsewhere in the repository; the metric is repository-scoped, the finding filter is
  file-scoped, and both can legitimately coexist.
- Fallback-derivation wording for current-rubric directory fallbacks now says a bounded
  directory walk matched no relevant file or configuration, rather than implying a tracked
  inventory was consulted. Historical rubric wording is unchanged.

Certificate legibility work (started in 0.4.5 with #231) gets no further slice in this release;
it's explicitly deferred to 0.4.7.

## [0.4.5] — 2026-08-24

### Added

- Adds `cejel scan --product-name <name>` so a caller can set both `productSlug` (slugified) and
  `productDisplayName` from one explicit, stable value. This fixes the reproducibility wart
  documented by the public leaderboard: repositories without a usable `package.json.name`
  otherwise inherit identity from the checkout directory, so differently named clones of the
  same commit differed in those two fields. Product identity is now labeled on the terminal,
  HTML, and Markdown certificates as caller context and excluded from byte-comparison claims.
  The default identity precedence and report schema are unchanged. With the flag omitted,
  `report.json`, `summary.json`, `attestation.json`, `badge.json`, and `badge.svg` retain their
  prior values/bytes for the same invocation inputs (the attestation's existing invocation time
  remains variable); `certificate.html`, Markdown, and terminal text change to add the caller-
  context disclosure. With the flag present, `report.json` changes only `productSlug` and
  `productDisplayName` relative to the same scan without it; `summary.json`, the attestation's
  report binding/repository identity, and human-readable certificates consequently change.
  Scores, findings, evidence pointers, rubric selection, and both badge formats are unchanged.

- Adds `cejel scan --rubric-pin <version>` — the first way for a stranger running the published
  package to explicitly opt into a rubric other than the calibrated default, without a committed
  evaluation driver. It accepts any of `WITAN_SELECTABLE_RUBRIC_VERSIONS` (the calibrated v17, or
  v18-v22) and fails closed on any other value, naming what was accepted. Omitting the flag is
  unaffected: default (unpinned) scans stay on the calibrated `witan-rubric-v17-2026-07-24`, and
  every written artifact (`report.json`, `attestation.json`, `summary.json`, `badge.json`,
  `badge.svg`) is byte-identical to before this flag existed — no new field was added to any of
  those schemas. A pin to a prospective rubric (v18-v22) is labeled on every human-facing render
  surface only (the terminal certificate, `certificate.html`, and the Markdown report): it states
  the rubric that ran and that it is prospective/uncalibrated, so no certificate produced under a
  prospective pin can be mistaken for a calibrated one. Motivated by the public leaderboard's own
  methodology text ("every score is produced through the same sealed public-scoring entry point
  ... with this board's explicit prospective rubric pin declared"), which described a public
  pinning capability that did not actually exist in the published CLI until now.

### Fixed

- HTML certificate metric values now wrap within their criterion cards instead of painting across
  neighboring content when reader-facing measurement explanations are sentence-length.
  `certificate.html` changes; `report.json`, `summary.json`, and `attestation.json` remain
  unchanged.

- HTML certificates now state explicitly when a dimension band agrees with its weighted-score
  numeric band, and explain why no comparison applies for not-applicable, insufficient-data, and
  unverified states. No state is represented by silent absence. `certificate.html` changes;
  `report.json`, `summary.json`, and `attestation.json` remain unchanged.

- Renames the reader-facing “Claim match rate” metric to
  “Implementation-to-claim-source file ratio” and states that the bounded file-count ratio does
  not verify prose claims. The machine key remains `claim_match_rate`. Human-readable
  certificate text, including `certificate.html`, changes; `report.json`, `summary.json`, and
  `attestation.json` remain unchanged.

- Human-readable certificates now explain every measurement without vendor interpretation. Fixed
  enumerable checks name what was found and missing, binary outcomes no longer look like file
  counts, conditional metrics state why they apply, and the recent-commit PR proxy names the
  commit-subject pattern it actually measures. The HTML tooltips and glossary use the same copy as
  Markdown and terminal output. A registry-to-glossary guard now fails CI if any emitted metric
  lacks an exact reader-facing glossary entry. This is presentation-only, but it is not byte- or
  schema-identical to 0.4.4: new scans' `report.json` metric objects may carry the new optional
  `presentation.components[]` entries (`label` and `count`) and
  `presentation.condition`. Consequently, a new scan of the same commit is not byte-identical to
  its 0.4.4 `report.json`; the report SHA-256 values in `attestation.json` change with those report
  bytes, and the Markdown, HTML, and terminal certificate text changes by design. Reports without
  these optional fields remain schema-valid, previously generated certificates remain valid, and
  their existing report/attestation digest bindings still verify. No metric value, maximum,
  weight, status, score, or rubric version changes. Prompted by an external-style fresh read of a
  generated certificate.

## [0.4.4] — 2026-08-18

### Fixed

- The `.term-tooltip` glossary/metric tooltips on the HTML certificate now wrap safely instead
  of overflowing their box. `white-space: normal` alone only creates break opportunities at
  spaces and hyphens; a single unbroken token — a commit SHA, a file path, a metric identifier —
  wider than the tooltip's fixed `min(320px, 75vw)` width had nowhere else to break. Today's
  curated glossary text never contains such a token, but `glossaryEntryForMetric`'s fallback
  path (any metric name outside the curated glossary) renders an arbitrary, schema-legal
  `metric.description` verbatim — up to 300 characters, no whitespace required. Fixed with a
  single `overflow-wrap: anywhere` on `.term-tooltip`, which — being an inherited property —
  also covers any inline code/mono child a tooltip gains later, the same way the page's existing
  `code { overflow-wrap: anywhere }` rule already does elsewhere on the certificate. Reported by
  an external reviewer (Tom): the dark box rendered correctly, but text ran past its edge.
- `scoreRepoWithPublicCejel` — the sealed scoring path shared by the CLI and every published
  leaderboard row — now rejects an explicitly supplied but unwired `rubricVersion` instead of
  silently falling through to whatever `createWitanReport` does with a version string it doesn't
  recognize. A certificate's `rubricVersion` field is a provenance claim; a rubric that never ran
  must never be named there. Found while regenerating the public leaderboard, when
  `witan-rubric-v19-prospective-2026-08-09` turned out never to have been wired into the general
  dispatch and produced results anyway. An absent selector is unaffected and still takes the
  calibrated public default.

### Added

- A `workflow_dispatch` workflow (`verify-mcp-distribution-routes.yml`) exercises the
  Smithery and OpenClaw MCP install routes against the published record on a clean runner,
  rather than leaving them offered-but-never-tried. It found and fixed two real doc bugs
  (below) before either route was ever run by a stranger.

### Fixed

- The OpenClaw MCP install commands now pin `openclaw@latest` and `@cejel/cejel@latest`
  instead of a bare `openclaw`. On Node 22.15.0 (a currently-supported Node 22 patch), npm's
  own engines-aware resolution silently served an OpenClaw release that predates the `mcp
  add`/`mcp doctor` subcommands the previous instructions used, so the documented command
  failed with `error: unknown option '--command'` — with no hint it was a version mismatch.
- Documents that `smithery mcp add` — the Smithery CLI's actual connect step, as opposed to
  `mcp search`, which is free — requires a Smithery account. The generic MCP client config
  needs neither an account nor the Smithery CLI and is now called out as the no-login
  alternative.

### Added

- The release-currency verifier now checks an eleventh surface: the published leaderboard
  (`BargLabs/cejel-site`, `leaderboard/leaderboard.md`) must declare a `Scorer source version`
  matching the release under verification, and fails closed — naming both versions — when it
  does not. A deliberate mismatch is accepted only via an explicit, committed
  `Scorer version pin: @cejel/cejel@<version> — reason: <text>; declared <date>` line on the
  board itself; silence is never treated as intentional.
- The release-currency verifier now checks the *published content* of every fetched surface, not
  just its version markers — closing the gap that let three defects reach cejel.dev in one week
  with every marker still green: an unpinned `npx @cejel/cejel .` hero command (the exact command
  an external reviewer copied and got a stale cached build from), a `/changelog/` page that had not
  named a release in a month and four versions, and the leaderboard's stale scorer version (above).
  Adds a twelfth surface, `changelog` (`cejel.dev/changelog/`), and two new checks applied to every
  prose-bearing surface (`cejel.dev`, `changelog`, `leaderboard`):
  - **No unversioned invocation.** Any `npx`/`pnpm dlx`/`bunx @cejel/cejel` without a version spec
    fails closed, naming the surface and the line. On the changelog specifically, this only applies
    to the evergreen lede above the first version-numbered heading — text inside a dated release
    entry is a historical record of what that release said, not a live instruction, and old entries
    may legitimately narrate an old bare command.
  - **Declared tool versions.** Generalizes the leaderboard's scorer-version-pin logic
    (`assertDeclaredVersion`) into a shared check any surface can use: a declared scorer/CLI version
    must equal the release or carry an explicit, committed pin with a reason — silence fails.
  - **Changelog currency.** The newest version named on `cejel.dev/changelog/` must equal the
    release under verification; failures name both the expected and newest-found version.
  Version-marker drift detection (the original ten-plus-one surfaces) is unchanged.
- Codifies the rubric calibration-claim policy: v17 remains the public default and the sole owner
  of its published calibration figures; v18-v22 remain explicit-only prospective rubrics with no
  inherited calibration claim. A future default promotion requires a fresh authenticated untouched
  holdout and a separate recorded decision.
- Adds an in-development, export-only D6 proposal for two exact shell signatures:
  discarded shell control exit status and a success report independent of the operation it names.
  It detects the motivating `git worktree remove` reaper shape, distinguishes explicit advisory
  controls from inert ones, and records unsupported files as non-coverage rather than clean. D6 is
  exported from `@cejel/cejel/d-series` only: `cejel scan` does not run it and no released
  certificate includes it. It is uncalibrated, does not affect A1-B6 scoring, and does not change
  the leaderboard.
- Adds a separate, opt-in, non-scoring decision-contract conformance checker, exported from
  `@cejel/cejel/decision-contracts` only. Repositories author exact premise-to-decision contracts;
  the checker reports only absent supported local dependency edges and abstains on calls, mutable
  bindings, dynamic access, object aliases, whole-object flow, getters, unsupported control flow,
  missing sources, or parse failures. `cejel scan`, A1-B6 scoring, rubric versions, and the
  leaderboard are unchanged — nothing here runs unless a caller imports the subpath explicitly.
- Adds three explicit-only prospective rubric versions, each reachable in 0.4.4 only through a
  committed evaluation driver that passes `rubricVersion`. The public
  `cejel scan --rubric-pin <version>` flag described under Unreleased was added to main after
  0.4.4 and is not part of this release. `cejel scan`'s public default stays on the calibrated
  `witan-rubric-v17-2026-07-24` and none of the following run unless separately selected:
  - **v20** narrowly bounded A3 production-readiness findings (missing build/typecheck script,
    inactive Dockerfile `HEALTHCHECK`, or a direct HTTP entrypoint with no health/readiness route),
    each citing the exact manifest, entrypoint, or Dockerfile.
  - **v21** bounded B6 findings for executed/contained administrative SQL: authored production SQL
    containing role grants, `SUPERUSER` escalation, or schema-wide table privilege grants, and the
    same shapes executed via direct database-driver `.query(...)`/`.execute(...)` literals. Docs,
    tests, fixtures, comments, ordinary grants, and documented human-gated paths stay clean.
  - **v22** extends v20/v21's direct-HTTP detection through a simple root package start command
    (`node <path>` / `tsx <path>`) to its tracked authored JS/TS entrypoint, closing a blind spot
    where the server file itself was never named on the command line.
  None of v20/v21/v22 carry a calibration claim; each remains explicit-only pending its own
  authenticated untouched holdout and a separately recorded default-promotion decision.

### Fixed

- `execGit` — the sole production Git subprocess boundary, used by every default scan as well as
  the d-series and LLM-calibration packs — now scopes the trusted `safe.directory` entry to the
  exact, caller-supplied working directory instead of relying on ambient global Git config to have
  a matching entry. Closes a cross-UID Docker/CI mount gap without widening trust: the child still
  receives only `PATH`/`HOME`/`TZ` plus fixed hardening variables.
- Generalizes the bare-npx-invocation guard (`src/__tests__/bare-npx-invocation-guard.test.ts`)
  beyond `@cejel/cejel` itself: it now fails closed on *any* unpinned `npx`/`pnpm dlx`/`bunx`
  invocation of a public-facing package named in this repository's own docs, not just our own.
  Motivated by a same-shaped incident in an unrelated tool (OpenClaw) that a `@cejel/cejel`-only
  guard would not have caught.

### Added

- CI now verifies the published Windows binary and the published Linux `aarch64` binary on their
  real target platforms after each release, comparing their output against the npm package's, in
  addition to the existing per-target smoke checks.

## [0.4.3] — 2026-08-17

### Added

- States the recognized-CI boundary: which five systems Cejel treats as real CI signal, why
  absence is scored as a true negative rather than an abstention, and how that recognized set
  evolves only through a version-gated rubric change.

### Fixed

- Every documented CLI invocation across the README, leaderboard site copy, and the calibration
  issue template now pins `@latest`, so `npx @cejel/cejel` can no longer silently resolve a stale
  cached package; a guard test fails the build if an unversioned invocation is reintroduced.
- The Markdown certificate now carries the CLI version, matching the HTML and JSON (attestation)
  certificates — previously only those two recorded it.
- Two metric labels still said "primitive coverage" after the 0.4.2 glossary revision; they now
  read "Production-readiness basic checks" and "PR trace basic checks" everywhere, consistent with
  the rest of the glossary.
- "Lowest contributing measurements" could list a metric already at full marks when its criterion
  had few measured metrics; it now only lists metrics with an actual shortfall.
- A metric's displayed unit no longer repeats the trailing word of its own label (e.g. "Recent PR
  merge ratio 0/1 ratio" now reads "Recent PR merge ratio 0/1").
- Certificate tooltips now sit clearly above the page — a higher stacking order and an elevation
  shadow — instead of blending into the content behind them.

## [0.4.2] — 2026-08-13

### Added

- A read-only currency verifier independently checks every supported release surface and fails
  closed on stale, unreachable, or inconsistent state.

### Changed

- Human-readable terminal, HTML, and Markdown certificates now include relying-party summaries,
  consistent measurements, and a plain-English glossary informed by external reviewer feedback.

### Fixed

- OCI distribution readback now authenticates GitHub CLI before verifying the published image's
  attestation and tagged source.
- Public-distribution validation now rejects location fields and private-path-shaped text in
  public transparency artifacts.
- Coverage displays now distinguish an absent published measurement from a measured zero without
  changing report bytes or scoring.
- Capped test-to-source counts now render consistently across every human-readable certificate.
- Certificate labels now distinguish basic checks from automated workflow pipelines and avoid
  internal terminology.

## [0.4.1] — 2026-08-12

### Fixed

- `report.json` no longer embeds the absolute checkout path, so identical repository content and
  revision scanned in different directories can produce byte-identical report artifacts. Reports
  emitted by v0.4.0 and earlier include that run-environment path and therefore do not have this
  cross-path reproducibility property; those existing report/attestation pairs remain verifiable.

## [0.4.0] — 2026-08-09

### Added

- Carries the prospective rubric `witan-rubric-v19-prospective-2026-08-09` for explicit
  evaluation harnesses. It inherits v18 and changes only B4 numeric freshness: the scanned HEAD
  commit's committer year replaces scan wall clock. Expected Git absence or a bounded Git-read
  failure omits the numeric year and retains only static freshness markers. No public CLI flag or
  package export selects it; the public default remains `witan-rubric-v17-2026-07-24`, and
  historical rubrics and reports are unchanged.
- Adds a separate resource-bounded v2 discovery collector for future Free LLM calibration. It
  enforces per-file regex time limits and deterministic continuation without changing the
  SHA-pinned v1.9 collector, its historical contracts, the public CLI, or the release claim.

### Changed

- After MCP Registry publication, the distribution workflow now reads the exact version back,
  requires its OCI identifier to equal the workflow-derived immutable digest, cryptographically
  verifies that digest's GitHub SLSA attestation against the exact release tag and source commit,
  and reports the signed tagged-source commit. The MCP-only retry path still reuses the published
  digest without rebuilding or overwriting the OCI version tag.

### Evidence boundary

- The preregistered v19 paired rescore completed 24/24 rows after the separately preregistered
  Alfred recovery: 0 raw freshness, B4 score/status, headline/coverage, placement, or non-B4
  changes. That GO authorizes the prospective implementation and published delta only; it does
  not promote v19 to the public default.
- The reserved Free LLM command family remains unshipped. `--pack llm` and `cejel llm` continue
  to fail until the accepted release gate reaches GO.

### Release provenance

- The first v0.4.0 distribution run published the OCI image, its signed provenance, and the MCP
  Registry record, then the new final readback job stopped before attestation verification because
  `GH_TOKEN` was not exported to GitHub CLI. The Registry record had already read back successfully.
  An authenticated independent execution of the same verifier confirmed the exact published chain:
  `ghcr.io/barglabs/cejel@sha256:63bd4342c2006c823b0283313036109040651741078e1a0e38677d605a2849ee`
  is bound to tagged-source commit `03ef74bd05274ff079c8dcd09dcdfaa8a6f1e3ff` at
  `refs/tags/v0.4.0`. The workflow now exports only the job-scoped GitHub token to the verifier;
  the immutable v0.4.0 tag and published artifacts were not changed or rebuilt.

## [0.3.2] — 2026-08-07

### Changed

- MCP Registry publication now writes an immutable `ghcr.io/barglabs/cejel@sha256:…` image
  reference, bound to the OCI image attestation. A later tag movement cannot change the artifact
  named by the MCP record; the workflow can also republish that record from an existing image tag
  without rebuilding it.
- OCI publication now refuses to overwrite an already-published release tag, and the OCI and MCP
  jobs independently assert the dispatched tag, commit, checkout, required-object availability,
  and commit containment before acting.

No scoring, rubric, detector, criterion, threshold, or certificate behaviour changed in this
distribution-only release.

## [0.3.1] — 2026-08-06

### Fixed

- The npm trusted-publishing workflow removes the `_authToken` placeholder written by
  `actions/setup-node` from both user and project `.npmrc` files, then fails if it remains.
  That leaves npm's GitHub OIDC exchange available for trusted publishing.

### Release provenance

- `0.3.0` was tagged and built but was never published: the registry rejected its upload after
  a detached transparency-log provenance entry was created for that real build. The `v0.3.0`
  tag remains in place; `0.3.1` is the successor release rather than a retagged retry.

## [0.3.0] — 2026-08-06

### Breaking

- `report.json` and `summary.json` no longer include `generatedAt`. The machine-readable scan
  time is provenance for the run, not a repository finding, and now lives in
  `attestation.json`; the certificate retains its existing human-readable date. Re-running the
  same input now produces byte-identical report and summary artifacts; consumers that read
  `generatedAt` from either artifact must instead read `attestation.json`.

### Added

- A separate opt-in D-series pack entrypoint adds the high-confidence D1
  declared-but-unread-config rule. It uses Cejel's resolved TypeScript module graph, cites the
  exact declaration path, and abstains on dynamic config access. It does not feed A1-B6 scoring;
  the frozen three-seed D1 baseline remains unchanged and exact-signature acceptance is reported
  separately.
- The opt-in D-series pack adds a narrow D2 swallowed-error rule for an awaited operation whose
  catch discards its bound error while returning a static failure result. Exact acceptance and the
  23-repository precision gate are reported separately because the frozen 16-case suite contains
  no D2 seed. The rule does not feed A1-B6 scoring or change the published leaderboard.
- The opt-in D-series pack adds a narrow D3 unasserted-set-transform rule for a filter that reports
  literal success while pairing retained output with a statically empty explanation ledger. Exact
  acceptance and the 23-repository precision gate are reported separately; the frozen five-seed D3
  baseline remains unchanged. The rule does not feed A1-B6 scoring or change the leaderboard.
- The opt-in D-series pack adds a narrowly bounded D4 rule for an exact caller/callee shape where a
  statically signalled failure is converted to an empty collection and then returned as literal
  success. It does not infer that emptiness is itself defective, feed A1-B6 scoring, or claim any
  of the four frozen semantic D4 seeds as caught.
- The opt-in D-series pack adds the high-confidence D5 self-referential-verification rule for
  equality assertions whose visibly named expected value and exercised code are imported from the
  same first-party module. It cites the assertion path and remains outside A1-B6 scoring; the frozen
  four-seed D5 baseline remains unchanged and exact-signature acceptance is reported separately.

### Changed

- The public product claim now states explicitly that Cejel scores engineering-trust signals; it
  does not claim to detect software defects or prove that code is safe. A regression guard covers
  the README opening, package metadata, Action metadata, registry metadata, and MCP tool copy. This
  is a documentation boundary only; scoring, findings, detector behavior, and board scores are
  unchanged.
- The Free LLM detector-development candidate recognizes file-local JavaScript/TypeScript and
  Python evaluation aggregates assigned through local result-object attributes or subscripts.
  Fixture-backed controls retain the eligible denominator, and lookalike names do not activate the
  rule. This does not change the immutable v1.9 NO-GO or authorize a performance or release claim.
- Python evaluation rules now attribute official OpenAI and Anthropic call shapes only when the
  receiver resolves to a live same-file SDK import/client binding. Unrelated and parameter-shadowed
  lookalikes abstain; local custom judge wrappers remain within the file-local contract.

### Fixed

- The offline architecture guard now parses every first-party `src` and deployed `api` scoring
  module and its resolved first-party dependencies with the TypeScript compiler instead of matching
  raw source text. Bare built-ins, unapproved package entrypoints, aliases, re-exports, computed
  loaders, and indirect global network primitives can no longer bypass the single hardened Git
  subprocess boundary.

---

## [0.2.2] — 2026-07-28

### Added

- Adds the final standalone platform gap: `cejel-Windows-x86_64.exe`. The Windows SEA build
  injects into `node.exe`, smoke-tests `--version`, `--help`, and a real scan, compares the
  binary with the source build, and runs a second scan with outbound networking denied by a
  program-scoped Windows Firewall rule.
- Every standalone binary now carries an SPDX SBOM alongside its own-platform verification
  receipt, SHA-256 checksum, and GitHub-signed build-provenance bundle.
- Documents installation as an OpenClaw-managed MCP server through the shipped `cejel-mcp`
  stdio bin, with the published OCI image as an alternative. The documentation states the
  product boundary plainly: free Cejel scans code selected by the caller; it does not govern
  an agent's runtime actions.

### Fixed

- Certificates now show both the producing Cejel CLI version and the exact rubric version,
  so reports created by different installed versions explain their scoring identity.
- A calibrated dimension band that differs from the weighted numeric score now carries an
  inline explanation instead of presenting, for example, `1.9` beside `verified` with no
  reconciliation. Reported by an external user.
- A certificate produced from a source tarball now warns on B2 that Git history was
  unavailable and that a zero recent-PR proxy may undercount the criterion. Reported by
  an external user.
- The npm instructions force `@latest`, explain the stale `npx` cache footgun, and show how
  to print the version before comparing certificates. Rubric/CLI drift was reported by
  an external enterprise security engineer.

### Included from main

- Patch-distribution documentation from #39.
- D8 Git transport hardening from #40 and #42.
- Free-core v50 multiple-comparisons disclosure from #41.
- Cross-repository preflight script from #43.

### Signing

- The Windows executable is intentionally **not Authenticode-signed** in 0.2.2. The build
  removes Node's inherited signature, asserts that the final executable is `NotSigned`, and
  the README warns that SmartScreen may intervene. Human review must decide whether this
  verification-first release is acceptable or whether Windows publication waits for Azure
  Trusted Signing or another approved Authenticode path.

### Rubric

- No detector, rubric, score, criterion status, or verdict behavior changes in this patch.
  The tester reports' already-fixed scoring items are not reimplemented, and detector-level
  follow-ups remain deferred to a future rubric release.

---

## [0.2.1] — 2026-07-26

### Fixed

- Zero-measurement v17/v18 abstentions now explain the reviewable-source arithmetic instead
  of stopping at a generic message. The terminal, report, summary, attestation, and HTML
  certificate state that AWS CardDemo has 9 criterion-ratable files among 250 source-shaped
  files (3.6%), below the 20% threshold, across 329 tracked files.
- The change is presentation-only: calibrated v17 scoring, findings, rubric identity, and the
  v50 finding-level GO are unchanged.

### Distribution

- This is an npm-only patch. OCI and MCP Registry remain at the actually published `0.2.0`;
  Cejel does not advertise nonexistent `0.2.1` container or registry artifacts.
- The next patch release will supersede `0.2.1` on npm and `0.2.0` on the other supported
  distribution channels.

---

## [0.2.0] — 2026-07-24

### Added

- Ships the public v0.2.0 CLI, MCP server, GitHub Action, Homebrew formula, OCI image, and
  Smithery integration from one authenticated distribution surface.
- Publishes the v17 OSS leaderboard and its complete rubric changelog; the board records the
  exact scorer commit, immutable corpus pins, and the scoreless CardDemo abstention.

### Changed

- The npm package remains scoped as `@cejel/cejel`; the unscoped `cejel` name is not claimed.
- Release metadata and download references now point at the v0.2.0 assets and checksums.

### Rubric

The public board carries **witan-rubric-v17-2026-07-24**. Its full v9 → v17 corpus delta and
calibration notes are in [`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md).

---

## [0.1.10] — 2026-07-22

### Fixed

- **Express coverage false negative.** The coverage detector looked only for standalone
  coverage configuration files and framework config blocks. `nyc`, `c8`, and Istanbul
  commands appearing inside `package.json` scripts were not recognized. Express (which
  configures coverage through npm scripts rather than a dedicated file) was therefore
  reported as having no coverage configuration even though it does. The detector now
  recognizes actual commands in script entries; an unused dependency listed in
  `devDependencies` does not count as coverage evidence.

- **Opaque metric-only findings.** When a dimension band was driven entirely by weighted
  metric scores and no single finding dominated, the terminal output said "combined metric
  weighting" and stopped. The two lowest-contributing metrics, their measured values,
  `finding severity`, and `dimension band` are now printed explicitly, along with concrete
  next actions.

- **Gitignored scan target presented as empty repository.** When the path passed to `cejel`
  was inside `.gitignore`, the scanner reported a generic empty-repository result. The
  output now names the gitignored target and explains why the scan was refused rather than
  presenting a structureless result.

### Rubric

Ships **rubric v9** (`witan-rubric-v9`). A1 now requires the same configured-runner
premise as its no-coverage proposition and never infers a missing-test finding from a
coverage artifact alone. A2 excludes generated, vendored, test, fixture, and example paths
from current and historical production-secret claims; qualified environment templates are
treated as templates. Headline scoring requires at least 80 % of source-shaped files to
belong to a published Cejel source family when a competing unread-language mass exists. See
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full v8 →
v9 corpus delta across all 24 board rows.

---

## [0.1.9] — 2026-07-21

### Rubric

Ships **rubric v7** and **v8**.

v7 corrects the evidence-boundary errors surfaced by the v25 calibration failure. Secret
findings now point to the exact matched line and expose only redacted value shape. Finding
and control packets for no-tests, no-coverage, no-CI/release-deploy, and no-lockfile
propositions carry exact tracked-inventory proof and applicability premises. A5 limits
claims to root/product documentation or dedicated claim-reconciliation artifacts.
Cohesive Fortran, CUDA/HIP, and web-template/style trees are recognized at explicitly
unmodelled depth.

v8 activates the v26 failure-derived detector and evidence-boundary corrections. A1
recognizes lean tests in nested workspaces while excluding generated, vendored, fixture,
and example manifests from the production toolchain. A2 reports current and historical
credential evidence independently. A3 evaluates each multi-stage Dockerfile's effective
final stage and requires a runtime command rather than a generic entrypoint name. A4 applies
app-runtime expectations only to strongly evidenced packaged Electron/Tauri software.

See [`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full
v6 → v7 and v7 → v8 corpus deltas.

---

## [0.1.8] — 2026-07-18

### Fixed

- **Symlink escape from the immutable source snapshot.** Repository evidence discovery used
  a regular-file check that followed tracked symlinks; a symlink target could resolve to a
  file outside the checkout and make scores depend on host-specific ambient files. Discovery
  now accepts only tracked regular files. The pinned Zod snapshot carries a root
  `README.md` symlink that previously counted one claim source twice; the fix removes that
  duplicate.

### Rubric

Ships **rubric v4** and **v5**.

v4 corrects the symlink issue above (Zod A5 falls 2.2 → 2.0; no other external score
moves). v5 binds git-history evidence to commits reachable from the checked-out `HEAD`
only; unrelated local branches and remote-tracking refs can no longer alter A2 evidence
or measured coverage for the same pinned commit. A regression test adds credential history
on a non-HEAD branch and proves it cannot affect A2. See
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full
v3 → v4 and v4 → v5 corpus deltas.

---

## [0.1.7] — 2026-07-13

### Fixed

- **Home-field bias in A1 scheduled-health-workflow detection.** A1's sub-signal for a
  scheduled product-health workflow was previously implemented as a literal filename match
  against an internal workflow name — inert for every external repository and an obvious
  credibility hole for a public rubric. Detection is now shape-based: any CI workflow with
  a `schedule:`/`cron:` trigger that runs the verification suite qualifies. A workflow
  sharing only the filename without the shape no longer fires. Results are additionally
  classified on whether they are durably published (pages deploy, commit-back, PR/issue
  comment) or handed only to an ephemeral `actions/upload-artifact`.

- **Leaderboard home-field scoring path removed.** The board generator previously had a
  private code path that could append internal-only collectors to a scan after the public
  scorer ran. That path is gone. Every row on the board — including the Alfred and Cejel
  transparency rows — is now produced by the same sealed public scorer that npm consumers
  and the GitHub Action use. A required board guard re-scores every corpus row through that
  function and compares score, criterion status, verdict, measured coverage, and the
  complete evidence-pointer set with the published report.

- **Corpus pins are now 40-character source commits.** Every external corpus entry now pins
  a specific source commit. Re-scoring at the same pins is a rubric change and publishes a
  corpus delta. Moving a pin is a separate corpus act; upstream default-branch drift can no
  longer masquerade as a rubric effect.

- **B1 and B5 status made explicit.** The repository scanner now states clearly that it
  evaluates neither B1 (dispatch trace completeness) nor B5 (verified learning trace) for
  any repository scan. Both are always `not_applicable` for this input type. The leaderboard
  excludes them fail-closed.

### Rubric

Ships **rubric v2** and **v3**. See
[`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) for the full corpus
deltas, including the five-ecosystem language-calibration corpus expansion (22 → 23 rows)
and the COBOL dominance-threshold correction that ships alongside v3.

---

## [0.1.6] — 2026-06-24

### Added

- **Sigstore build-provenance attestation.** Each binary release (macOS arm64/x86\_64,
  Linux aarch64/x86\_64) now carries a Sigstore bundle with a GitHub-signed SLSA
  build-provenance attestation. The attestation binds the binary to its source commit and
  the workflow run that produced it.

### Rubric

Ships **rubric v1** (`witan-rubric-v1`). Introduced metric-based scoring — continuous,
weighted per-criterion metrics replacing the v0 presence/absence model. No corpus-wide delta
was recorded at the time this version shipped; the leaderboard did not yet exist.

---

## [0.1.5] — 2026-06-24

### Fixed

- **COBOL false verdict — second attempt.** The v0.1.4 fix proved that the fixture used to
  verify it was cleaner than any real COBOL repository. A codebase with 99 % COBOL and nine
  incidental shell deploy scripts classified as `source`, was scored on those nine files, and
  received a confident **0.0 / Unverified**. Every real legacy repository has a deploy
  script, so the abstention path was unreachable for essentially all of them while every test
  passed. Recognised source must now be *dominant* — reaching a measured ratio threshold of
  the total tracked file count — not merely present. The threshold was calibrated against a
  ratio golden set of eight cases spanning the ratio space, with expected outcomes committed
  before the threshold number was chosen.

---

## [0.1.4] — 2026-06-24

### Fixed

- **First COBOL false verdict fix.** A repository written in a language Cejel cannot model
  (COBOL) was scored anyway. The fixture for this fix contained COBOL and nothing else and
  passed; see v0.1.5 for why it was still broken.

---

## [0.1.3] — 2026-06-24

### Fixed

- **False positive secret detection in own test fixtures.** Pointed at its own repository,
  Cejel's A2 (data-layer isolation and secrets posture) dimension flagged a
  "non-constant-time secret comparison" — in string literals inside a test file written to
  prove the detector fires. Two sub-rules of the same dimension held independent definitions
  of "production code"; the sub-rule whose definition included test files was the louder.
  Every rule now derives its production-code boundary from a single shared function, and
  findings report the real matched line from a real file or nothing at all.

---

## [0.1.2] — 2026-06-24

### Fixed

- **`--help`, `--version`, and `-h` rejected as unknown flags.** Version 0.1.1 parsed
  positional arguments before named flags, so `-h`, `--help`, and `--version` were
  interpreted as directory paths. All three are now handled before positional-path parsing.
  The printed version is derived from the package manifest rather than hardcoded.

---

## [0.1.1] — 2026-06-24

Initial public release.

- Offline trust certificate for any Git repository — no network, no model call, no signup.
- 11-criterion free-core rubric across `code_trust` (A1–A5) and `process_trust` (B1–B6).
- 0.0–4.0 scoring scale with `verified` / `conditional` / `at_risk` / `unverified` /
  `insufficient_source` verdict bands.
- Abstention when the target has no measurable signal rather than publishing a numeric zero.
- SARIF 2.1.0 and OpenSSF Scorecard JSON ingest for external scanner findings.
- CLI binary (`cejel`), MCP server (`cejel-mcp`), npm package, and GitHub Action.
- Single-file SEA binaries for macOS (arm64, x86\_64) and Linux (aarch64, x86\_64).
- Self-scoring: `cejel` scores its own public repository and publishes the result.
- OSS trust leaderboard: 15 well-known repositories scored from pinned source commits.
- In-toto attestation: `attestation.json` binds the report hash, repo revision, and rubric
  version; `cejel verify` checks the binding offline.
