import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';
import {
  LIVE_PY_TEST,
  PYPROJECT,
  PY_BASE,
  SKIPPED_CACHE_TEST,
  conftestHook,
  lines,
} from './v27-a1-removal-fixtures.js';

// v27 A1 WITHHOLD FIXTURES (goal_cejel_v27_a1_test_count_overmatch_v2_2026-11-02).
//
// Under witan-rubric-v27-prospective-2026-10-19 a removal rule (conftest, run-wide skip, every test
// skipped) is withheld where pytest would not do what the rule assumes, and the file is then read
// as v17 reads it. Each fixture here is a synthetic shape, written from scratch, of one of:
//   - item A: a collection hook that empties `items`. It is withheld only where the same hook
//     demonstrably puts the collected items back; copying, reporting or iterating over them does not;
//   - item B: a pytest setting. It withholds only where it is in force (an active key in a section
//     pytest reads, or a flag on a pytest command line), and a value that leaves pytest's default
//     reading does not withhold;
//   - item D: pytest would not load the conftest.py, or would collect conftest.py, for a reason
//     Cejel did not read before.
// `removed` lists the files v27 must still rate hollow, with their rule (the setting or use does
// not withhold). `withheld` lists the clauses A1's note must hold where a rule was withheld (item
// C), and v27 must then read every file as v17 does.

export interface WithholdFixture extends FalseAssuranceFixture {
  readonly item: 'A' | 'B' | 'D';
  readonly removed: readonly (readonly [path: string, rule: string])[];
  readonly withheld: readonly string[];
}

const caught = (
  name: string,
  item: WithholdFixture['item'],
  purpose: string,
  files: Readonly<Record<string, string | null>>,
  removed: WithholdFixture['removed'],
): WithholdFixture => ({ name, issue: '#518', item, purpose, commits: [{ ...PY_BASE, ...files }], removed, withheld: [] });

const withheld = (
  name: string,
  item: WithholdFixture['item'],
  purpose: string,
  files: Readonly<Record<string, string | null>>,
  clauses: readonly string[],
): WithholdFixture => ({ name, issue: '#518', item, purpose, commits: [{ ...PY_BASE, ...files }], removed: [], withheld: clauses });

const HOOK_RULE = 'run-wide skip: hook in tests/conftest.py';
const HOOK_REMOVED: WithholdFixture['removed'] = [
  ['tests/test_cache.py', HOOK_RULE],
  ['tests/test_lru.py', HOOK_RULE],
];
const SKIPPED_REMOVED: WithholdFixture['removed'] = [['tests/test_cache.py', 'every test skipped']];
const RESTORED = 'run-wide skip rule not applied: the hook in tests/conftest.py puts the collected items back';

/** A GitHub Actions workflow running `steps` (each a `run:` value) after a checkout, with optional job env lines. */
const ciWorkflow = (steps: readonly string[], env: readonly string[] = []): string =>
  lines(
    'name: ci',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    ...(env.length > 0 ? ['    env:', ...env.map((entry) => `      ${entry}`)] : []),
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pip install pytest',
    ...steps.map((step) => `      - run: ${step}`),
  );

/** Every test_ function is skipped; a live check_ function runs only where python_functions collects it. */
const SKIPPED_WITH_LIVE_CHECK = `${SKIPPED_CACHE_TEST}\n\ndef check_get():\n    assert get({"k": 1}, "k") == 1\n`;

/** A conftest.py that also defines a test function, which pytest collects only where python_files names it. */
const CONFTEST_WITH_TEST = lines(
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
);

const ASSERTING_CONFTEST = lines(
  'import pytest',
  '',
  '',
  '@pytest.fixture',
  'def cache():',
  '    made = {}',
  '    assert made == {}',
  '    return made',
);

const SKIP_EVERY_ITEM_HOOK = conftestHook([
  '    for item in items:',
  '        item.add_marker(pytest.mark.skip(reason="disabled"))',
]);

