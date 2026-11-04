import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  analyzeCoverageConfiguration,
  findPytestRunWideSkips,
  isShellWhitespaceCode,
  readPytestDeclaredOptions,
  readPytestInvocations,
  shellWords,
} from '../repo-signals.js';
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
  readonly b2Notes: string | null;
  readonly b3Notes: string | null;
  readonly b3Disclosures: readonly string[];
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

// #527 and #535 (v27): B2 and B3 each run the shared uncredited-workflow predicate (publish-only
// reader, then print-only reader) over every CI workflow, B3 once for both depth metrics. A
// print-only workflow of 24,000 steps and an upload-only workflow of 3,300 download-and-upload step
// pairs, each just under the content limit, are read that way under v27. (Four of each made the
// other guards in this file miss their budget when the full suite ran in parallel.)
const PRINT_ONLY_LONG_WORKFLOW = `name: e2e\non:\n  pull_request:\njobs:\n  e2e:\n    runs-on: ubuntu-latest\n    steps:\n${'      - run: echo a\n'.repeat(24_000)}`;
const UPLOAD_ONLY_LONG_WORKFLOW = `name: publish\non:\n  push:\n    tags: ['*']\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    permissions:\n      id-token: write\n    steps:\n${'      - uses: actions/download-artifact@v4\n        with:\n          name: dist\n          path: dist\n      - uses: pypa/gh-action-pypi-publish@release/v1\n'.repeat(3_300)}`;
const UNCREDITED_WORKFLOW_FIXTURE: Record<string, string> = {
  'pyproject.toml': '[project]\nname = "uncredited"\nversion = "1.0.0"\ndependencies = []\n',
  'src/uncredited/__init__.py': 'def f():\n    return 1\n',
  '.github/workflows/print.yml': PRINT_ONLY_LONG_WORKFLOW,
  '.github/workflows/upload.yml': UPLOAD_ONLY_LONG_WORKFLOW,
};

