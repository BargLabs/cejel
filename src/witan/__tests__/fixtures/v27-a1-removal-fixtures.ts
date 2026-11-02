import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

// v27 A1 REMOVAL FIXTURES (goal_cejel_v27_a1_test_count_overmatch_2026-11-01).
//
// Under witan-rubric-v27-prospective-2026-10-19 three rules take files out of A1's test count or
// rate them hollow: conftest.py is not a test file, a run-wide pytest skip (a collection hook or a
// module-level pytestmark) disables the files in its scope, and a file whose every test carries an
// unconditional skip runs none. Each fixture below is a synthetic shape, written from scratch, in
// which a loose reading of one rule would say its condition holds when it does not, or (a control)
// in which it does hold. Built with buildFalseAssuranceFixture, outside FALSE_ASSURANCE_FIXTURES,
// so the existing sharded suites and their pins do not move.

const PYPROJECT = (pytestOptions: readonly string[] = []): string =>
  [
    '[project]',
    'name = "cachelib"',
    'version = "1.0.0"',
    'dependencies = []',
    '',
    '[tool.pytest.ini_options]',
    'testpaths = ["tests"]',
    ...pytestOptions,
    '',
  ].join('\n');

const PY_BASE: Readonly<Record<string, string>> = {
  'pyproject.toml': PYPROJECT(),
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

const lines = (...text: string[]): string => `${text.join('\n')}\n`;

/** A conftest.py whose collection hook has `body` (each line already indented four spaces). */
const conftestHook = (body: readonly string[], preamble: readonly string[] = ['import pytest']): string =>
  lines(...preamble, '', '', 'def pytest_collection_modifyitems(config, items):', ...body);

const JS_BASE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    {
      name: 'mathlib',
      version: '1.0.0',
      type: 'module',
      main: 'src/index.js',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^2.1.0' },
    },
    null,
    2,
  )}\n`,
  'README.md': '# mathlib\n',
  LICENSE: 'MIT\n',
  'src/index.js': 'export function sum(a, b) {\n  return a + b;\n}\n',
  'src/max.js': 'export function max(a, b) {\n  return a > b ? a : b;\n}\n',
  'test/sum.test.js':
    "import { describe, expect, it } from 'vitest';\nimport { sum } from '../src/index.js';\n\ndescribe('sum', () => {\n  it('adds', () => {\n    expect(sum(1, 2)).toBe(3);\n  });\n});\n",
  'test/max.test.js':
    "import { expect, test } from 'vitest';\nimport { max } from '../src/max.js';\n\ntest('picks the larger', () => {\n  expect(max(1, 2)).toBe(2);\n});\n",
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm install\n      - run: npm test\n',
};

/** The removal rule a fixture probes, as A1's v27 note names it. */
export type RemovalRule = 'conftest' | 'run-wide skip' | 'every test skipped';

export interface RemovalFixture extends FalseAssuranceFixture {
  readonly rule: RemovalRule;
  /**
   * The files v27 is right to rate as running no test, each with its rule as the note gives it.
   * Empty where the rule's condition does not hold, so v27 must read every file as v17 does.
   */
  readonly removed: readonly (readonly [path: string, rule: string])[];
}

const fixture = (
  name: string,
  rule: RemovalRule,
  purpose: string,
  files: Readonly<Record<string, string | null>>,
  removed: RemovalFixture['removed'] = [],
  base: Readonly<Record<string, string>> = PY_BASE,
): RemovalFixture => ({ name, issue: '#518', rule, purpose, commits: [{ ...base, ...files }], removed });

const SKIPPED_CACHE_TEST = lines(
  'import pytest',
  '',
  'from cachelib import get, put',
  '',
  '',
  '@pytest.mark.skip(reason="flaky")',
  'def test_get_default():',
  '    assert get({}, "a", 1) == 1',
  '',
  '',
  '@pytest.mark.skip(reason="flaky")',
  'def test_put():',
  '    c = {}',
  '    put(c, "a", 2)',
  '    assert c["a"] == 2',
);

const LIVE_PY_TEST = (name: string): string =>
  lines('from cachelib import get', '', '', `def test_${name}():`, '    assert get({"k": 1}, "k") == 1');

export const REMOVAL_FIXTURES: readonly RemovalFixture[] = [
  // ---- conftest ---------------------------------------------------------------------------
  fixture('a1rm-conftest-name-test-prefix', 'conftest', 'A test module named test_conftest.py is a test file.', {
    'tests/test_conftest.py': LIVE_PY_TEST('conftest_loading'),
  }),
  fixture('a1rm-conftest-name-test-suffix', 'conftest', 'A test module named conftest_test.py is a test file.', {
    'tests/conftest_test.py': LIVE_PY_TEST('conftest_suffix'),
  }),
  fixture('a1rm-conftest-directory', 'conftest', 'A test module inside a directory named conftest is a test file.', {
    'tests/conftest/test_parse.py': LIVE_PY_TEST('parse'),
  }),
  fixture(
    'a1rm-conftest-nonroot-defines-tests',
    'conftest',
    "Control: a non-root conftest.py that also defines test_ functions; pytest's default python_files never collects it.",
    {
      'tests/unit/conftest.py': lines(
        'import pytest',
        '',
        '',
        '@pytest.fixture',
        'def cache():',
        '    return {}',
        '',
        '',
        'def test_cache_fixture_is_empty(cache):',
        '    assert cache == {}',
      ),
      'tests/unit/test_unit.py': LIVE_PY_TEST('unit'),
    },
    [['tests/unit/conftest.py', 'conftest']],
  ),
  fixture(
    'a1rm-conftest-collected-by-python-files',
    'conftest',
    'The same conftest.py, with python_files naming conftest.py, so pytest does collect its test.',
    {
      'pyproject.toml': PYPROJECT(['python_files = ["test_*.py", "conftest.py"]']),
      'tests/unit/conftest.py': lines(
        'import pytest',
        '',
        '',
        '@pytest.fixture',
        'def cache():',
        '    return {}',
        '',
        '',
        'def test_cache_fixture_is_empty(cache):',
        '    assert cache == {}',
      ),
      'tests/unit/test_unit.py': LIVE_PY_TEST('unit'),
    },
  ),
  fixture(
    'a1rm-conftest-only-change',
    'conftest',
    'Item C: a fixture-only conftest.py added beside a live suite (it holds no assertion).',
    { 'tests/conftest.py': lines('import pytest', '', '', '@pytest.fixture', 'def cache():', '    return {}') },
  ),
  fixture(
    'a1rm-conftest-asserting-helper',
    'conftest',
    'Control: a conftest.py whose fixture asserts; it runs no test, so v27 rates it hollow and names it.',
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        '',
        '@pytest.fixture',
        'def cache():',
        '    made = {}',
        '    assert made == {}',
        '    return made',
      ),
    },
    [['tests/conftest.py', 'conftest']],
  ),
  // ---- run-wide skip: collection hooks -----------------------------------------------------
  fixture(
    'a1rm-hook-skips-every-item',
    'run-wide skip',
    'Control: an unconditional hook skips every item.',
    {
      'tests/conftest.py': conftestHook([
        '    for item in items:',
        '        item.add_marker(pytest.mark.skip(reason="disabled"))',
      ]),
    },
    [
      ['tests/test_cache.py', 'run-wide skip: hook in tests/conftest.py'],
      ['tests/test_lru.py', 'run-wide skip: hook in tests/conftest.py'],
    ],
  ),
  fixture('a1rm-hook-marker-filter', 'run-wide skip', 'The hook skips only items carrying a marker.', {
    'tests/conftest.py': conftestHook([
      '    for item in items:',
      '        if item.get_closest_marker("slow"):',
      '            item.add_marker(pytest.mark.skip(reason="slow"))',
    ]),
  }),
  fixture('a1rm-hook-deselect-filter', 'run-wide skip', 'The hook deselects items by name with a comprehension filter.', {
    'tests/conftest.py': conftestHook([
      '    items[:] = [item for item in items if "integration" not in item.nodeid]',
    ]),
  }),
  fixture('a1rm-hook-name-filter', 'run-wide skip', 'The hook skips only items whose name matches.', {
    'tests/conftest.py': conftestHook([
      '    for item in items:',
      '        if "integration" in item.nodeid:',
      '            item.add_marker(pytest.mark.skip(reason="integration"))',
    ]),
  }),
  fixture('a1rm-hook-platform-conditional', 'run-wide skip', 'The hook skips every item on one platform only.', {
    'tests/conftest.py': conftestHook(
      [
        '    if sys.platform == "win32":',
        '        for item in items:',
        '            item.add_marker(pytest.mark.skip(reason="posix only"))',
      ],
      ['import sys', '', 'import pytest'],
    ),
  }),
  fixture('a1rm-hook-environment-conditional', 'run-wide skip', 'The hook skips every item only when an environment variable is set.', {
    'tests/conftest.py': conftestHook(
      [
        '    if os.environ.get("SKIP_ALL"):',
        '        for item in items:',
        '            item.add_marker(pytest.mark.skip(reason="SKIP_ALL"))',
      ],
      ['import os', '', 'import pytest'],
    ),
  }),
  fixture('a1rm-hook-option-early-return', 'run-wide skip', 'The hook returns early when a command-line option is given.', {
    'tests/conftest.py': conftestHook([
      '    if config.getoption("--run-all"):',
      '        return',
      '    for item in items:',
      '        item.add_marker(pytest.mark.skip(reason="needs --run-all"))',
    ]),
  }),
  fixture('a1rm-hook-option-short-circuit', 'run-wide skip', 'The skip depends on an option through `or`, with no if.', {
    'tests/conftest.py': conftestHook([
      '    run_all = config.getoption("--run-all")',
      '    for item in items:',
      '        run_all or item.add_marker(pytest.mark.skip(reason="needs --run-all"))',
    ]),
  }),
  fixture('a1rm-hook-skipif-platform', 'run-wide skip', 'The hook adds a skipif with a platform condition to every item.', {
    'tests/conftest.py': conftestHook(
      [
        '    for item in items:',
        '        item.add_marker(pytest.mark.skipif(sys.platform == "win32", reason="posix only"))',
      ],
      ['import sys', '', 'import pytest'],
    ),
  }),
  fixture(
    'a1rm-hook-conditional-fixture',
    'run-wide skip',
    'An autouse fixture skips conditionally; the hook only adds a marker that is not a skip.',
    {
      'tests/conftest.py': lines(
        'import os',
        '',
        'import pytest',
        '',
        '',
        '@pytest.fixture(autouse=True)',
        'def needs_service():',
        '    if not os.environ.get("SERVICE_URL"):',
        '        pytest.skip("no service")',
        '',
        '',
        'def pytest_collection_modifyitems(config, items):',
        '    for item in items:',
        '        item.add_marker(pytest.mark.service)',
      ),
    },
  ),
  fixture(
    'a1rm-hook-loops-over-module-list',
    'run-wide skip',
    'The hook takes no items parameter; its loop runs over an empty module-level list named items.',
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        'items = []',
        '',
        '',
        'def pytest_collection_modifyitems(session, config):',
        '    for item in items:',
        '        item.add_marker(pytest.mark.skip(reason="never reached"))',
      ),
    },
  ),
  fixture(
    'a1rm-hook-clear-then-helper-refill',
    'run-wide skip',
    'The hook empties items and then a helper it passes items to puts them back in a new order.',
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        '',
        'def restore_sorted(target, saved):',
        '    target.extend(sorted(saved, key=lambda item: item.nodeid))',
        '',
        '',
        'def pytest_collection_modifyitems(config, items):',
        '    saved = list(items)',
        '    items.clear()',
        '    restore_sorted(items, saved)',
      ),
    },
  ),
  fixture(
    'a1rm-hook-in-subdirectory',
    'run-wide skip',
    'Control: a hook in tests/integration/conftest.py skips every item; only the files under it are named.',
    {
      'tests/integration/conftest.py': conftestHook([
        '    for item in items:',
        '        item.add_marker(pytest.mark.skip(reason="no service"))',
      ]),
      'tests/integration/test_service.py': LIVE_PY_TEST('service'),
    },
    [['tests/integration/test_service.py', 'run-wide skip: hook in tests/integration/conftest.py']],
  ),
  // ---- run-wide skip: pytestmark ----------------------------------------------------------
  fixture('a1rm-pytestmark-list-conditional-skip', 'run-wide skip', 'pytestmark is a list holding a skip only under a condition.', {
    'tests/test_cache.py': lines(
      'import pytest',
      '',
      'from cachelib import get',
      '',
      'HAS_DB = True',
      'pytestmark = [pytest.mark.skip(reason="no db")] if not HAS_DB else []',
      '',
      '',
      'def test_get():',
      '    assert get({"k": 1}, "k") == 1',
    ),
  }),
  fixture('a1rm-pytestmark-list-with-skipif', 'run-wide skip', 'pytestmark is a list holding a skipif with a platform condition.', {
    'tests/test_cache.py': lines(
      'import sys',
      '',
      'import pytest',
      '',
      'from cachelib import get',
      '',
      'pytestmark = [pytest.mark.slow, pytest.mark.skipif(sys.platform == "win32", reason="posix")]',
      '',
      '',
      'def test_get():',
      '    assert get({"k": 1}, "k") == 1',
    ),
  }),
  fixture('a1rm-pytestmark-skipif-nonliteral', 'run-wide skip', 'pytestmark is a skipif whose condition is a name.', {
    'tests/test_cache.py': lines(
      'import pytest',
      '',
      'from cachelib import get',
      '',
      'HAS_NUMPY = False',
      'pytestmark = pytest.mark.skipif(not HAS_NUMPY, reason="numpy")',
      '',
      '',
      'def test_get():',
      '    assert get({"k": 1}, "k") == 1',
    ),
  }),
  fixture('a1rm-pytestmark-inside-class', 'run-wide skip', 'A skip pytestmark inside a class, beside a live module-level test.', {
    'tests/test_cache.py': lines(
      'import pytest',
      '',
      'from cachelib import get',
      '',
      '',
      'class TestLegacy:',
      '    pytestmark = pytest.mark.skip(reason="legacy")',
      '',
      '    def test_legacy(self):',
      '        assert get({}, "a", 1) == 1',
      '',
      '',
      'def test_get():',
      '    assert get({"k": 1}, "k") == 1',
    ),
  }),
  fixture(
    'a1rm-pytestmark-parametrize-one-param-skipped',
    'run-wide skip',
    'pytestmark parametrizes every test over two backends and skips one of them only.',
    {
      'tests/test_cache.py': lines(
        'import pytest',
        '',
        'from cachelib import get',
        '',
        'pytestmark = pytest.mark.parametrize("backend", [pytest.param("redis", marks=pytest.mark.skip), "memory"])',
        '',
        '',
        'def test_get(backend):',
        '    assert get({"k": backend}, "k") == backend',
      ),
    },
  ),
  fixture(
    'a1rm-pytestmark-list-parametrize-one-param-skipped',
    'run-wide skip',
    'The same, with the parametrize mark in a list.',
    {
      'tests/test_cache.py': lines(
        'import pytest',
        '',
        'from cachelib import get',
        '',
        'pytestmark = [pytest.mark.parametrize("backend", [pytest.param("redis", marks=pytest.mark.skip), "memory"])]',
        '',
        '',
        'def test_get(backend):',
        '    assert get({"k": backend}, "k") == backend',
      ),
    },
  ),
  fixture('a1rm-pytestmark-parametrize-ids-skip', 'run-wide skip', 'pytestmark parametrizes with ids that contain the word skip.', {
    'tests/test_cache.py': lines(
      'import pytest',
      '',
      'from cachelib import get',
      '',
      'pytestmark = pytest.mark.parametrize("mode", ["skip", "run"], ids=["skip", "run"])',
      '',
      '',
      'def test_get(mode):',
      '    assert get({"k": mode}, "k") == mode',
    ),
  }),
  fixture(
    'a1rm-pytestmark-skip-control',
    'run-wide skip',
    'Control: a module-level unconditional pytestmark skip.',
    {
      'tests/test_cache.py': lines(
        'import pytest',
        '',
        'from cachelib import get',
        '',
        'pytestmark = pytest.mark.skip(reason="disabled")',
        '',
        '',
        'def test_get():',
        '    assert get({"k": 1}, "k") == 1',
      ),
    },
    [['tests/test_cache.py', 'run-wide skip: pytestmark in tests/test_cache.py']],
  ),
  // ---- every test skipped -----------------------------------------------------------------
  fixture('a1rm-py-one-skipped-among-several', 'every test skipped', 'One skipped test among several live ones.', {
    'tests/test_cache.py': lines(
      'import pytest',
      '',
      'from cachelib import get, put',
      '',
      '',
      '@pytest.mark.skip(reason="flaky")',
      'def test_get_default():',
      '    assert get({}, "a", 1) == 1',
      '',
      '',
      'def test_put():',
      '    c = {}',
      '    put(c, "a", 2)',
      '    assert c["a"] == 2',
    ),
  }),
  fixture('a1rm-py-parametrize-ids-skip', 'every test skipped', 'Parametrized tests whose ids contain skip, one param skipped.', {
    'tests/test_cache.py': lines(
      'import pytest',
      '',
      'from cachelib import get',
      '',
      '',
      '@pytest.mark.parametrize("mode", [pytest.param("skip", marks=pytest.mark.skip), "run"], ids=["skip", "run"])',
      'def test_get(mode):',
      '    assert get({"k": mode}, "k") == mode',
    ),
  }),
  fixture(
    'a1rm-py-python-functions-config',
    'every test skipped',
    'Every test_ function is skipped, but python_functions also collects check_ functions, and one is live.',
    {
      'pyproject.toml': PYPROJECT(['python_functions = ["test_*", "check_*"]']),
      'tests/test_cache.py': `${SKIPPED_CACHE_TEST}\n\ndef check_get():\n    assert get({"k": 1}, "k") == 1\n`,
    },
  ),
  fixture(
    'a1rm-py-python-classes-config',
    'every test skipped',
    'python_classes collects a class not named Test*, and its live test method is unskipped.',
    {
      'pyproject.toml': PYPROJECT(['python_classes = ["*Checks"]']),
      'tests/test_cache.py': `${SKIPPED_CACHE_TEST}\n\nclass CacheChecks:\n    def test_get(self):\n        assert get({"k": 1}, "k") == 1\n`,
    },
  ),
  fixture(
    'a1rm-py-every-test-skipped-control',
    'every test skipped',
    'Control: every test in the file carries @pytest.mark.skip.',
    { 'tests/test_cache.py': SKIPPED_CACHE_TEST },
    [['tests/test_cache.py', 'every test skipped']],
  ),
  fixture(
    'a1rm-pytest-skipping-plugin-disabled',
    'every test skipped',
    "Every test is marked skip, but addopts disables pytest's skipping plugin, so the marks are not applied.",
    {
      'pyproject.toml': PYPROJECT(['addopts = "-p no:skipping"']),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
  ),
  fixture(
    'a1rm-js-describe-skip-beside-live-suite',
    'every test skipped',
    'A describe.skip nested beside a live describe in the same outer suite.',
    {
      'test/sum.test.js': lines(
        "import { describe, expect, it } from 'vitest';",
        "import { sum } from '../src/index.js';",
        '',
        "describe('sum', () => {",
        "  describe.skip('negatives', () => {",
        "    it('adds negatives', () => {",
        '      expect(sum(-1, -2)).toBe(-3);',
        '    });',
        '  });',
        '',
        "  describe('positives', () => {",
        "    it('adds', () => {",
        '      expect(sum(1, 2)).toBe(3);',
        '    });',
        '  });',
        '});',
      ),
    },
    [],
    JS_BASE,
  ),
  fixture(
    'a1rm-js-it-skip-beside-local-helper',
    'every test skipped',
    'An it.skip in a file that also registers a live test through a local helper calling it(.',
    {
      'test/sum.test.js': lines(
        "import { expect, it } from 'vitest';",
        "import { sum } from '../src/index.js';",
        '',
        'const adds = (a, b, total) => it(`adds ${a} and ${b}`, () => {',
        '  expect(sum(a, b)).toBe(total);',
        '});',
        '',
        "it.skip('adds negatives', () => {",
        '  expect(sum(-1, -2)).toBe(-3);',
        '});',
        '',
        'adds(1, 2, 3);',
      ),
    },
    [],
    JS_BASE,
  ),
  fixture(
    'a1rm-js-it-skip-beside-imported-helper',
    'every test skipped',
    'An it.skip in a file that also registers a live test through an imported helper.',
    {
      'test/helpers.js': lines(
        "import { expect, it } from 'vitest';",
        '',
        'export function itAdds(sum) {',
        "  it('adds', () => {",
        '    expect(sum(1, 2)).toBe(3);',
        '  });',
        '}',
      ),
      'test/sum.test.js': lines(
        "import { expect, it } from 'vitest';",
        "import { sum } from '../src/index.js';",
        "import { itAdds } from './helpers.js';",
        '',
        "it.skip('adds negatives', () => {",
        '  expect(sum(-1, -2)).toBe(-3);',
        '});',
        '',
        'itAdds(sum);',
      ),
    },
    [],
    JS_BASE,
  ),
  fixture(
    'a1rm-js-each-ids-skip',
    'every test skipped',
    'it.each with a case named skip, beside an it.skip.',
    {
      'test/sum.test.js': lines(
        "import { expect, it } from 'vitest';",
        "import { sum } from '../src/index.js';",
        '',
        "it.each([['skip', 1, 1, 2]])('%s', (_name, a, b, total) => {",
        '  expect(sum(a, b)).toBe(total);',
        '});',
        '',
        "it.skip('adds negatives', () => {",
        '  expect(sum(-1, -2)).toBe(-3);',
        '});',
      ),
    },
    [],
    JS_BASE,
  ),
  fixture(
    'a1rm-js-every-test-skipped-control',
    'every test skipped',
    'Control: the only suite in the file is a describe.skip.',
    {
      'test/sum.test.js': lines(
        "import { describe, expect, it } from 'vitest';",
        "import { sum } from '../src/index.js';",
        '',
        "describe.skip('sum', () => {",
        "  it('adds', () => {",
        '    expect(sum(1, 2)).toBe(3);',
        '  });',
        '});',
      ),
    },
    [],
    JS_BASE,
  ),
];

export function removalFixture(name: string): RemovalFixture {
  const found = REMOVAL_FIXTURES.find((entry) => entry.name === name);
  if (!found) throw new Error(`unknown v27 A1 removal fixture: ${name}`);
  return found;
}
