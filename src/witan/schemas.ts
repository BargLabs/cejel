// Vendored from the private source monorepo this tool was extracted from —
// this is the entire internal-schema surface cejel imports; every other internal
// schema (multi-tenant, workflow, billing, etc.) is intentionally NOT part of this
// file and never ships here.

import { z } from 'zod';

export const WITAN_RUBRIC_VERSION_V0 = 'witan-rubric-v0-2026-06-22';
export const WITAN_RUBRIC_VERSION_V1 = 'witan-rubric-v1-2026-06-24';
// v2 (goal_cejel_generalize_homefield_rule_and_rescore_protocol_2026-07-12): A1's scheduled-
// product-health-workflow sub-signal is now detected by shape (schedule trigger + test-run
// command), never by the literal filename `bede-nightly.yml` — see
// docs/leaderboard/RUBRIC_CHANGELOG.md for the full corpus-wide before/after delta this
// version bump requires and carries. Scoring algorithm is unchanged from v1 (metric-based).
export const WITAN_RUBRIC_VERSION_V2 = 'witan-rubric-v2-2026-07-12';
// v3 (goal_cejel_board_must_be_reproducible_2026-07-12): removed four repository-private
// evidence collectors (two code-trust inputs plus B1 and B5) that were reachable only from
// this monorepo's own file paths and could never be reproduced by a stranger running `npx
// cejel .` on the same repository — see docs/leaderboard/RUBRIC_CHANGELOG.md for the
// full corpus-wide before/after delta. Scoring algorithm is unchanged from v2 (metric-based);
// only these four collectors' reachability changed, from "always active" to "never present".
export const WITAN_RUBRIC_VERSION_V3 = 'witan-rubric-v3-2026-07-13';
export const WITAN_RUBRIC_VERSION = WITAN_RUBRIC_VERSION_V3;
export const WITAN_TRADING_RUBRIC_VERSION_V0 = 'witan-trading-rubric-v0-2026-07-01';

export const WITAN_CRITERION_IDS = [
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
] as const;

// Locked criterion ids for witan-trading-rubric-v0 — downstream trading-product integrations
// target these ids directly, so they may not be renamed without a new rubric version.
export const WITAN_TRADING_RUBRIC_V0_CRITERION_IDS = [
  'validation-integrity',
  'calibration',
  'promotion-governance',
  'risk-governance',
  'execution-integrity',
  'real-outcome-evidence',
  'data-confidence',
  'audit-completeness',
  'claim-reality',
] as const;


export const WitanCriterionIdSchema = z.enum([
  ...WITAN_CRITERION_IDS,
  ...WITAN_TRADING_RUBRIC_V0_CRITERION_IDS,
]);
export const WitanTradingCriterionIdSchema = z.enum(WITAN_TRADING_RUBRIC_V0_CRITERION_IDS);
export const WitanCriterionCategorySchema = z.enum([
  'code_trust',
  'process_trust',
  'validation_trust',
  'execution_trust',
  'governance_trust',
]);
// 'insufficient_data' — the scorer had NO measurable signal for this criterion (a measurement
// gap). Excluded from the composite like 'not_applicable', but surfaced distinctly so a reader
// knows the criterion is UNMEASURED rather than inapplicable. Distinct from 'unverified', which
// remains the fail-closed/legacy zero that IS averaged into the composite: committed
// pre-2026-07-10 reports carry it, and the trading rubric still scores an unsupplied dimension
// 0.0-unverified because its evidence is caller-supplied and money surfaces fail closed
// (goal_cejel_b2_insufficient_data_not_zero_2026-07-10).
export const WitanCriterionStatusSchema = z.enum([
  'verified',
  'info',
  'warning',
  'critical',
  'unverified',
  'insufficient_data',
  'not_applicable',
]);
export const WitanEvidenceKindSchema = z.enum([
  'artifact',
  'audit_log',
  'scheduled_health_summary',
  'ci_run',
  'claim_reconciliation',
  'commit',
  'coverage',
  'dependency_report',
  'prod_check',
  'pull_request',
  'repository',
  'secret_scan',
  'test_run',
]);
export const WitanFindingSeveritySchema = z.enum(['critical', 'warning', 'info']);

