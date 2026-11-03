import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { PY_BASE, SKIPPED_CACHE_TEST, lines } from './fixtures/v27-a1-removal-fixtures.js';

// The review of #648 at b9762e0a3. Each fixture below runs tests/test_cache.py, whose every test is
// skipped, under -p no:skipping (or under a run whose options cannot be known), so pytest runs its
// tests: v27 A1 must not rate it hollow, and must not throw. Ground truth: pytest 9.2.0 and GNU make
// (`make -n`) on the dev host; hatch, tox and just from their documentation.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const fixture = (name: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: '#648',
  purpose: name,
  commits: [{ ...PY_BASE, 'tests/test_cache.py': SKIPPED_CACHE_TEST, ...files }],
});

const workflow = (steps: readonly string[], jobLines: readonly string[] = []): string =>
  lines('name: ci', 'on:', '  push:', 'jobs:', '  test:', '    runs-on: ubuntu-latest', ...jobLines, '    steps:', '      - uses: actions/checkout@v4', ...steps);

function a1(repo: string, rubricVersion: string): WitanCriterionScore {
  const report = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'false-assurance-fixture',
    productDisplayName: 'False-assurance fixture',
    generatedAt: '2026-11-03T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  const found = report.criteria.find(({ id }) => id === 'A1');
  if (!found) throw new Error('no A1');
  return found;
}

function expectNotHollow(name: string, files: Readonly<Record<string, string>>): WitanCriterionScore {
  const repo = buildFalseAssuranceFixture(fixture(name, files));
  const v17 = a1(repo, V17);
  const v27 = a1(repo, V27);
  expect(v27.notes ?? '', name).not.toContain('rated hollow here');
  expect(v27.score, name).toBe(v17.score);
  for (const { label } of v27.evidence) expect(label.length, `${name}: ${label}`).toBeLessThanOrEqual(180);
  return v27;
}

describe('v27 A1, review of #648: a run-not-read label never exceeds the evidence label limit', () => {
  it('a long CI pytest command with an expression in a path argument', () => {
    const v27 = expectNotHollow('a1review-long-unread-label', {
      '.github/workflows/ci.yml': workflow([
        '      - run: python -m pytest ${{ matrix.test-path }} --cov=cachelib --cov-report=xml --cov-report=term-missing --junitxml=junit/test-results-${{ matrix.python-version }}.xml --durations=20',
      ]),
    });
    expect(v27.notes ?? '').toContain('pytest run not read: ');
  });

  it('a 2,000-character unread command keeps the note within its limit', () => {
    const v27 = expectNotHollow('a1review-huge-unread-command', {
      '.github/workflows/ci.yml': workflow([`      - run: pytest \${{ matrix.path }} ${Array.from({ length: 250 }, (_, i) => `-k t${i}`).join(' ')}`]),
    });
    expect((v27.notes ?? '').length).toBeLessThanOrEqual(1000);
  });
});

describe('v27 A1, review of #648: make variables are read as make reads them, or the run is named as not read', () => {
  it('a := value is expanded where it is assigned, not with a later assignment', () => {
    expectNotHollow('a1review-make-simple-reassigned', {
      Makefile: lines('OPTS := -p no:skipping', 'PYTEST := pytest $(OPTS)', 'OPTS := -x', 'test:', '\t$(PYTEST) tests'),
      '.github/workflows/ci.yml': workflow(['      - run: make test']),
    });
  });

  it('a ?= default that CI sets in the environment', () => {
    expectNotHollow('a1review-make-conditional-env-prefix', {
      Makefile: lines('PYTEST_OPTS ?= -x', 'test:', '\tpytest $(PYTEST_OPTS) tests'),
      '.github/workflows/ci.yml': workflow(['      - run: PYTEST_OPTS="-p no:skipping" make test']),
    });
    expectNotHollow('a1review-make-conditional-env-mapping', {
      Makefile: lines('PYTEST_OPTS ?= -x', 'test:', '\tpytest $(PYTEST_OPTS) tests'),
      '.github/workflows/ci.yml': workflow(['      - run: make test', '        env:', '          PYTEST_OPTS: -p no:skipping']),
    });
  });

  it('a target-specific variable', () => {
    expectNotHollow('a1review-make-target-specific', {
      Makefile: lines('OPTS = -x', 'test: OPTS = -p no:skipping', 'test:', '\tpytest $(OPTS) tests'),
      '.github/workflows/ci.yml': workflow(['      - run: make test']),
    });
  });

  it('a target-specific export of PYTEST_ADDOPTS', () => {
    expectNotHollow('a1review-make-target-export-addopts', {
      Makefile: lines('test: export PYTEST_ADDOPTS = -p no:skipping', 'test:', '\tpytest tests'),
      '.github/workflows/ci.yml': workflow(['      - run: make test']),
    });
  });

  it('an assignment inside a conditional', () => {
    expectNotHollow('a1review-make-ifdef', {
      Makefile: lines('OPTS = -p no:skipping', 'ifdef COVERAGE', 'OPTS = -x', 'endif', 'test:', '\tpytest $(OPTS) tests'),
      '.github/workflows/ci.yml': workflow(['      - run: make test']),
    });
  });

  it('a variable naming no pytest whose value runs pytest, left unknown', () => {
    expectNotHollow('a1review-make-unknown-command-variable', {
      Makefile: lines('CMD != echo pytest -p no:skipping', 'test:', '\t$(CMD) tests'),
      '.github/workflows/ci.yml': workflow(['      - run: make test']),
    });
  });
});

