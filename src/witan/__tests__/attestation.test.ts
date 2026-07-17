import type { WitanReport } from '../schemas.js';
import { describe, expect, it } from 'vitest';

import {
  createWitanAttestation,
  hashWitanReport,
  verifyWitanAttestationBinding,
} from '../attestation.js';

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
    generatedAt: '2026-07-16T12:00:00.000Z',
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
    const first = createWitanAttestation(report, { toolVersion: '0.1.4' });
    const second = createWitanAttestation(report, { toolVersion: '0.1.4' });

    expect(first).toEqual(second);
    expect(first.subject[0]?.digest.sha256).toBe(hashWitanReport(report));
    expect(first.predicate.report.sha256).toBe(hashWitanReport(report));
    expect(JSON.stringify(first)).not.toContain('/private/local/path');
    expect(verifyWitanAttestationBinding(first, report)).toEqual({ valid: true, errors: [] });
  });

  it('fails binding verification when report contents change', () => {
    const report = fixtureReport();
    const statement = createWitanAttestation(report, { toolVersion: '0.1.4' });
    const changed: WitanReport = { ...report, overallScore: 1.2, verdict: 'unverified' };

    const result = verifyWitanAttestationBinding(statement, changed);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('subject digest does not match report.json');
  });

  it('fails binding verification when attested repository identity changes', () => {
    const report = fixtureReport();
    const statement = createWitanAttestation(report, { toolVersion: '0.1.4' });
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
    const statement = createWitanAttestation(report, { toolVersion: '0.1.4' });

    expect(statement.predicate.outcome).toEqual({
      status: 'abstained',
      reason: report.insufficientSourceReason,
    });
    expect(JSON.stringify(statement.predicate.outcome)).not.toContain('overallScore');
    expect(verifyWitanAttestationBinding(statement, report).valid).toBe(true);
  });

  it('states that the generated envelope is unsigned and self-generated', () => {
    const statement = createWitanAttestation(fixtureReport(), { toolVersion: '0.1.4' });
    expect(statement.predicate.assurance).toMatchObject({
      status: 'unsigned',
      issuer: 'self-generated',
    });
  });
});
