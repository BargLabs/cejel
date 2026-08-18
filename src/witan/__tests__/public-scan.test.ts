import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';

const GENERATED_AT = '2026-08-18T00:00:00.000Z';

function makeFixtureRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'witan-rubric-selector-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Cejel Test'], { cwd: repoPath });
  writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'rubric-selector-fixture' }));
  writeFixtureFile(repoPath, 'src/index.ts', 'export const answer = 42;\n');
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repoPath });
  return repoPath;
}

function writeFixtureFile(repoPath: string, relativePath: string, contents: string): void {
  const fullPath = join(repoPath, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, contents, 'utf8');
}

function scoreFixture(repoPath: string, rubricVersion?: string) {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'rubric-selector-fixture',
    productDisplayName: 'Rubric Selector Fixture',
    generatedAt: GENERATED_AT,
    ...(rubricVersion !== undefined ? { rubricVersion } : {}),
  });
}

describe('rubric version selector fails closed', () => {
  it('rejects an unrecognized rubric version, naming the value and the accepted set', () => {
    // Deliberately never touches the filesystem: validation must run before any repo I/O, so a
    // nonexistent repoPath still surfaces the rubric error, not a filesystem error.
    let caught: unknown;
    try {
      scoreFixture('/nonexistent/repo/path', 'bogus-rubric');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain('unrecognized rubric version: "bogus-rubric"');
    for (const accepted of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      expect(message).toContain(accepted);
    }
  });

  it('lets an absent selector take the calibrated default, unchanged', () => {
    const repoPath = makeFixtureRepo();
    const report = scoreFixture(repoPath);
    expect(report.rubricVersion).toBe(WITAN_LAST_CALIBRATED_RUBRIC_VERSION);
  });

  it('lets every wired rubric version score exactly as before', () => {
    const repoPath = makeFixtureRepo();
    for (const wired of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const report = scoreFixture(repoPath, wired);
      expect(report.rubricVersion).toBe(wired);
    }
  });

  it('still exposes every prospective rubric explicitly, not as a fallback', () => {
    // The registry this selector validates against is the same one every V18-V22 constant
    // documents as "callers must opt in explicitly" — this fix does not narrow or widen it.
    expect([...WITAN_SELECTABLE_RUBRIC_VERSIONS]).toEqual([
      WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
      ...WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
    ]);
  });
});
