import { describe, expect, it } from 'vitest';

import { formatCertificateMetricAppliedWeightPercent } from '../certificate-presentation.js';
import { roundScore, scoreMetrics, withAppliedWeightShares } from '../scoring.js';
import type { WitanCriterionMetric, WitanCriterionScore } from '../schemas.js';

// Issue #272 guard: exact applied shares are report data calculated by the scorer, not a second
// presentation formula. These fixtures prove a score reconstructed from those persisted shares
// matches scoreMetrics(), including when the available metric set is reduced and renormalized.

function metric(
  overrides: Partial<WitanCriterionMetric> & Pick<WitanCriterionMetric, 'weight' | 'value'>,
): WitanCriterionMetric {
  return {
    name: 'fixture_metric',
    label: 'Fixture metric',
    max: 1,
    ...overrides,
  };
}

function criterionWithMetrics(metrics: WitanCriterionMetric[]): WitanCriterionScore {
  return {
    id: 'A2',
    title: 'Parity fixture',
    category: 'code_trust',
    score: 0,
    status: 'info',
    evidence: [],
    findings: [],
    metrics: withAppliedWeightShares(metrics),
  };
}

// Reconstructs the criterion score using ONLY what the certificate displays: each metric's
// normalized value and its precise applied-weight share (not the rounded display percent —
// integer-percent rounding is a separate, deliberate display choice, tested for correctness on
// its own terms by the largest-remainder-sums-to-100 test below; folding it into this parity
// check would make the test flaky against expected rounding noise instead of catching real
// formula drift).
function reconstructScoreFromDisplayedShares(criterion: WitanCriterionScore): number {
  const weightedTotal = criterion.metrics.reduce((sum, m) => {
    const normalized = m.max ? Math.min(m.value / m.max, 1) : Math.min(m.value, 1);
    const share = m.appliedWeightShare;
    expect(share).toBeDefined();
    return sum + normalized * (share ?? 0);
  }, 0);
  return roundScore(weightedTotal * 4);
}

describe('Issue #272 — recorded applied shares match scoreMetrics()', () => {
  const fixtures: Record<string, WitanCriterionMetric[]> = {
    'uniform weights': [
      metric({ name: 'm1', weight: 1, value: 1 }),
      metric({ name: 'm2', weight: 1, value: 0.5 }),
      metric({ name: 'm3', weight: 1, value: 0 }),
    ],
    'uneven weights': [
      metric({ name: 'm1', weight: 1, value: 1 }),
      metric({ name: 'm2', weight: 3, value: 0.25 }),
    ],
    // The "absent metric" case ADR-0022 names: only one of a hypothetical larger metric set
    // survived into criterion.metrics, so scoreMetrics() renormalizes on just this one.
    'renormalized (single surviving metric)': [metric({ name: 'm1', weight: 1, value: 0.5 })],
    'fractional weights below 1': [
      metric({ name: 'm1', weight: 0.4, value: 1 }),
      metric({ name: 'm2', weight: 0.6, value: 0.5 }),
    ],
    'seven equal weights (heavy rounding pressure)': Array.from({ length: 7 }, (_, i) =>
      metric({ name: `m${i}`, weight: 1, value: i % 2 === 0 ? 1 : 0 }),
    ),
  };

  for (const [name, metrics] of Object.entries(fixtures)) {
    it(`${name}: reconstructing the score from displayed shares matches scoreMetrics() exactly`, () => {
      const criterion = criterionWithMetrics(metrics);
      expect(reconstructScoreFromDisplayedShares(criterion)).toBe(scoreMetrics(metrics));
    });
  }
});

describe('Track A2 — largest-remainder rounding', () => {
  it('sums to exactly 100 for three equal-weight metrics, which naive rounding would undershoot', () => {
    const metrics = [
      metric({ name: 'm1', weight: 1, value: 0 }),
      metric({ name: 'm2', weight: 1, value: 0 }),
      metric({ name: 'm3', weight: 1, value: 0 }),
    ];
    const criterion = criterionWithMetrics(metrics);
    const percents = criterion.metrics.map((m) =>
      formatCertificateMetricAppliedWeightPercent(criterion, m),
    );

    expect(percents.reduce((sum, p) => sum + p, 0)).toBe(100);
    // Deterministic tie-break: equal fractional remainders (.333...) resolve in original
    // metric order, so the first metric absorbs the leftover point.
    expect(percents).toEqual([34, 33, 33]);
  });

  it('sums to exactly 100 for seven equal-weight metrics under heavier rounding pressure', () => {
    const metrics = Array.from({ length: 7 }, (_, i) => metric({ name: `m${i}`, weight: 1, value: 0 }));
    const criterion = criterionWithMetrics(metrics);
    const percents = criterion.metrics.map((m) =>
      formatCertificateMetricAppliedWeightPercent(criterion, m),
    );

    expect(percents.reduce((sum, p) => sum + p, 0)).toBe(100);
    expect(percents).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it('gives the strictly largest fraction the rounding point on an uneven split, not a tie', () => {
    // 1/7, 2/7, 4/7 of 100 = 14.2857..., 28.5714..., 57.1429... — floors sum to 99, and only
    // the middle metric's fractional remainder (.5714) is strictly largest, so it alone gets
    // the leftover point.
    const metrics = [
      metric({ name: 'm1', weight: 1, value: 0 }),
      metric({ name: 'm2', weight: 2, value: 0 }),
      metric({ name: 'm3', weight: 4, value: 0 }),
    ];
    const criterion = criterionWithMetrics(metrics);
    const percents = criterion.metrics.map((m) =>
      formatCertificateMetricAppliedWeightPercent(criterion, m),
    );

    expect(percents).toEqual([14, 29, 57]);
    expect(percents.reduce((sum, p) => sum + p, 0)).toBe(100);
  });

  it('still returns exact percentages with no rounding needed when weights divide evenly', () => {
    const metrics = [
      metric({ name: 'm1', weight: 1, value: 0 }),
      metric({ name: 'm2', weight: 3, value: 0 }),
    ];
    const criterion = criterionWithMetrics(metrics);
    const percents = criterion.metrics.map((m) =>
      formatCertificateMetricAppliedWeightPercent(criterion, m),
    );

    expect(percents).toEqual([25, 75]);
  });
});
