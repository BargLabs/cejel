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

// ---- Fourth pass: #627, #628, #629 and #630 (goal_cejel_v27_b3_admit_known_checks) -----------
//
// #627 and #628 were false credit: B3 said a check runs before the publish when none did. #629 and
// #630 were false exclusions of safe shapes. Every V4_EXCLUDED fixture is excluded by this pass;
// those marked red were counted by main d2d178233. Every V4_COUNTED fixture is counted; those marked
// red were excluded by main. Each new credit path (items C and D) has a counted fixture and a
// mutation fixture that is the same workflow with the check made unable to stop the publish.

const SHA256_HEX = 'a'.repeat(64);

/** A Python release on push to main: setup, `install`, then `check`, then build and upload. */
const pythonReleaseWith = (install: string, check: string): string =>
  pythonPlainRelease(check).replace('pip install pytest build twine', install);

/** A one-job release on push to main with job-level keys `jobKeys` (each line indented four spaces). */
const oneJobReleaseWithJobKeys = (jobKeys: string, steps: string): string =>
  `name: release\n${PUSH_MAIN}jobs:\n  publish:\n    runs-on: ubuntu-latest\n${jobKeys}    steps:\n${SETUP_NODE}${steps}`;

/** A Python package whose Makefile is `makefile`, released after `make test`. */
const pythonMakeRelease = (makefile: string, check = 'make test'): Record<string, string> => ({
  ...PY_BASE,
  Makefile: makefile,
  [PUBLISH]: pythonPlainRelease(check),
});

const PIPFILE_PLAIN = [
  '[[source]]',
  'url = "https://pypi.org/simple"',
  'verify_ssl = true',
  'name = "pypi"',
  '',
  '[packages]',
  'build = "==1.2.2"',
  '',
  '[dev-packages]',
  'pytest = "*"',
  'twine = {version = ">=5.0"}',
  '',
  '[requires]',
  'python_version = "3.12"',
  '',
].join('\n');

const PIPFILE_LOCK_PLAIN = `${JSON.stringify(
  {
    _meta: { hash: { sha256: SHA256_HEX }, 'pipfile-spec': 6, requires: { python_version: '3.12' }, sources: [{ name: 'pypi', url: 'https://pypi.org/simple', verify_ssl: true }] },
    default: { build: { hashes: [`sha256:${SHA256_HEX}`], index: 'pypi', version: '==1.2.2' } },
    develop: {
      pytest: { hashes: [`sha256:${SHA256_HEX}`], index: 'pypi', version: '==8.3.3' },
      twine: { hashes: [`sha256:${SHA256_HEX}`], index: 'pypi', version: '==5.1.1' },
    },
  },
  null,
  4,
)}\n`;

/** A Python release that installs with `pipenv install --dev`, then runs `check`. */
const pipenvRelease = (check: string): string => pythonReleaseWith('pipenv install --dev', check);

/** A JavaScript package whose scripts are `scripts` and whose devDependencies are `dev`. */
const jsWithScriptsAndDev = (scripts: Record<string, string>, dev: Record<string, string>): Record<string, string> => ({
  ...JS_BASE,
  'package.json': `${JSON.stringify({ name: 'tint', version: '1.0.0', main: 'index.js', scripts, devDependencies: dev }, null, 2)}\n`,
});

const TSCONFIG = `${JSON.stringify({ compilerOptions: { outDir: 'dist', module: 'nodenext', target: 'es2022', allowJs: true }, include: ['index.js'] }, null, 2)}\n`;

/** The one-job release with its steps written at the `steps:` key's own indent (#630 C1). */
const compactStepsRelease = (check: string): string =>
  `name: release\n${PUSH_MAIN}jobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n    - uses: actions/checkout@v4\n    - uses: actions/setup-node@v4\n      with:\n        registry-url: https://registry.npmjs.org\n    - run: npm ci\n    - run: ${check}\n    - run: npm publish\n      env:\n        NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\n`;

/** A test job, then a publishing job whose `needs:` is a block list at the key's own indent (#630 C3). */
const needsBlockAtKeyIndentRelease = (check: string): string =>
  `name: release\n${PUSH_MAIN}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm ci\n      - run: ${check}\n  publish:\n    needs:\n    - test\n    runs-on: ubuntu-latest\n    steps:\n${SETUP_NODE}      - run: npm ci\n${NPM_PUBLISH}`;

