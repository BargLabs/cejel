import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { analyzeCoverageConfiguration } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V26 } from '../rubric-version.js';

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

describe('timing guards: the real scan finishes on pathological repository input', () => {
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
