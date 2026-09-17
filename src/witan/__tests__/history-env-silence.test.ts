import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';

const FIXTURE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'history-env-silence');
const CASES = [
  { path: '.env', contents: 'NODE_ENV=development\n' },
  { path: '.env.production', contents: 'NODE_ENV=production\n' },
  { path: '.env.library', contents: 'NODE_ENV=library\n' },
  { path: '.env.conf', contents: 'APP_CONFIG=app.conf\n' },
  { path: '.env', contents: 'source .venv/bin/activate\n' },
] as const;

function makeRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'cejel-history-env-characterization-'));
  cpSync(FIXTURE_DIRECTORY, repoPath, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: repoPath });
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '--quiet', '-m', 'synthetic fixture'], { cwd: repoPath });
  return repoPath;
}

function hasEnvAbsenceFinding(repoPath: string, path: string): boolean {
  const findings = scoreRepoWithPublicCejel({
    productSlug: 'synthetic-history-env-characterization',
    productDisplayName: 'Synthetic history env characterization',
    repoPath,
    generatedAt: '2026-09-17T00:00:00.000Z',
    rubricVersion: WITAN_RUBRIC_VERSION_V23,
  }).criteria.find((criterion) => criterion.id === 'A2')?.findings ?? [];
  return findings.some((finding) => finding.severity === 'info' && finding.evidence.path === path);
}

function commit(repoPath: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: repoPath });
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: repoPath });
}

describe('A2 CORE-A2-HISTORY-ENV characterization', () => {
  it.each(CASES)('finds the non-placeholder tracked $path shape', ({ path, contents }) => {
    const repoPath = makeRepo();
    try {
      writeFileSync(join(repoPath, path), contents, 'utf8');
      commit(repoPath, 'add environment variant');
      expect(hasEnvAbsenceFinding(repoPath, path)).toBe(true);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it.each(CASES)('finds the same non-placeholder $path shape in reachable history', ({ path, contents }) => {
    const repoPath = makeRepo();
    try {
      writeFileSync(join(repoPath, path), contents, 'utf8');
      commit(repoPath, 'add historical environment variant');
      rmSync(join(repoPath, path));
      commit(repoPath, 'remove historical environment variant');
      expect(hasEnvAbsenceFinding(repoPath, path)).toBe(true);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
