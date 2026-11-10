import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { readPytestInvocations } from '../repo-signals.js';
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
    // The review of #698, item A: named with the CI mention not read and pointed at its line (it was
    // the assignment at 46d7cbe27).
    it(`unexported ${operator} with a script CI runs with PYTEST_ADDOPTS set, which runs make test: not known, pointed at the mention`, () => {
      const name = `a1asgn-script-sets-addopts-${slug}`;
      const v27 = expectWithheld(
        name,
        { Makefile: recipe('# test options', `PYTEST_ADDOPTS ${operator} -p no:skipping`), ...CI_SCRIPT, [CI]: SCRIPT_STEP },
        `pytest run not read: \`- run: PYTEST_ADDOPTS=-q ./ci/test.sh\` in ${CI}`,
      );
      expectPointerAt(name, v27, CI, 10);
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

// goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item A (blocker 1 of the review of #698 at
// 46d7cbe27; operator ruling of 10 Nov): an `env:` entry (step, job or workflow), a `$GITHUB_ENV`
// write or an `export` counts as read only where every command it reaches is a CI make command the
// reader reads. Where it reaches a script, a launcher or anything else, it is a mention not read, and
// an unexported ?=, =, :=, ::= or += of PYTEST_ADDOPTS leaves the runs its targets reach not read,
// named with the first mention not read and pointed at its line.
describe('v27 A1, review of #698, item A: a mention is read only where it reaches a make command the reader reads', () => {
  const STEP_ENV_SCRIPT = workflow(['      - run: ./ci/test.sh', '        env:', '          PYTEST_ADDOPTS: -q']);
  for (const [operator, slug] of [
    ['=', 'eq'],
    ['?=', 'default'],
  ] as const) {
    it(`a step-level env: entry on a step that runs a script, which runs make test, with an unexported ${operator}: not known`, () => {
      const name = `a1rev-step-env-script-${slug}`;
      const v27 = expectWithheld(
        name,
        { Makefile: recipe(`PYTEST_ADDOPTS ${operator} -p no:skipping`), ...CI_SCRIPT, [CI]: STEP_ENV_SCRIPT },
        `pytest run not read: \`PYTEST_ADDOPTS: -q\` in ${CI}`,
      );
      expectPointerAt(name, v27, CI, 12);
    });
  }

  it('a job-level env: entry over a step that runs a script, with an unexported =: not known', () => {
    const name = 'a1rev-job-env-script-eq';
    const jobEnv = lines(
      'name: ci',
      'on:',
      '  push:',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    env:',
      '      PYTEST_ADDOPTS: -q',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: ./ci/test.sh',
    );
    const v27 = expectWithheld(
      name,
      { Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping'), ...CI_SCRIPT, [CI]: jobEnv },
      `pytest run not read: \`PYTEST_ADDOPTS: -q\` in ${CI}`,
    );
    expectPointerAt(name, v27, CI, 8);
  });

  it('a $GITHUB_ENV write, then a step that runs a script, with an unexported =: not known', () => {
    const name = 'a1rev-github-env-script-eq';
    const v27 = expectWithheld(
      name,
      {
        Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping'),
        ...CI_SCRIPT,
        [CI]: workflow(['      - run: echo "PYTEST_ADDOPTS=-q" >> "$GITHUB_ENV"', '      - run: ./ci/test.sh']),
      },
      `pytest run not read: \`- run: echo "PYTEST_ADDOPTS=-q" >> "$GITHUB_ENV"\` in ${CI}`,
    );
    expectPointerAt(name, v27, CI, 10);
  });

  it('an export in a step that then runs a script, with an unexported =: not known', () => {
    const name = 'a1rev-export-script-eq';
    const v27 = expectWithheld(
      name,
      { Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping'), ...CI_SCRIPT, [CI]: workflow(['      - run: export PYTEST_ADDOPTS=-q; ./ci/test.sh']) },
      `pytest run not read: \`- run: export PYTEST_ADDOPTS=-q; ./ci/test.sh\` in ${CI}`,
    );
    expectPointerAt(name, v27, CI, 10);
  });

  it('a GitLab variables: entry over a script that runs make test, with an unexported =: not known', () => {
    const name = 'a1rev-gitlab-variables-script-eq';
    const gitlab = lines('variables:', '  PYTEST_ADDOPTS: -q', '', 'test:', '  script:', '    - ./ci/test.sh');
    const v27 = expectWithheld(
      name,
      { Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping'), ...CI_SCRIPT, '.gitlab-ci.yml': gitlab },
      'pytest run not read: `PYTEST_ADDOPTS: -q` in .gitlab-ci.yml',
    );
    expectPointerAt(name, v27, '.gitlab-ci.yml', 2);
  });

  it('pin: a step-level env: entry on a step that runs make test itself is read: make passes the Makefile value, as before', () => {
    expectWithheld(
      'a1rev-pin-step-env-make',
      {
        Makefile: recipe('PYTEST_ADDOPTS = -p no:skipping'),
        [CI]: workflow(['      - run: make test', '        env:', '          PYTEST_ADDOPTS: -q']),
      },
      MAKEFILE_VALUE,
    );
  });
});

// goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item B (blocker 2): a Makefile assignment
// with leading spaces is read; a tab-led line in a rule stays a recipe line, as GNU make reads it.
describe('v27 A1, review of #698, item B: an indented Makefile assignment is read', () => {
  it('an unexported = with leading spaces, with a script CI runs with PYTEST_ADDOPTS set: not known', () => {
    const name = 'a1rev-indented-unexported-eq';
    const v27 = expectWithheld(
      name,
      { Makefile: recipe('  PYTEST_ADDOPTS = -p no:skipping'), ...CI_SCRIPT, [CI]: SCRIPT_STEP },
      `pytest run not read: \`- run: PYTEST_ADDOPTS=-q ./ci/test.sh\` in ${CI}`,
    );
    expectPointerAt(name, v27, CI, 10);
  });

  it('an exported = with leading spaces reaches the recipe', () => {
    expectWithheld(
      'a1rev-indented-export-eq',
      { Makefile: recipe('  export PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(['      - run: make test']) },
      MAKEFILE_VALUE,
    );
  });

  it('pin: a tab-led line in a rule that looks like an assignment is a recipe line, not an assignment', () => {
    expectHollow('a1rev-pin-tab-recipe-line', {
      Makefile: lines('test:', '\texport PYTEST_ADDOPTS = -p no:skipping', '\tpytest'),
      [CI]: workflow(['      - run: make test']),
    });
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

  it('the budget is one count across the lines and the tox.ini files of a read', () => {
    // One CI set of 1,500 words: each {posargs} line costs 1 + 1 + 1,500 = 1,502. The root tox.ini's
    // two lines take 3,004 of 4,096; the third line, in sub/tox.ini, would take it to -410.
    const words = Array.from({ length: 1500 }, (_, index) => `-kw${index}`);
    const texts = new Map([
      ['tox.ini', lines('[tox]', 'envlist = py', '', '[testenv]', 'commands =', '    pytest {posargs} tests/a', '    pytest {posargs} tests/b')],
      ['sub/tox.ini', lines('[tox]', 'envlist = py', '', '[testenv]', 'commands = pytest {posargs} tests/c')],
      [CI, workflow([`      - run: tox -e py -- ${words.join(' ')}`])],
    ]);
    const read = readPytestInvocations([...texts.keys()], (file) => texts.get(file));
    const posargsRead = (path: string) => read.some(({ args }) => args.includes(path) && args.includes('-kw1499'));
    expect(posargsRead('tests/a')).toBe(true);
    expect(posargsRead('tests/b')).toBe(true);
    expect(read.filter(({ unread }) => unread !== undefined).map(({ file, unread }) => `${file}: ${unread}`)).toEqual(['sub/tox.ini: pytest {posargs} tests/c']);
  });

  it('control: the same line with a CI set inside the budget is read, and rated hollow', () => {
    expectHollow('a1tox-posargs-within-budget', {
      'tox.ini': lines('[tox]', 'envlist = py', '', '[testenv]', 'deps = pytest', 'commands = pytest {posargs}'),
      [CI]: workflow([`      - run: tox -e py -- ${Array.from({ length: 100 }, () => '-q').join(' ')}`]),
    });
  });
});
