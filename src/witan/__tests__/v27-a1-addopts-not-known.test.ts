import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { PY_BASE, SKIPPED_CACHE_TEST, lines } from './fixtures/v27-a1-removal-fixtures.js';

// goal_cejel_v27_a1_addopts_not_known_2026-11-05 (#669, #673).
//
// Item A (#669): where a GitHub Actions step, its job or its workflow sets PYTEST_ADDOPTS by an
// expression, a pytest run on that step is named "pytest run not read", with the env: entry as the
// reason and a pointer at its line. The most specific level that sets it decides: a literal at a
// more specific level is read as now.
// Item B (#673): a Makefile `?=` default of PYTEST_ADDOPTS keeps #670's reading only where every
// mention of PYTEST_ADDOPTS in the CI files is one the reader reads; elsewhere the default is not
// known again, and the runs its targets reach are named "pytest run not read", as before #670.
//
// Each fixture runs tests/test_cache.py, whose every test is skipped. Under `-p no:skipping` pytest
// runs its tests, so where the options are not known A1 must withhold the every-test-skipped rule.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const CI = '.github/workflows/ci.yml';

const ENVIRONMENT_VALUE = `every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in ${CI}`;
const MAKEFILE_VALUE = 'every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in Makefile';
const HOLLOW = 'rated hollow here';

const fixture = (name: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: name.startsWith('a1qdef-') ? '#673' : '#669',
  purpose: name,
  commits: [{ ...PY_BASE, 'tests/test_cache.py': SKIPPED_CACHE_TEST, ...files }],
});

/** A workflow whose test job runs `stepLines` (raw YAML, step-list indent), with optional workflow- and job-level lines. */
const workflow = (stepLines: readonly string[], jobLines: readonly string[] = [], rootLines: readonly string[] = []): string =>
  lines(
    'name: ci',
    'on:',
    '  push:',
    ...rootLines,
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    ...jobLines,
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pip install pytest',
    ...stepLines,
  );

const recipe = (...head: string[]) => lines(...head, '', 'test:', '\tpytest');
// A script CI runs, which runs make itself: the reader does not follow it.
const CI_SCRIPT = { 'ci/test.sh': lines('#!/bin/sh', 'set -e', 'make test') };

