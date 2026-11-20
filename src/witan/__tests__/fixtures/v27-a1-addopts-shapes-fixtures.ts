import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';
import { PY_BASE, SKIPPED_CACHE_TEST, lines } from './v27-a1-removal-fixtures.js';

// goal_cejel_v27_a1_addopts_shapes_2026-11-17 (#705, #713, #661): the PYTEST_ADDOPTS shapes outside
// #674's scope, the strict CI-mention rule's narrowing, and the nox empty-posargs rule.
//
// Each fixture runs tests/test_cache.py, whose every test is skipped. Under `-p no:skipping` pytest
// runs its tests, so where that option may be in force A1 must withhold the every-test-skipped rule;
// where nothing sets it, the rule rates tests/test_cache.py hollow.

export const CI = '.github/workflows/ci.yml';

/** Which item of the card a fixture probes; `pin` is a shape that must read exactly as on main. */
export type AddoptsShapeItem = 'A' | 'B' | 'C' | 'D' | 'F' | 'G' | 'pin';

export interface AddoptsShapeFixture {
  readonly name: string;
  readonly item: AddoptsShapeItem;
  readonly files: Readonly<Record<string, string>>;
}

/**
 * A workflow whose test job runs `stepLines` (raw YAML, step-list indent), with optional job-level
 * lines. `setup` puts the checkout and `pip install pytest` steps first.
 */
export const workflow = (stepLines: readonly string[], jobLines: readonly string[] = [], setup = true): string =>
  lines(
    'name: ci',
    'on:',
    '  push:',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    ...jobLines,
    '    steps:',
    ...(setup ? ['      - uses: actions/checkout@v4', '      - run: pip install pytest'] : []),
    ...stepLines,
  );

const MAKE_TEST = workflow(['      - run: make test']);
/** A Makefile whose `test` target runs pytest, after `head`. */
export const recipe = (...head: string[]): string => lines(...head, '', 'test:', '\tpytest');
const SKIPPING = 'PYTEST_ADDOPTS = -p no:skipping';
// A script CI runs with PYTEST_ADDOPTS set, which runs make test; it does not name the variable.
const CI_SCRIPT = { 'ci/test.sh': lines('#!/bin/sh', 'set -e', 'make test') };
const SCRIPT_STEP = workflow(['      - run: PYTEST_ADDOPTS=-q ./ci/test.sh']);
/** A job env: entry over `steps`, with no checkout and no install before them. */
const jobEnv = (value: string, steps: readonly string[]): string => workflow(steps, ['    env:', `      PYTEST_ADDOPTS: "${value}"`], false);
const TOX = (...testenv: string[]): string => lines('[tox]', 'envlist = py', '', '[testenv]', ...testenv);

