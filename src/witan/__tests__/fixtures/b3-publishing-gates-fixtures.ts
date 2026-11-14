import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

// v27 B3, publishing rule gates and citations (goal_cejel_v27_b3_publishing_rule_gates_and_citations,
// 2026-11-13; refs #517, #600). Synthetic repositories only.
//
// Item A: under v27 a workflow with no pull-request trigger is not discounted by the publishing rule
// when every job that publishes, releases or deploys on every run declares an `environment:`, read
// where the publishing job is (a reusable workflow in this repository included). Item B: every
// workflow B3 does not count under v27 is cited in B3's evidence, at the line that decided it.
// Item C: the shape the operator asked to be investigated (package scripts, a .travis.yml, a counted
// pull-request workflow and an ungated push-to-default-branch deploy); no code change.

const PY_PROJECT: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "gatelib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# gatelib\n\nA small library.\n',
  LICENSE: 'MIT\n',
  'src/gatelib/__init__.py': 'def double(value):\n    return value * 2\n',
  'tests/test_double.py': 'from gatelib import double\n\n\ndef test_double():\n    assert double(2) == 4\n',
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n',
};

const ON_PUSH_MAIN = 'on:\n  push:\n    branches: [main]\n';
const PAGES_STEPS =
  '    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: site\n      - uses: actions/deploy-pages@v4\n';
const PAGES_PERMISSIONS = '    permissions:\n      pages: write\n      id-token: write\n';

/** A Pages deploy job named `id`, with `environment` (whole lines at the job's key indent, or ''). */
export const PAGES_JOB = (id: string, environment: string): string =>
  `  ${id}:\n    runs-on: ubuntu-latest\n${environment}${PAGES_PERMISSIONS}${PAGES_STEPS}`;

/** A push-to-main deploy workflow holding `jobs` (each from PAGES_JOB or a reusable call). */
export const DEPLOY_WORKFLOW = (jobs: string): string => `name: pages\n${ON_PUSH_MAIN}jobs:\n${jobs}`;

/** A reusable workflow (`on: workflow_call`) holding `jobs`. */
const REUSABLE_WORKFLOW = (jobs: string): string => `name: pages-reusable\non:\n  workflow_call:\njobs:\n${jobs}`;

const CALL_JOB = (id: string, target: string): string => `  ${id}:\n    uses: ${target}\n    permissions:\n      pages: write\n      id-token: write\n`;

const fixture = (name: string, purpose: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: '#517',
  purpose,
  commits: [{ ...PY_PROJECT, ...files }],
});

// The line of `uses: actions/deploy-pages@v4` in a deploy workflow whose one job is PAGES_JOB with
// no environment: name, on, push, branches, jobs, the job key, runs-on, permissions (3 lines), steps,
// checkout, upload (3 lines), deploy.
export const UNGATED_DEPLOY_LINE = 16;

/** Item A: the workflow is counted by B3 under v27, as under v17. */
export const GATE_COUNTED: readonly FalseAssuranceFixture[] = [
  fixture('gate-env-string-github-pages', 'A push-to-main Pages deploy whose job declares `environment: github-pages` (string form).', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(PAGES_JOB('deploy', '    environment: github-pages\n')),
  }),
  fixture('gate-env-flow-mapping', 'The same deploy, the environment written as a flow mapping with a name and a URL.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(
      PAGES_JOB('deploy', '    environment: { name: release, url: https://example.invalid/release }\n'),
    ),
  }),
  fixture('gate-env-block-mapping', 'The same deploy, the environment written as a block mapping with a name and a URL.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(
      PAGES_JOB('deploy', '    environment:\n      name: release\n      url: https://example.invalid/release\n'),
    ),
  }),
  fixture('gate-env-name-not-quoted', 'The same deploy, its environment named with a space, which the note does not quote.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(PAGES_JOB('deploy', "    environment: 'Production site'\n")),
  }),
  fixture('gate-env-two-jobs-both-gated', 'Two publishing jobs on every push to main, each declaring an environment.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(
      `${PAGES_JOB('deploy', '    environment: github-pages\n')}${PAGES_JOB('mirror', '    environment: mirror\n')}`,
    ),
  }),
  fixture(
    'gate-env-reusable-called-job',
    'A push-to-main workflow whose one job calls a reusable workflow in this repository whose publishing job declares `environment: github-pages`.',
    {
      '.github/workflows/pages.yml': DEPLOY_WORKFLOW(CALL_JOB('deploy', './.github/workflows/pages-reusable.yml')),
      '.github/workflows/pages-reusable.yml': REUSABLE_WORKFLOW(PAGES_JOB('publish', '    environment: github-pages\n')),
    },
  ),
];

