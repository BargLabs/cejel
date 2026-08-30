import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const ACTION_RUNNER_URL = pathToFileURL(
  fileURLToPath(new URL('../../action/run.mjs', import.meta.url)),
).href;

function renderStepSummary(summary: unknown): string {
  const encodedSummary = Buffer.from(JSON.stringify(summary), 'utf8').toString('base64');
  const evaluation = `
    import { renderStepSummary } from ${JSON.stringify(ACTION_RUNNER_URL)};
    const summary = JSON.parse(Buffer.from(process.env.CEJEL_ACTION_SUMMARY, 'base64').toString('utf8'));
    process.stdout.write(renderStepSummary(summary));
  `;
  return execFileSync(process.execPath, ['--input-type=module', '--eval', evaluation], {
    encoding: 'utf8',
    env: { ...process.env, CEJEL_ACTION_SUMMARY: encodedSummary },
  });
}

function renderActionOutputs(summary: unknown): string {
  const encodedSummary = Buffer.from(JSON.stringify(summary), 'utf8').toString('base64');
  const evaluation = `
    import { renderActionOutputs } from ${JSON.stringify(ACTION_RUNNER_URL)};
    const summary = JSON.parse(Buffer.from(process.env.CEJEL_ACTION_SUMMARY, 'base64').toString('utf8'));
    process.stdout.write(renderActionOutputs(summary));
  `;
  return execFileSync(process.execPath, ['--input-type=module', '--eval', evaluation], {
    encoding: 'utf8',
    env: { ...process.env, CEJEL_ACTION_SUMMARY: encodedSummary },
  });
}

describe('GitHub Action step summary', () => {
  it('keeps untrusted identity and finding text on escaped Markdown lines', () => {
    const rendered = renderStepSummary({
      productDisplayName: 'Trusted\n## Forged *identity*',
      overallScore: 2.7,
      codeTrustScore: 2.2,
      processTrustScore: 3.2,
      verdict: 'Conditional',
      findingCount: 1,
      topFindings: [
        {
          criterionId: 'A3',
          severity: 'warning',
          dimensionBand: 'warning',
          summary: '**forged finding emphasis**',
        },
      ],
    });

    expect(rendered).not.toContain('\n## Forged');
    expect(rendered).toContain('\\*identity\\*');
    expect(rendered).toContain('\\*\\*forged finding emphasis\\*\\*');
  });

  it('uses actionable finding copy and labels severity separately from the dimension band', () => {
    const rendered = renderStepSummary({
      productDisplayName: 'fixture',
      overallScore: 2.7,
      codeTrustScore: 2.2,
      processTrustScore: 3.2,
      verdict: 'Conditional',
      findingCount: 1,
      topFindings: [
        {
          criterionId: 'A3',
          severity: 'warning',
          dimensionBand: 'warning',
          summary: 'A3 metric-derived score is warning because combined metric weighting is below.',
          displaySummary:
            'A3 dimension band is warning at 2.5/4.0. Lowest contributing measurements: Rollback depth 1/4 signals. To improve: document and test rollback procedures.',
        },
      ],
    });

    expect(rendered).toContain('[finding severity: warning]');
    expect(rendered).toContain('[dimension band: warning]');
    expect(rendered).toContain('Lowest contributing measurements: Rollback depth 1/4 signals.');
    expect(rendered).toContain('To improve: document and test rollback procedures.');
    expect(rendered).not.toContain('combined metric weighting is below');
  });

  it.each(['Insufficient source', 'Insufficient evidence'])(
    'renders %s without reading null headline scores',
    (verdict) => {
      const rendered = renderStepSummary({
        productDisplayName: 'fixture',
        overallScore: null,
        codeTrustScore: null,
        processTrustScore: null,
        verdict,
        findingCount: 0,
        topFindings: [],
        insufficientSourceReason: 'The tracked source cannot support a score.',
      });

      expect(rendered).toContain(`**${verdict} to certify.**`);
      expect(rendered).toContain('The tracked source cannot support a score.');
      expect(rendered).not.toContain('Overall:');
      expect(rendered).not.toContain('/4.0');
    },
  );

  it('renders limitations in the step summary and machine-readable outputs', () => {
    const summary = {
      productDisplayName: 'fixture',
      overallScore: 4,
      codeTrustScore: 4,
      processTrustScore: 4,
      verdict: 'Verified',
      findingCount: 0,
      topFindings: [],
      scanLimitations: ['Tracked-file inventory used a bounded directory walk.'],
    };

    expect(renderStepSummary(summary)).toContain('LIMITED EVIDENCE');
    expect(renderStepSummary(summary)).toContain(summary.scanLimitations[0]);
    expect(renderActionOutputs(summary)).toContain('limited=true\n');
    expect(renderActionOutputs(summary)).toContain('limitation-count=1\n');
    expect(renderActionOutputs(summary)).toContain(
      `limitations=${JSON.stringify(summary.scanLimitations)}\n`,
    );
  });
});
