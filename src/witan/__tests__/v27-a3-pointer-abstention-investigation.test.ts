import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { A3_POINTER_FIXTURES } from './fixtures/a3-pointer-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';

// v27 A3 Git LFS pointer abstention: investigation only (2026-11-20; refs #519 #749). No file under
// src/ outside __tests__/ changes, so no report under any rubric moves. These synthetic repositories
// (written from scratch, none derived from a real repository) reproduce the item B tables in
// docs/v27-a3-pointer-abstention-investigation-2026-11-20.md. Run in dump mode to print them:
//   V27_A3_POINTER_DUMP=/tmp/a3-dump.txt pnpm vitest run src/witan/__tests__/v27-a3-pointer-abstention-investigation.test.ts
// The always-on assertions pin what the report states: under v27 A3 abstains on every fixture whose
// pointer A3 read and cites only the pointer, and v27 is never above v17 on A3 or the composite.
// The fixtures now live in fixtures/a3-pointer-fixtures.ts, unchanged.
//
// Since the operator's ruling of 20 Nov on #753 (the below-maximum rule, rubric-version.ts), one
// fixture no longer abstains: in a3-strong-helm-icon-pointer only the health-check component read
// the pointer, and production-readiness checks are at 6 of 6, so v27 keeps v17's A3 with a
// disclosure (v27-a3-pointer-below-maximum.test.ts). Every other fixture below abstains as before.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

/** The fixtures whose pointer an A3 read reaches, so v27's A3 abstains on them. */
const A3_READS_POINTER = [
  'a3-strong-docs-image-pointer',
  'a3-weak-docs-image-pointer',
  'a3-strong-compose-pointer',
  'a3-strong-dockerfile-pointer',
  'a3-strong-health-route-pointer',
  'a3-library-entrypoint-pointer',
] as const;

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = A3_POINTER_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'a3-pointer-fixture',
    productDisplayName: 'A3 pointer fixture',
    generatedAt: '2026-11-20T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function a3(name: string, rubricVersion: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === 'A3');
  if (!found) throw new Error(`${name}@${rubricVersion} has no A3`);
  return found;
}

describe('v27 A3 Git LFS pointer abstention investigation (refs #519 #749)', () => {
  it.each(A3_READS_POINTER)('%s: v27 A3 abstains and cites only the pointer; v17 scores what it read', (name) => {
    const v27 = a3(name, V27);
    expect(v27.status).toBe('insufficient_data');
    expect(v27.score).toBe(0);
    expect(v27.metrics).toEqual([]);
    expect(v27.findings).toEqual([]);
    expect(v27.evidence.length).toBeGreaterThan(0);
    expect(v27.evidence.every(({ label }) => /Git LFS pointer/.test(label))).toBe(true);
    expect(report(name, V27).contentReadSummary?.affectedCriteria).toContain('A3');
    expect(a3(name, V17).status).not.toBe('insufficient_data');
  });

  it('a pointer read only by a metric at its maximum keeps v17\'s A3 (the 20 Nov rule)', () => {
    const v17 = a3('a3-strong-helm-icon-pointer', V17);
    const v27 = a3('a3-strong-helm-icon-pointer', V27);
    expect({ score: v27.score, status: v27.status, metrics: v27.metrics, findings: v27.findings }).toEqual({
      score: v17.score,
      status: v17.status,
      metrics: v17.metrics,
      findings: v17.findings,
    });
    expect(report('a3-strong-helm-icon-pointer', V27).contentReadSummary?.affectedCriteria ?? []).not.toContain('A3');
  });

  it('a pointer no A3 read selects leaves A3 as under v17', () => {
    const v17 = a3('a3-strong-web-image-pointer', V17);
    const v27 = a3('a3-strong-web-image-pointer', V27);
    expect({ score: v27.score, status: v27.status, metrics: v27.metrics, findings: v27.findings }).toEqual({
      score: v17.score,
      status: v17.status,
      metrics: v17.metrics,
      findings: v17.findings,
    });
  });

  it('v17 with a pointer never scores A3 above its content-complete control', () => {
    for (const [pointer, control] of [
      ['a3-strong-docs-image-pointer', 'a3-strong-control'],
      ['a3-weak-docs-image-pointer', 'a3-weak-control'],
      ['a3-strong-compose-pointer', 'a3-strong-control'],
      ['a3-strong-dockerfile-pointer', 'a3-strong-control'],
      ['a3-strong-health-route-pointer', 'a3-strong-health-route-control'],
      ['a3-strong-helm-icon-pointer', 'a3-strong-control'],
    ] as const) {
      expect(a3(pointer, V17).score, pointer).toBeLessThanOrEqual(a3(control, V17).score);
    }
  });

  it('a pointer at the file the applicability gate reads turns a scored service into v17 not-applicable', () => {
    expect(a3('a3-library-entrypoint-pointer', V17).status).toBe('not_applicable');
    expect(a3('a3-library-entrypoint-control', V17).status).not.toBe('not_applicable');
    expect(a3('a3-library-entrypoint-control', V17).score).toBeGreaterThan(0);
  });

  it.each(A3_POINTER_FIXTURES.map(({ name }) => name))('%s: v27 is not above v17 on A3 or the composite', (name) => {
    expect(a3(name, V27).score).toBeLessThanOrEqual(a3(name, V17).score);
    const v17Overall = report(name, V17).overallScore;
    const v27Overall = report(name, V27).overallScore;
    if (v17Overall !== null && v27Overall !== null) expect(v27Overall).toBeLessThanOrEqual(v17Overall);
  });

  it.runIf(process.env.V27_A3_POINTER_DUMP !== undefined)('dumps A3 under v17 and v27', () => {
    const out: string[] = [];
    for (const { name, purpose } of A3_POINTER_FIXTURES) {
      out.push(`## ${name}`, `purpose: ${purpose}`);
      for (const rubricVersion of [V17, V27]) {
        const r = report(name, rubricVersion);
        const c = a3(name, rubricVersion);
        const tag = rubricVersion === V17 ? 'v17' : 'v27';
        out.push(`${tag}: overall ${r.overallScore} verdict ${r.verdict}; A3 ${c.score} ${c.status}`);
        for (const m of c.metrics) {
          const components = (m.presentation?.components ?? []).map(({ label, count }) => `${label}=${count}`).join(', ');
          out.push(`  metric ${m.name}=${m.value}${components ? ` [${components}]` : ''}`);
        }
        for (const f of c.findings) out.push(`  finding ${f.severity}: ${f.summary}`);
        for (const e of c.evidence) out.push(`  evidence ${e.path}:${e.line ?? '-'} ${e.label}`);
        for (const d of c.disclosures ?? []) out.push(`  disclosure ${d}`);
        out.push(`  notes ${c.notes ?? '-'}`);
        out.push(`  affectedCriteria ${(r.contentReadSummary?.affectedCriteria ?? []).join(',') || '-'}; lfsPointer ${r.contentReadSummary?.byReason.lfsPointer ?? 0}`);
        for (const s of r.scanLimitations ?? []) if (/abstained/.test(s)) out.push(`  scanLimitation ${s}`);
      }
      out.push('');
    }
    writeFileSync(process.env.V27_A3_POINTER_DUMP ?? '', `${out.join('\n')}\n`);
  });
});
