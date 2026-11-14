import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

import { DEPLOY_WORKFLOW, PAGES_JOB } from './b3-publishing-gates-fixtures.js';

// v27 B3, unread CI configuration disclosure (goal_cejel_v27_b3_unread_ci_config_disclosure,
// 2026-11-13; refs #517; operator ruling of 13 Nov on item C of the B3 publishing-rule PR: disclose
// only). Where v27's publishing rule takes `default_branch_ci_depth` to 0, B3's note names each CI
// configuration outside `isCiWorkflow`'s list as "a CI configuration Cejel does not read", matched
// by path alone. Synthetic repositories only. The two item C fixtures this goal starts from are
// `INVESTIGATION_FIXTURES` in b3-publishing-gates-fixtures.ts.

const NODE_PROJECT: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    {
      name: 'unreadci',
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
  'README.md': '# unreadci\n',
  LICENSE: 'MIT\n',
};

const NODE_CI_STEPS =
  'jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n';

/** A CI workflow on every push, naming neither a pull request nor the default branch. */
const PUSH_CI = `name: ci\non: [push]\n${NODE_CI_STEPS}`;
/** A CI workflow on pushes to main only: it targets the default branch. */
const PUSH_MAIN_CI = `name: ci\non:\n  push:\n    branches: [main]\n${NODE_CI_STEPS}`;
const UNGATED_DEPLOY = DEPLOY_WORKFLOW(PAGES_JOB('deploy', ''));

const TRAVIS = 'language: node_js\nnode_js:\n  - 22\nscript:\n  - npm test\n';
const DRONE = 'kind: pipeline\nname: default\nsteps:\n  - name: test\n    image: node:22\n    commands:\n      - npm test\n';
const BUILDKITE = 'steps:\n  - command: npm test\n';
const APPVEYOR = 'install:\n  - npm ci\ntest_script:\n  - npm test\n';
const BITBUCKET = 'pipelines:\n  default:\n    - step:\n        script:\n          - npm test\n';

const fixture = (name: string, purpose: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: '#517',
  purpose,
  commits: [{ ...NODE_PROJECT, ...files }],
});

/** The 31 Buildkite files of the capped fixture, in path order. */
export const MANY_BUILDKITE_FILES: readonly string[] = Array.from(
  { length: 31 },
  (_unused, index) => `.buildkite/pipelines/team-${String(index).padStart(2, '0')}-pipeline.yml`,
);

/** The note names them (v27, the publishing rule takes the count to 0). */
export const DISCLOSED: readonly FalseAssuranceFixture[] = [
  fixture(
    'unread-ci-five-kinds-push-ci-ungated-deploy',
    'Every listed kind of CI configuration Cejel does not read, a CI workflow on every push, and an ungated push-to-main deploy: the deploy is the only workflow B3 reads as targeting the default branch.',
    {
      '.travis.yml': TRAVIS,
      '.drone.yml': DRONE,
      '.buildkite/pipeline.yml': BUILDKITE,
      'appveyor.yml': APPVEYOR,
      'bitbucket-pipelines.yml': BITBUCKET,
      '.github/workflows/ci.yml': PUSH_CI,
      '.github/workflows/pages.yml': UNGATED_DEPLOY,
    },
  ),
  fixture(
    'unread-ci-many-buildkite-push-ci-ungated-deploy',
    'The same shape with 31 Buildkite pipeline files: more than the note has room to name, so the rest are counted.',
    {
      ...Object.fromEntries(MANY_BUILDKITE_FILES.map((file) => [file, BUILDKITE])),
      '.github/workflows/ci.yml': PUSH_CI,
      '.github/workflows/pages.yml': UNGATED_DEPLOY,
    },
  ),
  fixture(
    'unread-ci-travis-deploy-only',
    'A .travis.yml and an ungated push-to-main deploy, with no other workflow.',
    {
      '.travis.yml': TRAVIS,
      '.github/workflows/pages.yml': UNGATED_DEPLOY,
    },
  ),
];

/** The note gains nothing. */
export const NOT_DISCLOSED: readonly FalseAssuranceFixture[] = [
  fixture(
    'unread-ci-travis-push-main-ci-ungated-deploy',
    'A .travis.yml, a counted CI workflow on pushes to main, and an ungated push-to-main deploy: the count goes 2 to 1, not to 0.',
    {
      '.travis.yml': TRAVIS,
      '.github/workflows/ci.yml': PUSH_MAIN_CI,
      '.github/workflows/pages.yml': UNGATED_DEPLOY,
    },
  ),
  fixture(
    'unread-ci-travis-push-main-ci-no-deploy',
    'A .travis.yml and a counted CI workflow on pushes to main, no publishing workflow.',
    {
      '.travis.yml': TRAVIS,
      '.github/workflows/ci.yml': PUSH_MAIN_CI,
    },
  ),
  fixture(
    'unread-ci-none-push-ci-ungated-deploy',
    'The push-CI shape with no CI configuration outside the list Cejel reads: the count goes 1 to 0 and there is nothing to name.',
    {
      '.github/workflows/ci.yml': PUSH_CI,
      '.github/workflows/pages.yml': UNGATED_DEPLOY,
    },
  ),
  fixture(
    'unread-ci-travis-print-only-push-main',
    'A .travis.yml, a CI workflow on every push, and a push-to-main workflow that only prints: the count goes 1 to 0 by the not-shown-to-run-a-check rule, not the publishing rule.',
    {
      '.travis.yml': TRAVIS,
      '.github/workflows/ci.yml': PUSH_CI,
      '.github/workflows/notify.yml':
        'name: notify\non:\n  push:\n    branches: [main]\njobs:\n  notify:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "tests run elsewhere"\n',
    },
  ),
  fixture(
    'unread-ci-nested-paths-push-ci-ungated-deploy',
    'The push-CI shape whose CI-named files are not at the paths those systems read (a nested .travis.yml, a nested appveyor.yml, a .travis.yml.bak): none is named.',
    {
      'packages/web/.travis.yml': TRAVIS,
      'docs/appveyor.yml': APPVEYOR,
      '.travis.yml.bak': TRAVIS,
      '.github/workflows/ci.yml': PUSH_CI,
      '.github/workflows/pages.yml': UNGATED_DEPLOY,
    },
  ),
];

export const UNREAD_CI_CONFIG_FIXTURES: readonly FalseAssuranceFixture[] = [...DISCLOSED, ...NOT_DISCLOSED];