export const WITHHOLD_FIXTURES: readonly WithholdFixture[] = [
  // ---- item A: a clear is withheld only on a restore -----------------------------------------
  caught(
    'a1wh-hook-deselect-all-idiom',
    'A',
    'The common deselect-everything hook: copy the items, clear them, report the copy as deselected.',
    {
      'tests/conftest.py': conftestHook([
        '    dropped = list(items)',
        '    items.clear()',
        '    config.hook.pytest_deselected(items=dropped)',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-hook-copy-slice',
    'A',
    'The hook copies items with a full slice, then clears them, and never puts the copy back.',
    { 'tests/conftest.py': conftestHook(['    saved = items[:]', '    items.clear()']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-hook-copy-method',
    'A',
    'The hook copies items with .copy(), then clears them.',
    { 'tests/conftest.py': conftestHook(['    saved = items.copy()', '    items.clear()']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-hook-copy-tuple',
    'A',
    'The hook copies items into a tuple, then deletes every element.',
    { 'tests/conftest.py': conftestHook(['    saved = tuple(items)', '    del items[:]']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-hook-report-deselected-copy',
    'A',
    'The hook reports a copy of the items as deselected, then empties the list with a slice assignment.',
    {
      'tests/conftest.py': conftestHook([
        '    config.hook.pytest_deselected(items=list(items))',
        '    items[:] = []',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-hook-log-length-after-clear',
    'A',
    'The hook clears the items and then logs how many are left.',
    {
      'tests/conftest.py': conftestHook(
        ['    items.clear()', '    logger.warning("collected %d tests", len(items))'],
        ['import logging', '', 'import pytest', '', 'logger = logging.getLogger(__name__)'],
      ),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-hook-noop-call',
    'A',
    'The hook clears the items and then passes the list alone to a helper that does nothing with it.',
    {
      'tests/conftest.py': conftestHook(
        ['    items.clear()', '    noop(items)'],
        ['import pytest', '', '', 'def noop(collected):', '    return None'],
      ),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-hook-iterate-then-clear',
    'A',
    'The hook iterates over the items to print them, then clears them.',
    {
      'tests/conftest.py': conftestHook([
        '    for item in items:',
        '        print(item.nodeid)',
        '    items.clear()',
      ]),
    },
    HOOK_REMOVED,
  ),
  withheld(
    'a1wh-hook-restore-extend',
    'A',
    'The hook saves the items, clears them and extends the list with the saved copy.',
    {
      'tests/conftest.py': conftestHook(['    saved = list(items)', '    items.clear()', '    items.extend(saved)']),
    },
    [RESTORED],
  ),
  withheld(
    'a1wh-hook-restore-iadd',
    'A',
    'The hook saves the items, clears them and adds the saved copy back with +=.',
    {
      'tests/conftest.py': conftestHook(['    saved = list(items)', '    items.clear()', '    items += saved']),
    },
    [RESTORED],
  ),
  withheld(
    'a1wh-hook-restore-slice-assign',
    'A',
    'The hook saves the items, clears them and assigns the saved copy back to the whole slice.',
    {
      'tests/conftest.py': conftestHook(['    saved = list(items)', '    items.clear()', '    items[:] = saved']),
    },
    [RESTORED],
  ),
  withheld(
    'a1wh-hook-rebind-then-clear',
    'A',
    "The hook rebinds the name items to a copy, so its clear empties the copy and not pytest's list.",
    { 'tests/conftest.py': conftestHook(['    items = list(items)', '    items.clear()']) },
    ["run-wide skip rule not applied: the hook in tests/conftest.py rebinds items, so its clear may not empty pytest's list"],
  ),
  // ---- item B: a setting withholds only when it is in force --------------------------------
  caught(
    'a1wh-setup-cfg-comment-no-skipping',
    'B',
    'setup.cfg holds -p no:skipping only in a comment, in a section pytest does not read.',
    {
      'setup.cfg': lines('[metadata]', 'name = cachelib', '# addopts = -p no:skipping'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    SKIPPED_REMOVED,
  ),
  caught(
    'a1wh-docs-workflow-echo-no-skipping',
    'B',
    'A docs workflow prints -p no:skipping inside an echo string; no pytest command runs with it.',
    {
      '.github/workflows/docs.yml': ciWorkflow(['echo "see pytest -p no:skipping docs"']),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    SKIPPED_REMOVED,
  ),
  caught(
    'a1wh-ci-comment-python-classes',
    'B',
    'The CI pytest line names python_classes only in a shell comment.',
    {
      '.github/workflows/ci.yml': ciWorkflow(['pytest  # python_classes left default']),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    SKIPPED_REMOVED,
  ),
  caught(
    'a1wh-pyproject-default-python-functions',
    'B',
    'pyproject sets python_functions to test_*, which collects no name the reader does not see.',
    {
      'pyproject.toml': PYPROJECT(['python_functions = "test_*"']),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    SKIPPED_REMOVED,
  ),
  caught(
    'a1wh-setup-cfg-default-python-classes',
    'B',
    "setup.cfg's [tool:pytest] sets python_classes to pytest's own default, Test.",
    {
      'setup.cfg': lines('[tool:pytest]', 'python_classes = Test'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    SKIPPED_REMOVED,
  ),
  caught(
    'a1wh-tox-default-python-files',
    'B',
    "tox.ini's [pytest] sets python_files to a default pattern, which never collects conftest.py.",
    {
      'tox.ini': lines('[pytest]', 'python_files = test_*.py'),
      'tests/conftest.py': ASSERTING_CONFTEST,
    },
    [['tests/conftest.py', 'conftest']],
  ),
  caught(
    'a1wh-setup-cfg-key-outside-section',
    'B',
    'setup.cfg holds python_functions in a section pytest does not read.',
    {
      'setup.cfg': lines('[coverage:run]', 'branch = true', 'python_functions = check_*'),
      'tests/test_cache.py': SKIPPED_WITH_LIVE_CHECK,
    },
    SKIPPED_REMOVED,
  ),
  withheld(
    'a1wh-pytest-ini-python-files',
    'B',
    "pytest.ini's [pytest] sets python_files to a list naming conftest.py, so pytest collects its test.",
    {
      'pytest.ini': lines('[pytest]', 'python_files = test_*.py conftest.py'),
      'tests/unit/conftest.py': CONFTEST_WITH_TEST,
      'tests/unit/test_unit.py': LIVE_PY_TEST('unit'),
    },
    ['conftest rule not applied: python_files set in pytest.ini'],
  ),
  withheld(
    'a1wh-dot-pytest-ini-no-skipping',
    'B',
    ".pytest.ini's [pytest] passes -p no:skipping in addopts.",
    {
      '.pytest.ini': lines('[pytest]', 'addopts = -p no:skipping'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    ['every-test-skipped rule not applied: -p no:skipping set in .pytest.ini'],
  ),
  withheld(
    'a1wh-setup-cfg-python-functions',
    'B',
    "setup.cfg's [tool:pytest] makes python_functions also collect check_ functions; one is live.",
    {
      'setup.cfg': lines('[tool:pytest]', 'python_functions = test_* check_*'),
      'tests/test_cache.py': SKIPPED_WITH_LIVE_CHECK,
    },
    ['every-test-skipped rule not applied: python_functions set in setup.cfg'],
  ),
  withheld(
    'a1wh-tox-ini-no-skipping',
    'B',
    "tox.ini's [pytest] passes -p no:skipping in addopts.",
    {
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[pytest]', 'addopts = -p no:skipping'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    ['every-test-skipped rule not applied: -p no:skipping set in tox.ini'],
  ),
  withheld(
    'a1wh-pyproject-native-tool-pytest',
    'B',
    "pyproject's native [tool.pytest] table (pytest 9) makes python_functions also collect check_ functions.",
    {
      'pyproject.toml': lines(
        '[project]',
        'name = "cachelib"',
        'version = "1.0.0"',
        '',
        '[tool.pytest]',
        'python_functions = ["test_*", "check_*"]',
      ),
      'tests/test_cache.py': SKIPPED_WITH_LIVE_CHECK,
    },
    ['every-test-skipped rule not applied: python_functions set in pyproject.toml'],
  ),
  withheld(
    'a1wh-ci-run-no-skipping',
    'B',
    'The CI step runs pytest with -p no:skipping.',
    {
      '.github/workflows/ci.yml': ciWorkflow(['pytest -p no:skipping']),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    ['every-test-skipped rule not applied: -p no:skipping on a pytest command line in .github/workflows/ci.yml'],
  ),
  withheld(
    'a1wh-ci-run-override-python-functions',
    'B',
    'The CI step overrides python_functions with -o so that check_ functions are collected too.',
    {
      '.github/workflows/ci.yml': ciWorkflow(['python -m pytest -o "python_functions=test_* check_*"']),
      'tests/test_cache.py': SKIPPED_WITH_LIVE_CHECK,
    },
    ['every-test-skipped rule not applied: python_functions on a pytest command line in .github/workflows/ci.yml'],
  ),
  withheld(
    'a1wh-makefile-no-skipping',
    'B',
    'A Makefile recipe runs pytest with -p no:skipping.',
    {
      Makefile: 'test:\n\tpytest -p no:skipping tests\n',
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    ['every-test-skipped rule not applied: -p no:skipping on a pytest command line in Makefile'],
  ),
  withheld(
    'a1wh-ci-env-pytest-addopts',
    'B',
    'The CI job sets PYTEST_ADDOPTS to -p no:skipping.',
    {
      '.github/workflows/ci.yml': ciWorkflow(['pytest'], ['PYTEST_ADDOPTS: "-p no:skipping"']),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    ['every-test-skipped rule not applied: -p no:skipping in PYTEST_ADDOPTS in .github/workflows/ci.yml'],
  ),
  // ---- item D: the older wrong flags ---------------------------------------------------------
  withheld(
    'a1wh-noconftest-addopts',
    'D',
    'addopts passes --noconftest, so pytest never loads the conftest.py whose hook skips every item.',
    {
      'pyproject.toml': PYPROJECT(['addopts = "--noconftest"']),
      'tests/conftest.py': SKIP_EVERY_ITEM_HOOK,
    },
    ['run-wide skip rule not applied: --noconftest set in pyproject.toml'],
  ),
  withheld(
    'a1wh-root-conftest-not-loaded',
    'D',
    "A repository-root conftest.py skips every item, but pkg/pytest.ini makes pkg pytest's root, above which it loads no conftest.py, and CI runs pytest from pkg.",
    {
      'conftest.py': SKIP_EVERY_ITEM_HOOK,
      'pkg/pytest.ini': lines('[pytest]', 'testpaths = tests'),
      'pkg/tests/test_pkg.py': LIVE_PY_TEST('pkg'),
      'tests/test_cache.py': null,
      'tests/test_lru.py': null,
      '.github/workflows/ci.yml': ciWorkflow(['cd pkg && pytest']),
    },
    ["run-wide skip rule not applied: pkg/pytest.ini can make pytest's root pkg, where it does not load conftest.py"],
  ),
  caught(
    'a1wh-root-conftest-loaded-control',
    'D',
    "Control: the same without pkg/pytest.ini; pytest's root is the repository's, so the root conftest.py is loaded.",
    {
      'conftest.py': SKIP_EVERY_ITEM_HOOK,
      'pkg/tests/test_pkg.py': LIVE_PY_TEST('pkg'),
      'tests/test_cache.py': null,
      'tests/test_lru.py': null,
      '.github/workflows/ci.yml': ciWorkflow(['cd pkg && pytest']),
    },
    [['pkg/tests/test_pkg.py', 'run-wide skip: hook in conftest.py']],
  ),
  withheld(
    'a1wh-makefile-python-files',
    'D',
    'A Makefile recipe passes -o python_files naming conftest.py, so pytest collects its test.',
    {
      Makefile: 'test:\n\tpytest -o "python_files=test_*.py conftest.py" tests\n',
      'tests/unit/conftest.py': CONFTEST_WITH_TEST,
      'tests/unit/test_unit.py': LIVE_PY_TEST('unit'),
    },
    ['conftest rule not applied: python_files on a pytest command line in Makefile'],
  ),
];

export function withholdFixture(name: string): WithholdFixture {
  const found = WITHHOLD_FIXTURES.find((entry) => entry.name === name);
  if (!found) throw new Error(`unknown v27 A1 withhold fixture: ${name}`);
  return found;
}
