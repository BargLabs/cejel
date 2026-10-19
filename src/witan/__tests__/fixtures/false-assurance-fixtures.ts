import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { HERMETIC_GIT_ENV } from './behaviour-corpus.js';

// FALSE-ASSURANCE FIXTURES (#517, #518, #519, #520, #442).
//
// Each issue was found on a pinned public repository. These are minimal synthetic shapes written
// from scratch to reproduce the same scanner behaviour, materialised and committed at test time
// like the behaviour corpus (behaviour-corpus.ts explains why fixtures are not tracked files). No
// fixture is derived from the public repository's content beyond the idiom the issue names.
//
// Fixtures come in control/change pairs that differ only in the planted condition, plus corner
// cases that pin what the fix must NOT do. A fixture with `shallow: true` is the full repository
// cloned at depth 1 over the local file transport.

export interface FalseAssuranceFixture {
  readonly name: string;
  readonly issue: '#517' | '#518' | '#519' | '#520' | '#442';
  readonly purpose: string;
  /** Each entry is one commit: path -> contents, or null to delete the path. */
  readonly commits: readonly Readonly<Record<string, string | null>>[];
  /** Commit subjects, one per commit. Defaults to `commit <n>`. */
  readonly subjects?: readonly string[];
  readonly shallow?: boolean;
}

const PY_LIBRARY: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "cachelib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# cachelib\n\nA small cache library.\n',
  LICENSE: 'MIT\n',
  'src/cachelib/__init__.py':
    'def get(cache, key, default=None):\n    return cache.get(key, default)\n\n\ndef put(cache, key, value):\n    cache[key] = value\n    return value\n',
  'src/cachelib/lru.py':
    'class LRU:\n    def __init__(self, size):\n        self.size = size\n        self.items = {}\n\n    def get(self, key):\n        return self.items.get(key)\n',
  'tests/test_cache.py':
    'from cachelib import get, put\n\n\ndef test_get_default():\n    assert get({}, "a", 1) == 1\n\n\ndef test_put():\n    c = {}\n    put(c, "a", 2)\n    assert c["a"] == 2\n',
  'tests/test_lru.py':
    'from cachelib.lru import LRU\n\n\ndef test_lru_get():\n    assert LRU(2).get("x") is None\n',
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n',
};

const JS_TEST_INDEX =
  "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\nimport { dequal } from '../index.js';\n\ntest('equal', () => {\n  assert.ok(dequal({ a: 1 }, { a: 1 }));\n});\n\ntest.run();\n";
const JS_TEST_LITE =
  "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\nimport { dequal } from '../lite.js';\n\ntest('same', () => {\n  assert.ok(dequal(1, 1));\n});\n\ntest.run();\n";

