import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';
import { PYPROJECT, PY_BASE, SKIPPED_CACHE_TEST, conftestHook, lines } from './v27-a1-removal-fixtures.js';

// v27 A1 RUN FIXTURES (goal_cejel_v27_a1_pytest_runs_and_config_2026-11-02, #633, #643).
//
// Under witan-rubric-v27-prospective-2026-10-19 a removal rule is withheld for a file where a
// pytest run that collects it has a setting in force that switches the rule off (#626). Each
// fixture here is a synthetic shape, written from scratch, of a pytest run, option or
// configuration search the reader did not read as pytest does (#633), or of a setting clause that
// carried no evidence pointer (#643):
//   - item A: a run form. A form whose arguments are literal is read as the run it is; a form
//     whose arguments cannot be known from the repository is named "pytest run not read", and no
//     removal rule is applied to a file it could collect;
//   - item B: option parsing (an unknown long option before a path, --cov's optional value,
//     testpaths globs);
//   - item C: the configuration search (pytest's per-argument fallback after setup.py; a run
//     that could read a configuration file above the repository's root);
//   - item E: each setting clause carries an evidence pointer to the line that holds the setting
//     or the pytest command line.
// `removed` lists the files v27 must still rate hollow, with their rule. `withheld` lists the
// clauses A1's note must hold where a rule was withheld; v27 must then read every file as v17
// does. `pointers` lists the evidence pointers (path, line, label) v27 must cite.

export interface RunFixture extends FalseAssuranceFixture {
  readonly item: 'A' | 'B' | 'C' | 'E' | 'F' | 'G';
  readonly removed: readonly (readonly [path: string, rule: string])[];
  readonly withheld: readonly string[];
  readonly pointers?: readonly (readonly [path: string, line: number, label: string])[];
  /** A sentence the note must hold exactly once. */
  readonly sentence?: string;
}

const caught = (
  name: string,
  item: RunFixture['item'],
  purpose: string,
  files: Readonly<Record<string, string | null>>,
  removed: RunFixture['removed'],
  extra: Pick<RunFixture, 'sentence'> = {},
): RunFixture => ({ name, issue: '#633', item, purpose, commits: [{ ...PY_BASE, ...files }], removed, withheld: [], ...extra });

const withheld = (
  name: string,
  item: RunFixture['item'],
  purpose: string,
  files: Readonly<Record<string, string | null>>,
  clauses: readonly string[],
  pointers?: RunFixture['pointers'],
): RunFixture => ({
  name,
  issue: '#633',
  item,
  purpose,
  commits: [{ ...PY_BASE, ...files }],
  removed: [],
  withheld: clauses,
  ...(pointers === undefined ? {} : { pointers }),
});

const CI_PATH = '.github/workflows/ci.yml';
const CLEAR_HOOK = conftestHook(['    items.clear()']);
const HOOK_RULE = 'run-wide skip: hook in tests/conftest.py';
const HOOK_REMOVED: RunFixture['removed'] = [
  ['tests/test_cache.py', HOOK_RULE],
  ['tests/test_lru.py', HOOK_RULE],
];
const SKIPPED_REMOVED: RunFixture['removed'] = [['tests/test_cache.py', 'every test skipped']];
const NO_CONFTEST = (where: string) => `run-wide skip rule not applied: --noconftest on a pytest command line in ${where}`;
const NO_SKIPPING = (where: string) => `every-test-skipped rule not applied: -p no:skipping on a pytest command line in ${where}`;
/** The clause naming a run the reader cannot read (the "not read" clause #644 added, for a run). */
export const runNotRead = (reason: string, path: string): string => `pytest run not read: \`${reason}\` in ${path}`;

/** A GitHub Actions workflow running `steps` (each a `run:` value) after a checkout. */
const ciWorkflow = (steps: readonly string[]): string =>
  lines(
    'name: ci',
    'on:',
    '  push:',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pip install pytest',
    ...steps.map((step) => `      - run: ${step}`),
  );

