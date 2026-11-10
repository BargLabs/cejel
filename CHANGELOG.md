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

### Added

- **GitLab: Cejel's scores as a metrics report, so a merge request shows the scores that changed.**
  `cejel export gitlab-metrics <report.json> [-o metrics.txt]` writes one `<name> <value>` line
  each for the overall score, process trust, code trust and every criterion
  (`cejel_criterion_a4_score`), to one decimal as the terminal prints them. A value Cejel did not
  measure gets no line, never a 0; an abstained report writes an empty file and the footer says why.
  The GitLab template runs it after the Code Quality export and publishes `metrics.txt` as
  `artifacts:reports:metrics`; a failed metrics export keeps the scan's exit status and the Code
  Quality upload. GitLab shows metrics reports on Premium and Ultimate only. Since 0.6.11 a score
  change on the same line no longer shows in the Code Quality widget; this report is where it shows.
  No scoring change: every `report.json` is unchanged. The gitlab.com component gains the step in
  its release after this one. See [`docs/gitlab-ci.md`](docs/gitlab-ci.md#metrics-report).

### Changed

- **GitLab: the CI/CD Catalog component stays on the npm release.** The release bump now moves
  every component mention for a final release (`gitlab.com/barglabs/cejel/cejel@<version>` in
  `docs/gitlab-ci.md` and the README, the inputs table's `version` default and the `spec:`
  default), and a release candidate moves none of them, since the Catalog carries only final
  releases. A node test pins each mention to `package.json`'s version, or for a release candidate
  to the newest final release. The release-currency check now also reads the Catalog anonymously,
  every 6 hours as well as weekly. It passes when the Catalog's newest version equals the release,
  reports pending while the Catalog is less than 3 hours behind the npm publish, and fails at 3
  hours or more, or when the Catalog cannot be read. The Catalog is reported on its own lines,
  outside the 14 surfaces the release driver counts, because a job on gitlab.com tags it, not the
  driver.

### Fixed

- **A repository path longer than 700 characters no longer stops the scan, under every rubric
  (#612).** The report schema caps every `path` at 700 characters. A file with a longer relative
  path, cited as evidence or listed as withheld, failed validation, and the scan wrote no report.
  - Such an evidence pointer is left out of the report. Nothing else is. A finding that cited it
    keeps its severity, summary and place. Its anchor becomes the repository (`.`), labelled
    "Path longer than the report's 700-character limit; not cited". The certificate's "What is
    wrong" lists the same items as for a short path, without a file location. With no file and
    no line, the GitLab Code Quality export leaves such a finding out and counts it in its footer
    ("without a file and line excluded").
  - The criterion's `disclosures` say how many distinct paths it did not cite. A path cited by
    two pointers, or by a pointer and a finding, counts once.
  - Such a withheld path is left out of `withheldPaths`. The statement goes in the `disclosures`
    of one criterion: the first, in report order, that a check reading the path belongs to, or
    the report's first criterion where no check would read it. It names those checks.
    `contentReadSummary` still counts the path. The certificate no longer says no content was
    withheld when some was, and it calls the entries it counts "listed".
  - None of these statements is ever a scan limitation, whatever the length of the notes or the
    number of scan limitations. The badge, the `--min-score` gate and every limitation count are
    those of the same repository with the file at a short path, and a scan whose sixteen scan
    limitations are used still writes its report.
  - A criterion that already has the four disclosures the schema allows takes the statement at
    the end of its `notes`: whole where the notes stay within 1,000 characters, else in a
    count-only form ("1 path over the report's 700-character limit is not cited; scoring counted
    it.", and "1 withheld path is not listed in withheldPaths because it is over the report's
    700-character limit."). Where even that does not fit, the notes' own tail is cut, ending
    "...", to make room, and their beginning is kept. Both count-only forms together are under
    300 characters, so at least 700 characters of the notes always stay. A sentence the
    certificate reads from the end of such notes can then be cut.
  - No path is shortened. A shortened path would name a file that does not exist.
  - Scores, statuses, metrics and verdicts are computed with every pointer, as before. Scoring
    reads how many pointers a criterion holds, so the pointer is left out after scoring, not
    before.
  - The finding that explains a metric-derived warning or critical status cites the first
    pointer the report can carry. Before, it always cited the first pointer.
  - The LLM pack's artifact does the same for a finding's evidence path over 700 characters. The
    finding keeps its rule, severity, confidence and summary, anchored on `.` with a stated
    label, so no rule state moves. `coverage.limitations` says how many distinct paths were not
    cited. Before, the calibration detector threw and wrote no `llm-report.json`.
  - A report or artifact with no path over the limit is byte-identical to before. The
    scoring-surface and fingerprint pins did not move. A path of exactly 700 characters is cited
    as before.

## [0.6.11] — 2026-11-09

v17 remains the default rubric. Every scoring change below applies only when the prospective v27
rubric is pinned. v27 carries no precision or recall claim.

### Changed

- **GitLab: the template has now run on a GitLab runner, and Cejel is a CI/CD Catalog component.**
  On 2026-11-10 the `v0.6.10` remote include ran on a GitLab.com instance runner
  ([pipeline 3048076526](https://gitlab.com/barglabs/cejel-gitlab-demo/-/pipelines/3048076526)), with full history in the `cejel` job and the Code
  Quality report shown on a merge request. The same job is published in the GitLab CI/CD Catalog as
  `gitlab.com/barglabs/cejel/cejel@0.6.10` ([pipeline 3048107004](https://gitlab.com/barglabs/cejel-gitlab-demo/-/pipelines/3048107004)).
  `docs/gitlab-ci.md` and the README now give the component first and keep the remote include as
  the fallback. This supersedes the statement in the 0.6.4 entry that the template had not been run
  on a GitLab runner. No scoring change.

- **GitLab: a score or count change at the same file and line keeps the Code Quality fingerprint
  (#700).** The fingerprint covered the finding summary, which carries a metric-derived score and
  band, so on [MR !1](https://gitlab.com/barglabs/cejel-gitlab-demo/-/merge_requests/1) two
  improved scores read as "2 new findings and 2 fixed findings". The fingerprint now covers the
  criterion, path, line and the finding's identity: fixed for a metric-derived finding, and the
  summary with every number replaced by one placeholder otherwise. Two different findings at one
  place that share an identity each get their ordinal there, so the export drops none; it exports
  the same number of entries as before. `description`, `check_name`, `location` and `severity` are
  unchanged; the score stays in `description`. **Every located finding gets a new fingerprint once**,
  so the first merge request after upgrading shows each existing finding as resolved plus new, one
  time. Export only: every `report.json` is unchanged.

- **Prospective v27: A1 reads `PYTEST_ADDOPTS` in the environment of the CI command that runs
  make, and names a collection hook defined in a plugin class (#633 item D, #634 item 3).** Under
  `witan-rubric-v27-prospective-2026-10-19` only.
  - **The two choices #648 kept are confirmed** by the operator on 2026-11-04. A plain `pytest` at
    the repository's root always counts as a run, so the root configuration is always in force. A
    Makefile `PYTEST_ADDOPTS = ...` without `export` is not read where make runs with no
    `PYTEST_ADDOPTS` in its environment, since make does not pass it to a recipe.
  - **The environment reaches the recipe.** Where a CI make command has `PYTEST_ADDOPTS` in its
    environment, make passes `PYTEST_ADDOPTS` to every recipe, exported or not. Before, A1 read
    the Makefile's value only where the Makefile exported it, and read the environment's only for a
    pytest the CI step ran itself, so it rated a file "runs no test" that pytest runs. The
    environment is a workflow-, job- or step-level `env:`, a leading `PYTEST_ADDOPTS=... make`, an
    `env PYTEST_ADDOPTS=... make`, an `export PYTEST_ADDOPTS=...` earlier in the same `run:`, or a
    non-GitHub CI file's variables key. The recipe's pytest then runs with the Makefile's value
    where it assigns one with `=`, `:=` or `::=` (a `+=` appends it to the environment's), and with
    the environment's where it assigns with `?=`, not at all, or make runs with `-e` (an `override`
    assignment still wins). The Makefile read is the one in the directory make runs in, after `cd`
    and `-C` (with `-f`, any), from the targets the command names. A value on make's command line
    is still not read, as before.
  - **An environment Cejel cannot read is named.** A workflow naming both `$GITHUB_ENV` and
    `PYTEST_ADDOPTS` (the rule by name), an `env:` value that is an expression, or a value holding
    `$` or a backtick leaves the recipe's pytest runs not read: "pytest run not read: `<reason>` in
    Makefile". At most 16 distinct environments are read per Makefile; the rest are read as one
    that is not known.
  - **A `?=` default of `PYTEST_ADDOPTS`** is no longer "not known" because a CI file names it;
    the environment of each CI make command is read instead. So `PYTEST_ADDOPTS ?= ...` with a CI
    environment that sets it to an inert value is read with that value and can rate a file hollow,
    where main named the run as not read.
  - **A hook in a plugin class is named.** A `pytest_collection_modifyitems` defined as a method of
    a class in a `conftest.py`, whose body names `items`, is named "hook not read:
    `<Class>.pytest_collection_modifyitems` in `<path>`", with a pointer at the method's `def`. It is
    not read, and the files keep v17's reading, as before; only A1's note and evidence change.
  - **Not read:** `MAKEFLAGS` in the environment; a justfile run with `PYTEST_ADDOPTS` in its
    environment; a hook class in a module that is not a `conftest.py`; and a direct pytest step
    whose `env:` sets `PYTEST_ADDOPTS` by an expression, which is still read as setting nothing
    (cejel #669).
- **Prospective v27: B3 credits a runner pointed at a path only where the path holds a test file
  Cejel counts, and a check `uv run` launches only where uv does not build the project first
  (#659, #660).** Under `witan-rubric-v27-prospective-2026-10-19` only, on the check-before-publish
  reading of B3's earlier passes. The operator ruled on both on 2026-11-05 (option A for each).
  - **A path must hold a counted test (#659).** `mocha index.js` runs 0 tests and exits 0, and
    `go test ./pkg` on a package with no `_test.go` prints "no test files" and exits 0; both were
    credited. For pytest, mocha, `node --test`, `tsx --test`, `deno test`, rspec, phpunit,
    `dotnet test`, ava, tap, tape, jasmine, qunit, lab, ts-mocha, uvu, `go test` and unittest, a
    positional word now counts only where, resolved from the root, it is a file on v17's test-file
    list (the one A1 counts), a directory holding one at any depth, or a glob matching one; for
    `go test`, a package directory holding a `_test.go` directly, or with `/...` below it. A pytest
    node id (`file::test`) is read as its file. Otherwise B3's note says "the check points at
    `<word>`, where Cejel finds no test file". A word Cejel cannot resolve (a substitution, quote or
    brace, a directory it does not know, a go import path, uvu's second, pattern, positional) is
    named as an argument Cejel does not read. `uvu test`, where `test/` holds a test file, still
    counts. jest, `bun test`, `playwright test`, karma and pyright keep their earlier rule.
  - **`uv run` builds the project first (#660).** uv builds and installs the project before the
    command where pyproject.toml defines `[build-system]` or sets `tool.uv.package = true`, running
    its build code. Such a check, on the check line or in a script or recipe, is not credited (on
    the check line with the project-install reason hatch already gives), unless it carries
    `--no-project`, or `--no-sync` with no earlier `uv sync` in its job that installs the project.
    `tool.uv.package = false`, or no build system, keeps the credit. Where Cejel cannot tell (no
    root pyproject.toml, a committed uv.toml, a uv workspace or sources table, `--package`,
    `--project` or `--directory`, a directory it does not know) the check is named as not read.
    `uv run --no-project pytest`, and `uv run --no-sync pytest` after
    `uv sync --no-install-project`, are now credited where they were not.
  - v17 and every other rubric are unchanged. No holdout or calibration ran, and no published score
    moved.
- **Prospective v27: A1 names a pytest run whose `PYTEST_ADDOPTS` Cejel cannot know as not read, in
  two more places (#669, #673).** Under `witan-rubric-v27-prospective-2026-10-19` only.
  - **An `env:` expression on a step that runs pytest itself (#669).** Where a GitHub Actions step,
    its job or its workflow sets `PYTEST_ADDOPTS` by an expression (`${{ matrix.pytest-options }}`),
    a pytest run on that step was read with no `PYTEST_ADDOPTS` at all, so a file whose every test
    is skipped was rated "runs no test", though the expression may set `-p no:skipping`. It is now
    named "pytest run not read: `PYTEST_ADDOPTS: <value as written>` in <workflow>", with a pointer
    at the entry's line, whether pytest runs directly, as a Python module, or through a launcher A1
    follows. The most specific level that sets it decides, so a literal on the step over an
    expression on its job is read as before; a `PYTEST_ADDOPTS` set on the command itself is read
    over the expression.
  - **A `?=` default where CI sets the variable somewhere the reader does not follow (#673).** The
    2026-11-04 change read a Makefile's `PYTEST_ADDOPTS ?= ...` against the environment of each CI
    make command. Where CI set `PYTEST_ADDOPTS` somewhere that reader does not follow (a script a
    step runs with it set, `bash -c`), the default was read as in force. It is now read that way only
    where every mention of `PYTEST_ADDOPTS` in the CI files is one the readers read: an `env:`
    entry, a leading assignment or `env` prefix on a make command, an earlier `export` in the same
    `run:`, the `$GITHUB_ENV` rule, or a non-GitHub CI variables key. Where a CI file names it
    anywhere else, the default is not known again, and the runs its targets reach are named
    "pytest run not read", as before 2026-11-04. An `=`, `:=` or `+=` assignment keeps the
    2026-11-04 reading.
  - **Not read, stated limits:** a script that sets `PYTEST_ADDOPTS` itself, where no CI file names
    it; a script run after a read `env:` entry or `export`, which inherits it; and an unexported
    `PYTEST_ADDOPTS = ...` that a script's environment would make make pass on (cejel #674).
  - v17 and every other rubric are unchanged. No holdout or calibration ran, and no published score
    moved.

### Fixed

- **The GitHub Action no longer reads the calling repository's `package.json` to set up pnpm, and no
  longer changes the calling job's pnpm (#685, #686).** Both `action.yml` and `action/action.yml` ran
  `pnpm/action-setup`, which reads `packageManager` from the caller's workspace and prepends its pnpm
  to the job-wide `PATH`. A caller pinning a pnpm other than 9.0.0 failed with "Multiple versions of
  pnpm specified". After #685 such callers passed, but every later `pnpm` step in their job ran the
  Action's 9.0.0.
  - The Action now reads the exact pnpm version from its own `package.json`. It installs that pnpm
    with `npm install --prefix` into a fresh directory holding an empty `package.json`, then runs it
    from there by path. It stops if the installed pnpm is any other version.
  - Nothing runs through `npm exec`, which puts every parent directory's `node_modules/.bin` ahead
    of `PATH`. The explicit `--prefix` keeps npm from adopting a parent directory as its project,
    for example one whose `package.json` declares workspaces.
  - Its `actions/setup-node` step runs with `package-manager-cache: false`, so setting up the
    toolchain no longer reads the caller's `package.json` either. The scan itself still reads the
    repository it scores, which is the caller's checkout by default.
  - It adds no pnpm to the caller's `PATH` and does not set `PNPM_HOME`.
  - Still shared with the caller's job:
    - Node 22 first on `PATH` and setup-node's problem matchers, as before.
    - Whichever `node` is first on `PATH` runs pnpm, as before.
    - The rest of the job's `PATH` and environment (`NODE_OPTIONS`, for example) reaches pnpm and
      the build, as before.
    - npm's cache under `~/.npm`.
    - pnpm's default store, metadata cache and global rc file.
    - The user, global and environment npm configuration, including the registry.
    - Two `cejel-pnpm.*` directories left in `$RUNNER_TEMP`, each holding the pnpm tarball and
      the installed pnpm (about 22 MB, 4 MB of it the tarball).
  - The `action-from-another-caller` CI job checks that a caller pinning pnpm 10.0.0 keeps its own
    pnpm and `PNPM_HOME` after both Actions.
  - The distribution validator, through `scripts/action-manifest-guard.mjs`, requires each manifest
    to end with exactly its canonical `runs:` text, byte for byte. No line is skipped: the
    manifests keep their explanatory comments above `inputs:`. Before comparing, it also refuses
    anywhere in the file:
    - any line break YAML recognises other than `\n` (a lone CR, NEL, LS or PS);
    - every character JavaScript counts as white space but YAML does not, such as U+00A0;
    - C0 control characters other than tab, LF and CR, DEL, and a BOM;
    - YAML document markers, and a second or reformatted literal `inputs:`, `outputs:` or `runs:`
      key.

    Other spellings of a duplicate key are left to the runner, which refuses them when it loads the
    Action.
  - **The inputs and outputs are pinned too (#689).** Everything from `inputs:` up to `runs:`, so
    every input default and every output value and description, must match a SHA-256 recorded per
    manifest in `scripts/action-manifest-guard.mjs`. Before, only the `rubric-pin` default was
    checked, as a substring that a decoy elsewhere in the file could supply, so changing `out-dir`
    to `.`, `repo-path` to `/`, the `rubric-pin` default to a prospective rubric, or an output
    value to `${{ github.token }}` passed. The checks moved out of the distribution validator into
    that module. `src/__tests__/action-manifest-guard.test.ts` runs 119 cases against both
    manifests, each asserting which check refuses it: those found in the reviews of #687 and #689,
    one for every refused character, and line breaks hidden above `inputs:`. It also runs the edits
    that must still pass: the description, branding, and comments above `inputs:`. A comment above
    `runs:`, which #689 listed as one, is now refused, because it sits in the pinned region.
  - **The pnpm tarball is checked against a pinned sha512 before it is installed (#686 items 6 and
    7).** `packageManager` is now `pnpm@9.0.0+sha512.<hex>`, corepack's form, and the Action
    refuses one without the hash. Each pnpm step fetches the tarball with `npm pack`, moves it to the
    fixed name `pnpm.tgz`, compares its sha512 with the pin, and installs that file. The fixed name
    matters: npm names the tarball from the registry's manifest, and `npm install` re-parses the
    name it is given, so a crafted name could turn into a git spec (#696 review Pass B). Before, npm checked the tarball only
    against the registry's own `dist.integrity`, and a restored `~/.npm` cache could supply it
    with no independent check. The pin matches the registry's `dist.integrity` for pnpm 9.0.0.
    The `action-from-another-caller` job runs a copy of the Action with one digit of the pin
    changed, and checks that it fails with the tarball fetched and nothing installed. The
    distribution validator requires the hash in `package.json`.
  - **A pnpm version hardcoded in a workflow is refused in flow style too (#686 item 5).** The
    check read only block-style `version:` lines after `uses: pnpm/action-setup`, so a
    `with: { version: … }`, a step written entirely in flow style, a `with:` before `uses:`, and
    a quoted key or value all passed. It now reads the whole step, in
    `scripts/workflow-pnpm-version-guard.mjs`, with a test of each spelling.

- **`cejel issue` reproduces with the attested scan's own date, so a certificate from an earlier
  year can be issued (audit C4; operator ruling of 5 Nov, option A).** v17's B4 freshness check
  matches the scan's calendar year. The re-run used the issuer's clock, so an issuance in a later
  year than the scan always refused. The re-run now uses `predicate.generatedAt`, read from the
  attestation that has already been accepted as bound to `report.json`, and never from a flag.
  - **No score moves.** B4, `referenceYear` and every rubric are unchanged. A normal scan passes no
    date and scans at the current time, as before, so its `report.json` is byte-identical to main
    under every rubric. Measured by scanning two synthetic fixtures with main's build (`bb6828641`)
    and this change's build, under the default and each of the 11 rubrics the CLI accepts (v17 to
    v27). Their CHANGELOGs named this year and last year. All 24 `report.json` pairs were
    byte-identical.
  - **Refused with a named reason:** a `predicate.generatedAt` that is missing, is not an ISO 8601
    time, or is later than the issuer's clock. The attestation schema already refused the first
    two at the binding check; the third is new.
  - **A failed reproduction near a new year names the likely cause.** Where the scan time is within
    24 hours of a new year in UTC, the refusal adds one line: v17's freshness year is read in the
    scan host's local time, so an issuer in another time zone may need to re-run with the `TZ`
    environment variable set to the scan host's.
  - **`issuance.json` records the date it reproduced with,** as `reproduction.generatedAt`. The
    field is additive and optional, so the issuance format takes a minor step, from 1.0 to 1.1. A
    1.0 issuance still verifies.

- **The scaling check in `scan-path-regex-bounds.test.ts` steps by 4, from L/2 to 2L, and refuses
  above 11 (#678).** Test only; no reader, rubric or report changes. At L and 2L with a limit of 3,
  a linear reader gives 2, and the same unchanged code measured from 1.9 to 3.2 on CI, so the
  runner decided some runs. On a quiet host it failed 3 of 5 runs on main (the test-path reader on
  many listed files: 3.15, 3.03, 3.10). At a step of 4, linear is about 4, n log n about 4.5 and the
  square 16. The largest input stays 2L, and the sample floor is 40 ms at L/2 (it was 80 ms at L),
  so each sample at 2L costs what it did before.
  - **A ratio below 2 is refused:** "the reader did not read the length it was given". Inputs built
    ahead of time are built for exactly the two lengths the check reads, and a lookup at any other
    length throws, so a reader can no longer get nothing at one length and pass.
  - **Two inputs changed, not their assertions.** The builtins search had measured the fixed cost of
    listing the tracked files, not the sweep (1.21 to 1.27 on main). It now sweeps near misses in
    further modules, and gives 3.6 to 3.8. The module-shadow reader's expected answer had been the
    empty answer; one shadowing module, last, now makes it true.
  - **A reader handed nothing at L/2 fails at once.** One read at 2L caps the reads per sample.
    Without the cap, a reader whose L/2 input was missing while its 2L input was present ran for
    hours instead of failing.
  - A self-test admits an n log n stand-in, and refuses one that does the same work at both lengths.
  - **Why 11 and not 8.** Six readers grow faster than linearly, and the noise between runs
    multiplies a ratio by the same factor at any step. A limit of 8 left the slowest of them 1.10 to
    1.15 of room, about what a limit of 3 had left at a step of 2. 11 sits about halfway, on a ratio
    scale, between the highest reader seen (7.26) and the square stand-in (16.0), about 1.5 from each.
  - **Measured on five runs of the file alone, on one quiet host:** every test passed. Across the
    20 readers the highest ratio was 6.94 and the lowest 3.12. The file ran in 77.0 to 82.2 s,
    against 95.9 to 104.1 s on main. Six readers grow faster than linearly, 5.2 to 6.9 at the step
    of 4 where linear is about 4. The test-path reader on many listed files (6.14 to 6.94) has the
    smallest margin under 8, a factor of 1.15. In one run of the whole suite, under parallel load,
    the two test-path readers reached 7.20 and 7.26. CI on this change gave 7.02 at most. Those
    margins were measured against 8; against 11 they are about 1.5. Where the test-path readers'
    superlinear cost comes from is in the next entry (#680).
- **None of the six readers above 4 is superlinear by algorithm; their cost per character grows
  with the memory they touch (#680).** Test only; no reader, rubric or report changes.
  - **Measured.** Each reader was timed alone at lengths from L/8 up to 2L, and the deep-path and
    module-shadow readers up to 4L. The three file readers do not read a file over 512 KB. Their cost per character is flat at
    small inputs and then flat or stepping up, never by more than 2.2 times: the deep-path
    test-path reader 75 to 161 ns, the module-shadow reader 36 to 75, the many-files test-path
    reader 17 to 24, the hatch reader 28 to 36, the justfile reader 18 to 29, and the tox.ini
    reader 24 to 22. A quadratic reader's cost per character would grow 32 times from L/8 to 4L.
    Garbage collection and system time stay a small share.
  - **The cause.** The readers' hash maps, sets and the strings keyed into them outgrow the CPU
    caches, so each access costs more as the input grows. A stand-in that is linear by construction
    and only sets and reads a Map of string keys measured 6.10 to 6.41 in the scaling check (and
    8.57 alone with one read per sample). That is the readers' own range. The arithmetic-only
    stand-in, which touches no memory, measured 3.84 to 4.04.
  - **What changed.** The scaling self-test now includes that memory-bound stand-in. It is held
    only below the square, 16, and logs its ratio on every run beside the readers, so a reader that
    fails the limit of 11 can be compared with the platform's own baseline before it is called
    superlinear. The limit stays 11.

## [0.6.10] — 2026-11-04

v17 remains the default rubric. Two entries change default output: the plain-language first page
under Added, and the first entry under Changed (a scan whose git history Cejel could not read is
unrated under every rubric). Every other change below applies only when the prospective v27 rubric
is pinned. v27 carries no precision or recall claim.

### Added

- **A plain-language first page.** A first-time reader could not tell what a result meant without
  help. `certificate.html` now opens with a verdict line and four lists in plain words: what holds,
  what is wrong, what is not known, and what to check next, with a line saying what the result does
  not cover (Cejel does not run the code or its tests). Each item links to its source further down.
  The lists come from `report.json` alone, through a new pure function (`src/plain-summary.ts`);
  each check-next line comes from a fixed table of reviewed sentences (`src/witan/next-checks.ts`),
  and an item with no table entry points to the certificate section that holds it. An area that
  was not examined is listed as not known, never as holding. A held area states its label and its
  score out of 4 ("Rated Verified, at 1.0 out of 4"; an Info area reads "Partly holds: rated Info,
  one label below Verified"); only 4.0 is called the top score. An area the report says it could
  not fully read (`contentReadSummary.affectedCriteria`, or named by a scan or history limitation)
  is listed as not read, never as having nothing to measure, with the cause the report ties to that
  area: its own abstention note (files that could not be read, Git LFS pointers, or files left out
  under Cejel's size limit or rules) or the kind of limitation that names it. The report-wide skip
  counts only narrow a "could not be read" note to the one read-failure cause they hold; they never
  add a cause the area does not carry. Its check-next line follows that cause: `git lfs pull`
  for Git LFS pointers (the line the Files not read item gives), making files readable only where
  they could not be read, no fix for a size limit or rule, and fetching the full history for a
  shallow clone. A scan limitation's check-next line follows the cause its table entry names in the
  same way; a limitation no entry knows gets a general line with no example. Each
  insufficient-source reason the engine produces (16 kinds, from `repo-signals.ts`, `scoring.ts`
  and `history-depth.ts`) has its own plain sentence, built from the reason's own counts; a reason
  of no known kind reads "Cejel could not rate the source here; see the certificate below". Scan
  and history limitations are reworded through a fixed table, or word by word, never replaced by a
  generic sentence. An empty What holds prints one sentence, chosen by whether there is an overall
  result and how many areas are labelled Verified or Info. Under a prospective rubric (v27), the
  first page carries the certificate header's uncalibrated, no precision or recall notice above the
  verdict line, in the HTML, the terminal and `plainSummary`. An area with no score that lists a
  finding is in What is wrong for the finding, and Not known says only that its score was not
  given. A score made up of several measurements is given with its number and level, and an area
  labelled Critical or Warning with no finding of its own gives its score. A label moved by
  imported evidence is explained. The terminal prints the four headings after the verdict, up to
  three items each, and `summary.json` gains one key, `plainSummary`, holding the four lists.

  The certificate below the first page is unchanged apart from the anchor ids the links point to.
  A test removes the first page and those ids and compares what is left, byte for byte, with renders
  captured by running the same test in a worktree of main before this change (733a464d3): the full
  HTML of nine representative fixtures, and a sha256 of each of 644 renders, which are every
  behaviour-corpus, disclosure-gap and false-assurance fixture under v17 and v27 except one, whose
  committed symlink points at a fresh temporary directory, so its commit hash differs on every
  build. `report.json`, `attestation.json`, scores, verdicts and every detector are byte-identical
  for the same input: tests pin the report and attestation digests of the same 644 renders, and of
  every behaviour-corpus fixture under the options the earlier pins used, to the values main
  produced. Other test fixture families (the v27 A1 run, withhold, removal and hook fixtures, and
  the B3 publishing, CI-claims, settling, build-step, calibration and shallow-history fixtures) are
  not pinned. The GitHub Action's inputs, outputs and step summary are unchanged, and so is the MCP
  and HTTP scan summary.

### Changed

- **Default rubric: a scan whose git history Cejel could not read gives no score and no verdict
  (operator ruling of 2 Nov; ADR-0001).** Visible to every default user of the GitHub Action:
  `actions/checkout` makes a shallow clone unless `fetch-depth: 0` is set, and that scan is now
  "Unrated: shallow clone" instead of a score. Set `fetch-depth: 0` to get a score again.
  - **A shallow clone, or a history depth Cejel cannot read, under v17 and every other rubric.**
    The report abstains (verdict `insufficient_source`, every headline score null) as v27 has since
    1 Nov: "Unrated: shallow clone" (reason `shallow_history`) or "Unrated: history depth unknown"
    (reason `history_depth_unknown`), with the instruction to run `git fetch --unshallow` or check
    out with `fetch-depth: 0`. Each criterion is still read and shown. A2 abstains, as v27's A2 does,
    unless a confirmed critical secret finding stands on what was read; B2 keeps its #604 handling.
    Until now v17 scored a depth-1 clone, on which A2 cannot see a secret committed and later
    deleted, so a shallow clone could score higher than the full clone of the same commit and pass
    a `--min-score` gate the full clone fails. The certificate's history limitation now says a
    shallow clone gets no composite under every rubric.
  - **A directory with no `.git`, under every rubric, v27 included.** "Unrated: no git history"
    (reason `no_git_history`), with the instruction to scan a git clone with full history; an
    uploaded snapshot or archive carries no history. That covers every snapshot uploaded to the HTTP
    or remote-MCP server, every tarball and every archive export of a commit. A2 abstains, and its
    note says no history was read, unless a confirmed critical finding stands on the files; until
    now it was scored with a note saying history secret scanning covered all reachable history. An
    A2 that abstains lists none of the tree findings below critical it read (as under v27 on a
    shallow clone).
  - **The GitHub Action.** `BargLabs/cejel/action@v1` (`action/action.yml`, the path the README
    documents) now declares the `limited`, `limitation-count` and `limitations` outputs the root
    `action.yml` declares; it lacked them. On an Unrated run `limited` is `true` and `limitations`
    carries one message naming the cause, so a workflow gating on `limited` sees it. The
    distribution metadata check now fails when the two manifests' outputs (names, descriptions or
    values) differ.
  - **Unchanged.** A complete clone is scored exactly as before, byte for byte, under v17 and v27.
    v17's weights, bands, criteria and calibration are untouched; #517-#520 stay v27-only. A
    complete clone whose history read failed (a read limit, the file cap, a partial clone's missing
    object) is scored as before under every rubric.

- **Prospective v27: A1 stops crediting a builtin copy that a tracked file may replace, reads nox
  posargs and the options a conftest.py declares, and pins #634's remaining shapes (part of #646;
  #649, #634).** Under `witan-rubric-v27-prospective-2026-10-19` only.
  - **A builtin copy (part of #646).** A collection hook that copies the items through
    `list(items)` or `tuple(items)` (or a same-file helper that restores from `list(src)`) is
    credited with "puts the collected items back" only where no file the repository tracks, in any
    directory (vendor/, build/, dist/, venv/ and coverage/ included), may replace the builtin. Such
    a file is a Python source that, read under NFKC, names `builtins` anywhere (`f_builtins` too),
    reaches a module, frame or namespace by a computed name (`sys.modules`, `getattr`,
    `__import__`, `importlib`, a frame's globals, `gc`, `ctypes`, `pickle` and others), calls
    Python's own `exec`, `eval`, `compile`, `globals`, `vars` or `locals`, or sets an attribute
    named `list` or `tuple`; or a compiled or archived module Cejel cannot read; or a file it
    cannot read. Otherwise A1's note names the hook as not read: "... calls a builtin, which
    <file> may replace". `items[:]`, `items.copy()` and `[*items]` call no builtin and stay
    credited. A hook not read keeps v17's reading, so only A1's note changes. Not read, and the
    reason #646 stays open: a module installed from outside the repository (an entry-point plugin,
    a `sitecustomize`, a `.pth` file in site-packages), and any route to builtins the search does
    not list.
  - **nox posargs (#649).** A noxfile's `*session.posargs` is now read as the words after `--` on
    each CI, recipe or tox nox command (`nox -s tests -- -p no:skipping`, or nox run as a Python
    module), with no `--` passing none. "None" holds only where every nox command in the repository
    is one the reader reads. A nox command run another way (`poetry run nox`, `env CI=1 nox`,
    `hatch run nox`, `uv run --with nox nox`, uvx with options), or a line naming nox as it would
    be run in another file that can run one (a script, a Python module, a configuration file),
    leaves the run not read and named. So does a word holding `$`, a backtick or braces, or more
    than 16 distinct sets. Documentation, dependency lists and install commands are not read as nox
    commands. Before, every such run was named "pytest run not read", which switched off every
    removal rule in almost every nox repository.
  - **Options a conftest.py declares (#649).** An unknown long option before a word is looked up
    in the repository's `conftest.py` files, CRLF or LF, every call on a line:
    `parser.addoption("--runslow", action="store_true")` (or `store_false`, `count`,
    `store_const`, `append_const`) takes no value, so `pytest --runslow tests` is read like
    `pytest tests --runslow`; any other action, or none, takes the word as its value. An option
    declared nowhere, with `**kwargs`, a non-literal action or `nargs=`, or declared twice with
    different readings, still leaves the run not read. So does every unknown option where any
    `conftest.py` declares an option through a name or `*args`, which may be that option.
  - **#634.** Six more shapes are pinned. Five already read correctly or were named as not read
    on main, so none needed a fix: a restoring lambda bound after the clear and called, `**` and
    mixed `*` helper arguments, a hanging-indent hook `def` with `items` on the next line, and
    quoted paths past the first eight evidence pointers. The sixth, `self.refill(...)` in a plugin
    class registered from `pytest_configure`, is neither read nor named: the reader reads no hook
    in a class, so A1 makes no claim about it and the files keep v17's reading.
- **Prospective v27: A1 reads the pytest runs, options and configuration search pytest itself
  uses, names a run it cannot read instead of rating its files hollow, and points each setting
  clause at its line (#633, #643).** Under `witan-rubric-v27-prospective-2026-10-19` only. Each gap
  meant a setting really in force was not seen, so a file pytest runs was rated "runs no test".
  - **Runs read whole.** A noxfile's `session.run("pytest", ...)` with literal arguments; `tox --
    <args>` passed into `{posargs}`; a tox factor-conditional command line (`py312-fast: pytest
    ...`) for an environment whose factors meet it; `$(PYTEST)` and other variables the same
    Makefile defines, as make reads them (a `:=` value expanded where it is assigned), and literal
    justfile variables; a justfile recipe with parameters, and its `set export`; `hatch run
    [env:]script`, resolved through the hatch scripts in `hatch.toml` or `pyproject.toml`, including
    one an environment inherits from `default` where no `template` is named; tox run as `python -m
    tox`, `uvx tox`, `uv run tox` or `pipx run tox`; the environments a CI `TOXENV` names; and a
    local composite action's `run:` steps.
  - **Runs named as not read.** Where a run's arguments or directory cannot be known from the
    repository (nox's `*session.posargs`, `tox -- $VAR`, a Makefile variable it does not define or a
    make command sets, a make variable set by `!=`, `define`, inside a conditional, for one target, or
    by a `?=` default a CI file may replace, an unknown exported `PYTEST_ADDOPTS`, a justfile
    parameter, `hatch test`, a `TOXENV` Cejel cannot resolve, a `${{ }}` expression or a `cd` to a
    variable, `-c` outside the repository, `--pyargs`, a `working-directory` expression, Jenkins
    `dir()`, a reusable workflow in another repository, a step action one of whose `with:` inputs
    runs pytest, and every pytest run in a workflow that names both `$GITHUB_ENV` and
    `PYTEST_ADDOPTS` (so may write one to the other) or checks out into a `path:`), any option could be in force for any file it collects, so no
    removal rule is applied to a file it may collect, and A1's note says "pytest run not read:
    `<reason>` in `<path>`" (#644's "not read" clause, for a run).
  - **Options.** An option the reader does not know, before a word that may be its value or a path,
    leaves the run not read. `--cov` takes a value only where the next word does not start with
    `-`, as pytest-cov's `nargs="?"` parses it, so `pytest --cov -p no:skipping` keeps `-p
    no:skipping`. `testpaths` globs are expanded as `glob.glob(..., recursive=True)` does, not read
    as their literal directory prefix.
  - **Configuration search.** pytest 9's `determine_setup` order: a `setup.py` at or above the
    common ancestor is the root before the per-argument search runs. Where a run finds no
    configuration file in the repository, pytest may read one above its root, which the scan cannot
    see; A1's note says so once where a file is rated hollow on such a run, and nothing is rated on
    what that file might hold.
  - **Kept, for the operator to confirm.** A plain `pytest` at the repository's root always counts
    as a run (the documented default invocation), so the root configuration is always in force; and
    a Makefile `PYTEST_ADDOPTS = ...` without `export` is not read, since make does not pass it to a
    recipe's environment (this changes #626's first pass, `892a95a40`, which read it). An `export
    PYTEST_ADDOPTS` line, a bare `export` or `.EXPORT_ALL_VARIABLES` does export it, and is read.
  - **Evidence pointers for setting clauses (#643).** Each file a withhold clause names ("-p
    no:skipping set in pyproject.toml", "on a pytest command line in .github/workflows/ci.yml",
    "in PYTEST_ADDOPTS in ...", a run not read) is cited at the line that holds the setting, the
    pytest command line or the run. They share the eight pointers with the hooks the note names, in
    the note's order, and the note counts those past eight ("the N named after the first 8 carry no
    evidence pointer"). The v27 glossary's non-hollow sentence says so, and names "pytest run not
    read". A pointer's label is cut at the evidence limit of 180 characters.
  - **Known limit.** Any other remote step action (`uses: owner/action@ref`) is read as running no
    pytest: nearly every workflow uses one (checkout, setup-python), and naming each would withhold
    every rule in almost every repository.
  - A remote step action (`uses: owner/action@ref`) is not named as a run not read: nearly every
    workflow uses one, so naming each would withhold every rule everywhere. Only a remote reusable
    workflow (`uses: .../.github/workflows/...@ref`) is.

- **Prospective v27: A1 places every pytest collection hook that touches `items` in one of three
  outcomes, and none by default (#631, #632, #634; revised by the allowlist round, which supersedes
  #638).** Under `witan-rubric-v27-prospective-2026-10-19` only. A `pytest_collection_modifyitems`
  hook is read as one that deselects everything (the run-wide skip rule applies), one that puts the
  collected items back (the rule is withheld, and A1's note says so), or one Cejel could not read
  (the rule makes no claim, and A1's note names it: "hook not read: `<reason>` in `<path>`", with
  the hook cited at its `def`).
  - **"Puts the collected items back" is an allowlist over the whole hook body.** A hook reaches it
    only when every statement of its body is one of these, and nothing else is in it: a copy
    `S = list(items)`, `items[:]`, `items.copy()`, `[*items]` or `tuple(items)` taken before the
    list is emptied and mentioned at most once more; an emptying `items.clear()`, `del items[:]` or
    `items[:] = []`; a restore after it, `items.extend(S)`, `items += S`, `items[:] = S` or
    `items[:] = S[:]`; a call of a plain, undecorated `def` helper the same `conftest.py` defines
    once and names nowhere else, whose body is only that emptying and restore; and a docstring.
    `sorted` is not a copy, and `list` and `tuple` count only where the module never binds them. No
    report call is on the allowlist: `config.hook.pytest_deselected(...)` (any `conftest.py` or
    plugin may implement it), `print` and logging calls (they run handlers and their arguments'
    `__str__`) make a restoring hook "not read". So does a `conftest.py` that may rebind a name the
    allowlist trusts without spelling it: a star import, `setattr`, `builtins` or `__builtins__`,
    `sys.modules`, a module `__getattr__`, `exec`, `vars` and the like, or an assignment to `list`,
    `tuple` or the helper through an attribute. The common deselect-everything hook, which reports
    its copy, stays caught. Anything else (a lambda or nested function, an
    `async` or decorated `def`, a slice that is not the whole list, another name bound to the list,
    `exec`, `getattr`, an f-string field) makes a hook that is not provably deselecting everything
    "not read". So the lambda and nested-function restores #638 credited, and a helper restoring
    from `sorted(...)`, are now named as not read, and a hook that empties the list again with
    `items[0:] = []`, copies with `sorted(items)` or shadows `list` is no longer credited.
    Shapes that put nothing back are rated hollow: a saved copy aliased and cleared,
    `list(items)[:0]`, `saved[5:5]`, `saved[n:n]` or `sorted(items)[:0]`. Reporting or iterating
    over a saved copy is not a restore, so the common deselect-everything hook stays caught.
  - **`conftest.py` is read as Python reads it.** Strings (triple-quoted ones too), f-string
    fields, comments, brackets and backslash continuations are tokenised, so a hook body ends where
    Python ends it: a clear after a triple-quoted string whose closing line starts at column 0 is
    read. A comment or docstring that names the hook no longer stops Cejel reading it, and an `if`
    in a docstring is not a condition.
  - **No false hollow rating.** `items = copy.copy(items)` before the clear, a `for` loop that
    rebinds `items`, and an extend from a name that a closure defined earlier fills are not read,
    never rated hollow (pytest runs every test in each).
  - **No silent pass.** `items[0:] = []`, `items[:len(items)] = ()` and a helper doing
    `lst[0:] = []` are named as not read.
  - **A hook in any `conftest.py` reaches every collected test.** pytest calls every loaded
    `conftest.py`'s collection hook with every collected item, so a hook in `tests/sub/conftest.py`
    that deselects or skips everything rates every collected test file hollow, not only those under
    `tests/sub/`, where the pytest run collecting the file also collects `tests/sub/`. A run that
    does not is said as a withhold.
  - **Not read, and named (#632, #634).** A hookwrapper (`hookwrapper=True` or `wrapper=True`) is
    read as the code after its single top-level `yield`, so one that empties `items` after its
    `yield` is rated hollow. A hook that an `if`, `return`, second `yield` or other conditional
    statement stops, that has any other decorator, or that uses `items` in a way Cejel does not read
    (an imported helper, a method, `*` arguments, an `append` loop, an alias, `__iadd__`, a clear
    inside a loop, `session.items` or any use of the hook's `session` after the clear, since pytest
    passes the hook that same list, or a `global`) is no longer passed silently: the note names it
    with the reason. A real restore Cejel cannot prove is never rated hollow. A hook that rebinds
    `items` to a copy Cejel reads (`items = list(items)`) before its clear keeps the "rebinds items"
    withhold; any other rebinding before the clear is not read.
  - **A wrapped `def` (#634).** A hook whose parameters run onto later lines (black's wrapping, with
    or without a trailing comma) is read as the hook.
  - **Exact paths (#634).** In A1's note, a path holding `, `, `; `, ` (`, a backtick or a double
    quote is written in double quotes, with `\` and `"` escaped; the v27 glossary states the rule.
    The note says how many of the files rated hollow, or hooks not read, that it names beyond the
    eight evidence pointers carry none.

  Measured on 393 synthetic repositories against main: v17 to v26 byte-identical; v27 never above
  v17; the counts are in `leaderboard/RUBRIC_CHANGELOG.md`. No holdout or calibration ran.

- **Prospective v27: B3 credits a check before a publish only where the reader reads a known test
  runner, a lint form that fails on a finding, and an environment and package it admits; safe
  check-then-publish shapes are now read** (#627, #628, #629, #630; the fourth pass on #517's
  check-before-publish reading, with the fifth pass from the review of #640, which this
  supersedes, and the sixth from the review of #645). Under `witan-rubric-v27-prospective-2026-10-19`:
  - *A test script or make target is a check only when it runs a known test runner* (#627). Before,
    an npm, pnpm or yarn test script counted unless it was only `true`, `:`, `echo` or `exit 0`, so
    `/bin/true`, `node -e 0` or `printf ok` passed, and `make test` counted whatever its recipe
    ran. Now the reader follows `npm run` chains, pre and post scripts and make prerequisites, and
    admits the script or target only when it reaches a runner from a fixed vocabulary (jest,
    vitest, mocha, ava, uvu, tap, node --test, pytest, go test, cargo test and others), joined only
    by `&&`, with nothing before it but a check whose configuration is not code. B3's note names
    the script or target when it does not.
  - *The environment on the check's path is read* (#628). Every `env:` key on the check's path
    (the workflow's, its job's, and each step's up to the check) must be one known not to change
    which program runs or what it loads, or a publish credential set from a secret. `NODE_OPTIONS`,
    `PATH`, `PYTHONPATH`, `LD_PRELOAD` and any other key withhold the credit, and so does an earlier
    write to `$GITHUB_PATH`, or of such a key to `$GITHUB_ENV`. The note names the key.
  - *Setup steps refused more broadly than their risk are read* (#629): `pip install -r` of a
    requirements file whose every line names an index package (with optional `--hash`, and includes
    inside the repository), `pipenv install` of a Pipfile and lock that name only index packages,
    and a `prepare` script that is exactly `husky` or `husky install`. A committed yarn release
    (`yarnPath`) stays refused by design: Cejel cannot verify offline what that file runs.
  - *Safe shapes are read* (#630): step items and a `needs:` list written at their key's own indent;
    a `build` script that runs only tsc beside a `tsconfig.json`, before the check (a vite, webpack
    or rollup build still is not, since its configuration is code that runs first); a check and
    publish on one line joined by `&&`; and `.` passed as an argument (`ruff check .`, `mypy .`),
    which is read as the `source` builtin only in command position.
  - *Fifth pass: what the review of #640 found still credited* (six blockers, each now a fixture).
    A requirements line or a name given to `pip install` is admitted only as a PEP 508 project
    name, never one ending in an archive or wheel suffix (`stub.tar.gz`, `stub.zip`,
    `stub-1.0-py3-none-any.whl`) or naming a path in the repository, which pip would install from
    the file. A lint or format command counts only as `ruff check`, `ruff format --check`,
    `black --check`, `eslint`, `mypy` or `flake8`, with only flags known to keep the exit code, so
    `ruff check -e`, `--fix`, `eslint --fix`, `black .` and `ruff format .` no longer count. An
    assignment on the check's own line, or a setup command's, is admitted only for an inert key
    (`NODE_OPTIONS=... npm test`, `PATH=... npm test` and `PYTEST_ADDOPTS=--co pytest` no longer
    count). A job with a `container:`, or a `services:` container that sets `env:`, withholds the
    credit. After an npm-family test script's name only npm's `--silent` and `-s` are admitted, so
    `--node-options`, `--prefix`, `-w`, `--workspaces`, `yarn --cwd` and `pnpm --filter`, which can
    run another package's script, withhold the credit. A make target counts only when it and every
    target on its path are `.PHONY` or have no file or directory of their name in the repository,
    and a Makefile that assigns `PATH` is not read. B3's note names each reason.
  - *Sixth pass: what the review of #645 found still credited* (four blockers and three should-fix
    items, each now a fixture). A command word written as a path (`./ruff`, `bin/pytest`,
    `npx ./jest`, `./make test`) runs that file, not the tool of its name, so it is never a check, a
    test runner, a lint form or a setup step; before, a leading `./` was stripped before the match.
    A make target's name is compared to the repository's paths case-insensitively, as macOS does, so
    `test:` beside `Test/` and a committed `GNUMAKEFILE` withhold the credit. A Makefile that assigns
    any variable credits none of its targets, since make exports a variable the environment also
    sets with the Makefile's value (`HOME := fakehome` with a `.pth` file under it); this also
    excludes a Makefile whose assignments are harmless, a false exclusion by design. A tsc build
    before the check, or tsc before the runner in a test script or recipe, is admitted only when
    every place it writes is a directory that holds no tracked file and is not under
    `node_modules`, and `tsconfig.json` does not `extends` another file. `CI` and `NODE_ENV` are no
    longer inert environment keys (with `CI=false`, jest writes missing snapshots instead of
    failing). Where the credit rests on a lint or format check, B3's note says Cejel does not read
    the tool's configuration.
  - *Seventh pass: a check counts only where the reader follows it to a runner that can fail*
    (#641, #647). Task runners: `just test` counts only where a strict reader of the root justfile
    follows the recipe and its dependencies to a known runner (no settings, assignments,
    interpolation, parameters or shebang recipes; a `-` line is no check), and bare `tox` only where
    a strict reader of the root tox.ini follows every environment's commands to one (listed keys
    only, deps named as index packages, and the project not installed). nox, pre-commit, turbo,
    gradle, mvn and bazel withhold the credit, and B3's note names the runner and that its
    configuration is not read; mvn and gradle are no longer known runners inside a script or
    recipe either. Script aliases: `pdm run`, `hatch run [env:]` and `pipenv run` resolve the name
    through `[tool.pdm.scripts]`, the hatch scripts (with their inheritance and budget) and the
    Pipfile's `[scripts]`; a name that resolves to a script counts only where the script runs a
    known runner, one that resolves to none is the command itself, and anything not resolved (a
    hook, shared options, hatch env-vars or install commands, a committed `.env` under pipenv,
    words after a script's name) withholds the credit. Flags: each known runner and check is
    admitted only with flags from a list known to keep it failing, so `jest --listTests`,
    `pytest --fixtures`, `mocha --dry-run`, `go test -run`, `cargo nextest list`, `vitest list` and
    `jest --onlyChanged` no longer count; the old list of no-fail flags no longer decides. Words
    after npm's `--` (and after a yarn or pnpm test script's name) are read against the runner of
    the test script's last command, so the test script `jest` run with `-- --runInBand` now counts.
    Directories: where a working-directory or a `cd` is set, the root's install-script and
    package-manager readings are unread too, so an install there is no setup step. Python modules:
    `python -m X` counts only where the root, and the directory it runs in, hold no path `X`, `X/`
    or module file of stem `X` (compared case-insensitively), since Python imports from there first.
    Mutation fixtures: for every credit path the pass keeps, a fixture with only the check changed
    so that it cannot fail is excluded. Two were credited and are fixed: `go test -count=0` (a
    flag value can now be refused, and `-count` admits a positive count only), and `hatch run` in
    an environment that installs the project, running its build code first (hatch is now credited
    only where the environment, or default, sets `skip-install = true`, and its other options are
    only a description and index-named dependencies).
    Review of #657: a value flag's value is read only where it does not begin with `-` (so
    `jest -w --listTests` and `npm test -- -w --listTests` no longer count); an `@` argument file
    (pytest 8.2 and later) withholds the credit; a tox.ini with an indented line straight after a
    section header, which configparser reads as a key, is unread; a pdm, Pipfile or hatch table
    with a backslash in a key or table name is unread; `python -m X` also withholds beside a
    repository module named `_X`, any `_`-name, a standard-library or site module, or a declared
    dependency of X (`_pytest/`, `argparse.py`); ctest withholds, since it runs no test without a
    CMake configuration that defines some; hatch.toml beside a pyproject.toml that configures hatch
    leaves hatch unread; and an install at a workspace root, or with a dependency, override or
    resolution that is not an index version range (such as a runner from `file:./stub`), is not a
    setup step.
  - The v27 certificate's glossary sentence for the PR-gate CI count states these conditions as
    what Cejel reads (the sixth pass adds the path, Makefile-assignment and tsc-output conditions;
    the seventh, the justfile, tox and script-alias readings, the flag list and its values, the
    project install under tox or hatch, the module rule, ctest and argument files),
    and says that this is not a proof that the check can fail. #640's wording,
    which said no environment setting could change what the check runs, was not true.

  v17 and every rubric but v27 are unchanged. The measured effect is in
  `leaderboard/RUBRIC_CHANGELOG.md`.

### Fixed

- **The L-versus-2L scaling check could fail on a loaded host, and the pytest run reader had
  stopped being linear (#642).** The check in `scan-path-regex-bounds.test.ts` took its samples at
  L, then at 2L, in wall time, about one read each, so a burst of load on the 2L phase broke its 3.0
  limit (a ratio of 11.33 was seen at load average 12 to 25). It now takes the samples in seven
  alternating pairs, times each in the process's CPU time, and fills each sample to at least 80 ms.
  Two stand-in readers pin it: one whose work grows with the square is refused, a linear one is
  admitted. The limit stays 3.0. Timed in CPU time, the pytest run reader took 3.4 to 3.6 times as
  long at 2L as at L on a quiet host since #648, against 2.1 before. It joined every command's words
  into one string whether or not it recorded the command, so its garbage grew faster than its input.
  It now joins them only where it records an invocation, and is back to 2.1. Under 30 busy
  processes on an 18-core host (load average 16 to 40), the check passed three runs in a row; the
  previous version failed two of three. No score, report or certificate changes.

- **The v27 scan timing guard on long CI lines failed on main and stopped the 0.6.9 npm publish.**
  The guard "CI lines and a conftest whitespace run just under the content limit" times a v27 scan
  of six workflow lines of about 480 KB and a conftest.py hook with a long whitespace run, against
  a 2,000 ms budget. Since the v27 A1 change in #626 it measured 2,063 to 2,165 ms on GitHub's
  runners on every push to main, and it failed the verify step of the 0.6.9 npm publish before
  the publish step ran. The cost was not the whitespace run: the hook reader takes about 0.1 ms on
  it. It was #626's reader of the pytest commands CI runs, which splits each workflow line into
  shell words, and the word scanner it shares with the other readers tested each character with a
  regular expression and appended it to the word one at a time. The scanner now compares the
  character code with exactly the characters that regular expression matched, and copies the
  characters it keeps a run at a time. Locally the v27 scan of the guard's repository fell from
  650 ms to 520 ms (median of five; 555 ms before #626). The budget is unchanged. A new check
  times the two v27 A1 readers this guard exercises on their own, at a length L and at 2L, and
  fails on a ratio above 3, so a reader that grows faster than linearly fails there before it
  reaches the whole-scan budget. No report, score, note or fingerprint changes under any rubric.

## [0.6.9] — 2026-11-02

v17 remains the default rubric. The prospective v27 rubric stays opt-in, by `--rubric-pin` or the
Action's new `rubric-pin` input, and carries no precision or recall claim; the v27 changes below
apply only when it is pinned. The fixes marked "every rubric" apply to the default too; each one's
measured effect is in `leaderboard/RUBRIC_CHANGELOG.md`.

### Added

- **GitHub Action: an optional `rubric-pin` input.** A workflow that runs Cejel through the Action
  can now opt in to a non-default rubric, for example `witan-rubric-v27-prospective-2026-10-19`,
  with the same value the CLI takes as `--rubric-pin`. Both the root and the nested `action/`
  manifests carry it, default empty. The Action forwards `--rubric-pin` only when the input is
  non-empty, so an empty or absent input leaves the CLI invocation, the report and every output as
  they were. The CLI's own check validates the value; an unknown id fails the step with its message.
  A prospective pin carries no precision or recall claim. v17 remains the default. When pinning
  v27, check out with `fetch-depth: 0`: v27 reads the commit history, so a shallow checkout gets no full
  v27 result, and the Action stays offline and fetches nothing.

### Changed

- **Prospective v27: B3 counts a publishing workflow with no pull-request trigger only when a failed
  check really stops every publish** (operator ruling of 1 Nov on #517; supersedes #620). Under
  `witan-rubric-v27-prospective-2026-10-19`, a workflow that publishes, releases or deploys on every
  push is counted as CI verification again when a test, lint, type-check or verifying-build command
  runs before every publish step, in the publishing job or in a job it needs. It is not counted when
  an `if:` uses a status-check function other than a plain `success()` (so `success() || true`,
  `!failure() || ...`, `always() && ...` and `!cancelled()` all leave the publish free to run after a
  failed check); when the "check" is a `run:` under `with:` or `env:`, a `--version` or `--help`
  call, or an npm, pnpm or yarn test script that is empty or only `true`, `:`, `echo` or `exit 0`;
  when its failure does not end the step (`; true`, a pipe without `set -o pipefail`, a background
  `&`); when a job needs itself or is in a `needs` cycle; when a step cannot be read; or when a job
  runs neither after a needed check nor after its own check with only setup steps before it. A third
  pass, after an adversarial review of #625, also refuses: a backslash on any line YAML reads (so a
  double-quoted escape such as `"\u0061lways()"` or `"BASH\u005fENV"` cannot spell what the reader
  refuses); outside step items, a key or value not written plainly (a quoted key, a space before a
  colon, a merge key, a flow mapping such as `defaults: { run: { shell: "bash {0}" } }`, an anchor,
  alias or tag, a continued scalar), which could set a shell, runner or `continue-on-error` the line
  readers miss; a pipefail pipeline whose other side backgrounds it or puts it in an `&&` list;
  anything but setup commands or a stricter `set` before the check in its step (`set -n`,
  `set -o noexec`, `hash -p`); an npm, yarn or pnpm setting that names a script shell, node options
  or a yarn path, a committed pnpmfile or yarn plugin, or a workflow naming a script shell (no
  npm-family command is then a check or setup); an install before the check that runs a root
  package.json install script, builds a root `binding.gyp`, or installs the project or a path
  (`pip install -e .`, `pip install .[test]`, `npm install ./path`, `uv sync`, `poetry install` and
  `pdm install` without their no-project flags); and a check given `--collect-only`, `--co`,
  `--passWithNoTests`, `--showConfig`, `--no-error-on-unmatched-pattern` or `--exit-zero`. Two
  release workflows counted by the second pass are excluded by it, since each runs
  `pip install -e .` before pytest. B3's
  note names every counted publishing workflow or counts the rest in its closing sentence. Only a v27
  certificate words the PR-gate CI glossary entry for this; v17, the default, and every other rubric
  are unchanged, certificate text included. No holdout or calibration ran for it, and it carries no
  precision or recall claim. The record is in `leaderboard/RUBRIC_CHANGELOG.md` (2026-11-01, B3).

- **Prospective v27: A1 names every file it rates hollow, and withholds a rule only on evidence,
  saying so each time.** Under `witan-rubric-v27-prospective-2026-10-19` only. A1's note and
  evidence name each file the conftest, run-wide skip and every-test-skipped rules rate hollow,
  with the rule, and `test_to_source_ratio` counts a `conftest.py` as test surface, as v17 does.
  A rule is withheld only on evidence that pytest would not do what it assumes: a collection hook
  that empties `items` only where, after its last clear and at its own top level, the same hook
  puts them back in a shape the reader understands (`extend`, `+=`, a slice assignment, `append`,
  `insert` or a loop of them, on the list or a name bound to it, from a source not known to be
  empty, such as a copy taken after the clear, or a same-file helper that adds to the list it is
  given, at its own top level before any branch or exit and without rebinding its source, from a
  copy of the list saved before the clear, and is not a generator); copying, reporting, iterating,
  a builtin, a logger, an unknown helper or an unknown method no longer cancels it, so the common
  deselect-everything hook is caught again. A pytest setting withholds a rule for a file only
  where it is in force for a pytest run that collects the file: the plain `pytest` at the root,
  or a command that starts with pytest in CI (with GitHub Actions' working-directory, env and
  `if: false`), a reached Makefile or justfile target, or a running tox environment's commands,
  each set up as pytest 9.2.0 does (the first configuration file in pytest's order walking up
  from the run's paths, so a shadowed file or one no run reaches does not count; its root,
  confcutdir, collected files and flags). Not in a comment, an `echo` argument, a heredoc or
  another section, and not at a value that leaves pytest's default reading. `--noconftest`, or a
  confcutdir strictly below the hook's directory (from `--confcutdir`, the configuration file or
  the root), withholds the hook for the files that run collects. Every withhold is said in A1's
  note ("<rule> not applied: <reason>"). v17, the default, and every other rubric are unchanged; v27 never scores A1 above
  v17 on the same commit. No precision or recall claim; no holdout or calibration ran.

- **Prospective v27: a shallow clone gets no composite score and no verdict** (operator ruling of
  1 Nov). Under `witan-rubric-v27-prospective-2026-10-19` a scan of a shallow clone abstains
  (`insufficient_source`, null headline scores) and says what to do: run `git fetch --unshallow`
  (or check out with full history, for example `fetch-depth: 0` in `actions/checkout`), then scan
  again. Each criterion is still read and shown. With `--min-score` the scan fails, as any
  abstention does. This replaces 0.7.0-rc.1's treatment, which left A2's shallow-clone abstention
  out of the composite and capped the verdict (`verdictCap`); the composite could then fall below,
  or rise above, the same commit's full-clone composite. No build writes `verdictCap` any more; a
  report that carries it still verifies. v17, the default, and every other rubric are unchanged, as
  is v27 on a full clone. The measurement is in `leaderboard/RUBRIC_CHANGELOG.md` (2026-11-01).
  Where git cannot report the depth (git missing from PATH, or unable to open the repository), v27
  reads it from the repository's `.git` files, and where those do not settle it either, abstains
  the same way with reason `history_depth_unknown`, instead of scoring the checkout as a complete
  clone. The certificates, `summary.json` and the badge label these abstentions "Unrated: shallow
  clone" and "Unrated: history depth unknown", not "Insufficient source", and the `--min-score`
  failure message carries the instruction to fetch the history.

- **Prospective v27: B2 and B3 stop crediting CI workflows not shown to run a check (#527, #535).**
  This meets condition 3 of the accepted ruling on #526 through its no-check half. On 2026-10-22
  the operator ruled the branch half out of condition 3 ("yes to both recommendations", recorded on
  #526 and #535). The two recommendations were this #535 branch half and extending the ADR-0001
  read-failure ruling to #556's abstention (#560). Under
  `witan-rubric-v27-prospective-2026-10-19` only, two kinds of workflow earn no B2 PR-trace credit
  and count toward neither B3 depth metric: one whose every step only checks out, prints or does
  nothing, and one that only uploads an already-built artifact.
  - One predicate decides this for both criteria. It is built from the existing allowlist readers
    (`isPublishOnlyWorkflow`, `isPrintOnlyWorkflow`), which admit a workflow only when every line
    fits their grammar, every job's `runs-on` is a documented GitHub-hosted Ubuntu or macOS label
    (an exact list), every step is on their allowlist, and command arguments use only characters
    inert in every shell. Anything else keeps the credit.
  - The certificate lists the uncredited workflows under "What was not established". B2's component
    reads "credited CI workflow", so a zero never reads as "missing: CI workflow". No sentence says
    a workflow runs no check.
  - The publish-only reader also admits only each publisher's known flags, globs only in file
    operands after a directory, credential environment variables from an allowlist, and no
    committed Cargo, rustup, Poetry or uv configuration. Each of these gaps already existed in
    0.6.8's v27 B3 (#553).
  - This change moves 43 fixture rows: 17 to below v17's value and 26 back to exactly v17's value.
    No fixture is above v17. No public row moves (informal, not a preregistered run).
  - v17's scores, statuses, metrics and fingerprint do not move. v17 `report.json` is byte-identical
    apart from the #564 fix below. v17 certificates (Markdown, HTML, terminal) change on every
    repository, because the "PR trace basic checks" and "PR-gate CI workflow count" glossary entries
    now describe v27's rule. v18-v26 rest on gating and their unchanged fingerprints.
  - v27's behaviour fingerprint moves to
    `sha256:6e03aa1bf63a31c5ec58a68cb49fb8ef571ba233cf79059a311ec55aecea5bb3`. That fingerprint plus
    the merge commit, recorded after merge (#563), is a new v27 candidate.
  - The branch half of #535 (a workflow confined to a branch the repository may not have) is not
    changed. Branch state is not a function of the attested revision, and the operator ruled it out
    of condition 3. The measurement behind that is in `leaderboard/RUBRIC_CHANGELOG.md`
    (2026-10-22). The default stays v17.

### Fixed

- **GitHub Action: a v27 scan of a shallow checkout failed the step.** With `rubric-pin` set to
  v27 on a shallow checkout, the CLI abstains and labels the summary "Unrated: shallow clone" (or
  "Unrated: history depth unknown"). The Action recognised only "Insufficient source" and
  "Insufficient evidence" as abstentions, so it treated the summary as scored, stopped on its
  missing scores, and exited 1. It now recognises all four labels, writes "no composite score and
  no verdict" in the step summary for the two Unrated ones, and leaves the `score` output empty as
  for any abstention. The `verdict` output's description lists the new labels. A test now fails
  whenever the Action's labels and the CLI's differ.

- **A2's batched re-read of a large history had no overall time bound (#586).** Under every
  rubric, a whole-history read that stops at Cejel's own 8 MiB output limit or 30-second timeout is
  re-read over the commit list in pages and batches (#567). Each git call already stopped at
  30 seconds, but a batch that timed out was halved and retried, so on a slow host a re-read could
  take many times longer than the single read it replaced. Each re-read now has a time budget,
  `HISTORY_FALLBACK_TIME_BUDGET_MS`, 120 seconds by default. When it is spent the re-read stops and
  the read is declared incomplete through the same path as a read stopped at Cejel's own limit:
  a scan limitation under every rubric ("... stopped at Cejel's 120-second time budget for
  re-reading history in batches. Cejel continued with reduced Git history evidence."), so the v17
  badge is unrated and `--min-score` refuses; under `witan-rubric-v27-prospective-2026-10-19`, A2
  treats it as a failed read (ADR-0001) and, as for any failed read, abstains unless a critical
  finding was already confirmed. What was read is kept but never presented as the whole history.
  The re-scan advice counts the budget, like the timeout, as depending on the machine and its
  load. A read that hits no limit never starts a re-read and is unchanged.
  - **Worst case:** the budget is checked before each git call of a re-read, so a re-read can
    overrun it by one in-flight call (at most 30 s): at most about 150 s per re-read. A scan has
    three re-reads (the tree enumeration, the deleted-path log and the `.env`-path log), each
    after its own failed one-shot attempt (at most 30 s, or 60 s for the tree enumeration's
    `rev-list` and `diff-tree`). The tests pin three re-reads per scan.
  - **Label (review follow-up):** a spent budget is named after the git read that found it spent,
    as that read is named when it stops at Cejel's other limits. During the tree enumeration's
    rev-list paging that is "history revision enumeration", not "history tree enumeration". The
    wording appears only when a budget is spent, and #592's preregistered result (`1886d9987`)
    shows no public row reaches the budget, so all 23 reports are unaffected. This label change
    was not separately measured.
  - **Budget value:** 120 s per re-read, a default the operator can change. It is about 50 times the
    slowest re-read measured on the public rows: about 2.5 s on biomejs and 1.4 s on react, by
    replaying the re-read's git calls on their verified full-history clones, on one host. It is
    four times the per-call timeout.
  - **Public effect:** a preregistered paired public delta on the 23 public rows found every report
    byte-identical under v17 and under `witan-rubric-v27-prospective-2026-10-19`: preregistration
    `fa4fc0a7b` (baseline `d175e210a`, candidate `62924091c`), result `1886d9987`, E0-E3 held
    (`docs/experiments/public-delta-586-fallback-budget-2026-10-23/`). No behaviour fingerprint
    moves; the fingerprint test passes with its pins.
  - **Where the budget's behaviour is shown:** in tests, with a test clock
    (`src/witan/__tests__/a2-history-fallback-budget-586.test.ts`), not on any public row.
- **The print-only workflow reader assumed bash (#564, every rubric).** It admitted any runner and
  judged `echo`/`printf` arguments by a bash metacharacter blocklist. On a Windows runner, pwsh runs
  `echo @{suite=./run-tests.ps1}` by evaluating the hashtable, which runs the repository's script.
  Even so, the #540 disclosure called the workflow "only prints text" under the default rubric. Now
  both the print-only and the publish-only readers claim only when every job's `runs-on` is a
  documented GitHub-hosted Ubuntu or macOS label, and arguments come from a character allowlist inert
  in every shell. Outside v27 the only effect is in `report.json` and on its certificate: a repository whose workflow the
  old reader alone called print-only loses that false disclosure. No score, status, metric or
  fingerprint moves. Fixtures `review10-*` and `review11-*` pin it.
- **A2 lost history evidence on large repositories at Cejel's own output limit (#567).** Under every
  rubric, A2's whole-history reads (`rev-list HEAD`, the tree enumeration, the `.env`-path log and
  the deleted-path log) each buffered their whole output under an 8 MiB limit. On a large complete
  history (biomejs and react among the public rows) a read stopped there, the rest of the history
  went unread, and the failure went into `scanLimitations`. Such a read is now re-run over the
  commit list in pages and batches small enough for the limit and the 30-second timeout, halving a
  batch that still hits one; only a single commit that still does is reported. A read that does
  not hit a limit runs exactly as before. **This changes v17 reports.** A preregistered paired
  public delta on the 23 public rows, run on the code that will merge, recorded these report
  changes: third preregistration `db2a09f2a` (baseline `fd64796c7`, candidate `ef08a9770`), result
  `2df444c35`, E0-E3 held (`docs/experiments/public-delta-567-paging-merged-2026-10-23/`).
  - The history scan limitations of biomejs and react disappear.
  - react's A2 gains an info finding (a non-template `.env` file tracked in history, no
    secret-shaped value). Its score does not change.
  - Under `witan-rubric-v27-prospective-2026-10-19`, biomejs's A2 no longer abstains (overall 2.5
    to 3.0).

  Under the v17 gating rule, the emptied scan limitations make the v17 badges of biomejs and react
  rated, and `--min-score` applies to them. The badge text "3.0/4.0 conditional" comes
  from the earlier informal measurement, not from the preregistered run.

  Two earlier runs are disclosed there. The original plan's scoring at its pins was set aside
  unused. The successor's result (`6adf3a398`, candidate `5b154064a`) also held every expected
  value, but measured the code before #571 merged; for the merged code it is superseded.

  Against `main` at `fd64796c7`, the code that will merge differs from this run's candidate,
  `ef08a9770`, only outside the scan path:
  - the third preregistration and its result;
  - this entry and its `leaderboard/RUBRIC_CHANGELOG.md` entry (2026-10-22, #567);
  - one test in `a2-history-paging-567.test.ts`, checking that batched reads word #571's
    control-character limitation as the one-shot reads do;
  - two lesson seeds.
- **A scan limitation called any path with control characters "credential-shaped" (#569).** Under
  every rubric, a path in git history whose name contains control characters is left unread, and
  the scan limitation said "Git history contained a credential-shaped pathname with control
  characters" whatever the path was. On the public row axios the only such path is
  `\bMIGRATION_GUIDE.md`, which is not credential-shaped. That sentence is now kept for a path whose
  name is credential-shaped under the rubric's own history grammar, wherever it sits (under
  `witan-rubric-v23-prospective` that includes key-shaped JSON such as `service-account.json`), or
  an `.env`-shaped path; any other such path gets "Git history contained a pathname with control
  characters that is not credential-shaped. Cejel did not read that path in its history scans."
  Both are scan limitations, so a report with either is gated as before (an unrated v17 badge, and
  `--min-score` refuses). No score moves under any rubric. On the 23 public rows under v17, v23 and
  v27, only axios's `report.json` changes, in that one line (informal measurement; digests in
  `docs/experiments/limitation-wording-569-2026-10-22/byte-identity.json`).
- **Incomplete history could take A2 out of the score, or score it higher (#556).** A2 reads
  earlier commits for `.env` files and credential-shaped values, and is marked not applicable only
  when that finds nothing and the tree holds no secrets or data surface. On a shallow clone those
  reads see only the commits present. On a partial clone (`--filter=blob:none` or `tree:0`), or
  when a git read fails, times out or exceeds its output limit, a read that did not complete was
  treated as finding nothing. So a repository whose only A2 surface was a secret-bearing `.env`,
  committed and later deleted, was marked not applicable (shallow, treeless) or scored a warning
  instead of critical (blobless), and the score rose. A history secret scan that stopped at its
  own cap of 5,000 historical files with nothing found was treated the same way.
  - **Every rubric, including the default (presentation only).** When A2 is not applicable after
    an incomplete read of the commit history, it now says so in `criteria[].disclosures` (report
    format 1.8, no new field), and the certificate lists it under "What was not established": "A2's
    applicability was decided from an incomplete read of the commit history: [each cause Cejel
    detected]. [...]", ending with the advice each cause admits: re-scan a full clone (shallow), a
    full, unfiltered clone (a missing object or git error), a host where git is installed (git
    could not be run), or none, because a re-scan of the same repository will not lift Cejel's own
    output limits, the scan's cap or its rule on control characters in paths; for the 30-second
    timeout, which depends on the machine and its load, a re-scan may not lift it. Under v17 and
    v18-v26 no score, status, metric value, finding count or fingerprint moves.
  - **`witan-rubric-v27-prospective-2026-10-19` (scoring).** When the clone is shallow, any of
    A2's history reads failed or stopped at one of Cejel's own limits, or the history secret scan
    stopped at its 5,000-file cap, A2 abstains unless a confirmed critical finding stands, on the
    not-applicable and scoring paths alike, as a read failure kept in the composite at 0.
    Composites can only fall. v27's shallow-clone sentence in `historyLimitations` no longer says
    that a not-applicable criterion stays not applicable, and states exactly which abstentions
    count as 0. v0.6.8, released at `74b3af581`, predates this change: its v27 certificates of
    such clones report A2 not applicable or a warning. No behaviour fingerprint moves, because the behaviour
    corpus has no such clone. On a complete clone whose history reads complete, nothing changes
    under any rubric. A complete clone can still fail a history read: re-scoring the 0.6.8
    confirmation's 23 full-history clones (informally, not a preregistered run) leaves every v17
    report byte-identical and moves one v27 row, biomejs, whose history reads exceed Cejel's own
    8 MiB output limit (A2 verified 3.2 to an abstention at 0, overall 3.0 to 2.5). Streaming those
    reads is tracked in #567. No row hits the 5,000-file cap. The v17 board does not move. Counting
    Cejel's own limits and the cap this way is the operator's decision of 2026-10-22 (reply "1",
    recorded on #526 and in ADR-0001). See
    [`leaderboard/RUBRIC_CHANGELOG.md`](./leaderboard/RUBRIC_CHANGELOG.md) (2026-10-22).
  - **Two more incomplete reads (#560 review).** A2 now also counts as incomplete a history read
    in which git itself could not be run while a `.git` entry is visible from the scanned path
    (#568; before, every read reported "no repository" and A2 could be marked not applicable over
    a deleted secret, with nothing said), and a credential- or `.env`-shaped path in history left
    unread because its name contains control characters (before, a value kept under such a name
    never reached the scan). Under v27 A2 abstains at 0 in both cases; under every other rubric A2
    keeps its scoring and, where it is not applicable, says so. Neither adds a scan limitation.
    Counting both as read failures is the operator's third decision of 2026-10-22 ("for adr-0001
    add them", recorded on #526 and in ADR-0001). A third cause is counted the same way: a `.git`
    entry git cannot open as a repository (a copied worktree or submodule whose gitdir is gone);
    the operator confirmed that one on 2026-10-23 (recorded on #526 and in ADR-0001). For both
    `.git` causes a `.git` entry counts only as a directory holding `HEAD` or a file with a
    `gitdir:` line, so a stray empty `.git` directory in a parent changes nothing; a `.git`
    directory Cejel cannot read, and a `.git` symbolic link whose target is gone, both count (under
    v17 they now get the disclosure where A2 is not applicable; under v27 A2 abstains). Where no
    history read could succeed, the note and disclosure say only that Cejel read none of the
    history.
- **A file name could decide how a failed git read was classified (#560 review).** Under every
  rubric, Cejel classified a failed git command from text that included Node's error message,
  which repeats the whole command line, and A2's history reads put repository paths on that line
  (`git show <commit>:<path>`). On a blobless clone, a deleted secret in a file named, for example,
  `secrets/not a git repository.txt` made its failed read look like "no repository here", which
  Cejel does not report: no scan limitation, no abstention, and A2 not applicable above the
  complete clone's critical finding. A name containing "timeout" or "maxBuffer" made the same
  failure read as one of Cejel's own limits. Classification now uses only Node's error code and
  git's own "no repository" messages, each matched from the start of a line (every form of
  git's "not a git repository" message, and the others exactly), so a path git prints after
  another message (quoted, or unquoted as in "fatal: bad object <commit>:<path>") cannot match; a bare SIGTERM is no longer called a timeout. **This can change a
  v17 report:** where such a read failed, the failure now appears in `scanLimitations`, which leaves
  the v17 badge unrated and makes `--min-score` refuse, and a limitation that named a timeout or
  output limit because of a path now says the read failed. On the 23 public rows nothing changes
  (see `leaderboard/RUBRIC_CHANGELOG.md`, 2026-10-22).
- **A submodule at a credential-shaped path counted as a failed history read (#560 review).**
  Under every rubric, A2's history secret scan tried to read a submodule entry (a gitlink) at a
  path such as `config/secrets` as a file. A gitlink has no content in the repository, so the read
  always failed and was reported as "historical blob read failed"; since #560 it also made v27's
  A2 abstain and the other rubrics disclose an incomplete read, on a complete clone. A gitlink is
  now recognised and skipped. **This can change a v17 report:** for such a repository the
  "historical blob read failed" scan limitation disappears, and if it was the only one, the v17
  badge becomes rated and `--min-score` applies. The same holds for a deleted file whose name looks
  like pathspec magic (for example `:(exclude)secrets`): its history is now looked up literally,
  so it no longer matches other paths' commits and fails their reads.
- **A `.git` entry git cannot open left A2's history unread without saying so (#560 review).** A
  copied worktree or submodule whose gitdir is gone makes git report "not a git repository" even
  though a `.git` entry is present. The scan completes as before, as a directory with no repository
  (an intermediate version of this change failed it). A2 now counts its history as unread there:
  under v27 it abstains at 0, and under every other rubric it says so where it is not applicable.
  A repository git can open whose branch has no commits yet is unchanged.

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
