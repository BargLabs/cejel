import type { WitanReport } from '../witan/index.js';
import { describe, expect, it } from 'vitest';

import { buildWitanCliSummary } from '../summary.js';

type ScoredWitanReport = Exclude<WitanReport, { verdict: 'insufficient_source' }>;

function findingCriterion(
  id: string,
  findings: Array<{ severity: 'critical' | 'warning' | 'info'; summary: string }>,
): WitanReport['criteria'][number] {
  return {
    id: id as WitanReport['criteria'][number]['id'],
    title: id,
    category: 'code_trust',
    score: 2,
    status: 'warning',
    evidence: [],
    findings: findings.map((f) => ({
      severity: f.severity,
      summary: f.summary,
      evidence: { kind: 'artifact', label: 'fixture', path: 'fixture.ts' },
    })),
    metrics: [],
  };
}

function fixtureReport(criteria: WitanReport['criteria']): ScoredWitanReport {
  return {
    productSlug: 'witan',
    productDisplayName: 'Witan',
    repo: { path: '/tmp/example' },
    generatedAt: '2026-07-05T00:00:00.000Z',
    rubricVersion: 'witan-rubric-v1-2026-06-24',
    verdict: 'conditional',
    codeTrustScore: 2.5,
    processTrustScore: 3.0,
    overallScore: 2.7,
    criteria,
  };
}

describe('buildWitanCliSummary', () => {
  it('sorts findings critical-first regardless of criterion order', () => {
    const report = fixtureReport([
      findingCriterion('A1', [{ severity: 'info', summary: 'info finding' }]),
      findingCriterion('A2', [{ severity: 'critical', summary: 'critical finding' }]),
      findingCriterion('A3', [{ severity: 'warning', summary: 'warning finding' }]),
    ]);

    const summary = buildWitanCliSummary(report);

    expect(summary.topFindings.map((f) => f.severity)).toEqual(['critical', 'warning', 'info']);
    expect(summary.findingCount).toBe(3);
  });

  it('caps topFindings at 5 while findingCount reflects the true total', () => {
    const ids = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3'];
    const criteria = ids.map((id, i) =>
      findingCriterion(id, [{ severity: 'warning', summary: `finding ${i}` }]),
    );
    const report = fixtureReport(criteria);

    const summary = buildWitanCliSummary(report);

    expect(summary.topFindings).toHaveLength(5);
    expect(summary.findingCount).toBe(8);
  });

  it('derives the verdict from overallScore consistently with the HTML certificate', () => {
    const report = fixtureReport([findingCriterion('A1', [])]);
    const summary = buildWitanCliSummary({
      ...report,
      overallScore: 3.8,
      verdict: 'verified',
    });
    expect(summary.verdict).toBe('Verified');
  });

  it('reports zero findings cleanly', () => {
    const report = fixtureReport([findingCriterion('A1', [])]);
    const summary = buildWitanCliSummary(report);
    expect(summary.topFindings).toEqual([]);
    expect(summary.findingCount).toBe(0);
  });

  it('dedupes and sorts contributing sources from consumedSignals', () => {
    const report = {
      ...fixtureReport([findingCriterion('A2', [])]),
      consumedSignals: [
        {
          source: 'sarif:codex-security',
          dimension: 'A2' as const,
          findingCount: 2,
          severityBreakdown: { critical: 2, warning: 0, info: 0 },
          nativeScore: 3,
          scoreAdjustment: -0.5,
          adjustedScore: 2.5,
          findings: [
            { ruleId: 'sql-injection', severity: 'critical' as const, message: 'SQL injection.' },
            {
              ruleId: 'hardcoded-secret',
              severity: 'critical' as const,
              message: 'Hardcoded key.',
            },
          ],
        },
        {
          source: 'sarif:codex-security',
          dimension: 'A2' as const,
          findingCount: 1,
          severityBreakdown: { critical: 0, warning: 1, info: 0 },
          nativeScore: 3,
          scoreAdjustment: -0.1,
          adjustedScore: 2.9,
          findings: [{ ruleId: 'xss', severity: 'warning' as const, message: 'Reflected XSS.' }],
        },
        {
          source: 'scorecard',
          dimension: 'A4' as const,
          findingCount: 1,
          severityBreakdown: { critical: 0, warning: 1, info: 0 },
          nativeScore: 3,
          scoreAdjustment: -0.1,
          adjustedScore: 2.9,
          findings: [
            {
              ruleId: 'scorecard:Vulnerabilities',
              severity: 'warning' as const,
              message: 'Known vuln.',
            },
          ],
        },
      ],
    };

    const summary = buildWitanCliSummary(report);
    expect(summary.contributingSources).toEqual(['sarif:codex-security', 'scorecard']);
  });

  it('reports no contributing sources when no external signals were consumed', () => {
    const report = fixtureReport([findingCriterion('A1', [])]);
    const summary = buildWitanCliSummary(report);
    expect(summary.contributingSources).toEqual([]);
  });

  it('summarizes per-source counts and itemizes attributed external findings', () => {
    const report = {
      ...fixtureReport([findingCriterion('A2', [])]),
      consumedSignals: [
        {
          source: 'sarif:Codex Security',
          dimension: 'A2' as const,
          findingCount: 2,
          severityBreakdown: { critical: 2, warning: 0, info: 0 },
          nativeScore: 3,
          scoreAdjustment: -0.5,
          adjustedScore: 2.5,
          findings: [
            { ruleId: 'sql-injection', severity: 'critical' as const, message: 'SQL injection.' },
            {
              ruleId: 'hardcoded-secret',
              severity: 'critical' as const,
              message: 'Hardcoded key.',
            },
          ],
        },
        {
          source: 'sarif:Codex Security',
          dimension: 'A4' as const,
          findingCount: 1,
          severityBreakdown: { critical: 0, warning: 1, info: 0 },
          nativeScore: 3,
          scoreAdjustment: -0.1,
          adjustedScore: 2.9,
          findings: [
            { ruleId: 'outdated-dep', severity: 'warning' as const, message: 'Outdated package.' },
          ],
        },
      ],
    };

    const summary = buildWitanCliSummary(report);

    expect(summary.externalSources).toEqual([
      {
        source: 'sarif:Codex Security',
        label: 'Codex Security',
        findingCount: 3,
        dimensions: ['A2', 'A4'],
      },
    ]);
    expect(summary.externalFindingCount).toBe(3);
    expect(summary.topExternalFindings.map((f) => f.ruleId)).toEqual([
      'hardcoded-secret',
      'sql-injection',
      'outdated-dep',
    ]);
    expect(summary.topExternalFindings.every((f) => f.label === 'Codex Security')).toBe(true);
  });
});