/** Item A (#627): a test script or make target that runs no known test runner is no check. */
export const UNKNOWN_RUNNER_EXCLUDED: readonly Shape[] = [
  [
    'npm-test-script-bin-true',
    'Excluded (red): the root test script is `/bin/true`, which runs no test runner.',
    { ...jsWithTestScript('/bin/true'), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-script-node-e-0',
    'Excluded (red): the root test script is `node -e 0`, which runs no test runner.',
    { ...jsWithTestScript('node -e 0'), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-script-printf-ok',
    'Excluded (red): the root test script is `printf ok`, which runs no test runner.',
    { ...jsWithTestScript('printf ok'), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-script-chain-to-noop',
    'Excluded (red): the test script runs `npm run unit`, and `unit` is `/bin/true`.',
    { ...jsWithScripts({ test: 'npm run unit', unit: '/bin/true' }), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-script-runner-or-true',
    'Excluded (red): the test script is `uvu test || true`, which never fails.',
    { ...jsWithTestScript('uvu test || true'), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'npm-test-script-pretest-runs-code',
    'Excluded (red): a `pretest` script runs a repository script before the test runner.',
    {
      ...jsWithScripts({ pretest: 'node scripts/stub.js', test: 'uvu test' }),
      'scripts/stub.js': "import { writeFileSync } from 'node:fs';\nwriteFileSync('stub.txt', 'x');\n",
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'npm-test-script-node-options-assignment',
    'Excluded (red): the test script sets `NODE_OPTIONS=--require=./scripts/pass.cjs` before the runner.',
    {
      ...jsWithTestScript('NODE_OPTIONS=--require=./scripts/pass.cjs uvu test'),
      'scripts/pass.cjs': "process.on('exit', () => { process.exitCode = 0; });\n",
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  ['make-test-recipe-at-true', 'Excluded (red): `make test` runs a recipe that is `@true`.', pythonMakeRelease('test:\n\t@true\n')],
  [
    'make-test-prerequisite-noop',
    'Excluded (red): the `test` target needs `unit`, whose recipe is `@true`; its own recipe only echoes.',
    pythonMakeRelease('test: unit\n\t@echo done\n\nunit:\n\t@true\n'),
  ],
  ['make-test-ignored-error', 'Excluded (red): the recipe line `-pytest` ignores the runner\'s failure.', pythonMakeRelease('test:\n\t-pytest\n')],
  [
    'make-test-prerequisite-runs-code-first',
    'Excluded (added after the red run): the `test` target runs pytest, but its prerequisite `stub` first runs a repository script.',
    {
      ...pythonMakeRelease('test: stub\n\tpytest\n\nstub:\n\tpython scripts/stub.py\n'),
      'scripts/stub.py': 'open("stub.txt", "w").write("x")\n',
    },
  ],
  [
    'make-test-oneshell',
    'Excluded (added after the red run): `.ONESHELL:` runs the recipe in one shell, so a failing `pytest` line is followed by `true`, whose status is the recipe\'s.',
    pythonMakeRelease('.ONESHELL:\n\ntest:\n\tpytest\n\ttrue\n'),
  ],
  [
    'make-test-exports-variable',
    'Excluded (added after the red run): the Makefile exports `PYTHONPATH` to every recipe, so pytest may import a repository stub; no directive line is placed by the rule reader.',
    { ...pythonMakeRelease('export PYTHONPATH := stubs\n\ntest:\n\tpytest\n'), 'stubs/pytest.py': 'raise SystemExit(0)\n' },
  ],
];

/** Item A, the other side: a test script or make target that runs a known test runner is a check. */
export const KNOWN_RUNNER_COUNTED: readonly Shape[] = [
  [
    'npm-test-script-chain-to-runner',
    'Counted: the test script runs `npm run unit`, and `unit` runs `vitest run`.',
    {
      ...jsWithScriptsAndDev({ test: 'npm run unit', unit: 'vitest run' }, { vitest: '2.1.9' }),
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'npm-test-script-c8-node-test',
    'Counted: the test script runs `c8 node --test`, the node test runner under a coverage wrapper.',
    { ...jsWithScriptsAndDev({ test: 'c8 node --test' }, { c8: '10.1.2' }), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
  ['make-test-runs-pytest', 'Counted: `make test` runs a recipe that is `pytest`.', pythonMakeRelease('test:\n\tpytest\n')],
  [
    'make-test-prerequisites-run-checks',
    'Counted: the `test` target needs `lint` (`ruff check src`) and `unit` (`python -m pytest -q`).',
    pythonMakeRelease('.PHONY: test lint unit\n\ntest: lint unit\n\nlint:\n\truff check src\n\nunit:\n\tpython -m pytest -q\n'),
  ],
];

/** Item B (#628): an environment key on the check's path that can change what it runs. */
export const ENVIRONMENT_EXCLUDED: readonly Shape[] = [
  [
    'job-env-node-options-require',
    'Excluded (red): the publishing job sets `NODE_OPTIONS: --require ./scripts/pass.cjs`, which node loads before the test runner.',
    {
      ...JS_BASE,
      'scripts/pass.cjs': "process.on('exit', () => { process.exitCode = 0; });\n",
      [RELEASE]: oneJobReleaseWithJobKeys('    env:\n      NODE_OPTIONS: --require ./scripts/pass.cjs\n', `      - run: npm ci\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'check-step-env-path-fake-bin',
    'Excluded (red): the check step sets `PATH: ./fake-bin`, so `npm` may be a repository script.',
    {
      ...JS_BASE,
      'fake-bin/npm': '#!/bin/sh\nexit 0\n',
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n        env:\n          PATH: ./fake-bin\n${NPM_PUBLISH}`),
    },
  ],
  [
    'workflow-env-pythonpath',
    'Excluded (red): the workflow sets `PYTHONPATH: stubs`, so python may import a repository stub in place of pytest.',
    {
      ...PY_BASE,
      'stubs/pytest.py': 'raise SystemExit(0)\n',
      [PUBLISH]: pythonPlainRelease('python -m pytest').replace(PUSH_MAIN, `${PUSH_MAIN}env:\n  PYTHONPATH: stubs\n`),
    },
  ],
  [
    'check-step-env-ld-preload',
    'Excluded (red): the check step sets `LD_PRELOAD`, which the loader runs before pytest.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('pytest\n        env:\n          LD_PRELOAD: ./libpass.so') },
  ],
  [
    'setup-step-env-node-options',
    'Excluded (red): the install step before the check sets `NODE_OPTIONS`, so install runs a repository script first.',
    {
      ...JS_BASE,
      'scripts/pass.cjs': "process.on('exit', () => { process.exitCode = 0; });\n",
      [RELEASE]: oneJobRelease(`      - run: npm ci\n        env:\n          NODE_OPTIONS: --require ./scripts/pass.cjs\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'credential-key-without-secret-expression',
    'Excluded (red): the publishing job sets `NPM_TOKEN` to a plain value, not a secret expression.',
    {
      ...JS_BASE,
      [RELEASE]: oneJobReleaseWithJobKeys('    env:\n      NPM_TOKEN: not-a-secret\n', `      - run: npm ci\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'github-path-write-before-check',
    'Excluded: an earlier step writes a repository directory to `$GITHUB_PATH`; the note names it (red: main gave no reason).',
    {
      ...JS_BASE,
      'fake-bin/npm': '#!/bin/sh\nexit 0\n',
      [RELEASE]: releaseAfterInstall(`      - run: echo "$PWD/fake-bin" >> "$GITHUB_PATH"\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
];

/** Item B, the other side: inert keys and credentials from secrets leave the check counted. */
export const ENVIRONMENT_COUNTED: readonly Shape[] = [
  [
    'env-inert-keys-and-secret-token',
    'Counted: the workflow sets `CI` and `NODE_ENV`, the job sets `NODE_AUTH_TOKEN` from a secret, and the check step sets `FORCE_COLOR`.',
    {
      ...JS_BASE,
      [RELEASE]: oneJobReleaseWithJobKeys(
        '    env:\n      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n',
        `      - run: npm ci\n      - run: npm test\n        env:\n          FORCE_COLOR: "1"\n      - run: npm publish\n`,
      ).replace(PUSH_MAIN, `${PUSH_MAIN}env:\n  CI: true\n  NODE_ENV: test\n`),
    },
  ],
];

/** Item C (#629): setup steps admitted when what they install is read. Counted, each red on main. */
export const NARROWED_SETUP_COUNTED: readonly Shape[] = [
  [
    'pip-install-requirements-plain',
    'Counted (red): `pip install -r requirements.txt`, where every line is a name and an optional version specifier.',
    { ...PY_BASE, 'requirements.txt': 'pytest==8.3.3\nbuild >= 1.2\ntwine\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
  [
    'pip-install-requirements-hashed-and-included',
    'Counted (red): `pip install -r requirements.txt` with a hashed line and an include of another file in the repository.',
    {
      ...PY_BASE,
      'requirements.txt': `# test and release tools\n-r requirements/base.txt\npytest==8.3.3 --hash=sha256:${SHA256_HEX}\n`,
      'requirements/base.txt': 'build==1.2.2\ntwine==5.1.1\n',
      [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest'),
    },
  ],
  [
    'pipenv-install-plain-pipfile',
    'Counted (red): `pipenv install --dev`, where Pipfile and Pipfile.lock name only index packages.',
    { ...PY_BASE, Pipfile: PIPFILE_PLAIN, 'Pipfile.lock': PIPFILE_LOCK_PLAIN, [PUBLISH]: pipenvRelease('pipenv run pytest') },
  ],
  [
    'prepare-husky-before-check',
    'Counted (red): the root `prepare` script is `husky`, which `npm ci` runs; it only installs git hooks.',
    { ...jsWithScripts({ test: 'uvu test', prepare: 'husky' }), [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`) },
  ],
];

/** Item C mutations: the same workflows with the check made unable to stop the publish. */
export const NARROWED_SETUP_MUTATION_EXCLUDED: readonly Shape[] = [
  [
    'pip-install-requirements-plain-check-or-true',
    'Excluded: as pip-install-requirements-plain, with the check run as `pytest || true`.',
    { ...PY_BASE, 'requirements.txt': 'pytest==8.3.3\nbuild >= 1.2\ntwine\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest || true') },
  ],
  [
    'pipenv-install-plain-pipfile-check-or-true',
    'Excluded: as pipenv-install-plain-pipfile, with the check run as `pipenv run pytest || true`.',
    { ...PY_BASE, Pipfile: PIPFILE_PLAIN, 'Pipfile.lock': PIPFILE_LOCK_PLAIN, [PUBLISH]: pipenvRelease('pipenv run pytest || true') },
  ],
  [
    'prepare-husky-check-or-true',
    'Excluded: as prepare-husky-before-check, with the check run as `npm test || true`.',
    { ...jsWithScripts({ test: 'uvu test', prepare: 'husky' }), [RELEASE]: releaseAfterInstall(`      - run: npm test || true\n${NPM_PUBLISH}`) },
  ],
];

/** Item C: what the narrowed setup readings still refuse. */
export const NARROWED_SETUP_EXCLUDED: readonly Shape[] = [
  [
    'pip-install-requirements-editable-line',
    'Excluded: requirements.txt holds `-e .`, which builds and installs the project before the check.',
    { ...PY_BASE, 'requirements.txt': '-e .\npytest\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
  [
    'pip-install-requirements-index-url',
    'Excluded: requirements.txt names another index with `--index-url`.',
    { ...PY_BASE, 'requirements.txt': '--index-url https://packages.example.invalid/simple\npytest\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
  [
    'pip-install-requirements-url-line',
    'Excluded: requirements.txt names a package by URL.',
    { ...PY_BASE, 'requirements.txt': 'pytest\nhttps://packages.example.invalid/tint-1.0.0.tar.gz\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
  [
    'pip-install-requirements-path-line',
    'Excluded: requirements.txt names a package by a path in the repository.',
    { ...PY_BASE, 'requirements.txt': 'pytest\n./vendor/tint\n', 'vendor/tint/setup.py': 'raise SystemExit(0)\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
  [
    'pip-install-requirements-include-outside',
    'Excluded: requirements.txt includes a file outside the repository with `-r ../shared/requirements.txt`.',
    { ...PY_BASE, 'requirements.txt': '-r ../shared/requirements.txt\npytest\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
  [
    'pipenv-install-path-dependency',
    'Excluded: Pipfile installs the project itself, `tint = {path = ".", editable = true}`.',
    {
      ...PY_BASE,
      Pipfile: PIPFILE_PLAIN.replace('[packages]\n', '[packages]\ntint = {path = ".", editable = true}\n'),
      [PUBLISH]: pipenvRelease('pipenv run pytest'),
    },
  ],
  [
    'pipenv-pipfile-scripts-section',
    'Excluded: Pipfile has a `[scripts]` section naming `pytest`, so `pipenv run pytest` runs that script in place of pytest.',
    {
      ...PY_BASE,
      Pipfile: `${PIPFILE_PLAIN}\n[scripts]\npytest = "true"\n`,
      'Pipfile.lock': PIPFILE_LOCK_PLAIN,
      [PUBLISH]: pipenvRelease('pipenv run pytest'),
    },
  ],
  [
    'prepare-husky-and-script',
    'Excluded: the root `prepare` script is `husky && node scripts/release.js`, which runs a repository script on install.',
    {
      ...jsWithScripts({ test: 'uvu test', prepare: 'husky && node scripts/release.js' }),
      'scripts/release.js': "import { execSync } from 'node:child_process';\nexecSync('npm publish');\n",
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'npmrc-present-but-not-read',
    'Excluded: `.npmrc` is too large to be read, so its settings are not known; no npm command is a check or a setup step.',
    {
      ...JS_BASE,
      '.npmrc': `registry=https://registry.npmjs.org/\n# ${'x'.repeat(512_001)}\n`,
      [RELEASE]: releaseAfterInstall(`      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
];

/** Item D (#630): safe shapes read. Counted, each red on main. */
export const SAFE_SHAPE_COUNTED: readonly Shape[] = [
  ['steps-at-key-indent', 'Counted (red): the step items sit at the `steps:` key\'s own indent.', { ...JS_BASE, [RELEASE]: compactStepsRelease('npm test') }],
  [
    'build-tsc-before-check',
    'Counted (red): `npm run build` runs `tsc`, whose configuration is JSON, before `npm test`.',
    {
      ...jsWithScriptsAndDev({ build: 'tsc', test: 'uvu test' }, { typescript: '5.9.3', uvu: '0.5.6' }),
      'tsconfig.json': TSCONFIG,
      [RELEASE]: releaseAfterInstall(`      - run: npm run build\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  ['needs-block-list-at-key-indent', 'Counted (red): `needs:` is a block list written at the key\'s own indent.', { ...JS_BASE, [RELEASE]: needsBlockAtKeyIndentRelease('npm test') }],
  [
    'check-and-publish-one-line',
    'Counted (red): `run: npm test && npm publish`; the publish runs only when the test passed.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall('      - run: npm test && npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n') },
  ],
  [
    'check-then-publish-lines-bash-e',
    'Counted (also by main; a control for C4): `npm test` and `npm publish` on separate lines of one `run:` block; bash -e stops at a failing test.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall('      - run: |\n          npm test\n          npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n') },
  ],
  ['ruff-check-dot', 'Counted (red): `ruff check .` is a lint check; `.` is its argument, not the source builtin.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff check .') }],
  ['mypy-dot', 'Counted (red): `mypy .` is a type check given `.` as its argument.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('mypy .') }],
];

/** Item D mutations: the same workflows with the check made unable to stop the publish. */
export const SAFE_SHAPE_MUTATION_EXCLUDED: readonly Shape[] = [
  ['steps-at-key-indent-check-or-true', 'Excluded: as steps-at-key-indent, with `npm test || true`.', { ...JS_BASE, [RELEASE]: compactStepsRelease('npm test || true') }],
  [
    'build-tsc-before-check-or-true',
    'Excluded: as build-tsc-before-check, with `npm test || true`.',
    {
      ...jsWithScriptsAndDev({ build: 'tsc', test: 'uvu test' }, { typescript: '5.9.3', uvu: '0.5.6' }),
      'tsconfig.json': TSCONFIG,
      [RELEASE]: releaseAfterInstall(`      - run: npm run build\n      - run: npm test || true\n${NPM_PUBLISH}`),
    },
  ],
  [
    'needs-block-list-at-key-indent-check-or-true',
    'Excluded: as needs-block-list-at-key-indent, with `npm test || true`.',
    { ...JS_BASE, [RELEASE]: needsBlockAtKeyIndentRelease('npm test || true') },
  ],
  [
    'check-and-publish-one-line-semicolon',
    'Excluded: `run: npm test; npm publish`; the publish runs whether the test passed or not.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall('      - run: npm test; npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n') },
  ],
  [
    // Not `npm test || true`: a `||` anywhere in the step makes its publish conditional, so the
    // workflow is then not read as publishing on every run at all (#517's reading, unchanged).
    'check-then-publish-lines-backgrounded',
    'Excluded: as check-then-publish-lines-bash-e, with the test run in the background, `npm test &`.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall('      - run: |\n          npm test &\n          npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n') },
  ],
  ['ruff-check-dot-or-true', 'Excluded: as ruff-check-dot, with `ruff check . || true`.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff check . || true') }],
];

/** Item D: what the safe-shape readings still refuse. */
export const SAFE_SHAPE_EXCLUDED: readonly Shape[] = [
  [
    'build-vite-config-before-check',
    'Excluded: `npm run build` runs vite, whose configuration `vite.config.js` is code that runs before the check.',
    {
      ...jsWithScriptsAndDev({ build: 'vite build', test: 'uvu test' }, { vite: '5.4.0', uvu: '0.5.6' }),
      'tsconfig.json': TSCONFIG,
      'vite.config.js': "import { writeFileSync } from 'node:fs';\nwriteFileSync('stub.txt', 'x');\nexport default {};\n",
      [RELEASE]: releaseAfterInstall(`      - run: npm run build\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
  [
    'publish-and-check-one-line-publish-first',
    'Excluded: `run: npm publish && npm test`; the publish runs before the test.',
    { ...JS_BASE, [RELEASE]: releaseAfterInstall('      - run: npm publish && npm test\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n') },
  ],
  [
    'pipefail-check-piped-into-publish',
    'Excluded (added after the red run): `npm test | npm publish` after pipefail; both sides of a pipeline run together, so the publish does not wait for the test.',
    {
      ...JS_BASE,
      [RELEASE]: releaseAfterInstall('      - run: |\n          set -o pipefail\n          npm test | npm publish\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n'),
    },
  ],
  [
    'dot-source-in-command-position-in-check-step',
    'Excluded: the check step also runs `. ./scripts/after.sh`, which sources a repository script in command position.',
    {
      ...PY_BASE,
      'scripts/after.sh': 'trap "exit 0" EXIT\n',
      [PUBLISH]: pythonPlainRelease('|\n          ruff check .\n          . ./scripts/after.sh'),
    },
  ],
];

/** This pass's counted and excluded shapes, in the order the tests read them. */
export const V4_COUNTED: readonly Shape[] = [...KNOWN_RUNNER_COUNTED, ...ENVIRONMENT_COUNTED, ...NARROWED_SETUP_COUNTED, ...SAFE_SHAPE_COUNTED];
export const V4_EXCLUDED: readonly Shape[] = [
  ...UNKNOWN_RUNNER_EXCLUDED,
  ...ENVIRONMENT_EXCLUDED,
  ...NARROWED_SETUP_MUTATION_EXCLUDED,
  ...NARROWED_SETUP_EXCLUDED,
  ...SAFE_SHAPE_MUTATION_EXCLUDED,
  ...SAFE_SHAPE_EXCLUDED,
];

// ---- Fifth pass: the review of #640 (goal_cejel_v27_b3_admit_known_checks_v2) -----------------
//
// The adversarial review of #640 held it for six false-credit blockers. Every V5_EXCLUDED fixture
// marked red was counted by #640's head merged with main bfd4d5965; every V5_COUNTED fixture is a
// control that stays counted. Synthetic files only; the archive files hold placeholder text.

const PASS_CJS = "process.on('exit', () => { process.exitCode = 0; });\n";

/** A job-level `container:` or `services:` block (each line indented four spaces), then npm test. */
const releaseWithJobBlock = (block: string, check = 'npm test'): string =>
  oneJobReleaseWithJobKeys(block, `      - run: npm ci\n      - run: ${check}\n${NPM_PUBLISH}`);

/** Blocker 1 (item A): a requirements line or a pip argument that installs a file from the repository. */
export const LOCAL_ARCHIVE_EXCLUDED: readonly Shape[] = [
  [
    'requirements-local-sdist',
    'Excluded (red): requirements.txt names `stub.tar.gz`, a file in the repository; pip builds it, running its setup code, before the check.',
    { ...PY_BASE, 'requirements.txt': 'pytest\nstub.tar.gz\n', 'stub.tar.gz': 'placeholder\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
  [
    'requirements-local-zip-through-include',
    'Excluded (red): requirements.txt includes `more.txt`, which names `stub.zip`, a file in the repository.',
    {
      ...PY_BASE,
      'requirements.txt': '-r more.txt\npytest\n',
      'more.txt': 'stub.zip\n',
      'stub.zip': 'placeholder\n',
      [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest'),
    },
  ],
  [
    'requirements-local-wheel-python-m-pip',
    'Excluded (red): `python -m pip install -r requirements.txt`, which names `stub-1.0-py3-none-any.whl`; a wheel can install a `.pth` file that runs on every python start.',
    {
      ...PY_BASE,
      'requirements.txt': 'stub-1.0-py3-none-any.whl\npytest\n',
      'stub-1.0-py3-none-any.whl': 'placeholder\n',
      [PUBLISH]: pythonReleaseWith('python -m pip install -r requirements.txt', 'pytest'),
    },
  ],
  [
    'pip-install-local-archive-argument',
    'Excluded (red): `pip install stub.tar.gz pytest build twine` names a file in the repository directly.',
    { ...PY_BASE, 'stub.tar.gz': 'placeholder\n', [PUBLISH]: pythonReleaseWith('pip install stub.tar.gz pytest build twine', 'pytest') },
  ],
  [
    'requirements-archive-suffix-not-in-repository',
    'Excluded: requirements.txt names `stub.tgz`, which is not in the repository; an archive suffix is refused whether or not the file is there.',
    { ...PY_BASE, 'requirements.txt': 'pytest\nstub.tgz\n', [PUBLISH]: pythonReleaseWith('pip install -r requirements.txt', 'pytest') },
  ],
];

/** Blocker 2 (item B): a lint or format command in a form that cannot fail on a finding. */
export const NO_FAIL_LINT_EXCLUDED: readonly Shape[] = [
  ['ruff-check-short-exit-zero', 'Excluded (red): `ruff check -e .`; `-e` is `--exit-zero`.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff check -e .') }],
  ['ruff-check-fix', 'Excluded (red): `ruff check --fix .` rewrites what it can fix.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff check --fix .') }],
  ['eslint-fix', 'Excluded (red): `npx eslint --fix .` rewrites what it can fix.', { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npx eslint --fix .\n${NPM_PUBLISH}`) }],
  ['black-format', 'Excluded (red): `black .` formats the files and exits 0.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('black .') }],
  ['ruff-format', 'Excluded (red): `ruff format .` formats the files and exits 0.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff format .') }],
  ['ruff-check-unknown-flag', 'Excluded (red): `ruff check --ignore ALL .`; a flag not known to keep the exit code is not a check.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff check --ignore ALL .') }],
];

/** Item B, the other side: lint and format commands in a form that fails on a finding. */
export const FAILING_LINT_COUNTED: readonly Shape[] = [
  ['black-check', 'Counted: `black --check .` fails when a file would be reformatted.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('black --check .') }],
  ['ruff-format-check', 'Counted: `ruff format --check .` fails when a file would be reformatted.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('ruff format --check .') }],
  ['flake8-src', 'Counted: `flake8 src` fails on a finding.', { ...PY_BASE, [PUBLISH]: pythonPlainRelease('flake8 src') }],
  ['eslint-dot-max-warnings', 'Counted: `npx eslint --max-warnings 0 .` fails on a finding.', { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npx eslint --max-warnings 0 .\n${NPM_PUBLISH}`) }],
];

/** Blocker 4 (item C): environment the reader did not read. */
export const UNREAD_ENVIRONMENT_EXCLUDED: readonly Shape[] = [
  [
    'check-line-assignment-node-options',
    'Excluded (red): `run: NODE_OPTIONS=--require=./scripts/pass.cjs npm test`; the assignment loads a repository script into node.',
    { ...JS_BASE, 'scripts/pass.cjs': PASS_CJS, [RELEASE]: releaseAfterInstall(`      - run: NODE_OPTIONS=--require=./scripts/pass.cjs npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'check-line-assignment-path',
    'Excluded (red): `run: PATH=./fake-bin:/usr/bin npm test`; `npm` may be a repository script.',
    { ...JS_BASE, 'fake-bin/npm': '#!/bin/sh\nexit 0\n', [RELEASE]: releaseAfterInstall(`      - run: PATH=./fake-bin:/usr/bin npm test\n${NPM_PUBLISH}`) },
  ],
  [
    'check-line-assignment-pytest-addopts',
    'Excluded (red): `run: PYTEST_ADDOPTS=--co pytest`; pytest only collects.',
    { ...PY_BASE, [PUBLISH]: pythonPlainRelease('PYTEST_ADDOPTS=--co pytest') },
  ],
  [
    'job-container-env',
    'Excluded (red): the publishing job runs in a `container:` whose `env:` sets `NODE_OPTIONS`.',
    {
      ...JS_BASE,
      'scripts/pass.cjs': PASS_CJS,
      [RELEASE]: releaseWithJobBlock('    container:\n      image: node:20\n      env:\n        NODE_OPTIONS: --require ./scripts/pass.cjs\n'),
    },
  ],
  ['job-container-image', 'Excluded (red): the publishing job runs in `container: node:20`, an image the reader does not read.', { ...JS_BASE, [RELEASE]: releaseWithJobBlock('    container: node:20\n') }],
  [
    'job-services-env',
    'Excluded (red): the publishing job has a `services:` container that sets `env:`.',
    { ...JS_BASE, [RELEASE]: releaseWithJobBlock('    services:\n      db:\n        image: postgres:16\n        env:\n          POSTGRES_PASSWORD: placeholder\n') },
  ],
  [
    'npm-test-node-options-flag',
    'Excluded (red): `run: npm test --node-options=--require=./scripts/pass.cjs`; npm passes the flag to node.',
    { ...JS_BASE, 'scripts/pass.cjs': PASS_CJS, [RELEASE]: releaseAfterInstall(`      - run: npm test --node-options=--require=./scripts/pass.cjs\n${NPM_PUBLISH}`) },
  ],
  [
    'setup-line-assignment-node-options',
    'Excluded (red): `run: NODE_OPTIONS=--require=./scripts/pass.cjs npm ci` before the check; the install runs node with a repository script.',
    {
      ...JS_BASE,
      'scripts/pass.cjs': PASS_CJS,
      [RELEASE]: oneJobRelease(`      - run: NODE_OPTIONS=--require=./scripts/pass.cjs npm ci\n      - run: npm test\n${NPM_PUBLISH}`),
    },
  ],
];

/** Item C, the other side: an inert assignment and a known npm flag leave the check counted. */
export const READ_ENVIRONMENT_COUNTED: readonly Shape[] = [
  ['check-line-assignment-inert', 'Counted: `run: CI=true npm test`; `CI` is an inert key.', { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: CI=true npm test\n${NPM_PUBLISH}`) }],
  ['npm-test-silent', 'Counted: `run: npm test --silent`; `--silent` only quiets npm.', { ...JS_BASE, [RELEASE]: releaseAfterInstall(`      - run: npm test --silent\n${NPM_PUBLISH}`) }],
];

const STUB_PACKAGE = `${JSON.stringify({ name: 'stub', version: '1.0.0', scripts: { test: 'node -e 0' } }, null, 2)}\n`;

/** Blocker 5 (item D): a test command that runs another package's script. */
export const OTHER_PACKAGE_EXCLUDED: readonly Shape[] = [
  ['npm-test-prefix', 'Excluded (red): `npm test --prefix stub` runs stub/package.json\'s test script, `node -e 0`.', { ...JS_BASE, 'stub/package.json': STUB_PACKAGE, [RELEASE]: releaseAfterInstall(`      - run: npm test --prefix stub\n${NPM_PUBLISH}`) }],
  ['npm-test-workspaces', 'Excluded (red): `npm test --workspaces` runs each workspace\'s test script.', { ...JS_BASE, 'stub/package.json': STUB_PACKAGE, [RELEASE]: releaseAfterInstall(`      - run: npm test --workspaces\n${NPM_PUBLISH}`) }],
  ['npm-test-workspace-short', 'Excluded (red): `npm test -w packages/a` runs that workspace\'s test script.', { ...JS_BASE, 'packages/a/package.json': STUB_PACKAGE, [RELEASE]: releaseAfterInstall(`      - run: npm test -w packages/a\n${NPM_PUBLISH}`) }],
  ['yarn-test-cwd', 'Excluded (red): `yarn test --cwd stub` runs stub/package.json\'s test script.', { ...JS_BASE, 'stub/package.json': STUB_PACKAGE, [RELEASE]: releaseAfterInstall(`      - run: yarn test --cwd stub\n${NPM_PUBLISH}`) }],
  ['pnpm-test-filter', 'Excluded (red): `pnpm test --filter a` runs the test script of the package named a.', { ...JS_BASE, 'stub/package.json': STUB_PACKAGE, [RELEASE]: releaseAfterInstall(`      - run: pnpm test --filter a\n${NPM_PUBLISH}`) }],
];

/** Blocker 6 (item E): a make recipe that never runs. */
export const MAKE_NOT_RUN_EXCLUDED: readonly Shape[] = [
  [
    'make-test-not-phony-test-directory',
    'Excluded (red): `test:` is not `.PHONY` and a `test/` directory exists, so make reports it up to date and runs nothing.',
    { ...pythonMakeRelease('test:\n\tpytest\n'), 'test/data.txt': 'placeholder\n' },
  ],
  [
    'make-prerequisite-names-file',
    'Excluded (red): `test` is `.PHONY` but its prerequisite `unit`, which runs pytest, is not, and a file `unit` exists.',
    { ...pythonMakeRelease('.PHONY: test\n\ntest: unit\n\nunit:\n\tpytest\n'), unit: 'placeholder\n' },
  ],
  [
    'make-path-assignment',
    'Excluded (red): the Makefile sets `PATH := fake-bin:$(PATH)`, so `pytest` may be a repository script.',
    { ...pythonMakeRelease('PATH := fake-bin:$(PATH)\n\n.PHONY: test\n\ntest:\n\tpytest\n'), 'fake-bin/pytest': '#!/bin/sh\nexit 0\n' },
  ],
];

/** Item E, the other side: a `.PHONY` target beside a directory of its name still runs. */
export const MAKE_RUNS_COUNTED: readonly Shape[] = [
  [
    'make-test-phony-with-test-directory',
    'Counted: `test` is declared `.PHONY`, so make runs it although a `test/` directory exists.',
    { ...pythonMakeRelease('.PHONY: test\n\ntest:\n\tpytest\n'), 'test/data.txt': 'placeholder\n' },
  ],
];

/** This pass's counted and excluded shapes, in the order the tests read them. */
export const V5_COUNTED: readonly Shape[] = [...FAILING_LINT_COUNTED, ...READ_ENVIRONMENT_COUNTED, ...MAKE_RUNS_COUNTED];
export const V5_EXCLUDED: readonly Shape[] = [
  ...LOCAL_ARCHIVE_EXCLUDED,
  ...NO_FAIL_LINT_EXCLUDED,
  ...UNREAD_ENVIRONMENT_EXCLUDED,
  ...OTHER_PACKAGE_EXCLUDED,
  ...MAKE_NOT_RUN_EXCLUDED,
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

export const V4_FIXTURES: readonly FalseAssuranceFixture[] = [...V4_COUNTED, ...V4_EXCLUDED].map(([name, purpose, files]) =>
  fixture(name, purpose, files),
);

export const V5_FIXTURES: readonly FalseAssuranceFixture[] = [...V5_COUNTED, ...V5_EXCLUDED].map(([name, purpose, files]) =>
  fixture(name, purpose, files),
);

/** The publishing workflow each fixture adds. */
export const publishingFile = (name: string): string => {
  const shape = [
    ...V5_COUNTED,
    ...V5_EXCLUDED,
    ...COUNTED,
    ...EXCLUDED,
    ...EDGE_COUNTED,
    ...EDGE_EXCLUDED,
    ...V2_COUNTED,
    ...V2_EXCLUDED,
    ...V3_COUNTED,
    ...V3_EXCLUDED,
    ...V4_COUNTED,
    ...V4_EXCLUDED,
  ].find(
    ([entry]) => entry === name,
  );
  const files = Object.keys(shape?.[2] ?? {});
  return [RELEASE, PUBLISH, DOCS].find((file) => files.includes(file)) ?? '';
};
