import { describe, expect, it } from 'vitest';

import { WITAN_RUBRIC } from '../rubric.js';
import { WITAN_RUBRIC_VERSION_V1, type WitanReportInputPayload } from '../schemas.js';
import { createWitanReport } from '../scoring.js';

function scoreProfile(seed: number): WitanReportInputPayload {
  return {
    productSlug: 'abstention-property',
    productDisplayName: 'Abstention property',
    repo: { path: '/fixture/abstention-property' },
    generatedAt: '2026-08-02T00:00:00.000Z',
    rubricVersion: WITAN_RUBRIC_VERSION_V1,
    signals: WITAN_RUBRIC.map((criterion, index) => ({
      criterionId: criterion.id,
      positiveEvidence: [],
      findings: [],
      metrics: [
        {
          name: `property_score_${criterion.id}`,
          label: `${criterion.id} generated property score`,
          value: ((seed * 17 + index * 13) % 41) / 10,
          max: 4,
          weight: 1,
        },
      ],
    })),
  };
}

describe('read-failure abstention composite invariant', () => {
  it('property: forcing any criterion to abstain never raises a category or overall score', () => {
    for (let seed = 0; seed < 128; seed += 1) {
      const input = scoreProfile(seed);
      const baseline = createWitanReport(input);
      expect(baseline.verdict).not.toBe('insufficient_source');
      if (baseline.verdict === 'insufficient_source') continue;

      for (const forcedCriterion of WITAN_RUBRIC) {
        const forced = createWitanReport({
          ...input,
          signals: (input.signals ?? []).map((signal) =>
            signal.criterionId === forcedCriterion.id
              ? {
                  criterionId: signal.criterionId,
                  positiveEvidence: [],
                  findings: [],
                  metrics: [],
                  insufficientData: true,
                }
              : signal,
          ),
        });
        expect(forced.verdict).not.toBe('insufficient_source');
        if (forced.verdict === 'insufficient_source') continue;

        expect(
          forced.criteria.find((criterion) => criterion.id === forcedCriterion.id)?.status,
        ).toBe('insufficient_data');
        expect(forced.overallScore, `seed ${seed}, forced ${forcedCriterion.id}`).toBeLessThanOrEqual(
          baseline.overallScore,
        );
        if (forcedCriterion.category === 'code_trust') {
          expect(
            forced.codeTrustScore,
            `seed ${seed}, forced ${forcedCriterion.id}`,
          ).toBeLessThanOrEqual(baseline.codeTrustScore);
        } else if (forcedCriterion.category === 'process_trust') {
          expect(
            forced.processTrustScore,
            `seed ${seed}, forced ${forcedCriterion.id}`,
          ).toBeLessThanOrEqual(baseline.processTrustScore);
        }
      }
    }
  });
});
