import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  /** Set for a case an adversarial review of #521 found against the first implementation. */
  readonly foundInReview?: true;
  readonly purpose: string;
  /** Each entry is one commit: path -> contents, or null to delete the path. */
  readonly commits: readonly Readonly<Record<string, string | null>>[];
  /** Commit subjects, one per commit. Defaults to `commit <n>`. */
  readonly subjects?: readonly string[];
  readonly shallow?: boolean;
  /**
   * Tracked symlinks, committed with the first commit: link path -> a subdirectory made inside a
   * fresh host directory outside the repository, which the link points at.
   */
  readonly symlinksToHostDirectory?: Readonly<Record<string, string>>;
  /** Directories made in the working tree after the last commit, and never tracked. */
  readonly untrackedDirectories?: readonly string[];
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

const FALSE_ASSURANCE_FIXTURES_REVIEW: FalseAssuranceFixture[] = [];

const FALSE_ASSURANCE_FIXTURES_ISSUES: readonly FalseAssuranceFixture[] = [
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

const PR_CI = (steps: string): string =>
  `name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${steps}`;

const RAISES_ASSERTION_TEST =
  'import pytest\n\n\ndef test_get():\n    with pytest.raises(KeyError):\n        {}["a"]\n';

// Cases an adversarial review of the first implementation of #521 reproduced. Each pins a defect
// that shipped in that implementation and is fixed in this one.
FALSE_ASSURANCE_FIXTURES_REVIEW.push(
  {
    name: 'review-a1-name-shaped-conftest-rated-hollow',
    issue: '#518',
    foundInReview: true,
    purpose:
      'v17 rates __tests__/conftest.py hollow (the __tests__/ name shape). Dropping it from the non-hollow denominator raised A1; the share must stay measured over the v17 list.',
    commits: [
      {
        'pyproject.toml':
          '[project]\nname = "c"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["__tests__"]\n',
        'README.md': '# c\n',
        LICENSE: 'MIT\n',
        'c.py': 'def f():\n    return 1\n',
        '__tests__/conftest.py': CONFTEST_FIXTURE_ONLY,
        '__tests__/test_c.py': RAISES_ASSERTION_TEST,
        '.github/workflows/ci.yml': PR_CI(
          '      - run: pip install pytest ruff mypy\n      - run: ruff check .\n      - run: mypy .\n      - run: pytest --cov\n',
        ),
      },
    ],
  },
  {
    name: 'review-a4-cargo-install-locked',
    issue: '#520',
    foundInReview: true,
    purpose: "`cargo install <tool> --locked` refers to the tool's lockfile, not the repository's.",
    commits: [
      {
        'Cargo.toml': '[package]\nname = "kl"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nserde = "1"\n',
        'src/lib.rs': 'pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n',
        'tests/add_test.rs': 'use kl::add;\n\n#[test]\nfn adds() {\n    assert_eq!(add(1, 2), 3);\n}\n',
        'README.md': '# kl\n',
        LICENSE: 'MIT\n',
        '.github/workflows/ci.yml': PR_CI(
          '      - run: cargo install cargo-nextest --locked\n      - run: cargo nextest run\n      - run: cargo test\n',
        ),
      },
    ],
  },
  {
    name: 'review-a4-bun-lock-committed',
    issue: '#520',
    foundInReview: true,
    purpose: 'bun.lock is committed but is not a lockfile A4 recognises; the requirement is met.',
    commits: [
      {
        'package.json': `${JSON.stringify({ name: 'b', version: '1.0.0', scripts: { test: 'bun test' }, dependencies: { zod: '^3.0.0' } }, null, 2)}\n`,
        'bun.lock': '{\n  "lockfileVersion": 1,\n  "workspaces": {}\n}\n',
        'index.ts': 'export const x = 1;\n',
        'index.test.ts': "import { expect, test } from 'bun:test';\n\ntest('x', () => {\n  expect(1).toBe(1);\n});\n",
        'README.md': '# b\n',
        LICENSE: 'MIT\n',
        '.github/workflows/ci.yml': PR_CI('      - run: bun install --frozen-lockfile\n      - run: bun test\n'),
      },
    ],
  },
  {
    name: 'review-a4-npm-ci-in-trailing-comment',
    issue: '#520',
    foundInReview: true,
    purpose: 'A trailing comment that mentions `npm ci` is not a command.',
    commits: [
      {
        'package.json': `${JSON.stringify({ name: 'b', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { zod: '^3.0.0' } }, null, 2)}\n`,
        'index.js': 'export const x = 1;\n',
        'test/index.test.js': "import test from 'node:test';\nimport assert from 'node:assert';\n\ntest('x', () => {\n  assert.strictEqual(1, 1);\n});\n",
        'README.md': '# b\n',
        LICENSE: 'MIT\n',
        '.github/workflows/ci.yml': PR_CI(
          '      - run: npm install # no lockfile on purpose; do not use npm ci\n      - run: npm test\n',
        ),
      },
    ],
  },
  {
    name: 'review-a1-hook-defined-under-try',
    issue: '#518',
    foundInReview: true,
    purpose: 'A hook defined only when an import fails is conditional, so no claim is made.',
    commits: [
      PY_LIBRARY,
      {
        'tests/conftest.py':
          'import pytest\n\ntry:\n    import numpy  # noqa\nexcept ImportError:\n    def pytest_collection_modifyitems(config, items):\n        for item in items:\n            item.add_marker(pytest.mark.skip(reason="numpy missing"))\n',
      },
    ],
  },
  {
    name: 'review-a1-root-conftest-beside-vitest',
    issue: '#518',
    foundInReview: true,
    purpose: 'A root conftest.py skip hook disables pytest tests, never the vitest tests beside them.',
    commits: [
      PY_LIBRARY,
      {
        'conftest.py': CONFTEST_SKIP_ALL,
        'package.json': `${JSON.stringify({ name: 'w', version: '1.0.0', scripts: { test: 'vitest run' }, devDependencies: { vitest: '^1.0.0' } }, null, 2)}\n`,
        'web/a.ts': 'export const a = 1;\n',
        'web/a.test.ts': "import { expect, it } from 'vitest';\nimport { a } from './a';\n\nit('a', () => {\n  expect(a).toBe(1);\n});\n",
      },
    ],
  },
  {
    name: 'review-a1-conditional-pytestmark',
    issue: '#518',
    foundInReview: true,
    purpose: 'A one-line conditional `pytestmark = pytest.mark.skip(...) if ... else []` is not unconditional.',
    commits: [
      PY_LIBRARY,
      {
        'tests/test_cache.py': `import os\nimport pytest\n\npytestmark = pytest.mark.skip(reason="no db") if not os.environ.get("DB") else []\n\n${PY_LIBRARY['tests/test_cache.py']}`,
        'tests/test_lru.py': `import os\nimport pytest\n\npytestmark = pytest.mark.skip(reason="no db") if not os.environ.get("DB") else []\n\n${PY_LIBRARY['tests/test_lru.py']}`,
      },
    ],
  },
  {
    name: 'review-b3-tox-ci-with-tag-publish',
    issue: '#517',
    foundInReview: true,
    purpose: 'One workflow runs tox on every push and pull request, then uploads on tags. It is CI.',
    commits: [
      {
        ...PY_LIBRARY,
        'tox.ini': '[tox]\nenvlist = py311\n\n[testenv]\ndeps = pytest\ncommands = pytest\n',
        '.github/workflows/ci.yml':
          "name: ci\non:\n  push:\n    branches: [main]\n    tags: ['v*']\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install tox\n      - run: tox\n  release:\n    needs: test\n    if: startsWith(github.ref, 'refs/tags/')\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: python -m build\n      - run: twine upload dist/*\n",
      },
    ],
  },
  {
    name: 'review-a2-secret-beside-planted-lfs-pointer',
    issue: '#519',
    foundInReview: true,
    purpose:
      'A pointer-shaped file next to a confirmed critical secret must not erase the finding through the LFS abstention.',
    commits: [
      {
        ...PY_LIBRARY,
        'src/cachelib/billing.py': `# Fixture only: a synthetic value in a real-looking assignment.\nSTRIPE_SECRET_KEY = "${SYNTHETIC_BRANDED_SECRET}"\n`,
        'src/cachelib/blob.py': lfsPointerFor('x'),
      },
    ],
  },
  {
    name: 'review-a2-lfs-data-in-not-applicable-library',
    issue: '#519',
    foundInReview: true,
    purpose: 'An LFS-tracked data file in a library where A2 is not applicable must not turn A2 into a 0.',
    commits: [
      {
        ...PY_LIBRARY,
        '.gitattributes': '*.json filter=lfs diff=lfs merge=lfs -text\n',
        'data/sample.json': lfsPointerFor('{"a":1}'),
      },
    ],
  },
);

// A second review, of the fixes above, reproduced these.
const NODE_LIBRARY_NO_LOCKFILE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({ name: 'b', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { zod: '^3.0.0' } }, null, 2)}\n`,
  'index.js': 'export const x = 1;\n',
  'test/index.test.js': "import test from 'node:test';\nimport assert from 'node:assert';\n\ntest('x', () => {\n  assert.strictEqual(1, 1);\n});\n",
  'README.md': '# b\n',
  LICENSE: 'MIT\n',
};
for (const [name, purpose, steps] of [
  [
    'review2-a4-npm-ci-guarded-by-if',
    'A step that runs `npm ci` only when a lockfile exists does not require one.',
    '      - run: if [ -f package-lock.json ]; then npm ci; else npm install; fi\n      - run: npm test\n',
  ],
  [
    'review2-a4-npm-ci-guarded-by-test-and-or',
    '`[ -f package-lock.json ] && npm ci || npm install` does not require a lockfile.',
    '      - run: "[ -f package-lock.json ] && npm ci || npm install"\n      - run: npm test\n',
  ],
  [
    'review2-a4-npm-ci-in-echo-and-heredoc',
    '`npm ci` as echoed text, a heredoc line, or a step name is not a command.',
    '      - name: npm ci\n        run: npm install\n      - run: echo tip use npm ci locally\n      - run: |\n          cat > NOTE.md <<EOF\n          npm ci\n          EOF\n      - run: npm test\n',
  ],
  [
    'review2-a4-npm-ci-in-disabled-job',
    'A job with an `if:` condition states nothing unconditionally.',
    '      - run: npm test\n  extra:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n',
  ],
  [
    'review2-a4-lockfile-generated-first',
    '`npm install --package-lock-only` before `npm ci` creates the lockfile the second needs.',
    '      - run: npm install --package-lock-only\n      - run: npm ci\n      - run: npm test\n',
  ],
] as const) {
  FALSE_ASSURANCE_FIXTURES_REVIEW.push({
    name,
    issue: '#520',
    foundInReview: true,
    purpose,
    commits: [{ ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI(steps) }],
  });
}
FALSE_ASSURANCE_FIXTURES_REVIEW.push({
  name: 'review2-a3-service-entrypoint-as-lfs-pointer',
  issue: '#519',
  foundInReview: true,
  purpose:
    'A service whose entry point is an LFS pointer: A3 must not report not-applicable from content it did not read.',
  commits: [
    {
      'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { start: 'node server.js' }, dependencies: { express: '^4.19.0' } }, null, 2)}\n`,
      'server.js': lfsPointerFor("const express = require('express');\nconst app = express();\napp.listen(3000);\n"),
      '.gitattributes': 'server.js filter=lfs diff=lfs merge=lfs -text\n',
      'README.md': '# svc\n',
    },
  ],
});

