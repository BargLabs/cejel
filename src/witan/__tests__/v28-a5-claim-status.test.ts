import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27, WITAN_RUBRIC_VERSION_V28 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';
import { HERMETIC_GIT_ENV } from './fixtures/behaviour-corpus.js';
import type { V28A1Fixture } from './fixtures/v28-a1-readings-fixtures.js';
import {
  V28_A5_FIXTURES,
  V28_A5_NOT_RECONCILING_FIXTURES,
  V28_A5_RECONCILING_FIXTURES,
} from './fixtures/v28-a5-claim-status-fixtures.js';

// goal_cejel_v28_a5_claim_status_reading_2026-11-20 (operator ruling 50, 20 Nov). Under v28, a claim
// source (README.md, or a Markdown file directly under docs/) reconciles its claims where it carries
// a limitations, known-issues or status section with content under it, or a table that states
// status. A5 then makes no claim-reconciliation finding and cites the section or table at its line.
// Every other rubric reads A5 as v27 does. The no-rise half is in v28-a1-readings.test.ts.

const CLAIM_FINDING = /no dedicated claim-reality report artifact/;

const dirs = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function makeRepo(fixture: V28A1Fixture): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-v28-a5-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: HERMETIC_GIT_ENV, stdio: 'pipe' });
  git('init', '--quiet');
  for (const [relativePath, contents] of Object.entries(fixture.files)) {
    const path = join(dir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }
  git('add', '--all');
  git('commit', '--quiet', '--no-gpg-sign', '-m', 'synthetic');
  return dir;
}

function score(name: string, rubricVersion: string): WitanReport {
  const key = `${name}\0${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  const report = scoreRepoWithPublicCejel({
    repoPath: dirs.get(name) as string,
    productSlug: 'synthetic-v28-a5',
    productDisplayName: 'Synthetic v28 A5',
    generatedAt: '2026-11-21T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, report);
  return report;
}

const a5 = (name: string, rubricVersion: string) => {
  const criterion = score(name, rubricVersion).criteria.find(({ id }) => id === 'A5');
  if (!criterion) throw new Error(`${name}: no A5 under ${rubricVersion}`);
  return criterion;
};
const claimFinding = (name: string, rubricVersion: string) =>
  a5(name, rubricVersion).findings.find(({ summary }) => CLAIM_FINDING.test(summary));
const statusCitations = (name: string, rubricVersion: string) =>
  a5(name, rubricVersion).evidence.filter(({ label }) => /^Claim status (?:section|table)/.test(label));
const depth = (name: string, rubricVersion: string) =>
  a5(name, rubricVersion).metrics?.find(({ name: metric }) => metric === 'reconciliation_artifact_depth')?.value;

beforeAll(() => {
  for (const fixture of V28_A5_FIXTURES) dirs.set(fixture.name, makeRepo(fixture));
}, 120_000);

// The section or table each reconciling fixture's reading cites, at its line.
const CITED: Readonly<Record<string, { path: string; line: number; kind: 'section' | 'table' }>> = {
  'v28a5-known-limitations-section': { path: 'README.md', line: 9, kind: 'section' },
  'v28a5-feature-status-table': { path: 'README.md', line: 11, kind: 'table' },
  'v28a5-status-marks-table': { path: 'README.md', line: 11, kind: 'table' },
  'v28a5-known-issues-in-top-level-doc': { path: 'docs/known-issues.md', line: 1, kind: 'section' },
};

describe('v28 A5: a status section or table in a claim source reconciles its claims', () => {
  for (const { name } of V28_A5_RECONCILING_FIXTURES) {
    it(`${name}: no claim-reconciliation finding under v28, the ${CITED[name]?.kind} cited at its line`, () => {
      expect(claimFinding(name, WITAN_RUBRIC_VERSION_V28)).toBeUndefined();
      const cited = CITED[name] as { path: string; line: number; kind: string };
      expect(statusCitations(name, WITAN_RUBRIC_VERSION_V28), JSON.stringify(a5(name, WITAN_RUBRIC_VERSION_V28).evidence)).toEqual([
        expect.objectContaining({ kind: 'claim_reconciliation', path: cited.path, line: cited.line, label: expect.stringMatching(new RegExp(`^Claim status ${cited.kind}`)) }),
      ]);
    });
    it(`${name}: reconciliation_artifact_depth counts the reconciling claim source under v28 only`, () => {
      expect(depth(name, WITAN_RUBRIC_VERSION_V27)).toBe(0);
      expect(depth(name, WITAN_RUBRIC_VERSION_V28)).toBe(1);
      expect(a5(name, WITAN_RUBRIC_VERSION_V28).score).toBeGreaterThan(a5(name, WITAN_RUBRIC_VERSION_V27).score as number);
    });
    it(`${name}: v27 and v17 still make the finding and cite no status section or table`, () => {
      for (const rubricVersion of [WITAN_RUBRIC_VERSION_V27, WITAN_RUBRIC_VERSION_V17]) {
        expect(claimFinding(name, rubricVersion), rubricVersion).toBeDefined();
        expect(statusCitations(name, rubricVersion), rubricVersion).toEqual([]);
      }
    });
  }

  it('the Known limitations README: under v27 the finding is info, as on main', () => {
    expect(claimFinding('v28a5-known-limitations-section', WITAN_RUBRIC_VERSION_V27)?.severity).toBe('info');
  });

  it('the feature-status table README: under v27 the finding is a warning, as on main', () => {
    expect(claimFinding('v28a5-feature-status-table', WITAN_RUBRIC_VERSION_V27)?.severity).toBe('warning');
  });

  for (const { name } of V28_A5_NOT_RECONCILING_FIXTURES) {
    it(`${name}: the finding fires under v28 as under v27, nothing is cited, and A5 is v27's`, () => {
      const v28 = claimFinding(name, WITAN_RUBRIC_VERSION_V28);
      expect(v28).toBeDefined();
      expect(v28).toEqual(claimFinding(name, WITAN_RUBRIC_VERSION_V27));
      expect(statusCitations(name, WITAN_RUBRIC_VERSION_V28)).toEqual([]);
      expect(a5(name, WITAN_RUBRIC_VERSION_V28)).toEqual(a5(name, WITAN_RUBRIC_VERSION_V27));
    });
  }
});