const JS_LIBRARY: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    {
      name: 'deq',
      version: '1.0.0',
      main: 'index.js',
      scripts: { test: 'uvu test' },
      devDependencies: { uvu: '^0.5.0', bundt: '^1.0.0' },
    },
    null,
    2,
  )}\n`,
  'README.md': '# deq\n',
  LICENSE: 'MIT\n',
  'index.js':
    'export function dequal(a, b) {\n  if (a === b) return true;\n  return JSON.stringify(a) === JSON.stringify(b);\n}\n',
  'lite.js': 'export function dequal(a, b) {\n  return a === b;\n}\n',
  'test/index.js': JS_TEST_INDEX,
  'test/lite.js': JS_TEST_LITE,
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm install\n      - run: npm test\n',
};

/** A standard Git LFS pointer for `content` (spec v1: version, oid sha256, size). */
export function lfsPointerFor(content: string): string {
  const oid = createHash('sha256').update(content).digest('hex');
  return `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${Buffer.byteLength(content)}\n`;
}

const PYPI_PUBLISH_GATED = [
  'name: publish',
  'on:',
  '  push:',
  "    tags: ['*']",
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: pip install build',
  '      - run: python -m build',
  '      - uses: actions/upload-artifact@v4',
  '        with:',
  '          path: ./dist',
  '  publish-pypi:',
  '    needs: [build]',
  '    environment:',
  '      name: publish',
  '      url: https://pypi.org/project/cachelib/',
  '    runs-on: ubuntu-latest',
  '    permissions:',
  '      id-token: write',
  '    steps:',
  '      - uses: actions/download-artifact@v4',
  '      - uses: pypa/gh-action-pypi-publish@release/v1',
  '',
].join('\n');

// The planted change, as in #517's first repro: the trigger becomes every push to the default
// branch, and the publish job loses its environment (the human gate).
const PYPI_PUBLISH_UNGATED = PYPI_PUBLISH_GATED.replace("  push:\n    tags: ['*']", '  push:\n    branches: [main]').replace(
  '    environment:\n      name: publish\n      url: https://pypi.org/project/cachelib/\n',
  '',
);

const NPM_PUBLISH_GATED = [
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
  '      - run: npm install',
  '      - run: npm publish',
  '        env:',
  '          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}',
  '',
].join('\n');

const NPM_PUBLISH_UNGATED = NPM_PUBLISH_GATED.replace(
  '  workflow_dispatch:',
  '  push:\n    branches: [main]',
).replace('    environment: npm-publish\n', '');

// A workflow that verifies AND publishes on every push is still CI: its test step runs on the
// default branch. Excluding it would remove real CI credit.
const NPM_TEST_THEN_PUBLISH = [
  'name: ci-release',
  'on:',
  '  push:',
  '    branches: [main]',
  'jobs:',
  '  test-and-publish:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: npm ci',
  '      - run: npm test',
  '      - run: npm publish',
  '',
].join('\n');

const CONFTEST_SKIP_ALL = [
  'import pytest',
  '',
  '',
  'def pytest_collection_modifyitems(config, items):',
  '    for item in items:',
  '        item.add_marker(pytest.mark.skip(reason="temporarily disabled"))',
  '',
].join('\n');

const CONFTEST_SKIP_SLOW_ONLY = [
  'import pytest',
  '',
  '',
  'def pytest_collection_modifyitems(config, items):',
  '    for item in items:',
  '        if "slow" in item.keywords:',
  '            item.add_marker(pytest.mark.skip(reason="slow"))',
  '',
].join('\n');

const CONFTEST_FIXTURE_ONLY = [
  'import pytest',
  '',
  '',
  '@pytest.fixture',
  'def cache():',
  '    return {}',
  '',
].join('\n');

const UV_LOCK =
  'version = 1\nrequires-python = ">=3.9"\n\n[[package]]\nname = "cachelib"\nversion = "1.0.0"\nsource = { editable = "." }\n';

const UV_LOCKED_CI =
  'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n      - run: uv run --locked pytest\n';

const JS_PINNED_ROOT = `${JSON.stringify(
  {
    name: 'kl',
    version: '1.0.0',
    main: 'index.js',
    scripts: { test: 'uvu test' },
    devDependencies: { uvu: '0.5.6', bundt: '1.1.5' },
  },
  null,
  2,
)}\n`;

const JS_UNCONSTRAINED_ROOT = `${JSON.stringify(
  {
    name: 'kl',
    version: '1.0.0',
    main: 'index.js',
    scripts: { test: 'uvu test' },
    devDependencies: { uvu: '*', bundt: 'latest' },
  },
  null,
  2,
)}\n`;

const JS_BENCH_MANIFEST = `${JSON.stringify(
  {
    name: 'bench',
    private: true,
    devDependencies: { chalk: '4.1.2', 'ansi-colors': '4.1.1', colorette: '2.0.20' },
  },
  null,
  2,
)}\n`;

const HISTORY_BASE: Readonly<Record<string, string>> = {
  ...PY_LIBRARY,
  '.gitignore': '.env\n__pycache__/\n',
  '.env.example': 'CACHE_URL=\n',
  'src/cachelib/config.py': 'import os\n\nCACHE_URL = os.environ.get("CACHE_URL", "")\n',
};

/** Twenty commits, every other one a pull-request merge subject, so B2 reads a full window. */
function historyCommits(): {
  commits: Record<string, string | null>[];
  subjects: string[];
} {
  const commits: Record<string, string | null>[] = [{ ...HISTORY_BASE }];
  const subjects: string[] = ['initial commit'];
  for (let index = 1; index < 20; index += 1) {
    commits.push({ [`src/cachelib/m${index}.py`]: `VALUE_${index} = ${index}\n` });
    subjects.push(
      index % 2 === 0 ? `Merge pull request #${index} from contributor/topic-${index}` : `add module ${index}`,
    );
  }
  return { commits, subjects };
}

const HISTORY = historyCommits();

/**
 * A synthetic branded secret shape, assembled from segments so this source file never contains one
 * contiguous credential-shaped literal (the technique behaviour-corpus.ts and
 * calibration-fixtures.ts use).
 */
const SYNTHETIC_BRANDED_SECRET = ['sk', 'liveFIXTUREonly0000abcdEFGH1234ijklMNOP'].join('-');

const HISTORY_WITH_SECRET = {
  commits: [
    ...HISTORY.commits,
    {
      'src/cachelib/billing.py': `# Fixture only: a synthetic value in a real-looking assignment.\nSTRIPE_SECRET_KEY = "${SYNTHETIC_BRANDED_SECRET}"\n`,
    },
  ],
  subjects: [...HISTORY.subjects, 'add billing'],
};

