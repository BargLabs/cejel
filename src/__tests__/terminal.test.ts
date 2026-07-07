import { describe, expect, it } from 'vitest';

import type { WitanCliSummary } from '../summary.js';
import { renderTerminalCertificate } from '../terminal.js';

function summary(overrides: Partial<WitanCliSummary> = {}): WitanCliSummary {
  return {
    productSlug: 'witan',
    productDisplayName: 'Witan',
    generatedAt: '2026-07-05T00:00:00.000Z',
    overallScore: 3.2,
    codeTrustScore: 3.4,
    processTrustScore: 3.0,
    verdict: 'Conditional',
    findingCount: 0,
    topFindings: [],
    contributingSources: [],
    externalSources: [],
    externalFindingCount: 0,
    topExternalFindings: [],
    ...overrides,
  };
}

describe('renderTerminalCertificate', () => {
  it('prints the product name, overall score, and verdict', () => {
    const output = renderTerminalCertificate(summary());
    expect(output).toContain('Cejel Trust Certificate — Witan');
    expect(output).toContain('Overall: 3.2/4.0 (Conditional)');
    expect(output).toContain('Code trust:    3.4/4.0');
    expect(output).toContain('Process trust: 3.0/4.0');
  });

  it('reports no findings cleanly', () => {
    expect(renderTerminalCertificate(summary())).toContain('No evidence-backed findings.');
  });

  it('lists top findings and notes how many more exist', () => {
    const output = renderTerminalCertificate(
      summary({
        findingCount: 7,
        topFindings: [
          { criterionId: 'A2', severity: 'critical', summary: 'Committed secret detected.' },
          { criterionId: 'A1', severity: 'warning', summary: 'No coverage config.' },
        ],
      }),
    );
    expect(output).toContain('Top findings (7 total):');
    expect(output).toContain('[critical] A2: Committed secret detected.');
    expect(output).toContain('[warning] A1: No coverage config.');
    expect(output).toContain('...and 5 more — see the written report for the full list.');
  });

  it('shows contributing external-scanner sources when present', () => {
    const output = renderTerminalCertificate(
      summary({ contributingSources: ['sarif:codex-security', 'scorecard'] }),
    );
    expect(output).toContain('Incorporates findings from: sarif:codex-security, scorecard');
  });

  it('omits the sources line when no external signals contributed', () => {
    const output = renderTerminalCertificate(summary());
    expect(output).not.toContain('Incorporates findings from');
  });

  it('shows per-source finding counts and itemizes attributed external findings', () => {
    const output = renderTerminalCertificate(
      summary({
        contributingSources: ['sarif:Codex Security'],
        externalSources: [
          {
            source: 'sarif:Codex Security',
            label: 'Codex Security',
            findingCount: 54,
            dimensions: ['A2', 'A4'],
          },
        ],
        externalFindingCount: 54,
        topExternalFindings: [
          {
            source: 'sarif:Codex Security',
            label: 'Codex Security',
            dimension: 'A2',
            severity: 'critical',
            ruleId: 'sql-injection',
            message: 'User input passed directly to SQL query.',
            location: 'src/db/query.ts:42',
          },
        ],
      }),
    );

    expect(output).toContain('Codex Security: 54 findings ingested (folded into A2, A4)');
    expect(output).toContain('External findings (54 total, attributed to tool + criterion):');
    expect(output).toContain(
      '[critical] Codex Security → A2: sql-injection — User input passed directly to SQL query. (src/db/query.ts:42)',
    );
    expect(output).toContain('...and 53 more — see report.json for the full list.');
  });

  it('never itemizes external findings on the insufficient-source path', () => {
    const output = renderTerminalCertificate(
      summary({
        verdict: 'Insufficient source',
        insufficientSourceReason: 'no ratable source',
        externalFindingCount: 3,
        topExternalFindings: [
          {
            source: 'scorecard',
            label: 'scorecard',
            dimension: 'A4',
            severity: 'warning',
            ruleId: 'scorecard:Vulnerabilities',
            message: 'Known vuln.',
          },
        ],
      }),
    );
    expect(output).not.toContain('External findings');
  });

  it('shows an explicit insufficient-source banner instead of a numeric score or findings', () => {
    const output = renderTerminalCertificate(
      summary({
        verdict: 'Insufficient source',
        insufficientSourceReason:
          '0 source file(s) found among 4 tracked file(s); repo appears to be a binary/bundled-distribution tree — cejel rates source, not binaries. To assess a closed/bundled tool, ingest its scanner output via --ingest <sarif|scorecard>.',
        findingCount: 1,
        topFindings: [{ criterionId: 'B4', severity: 'critical', summary: 'metric-derived score' }],
      }),
    );
    expect(output).toContain('Insufficient source to certify.');
    expect(output).toContain('cejel rates source, not binaries');
    expect(output).not.toContain('Overall:');
    expect(output).not.toContain('Top findings');
    expect(output).not.toContain('metric-derived score');
  });
});
