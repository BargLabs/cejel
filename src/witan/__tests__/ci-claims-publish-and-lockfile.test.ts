import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// #517 and #520, the parts still open after witan-rubric-v27's first closure.
//
// #517: a workflow whose job publishes, releases or deploys is not CI verification. v27's first
// closure removed credit only from upload-only workflows, so #517's own repros (which build or
// install before they publish) still raised B3 when the human gate was removed and publishing
// moved onto every push. Under v27, a workflow with no pull-request trigger that runs an
// unconditional publish, release or deploy step is not counted by B3, whatever else it runs.
//
// #520: when the repository's own automation requires a lockfile that is not committed, A4 says
// so in a finding that cites the requiring line (v27), and a tox configuration that selects
// tox-uv's lock runner is such a requirement (every rubric, for the note and citation). Of two
// manifests, the one holding more dependencies declared without a version constraint is cited
// first (every rubric, presentation only).
//
// Fixtures are synthetic, written here from the idiom each issue names; no public repository is
// cloned.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

// ---- #517 fixtures ----------------------------------------------------------------------------

const PY_PROJECT = [
  '[project]',
  'name = "signer"',
  'version = "1.0.0"',
  'dependencies = []',
  '',
  '[dependency-groups]',
  'tests = ["pytest"]',
  '',
  '[tool.pytest.ini_options]',
  'testpaths = ["tests"]',
  '',
].join('\n');

const PY_SOURCES: Readonly<Record<string, string>> = {
  'README.md': '# signer\n\nSign and verify values.\n',
  LICENSE: 'MIT\n',
  'src/signer/__init__.py':
    'import hmac\n\n\ndef sign(key, value):\n    return hmac.new(key, value, "sha256").hexdigest()\n\n\ndef verify(key, value, mac):\n    return hmac.compare_digest(sign(key, value), mac)\n',
  'tests/test_signer.py':
    'from signer import sign, verify\n\n\ndef test_roundtrip():\n    assert verify(b"k", b"v", sign(b"k", b"v"))\n\n\ndef test_tamper():\n    assert not verify(b"k", b"w", sign(b"k", b"v"))\n',
};

const UV_LOCK =
  'version = 1\nrequires-python = ">=3.9"\n\n[[package]]\nname = "signer"\nversion = "1.0.0"\nsource = { editable = "." }\n';

const PR_AND_MAIN = 'on:\n  pull_request:\n  push:\n    branches: [main]\n';

const TESTS_WORKFLOW = `name: Tests\n${PR_AND_MAIN}jobs:\n  tests:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n      - run: uv run --locked pytest\n`;

const PRE_COMMIT_WORKFLOW = `name: pre-commit\n${PR_AND_MAIN}jobs:\n  main:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n      - run: uv run --locked pre-commit run --all-files\n`;

// #517's first repro: build, draft a GitHub release, and publish to PyPI behind an environment.
const PYPI_RELEASE_GATED = [
  'name: Publish',
  'on:',
  '  push:',
  "    tags: ['*']",
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: astral-sh/setup-uv@v5',
  '      - run: uv build',
  '      - uses: actions/upload-artifact@v4',
  '        with:',
  '          path: ./dist',
  '  create-release:',
  '    needs: [build]',
  '    runs-on: ubuntu-latest',
  '    permissions:',
  '      contents: write',
  '    steps:',
  '      - uses: actions/download-artifact@v4',
  '      - name: create release',
  '        run: gh release create --draft --repo ${{ github.repository }} ${{ github.ref_name }} artifact/*',
  '        env:',
  '          GH_TOKEN: ${{ github.token }}',
  '  publish-pypi:',
  '    needs: [build]',
  '    environment:',
  '      name: publish',
  '      url: https://pypi.org/project/signer/',
  '    runs-on: ubuntu-latest',
  '    permissions:',
  '      id-token: write',
  '    steps:',
  '      - uses: actions/download-artifact@v4',
  '      - uses: pypa/gh-action-pypi-publish@release/v1',
  '        with:',
  '          packages-dir: artifact/',
  '',
].join('\n');

// The planted change: every push to the default branch, and the environment (the human gate) gone.
const PYPI_RELEASE_UNGATED = PYPI_RELEASE_GATED.replace("  push:\n    tags: ['*']", '  push:\n    branches: [main]').replace(
  '    environment:\n      name: publish\n      url: https://pypi.org/project/signer/\n',
  '',
);

