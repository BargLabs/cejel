import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { buildWitanCliSummary } from '../../summary.js';
import { renderWitanBadgeSvg } from '../badge.js';
import { HISTORY_READING_CRITERIA, SHALLOW_HISTORY_LIMITATION, detectHistoryLimitations } from '../history-depth.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import type { WitanReport } from '../schemas.js';

// Issue #428: a shallow clone hands history-reading criteria a truncated history. The scan must
// say so, and saying so must change nothing else: no score, status, abstention, scan limitation,
// badge or --min-score outcome (operator ruling 2026-10-08).

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  }).trim();

function write(root: string, path: string, contents: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), `${contents}\n`);
}

function scan(repoPath: string): WitanReport {
  return scoreRepoWithPublicCejel({
    productSlug: 'history-fixture',
    productDisplayName: 'history-fixture',
    repoPath,
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('shallow history is disclosed, never scored', () => {
  let origin: string;
  let full: string;
  let shallow: string;

  beforeAll(() => {
    origin = mkdtempSync(join(tmpdir(), 'cejel-history-origin-'));
    git(origin, 'init', '--quiet');
    write(origin, 'package.json', JSON.stringify({ name: 'h', version: '1.0.0', scripts: { test: 'vitest run' } }));
    write(origin, 'src/index.ts', 'export const add = (a: number, b: number) => a + b;');
    git(origin, 'add', '.');
    git(origin, 'commit', '--quiet', '-m', 'first');
    write(origin, 'src/__tests__/index.test.ts', "import { add } from '../index.js';\nit('adds', () => expect(add(1, 2)).toBe(3));");
    git(origin, 'add', '.');
    git(origin, 'commit', '--quiet', '-m', 'second');
    write(origin, 'README.md', '# h\n\nA fixture.');
    git(origin, 'add', '.');
    git(origin, 'commit', '--quiet', '-m', 'third');

    const parent = mkdtempSync(join(tmpdir(), 'cejel-history-clones-'));
    full = join(parent, 'full');
    shallow = join(parent, 'shallow');
    git(parent, 'clone', '--quiet', `file://${origin}`, full);
    git(parent, 'clone', '--quiet', '--depth', '1', `file://${origin}`, shallow);
    expect(git(shallow, 'rev-parse', '--is-shallow-repository')).toBe('true');
    expect(git(full, 'rev-parse', '--is-shallow-repository')).toBe('false');
  });

  it('declares the shallow history, naming every criterion that reads history', () => {
    const report = scan(shallow);
    expect(report.historyLimitations).toEqual([SHALLOW_HISTORY_LIMITATION]);
    for (const criterion of HISTORY_READING_CRITERIA) {
      expect(SHALLOW_HISTORY_LIMITATION).toContain(`${criterion} (`);
    }
    expect(buildWitanCliSummary(report).historyLimitations).toEqual([SHALLOW_HISTORY_LIMITATION]);
  });

  it('declares nothing for a full clone or a directory that is not a git repository', () => {
    expect(scan(full).historyLimitations).toBeUndefined();
    expect('historyLimitations' in buildWitanCliSummary(scan(full))).toBe(false);
    const plain = mkdtempSync(join(tmpdir(), 'cejel-history-plain-'));
    write(plain, 'src/index.ts', 'export const x = 1;');
    expect(detectHistoryLimitations(plain)).toBeUndefined();
  });

  it('moves no score, status, scan limitation, badge or --min-score input', () => {
    const shallowReport = scan(shallow);
    const fullReport = scan(full);
    // This fixture's history has no PR-merge subjects, so B2 reads 0 of N on both clones and the
    // two scans must agree on everything but the disclosure.
    const { historyLimitations: _disclosure, ...shallowRest } = shallowReport;
    expect(shallowRest).toEqual(fullReport);
    expect(shallowReport.scanLimitations ?? []).toEqual([]);
    expect(buildWitanCliSummary(shallowReport).scanLimitations).toEqual([]);
    expect(renderWitanBadgeSvg(shallowReport)).toBe(renderWitanBadgeSvg(fullReport));
    expect(renderWitanBadgeSvg(shallowReport)).not.toContain('unrated');
  });
});
