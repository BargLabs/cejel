import { createHash } from 'node:crypto';

import { z } from 'zod';

import { CejelLlmPackResultSchema, type CejelLlmPackResult } from './types.js';

export const CEJEL_LLM_ARTIFACT_SCHEMA_VERSION = 'cejel-free-llm-artifact-v1';
export const CEJEL_LLM_RULE_CONTRACT_VERSION = 'cejel-free-llm-rules-v1.1-2026-07-23';
export const CEJEL_LLM_DETECTOR_VERSION = 'free-llm-detector-alpha-2';
export const CEJEL_LLM_ATTESTATION_PREDICATE =
  'https://cejel.dev/attestations/free-llm/v1';

export const CejelLlmPackArtifactSchema = z
  .object({
    schemaVersion: z.literal(CEJEL_LLM_ARTIFACT_SCHEMA_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    repo: z
      .object({
        path: z.string().min(1).max(700),
        headSha: z.string().min(7).max(64).optional(),
      })
      .strict(),
    baseReportSha256: z.string().regex(/^[a-f0-9]{64}$/),
    inputSourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    lineage: z
      .object({
        ruleContractVersion: z.literal(CEJEL_LLM_RULE_CONTRACT_VERSION),
        detectorVersion: z.literal(CEJEL_LLM_DETECTOR_VERSION),
        toolVersion: z.string().min(1).max(100),
        detectorSourceRevision: z.string().min(1).max(160),
      })
      .strict(),
    result: CejelLlmPackResultSchema,
    assurance: z
      .object({
        status: z.literal('unsigned'),
        issuer: z.literal('self-generated'),
      })
      .strict(),
    claimBoundary: z.literal(
      'Static application-integrity and evaluation-hygiene evidence; not a model hallucination rate or universal safety certificate.',
    ),
  })
  .strict();

export type CejelLlmPackArtifact = z.infer<typeof CejelLlmPackArtifactSchema>;

export interface CreateCejelLlmPackArtifactOptions {
  generatedAt: string;
  repoPath: string;
  headSha?: string;
  baseReportSha256: string;
  inputSourceSha256: string;
  toolVersion: string;
  detectorSourceRevision?: string;
}

export function createCejelLlmPackArtifact(
  result: CejelLlmPackResult,
  options: CreateCejelLlmPackArtifactOptions,
): CejelLlmPackArtifact {
  return CejelLlmPackArtifactSchema.parse({
    schemaVersion: CEJEL_LLM_ARTIFACT_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    repo: {
      path: options.repoPath,
      ...(options.headSha ? { headSha: options.headSha } : {}),
    },
    baseReportSha256: options.baseReportSha256,
    inputSourceSha256: options.inputSourceSha256,
    lineage: {
      ruleContractVersion: CEJEL_LLM_RULE_CONTRACT_VERSION,
      detectorVersion: CEJEL_LLM_DETECTOR_VERSION,
      toolVersion: options.toolVersion,
      detectorSourceRevision:
        options.detectorSourceRevision ??
        `local-or-unverified-build:@cejel/cejel@${options.toolVersion}`,
    },
    result,
    assurance: { status: 'unsigned', issuer: 'self-generated' },
    claimBoundary:
      'Static application-integrity and evaluation-hygiene evidence; not a model hallucination rate or universal safety certificate.',
  });
}

export function serializeCejelLlmPackArtifact(artifact: CejelLlmPackArtifact): string {
  return `${JSON.stringify(CejelLlmPackArtifactSchema.parse(artifact), null, 2)}\n`;
}

export const CejelLlmPackAttestationSchema = z
  .object({
    _type: z.literal('https://in-toto.io/Statement/v1'),
    subject: z
      .tuple([
        z
          .object({
            name: z.literal('llm-report.json'),
            digest: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
          })
          .strict(),
      ]),
    predicateType: z.literal(CEJEL_LLM_ATTESTATION_PREDICATE),
    predicate: z
      .object({
        packId: z.string().min(1),
        packVersion: z.string().min(1),
        generatedAt: z.string().datetime({ offset: true }),
        baseReportSha256: z.string().regex(/^[a-f0-9]{64}$/),
        inputSourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        ruleContractVersion: z.literal(CEJEL_LLM_RULE_CONTRACT_VERSION),
        detectorVersion: z.literal(CEJEL_LLM_DETECTOR_VERSION),
        toolVersion: z.string().min(1).max(100),
        detectorSourceRevision: z.string().min(1).max(160),
        assurance: z
          .object({
            status: z.literal('unsigned'),
            issuer: z.literal('self-generated'),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type CejelLlmPackAttestation = z.infer<typeof CejelLlmPackAttestationSchema>;

export function createCejelLlmPackAttestation(
  artifact: CejelLlmPackArtifact,
  serializedArtifact: string,
): CejelLlmPackAttestation {
  const parsed = CejelLlmPackArtifactSchema.parse(artifact);
  const serializedValue = CejelLlmPackArtifactSchema.parse(JSON.parse(serializedArtifact));
  if (JSON.stringify(serializedValue) !== JSON.stringify(parsed)) {
    throw new Error('Serialized LLM artifact bytes do not represent the supplied artifact.');
  }
  return CejelLlmPackAttestationSchema.parse({
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      {
        name: 'llm-report.json',
        digest: { sha256: createHash('sha256').update(serializedArtifact).digest('hex') },
      },
    ],
    predicateType: CEJEL_LLM_ATTESTATION_PREDICATE,
    predicate: {
      packId: parsed.result.packId,
      packVersion: parsed.result.packVersion,
      generatedAt: parsed.generatedAt,
      baseReportSha256: parsed.baseReportSha256,
      inputSourceSha256: parsed.inputSourceSha256,
      ruleContractVersion: parsed.lineage.ruleContractVersion,
      detectorVersion: parsed.lineage.detectorVersion,
      toolVersion: parsed.lineage.toolVersion,
      detectorSourceRevision: parsed.lineage.detectorSourceRevision,
      assurance: parsed.assurance,
    },
  });
}

export interface CejelLlmPackBindingVerification {
  valid: boolean;
  errors: string[];
}

export function verifyCejelLlmPackAttestationBinding(
  statement: unknown,
  artifact: CejelLlmPackArtifact,
  serializedArtifact: Buffer | string,
): CejelLlmPackBindingVerification {
  const parsedStatement = CejelLlmPackAttestationSchema.safeParse(statement);
  if (!parsedStatement.success) {
    return {
      valid: false,
      errors: parsedStatement.error.issues.map(
        (issue) => `attestation ${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    };
  }
  const parsedArtifact = CejelLlmPackArtifactSchema.parse(artifact);
  const value = parsedStatement.data;
  const errors: string[] = [];
  let serializedValue: CejelLlmPackArtifact | null = null;
  try {
    serializedValue = CejelLlmPackArtifactSchema.parse(
      JSON.parse(Buffer.isBuffer(serializedArtifact) ? serializedArtifact.toString('utf8') : serializedArtifact),
    );
  } catch {
    errors.push('serialized llm-report.json is not the supplied valid artifact');
  }
  if (serializedValue && JSON.stringify(serializedValue) !== JSON.stringify(parsedArtifact)) {
    errors.push('serialized llm-report.json does not represent the supplied artifact');
  }
  const artifactSha256 = createHash('sha256').update(serializedArtifact).digest('hex');
  if (value.subject[0].digest.sha256 !== artifactSha256) {
    errors.push('subject digest does not match llm-report.json');
  }
  if (value.predicate.packId !== parsedArtifact.result.packId) {
    errors.push('predicate pack id does not match llm-report.json');
  }
  if (value.predicate.packVersion !== parsedArtifact.result.packVersion) {
    errors.push('predicate pack version does not match llm-report.json');
  }
  if (value.predicate.generatedAt !== parsedArtifact.generatedAt) {
    errors.push('predicate generated timestamp does not match llm-report.json');
  }
  if (value.predicate.baseReportSha256 !== parsedArtifact.baseReportSha256) {
    errors.push('predicate base report digest does not match llm-report.json');
  }
  if (value.predicate.inputSourceSha256 !== parsedArtifact.inputSourceSha256) {
    errors.push('predicate input source digest does not match llm-report.json');
  }
  if (value.predicate.ruleContractVersion !== parsedArtifact.lineage.ruleContractVersion) {
    errors.push('predicate rule contract version does not match llm-report.json');
  }
  if (value.predicate.detectorVersion !== parsedArtifact.lineage.detectorVersion) {
    errors.push('predicate detector version does not match llm-report.json');
  }
  if (value.predicate.toolVersion !== parsedArtifact.lineage.toolVersion) {
    errors.push('predicate tool version does not match llm-report.json');
  }
  if (
    value.predicate.detectorSourceRevision !==
    parsedArtifact.lineage.detectorSourceRevision
  ) {
    errors.push('predicate detector source revision does not match llm-report.json');
  }
  return { valid: errors.length === 0, errors };
}