// A third review, of the merged implementation, reproduced these. The first group must claim the
// requirement (it was missed); the second must not (the claim would be false).
const RUST_LIBRARY_NO_LOCKFILE: Readonly<Record<string, string>> = {
  'Cargo.toml': '[package]\nname = "kl"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nserde = "1"\n',
  'src/lib.rs': 'pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n',
  'tests/add_test.rs': 'use kl::add;\n\n#[test]\nfn adds() {\n    assert_eq!(add(1, 2), 3);\n}\n',
  'README.md': '# kl\n',
  LICENSE: 'MIT\n',
};
for (const [name, purpose, files] of [
  [
    'review3-a4-npm-ci-then-npm-test-in-one-step',
    '`npm ci` and `npm test` in one step: `test` is a conditional only in command position.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: |\n          npm ci\n          npm test\n') },
  ],
  [
    'review3-a4-cargo-test-locked',
    '`cargo test --locked` requires Cargo.lock; its own `test` is not a conditional.',
    { ...RUST_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: cargo test --locked\n') },
  ],
  [
    'review3-a4-crlf-workflow',
    'A workflow saved with CRLF line endings is read like any other.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci\n      - run: npm test\n').replace(/\n/g, '\r\n') },
  ],
] as const) {
  FALSE_ASSURANCE_FIXTURES_REVIEW.push({ name, issue: '#520', foundInReview: true, purpose, commits: [files] });
}
for (const [name, purpose, files] of [
  [
    'review3-a4-crlf-npm-ci-in-disabled-job',
    'CRLF line endings must not hide a job-level `if:`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm test\n  extra:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n').replace(/\n/g, '\r\n') },
  ],
  [
    'review3-a4-npm-ci-continue-on-error-step',
    'A step that may fail without failing its job does not require anything.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci\n        continue-on-error: true\n      - run: npm test\n') },
  ],
  [
    'review3-a4-npm-ci-continue-on-error-job',
    'A job that may fail without failing the run does not require anything.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm test\n  extra:\n    runs-on: ubuntu-latest\n    continue-on-error: true\n    steps:\n      - run: npm ci\n') },
  ],
  [
    'review3-a4-npm-ci-in-other-repository-checkout',
    '`npm ci` inside another repository checked out by the workflow reads that repository’s lockfile.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - uses: actions/checkout@v4\n        with:\n          repository: acme/app\n          path: app\n      - run: npm ci\n        working-directory: app\n') },
  ],
  [
    'review3-a4-npm-ci-in-directory-outside-checkout',
    'A working directory or `cd` target this checkout does not hold is made by the workflow.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci\n        working-directory: generated\n'), '.github/workflows/cd.yml': PR_CI('      - run: cd generated && npm ci\n') },
  ],
  [
    'review3-a4-lockfile-copied-in-first',
    'A workflow that names the lockfile in a command (here copying it in) may create it.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: cp ci/package-lock.json package-lock.json\n      - run: npm ci\n') },
  ],
] as const) {
  FALSE_ASSURANCE_FIXTURES_REVIEW.push({ name, issue: '#520', foundInReview: true, purpose, commits: [files] });
}
FALSE_ASSURANCE_FIXTURES_REVIEW.push(
  {
    name: 'review3-a4-primary-manifest-unconstrained',
    issue: '#520',
    foundInReview: true,
    purpose: 'Another manifest is cited ahead of the primary only when the primary has no unconstrained dependency.',
    commits: [
      {
        ...NODE_LIBRARY_NO_LOCKFILE,
        'package.json': `${JSON.stringify({ name: 'b', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { zod: '*', a: '^1.0.0', b: '^1.0.0', c: '^1.0.0' } }, null, 2)}\n`,
        'docs/package.json': `${JSON.stringify({ name: 'docs', private: true, dependencies: { vitepress: 'latest' } }, null, 2)}\n`,
      },
    ],
  },
  {
    name: 'review3-a1-conftest-only-no-runner',
    issue: '#518',
    foundInReview: true,
    purpose: 'conftest.py is the only test-shaped file and nothing else names a runner: A1 stays measured.',
    commits: [
      {
        'pyproject.toml': '[project]\nname = "c"\nversion = "1.0.0"\ndependencies = []\n',
        'README.md': '# c\n',
        LICENSE: 'MIT\n',
        'src/c/__init__.py': 'def get(cache, key, default=None):\n    return cache.get(key, default)\n',
        'src/c/lru.py': 'class LRU:\n    def __init__(self, size):\n        self.size = size\n',
        'tests/conftest.py': CONFTEST_FIXTURE_ONLY,
      },
    ],
  },
  {
    name: 'review3-a1-conftest-only-unproven-source',
    issue: '#518',
    foundInReview: true,
    purpose:
      'As above where the reviewable-source proof fails (mostly empty modules): without the conftest, A1 had no evidence at all.',
    commits: [
      {
        'pyproject.toml': '[project]\nname = "c"\nversion = "1.0.0"\ndependencies = []\n',
        'README.md': '# c\n',
        LICENSE: 'MIT\n',
        'src/c/__init__.py': 'def get(cache, key, default=None):\n    return cache.get(key, default)\n',
        ...Object.fromEntries(['a', 'b', 'd', 'e', 'f', 'g'].map((name) => [`src/c/${name}/__init__.py`, ''])),
        'tests/conftest.py': CONFTEST_FIXTURE_ONLY,
      },
    ],
  },
  {
    name: 'review3-a1-hook-reorders-items',
    issue: '#518',
    foundInReview: true,
    purpose: '`items.clear()` then `items.extend(ordered)` reorders the run; every test still runs.',
    commits: [
      PY_LIBRARY,
      {
        'tests/conftest.py':
          'def pytest_collection_modifyitems(session, config, items):\n    ordered = sorted(items, key=lambda item: item.name)\n    items.clear()\n    items.extend(ordered)\n',
      },
    ],
  },
  {
    name: 'review3-a1-skip-hook-beside-asserting-conftest',
    issue: '#518',
    foundInReview: true,
    purpose: 'A conftest.py with an assert in a fixture is not a live test, whether or not its hook skips the suite.',
    commits: [
      PY_LIBRARY,
      {
        'tests/conftest.py': `${CONFTEST_SKIP_ALL}\n\n@pytest.fixture\ndef cache():\n    value = {}\n    assert value == {}\n    return value\n`,
      },
    ],
  },
);

