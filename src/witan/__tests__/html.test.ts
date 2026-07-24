import { describe, expect, it } from 'vitest';

import { renderWitanHtmlReport } from '../html.js';
import { WITAN_TRADING_RUBRIC_V0 } from '../rubric.js';
import { type WitanReport, WITAN_TRADING_RUBRIC_VERSION_V0 } from '../schemas.js';
import { createWitanReport } from '../scoring.js';

// Regression guards for goal_cejel_cert_applicable_dims_and_link_integrity_2026-07-12.
//
// The bug: renderWitanHtmlReport rendered a scored <h3> section for EVERY rubric
// dimension, including ones the repository's archetype was never evaluated on (the
// Alfred-substrate-only B1/B5 on external code) — implying the repo was assessed on
// them and found wanting. The fix groups not_applicable dimensions separately, named,
// with their reason. insufficient_data (a measurement gap, not inapplicability) must
// stay in the normal scored section, unchanged — trading the cosmetic fix for a loss
// of that honesty distinction is exactly the failure mode Guard 2 exists to catch.

const generatedAt = '2026-07-12T00:00:00.000Z';

function buildFixtureReport(): WitanReport {
  return {
    productSlug: 'fixture-repo',
    productDisplayName: 'fixture-repo',
    repo: { url: 'https://example.com/fixture-repo.git', headSha: 'abcdef1' },
    generatedAt,
    rubricVersion: 'witan-rubric-v1-2026-06-24',
    verdict: 'conditional',
    codeTrustScore: 4,
    processTrustScore: 2,
    overallScore: 3,
    criteria: [
      {
        id: 'A1',
        title: 'Test integrity',
        category: 'code_trust',
        score: 4,
        status: 'verified',
        evidence: [{ kind: 'test_run', label: 'CI test run', path: '.github/workflows/ci.yml' }],
        findings: [],
        metrics: [],
      },
      {
        id: 'B1',
        title: 'Dispatch trace completeness',
        category: 'process_trust',
        score: 0,
        status: 'not_applicable',
        evidence: [],
        findings: [],
        metrics: [],
        notes: 'Substrate-specific: Alfred dispatch trace is not applicable to external code.',
      },
      {
        id: 'B2',
        title: 'PR outcome traceability',
        category: 'process_trust',
        score: 0,
        status: 'insufficient_data',
        evidence: [],
        findings: [],
        metrics: [],
      },
    ],
  };
}

describe('renderWitanHtmlReport — applicable-dimensions-only presentation', () => {
  it('renders an entirely unmeasured category as not measured with its coverage context', () => {
    const html = renderWitanHtmlReport(buildFixtureReport());

    expect(html).toContain('<span>Code 4.0</span>');
    expect(html).toContain('<span>Process not measured</span>');
    expect(html).toContain('code 1/1 · process 0/2 measured · low confidence');
    expect(html).not.toContain('<span>Process 0.0</span>');
  });

  it('keeps legacy numeric subscores when a custom rubric has no code/process buckets', () => {
    const report = createWitanReport(
      {
        productSlug: 'trading-fixture',
        productDisplayName: 'Trading fixture',
        repo: { url: 'https://example.com/trading-fixture.git' },
        generatedAt,
        rubricVersion: WITAN_TRADING_RUBRIC_VERSION_V0,
        signals: WITAN_TRADING_RUBRIC_V0.map((criterion, index) => ({
          criterionId: criterion.id,
          metrics: [
            {
              name: `${criterion.id}_metric`,
              label: `${criterion.title} metric`,
              value: (index % 4) + 1,
              max: 4,
            },
          ],
        })),
      },
      undefined,
      WITAN_TRADING_RUBRIC_V0,
    );

    const html = renderWitanHtmlReport(report);

    expect(report.codeTrustScore).not.toBeNull();
    expect(report.processTrustScore).not.toBeNull();
    expect(html).toContain(`<span>Code ${report.codeTrustScore?.toFixed(1)}</span>`);
    expect(html).toContain(`<span>Process ${report.processTrustScore?.toFixed(1)}</span>`);
    expect(html).not.toContain('<span>Code not measured</span>');
    expect(html).not.toContain('<span>Process not measured</span>');
    expect(html).toContain(
      'validation 3/3 · governance 4/4 · execution 2/2 measured',
    );
  });

  it('renders a saturated metric as its cap while preserving the larger raw count', () => {
    const report = buildFixtureReport();
    report.criteria[0]?.metrics.push({
      name: 'automation_signals',
      label: 'Automation',
      value: 4,
      max: 2,
      weight: 1,
      unit: 'signals',
      kind: 'saturating_count',
    });

    const html = renderWitanHtmlReport(report);

    expect(html).toContain('<span>2 signals (capped; 4 raw)</span>');
    expect(html).not.toContain('<span>4/2 signals</span>');
  });

  it('Guard 3 — a not_applicable dimension is not rendered as a scored <h3> section', () => {
    const html = renderWitanHtmlReport(buildFixtureReport());

    const scoredHeadings = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(scoredHeadings).not.toContain('Dispatch trace completeness');

    // Grouped instead, clearly labelled, with its reason stated.
    expect(html).toContain('Not applicable to this repository');
    expect(html).toContain('B1');
    expect(html).toContain(
      'Substrate-specific: Alfred dispatch trace is not applicable to external code.',
    );
  });

  it('Guard 2 (LOAD-BEARING) — an insufficient_data dimension stays visible with its reason', () => {
    const html = renderWitanHtmlReport(buildFixtureReport());

    // Still a normal scored section (unlike not_applicable): its own <h3> heading survives.
    const scoredHeadings = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(scoredHeadings).toContain('PR outcome traceability');

    // The status is stated plainly, not laundered into the not-applicable group.
    expect(html).toContain('data-status="insufficient_data"');
    expect(html).toContain('No data');
    expect(html).not.toContain('<span class="na-id">B2</span> PR outcome traceability');
  });

  it('a verified criterion renders normally, unaffected by the not_applicable grouping', () => {
    const html = renderWitanHtmlReport(buildFixtureReport());
    const scoredHeadings = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(scoredHeadings).toContain('Test integrity');
  });

  // GUARD 4 (goal_cejel_cert_applicable_dims_and_link_integrity_2026-07-12): this is
  // presentation-only — the report's scores, verdicts, coverage, and criteria are the
  // ranking's ground truth and must never be touched by rendering. Filtering the
  // criteria list for display (applicable vs not_applicable) is a read, not a write;
  // this locks that invariant against a future refactor that mutates in place.
  it('Guard 4 — rendering does not mutate the input report (no scoring drift)', () => {
    const report = buildFixtureReport();
    const before = JSON.parse(JSON.stringify(report));
    renderWitanHtmlReport(report);
    expect(report).toEqual(before);
  });
});
