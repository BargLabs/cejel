import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

// The fixtures of b3-publishing-with-checks.test.ts: a v27 rubric correction to #517. Under v27, B3
// stopped counting a CI workflow with no pull-request trigger that runs an unconditional publish,
// release or deploy step, whatever else it runs. A workflow that runs a check before it publishes
// is default-branch CI whether or not it also publishes, so v27 counts it again; one that publishes
// without checking stays excluded. Each fixture is a small repository with a pull-request CI
// workflow and one publishing workflow beside it.
//
// In a module of their own so the same fixtures can be scored by an earlier Cejel:
// b3-publishing-with-checks-v17.json pins v17's output for every one of them.
//
// Fixtures are synthetic; no public repository is cloned.

const PR_AND_MAIN = 'on:\n  pull_request:\n  push:\n    branches: [main]\n';
const PUSH_MAIN = 'on:\n  push:\n    branches: [main]\n';
const PUSH_TAGS = "on:\n  push:\n    tags: ['v*']\n";

const JS_PACKAGE = `${JSON.stringify(
  {
    name: 'tint',
    version: '1.0.0',
    main: 'index.js',
    scripts: { test: 'uvu test', build: 'node build.js' },
    devDependencies: { uvu: '0.5.6' },
  },
  null,
  2,
)}\n`;

const JS_BASE: Readonly<Record<string, string>> = {
  'package.json': JS_PACKAGE,
  'README.md': '# tint\n',
  LICENSE: 'MIT\n',
  'index.js': 'export function red(text) {\n  return `\\u001b[31m${text}\\u001b[39m`;\n}\n',
  'build.js': "import { mkdirSync, copyFileSync } from 'node:fs';\nmkdirSync('dist', { recursive: true });\ncopyFileSync('index.js', 'dist/index.js');\n",
  'test/index.js':
    "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\nimport { red } from '../index.js';\n\ntest('red', () => {\n  assert.ok(red('x').includes('x'));\n});\n\ntest.run();\n",
  '.github/workflows/ci.yml': `name: ci\n${PR_AND_MAIN}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm install\n      - run: npm test\n`,
};

const PY_PROJECT = ['[project]', 'name = "signer"', 'version = "1.0.0"', 'dependencies = []', ''].join('\n');

const PY_BASE: Readonly<Record<string, string>> = {
  'README.md': '# signer\n\nSign and verify values.\n',
  LICENSE: 'MIT\n',
  'pyproject.toml': PY_PROJECT,
  'src/signer/__init__.py':
    'import hmac\n\n\ndef sign(key, value):\n    return hmac.new(key, value, "sha256").hexdigest()\n\n\ndef verify(key, value, mac):\n    return hmac.compare_digest(sign(key, value), mac)\n',
  'tests/test_signer.py':
    'from signer import sign, verify\n\n\ndef test_roundtrip():\n    assert verify(b"k", b"v", sign(b"k", b"v"))\n',
  '.github/workflows/tests.yaml': `name: Tests\n${PR_AND_MAIN}jobs:\n  tests:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n      - run: pip install -e . pytest\n      - run: pytest\n`,
};

const SETUP_NODE = '      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          registry-url: https://registry.npmjs.org\n';
const NPM_PUBLISH = '      - run: npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n';

/** A one-job release workflow on push to main: checkout, setup, then `steps`. */
const oneJobRelease = (steps: string, on = PUSH_MAIN): string =>
  `name: release\n${on}jobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}${steps}`;

export const RELEASE = '.github/workflows/release.yml';
export const PUBLISH = '.github/workflows/publish.yaml';
export const DOCS = '.github/workflows/docs.yml';

type Shape = readonly [name: string, purpose: string, files: Record<string, string>];

/** Publishing workflows that run a check before they publish: counted under v27 again. */
export const COUNTED: readonly Shape[] = [
  [
    'npm-test-then-publish',
    'Counted: on push to main, one job runs the npm test script and then publishes to npm.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-in-needed-job',
    'Counted: the npm test script runs in a job the publishing job needs.',
    {
      ...JS_BASE,
      [RELEASE]: `name: release\n${PUSH_MAIN}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm ci\n      - run: npm test\n  publish:\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}`,
    },
  ],
  [
    'npm-test-in-transitively-needed-job',
    'Counted: the test job is needed by the build job, which the publishing job needs, written as block and flow lists.',
    {
      ...JS_BASE,
      [RELEASE]: `name: release\n${PUSH_MAIN}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm ci\n      - run: npm test\n  build:\n    needs:\n      - test\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run build\n  publish:\n    needs: [build]\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}`,
    },
  ],
];

// Third pass: 'pytest-before-twine-on-tag' moved to INSTALL_RUNS_PROJECT_CODE_EXCLUDED below.