const JS_PACKAGE = `${JSON.stringify(
  {
    name: 'tint',
    version: '1.0.0',
    main: 'index.js',
    scripts: { test: 'uvu test' },
    devDependencies: { uvu: '0.5.6', bundt: '1.1.5' },
  },
  null,
  2,
)}\n`;

const JS_SOURCES: Readonly<Record<string, string>> = {
  'package.json': JS_PACKAGE,
  'README.md': '# tint\n',
  LICENSE: 'MIT\n',
  'index.js': 'export function red(text) {\n  return `\\u001b[31m${text}\\u001b[39m`;\n}\n',
  'test/index.js':
    "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\nimport { red } from '../index.js';\n\ntest('red', () => {\n  assert.ok(red('x').includes('x'));\n});\n\ntest.run();\n",
  '.github/workflows/ci.yml':
    'name: ci\non:\n  pull_request:\n  push:\n    branches: [master]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm install\n      - run: npm test\n',
};

// #517's second repro: a manually dispatched npm publish behind `environment: npm-publish`.
const NPM_RELEASE_GATED = [
  'name: release',
  'on:',
  '  workflow_dispatch:',
  'jobs:',
  '  publish:',
  '    runs-on: ubuntu-latest',
  '    environment: npm-publish',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: actions/setup-node@v4',
  '        with:',
  '          registry-url: https://registry.npmjs.org',
  '      - run: npm install',
  '      - run: npm test',
  '      - run: npm publish',
  '        env:',
  '          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}',
  '',
].join('\n');

const NPM_RELEASE_UNGATED = NPM_RELEASE_GATED.replace('  workflow_dispatch:', '  push:\n    branches: [master]').replace(
  '    environment: npm-publish\n',
  '',
);

const PUSH_MAIN = 'on:\n  push:\n    branches: [main]\n';
const pushWorkflow = (name: string, steps: string, on = PUSH_MAIN): string =>
  `name: ${name}\n${on}jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${steps}`;

const PY_BASE: Readonly<Record<string, string>> = {
  ...PY_SOURCES,
  'pyproject.toml': PY_PROJECT,
  'uv.lock': UV_LOCK,
  '.github/workflows/tests.yaml': TESTS_WORKFLOW,
  '.github/workflows/pre-commit.yaml': PRE_COMMIT_WORKFLOW,
};

function fixture(name: string, issue: '#517' | '#520', purpose: string, ...commits: Record<string, string | null>[]): FalseAssuranceFixture {
  return { name, issue, purpose, commits };
}

const FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture('pypi-release-gated', '#517', 'Control: tag-triggered build, draft release and PyPI publish behind an environment.', {
    ...PY_BASE,
    '.github/workflows/publish.yaml': PYPI_RELEASE_GATED,
  }),
  fixture('pypi-release-ungated', '#517', 'Change: the same workflow on every push to main, with no environment.', {
    ...PY_BASE,
    '.github/workflows/publish.yaml': PYPI_RELEASE_UNGATED,
  }),
  fixture('npm-release-gated', '#517', 'Control: dispatched install, test and npm publish behind an environment.', {
    ...JS_SOURCES,
    '.github/workflows/release.yml': NPM_RELEASE_GATED,
  }),
  fixture('npm-release-ungated', '#517', 'Change: the same workflow on every push to master, with no environment.', {
    ...JS_SOURCES,
    '.github/workflows/release.yml': NPM_RELEASE_UNGATED,
  }),
  fixture('publish-step-guarded-by-if', '#517', 'Corner: the publish step runs only on a tag, so the push to main runs checks only.', {
    ...JS_SOURCES,
    '.github/workflows/release.yml': pushWorkflow(
      'release',
      "      - run: npm ci\n      - run: npm test\n      - if: startsWith(github.ref, 'refs/tags/')\n        run: npm publish\n",
      "on:\n  push:\n    branches: [main]\n    tags: ['v*']\n",
    ),
  }),
  fixture('publish-word-echoed', '#517', 'Corner: a publish command named in echo text is not a publish step.', {
    ...JS_SOURCES,
    '.github/workflows/build.yml': pushWorkflow('build', '      - run: npm test\n      - run: echo "npm publish runs from the release workflow"\n'),
  }),
  fixture('publish-dry-run', '#517', 'Corner: a dry run publishes nothing.', {
    ...JS_SOURCES,
    '.github/workflows/build.yml': pushWorkflow('build', '      - run: npm test\n      - run: npm publish --dry-run\n'),
  }),
  fixture('publish-in-comment', '#517', 'Corner: a publish command in a comment is not a step.', {
    ...JS_SOURCES,
    '.github/workflows/build.yml': pushWorkflow('build', '      # npm publish happens in release.yml\n      - run: npm test\n'),
  }),
  fixture('publish-with-pull-request-trigger', '#517', 'Corner: a pull-request workflow stays a pull-request gate.', {
    ...JS_SOURCES,
    '.github/workflows/build.yml': pushWorkflow('build', '      - run: npm test\n      - run: npm publish\n', PR_AND_MAIN),
  }),
  fixture('twine-upload-through-python-m', '#517', 'Change: `python -m twine upload` after a build on every push.', {
    ...PY_BASE,
    '.github/workflows/publish.yaml': pushWorkflow(
      'publish',
      '      - run: pip install build twine\n      - run: python -m build\n      - run: python -m twine upload dist/*\n',
    ),
  }),
];

