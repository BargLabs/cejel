import type { HookOutcomeFixture } from './v27-a1-hook-outcome-fixtures.js';
import { LIVE_PY_TEST, PY_BASE, conftestHook, lines } from './v27-a1-removal-fixtures.js';

// v27 A1 ALLOWLIST FIXTURES (goal_cejel_v27_a1_restore_proof_v2_2026-11-02, superseding #638).
//
// Outcome 2 ("puts the collected items back") is an allowlist over the whole hook body: a hook
// reaches it only when every statement in its body is a recognised shape (a copy binding, an
// emptying, a restore after the emptying, a call of a strictly read same-file helper, a report or
// a docstring). Any other statement sends the hook to outcome 3 (named, not read) unless the body
// is provably outcome 1 (deselects everything). Each fixture is a synthetic shape written from
// scratch; `item` is the card's item (A the allowlist blockers, B the tokenised body, C the false
// hollow ratings, D the silent passes, E the nested conftest scope).
//
// pytest was not run on these fixtures: Python packages could not be run in this session, so each
// fixture's claim rests on reading pytest's collection and hook-calling code, as the purpose says.

export interface AllowlistFixture extends Omit<HookOutcomeFixture, 'item' | 'clause'> {
  readonly item: 'A' | 'B' | 'C' | 'D' | 'E';
  /** For 'restores' and 'not read': the clause A1's note must hold, or a pattern it must match. */
  readonly clause?: string | RegExp;
  /** For 'deselects': a withheld clause the note must also hold (another hook's, or a run's). */
  readonly alsoSaid?: string;
}

