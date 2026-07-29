import { describe, expect, it } from 'vitest';

import { renderWitanHtmlReport } from '../html.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';

function criterion(
  overrides: Partial<WitanCriterionScore> & Pick<WitanCriterionScore, 'id' | 'category'>,
): WitanCriterionScore {
  return {
    title: overrides.id,
    score: 3,
    status: 'info',
    evidence: [],
    findings: [],
    metrics: [],
    ...overrides,
  };
}

function reportFixture(
  criteria: WitanCriterionScore[],
  options: { headSha?: string } = {},
): WitanReport {
  return {
    productSlug: 'certificate-fixture',
    productDisplayName: 'Certificate fixture',
    repo: {
      path: '/tmp/certificate-fixture',
      ...(options.headSha ? { headSha: options.headSha } : {}),
    },
    generatedAt: '2026-07-28T00:00:00.000Z',
    rubricVersion: 'witan-rubric-v17-2026-07-24',
    verdict: 'conditional',
    codeTrustScore: 3,
    processTrustScore: 3,
    overallScore: 3,
    criteria,
  };
}

describe('certificate presentation regressions', () => {
  it('records both the producing CLI version and rubric version', () => {
    const html = renderWitanHtmlReport(
      reportFixture([criterion({ id: 'A1', category: 'code_trust' })]),
      { cliVersion: '0.2.2' },
    );

    expect(html).toContain('<dt>CLI</dt><dd>Cejel 0.2.2</dd>');
    expect(html).toContain(
      '<dt>Rubric</dt><dd>witan-rubric-v17-2026-07-24</dd>',
    );
  });

  it('explains a calibrated verified band beside a below-threshold weighted score', () => {
    const html = renderWitanHtmlReport(
      reportFixture([
        criterion({
          id: 'B3',
          category: 'process_trust',
          score: 1.9,
          status: 'verified',
          metrics: [
            {
              name: 'ci_script_depth',
              label: 'CI script depth',
              value: 2,
              max: 4,
              weight: 0.5,
            },
            {
              name: 'default_branch_ci_depth',
              label: 'Default branch CI depth',
              value: 1,
              max: 4,
              weight: 0.5,
            },
          ],
        }),
      ]),
      { cliVersion: '0.2.2' },
    );

    expect(html).toContain('Why the labels differ:');
    expect(html).toContain('verified dimension band');
    expect(html).toContain('1.9/4.0 weighted score');
    expect(html).toContain('warning numeric band');
  });

  it('warns that a tarball scan cannot measure the git-history PR proxy', () => {
    const b2 = criterion({
      id: 'B2',
      category: 'process_trust',
      score: 1.6,
      status: 'critical',
      metrics: [
        {
          name: 'pr_merge_ratio',
          label: 'Recent PR merge ratio',
          value: 0,
          max: 1,
          weight: 0.2,
          kind: 'ratio',
        },
      ],
    });

    const tarballHtml = renderWitanHtmlReport(reportFixture([b2]), {
      cliVersion: '0.2.2',
    });
    const cloneHtml = renderWitanHtmlReport(
      reportFixture([b2], { headSha: '0123456789abcdef0123456789abcdef01234567' }),
      { cliVersion: '0.2.2' },
    );

    expect(tarballHtml).toContain('Git history was unavailable');
    expect(tarballHtml).toContain('displayed zero may undercount B2');
    expect(tarballHtml).toContain('Re-scan a full Git clone');
    expect(cloneHtml).not.toContain('Git history was unavailable');
  });
});
