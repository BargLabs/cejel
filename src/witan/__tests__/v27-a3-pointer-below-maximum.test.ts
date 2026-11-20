import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { WITAN_LFS_POINTER_CITATION_LABEL, witanV27LfsPointerNotApplicablePrefix } from '../abstention.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { A3_BELOW_MAXIMUM_FIXTURES, A3_POINTER_FIXTURES } from './fixtures/a3-pointer-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';

// v27 A3 (operator ruling of 20 Nov on #753; refs #519 #753). Where A3's only content-read skips are
// Git LFS pointer reads and A3 was scored, it abstains only where a metric whose read reached a
// pointer is below its maximum, or where a pointer read was attributed to no metric. Otherwise it
// keeps v17's score, status, metrics, findings and evidence, cites the pointers, and adds one
// disclosure naming them. A not-applicable A3 that read a pointer abstains as before. Synthetic
// repositories only (fixtures/a3-pointer-fixtures.ts).

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const A3_POINTER_PREFIX = witanV27LfsPointerNotApplicablePrefix('A3');
const ALL_FIXTURES = [...A3_POINTER_FIXTURES, ...A3_BELOW_MAXIMUM_FIXTURES];

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = ALL_FIXTURES.find((entry) => entry.name === name);
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

function metricValue(criterion: WitanCriterionScore, name: string): number | undefined {
  return criterion.metrics.find((entry) => entry.name === name)?.value;
}

function expectKept(name: string, pointerPath: string): void {
  const v17 = a3(name, V17);
  const v27 = a3(name, V27);
  expect({ score: v27.score, status: v27.status, metrics: v27.metrics, findings: v27.findings }).toEqual({
    score: v17.score,
    status: v17.status,
    metrics: v17.metrics,
    findings: v17.findings,
  });
  // v17's evidence, in v17's order, then the pointer cited as #749 cites it.
  expect(v27.evidence.slice(0, v17.evidence.length)).toEqual(v17.evidence);
  expect(v27.evidence.slice(v17.evidence.length)).toEqual([
    expect.objectContaining({ path: pointerPath, label: WITAN_LFS_POINTER_CITATION_LABEL }),
  ]);
  expect(v17.disclosures ?? []).toEqual([]);
  const disclosures = v27.disclosures ?? [];
  expect(disclosures).toHaveLength(1);
  expect(disclosures[0]?.startsWith(A3_POINTER_PREFIX)).toBe(true);
  expect(disclosures[0]).toContain(pointerPath);
  expect(disclosures[0]).toMatch(/already at (?:its|their) maximum/);
  expect(disclosures[0]).toMatch(/could not change this rating/);
  expect(report(name, V27).contentReadSummary?.affectedCriteria ?? []).not.toContain('A3');
}

function expectAbstains(name: string): void {
  const v27 = a3(name, V27);
  expect(v27.status).toBe('insufficient_data');
  expect(v27.score).toBe(0);
  expect(v27.metrics).toEqual([]);
  expect(v27.findings).toEqual([]);
  expect(v27.disclosures ?? []).toEqual([]);
  expect(report(name, V27).contentReadSummary?.affectedCriteria).toContain('A3');
}

describe('v27 A3: an LFS pointer abstains only where unread content could still change the rating', () => {
  it('a pointer under docs/ with the rollback-notes count at its maximum: v27 keeps v17\'s A3, cites the pointer and discloses it', () => {
    expect(metricValue(a3('a3-rollback-at-maximum-docs-image-pointer', V17), 'rollback_safety_depth')).toBe(4);
    expectKept('a3-rollback-at-maximum-docs-image-pointer', 'docs/architecture.png');
  });

  it('the same pointer with the rollback-notes count below its maximum: v27 abstains, as on main', () => {
    expect(metricValue(a3('a3-strong-docs-image-pointer', V17), 'rollback_safety_depth')).toBeLessThan(4);
    expectAbstains('a3-strong-docs-image-pointer');
  });

  it('a pointer at the file the not-applicable gate reads: v27 abstains, as on main', () => {
    expect(a3('a3-library-entrypoint-pointer', V17).status).toBe('not_applicable');
    expectAbstains('a3-library-entrypoint-pointer');
  });

  it('a pointer read by the health-check component with production-readiness checks at 6 of 6: kept, with the disclosure', () => {
    expect(metricValue(a3('a3-strong-helm-icon-pointer', V17), 'prod_readiness_primitives')).toBe(6);
    expectKept('a3-strong-helm-icon-pointer', 'helm/svc/icon.png');
  });

  it('the same pointer with production-readiness checks at 5 of 6: v27 abstains', () => {
    expect(metricValue(a3('a3-five-of-six-helm-icon-pointer', V17), 'prod_readiness_primitives')).toBe(5);
    expectAbstains('a3-five-of-six-helm-icon-pointer');
  });

  it('a pointer one of whose reads no metric owns (the compose file, read for its citation line): v27 abstains', () => {
    expectAbstains('a3-strong-compose-pointer');
  });

  it.each(ALL_FIXTURES.map(({ name }) => name))('%s: v27 is at or below v17 on A3 and the composite', (name) => {
    expect(a3(name, V27).score).toBeLessThanOrEqual(a3(name, V17).score);
    const v17Overall = report(name, V17).overallScore;
    const v27Overall = report(name, V27).overallScore;
    if (v17Overall !== null && v27Overall !== null) expect(v27Overall).toBeLessThanOrEqual(v17Overall);
  });

  it('v17 never carries the disclosure', () => {
    for (const { name } of ALL_FIXTURES) {
      expect((a3(name, V17).disclosures ?? []).some((text) => text.startsWith(A3_POINTER_PREFIX)), name).toBe(false);
    }
  });
});
