import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { PY_BASE, SKIPPED_CACHE_TEST, lines } from './fixtures/v27-a1-removal-fixtures.js';

// goal_cejel_v27_a1_addopts_assignment_not_known_2026-11-10 (#674, #653).
//
// Item A (#674; operator ruling of 10 Nov, reversing the 5 Nov card text for this case): GNU make
// passes an unexported Makefile variable to a recipe only where the variable is already in make's
// environment, and then with the Makefile's value. So where a Makefile assigns PYTEST_ADDOPTS with
// `=`, `:=` or `+=` and does not export it, and a CI file names PYTEST_ADDOPTS anywhere the readers do
// not read as an environment, the Makefile's value is not known: the pytest runs its targets reach
// are named "pytest run not read", with the assignment as the reason and a pointer at its line. Where
// every CI mention is one the readers read, and wherever the assignment is exported, the reading is
// kept.
//
// Item B (#653): a tox.ini line holding {posargs} is read once per literal CI posargs set, against a
// budget shared with the nox reader's kind (one unit per run read plus the words put in); past it the
// line is named as a run not read.
//
// Each fixture runs tests/test_cache.py, whose every test is skipped. Under `-p no:skipping` pytest
// runs its tests, so where the options are not known A1 must withhold the every-test-skipped rule.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const CI = '.github/workflows/ci.yml';

const MAKEFILE_VALUE = 'every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in Makefile';
const HOLLOW = 'rated hollow here';

const fixture = (name: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: name.startsWith('a1tox-') ? '#653' : '#674',
  purpose: name,
  commits: [{ ...PY_BASE, 'tests/test_cache.py': SKIPPED_CACHE_TEST, ...files }],
});

/** A workflow whose test job runs `stepLines` (raw YAML, step-list indent). */
const workflow = (stepLines: readonly string[]): string =>
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
    ...stepLines,
  );

const recipe = (...head: string[]) => lines(...head, '', 'test:', '\tpytest');
// A script CI runs, which runs make itself: the reader does not follow it.
const CI_SCRIPT = { 'ci/test.sh': lines('#!/bin/sh', 'set -e', 'make test') };
const SCRIPT_STEP = workflow(['      - run: PYTEST_ADDOPTS=-q ./ci/test.sh']);

function a1(name: string, files: Readonly<Record<string, string>>): { v17: WitanCriterionScore; v27: WitanCriterionScore } {
  const repo = buildFalseAssuranceFixture(fixture(name, files));
  const score = (rubricVersion: string): WitanCriterionScore => {
    const report = scoreRepoWithPublicCejel({
      repoPath: repo,
      productSlug: 'false-assurance-fixture',
      productDisplayName: 'False-assurance fixture',
      generatedAt: '2026-11-10T00:00:00.000Z',
      rubricVersion,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });
    const found = report.criteria.find(({ id }) => id === 'A1');
    if (!found) throw new Error('no A1');
    return found;
  };
  return { v17: score(V17), v27: score(V27) };
}

/** The rule is withheld, the note holds `clause`, and v27's A1 keeps v17's score. */
function expectWithheld(name: string, files: Readonly<Record<string, string>>, clause: string): WitanCriterionScore {
  const { v17, v27 } = a1(name, files);
  // A1's note opens each clause with a capital letter.
  const notes = (v27.notes ?? '').toLowerCase();
  expect(notes, name).not.toContain(HOLLOW);
  expect(notes, name).toContain(clause.toLowerCase());
  expect(v27.score, name).toBe(v17.score);
  return v27;
}

/** No setting is in force for the run: the every-test-skipped rule rates tests/test_cache.py hollow. */
function expectHollow(name: string, files: Readonly<Record<string, string>>): WitanCriterionScore {
  const { v27 } = a1(name, files);
  expect((v27.notes ?? '').toLowerCase(), name).toContain(HOLLOW);
  expect(v27.notes ?? '', name).toContain('tests/test_cache.py');
  return v27;
}

/** A pointer at `line` (1-based) of `path`, labelled as the run not read. */
function expectPointerAt(name: string, v27: WitanCriterionScore, path: string, line: number): void {
  expect(
    v27.evidence.some((entry) => entry.path === path && entry.line === line && (entry.label ?? '').startsWith('pytest run not read')),
    `${name}: a pointer at ${path} line ${line}`,
  ).toBe(true);
}