export const FALSE_ASSURANCE_FIXTURES: readonly FalseAssuranceFixture[] = [
  // #517 ------------------------------------------------------------------------------------
  {
    name: 'b3-pypi-publish-gated',
    issue: '#517',
    purpose: 'Control: a tag-triggered PyPI publish workflow behind an environment gate.',
    commits: [{ ...PY_LIBRARY, '.github/workflows/publish.yaml': PYPI_PUBLISH_GATED }],
  },
  {
    name: 'b3-pypi-publish-ungated',
    issue: '#517',
    purpose: 'Change: the publish workflow runs on every push to main with no environment.',
    commits: [{ ...PY_LIBRARY, '.github/workflows/publish.yaml': PYPI_PUBLISH_UNGATED }],
  },
  {
    name: 'b3-npm-publish-gated',
    issue: '#517',
    purpose: 'Control: a manually dispatched npm publish behind an environment gate.',
    commits: [{ ...JS_LIBRARY, '.github/workflows/release.yml': NPM_PUBLISH_GATED }],
  },
  {
    name: 'b3-npm-publish-ungated',
    issue: '#517',
    purpose: 'Change: npm publish on every push to main with no environment.',
    commits: [{ ...JS_LIBRARY, '.github/workflows/release.yml': NPM_PUBLISH_UNGATED }],
  },
  {
    name: 'b3-test-then-publish-workflow',
    issue: '#517',
    purpose: 'Corner: a workflow that runs the tests and then publishes still counts as CI.',
    commits: [{ ...JS_LIBRARY, '.github/workflows/ci-release.yml': NPM_TEST_THEN_PUBLISH }],
  },
  // #518 ------------------------------------------------------------------------------------
  {
    name: 'a1-pytest-suite',
    issue: '#518',
    purpose: 'Control: a pytest suite with live assertions and no conftest.',
    commits: [PY_LIBRARY],
  },
  {
    name: 'a1-pytest-hook-skips-every-test',
    issue: '#518',
    purpose: 'Change: tests/conftest.py adds an unconditional skip marker to every collected item.',
    commits: [PY_LIBRARY, { 'tests/conftest.py': CONFTEST_SKIP_ALL }],
  },
  {
    name: 'a1-pytest-hook-skips-slow-only',
    issue: '#518',
    purpose: 'Corner: a conditional skip in the hook does not disable the suite.',
    commits: [PY_LIBRARY, { 'tests/conftest.py': CONFTEST_SKIP_SLOW_ONLY }],
  },
  {
    name: 'a1-pytest-fixture-conftest',
    issue: '#518',
    purpose: 'Corner: an ordinary fixture conftest.py is support code, not a test file.',
    commits: [PY_LIBRARY, { 'tests/conftest.py': CONFTEST_FIXTURE_ONLY }],
  },
  {
    name: 'a1-pytestmark-skip-every-module',
    issue: '#518',
    purpose: 'Change: every test module carries a module-level unconditional pytestmark skip.',
    commits: [
      PY_LIBRARY,
      {
        'tests/test_cache.py': `import pytest\n\npytestmark = pytest.mark.skip(reason="disabled")\n\n${PY_LIBRARY['tests/test_cache.py']}`,
        'tests/test_lru.py': `import pytest\n\npytestmark = pytest.mark.skip(reason="disabled")\n\n${PY_LIBRARY['tests/test_lru.py']}`,
      },
    ],
  },
  {
    name: 'a1-conftest-is-the-only-test-directory-file',
    issue: '#518',
    purpose: 'Corner: excluding conftest.py must not turn a measured A1 into an unmeasured one.',
    commits: [
      {
        ...PY_LIBRARY,
        'tests/test_cache.py': null,
        'tests/test_lru.py': null,
        'tests/conftest.py': CONFTEST_FIXTURE_ONLY,
      },
    ],
  },
  // #519 ------------------------------------------------------------------------------------
  {
    name: 'a1-js-suite',
    issue: '#519',
    purpose: 'Control: two uvu test files with live assertions.',
    commits: [JS_LIBRARY],
  },
  {
    name: 'a1-js-suite-as-lfs-pointers',
    issue: '#519',
    purpose: 'Change: both test files are committed as Git LFS pointers and no LFS content is present.',
    commits: [
      JS_LIBRARY,
      {
        'test/index.js': lfsPointerFor(JS_TEST_INDEX),
        'test/lite.js': lfsPointerFor(JS_TEST_LITE),
        '.gitattributes': 'test/** filter=lfs diff=lfs merge=lfs -text\n',
      },
    ],
  },
  // #520 ------------------------------------------------------------------------------------
  {
    name: 'a4-uv-locked-with-lockfile',
    issue: '#520',
    purpose: 'Control: CI runs `uv run --locked` and uv.lock is committed.',
    commits: [{ ...PY_LIBRARY, 'uv.lock': UV_LOCK, '.github/workflows/ci.yml': UV_LOCKED_CI }],
  },
  {
    name: 'a4-uv-locked-lockfile-deleted',
    issue: '#520',
    purpose: 'Change: uv.lock is deleted while CI still runs `uv run --locked`.',
    commits: [
      { ...PY_LIBRARY, 'uv.lock': UV_LOCK, '.github/workflows/ci.yml': UV_LOCKED_CI },
      { 'uv.lock': null },
    ],
  },
  {
    name: 'a4-uv-locked-lockfile-too-large',
    issue: '#520',
    purpose:
      'Corner: uv.lock is committed but over the content size limit, so the file walk withholds it; the requirement is met and must not be reported as unmet.',
    commits: [
      {
        ...PY_LIBRARY,
        'uv.lock': `${UV_LOCK}${'# padding to exceed the repository content size limit\n'.repeat(11_000)}`,
        '.github/workflows/ci.yml': UV_LOCKED_CI,
      },
    ],
  },
  {
    name: 'a4-library-no-lockfile-not-required',
    issue: '#520',
    purpose: 'Corner: a library with no lockfile and no automation requiring one keeps the library note.',
    commits: [PY_LIBRARY],
  },
  {
    name: 'a4-root-manifest-pinned',
    issue: '#520',
    purpose: 'Control: root and bench manifests both pin every devDependency.',
    commits: [{ ...JS_LIBRARY, 'package.json': JS_PINNED_ROOT, 'bench/package.json': JS_BENCH_MANIFEST, 'bench/index.js': "console.log('bench');\n" }],
  },
  {
    name: 'a4-root-manifest-unconstrained',
    issue: '#520',
    purpose: 'Change: the root devDependencies become "*" and "latest"; bench/package.json is unchanged.',
    commits: [
      { ...JS_LIBRARY, 'package.json': JS_PINNED_ROOT, 'bench/package.json': JS_BENCH_MANIFEST, 'bench/index.js': "console.log('bench');\n" },
      { 'package.json': JS_UNCONSTRAINED_ROOT },
    ],
  },
  // #442 ------------------------------------------------------------------------------------
  {
    name: 'history-full-clone',
    issue: '#442',
    purpose: 'Control: twenty commits, half of them pull-request merges, cloned in full.',
    commits: HISTORY.commits,
    subjects: HISTORY.subjects,
  },
  {
    name: 'history-shallow-clone',
    issue: '#442',
    purpose: 'Change: the same repository cloned at depth 1.',
    commits: HISTORY.commits,
    subjects: HISTORY.subjects,
    shallow: true,
  },
  {
    name: 'history-shallow-clone-with-committed-secret',
    issue: '#442',
    purpose:
      'Corner: a depth-1 clone whose current tree holds a secret-shaped value. The confirmed critical finding stands on what was read, so A2 keeps scoring it.',
    commits: HISTORY_WITH_SECRET.commits,
    subjects: HISTORY_WITH_SECRET.subjects,
    shallow: true,
  },
];

