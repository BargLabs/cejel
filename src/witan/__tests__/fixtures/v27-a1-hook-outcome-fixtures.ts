import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';
import { LIVE_PY_TEST, PY_BASE, conftestHook, lines } from './v27-a1-removal-fixtures.js';

// v27 A1 HOOK OUTCOME FIXTURES (goal_cejel_v27_a1_restore_proof_and_hookwrapper_2026-11-02;
// #631, #632, #634).
//
// Under witan-rubric-v27-prospective-2026-10-19 the reader puts every `pytest_collection_modifyitems`
// hook that touches `items` into one of three outcomes:
//   - 'deselects': it proves the hook leaves `items` empty, so the run-wide skip rule applies and the
//     files under it are rated hollow (`removed`);
//   - 'restores': it proves the collected items are back in `items` when the hook returns, so the
//     rule is withheld and A1's note says the hook puts them back (`clause`);
//   - 'not read': it can prove neither, so the rule makes no claim and A1's note names the hook with
//     the reason (`clause`).
// 'untouched' is a control: the hook is not one the rule could apply to, and v27 reads every file as
// v17 does without naming it. Each fixture is a synthetic shape written from scratch.

export interface HookOutcomeFixture extends FalseAssuranceFixture {
  readonly item: 'A' | 'B' | 'C' | 'D' | 'E';
  readonly outcome: 'deselects' | 'restores' | 'not read' | 'untouched';
  /** For 'deselects': the files v27 rates hollow, with their rule. */
  readonly removed?: readonly (readonly [path: string, rule: string])[];
  /** For 'restores' and 'not read': the clause A1's note must hold. */
  readonly clause?: string;
}

const HOOK_RULE = 'run-wide skip: hook in tests/conftest.py';
const HOOK_REMOVED = [
  ['tests/test_cache.py', HOOK_RULE],
  ['tests/test_lru.py', HOOK_RULE],
] as const;
const RESTORED = 'run-wide skip rule not applied: the hook in tests/conftest.py puts the collected items back';
const notRead = (reason: string, path = 'tests/conftest.py') => `hook not read: \`${reason}\` in ${path}`;

const fixture = (
  name: string,
  item: HookOutcomeFixture['item'],
  purpose: string,
  files: Readonly<Record<string, string | null>>,
  expected: Pick<HookOutcomeFixture, 'outcome' | 'removed' | 'clause'>,
): HookOutcomeFixture => ({ name, issue: '#518', item, purpose, commits: [{ ...PY_BASE, ...files }], ...expected });

const deselects = { outcome: 'deselects', removed: HOOK_REMOVED } as const;
const restores = { outcome: 'restores', clause: RESTORED } as const;
const untouched = { outcome: 'untouched' } as const;
const unread = (reason: string) => ({ outcome: 'not read', clause: notRead(reason) }) as const;

const hook = (body: readonly string[], preamble?: readonly string[]) => ({ 'tests/conftest.py': conftestHook(body, preamble) });
const helper = (helperBody: readonly string[]) => ['import pytest', '', '', 'def refill(lst, src):', ...helperBody];

