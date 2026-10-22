import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { analyzeCoverageConfiguration } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V26,
  WITAN_RUBRIC_VERSION_V27,
} from '../rubric-version.js';

// goal_cejel_scan_path_regex_bounds_2026-10-15. A scanner of untrusted repositories must never
// evaluate a regular expression the repository supplies, and must match declared globs in bounded
// time. Two scan-path stalls, each proven by a timing guard that runs the real scan in a child
// process (a stalled V8 regex blocks its own thread, so only a kill can stop it):
//
//   1. `pnpm run /<regex>/` in a package script was compiled and tested against the repository's
//      own script names; `/^(a+)+$/` against a long script name backtracks catastrophically. The
//      literal that found the selector was itself exponential on an unterminated backslash run.
//   2. Each `*` in a declared workspace glob became `[^/]*` in an anchored regex; a glob with many
//      stars against a long directory name backtracks polynomially.
//
// Synthetic fixtures only. Nothing here is derived from a real repository.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CHILD = fileURLToPath(new URL('./fixtures/scan-repo-child.ts', import.meta.url));

// The scan itself must finish inside SCAN_BUDGET_MS, measured around the scan in the child. The
// hard kill is wider only to absorb child start-up (loading TypeScript through tsx) on a loaded CI
// runner; before the fix, neither fixture finishes inside the kill window at all.
const SCAN_BUDGET_MS = 2_000;
const KILL_AFTER_MS = 20_000;

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-scan-path-bounds-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  execFileSync('git', ['add', '-f', '-A', '.'], { cwd: repo });
  return repo;
}

interface ChildScan {
  readonly elapsedMs: number;
  readonly a1Findings: readonly string[];
  readonly b3ScriptDepthCondition: string | null;
}

function scanInChild(repo: string, rubricVersion: string): ChildScan {
  const started = performance.now();
  const result = spawnSync(process.execPath, ['--import', 'tsx', CHILD, repo, rubricVersion], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: KILL_AFTER_MS,
    killSignal: 'SIGKILL',
  });
  const wallMs = performance.now() - started;
  if (result.signal === 'SIGKILL' || result.error) {
    throw new Error(
      `scan did not finish: killed after ${Math.round(wallMs)} ms (budget ${SCAN_BUDGET_MS} ms)`,
    );
  }
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as ChildScan;
}

const PATHOLOGICAL_SCRIPT_NAME = `${'a'.repeat(40)}!`;
const SELECTOR_FIXTURE: Record<string, string> = {
  'package.json': `${JSON.stringify({
    name: 'synthetic-regex-selector',
    version: '1.0.0',
    scripts: {
      test: 'pnpm run /^(a+)+$/',
      [PATHOLOGICAL_SCRIPT_NAME]: 'vitest run --coverage',
    },
    devDependencies: { vitest: '2.1.9' },
  })}\n`,
  'src/value.ts': 'export const value = 1;\n',
  'test/value.test.ts':
    "import { expect, it } from 'vitest';\nit('works', () => expect(1).toBe(1));\n",
};

// The literal that used to find the selector, `\/((?:\\.|[^/])+)\/`, could read each backslash two
// ways, so an unterminated run of them backtracked exponentially before any selector was compiled.
const BACKSLASH_FIXTURE: Record<string, string> = {
  ...SELECTOR_FIXTURE,
  'package.json': `${JSON.stringify({
    name: 'synthetic-backslash-selector',
    version: '1.0.0',
    scripts: { test: `pnpm run /${'\\'.repeat(60)}x`, 'test:coverage': 'vitest run --coverage' },
    devDependencies: { vitest: '2.1.9' },
  })}\n`,
};

const PATHOLOGICAL_GLOB =`${'*a'.repeat(12)}*b`;
const PATHOLOGICAL_DIRECTORY = 'a'.repeat(40);
const GLOB_FIXTURE: Record<string, string> = {
  'package.json': `${JSON.stringify({
    private: true,
    workspaces: [PATHOLOGICAL_GLOB],
    scripts: { start: 'node src/main.js' },
  })}\n`,
  'src/main.js': "console.log('ok');\n",
  [`${PATHOLOGICAL_DIRECTORY}/package.json`]:
    '{"name":"@fixture/aaaa","scripts":{"test":"vitest run"}}\n',
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\njobs:\n  job:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n',
};