/** A workflow whose test job's steps are given as raw YAML lines, and optional job lines. */
const rawCiWorkflow = (stepLines: readonly string[], jobLines: readonly string[] = []): string =>
  lines(
    'name: ci',
    'on:',
    '  push:',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    ...jobLines,
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...stepLines,
  );

const NOXFILE = (call: string): string =>
  lines('import nox', '', '', '@nox.session', 'def tests(session):', '    session.install("pytest")', `    ${call}`);

const PYPROJECT_WITHOUT_PYTEST = lines('[project]', 'name = "cachelib"', 'version = "1.0.0"', 'dependencies = []');

export const RUN_FIXTURES: readonly RunFixture[] = [
  // ---- item A: run forms --------------------------------------------------------------------
  withheld(
    'a1run-nox-literal-args',
    'A',
    "A noxfile session runs pytest with literal arguments, one of them --noconftest; nox runs every session's commands.",
    { 'tests/conftest.py': CLEAR_HOOK, 'noxfile.py': NOXFILE('session.run("pytest", "--noconftest", "tests")') },
    [NO_CONFTEST('noxfile.py')],
    [['noxfile.py', 7, 'pytest setting in force: --noconftest']],
  ),
  // goal_cejel_v27_a1_gaps_2026-11-03, item B (#649) moved this pin: no CI or recipe nox command
  // passes posargs, so `*session.posargs` is empty, the session runs plain pytest, and the clear hook
  // rates both files hollow. It was "pytest run not read" here before.
  caught(
    'a1run-nox-posargs',
    'A',
    "A noxfile session passes nox's posargs to pytest, and no nox command in the repository passes any: the session runs plain pytest.",
    { 'tests/conftest.py': CLEAR_HOOK, 'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)') },
    HOOK_REMOVED,
  ),
  withheld(
    'a1run-tox-literal-posargs',
    'A',
    'CI runs tox -- -p no:skipping, which tox passes to pytest through {posargs}.',
    {
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[testenv]', 'deps = pytest', 'commands = pytest {posargs}'),
      [CI_PATH]: ciWorkflow(['pip install tox', 'tox -- -p no:skipping']),
    },
    [NO_SKIPPING('tox.ini')],
    [['tox.ini', 6, 'pytest setting in force: -p no:skipping']],
  ),
  withheld(
    'a1run-tox-variable-posargs',
    'A',
    'CI runs tox -- "$PYTEST_ARGS", whose value the repository cannot show: the run is not read.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[testenv]', 'deps = pytest', 'commands = pytest {posargs}'),
      [CI_PATH]: ciWorkflow(['pip install tox', 'tox -- $PYTEST_ARGS']),
    },
    [runNotRead('tox -- $PYTEST_ARGS', CI_PATH)],
  ),
  withheld(
    'a1run-tox-factor-matches',
    'A',
    'A tox factor-conditional command line whose factor an envlist environment has runs pytest -p no:skipping.',
    {
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      'tox.ini': lines(
        '[tox]',
        'envlist = py312-fast, py312-cov',
        '',
        '[testenv]',
        'deps = pytest',
        'commands =',
        '    fast: pytest -p no:skipping',
        '    cov: pytest',
      ),
    },
    [NO_SKIPPING('tox.ini')],
    [['tox.ini', 7, 'pytest setting in force: -p no:skipping']],
  ),
  caught(
    'a1run-tox-factor-unmatched',
    'A',
    'A tox factor-conditional line runs pytest -p no:skipping only for a factor no environment has.',
    {
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[testenv]', 'deps = pytest', 'commands =', '    py27: pytest -p no:skipping', '    pytest'),
    },
    SKIPPED_REMOVED,
  ),
  withheld(
    'a1run-make-variable-defined',
    'A',
    'A Makefile recipe runs $(PYTEST), defined in the same Makefile as python -m pytest -p no:skipping.',
    {
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      Makefile: 'PYTEST = python -m pytest -p no:skipping\n\ntest:\n\t$(PYTEST) tests\n',
    },
    [NO_SKIPPING('Makefile')],
    [['Makefile', 1, 'pytest setting in force: -p no:skipping']],
  ),
  withheld(
    'a1run-make-variable-undefined',
    'A',
    'A Makefile recipe passes $(PYTEST_ARGS) to pytest, a variable the Makefile does not define: the run is not read.',
    { 'tests/conftest.py': CLEAR_HOOK, Makefile: 'test:\n\tpytest $(PYTEST_ARGS) tests\n' },
    [runNotRead('pytest $(PYTEST_ARGS) tests', 'Makefile')],
    [['Makefile', 2, 'pytest run not read']],
  ),
  caught(
    'a1run-make-addopts-not-exported',
    'A',
    'Item D: a Makefile sets PYTEST_ADDOPTS = -p no:skipping without export, so make does not pass it to pytest.',
    { 'tests/test_cache.py': SKIPPED_CACHE_TEST, Makefile: 'PYTEST_ADDOPTS = -p no:skipping\n\ntest:\n\tpytest\n' },
    SKIPPED_REMOVED,
  ),
  withheld(
    'a1run-make-export-all-variables',
    'A',
    'Item D: a Makefile with .EXPORT_ALL_VARIABLES passes its PYTEST_ADDOPTS = -p no:skipping to pytest.',
    {
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      Makefile: '.EXPORT_ALL_VARIABLES:\nPYTEST_ADDOPTS = -p no:skipping\n\ntest:\n\tpytest\n',
    },
    ['every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in Makefile'],
    [['Makefile', 2, 'pytest setting in force: -p no:skipping']],
  ),
  withheld(
    'a1run-just-parameter',
    'A',
    'A justfile recipe with a parameter passes it to pytest: the run is not read.',
    { 'tests/conftest.py': CLEAR_HOOK, justfile: 'test *ARGS:\n    pytest {{ARGS}}\n' },
    [runNotRead('pytest {{ARGS}}', 'justfile')],
  ),
  withheld(
    'a1run-hatch-pyproject-script',
    'A',
    'CI runs hatch run test, a hatch script in pyproject.toml that runs pytest -p no:skipping.',
    {
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      'pyproject.toml': lines(PYPROJECT().trimEnd(), '', '[tool.hatch.envs.default.scripts]', 'test = "pytest -p no:skipping {args}"'),
      [CI_PATH]: ciWorkflow(['pip install hatch', 'hatch run test']),
    },
    [NO_SKIPPING('pyproject.toml')],
    [['pyproject.toml', 10, 'pytest setting in force: -p no:skipping']],
  ),
  withheld(
    'a1run-hatch-toml-env-script',
    'A',
    "CI runs hatch run unit:all, the unit environment's all script in hatch.toml, which runs pytest --noconftest.",
    {
      'tests/conftest.py': CLEAR_HOOK,
      'hatch.toml': lines('[envs.unit]', 'dependencies = ["pytest"]', '', '[envs.unit.scripts]', 'all = ["pytest --noconftest"]'),
      [CI_PATH]: ciWorkflow(['pip install hatch', 'hatch run unit:all']),
    },
    [NO_CONFTEST('hatch.toml')],
  ),
  withheld(
    'a1run-config-outside-repo',
    'A',
    'CI passes -c with a configuration file outside the repository, which the scan cannot read: the run is not read.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest -c ../shared/pytest.ini tests']) },
    [runNotRead('-c ../shared/pytest.ini', CI_PATH)],
  ),
  withheld(
    'a1run-pyargs',
    'A',
    'CI runs pytest --pyargs, which collects by import name from wherever Python finds the package: the run is not read.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --pyargs cachelib']) },
    [runNotRead('--pyargs', CI_PATH)],
  ),
  withheld(
    'a1run-working-directory-expression',
    'A',
    'A CI step runs pytest in a working-directory set by an expression: the run is not read.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: rawCiWorkflow(['      - run: pytest', '        working-directory: ${{ matrix.suite }}']),
    },
    [runNotRead('working-directory: ${{ matrix.suite }}', CI_PATH)],
  ),
  withheld(
    'a1run-jenkins-dir',
    'A',
    'A Jenkinsfile runs pytest inside dir(), a directory change the reader does not follow: the run is not read.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      Jenkinsfile: lines('pipeline {', '  agent any', '  stages {', "    stage('test') {", '      steps {', "        dir(\"${env.SUITE}\") {", "          sh 'pytest'", '        }', '      }', '    }', '  }', '}'),
    },
    [runNotRead('dir("${env.SUITE}")', 'Jenkinsfile')],
  ),
  withheld(
    'a1run-local-composite-action',
    'A',
    'A CI step uses a local composite action whose own step runs pytest --noconftest.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      '.github/actions/unit/action.yml': lines(
        'name: unit',
        'runs:',
        '  using: composite',
        '  steps:',
        '    - run: pytest --noconftest',
        '      shell: bash',
      ),
      [CI_PATH]: rawCiWorkflow(['      - uses: ./.github/actions/unit']),
    },
    [NO_CONFTEST('.github/actions/unit/action.yml')],
  ),
  withheld(
    'a1run-remote-reusable-workflow',
    'A',
    'A CI job calls a reusable workflow in another repository, which the scan cannot read: the run is not read.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: lines('name: ci', 'on:', '  push:', 'jobs:', '  test:', '    uses: synthetic-org/shared-ci/.github/workflows/python.yml@v1'),
    },
    [runNotRead('synthetic-org/shared-ci/.github/workflows/python.yml@v1', CI_PATH)],
  ),
  withheld(
    'a1run-local-reusable-workflow-input',
    'A',
    "A local reusable workflow passes its caller's input to pytest, which the workflow alone cannot show: the run is not read.",
    {
      'tests/conftest.py': CLEAR_HOOK,
      '.github/workflows/unit.yml': lines(
        'name: unit',
        'on:',
        '  workflow_call:',
        '    inputs:',
        '      args:',
        '        type: string',
        'jobs:',
        '  unit:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: pytest ${{ inputs.args }}',
      ),
    },
    [runNotRead('pytest ${{ inputs.args }}', '.github/workflows/unit.yml')],
  ),
  // ---- item B: option parsing ----------------------------------------------------------------
  withheld(
    'a1run-unknown-long-option-before-path',
    'B',
    'CI passes an option the reader does not know, followed by a word that may be its value or a path: the run is not read.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --suite-filter tests']) },
    [runNotRead('--suite-filter tests', CI_PATH)],
  ),
  caught(
    'a1run-known-flag-before-path',
    'B',
    'Control: --strict-markers takes no value, so the word after it is a path and the run is read.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --strict-markers tests']) },
    HOOK_REMOVED,
  ),
  withheld(
    'a1run-cov-without-value',
    'B',
    "--cov's value is optional (pytest-cov's nargs='?'): before -p it takes none, so -p no:skipping is in force.",
    { 'tests/test_cache.py': SKIPPED_CACHE_TEST, [CI_PATH]: ciWorkflow(['pytest --cov -p no:skipping tests']) },
    [NO_SKIPPING(CI_PATH)],
    [[CI_PATH, 10, 'pytest setting in force: -p no:skipping']],
  ),
  caught(
    'a1run-testpaths-glob',
    'B',
    'testpaths = ["integration*"] matches integration_api only, so the run with PYTEST_ADDOPTS=-p no:skipping does not collect tests/.',
    {
      'pyproject.toml': PYPROJECT().replace('testpaths = ["tests"]', 'testpaths = ["integration*"]'),
      'integration_api/test_api.py': lines('def test_api():', '    assert 1 + 1 == 2'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      [CI_PATH]: ciWorkflow(['PYTEST_ADDOPTS="-p no:skipping" pytest', 'pytest tests']),
    },
    SKIPPED_REMOVED,
  ),
  // ---- item C: configuration search ----------------------------------------------------------
  caught(
    'a1run-setup-py-before-per-argument-fallback',
    'C',
    "pytest stops at setup.py before its per-argument search, so tests/unit/pytest.ini's -p no:skipping is not read for pytest tests/unit tests/test_cache.py.",
    {
      'pyproject.toml': null,
      'setup.py': 'from setuptools import setup\n\nsetup(name="cachelib")\n',
      'tests/unit/pytest.ini': lines('[pytest]', 'addopts = -p no:skipping'),
      'tests/unit/test_unit.py': lines('def test_unit():', '    assert 2 * 2 == 4'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      [CI_PATH]: ciWorkflow(['pytest tests/unit tests/test_cache.py']),
    },
    SKIPPED_REMOVED,
    { sentence: A1_ABOVE_ROOT_SENTENCE_TEXT() },
  ),
  caught(
    'a1run-config-above-root',
    'C',
    'No configuration file in the repository holds pytest settings, so pytest may read one above its root; the note says so once and rates as before.',
    { 'pyproject.toml': PYPROJECT_WITHOUT_PYTEST, 'tests/test_cache.py': SKIPPED_CACHE_TEST },
    SKIPPED_REMOVED,
    { sentence: A1_ABOVE_ROOT_SENTENCE_TEXT() },
  ),
  // ---- item E: setting clauses carry evidence pointers ----------------------------------------
  withheld(
    'a1run-pointer-pyproject-setting',
    'E',
    "The -p no:skipping clause points at pyproject.toml's addopts line.",
    { 'pyproject.toml': PYPROJECT(['addopts = "-p no:skipping"']), 'tests/test_cache.py': SKIPPED_CACHE_TEST },
    ['every-test-skipped rule not applied: -p no:skipping set in pyproject.toml'],
    [['pyproject.toml', 8, 'pytest setting in force: -p no:skipping']],
  ),
  withheld(
    'a1run-pointer-ci-command-line',
    'E',
    'The --noconftest clause points at the CI line that runs pytest --noconftest.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --noconftest']) },
    [NO_CONFTEST(CI_PATH)],
    [[CI_PATH, 10, 'pytest setting in force: --noconftest']],
  ),
  withheld(
    'a1run-pointer-addopts-env',
    'E',
    'The PYTEST_ADDOPTS clause points at the line that sets PYTEST_ADDOPTS.',
    {
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      [CI_PATH]: rawCiWorkflow(['      - run: pytest'], ['    env:', '      PYTEST_ADDOPTS: -p no:skipping']),
    },
    [`every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in ${CI_PATH}`],
    [[CI_PATH, 8, 'pytest setting in force: -p no:skipping']],
  ),

  // ---- item F: nox posargs (goal_cejel_v27_a1_gaps_2026-11-03, item B; #649, 1) -------------
  // `*session.posargs` holds the words after `--` on a CI or recipe nox command (`nox -s tests --
  // ...`, or nox run as a Python module); a nox command with no `--` passes none; a word holding `$`,
  // a backtick or braces leaves the run not read, as do more than 16 distinct sets. nox was not run
  // on these fixtures (no Python package could be run in this session): each claim rests on nox's
  // documented posargs, not on a run.
  caught(
    'a1gap-nox-posargs-ci-passes-none',
    'F',
    'CI runs nox -s tests with no --, so *session.posargs is empty and the session runs plain pytest, which loads the clear hook.',
    { 'tests/conftest.py': CLEAR_HOOK, 'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'), [CI_PATH]: ciWorkflow(['pip install nox', 'nox -s tests']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1gap-nox-posargs-ci-passes-a-path',
    'F',
    'CI runs nox -s tests -- tests: the session runs pytest tests, which loads the clear hook.',
    { 'tests/conftest.py': CLEAR_HOOK, 'noxfile.py': NOXFILE('session.run("pytest", "-q", *session.posargs)'), [CI_PATH]: ciWorkflow(['nox -s tests -- tests']) },
    HOOK_REMOVED,
  ),
  withheld(
    'a1gap-nox-posargs-ci-passes-no-skipping',
    'F',
    'CI runs nox -s tests -- -p no:skipping, which nox passes to pytest through *session.posargs.',
    { 'tests/test_cache.py': SKIPPED_CACHE_TEST, 'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'), [CI_PATH]: ciWorkflow(['nox -s tests -- -p no:skipping']) },
    [NO_SKIPPING('noxfile.py')],
  ),
  withheld(
    'a1gap-nox-python-module-posargs-in-makefile',
    'F',
    'A Makefile recipe CI runs calls python -m nox -s tests -- --noconftest; the session passes it to pytest.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'),
      Makefile: 'test:\n\tpython -m nox -s tests -- --noconftest\n',
      [CI_PATH]: ciWorkflow(['make test']),
    },
    [NO_CONFTEST('noxfile.py')],
  ),
  withheld(
    'a1gap-nox-posargs-variable',
    'F',
    'CI passes a shell variable after --: the posargs cannot be known, so the run is not read.',
    { 'tests/conftest.py': CLEAR_HOOK, 'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'), [CI_PATH]: ciWorkflow(['nox -s tests -- $PYTEST_ARGS']) },
    [runNotRead('nox -s tests -- $PYTEST_ARGS', CI_PATH)],
  ),
  withheld(
    'a1gap-nox-posargs-past-sixteen-sets',
    'F',
    'CI passes 17 distinct posargs sets: past the 16-set limit the 17th is named as not read, not read in part.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'),
      [CI_PATH]: ciWorkflow(Array.from({ length: 17 }, (_, index) => `nox -s tests -- -k t${index}`)),
    },
    [runNotRead('nox -s tests -- -k t16', CI_PATH)],
  ),
  // The review of #655, blocker 1: "no posargs" is known only where every nox invocation in the
  // repository is one the reader reads. A nox command through a runner or wrapper the reader does
  // not read (poetry, env, hatch, pdm, uv run --with, uvx with options, a shell script, a Python
  // script) may pass any posargs, so the noxfile run is not read and named with that command.
  ...(
    [
      ['poetry', 'poetry run nox -s tests -- --noconftest'],
      ['env', 'env CI=1 nox -s tests -- --noconftest'],
      ['hatch', 'hatch run nox -s tests -- --noconftest'],
      ['pdm', 'pdm run nox -s tests -- --noconftest'],
      ['uv-with', 'uv run --with nox nox -s tests -- --noconftest'],
      ['uvx-options', 'uvx --python 3.12 nox -s tests -- --noconftest'],
    ] as const
  ).map(([form, command]) =>
    withheld(
      `a1gap-nox-unread-invocation-${form}`,
      'F',
      `CI runs ${command}, a nox command the reader does not read: its posargs are unknown, so the noxfile run is not read, never read as passing none.`,
      { 'tests/conftest.py': CLEAR_HOOK, 'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'), [CI_PATH]: ciWorkflow([command]) },
      [runNotRead(command, CI_PATH)],
    ),
  ),
  withheld(
    'a1gap-nox-unread-invocation-shell-script',
    'F',
    'CI runs sh scripts/ci.sh, whose nox command passes --noconftest; the reader does not read the script, so the noxfile run is not read.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'),
      'scripts/ci.sh': lines('#!/bin/sh', 'set -e', 'nox -s tests -- --noconftest'),
      [CI_PATH]: ciWorkflow(['sh scripts/ci.sh']),
    },
    [runNotRead('nox -s tests -- --noconftest', 'scripts/ci.sh')],
  ),
  withheld(
    'a1gap-nox-unread-invocation-python-script',
    'F',
    'CI runs a Python script that calls nox with posargs through subprocess; the reader does not read the script, so the noxfile run is not read.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'),
      'scripts/run_tests.py': lines('import subprocess', '', 'subprocess.run(["nox", "-s", "tests", "--", "--noconftest"], check=True)'),
      [CI_PATH]: ciWorkflow(['python scripts/run_tests.py']),
    },
    [runNotRead('subprocess.run(["nox", "-s", "tests", "--", "--noconftest"], check=True)', 'scripts/run_tests.py')],
  ),
  withheld(
    'a1gap-nox-posargs-from-tox-command',
    'F',
    'tox runs nox -s tests -- --noconftest from its commands; the reader reads tox commands, so the set is read and --noconftest is in force.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'),
      'tox.ini': lines('[tox]', 'envlist = py', '', '[testenv]', 'deps = nox', 'commands = nox -s tests -- --noconftest'),
      [CI_PATH]: ciWorkflow(['pip install tox', 'tox -e py']),
    },
    [NO_CONFTEST('noxfile.py')],
  ),
  caught(
    'a1gap-nox-posargs-dependency-mentions',
    'F',
    'Control: nox named only as a dependency (pyproject, a requirements file, tox deps) and in a README; the one nox command passes no --, so the session runs plain pytest.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'noxfile.py': NOXFILE('session.run("pytest", *session.posargs)'),
      'pyproject.toml': lines('[project]', 'name = "cachelib"', 'version = "1.0.0"', 'dependencies = []', '', '[project.optional-dependencies]', 'dev = ["nox>=2024.3", "pytest"]'),
      'requirements-dev.txt': lines('nox', 'pytest'),
      'README.md': lines('# cachelib', '', 'Run `nox -s tests -- -x` to stop at the first failure.'),
      [CI_PATH]: ciWorkflow(['pip install nox', 'nox -s tests']),
    },
    HOOK_REMOVED,
  ),

  // ---- item G: options a conftest.py declares (goal_cejel_v27_a1_gaps_2026-11-03, item C; #649, 2)
  // An unknown long option before a word is looked up in the repository's conftest.py files:
  // `parser.addoption("--name", action="store_true" | "store_false" | "count" | "store_const")`
  // takes no value, so the word is a path; any other action, or none, takes a value; declared
  // nowhere, or in a call Cejel cannot read, the run stays not read. pytest was not run on these
  // fixtures (no Python package could be run in this session): each claim rests on argparse's
  // actions, which pytest's addoption passes through, not on a run.
  caught(
    'a1gap-option-store-true-before-path',
    'G',
    'pytest --runslow tests, where the root conftest.py declares --runslow with action="store_true": tests is a path, and the run loads the clear hook.',
    {
      'conftest.py': lines('def pytest_addoption(parser):', '    parser.addoption("--runslow", action="store_true", default=False, help="run slow tests")'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --runslow tests']),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1gap-option-count-in-group-before-path',
    'G',
    'pytest --chatty tests, where a conftest.py declares --chatty on an option group with action="count": tests is a path.',
    {
      'conftest.py': lines('def pytest_addoption(parser):', '    group = parser.getgroup("cachelib")', "    group.addoption('--chatty', '-C', action='count', default=0)"),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --chatty tests']),
    },
    HOOK_REMOVED,
  ),
  withheld(
    'a1gap-option-store-false-before-path-no-skipping',
    'G',
    'pytest --no-network tests -p no:skipping, where --no-network is declared with action="store_false": the run is read, and -p no:skipping is in force for tests.',
    {
      'conftest.py': lines('def pytest_addoption(parser):', '    parser.addoption(', '        "--no-network",', '        action="store_false",', '        dest="network",', '    )'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
      [CI_PATH]: ciWorkflow(['pytest --no-network tests -p no:skipping']),
    },
    [NO_SKIPPING(CI_PATH)],
  ),
  caught(
    'a1gap-option-with-value',
    'G',
    'pytest --env ci tests, where --env is declared with no action (argparse stores a value): ci is its value and tests a path.',
    {
      'conftest.py': lines('def pytest_addoption(parser):', '    parser.addoption("--env", default="dev")'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --env ci tests']),
    },
    HOOK_REMOVED,
  ),
  withheld(
    'a1gap-option-declared-with-name-variable',
    'G',
    'Control: --runslow is declared through a name, not a string literal, so Cejel cannot tell whether it takes a value: the run stays not read.',
    {
      'conftest.py': lines('SLOW = "--runslow"', '', '', 'def pytest_addoption(parser):', '    parser.addoption(SLOW, action="store_true")'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --runslow tests']),
    },
    [runNotRead('--runslow tests', CI_PATH)],
  ),
  withheld(
    'a1gap-option-declared-with-kwargs',
    'G',
    'Control: --runslow is declared with **kwargs, which may hold its action: the run stays not read.',
    {
      'conftest.py': lines('FLAG = {"action": "store_true"}', '', '', 'def pytest_addoption(parser):', '    parser.addoption("--runslow", **FLAG)'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --runslow tests']),
    },
    [runNotRead('--runslow tests', CI_PATH)],
  ),
  withheld(
    'a1gap-option-declared-in-a-non-conftest-module',
    'G',
    'Control: --runslow is declared only in a plugin module, not a conftest.py: the run stays not read.',
    {
      'cachelib_plugin.py': lines('def pytest_addoption(parser):', '    parser.addoption("--runslow", action="store_true")'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --runslow tests']),
    },
    [runNotRead('--runslow tests', CI_PATH)],
  ),
  // The review of #655, blocker 4: each refusal of the declaration reader has a fixture that fails
  // where the refusal is removed (each would then read the next word as a value or a path and rate
  // the files hollow).
  withheld(
    'a1gap-option-declared-with-nargs',
    'G',
    'Control: --level is declared with nargs="?", so it may or may not take the next word: the run stays not read.',
    {
      'conftest.py': lines('def pytest_addoption(parser):', '    parser.addoption("--level", action="store", nargs="?", const="1")'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --level tests']),
    },
    [runNotRead('--level tests', CI_PATH)],
  ),
  withheld(
    'a1gap-option-declared-twice-disagreeing',
    'G',
    'Control: the root conftest.py declares --runslow with action="store_true" and another conftest.py declares it with no action (a value): the run stays not read.',
    {
      'conftest.py': lines('def pytest_addoption(parser):', '    parser.addoption("--runslow", action="store_true")'),
      'integration/conftest.py': lines('def pytest_addoption(parser):', '    parser.addoption("--runslow", default="no")'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --runslow tests']),
    },
    [runNotRead('--runslow tests', CI_PATH)],
  ),
  withheld(
    'a1gap-option-declared-with-non-literal-action',
    'G',
    'Control: --runslow is declared with action=ACTION, a name, so Cejel cannot tell whether it takes a value: the run stays not read.',
    {
      'conftest.py': lines('ACTION = "store_true"', '', '', 'def pytest_addoption(parser):', '    parser.addoption("--runslow", action=ACTION)'),
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --runslow tests']),
    },
    [runNotRead('--runslow tests', CI_PATH)],
  ),
];

/** The sentence A1's note holds once where a run could read a configuration file above the repository's root (item C). */
export function A1_ABOVE_ROOT_SENTENCE_TEXT(): string {
  return 'A pytest run that finds no configuration file in the repository may read one above its root, which the scan cannot see; no rule is rated on what it might hold.';
}
