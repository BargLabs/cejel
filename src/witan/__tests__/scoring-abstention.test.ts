import { describe, expect, it } from 'vitest';

import { WITAN_RUBRIC } from '../rubric.js';
import {
  type WitanContentReadSkipReason,
  WITAN_RUBRIC_VERSION_V1,
  type WitanReportInputPayload,
} from '../schemas.js';
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

// goal_cejel_0_4_8_abstention_scoring_fix_2026-09-08, defect 2, guard (rule 8): a `too_large`
// (or `excluded_by_extension` / `non_regular_file`) abstention is Cejel's own disclosed coverage
// limit, never a read failure, and must be excluded from the composite exactly like ordinary
// insufficient_data. An `unreadable` (or unspecified — the historical conservative default)
// abstention is a genuine read failure and must stay in the composite denominator at score 0.
describe('insufficientDataReason gates composite membership, not just criterion status', () => {
  function inputWithAbstainedFirstCriterion(
    reason: WitanContentReadSkipReason | undefined,
  ): WitanReportInputPayload {
    return {
      productSlug: 'reason-fixture',
      productDisplayName: 'Reason fixture',
      repo: { path: '/fixture/reason' },
      generatedAt: '2026-09-08T00:00:00.000Z',
      rubricVersion: WITAN_RUBRIC_VERSION_V1,
      signals: WITAN_RUBRIC.map((criterion, index) =>
        index === 0
          ? {
              criterionId: criterion.id,
              positiveEvidence: [],
              findings: [],
              metrics: [],
              insufficientData: true as const,
              ...(reason !== undefined ? { insufficientDataReason: reason } : {}),
            }
          : {
              criterionId: criterion.id,
              positiveEvidence: [],
              findings: [],
              metrics: [
                {
                  name: `measured_${criterion.id}`,
                  label: `${criterion.id} measured`,
                  value: 3,
                  max: 4,
                  weight: 1,
                },
              ],
            },
      ),
    };
  }

  it('reason too_large: the abstained criterion is excluded from the composite (same score as if it were absent entirely)', () => {
    const withReason = createWitanReport(inputWithAbstainedFirstCriterion('too_large'));
    const withoutSignalAtAll = createWitanReport({
      ...inputWithAbstainedFirstCriterion('too_large'),
      signals: (inputWithAbstainedFirstCriterion('too_large').signals ?? []).slice(1),
    });
    const forcedId = WITAN_RUBRIC[0]!.id;

    expect(withReason.criteria.find((c) => c.id === forcedId)?.status).toBe('insufficient_data');
    expect(withReason.overallScore).toBe(withoutSignalAtAll.overallScore);
  });

  it('reason excluded_by_extension and non_regular_file are likewise excluded from the composite', () => {
    const baseline = createWitanReport(inputWithAbstainedFirstCriterion('too_large'));
    for (const reason of ['excluded_by_extension', 'non_regular_file'] as const) {
      const report = createWitanReport(inputWithAbstainedFirstCriterion(reason));
      expect(report.overallScore).toBe(baseline.overallScore);
    }
  });

  it('reason unreadable (and no reason at all) stays in the composite denominator at score 0, scoring strictly below the too_large case', () => {
    const tooLarge = createWitanReport(inputWithAbstainedFirstCriterion('too_large'));
    const unreadable = createWitanReport(inputWithAbstainedFirstCriterion('unreadable'));
    const unspecified = createWitanReport(inputWithAbstainedFirstCriterion(undefined));
    const forcedId = WITAN_RUBRIC[0]!.id;
    expect(tooLarge.overallScore).not.toBeNull();
    const tooLargeScore = tooLarge.overallScore as number;

    for (const report of [unreadable, unspecified]) {
      expect(report.criteria.find((c) => c.id === forcedId)?.status).toBe('insufficient_data');
      expect(report.overallScore).toBeLessThan(tooLargeScore);
    }
    expect(unreadable.overallScore).toBe(unspecified.overallScore);
  });

  it('denied_path is treated as a read failure (environmental, not self-imposed), like unreadable', () => {
    const unreadable = createWitanReport(inputWithAbstainedFirstCriterion('unreadable'));
    const deniedPath = createWitanReport(inputWithAbstainedFirstCriterion('denied_path'));
    expect(deniedPath.overallScore).toBe(unreadable.overallScore);
  });
});
