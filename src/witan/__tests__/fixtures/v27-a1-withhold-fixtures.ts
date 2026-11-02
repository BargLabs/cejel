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

/** A pyproject.toml with no pytest table, so pytest takes its settings from another file, or none. */
const PYPROJECT_WITHOUT_PYTEST = lines('[project]', 'name = "cachelib"', 'version = "1.0.0"', 'dependencies = []');

const SKIP_EVERY_ITEM_HOOK = conftestHook([
  '    for item in items:',
  '        item.add_marker(pytest.mark.skip(reason="disabled"))',
]);

// ---- review of #626 (goal_cejel_v27_a1_test_count_overmatch_v2_2026-11-02, fix pass) ----------
//
// Each `caught` fixture below is a shape the #626 head withheld on, so that v27 read the files as
// v17 does, while pytest 9.2.0 ran no test in it (or read no such setting). Each `withheld` fixture
// is a genuine control: pytest runs the tests, and v27 must keep withholding and say so.

const CLEAR_HOOK = conftestHook(['    items.clear()']);
const ROOT_HOOK_RULE = 'run-wide skip: hook in conftest.py';
const ROOT_HOOK_REMOVED: WithholdFixture['removed'] = [
  ['tests/test_cache.py', ROOT_HOOK_RULE],
  ['tests/test_lru.py', ROOT_HOOK_RULE],
];
const CI_PATH = '.github/workflows/ci.yml';

/** A GitHub Actions workflow whose test job's steps are given as raw YAML lines (indented for a step list). */
const rawCiWorkflow = (stepLines: readonly string[], jobLines: readonly string[] = []): string =>
  lines(
    'name: ci',
    'on:',
    '  push:',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    ...jobLines,
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pip install pytest',
    ...stepLines,
  );

