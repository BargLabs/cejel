// The Quant evidence-contract v1 freeze byte-pins the shared generic schema barrel, so the
// v9 named constant cannot be added to that barrel without invalidating an unrelated frozen
// commercial artifact. Keep the historical identifier local to the free-core implementation;
// unlike the mutable WITAN_RUBRIC_VERSION alias, this remains stable when v10 becomes current.
export const WITAN_RUBRIC_VERSION_V9 = 'witan-rubric-v9-2026-07-22';

// V10 remains explicit as a historical/prospective identifier; the mutable public default is
// promoted independently only after an authenticated untouched holdout clears every gate.
export const WITAN_RUBRIC_VERSION_V10 = 'witan-rubric-v10-2026-07-23';

// Prospective free-core v39 rubric. The public default was unchanged until an authenticated
// untouched holdout cleared every preregistered gate.
export const WITAN_RUBRIC_VERSION_V11 = 'witan-rubric-v11-2026-07-23';

// Prospective free-core v41 rubric. V12 inherits v11 detector/scoring behavior and adds only
// failure-derived review-control integrity changes.
export const WITAN_RUBRIC_VERSION_V12 = 'witan-rubric-v12-2026-07-23';

// Prospective free-core v43 rubric. V13 inherits v12 finding and criterion behavior, then adds
// only the failure-derived source-representativeness closure.
export const WITAN_RUBRIC_VERSION_V13 = 'witan-rubric-v13-2026-07-23';

// Prospective free-core v45 rubric. V14 inherits v13 detector/scoring behavior and adds only
// the failure-derived semantic/path-role source-representativeness closure.
export const WITAN_RUBRIC_VERSION_V14 = 'witan-rubric-v14-2026-07-23';

// Prospective free-core v47 rubric. V15 inherits v14 criterion and abstention behavior, then
// adds only the failure-derived finding-precision and control-evidence integrity closure.
export const WITAN_RUBRIC_VERSION_V15 = 'witan-rubric-v15-2026-07-24';

// Prospective free-core v48 rubric. V16 inherits the complete v15 detector and classifier
// closure, then adds only the failure-derived zero-measurement abstention.
export const WITAN_RUBRIC_VERSION_V16 = 'witan-rubric-v16-2026-07-24';

// Free-core v50 rubric. V17 inherits the complete v16 detector/scoring closure, then adds only
// the failure-derived reviewable-source proof, authenticated A1 absence measurement, and
// narrowly bounded post-signal structural rescue. It is the public default after the v50
// untouched holdout cleared every preregistered gate.
// Operator ruling of 2 Nov 2026 (ADR-0001; goal_cejel_v17_unread_history_no_verdict_2026-11-02):
// v17 now withholds the composite and the verdict when Cejel could not read the commit history,
// as v27 has since the ruling of 1 Nov. A shallow clone, a checkout whose history depth neither git
// nor the .git files settle, and a directory that is not a git repository each abstain (verdict
// insufficient_source, labelled "Unrated: shallow clone", "Unrated: history depth unknown" or
// "Unrated: no git history"), with the instruction to fetch the history; each criterion is still
// read and shown, and A2 abstains there unless a confirmed critical finding stands on what was
// read. v17's weights, bands, criteria and calibration are untouched, and a complete clone is
// scored exactly as before, byte for byte: v17 was calibrated on full-history clones. #517-#520
// stay v27-only.
export const WITAN_RUBRIC_VERSION_V17 = 'witan-rubric-v17-2026-07-24';

// Prospective free-core v51 rubric. V18 inherits the complete, holdout-calibrated v17
// detector/scoring closure and changes only D7 multi-tenancy evidence: positive isolation
// credit is derived from each repository's own CREATE POLICY USING/WITH CHECK clauses.
// The shared/public default remains v17 until a fresh authenticated untouched holdout clears
// every gate; callers must opt in explicitly.
export const WITAN_RUBRIC_VERSION_V18 = 'witan-rubric-v18-prospective-2026-07-25';

// Prospective B4 determinism correction. V19 inherits v18 and changes only audit-freshness
// year selection: the scanned HEAD commit's committer year replaces scan wall clock. It remains
// explicit-only until a separately preregistered authenticated untouched holdout permits default
// promotion.
export const WITAN_RUBRIC_VERSION_V19 = 'witan-rubric-v19-prospective-2026-08-09';

// Prospective A3 explicit-gap closure. V20 inherits v19 detector/scoring behavior and adds
// only narrowly worded, path-anchored findings for directly observable production-readiness
// omissions. The public default remains v17; callers must opt in explicitly.
export const WITAN_RUBRIC_VERSION_V20 = 'witan-rubric-v20-prospective-2026-08-10';

// Prospective B6 executed-escalation closure. V21 inherits v20 and adds only bounded
// recognition of administrative SQL contained in authored migration files or executed by
// direct database-driver string literals. The public default remains v17.
export const WITAN_RUBRIC_VERSION_V21 = 'witan-rubric-v21-prospective-2026-08-10';

// Prospective A3 package-start entrypoint closure. V22 inherits v21 and adds only bounded
// recognition of direct Node HTTP entrypoints whose authored file is named by a simple root
// package start command. The public default remains v17.
export const WITAN_RUBRIC_VERSION_V22 = 'witan-rubric-v22-prospective-2026-08-10';