describe('v27 A1, review of #648: run forms the reader recognises but cannot resolve are named as not read', () => {
  it('hatch run env:script where the script comes from the default environment by inheritance', () => {
    expectNotHollow('a1review-hatch-inherited-script', {
      'hatch.toml': lines('[envs.default.scripts]', 'cov = "pytest -p no:skipping tests"', '', '[envs.test]', 'dependencies = ["pytest"]'),
      '.github/workflows/ci.yml': workflow(['      - run: hatch run test:cov']),
    });
  });

  it('hatch test, the built-in pytest command', () => {
    expectNotHollow('a1review-hatch-test', {
      'pyproject.toml': lines(
        '[project]',
        'name = "cachelib"',
        'version = "1.0.0"',
        '',
        '[tool.pytest.ini_options]',
        'testpaths = ["tests"]',
        '',
        '[tool.hatch.envs.hatch-test]',
        'extra-args = ["-p", "no:skipping"]',
      ),
      '.github/workflows/ci.yml': workflow(['      - run: hatch test']),
    });
  });

  it('python -m tox with posargs', () => {
    expectNotHollow('a1review-python-m-tox-posargs', {
      'tox.ini': lines('[tox]', 'envlist = py', '', '[testenv]', 'deps = pytest', 'commands = pytest {posargs} tests'),
      '.github/workflows/ci.yml': workflow(['      - run: python -m tox -- -p no:skipping']),
    });
  });

  it('a tox factor environment chosen by TOXENV', () => {
    expectNotHollow('a1review-toxenv-factor', {
      'tox.ini': lines('[tox]', 'envlist = py', '', '[testenv]', 'deps = pytest', 'commands =', '    noskip: pytest -p no:skipping tests', '    !noskip: pytest tests'),
      '.github/workflows/ci.yml': workflow(['      - run: tox', '        env:', '          TOXENV: py-noskip']),
    });
  });

  it("a justfile's set export with PYTEST_ADDOPTS", () => {
    expectNotHollow('a1review-just-set-export', {
      justfile: lines('set export', '', 'PYTEST_ADDOPTS := "-p no:skipping"', '', 'test:', '    pytest tests'),
      '.github/workflows/ci.yml': workflow(['      - run: just test']),
    });
  });
});

describe('v27 A1, review of #648: remote steps that change what a pytest run collects (the narrow rule)', () => {
  it('a wrapper action whose input runs pytest', () => {
    expectNotHollow('a1review-wrapper-action', {
      '.github/workflows/ci.yml': workflow([
        '      - uses: nick-fields/retry@v3',
        '        with:',
        '          max_attempts: 3',
        '          command: pytest -p no:skipping tests',
      ]),
    });
  });

  it('PYTEST_ADDOPTS written to $GITHUB_ENV before the run', () => {
    expectNotHollow('a1review-github-env-addopts', {
      '.github/workflows/ci.yml': workflow([
        '      - run: echo "PYTEST_ADDOPTS=-p no:skipping" >> "$GITHUB_ENV"',
        '      - run: pytest tests',
      ]),
    });
  });

  it('a checkout into a path, then a run in that path', () => {
    expectNotHollow('a1review-checkout-path', {
      '.github/workflows/ci.yml': lines(
        'name: ci',
        'on:',
        '  push:',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '        with:',
        '          path: proj',
        '      - run: pytest -p no:skipping tests',
        '        working-directory: proj',
      ),
    });
  });

  it('a remote action whose inputs do not run pytest changes nothing', () => {
    const repo = buildFalseAssuranceFixture(
      fixture('a1review-remote-action-control', {
        '.github/workflows/ci.yml': workflow([
          '      - uses: codecov/codecov-action@v4',
          '        with:',
          '          files: pytest-report.xml',
          '      - run: pytest tests',
        ]),
      }),
    );
    expect(a1(repo, V27).notes ?? '').toContain('rated hollow here');
  });
});

describe('v27 A1, review of #648: evidence pointers', () => {
  it("a job-level PYTEST_ADDOPTS is cited at its own job's line, not a later job's", () => {
    const repo = buildFalseAssuranceFixture(
      fixture('a1review-job-env-pointer', {
        '.github/workflows/ci.yml': lines(
          'name: ci',
          'on:',
          '  push:',
          'jobs:',
          '  test:',
          '    runs-on: ubuntu-latest',
          '    env:',
          '      PYTEST_ADDOPTS: -p no:skipping',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - run: pytest',
          '  other:',
          '    runs-on: ubuntu-latest',
          '    env:',
          '      PYTEST_ADDOPTS: -x',
          '    steps:',
          '      - run: echo hi',
        ),
      }),
    );
    const cited = a1(repo, V27).evidence.filter(({ label }) => label.startsWith('pytest setting in force'));
    expect(cited.map(({ path, line }) => `${path}:${line}`)).toEqual(['.github/workflows/ci.yml:8']);
  });
});

describe('v27 A1, review of #648: run readers stay bounded', () => {
  it('a wide hatch script that names itself', () => {
    const entries = Array.from({ length: 60 }, () => '"t"').join(', ');
    const repo = buildFalseAssuranceFixture(
      fixture('a1review-hatch-wide', {
        'hatch.toml': lines('[envs.default.scripts]', `t = [${entries}]`),
        '.github/workflows/ci.yml': workflow(['      - run: hatch run t']),
      }),
    );
    const started = performance.now();
    a1(repo, V27);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('a Makefile chain of empty variable references', () => {
    const refs = (name: string, count: number) => Array.from({ length: count }, () => `$(${name})`).join('');
    const repo = buildFalseAssuranceFixture(
      fixture('a1review-make-chain', {
        Makefile: lines('E =', `B = ${refs('E', 800)}`, `A = ${refs('B', 800)}`, `C = ${refs('A', 800)}`, 'test:', '\t$(C) pytest tests'),
        '.github/workflows/ci.yml': workflow(['      - run: make test']),
      }),
    );
    const started = performance.now();
    a1(repo, V27);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