const REVIEW_626_FIXTURES: readonly WithholdFixture[] = [
  // ---- item A: only a restore the reader understands withholds a clear ----------------------
  caught(
    'a1wh-r2-enumerate-items',
    'A',
    'The hook enumerates the items from 1 to print them, then clears them: enumerate(items, 1) restores nothing.',
    {
      'tests/conftest.py': conftestHook([
        '    for number, item in enumerate(items, 1):',
        '        print(number, item.nodeid)',
        '    items.clear()',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-print-items-to-stderr',
    'A',
    'The hook prints the items to stderr, then clears them: print(items, file=...) restores nothing.',
    {
      'tests/conftest.py': conftestHook(['    print(items, file=sys.stderr)', '    items.clear()'], ['import sys', '', 'import pytest']),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-zip-items',
    'A',
    'The hook pairs the items with numbers through zip, then clears them.',
    {
      'tests/conftest.py': conftestHook([
        '    for item, number in zip(items, range(3)):',
        '        print(number, item.nodeid)',
        '    items.clear()',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-log-items',
    'A',
    'The hook logs the items with a second argument, then clears them.',
    {
      'tests/conftest.py': conftestHook(
        ['    logger.warning(items, "deselected")', '    items.clear()'],
        ['import logging', '', 'import pytest', '', 'logger = logging.getLogger(__name__)'],
      ),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-sorted-items-with-key',
    'A',
    'The hook iterates over the items sorted with a key, then clears them.',
    {
      'tests/conftest.py': conftestHook([
        '    for item in sorted(items, key=str):',
        '        print(item.nodeid)',
        '    items.clear()',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-restore-in-uncalled-nested-def',
    'A',
    'The only extend sits in a nested function the hook never calls.',
    {
      'tests/conftest.py': conftestHook([
        '    saved = list(items)',
        '',
        '    def never_called():',
        '        items.extend(saved)',
        '',
        '    items.clear()',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-restore-in-uncalled-lambda',
    'A',
    'The only extend sits in a lambda the hook never calls.',
    {
      'tests/conftest.py': conftestHook([
        '    saved = list(items)',
        '    never_called = lambda: items.extend(saved)',
        '    items.clear()',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-restore-from-empty-name-extend',
    'A',
    'The hook extends the cleared list from a name bound only to an empty list.',
    { 'tests/conftest.py': conftestHook(['    saved = []', '    items.clear()', '    items.extend(saved)']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-restore-from-empty-name-slice',
    'A',
    'The hook assigns a name bound only to an empty list to the cleared list.',
    { 'tests/conftest.py': conftestHook(['    saved = []', '    items.clear()', '    items[:] = saved']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-add-before-clear',
    'A',
    'The hook adds to the list before it clears it, so the clear still leaves it empty.',
    {
      'tests/conftest.py': conftestHook(['    extra = list(items)', '    items.extend(extra)', '    items.clear()']),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-restore-then-clear-again',
    'A',
    'The hook puts the items back, then clears the list again.',
    {
      'tests/conftest.py': conftestHook([
        '    saved = list(items)',
        '    items.clear()',
        '    items.extend(saved)',
        '    items.clear()',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-alias-never-adds',
    'A',
    'The hook binds another name to the list but never adds through it.',
    { 'tests/conftest.py': conftestHook(['    seen = items', '    items.clear()']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-unknown-method',
    'A',
    'The hook calls a list method that adds nothing, by a name the reader does not know, then clears.',
    { 'tests/conftest.py': conftestHook(['    count = items.__len__()', '    items.clear()']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-imported-helper-call',
    'A',
    'After the clear the hook passes items to a helper defined in another module, which the reader cannot see.',
    {
      'tests/conftest.py': conftestHook(
        ['    saved = list(items)', '    items.clear()', '    refill(items, saved)'],
        ['import pytest', '', 'from helpers import refill'],
      ),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-same-file-helper-reads-only',
    'A',
    'After the clear the hook passes items to a helper in the same file that only reads its first parameter.',
    {
      'tests/conftest.py': conftestHook(
        ['    items.clear()', '    report(items, "after")'],
        ['import pytest', '', '', 'def report(collected, label):', '    print(label, len(collected))'],
      ),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-rebind-after-clear',
    'A',
    "The hook clears pytest's list, then rebinds the name: the clear already emptied the list pytest runs.",
    { 'tests/conftest.py': conftestHook(['    items.clear()', '    items = []']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-restore-from-items-itself',
    'A',
    'After the clear the hook assigns the sorted, now empty, list back to itself.',
    { 'tests/conftest.py': conftestHook(['    items.clear()', '    items[:] = sorted(items, key=str)']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-clear-with-empty-tuple',
    'A',
    'The hook empties the list by assigning an empty tuple to its whole slice.',
    { 'tests/conftest.py': conftestHook(['    items[:] = ()']) },
    HOOK_REMOVED,
  ),
  withheld(
    'a1wh-r2-restore-append-loop',
    'A',
    'Control: after the clear the hook appends each saved item back in a loop.',
    {
      'tests/conftest.py': conftestHook([
        '    saved = list(items)',
        '    items.clear()',
        '    for item in saved:',
        '        items.append(item)',
      ]),
    },
    [RESTORED],
  ),
  withheld(
    'a1wh-r2-restore-through-alias',
    'A',
    'Control: the hook puts the saved items back through another name bound to the list.',
    {
      'tests/conftest.py': conftestHook([
        '    collected = items',
        '    saved = list(items)',
        '    items.clear()',
        '    collected.extend(saved)',
      ]),
    },
    [RESTORED],
  ),
  withheld(
    'a1wh-r2-restore-nested-def-called',
    'A',
    'Control: the hook defines a nested function that extends the list, and calls it after the clear.',
    {
      'tests/conftest.py': conftestHook([
        '    saved = list(items)',
        '',
        '    def put_back():',
        '        items.extend(saved)',
        '',
        '    items.clear()',
        '    put_back()',
      ]),
    },
    [RESTORED],
  ),
  withheld(
    'a1wh-r2-restore-dunder-iadd',
    'A',
    'Control: the hook puts the saved items back with __iadd__.',
    {
      'tests/conftest.py': conftestHook(['    saved = list(items)', '    items.clear()', '    items.__iadd__(saved)']),
    },
    [RESTORED],
  ),
  withheld(
    'a1wh-r2-restore-extend-multiline',
    'A',
    'Control: the extend that puts the items back spans three lines.',
    {
      'tests/conftest.py': conftestHook(['    saved = list(items)', '    items.clear()', '    items.extend(', '        saved', '    )']),
    },
    [RESTORED],
  ),
  // ---- item B: a pytest command starts the command, and its settings reach the file ---------
  caught(
    'a1wh-r2-ci-echo-unquoted',
    'B',
    'A CI step echoes an unquoted pytest command; echo runs, pytest does not.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest', 'echo pytest --noconftest is not used here']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-makefile-echo',
    'B',
    'A Makefile help target echoes a pytest command line.',
    { 'tests/conftest.py': CLEAR_HOOK, Makefile: 'help:\n\t@echo run pytest --noconftest to skip fixtures\n' },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-ci-heredoc',
    'B',
    'A CI step writes a pytest command line into a file through a heredoc; it is text, not a command.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: rawCiWorkflow([
        '      - run: pytest',
        '      - run: |',
        '          cat > notes.txt <<EOF',
        '          never run pytest --noconftest',
        '          EOF',
      ]),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-pytest-ini-shadows-pyproject',
    'B',
    "pytest.ini sits beside pyproject.toml, so pytest reads pytest.ini and ignores pyproject's --noconftest.",
    {
      'pytest.ini': lines('[pytest]', 'testpaths = tests'),
      'pyproject.toml': PYPROJECT(['addopts = "--noconftest"']),
      'tests/conftest.py': CLEAR_HOOK,
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-pyproject-shadows-tox-ini',
    'B',
    "pyproject.toml's pytest table comes before tox.ini, so pytest ignores tox.ini's -p no:skipping.",
    {
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[pytest]', 'addopts = -p no:skipping'),
      'tests/test_cache.py': SKIPPED_CACHE_TEST,
    },
    SKIPPED_REMOVED,
  ),
  caught(
    'a1wh-r2-pyproject-shadows-setup-cfg',
    'B',
    "pyproject.toml's pytest table comes before setup.cfg, so pytest ignores setup.cfg's python_functions.",
    {
      'setup.cfg': lines('[tool:pytest]', 'python_functions = test_* check_*'),
      'tests/test_cache.py': SKIPPED_WITH_LIVE_CHECK,
    },
    SKIPPED_REMOVED,
  ),
  caught(
    'a1wh-r2-config-in-unrelated-subtree',
    'B',
    'A pytest.ini under docs/examples sets --noconftest; pytest run from the root never reads it.',
    { 'docs/examples/pytest.ini': lines('[pytest]', 'addopts = --noconftest'), 'tests/conftest.py': CLEAR_HOOK },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-rootdir-dot',
    'B',
    "The CI step passes --rootdir=., the repository's root, so the hook is loaded as without it.",
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --rootdir=.']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-confcutdir-at-hook',
    'B',
    'The CI step passes --confcutdir=tests, the directory the hook lives in, which pytest still loads.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --confcutdir=tests']) },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-confcutdir-root',
    'B',
    'The CI step passes --confcutdir=., and the hook lives in the root conftest.py, which pytest still loads.',
    { 'tests/conftest.py': null, 'conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --confcutdir=.']) },
    ROOT_HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-noconftest-on-other-path',
    'B',
    'The CI step runs pytest --noconftest on docs/ only; the tests under the hook run without it.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'docs/conf.py': 'project = "cachelib"\n',
      [CI_PATH]: ciWorkflow(['pytest', 'pytest --noconftest docs/']),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-if-false-job',
    'B',
    'A job that is never run (if: false) runs pytest --noconftest.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      [CI_PATH]: lines(
        'name: ci',
        'on:',
        '  push:',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: pytest',
        '  legacy:',
        '    if: false',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: pytest --noconftest',
      ),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-unreached-make-target',
    'B',
    'A Makefile target nothing reaches runs pytest --noconftest; the default and CI targets run plain pytest.',
    { 'tests/conftest.py': CLEAR_HOOK, Makefile: 'test:\n\tpytest\n\nlegacy:\n\tpytest --noconftest\n' },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-tox-description',
    'B',
    "A tox description mentions a pytest command line; tox runs only an environment's commands.",
    {
      'tests/conftest.py': CLEAR_HOOK,
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[testenv]', 'description = run pytest --noconftest style checks', 'commands = pytest'),
    },
    HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-tox-unlisted-env',
    'B',
    'A tox environment that is not in envlist, and that nothing runs, passes --noconftest.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[testenv]', 'commands = pytest', '', '[testenv:legacy]', 'commands = pytest --noconftest'),
    },
    HOOK_REMOVED,
  ),
  withheld(
    'a1wh-r2-uv-run-noconftest',
    'B',
    'Control: the CI step runs pytest through uv run with --noconftest.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['uv run --with pytest pytest --noconftest']) },
    ['run-wide skip rule not applied: --noconftest on a pytest command line in .github/workflows/ci.yml'],
  ),
  withheld(
    'a1wh-r2-poetry-run-python-m-no-skipping',
    'B',
    'Control: the CI step runs python -m pytest through poetry run with -p no:skipping.',
    { 'tests/test_cache.py': SKIPPED_CACHE_TEST, [CI_PATH]: ciWorkflow(['poetry run python -m pytest -p no:skipping']) },
    ['every-test-skipped rule not applied: -p no:skipping on a pytest command line in .github/workflows/ci.yml'],
  ),
  withheld(
    'a1wh-r2-env-prefix-pytest-addopts',
    'B',
    'Control: the CI step sets PYTEST_ADDOPTS for its pytest command alone.',
    { 'tests/conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['PYTEST_ADDOPTS="--noconftest" pytest']) },
    ['run-wide skip rule not applied: --noconftest in PYTEST_ADDOPTS in .github/workflows/ci.yml'],
  ),
  withheld(
    'a1wh-r2-confcutdir-below-root-hook',
    'B',
    'Control: the hook lives in the root conftest.py and the CI step passes --confcutdir=tests, above which pytest loads no conftest.py.',
    { 'tests/conftest.py': null, 'conftest.py': CLEAR_HOOK, [CI_PATH]: ciWorkflow(['pytest --confcutdir=tests']) },
    ['run-wide skip rule not applied: --confcutdir on a pytest command line in .github/workflows/ci.yml'],
  ),
  withheld(
    'a1wh-r2-tox-commands-noconftest',
    'B',
    "Control: tox's [testenv] commands run pytest --noconftest.",
    {
      'tests/conftest.py': CLEAR_HOOK,
      'tox.ini': lines('[tox]', 'envlist = py312', '', '[testenv]', 'deps = pytest', 'commands = pytest --noconftest'),
    },
    ['run-wide skip rule not applied: --noconftest on a pytest command line in tox.ini'],
  ),
  withheld(
    'a1wh-r2-tox-listed-env',
    'B',
    'Control: a tox environment named in envlist runs pytest --noconftest.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      'tox.ini': lines('[tox]', 'envlist = py312, unit', '', '[testenv]', 'commands = pytest', '', '[testenv:unit]', 'commands = pytest --noconftest'),
    },
    ['run-wide skip rule not applied: --noconftest on a pytest command line in tox.ini'],
  ),
  withheld(
    'a1wh-r2-make-target-reached-from-ci',
    'B',
    'Control: CI runs make legacy, whose recipe runs pytest --noconftest.',
    {
      'tests/conftest.py': CLEAR_HOOK,
      Makefile: 'test:\n\tpytest\n\nlegacy:\n\tpytest --noconftest\n',
      [CI_PATH]: ciWorkflow(['make legacy']),
    },
    ['run-wide skip rule not applied: --noconftest on a pytest command line in Makefile'],
  ),
  // ---- item D: a subdirectory's configuration counts only where pytest is run there ----------
  caught(
    'a1wh-r2-empty-subdir-pytest-ini-root-run',
    'D',
    'An empty tests/pytest.ini beside the tests, but CI runs pytest from the root, which loads the root conftest.py.',
    { 'tests/conftest.py': null, 'conftest.py': CLEAR_HOOK, 'tests/pytest.ini': '' },
    ROOT_HOOK_REMOVED,
  ),
  caught(
    'a1wh-r2-subdir-pyproject-root-run',
    'D',
    'tests/pyproject.toml exists and the root has no pytest table, but CI runs plain pytest from the root.',
    {
      'pyproject.toml': PYPROJECT_WITHOUT_PYTEST,
      'tests/conftest.py': null,
      'conftest.py': CLEAR_HOOK,
      'tests/pyproject.toml': lines('[project]', 'name = "cachelib-tests"'),
    },
    ROOT_HOOK_REMOVED,
  ),
  withheld(
    'a1wh-r2-working-directory-subdir-ini',
    'D',
    "Control: the CI step runs pytest with working-directory pkg, and pkg/pytest.ini makes pkg pytest's configuration directory.",
    {
      'conftest.py': SKIP_EVERY_ITEM_HOOK,
      'pkg/pytest.ini': lines('[pytest]', 'testpaths = tests'),
      'pkg/tests/test_pkg.py': LIVE_PY_TEST('pkg'),
      'tests/test_cache.py': null,
      'tests/test_lru.py': null,
      [CI_PATH]: rawCiWorkflow(['      - run: pytest', '        working-directory: pkg']),
    },
    [
      "run-wide skip rule not applied: pkg/pytest.ini is pytest's configuration for the pytest command line in .github/workflows/ci.yml, so it does not load conftest.py",
    ],
  ),
  withheld(
    'a1wh-r2-pytest-arg-subdir-pyproject',
    'D',
    "Control: CI runs pytest tests, and tests/pyproject.toml (no root pytest table) makes tests pytest's configuration directory.",
    {
      'pyproject.toml': PYPROJECT_WITHOUT_PYTEST,
      'tests/conftest.py': null,
      'conftest.py': CLEAR_HOOK,
      'tests/pyproject.toml': lines('[project]', 'name = "cachelib-tests"'),
      [CI_PATH]: ciWorkflow(['pytest tests']),
    },
    [
      "run-wide skip rule not applied: tests/pyproject.toml is pytest's configuration for the pytest command line in .github/workflows/ci.yml, so it does not load conftest.py",
    ],
  ),
  withheld(
    'a1wh-r2-rootdir-flag-without-config',
    'D',
    "Control: no configuration file at all, and CI passes --rootdir=tests, so pytest's root is tests and it does not load the root conftest.py.",
    {
      'pyproject.toml': null,
      'setup.py': 'from setuptools import setup\n\nsetup(name="cachelib")\n',
      'tests/conftest.py': null,
      'conftest.py': CLEAR_HOOK,
      [CI_PATH]: ciWorkflow(['pytest --rootdir=tests']),
    },
    ['run-wide skip rule not applied: --rootdir on a pytest command line in .github/workflows/ci.yml'],
  ),
];

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
    "setup.cfg's [tool:pytest] makes python_functions also collect check_ functions; one is live. (Review of #626: pyproject.toml has no pytest table here, so setup.cfg is the file pytest reads; with one, pytest 9.2.0 ignores setup.cfg, see a1wh-r2-pyproject-shadows-setup-cfg.)",
    {
      'pyproject.toml': PYPROJECT_WITHOUT_PYTEST,
      'setup.cfg': lines('[tool:pytest]', 'python_functions = test_* check_*'),
      'tests/test_cache.py': SKIPPED_WITH_LIVE_CHECK,
    },
    ['every-test-skipped rule not applied: python_functions set in setup.cfg'],
  ),
  withheld(
    'a1wh-tox-ini-no-skipping',
    'B',
    "tox.ini's [pytest] passes -p no:skipping in addopts. (Review of #626: pyproject.toml has no pytest table here, so tox.ini is the file pytest reads; with one, pytest 9.2.0 ignores tox.ini, see a1wh-r2-pyproject-shadows-tox-ini.)",
    {
      'pyproject.toml': PYPROJECT_WITHOUT_PYTEST,
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
    [
      "run-wide skip rule not applied: pkg/pytest.ini is pytest's configuration for the pytest command line in .github/workflows/ci.yml, so it does not load conftest.py",
    ],
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
  ...REVIEW_626_FIXTURES,
];

export function withholdFixture(name: string): WithholdFixture {
  const found = WITHHOLD_FIXTURES.find((entry) => entry.name === name);
  if (!found) throw new Error(`unknown v27 A1 withhold fixture: ${name}`);
  return found;
}
