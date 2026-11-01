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
  [
    'pytest-before-twine-on-tag',
    'Counted: a release-tag workflow whose job runs pytest before a twine upload.',
    {
      ...PY_BASE,
      [PUBLISH]: `name: publish\n${PUSH_TAGS}jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n      - run: pip install -e . pytest build twine\n      - run: pytest\n      - run: python -m build\n      - run: twine upload dist/*\n        env:\n          TWINE_PASSWORD: \${{ secrets.PYPI_TOKEN }}\n`,
    },
  ],
];

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

function fixture(name: string, purpose: string, files: Record<string, string>): FalseAssuranceFixture {
  return { name, issue: '#517', purpose, commits: [files] };
}

export const PUBLISHING_WITH_CHECKS_FIXTURES: readonly FalseAssuranceFixture[] = [...COUNTED, ...EXCLUDED].map(
  ([name, purpose, files]) => fixture(name, purpose, files),
);

/** The publishing workflow each fixture adds. */
export const publishingFile = (name: string): string => {
  const shape = [...COUNTED, ...EXCLUDED].find(([entry]) => entry === name);
  const files = Object.keys(shape?.[2] ?? {});
  return [RELEASE, PUBLISH, DOCS].find((file) => files.includes(file)) ?? '';
};
