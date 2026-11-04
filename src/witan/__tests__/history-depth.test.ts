import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { buildWitanCliSummary } from '../../summary.js';
import { renderWitanBadgeSvg } from '../badge.js';
import {
  HISTORY_READING_CRITERIA,
  SHALLOW_HISTORY_LIMITATION,
  SHALLOW_HISTORY_V27_ABSTENTION,
  detectHistoryLimitations,
} from '../history-depth.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { a2HistoryApplicabilityDisclosure } from '../repo-signals.js';
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

  // Operator ruling of 2 Nov: the default rubric, like v27, gives a shallow clone no composite and
  // no verdict, so its history limitation is the abstention sentence v27 writes. No scan writes
  // SHALLOW_HISTORY_LIMITATION any more; it still names every criterion that reads history.
  it('declares the shallow history, naming every criterion that reads history', () => {
    const report = scan(shallow);
    expect(report.historyLimitations).toEqual([SHALLOW_HISTORY_V27_ABSTENTION]);
    for (const criterion of HISTORY_READING_CRITERIA) {
      expect(SHALLOW_HISTORY_V27_ABSTENTION).toContain(`${criterion} (`);
      expect(SHALLOW_HISTORY_LIMITATION).toContain(`${criterion} (`);
    }
    expect(buildWitanCliSummary(report).historyLimitations).toEqual([SHALLOW_HISTORY_V27_ABSTENTION]);
  });

  it('declares nothing for a full clone or a directory that is not a git repository', () => {
    expect(scan(full).historyLimitations).toBeUndefined();
    expect('historyLimitations' in buildWitanCliSummary(scan(full))).toBe(false);
    const plain = mkdtempSync(join(tmpdir(), 'cejel-history-plain-'));
    write(plain, 'src/index.ts', 'export const x = 1;');
    expect(detectHistoryLimitations(plain)).toBeUndefined();
  });

  // Until the operator's ruling of 2 Nov this pinned that a v17 shallow clone was scored exactly as
  // its full clone ("moves no score"), with A2 not applicable and a #556 disclosure. The ruling
  // withholds the composite and the verdict instead; the history limitation itself is still not a
  // scan limitation, and every criterion but A2 reads as on the full clone.
  it('gives no composite and no verdict, adds no scan limitation, and reads every criterion but A2 as on the full clone', () => {
    const shallowReport = scan(shallow);
    const fullReport = scan(full);
    expect(shallowReport.verdict).toBe('insufficient_source');
    expect(shallowReport.overallScore).toBeNull();
    expect(shallowReport.insufficientSourceReason ?? '').toContain('(reason: shallow_history)');
    // A2 was not applicable on a decision that rests on history scans that read only the commits
    // present, so it abstains as v27's does, with no #556 disclosure.
    const shallowA2 = shallowReport.criteria.find(({ id }) => id === 'A2');
    expect(shallowA2?.status).toBe('insufficient_data');
    expect(shallowA2?.notes ?? '').toMatch(/^A2 abstained: this repository is a shallow clone, and A2 would otherwise have been marked not applicable/);
    expect(shallowA2?.disclosures).toBeUndefined();
    expect(fullReport.criteria.find(({ id }) => id === 'A2')?.status).toBe('not_applicable');
    expect(fullReport.criteria.find(({ id }) => id === 'A2')?.disclosures).toBeUndefined();
    expect(shallowReport.criteria.filter(({ id }) => id !== 'A2')).toEqual(fullReport.criteria.filter(({ id }) => id !== 'A2'));
    expect(shallowReport.scanLimitations ?? []).toEqual([]);
    expect(buildWitanCliSummary(shallowReport).scanLimitations).toEqual([]);
    expect(renderWitanBadgeSvg(shallowReport)).toContain('unrated: shallow clone');
    expect(fullReport.verdict).not.toBe('insufficient_source');
    expect(a2HistoryApplicabilityDisclosure({ shallow: true, limitHits: [], otherFailure: false })).toContain('this clone is shallow');
  });
});
