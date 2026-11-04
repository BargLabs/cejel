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
// hollow ratings, D the silent passes, E the nested conftest scope, F the review of #644 at
// bca7ebfbf: no report call, and no module that can rebind a name the allowlist trusts).
//
// pytest was not run on these fixtures: Python packages could not be run in this session, so each
// fixture's claim rests on reading pytest's collection and hook-calling code, as the purpose says.

export interface AllowlistFixture extends Omit<HookOutcomeFixture, 'item' | 'clause'> {
  readonly item: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
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
/** Item G: the statement that calls a builtin, and the file that names builtins. */
const builtinUnread = (statement: string, file: string) =>
  ({ outcome: 'not read', clause: `${notRead(statement)} calls a builtin, and ${file} names builtins` }) as const;
/** The review of #655, blocker 3: the statement that calls a builtin, and the file that may replace it. */
const builtinReplaced = (statement: string, file: string) =>
  ({ outcome: 'not read', clause: `${notRead(statement)} calls a builtin, which ${file} may replace` }) as const;

const hook = (body: readonly string[], preamble?: readonly string[]) => ({ 'tests/conftest.py': conftestHook(body, preamble) });
/** R: save a full copy, clear, extend from it. pytest runs every collected test. */
const R = ['    saved = list(items)', '    items.clear()', '    items.extend(saved)'] as const;
const REFILL = ['def refill(lst, src):', '    lst.extend(src)'] as const;
/** A module object whose __str__ clears pytest's list, given the session at session start. */
const WIPER_DEFS = [
  'class Wiper:',
  '    def __str__(self):',
  '        self.session.items.clear()',
  '        return "w"',
  '',
  '',
  'W = Wiper()',
  '',
  '',
  'def pytest_sessionstart(session):',
  '    W.session = session',
] as const;
const WIPER = ['import pytest', '', '', ...WIPER_DEFS] as const;
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
    'R with a separate copy reported as deselected and a print: since the review of #644, a report call runs code outside the copy, emptying and restore (any conftest.py or plugin may implement pytest_deselected), so the hook is named, not credited.',
    hook(['    dropped = list(items)', ...R, '    config.hook.pytest_deselected(items=dropped)', '    print("restored")']),
    unread('config.hook.pytest_deselected(items=dropped)'),
  ),
  fixture(
    'a1al-a-restore-with-module-logger',
    'A',
    "R with a log call through a module-level logger: since the review of #644, a logging call runs the logger's handlers and its arguments' __str__, so the hook is named, not credited.",
    hook([...R, '    logger.info("restored %s", config)'], ['import logging', '', 'import pytest', '', 'logger = logging.getLogger(__name__)']),
    unread('logger.info("", config)'),
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

  // ---- item F: the review of #644 at bca7ebfbf -------------------------------------------
  // Outcome 2 admits no call that can run code outside the copy, the emptying and the restore: no
  // report call (config.hook.*, print, logging), and no conftest.py module that can rebind a name
  // the allowlist trusts without spelling it (a star import, setattr, builtins or __builtins__,
  // sys.modules, an assignment to list, tuple or the helper, a module __getattr__). pytest 9.2.0
  // was run on each of these shapes; its result is in the purpose.
  fixture(
    'a1al-f-deselected-hook-implemented-in-conftest',
    'F',
    'Blocker 1: the conftest.py implements pytest_deselected to clear session.items, and the restoring hook ends by calling config.hook.pytest_deselected; pytest reports 3 deselected and runs no test.',
    hook(
      ['    saved = list(items)', '    dropped = list(items)', '    items.clear()', '    items.extend(saved)', '    config.hook.pytest_deselected(items=dropped)'],
      ['import pytest', '', '', 'def pytest_deselected(items):', '    items[0].session.items.clear()'],
    ),
    unread('config.hook.pytest_deselected(items=dropped)'),
  ),
  fixture(
    'a1al-f-print-object-str',
    'F',
    "Blocker 3: R, then print(W), where W's __str__ clears session.items; pytest runs no test.",
    hook([...R, '    print(W)'], WIPER),
    unread('print(W)'),
  ),
  fixture(
    'a1al-f-log-object-str',
    'F',
    "Blocker 3: R, then log.warning(W) through a module logger, where W's __str__ clears session.items; pytest runs no test.",
    hook([...R, '    log.warning(W)'], ['import logging', '', 'import pytest', '', 'log = logging.getLogger(__name__)', '', ...WIPER_DEFS]),
    unread('log.warning(W)'),
  ),
  fixture(
    'a1al-f-print-string-literal',
    'F',
    'R, then print of a string literal; pytest runs every test, but print is a name any module patch may rebind, so the hook is named, not credited (a miss, never a false sentence).',
    hook([...R, '    print("restored")']),
    unread('print("")'),
  ),
  fixture(
    'a1al-f-print-plain-name',
    'F',
    'R, then print(config); pytest runs every test, but the call runs the argument\'s __str__, so the hook is named, not credited.',
    hook([...R, '    print(config)']),
    unread('print(config)'),
  ),
  fixture(
    'a1al-f-logging-module-call',
    'F',
    'R, then logging.warning of a string literal; pytest runs every test, but a logging call runs every handler, so the hook is named, not credited.',
    hook([...R, '    logging.warning("restored")'], ['import logging', '', 'import pytest']),
    unread('logging.warning("")'),
  ),
  fixture(
    'a1al-f-star-import-list',
    'F',
    'Blocker 2: from helpers import * brings in a list that returns []; the "copy" is empty, and pytest runs no test.',
    { ...hook([...R], ['from helpers import *', '', 'import pytest']), 'tests/helpers.py': lines('def list(xs):', '    return []') },
    unread('from helpers import *'),
  ),
  fixture(
    'a1al-f-star-import-helper',
    'F',
    'Blocker 2: from helpers import *, after the same-file helper, rebinds it to one that does nothing; pytest runs no test.',
    {
      ...hook(['    saved = list(items)', '    items.clear()', '    refill(items, saved)'], ['import pytest', '', '', ...REFILL, '', '', 'from helpers import *']),
      'tests/helpers.py': lines('def refill(lst, src):', '    pass'),
    },
    unread('from helpers import *'),
  ),
  fixture(
    'a1al-f-setattr-module-list',
    'F',
    'Blocker 3: setattr(sys.modules[__name__], "li" + "st", ...) binds list without spelling it; the "copy" is empty, and pytest runs no test.',
    hook([...R], ['import sys', '', 'import pytest', '', 'setattr(sys.modules[__name__], "li" + "st", lambda xs: [])']),
    unread(/hook not read: `setattr\(/i),
  ),
  fixture(
    'a1al-f-builtins-attribute-list',
    'F',
    'Blocker 3: builtins.list = ... at module level; pytest itself fails to start, so no test runs.',
    hook([...R], ['import builtins', '', 'import pytest', '', 'builtins.list = lambda xs: []']),
    unread('import builtins'),
  ),
  fixture(
    'a1al-f-dunder-builtins-split-name',
    'F',
    'Blocker 3: __builtins__["li" + "st"] = ... at module level, a name no string spells; pytest itself fails to start, so no test runs.',
    hook([...R], ['import pytest', '', '__builtins__["li" + "st"] = lambda xs: []']),
    unread(/hook not read: `__builtins__\[/i),
  ),
  fixture(
    'a1al-f-sys-modules-attribute-tuple',
    'F',
    'sys.modules[__name__].tuple = ... binds the module global tuple through an attribute; the "copy" is empty, and pytest runs no test.',
    hook(['    saved = tuple(items)', '    items.clear()', '    items.extend(saved)'], ['import sys', '', 'import pytest', '', 'sys.modules[__name__].tuple = lambda xs: ()']),
    unread('sys.modules[__name__].tuple = lambda xs: ()'),
  ),
  fixture(
    'a1al-f-self-import-attribute-list',
    'F',
    'The conftest.py imports itself and assigns conftest.list, which binds its global list; the "copy" is empty, and pytest runs no test.',
    hook([...R], ['import pytest', '', 'import conftest', '', 'conftest.list = lambda xs: []']),
    unread('conftest.list = lambda xs: []'),
  ),
  fixture(
    'a1al-f-self-import-attribute-helper',
    'F',
    'The conftest.py imports itself and assigns conftest.refill after the helper, rebinding it to one that does nothing; pytest runs no test.',
    hook(
      ['    saved = list(items)', '    items.clear()', '    refill(items, saved)'],
      ['import pytest', '', '', ...REFILL, '', '', 'import conftest', '', 'conftest.refill = lambda lst, src: None'],
    ),
    unread('refill(items, saved)'),
  ),
  fixture(
    'a1al-f-module-getattr',
    'F',
    "A module __getattr__ answers pytest's own lookups on the conftest.py (collect_ignore), and collection fails with an error before the hook runs: no test runs.",
    hook(['    saved = list(items)', '    items.clear()', '    refill(items, saved)'], ['import pytest', '', '', ...REFILL, '', '', 'def __getattr__(name):', '    return None']),
    unread(/hook not read: `def __getattr__/i),
  ),
  fixture(
    'a1al-f-deselect-all-report-beside-star-import',
    'F',
    'Control: the deselect-everything hook (copy, clear, report the copy) stays hollow beside a star import; pytest reports 3 deselected.',
    { ...hook(['    dropped = list(items)', '    items.clear()', '    config.hook.pytest_deselected(items=dropped)'], ['from helpers import *', '', 'import pytest']), 'tests/helpers.py': lines('X = 1') },
    deselects,
  ),
  fixture(
    'a1al-f-control-restore-beside-module-logger',
    'F',
    'Control: R in a module that binds a logger and never calls it from the hook; pytest runs every test.',
    hook([...R], ['import logging', '', 'import pytest', '', 'logger = logging.getLogger(__name__)']),
    restores,
  ),
  fixture(
    'a1al-f-control-restore-beside-sys-path',
    'F',
    'Control: R in a module that puts src on sys.path; pytest runs every test.',
    hook([...R], ['import sys', '', 'import pytest', '', 'sys.path.insert(0, "src")']),
    restores,
  ),
  fixture(
    'a1al-f-control-strict-helper',
    'F',
    'Control: the strict same-file helper restores the saved copy; pytest runs every test.',
    hook(['    saved = list(items)', '    items.clear()', '    refill(items, saved)'], ['import pytest', '', '', ...REFILL]),
    restores,
  ),

  // ---- item G: a builtin copy where another file can patch builtins (#646) ----------------
  // goal_cejel_v27_a1_gaps_2026-11-03, item A. A copy that calls a builtin (`list(items)`,
  // `tuple(items)`, a helper restoring from `list(src)`) is credited only where no Python file in
  // the repository names `builtins` or `__builtins__`: a module the conftest.py imports, a second
  // conftest.py or a plugin can patch the builtin at import time, and the "copy" is then whatever
  // the patch returns. The copy forms that call no builtin (`items[:]`, `items.copy()`, `[*items]`)
  // stay credited: built-in types cannot be patched. pytest was not run on these fixtures (no Python
  // package could be run in this session); each claim rests on Python's name lookup (a module global,
  // then `builtins`), not on a run.
  fixture(
    'a1al-g-imported-module-patches-builtins-list',
    'G',
    'R in a conftest.py that imports helpers, whose import narrows builtins.list so that a list of pytest items copies as empty; the "copy" is empty, and pytest runs no test.',
    {
      ...hook([...R], ['import pytest', '', 'import helpers']),
      'tests/helpers.py': lines(
        'import builtins',
        '',
        '_real = builtins.list',
        '',
        '',
        'def _narrow(xs=()):',
        '    out = _real(xs)',
        '    return [] if out and hasattr(out[0], "nodeid") else out',
        '',
        '',
        'builtins.list = _narrow',
      ),
    },
    builtinUnread('saved = list(items)', 'tests/helpers.py'),
  ),
  fixture(
    'a1al-g-second-conftest-dunder-builtins-tuple',
    'G',
    'A tuple copy restored in tests/conftest.py, while the root conftest.py rebinds tuple through __builtins__; pytest loads the root conftest.py first, the "copy" is empty, and pytest runs no test.',
    {
      ...hook(['    saved = tuple(items)', '    items.clear()', '    items.extend(saved)']),
      'conftest.py': lines('_t = tuple', '__builtins__["tuple"] = lambda xs=(): () if xs is not None else _t()'),
    },
    builtinUnread('saved = tuple(items)', 'conftest.py'),
  ),
  fixture(
    'a1al-g-plugin-names-builtins-helper-list-copy',
    'G',
    'A slice copy restored by a strict helper that extends from list(src), beside a plugin module that names builtins; the helper calls the builtin, so the hook is named, not credited.',
    {
      ...hook(['    saved = items[:]', '    items.clear()', '    refill(items, saved)'], ['import pytest', '', '', 'def refill(lst, src):', '    lst.extend(list(src))']),
      'conftest.py': lines('pytest_plugins = ["plugins.patch"]'),
      'plugins/__init__.py': '',
      'plugins/patch.py': lines('import builtins', '', 'builtins.list = lambda xs=(): []'),
    },
    builtinUnread('refill(items, saved)', 'plugins/patch.py'),
  ),
  fixture(
    'a1al-g-control-slice-copy-beside-builtins',
    'G',
    'Control: a slice copy (no builtin call) restored by extend, beside a module that names builtins; built-in types cannot be patched, so pytest runs every test.',
    {
      ...hook(['    saved = items[:]', '    items.clear()', '    items.extend(saved)'], ['import pytest', '', 'import helpers']),
      'tests/helpers.py': lines('import builtins', '', 'builtins.list = lambda xs=(): []'),
    },
    restores,
  ),
  fixture(
    'a1al-g-control-star-copy-beside-builtins',
    'G',
    'Control: a [*items] copy (no builtin call) restored by a whole-slice assignment, beside a module that names __builtins__; pytest runs every test.',
    {
      ...hook(['    saved = [*items]', '    items.clear()', '    items[:] = saved'], ['import pytest', '', 'import helpers']),
      'tests/helpers.py': lines('__builtins__["tuple"] = lambda xs=(): ()'),
    },
    restores,
  ),
  fixture(
    'a1al-g-control-list-copy-no-builtins-named',
    'G',
    'Control: R where no Python file in the repository names builtins; pytest runs every test, and the hook stays credited.',
    { ...hook([...R], ['import pytest', '', 'import helpers']), 'tests/helpers.py': lines('def answer():', '    return 42') },
    restores,
  ),
  // The review of #655, blocker 3: each way a repository file can still reach builtins, or a
  // module's `list`, without the bare word `builtins`, and each place the search did not look. A
  // builtin copy is credited only where no file the repository tracks, in any directory, may replace
  // the builtin; otherwise the hook is named, never credited.
  fixture(
    'a1al-g-frame-f-builtins',
    'G',
    'R, while an imported module replaces list through sys._getframe(0).f_builtins; the "copy" is whatever the patch returns.',
    {
      ...hook([...R], ['import pytest', '', 'import helpers']),
      'tests/helpers.py': lines('import sys', '', '_real = list', 'sys._getframe(0).f_builtins["list"] = lambda xs=(): []'),
    },
    builtinReplaced('saved = list(items)', 'tests/helpers.py'),
  ),
  fixture(
    'a1al-g-fullwidth-builtins-import',
    'G',
    'R, while an imported module writes `import ｂuiltins` (a fullwidth b, which Python reads as builtins under NFKC) and replaces list.',
    {
      ...hook([...R], ['import pytest', '', 'import helpers']),
      'tests/helpers.py': lines('import \uff42uiltins', '', '\uff42uiltins.list = lambda xs=(): []'),
    },
    builtinReplaced('saved = list(items)', 'tests/helpers.py'),
  ),
  ...(['vendor', 'build', 'dist', 'venv', 'coverage'] as const).map((directory) =>
    fixture(
      `a1al-g-patch-under-${directory}`,
      'G',
      `R, while the root conftest.py loads a plugin under ${directory}/ that replaces builtins.list; the file list A1 walks leaves ${directory}/ out, so the search must look there too.`,
      {
        ...hook([...R]),
        'conftest.py': lines(`pytest_plugins = ["${directory}.patch"]`),
        [`${directory}/__init__.py`]: '',
        [`${directory}/patch.py`]: lines('import builtins', '', 'builtins.list = lambda xs=(): []'),
      },
      builtinReplaced('saved = list(items)', `${directory}/patch.py`),
    ),
  ),
  fixture(
    'a1al-g-p-plugin-f-builtins',
    'G',
    'R, while CI loads a plugin with -p whose import replaces list through inspect.currentframe().f_builtins.',
    {
      ...hook([...R]),
      'cachelib_plugin.py': lines('import inspect', '', 'inspect.currentframe().f_builtins["list"] = lambda xs=(): []'),
      '.github/workflows/ci.yml': lines('name: ci', 'on: push', 'jobs:', '  t:', '    runs-on: ubuntu-latest', '    steps:', '      - run: pytest -p cachelib_plugin'),
    },
    builtinReplaced('saved = list(items)', 'cachelib_plugin.py'),
  ),
  fixture(
    'a1al-g-sys-modules-joined-name',
    'G',
    'R, while an imported module reaches builtins through sys.modules with a joined name, never spelling it.',
    {
      ...hook([...R], ['import pytest', '', 'import helpers']),
      'tests/helpers.py': lines('import sys', '', 'sys.modules["bu" + "iltins"].list = lambda xs=(): []'),
    },
    builtinReplaced('saved = list(items)', 'tests/helpers.py'),
  ),
  fixture(
    'a1al-g-conftest-global-from-another-module',
    'G',
    "R, while another module sets the conftest module's own list global, which the hook's list(items) finds before the builtin.",
    {
      ...hook([...R], ['import pytest', '', 'import helpers']),
      'tests/helpers.py': lines('import conftest', '', 'conftest.list = lambda xs=(): []'),
    },
    builtinReplaced('saved = list(items)', 'tests/helpers.py'),
  ),
  fixture(
    'a1al-g-extension-module-beside-tests',
    'G',
    'R, beside a compiled extension module the conftest.py imports; Cejel cannot read what its import does.',
    {
      ...hook([...R], ['import pytest', '', 'import _speedups']),
      'tests/_speedups.cpython-312-x86_64-linux-gnu.so': 'not a real extension module\n',
    },
    builtinReplaced('saved = list(items)', 'tests/_speedups.cpython-312-x86_64-linux-gnu.so'),
  ),

  // ---- item H: #634's remaining shapes, checked against origin/main --------------------------
  // goal_cejel_v27_a1_gaps_2026-11-03, item D. #634 was deferred from #626, before #644 replaced the
  // restore reader with an allowlist. Each fixture below was committed and run against origin/main
  // 4cf09b263 first; each was already read as it is or named as not read there, so each is a pin,
  // not a fix. The hook-outcome fixtures' items C, D and E hold the first shape of each #634 item;
  // these are the variants the card names that they do not hold. pytest was not run on them (no
  // Python package could be run in this session).
  fixture(
    'a1al-h-lambda-bound-after-clear-then-called',
    'H',
    '#634 item 1: cb = lambda: items.extend(saved), bound after the clear, then cb(): a real restore, which the allowlist does not read, so the hook is named.',
    hook(['    saved = list(items)', '    items.clear()', '    cb = lambda: items.extend(saved)', '    cb()']),
    unread('cb = lambda: items.extend(saved)'),
  ),
  fixture(
    'a1al-h-helper-double-star-arguments',
    'H',
    '#634 item 2: the strict helper called with ** arguments, which the reader does not unpack: named, not credited.',
    hook(['    saved = list(items)', '    items.clear()', '    refill(**{"lst": items, "src": saved})'], ['import pytest', '', '', ...REFILL]),
    unread(/hook not read: `refill\(\*\*/i),
  ),
  fixture(
    'a1al-h-helper-mixed-star-argument',
    'H',
    '#634 item 2: the strict helper called with items, then *[saved]: named, not credited.',
    hook(['    saved = list(items)', '    items.clear()', '    refill(items, *[saved])'], ['import pytest', '', '', ...REFILL]),
    unread('refill(items, *[saved])'),
  ),
  fixture(
    'a1al-h-self-method-helper-in-plugin-class',
    'H',
    "#634 item 3: a plugin class registered from pytest_configure whose hook calls self.refill(items, saved); the module-level reader reads no hook in a class, so it makes no claim and the files keep v17's reading.",
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        '',
        'class Keeper:',
        '    def refill(self, lst, src):',
        '        lst.extend(src)',
        '',
        '    def pytest_collection_modifyitems(self, config, items):',
        '        saved = list(items)',
        '        items.clear()',
        '        self.refill(items, saved)',
        '',
        '',
        'def pytest_configure(config):',
        '    config.pluginmanager.register(Keeper())',
      ),
    },
    { outcome: 'untouched' },
  ),
  fixture(
    'a1al-h-hanging-indent-def-items-next-line',
    'H',
    "#634 item 4: the def line wrapped after config, with items on the next line at a hanging indent: read as the hook, which deselects everything.",
    { 'tests/conftest.py': lines('import pytest', '', '', 'def pytest_collection_modifyitems(config,', '                                   items):', '    items.clear()') },
    deselects,
  ),
  fixture(
    'a1al-h-quoted-paths-past-eight-pointers',
    'H',
    "#634 item 5: one clear hook rates 11 files hollow, all listed; the two whose directories hold ', ' and ' (' are the 10th and 11th, after the first eight pointers, and the note still quotes them. (With 13 files the note lists 11 and counts the rest, so a path past the listing is counted, never written unquoted.)",
    {
      'tests/conftest.py': conftestHook(['    items.clear()']),
      ...Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`tests/test_more_${String(index).padStart(2, '0')}.py`, LIVE_PY_TEST(`more_${index}`)])),
      'tests/zz, late/test_late.py': LIVE_PY_TEST('late'),
      'tests/zz (old)/test_old.py': LIVE_PY_TEST('old'),
    },
    {
      outcome: 'deselects',
      removed: [
        ['tests/test_cache.py', HOOK_RULE],
        ['tests/test_lru.py', HOOK_RULE],
        ...Array.from({ length: 7 }, (_, index) => [`tests/test_more_${String(index).padStart(2, '0')}.py`, HOOK_RULE] as const),
        ['tests/zz, late/test_late.py', HOOK_RULE],
        ['tests/zz (old)/test_old.py', HOOK_RULE],
      ],
    },
  ),
];