function a1(name: string, files: Readonly<Record<string, string>>): { v17: WitanCriterionScore; v27: WitanCriterionScore } {
  const repo = buildFalseAssuranceFixture(fixture(name, files));
  const score = (rubricVersion: string): WitanCriterionScore => {
    const report = scoreRepoWithPublicCejel({
      repoPath: repo,
      productSlug: 'false-assurance-fixture',
      productDisplayName: 'False-assurance fixture',
      generatedAt: '2026-11-05T00:00:00.000Z',
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

/** A pointer at `line` (1-based) of the workflow, labelled as the run not read. */
function expectPointerAt(name: string, v27: WitanCriterionScore, line: number): void {
  expect(
    v27.evidence.some((entry) => entry.path === CI && entry.line === line && (entry.label ?? '').startsWith('pytest run not read')),
    `${name}: a pointer at the env: entry, line ${line}`,
  ).toBe(true);
}

describe('v27 A1, item A (#669): an env: expression on a step that runs pytest itself', () => {
  it('a job env: expression on a pytest step: the run is not read, pointed at the entry', () => {
    const name = 'a1expr-job-env-pytest';
    const v27 = expectWithheld(
      name,
      { [CI]: workflow(['      - run: pytest'], ['    env:', '      PYTEST_ADDOPTS: ${{ matrix.pytest-options }}']) },
      `pytest run not read: \`PYTEST_ADDOPTS: \${{ matrix.pytest-options }}\` in ${CI}`,
    );
    expectPointerAt(name, v27, 8);
  });

  it('a workflow-level expression: the run is not read, pointed at the entry', () => {
    const name = 'a1expr-workflow-env-pytest';
    const v27 = expectWithheld(
      name,
      { [CI]: workflow(['      - run: pytest'], [], ['env:', '  PYTEST_ADDOPTS: ${{ inputs.pytest-options }}']) },
      `pytest run not read: \`PYTEST_ADDOPTS: \${{ inputs.pytest-options }}\` in ${CI}`,
    );
    expectPointerAt(name, v27, 5);
  });

  it('a step-level expression on pytest run as a Python module', () => {
    const name = 'a1expr-step-env-python-module';
    const v27 = expectWithheld(
      name,
      { [CI]: workflow(['      - run: python -m pytest', '        env:', '          PYTEST_ADDOPTS: ${{ matrix.opts }}']) },
      `pytest run not read: \`PYTEST_ADDOPTS: \${{ matrix.opts }}\` in ${CI}`,
    );
    expectPointerAt(name, v27, 12);
  });

  it('a quoted expression: the reason is the entry as written, and the pointer is at it', () => {
    const name = 'a1expr-job-env-quoted';
    const v27 = expectWithheld(
      name,
      { [CI]: workflow(['      - run: uv run pytest'], ['    env:', '      PYTEST_ADDOPTS: "${{ matrix.pytest-options }}"']) },
      `pytest run not read: \`PYTEST_ADDOPTS: "\${{ matrix.pytest-options }}"\` in ${CI}`,
    );
    expectPointerAt(name, v27, 8);
  });

  it('pin: a step literal overrides a job expression, and is read as now', () => {
    expectWithheld(
      'a1expr-step-literal-over-job-expression',
      {
        [CI]: workflow(
          ['      - run: pytest', '        env:', '          PYTEST_ADDOPTS: "-p no:skipping"'],
          ['    env:', '      PYTEST_ADDOPTS: ${{ matrix.pytest-options }}'],
        ),
      },
      ENVIRONMENT_VALUE,
    );
  });

  it('pin: a step literal overriding a job expression with an inert value reads no setting in force', () => {
    expectHollow('a1expr-step-inert-literal-over-job-expression', {
      [CI]: workflow(['      - run: pytest', '        env:', '          PYTEST_ADDOPTS: "-q"'], ['    env:', '      PYTEST_ADDOPTS: ${{ matrix.pytest-options }}']),
    });
  });

  it('control: a leading assignment on the pytest command overrides the expression for its run', () => {
    expectHollow('a1expr-command-assignment-over-expression', {
      [CI]: workflow(['      - run: PYTEST_ADDOPTS=-q pytest'], ['    env:', '      PYTEST_ADDOPTS: ${{ matrix.pytest-options }}']),
    });
  });
});

// goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item A: the runs a ?= default leaves not
// known are named with the first CI mention not read, pointed at its line (they were named
// `PYTEST_ADDOPTS` in Makefile at 46d7cbe27). A job env: entry over this file's `pip install pytest`
// step reaches a command that is not make, so it is such a mention: the two job env: pins moved to
// not read. The readings they held are kept on a job whose only run step is make, in
// v27-a1-make-environment.test.ts (a1rev-conditional-default and a1rev-conditional-default-env-inert).
describe('v27 A1, item B (#673): a ?= default where CI names PYTEST_ADDOPTS somewhere the reader does not follow', () => {
  it('?= with a script CI runs with PYTEST_ADDOPTS set, which runs make test: the default is not known', () => {
    expectWithheld(
      'a1qdef-script-sets-addopts',
      { Makefile: recipe('PYTEST_ADDOPTS ?= -q'), ...CI_SCRIPT, [CI]: workflow(['      - run: PYTEST_ADDOPTS="-p no:skipping" ./ci/test.sh']) },
      `pytest run not read: \`- run: PYTEST_ADDOPTS="-p no:skipping" ./ci/test.sh\` in ${CI}`,
    );
  });

  it('?= with PYTEST_ADDOPTS named in a step the reader does not read as make: the default is not known', () => {
    expectWithheld(
      'a1qdef-bash-c-mention',
      { Makefile: recipe('PYTEST_ADDOPTS ?= -q'), [CI]: workflow(['      - run: bash -c "PYTEST_ADDOPTS=\'-p no:skipping\' make test"']) },
      `pytest run not read: \`- run: bash -c "PYTEST_ADDOPTS='-p no:skipping' make test"\` in ${CI}`,
    );
  });

  it('?= with a job env: literal over a pip step as well as make: not read (was: hollow, #670)', () => {
    expectWithheld(
      'a1qdef-pin-job-env-literal-inert',
      { Makefile: recipe('PYTEST_ADDOPTS ?= -p no:skipping'), [CI]: workflow(['      - run: make test'], ['    env:', '      PYTEST_ADDOPTS: "-q"']) },
      `pytest run not read: \`PYTEST_ADDOPTS: "-q"\` in ${CI}`,
    );
  });

  it('?= with a job env: literal over a pip step as well as make: not read (was: the environment value, #670)', () => {
    expectWithheld(
      'a1qdef-pin-job-env-literal-in-force',
      { Makefile: recipe('PYTEST_ADDOPTS ?= -x'), [CI]: workflow(['      - run: make test'], ['    env:', '      PYTEST_ADDOPTS: "-p no:skipping"']) },
      `pytest run not read: \`PYTEST_ADDOPTS: "-p no:skipping"\` in ${CI}`,
    );
  });

  it('pin: ?= with an earlier export in the same run: keeps #670', () => {
    expectHollow('a1qdef-pin-export-inert', {
      Makefile: recipe('PYTEST_ADDOPTS ?= -p no:skipping'),
      [CI]: workflow(['      - run: |', '          export PYTEST_ADDOPTS=-q', '          make test']),
    });
  });

  it('pin: ?= with a leading assignment and an env prefix on make keeps #670', () => {
    expectHollow('a1qdef-pin-make-prefixes-inert', {
      Makefile: recipe('PYTEST_ADDOPTS ?= -p no:skipping'),
      [CI]: workflow(['      - run: PYTEST_ADDOPTS=-q make test', '      - run: env PYTEST_ADDOPTS=-q make test']),
    });
  });

  it('pin: = with a script mention keeps #670 (make passes the Makefile value)', () => {
    expectWithheld(
      'a1qdef-pin-assignment-script-mention',
      { Makefile: recipe('export PYTEST_ADDOPTS = -p no:skipping'), ...CI_SCRIPT, [CI]: workflow(['      - run: PYTEST_ADDOPTS=-q ./ci/test.sh']) },
      MAKEFILE_VALUE,
    );
  });

  it('pin: += with a script mention keeps #670', () => {
    expectWithheld(
      'a1qdef-pin-append-script-mention',
      { Makefile: recipe('export PYTEST_ADDOPTS += -p no:skipping'), ...CI_SCRIPT, [CI]: workflow(['      - run: PYTEST_ADDOPTS=-q ./ci/test.sh']) },
      MAKEFILE_VALUE,
    );
  });
});
