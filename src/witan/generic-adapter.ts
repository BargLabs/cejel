import { readFileSync } from 'node:fs';

import { z } from 'zod';

import type { WitanCriterionId, WitanInputSignal } from './schemas.js';

import { type IngestDocumentIdentity, genericIdentity } from './input-binding.js';
import { stripBom } from './json-safe.js';
import { resolveIngestFilePath } from './ingest-files.js';

// 1.1 added the optional identity fields `subject`, `producer` and `observedAt` (see
// GenericIdentityV1_1Schema). A 1.0 document is unchanged and still accepted.
export const CEJEL_GENERIC_INGEST_CONTRACT_VERSION = '1.1' as const;
export const CEJEL_GENERIC_INGEST_CONTRACT_MAJOR = 1;

const GenericFindingV1Schema = z
  .object({
    ruleId: z.string().min(1),
    severity: z.enum(['critical', 'warning', 'info']),
    message: z.string().min(1),
    location: z.string().min(1).optional(),
  })
  // Unknown fields are reserved for additive changes within major v1. Consumers read the
  // stable fields above and ignore additions they do not understand.
  .passthrough();

const GenericSignalV1Schema = z
  .object({
    dimension: z.enum(['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6']),
    weight: z.number().min(0).max(1).default(0.5),
    findings: z.array(GenericFindingV1Schema).min(1),
  })
  .passthrough();

export const GenericSignalDocumentV1Schema = z
  .object({
    version: z.string().regex(/^1\.\d+$/),
    tool: z.string().trim().min(1),
    signals: z.array(GenericSignalV1Schema),
  })
  .passthrough();

export type GenericSignalDocumentV1 = z.infer<typeof GenericSignalDocumentV1Schema>;

// Optional identity fields, contract 1.1. Read only from documents that declare minor 1 or later:
// under 1.0 these names were unknown fields a consumer had to ignore, so a 1.0 document that
// happens to carry a differently shaped `subject` must keep parsing exactly as before. Under 1.1
// they are stable optional fields, so an invalid value fails loudly like any other stable field.
const GenericIdentityV1_1Schema = z
  .object({
    subject: z
      .object({
        repository: z.string().trim().min(1).max(2048).optional(),
        commit: z
          .string()
          .regex(/^[0-9a-fA-F]{7,64}$/, 'expected a 7-64 character hexadecimal commit id')
          .optional(),
      })
      .passthrough()
      .optional(),
    producer: z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        version: z.string().trim().min(1).max(200).optional(),
      })
      .passthrough()
      .optional(),
    observedAt: z.string().datetime({ offset: true }).optional(),
  })
  .passthrough();

interface GenericDocumentShape {
  version?: unknown;
  tool?: unknown;
  signals?: unknown;
}

// Structural format detection stays deliberately separate from version support. A document that
// looks generic but declares an unknown major must reach the explicit version rejection below,
// never fall through to the vague "unrecognized format" error or another adapter.
export function isGenericSignalDocument(raw: unknown): raw is GenericDocumentShape {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const doc = raw as GenericDocumentShape;
  return typeof doc.tool === 'string' && doc.tool.length > 0 && Array.isArray(doc.signals);
}

function assertSupportedContractVersion(version: unknown): asserts version is string {
  if (typeof version !== 'string') {
    throw new Error(
      `Cejel: generic ingest contract version is required; expected "version": "${CEJEL_GENERIC_INGEST_CONTRACT_VERSION}". Refusing to guess an unversioned contract.`,
    );
  }

  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(
      `Cejel: invalid generic ingest contract version "${version}"; expected <major>.<minor> (current ${CEJEL_GENERIC_INGEST_CONTRACT_VERSION}).`,
    );
  }

  const major = Number(match[1]);
  if (major !== CEJEL_GENERIC_INGEST_CONTRACT_MAJOR) {
    throw new Error(
      `Cejel: unsupported generic ingest contract major version ${major} (declared "${version}"); this Cejel build supports major ${CEJEL_GENERIC_INGEST_CONTRACT_MAJOR}. Refusing to guess.`,
    );
  }
}

function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '<document>'}: ${issue.message}`)
    .join('; ');
}

// Parse generic Cejel external-signal contract v1 into WitanInputSignal[]. Within major v1,
// unknown additive fields are ignored. Invalid stable fields fail loudly: dropping malformed
// evidence would make the certificate look cleaner than the supplied record.
export function parseGenericJson(raw: unknown): WitanInputSignal[] {
  return parseGenericDocument(raw).signals;
}

/** Signals plus the identity a 1.1 document declares (a 1.0 document declares only `tool`). */
export function parseGenericDocument(raw: unknown): {
  signals: WitanInputSignal[];
  identity: IngestDocumentIdentity;
} {
  if (!isGenericSignalDocument(raw)) {
    return { signals: [], identity: { producers: [], subjects: [] } };
  }
  assertSupportedContractVersion(raw.version);

  const parsed = GenericSignalDocumentV1Schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Cejel: invalid generic ingest contract v${raw.version}: ${formatValidationIssues(parsed.error)}`,
    );
  }

  const minor = Number(/^\d+\.(\d+)$/.exec(parsed.data.version)?.[1] ?? '0');
  let identity = genericIdentity({ tool: parsed.data.tool });
  if (minor >= 1) {
    const identityFields = GenericIdentityV1_1Schema.safeParse(raw);
    if (!identityFields.success) {
      throw new Error(
        `Cejel: invalid generic ingest contract v${parsed.data.version}: ${formatValidationIssues(identityFields.error)}`,
      );
    }
    identity = genericIdentity({
      tool: parsed.data.tool,
      ...(identityFields.data.subject ? { subject: identityFields.data.subject } : {}),
      ...(identityFields.data.producer ? { producer: identityFields.data.producer } : {}),
      ...(identityFields.data.observedAt ? { observedAt: identityFields.data.observedAt } : {}),
    });
  }

  const signals = parsed.data.signals.map((signal) => ({
    source: parsed.data.tool,
    dimension: signal.dimension as WitanCriterionId,
    weight: signal.weight,
    findings: signal.findings.map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
      message: finding.message,
      ...(finding.location ? { location: finding.location } : {}),
    })),
  }));
  return { signals, identity };
}

// Parse a generic Cejel external-signal JSON file at the given path. No network — local file only.
export function parseGenericFile(genericPath: string): WitanInputSignal[] {
  const raw: unknown = JSON.parse(
    stripBom(readFileSync(resolveIngestFilePath(genericPath), 'utf8')),
  );
  return parseGenericJson(raw);
}