describe('v27 A1, item A (#674): an unexported =, := or += of PYTEST_ADDOPTS where CI names it somewhere the readers do not follow', () => {
  for (const [operator, slug] of [
    ['=', 'eq'],
    [':=', 'colon-eq'],
    ['+=', 'plus-eq'],
  ] as const) {
    it(`unexported ${operator} with a script CI runs with PYTEST_ADDOPTS set, which runs make test: not known, pointed at the assignment`, () => {
      const name = `a1asgn-script-sets-addopts-${slug}`;
      // A comment line first, so the pointer is shown to be at the assignment's own line, not line 1.
      const v27 = expectWithheld(
        name,
        { Makefile: recipe('# test options', `PYTEST_ADDOPTS ${operator} -p no:skipping`), ...CI_SCRIPT, [CI]: SCRIPT_STEP },
        `pytest run not read: \`PYTEST_ADDOPTS ${operator} -p no:skipping\` in Makefile`,
      );
      expectPointerAt(name, v27, 'Makefile', 2);
    });
  }

  it('pin: unexported = where every CI mention is read (a leading assignment on make): make passes the Makefile value, as before', () => {
    expectWithheld(
      'a1asgn-pin-unexported-mentions-read-in-force',
      { Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(['      - run: PYTEST_ADDOPTS=-q make test']) },
      MAKEFILE_VALUE,
    );
  });

  it('pin: unexported = where CI never names PYTEST_ADDOPTS: no value reaches the recipe, as before', () => {
    expectHollow('a1asgn-pin-unexported-no-mention', { Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(['      - run: make test']) });
  });

  it('pin: export PYTEST_ADDOPTS := with a script mention keeps the Makefile value', () => {
    expectWithheld(
      'a1asgn-pin-export-colon-eq-script-mention',
      { Makefile: recipe('export PYTEST_ADDOPTS := -p no:skipping'), ...CI_SCRIPT, [CI]: SCRIPT_STEP },
      MAKEFILE_VALUE,
    );
  });

  it('pin: an assignment exported by its own export line, with a script mention, keeps the Makefile value', () => {
    expectWithheld(
      'a1asgn-pin-export-line-script-mention',
      { Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping', 'export PYTEST_ADDOPTS'), ...CI_SCRIPT, [CI]: SCRIPT_STEP },
      MAKEFILE_VALUE,
    );
  });

  it('pin: .EXPORT_ALL_VARIABLES with a script mention keeps the Makefile value', () => {
    expectWithheld(
      'a1asgn-pin-export-all-script-mention',
      { Makefile: recipe('.EXPORT_ALL_VARIABLES:', 'PYTEST_ADDOPTS = -p no:skipping'), ...CI_SCRIPT, [CI]: SCRIPT_STEP },
      MAKEFILE_VALUE,
    );
  });
});

describe('v27 A1, item B (#653): tox posargs past the shared budget', () => {
  it('a tox.ini {posargs} line whose CI posargs exceed the budget: the run is named not read', () => {
    // One CI set of 4,100 words: reading the line costs one unit per run read plus the words put in,
    // 1 + 1 + 4,100 = 4,102, past the budget of 4,096.
    const words = Array.from({ length: 4100 }, () => '-q').join(' ');
    const name = 'a1tox-posargs-past-budget';
    const v27 = expectWithheld(
      name,
      { 'tox.ini': lines('[tox]', 'envlist = py', '', '[testenv]', 'deps = pytest', 'commands = pytest {posargs}'), [CI]: workflow([`      - run: tox -e py -- ${words}`]) },
      'pytest run not read: `pytest {posargs}` in tox.ini',
    );
    expectPointerAt(name, v27, 'tox.ini', 6);
  });

  it('control: the same line with a CI set inside the budget is read, and rated hollow', () => {
    expectHollow('a1tox-posargs-within-budget', {
      'tox.ini': lines('[tox]', 'envlist = py', '', '[testenv]', 'deps = pytest', 'commands = pytest {posargs}'),
      [CI]: workflow([`      - run: tox -e py -- ${Array.from({ length: 100 }, () => '-q').join(' ')}`]),
    });
  });
});
