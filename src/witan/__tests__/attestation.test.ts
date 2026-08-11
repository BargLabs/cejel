import type { WitanReport } from '../schemas.js';
import { describe, expect, it } from 'vitest';

import {
  createWitanAttestation,
  hashWitanReport,
  verifyWitanAttestationBinding,
} from '../attestation.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';

const GENERATED_AT = '2026-07-16T12:00:00.000Z';
const ATTESTATION_OPTIONS = { toolVersion: '0.1.4', generatedAt: GENERATED_AT };

type ScoredWitanReport = Exclude<WitanReport, { verdict: 'insufficient_source' }>;

function fixtureReport(): ScoredWitanReport {
  return {
    productSlug: 'sample-repo',
    productDisplayName: 'Sample Repo',
    repo: {
      path: '/private/local/path',
      url: 'https://github.com/example/sample-repo',
      headSha: 'abcdef1234567890',
    },
    rubricVersion: 'witan-rubric-v3-2026-07-13',
    verdict: 'conditional',
    codeTrustScore: 3.1,
    processTrustScore: 2.9,
    overallScore: 3,
    criteria: [
      {
        id: 'A1',
        title: 'Test integrity',
        category: 'code_trust',
        score: 3.1,
        status: 'info',
        evidence: [],
        findings: [],
        metrics: [],
      },
    ],
  };
}

describe('Cejel scan attestation', () => {
  it('is deterministic and binds the report without publishing its local filesystem path', () => {
    const report = fixtureReport();
    const first = createWitanAttestation(report, ATTESTATION_OPTIONS);
    const second = createWitanAttestation(report, ATTESTATION_OPTIONS);

    expect(first).toEqual(second);
    expect(first.subject[0]?.digest.sha256).toBe(hashWitanReport(report));
    expect(first.predicate.report.sha256).toBe(hashWitanReport(report));
    expect(first.predicate.generatedAt).toBe(GENERATED_AT);
    expect(JSON.stringify(first)).not.toContain('/private/local/path');
    expect(verifyWitanAttestationBinding(first, report)).toEqual({ valid: true, errors: [] });
  });

  it.each(['0.3.2', '0.4.0'])(
    'continues to verify a legacy v%s report/attestation pair that contains repo.path',
    (toolVersion) => {
      const report = fixtureReport();
      const statement = createWitanAttestation(report, {
        ...ATTESTATION_OPTIONS,
        toolVersion,
      });

      expect(report.repo.path).toBe('/private/local/path');
      expect(statement.predicate.tool.version).toBe(toolVersion);
      expect(JSON.stringify(statement)).not.toContain('/private/local/path');
      expect(verifyWitanAttestationBinding(statement, report)).toEqual({
        valid: true,
        errors: [],
      });
    },
  );

  it('renders a path-free report with its stable slug and revision instead of unknown', () => {
    const report = fixtureReport();
    report.repo = { headSha: 'abcdef1234567890' };

    const markdown = renderWitanMarkdownReport(report);
    const html = renderWitanHtmlReport(report);

    expect(markdown).toContain('- Repository: sample-repo @ abcdef1234567890');
    expect(html).toContain('sample-repo @ abcdef1234567890');
    expect(markdown).not.toContain('Repository: unknown');
    expect(html).not.toContain('unknown @ abcdef1234567890');
  });

  it('records each run timestamp in the attestation without changing the report digest', () => {
    const report = fixtureReport();
    const first = createWitanAttestation(report, ATTESTATION_OPTIONS);
    const second = createWitanAttestation(report, {
      ...ATTESTATION_OPTIONS,
      generatedAt: '2026-07-16T12:00:01.000Z',
    });

    expect(first.predicate.generatedAt).not.toBe(second.predicate.generatedAt);
    expect(first.subject[0]?.digest.sha256).toBe(second.subject[0]?.digest.sha256);
    expect(first.predicate.report.sha256).toBe(second.predicate.report.sha256);
  });

  it('fails binding verification when report contents change', () => {
    const report = fixtureReport();
    const statement = createWitanAttestation(report, ATTESTATION_OPTIONS);
    const changed: WitanReport = { ...report, overallScore: 1.2, verdict: 'unverified' };

    const result = verifyWitanAttestationBinding(statement, changed);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('subject digest does not match report.json');
  });

  it('fails binding verification when attested repository identity changes', () => {
    const report = fixtureReport();
    const statement = createWitanAttestation(report, ATTESTATION_OPTIONS);
    const changed = structuredClone(statement);
    const subject = changed.subject[0];
    if (!subject) throw new Error('Expected an attestation subject.');
    subject.name = 'different-repo/report.json';
    changed.predicate.repository.productSlug = 'different-repo';
    changed.predicate.repository.url = 'https://github.com/example/different-repo';

    const result = verifyWitanAttestationBinding(changed, report);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'subject name does not match report repository identity',
        'repository product slug does not match report.json',
        'repository URL does not match report.json',
      ]),
    );
  });

  it('preserves abstention and emits no numeric score for insufficient source', () => {
    const report: WitanReport = {
      ...fixtureReport(),
      verdict: 'insufficient_source',
      codeTrustScore: null,
      processTrustScore: null,
      overallScore: null,
      categoryScores: undefined,
      archetype: 'unrecognised_ecosystem',
      insufficientSourceReason: 'Recognised source is below the calibrated dominance floor.',
    };
    const statement = createWitanAttestation(report, ATTESTATION_OPTIONS);

    expect(statement.predicate.outcome).toEqual({
      status: 'abstained',
      reason: report.insufficientSourceReason,
    });
    expect(JSON.stringify(statement.predicate.outcome)).not.toContain('overallScore');
    expect(verifyWitanAttestationBinding(statement, report).valid).toBe(true);
  });

  it('states that the generated envelope is unsigned and self-generated', () => {
    const statement = createWitanAttestation(fixtureReport(), ATTESTATION_OPTIONS);
    expect(statement.predicate.assurance).toMatchObject({
      status: 'unsigned',
      issuer: 'self-generated',
    });
  });
});