// Prospective free-core v23 rubric. V23 inherits v22 detector/scoring behavior and adds four
// v23-specific mechanisms, gated in src/witan/repo-signals.ts on WITAN_RUBRIC_VERSION_V23 alone
// (not part of the v18-v22 inheritance chains): (1) bounded recognition of coverage-capable
// test-runner flags on commands reachable from a test entry point. Since 2026-10-14
// (goal_cejel_v26_coverage_config_recognition_2026-10-14) that recognition and its
// unresolved-reachability abstention are no longer v23-only: they ship under every selectable
// rubric as a recognition fix, added to the v17 heuristics there. What stays v23-only
// (`usesV23StrictCoverageAndRecipeRunners`) is the part that could assert a finding rather than
// withdraw one: v23 replaces those heuristics instead of adding to them, and counts a Make/just
// `test:` recipe as a configured test runner. Extending it changed nothing under v23; the
// documented coverage locations and runner flags added the same day apply to v23 as to every
// rubric; (2) recognition of PEM-formatted private-key assignments as a dedicated secret grammar
// (`usesV23PemPrivateKeyGrammar`); (3) per-signal, rather than whole-criterion, abstention
// when repository content can't be read — a semantics change to what a non-finding means, not a
// detector addition; and (4) withheld-path abstention (`usesV23WithheldPathAbstention`): a file
// the repository walk removed from the scanned file list — over the content size limit, not a
// regular file, unreadable, or hard-excluded — can abstain a signal whose own file-selection test
// would have admitted it, instead of that signal reporting a plain absence. Mechanism 4 depends
// on mechanism 3 and is therefore not inheritable: without per-signal abstention it would wipe a
// whole criterion. Like (3), it changes what a non-finding means rather than adding a detector.
// The public default remains v17.
export const WITAN_RUBRIC_VERSION_V23 = 'witan-rubric-v23-prospective-2026-09-06';

// Prospective A2 secret-posture content-context rubric. V24 inherits the complete v22
// detector/scoring closure and adds one v24-specific mechanism, gated in src/witan/repo-signals.ts
// on WITAN_RUBRIC_VERSION_V24 alone: A2's current-tree secret scan stops deciding "is this a real
// credential?" from the file's path and decides it from the value and a bounded window of its own
// file's text. Concretely (a) the path-based non-production credential exemptions
// (V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN, V47_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN) no
// longer remove a file from that scan, so a real credential committed under docs/ is reachable,
// and (b) every secret-shaped match is classified into exactly one of three outcomes — placeholder
// (no finding), confident real (flags at the unchanged v22 bar, severity and evidence), or
// ambiguous (abstains the `secret_cleanliness` metric with a stated reason instead of reporting a
// silent pass). Git history secret scanning, A2's data-layer/RLS detection and .env-presence
// evidence, and every other criterion are unchanged.
//
// V24 deliberately inherits v22, NOT v23. V23's own declaration above records its four mechanisms
// as gated on WITAN_RUBRIC_VERSION_V23 alone and mechanism 4 as not inheritable; inheriting them
// here would both contradict that declaration and confound a v22→v24 paired delta with four
// unrelated changes. A caller who wants only the secrets-posture classification pins v24; a caller
// who wants v23's mechanisms pins v23. The public default remains v17; callers must opt in
// explicitly.
export const WITAN_RUBRIC_VERSION_V24 = 'witan-rubric-v24-prospective-2026-09-15';

// Prospective A3 inline health-route rubric. V25 inherits the complete v22 detector/scoring
// closure and adds one v25-specific mechanism, gated in src/witan/repo-signals.ts on
// WITAN_RUBRIC_VERSION_V25 alone: the `prod_readiness_primitives` "health or readiness signal"
// component also credits a route matched by V20_HEALTH_OR_READINESS_ROUTE_PATTERN, declared
// inline in an application file that passes `healthReadinessRouteReads` (the file-selection test
// the info-severity `health_readiness_route` finding already uses, with every negative case it
// guards: outbound URLs, tests, README, query strings, commented-out routes). Under every other
// rubric that component stays filename-only by design — a dedicated health/readiness file, a
// Dockerfile HEALTHCHECK, or Kubernetes probes — so a route declared inline in an app file earns
// nothing there, and v17 (the public default) stays byte-stable.
//
// V25 deliberately inherits v22, NOT v23 or v24, for the reason V24's declaration gives: v23's
// mechanisms are declared v23-specific and v24's is A2-only, and inheriting either would confound
// a v22→v25 paired delta with unrelated changes. This is batched into its own rubric rather than
// shipped alone because the next calibration should take it together with other recognition
// changes, so it is calibrated once. The public default remains v17; callers must opt in
// explicitly. This declaration carries no precision or recall claim, and the public paired
// rescore has not run.
export const WITAN_RUBRIC_VERSION_V25 = 'witan-rubric-v25-prospective-2026-10-12';

