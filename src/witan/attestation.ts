import { createHash } from 'node:crypto';

import {
  WITAN_ATTESTATION_PREDICATE_TYPE,
  WITAN_ATTESTATION_STATEMENT_TYPE,
  type WitanAttestationStatement,
  WitanAttestationStatementSchema,
  type WitanReport,
} from './schemas.js';

export interface CreateWitanAttestationOptions {
  toolVersion: string;
}

export interface WitanAttestationBindingVerification {
  valid: boolean;
  errors: string[];
}

export interface VerifyWitanAttestationBindingOptions {
  /** SHA-256 of the exact report artifact bytes when verifying a file supplied by a user. */
  reportSha256?: string;
}

const ATTESTATION_LIMITATIONS = [
  'Cejel measures observable repository signals; it is not a security or compliance guarantee.',
  'This statement is self-generated and unsigned until an external signer binds their identity to it.',
] as const;

export function serializeWitanReport(report: WitanReport): string {
  return JSON.stringify(report, null, 2);
}

export function hashWitanReport(report: WitanReport): string {
  return createHash('sha256').update(serializeWitanReport(report), 'utf8').digest('hex');
}

export function createWitanAttestation(
  report: WitanReport,
  options: CreateWitanAttestationOptions,
): WitanAttestationStatement {
  const reportSha256 = hashWitanReport(report);
  const outcome =
    report.verdict === 'insufficient_source'
      ? {
          status: 'abstained' as const,
          reason: report.insufficientSourceReason,
        }
      : {
          status: 'scored' as const,
          overallScore: report.overallScore,
          codeTrustScore: report.codeTrustScore,
          processTrustScore: report.processTrustScore,
        };

  return WitanAttestationStatementSchema.parse({
    _type: WITAN_ATTESTATION_STATEMENT_TYPE,
    subject: [
      {
        name: `${report.productSlug}/report.json`,
        digest: { sha256: reportSha256 },
      },
    ],
    predicateType: WITAN_ATTESTATION_PREDICATE_TYPE,
    predicate: {
      tool: { name: 'cejel', version: options.toolVersion },
      generatedAt: report.generatedAt,
      rubricVersion: report.rubricVersion,
      repository: {
        productSlug: report.productSlug,
        ...(report.repo.url ? { url: report.repo.url } : {}),
        ...(report.repo.headSha ? { headSha: report.repo.headSha } : {}),
      },
      report: {
        artifact: 'report.json',
        sha256: reportSha256,
      },
      outcome,
      assurance: {
        status: 'unsigned',
        issuer: 'self-generated',
        signingHint:
          'Sign this in-toto statement with your existing provenance system; verify the report digest before relying on it.',
      },
      limitations: [...ATTESTATION_LIMITATIONS],
    },
  });
}

/**
 * Verifies schema and report binding only. It deliberately does not claim to verify an external
 * identity or signature: the emitted statement is explicitly unsigned.
 */
export function verifyWitanAttestationBinding(
  statement: unknown,
  report: WitanReport,
  options: VerifyWitanAttestationBindingOptions = {},
): WitanAttestationBindingVerification {
  const parsed = WitanAttestationStatementSchema.safeParse(statement);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  const errors: string[] = [];
  const expectedReportHash = options.reportSha256 ?? hashWitanReport(report);
  const subject = parsed.data.subject[0];
  const subjectHash = subject?.digest.sha256;
  if (subjectHash !== expectedReportHash) errors.push('subject digest does not match report.json');
  if (subject?.name !== `${report.productSlug}/report.json`) {
    errors.push('subject name does not match report repository identity');
  }
  if (parsed.data.predicate.report.sha256 !== expectedReportHash) {
    errors.push('predicate report digest does not match report.json');
  }
  if (parsed.data.predicate.rubricVersion !== report.rubricVersion) {
    errors.push('rubric version does not match report.json');
  }
  if (parsed.data.predicate.generatedAt !== report.generatedAt) {
    errors.push('generated timestamp does not match report.json');
  }
  if (parsed.data.predicate.repository.headSha !== report.repo.headSha) {
    errors.push('repository revision does not match report.json');
  }
  if (parsed.data.predicate.repository.productSlug !== report.productSlug) {
    errors.push('repository product slug does not match report.json');
  }
  if (parsed.data.predicate.repository.url !== report.repo.url) {
    errors.push('repository URL does not match report.json');
  }

  const outcome = parsed.data.predicate.outcome;
  if (report.verdict === 'insufficient_source') {
    if (outcome.status !== 'abstained' || outcome.reason !== report.insufficientSourceReason) {
      errors.push('attestation does not preserve the report abstention');
    }
  } else if (
    outcome.status !== 'scored' ||
    outcome.overallScore !== report.overallScore ||
    outcome.codeTrustScore !== report.codeTrustScore ||
    outcome.processTrustScore !== report.processTrustScore
  ) {
    errors.push('attested scores do not match report.json');
  }

  return { valid: errors.length === 0, errors };
}
