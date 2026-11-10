import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  analyzeCoverageConfiguration,
  b3TaskRunnerReadingsForScaling,
  b3TestPathReadingForScaling,
  b3UvProjectReadingForScaling,
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

// The scan itself is timed in wall time around the scan in the child. A v17 scan must finish
// inside SCAN_BUDGET_MS. Any other rubric's scan of the same input must finish inside the larger of
// SCAN_BUDGET_MS and V17_RATIO_LIMIT times a v17 scan of that input, run straight after it on the
// same runner (cejel #561, operator ruling 2026-11-04). Until then every rubric had the absolute
// budget alone, and a v27 guard failed on CI at 2,003 to 2,070 ms while the same scan took about
// 820 ms locally: the CI runner is roughly 2 to 2.5 times slower, so an absolute budget measured the
// runner. A v27 regex stall or super-linear reader still fails, since it puts v27 far above three
// times v17 (the check below shows both directions); v17 keeps the absolute budget, so a slowdown
// in code every rubric shares is still caught. The hard kill is wider only to absorb child start-up
// (loading TypeScript through tsx) on a loaded CI runner; before the fix, neither fixture finishes
// inside the kill window at all.
const SCAN_BUDGET_MS = 2_000;
const V17_RATIO_LIMIT = 3;
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

