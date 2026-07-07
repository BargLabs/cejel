import type { WitanReport } from '../schemas.js';
import { describe, expect, it } from 'vitest';

import { renderWitanBadgeEndpoint, renderWitanBadgeSvg } from '../badge.js';

function fixtureReport(overallScore: number): WitanReport {
  return {
    productSlug: 'witan',
    productDisplayName: 'Witan',
    repo: { path: '/tmp/example-repo' },
    generatedAt: '2026-07-05T00:00:00.000Z',
    rubricVersion: 'witan-rubric-v1-2026-06-24',
    codeTrustScore: overallScore,
    processTrustScore: overallScore,
    overallScore,
    criteria: [
      {
        id: 'A1',
        title: 'Test integrity',
        category: 'code_trust',
        score: overallScore,
        status: 'verified',
        evidence: [],
        findings: [],
        metrics: [],
      },
    ],
  };
}

describe('witan-core badge rendering', () => {
  it.each([
    [3.8, 'brightgreen', 'verified'],
    [3.0, 'yellow', 'conditional'],
    [2.0, 'orange', 'at risk'],
    [0.5, 'red', 'unverified'],
  ] as const)('maps score %s to color %s and verdict %s', (score, color, verdictWord) => {
    const endpoint = renderWitanBadgeEndpoint(fixtureReport(score));
    expect(endpoint).toMatchObject({ schemaVersion: 1, label: 'cejel trust', color });
    expect(endpoint.message).toBe(`${score.toFixed(1)}/4.0 ${verdictWord}`);
  });

  it('renders a self-contained SVG with no external network references', () => {
    const svg = renderWitanBadgeSvg(fixtureReport(3.8));
    expect(svg).toContain('<svg');
    expect(svg).toContain('3.8/4.0 verified');
    expect(svg).not.toMatch(/src="https?:|href="https?:|url\(https?:/);
  });

  it('is deterministic for an identical report', () => {
    const report = fixtureReport(2.7);
    expect(renderWitanBadgeSvg(report)).toBe(renderWitanBadgeSvg(report));
    expect(renderWitanBadgeEndpoint(report)).toEqual(renderWitanBadgeEndpoint(report));
  });

  it('escapes XML-sensitive characters in labels', () => {
    const svg = renderWitanBadgeSvg(fixtureReport(3.8));
    expect(svg).not.toContain('<script');
  });
});