export const ADDOPTS_SHAPE_FIXTURES: readonly AddoptsShapeFixture[] = [
  // Item A: an export read as GNU make reads it.
  { name: 'a1shape-a-multi-name-export-no-mention', item: 'A', files: { Makefile: recipe(SKIPPING, 'export FOO PYTEST_ADDOPTS'), [CI]: MAKE_TEST } },
  {
    name: 'a1shape-a-multi-name-export-mention-not-read',
    item: 'A',
    files: { Makefile: recipe(SKIPPING, 'export FOO PYTEST_ADDOPTS'), ...CI_SCRIPT, [CI]: SCRIPT_STEP },
  },
  { name: 'a1shape-a-export-assignment-value-holds-the-name', item: 'A', files: { Makefile: recipe('export FOO = bar PYTEST_ADDOPTS', SKIPPING), [CI]: MAKE_TEST } },
  { name: 'a1shape-a-export-variable-name-list', item: 'A', files: { Makefile: recipe('NAMES = PYTEST_ADDOPTS', SKIPPING, 'export $(NAMES)'), [CI]: MAKE_TEST } },
  { name: 'a1shape-a-unexport-names-it', item: 'A', files: { Makefile: recipe(`export ${SKIPPING}`, 'unexport PYTEST_ADDOPTS'), [CI]: MAKE_TEST } },
  { name: 'a1shape-a-bare-unexport', item: 'A', files: { Makefile: recipe(`export ${SKIPPING}`, 'unexport'), [CI]: MAKE_TEST } },
  { name: 'a1shape-a-export-inside-ifdef', item: 'A', files: { Makefile: recipe(SKIPPING, 'ifdef CI', 'export PYTEST_ADDOPTS', 'endif'), [CI]: MAKE_TEST } },
  {
    name: 'a1shape-a-export-inside-define',
    item: 'A',
    files: { Makefile: recipe(SKIPPING, 'define EXPORTS', 'export PYTEST_ADDOPTS', 'endef', '$(eval $(EXPORTS))'), [CI]: MAKE_TEST },
  },
  { name: 'a1shape-a-names-before-an-operator', item: 'A', files: { Makefile: recipe(SKIPPING, 'export FOO PYTEST_ADDOPTS = -q'), [CI]: MAKE_TEST } },

  // Item B: a PYTEST_ADDOPTS mention in a file the readers do not read.
  {
    name: 'a1shape-b-script-sets-and-runs-make',
    item: 'B',
    files: { Makefile: recipe(), 'scripts/test.sh': lines('#!/bin/sh', 'export PYTEST_ADDOPTS="-p no:skipping"', 'make test'), [CI]: MAKE_TEST },
  },
  {
    name: 'a1shape-b-script-sets-and-runs-pytest',
    item: 'B',
    files: { 'scripts/test.sh': lines('#!/bin/sh', 'PYTEST_ADDOPTS="-p no:skipping" pytest') },
  },
  {
    name: 'a1shape-b-script-and-a-makefile-default',
    item: 'B',
    files: { Makefile: recipe('PYTEST_ADDOPTS ?= -q'), 'scripts/test.sh': lines('#!/bin/sh', 'export PYTEST_ADDOPTS="-p no:skipping"', 'make test'), [CI]: MAKE_TEST },
  },
  {
    // A script whose content is a Git LFS pointer: what it holds is not in the checkout.
    name: 'a1shape-b-lfs-pointer-script',
    item: 'B',
    files: {
      Makefile: recipe(),
      'scripts/test.sh': lines('version https://git-lfs.github.com/spec/v1', `oid sha256:${'4d7a'.repeat(16)}`, 'size 2048'),
      [CI]: MAKE_TEST,
    },
  },
  {
    name: 'a1shape-b-ci-mention-keeps-precedence',
    item: 'B',
    files: {
      Makefile: recipe(SKIPPING),
      ...CI_SCRIPT,
      'scripts/other.sh': lines('#!/bin/sh', 'export PYTEST_ADDOPTS=-x', 'pytest'),
      [CI]: SCRIPT_STEP,
    },
  },

  // Item C: a tox setenv before make.
  {
    name: 'a1shape-c-tox-setenv-then-make',
    item: 'C',
    files: { Makefile: recipe(), 'tox.ini': TOX('setenv =', '    PYTEST_ADDOPTS=-p no:skipping', 'commands = make test'), [CI]: workflow(['      - run: tox']) },
  },
  {
    name: 'a1shape-c-tox-setenv-one-line-commands-pre',
    item: 'C',
    files: { Makefile: recipe(), 'tox.ini': TOX('setenv = PYTEST_ADDOPTS=-q', 'commands_pre = make test', 'commands = python -c pass'), [CI]: workflow(['      - run: tox']) },
  },
  {
    name: 'a1shape-c-tox-named-environment-inherits-setenv',
    item: 'C',
    files: {
      Makefile: recipe(),
      'tox.ini': lines('[tox]', 'envlist = unit', '', '[testenv]', 'setenv =', '    PYTEST_ADDOPTS=-p no:skipping', '', '[testenv:unit]', 'commands = make test'),
      [CI]: workflow(['      - run: tox']),
    },
  },

  // Item D: an included makefile.
  { name: 'a1shape-d-include', item: 'D', files: { Makefile: recipe('include ci.mk'), 'ci.mk': lines(`export ${SKIPPING}`), [CI]: MAKE_TEST } },
  { name: 'a1shape-d-dash-include', item: 'D', files: { Makefile: recipe('-include ci.mk'), 'ci.mk': lines(`export ${SKIPPING}`), [CI]: MAKE_TEST } },
  { name: 'a1shape-d-sinclude', item: 'D', files: { Makefile: recipe('sinclude ci.mk'), 'ci.mk': lines(`export ${SKIPPING}`), [CI]: MAKE_TEST } },
  {
    name: 'a1shape-d-include-command-line-value-first',
    item: 'D',
    files: { Makefile: recipe('include ci.mk'), 'ci.mk': lines(`export ${SKIPPING}`), [CI]: workflow(['      - run: make test PYTEST_ADDOPTS=-x']) },
  },

  // Item F (#713): a step that cannot run make does not make a mention not read.
  {
    name: 'a1shape-f-step-env-set-e-then-make',
    item: 'F',
    files: {
      Makefile: recipe('PYTEST_ADDOPTS = -q'),
      [CI]: workflow(['      - run: |', '          set -e', '          make test', '        env:', '          PYTEST_ADDOPTS: "-p no:skipping"']),
    },
  },
  {
    name: 'a1shape-f-job-env-package-install-then-make',
    item: 'F',
    files: { Makefile: recipe('PYTEST_ADDOPTS = -q'), [CI]: jobEnv('-p no:skipping', ['      - run: pip install pytest', '      - run: make test']) },
  },
  {
    name: 'a1shape-f-job-env-builtins-then-make',
    item: 'F',
    files: { Makefile: recipe('PYTEST_ADDOPTS = -q'), [CI]: jobEnv('-p no:skipping', ['      - run: set -eu; true; echo ready', '      - run: make test']) },
  },
  {
    name: 'a1shape-f-requirements-install-stays-not-read',
    item: 'F',
    files: { Makefile: recipe('PYTEST_ADDOPTS = -q'), [CI]: jobEnv('-p no:skipping', ['      - run: pip install -r requirements.txt', '      - run: make test']) },
  },
  {
    name: 'a1shape-f-editable-install-stays-not-read',
    item: 'F',
    files: { Makefile: recipe('PYTEST_ADDOPTS = -q'), [CI]: jobEnv('-p no:skipping', ['      - run: pip install -e .', '      - run: make test']) },
  },
  {
    name: 'a1shape-f-script-call-stays-not-read',
    item: 'F',
    files: { Makefile: recipe('PYTEST_ADDOPTS = -q'), ...CI_SCRIPT, [CI]: jobEnv('-p no:skipping', ['      - run: ./ci/test.sh', '      - run: make test']) },
  },
  {
    name: 'a1shape-f-print-to-github-env-stays-not-read',
    item: 'F',
    files: { Makefile: recipe('PYTEST_ADDOPTS = -q'), [CI]: jobEnv('-p no:skipping', ['      - run: echo "CI=1" >> "$GITHUB_ENV"', '      - run: make test']) },
  },
  {
    name: 'a1shape-f-print-substitution-stays-not-read',
    item: 'F',
    files: { Makefile: recipe('PYTEST_ADDOPTS = -q'), [CI]: jobEnv('-p no:skipping', ['      - run: echo "$(make test)"', '      - run: make test']) },
  },

  // Item G (#661): a nox call whose empty posargs set is the only run with its options over a file.
  {
    name: 'a1shape-g-nox-empty-posargs-only-run-over-file',
    item: 'G',
    files: {
      'noxfile.py': lines('import nox', '', '', '@nox.session', 'def tests(session):', '    session.install("pytest")', '    session.run("pytest", "-p", "no:skipping", *session.posargs)'),
      [CI]: workflow(['      - run: pip install nox', '      - run: nox -- tests/test_lru.py']),
    },
  },

  // No move where nothing changed.
  { name: 'a1shape-pin-export-line', item: 'pin', files: { Makefile: recipe(SKIPPING, 'export PYTEST_ADDOPTS'), [CI]: MAKE_TEST } },
  { name: 'a1shape-pin-bare-export', item: 'pin', files: { Makefile: recipe('export', SKIPPING), [CI]: MAKE_TEST } },
  { name: 'a1shape-pin-plain-makefile', item: 'pin', files: { Makefile: recipe(SKIPPING), [CI]: MAKE_TEST } },
  { name: 'a1shape-pin-export-other-name-in-ifdef', item: 'pin', files: { Makefile: recipe(SKIPPING, 'ifdef CI', 'export FOO', 'endif'), [CI]: MAKE_TEST } },
  { name: 'a1shape-pin-tox-no-setenv-make', item: 'pin', files: { Makefile: recipe(), 'tox.ini': TOX('commands = make test'), [CI]: workflow(['      - run: tox']) } },
  { name: 'a1shape-pin-readme-names-it', item: 'pin', files: { 'README.md': lines('# cachelib', '', 'Set PYTEST_ADDOPTS to pass options.') } },
  { name: 'a1shape-pin-include-word-in-recipe', item: 'pin', files: { Makefile: lines('test:', '\tinclude=1 pytest'), [CI]: MAKE_TEST } },
];

/** The fixture as the false-assurance builder takes it: PY_BASE with tests/test_cache.py's tests skipped. */
export function addoptsShapeFixture(fixture: AddoptsShapeFixture): FalseAssuranceFixture {
  return {
    name: fixture.name,
    issue: fixture.item === 'F' ? '#713' : fixture.item === 'G' ? '#661' : '#705',
    purpose: fixture.name,
    commits: [{ ...PY_BASE, 'tests/test_cache.py': SKIPPED_CACHE_TEST, ...fixture.files }],
  };
}