export function falseAssuranceFixture(name: string): FalseAssuranceFixture {
  const found = FALSE_ASSURANCE_FIXTURES.find((fixture) => fixture.name === name);
  if (!found) throw new Error(`unknown false-assurance fixture: ${name}`);
  return found;
}

/** Materialise a fixture into a fresh temp directory, one commit per entry. */
export function buildFalseAssuranceFixture(fixture: FalseAssuranceFixture): string {
  const dir = mkdtempSync(join(tmpdir(), `cejel-false-assurance-${fixture.name}-`));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  fixture.commits.forEach((files, index) => {
    for (const [relativePath, contents] of Object.entries(files)) {
      const fullPath = join(dir, relativePath);
      if (contents === null) {
        rmSync(fullPath, { force: true });
        continue;
      }
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, contents, 'utf8');
    }
    git(dir, ['add', '-A']);
    git(dir, [
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '--allow-empty',
      '-m',
      fixture.subjects?.[index] ?? `commit ${index}`,
    ]);
  });
  if (!fixture.shallow) return dir;
  const shallow = mkdtempSync(join(tmpdir(), `cejel-false-assurance-${fixture.name}-depth1-`));
  rmSync(shallow, { recursive: true, force: true });
  execFileSync(
    'git',
    ['-c', 'protocol.file.allow=always', 'clone', '--quiet', '--depth', '1', `file://${dir}`, shallow],
    { env: HERMETIC_GIT_ENV, encoding: 'utf8' },
  );
  return shallow;
}

function git(dir: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' });
}