// ---- #520 fixtures ----------------------------------------------------------------------------

const TOX_LOCK_RUNNER_PYPROJECT = `${PY_PROJECT}[tool.tox]\nenv_list = ["py3"]\n\n[tool.tox.env_run_base]\nrunner = "uv-venv-lock-runner"\ndependency_groups = ["tests"]\ncommands = [["pytest"]]\n`;

const TOX_CI = `name: Tests\n${PR_AND_MAIN}jobs:\n  tests:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n      - run: uvx --with tox-uv tox run\n`;

const TOX_BASE: Readonly<Record<string, string>> = {
  ...PY_SOURCES,
  'pyproject.toml': TOX_LOCK_RUNNER_PYPROJECT,
  'uv.lock': UV_LOCK,
  '.github/workflows/tests.yaml': TOX_CI,
};

const ROOT_UNCONSTRAINED = `${JSON.stringify(
  { name: 'tint', version: '1.0.0', main: 'index.js', scripts: { test: 'uvu test' }, devDependencies: { uvu: '*', bundt: 'latest', esm: '*' } },
  null,
  2,
)}\n`;
const ROOT_PINNED = `${JSON.stringify(
  { name: 'tint', version: '1.0.0', main: 'index.js', scripts: { test: 'uvu test' }, devDependencies: { uvu: '0.5.6', bundt: '1.1.5', esm: '3.2.25' } },
  null,
  2,
)}\n`;
// A benchmark manifest with more dependencies than the root, one of them the package itself by path.
const BENCH_LINKS_PARENT = `${JSON.stringify(
  { private: true, devDependencies: { tint: 'file:..', chalk: '4.1.2', 'ansi-colors': '4.1.1', colorette: '2.0.20' } },
  null,
  2,
)}\n`;

const FIXTURES_520: readonly FalseAssuranceFixture[] = [
  fixture(
    'uv-locked-ci-lockfile-deleted',
    '#520',
    'Change: uv.lock deleted while CI still runs `uv run --locked` (the first repro).',
    { ...PY_BASE },
    { 'uv.lock': null },
  ),
  fixture('tox-lock-runner-with-lockfile', '#520', 'Control: tox selects uv-venv-lock-runner and uv.lock is committed.', { ...TOX_BASE }),
  fixture(
    'tox-lock-runner-lockfile-deleted',
    '#520',
    'Change: uv.lock deleted while the tox configuration still selects uv-venv-lock-runner.',
    { ...TOX_BASE },
    { 'uv.lock': null },
  ),
  fixture('tox-lock-runner-not-locked', '#520', 'Corner: uv_sync_locked = false, so the runner does not require uv.lock.', {
    ...TOX_BASE,
    'uv.lock': null,
    'pyproject.toml': TOX_LOCK_RUNNER_PYPROJECT.replace('runner = "uv-venv-lock-runner"\n', 'runner = "uv-venv-lock-runner"\nuv_sync_locked = false\n'),
  }),
  fixture('tox-lock-runner-shadowed-by-tox-ini', '#520', 'Corner: tox.ini takes precedence over pyproject.toml, so its runner applies.', {
    ...TOX_BASE,
    'uv.lock': null,
    'tox.ini': '[tox]\nenv_list = py3\n\n[testenv]\ndeps = pytest\ncommands = pytest\n',
  }),
  fixture('tox-lock-runner-ci-writes-lockfile', '#520', 'Corner: CI runs `uv lock` before tox, which writes uv.lock.', {
    ...TOX_BASE,
    'uv.lock': null,
    '.github/workflows/tests.yaml': TOX_CI.replace('      - run: uvx --with tox-uv tox run\n', '      - run: uv lock\n      - run: uvx --with tox-uv tox run\n'),
  }),
  fixture('tox-lock-runner-commented-out', '#520', 'Corner: a commented runner line selects nothing.', {
    ...TOX_BASE,
    'uv.lock': null,
    'pyproject.toml': TOX_LOCK_RUNNER_PYPROJECT.replace('runner = "uv-venv-lock-runner"\n', '# runner = "uv-venv-lock-runner"\n'),
  }),
  fixture(
    'root-unconstrained-bench-links-parent',
    '#520',
    'Change: root devDependencies become "*" and "latest"; bench/package.json, which has more dependencies and links the package by path, is unchanged (the second repro).',
    { ...JS_SOURCES, 'package.json': ROOT_PINNED, 'bench/package.json': BENCH_LINKS_PARENT, 'bench/index.js': "console.log('bench');\n" },
    { 'package.json': ROOT_UNCONSTRAINED },
  ),
];