/** Item A controls: the workflow stays discounted by B3 under v27. */
export const GATE_DISCOUNTED: readonly FalseAssuranceFixture[] = [
  fixture('gate-none-no-environment', 'Control: the push-to-main Pages deploy with no environment.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(PAGES_JOB('deploy', '')),
  }),
  fixture('gate-env-two-jobs-one-ungated', 'Two publishing jobs on every push to main: one declares an environment, one does not.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(`${PAGES_JOB('deploy', '    environment: github-pages\n')}${PAGES_JOB('mirror', '')}`),
  }),
  fixture('gate-env-reusable-called-job-ungated', 'Control: the reusable call, its called publishing job declaring no environment.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(CALL_JOB('deploy', './.github/workflows/pages-reusable.yml')),
    '.github/workflows/pages-reusable.yml': REUSABLE_WORKFLOW(PAGES_JOB('publish', '')),
  }),
  fixture(
    'gate-env-own-gated-reusable-ungated',
    "A gated publishing job in the workflow itself and a call to a reusable workflow whose publishing job declares none: not every publishing job is gated.",
    {
      '.github/workflows/pages.yml': DEPLOY_WORKFLOW(
        `${PAGES_JOB('deploy', '    environment: github-pages\n')}${CALL_JOB('mirror', './.github/workflows/pages-reusable.yml')}`,
      ),
      '.github/workflows/pages-reusable.yml': REUSABLE_WORKFLOW(PAGES_JOB('publish', '')),
    },
  ),
  fixture('gate-env-expression-name', 'The environment named by an expression, whose value Cejel cannot read offline.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(PAGES_JOB('deploy', '    environment: ${{ github.ref_name }}\n')),
  }),
  fixture('gate-env-mapping-without-name', 'An environment mapping with a URL and no name, which the reader does not read as a declaration.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(PAGES_JOB('deploy', '    environment:\n      url: https://example.invalid/release\n')),
  }),
];

/** Item B: the discounted workflows, each cited by B3 at the line that decided it. */
export const CITE_FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture('cite-ungated-deploy-only-discount', 'The only discounted workflow is an ungated deploy that no other evidence names.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(PAGES_JOB('deploy', '')),
  }),
  fixture('cite-ungated-reusable-deploy', 'The ungated deploy runs in a reusable workflow; the caller is cited at its `uses:` line.', {
    '.github/workflows/pages.yml': DEPLOY_WORKFLOW(CALL_JOB('deploy', './.github/workflows/pages-reusable.yml')),
    '.github/workflows/pages-reusable.yml': REUSABLE_WORKFLOW(PAGES_JOB('publish', '')),
  }),
  fixture('cite-print-only-workflow', 'A pull-request workflow that only prints, beside the counted CI workflow.', {
    '.github/workflows/notify.yml':
      'name: notify\non:\n  pull_request:\njobs:\n  notify:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "tests run elsewhere"\n',
  }),
];

const INVESTIGATED_NODE_PROJECT = (ciWorkflow: string): Readonly<Record<string, string>> => ({
  'package.json': `${JSON.stringify(
    {
      name: 'gatesite',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'node --test', lint: 'eslint .', build: 'tsc -p .' },
      devDependencies: { eslint: '9.0.0', typescript: '5.6.0' },
    },
    null,
    2,
  )}\n`,
  'tsconfig.json': '{\n  "compilerOptions": { "outDir": "dist" },\n  "include": ["src"]\n}\n',
  'src/index.ts': 'export const double = (value: number): number => value * 2;\n',
  'test/double.test.js':
    "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('double', () => {\n  assert.equal(2 * 2, 4);\n});\n",
  'README.md': '# gatesite\n',
  LICENSE: 'MIT\n',
  '.travis.yml': 'language: node_js\nnode_js:\n  - 22\nscript:\n  - npm test\n',
  '.github/workflows/ci.yml': ciWorkflow,
  '.github/workflows/pages.yml': DEPLOY_WORKFLOW(PAGES_JOB('deploy', '')),
});

const NODE_CI_STEPS = 'jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n';

/** Item C: the shape investigated; scored under v17 and v27 and reported, with no code change. */
export const INVESTIGATION_FIXTURES: readonly FalseAssuranceFixture[] = [
  {
    name: 'investigate-travis-scripts-pr-ci-ungated-deploy',
    issue: '#517',
    purpose:
      'Package scripts for test, lint and build; a .travis.yml that runs the tests; one counted pull-request CI workflow; one push-to-main deploy workflow with no environment.',
    commits: [INVESTIGATED_NODE_PROJECT(`name: ci\non:\n  pull_request:\n${NODE_CI_STEPS}`)],
  },
  {
    name: 'investigate-travis-scripts-push-ci-ungated-deploy',
    issue: '#517',
    purpose:
      'The same, with the CI workflow triggered by every push (`on: [push]`), so it names neither a pull request nor the default branch: the deploy is the only workflow B3 reads as targeting the default branch.',
    commits: [INVESTIGATED_NODE_PROJECT(`name: ci\non: [push]\n${NODE_CI_STEPS}`)],
  },
];

export const PUBLISHING_GATES_FIXTURES: readonly FalseAssuranceFixture[] = [
  ...GATE_COUNTED,
  ...GATE_DISCOUNTED,
  ...CITE_FIXTURES,
  ...INVESTIGATION_FIXTURES,
];