// Prospective v26 calibration-candidate rubric. V26 inherits v25's complete closure: the v22
// chain (every v17-v22 inheritance gate in src/witan/repo-signals.ts and src/witan/scoring.ts)
// plus v25's inline health route, the one v25-specific gate (`usesV25InlineHealthRoute`), which
// is true for V25 and V26 and for no other rubric.
// It is the next calibration candidate V25's declaration anticipates. Recognition fixes
// that remove a false
// absence ship under every selectable rubric with no identifier bump, as #459, #427 and #430 did,
// so v26 carries them through the closure it inherits rather than through gates of its own.
//
// V26 adds a change of its own, item 6, gated in src/witan/repo-signals.ts on
// WITAN_RUBRIC_VERSION_V26 alone (`usesV26SettlingEvidence`) and specified by the operator-signed
// ruling docs/calibration/v26/ruling-item-6.md. It is definitional: A5's "no dedicated claim-reality
// reconciliation artifact" finding fires only when the repository itself names a
// claim-reconciliation artifact that is absent, and A2's tenant-without-RLS finding fires only when
// row-level security is the repository's own mechanism and an identifiable tenant table has none.
// Otherwise each abstains: no finding, and the ruling's sentence in the certificate's "What was not
// established". Amendment 1 (docs/calibration/v26/ruling-item-6-amendment-1.md, also
// operator-signed) omits A5's reconciliation_artifact_depth when no Cejel-format artifact is
// present and none is named; every other metric is unchanged.
//
// V26 adds a second change of its own, item 8, gated in src/witan/repo-signals.ts on
// WITAN_RUBRIC_VERSION_V26 alone (`usesV26BuildStepEvidence`) and specified by the operator-signed
// ruling docs/calibration/v26/ruling-item-8.md. A3's "declares neither a build nor a typecheck
// script" finding fires only when the package has authored TypeScript or a tsconfig, no compiler,
// type checker or bundler from a fixed vocabulary runs in any package script, CI `run`, Dockerfile
// `RUN` or Makefile/justfile target read, and every such place was read. Where a place went unread
// it abstains with the ruling's sentence in "What was not established". No metric changes.
// v26-v25-parity.test.ts measures v26 against v25 with only these two differences.
//
// V26 does NOT inherit v23 or v24. Their mechanisms stay gated on WITAN_RUBRIC_VERSION_V23 and
// WITAN_RUBRIC_VERSION_V24 alone, for the reason V24's and V25's declarations give; a v23
// mechanism that should apply more widely is extended by its own change.
// The public default remains v17; callers must opt in explicitly. This declaration carries
// no precision or recall claim, and no public paired rescore has run.
export const WITAN_RUBRIC_VERSION_V26 = 'witan-rubric-v26-prospective-2026-10-14';

