import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { WitanCriterionScore, WitanReport } from '../../schemas.js';

import { scoreRepoWithPublicCejel } from '../../public-scan.js';
import { HERMETIC_GIT_ENV } from './behaviour-corpus.js';

// #442's shallow-clone matrix (shallow-history-ratio-withheld-442.test.ts), rebuilt for the v27
// freeze change F1: forty commits whose subjects are all pull-request merges, none, or alternating;
// the checked-out files carrying a CI workflow and a pull-request template, a CI workflow alone, a
// CI workflow v27 does not see run a check (it only checks out and prints), or no PR-trace file at
// all; each scanned as a full clone and at depths 1, 5, 11 (just under B2's twelve-commit window)
// and 12 (at it). Every shallow row is compared with the same repository's full clone.
//
// Beside it, the shape of the #114 regression run's depth-1 pair: a small pure-Python cache library
// (cachetools-like) with a tox CI workflow, no pull-request template, no .env surface, and a history
// of direct commits rather than pull-request merges.

export const WINDOW = 12;
const COMMITS = 40;

export const HISTORIES = ['pr-merges', 'no-pr-merges', 'mixed'] as const;
export const EVIDENCE = ['ci-and-template', 'ci-only', 'print-only-ci', 'none'] as const;
export const DEPTHS = [1, 5, WINDOW - 1, WINDOW] as const;
export type History = (typeof HISTORIES)[number];
export type Evidence = (typeof EVIDENCE)[number];

const BASE_FILES: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "cachelib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# cachelib\n\nA small cache library.\n',
  LICENSE: 'MIT\n',
  '.gitignore': '.env\n__pycache__/\n',
  '.env.example': 'CACHE_URL=\n',
  'src/cachelib/__init__.py': 'def get(cache, key, default=None):\n    return cache.get(key, default)\n',
  'src/cachelib/config.py': 'import os\n\nCACHE_URL = os.environ.get("CACHE_URL", "")\n',
  'tests/test_cache.py': 'from cachelib import get\n\n\ndef test_get_default():\n    assert get({}, "a", 1) == 1\n',
};
const CI_WORKFLOW =
  'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n';
// v27 (#527): a workflow whose every step only checks out and prints earns no PR-trace credit.
const PRINT_ONLY_WORKFLOW =
  'name: hello\non:\n  pull_request:\njobs:\n  hello:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "hello"\n';

function matrixFiles(evidence: Evidence): Record<string, string> {
  return {
    ...BASE_FILES,
    ...(evidence === 'ci-and-template' || evidence === 'ci-only' ? { '.github/workflows/ci.yml': CI_WORKFLOW } : {}),
    ...(evidence === 'print-only-ci' ? { '.github/workflows/hello.yml': PRINT_ONLY_WORKFLOW } : {}),
    ...(evidence === 'ci-and-template' ? { '.github/pull_request_template.md': '## Summary\n' } : {}),
  };
}

// The #114 depth-1 pair's shape: a cachetools-like library, synthetic.
const CACHE_LIBRARY_FILES: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[build-system]\nrequires = ["setuptools>=61"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "cachekit"\nversion = "5.5.0"\ndescription = "Extensible memoizing collections and decorators"\nrequires-python = ">=3.9"\ndependencies = []\n',
  'setup.cfg': '[flake8]\nmax-line-length = 80\n',
  'tox.ini': '[tox]\nenvlist = py\n\n[testenv]\ndeps = pytest\ncommands = pytest {posargs}\n',
  'README.rst': 'cachekit\n========\n\nExtensible memoizing collections and decorators.\n',
  LICENSE: 'MIT\n',
  'CHANGELOG.rst': 'v5.5.0\n======\n\n- Add a TTL cache.\n',
  '.gitignore': '__pycache__/\n*.egg-info/\n.tox/\n',
  'src/cachekit/__init__.py':
    'from .cache import Cache\nfrom .lru import LRUCache\n\n__all__ = ("Cache", "LRUCache")\n',
  'src/cachekit/cache.py':
    'class Cache(dict):\n    def __init__(self, maxsize):\n        super().__init__()\n        self.maxsize = maxsize\n',
  'src/cachekit/lru.py':
    'from .cache import Cache\n\n\nclass LRUCache(Cache):\n    def __getitem__(self, key):\n        value = super().__getitem__(key)\n        self.pop(key)\n        super().__setitem__(key, value)\n        return value\n',
  'tests/test_cache.py':
    'from cachekit import Cache\n\n\ndef test_maxsize():\n    assert Cache(maxsize=2).maxsize == 2\n',
  'tests/test_lru.py':
    'from cachekit import LRUCache\n\n\ndef test_get():\n    cache = LRUCache(maxsize=2)\n    cache["a"] = 1\n    assert cache["a"] == 1\n',
  'docs/index.rst': 'cachekit\n========\n',
  '.github/workflows/ci.yml':
    'name: CI\non: [push, pull_request]\njobs:\n  main:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: "3.12"\n      - run: pip install tox\n      - run: tox\n',
};

