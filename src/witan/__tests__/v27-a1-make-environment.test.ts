import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { PY_BASE, SKIPPED_CACHE_TEST, lines } from './fixtures/v27-a1-removal-fixtures.js';

// goal_cejel_v27_a1_makefile_addopts_environment_2026-11-04 (#633 item D, #634 item 3).
//
// Item A: where the CI command that runs make has PYTEST_ADDOPTS in its environment, a recipe's
// pytest runs with the Makefile's value (`=`, `:=`, `::=`; for `+=` the environment's value
// followed by the Makefile's), or with the environment's value (`?=`, no assignment, `make -e`).
// Item B: pins for the forms main already reads right (rulings 1 and 2 of 4 Nov). Item C: a
// collection hook defined as a method of a plugin class is named as not read, at its `def`.
//
// Each fixture runs tests/test_cache.py, whose every test is skipped. Under `-p no:skipping` pytest
// runs its tests, so A1 must withhold the every-test-skipped rule and say where the setting is.
// Ground truth: GNU make's documented rules for the environment, `-e`, `?=`, `+=` and export
// ("Variables from the Environment", "Communicating Variables to a Sub-make"), and the operator's
// probe of 4 Nov with GNU Make 3.81. make could not be run in this session.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const CI = '.github/workflows/ci.yml';

const MAKEFILE_VALUE = 'every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in Makefile';
const ENVIRONMENT_VALUE = `every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in ${CI}`;
const HOLLOW = 'rated hollow here';

const fixture = (name: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: '#633',
  purpose: name,
  commits: [{ ...PY_BASE, 'tests/test_cache.py': SKIPPED_CACHE_TEST, ...files }],
});

/**
 * A workflow whose test job runs `stepLines` (raw YAML, step-list indent), with optional workflow- and
 * job-level lines. goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item A: `makeOnly` drops
 * the `pip install pytest` step, so a job- or workflow-level env: entry reaches make commands only.
 * Fix round on #710, item A: it drops the `actions/checkout` step too, since a `uses:` step is one the
 * reader does not follow (the strict rule; the shape with checkout is pinned after the make-only cases).
 */
const workflow = (stepLines: readonly string[], jobLines: readonly string[] = [], rootLines: readonly string[] = [], makeOnly = false): string =>
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
    ...(makeOnly ? [] : ['      - uses: actions/checkout@v4', '      - run: pip install pytest']),
    ...stepLines,
  );
/** The review of #698, item A: the clause of a run left not read by an env: entry that reaches `pip install pytest`. */
const notReadByEntry = (value: string) => `pytest run not read: \`PYTEST_ADDOPTS: "${value}"\` in ${CI}`;

const MAKE_TEST = ['      - run: make test'];
const recipe = (...head: string[]) => lines(...head, '', 'test:', '\tpytest');
const UNEXPORTED = recipe('PYTEST_ADDOPTS = -p no:skipping');