function scanInChild(repo: string, rubricVersion: string, standIn: Readonly<Record<string, string>> = {}): ChildScan {
  const started = performance.now();
  const result = spawnSync(process.execPath, ['--import', 'tsx', CHILD, repo, rubricVersion], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...standIn },
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

/** The budget a scan under `rubricVersion` is held to (see SCAN_BUDGET_MS), with the reason. */
function expectWithinBudget(
  scan: ChildScan,
  rubricVersion: string,
  repo: string,
  baselineStandIn: Readonly<Record<string, string>> = {},
): void {
  if (rubricVersion === WITAN_RUBRIC_VERSION_V17) {
    expect(scan.elapsedMs, `v17 ${Math.round(scan.elapsedMs)} ms`).toBeLessThan(SCAN_BUDGET_MS);
    return;
  }
  const baseline = scanInChild(repo, WITAN_RUBRIC_VERSION_V17, baselineStandIn);
  const allowed = Math.max(SCAN_BUDGET_MS, V17_RATIO_LIMIT * baseline.elapsedMs);
  expect(
    scan.elapsedMs,
    `${Math.round(scan.elapsedMs)} ms against ${Math.round(allowed)} ms (v17 on this runner ${Math.round(baseline.elapsedMs)} ms)`,
  ).toBeLessThan(allowed);
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
      const repo = makeRepo(UNCREDITED_WORKFLOW_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
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
      const repo = makeRepo(CI_LINE_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'workflows of 24,000 steps in one job and 24,000 `run:` keys outside a list — %s',
    (rubric) => {
      const repo = makeRepo(LONG_WORKFLOW_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    `${NESTED_WORKFLOW_FILES} workflows just under the content limit, of ${NESTED_ITEMS} nested list items or ${NESTED_STEPS_KEYS} nested \`steps:\` keys — %s`,
    (rubric) => {
      expect(NESTED_ITEMS_WORKFLOW.length).toBeLessThan(512_000);
      expect(NESTED_STEPS_KEYS_WORKFLOW.length).toBeLessThan(512_000);
      expect(NESTED_STEPS_KEYS_WORKFLOW.length).toBeGreaterThan(500_000);
      const repo = makeRepo(NESTED_WORKFLOW_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'a `cd` target and a `working-directory` of 480,000 slashes before a letter — %s',
    (rubric) => {
      const repo = makeRepo(SLASH_RUN_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27])(
    'a publish step behind 120,000 assignments or 150,000 runner flags, 900 nested hook loops, an unclosed run of escaped quotes in a hook loop, and a 200,000-line pytestmark — %s',
    (rubric) => {
      for (const contents of Object.values(REVIEW_521_READER_FIXTURE)) {
        expect(contents.length).toBeLessThan(512_000);
      }
      const repo = makeRepo(REVIEW_521_READER_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26])(
    '`pnpm run /^(a+)+$/` beside a script named 40 `a`s and `!` — %s',
    (rubric) => {
      const repo = makeRepo(SELECTOR_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26])(
    '`pnpm run /` followed by 60 unterminated backslashes — %s',
    (rubric) => {
      const repo = makeRepo(BACKSLASH_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
    },
    KILL_AFTER_MS + 10_000,
  );

  it.each([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26])(
    'a workspace glob of 12 `*a` pairs and `*b` beside a 40-character directory of `a`s — %s',
    (rubric) => {
      const repo = makeRepo(GLOB_FIXTURE);
      const scan = scanInChild(repo, rubric);
      expectWithinBudget(scan, rubric, repo);
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
// reader on its own at two input lengths, SCALING_SMALL (L/2) and SCALING_LARGE (2L), four times
// apart, and refuses a ratio above SCALING_RATIO_LIMIT. The fastest of seven samples at each length,
// taken alternately after a warm-up, is compared, so a single stall on a loaded runner does not
// decide it (cejel #642). Each reader must return the same answer at both lengths, so a reader that
// stops early cannot pass by being fast.
//
// cejel #678: why the lengths are four times apart and the limit is 11. Until #678 the lengths were
// L and 2L and the limit 3, where a linear reader gives 2 and one that grows with the square gives
// 4. The same unchanged code then measured from 1.9 to 3.2 on CI (the deep-path test-path reader:
// 2.43, 2.42, 3.06, 3.17, 2.45 and 1.94 in six runs), a spread wider than the gap between linear and
// the limit, so the runner, not the reader, decided some runs. At a step of four, linear gives about
// 4, n log n about 4.5 and the square 16. The readers here are not linear: six of them measured 5.2
// to 7.3 at this step (exponent 1.2 to 1.4), and the noise between runs multiplies a ratio by the
// same factor at any step, about 1.3 to 1.6 on CI. A limit of 8 left the slowest of them a factor
// of 1.1 to 1.15 of room. 11 sits about halfway, on a ratio scale, between the highest reader seen
// (7.26, under full-suite load) and the square (16.0): a factor of about 1.5 from each.
//
// cejel #680: where the readers' extra cost comes from. None of them is superlinear by algorithm.
// Each reader's cost per character is flat at small inputs and steps up 1.3 to 2.2 times between
// L/8 and 4L, while garbage collection and system time stay a small share. The steps come from the
// working set (hash maps, sets, and the strings keyed into them) outgrowing the CPU caches, so each
// access costs more as the input grows. A stand-in that is linear by construction and does only
// that, a Map of string keys set and then read, measured 6.10 to 6.41 at this step in this file (8
// reads per sample), and 8.57 in a standalone script with one read per sample, on one quiet host.
// That is the readers' own range, 5.2 to 7.3, where the arithmetic-only stand-in measured 3.84 to
// 4.04. The memory-bound stand-in below records that baseline in every run's log beside the
// readers. A reader that fails the limit is superlinear only if it also fails against that baseline.
// The step is taken from L/2 to 2L rather than from L to 4L, so the largest input, and with it most
// of this file's run time, stays as it was (the sample floor below is halved to match).
//
// The check also refuses a ratio below SCALING_RATIO_FLOOR, 2. A reader that reads all of its input
// gives about 4; one that was never handed the larger input (a caller whose inputs are keyed on
// lengths the helper does not read, so the reader gets nothing, or the same thing, at both) gives
// about 1, and would otherwise pass by giving the same answer twice, fast. A caller that builds its
// inputs ahead of time builds them with scalingInputs, for exactly SCALING_LENGTHS; its lookup
// throws on any other length. The test names below keep the "L and 2L" they had before #678: each
// builder is a function of the length it is handed, and is now read at L/2 and 2L.
const SCALING_LENGTH = 240_000;
const SCALING_SMALL = SCALING_LENGTH / 2;
const SCALING_LARGE = 2 * SCALING_LENGTH;
const SCALING_LENGTHS = [SCALING_SMALL, SCALING_LARGE] as const;
const SCALING_FACTOR = SCALING_LARGE / SCALING_SMALL;
const SCALING_RATIO_LIMIT = 11;
const SCALING_RATIO_FLOOR = 2;
const CI_LINE_UNITS = ['yarn ', 'uv run ', 'cargo b ', 'pnpm i ', 'npm npm ', 'poetry check '];

// A reader can take well under a millisecond once optimised, where a timer and a stray pause
// decide the ratio. Each timed sample therefore repeats the read enough times that, at the smaller
// length, it takes at least SCALING_SAMPLE_MS; the larger length is read the same number of times.
// cejel #642: the samples at the two lengths are taken in alternation, so a burst of load on the
// host falls on both lengths alike rather than on one phase, and the floor is well above one read,
// so a sample is never decided by one or two reads. cejel #678: the floor is 40 ms at L/2, where it
// was 80 ms at L. A reader takes about half as long at L/2 as at L, so this takes the same reads per
// sample as before and a sample at 2L as long as before. Kept at 80 ms, each sample at 2L was at
// least 320 ms, and this file ran in 141.9 s against main's 100.1 s (mean of five), past the 25%
// longer run that #678 allows.
const SCALING_SAMPLE_MS = 40;
const SCALING_PAIRS = 7;

// cejel #642: a sample is timed in this process's own CPU time (user and system), not wall time,
// so the time it spends preempted by other work on a loaded host is not counted.
function timeMs(read: () => unknown, repetitions: number): number {
  const started = process.cpuUsage();
  for (let repetition = 0; repetition < repetitions; repetition += 1) read();
  const used = process.cpuUsage(started);
  return (used.user + used.system) / 1000;
}

/** cejel #642: the fastest timed sample at each length, from samples taken alternately, and their ratio. */
function interleavedRatio(readSmall: () => unknown, readLarge: () => unknown, repetitions: number): { msSmall: number; msLarge: number; ratio: number } {
  let msSmall = Number.POSITIVE_INFINITY;
  let msLarge = Number.POSITIVE_INFINITY;
  for (let pair = 0; pair < SCALING_PAIRS; pair += 1) {
    msSmall = Math.min(msSmall, timeMs(readSmall, repetitions));
    msLarge = Math.min(msLarge, timeMs(readLarge, repetitions));
  }
  return { msSmall, msLarge, ratio: msLarge / msSmall };
}

/**
 * The reader's CPU time at SCALING_LARGE over its CPU time at SCALING_SMALL, and its answer at each
 * (cejel #678). `timing` names both lengths and the factor between them, so a CI log says what was
 * compared; it is also written to stdout under the test's name, so every run records each ratio.
 * Throws where the ratio is below SCALING_RATIO_FLOOR: the reader did not read the length it was
 * given. The caller checks the ratio against SCALING_RATIO_LIMIT.
 */
function scalingRatio<T>(read: (length: number) => T): { ratio: number; timing: string; atSmall: T; atLarge: T } {
  const atSmall = read(SCALING_SMALL);
  const atLarge = read(SCALING_LARGE);
  // Warm both lengths, then find how many reads at the smaller length fill a sample.
  for (let warm = 0; warm < 3; warm += 1) {
    read(SCALING_SMALL);
    read(SCALING_LARGE);
  }
  // cejel #678: a reader handed nothing at the smaller length (inputs keyed on lengths the helper
  // does not read, where the larger one still hits) reads in no time there, so the reads per sample
  // would double to the cap and each sample at the larger length run for hours, which no per-test
  // timeout can interrupt. One read at the larger length bounds them: a sample there may take at
  // most 64 times the floor, where a reader the limit admits takes at most 11 times it. Such a reader
  // then fails on the limit, at once.
  const largeOnce = Math.max(timeMs(() => read(SCALING_LARGE), 1), 0.001);
  const largest = Math.max(1, Math.floor((64 * SCALING_SAMPLE_MS) / largeOnce));
  let repetitions = 1;
  while (repetitions < 65_536 && 2 * repetitions <= largest && timeMs(() => read(SCALING_SMALL), repetitions) < SCALING_SAMPLE_MS) repetitions *= 2;
  const { msSmall, msLarge, ratio } = interleavedRatio(() => read(SCALING_SMALL), () => read(SCALING_LARGE), repetitions);
  const timing =
    `L/2 = ${SCALING_SMALL} against 2L = ${SCALING_LARGE} (x${SCALING_FACTOR}), ${repetitions} reads per sample, ${SCALING_PAIRS} alternating pairs, ` +
    `CPU time: L/2 ${msSmall.toFixed(1)} ms, 2L ${msLarge.toFixed(1)} ms, ratio ${ratio.toFixed(2)} (limit ${SCALING_RATIO_LIMIT})`;
  process.stdout.write(`scaling, ${expect.getState().currentTestName ?? 'unnamed'}: ${timing}\n`);
  if (ratio < SCALING_RATIO_FLOOR) {
    throw new Error(`the reader did not read the length it was given: ratio ${ratio.toFixed(2)} is below ${SCALING_RATIO_FLOOR}; ${timing}`);
  }
  return { ratio, timing, atSmall, atLarge };
}

/**
 * cejel #678: a caller's inputs built ahead of time, one for each of SCALING_LENGTHS, the lengths
 * scalingRatio reads. The lookup throws on any other length, so inputs keyed on lengths the helper
 * does not read fail loudly rather than hand the reader nothing at one of them.
 */
function scalingInputs<T>(build: (length: number) => T): (length: number) => T {
  const inputs = new Map<number, T>(SCALING_LENGTHS.map((length) => [length, build(length)]));
  return (length) => {
    if (!inputs.has(length)) throw new Error(`no scaling input built for length ${length}; inputs are built for ${SCALING_LENGTHS.join(' and ')}`);
    return inputs.get(length) as T;
  };
}

describe('timing guards: the relative budget itself (cejel #561)', () => {
  // The guards above hold every rubric but v17 to the larger of SCAN_BUDGET_MS and three times a v17
  // scan on the same runner. These two runs show that budget can still fail, and that it moves with
  // the runner: the stand-in delay is added inside the child's timed span.
  it('rejects a v27 scan that alone takes far longer than the absolute budget', () => {
    const repo = makeRepo(SELECTOR_FIXTURE);
    const scan = scanInChild(repo, WITAN_RUBRIC_VERSION_V27, { CEJEL_SCAN_CHILD_DELAY_MS: String(SCAN_BUDGET_MS + 500) });
    const baseline = scanInChild(repo, WITAN_RUBRIC_VERSION_V17);
    const allowed = Math.max(SCAN_BUDGET_MS, V17_RATIO_LIMIT * baseline.elapsedMs);
    expect(scan.elapsedMs, `${Math.round(scan.elapsedMs)} ms against ${Math.round(allowed)} ms`).toBeGreaterThan(allowed);
  }, KILL_AFTER_MS + 10_000);

  it('admits a v27 scan past the absolute budget when the same runner is that slow for v17 too', () => {
    const repo = makeRepo(SELECTOR_FIXTURE);
    const scan = scanInChild(repo, WITAN_RUBRIC_VERSION_V27, { CEJEL_SCAN_CHILD_DELAY_MS: String(SCAN_BUDGET_MS + 200) });
    expect(scan.elapsedMs).toBeGreaterThan(SCAN_BUDGET_MS);
    expectWithinBudget(scan, WITAN_RUBRIC_VERSION_V27, repo, { CEJEL_SCAN_CHILD_DELAY_MS: '1000' });
  }, KILL_AFTER_MS + 10_000);
});

describe('scaling: the ratio check itself (cejel #642)', () => {
  // The check must still tell a reader whose cost grows with the square from a linear one, admit
  // one that grows with n log n, and (cejel #678) refuse one that does the same work at both
  // lengths as not having read its input. The stand-ins do arithmetic only, sized so a sample fills
  // the floor quickly. The arithmetic stand-ins touch no memory, so they give the ideal ratios;
  // cejel #680: the readers are bound by memory, and the Map stand-in gives the baseline they
  // actually sit against.
  const work = (iterations: number): number => {
    let total = 0;
    for (let index = 0; index < iterations; index += 1) total = (total + index * 31) % 1_000_003;
    return total;
  };
  it('refuses a stand-in reader whose work grows with the square of its input', () => {
    const { ratio, timing } = scalingRatio((length) => work((length / 400) ** 2));
    expect(ratio, timing).toBeGreaterThan(SCALING_RATIO_LIMIT);
  }, 60_000);
  it('admits a stand-in reader whose work grows with its input', () => {
    const { ratio, timing } = scalingRatio((length) => work(length * 4));
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
  it('admits a stand-in reader whose work grows with n log n of its input', () => {
    const { ratio, timing } = scalingRatio((length) => work(Math.round(length * Math.log2(length))));
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
  it('refuses a stand-in reader that does the same work at both lengths: it did not read the length it was given', () => {
    expect(() => scalingRatio(() => work(SCALING_LARGE * 4))).toThrow(/the reader did not read the length it was given/);
  }, 60_000);
  // cejel #680: linear by construction, and bound by memory as the readers are. It is held only
  // below the square, not below SCALING_RATIO_LIMIT: it measured up to 8.57 on a quiet host, and
  // the noise between CI runs could carry it past 11. It is here as the baseline each run logs.
  it('records the ratio of a linear stand-in bound by memory: a Map of string keys, set and then read (cejel #680)', () => {
    const mapped = (keys: number): number => {
      const map = new Map<string, number>();
      for (let index = 0; index < keys; index += 1) map.set(`${index}/a`, index + 1);
      let total = 0;
      for (let index = 0; index < keys; index += 1) total += map.get(`${index}/a`) ?? 0;
      return total;
    };
    const { ratio, timing } = scalingRatio((length) => mapped(length / 2));
    expect(ratio, timing).toBeLessThan(16);
  }, 60_000);
});

// v27 B3 seventh pass (#641, item A): the justfile and tox.ini readers, each on the input that
// maximises its work. For the justfile: `test` depending on L/14 empty recipes (each reached recipe
// is visited, and each dependency list read, once). For tox.ini: L/60 environments, each with a
// section of its own that falls back to a `[testenv]` deps list of L/26 lines (each value is read
// once, by its text, not once per environment). Both must answer 'runner' at L and 2L.
describe('scaling: the v27 B3 justfile, tox.ini and hatch environment readers grow no faster than linearly', () => {
  const repoCache = new Map<string, { repo: string; files: string[] }>();
  const repoFor = (key: string, files: Record<string, string>) => {
    const existing = repoCache.get(key);
    if (existing) return existing;
    const made = { repo: makeRepo(files), files: Object.keys(files) };
    repoCache.set(key, made);
    return made;
  };
  it('the justfile reader, on `test` depending on L/14 and 2L/14 empty recipes', () => {
    const justfile = (length: number): string => {
      const count = Math.floor(length / 14);
      const names = Array.from({ length: count }, (_, index) => `r${index}`);
      return `test: ${names.join(' ')}\n    pytest\n\n${names.map((name) => `${name}:\n`).join('')}`;
    };
    const read = (length: number) => {
      const { repo, files } = repoFor(`just-${length}`, { justfile: justfile(length) });
      return b3TaskRunnerReadingsForScaling(repo, files).just;
    };
    expect(justfile(SCALING_LARGE).length).toBeLessThan(512_000);
    const { ratio, timing, atSmall, atLarge } = scalingRatio(read);
    expect(atSmall).toBe('runner');
    expect(atLarge).toBe(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  it('the tox.ini reader, on L/60 and 2L/60 environments falling back to a deps list of L/26 and 2L/26 lines', () => {
    const toxIni = (length: number): string => {
      const environments = Array.from({ length: Math.floor(length / 60) }, (_, index) => `e${index}`);
      const deps = '    pytest\n'.repeat(Math.floor(length / 26));
      return `[tox]\nenv_list = ${environments.join(',')}\nskipsdist = true\n\n[testenv]\ndeps =\n${deps}commands = pytest\n\n${environments.map((name) => `[testenv:${name}]\ndescription = x\n`).join('')}`;
    };
    const read = (length: number) => {
      const { repo, files } = repoFor(`tox-${length}`, { 'tox.ini': toxIni(length) });
      return b3TaskRunnerReadingsForScaling(repo, files).tox;
    };
    expect(toxIni(SCALING_LARGE).length).toBeLessThan(512_000);
    const { ratio, timing, atSmall, atLarge } = scalingRatio(read);
    expect(atSmall).toBe('runner');
    expect(atLarge).toBe(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);
  // Item F (finishing pass): the hatch environment reader reads every line once; the input that
  // maximises its work is one `dependencies` list of L/12 and 2L/12 lines, each fed to the TOML
  // value scanner and read as an index project name, beside the script it resolves.
  it('the hatch environment reader, on a dependencies list of L/12 and 2L/12 lines', () => {
    const hatchToml = (length: number): string =>
      `[envs.default]\nskip-install = true\ndependencies = [\n${'  "pytest",\n'.repeat(Math.floor(length / 12))}]\n\n[envs.default.scripts]\ntest = "pytest"\n`;
    const read = (length: number) => {
      const { repo, files } = repoFor(`hatch-${length}`, { 'hatch.toml': hatchToml(length) });
      return b3TaskRunnerReadingsForScaling(repo, files).hatch;
    };
    expect(hatchToml(SCALING_LARGE).length).toBeLessThan(512_000);
    const { ratio, timing, atSmall, atLarge } = scalingRatio(read);
    expect(atSmall).toBe('script runner');
    expect(atLarge).toBe(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  // Review of #657 (blocker 5): the module-shadow reader reads every known path once, from a
  // directory it does not know; the input that maximises its work is many deep paths, none a module
  // that shadows pytest, so every path is read and every module name compared: L/24 and 2L/24 paths.
  // cejel #678: one module that does shadow it, `zz/pytest.py`, comes last in both list and sort
  // order, so the answer is true only where the reader reached the end, never the empty answer.
  it('the python -m module-shadow reader, on L/24 and 2L/24 known paths of three parts', () => {
    const { repo } = repoFor('module-shadow', {});
    const files = (length: number): string[] => [
      ...Array.from({ length: Math.floor(length / 24) }, (_, index) => `d${index}/pkg/mod${index}.py`),
      'zz/pytest.py',
    ];
    const listed = new Map<number, string[]>();
    const read = (length: number) => {
      let paths = listed.get(length);
      if (paths === undefined) {
        paths = files(length);
        listed.set(length, paths);
      }
      return b3TaskRunnerReadingsForScaling(repo, paths).module;
    };
    const { ratio, timing, atSmall, atLarge } = scalingRatio(read);
    expect(atSmall).toBe(true);
    expect(atLarge).toBe(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);
});

// v27 B3 eighth pass (#659, #660): the positional test-path reader and the uv project reader, each on
// the input that maximises its work. The test-path reader builds a trie of v17's test-file list,
// hashing each part once, and walks a word's parts once: its worst inputs are many listed files
// (L/24 paths of three parts) and one deep path (L/2 parts, which a reader joining every prefix of a
// path would read in time growing with the square of its depth), each with a lookup that walks to
// the end. A glob spends a fixed budget of part comparisons (TEST_PATH_GLOB_BUDGET), so its worst
// case is that budget, timed once below. The uv reader reads each pyproject.toml line once; its
// worst input is a `tool.uv` dev-dependencies list of L/12 and 2L/12 lines beside a build system.
describe('scaling: the v27 B3 eighth pass readers grow no faster than linearly', () => {
  it('the test-path reader, on L/24 and 2L/24 listed files, looking up the last one\'s directory', () => {
    const lists = new Map<number, string[]>();
    const read = (length: number) => {
      let files = lists.get(length);
      if (files === undefined) {
        files = Array.from({ length: Math.floor(length / 24) }, (_, index) => `d${index}/pkg/test_${index}.py`);
        lists.set(length, files);
      }
      return b3TestPathReadingForScaling(files, `d${files.length - 1}/pkg`, 'path');
    };
    const { ratio, timing, atSmall, atLarge } = scalingRatio(read);
    expect(atSmall).toBe('test');
    expect(atLarge).toBe(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  it('the test-path reader, on one listed file L/2 and 2L/2 directories deep, looking up its directory and a dotted module', () => {
    const lists = new Map<number, { files: string[]; directory: string; module: string }>();
    const read = (length: number) => {
      let input = lists.get(length);
      if (input === undefined) {
        const parts = Array.from({ length: Math.floor(length / 2) }, () => 'a');
        input = { files: [`${parts.join('/')}/test_x.py`], directory: parts.join('/'), module: `${parts.join('.')}.test_x` };
        lists.set(length, input);
      }
      return `${b3TestPathReadingForScaling(input.files, input.directory, 'path')} ${b3TestPathReadingForScaling(input.files, input.module, 'module')}`;
    };
    const { ratio, timing, atSmall, atLarge } = scalingRatio(read);
    expect(atSmall).toBe('test test');
    expect(atLarge).toBe(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  it('a glob spends at most its fixed budget: one that matches none of 2L/24 listed files stops as not read', () => {
    const files = Array.from({ length: Math.floor((2 * SCALING_LENGTH) / 24) }, (_, index) => `d${index}/pkg/test_${index}.py`);
    const started = process.cpuUsage();
    const reading = b3TestPathReadingForScaling(files, `**/${'*a'.repeat(40)}*zz*`, 'path');
    const used = process.cpuUsage(started);
    const ms = (used.user + used.system) / 1000;
    expect(reading).toBe('unread');
    process.stdout.write(`eighth pass, glob at its budget: ${ms.toFixed(1)} ms of CPU\n`);
    expect(ms, `${ms.toFixed(1)} ms of CPU`).toBeLessThan(2_000);
  }, 60_000);

  it('the uv project reader, on a tool.uv dev-dependencies list of L/12 and 2L/12 lines', () => {
    const texts = new Map<number, string>();
    const read = (length: number) => {
      let text = texts.get(length);
      if (text === undefined) {
        text = `[project]\nname = "signer"\n\n[build-system]\nrequires = ["setuptools"]\n\n[tool.uv]\ndev-dependencies = [\n${'  "pytest",\n'.repeat(Math.floor(length / 12))}]\n`;
        texts.set(length, text);
      }
      return b3UvProjectReadingForScaling(text);
    };
    const { ratio, timing, atSmall, atLarge } = scalingRatio(read);
    expect(atSmall).toBe('builds');
    expect(atLarge).toBe(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);
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
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    expect(atSmall.map((skip) => skip.kind)).toEqual(['skip']);
    expect(atLarge).toEqual(atSmall);
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
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    expect(atSmall.map((skip) => skip.kind)).toEqual(['clear']);
    expect(atLarge).toEqual(atSmall);
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
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    // The hook's def line moves with the module's length; everything else must agree.
    const shape = (skips: typeof atSmall) => skips.map(({ line: _line, ...rest }) => rest);
    expect(atSmall.map((skip) => [skip.kind, skip.withheld !== undefined, skip.unread])).toEqual([['clear', true, undefined]]);
    expect(shape(atLarge)).toEqual(shape(atSmall));
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
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) =>
      readPytestInvocations(files, (file) => texts(length).get(file)),
    );
    // The root default, then the `pytest` at the end of each line: every line was read to its end.
    expect(atSmall).toHaveLength(1 + CI_LINE_UNITS.length);
    expect(atLarge).toEqual(atSmall);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
});

// goal_cejel_v27_a1_gaps_2026-11-03. Each new reader, on the input that maximises its work.
describe('scaling: the v27 A1 gap readers grow no faster than linearly', () => {
  // Item A: a hook credited on a list(items) copy reads every Python file the repository tracks for
  // a way to reach builtins (the review of #655, blocker 3); here one helper module of L bytes holds
  // only near misses of each alternative (`builtin_s`, `getattrs`, `re.compile`, an uncalled-looking
  // `.list_`, `. ` before a call) and names builtins only at its end.
  //
  // cejel #678: each read first lists the tracked files with `git ls-files`, a fixed cost in this
  // process about three times the sweep of the one helper module, so the ratio measured the listing
  // rather than the sweep (1.25 at L and 2L on main; 1.43 at L/2 and 2L, below the floor of 2). So
  // L/7,500 further modules of 6,000 near-miss lines each, which sort before tests/helpers.py and are
  // swept first, put the sweep, which grows with L, well above the listing, which does not.
  it('the builtins search, on L/7,500 modules of near misses and a helper module of L bytes naming builtins at its end', () => {
    const nearMiss = (index: number): string => `v${index} = re.compile(x.list_, getattrs, "builtin_s") . list()`;
    const nearMissModule = Array.from({ length: 6_000 }, (_, index) => nearMiss(index)).join('\n') + '\n';
    const repos = new Map<number, string>();
    const repoFor = (length: number): string => {
      const existing = repos.get(length);
      if (existing) return existing;
      const count = Math.floor(length / 80);
      const helper = `${Array.from({ length: count }, (_, index) => nearMiss(index)).join('\n')}\nimport builtins\n`;
      const modules = Object.fromEntries(
        Array.from({ length: Math.floor(length / 7_500) }, (_, index) => [`tests/h${String(index).padStart(4, '0')}.py`, nearMissModule]),
      );
      const repo = makeRepo({
        'tests/test_lines.py': 'def test_value():\n    assert 1 == 1\n',
        ...modules,
        'tests/helpers.py': helper,
        'tests/conftest.py': 'def pytest_collection_modifyitems(config, items):\n    saved = list(items)\n    items.clear()\n    items.extend(saved)\n',
      });
      repos.set(length, repo);
      return repo;
    };
    const files = ['tests/conftest.py', 'tests/helpers.py', 'tests/test_lines.py'];
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    expect(atSmall.map((skip) => skip.withheld)).toEqual(['hook not read: `saved = list(items)` in tests/conftest.py calls a builtin, which tests/helpers.py may replace']);
    expect(atLarge).toEqual(atSmall);
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
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    // Past the budget the remaining calls are named as not read, at both lengths.
    expect(atSmall.some(({ unread }) => unread === 'session.run("pytest", *session.posargs)')).toBe(true);
    expect(atLarge.some(({ unread }) => unread === 'session.run("pytest", *session.posargs)')).toBe(true);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);

  // goal_cejel_v27_a1_addopts_assignment_not_known_2026-11-10, item B (#653): readToxCommands reads
  // each tox.ini line holding {posargs} once per literal CI posargs set (at most 16), so without a
  // budget its work is the tox lines times the sets' words, a product of two inputs. The input that
  // maximises it: a tox.ini of N lines each holding {posargs}, and a CI file passing 16 distinct
  // sets of W words, N x 16 x W. Both grow with L here, N = L/400 lines and W = L/400 words, so an
  // unbounded reader's work grows with the square of L. With the budget, each line is named as a run
  // not read, at both lengths: at W = L/400 one line's cost, 1 + 16 x (W + 1), is past the budget
  // at L/2 already, so what is left is the read's linear part. Where the budget admits a few lines
  // at one length and fewer at the other, those reads are about the same work at both and swamp the
  // linear part: N = L/400 with W = L/2,000 measured 1.84 with the budget, under the floor of 2. And
  // where W is small, the reads per line and set outweigh the words: N = L/25 with W = L/4,000
  // measured 7.91 on the reader without a budget, superlinear but under the limit. The budget's
  // count across lines and files is pinned by the test after this one.
  it('the tox posargs reader, on a tox.ini of L/400 {posargs} lines and 16 CI sets of L/400 words', () => {
    const directory = 'tests/unit';
    const textsFor = (length: number): Map<string, string> => {
      const commands = Array.from({ length: Math.floor(length / 400) }, (_, index) => `    pytest {posargs} ${directory}/test_${index}.py`).join('\n');
      const words = Math.floor(length / 400);
      const steps = Array.from({ length: 16 }, (_, set) => `      - run: tox -e py -- ${Array.from({ length: words }, (_, word) => `-ks${set}w${word}`).join(' ')}`).join('\n');
      return new Map([
        ['tox.ini', `[tox]\nenvlist = py\n\n[testenv]\ndeps = pytest\ncommands =\n${commands}\n`],
        ['.github/workflows/ci.yml', `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n${steps}\n`],
      ]);
    };
    const files = ['.github/workflows/ci.yml', 'tox.ini'];
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
    for (const read of [atSmall, atLarge]) {
      expect(read.some(({ file, unread }) => file === 'tox.ini' && unread !== undefined && unread.startsWith(`pytest {posargs} ${directory}/test_`))).toBe(true);
    }
  }, 180_000);

  // goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item C (blocker 3 of the review of #698):
  // the word count above charges a line 1 + 16 x (W + 1) whatever it holds, but each {posargs} on the
  // line takes the whole set's text, so the work is the occurrences times the characters put in. The
  // input that maximises it: one tox.ini line holding K {posargs} and one CI word of C characters,
  // K x C, charged 3 by the word count. Here K = L/400 and C = L/100, so a reader charged by words
  // grows with the square of L (#698's measured 16 or more); charged by characters, the line is past
  // the budget at L/2 already, and is named not read at both lengths.
  it('the tox posargs reader, on one tox.ini line of L/400 {posargs} and one CI word of L/100 characters', () => {
    const textsFor = (length: number): Map<string, string> => {
      const line = `pytest ${Array.from({ length: Math.floor(length / 400) }, () => '{posargs}').join(' ')}`;
      const word = `-k${'x'.repeat(Math.floor(length / 100))}`;
      return new Map([
        ['tox.ini', `[tox]\nenvlist = py\n\n[testenv]\ndeps = pytest\ncommands = ${line}\n`],
        ['.github/workflows/ci.yml', `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: tox -e py -- ${word}\n`],
      ]);
    };
    const files = ['.github/workflows/ci.yml', 'tox.ini'];
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
    for (const read of [atSmall, atLarge]) {
      expect(read.some(({ file, unread }) => file === 'tox.ini' && unread !== undefined && unread.startsWith('pytest {posargs} {posargs}'))).toBe(true);
    }
  }, 180_000);

  // Item C: the nox reader, checked on the same shape: one session.run call holding K
  // *session.posargs and one CI word of C characters, K = L/400 and C = L/100. It does not have the
  // blind spot: it puts each passed word in place of *session.posargs as a reference to the same
  // string, so no text is copied and its work is K + C, not K x C. On #698's reader this measured
  // 3.54, and a whole v27 scan of the shape took the same time at both lengths. The call is read.
  it('the nox posargs reader, on one call of L/400 *session.posargs and one CI word of L/100 characters', () => {
    const textsFor = (length: number): Map<string, string> => {
      const call = `    session.run("pytest", ${Array.from({ length: Math.floor(length / 400) }, () => '*session.posargs').join(', ')})`;
      const word = `-k${'x'.repeat(Math.floor(length / 100))}`;
      return new Map([
        ['noxfile.py', `import nox\n\n\n@nox.session\ndef tests(session):\n${call}\n`],
        ['.github/workflows/ci.yml', `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: nox -s tests -- ${word}\n`],
      ]);
    };
    const files = ['.github/workflows/ci.yml', 'noxfile.py'];
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
    for (const read of [atSmall, atLarge]) {
      expect(read.some(({ file, unread, args }) => file === 'noxfile.py' && unread === undefined && args.length > 0)).toBe(true);
    }
  }, 180_000);

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
    const inputs = scalingInputs((length) => unreadNoxTexts(length / 2000, length / 2000));
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => {
      const { files, texts } = inputs(length);
      return readPytestInvocations(files, (file) => texts.get(file));
    });
    expect(atSmall.filter(({ unread }) => unread === 'nox -- $X0').length).toBe(1);
    expect(atLarge.filter(({ unread }) => unread === 'nox -- $X0').length).toBe(1);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  // The review of #655, blocker 1: a noxfile call taking posargs searches every other file that can
  // run nox for a nox command the reader does not read. The input that maximises the work: one
  // script of L bytes whose every line names nox only as an install or a dependency (each line swept
  // once, `nox` after `install`, `nox  ,` after spaces), with the one command it reports on its last
  // line, and one long line of L/8 bytes of the same.
  it('the nox command search, on a script of L bytes of nox near misses ending in a nox command', () => {
    const textsFor = (length: number): Map<string, string> => {
      const line = 'pip install nox nox nox ; dep = nox      , nox>=1 ; "nox"';
      const count = Math.floor(length / (line.length + 1));
      return new Map([
        ['noxfile.py', 'import nox\n\n\n@nox.session\ndef tests(session):\n    session.run("pytest", *session.posargs)\n'],
        ['scripts/ci.sh', `${Array.from({ length: count }, () => line).join('\n')}\nnox -s tests -- -x\n`],
        ['scripts/long.sh', `${'pip install nox '.repeat(Math.floor(length / 128))}\n`],
      ]);
    };
    const files = ['noxfile.py', 'scripts/ci.sh', 'scripts/long.sh'];
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    expect(atSmall.filter(({ unread }) => unread === 'nox -s tests -- -x').length).toBe(1);
    expect(atLarge.filter(({ unread }) => unread === 'nox -s tests -- -x').length).toBe(1);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);

  // Item C: the conftest option reader, on L/60 addoption calls, on one call left open to the end
  // of a file of L bytes (read once, never again from each later line), and (the review of #655:
  // every call on a line, CRLF text) on one CRLF line of L/50 calls and one line of L/16 quoted
  // `.addoption(` strings, swept once beside its matches.
  it('the conftest option reader, on L/60 declarations, an unclosed call of L bytes, and long lines of calls and quoted calls', () => {
    const textsFor = (length: number): Map<string, string> => {
      const declarations = Array.from({ length: Math.floor(length / 60) }, (_, index) => `    parser.addoption("--opt-${index}", action="store_true")`).join('\r\n');
      const open = `def pytest_addoption(parser):\n    parser.addoption(\n${'        "x", parser.addoption(\n'.repeat(Math.floor(length / 40))}`;
      const oneLine = Array.from({ length: Math.floor(length / 50) }, (_, index) => `p.addoption("--l${index}", action="count"); `).join('');
      const quoted = `x = ${'".addoption(" + '.repeat(Math.floor(length / 16))}""`;
      return new Map([
        ['conftest.py', `def pytest_addoption(parser):\r\n${declarations}\r\n`],
        ['tests/conftest.py', open],
        ['a/conftest.py', `def pytest_addoption(p):\n    ${oneLine}\n`],
        ['b/conftest.py', `${quoted}\n`],
      ]);
    };
    const files = ['a/conftest.py', 'b/conftest.py', 'conftest.py', 'tests/conftest.py'];
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestDeclaredOptions(files, (file) => texts(length).get(file)));
    expect(atSmall.options.get('--opt-0')).toBe('flag');
    expect(atLarge.options.get('--opt-0')).toBe('flag');
    expect(atSmall.options.get(`--l${Math.floor(SCALING_SMALL / 50) - 1}`)).toBe('flag');
    expect(atLarge.options.get(`--l${Math.floor(SCALING_LARGE / 50) - 1}`)).toBe('flag');
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
});

// goal_cejel_v27_a1_makefile_addopts_environment_2026-11-04. Each new reader, on the input that
// maximises its work.
describe('scaling: the v27 A1 make environment and class hook readers grow no faster than linearly', () => {
  // Item A: each distinct CI make environment re-reads the Makefile's variables and the recipes its
  // targets reach. Unbounded, N steps each with its own PYTEST_ADDOPTS and target against a Makefile
  // of N targets cost N x N. Both grow with L here: N = L/400 steps and targets, each target a pytest
  // recipe, and a `?=` default so each environment's own value is in force. Past 16 environments the
  // rest are read as one environment not known.
  it('the make environment reader, on L/400 CI make steps with distinct PYTEST_ADDOPTS and a Makefile of L/400 targets', () => {
    const textsFor = (length: number): Map<string, string> => {
      const count = Math.floor(length / 400);
      const steps = Array.from({ length: count }, (_, index) => `      - run: make t${index}\n        env:\n          PYTEST_ADDOPTS: "-k e${index}"`).join('\n');
      const recipes = Array.from({ length: count }, (_, index) => `t${index}:\n\tpytest tests/test_${index}.py`).join('\n');
      return new Map([
        ['.github/workflows/ci.yml', `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n${steps}\n`],
        ['Makefile', `PYTEST_ADDOPTS ?= -x\n\n${recipes}\n`],
      ]);
    };
    const files = ['.github/workflows/ci.yml', 'Makefile'];
    const texts = scalingInputs(textsFor);
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    // The first 16 environments are read with their own value; the rest are named as not read.
    expect(atSmall.filter(({ addoptsAt }) => addoptsAt !== undefined)).toHaveLength(16);
    expect(atLarge.filter(({ addoptsAt }) => addoptsAt !== undefined)).toHaveLength(16);
    expect(atSmall.filter(({ unread }) => unread === 'PYTEST_ADDOPTS').length).toBe(Math.floor(SCALING_SMALL / 400) - 16);
    expect(atLarge.filter(({ unread }) => unread === 'PYTEST_ADDOPTS').length).toBe(Math.floor(SCALING_LARGE / 400) - 16);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  // Item C: the class hook search keeps a stack of open blocks and of the class hooks open in them.
  // The input that maximises its work: L/120 classes, each defining the hook with a body that names
  // items, and between them a nest of blocks the stack must open and close.
  it('the class hook search, on a conftest.py of L/120 plugin classes each defining the hook', () => {
    const repos = new Map<number, string>();
    const repoFor = (length: number): string => {
      const existing = repos.get(length);
      if (existing) return existing;
      const count = Math.floor(length / 120);
      const classes = Array.from(
        { length: count },
        (_, index) => `class K${index}:\n    def pytest_collection_modifyitems(self, config, items):\n        if True:\n            items.sort()\n`,
      ).join('');
      const repo = makeRepo({
        'tests/test_lines.py': 'def test_value():\n    assert 1 == 1\n',
        'tests/conftest.py': `import pytest\n\n\n${classes}`,
      });
      repos.set(length, repo);
      return repo;
    };
    const files = ['tests/conftest.py', 'tests/test_lines.py'];
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => findPytestRunWideSkips(repoFor(length), files));
    expect(atSmall).toHaveLength(Math.floor(SCALING_SMALL / 120));
    expect(atLarge).toHaveLength(Math.floor(SCALING_LARGE / 120));
    expect(atSmall[0]?.withheld).toBe('hook not read: `K0.pytest_collection_modifyitems` in tests/conftest.py');
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 60_000);
});

// goal_cejel_v27_a1_addopts_not_known_2026-11-05, item B (#673). The mention count reads each CI
// file's text once for whole-word PYTEST_ADDOPTS, and counts the mentions the readers read while
// they read: one per env: entry line, one per export word, and the leading and env-prefix
// assignments of a make command (makeCommandOf once per such command). The input that maximises
// its work: L/200 run steps, each with a step env: entry and a run: line holding every counted form
// (an export, a leading assignment and an env prefix on make) and a pytest run, against a Makefile
// with a `?=` default and L/400 targets. The `end` variant adds one mention the readers do not read,
// in a comment on the file's last line, so the count is shown to reach the end of the file.
// goal_cejel_v27_a1_addopts_review_fixes_698_2026-11-10, item A: a mention is read only where every
// command it reaches is a make command the reader reads, so the run: line no longer ends with a
// pytest run (which made its export and env: entry mentions not read); the counted forms are kept,
// and the readers also test each command for make once (makeCommandOf, linear in its words).
describe('scaling: the v27 A1 PYTEST_ADDOPTS mention count grows no faster than linearly', () => {
  const textsFor = (length: number, end: string): Map<string, string> => {
    const steps = Array.from(
      { length: Math.floor(length / 200) },
      (_, index) =>
        `      - run: export PYTEST_ADDOPTS=-q && PYTEST_ADDOPTS=-q env PYTEST_ADDOPTS=-ke${index} make t${index % 64} && make t${(index + 1) % 64}\n        env:\n          PYTEST_ADDOPTS: "-k e${index}"`,
    ).join('\n');
    const recipes = Array.from({ length: Math.floor(length / 400) }, (_, index) => `t${index}:\n\tpytest tests/test_${index}.py`).join('\n');
    return new Map([
      ['.github/workflows/ci.yml', `name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n${steps}\n${end}`],
      ['Makefile', `PYTEST_ADDOPTS ?= -x\n\n${recipes}\n`],
    ]);
  };
  const files = ['.github/workflows/ci.yml', 'Makefile'];

  it('every mention read: the ?= default keeps #670 reading at L and at 2L, in linear time', () => {
    const texts = scalingInputs((length) => textsFor(length, ''));
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    // The CI make environments are read against the default (the make environment reader reads 16
    // with their own value and names the rest not read); the `end` variant below reads none.
    expect(atSmall.filter(({ addoptsAt }) => addoptsAt !== undefined).length).toBeGreaterThan(0);
    expect(atLarge.filter(({ addoptsAt }) => addoptsAt !== undefined).length).toBeGreaterThan(0);
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);

  it('one mention not read, on the last line: the ?= default is not known at L and at 2L, in linear time', () => {
    const texts = scalingInputs((length) => textsFor(length, '# PYTEST_ADDOPTS is set per step\n'));
    const { ratio, timing, atSmall, atLarge } = scalingRatio((length) => readPytestInvocations(files, (file) => texts(length).get(file)));
    // The default is not known, so make's environments are not read against it and every target's
    // run is named not read, pointed at the mention (the review of #698, item A: the comment line).
    for (const read of [atSmall, atLarge]) {
      expect(read.filter(({ addoptsAt }) => addoptsAt !== undefined)).toHaveLength(0);
      expect(read.some(({ unread, file }) => unread === '# PYTEST_ADDOPTS is set per step' && file === '.github/workflows/ci.yml')).toBe(true);
    }
    expect(ratio, timing).toBeLessThan(SCALING_RATIO_LIMIT);
  }, 120_000);
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