export function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: HERMETIC_GIT_ENV,
    encoding: 'utf8',
  }).trim();
}

function isMergeSubject(history: History, index: number): boolean {
  return history === 'pr-merges' || (history === 'mixed' && index % 2 === 1);
}

function buildRepository(
  prefix: string,
  files: Readonly<Record<string, string>>,
  moduleDir: string,
  subject: (index: number) => string,
): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(dir, ['init', '--quiet']);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'initial commit']);
  for (let index = 1; index < COMMITS; index += 1) {
    writeFileSync(join(dir, moduleDir, `m${index}.py`), `VALUE_${index} = ${index}\n`);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', subject(index)]);
  }
  return dir;
}

/** COMMITS commits: the files, then one module per commit, each subject shaped by the history. */
export function buildMatrixOrigin(history: History, evidence: Evidence): string {
  return buildRepository(`cejel-f1-${history}-${evidence}-`, matrixFiles(evidence), 'src/cachelib', (index) =>
    isMergeSubject(history, index) ? `Merge pull request #${index} from contributor/topic-${index}` : `add module ${index}`,
  );
}

/** The #114 depth-1 pair's shape: COMMITS direct commits, none a pull-request merge. */
export function buildCacheLibraryOrigin(): string {
  return buildRepository('cejel-f1-cache-library-', CACHE_LIBRARY_FILES, 'src/cachekit', (index) => `Fix issue ${index}.`);
}

export function cloneRepository(origin: string, depth?: number): string {
  const target = join(mkdtempSync(join(tmpdir(), 'cejel-f1-clone-')), 'repo');
  git(tmpdir(), [
    '-c',
    'protocol.file.allow=always',
    'clone',
    '--quiet',
    ...(depth === undefined ? [] : ['--depth', String(depth)]),
    `file://${origin}`,
    target,
  ]);
  return target;
}

export function scanRepository(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'shallow-history-f1',
    productDisplayName: 'Shallow history F1',
    generatedAt: '2026-10-28T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

export function criterionOf(report: WitanReport, id: string): WitanCriterionScore {
  const found = report.criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

const round = (score: number) => Math.round(score * 10) / 10;

/** A category composite as scoring.ts's averageScore computes it with every unscored criterion left out. */
export function compositeWithoutUnscored(report: WitanReport, category: 'code_trust' | 'process_trust'): number {
  const scored = report.criteria.filter(
    (entry) => entry.category === category && entry.status !== 'not_applicable' && entry.status !== 'insufficient_data',
  );
  return scored.length === 0 ? 0 : round(scored.reduce((sum, { score }) => sum + score, 0) / scored.length);
}

/** A metric's normalized value, as scoreMetrics reads it. */
export function normalizedMetric(score: WitanCriterionScore, name: string): number | undefined {
  const metric = score.metrics.find((entry) => entry.name === name);
  if (!metric) return undefined;
  return metric.max ? Math.min(metric.value / metric.max, 1) : Math.min(metric.value, 1);
}
