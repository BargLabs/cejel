import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { createWitanReport } from '../scoring.js';

// Rubric calibration v2 for external repos — goal_cejel_launch_hardening_combined_2026-07-06,
// Phase 3. Locks: a well-run ordinary library no longer scores "At risk"; a metric-derived
// critical/warning status is never unexplained; A5 "nothing to claim" is N/A not 0; B4
// freshness credit isn't pinned to a hardcoded year; a non-git repo with an unreadable
// subdirectory doesn't crash the scan; a nonexistent path gets a clear error.

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-calibration-v2-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = join(dir, rel);
  mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function commitAll(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'ignore' });
}

describe('H1 — a well-run ordinary library no longer lands "At risk"', () => {
  it('tests + CI + SECURITY.md + CHANGELOG.md + lockfile + no secrets scores mid-band or better', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'well-run-library',
        version: '1.0.0',
        scripts: { test: 'vitest run', lint: 'biome check .', typecheck: 'tsc --noEmit' },
        // A real dependency, pinned exactly — most libraries depend on at least one thing.
        dependencies: { zod: '3.23.8' },
      }),
    );
    writeFile(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    writeFile(
      dir,
      '.github/dependabot.yml',
      'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: "/"\n    schedule:\n      interval: weekly\n',
    );
    writeFile(dir, 'CODEOWNERS', '* @well-run-library/maintainers\n');
    writeFile(dir, 'README.md', '# Well Run Library\n\nA tidy, well-tested library.\n');
    writeFile(dir, 'SECURITY.md', '# Security Policy\n\nReport issues to security@example.com.\n');
    writeFile(dir, 'CHANGELOG.md', '# Changelog\n\n## 1.0.0 - 2026-01-15\n\nInitial release.\n');
    writeFile(
      dir,
      'src/index.ts',
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    );
    writeFile(
      dir,
      'src/index.test.ts',
      "import { expect, it } from 'vitest';\nimport { add } from './index.js';\nit('adds', () => { expect(add(1, 2)).toBe(3); });\n",
    );
    writeFile(
      dir,
      '.github/workflows/ci.yml',
      [
        'name: CI',
        'on:',
        '  pull_request:',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: pnpm test',
        '      - run: pnpm lint',
        '      - run: pnpm typecheck',
      ].join('\n'),
    );
    // Local squash-style history — no "Merge pull request"/"#123" convention.
    commitAll(dir, 'chore: scaffold well-run library');
    writeFile(
      dir,
      'src/index.ts',
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function sub(a: number, b: number): number {\n  return a - b;\n}\n',
    );
    commitAll(dir, 'feat: add sub function');

    const report = createWitanReport(
      buildWitanInputFromRepo({
        productSlug: 'well-run-library',
        productDisplayName: 'Well Run Library',
        repoPath: dir,
        generatedAt: '2026-07-06T00:00:00.000Z',
        rubricVersion: 'witan-rubric-v1-2026-06-24',
      }),
    );

    // "At risk" is overallScore in [1.5, 2.5) (html.ts renderVerdict); a well-run repo like
    // this must clear that band, not read as "everything is untrustworthy".
    expect(report.overallScore).toBeGreaterThanOrEqual(2.5);

    // No criterion may render critical/warning with an unexplained (empty) findings list.
    for (const criterion of report.criteria) {
      if (criterion.status === 'critical' || criterion.status === 'warning') {
        expect(
          criterion.findings.length,
          `${criterion.id} is ${criterion.status} but has no findings to explain it`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe('H1 — statusForScoreAndFindings never returns critical/warning with empty findings', () => {
  it('a repo with CI but a 0/N pr_merge_ratio (squash history) is never a naked critical/warning', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'package.json', JSON.stringify({ name: 'squash-repo', version: '1.0.0' }));
    writeFile(
      dir,
      '.github/workflows/ci.yml',
      'name: CI\non:\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n',
    );
    commitAll(dir, 'plain local commit with no PR reference');

    const report = createWitanReport(
      buildWitanInputFromRepo({
        productSlug: 'squash-repo',
        productDisplayName: 'Squash Repo',
        repoPath: dir,
        generatedAt: '2026-07-06T00:00:00.000Z',
        rubricVersion: 'witan-rubric-v1-2026-06-24',
      }),
    );
    const b2 = report.criteria.find((c) => c.id === 'B2');
    expect(b2).toBeDefined();
    if (b2?.status === 'critical' || b2?.status === 'warning') {
      expect(b2.findings.length).toBeGreaterThan(0);
    }
  });
});

describe('H3 — audit_freshness_depth derives the year from generatedAt, not a hardcoded literal', () => {
  it('credits a CHANGELOG dated in the run year even when that year is not 2026', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'CHANGELOG.md', '# Changelog\n\n## 1.0.0 - 2031-03-01\n\nRelease notes.\n');
    commitAll(dir, 'add changelog');

    const input = buildWitanInputFromRepo({
      productSlug: 'future-repo',
      productDisplayName: 'Future Repo',
      repoPath: dir,
      generatedAt: '2031-06-01T00:00:00.000Z',
    });
    const b4 = (input.signals ?? []).find((s) => s.criterionId === 'B4');
    const freshness = b4?.metrics?.find((m) => m.name === 'audit_freshness_depth');
    expect(freshness?.value).toBeGreaterThan(0);
  });
});

describe('M1 — an unreadable subdirectory in a non-git repo does not crash the scan', () => {
  it('scores the rest of the tree instead of throwing EACCES', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-unreadable-dir-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'plain-dir', version: '1.0.0' }),
    );
    const lockedDir = join(dir, 'locked');
    mkdirSync(lockedDir);
    writeFileSync(join(lockedDir, 'secret.txt'), 'unreadable');
    chmodSync(lockedDir, 0o000);

    try {
      expect(() =>
        buildWitanInputFromRepo({
          productSlug: 'plain-dir',
          productDisplayName: 'Plain Dir',
          repoPath: dir,
          generatedAt: '2026-07-06T00:00:00.000Z',
        }),
      ).not.toThrow();
    } finally {
      chmodSync(lockedDir, 0o755);
    }
  });
});

describe('M1 — a nonexistent repo path gets a friendly error, not a raw ENOENT', () => {
  it('throws a clear "path not found" message', () => {
    expect(() =>
      buildWitanInputFromRepo({
        productSlug: 'missing',
        productDisplayName: 'Missing',
        repoPath: '/tmp/cejel-definitely-does-not-exist-xyz-12345',
        generatedAt: '2026-07-06T00:00:00.000Z',
      }),
    ).toThrow(/path not found/);
  });
});