// A fourth review, of #533's own fixes, reproduced these. The A4 cases must not claim that CI
// requires a lockfile (the claim would be false), except the `review4-a4-claims-*` controls, which
// must still claim it. Shell that YAML would read as a tag (`!`) or a flow mapping (`{`) is in a
// `|` block, as a workflow would write it.
const PY_LIBRARY_NO_LOCKFILE: Readonly<Record<string, string>> = {
  'pyproject.toml': '[project]\nname = "pl"\nversion = "1.0.0"\ndependencies = ["requests>=2"]\n',
  'src/pl/__init__.py': 'VALUE = 1\n',
  'tests/test_pl.py': 'def test_value():\n    assert 1 == 1\n',
  'README.md': '# pl\n',
  LICENSE: 'MIT\n',
};
const NODE_WORKSPACE_PACKAGE = {
  'packages/app/package.json': `${JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { zod: '^3.0.0' } }, null, 2)}\n`,
  'packages/app/index.js': 'export const app = 1;\n',
};
for (const [name, purpose, files] of [
  // Finding 1: a guard behind a leading `(`, `{` or `!`, and the other shapes #533 newly claimed.
  [
    'review4-a4-guard-in-subshell',
    'A `[` guard inside a subshell, `( [ -n "$FULL" ] && npm ci )`, is still a guard.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: ( [ -n "$FULL" ] && npm ci )\n') },
  ],
  [
    'review4-a4-test-guard-in-subshell',
    'A `test` guard inside a subshell, `( test -n "$X" && npm ci )`, is still a guard.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: ( test -n "$X" && npm ci )\n') },
  ],
  [
    'review4-a4-guard-in-brace-group',
    'A `[[` guard inside a brace group, `{ [[ -n "$FULL" ]] && npm ci; }`, is still a guard.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: |\n          { [[ -n "$FULL" ]] && npm ci; }\n') },
  ],
  [
    'review4-a4-negated-guard',
    'A negated guard, `! [ -n "$SKIP" ] && npm ci`, is still a guard.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: |\n          ! [ -n "$SKIP" ] && npm ci\n') },
  ],
  [
    'review4-a4-negated-subshell-guard',
    'Combined: `( ! test -f .skip && npm ci )`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: ( ! test -f .skip && npm ci )\n') },
  ],
  [
    'review4-a4-arithmetic-guard',
    'An arithmetic guard, `(( FULL )) && npm ci`, is a guard.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: (( FULL )) && npm ci\n') },
  ],
  [
    'review4-a4-negated-npm-ci',
    '`! npm ci` passes the step when `npm ci` fails: peeling `!` must not make it claimable.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: |\n          ! npm ci\n') },
  ],
  [
    'review4-a4-set-plus-e-then-npm-test',
    '`set +e` lets `npm ci` fail without failing the step, here followed by `npm test`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: |\n          set +e\n          npm ci\n          npm test\n') },
  ],
  [
    'review4-a4-cd-inside-subshell',
    '`( cd generated && npm ci )` leaves the checkout inside the subshell.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: ( cd generated && npm ci )\n') },
  ],
  // Finding 2: a directory or manifest passed as a flag that the inventory does not hold.
  [
    'review4-a4-npm-ci-prefix-outside',
    '`npm ci --prefix generated` reads generated/package-lock.json, which the scan never saw.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci --prefix generated\n') },
  ],
  [
    'review4-a4-npm-ci-prefix-equals-outside',
    'As above, written `--prefix=generated`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci --prefix=generated\n') },
  ],
  [
    'review4-a4-pnpm-dir-outside',
    '`pnpm install --frozen-lockfile --dir generated`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: pnpm install --frozen-lockfile --dir generated\n') },
  ],
  [
    'review4-a4-pnpm-short-dir-outside',
    '`pnpm install --frozen-lockfile -C generated`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: pnpm install --frozen-lockfile -C generated\n') },
  ],
  [
    'review4-a4-uv-sync-directory-outside',
    '`uv sync --locked --directory generated`.',
    { ...PY_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: uv sync --locked --directory generated\n') },
  ],
  [
    'review4-a4-uv-run-project-outside',
    '`uv run --locked --project generated pytest`.',
    { ...PY_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: uv run --locked --project generated pytest\n') },
  ],
  [
    'review4-a4-cargo-manifest-path-outside',
    '`cargo test --locked --manifest-path generated/Cargo.toml` reads a manifest the scan never saw.',
    { ...RUST_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: cargo test --locked --manifest-path generated/Cargo.toml\n') },
  ],
  // Finding 5: each workflow-reader rule isolated, so deleting one fails a test.
  [
    'review4-a4-other-repository-checkout-at-root',
    'Another repository checked out over the workspace root, with no working directory.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - uses: actions/checkout@v4\n        with:\n          repository: acme/app\n      - run: npm ci\n') },
  ],
  [
    'review4-a4-artifact-downloaded-first',
    'An artifact downloaded into the workspace before `npm ci`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - uses: actions/download-artifact@v4\n        with:\n          name: deps\n      - run: npm ci\n') },
  ],
  [
    'review4-a4-run-key-outside-any-step',
    'A `run:` key after the steps list ends is not inside any step, so it is not placed.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('    container:\n      run: npm ci\n') },
  ],
  [
    'review4-a4-run-key-inside-block-body',
    'A `- run:` line inside a block body (a heredoc writing YAML) is shell text, not a step.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI("      - run: |\n          cat > generated.yml <<'EOF'\n          - run: npm ci\n          EOF\n") },
  ],
  [
    'review4-a4-run-key-inside-action-script',
    'A `run:` line inside a script passed to an action is that script’s text, not a step.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - uses: actions/github-script@v7\n        with:\n          script: |\n            run: npm ci\n') },
  ],
  [
    'review4-a4-job-guard-after-steps',
    'A job-level `if:` written after the job’s `steps:` still conditions every step.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm test\n  extra:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n    if: false\n') },
  ],
  [
    'review4-a4-steps-key-inside-block-body',
    'A `steps:` line inside an earlier step’s block body must not hide the job’s own `if:`.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI("      - run: npm test\n  extra:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          cat > x.yml <<'EOF'\n          steps:\n            - name: hi\n          EOF\n      - run: npm ci\n") },
  ],
  // Finding 3: which directories the checkout holds is read from the inventory, exact-case.
  [
    'review4-a4-cd-wrong-case',
    '`cd SRC` where the inventory holds `src/`: a Linux runner has no SRC directory.',
    { ...NODE_LIBRARY_NO_LOCKFILE, 'src/util.js': 'export const u = 1;\n', '.github/workflows/ci.yml': PR_CI('      - run: cd SRC && npm ci\n') },
  ],
] as const) {
  FALSE_ASSURANCE_FIXTURES_REVIEW.push({ name, issue: '#520', foundInReview: true, purpose, commits: [files] });
}
FALSE_ASSURANCE_FIXTURES_REVIEW.push(
  {
    name: 'review4-a4-working-directory-through-tracked-symlink',
    issue: '#520',
    foundInReview: true,
    purpose:
      'A working directory under a tracked symlink to a host directory is not in the checkout, whatever the scanning host holds.',
    symlinksToHostDirectory: { vendor: 'pkg' },
    commits: [{ ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci\n        working-directory: vendor/pkg\n') }],
  },
  {
    name: 'review4-a4-working-directory-untracked-empty',
    issue: '#520',
    foundInReview: true,
    purpose: 'An untracked empty directory on the scanning host is not in the checkout a runner makes.',
    untrackedDirectories: ['build'],
    commits: [{ ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci\n        working-directory: build\n') }],
  },
);
// Controls: a directory the inventory holds is still followed. No file of the lockfile's name is
// anywhere in the inventory, so none is in that directory either, and the claim stays true.
for (const [name, purpose, files] of [
  [
    'review4-a4-claims-cd-into-tracked-directory',
    '`cd src && npm ci` where the inventory holds `src/`: still claimed.',
    { ...NODE_LIBRARY_NO_LOCKFILE, 'src/util.js': 'export const u = 1;\n', '.github/workflows/ci.yml': PR_CI('      - run: cd src && npm ci\n') },
  ],
  [
    'review4-a4-claims-prefix-into-tracked-directory',
    '`npm ci --prefix packages/app` where the inventory holds packages/app/: still claimed.',
    { ...NODE_LIBRARY_NO_LOCKFILE, ...NODE_WORKSPACE_PACKAGE, '.github/workflows/ci.yml': PR_CI('      - run: npm ci --prefix packages/app\n') },
  ],
  [
    'review4-a4-claims-manifest-path-tracked',
    '`cargo test --locked --manifest-path Cargo.toml`, a manifest the inventory holds: still claimed.',
    { ...RUST_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: cargo test --locked --manifest-path ./Cargo.toml\n') },
  ],
  [
    'review4-a4-claims-after-brace-group',
    'A brace group with no guard (`{ echo start; }`) does not make a later `npm ci` conditional: still claimed.',
    { ...NODE_LIBRARY_NO_LOCKFILE, '.github/workflows/ci.yml': PR_CI('      - run: |\n          { echo start; }\n          npm ci\n') },
  ],
] as const) {
  FALSE_ASSURANCE_FIXTURES_REVIEW.push({ name, issue: '#520', foundInReview: true, purpose, commits: [files] });
}
// Finding 6 (#518): a hook that empties `items` and puts back nothing removes the suite, on one
// line or two; a one-line reorder is still a reorder.
for (const [name, purpose, hook] of [
  [
    'review4-a1-hook-empties-and-refills-nothing',
    '`items.clear()` then `items.extend([])` leaves no test to run.',
    '    items.clear()\n    items.extend([])\n',
  ],
  [
    'review4-a1-hook-empties-and-refills-nothing-one-line',
    '`items.clear(); items.extend([])` on one line leaves no test to run.',
    '    items.clear(); items.extend([])\n',
  ],
  [
    'review4-a1-hook-reorders-items-one-line',
    '`items.clear(); items.extend(ordered)` on one line reorders the run; every test still runs.',
    '    ordered = sorted(items, key=lambda item: item.name)\n    items.clear(); items.extend(ordered)\n',
  ],
] as const) {
  FALSE_ASSURANCE_FIXTURES_REVIEW.push({
    name,
    issue: '#518',
    foundInReview: true,
    purpose,
    commits: [PY_LIBRARY, { 'tests/conftest.py': `def pytest_collection_modifyitems(session, config, items):\n${hook}` }],
  });
}

export const FALSE_ASSURANCE_FIXTURES: readonly FalseAssuranceFixture[] = [
  ...FALSE_ASSURANCE_FIXTURES_ISSUES,
  ...FALSE_ASSURANCE_FIXTURES_REVIEW,
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
    if (index === 0) {
      for (const [link, subdirectory] of Object.entries(fixture.symlinksToHostDirectory ?? {})) {
        const host = mkdtempSync(join(tmpdir(), 'cejel-false-assurance-host-'));
        mkdirSync(join(host, subdirectory), { recursive: true });
        mkdirSync(dirname(join(dir, link)), { recursive: true });
        symlinkSync(host, join(dir, link));
      }
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
  for (const directory of fixture.untrackedDirectories ?? []) {
    mkdirSync(join(dir, directory), { recursive: true });
  }
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