// Prospective false-assurance closure. V27 inherits v17 — the calibrated public default — and
// NOT v18-v26: every rubric-version comparison in src/witan that names WITAN_RUBRIC_VERSION_V17
// also names WITAN_RUBRIC_VERSION_V27, and the only comparison naming V27 without V17 is the one
// v27 gate, `usesV27FalseAssuranceClosure` in src/witan/repo-signals.ts. That gate changes only
// places where a v17 certificate asserts more than Cejel read (#517, #518, #519, #520, #442):
//   - B3: a workflow that only publishes, releases or deploys is not counted as CI depth, nor
//     (#517, 2026-10-26) is one with no pull-request trigger that runs an unconditional publish,
//     release or deploy step, whatever else it runs (from 2026-10-27: the trigger read from `on:`
//     alone, a publishing action read on any runner, a condition that cannot be false under the
//     triggers or is a fork guard no gate, and a local reusable workflow followed; a job's
//     matrix is not read, so a publishing job is publishing whatever its matrix, as before; from
//     2026-10-28, freeze change F3-b, its note also names, read from the workflow, the triggers its
//     `on:` names and whether its publishing job declares an `environment:`, as note text only;
//     from 2026-11-01, the #517 correction on the operator's ruling of 1 November, such a workflow
//     is counted after all when a check runs before every publish step, in the publishing job or
//     in a job it needs, and B3's note says so: only a workflow that publishes without checking is
//     excluded; the second pass on #620 credits it only where a failed check stops every publish:
//     every status-check call in the file is a plain `success()`, standing alone or ANDed with
//     terms holding none, a check is a step's own `run:` that is not only `--version`, `-V`,
//     `--help` or `-h` and, for an npm-family test script, runs a root package.json script that
//     does something, its failure ends the step (a pipeline only after `set -o pipefail`), every
//     step is one the reader reads, no job needs itself or is in a `needs` cycle, and every job runs
//     after a check, either in a job it needs or in its own steps with only setup before it; B3's
//     note names or counts every such workflow, and only a v27 certificate words the PR-gate CI
//     glossary entry for it; the third pass on #625 also requires that no line YAML reads holds a
//     backslash, that outside step items every key and value is written plainly (no quoted key,
//     space before a colon, merge key, flow mapping, anchor, alias, tag or continued scalar), that
//     both sides of a pipefail pipeline are plain commands, that only setup commands or a stricter
//     `set` run before the check in its step, that no committed npm, yarn or pnpm setting or
//     workflow names a script shell, node options or a yarn path and no pnpmfile or yarn plugin is
//     committed (else no npm-family command is a check or setup), that a setup install runs no
//     root lifecycle script and installs no project or path, and that a check carries no flag with
//     which it cannot fail; the fourth pass (#627-#630, 2026-11-02) admits an npm, pnpm or yarn test
//     script, or `make test` / `make check`, as a check only when the reader proves it runs a test
//     runner from a fixed vocabulary (jest, vitest, mocha, ava, uvu, tap, tape, jasmine, node --test,
//     pytest, python -m pytest or unittest, go test, cargo test, and others), through `npm run`
//     chains, pre and post scripts and make prerequisites, joined only by `&&`, with nothing before
//     the runner but tsc, pyright, ruff or black, and B3's note names the script or target where it
//     does not; credits a check only when every `env:` key on its path (the workflow's, its job's,
//     and every step's up to and including the check's) is one known not to change what runs, or a
//     publish credential (NODE_AUTH_TOKEN, NPM_TOKEN, GITHUB_TOKEN, TWINE_*) set from a secret, and
//     reads an earlier $GITHUB_ENV or $GITHUB_PATH write the same way, the note naming the key;
//     admits as setup `pip install -r` of a requirements file whose every line is a plain index
//     requirement (includes inside the repository followed), `pipenv install` of a Pipfile and
//     Pipfile.lock that name only index packages and no `[scripts]`, a `prepare` script that is
//     exactly `husky` or `husky install`, and a root `build` script that runs only tsc beside a
//     tsconfig.json (a vite, webpack or rollup build runs its code configuration first, so stays
//     excluded); reads step items and a `needs:` block list written at their key's own indent;
//     counts a publish on the check's own line when the two are one `&&` chain; and reads `.` as
//     the source builtin only in command position. A committed yarn release (`yarnPath`) stays
//     refused by design: Cejel cannot verify offline what that file runs; the fifth pass (review of
//     #640, 2026-11-02) admits a requirements line or pip argument only as a PEP 508 project name
//     that ends in no archive or wheel suffix and is no path in the repository; counts a lint or
//     format command only as `ruff check`, `ruff format --check`, `black --check`, `eslint`, `mypy`
//     or `flake8`, with only flags known to keep the exit code (so no `--fix`, `--exit-zero` or
//     `-e`, and no pylint); admits an assignment on the check's or a setup command's own line only
//     for an inert key; withholds the credit of a check whose job runs in a `container:` or has a
//     `services:` container that sets `env:`; admits after an npm-family test script's name only
//     npm's `--silent` and `-s`, so `--prefix`, `-w`, `--workspaces`, `--cwd`, `--filter` and the
//     rest withhold the credit; counts a make target only when it and every target on its path are
//     `.PHONY` or have no file or directory of their name in the repository, and reads no Makefile
//     that assigns PATH; B3's note names each reason. Its glossary sentence states these as what
//     the reader reads, not a proof that the check can fail; the sixth pass (review of #645,
//     2026-11-03) refuses a command word written as a path (`./ruff`, `bin/pytest`, `npx ./jest`)
//     as a check, runner, lint form or setup step, where a leading `./` was stripped before the
//     match; compares make targets with repository paths case-insensitively, and reads no Makefile
//     beside a `GNUmakefile` or `makefile` in any case; credits no target of a Makefile that
//     assigns any variable (make exports one the environment also sets); admits a tsc build, or tsc
//     before a runner, only when every place it writes is a directory holding no tracked file and
//     not under node_modules and tsconfig.json has no `extends`; drops `CI` and `NODE_ENV` from the
//     inert environment keys; and says in B3's note when a credited check is a lint or format
//     command whose configuration is not read; the seventh pass (#641, #647, 2026-11-03) credits
//     `just <recipe>` and bare `tox` only where a strict reader of the root justfile or tox.ini
//     follows the recipe or every environment's commands to a known runner (for tox: listed keys
//     only, deps by index name, and the project not installed), and withholds nox, pre-commit,
//     turbo, gradle, mvn and bazel, which are no longer known runners in a script or recipe either,
//     B3's note naming the runner; resolves `pdm run`, `hatch run [env:]` and `pipenv run` through
//     `[tool.pdm.scripts]`, the hatch scripts with their inheritance and budget, and the Pipfile's
//     `[scripts]`, crediting a script only where its command is, a name that resolves to none as the
//     command itself, and nothing unresolved (a hook, shared options, hatch env-vars or install
//     commands, a committed `.env` under pipenv); admits a known runner or check only with the
//     flags a per-runner list knows to keep it failing (CHECK_FORMS), so `jest --listTests`,
//     `pytest --fixtures`, `mocha --dry-run`, `go test -run`, `cargo nextest list` and `vitest list`
//     are no checks, and no list of no-fail flags decides, reading words after npm's `--` (and every
//     word after a yarn or pnpm test script's name) against the runner of the test script's last
//     command; treats the root's install-script and package-manager readings as unread wherever a
//     working-directory or a `cd` is set, as the other root readings were; and credits `python -m X`
//     only where the root, and the directory it runs in, hold no path X, X/ or module file of stem X,
//     compared case-insensitively; and, from item F's mutation fixtures, admits `go test -count`
//     only with a positive count, and credits `hatch run` only in an environment whose
//     `skip-install` (or default's, which it inherits) is true, with no hatch environment option
//     but skip-install, description and index-named dependencies, since otherwise hatch installs
//     the project, running its build code, first; and, from the review of #657, reads a value
//     flag's value only where it does not begin with `-`, withholds on an `@` argument file, leaves
//     a tox.ini with an indented line straight after a section header unread, leaves a pdm, Pipfile
//     or hatch table with a backslash in a key unread, withholds `python -m X` beside a repository
//     module named X, `_X`, any `_`-name, a standard-library or site module, or a dependency of X,
//     withholds ctest (no CMake configuration is read), leaves hatch unread where hatch.toml sits
//     beside a pyproject.toml configuring hatch, and reads no install at a workspace root or with a
//     dependency, override or resolution that is not an index version range);
//   - A1: conftest.py is not a concrete test file (not cited as one, and rated hollow where it
//     asserts; from 2026-11-01 test_to_source_ratio counts it as test surface, as v17 does), and
//     an unconditional run-wide pytest skip
//     (a collection hook that skips or clears every item, or a module-level pytestmark skip)
//     marks the test files in its scope hollow (from 2026-10-27 the hook's skip marker may also be
//     the name "skip", or a name bound once to pytest.mark.skip before the loop); from 2026-10-28
//     (freeze change F2) so is a test file whose every test carries its own unconditional skip
//     (Python: @pytest.mark.skip, @unittest.skip(...), skipif/skipIf with the literal True, or a
//     name bound once to pytest.mark.skip, on the test or its class; JavaScript/TypeScript:
//     it.skip, test.skip, xit, xtest, or inside a describe.skip/xdescribe), named in a warning,
//     and (freeze change F3-d, F3-e, F3-f) never where the reader may not see every test: a
//     `runTest`, a call or an attribute assignment outside function bodies (Python), JSX, or a call
//     outside test-case and hook bodies that is not a test, suite or hook global (JavaScript),
//     and (the #610 review residuals, 2026-10-29) a Python decorator anywhere in the file that is
//     not a skip form or a pytest mark, or a Python module that names `load_tests`; from 2026-11-01
//     (goal_cejel_v27_a1_test_count_overmatch_2026-11-01) A1's note and evidence name each file
//     these rules rate hollow, with the rule, and no rule claims where its condition is not read:
//     a hook without an `items` parameter, or a skip that sits inside another mark's arguments in
//     pytestmark; from 2026-11-02 (goal_cejel_v27_a1_test_count_overmatch_v2_2026-11-02, which
//     supersedes #621; as fixed after the #626 review) a rule is withheld only on evidence; and
//     from 2026-11-02 (goal_cejel_v27_a1_restore_proof_and_hookwrapper_2026-11-02, #631, #632,
//     #634; as revised from 2026-11-02 by goal_cejel_v27_a1_restore_proof_v2_2026-11-02, which
//     supersedes #638) every collection hook that touches `items` (or calls exec, eval, getattr,
//     globals or the like) reaches one of three outcomes, none by default: (1) deselects, where
//     the reader proves it leaves `items` empty, and the rule applies; (2) restores, and the rule
//     is withheld and said, only where every statement of the hook's body is on an allowlist and
//     nothing else is in it: a copy binding S = list(items), items[:], items.copy(), [*items] or
//     tuple(items) before anything empties the list, with S mentioned at most once more (list
//     and tuple only where the module binds neither name anywhere; sorted is never a copy); an
//     emptying items.clear(), del items[:] or items[:] = []; a restore after it, items.extend(S),
//     items += S, items[:] = S or items[:] = S[:]; a call of a same-file helper that is a plain,
//     undecorated, synchronous def at module level, defined once, named nowhere else in the module
//     at any indent or in any string, with two parameters, whose body is only an optional
//     docstring, an optional emptying of one parameter and one restore of it from the other; and
//     a docstring. No report call is on it (config.hook.pytest_deselected, print, logging: each
//     runs code outside those steps), and a body that passes is still not credited where its
//     conftest.py may rebind a name the allowlist trusts without spelling it (a star import,
//     setattr or delattr, builtins or __builtins__, sys.modules, a module __getattr__, exec, eval,
//     compile, globals, vars or locals, __dict__, __import__ or importlib, an uncalled attribute
//     named list or tuple, or any attribute named after the helper), from the #644 review at
//     bca7ebfbf. Only that conftest.py is read for those names. From 2026-11-03
//     (goal_cejel_v27_a1_gaps_2026-11-03, item A, part of cejel #646; the #655 review) a copy that
//     calls a builtin (S = list(items) or tuple(items), or a strict helper restoring from list(src)
//     or tuple(src)) is credited only where no file the repository tracks, in any directory
//     (vendor/, build/, dist/, venv/ and coverage/ included; outside Git, every file but .git), may
//     replace the builtin: a Python source (.py, .pyw, .pyx, .pxd, .pxi) that, read under NFKC in
//     code, strings and comments alike, names builtins anywhere (f_builtins too), modules,
//     __dict__, __globals__, __getattr__, __getattribute__, __setattr__, __delattr__, __import__,
//     importlib, setattr, delattr, getattr, attrgetter, _getframe, currentframe, f_globals,
//     f_locals, f_back, tb_frame, gi_frame, cr_frame, ag_frame, gc, ctypes, __subclasses__, pickle,
//     marshal, runpy, __loader__ or __spec__, or exec, eval, compile, globals, vars or locals not as
//     an attribute, or an attribute named list or tuple that is not called; a .pyc, .pyo, .so, .pyd,
//     .egg, .whl, .zip or .pth file; a source that is not a regular file, is past the content-read
//     limit, is a Git LFS pointer or whose path git quotes; or files that cannot be listed.
//     Otherwise the hook is not read, named with that statement and the file ("hook not read:
//     `<statement>` in <path> calls a builtin, which <file> may replace", or "..., and the
//     repository's files could not be listed"). items[:], items.copy() and [*items] call no builtin
//     and stay credited. A module installed from outside the repository (an entry-point plugin, a
//     sitecustomize, a .pth file in site-packages) and a route to builtins the list does not name
//     are not read.
//     The list reading must agree that the items are back; (3) not
//     read, for anything else that empties or may empty the list (a lambda, a nested, decorated or
//     async def, sorted, a slice that is not the whole list, another name bound to the list, an
//     f-string field, exec or getattr, an append, an imported or unseen helper, a method, a use
//     inside a loop, a session.items, a global or nonlocal, an if, return, second yield or other
//     statement the conditional rule stops, an unknown decorator), and the rule makes no claim
//     while A1's note names the hook ("hook not read: `<reason>` in <path>") and its evidence
//     cites the def. A source proven empty (an empty literal, range(0), a zero-length slice
//     x[:0] or x[k:k], a name whose binding to one is its first mention in the hook, or a copy
//     taken after the clear) adds nothing. conftest.py is tokenised as Python reads it (strings,
//     f-string fields, comments, brackets and backslash continuations), so the body ends where
//     Python ends it and a comment or docstring naming the hook binds nothing. A hookwrapper
//     (hookwrapper=True or wrapper=True) is read as the code after its single top-level yield,
//     and a def whose parameters run onto later lines is read as the hook. A hook that rebinds
//     `items` at top level to a copy the reader reads (items = list(items)) before the clear keeps
//     its withhold; any other statement that may bind `items` at or before its emptying (items =
//     copy.copy(items), a for target) is not read, never rated hollow. A hook that deselects or
//     skips everything rates every collected test file hollow, not only those under its
//     directory, since pytest calls it with every collected item, where the run collecting the
//     file also collects the hook's directory (and nothing in the repository may stop pytest
//     collecting it: a directory pytest skips by default, collect_ignore or pytest_ignore_collect);
//     a run that does not is said as a withhold. Paths in
//     A1's note holding ", ", "; ", " (", a backtick or a double quote are written in double
//     quotes with \ and " escaped, and the note says how many files or hooks it names past the
//     eight evidence pointers carry none; a pytest setting
//     only for a file a pytest run collects where the setting is in force for that run (the plain
//     pytest at the root, or a command starting with pytest in a CI step with its
//     working-directory, env and if, a reached Makefile or justfile target, or a running tox
//     environment's commands; each set up as pytest 9 does: the first configuration file in
//     pytest's order walking up from its paths, its root, confcutdir, collected files, flags,
//     addopts, -o and PYTEST_ADDOPTS) and the value leaves pytest's default reading (python_files
//     that may match conftest.py withholds the conftest rule, python_functions or python_classes
//     reaching names not starting with test or Test the Python per-test reader, -p no:skipping
//     every skip rule); and a hook for a file a run collects with --noconftest or a confcutdir
//     strictly below the hook's directory, where pytest does not load it. Every withhold is said in
//     A1's note ("<rule> not applied: <reason>"), never silently. From 2026-11-03
//     (goal_cejel_v27_a1_pytest_runs_and_config_2026-11-02, #633, #643) the runs read also include
//     a noxfile's session.run("pytest", ...) with literal arguments, `tox -- <args>` passed into
//     {posargs}, a tox factor-conditional command line for an environment whose factors meet it,
//     variables the same Makefile defines (and literal justfile variables), justfile recipes with
//     parameters, `hatch run [env:]script` through the hatch scripts of hatch.toml or pyproject.toml,
//     and a local composite action's steps; a run whose arguments or directory cannot be known from
//     the repository (nox posargs, read from 2026-11-03 as below, `tox -- $VAR`, a Makefile variable it does not define or a make
//     command sets, a justfile parameter, an expression or `cd` to a variable, -c outside the
//     repository, --pyargs, a working-directory expression, Jenkins dir(), a reusable workflow in
//     another repository, or an option the reader does not know before a word that may be its
//     value or a path; after the review of #648, also a make variable set by !=, define, inside a
//     conditional, for one target or by a ?= default a CI file may replace, hatch test, a TOXENV
//     Cejel cannot resolve, a step action whose with: input runs pytest, and every pytest run in a
//     workflow that names both $GITHUB_ENV and PYTEST_ADDOPTS or checks out into a path:) is named in A1's
//     note as "pytest run not read: `<reason>` in <path>" (#644's
//     not-read clause, for a run), and switches off every removal rule for every file, since any
//     option may be in force for any file it collects. Any other remote step action is read as running
//     no pytest: nearly every workflow uses one. A Makefile's := value is expanded where it is
//     assigned, as make does; make and hatch expansion each stop at a fixed budget, past which the
//     run is not read. --cov takes its value only where the next word does not start with
//     `-` (pytest-cov's nargs="?"), testpaths globs are expanded as glob.glob does, and the
//     configuration search follows determine_setup (a setup.py at or above the common ancestor is
//     the root before the per-argument search). A run that finds no configuration file in the
//     repository may read one above its root, which the scan cannot see; A1's note says so once
//     where a file is rated hollow on such a run, and nothing is rated on what it might hold. Two
//     choices are kept, for the operator to confirm: a plain `pytest` at the root always counts as
//     a run, as the documented default invocation, so the root configuration is always in force;
//     and a Makefile `PYTEST_ADDOPTS = ...` without export is not read, since make does not pass it
//     to a recipe (#626's first pass, 892a95a40, read it; an `export PYTEST_ADDOPTS` line, a bare
//     `export` or .EXPORT_ALL_VARIABLES exports it). Each setting, command-line and not-read clause
//     carries an evidence pointer at its line, sharing the eight with the hooks, the rest counted.
//     From 2026-11-03 (goal_cejel_v27_a1_gaps_2026-11-03, items B and C, cejel #649; the #655
//     review) a noxfile's *session.posargs holds the words after `--` of each CI, recipe or tox nox
//     command (nox, python -m nox, uvx, uv run or pipx run nox), read as tox's posargs are (the
//     empty set always, at most 16 distinct literal sets); the noxfiles are read after tox's
//     commands. A word holding $, a backtick or braces, a set past the 16th, a nox command another
//     word runs (poetry run, env, hatch run, pdm run, uv run --with, uvx with options; not after
//     install or add), and the first line of any other file in A1's file list that can run nox (a
//     .sh, .bash, .zsh, .ksh, .fish, .ps1, .psm1, .bat, .cmd, .py, .pyw, .toml, .cfg, .ini, .yml,
//     .yaml or .json file, a Dockerfile, a Containerfile or a file with no extension; not a
//     noxfile, tox.ini, a CI file, a Makefile or justfile, or a read local action) naming nox as it
//     would be run (not import nox or from nox in Python; elsewhere not a dependency, a key or a
//     bare nox at the end of its line; not after install or add in the same command) is a run not
//     read, named with that command, once per read and counted against the nox budget. A long option the reader does not
//     know, before a word, is looked up in the repository's conftest.py files, CRLF read as LF and
//     every call on a line: declared by .addoption("--name", ...) with action store_true,
//     store_false, count, store_const or append_const it takes no value and the word is a path;
//     with any other literal action, or none, it takes the word; declared nowhere, with **kwargs, a
//     non-literal action or nargs=, or twice with different readings, the run stays not read, as
//     does every such option where any conftest.py declares an option through a name or *args;
//   - every criterion: a read of a Git LFS pointer is a content-read skip, so the criterion that
//     read it abstains as a read failure instead of scoring the pointer text, unless its
//     collector made a critical finding (it then scores as under v17);
//   - A4: under library norms, lockfile_coverage is 0 rather than omitted when the repository's
//     own CI (or, from 2026-10-26, its tox configuration) requires a lockfile and none is
//     committed, and (#520, 2026-10-26) under any norms that requirement is a warning finding
//     citing the requiring line (from 2026-10-27 a requiring step stands when every step that may
//     write the lockfile comes after it in the same job, a writer after it on its own line
//     joined only by && included, and a pip install with --require-hashes
//     requires its requirements file; a requirement an earlier action Cejel did not read may meet
//     is not determined, and scores no zero; from 2026-10-28, freeze change F3-a, a command run in
//     the background with a single `&` states no requirement);
//   - A2 and B2: on a shallow clone, A2 abstains unless a confirmed critical secret finding
//     stands. Since the v27 freeze change F1 (operator decision 2026-10-28) B2 follows the
//     operator's 26/27 Oct rule for shallow clones, as under every other rubric since #604: it
//     withholds only its pull-request merge ratio when fewer commits are visible than its window
//     reads, and is scored on the checked-out files, or abstains where none of them is credited.
//     A2's abstention after a failed history read is a read failure. F1 also left A2's
//     shallow-only abstention out of the composite (reason shallow_history), and its second pass
//     capped the verdict at the band the composite would reach with it counted as 0. Both are
//     removed by the operator's ruling of 1 Nov: taking A2 out of the average moved the composite
//     toward the other criteria, so it could fall below the same commit's full-clone composite.
//   - a shallow clone (operator ruling of 1 Nov): the scan gives no composite and no verdict. The
//     report abstains (verdict insufficient_source, every headline score null) with the reason
//     WITAN_V27_SHALLOW_HISTORY_REASON (history-depth.ts), which names shallow_history and tells
//     the reader to run git fetch --unshallow (or check out with full history, for example
//     fetch-depth: 0 in actions/checkout) and scan again. Each criterion is still read and shown,
//     with A2's and B2's shallow notes. The exit status is an abstained verdict's. No report
//     carries verdictCap any more. A full clone is unaffected. Where git cannot report the depth,
//     readHistoryDepth reads it from the repository's .git files, and where those cannot settle it
//     the report abstains the same way with WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON. Until the
//     operator's ruling of 2 Nov a directory with no .git entry was scored as before; it now
//     abstains with noGitHistoryAbstentionReason, as under every rubric, and the ruling gives every
//     other rubric this whole shallow-clone and unknown-depth abstention too.
// Every other abstention is a read failure, kept in the composite at 0, and each other change only
// lowers a metric, adds a zero-valued one or adds a finding, which can only cap a score (A1's
// test_to_source_ratio and non-hollow share are both measured over v17's test list, so excluding
// conftest.py moves neither denominator nor the ratio). So on a full clone no score,
// status, composite or verdict can rise against v17 for the same commit (against the earlier v27,
// A4 rises where that zero is withdrawn). On a shallow clone there is no composite or verdict to
// rise or fall; v27's history criteria are compared with the same commit's full clone, not with
// v17 on the truncated input, and every other criterion with v17 as on a full clone
// (src/witan/__tests__/v27-no-rise.ts). The measured
// before/after is in
// leaderboard/RUBRIC_CHANGELOG.md and docs/reviews/v27-false-assurance-closure-2026-10-19.md.
// The name collides with the unrelated `useV27Detectors` detector-generation flag in
// repo-signals.ts (free-core detector v27, which every rubric since v8 uses); the rubric gate is
// spelt `usesV27...` to keep the two apart. The public default remains v17; callers must opt in
// explicitly. This declaration carries no precision or recall claim, and no holdout has run.
export const WITAN_RUBRIC_VERSION_V27 = 'witan-rubric-v27-prospective-2026-10-19';

