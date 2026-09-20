import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17 } from '../rubric-version.js';

function makeTmpRepo(): string {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-database-url-userinfo-'));
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: directory });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: directory });
  return directory;
}

function writeFile(directory: string, relativePath: string, contents: string): void {
  const path = join(directory, relativePath);
  mkdirSync(join(directory, relativePath.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

function commit(directory: string, message: string): void {
  execFileSync('git', ['add', '-f', '.'], { cwd: directory });
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: directory });
}

function a2Findings(directory: string) {
  return (
    scoreRepoWithPublicCejel({
      productSlug: 'synthetic-database-url-userinfo',
      productDisplayName: 'Synthetic database URL userinfo',
      repoPath: directory,
      generatedAt: '2026-09-19T00:00:00.000Z',
      rubricVersion: WITAN_RUBRIC_VERSION_V17,
    }).criteria.find((criterion) => criterion.id === 'A2')?.findings ?? []
  );
}

function hasCriticalDatabaseUrlFinding(directory: string): boolean {
  return a2Findings(directory).some(
    (finding) =>
      finding.severity === 'critical' &&
      finding.evidence.path === '.env' &&
      finding.evidence.line === 1,
  );
}

describe('A2 database URL userinfo credentials', () => {
  const populatedUrl =
    'DATABASE_URL=postgresql://appuser:CorrectHorseBattery9!@db.example.invalid:5432/app\n';

  it('finds a populated PostgreSQL URL password in both the current tree and history', () => {
    const current = makeTmpRepo();
    writeFile(current, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(current, '.env', populatedUrl);
    commit(current, 'add current database URL credential');
    expect(hasCriticalDatabaseUrlFinding(current)).toBe(true);

    const history = makeTmpRepo();
    writeFile(history, 'src/index.js', 'export const noop = () => {};\n');
    commit(history, 'initial');
    writeFile(history, '.env', populatedUrl);
    commit(history, 'add historical database URL credential');
    rmSync(join(history, '.env'));
    execFileSync('git', ['rm', '--quiet', '.env'], { cwd: history });
    execFileSync('git', ['commit', '--quiet', '-m', 'remove historical database URL credential'], {
      cwd: history,
    });
    expect(hasCriticalDatabaseUrlFinding(history)).toBe(true);
  });

  it('does not double-report an unchanged database URL password from current and history', () => {
    const directory = makeTmpRepo();
    writeFile(directory, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(directory, '.env', populatedUrl);
    commit(directory, 'add database URL credential');
    writeFile(directory, 'src/next.js', 'export const next = () => {};\n');
    commit(directory, 'leave database URL credential unchanged');

    expect(
      a2Findings(directory).filter(
        (finding) => finding.severity === 'critical' && finding.evidence.path === '.env',
      ),
    ).toHaveLength(1);
  });

  it.each([
    ['a host-only URL', 'DATABASE_URL=postgresql://db.example.invalid:5432/app\n'],
    ['a username-only URL', 'DATABASE_URL=postgresql://appuser@db.example.invalid:5432/app\n'],
    ['an obvious placeholder password', 'DATABASE_URL=postgresql://appuser:changeme@db.example.invalid:5432/app\n'],
  ])('keeps %s silent', (_name, databaseUrl) => {
    const directory = makeTmpRepo();
    writeFile(directory, 'src/index.js', 'export const noop = () => {};\n');
    writeFile(directory, '.env', databaseUrl);
    commit(directory, 'add database URL control');
    expect(hasCriticalDatabaseUrlFinding(directory)).toBe(false);
  });
});