function a1(
  name: string,
  files: Readonly<Record<string, string>>,
  skippedCacheTest = true,
): { v17: WitanCriterionScore; v27: WitanCriterionScore } {
  const built = fixture(name, files);
  // Item C's fixtures keep PY_BASE's live tests: the hook, not a skipped file, is what they probe.
  const repo = buildFalseAssuranceFixture(skippedCacheTest ? built : { ...built, commits: [{ ...PY_BASE, ...files }] });
  const score = (rubricVersion: string): WitanCriterionScore => {
    const report = scoreRepoWithPublicCejel({
      repoPath: repo,
      productSlug: 'false-assurance-fixture',
      productDisplayName: 'False-assurance fixture',
      generatedAt: '2026-11-04T00:00:00.000Z',
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
function expectWithheld(name: string, files: Readonly<Record<string, string>>, clause: string | RegExp): WitanCriterionScore {
  const { v17, v27 } = a1(name, files);
  // A1's note opens each clause with a capital letter.
  const notes = (v27.notes ?? '').toLowerCase();
  expect(notes, name).not.toContain(HOLLOW);
  if (typeof clause === 'string') expect(notes, name).toContain(clause.toLowerCase());
  else expect(v27.notes ?? '', name).toMatch(new RegExp(clause.source, 'i'));
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

// goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item A: a job- or workflow-level env: entry
// also reaches this file's `pip install pytest` step, which is not a make command the reader reads,
// so it is a mention not read, and a Makefile's unexported assignment of PYTEST_ADDOPTS (?= included)
// leaves the runs not read, named with the entry. These v27 pins moved there from the reading each
// test's name states (kept, on a job whose only run step is make, in the describe after this one).
describe('v27 A1, item A: PYTEST_ADDOPTS in the environment of the command that runs make', () => {
  it('a job-level env: PYTEST_ADDOPTS over a pip step as well as make: not read (was: make passes the Makefile value)', () => {
    expectWithheld('a1env-job-env-makefile-value', { Makefile: UNEXPORTED, [CI]: workflow(MAKE_TEST, ['    env:', '      PYTEST_ADDOPTS: "-q"']) }, notReadByEntry('-q'));
  });

  it('a workflow-level env: PYTEST_ADDOPTS over a pip step as well as make: not read', () => {
    expectWithheld('a1env-workflow-env-makefile-value', { Makefile: UNEXPORTED, [CI]: workflow(MAKE_TEST, [], ['env:', '  PYTEST_ADDOPTS: "-q"']) }, notReadByEntry('-q'));
  });

  it('a step-level env: PYTEST_ADDOPTS on the make step', () => {
    expectWithheld(
      'a1env-step-env-makefile-value',
      { Makefile: UNEXPORTED, [CI]: workflow(['      - run: make test', '        env:', '          PYTEST_ADDOPTS: "-q"']) },
      MAKEFILE_VALUE,
    );
  });

  it('an earlier step writes PYTEST_ADDOPTS to $GITHUB_ENV, in a file with a pip step: not read, named with the write', () => {
    expectWithheld(
      'a1env-github-env-write',
      { Makefile: UNEXPORTED, [CI]: workflow(['      - run: echo "PYTEST_ADDOPTS=-q" >> "$GITHUB_ENV"', ...MAKE_TEST]) },
      `pytest run not read: \`- run: echo "PYTEST_ADDOPTS=-q" >> "$GITHUB_ENV"\` in ${CI}`,
    );
  });

  it('a leading PYTEST_ADDOPTS=... on the make command', () => {
    expectWithheld('a1env-leading-assignment', { Makefile: UNEXPORTED, [CI]: workflow(['      - run: PYTEST_ADDOPTS=-q make test']) }, MAKEFILE_VALUE);
  });

  it('an export PYTEST_ADDOPTS=... earlier in the same run:', () => {
    expectWithheld(
      'a1env-shell-export',
      { Makefile: UNEXPORTED, [CI]: workflow(['      - run: |', '          export PYTEST_ADDOPTS=-q', '          make test']) },
      MAKEFILE_VALUE,
    );
  });

  it('no Makefile value: the environment value reaches the recipe pytest through make', () => {
    expectWithheld(
      'a1env-no-makefile-value',
      { Makefile: recipe(), [CI]: workflow(MAKE_TEST, ['    env:', '      PYTEST_ADDOPTS: "-p no:skipping"']) },
      ENVIRONMENT_VALUE,
    );
  });

  it('a ?= default, with the job env: over a pip step: not read', () => {
    expectWithheld(
      'a1env-conditional-default',
      { Makefile: recipe('PYTEST_ADDOPTS ?= -x'), [CI]: workflow(MAKE_TEST, ['    env:', '      PYTEST_ADDOPTS: "-p no:skipping"']) },
      notReadByEntry('-p no:skipping'),
    );
  });

  it('a += append, with the job env: over a pip step: not read', () => {
    expectWithheld(
      'a1env-append',
      { Makefile: recipe('PYTEST_ADDOPTS += -p no:skipping'), [CI]: workflow(MAKE_TEST, ['    env:', '      PYTEST_ADDOPTS: "-q"']) },
      notReadByEntry('-q'),
    );
  });

  it('make -e, with the job env: over a pip step: not read', () => {
    expectWithheld(
      'a1env-make-e',
      { Makefile: recipe('PYTEST_ADDOPTS = -x'), [CI]: workflow(['      - run: make -e test'], ['    env:', '      PYTEST_ADDOPTS: "-p no:skipping"']) },
      notReadByEntry('-p no:skipping'),
    );
  });

  it('an expression value: the recipe run is not read', () => {
    expectWithheld(
      'a1env-expression-value',
      { Makefile: recipe(), [CI]: workflow(MAKE_TEST, ['    env:', '      PYTEST_ADDOPTS: ${{ matrix.pytest-options }}']) },
      /pytest run not read: `PYTEST_ADDOPTS: \$\{\{ matrix\.pytest-options \}\}` in Makefile/,
    );
  });

  it('a non-GitHub CI file whose variables set PYTEST_ADDOPTS', () => {
    expectWithheld(
      'a1env-gitlab-variables',
      {
        Makefile: UNEXPORTED,
        [CI]: workflow(['      - run: echo build']),
        '.gitlab-ci.yml': lines('test:', '  variables:', '    PYTEST_ADDOPTS: "-q"', '  script:', '    - make test'),
      },
      MAKEFILE_VALUE,
    );
  });

  it('a ?= default with the environment set to -q, over a pip step: not read (was: hollow)', () => {
    expectWithheld(
      'a1env-conditional-default-env-inert',
      { Makefile: recipe('PYTEST_ADDOPTS ?= -p no:skipping'), [CI]: workflow(MAKE_TEST, ['    env:', '      PYTEST_ADDOPTS: "-q"']) },
      notReadByEntry('-q'),
    );
  });

  it('make -e with the environment set to -q, over a pip step: not read (was: hollow)', () => {
    expectWithheld(
      'a1env-make-e-env-inert',
      { Makefile: UNEXPORTED, [CI]: workflow(['      - run: make -e test'], ['    env:', '      PYTEST_ADDOPTS: "-q"']) },
      notReadByEntry('-q'),
    );
  });

  it('an environment set on a step that runs another target leaves the test target as make by hand reads it', () => {
    expectHollow('a1env-other-target', {
      Makefile: lines('PYTEST_ADDOPTS = -p no:skipping', '', 'test:', '\tpytest', '', 'docs:', '\techo docs'),
      [CI]: workflow(['      - run: make docs', '        env:', '          PYTEST_ADDOPTS: "-q"', ...MAKE_TEST]),
    });
  });

  it('an env prefix, env PYTEST_ADDOPTS=-q make test', () => {
    expectWithheld('a1env-env-prefix', { Makefile: UNEXPORTED, [CI]: workflow(['      - run: env PYTEST_ADDOPTS=-q make test']) }, MAKEFILE_VALUE);
  });

  it('make -e with an override assignment, over a pip step: not read', () => {
    expectWithheld(
      'a1env-make-e-override',
      { Makefile: recipe('override PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(['      - run: make -e test'], ['    env:', '      PYTEST_ADDOPTS: "-q"']) },
      notReadByEntry('-q'),
    );
  });

  it('make -C sub, with the job env: over a pip step: not read', () => {
    expectWithheld(
      'a1env-make-directory',
      {
        Makefile: lines('PYTEST_ADDOPTS = -x', '', 'test:', '\techo root'),
        'sub/Makefile': lines('PYTEST_ADDOPTS = -p no:skipping', '', 'test:', '\tpytest ../tests'),
        [CI]: workflow(['      - run: make -C sub test'], ['    env:', '      PYTEST_ADDOPTS: "-q"']),
      },
      notReadByEntry('-q'),
    );
  });

  it('control: the same job env with a step that runs pytest itself', () => {
    expectWithheld(
      'a1env-control-direct-pytest',
      { Makefile: recipe(), [CI]: workflow(['      - run: pytest'], ['    env:', '      PYTEST_ADDOPTS: "-p no:skipping"']) },
      ENVIRONMENT_VALUE,
    );
  });

  it("control: a value on make's command line is not read, as #648 reads it", () => {
    expectWithheld(
      'a1env-control-command-line',
      { Makefile: UNEXPORTED, [CI]: workflow(['      - run: make test PYTEST_ADDOPTS=-q'], ['    env:', '      PYTEST_ADDOPTS: "-q"']) },
      'pytest run not read: `PYTEST_ADDOPTS` in Makefile',
    );
  });
});

// goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item A: the readings the describe above held
// at 46d7cbe27, on a job whose only run step is make, where the env: entry reaches make commands only
// and is read: each keeps its reading.
describe('v27 A1, review of #698, item A: the same environments on a job whose only run step is make', () => {
  const jobEnv = (value: string) => ['    env:', `      PYTEST_ADDOPTS: "${value}"`];
  const cases: readonly { name: string; files: Readonly<Record<string, string>>; outcome: string | 'hollow' }[] = [
    { name: 'a1rev-job-env-makefile-value', files: { Makefile: UNEXPORTED, [CI]: workflow(MAKE_TEST, jobEnv('-q'), [], true) }, outcome: MAKEFILE_VALUE },
    { name: 'a1rev-workflow-env-makefile-value', files: { Makefile: UNEXPORTED, [CI]: workflow(MAKE_TEST, [], ['env:', '  PYTEST_ADDOPTS: "-q"'], true) }, outcome: MAKEFILE_VALUE },
    {
      name: 'a1rev-github-env-write',
      files: { Makefile: UNEXPORTED, [CI]: workflow(['      - run: echo "PYTEST_ADDOPTS=-q" >> "$GITHUB_ENV"', ...MAKE_TEST], [], [], true) },
      outcome: 'pytest run not read: `PYTEST_ADDOPTS written to $GITHUB_ENV` in Makefile',
    },
    { name: 'a1rev-conditional-default', files: { Makefile: recipe('PYTEST_ADDOPTS ?= -x'), [CI]: workflow(MAKE_TEST, jobEnv('-p no:skipping'), [], true) }, outcome: ENVIRONMENT_VALUE },
    { name: 'a1rev-append', files: { Makefile: recipe('PYTEST_ADDOPTS += -p no:skipping'), [CI]: workflow(MAKE_TEST, jobEnv('-q'), [], true) }, outcome: MAKEFILE_VALUE },
    { name: 'a1rev-make-e', files: { Makefile: recipe('PYTEST_ADDOPTS = -x'), [CI]: workflow(['      - run: make -e test'], jobEnv('-p no:skipping'), [], true) }, outcome: ENVIRONMENT_VALUE },
    { name: 'a1rev-conditional-default-env-inert', files: { Makefile: recipe('PYTEST_ADDOPTS ?= -p no:skipping'), [CI]: workflow(MAKE_TEST, jobEnv('-q'), [], true) }, outcome: 'hollow' },
    { name: 'a1rev-make-e-env-inert', files: { Makefile: UNEXPORTED, [CI]: workflow(['      - run: make -e test'], jobEnv('-q'), [], true) }, outcome: 'hollow' },
    {
      name: 'a1rev-make-e-override',
      files: { Makefile: recipe('override PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(['      - run: make -e test'], jobEnv('-q'), [], true) },
      outcome: MAKEFILE_VALUE,
    },
    {
      name: 'a1rev-make-directory',
      files: {
        Makefile: lines('PYTEST_ADDOPTS = -x', '', 'test:', '\techo root'),
        'sub/Makefile': lines('PYTEST_ADDOPTS = -p no:skipping', '', 'test:', '\tpytest ../tests'),
        [CI]: workflow(['      - run: make -C sub test'], jobEnv('-q'), [], true),
      },
      outcome: 'every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in sub/Makefile',
    },
    {
      name: 'a1rev-control-command-line',
      files: { Makefile: UNEXPORTED, [CI]: workflow(['      - run: make test PYTEST_ADDOPTS=-q'], jobEnv('-q'), [], true) },
      outcome: 'pytest run not read: `PYTEST_ADDOPTS` in Makefile',
    },
  ];
  for (const { name, files, outcome } of cases) {
    it(`${name}: the reading kept`, () => {
      if (outcome === 'hollow') expectHollow(name, files);
      else expectWithheld(name, files, outcome);
    });
  }
});

// Fix round on #710 (re-review at 9ad037b1d, blocker 2; operator ruling of 10 Nov: keep the rule
// strict and disclose it): a job-level env: entry over an actions/checkout step, or a $GITHUB_ENV write
// in a file that holds one, reaches a uses: step the reader does not follow, so the mention is not
// read even where every run step is make. This withholds on some files that are truly hollow;
// narrowing it is cejel #713.
describe('v27 A1, fix round on #710, item A: a uses: step such as actions/checkout leaves the mention not read', () => {
  it('a job-level env: entry over actions/checkout and make test: not read, named with the entry', () => {
    expectWithheld('a1uses-job-env-checkout-make', { Makefile: UNEXPORTED, [CI]: workflow(['      - uses: actions/checkout@v4', ...MAKE_TEST], ['    env:', '      PYTEST_ADDOPTS: "-q"'], [], true) }, notReadByEntry('-q'));
  });

  it('a $GITHUB_ENV write in a file with actions/checkout, then make test: not read, named with the write', () => {
    expectWithheld(
      'a1uses-github-env-checkout-make',
      { Makefile: UNEXPORTED, [CI]: workflow(['      - uses: actions/checkout@v4', '      - run: echo "PYTEST_ADDOPTS=-q" >> "$GITHUB_ENV"', ...MAKE_TEST], [], [], true) },
      `pytest run not read: \`- run: echo "PYTEST_ADDOPTS=-q" >> "$GITHUB_ENV"\` in ${CI}`,
    );
  });
});

describe('v27 A1, item B: pins for the forms main already reads right (rulings of 4 Nov)', () => {
  it('ruling 1: a plain root pytest, with the root configuration in force', () => {
    expectWithheld(
      'a1pin-root-pytest-root-config',
      {
        'pyproject.toml': lines('[project]', 'name = "cachelib"', 'version = "1.0.0"', '', '[tool.pytest.ini_options]', 'testpaths = ["tests"]', 'addopts = "-p no:skipping"'),
        [CI]: workflow(['      - run: echo no tests here']),
      },
      'every-test-skipped rule not applied: -p no:skipping set in pyproject.toml',
    );
  });

  it('ruling 2: an unexported Makefile value with no environment is not applied', () => {
    expectHollow('a1pin-unexported-no-environment', { Makefile: UNEXPORTED, [CI]: workflow(MAKE_TEST) });
  });

  it('ruling 2: .EXPORT_ALL_VARIABLES:', () => {
    expectWithheld('a1pin-export-all-variables', { Makefile: recipe('.EXPORT_ALL_VARIABLES:', 'PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(MAKE_TEST) }, MAKEFILE_VALUE);
  });

  it('ruling 2: a bare export line', () => {
    expectWithheld('a1pin-bare-export', { Makefile: recipe('export', 'PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(MAKE_TEST) }, MAKEFILE_VALUE);
  });

  it('ruling 2: export PYTEST_ADDOPTS = ...', () => {
    expectWithheld('a1pin-export-assignment', { Makefile: recipe('export PYTEST_ADDOPTS = -p no:skipping'), [CI]: workflow(MAKE_TEST) }, MAKEFILE_VALUE);
  });

  it('ruling 2: the recipe passes it on the command line, pytest $(PYTEST_ADDOPTS)', () => {
    expectWithheld(
      'a1pin-recipe-command-line',
      { Makefile: lines('PYTEST_ADDOPTS = -p no:skipping', '', 'test:', '\tpytest $(PYTEST_ADDOPTS)'), [CI]: workflow(MAKE_TEST) },
      'every-test-skipped rule not applied: -p no:skipping on a pytest command line in Makefile',
    );
  });

  it('ruling 2: the recipe sets it for its command, PYTEST_ADDOPTS="$(PYTEST_ADDOPTS)" pytest', () => {
    expectWithheld(
      'a1pin-recipe-leading-assignment',
      { Makefile: lines('PYTEST_ADDOPTS = -p no:skipping', '', 'test:', '\tPYTEST_ADDOPTS="$(PYTEST_ADDOPTS)" pytest'), [CI]: workflow(MAKE_TEST) },
      MAKEFILE_VALUE,
    );
  });
});

const KEEPER = (registration: readonly string[], body: readonly string[] = ['        items.clear()']) =>
  lines('import pytest', '', '', 'class Keeper:', '    def pytest_collection_modifyitems(self, config, items):', ...body, '', '', ...registration);

describe('v27 A1, item C: a collection hook defined in a plugin class is named as not read, at its def', () => {
  const CLAUSE = 'hook not read: `Keeper.pytest_collection_modifyitems` in tests/conftest.py';

  const expectNamed = (name: string, conftest: string) => {
    const { v17, v27 } = a1(name, { 'tests/conftest.py': conftest }, false);
    expect((v27.notes ?? '').toLowerCase(), name).toContain(CLAUSE.toLowerCase());
    expect(v27.score, name).toBe(v17.score);
    expect(
      v27.evidence.some(({ path, line }) => path === 'tests/conftest.py' && line === 5),
      `${name}: a pointer at the method's def`,
    ).toBe(true);
  };

  it('registered from pytest_configure', () => {
    expectNamed('a1class-configure-register', KEEPER(['def pytest_configure(config):', '    config.pluginmanager.register(Keeper())']));
  });

  it('registered at import with config.pluginmanager.register in a hook other than pytest_configure', () => {
    expectNamed('a1class-sessionstart-register', KEEPER(['def pytest_sessionstart(session):', '    session.config.pluginmanager.register(Keeper())']));
  });

  it('a hook that reads items without emptying it is named too', () => {
    expectNamed(
      'a1class-reads-items',
      KEEPER(['def pytest_configure(config):', '    config.pluginmanager.register(Keeper())'], ['        for item in items:', '            item.add_marker(pytest.mark.slow)']),
    );
  });

  it('a class hook whose body never names items is not named', () => {
    const { v27 } = a1('a1class-no-items', {
      'tests/conftest.py': KEEPER(['def pytest_configure(config):', '    config.pluginmanager.register(Keeper())'], ['        config.option.verbose = 1']),
    }, false);
    expect((v27.notes ?? '').toLowerCase()).not.toContain('hook not read');
  });

  it('a nested def of the hook name inside a function is not a class method and is not named here', () => {
    const { v27 } = a1('a1class-def-in-function', {
      'tests/conftest.py': lines('import pytest', '', '', 'def make():', '    def pytest_collection_modifyitems(config, items):', '        items.clear()', '    return None'),
    }, false);
    expect((v27.notes ?? '').toLowerCase()).not.toContain('hook not read');
    expect((v27.notes ?? '').toLowerCase()).not.toContain(HOLLOW);
  });
});