// Calibration-claim policy. The shared/public default is deliberately decoupled from rubric
// iteration: prospective rubrics are available only by explicit opt-in — a committed evaluation
// harness, or (on main after 0.4.4) the unreleased public
// `cejel scan --rubric-pin <version>` flag (src/index.ts) —
// and inherit no precision, recall, false-positive-rate, or other calibration claim from v17.
// Promotion to public default requires a fresh authenticated untouched holdout and a separately
// recorded default decision; `--rubric-pin` does not itself constitute that decision.
export const WITAN_LAST_CALIBRATED_RUBRIC_VERSION = WITAN_RUBRIC_VERSION_V17;
export const WITAN_PROSPECTIVE_RUBRIC_VERSIONS = Object.freeze([
  WITAN_RUBRIC_VERSION_V18,
  WITAN_RUBRIC_VERSION_V19,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_RUBRIC_VERSION_V26,
  WITAN_RUBRIC_VERSION_V27,
] as const);

// The complete set of rubric identifiers a caller may explicitly select: the calibrated default
// plus every wired prospective rubric. This is deliberately narrower than "every rubric version
// this package has ever implemented" (v0-v16 remain load-bearing for historical fixtures and
// regression tests, but are not offered as a live selection) — it is the same "callers must opt
// in explicitly" set every V18-V27 constant above documents.
export const WITAN_SELECTABLE_RUBRIC_VERSIONS = Object.freeze([
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  ...WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
] as const);