const HOOK_RULE = 'run-wide skip: hook in tests/conftest.py';
const HOOK_REMOVED = [
  ['tests/test_cache.py', HOOK_RULE],
  ['tests/test_lru.py', HOOK_RULE],
] as const;
const RESTORED = 'run-wide skip rule not applied: the hook in tests/conftest.py puts the collected items back';
const notRead = (reason: string) => `hook not read: \`${reason}\` in tests/conftest.py`;
/** Not read, for a reason this fixture does not pin: what matters is that the hook is named, not credited. */
const ANY_NOT_READ = /hook not read: `[^`]+` in tests\/conftest\.py/i;

const fixture = (
  name: string,
  item: AllowlistFixture['item'],
  purpose: string,
  files: Readonly<Record<string, string | null>>,
  expected: Pick<AllowlistFixture, 'outcome' | 'removed' | 'clause' | 'alsoSaid'>,
): AllowlistFixture => ({ name, issue: '#518', item, purpose, commits: [{ ...PY_BASE, ...files }], ...expected });

const deselects = { outcome: 'deselects', removed: HOOK_REMOVED } as const;
const restores = { outcome: 'restores', clause: RESTORED } as const;
const unread = (reason: string | RegExp) => ({ outcome: 'not read', clause: typeof reason === 'string' ? notRead(reason) : reason }) as const;

const hook = (body: readonly string[], preamble?: readonly string[]) => ({ 'tests/conftest.py': conftestHook(body, preamble) });
/** R: save a full copy, clear, extend from it. pytest runs every collected test. */
const R = ['    saved = list(items)', '    items.clear()', '    items.extend(saved)'] as const;
const REFILL = ['def refill(lst, src):', '    lst.extend(src)'] as const;
const withSession = (...body: string[]) => ({
  'tests/conftest.py': lines('import pytest', '', '', 'def pytest_collection_modifyitems(session, config, items):', ...body),
});

export const ALLOWLIST_FIXTURES: readonly AllowlistFixture[] = [
  // ---- item A: outcome 2 only for a body of recognised statements (blockers 1 to 9) --------
  fixture(
    'a1al-a1-slice-from-zero-after-restore',
    'A',
    'Blocker 1: R, then items[0:] = [], which empties the list again; pytest runs no test.',
    hook([...R, '    items[0:] = []']),
    unread('items[0:] = []'),
  ),
  fixture(
    'a1al-a1-step-slice-after-restore',
    'A',
    'Blocker 1: R, then items[::1] = (), an extended slice over every item; pytest runs no test.',
    hook([...R, '    items[::1] = ()']),
    unread('items[::1] = ()'),
  ),
  fixture(
    'a1al-a1-slice-from-one-after-restore',
    'A',
    'Blocker 1: R, then items[1:] = [], which keeps one item; pytest runs one test of three, so not every item is put back.',
    hook([...R, '    items[1:] = []']),
    unread('items[1:] = []'),
  ),
  fixture(
    'a1al-a3-sorted-copy',
    'A',
    'Blocker 3: the copy is sorted(items); pytest items do not support <, so pytest stops with INTERNALERROR TypeError. sorted is not a copy.',
    hook(['    saved = sorted(items)', '    items.clear()', '    items.extend(saved)']),
    unread('saved = sorted(items)'),
  ),
  fixture(
    'a1al-a3-sorted-raising-key',
    'A',
    'Blocker 3: the copy is sorted with a key that raises, so the hook stops before its clear and pytest reports INTERNALERROR.',
    hook(
      ['    saved = sorted(items, key=boom)', '    items.clear()', '    items.extend(saved)'],
      ['import pytest', '', '', 'def boom(item):', '    raise RuntimeError("no order")'],
    ),
    unread('saved = sorted(items, key=boom)'),
  ),
  fixture(
    'a1al-a4-list-holding-items',
    'A',
    'Blocker 4: keep = [items] holds pytest\'s list, and keep[0][:] = [] empties it after the restore.',
    hook(['    keep = [items]', ...R, '    keep[0][:] = []']),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a4-tuple-unpacked-alias',
    'A',
    'Blocker 4: a, b = items, 1 binds a to pytest\'s list, and del a[:] empties it after the restore.',
    hook(['    a, b = items, 1', ...R, '    del a[:]']),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a5-nested-async-restore',
    'A',
    'Blocker 5: the restore sits in a nested async def; calling it makes a coroutine nobody awaits, so the list stays empty.',
    hook(['    saved = list(items)', '', '    async def put_back():', '        items.extend(saved)', '', '    items.clear()', '    put_back()']),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a5-module-async-helper',
    'A',
    'Blocker 5: the same-file helper is an async def; the call returns a coroutine that never runs, so the list stays empty.',
    hook(['    saved = list(items)', '    items.clear()', '    refill(items, saved)'], ['import pytest', '', '', 'async def refill(lst, src):', '    lst.extend(src)']),
    unread('refill(items, saved)'),
  ),
  fixture(
    'a1al-a6-decorated-nested-restore',
    'A',
    'Blocker 6: the nested restore closure is decorated by a module function that returns a no-op, so the call restores nothing.',
    hook(
      ['    saved = list(items)', '', '    @noop', '    def put_back():', '        items.extend(saved)', '', '    items.clear()', '    put_back()'],
      ['import pytest', '', '', 'def noop(fn):', '    return lambda: None'],
    ),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a7-helper-redefined-under-if',
    'A',
    'Blocker 7: the helper is defined again inside `if True:`, as one that does nothing, so the list stays empty.',
    hook(
      ['    saved = list(items)', '    items.clear()', '    refill(items, saved)'],
      ['import pytest', '', '', ...REFILL, '', '', 'if True:', '    def refill(lst, src):', '        pass'],
    ),
    unread('refill(items, saved)'),
  ),
  fixture(
    'a1al-a7-helper-redefined-under-try',
    'A',
    'Blocker 7: the helper is defined again inside try:, as one that clears its list, so the list stays empty.',
    hook(
      ['    saved = list(items)', '    items.clear()', '    refill(items, saved)'],
      ['import pytest', '', '', ...REFILL, '', '', 'try:', '    def refill(lst, src):', '        lst.clear()', 'except ImportError:', '    pass'],
    ),
    unread('refill(items, saved)'),
  ),
  fixture(
    'a1al-a8-list-shadowed-in-hook',
    'A',
    'Blocker 8: the hook binds list to a lambda returning [], so its "copy" is empty and nothing is put back.',
    hook(['    list = lambda xs: []', ...R]),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a8-list-shadowed-at-module',
    'A',
    'Blocker 8: the module binds list to a lambda returning [], so the hook\'s "copy" is empty.',
    hook([...R], ['import pytest', '', 'list = lambda xs: []']),
    unread('saved = list(items)'),
  ),
  fixture(
    'a1al-a8-sorted-shadowed-at-module',
    'A',
    'Blocker 8: the module binds sorted to a lambda returning [], so the hook\'s sorted "copy" is empty.',
    hook(['    saved = sorted(items)', '    items.clear()', '    items.extend(saved)'], ['import pytest', '', 'sorted = lambda xs, **kw: []']),
    unread('saved = sorted(items)'),
  ),
  fixture(
    'a1al-a9-fstring-clears-copy',
    'A',
    'Blocker 9: an f-string field clears the saved copy before the restore, so nothing is put back.',
    hook(['    saved = list(items)', '    items.clear()', '    print(f"{saved.clear()}")', '    items.extend(saved)']),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a9-exec-clears-copy',
    'A',
    'Blocker 9: exec clears the saved copy before the restore, so nothing is put back.',
    hook(['    saved = list(items)', '    items.clear()', '    exec("saved.clear()")', '    items.extend(saved)']),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a9-getattr-session-items',
    'A',
    "Blocker 9: getattr(session, \"items\") is pytest's own list, and the hook clears it after the restore.",
    withSession(...R, '    getattr(session, "items").clear()'),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a9-helper-before-nested-def',
    'A',
    'Blocker 9: the hook calls refill before a nested def of the same name, so refill is a local not yet bound: UnboundLocalError, INTERNALERROR.',
    hook(
      ['    saved = list(items)', '    items.clear()', '    refill(items, saved)', '', '    def refill(lst, src):', '        pass'],
      ['import pytest', '', '', ...REFILL],
    ),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a-restore-slice-copy-iadd',
    'A',
    'Control: copy with items[:], clear with del items[:], restore with +=.',
    hook(['    saved = items[:]', '    del items[:]', '    items += saved']),
    restores,
  ),
  fixture(
    'a1al-a-restore-star-copy-slice-assign',
    'A',
    'Control: copy with [*items], clear with items[:] = [], restore by assigning to the whole slice.',
    hook(['    saved = [*items]', '    items[:] = []', '    items[:] = saved']),
    restores,
  ),
  fixture(
    'a1al-a-restore-tuple-copy',
    'A',
    'Control: copy with tuple(items), clear, extend.',
    hook(['    saved = tuple(items)', '    items.clear()', '    items.extend(saved)']),
    restores,
  ),
  fixture(
    'a1al-a-restore-with-report-and-print',
    'A',
    'Control: R with a separate copy reported as deselected and a print of a string literal; every statement is recognised.',
    hook(['    dropped = list(items)', ...R, '    config.hook.pytest_deselected(items=dropped)', '    print("restored")']),
    restores,
  ),
  fixture(
    'a1al-a-restore-with-module-logger',
    'A',
    'Control: R with a log call through a module-level logging.getLogger logger, its arguments a string literal and a plain name.',
    hook([...R, '    logger.info("restored %s", config)'], ['import logging', '', 'import pytest', '', 'logger = logging.getLogger(__name__)']),
    restores,
  ),
  fixture(
    'a1al-a-restore-print-of-copy',
    'A',
    'The saved copy is printed as well as restored: S is mentioned outside the restore, so the hook is not credited.',
    hook([...R, '    print(saved)']),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-a-restore-before-clear',
    'A',
    'A restore with no emptying before it doubles the list, then the clear empties it: pytest runs no test.',
    hook(['    saved = list(items)', '    items.extend(saved)', '    items.clear()']),
    deselects,
  ),
  // ---- item B: a tokenised body ----------------------------------------------------------
  fixture(
    'a1al-b-string-closing-at-column-zero',
    'B',
    'Blocker 2: R, then a triple-quoted string whose closing line starts at column 0, then items.clear(); pytest runs no test.',
    hook([...R, '    """', '"""', '    items.clear()']),
    deselects,
  ),
  fixture(
    'a1al-b-bracket-continued-at-column-zero',
    'B',
    "Blocker 2's mirror: the restore's argument runs onto a line at column 0 inside the bracket, and a clear follows; pytest runs no test.",
    hook(['    saved = list(items)', '    items.clear()', '    items.extend(', 'saved)', '    items.clear()']),
    deselects,
  ),
  fixture(
    'a1al-b-backslash-continuation',
    'B',
    'A backslash continuation inside the deselect-everything hook is one logical line.',
    hook(['    dropped = \\', '        list(items)', '    items.clear()', '    config.hook.pytest_deselected(items=dropped)']),
    deselects,
  ),
  fixture(
    'a1al-b-docstring-holding-if',
    'B',
    "The hook's docstring holds the word if; it is a string, not a condition, and the hook empties the list.",
    hook(['    """Drop every test', '    if this conftest is installed.', '    """', '    items.clear()']),
    deselects,
  ),
  fixture(
    'a1al-b-restore-with-docstring',
    'B',
    'Control: a hook docstring, then R.',
    hook(['    """Reorder nothing; put every item back."""', ...R]),
    restores,
  ),
  // ---- item C: no false hollow rating -----------------------------------------------------
  fixture(
    'a1al-c-copy-copy-rebind',
    'C',
    "items = copy.copy(items) rebinds the name, so the clear empties the copy, not pytest's list; pytest runs every test.",
    hook(['    items = copy.copy(items)', '    items.clear()'], ['import copy', '', 'import pytest']),
    unread('items = copy.copy(items)'),
  ),
  fixture(
    'a1al-c-closure-fills-name',
    'C',
    'A closure defined before e = [] fills e from the saved copy, and the hook extends the list from e; pytest runs every test.',
    hook([
      '    saved = list(items)',
      '',
      '    def fill():',
      '        e.extend(saved)',
      '',
      '    e = []',
      '    items.clear()',
      '    fill()',
      '    items.extend(e)',
    ]),
    unread(ANY_NOT_READ),
  ),
  fixture(
    'a1al-c-loop-rebinds-items',
    'C',
    "A for loop rebinds the name items to a copy, so the clear empties the copy, not pytest's list; pytest runs every test.",
    hook(['    for items in [list(items)]:', '        pass', '    items.clear()']),
    unread(ANY_NOT_READ),
  ),
  // ---- item D: no silent pass -------------------------------------------------------------
  fixture(
    'a1al-d-slice-from-zero-alone',
    'D',
    'items[0:] = [] alone empties the list; it was passed silently.',
    hook(['    items[0:] = []']),
    unread('items[0:] = []'),
  ),
  fixture(
    'a1al-d-slice-to-length',
    'D',
    'items[:len(items)] = () empties the list; it was passed silently.',
    hook(['    items[:len(items)] = ()']),
    unread('items[:len(items)] = ()'),
  ),
  fixture(
    'a1al-d-helper-slice-clear',
    'D',
    'A same-file helper empties its list with lst[0:] = []; it was passed silently.',
    hook(['    drop(items)'], ['import pytest', '', '', 'def drop(lst):', '    lst[0:] = []']),
    unread('drop(items)'),
  ),
  fixture(
    'a1al-d-docstring-names-hook',
    'D',
    "The module's docstring names the hook; it does not bind it, and the hook empties the list.",
    {
      'tests/conftest.py': lines(
        '"""Test setup. pytest_collection_modifyitems below drops every test."""',
        'import pytest',
        '',
        '',
        'def pytest_collection_modifyitems(config, items):',
        '    items.clear()',
      ),
    },
    deselects,
  ),
  fixture(
    'a1al-d-comment-names-hook',
    'D',
    'A trailing comment names the hook; it does not bind it, and the hook empties the list.',
    hook(['    items.clear()  # the only pytest_collection_modifyitems here']),
    deselects,
  ),
  // ---- item E: a hook in any conftest.py is called with every collected item -------------
  fixture(
    'a1al-e-nested-clear-rates-everything',
    'E',
    "A hook in tests/sub/conftest.py clears the list; pytest calls it with every collected item, so no test runs anywhere.",
    { 'tests/sub/conftest.py': conftestHook(['    items.clear()']), 'tests/sub/test_sub.py': LIVE_PY_TEST('sub') },
    {
      outcome: 'deselects',
      removed: [
        ['tests/sub/test_sub.py', 'run-wide skip: hook in tests/sub/conftest.py'],
        ['tests/test_cache.py', 'run-wide skip: hook in tests/sub/conftest.py'],
        ['tests/test_lru.py', 'run-wide skip: hook in tests/sub/conftest.py'],
      ],
    },
  ),
  fixture(
    'a1al-e-root-restores-nested-clears',
    'E',
    'The root conftest.py restores and the nested one clears: pytest calls the nested hook first, then the root one copies the empty list, so no test runs.',
    {
      'tests/conftest.py': conftestHook([...R]),
      'tests/sub/conftest.py': conftestHook(['    items.clear()']),
      'tests/sub/test_sub.py': LIVE_PY_TEST('sub'),
    },
    {
      outcome: 'deselects',
      removed: [
        ['tests/sub/test_sub.py', 'run-wide skip: hook in tests/sub/conftest.py'],
        ['tests/test_cache.py', 'run-wide skip: hook in tests/sub/conftest.py'],
        ['tests/test_lru.py', 'run-wide skip: hook in tests/sub/conftest.py'],
      ],
      alsoSaid: RESTORED,
    },
  ),
  fixture(
    'a1al-e-root-clears-nested-restores',
    'E',
    'The reverse: the nested conftest.py restores and the root one clears last, so no test runs.',
    {
      'tests/conftest.py': conftestHook(['    items.clear()']),
      'tests/sub/conftest.py': conftestHook([...R]),
      'tests/sub/test_sub.py': LIVE_PY_TEST('sub'),
    },
    {
      outcome: 'deselects',
      removed: [
        ['tests/sub/test_sub.py', HOOK_RULE],
        ['tests/test_cache.py', HOOK_RULE],
        ['tests/test_lru.py', HOOK_RULE],
      ],
      alsoSaid: 'run-wide skip rule not applied: the hook in tests/sub/conftest.py puts the collected items back',
    },
  ),
  fixture(
    'a1al-e-nested-skip-rates-everything',
    'E',
    'A hook in tests/integration/conftest.py adds a skip marker to every item it is given, which is every collected item.',
    {
      'tests/integration/conftest.py': conftestHook(['    for item in items:', '        item.add_marker(pytest.mark.skip(reason="no service"))']),
      'tests/integration/test_service.py': LIVE_PY_TEST('service'),
    },
    {
      outcome: 'deselects',
      removed: [
        ['tests/integration/test_service.py', 'run-wide skip: hook in tests/integration/conftest.py'],
        ['tests/test_cache.py', 'run-wide skip: hook in tests/integration/conftest.py'],
        ['tests/test_lru.py', 'run-wide skip: hook in tests/integration/conftest.py'],
      ],
    },
  ),
  fixture(
    'a1al-e-nested-not-loaded-by-a-run',
    'E',
    'CI runs pytest on the two root test files only, so that run never collects tests/sub and never loads its hook: the rule is withheld for those files, and said.',
    {
      'tests/sub/conftest.py': conftestHook(['    items.clear()']),
      'tests/sub/test_sub.py': LIVE_PY_TEST('sub'),
      '.github/workflows/ci.yml': lines(
        'name: ci',
        'on:',
        '  push:',
        '    branches: [main]',
        '  pull_request:',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: pip install pytest',
        '      - run: pytest tests/test_cache.py tests/test_lru.py',
      ),
    },
    {
      outcome: 'deselects',
      removed: [['tests/sub/test_sub.py', 'run-wide skip: hook in tests/sub/conftest.py']],
      alsoSaid:
        'run-wide skip rule not applied: the pytest command line in .github/workflows/ci.yml does not collect tests/sub, so it does not load tests/sub/conftest.py',
    },
  ),
];