// #520, #517, #518 (found in review of #521): the first lockfile-requirement patterns were a command
// word, `[^\n]*?`, then a flag, quadratic in line length (a 500 KB line of `yarn ` cost about 9 s
// per pattern), and the conftest comment strip `[ \t]+#.*$` was quadratic in a whitespace run. Each
// workflow here is one line just under the content size limit, built from the units those patterns
// stalled on; the conftest is one hook with a long whitespace run before a `#`.
const LINE_BYTES = 480_000;
const adversarialLine = (unit: string): string => unit.repeat(Math.floor(LINE_BYTES / unit.length));
const CI_LINE_FIXTURE: Record<string, string> = {
  'pyproject.toml': '[project]\nname = "lines"\nversion = "1.0.0"\ndependencies = ["requests>=2"]\n',
  'src/lines/__init__.py': 'VALUE = 1\n',
  'tests/test_lines.py': 'def test_value():\n    assert 1 == 1\n',
  'tests/conftest.py': `def pytest_collection_modifyitems(config, items):\n    for item in items:${' '.repeat(LINE_BYTES)}#\n        item.add_marker(pytest.mark.skip)\n`,
  ...Object.fromEntries(
    ['yarn ', 'uv run ', 'cargo b ', 'pnpm i ', 'npm npm ', 'poetry check '].map((unit, index) => [
      `.github/workflows/w${index}.yml`,
      `name: w${index}\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${adversarialLine(unit)}\n`,
    ]),
  ),
};

// #520 (third review of #521): the workflow step reader walked back through the file once per
// `run:` key to find its list item and its job's `steps:`, and each lockfile-requiring command
// rescanned every command in the workflow for one that writes the lockfile, so the reader was
// quadratic in the number of steps under every rubric. Each workflow here is just under the
// content size limit: 24,000 steps in one job (12 s before the fix), and 24,000 `run:` keys outside
// any list (20 s).
const STEP_COUNT = 24_000;
const WORKFLOW_HEAD = 'name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n';
const LONG_WORKFLOW_FIXTURE: Record<string, string> = {
  'package.json': '{"name":"steps","version":"1.0.0","dependencies":{"zod":"^3.0.0"}}\n',
  'index.js': 'export const a = 1;\n',
  '.github/workflows/steps.yml': `${WORKFLOW_HEAD}${'      - run: npm ci\n'.repeat(STEP_COUNT)}      - run: npm install\n`,
  '.github/workflows/keys.yml': `${WORKFLOW_HEAD}${'        run: npm ci\n'.repeat(STEP_COUNT)}`,
};

// #520 (fourth review, of #533): the reader then rescanned each step's extent for a guard key and
// each job's extent for a job guard, once per step and once per job, so its cost was the nesting
// depth times the file size, not linear as #533 said: 990 nested `- run:` items padded to 511 KB
// took 1.3 s per file under v17, and 16 such files 18.1 s. The flat shape above never nests. Each
// workflow here is just under the content size limit; half nest list items, half nest `steps:`
// keys (one job per level). `npm install` first means no step is claimed, so every file is read.
const NESTED_LIMIT = 511_000;
const NESTED_HEAD = 'name: ci\non: push\njobs:\n  t:\n    steps:\n      - run: npm install\n';
function nestedWorkflow(levels: readonly string[], tailIndent: number): string {
  const body = `${NESTED_HEAD}${levels.join('')}`;
  const tail = `${' '.repeat(tailIndent)}x\n`;
  return `${body}${tail.repeat(Math.max(0, Math.floor((NESTED_LIMIT - body.length) / tail.length)))}`;
}
const NESTED_ITEMS = 990;
const NESTED_STEPS_KEYS = 490;
const NESTED_ITEMS_WORKFLOW = nestedWorkflow(
  Array.from({ length: NESTED_ITEMS }, (_, depth) => `${' '.repeat(6 + depth)}- run: npm ci\n`),
  6 + NESTED_ITEMS + 2,
);
const NESTED_STEPS_KEYS_WORKFLOW = nestedWorkflow(
  Array.from(
    { length: NESTED_STEPS_KEYS },
    (_, depth) => `${' '.repeat(6 + 2 * depth)}steps:\n${' '.repeat(7 + 2 * depth)}- run: npm ci\n`,
  ),
  6 + 2 * NESTED_STEPS_KEYS + 2,
);
const NESTED_WORKFLOW_FILES = 8;
const NESTED_WORKFLOW_FIXTURE: Record<string, string> = {
  'package.json': '{"name":"nested","version":"1.0.0","dependencies":{"zod":"^3.0.0"}}\n',
  'index.js': 'export const a = 1;\n',
  ...Object.fromEntries(
    Array.from({ length: NESTED_WORKFLOW_FILES }, (_, index) => [
      `.github/workflows/nested-${index}.yml`,
      index % 2 === 0 ? NESTED_ITEMS_WORKFLOW : NESTED_STEPS_KEYS_WORKFLOW,
    ]),
  ),
};