const ALL = [...FIXTURES, ...FIXTURES_520];

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${name}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = ALL.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'ci-claims-fixture',
    productDisplayName: 'CI claims fixture',
    generatedAt: '2026-10-26T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(name: string, rubricVersion: string, id: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

function metricValue(score: WitanCriterionScore, name: string): number | undefined {
  return score.metrics.find((metric) => metric.name === name)?.value;
}

describe('#517 — a workflow that publishes, releases or deploys is not CI verification under v27', () => {
  const pairs = [
    ['pypi-release-gated', 'pypi-release-ungated', '.github/workflows/publish.yaml'],
    ['npm-release-gated', 'npm-release-ungated', '.github/workflows/release.yml'],
  ] as const;

  it('v17 is unchanged: removing the gate and publishing on every push still raises B3, as the issue reports', () => {
    for (const [gated, ungated] of pairs) {
      expect(criterion(ungated, V17, 'B3').score, ungated).toBeGreaterThan(criterion(gated, V17, 'B3').score);
      expect(metricValue(criterion(ungated, V17, 'B3'), 'default_branch_ci_depth'), ungated).toBeGreaterThan(
        metricValue(criterion(gated, V17, 'B3'), 'default_branch_ci_depth') ?? 0,
      );
    }
  });

  it('v27: removing the environment gate and moving publishing onto every push does not raise B3', () => {
    for (const [gated, ungated] of pairs) {
      const before = criterion(gated, V27, 'B3');
      const after = criterion(ungated, V27, 'B3');
      expect(after.score, ungated).toBe(before.score);
      expect(metricValue(after, 'default_branch_ci_depth'), ungated).toBe(metricValue(before, 'default_branch_ci_depth'));
      expect(metricValue(after, 'ci_script_depth'), ungated).toBe(metricValue(before, 'ci_script_depth'));
    }
  });

  it('v27: the note and the disclosure name the publishing workflow, and never call it publish-only', () => {
    for (const [, ungated, file] of pairs) {
      const b3 = criterion(ungated, V27, 'B3');
      expect(b3.notes, ungated).toBe(
        `1 workflow that publishes, releases or deploys with no pull-request trigger (an unconditional step runs a publish, release or deploy command or action) is not counted as CI verification, whatever else it runs: ${file}.`,
      );
      expect(b3.notes ?? '').not.toContain('only publish');
      expect(b3.disclosures, ungated).toContain(
        `B3 did not count CI workflows that publish, release or deploy with no pull-request trigger, whatever else they run: ${file} runs an unconditional publish, release or deploy step.`,
      );
      expect(b3.metrics.find(({ name }) => name === 'default_branch_ci_depth')?.presentation?.condition, ungated).toBe(
        '1 CI workflow file that publishes, releases or deploys with no pull-request trigger is not counted',
      );
    }
  });

  it('v27: a `python -m twine upload` after a build is a publish step', () => {
    const b3 = criterion('twine-upload-through-python-m', V27, 'B3');
    expect(b3.notes).toContain('1 workflow that publishes, releases or deploys with no pull-request trigger');
    expect(metricValue(b3, 'default_branch_ci_depth')).toBe(metricValue(criterion('pypi-release-gated', V27, 'B3'), 'default_branch_ci_depth'));
  });

  it('v27 keeps counting a guarded publish, a publish word in echo text or a comment, a dry run, and a pull-request workflow', () => {
    for (const name of [
      'publish-step-guarded-by-if',
      'publish-word-echoed',
      'publish-dry-run',
      'publish-in-comment',
      'publish-with-pull-request-trigger',
    ]) {
      expect(criterion(name, V27, 'B3'), name).toEqual(criterion(name, V17, 'B3'));
    }
  });

  it('B2 is not changed by this rule', () => {
    for (const name of FIXTURES.map((entry) => entry.name)) {
      expect(criterion(name, V27, 'B2'), name).toEqual(criterion(name, V17, 'B2'));
    }
  });
});