describe('timing guards: the real scan finishes on pathological repository input', () => {
  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'a print-only and an upload-only workflow just under the content limit, read by B2 and B3 (#527, #535) — %s',
    (rubric) => {
      expect(PRINT_ONLY_LONG_WORKFLOW.length).toBeLessThan(512_000);
      expect(PRINT_ONLY_LONG_WORKFLOW.length).toBeGreaterThan(450_000);
      expect(UPLOAD_ONLY_LONG_WORKFLOW.length).toBeLessThan(512_000);
      expect(UPLOAD_ONLY_LONG_WORKFLOW.length).toBeGreaterThan(450_000);
      const scan = scanInChild(makeRepo(UNCREDITED_WORKFLOW_FIXTURE), rubric);
      expect(scan.elapsedMs).toBeLessThan(SCAN_BUDGET_MS);
      // Both readers classified both files in full: an early bail-out would keep them credited and
      // drop them from these sentences, so a fast but incomplete reader fails here.
      if (rubric === WITAN_RUBRIC_VERSION_V27) {
        for (const notes of [scan.b2Notes, scan.b3Notes]) {
          expect(notes).toContain('.github/workflows/print.yml');
          expect(notes).toContain('.github/workflows/upload.yml');
        }
      } else {
        expect(scan.b3Disclosures.join(' ')).toContain('.github/workflows/print.yml only prints text');
      }
    },
    KILL_AFTER_MS + 10_000,
  );

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

// goal_cejel_v27_conftest_timing_guard_2026-11-02, item C. The whole-scan budget above is absolute,
// so a reader whose cost grows faster than its input can sit just under it on a fast machine and
// fail on a slower runner (the v27 guard on CI_LINE_FIXTURE did, after #626). This check times each
// v27 A1 reader the guard exercises, on its own, at an input length L and at 2L, and refuses a
// ratio above 3: a linear reader roughly doubles, one that grows with the square quadruples. The
// fastest of seven samples at each length, taken alternately after a warm-up, is compared, so a
// single stall on a loaded runner does not decide it (cejel #642). Each reader must return the same answer at both lengths, so a reader that
// stops early cannot pass by being fast.
const SCALING_LENGTH = 240_000;
const SCALING_RATIO_LIMIT = 3;
const CI_LINE_UNITS = ['yarn ', 'uv run ', 'cargo b ', 'pnpm i ', 'npm npm ', 'poetry check '];

// A reader can take well under a millisecond once optimised, where a timer and a stray pause
// decide the ratio. Each timed sample therefore repeats the read enough times that, at L, it takes
// at least SCALING_SAMPLE_MS; 2L is read the same number of times. cejel #642: the samples at L and
// at 2L are taken in alternation, so a burst of load on the host falls on both lengths alike rather
// than on one phase, and the floor is well above one read (about 20 ms for the run reader), so a
// sample is never decided by one or two reads.
const SCALING_SAMPLE_MS = 80;
const SCALING_PAIRS = 7;

// cejel #642: a sample is timed in this process's own CPU time (user and system), not wall time,
// so the time it spends preempted by other work on a loaded host is not counted.
function timeMs(read: () => unknown, repetitions: number): number {
  const started = process.cpuUsage();
  for (let repetition = 0; repetition < repetitions; repetition += 1) read();
  const used = process.cpuUsage(started);
  return (used.user + used.system) / 1000;
}

/** cejel #642: the fastest timed sample at L and at 2L, from samples taken alternately, and their ratio. */
function interleavedRatio(readL: () => unknown, read2L: () => unknown, repetitions: number): { msL: number; ms2L: number; ratio: number } {
  let msL = Number.POSITIVE_INFINITY;
  let ms2L = Number.POSITIVE_INFINITY;
  for (let pair = 0; pair < SCALING_PAIRS; pair += 1) {
    msL = Math.min(msL, timeMs(readL, repetitions));
    ms2L = Math.min(ms2L, timeMs(read2L, repetitions));
  }
  return { msL, ms2L, ratio: ms2L / msL };
}

function scalingRatio<T>(read: (length: number) => T, length = SCALING_LENGTH): { ratio: number; timing: string; atL: T; at2L: T } {
  const atL = read(length);
  const at2L = read(2 * length);
  // Warm both lengths, then find how many reads at L fill a sample.
  for (let warm = 0; warm < 3; warm += 1) {
    read(length);
    read(2 * length);
  }
  let repetitions = 1;
  while (repetitions < 65_536 && timeMs(() => read(length), repetitions) < SCALING_SAMPLE_MS) repetitions *= 2;
  const { msL, ms2L, ratio } = interleavedRatio(() => read(length), () => read(2 * length), repetitions);
  const timing = `${repetitions} reads per sample, ${SCALING_PAIRS} alternating pairs, CPU time: L ${msL.toFixed(1)} ms, 2L ${ms2L.toFixed(1)} ms, ratio ${ratio.toFixed(2)}`;
  return { ratio, timing, atL, at2L };
}

describe('scaling: the ratio check itself (cejel #642)', () => {
  // The check must still tell a reader whose cost grows with the square from a linear one. Both
  // stand-ins do arithmetic only, sized so a sample fills the floor quickly.
  const work = (iterations: number): number => {
    let total = 0;
    for (let index = 0; index < iterations; index += 1) total = (total + index * 31) % 1_000_003;
    return total;
  };
  it('refuses a stand-in reader whose work grows with the square of its input', () => {
    const { ratio, timing } = scalingRatio((length) => work((length / 400) ** 2), SCALING_LENGTH);
    expect(ratio, timing).toBeGreaterThan(SCALING_RATIO_LIMIT);
  }, 60_000);
  it('admits a stand-in reader whose work grows with its input', () => {
    const { ratio, timing } = scalingRatio((length) => work(length * 4), SCALING_LENGTH);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
});

describe('scaling: each v27 A1 reader the CI-line guard exercises grows no faster than linearly', () => {
  it('the conftest hook reader, on a whitespace run inside the hook loop of length L and 2L', () => {
    const repos = new Map<number, string>();
    const repoFor = (length: number): string => {
      const existing = repos.get(length);
      if (existing) return existing;
      const repo = makeRepo({
        'tests/test_lines.py': 'def test_value():\n    assert 1 == 1\n',
        'tests/conftest.py': `def pytest_collection_modifyitems(config, items):\n    for item in items:${' '.repeat(length)}#\n        item.add_marker(pytest.mark.skip)\n`,
      });
      repos.set(length, repo);
      return repo;
    };
    const files = ['tests/conftest.py', 'tests/test_lines.py'];
    const { ratio, timing, atL, at2L } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    expect(atL.map((skip) => skip.kind)).toEqual(['skip']);
    expect(at2L).toEqual(atL);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);

  // goal_cejel_v27_a1_restore_proof_v2_2026-11-02, item F: a hook body of N stored lambdas that each
  // name items took 1.5 s at N = 2,000 and 41 s at N = 12,000 in the reader of #638 (the set of
  // closure names was rebuilt for every statement). The clear at the end must still be read, so
  // the answer at both lengths is the same deselect-everything hook.
  it('the conftest hook reader, on a hook body of L/80 and 2L/80 stored lambdas that each name items', () => {
    const repos = new Map<number, string>();
    const repoFor = (length: number): string => {
      const existing = repos.get(length);
      if (existing) return existing;
      const count = Math.floor(length / 80);
      const body = Array.from({ length: count }, (_, index) => `    cb${index} = lambda: items.sort()\n`).join('');
      const repo = makeRepo({
        'tests/test_lines.py': 'def test_value():\n    assert 1 == 1\n',
        'tests/conftest.py': `def pytest_collection_modifyitems(config, items):\n${body}    items.clear()\n`,
      });
      repos.set(length, repo);
      return repo;
    };
    const files = ['tests/conftest.py', 'tests/test_lines.py'];
    const { ratio, timing, atL, at2L } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    expect(atL.map((skip) => skip.kind)).toEqual(['clear']);
    expect(at2L).toEqual(atL);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);

  // #644 review at bca7ebfbf: a restoring hook is credited only after its whole conftest.py is read
  // for a statement that may rebind a name the allowlist trusts. That module read must be linear:
  // a module of L/80 and 2L/80 lines, each naming called `list` and `tuple` attributes, beside a
  // hook that restores, gives the same withheld rule at both lengths.
  it('the conftest module rebind read, on a module of L/80 and 2L/80 lines of called list and tuple attributes', () => {
    const repos = new Map<number, string>();
    const repoFor = (length: number): string => {
      const existing = repos.get(length);
      if (existing) return existing;
      const count = Math.floor(length / 80);
      const module = Array.from({ length: count }, (_, index) => `v${index} = box.list(box.tuple(box.attr))  # ${index}\n`).join('');
      const repo = makeRepo({
        'tests/test_lines.py': 'def test_value():\n    assert 1 == 1\n',
        'tests/conftest.py': `${module}\n\ndef pytest_collection_modifyitems(config, items):\n    saved = list(items)\n    items.clear()\n    items.extend(saved)\n`,
      });
      repos.set(length, repo);
      return repo;
    };
    const files = ['tests/conftest.py', 'tests/test_lines.py'];
    const { ratio, timing, atL, at2L } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    // The hook's def line moves with the module's length; everything else must agree.
    const shape = (skips: typeof atL) => skips.map(({ line: _line, ...rest }) => rest);
    expect(atL.map((skip) => [skip.kind, skip.withheld !== undefined, skip.unread])).toEqual([['clear', true, undefined]]);
    expect(shape(at2L)).toEqual(shape(atL));
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);

  it('the pytest run reader, on six CI lines of length L and 2L, each ending in a pytest run', () => {
    const files = CI_LINE_UNITS.map((_, index) => `.github/workflows/w${index}.yml`);
    const textsFor = (length: number): Map<string, string> =>
      new Map(
        CI_LINE_UNITS.map((unit, index) => [
          `.github/workflows/w${index}.yml`,
          `name: w${index}\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${unit.repeat(Math.floor(length / unit.length))}&& pytest\n`,
        ]),
      );
    const texts = new Map([SCALING_LENGTH, 2 * SCALING_LENGTH].map((length) => [length, textsFor(length)]));
    const { ratio, timing, atL, at2L } = scalingRatio((length) =>
      readPytestInvocations(files, (file) => texts.get(length)?.get(file)),
    );
    // The root default, then the `pytest` at the end of each line: every line was read to its end.
    expect(atL).toHaveLength(1 + CI_LINE_UNITS.length);
    expect(at2L).toEqual(atL);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
});

// goal_cejel_v27_a1_gaps_2026-11-03. Each new reader, on the input that maximises its work.
describe('scaling: the v27 A1 gap readers grow no faster than linearly', () => {
  // Item A: a hook credited on a list(items) copy reads every Python file the repository tracks for
  // a way to reach builtins (the review of #655, blocker 3); here one helper module of L bytes holds
  // only near misses of each alternative (`builtin_s`, `getattrs`, `re.compile`, an uncalled-looking
  // `.list_`, `. ` before a call) and names builtins only at its end.
  it('the builtins search, on a helper module of L and 2L bytes naming builtins at its end', () => {
    const repos = new Map<number, string>();
    const repoFor = (length: number): string => {
      const existing = repos.get(length);
      if (existing) return existing;
      const count = Math.floor(length / 80);
      const helper = `${Array.from({ length: count }, (_, index) => `v${index} = re.compile(x.list_, getattrs, "builtin_s") . list()`).join('\n')}\nimport builtins\n`;
      const repo = makeRepo({
        'tests/test_lines.py': 'def test_value():\n    assert 1 == 1\n',
        'tests/helpers.py': helper,
        'tests/conftest.py': 'def pytest_collection_modifyitems(config, items):\n    saved = list(items)\n    items.clear()\n    items.extend(saved)\n',
      });
      repos.set(length, repo);
      return repo;
    };
    const files = ['tests/conftest.py', 'tests/helpers.py', 'tests/test_lines.py'];
    const { ratio, timing, atL, at2L } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    expect(atL.map((skip) => skip.withheld)).toEqual(['hook not read: `saved = list(items)` in tests/conftest.py calls a builtin, which tests/helpers.py may replace']);
    expect(at2L).toEqual(atL);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);

  // Item B: without its budget, a noxfile of N calls taking *session.posargs and a CI file passing
  // 16 distinct sets of W words cost N x 16 x W. Both grow with L here: N = L/400 calls and sets of
  // L/2,000 words, so an unbounded reader's work grows with the square of L.
  it('the nox posargs reader, on L/400 calls taking posargs and 16 CI sets of L/2,000 words', () => {
    const textsFor = (length: number): Map<string, string> => {
      const calls = Array.from({ length: Math.floor(length / 400) }, () => '    session.run("pytest", *session.posargs)').join('\n');
      const words = Math.floor(length / 2000);
      const steps = Array.from({ length: 16 }, (_, set) => `      - run: nox -s tests -- ${Array.from({ length: words }, (_, word) => `-k s${set}w${word}`).join(' ')}`).join('\n');
      return new Map([
        ['noxfile.py', `import nox\n\n\n@nox.session\ndef tests(session):\n${calls}\n`],
        ['.github/workflows/ci.yml', `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n${steps}\n`],
      ]);
    };
    const files = ['.github/workflows/ci.yml', 'noxfile.py'];
    const texts = new Map([SCALING_LENGTH, 2 * SCALING_LENGTH].map((length) => [length, textsFor(length)]));
    const { ratio, timing, atL, at2L } = scalingRatio((length) => readPytestInvocations(files, (file) => texts.get(length)?.get(file)));
    // Past the budget the remaining calls are named as not read, at both lengths.
    expect(atL.some(({ unread }) => unread === 'session.run("pytest", *session.posargs)')).toBe(true);
    expect(at2L.some(({ unread }) => unread === 'session.run("pytest", *session.posargs)')).toBe(true);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);

  // The review of #655, blocker 2: the unread posargs entries were said once per noxfile, so M
  // noxfiles and U unread CI entries gave M x U runs, and spreading them into one call overflowed
  // the stack (400 and 400 threw RangeError). They are said once per read and count against the
  // budget. The input that maximises the work: M noxfiles each taking posargs, and U CI steps each
  // passing a variable after --; here M = U = L/2,000.
  const unreadNoxTexts = (noxfiles: number, steps: number): { files: string[]; texts: Map<string, string> } => {
    const texts = new Map<string, string>();
    for (let index = 0; index < noxfiles; index += 1) {
      texts.set(`d${index}/noxfile.py`, 'import nox\n\n\n@nox.session\ndef tests(session):\n    session.run("pytest", *session.posargs)\n');
    }
    const stepLines = Array.from({ length: steps }, (_, index) => `      - run: nox -- $X${index}`).join('\n');
    texts.set('.github/workflows/ci.yml', `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n${stepLines}\n`);
    return { files: [...texts.keys()].sort(), texts };
  };

  it('the nox reader, on 400 noxfiles taking posargs and 400 CI steps passing a variable: no crash, output linear', () => {
    const { files, texts } = unreadNoxTexts(400, 400);
    const read = readPytestInvocations(files, (file) => texts.get(file));
    // One root run, one run per noxfile call read with the empty set or named past the budget, and
    // each unread CI step named once.
    expect(read.length).toBeLessThanOrEqual(1 + 400 + 400);
    expect(read.filter(({ unread }) => unread === 'nox -- $X0').length).toBe(1);
  }, 60_000);

  it('the nox reader, on L/2,000 noxfiles taking posargs and L/2,000 CI steps passing a variable', () => {
    const inputs = new Map([SCALING_LENGTH, 2 * SCALING_LENGTH].map((length) => [length, unreadNoxTexts(length / 2000, length / 2000)]));
    const { ratio, timing, atL, at2L } = scalingRatio((length) => {
      const { files, texts } = inputs.get(length) ?? { files: [], texts: new Map<string, string>() };
      return readPytestInvocations(files, (file) => texts.get(file));
    });
    expect(atL.filter(({ unread }) => unread === 'nox -- $X0').length).toBe(1);
    expect(at2L.filter(({ unread }) => unread === 'nox -- $X0').length).toBe(1);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  // Item C: the conftest option reader, on L/60 addoption calls and on one call left open to the
  // end of a file of L bytes (read once, never again from each later line).
  it('the conftest option reader, on L/60 declarations and on an unclosed call of L bytes', () => {
    const textsFor = (length: number): Map<string, string> => {
      const declarations = Array.from({ length: Math.floor(length / 60) }, (_, index) => `    parser.addoption("--opt-${index}", action="store_true")`).join('\n');
      const open = `def pytest_addoption(parser):\n    parser.addoption(\n${'        "x", parser.addoption(\n'.repeat(Math.floor(length / 40))}`;
      return new Map([
        ['conftest.py', `def pytest_addoption(parser):\n${declarations}\n`],
        ['tests/conftest.py', open],
      ]);
    };
    const files = ['conftest.py', 'tests/conftest.py'];
    const texts = new Map([SCALING_LENGTH, 2 * SCALING_LENGTH].map((length) => [length, textsFor(length)]));
    const { ratio, timing, atL, at2L } = scalingRatio((length) => readPytestDeclaredOptions(files, (file) => texts.get(length)?.get(file)));
    expect(atL.get('--opt-0')).toBe('flag');
    expect(at2L.get('--opt-0')).toBe('flag');
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
});

// goal_cejel_v27_conftest_timing_guard_2026-11-02, item B. The shell word scanner every reader
// shares now tests white space by character code and copies kept characters a run at a time. It must
// return the same words as the scanner it replaced, kept here verbatim as the specification.
function referenceScanShellWord(value: string, start: number): { word: string; end: number } | null {
  let result = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let index = start;
  while (index < value.length && /\s/u.test(value[index] ?? '')) index += 1;
  const wordStart = index;
  for (; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      if (character !== '\n') result += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      const nextCharacter = value[index + 1];
      const escapesNext =
        quote !== '"' ||
        nextCharacter === '$' ||
        nextCharacter === '`' ||
        nextCharacter === '"' ||
        nextCharacter === '\\' ||
        nextCharacter === '\n';
      if (escapesNext) {
        escaped = true;
      } else {
        result += character;
      }
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        result += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character ?? '')) break;
    result += character;
  }
  if (escaped || quote || index === wordStart) return null;
  return { word: result, end: index };
}

function referenceShellWords(segment: string): string[] {
  const words: string[] = [];
  let offset = 0;
  while (offset < segment.length) {
    const scanned = referenceScanShellWord(segment, offset);
    if (!scanned) break;
    words.push(scanned.word);
    if (scanned.end <= offset) break;
    offset = scanned.end;
  }
  return words;
}

describe('the shell word scanner returns the words the scanner it replaced returned', () => {
  it('reads white space exactly as /\\s/u does, for every UTF-16 code unit', () => {
    const differ: number[] = [];
    for (let code = 0; code <= 0xffff; code += 1) {
      if (isShellWhitespaceCode(code) !== /\s/u.test(String.fromCharCode(code))) differ.push(code);
    }
    expect(differ).toEqual([]);
  });

  it('splits 20,000 random strings of shell-significant characters into the same words', () => {
    // Quotes, escapes, newlines, operators, ASCII and Unicode white space, a non-space control
    // character, and both halves of a surrogate pair. A fixed seed, so a failure reproduces.
    const alphabet = [
      'a', 'b', ' ', '\t', '\n', '\r', '\v', '\f', "'", '"', '\\', '$', '`', '#', ';', '|', '&',
      '(', ')', '\u0000', '\u001c', ' ', ' ', ' ', ' ', '​', ' ',
      ' ', ' ', ' ', '　', '﻿', '\ud83d', '\ude00', 'é',
    ];
    let seed = 0x2026_1102;
    const next = (): number => {
      seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
      return seed;
    };
    const mismatches: string[] = [];
    for (let sample = 0; sample < 20_000; sample += 1) {
      const length = next() % 24;
      let text = '';
      for (let at = 0; at < length; at += 1) text += alphabet[next() % alphabet.length];
      if (JSON.stringify(shellWords(text)) !== JSON.stringify(referenceShellWords(text))) {
        mismatches.push(JSON.stringify(text));
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('splits hand-written shapes into the same words', () => {
    const shapes = [
      '',
      '   ',
      'pytest -q',
      "py'te'st \"-k\" 'a b'",
      'py\\\ntest',
      'a\\ b c',
      '"a\\"b" "c\\$d" "e\\x" "\\\\" "\\`"',
      "'a\\b' 'unclosed",
      '"unclosed',
      'trailing\\',
      'a b c﻿d​e',
      'x="1 2" y=\'3\' z',
      `${'yarn '.repeat(1_000)}&& pytest`,
      `${' '.repeat(1_000)}#`,
    ];
    for (const shape of shapes) expect(shellWords(shape)).toEqual(referenceShellWords(shape));
  });
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
