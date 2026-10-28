import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HERMETIC_GIT_ENV } from './behaviour-corpus.js';
import { lfsPointerFor } from './false-assurance-fixtures.js';

// GENERATED REPOSITORY SHAPES FOR v27'S NO-RISE PROPERTY (#531 item c).
//
// The curated false-assurance fixtures pin what each issue and review found. The one score rise a
// review found against v27 was outside them (a conftest.py v17 rated hollow because it sat in
// __tests__/), so the no-rise property also runs over shapes generated from the dimensions the
// fixes read, rather than hand-picked:
//
//   exhaustive product   test-directory name x conftest placement x hook form x LFS placement
//                        (the four #531 names), plus, for every test-directory x conftest x hook
//                        combination, both a full and a depth-1 shape with no LFS pointer
//   covered pairwise     workflow shape x CRLF workflows x git history x configuration surface
//                        (none, an .env template, a committed secret), against each other and the
//                        four above
//
// Rows of the product that only repeat another shape are generated once: a hook in a conftest.py
// that is itself an LFS pointer, or a module-level pytestmark in modules that are all pointers, has
// no effect, so it is the plain shape. The four pairwise dimensions are assigned greedily so that
// every pair of values, across all eight dimensions, that takes effect appears in at least one
// shape; rows are appended for any pair the product leaves uncovered. Generation is deterministic:
// no randomness, a fixed tie-break, fixed commit dates, so a failure reproduces by its shape name.
//
// Every shape carries a changelog, a security policy and a runbook, so B4 is scored and the process
// composite can show whether a B2 or B3 abstention stayed in its denominator.
//
// To extend: add a value to a dimension (and its files below), or a workflow shape to
// WORKFLOW_SHAPES. A new value joins the cover automatically; the case count grows by the rows it
// needs (a value of a product dimension multiplies it).

export const TEST_DIRECTORIES = ['tests', 'test', 'testing', 'spec', '__tests__', 'src/cachelib/tests', '.'] as const;
export const CONFTEST_PLACEMENTS = ['none', 'root', 'test-directory', 'nested', 'only'] as const;
export const HOOK_FORMS = [
  'plain',
  'skip-every-item',
  'skip-every-item-inline',
  'skip-conditional',
  'clear-items',
  'clear-and-refill-nothing',
  'reorder',
  'asserting-fixture-and-skip',
  'pytestmark-skip-every-module',
  'pytestmark-conditional',
] as const;
export const LFS_PLACEMENTS = ['none', 'one-test-module', 'every-test-module', 'conftest', 'source-module', 'workflow'] as const;
export const HISTORIES = ['full', 'shallow'] as const;
export const LINE_ENDINGS = ['lf', 'crlf'] as const;
// A2 is not applicable to a library with no configuration surface; the other two make it scored,
// and the last plants a confirmed critical finding, which v27 keeps scoring on a shallow clone.
export const CONFIGURATIONS = ['none', 'env-template', 'committed-secret'] as const;

const PUSH_AND_PR = 'on:\n  push:\n    branches: [main]\n  pull_request:\n';
const job = (steps: string): string =>
  `jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${steps}`;
const PYTEST_STEPS = '      - run: pip install pytest\n      - run: pytest\n';
const PYPI_UPLOAD_ONLY =
  'name: publish\non:\n  push:\n    branches: [main]\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    permissions:\n      id-token: write\n    steps:\n      - uses: actions/download-artifact@v4\n        with:\n          name: dist\n          path: dist\n      - uses: pypa/gh-action-pypi-publish@release/v1\n';

/**
 * Workflow shapes, path -> contents, written with LF endings (the line-ending dimension converts
 * them). Extend here: a new entry is a new value of the workflow dimension.
 */