/** Publishing workflows that publish without a check before: still excluded under v27. */
export const EXCLUDED: readonly Shape[] = [
  [
    'build-then-gh-pages',
    'Excluded: setup, a build without verification, and a gh-pages deploy.',
    {
      ...JS_BASE,
      [DOCS]: `name: docs\n${PUSH_MAIN}jobs:\n  deploy:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm ci\n      - run: npm run build\n      - uses: peaceiris/actions-gh-pages@v4\n        with:\n          github_token: \${{ secrets.GITHUB_TOKEN }}\n          publish_dir: ./dist\n`,
    },
  ],
  [
    'test-continue-on-error',
    'Excluded: the check step has `continue-on-error: true`, so its failure does not stop the publish.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: npm test\n        continue-on-error: true\n${NPM_PUBLISH}`) },
  ],
  [
    'test-or-true',
    'Excluded: the check runs as `npm test || true`, which never fails the job.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: npm test || true\n${NPM_PUBLISH}`) },
  ],
  [
    'test-after-publish',
    'Excluded: the check runs after the publish step.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n${NPM_PUBLISH}      - run: npm test\n`) },
  ],
  [
    'test-in-job-not-needed',
    'Excluded: the check runs in a job the publishing job does not need, so the two run side by side.',
    {
      ...JS_BASE,
      [RELEASE]: `name: release\n${PUSH_MAIN}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}`,
    },
  ],
  [
    'test-then-publish-if-always',
    'Excluded: the publishing step runs `if: always()`, so it runs whether the check passed or not.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: npm test\n      - if: always()\n        run: npm publish\n`) },
  ],
  [
    'test-word-echoed',
    'Excluded: `npm test` named in echo text is not a check.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: echo npm test runs in ci.yml\n${NPM_PUBLISH}`) },
  ],
  [
    'test-step-if-false',
    'Excluded: the check step carries `if: false`, a condition that is always false.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - if: false\n        run: npm test\n${NPM_PUBLISH}`) },
  ],
];

// Edge cases of the check reading, added after the v17 pin was written; they are compared with v17
// by the no-rise test only, and are not in b3-publishing-with-checks-v17.json.
const CALLED_PYPI = `name: pypi\non:\n  workflow_call:\njobs:\n  upload:\n    runs-on: ubuntu-latest\n    permissions:\n      id-token: write\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install build\n      - run: python -m build\n      - uses: pypa/gh-action-pypi-publish@release/v1\n`;
const PY_TEST_JOB = '  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install -e . pytest\n      - run: pytest\n';

// Third pass: 'reusable-publish-needs-test' moved to INSTALL_RUNS_PROJECT_CODE_EXCLUDED below.
export const EDGE_COUNTED: readonly Shape[] = [];

export const EDGE_EXCLUDED: readonly Shape[] = [
  [
    'reusable-publish-test-not-needed',
    'Excluded: the job calling the publishing reusable workflow does not need the test job.',
    {
      ...PY_BASE,
      [PUBLISH]: `name: publish\n${PUSH_MAIN}jobs:\n${PY_TEST_JOB}  release:\n    uses: ./.github/workflows/pypi.yaml\n    secrets: inherit\n`,
      '.github/workflows/pypi.yaml': CALLED_PYPI,
    },
  ],
  [
    'pip-install-pytest-is-not-a-check',
    'Excluded: `pip install pytest` names a test runner as an argument; it installs, it does not check.',
    {
      ...PY_BASE,
      [PUBLISH]: `name: publish\n${PUSH_MAIN}jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install build twine pytest\n      - run: python -m build\n      - run: twine upload dist/*\n`,
    },
  ],
  [
    'tsc-alias-is-not-a-check',
    'Excluded: `tsc-alias` rewrites paths; only a command named exactly `tsc` is a type check.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: npx tsc-alias\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-if-present',
    'Excluded: `npm test --if-present` runs nothing when the script is missing.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: npm test --if-present\n${NPM_PUBLISH}`) },
  ],
];

// ---- Second pass (supersedes #620): the fixtures of the adversarial review of #620 -------------
//
// Items A to E and G of goal_cejel_v27_b3_publishing_with_checks_v2. Each is pinned in
// b3-publishing-with-checks-v17.json with the rest, so v17's output on it is shown unchanged.

/** A one-job release on push to main: setup, `npm ci`, then `steps`. */
const releaseAfterInstall = (steps: string): string => oneJobRelease(`      - run: npm ci\n${steps}`);

/** A two-job release on push to main: a test job, then a publishing job whose key lines are `jobKeys`. */
const testThenPublishJob = (jobKeys: string): string =>
  `name: release\n${PUSH_MAIN}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm ci\n      - run: npm test\n  publish:\n${jobKeys}    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}`;

/** A JavaScript package whose `test` script is `script`. */
const jsWithTestScript = (script: string): Record<string, string> => ({
  ...JS_BASE,
  'package.json': `${JSON.stringify({ name: 'tint', version: '1.0.0', main: 'index.js', scripts: { test: script, build: 'node build.js' } }, null, 2)}\n`,
});

/** A Python release workflow on push to main whose check step is `check`. */
const pythonRelease = (check: string): string =>
  `name: publish\n${PUSH_MAIN}jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n      - run: pip install -e . pytest build twine\n      - run: ${check}\n      - run: python -m build\n      - run: twine upload dist/*\n`;