// #520 (found while fixing the fourth review): #533 trimmed a `cd` target and a `working-directory`
// value with `.replace(/\/+$/, '')`, which retries the slash run from every position in it, so a
// run of slashes not at the end of the value is quadratic: a 480,000-slash value followed by one
// letter took about 80 s per workflow on #533. Directory paths are now trimmed by a loop.
const SLASH_RUN = `${'/'.repeat(LINE_BYTES)}a`;
const SLASH_RUN_FIXTURE: Record<string, string> = {
  'package.json': '{"name":"slashes","version":"1.0.0","dependencies":{"zod":"^3.0.0"}}\n',
  'index.js': 'export const a = 1;\n',
  '.github/workflows/cd.yml': `${WORKFLOW_HEAD}      - run: cd ${SLASH_RUN}\n`,
  '.github/workflows/wd.yml': `${WORKFLOW_HEAD}      - run: npm ci\n        working-directory: ${SLASH_RUN}\n`,
};

// The readers the post-merge review of #521 added (v27): the publish-only step classifier, the
// collection-hook loop tie, and the multi-line pytestmark reader. A run of 120,000 environment
// assignments before `npm publish` took about 23 s when each was dropped with a fresh array slice.
const PUBLISH_ONLY_ASSIGNMENTS = 'X=1 '.repeat(120_000);
const PUBLISH_ONLY_RUNNER_FLAGS = '-y '.repeat(150_000);
const NESTED_HOOK_LOOPS = Array.from({ length: 900 }, (_, depth) => `${' '.repeat(4 + depth)}for item in items:\n`).join('');
const REVIEW_521_READER_FIXTURE: Record<string, string> = {
  'package.json': '{"name":"readers","version":"1.0.0","dependencies":{"zod":"^3.0.0"}}\n',
  'index.js': 'export const a = 1;\n',
  'pyproject.toml': `[project]\nname = "readers"\nversion = "1.0.0"\ndependencies = []\n${'[tool.hatch.build.targets.wheelx\n'.repeat(14_000)}`,
  'tests/test_a.py': `import pytest\npytestmark = pytest.mark.skip(\n${'(\n'.repeat(200_000)}def test_a():\n    assert 1\n`,
  'tests/conftest.py': `import pytest\n\n\ndef pytest_collection_modifyitems(items):\n${NESTED_HOOK_LOOPS}`,
  // Review of #553: an unclosed quote run of escaped quotes inside a `for item in items:` loop.
  'tests/unclosed/conftest.py': `import pytest\n\n\ndef pytest_collection_modifyitems(items):\n    for item in items:\n        x = '${"a\\'".repeat(160_000)}\n`,
  '.github/workflows/assignments.yml': `${WORKFLOW_HEAD}      - run: ${PUBLISH_ONLY_ASSIGNMENTS}npm publish\n`,
  '.github/workflows/runner-flags.yml': `${WORKFLOW_HEAD}      - run: npx ${PUBLISH_ONLY_RUNNER_FLAGS}semantic-release\n`,
  // The repository read a publish-only workflow triggers (review of #553): the root manifest, for
  // npm lifecycle scripts, when the workflow publishes with npm. The Python workflow is not
  // admitted (a build), and its 14,000-line pyproject.toml is read by the other criteria.
  '.github/workflows/package-check.yml': `${WORKFLOW_HEAD}      - run: npm publish\n`,
  '.github/workflows/python-check.yml': `${WORKFLOW_HEAD}      - run: python -m build\n      - run: twine upload dist/x\n`,
  'tests/bound/conftest.py': `def pytest_collection_modifyitems(items):\n${'    items.clear()\n'.repeat(28_000)}`,
};