export const WORKFLOW_SHAPES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  none: {},
  'pr-test': { '.github/workflows/ci.yml': `name: ci\n${PUSH_AND_PR}${job(PYTEST_STEPS)}` },
  'push-test': { '.github/workflows/ci.yml': `name: ci\non:\n  push:\n    branches: [main]\n${job(PYTEST_STEPS)}` },
  'publish-only': { '.github/workflows/publish.yml': PYPI_UPLOAD_ONLY },
  'print-only': {
    '.github/workflows/ci.yml': `name: ci\n${PUSH_AND_PR}${job('      - run: echo "tests run elsewhere"\n      - run: echo done\n')}`,
  },
  'branch-filtered': {
    '.github/workflows/ci.yml': `name: ci\non:\n  push:\n    branches: [release/never]\n  pull_request:\n    branches: [release/never]\n${job(PYTEST_STEPS)}`,
  },
  'test-then-publish': {
    '.github/workflows/ci.yml': `name: ci\n${PUSH_AND_PR}${job(`${PYTEST_STEPS}      - run: pip install build twine\n      - run: python -m build\n      - run: twine upload dist/*\n`)}`,
  },
  'pr-test-and-publish-only': {
    '.github/workflows/ci.yml': `name: ci\n${PUSH_AND_PR}${job(PYTEST_STEPS)}`,
    '.github/workflows/publish.yml': PYPI_UPLOAD_ONLY,
  },
};

export interface NoRiseShape {
  readonly testDirectory: (typeof TEST_DIRECTORIES)[number];
  readonly conftest: (typeof CONFTEST_PLACEMENTS)[number];
  readonly hook: (typeof HOOK_FORMS)[number];
  readonly lfs: (typeof LFS_PLACEMENTS)[number];
  readonly workflow: string;
  readonly lineEndings: (typeof LINE_ENDINGS)[number];
  readonly history: (typeof HISTORIES)[number];
  readonly configuration: (typeof CONFIGURATIONS)[number];
}

type Dimension = keyof NoRiseShape;

/** The exhaustive product, in this order. */
const PRODUCT: readonly Dimension[] = ['testDirectory', 'conftest', 'hook', 'lfs'];
// Covered pairwise, assigned in this order, so a value's constraints only look at dimensions set.
const COVERED: readonly Dimension[] = ['workflow', 'lineEndings', 'history', 'configuration'];
const ALL: readonly Dimension[] = [...PRODUCT, ...COVERED];

export const DIMENSION_VALUES: Readonly<Record<Dimension, readonly string[]>> = {
  testDirectory: TEST_DIRECTORIES,
  conftest: CONFTEST_PLACEMENTS,
  hook: HOOK_FORMS,
  lfs: LFS_PLACEMENTS,
  workflow: Object.keys(WORKFLOW_SHAPES),
  lineEndings: LINE_ENDINGS,
  history: HISTORIES,
  configuration: CONFIGURATIONS,
};

const CONFTEST_HOOKS = new Set<string>(HOOK_FORMS.filter((hook) => hook !== 'plain' && !hook.startsWith('pytestmark')));
const isModuleMark = (hook: string | undefined): boolean => hook?.startsWith('pytestmark') ?? false;

/**
 * The binary constraints between dimensions: a combination that names a file the shape lacks (a
 * hook with no conftest to hold it, a pointer on a file the shape lacks, CRLF with no workflow).
 * Each involves two dimensions, so a pair is valid exactly when this accepts it.
 */
function compatible(shape: Partial<NoRiseShape>): boolean {
  const { testDirectory, conftest, hook, lfs, workflow, lineEndings } = shape;
  if (conftest === 'none' && hook !== undefined && CONFTEST_HOOKS.has(hook)) return false;
  if (conftest === 'only' && isModuleMark(hook)) return false;
  if (testDirectory === '.' && conftest === 'test-directory') return false;
  if (conftest === 'none' && lfs === 'conftest') return false;
  if (conftest === 'only' && (lfs === 'one-test-module' || lfs === 'every-test-module')) return false;
  if (workflow === 'none' && (lfs === 'workflow' || lineEndings === 'crlf')) return false;
  return true;
}

/** Whether a hook form takes effect beside this LFS placement (it does not inside a pointer). */
function hookTakesEffect(hook: string, lfs: string): boolean {
  if (lfs === 'conftest' && CONFTEST_HOOKS.has(hook)) return false;
  if (lfs === 'every-test-module' && isModuleMark(hook)) return false;
  return true;
}

/** The shape with a hook that has no effect written as 'plain', the shape it repeats. */
function effective<T extends Partial<NoRiseShape>>(shape: T): T {
  return shape.hook !== undefined && shape.lfs !== undefined && !hookTakesEffect(shape.hook, shape.lfs)
    ? { ...shape, hook: 'plain' }
    : shape;
}

function pairKey(a: Dimension, aValue: string, b: Dimension, bValue: string): string {
  return ALL.indexOf(a) < ALL.indexOf(b) ? `${a}=${aValue}|${b}=${bValue}` : `${b}=${bValue}|${a}=${aValue}`;
}

/** Every pair of values, across two different dimensions, that a shape can hold and that takes effect. */
export function validPairs(): Set<string> {
  const pairs = new Set<string>();
  ALL.forEach((a, i) => {
    for (const b of ALL.slice(i + 1)) {
      for (const aValue of DIMENSION_VALUES[a]) {
        for (const bValue of DIMENSION_VALUES[b]) {
          const pair = { [a]: aValue, [b]: bValue } as Partial<NoRiseShape>;
          if (!compatible(pair)) continue;
          if (pair.hook !== undefined && pair.lfs !== undefined && !hookTakesEffect(pair.hook, pair.lfs)) continue;
          pairs.add(pairKey(a, aValue, b, bValue));
        }
      }
    }
  });
  return pairs;
}

/** The pairs a shape holds that take effect (a hook with no effect pairs with nothing). */
export function pairsOf(shape: NoRiseShape): string[] {
  const inert = !hookTakesEffect(shape.hook, shape.lfs);
  const pairs: string[] = [];
  ALL.forEach((a, i) => {
    for (const b of ALL.slice(i + 1)) {
      if (inert && (a === 'hook' || b === 'hook')) continue;
      pairs.push(pairKey(a, shape[a], b, shape[b]));
    }
  });
  return pairs;
}

function product(dimensions: readonly Dimension[]): Partial<NoRiseShape>[] {
  return dimensions.reduce<Partial<NoRiseShape>[]>(
    (rows, dimension) =>
      rows.flatMap((row) =>
        DIMENSION_VALUES[dimension]
          .map((value) => ({ ...row, [dimension]: value }))
          .filter((candidate) => compatible(candidate)),
      ),
    [{}],
  );
}

/** Every test-directory x conftest x hook x LFS combination that takes effect, once each. */
export function productRows(): Partial<NoRiseShape>[] {
  const seen = new Set<string>();
  return product(PRODUCT)
    .map(effective)
    .filter((row) => {
      const key = PRODUCT.map((dimension) => row[dimension]).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Fills the unset covered dimensions of `row`, each with the valid value that covers most new pairs. */
function complete(row: Partial<NoRiseShape>, uncovered: Set<string>, rowIndex: number): NoRiseShape {
  const filled: Partial<NoRiseShape> = { ...row };
  const inert = !hookTakesEffect(row.hook!, row.lfs!);
  for (const dimension of COVERED) {
    if (filled[dimension] !== undefined) continue;
    const set = ALL.filter((other) => filled[other] !== undefined && !(inert && other === 'hook'));
    const candidates = DIMENSION_VALUES[dimension].filter((value) => compatible({ ...filled, [dimension]: value }));
    const gains = candidates.map(
      (value) => set.filter((other) => uncovered.has(pairKey(dimension, value, other, filled[other]!))).length,
    );
    const best = Math.max(...gains);
    const ties = candidates.filter((_, index) => gains[index] === best);
    // Fixed tie-break that still spreads values over rows: the row index picks among the ties.
    (filled as Record<string, string>)[dimension] = ties[rowIndex % ties.length]!;
  }
  return filled as NoRiseShape;
}

export function shapeName(shape: NoRiseShape): string {
  return ALL.map((dimension) => `${dimension}=${shape[dimension]}`).join(' ');
}

/** The test-directory x conftest x hook combination a shape belongs to. */
export function coreKey(shape: Pick<NoRiseShape, 'testDirectory' | 'conftest' | 'hook'>): string {
  return `${shape.testDirectory}|${shape.conftest}|${shape.hook}`;
}

/** Every valid test-directory x conftest x hook combination. */
export function coreKeys(): string[] {
  return product(['testDirectory', 'conftest', 'hook']).map((row) => coreKey(row as NoRiseShape));
}

/** The generated shapes, in a fixed order, each distinct. */
export function generateNoRiseShapes(): NoRiseShape[] {
  const uncovered = validPairs();
  const shapes: NoRiseShape[] = [];
  const add = (shape: NoRiseShape): void => {
    shapes.push(shape);
    for (const pair of pairsOf(shape)) uncovered.delete(pair);
  };
  for (const row of productRows()) {
    // With no pointer, the combination gets both histories, so each test-directory x conftest x hook
    // combination has a full-history shape in which v27 reads every file (A1 can be scored).
    const rows = row.lfs === 'none' ? HISTORIES.map((history) => ({ ...row, history })) : [row];
    for (const seeded of rows) add(complete(seeded, uncovered, shapes.length));
  }
  // Any pair the product did not reach gets a row of its own, seeded from a product row admitting it.
  const rows = productRows();
  for (const pair of [...uncovered]) {
    if (!uncovered.has(pair)) continue;
    const seed = Object.fromEntries(pair.split('|').map((part) => part.split('='))) as Partial<NoRiseShape>;
    const base = rows.find(
      (row) =>
        compatible({ ...row, ...seed }) &&
        PRODUCT.every((dimension) => seed[dimension] === undefined || seed[dimension] === row[dimension]),
    );
    if (!base) throw new Error(`no product row admits ${pair}`);
    add(complete({ ...base, ...seed }, uncovered, shapes.length));
  }
  return shapes;
}

/** Shard `index` of `count`, by test-directory x conftest x hook combination, so each shard holds whole combinations. */
export function noRiseShard(shapes: readonly NoRiseShape[], index: number, count: number): NoRiseShape[] {
  const keys = coreKeys();
  return shapes.filter((shape) => keys.indexOf(coreKey(shape)) % count === index);
}

// ---- Materialisation -------------------------------------------------------------------------

const CONFTEST_FIXTURE = 'import pytest\n\n\n@pytest.fixture\ndef cache():\n    return {}\n';
const SKIP_EVERY_ITEM =
  'import pytest\n\n\ndef pytest_collection_modifyitems(config, items):\n    for item in items:\n        item.add_marker(pytest.mark.skip(reason="temporarily disabled"))\n';
const CONFTESTS: Readonly<Record<(typeof HOOK_FORMS)[number], string>> = {
  plain: CONFTEST_FIXTURE,
  'pytestmark-skip-every-module': CONFTEST_FIXTURE,
  'pytestmark-conditional': CONFTEST_FIXTURE,
  'skip-every-item': SKIP_EVERY_ITEM,
  'skip-every-item-inline':
    'import pytest\n\n\ndef pytest_collection_modifyitems(config, items):\n    for item in items: item.add_marker(pytest.mark.skip(reason="disabled for now"))\n',
  'skip-conditional':
    'import pytest\n\n\ndef pytest_collection_modifyitems(config, items):\n    for item in items:\n        if "slow" in item.keywords:\n            item.add_marker(pytest.mark.skip(reason="slow"))\n',
  'clear-items': 'def pytest_collection_modifyitems(session, config, items):\n    items.clear()\n',
  'clear-and-refill-nothing': 'def pytest_collection_modifyitems(session, config, items):\n    items.clear()\n    items.extend([])\n',
  reorder:
    'def pytest_collection_modifyitems(session, config, items):\n    ordered = sorted(items, key=lambda item: item.name)\n    items.clear()\n    items.extend(ordered)\n',
  'asserting-fixture-and-skip': `${SKIP_EVERY_ITEM}\n\n@pytest.fixture\ndef cache():\n    value = {}\n    assert value == {}\n    return value\n`,
};
const MODULE_MARKS: Partial<Record<(typeof HOOK_FORMS)[number], string>> = {
  'pytestmark-skip-every-module': 'import pytest\n\npytestmark = pytest.mark.skip(reason="disabled")\n\n',
  'pytestmark-conditional':
    'import os\nimport pytest\n\npytestmark = pytest.mark.skip(reason="no db") if not os.environ.get("DB") else []\n\n',
};
const TEST_MODULES: Readonly<Record<string, string>> = {
  'test_cache.py':
    'from cachelib import get, put\n\n\ndef test_get_default():\n    assert get({}, "a", 1) == 1\n\n\ndef test_put():\n    c = {}\n    put(c, "a", 2)\n    assert c["a"] == 2\n',
  'test_lru.py': 'from cachelib.lru import LRU\n\n\ndef test_lru_get():\n    assert LRU(2).get("x") is None\n',
};

/**
 * A synthetic branded secret shape, assembled from segments so this source file never holds one
 * contiguous credential-shaped literal (as false-assurance-fixtures.ts does).
 */
const SYNTHETIC_BRANDED_SECRET = ['sk', 'liveFIXTUREonly0000abcdEFGH1234ijklMNOP'].join('-');
const CONFIGURATION_FILES: Readonly<Record<(typeof CONFIGURATIONS)[number], Readonly<Record<string, string>>>> = {
  none: {},
  'env-template': {
    '.gitignore': '.env\n__pycache__/\n',
    '.env.example': 'CACHE_URL=\n',
    'src/cachelib/config.py': 'import os\n\nCACHE_URL = os.environ.get("CACHE_URL", "")\n',
  },
  'committed-secret': {
    '.gitignore': '.env\n__pycache__/\n',
    '.env.example': 'CACHE_URL=\n',
    'src/cachelib/config.py': 'import os\n\nCACHE_URL = os.environ.get("CACHE_URL", "")\n',
    'src/cachelib/billing.py': `# Fixture only: a synthetic value in a real-looking assignment.\nSTRIPE_SECRET_KEY = "${SYNTHETIC_BRANDED_SECRET}"\n`,
  },
};

// A changelog, security policy and runbook make B4 scored, so the process composite has a scored
// criterion besides B2 and B3 and can show whether their abstention stayed in its denominator.
const PROCESS_FILES: Readonly<Record<string, string>> = {
  'CHANGELOG.md': '# Changelog\n\n## 1.0.0 - 2026-09-15\n\n- First release.\n\n## 0.9.0 - 2026-08-01\n\n- Beta.\n',
  'SECURITY.md': '# Security\n\nReport issues privately to the maintainers.\n',
  'docs/runbook.md': '# Runbook\n\n## Release\n\nTag and publish from the 2026 checklist.\n',
};

const under = (directory: string, path: string): string => (directory === '' ? path : `${directory}/${path}`);

/** The files one shape commits, path -> contents. */
export function shapeFiles(shape: NoRiseShape): Record<string, string> {
  const directory = shape.testDirectory === '.' ? '' : shape.testDirectory;
  const moduleDirectory = shape.conftest === 'nested' ? under(directory, 'unit') : directory;
  const files: Record<string, string> = {
    'pyproject.toml': `[project]\nname = "cachelib"\nversion = "1.0.0"\ndependencies = []\n${
      directory === '' ? '' : `\n[tool.pytest.ini_options]\ntestpaths = ["${directory}"]\n`
    }`,
    'README.md': '# cachelib\n\nA small cache library.\n',
    LICENSE: 'MIT\n',
    'src/cachelib/__init__.py':
      'def get(cache, key, default=None):\n    return cache.get(key, default)\n\n\ndef put(cache, key, value):\n    cache[key] = value\n    return value\n',
    'src/cachelib/lru.py':
      'class LRU:\n    def __init__(self, size):\n        self.size = size\n        self.items = {}\n\n    def get(self, key):\n        return self.items.get(key)\n',
    ...CONFIGURATION_FILES[shape.configuration],
    ...PROCESS_FILES,
  };
  const modules: string[] = [];
  if (shape.conftest !== 'only') {
    for (const [name, body] of Object.entries(TEST_MODULES)) {
      const path = under(moduleDirectory, name);
      files[path] = `${MODULE_MARKS[shape.hook] ?? ''}${body}`;
      modules.push(path);
    }
  }
  let conftest: string | undefined;
  if (shape.conftest === 'root') conftest = 'conftest.py';
  else if (shape.conftest === 'test-directory' || shape.conftest === 'only') conftest = under(directory, 'conftest.py');
  else if (shape.conftest === 'nested') conftest = under(moduleDirectory, 'conftest.py');
  if (conftest) files[conftest] = CONFTESTS[shape.hook];

  const workflows = WORKFLOW_SHAPES[shape.workflow];
  if (!workflows) throw new Error(`unknown workflow shape ${shape.workflow}`);
  for (const [path, text] of Object.entries(workflows)) {
    files[path] = shape.lineEndings === 'crlf' ? text.replace(/\n/g, '\r\n') : text;
  }

  const pointed =
    shape.lfs === 'one-test-module'
      ? modules.slice(0, 1)
      : shape.lfs === 'every-test-module'
        ? modules
        : shape.lfs === 'conftest'
          ? [conftest]
          : shape.lfs === 'source-module'
            ? ['src/cachelib/lru.py']
            : shape.lfs === 'workflow'
              ? Object.keys(workflows)
              : [];
  for (const path of pointed) {
    if (path === undefined || files[path] === undefined) throw new Error(`${shapeName(shape)}: nothing to point at`);
    const pointer = lfsPointerFor(files[path]);
    // A workflow pointer keeps the shape's line endings, so CRLF takes effect beside it (#519
    // recognises CRLF pointers).
    files[path] = shape.lfs === 'workflow' && shape.lineEndings === 'crlf' ? pointer.replace(/\n/g, '\r\n') : pointer;
  }
  return files;
}

/** Commits after the first, so B2 reads a full recent-commit window on a full clone. */
const HISTORY_LENGTH = 14;
const EPOCH = 1_789_430_400; // 2026-09-15T00:00:00Z, as HERMETIC_GIT_ENV dates its commits.

/**
 * Materialises a shape as a git repository: one commit holding the files, then empty commits whose
 * subjects alternate with pull-request merges, written in one `git fast-import` pass. A shallow
 * shape is the same repository cloned at depth 1. Returns the path to scan and the directories to
 * remove afterwards; for a shallow shape also the repository it was cloned from, the full clone of
 * the same commit, against which v27's history criteria are compared (v27 freeze change F1).
 */
export function buildNoRiseShape(shape: NoRiseShape): { repoPath: string; fullRepoPath?: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-v27-norise-'));
  const chunks: Buffer[] = [];
  const data = (text: string | Buffer): void => {
    const bytes = typeof text === 'string' ? Buffer.from(text, 'utf8') : text;
    chunks.push(Buffer.from(`data ${bytes.length}\n`), bytes, Buffer.from('\n'));
  };
  for (let index = 0; index <= HISTORY_LENGTH; index += 1) {
    chunks.push(
      Buffer.from(`commit refs/heads/main\ncommitter Cejel Fixture <fixture@cejel.invalid> ${EPOCH + index * 60} +0000\n`),
    );
    data(
      index === 0
        ? 'initial commit'
        : index % 2 === 0
          ? `Merge pull request #${index} from contributor/topic-${index}`
          : `change ${index}`,
    );
    if (index === 0) {
      for (const [path, contents] of Object.entries(shapeFiles(shape)).sort(([a], [b]) => (a < b ? -1 : 1))) {
        chunks.push(Buffer.from(`M 100644 inline ${path}\n`));
        data(contents);
      }
    }
  }
  const git = (cwd: string, args: readonly string[], input?: Buffer): void => {
    execFileSync('git', [...args], { cwd, env: HERMETIC_GIT_ENV, input, stdio: ['pipe', 'ignore', 'pipe'] });
  };
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['fast-import', '--quiet'], Buffer.concat(chunks));
  git(dir, ['reset', '--hard', '--quiet']);
  if (shape.history === 'full') {
    return { repoPath: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }
  const shallow = `${dir}-depth1`;
  git(tmpdir(), ['-c', 'protocol.file.allow=always', 'clone', '--quiet', '--depth', '1', `file://${dir}`, shallow]);
  return {
    repoPath: shallow,
    fullRepoPath: dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
      rmSync(shallow, { recursive: true, force: true });
    },
  };
}