// Repo-archetype classification (goal_cejel_repo_archetype_detection_2026-07-06): a deterministic,
// offline read of the file inventory used to decide whether a repo has a ratable source tree at
// all. 'monorepo' and 'source' both have ratable source and score normally; 'docs_only',
// 'binary_only', 'unrecognised_ecosystem', and 'empty' do not, and cejel reports an explicit
// insufficient-source verdict instead of a confident numeric score for those archetypes.
// 'unrecognised_ecosystem' (goal_cejel_language_calibration_2026-07-12): a non-empty,
// non-binary, non-docs repository with zero files matching a source extension cejel
// recognises — e.g. COBOL, Fortran, MATLAB. Distinct from the other insufficient-source
// archetypes: the repo IS a real source tree, cejel simply cannot read its language(s), so
// abstaining is the honest output rather than scoring it as an empty/near-empty repo would be.
export const WITAN_REPO_ARCHETYPES = [
  'source',
  'monorepo',
  'docs_only',
  'binary_only',
  'unrecognised_ecosystem',
  'empty',
] as const;
export const WitanRepoArchetypeSchema = z.enum(WITAN_REPO_ARCHETYPES);

export const WitanEvidencePointerSchema = z
  .object({
    kind: WitanEvidenceKindSchema,
    label: z.string().min(1).max(180),
    url: z.string().url().optional(),
    path: z.string().min(1).max(700).optional(),
    // Explicit null means the finding is file-scoped and no real match position was measured —
    // never a fabricated line (e.g. `1`) standing in for a position the detector never found
    // (goal_cejel_a2_one_notion_of_production_code_2026-07-13).
    line: z.number().int().positive().nullable().optional(),
    contentHash: z.string().min(8).max(160).optional(),
    capturedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.url ?? value.path ?? value.contentHash), {
    message: 'Witan evidence must include a path, url, or content hash.',
  });

export const WitanFindingSchema = z
  .object({
    severity: WitanFindingSeveritySchema,
    summary: z.string().min(1).max(500),
    evidence: WitanEvidencePointerSchema,
  })
  .strict();

export const WitanCriterionMetricSchema = z
  .object({
    name: z.string().min(1).max(80),
    label: z.string().min(1).max(180),
    value: z.number().min(0),
    max: z.number().positive().optional(),
    kind: z.enum(['ratio', 'saturating_count']).optional(),
    weight: z.number().positive().max(1).default(1),
    unit: z.string().min(1).max(40).optional(),
    description: z.string().min(1).max(300).optional(),
  })
  .strict();

export const WitanCriterionSignalSchema = z
  .object({
    criterionId: WitanCriterionIdSchema,
    positiveEvidence: z.array(WitanEvidencePointerSchema).default([]),
    findings: z.array(WitanFindingSchema).default([]),
    metrics: z.array(WitanCriterionMetricSchema).default([]),
    notes: z.string().min(1).max(1000).optional(),
    notApplicable: z.literal(true).optional(),
  })
  .strict();

export const WitanRepoRefSchema = z
  .object({
    path: z.string().min(1).max(700).optional(),
    url: z.string().url().optional(),
    headSha: z.string().min(7).max(64).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.path ?? value.url), {
    message: 'Witan repo reference must include a path or url.',
  });

export const WitanReportInputSchema = z
  .object({
    productSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/),
    productDisplayName: z.string().min(1).max(120),
    repo: WitanRepoRefSchema,
    generatedAt: z.string().datetime({ offset: true }),
    rubricVersion: z.string().min(1).max(120).default(WITAN_RUBRIC_VERSION),
    signals: z.array(WitanCriterionSignalSchema).default([]),
    archetype: WitanRepoArchetypeSchema.optional(),
    insufficientSourceReason: z.string().min(1).max(2000).optional(),
  })
  .strict();