/** Item A: a status function in an `if:` other than plain `success()` lets a publish run after a failed check. */
export const STATUS_FUNCTION_EXCLUDED: readonly Shape[] = [
  [
    'publish-if-success-or-true',
    'Excluded: the publish step runs `if: success() || true`, which holds after a failed check.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: success() || true\n        run: npm publish\n`) },
  ],
  [
    'publish-if-success-or-push-event',
    "Excluded: the publish step runs `if: success() || github.event_name == 'push'`, which holds on every push.",
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: success() || github.event_name == 'push'\n        run: npm publish\n`),
    },
  ],
  [
    'publish-if-upper-case-success-or-true',
    'Excluded: `SUCCESS() || true`; GitHub reads function names ignoring case.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: SUCCESS() || true\n        run: npm publish\n`) },
  ],
  [
    'publish-if-not-failure-or-true',
    'Excluded: the publish step runs `if: ${{ !failure() || true }}`.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: \${{ !failure() || true }}\n        run: npm publish\n`) },
  ],
  [
    'publish-if-always-and-ref',
    "Excluded: the publish step runs `if: always() && github.ref == 'refs/heads/main'`.",
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: always() && github.ref == 'refs/heads/main'\n        run: npm publish\n`),
    },
  ],
  [
    'publish-if-success-or-failure',
    'Excluded: the publish step runs `if: success() || failure()`.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: success() || failure()\n        run: npm publish\n`) },
  ],
  [
    'publish-if-not-cancelled',
    'Excluded: the publish step runs `if: ${{ !cancelled() }}`.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: \${{ !cancelled() }}\n        run: npm publish\n`) },
  ],
  [
    'publish-if-multi-line-success-or-push-event',
    "Excluded: the publish step's `if:` is a plain scalar over two lines, `success()` then `|| github.event_name == 'push'`.",
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - run: npm publish\n        if: success()\n          || github.event_name == 'push'\n`),
    },
  ],
  [
    'publishing-job-if-success-or-true',
    'Excluded: the publishing job needs the test job but runs `if: ${{ success() || true }}`, so it runs when the test fails.',
    { ...JS_BASE, [RELEASE]: testThenPublishJob('    needs: test\n    if: ${{ success() || true }}\n') },
  ],
  [
    'publishing-job-if-multi-line-success-or-true',
    "Excluded: the publishing job's `if:` is a plain scalar over two lines, `success()` then `|| true`.",
    { ...JS_BASE, [RELEASE]: testThenPublishJob('    needs: test\n    if: success()\n      || true\n') },
  ],
];

/** Item A, the other side: plain `success()` ANDed with a term that holds is still a check gate. */
export const STATUS_FUNCTION_COUNTED: readonly Shape[] = [
  [
    'publish-if-success-and-fork-guard',
    "Counted: the publish step runs `if: success() && github.repository == 'acme/tint'`, which reduces to plain success() on the repository's own runs.",
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - if: success() && github.repository == 'acme/tint'\n        run: npm publish\n`),
    },
  ],
];

/** Item B: a `run:` that is not a step's own key is not a check. */
export const RUN_KEY_EXCLUDED: readonly Shape[] = [
  [
    'check-in-action-with-run-input',
    'Excluded: `run: npm test` is an input under `with:` of an action, not a step command.',
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - uses: acme/run-anything@v1\n        with:\n          run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'check-in-github-script-run-input',
    'Excluded: `actions/github-script` given an input named `run`; the action runs its script, not a shell command.',
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(
        `      - uses: actions/github-script@v7\n        with:\n          run: npm test\n          script: console.log('ok')\n${NPM_PUBLISH}`,
      ),
    },
  ],
  [
    'check-in-env-var-named-run',
    'Excluded: `run: npm test` is an environment variable of a build step, not its command.',
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - run: npm run build\n        env:\n          run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'check-in-nested-mapping',
    'Excluded: `run: npm test` sits in a mapping nested in an action input.',
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - uses: acme/configure@v1\n        with:\n          settings:\n            run: npm test\n${NPM_PUBLISH}`),
    },
  ],
];

/** Item C: a check whose failure does not end its step. */
export const FAILURE_STOPS_EXCLUDED: readonly Shape[] = [
  [
    'check-then-semicolon-true',
    'Excluded: `npm test; true`; the step exits with the status of `true`.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test; true\n${NPM_PUBLISH}`) },
  ],
  [
    'check-piped-into-tee',
    'Excluded: `npm test | tee test.log` without pipefail; the step exits with the status of tee.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test | tee test.log\n${NPM_PUBLISH}`) },
  ],
  [
    'check-backgrounded',
    'Excluded: `npm test &` runs the check in the background; the step does not wait for it.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test &\n${NPM_PUBLISH}`) },
  ],
];

export const FAILURE_STOPS_COUNTED: readonly Shape[] = [
  [
    'check-piped-into-tee-with-pipefail',
    'Counted: the step sets pipefail, then pipes `npm test` into tee; under bash -e the failing pipeline ends the step.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: |\n          set -o pipefail\n          npm test | tee test.log\n${NPM_PUBLISH}`) },
  ],
];