export const HOOK_OUTCOME_FIXTURES: readonly HookOutcomeFixture[] = [
  // ---- item A (#631): a restore counts only on proof --------------------------------------
  fixture(
    'a1ho-a-saved-aliased-and-cleared',
    'A',
    'The saved copy is aliased and the alias cleared before the restore, so nothing is put back.',
    hook(['    saved = list(items)', '    s2 = saved', '    s2.clear()', '    items.clear()', '    items.extend(saved)']),
    unread('items.extend(saved)'),
  ),
  fixture(
    'a1ho-a-saved-copy-sliced-empty',
    'A',
    'The saved "copy" is list(items)[:0], which is empty, so the extend puts nothing back.',
    hook(['    saved = list(items)[:0]', '    items.clear()', '    items.extend(saved)']),
    deselects,
  ),
  fixture(
    'a1ho-a-extend-from-empty-slice',
    'A',
    'The restore extends from saved[5:5], a zero-length slice of the saved copy.',
    hook(['    saved = list(items)', '    items.clear()', '    items.extend(saved[5:5])']),
    deselects,
  ),
  fixture(
    'a1ho-a-extend-from-name-slice',
    'A',
    'The restore extends from saved[n:n], which is empty whatever n holds.',
    hook(['    saved = list(items)', '    n = 3', '    items.clear()', '    items.extend(saved[n:n])']),
    deselects,
  ),
  fixture(
    'a1ho-a-saved-cleared-in-nested-block',
    'A',
    'A loop inside the hook clears the saved copy before the restore.',
    hook(['    saved = list(items)', '    for _ in range(1):', '        saved.clear()', '    items.clear()', '    items.extend(saved)']),
    unread('items.extend(saved)'),
  ),
  fixture(
    'a1ho-a-saved-sorted-zero-slice',
    'A',
    'The saved "copy" is sorted(items)[:0], which is empty.',
    hook(['    saved = sorted(items)[:0]', '    items.clear()', '    items.extend(saved)']),
    deselects,
  ),
  fixture(
    'a1ho-a-saved-comprehension-if-false',
    'A',
    'The saved "copy" is a comprehension that keeps no item.',
    hook(['    saved = [i for i in items if False]', '    items.clear()', '    items.extend(saved)']),
    unread('if'),
  ),
  fixture(
    'a1ho-a-helper-source-and-empty',
    'A',
    "The same-file helper extends its list from `src and []`, which is empty for a non-empty src.",
    hook(['    saved = list(items)', '    items.clear()', '    refill(items, saved)'], helper(['    lst.extend(src and [])'])),
    unread('refill(items, saved)'),
  ),
  fixture(
    'a1ho-a-helper-source-times-zero',
    'A',
    'The same-file helper extends its list from `src * 0`, which is empty.',
    hook(['    saved = list(items)', '    items.clear()', '    refill(items, saved)'], helper(['    lst.extend(src * 0)'])),
    unread('refill(items, saved)'),
  ),
  fixture(
    'a1ho-a-saved-reported-then-restored',
    'A',
    'The saved copy is passed to pytest_deselected and then extended back: it is passed elsewhere, so the restore is not proven.',
    hook(['    dropped = list(items)', '    items.clear()', '    config.hook.pytest_deselected(items=dropped)', '    items.extend(dropped)']),
    unread('items.extend(dropped)'),
  ),
  fixture(
    'a1ho-a-saved-bound-twice',
    'A',
    'The saved name is bound twice, so it is not a name bound once to a full copy.',
    hook(['    saved = list(items)', '    saved = list(items)', '    items.clear()', '    items.extend(saved)']),
    unread('items.extend(saved)'),
  ),
  fixture(
    'a1ho-a-saved-iterated-only',
    'A',
    'Control: the deselect-everything hook iterates over its saved copy to print it; it puts nothing back.',
    hook(['    saved = list(items)', '    items.clear()', '    for item in saved:', '        print(item.nodeid)']),
    deselects,
  ),
  fixture(
    'a1ho-a-loop-then-clear-then-call',
    'A',
    'Control: the hook loops over items to print them, clears, then reports a copy taken before: the loop only reads the list.',
    hook([
      '    dropped = list(items)',
      '    for item in items:',
      '        print(item.nodeid)',
      '    items.clear()',
      '    config.hook.pytest_deselected(items=dropped)',
    ]),
    deselects,
  ),
  fixture(
    'a1ho-a-marker-loop-untouched',
    'A',
    'Control: an unconditional loop adds a timeout marker to every item; it never empties the list and is not named.',
    hook(['    for item in items:', '        item.add_marker(pytest.mark.timeout(5))']),
    untouched,
  ),
  fixture(
    'a1ho-a-session-items-restore',
    'A',
    "After the clear the hook extends session.items, which is pytest's own list: not read.",
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        '',
        'def pytest_collection_modifyitems(session, config, items):',
        '    saved = list(items)',
        '    items.clear()',
        '    session.items.extend(saved)',
      ),
    },
    unread('session.items.extend(saved)'),
  ),
  fixture(
    'a1ho-a-session-passed-after-clear',
    'A',
    "After the clear the hook passes the session to a helper, which may put the items back through session.items: not read.",
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        'SAVED = []',
        '',
        '',
        'def put_back(current):',
        '    current.items.extend(SAVED)',
        '',
        '',
        'def pytest_collection_modifyitems(session, config, items):',
        '    SAVED.extend(items)',
        '    items.clear()',
        '    put_back(session)',
      ),
    },
    unread('put_back(session)'),
  ),
  fixture(
    'a1ho-a-global-alias',
    'A',
    'The hook keeps the list in a global, where any later call may reach it: not read.',
    hook(['    global KEPT', '    KEPT = items', '    items.clear()'], ['import pytest', '', 'KEPT = None']),
    unread('global KEPT'),
  ),
  fixture(
    'a1ho-a-real-restore-control',
    'A',
    "Control: #626's real restore (save a full copy, clear, extend from the bare name).",
    hook(['    saved = list(items)', '    items.clear()', '    items.extend(saved)']),
    restores,
  ),
  fixture(
    'a1ho-a-real-restore-full-slice-source',
    'A',
    'Control: the restore assigns saved[:] to the whole slice.',
    hook(['    saved = items.copy()', '    items.clear()', '    items[:] = saved[:]']),
    restores,
  ),
  // ---- item B (#632): a hookwrapper is read, and a conditional hook is named ----------------
  fixture(
    'a1ho-b-hookwrapper-clears-after-yield',
    'B',
    'An old-style hookwrapper yields, then empties items; pytest runs no test.',
    hook(['    yield', '    items.clear()'], ['import pytest', '', '', '@pytest.hookimpl(hookwrapper=True)']),
    deselects,
  ),
  fixture(
    'a1ho-b-wrapper-clears-after-yield',
    'B',
    'A new-style wrapper (wrapper=True) yields, then empties items.',
    hook(['    yield', '    items.clear()'], ['import pytest', '', '', '@pytest.hookimpl(wrapper=True)']),
    deselects,
  ),
  fixture(
    'a1ho-b-hookwrapper-restores-after-yield',
    'B',
    'A hookwrapper yields, then saves, clears and restores the items.',
    hook(
      ['    outcome = yield', '    saved = list(items)', '    items.clear()', '    items.extend(saved)'],
      ['import pytest', '', '', '@pytest.hookimpl(hookwrapper=True)'],
    ),
    restores,
  ),
  fixture(
    'a1ho-b-hookwrapper-two-yields',
    'B',
    'A hookwrapper with a second yield is not one the reader can place.',
    hook(['    yield', '    items.clear()', '    yield'], ['import pytest', '', '', '@pytest.hookimpl(hookwrapper=True)']),
    unread('yield'),
  ),
  fixture(
    'a1ho-b-hookwrapper-clears-before-yield',
    'B',
    'A hookwrapper empties items before its yield; the reader reads only the code after it.',
    hook(['    items.clear()', '    yield'], ['import pytest', '', '', '@pytest.hookimpl(hookwrapper=True)']),
    unread('items.clear()'),
  ),
  fixture(
    'a1ho-b-if-around-clear',
    'B',
    'An ordinary hook empties items under an if: it is named, not passed silently.',
    hook(['    if config.getoption("verbose") >= 0:', '        items.clear()']),
    unread('if'),
  ),
  fixture(
    'a1ho-b-return-before-clear',
    'B',
    'An ordinary hook may return before it empties items.',
    hook(['    print(len(items))', '    return', '    items.clear()']),
    unread('return'),
  ),
  fixture(
    'a1ho-b-conditional-not-touching-items',
    'B',
    'Control: a conditional hook that never names items is not named.',
    hook(['    if config.getoption("verbose") > 1:', '        print("collected")']),
    untouched,
  ),
  // ---- item C (#634): real restores are proven or named, never rated hollow -----------------
  fixture(
    'a1ho-c-lambda-restore-called',
    'C',
    'A lambda bound at the top level restores the saved copy, and is called after the clear.',
    hook(['    saved = list(items)', '    put_back = lambda: items.extend(saved)', '    items.clear()', '    put_back()']),
    restores,
  ),
  fixture(
    'a1ho-c-helper-by-keyword',
    'C',
    "The same-file helper is called with its own parameters' names as keywords.",
    hook(['    saved = list(items)', '    items.clear()', '    refill(lst=items, src=saved)'], helper(['    lst.extend(src)'])),
    restores,
  ),
  fixture(
    'a1ho-c-helper-by-keyword-swapped',
    'C',
    'The same-file helper is called by keyword, the source first.',
    hook(['    saved = list(items)', '    items.clear()', '    refill(src=saved, lst=items)'], helper(['    lst.extend(src)'])),
    restores,
  ),
  fixture(
    'a1ho-c-helper-star-arguments',
    'C',
    'The same-file helper is called with * arguments, which the reader does not unpack.',
    hook(['    saved = list(items)', '    items.clear()', '    refill(*(items, saved))'], helper(['    lst.extend(src)'])),
    unread('refill(*(items, saved))'),
  ),
  fixture(
    'a1ho-c-method-helper',
    'C',
    'A method of a module-level object restores the items; the reader does not read methods.',
    hook(
      ['    saved = list(items)', '    items.clear()', '    refiller.refill(items, saved)'],
      [
        'import pytest',
        '',
        '',
        'class Refiller:',
        '    def refill(self, lst, src):',
        '        lst.extend(src)',
        '',
        '',
        'refiller = Refiller()',
      ],
    ),
    unread('refiller.refill(items, saved)'),
  ),
  // ---- item D (#634): a wrapped def is read as the hook ------------------------------------
  fixture(
    'a1ho-d-black-wrapped-def',
    'D',
    "The hook's parameters run onto the next line, black's wrapping, with no trailing comma.",
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        '',
        'def pytest_collection_modifyitems(',
        '    session, config, items',
        '):',
        '    items.clear()',
      ),
    },
    deselects,
  ),
  fixture(
    'a1ho-d-black-wrapped-def-trailing-comma',
    'D',
    "The hook's parameters one to a line with a trailing comma.",
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        '',
        'def pytest_collection_modifyitems(',
        '    session,',
        '    config,',
        '    items,',
        '):',
        '    items.clear()',
      ),
    },
    deselects,
  ),
  fixture(
    'a1ho-d-black-wrapped-def-restores',
    'D',
    'Control: a wrapped def whose body restores the items.',
    {
      'tests/conftest.py': lines(
        'import pytest',
        '',
        '',
        'def pytest_collection_modifyitems(',
        '    session, config, items',
        '):',
        '    saved = list(items)',
        '    items.clear()',
        '    items.extend(saved)',
      ),
    },
    restores,
  ),
  // ---- item E (#634): paths in the note read back exactly ----------------------------------
  fixture(
    'a1ho-e-path-with-comma-and-paren',
    'E',
    "The hook and the tests sit in directories whose names hold ', ' and ' (', so the note quotes them.",
    {
      'tests/test_cache.py': null,
      'tests/test_lru.py': null,
      'tests/a, b/conftest.py': conftestHook(['    items.clear()']),
      'tests/a, b/test_ab.py': LIVE_PY_TEST('ab'),
      'tests/old (v1)/conftest.py': conftestHook(['    items.clear()']),
      'tests/old (v1)/test_old.py': LIVE_PY_TEST('old'),
    },
    {
      outcome: 'deselects',
      removed: [
        ['tests/a, b/test_ab.py', 'run-wide skip: hook in tests/a, b/conftest.py'],
        ['tests/old (v1)/test_old.py', 'run-wide skip: hook in tests/old (v1)/conftest.py'],
      ],
    },
  ),
  fixture(
    'a1ho-e-path-with-backtick-not-read',
    'E',
    'A hook the reader cannot read sits in a directory whose name holds a backtick, so the note quotes it.',
    {
      'tests/test_cache.py': null,
      'tests/test_lru.py': null,
      'tests/`raw`/conftest.py': conftestHook(['    if config.getoption("verbose") >= 0:', '        items.clear()']),
      'tests/`raw`/test_raw.py': LIVE_PY_TEST('raw'),
    },
    { outcome: 'not read', clause: notRead('if', '"tests/`raw`/conftest.py"') },
  ),
  fixture(
    'a1ho-e-many-rated-files',
    'E',
    'One hook disables eleven files, all listed: the note says how many of those it lists carry no evidence pointer.',
    {
      'tests/conftest.py': conftestHook(['    items.clear()']),
      ...Object.fromEntries(
        Array.from({ length: 9 }, (_, index) => [`tests/test_more_${String(index).padStart(2, '0')}.py`, LIVE_PY_TEST(`more_${index}`)]),
      ),
    },
    {
      outcome: 'deselects',
      removed: [
        ['tests/test_cache.py', HOOK_RULE],
        ['tests/test_lru.py', HOOK_RULE],
        ...Array.from({ length: 9 }, (_, index) => [`tests/test_more_${String(index).padStart(2, '0')}.py`, HOOK_RULE] as const),
      ],
    },
  ),
];

/** The note's form of a path: as written, or quoted where it holds ', ', '; ', ' (', a backtick or a double quote. */
export function notedPath(path: string): string {
  return /, |; | \(|[`"]/.test(path) ? `"${path.replace(/[\\"]/g, (character) => `\\${character}`)}"` : path;
}
