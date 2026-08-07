import { describe, expect, it } from 'vitest';

import type { WitanCliSummary } from '../summary.js';
import { renderMinScoreAbstentionFailure, renderTerminalCertificate } from '../terminal.js';

function summary(overrides: Partial<WitanCliSummary> = {}): WitanCliSummary {
  return {
    productSlug: 'witan',
    productDisplayName: 'Witan',
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
    scanLimitations: [],
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

  it('renders scan limitations prominently', () => {
    const output = renderTerminalCertificate(
      summary({ scanLimitations: ['Tracked-file inventory used a bounded directory walk.'] }),
    );

    expect(output).toContain('LIMITED EVIDENCE');
    expect(output).toContain('Tracked-file inventory used a bounded directory walk.');
  });

  it('lists top findings and notes how many more exist', () => {
    const output = renderTerminalCertificate(
      summary({
        findingCount: 7,
        topFindings: [
          {
            criterionId: 'A2',
            severity: 'critical',
            dimensionBand: 'critical',
            summary: 'Committed secret detected.',
          },
          {
            criterionId: 'A1',
            severity: 'warning',
            dimensionBand: 'critical',
            summary: 'Raw machine summary.',
            displaySummary: 'No coverage config.',
          },
        ],
      }),
    );
    expect(output).toContain(
      'Top findings (7 total; labels distinguish finding severity from dimension band):',
    );
    expect(output).toContain(
      '[finding severity: critical] A2 [dimension band: critical]: Committed secret detected.',
    );
    expect(output).toContain(
      '[finding severity: warning] A1 [dimension band: critical]: No coverage config.',
    );
    expect(output).not.toContain('Raw machine summary.');
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
        topFindings: [
          {
            criterionId: 'B4',
            severity: 'critical',
            dimensionBand: 'critical',
            summary: 'metric-derived score',
          },
        ],
      }),
    );
    expect(output).toContain('Insufficient source to certify.');
    expect(output).toContain('cejel rates source, not binaries');
    expect(output).not.toContain('Overall:');
    expect(output).not.toContain('Top findings');
    expect(output).not.toContain('metric-derived score');
  });

  it('shows an insufficient-evidence banner without claiming source is absent', () => {
    const output = renderTerminalCertificate(
      summary({
        verdict: 'Insufficient evidence',
        overallScore: null,
        codeTrustScore: null,
        processTrustScore: null,
        insufficientSourceReason:
          'No free-core rubric criterion produced a measurable signal. Cejel abstains rather than publish a numeric zero for an entirely unmeasured repository.',
      }),
    );

    expect(output).toContain('Insufficient evidence to certify.');
    expect(output).toContain('No free-core rubric criterion produced a measurable signal.');
    expect(output).not.toContain('Insufficient source');
    expect(output).not.toContain('Overall:');
  });

  it('uses the human abstention verdict in minimum-score failures', () => {
    expect(
      renderMinScoreAbstentionFailure(
        summary({
          verdict: 'Insufficient evidence',
          overallScore: null,
          codeTrustScore: null,
          processTrustScore: null,
        }),
        3.5,
      ),
    ).toBe(
      'Cejel: cannot evaluate the required minimum 3.5/4.0 because this repository has insufficient evidence.\n',
    );
    expect(
      renderMinScoreAbstentionFailure(
        summary({
          verdict: 'Insufficient source',
          overallScore: null,
          codeTrustScore: null,
          processTrustScore: null,
        }),
        4,
      ),
    ).toContain('this repository has insufficient source');
  });
});