/** Item E: a command that only reports, and a test script that runs nothing, are not checks. */
export const FAKE_CHECK_EXCLUDED: readonly Shape[] = [
  ['pytest-version', 'Excluded: `pytest --version` prints a version.', { ...PY_BASE, [PUBLISH]: pythonRelease('pytest --version') }],
  ['pytest-capital-v', 'Excluded: `pytest -V` prints a version.', { ...PY_BASE, [PUBLISH]: pythonRelease('pytest -V') }],
  ['pytest-help', 'Excluded: `pytest --help` prints usage.', { ...PY_BASE, [PUBLISH]: pythonRelease('pytest --help') }],
  ['pytest-h', 'Excluded: `pytest -h` prints usage.', { ...PY_BASE, [PUBLISH]: pythonRelease('pytest -h') }],
  [
    'npx-tsc-version',
    'Excluded: `npx tsc --version` prints a version.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npx tsc --version\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-empty-script',
    'Excluded: `npm test` where the root package.json test script is empty.',
    { ...jsWithTestScript(''), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'yarn-test-script-true',
    'Excluded: `yarn test` where the root package.json test script is `true`.',
    { ...jsWithTestScript('true'), [RELEASE]: releaseAfterInstall(`      - run: yarn test\n${NPM_PUBLISH}`) },
  ],
  [
    'pnpm-test-script-exit-0',
    'Excluded: `pnpm test` where the root package.json test script is `exit 0`.',
    { ...jsWithTestScript('exit 0'), [RELEASE]: releaseAfterInstall(`      - run: pnpm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-run-test-script-echo',
    'Excluded: `npm run test` where the root package.json test script only echoes.',
    { ...jsWithTestScript('echo "no tests yet"'), [RELEASE]: releaseAfterInstall(`      - run: npm run test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-script-colon',
    'Excluded: `npm test` where the root package.json test script is `:`.',
    { ...jsWithTestScript(':'), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
];

/** Item G: a workflow GitHub rejects, and a publish the reader cannot see. */
export const READING_EXCLUDED: readonly Shape[] = [
  [
    'publishing-job-needs-itself',
    'Excluded: the publishing job needs itself, which GitHub rejects; its only check runs after the publish.',
    {
      ...JS_BASE,
      [RELEASE]: `name: release\n${PUSH_MAIN}jobs:\n  publish:\n    needs: publish\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}      - run: npm test\n`,
    },
  ],
  [
    'needs-cycle',
    'Excluded: the test and publishing jobs need each other, a cycle GitHub rejects.',
    {
      ...JS_BASE,
      [RELEASE]: `name: release\n${PUSH_MAIN}jobs:\n  test:\n    needs: publish\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n  publish:\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}`,
    },
  ],
  [
    'unread-flow-style-publish-beside-checked-one',
    'Excluded: a second job with no `needs:` publishes in a flow-style step, `- {run: npm publish}`, which the reader does not read.',
    {
      ...JS_BASE,
      [RELEASE]: `${oneJobRelease(`      - run: npm ci\n      - run: npm test\n${NPM_PUBLISH}`)}  mirror:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - {run: npm publish}\n`,
    },
  ],
  [
    'unread-flow-style-step-after-check',
    'Excluded: the checked job also has a flow-style step, `- {run: npm publish --tag next}`; a workflow with a step the reader cannot read is withheld, wherever the step sits.',
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n      - {run: npm publish --tag next}\n${NPM_PUBLISH}`),
    },
  ],
  [
    'script-publish-before-check-in-same-job',
    'Excluded: a repository script that publishes runs before the check in the same job; only setup steps may come before a check.',
    {
      ...JS_BASE,
      'scripts/publish.sh': '#!/bin/sh\nset -e\nnpm publish\n',
      [RELEASE]: releaseAfterInstall(`      - run: ./scripts/publish.sh\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'script-publish-beside-checked-one',
    'Excluded: a second job with no `needs:` runs a repository script that publishes, with no check before it.',
    {
      ...JS_BASE,
      'scripts/publish.sh': '#!/bin/sh\nset -e\nnpm publish\n',
      [RELEASE]: `${oneJobRelease(`      - run: npm ci\n      - run: npm test\n${NPM_PUBLISH}`)}  mirror:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: ./scripts/publish.sh\n`,
    },
  ],
];

// Item D: twelve checked publishing workflows with long names, so B3's note reaches its limit.
export const MANY_CHECKED_WORKFLOWS: readonly string[] = Array.from(
  { length: 12 },
  (_, index) =>
    `.github/workflows/release-to-the-public-registry-after-the-whole-test-suite-passes-channel-${String(index + 1).padStart(2, '0')}.yml`,
);

export const MANY_CHECKED_NAME = 'twelve-checked-publishing-workflows';

const MANY_CHECKED: Shape = [
  MANY_CHECKED_NAME,
  'Counted: twelve publishing workflows with long names, each running the npm test script before it publishes.',
  {
    ...JS_BASE,
    ...Object.fromEntries(
      MANY_CHECKED_WORKFLOWS.map((file) => [file, releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`)] as const),
    ),
  },
];

/** The second pass's counted and excluded shapes, in the order the tests read them. */
export const V2_COUNTED: readonly Shape[] = [...STATUS_FUNCTION_COUNTED, ...FAILURE_STOPS_COUNTED];
export const V2_EXCLUDED: readonly Shape[] = [
  ...STATUS_FUNCTION_EXCLUDED,
  ...RUN_KEY_EXCLUDED,
  ...FAILURE_STOPS_EXCLUDED,
  ...FAKE_CHECK_EXCLUDED,
  ...READING_EXCLUDED,
];

// ---- Third pass: the fixtures of the adversarial review of #625 -------------------------------
//
// Findings F1 to F6 of the review of #625 at a9d9ff01. Each excluded fixture publishes after a
// check whose failure would not stop it, or whose check never runs; each was credited by #625's
// head. The counted fixtures are controls: the safe shape each new refusal leaves counted.

/** A one-job release on push to main whose top-level keys after `on:` are `top`. */
const oneJobReleaseWith = (top: string, steps: string): string => oneJobRelease(steps, `${PUSH_MAIN}${top}`);

/** A Python release on push to main: setup, `pip install pytest build twine`, then `check`. */
const pythonPlainRelease = (check: string): string =>
  `name: publish\n${PUSH_MAIN}jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n      - run: pip install pytest build twine\n      - run: ${check}\n      - run: python -m build\n      - run: twine upload dist/*\n`;

/** A JavaScript package whose scripts are `scripts`. */
const jsWithScripts = (scripts: Record<string, string>): Record<string, string> => ({
  ...JS_BASE,
  'package.json': `${JSON.stringify({ name: 'tint', version: '1.0.0', main: 'index.js', scripts }, null, 2)}\n`,
});

const MULTI_LINE_CHECK = '      - run: |\n          npm test\n          echo done\n';
const GH_RELEASE = '      - uses: softprops/action-gh-release@v2\n';

/** A two-job release: a test job whose extra job-level key lines are `testKeys`, then a publishing job that needs it. */
const testJobWithKeysThenPublish = (testKeys: string): string =>
  `name: release\n${PUSH_MAIN}jobs:\n  test:\n    runs-on: ubuntu-latest\n${testKeys}    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm ci\n      - run: npm test\n  publish:\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}`;

/** F1: a YAML escape in a double-quoted scalar spells what the reader refuses, in text it does not see. */
export const ESCAPE_EXCLUDED: readonly Shape[] = [
  [
    'escaped-always-on-publish-step',
    'Excluded: a second publish runs `if: "\\u0061lways()"`, which YAML decodes to `always()`, so it runs after a failed check.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}      - run: npm publish --tag next\n        if: "\\u0061lways()"\n`) },
  ],
  [
    'escaped-not-cancelled-on-publish-step',
    'Excluded: a second publish runs `if: "${{ \\x21cancelled() }}"`, which YAML decodes to `${{ !cancelled() }}`.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}      - run: npm publish --tag next\n        if: "\${{ \\x21cancelled() }}"\n`) },
  ],
  [
    'escaped-always-on-publishing-job',
    'Excluded: a publishing job that needs the test job runs `if: "\\u0061lways()"`, so it runs when the test fails.',
    {
      ...JS_BASE,
      [RELEASE]: `${testThenPublishJob('    needs: test\n    if: "\\u0061lways()"\n')}  release:\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${GH_RELEASE}`,
    },
  ],
  [
    'escaped-bash-env-key-on-check-step',
    'Excluded: the check step sets `"BASH\\u005fENV"`, which YAML decodes to BASH_ENV; the file it names turns errexit off, so the check failing does not end the step.',
    {
      ...JS_BASE,
      '.ci/env.sh': 'set +e\n',
      [RELEASE]: releaseAfterInstall(`${MULTI_LINE_CHECK}        env:\n          "BASH\\u005fENV": .ci/env.sh\n${NPM_PUBLISH}`),
    },
  ],
];

/** F2: after `set -o pipefail`, a pipeline whose other side backgrounds it or puts it in a list. */
export const PIPELINE_EXCLUDED: readonly Shape[] = [
  [
    'pipefail-check-pipeline-backgrounded',
    'Excluded: `npm test | tee test.log &` after pipefail; the pipeline runs in the background and the step exits 0.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: |\n          set -o pipefail\n          npm test | tee test.log &\n${NPM_PUBLISH}`) },
  ],
  [
    'pipefail-check-pipeline-in-and-list',
    'Excluded: `npm test | tee test.log && echo passed`, then another line; a failure in an `&&` list does not stop bash -e.',
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall(`      - run: |\n          set -o pipefail\n          npm test | tee test.log && echo passed\n          echo done\n${NPM_PUBLISH}`),
    },
  ],
];

/** F3 and F4: a shell, runner or continue-on-error setting spelled so the line readers miss it. */
export const HIDDEN_SETTING_EXCLUDED: readonly Shape[] = [
  [
    'shell-in-flow-mapping-defaults',
    'Excluded: `defaults: { run: { shell: "bash {0}" } }` runs every step without -e, so a failing first line does not end the check step.',
    { ...JS_BASE, [RELEASE]: oneJobReleaseWith('defaults: { run: { shell: "bash {0}" } }\n', `      - run: npm ci\n${MULTI_LINE_CHECK}${NPM_PUBLISH}`) },
  ],
  [
    'shell-key-with-space-before-colon',
    'Excluded: `shell : bash {0}` under `defaults: run:` is the shell key; every step runs without -e.',
    { ...JS_BASE, [RELEASE]: oneJobReleaseWith('defaults:\n  run:\n    shell : bash {0}\n', `      - run: npm ci\n${MULTI_LINE_CHECK}${NPM_PUBLISH}`) },
  ],
  [
    'shell-key-quoted',
    'Excluded: `"shell": bash {0}` under `defaults: run:` is the shell key; every step runs without -e.',
    { ...JS_BASE, [RELEASE]: oneJobReleaseWith('defaults:\n  run:\n    "shell": bash {0}\n', `      - run: npm ci\n${MULTI_LINE_CHECK}${NPM_PUBLISH}`) },
  ],
  [
    'custom-true-shell-in-flow-defaults',
    'Excluded: `defaults: { run: { shell: "true {0}" } }` runs no step script at all, so the check never runs; an action publishes.',
    { ...JS_BASE, [RELEASE]: oneJobReleaseWith('defaults: { run: { shell: "true {0}" } }\n', `      - run: npm ci\n      - run: npm test\n${GH_RELEASE}`) },
  ],
  [
    'runs-on-key-with-space-before-colon',
    'Excluded: `runs-on : windows-latest` puts the publishing job on Windows, where pwsh does not stop at a failing first line.',
    {
      ...JS_BASE,
      [RELEASE]: `name: release\n${PUSH_MAIN}jobs:\n  publish:\n    runs-on : windows-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n      - run: |\n          npm test\n          git --version\n${NPM_PUBLISH}  notify:\n    needs: publish\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm --version\n`,
    },
  ],
  [
    'needed-job-continue-on-error-space-before-colon',
    'Excluded: the needed test job sets `continue-on-error : true`, so the publishing job runs when it fails.',
    { ...JS_BASE, [RELEASE]: testJobWithKeysThenPublish('    continue-on-error : true\n') },
  ],
  [
    'needed-job-continue-on-error-quoted-key',
    'Excluded: the needed test job sets `"continue-on-error": true`, so the publishing job runs when it fails.',
    { ...JS_BASE, [RELEASE]: testJobWithKeysThenPublish('    "continue-on-error": true\n') },
  ],
  [
    'needed-job-continue-on-error-merge-key',
    'Excluded: the needed test job merges `continue-on-error: true` from an anchor with `<<: *common`.',
    {
      ...JS_BASE,
      [RELEASE]: testJobWithKeysThenPublish('    <<: *common\n').replace('jobs:\n', 'x-common: &common\n  continue-on-error: true\njobs:\n'),
    },
  ],
];

/** F5: a line before the check, in the check's own step, that stops the check running. */
export const CHECK_NEVER_RUNS_EXCLUDED: readonly Shape[] = [
  [
    'set-n-before-check',
    'Excluded: `set -n` reads the rest of the script without running it, so `npm test` never runs and the step exits 0.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: |\n          set -n\n          npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'set-o-noexec-before-check',
    'Excluded: `set -o noexec` reads the rest of the script without running it.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: |\n          set -o noexec\n          npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'set-n-and-check-on-one-line',
    'Excluded: `set -n && npm test`; the check after `set -n` is never run.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: set -n && npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'hash-p-before-check',
    'Excluded: `hash -p /usr/bin/true npm` makes `npm` run `true`, so `npm test` passes without testing.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: |\n          hash -p /usr/bin/true npm\n          npm test\n${NPM_PUBLISH}`) },
  ],
];

/** F6: a package-manager setting that replaces the shell scripts run in. */
export const SCRIPT_SHELL_EXCLUDED: readonly Shape[] = [
  [
    'npmrc-script-shell-npm-test',
    'Excluded: `.npmrc` sets `script-shell=true`, so `npm test` runs `true` instead of the test script.',
    { ...JS_BASE, '.npmrc': 'script-shell=true\n', [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npmrc-script-shell-npx-check',
    'Excluded: `.npmrc` sets `script-shell=true`; `npx` runs through it too, so `npx vitest run` runs `true`. No install runs first.',
    { ...JS_BASE, '.npmrc': 'script-shell=true\n', [RELEASE]: oneJobRelease(`      - run: npx vitest run\n${NPM_PUBLISH}`) },
  ],
  [
    'npmrc-node-options-npx-check',
    'Excluded: `.npmrc` sets `node-options`, which npm adds to every script it runs, so it can replace the check.',
    {
      ...JS_BASE,
      '.npmrc': 'node-options=--require ./scripts/pass.cjs\n',
      'scripts/pass.cjs': 'process.on(\'exit\', () => { process.exitCode = 0; });\n',
      [RELEASE]: oneJobRelease(`      - run: npx vitest run\n${NPM_PUBLISH}`),
    },
  ],
  [
    'yarnrc-yarn-path-yarn-test',
    'Excluded: `.yarnrc.yml` sets `yarnPath`, so `yarn` runs a committed script of the repository rather than yarn.',
    {
      ...JS_BASE,
      '.yarnrc.yml': 'yarnPath: .yarn/releases/yarn.cjs\n',
      '.yarn/releases/yarn.cjs': 'process.exit(0);\n',
      [RELEASE]: oneJobRelease(`      - run: yarn test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'pnpmfile-runs-at-install-before-check',
    'Excluded: `.pnpmfile.cjs` is code pnpm runs on install, before the check.',
    {
      ...JS_BASE,
      '.pnpmfile.cjs': "module.exports = { hooks: {} };\n",
      [RELEASE]: oneJobRelease(`      - run: pnpm install\n      - run: node --test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'yarn-plugin-runs-at-install-before-check',
    'Excluded: a committed yarn plugin is code yarn runs on install, before the check.',
    {
      ...JS_BASE,
      '.yarn/plugins/plugin.cjs': 'module.exports = { name: "plugin", factory: () => ({}) };\n',
      [RELEASE]: oneJobRelease(`      - run: yarn install\n      - run: node --test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'workflow-env-npm-config-script-shell',
    'Excluded: the workflow sets `npm_config_script_shell`, the environment form of the same setting.',
    { ...JS_BASE, [RELEASE]: oneJobReleaseWith('env:\n  npm_config_script_shell: "true"\n', `      - run: npm ci\n      - run: npm test\n${NPM_PUBLISH}`) },
  ],
];

/** F6: an install before the check that runs the project's own code. */
export const INSTALL_RUNS_PROJECT_CODE_EXCLUDED: readonly Shape[] = [
  [
    'pytest-before-twine-on-tag',
    'Excluded since the third pass (counted by the second): `pip install -e .` builds and installs the project before pytest, running its build code before any check.',
    {
      ...PY_BASE,
      [PUBLISH]: `name: publish\n${PUSH_TAGS}jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n      - run: pip install -e . pytest build twine\n      - run: pytest\n      - run: python -m build\n      - run: twine upload dist/*\n        env:\n          TWINE_PASSWORD: \${{ secrets.PYPI_TOKEN }}\n`,
    },
  ],
  [
    'reusable-publish-needs-test',
    'Excluded since the third pass (counted by the second): the needed test job runs `pip install -e .` before pytest.',
    {
      ...PY_BASE,
      [PUBLISH]: `name: publish\n${PUSH_MAIN}jobs:\n${PY_TEST_JOB}  release:\n    needs: test\n    uses: ./.github/workflows/pypi.yaml\n    secrets: inherit\n`,
      '.github/workflows/pypi.yaml': CALLED_PYPI,
    },
  ],
  [
    'pip-install-local-path-before-check',
    'Excluded: `pip install .[test]` installs the project from its own directory before the check.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest').replace('pip install pytest build twine', 'pip install .[test] build twine') },
  ],
  [
    'binding-gyp-build-at-install-before-check',
    'Excluded: a root binding.gyp makes `npm ci` build it, running the project\'s build before the check.',
    {
      ...JS_BASE,
      'binding.gyp': "{ 'targets': [] }\n",
      [RELEASE]: oneJobRelease(`      - run: npm ci\n      - run: node --test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'npm-install-local-path-before-check',
    'Excluded: `npm install ./tools/publisher` installs a package from a path in the repository, running its install scripts before the check.',
    { ...JS_BASE, [RELEASE]: oneJobRelease(`      - run: npm install ./tools/publisher\n      - run: node --test\n${NPM_PUBLISH}`) },
  ],
  [
    'uv-sync-installs-project-before-check',
    'Excluded: `uv sync` installs the project itself before pytest.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest').replace('pip install pytest build twine', 'uv sync') },
  ],
  [
    'poetry-install-installs-project-before-check',
    'Excluded: `poetry install` installs the project itself before pytest.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest').replace('pip install pytest build twine', 'poetry install') },
  ],
  [
    'pdm-install-installs-project-before-check',
    'Excluded: `pdm install` installs the project itself before pytest.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest').replace('pip install pytest build twine', 'pdm install') },
  ],
  [
    'prepare-script-runs-at-install-before-check',
    'Excluded: the root package.json has a `prepare` script, which `npm ci` runs before `npm test`; it can publish before the check.',
    {
      ...jsWithScripts({ test: 'uvu test', prepare: 'node scripts/release.js' }),
      'scripts/release.js': "import { execSync } from 'node:child_process';\nexecSync('npm publish');\n",
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
];

/** F6: a check command given a flag with which it cannot fail. */
export const NO_FAIL_FLAG_EXCLUDED: readonly Shape[] = [
  ['pytest-collect-only', 'Excluded: `pytest --collect-only` lists tests without running them.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest --collect-only') }],
  ['pytest-co', 'Excluded: `pytest --co`, the short form of --collect-only.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest --co') }],
  ['ruff-exit-zero', 'Excluded: `ruff check --exit-zero src` exits 0 whatever it finds.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff check --exit-zero src') }],
  [
    'jest-pass-with-no-tests',
    'Excluded: `npx jest --passWithNoTests` passes when it finds no test.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npx jest --passWithNoTests\n${NPM_PUBLISH}`) },
  ],
  [
    'tsc-show-config',
    'Excluded: `npx tsc --showConfig` prints the configuration and checks nothing.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npx tsc --showConfig\n${NPM_PUBLISH}`) },
  ],
  [
    'eslint-no-error-on-unmatched-pattern',
    'Excluded: `npx eslint --no-error-on-unmatched-pattern nothing` lints no file and exits 0.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npx eslint --no-error-on-unmatched-pattern nothing\n${NPM_PUBLISH}`) },
  ],
];

/** Controls: the safe shape next to each third-pass refusal, still counted. */
export const V3_COUNTED: readonly Shape[] = [
  [
    'pytest-after-plain-pip-install',
    'Counted: `pip install pytest build twine` installs named packages only, then pytest runs before the upload.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest') },
  ],
  [
    'reusable-publish-needs-plain-pip-test',
    'Counted: the publishing job calls a reusable workflow and needs a test job that installs named packages only, then runs pytest.',
    {
      ...PY_BASE,
      [PUBLISH]: `name: publish\n${PUSH_MAIN}jobs:\n${PY_TEST_JOB.replace('pip install -e . pytest', 'pip install pytest')}  release:\n    needs: test\n    uses: ./.github/workflows/pypi.yaml\n    secrets: inherit\n`,
      '.github/workflows/pypi.yaml': CALLED_PYPI,
    },
  ],
  [
    'set-euo-pipefail-before-check',
    'Counted: `set -euo pipefail` only makes the step stricter, then `npm test` runs.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: |\n          set -euo pipefail\n          npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'poetry-install-no-root-before-check',
    'Counted: `poetry install --no-root` installs the dependencies only, then pytest runs.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest').replace('pip install pytest build twine', 'poetry install --no-root') },
  ],
  [
    'npmrc-registry-only',
    'Counted: `.npmrc` names a registry and sets no script shell.',
    { ...JS_BASE, '.npmrc': 'registry=https://registry.npmjs.org/\n', [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'job-level-keys-written-plainly',
    'Counted: job-level `timeout-minutes`, `env` and `defaults` written as plain block keys, with `shell: bash`.',
    {
      ...JS_BASE,
      [RELEASE]: testJobWithKeysThenPublish('    timeout-minutes: 10\n    env:\n      CI: true\n    defaults:\n      run:\n        shell: bash\n'),
    },
  ],
];

export const V3_EXCLUDED: readonly Shape[] = [
  ...ESCAPE_EXCLUDED,
  ...PIPELINE_EXCLUDED,
  ...HIDDEN_SETTING_EXCLUDED,
  ...CHECK_NEVER_RUNS_EXCLUDED,
  ...SCRIPT_SHELL_EXCLUDED,
  ...INSTALL_RUNS_PROJECT_CODE_EXCLUDED,
  ...NO_FAIL_FLAG_EXCLUDED,
];

function fixture(name: string, purpose: string, files: Record<string, string>): FalseAssuranceFixture {
  return { name, issue: '#517', purpose, commits: [files] };
}

export const PUBLISHING_WITH_CHECKS_FIXTURES: readonly FalseAssuranceFixture[] = [...COUNTED, ...EXCLUDED].map(
  ([name, purpose, files]) => fixture(name, purpose, files),
);

export const EDGE_FIXTURES: readonly FalseAssuranceFixture[] = [...EDGE_COUNTED, ...EDGE_EXCLUDED].map(
  ([name, purpose, files]) => fixture(name, purpose, files),
);

export const V2_FIXTURES: readonly FalseAssuranceFixture[] = [...V2_COUNTED, ...V2_EXCLUDED, MANY_CHECKED].map(
  ([name, purpose, files]) => fixture(name, purpose, files),
);

export const V3_FIXTURES: readonly FalseAssuranceFixture[] = [...V3_COUNTED, ...V3_EXCLUDED].map(([name, purpose, files]) =>
  fixture(name, purpose, files),
);

/** The publishing workflow each fixture adds. */
export const publishingFile = (name: string): string => {
  const shape = [
    ...COUNTED,
    ...EXCLUDED,
    ...EDGE_COUNTED,
    ...EDGE_EXCLUDED,
    ...V2_COUNTED,
    ...V2_EXCLUDED,
    ...V3_COUNTED,
    ...V3_EXCLUDED,
  ].find(
    ([entry]) => entry === name,
  );
  const files = Object.keys(shape?.[2] ?? {});
  return [RELEASE, PUBLISH, DOCS].find((file) => files.includes(file)) ?? '';
};