export const WitanCriterionScoreSchema = z
  .object({
    id: WitanCriterionIdSchema,
    title: z.string().min(1).max(160),
    category: WitanCriterionCategorySchema,
    score: z.number().min(0).max(4),
    nativeScore: z.number().min(0).max(4).optional(),
    status: WitanCriterionStatusSchema,
    evidence: z.array(WitanEvidencePointerSchema),
    findings: z.array(WitanFindingSchema),
    metrics: z.array(WitanCriterionMetricSchema).default([]),
    notes: z.string().min(1).max(1000).optional(),
  })
  .strict();

// WitanInputSignal — external tool findings that AUGMENT (never replace) a native dimension score.
// source format: 'sarif:<tool-name>' e.g. 'sarif:codex-security'
export const WitanInputSignalFindingSchema = z
  .object({
    ruleId: z.string().min(1).max(200),
    severity: WitanFindingSeveritySchema,
    message: z.string().min(1).max(500),
    location: z.string().max(700).optional(),
  })
  .strict();

export const WitanInputSignalSchema = z
  .object({
    source: z.string().min(1).max(120),
    dimension: WitanCriterionIdSchema,
    findings: z.array(WitanInputSignalFindingSchema),
    weight: z.number().min(0).max(1),
  })
  .strict();

// Summary of a consumed signal as stored in the report for auditability.
export const WitanConsumedSignalSummarySchema = z
  .object({
    source: z.string().min(1).max(120),
    dimension: WitanCriterionIdSchema,
    findingCount: z.number().int().min(0),
    severityBreakdown: z
      .object({
        critical: z.number().int().min(0),
        warning: z.number().int().min(0),
        info: z.number().int().min(0),
      })
      .strict(),
    nativeScore: z.number().min(0).max(4),
    scoreAdjustment: z.number().min(-4).max(0),
    adjustedScore: z.number().min(0).max(4),
    // The individual ingested findings behind findingCount, attributed to this (source,
    // dimension) pair — report.json's full itemized set (goal_cejel_ingest_itemize_findings).
    // Presentation surfaces (terminal/summary.json/certificate) cap how many they display;
    // this field always carries every finding.
    findings: z.array(WitanInputSignalFindingSchema).default([]),
  })
  .strict();

export const WitanReportSchema = z
  .object({
    productSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/),
    productDisplayName: z.string().min(1).max(120),
    repo: WitanRepoRefSchema,
    generatedAt: z.string().datetime({ offset: true }),
    rubricVersion: z.string().min(1).max(120),
    codeTrustScore: z.number().min(0).max(4),
    processTrustScore: z.number().min(0).max(4),
    overallScore: z.number().min(0).max(4),
    // Rubric-driven: length matches whatever rubric produced this report, not a fixed enum.
    criteria: z.array(WitanCriterionScoreSchema).min(1),
    consumedSignals: z.array(WitanConsumedSignalSummarySchema).optional(),
    // Present only when the rubric has more than two criterion categories — the legacy
    // codeTrustScore/processTrustScore pair can't losslessly represent 3+ category buckets.
    categoryScores: z.record(z.string(), z.number().min(0).max(4)).optional(),
    // Repo-archetype metadata (see WitanRepoArchetypeSchema above). Both fields are omitted for
    // callers that don't classify an archetype (e.g. the trading rubric). insufficientSourceReason
    // is present only for the non-source archetypes ('docs_only' | 'binary_only' |
    // 'unrecognised_ecosystem' | 'empty') — its presence is what presentation layers
    // (badge/terminal/verdict) key off to show an explicit insufficient-source verdict instead of
    // a confident numeric score.
    archetype: WitanRepoArchetypeSchema.optional(),
    insufficientSourceReason: z.string().min(1).max(2000).optional(),
  })
  .strict();

export const WITAN_ATTESTATION_STATEMENT_TYPE = 'https://in-toto.io/Statement/v1' as const;
export const WITAN_ATTESTATION_PREDICATE_TYPE = 'https://cejel.dev/attestations/scan/v1' as const;

export const WitanAttestationOutcomeSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('scored'),
      overallScore: z.number().min(0).max(4),
      codeTrustScore: z.number().min(0).max(4),
      processTrustScore: z.number().min(0).max(4),
    })
    .strict(),
  z
    .object({
      status: z.literal('abstained'),
      reason: z.string().min(1).max(2000),
    })
    .strict(),
]);

// Unsigned in-toto statement emitted beside report.json. The envelope binds a specific report
// digest to the observed repository revision and outcome without pretending Cejel is an
// independent third-party signer. A customer or external reviewer can sign this statement with
// their existing provenance mechanism; until then assurance.status remains explicitly unsigned.
export const WitanAttestationStatementSchema = z
  .object({
    _type: z.literal(WITAN_ATTESTATION_STATEMENT_TYPE),
    subject: z
      .array(
        z
          .object({
            name: z.string().min(1).max(300),
            digest: z
              .object({
                sha256: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
          })
          .strict(),
      )
      .length(1),
    predicateType: z.literal(WITAN_ATTESTATION_PREDICATE_TYPE),
    predicate: z
      .object({
        tool: z
          .object({
            name: z.literal('cejel'),
            version: z.string().min(1).max(80),
          })
          .strict(),
        generatedAt: z.string().datetime({ offset: true }),
        rubricVersion: z.string().min(1).max(120),
        repository: z
          .object({
            productSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/),
            url: z.string().url().optional(),
            headSha: z.string().min(7).max(64).optional(),
          })
          .strict(),
        report: z
          .object({
            artifact: z.literal('report.json'),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
        outcome: WitanAttestationOutcomeSchema,
        assurance: z
          .object({
            status: z.literal('unsigned'),
            issuer: z.literal('self-generated'),
            signingHint: z.string().min(1).max(500),
          })
          .strict(),
        limitations: z.array(z.string().min(1).max(500)).min(1).max(8),
      })
      .strict(),
  })
  .strict();

export type WitanRepoArchetype = z.infer<typeof WitanRepoArchetypeSchema>;
export type WitanCriterionId = z.infer<typeof WitanCriterionIdSchema>;
export type WitanTradingCriterionId = z.infer<typeof WitanTradingCriterionIdSchema>;
export type WitanCriterionCategory = z.infer<typeof WitanCriterionCategorySchema>;
export type WitanCriterionStatus = z.infer<typeof WitanCriterionStatusSchema>;
export type WitanEvidenceKind = z.infer<typeof WitanEvidenceKindSchema>;
export type WitanEvidencePointer = z.infer<typeof WitanEvidencePointerSchema>;
export type WitanFinding = z.infer<typeof WitanFindingSchema>;
export type WitanCriterionMetric = z.infer<typeof WitanCriterionMetricSchema>;
export type WitanCriterionSignal = z.infer<typeof WitanCriterionSignalSchema>;
export type WitanCriterionSignalPayload = z.input<typeof WitanCriterionSignalSchema>;
export type WitanRepoRef = z.infer<typeof WitanRepoRefSchema>;
export type WitanReportInput = z.infer<typeof WitanReportInputSchema>;
export type WitanReportInputPayload = z.input<typeof WitanReportInputSchema>;
export type WitanCriterionScore = z.infer<typeof WitanCriterionScoreSchema>;
export type WitanReport = z.infer<typeof WitanReportSchema>;
export type WitanInputSignalFinding = z.infer<typeof WitanInputSignalFindingSchema>;
export type WitanInputSignal = z.infer<typeof WitanInputSignalSchema>;
export type WitanConsumedSignalSummary = z.infer<typeof WitanConsumedSignalSummarySchema>;
export type WitanAttestationOutcome = z.infer<typeof WitanAttestationOutcomeSchema>;
export type WitanAttestationStatement = z.infer<typeof WitanAttestationStatementSchema>;