describe('timing guards: the real scan finishes on pathological repository input', () => {
  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'CI lines and a conftest whitespace run just under the content limit — %s',
    (rubric) => {
      const scan = scanInChild(makeRepo(CI_LINE_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'workflows of 24,000 steps in one job and 24,000 `run:` keys outside a list — %s',
    (rubric) => {
      const scan = scanInChild(makeRepo(LONG_WORKFLOW_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    `${NESTED_WORKFLOW_FILES} workflows just under the content limit, of ${NESTED_ITEMS} nested list items or ${NESTED_STEPS_KEYS} nested \`steps:\` keys — %s`,
    (rubric) => {
      expect(NESTED_ITEMS_WORKFLOW.length).toBeLessThan(512_000);
      expect(NESTED_STEPS_KEYS_WORKFLOW.length).toBeLessThan(512_000);
      expect(NESTED_STEPS_KEYS_WORKFLOW.length).toBeGreaterThan(500_000);
      const scan = scanInChild(makeRepo(NESTED_WORKFLOW_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'a `cd` target and a `working-directory` of 480,000 slashes before a letter — %s',
    (rubric) => {
      const scan = scanInChild(makeRepo(SLASH_RUN_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'a publish step behind 120,000 assignments or 150,000 runner flags, 900 nested hook loops, an unclosed run of escaped quotes in a hook loop, and a 200,000-line pytestmark — %s',
    (rubric) => {
      for (const contents of Object.values(REVIEW_521_READER_FIXTURE)) {
        expect(contents.length).toBeLessThan(512_000);
      }
      const scan = scanInChild(makeRepo(REVIEW_521_READER_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26])(
    '`pnpm run /^(a+)+$/` beside a script named 40 `a`s and `!` — %s',
    (rubric) => {
      const scan = scanInChild(makeRepo(SELECTOR_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26])(
    '`pnpm run /` followed by 60 unterminated backslashes — %s',
    (rubric) => {
      const scan = scanInChild(makeRepo(BACKSLASH_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26])(
    'a workspace glob of 12 `*a` pairs and `*b` beside a 40-character directory of `a`s — %s',
    (rubric) => {
      const scan = scanInChild(makeRepo(GLOB_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
      // The glob does not match the directory (it ends in `b`), so only the root is read.
      expect(scan.b3ScriptDepthCondition).toBe(
        'package scripts for this metric are read from the root package.json only; 1 other package.json file present',
      );
    },
    KILL_AFTER_MS + 10_000,
  );
});

describe('a `pnpm run /…/` selector is a dynamic reference, never an evaluated regex', () => {
  function coverage(files: Readonly<Record<string, string>>) {
    const repo = makeRepo(files);
    const repoFiles = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    return analyzeCoverageConfiguration(repo, repoFiles);
  }

  it('a selector beside a coverage-collecting script leaves the package unresolved, not credited', () => {
    // `/^test:/` would select `test:coverage` if evaluated; Cejel no longer evaluates it, so the
    // reference is dynamic and the existing dynamic handling withholds both credit and absence.
    const analysis = coverage({
      'package.json': `${JSON.stringify({
        name: 'synthetic-regex-selector',
        version: '1.0.0',
        scripts: { test: 'pnpm run /^test:/', 'test:coverage': 'vitest run --coverage' },
        devDependencies: { vitest: '2.1.9' },
      })}\n`,
      'src/value.ts': 'export const value = 1;\n',
    });
    expect(analysis.coverageFiles).not.toContain('package.json');
    expect(analysis.unresolvedFiles).toContain('package.json');
    expect(analysis.hasCoverageCommand).toBe(false);
  });

  it('a literal script name is still followed (unchanged)', () => {
    const analysis = coverage({
      'package.json': `${JSON.stringify({
        name: 'synthetic-literal-reference',
        version: '1.0.0',
        scripts: { test: 'pnpm run test:coverage', 'test:coverage': 'vitest run --coverage' },
        devDependencies: { vitest: '2.1.9' },
      })}\n`,
      'src/value.ts': 'export const value = 1;\n',
    });
    expect(analysis.coverageFiles).toContain('package.json');
    expect(analysis.hasCoverageCommand).toBe(true);
  });
});
