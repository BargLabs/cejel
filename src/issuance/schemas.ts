// Issuance schemas and constants. Moved out of src/witan/ (goal_cejel_issuance_out_of_frozen_path_2):
// issuance reads report.json and attestation.json as bytes and never touches scoring, so it does
// not belong under the measurement freeze's frozen path. See docs/issuance.md.

import { z } from 'zod';

export const WITAN_ISSUANCE_STATEMENT_TYPE = 'https://in-toto.io/Statement/v1' as const;
export const WITAN_ISSUANCE_PREDICATE_TYPE =
  'https://cejel.dev/attestations/issuance/v1' as const;
// Versioned SEPARATELY from WITAN_REPORT_FORMAT_VERSION on purpose. Issuance is a third artifact
// written beside report.json and attestation.json; it never modifies either, so the report format
// does not move when issuance does. See docs/format-stability.md and docs/issuance.md.
export const WITAN_ISSUANCE_FORMAT_VERSION = '1.0' as const;

// Namespace for `ssh-keygen -Y sign -n`. Deliberately distinct from any calibration-authority
// namespace so a calibration signature can never be replayed as an issuance signature.
export const WITAN_ISSUANCE_SIGNATURE_NAMESPACE = 'cejel-issuance' as const;
export const WITAN_ISSUANCE_PRINCIPAL = 'issuance@barglabs.ai' as const;
export const WITAN_ISSUER_NAME = 'Barg Labs Inc.' as const;

export const WitanIssuanceSubjectArtifactSchema = z.enum(['report.json', 'attestation.json']);

// An issuance countersignature statement. Its subjects are the digests of report.json and
// attestation.json EXACTLY as the vendor produced them; the issuer re-ran the named @cejel/cejel
// version at the named revision and obtained byte-identical report.json content.
//
// reportByteIdentical is z.literal(true) and has no false value on purpose: a reproduction that
// did not reproduce is a refusal to issue, never an issuance that says so.
export const WitanIssuanceStatementSchema = z
  .object({
    _type: z.literal(WITAN_ISSUANCE_STATEMENT_TYPE),
    subject: z
      .array(
        z
          .object({
            name: z.string().min(1).max(300),
            artifact: WitanIssuanceSubjectArtifactSchema,
            digest: z
              .object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })
              .strict(),
          })
          .strict(),
      )
      .length(2),
    predicateType: z.literal(WITAN_ISSUANCE_PREDICATE_TYPE),
    predicate: z
      .object({
        issuanceFormatVersion: z.string().regex(/^1\.\d+$/),
        issuer: z
          .object({
            name: z.literal(WITAN_ISSUER_NAME),
            // OpenSSH public-key fingerprint of the signing key, as printed by `ssh-keygen -lf`.
            keyFingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
          })
          .strict(),
        reproduction: z
          .object({
            sourceRevision: z.string().min(7).max(64),
            toolPackage: z.literal('@cejel/cejel'),
            toolVersion: z.string().min(1).max(80),
            rubricVersion: z.string().min(1).max(120),
            rubricBehaviourFingerprint: z
              .string()
              .regex(/^sha256:[a-f0-9]{64}$/)
              .optional(),
            reportByteIdentical: z.literal(true),
          })
          .strict(),
        issuedAt: z.string().datetime({ offset: true }),
        // An opaque identifier the issuer chooses. The charset is enforced here; that the value
        // is genuinely opaque and names no counterparty is a policy rule this schema cannot
        // check — see docs/issuance.md.
        engagementRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{3,63}$/),
        limitations: z.array(z.string().min(1).max(500)).min(1).max(8),
      })
      .strict(),
  })
  .strict();

export type WitanIssuanceStatement = z.infer<typeof WitanIssuanceStatementSchema>;