describe('#520 — A4 says when the repository requires a lockfile it does not commit', () => {
  it('v27: a finding, not only the metric-derived one, cites the CI line that requires the lockfile', () => {
    const a4 = criterion('uv-locked-ci-lockfile-deleted', V27, 'A4');
    const finding = a4.findings.find(({ summary }) => summary.startsWith("This repository's CI requires a lockfile"));
    expect(finding?.summary).toBe(
      "This repository's CI requires a lockfile that is not committed: an unconditional step runs `uv run --locked`, which exits with an error without uv.lock, and the scanned inventory holds none.",
    );
    expect(finding?.severity).toBe('warning');
    expect(finding?.evidence.path).toBe('.github/workflows/pre-commit.yaml');
    expect(finding?.evidence.line).toBe(12);
    expect(metricValue(a4, 'lockfile_coverage')).toBe(0);
  });

  it('v17 is unchanged: no new finding, the metric stays omitted', () => {
    const a4 = criterion('uv-locked-ci-lockfile-deleted', V17, 'A4');
    expect(a4.findings.some(({ summary }) => summary.startsWith("This repository's CI requires a lockfile"))).toBe(false);
    expect(metricValue(a4, 'lockfile_coverage')).toBeUndefined();
  });

  it('every rubric: a tox configuration selecting uv-venv-lock-runner requires uv.lock, and the note says so', () => {
    for (const rubricVersion of [V17, V27]) {
      const a4 = criterion('tox-lock-runner-lockfile-deleted', rubricVersion, 'A4');
      expect(a4.notes, rubricVersion).not.toContain('not required');
      expect(a4.notes, rubricVersion).toContain(
        "This repository's tox configuration selects the `uv-venv-lock-runner` runner (pyproject.toml line 15), which exits with an error without uv.lock, and the scanned inventory holds none.",
      );
      expect(a4.evidence[0]?.path, rubricVersion).toBe('pyproject.toml');
      expect(a4.evidence[0]?.line, rubricVersion).toBe(15);
    }
  });

  it('v27: the tox requirement scores lockfile_coverage 0 and is a finding citing the runner line', () => {
    const a4 = criterion('tox-lock-runner-lockfile-deleted', V27, 'A4');
    expect(metricValue(a4, 'lockfile_coverage')).toBe(0);
    const finding = a4.findings.find(({ summary }) => summary.startsWith("This repository's tox configuration requires a lockfile"));
    expect(finding?.evidence.path).toBe('pyproject.toml');
    expect(finding?.evidence.line).toBe(15);
    expect(a4.score).toBeLessThan(criterion('tox-lock-runner-lockfile-deleted', V17, 'A4').score);
  });

  it('no tox claim with the lockfile committed, uv_sync_locked off, tox.ini taking precedence, CI writing the lockfile, or a commented runner', () => {
    for (const name of [
      'tox-lock-runner-with-lockfile',
      'tox-lock-runner-not-locked',
      'tox-lock-runner-shadowed-by-tox-ini',
      'tox-lock-runner-ci-writes-lockfile',
      'tox-lock-runner-commented-out',
    ]) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain('tox configuration selects');
        expect(metricValue(a4, 'lockfile_coverage'), `${name}@${rubricVersion}`).not.toBe(0);
      }
      expect(criterion(name, V27, 'A4'), name).toEqual(criterion(name, V17, 'A4'));
    }
  });

  it('every rubric: the root package.json, which holds the unconstrained ranges, is cited, not bench/package.json', () => {
    for (const rubricVersion of [V17, V27]) {
      const a4 = criterion('root-unconstrained-bench-links-parent', rubricVersion, 'A4');
      expect(a4.evidence[0]?.path, rubricVersion).toBe('package.json');
      expect(a4.evidence[0]?.label, rubricVersion).toBe('Dependency manifest with 3 dependencies declared without a version constraint');
      const derived = a4.findings.find(({ summary }) => summary.includes('metric-derived score'));
      expect(derived?.evidence.path, rubricVersion).toBe('package.json');
    }
  });
});

describe('no rise against v17 on these fixtures', () => {
  it('no score, status or composite rises, and no v17 finding is lost', () => {
    for (const { name } of ALL) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });
});