/**
 * Fail closed on an explicitly supplied rubric selector that isn't wired. Passing an unwired or
 * misspelled rubric string must not silently fall through to whatever default `createWitanReport`
 * happens to apply to an unrecognized version string — that produces a certificate whose
 * `rubricVersion` field states a rubric that did not actually run. Absence is not covered here:
 * an absent selector legitimately takes the default, checked by the caller before invoking this.
 */
export function assertSelectableRubricVersion(rubricVersion: string): void {
  if ((WITAN_SELECTABLE_RUBRIC_VERSIONS as readonly string[]).includes(rubricVersion)) return;
  throw new Error(
    `Cejel: unrecognized rubric version: "${rubricVersion}". Accepted values: ${WITAN_SELECTABLE_RUBRIC_VERSIONS.join(', ')}.`,
  );
}

/** True for any rubric that has not cleared the calibration gate (currently v18-v27). */
export function isProspectiveRubricVersion(rubricVersion: string): boolean {
  return (WITAN_PROSPECTIVE_RUBRIC_VERSIONS as readonly string[]).includes(rubricVersion);
}

/**
 * Human-facing warning for a prospective-rubric certificate — terminal, HTML, and Markdown
 * renderers. Deliberately never attached to report.json/attestation.json/badge.json: adding a
 * field to those schemas would change their shape for every scan, including the calibrated
 * default, which is exactly the default-path behavior change `--rubric-pin` must never cause.
 * Those artifacts already name the exact rubric that ran via the existing `rubricVersion` field;
 * any downstream consumer can call `isProspectiveRubricVersion` on it. summary.json carries a
 * plain-words restatement of it, `plainSummary.prospectiveNotice` (src/plain-summary.ts), present
 * only when the rubric is prospective; this exact text is not written to summary.json.
 */
export const PROSPECTIVE_RUBRIC_NOTICE =
  'PROSPECTIVE / UNCALIBRATED RUBRIC — this rubric has not cleared a calibration gate. Scores, verdicts, and findings produced under it carry no precision/recall claim and are not comparable to a calibrated certificate.';
