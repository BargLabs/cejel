import { z } from 'zod';

export const CEJEL_LLM_PACK_ID = 'free-llm';
export const CEJEL_LLM_PACK_VERSION = 'cejel-free-llm-v0-alpha-2';

/** Frozen Free LLM v1 catalogue. Only a measured subset is enabled by the alpha detector. */
export const CEJEL_LLM_RULE_IDS = [
  'LLM-IOH-001',
  'LLM-VAL-001',
  'LLM-AGY-001',
  'LLM-AGY-002',
  'LLM-DAT-001',
  'LLM-PRV-001',
  'LLM-EVL-001',
  'LLM-EVL-002',
] as const;

export const CEJEL_LLM_ENABLED_RULE_IDS = [
  'LLM-IOH-001',
  'LLM-VAL-001',
  'LLM-AGY-001',
  'LLM-AGY-002',
  'LLM-DAT-001',
  'LLM-PRV-001',
  'LLM-EVL-001',
  'LLM-EVL-002',
] as const;

export const CejelLlmRuleIdSchema = z.enum(CEJEL_LLM_RULE_IDS);
export const CejelLlmEnabledRuleIdSchema = z.enum(CEJEL_LLM_ENABLED_RULE_IDS);
export const CejelLlmSeveritySchema = z.enum(['critical', 'warning', 'info']);
export const CejelLlmConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const CejelLlmRuleStateSchema = z.enum([
  'finding',
  'verified_control',
  'not_applicable',
  'insufficient_data',
]);
export const CejelLlmPackStatusSchema = z.enum([
  'assessed',
  'assessed_with_limitations',
  'not_applicable',
]);

export const CejelLlmEvidenceSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(700)
      .refine(
        (path) =>
          !path.startsWith('/') &&
          !/^[A-Za-z]:[\\/]/.test(path) &&
          !path.split(/[\\/]/).some((member) => member === '..'),
        { message: 'Evidence paths must be repository-relative and cannot traverse parents.' },
      ),
    line: z.number().int().positive().nullable(),
    label: z.string().min(1).max(180),
  })
  .strict();

export const CejelLlmFindingSchema = z
  .object({
    // The finding schema represents the complete frozen catalogue. Whether a rule is enabled for
    // a detector version is recorded separately in coverage.enabledRuleIds; coupling the artifact
    // shape to today's subset would make adding a calibrated rule a schema-breaking change.
    ruleId: CejelLlmRuleIdSchema,
    severity: CejelLlmSeveritySchema,
    confidence: CejelLlmConfidenceSchema,
    summary: z.string().min(1).max(500),
    evidence: CejelLlmEvidenceSchema,
  })
  .strict();

export const CejelLlmRuleResultSchema = z
  .object({
    ruleId: CejelLlmRuleIdSchema,
    state: CejelLlmRuleStateSchema,
    confidence: CejelLlmConfidenceSchema,
    findings: z.array(CejelLlmFindingSchema),
    notes: z.string().min(1).max(1_000),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.state === 'finding' && result.findings.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A finding state must carry at least one finding.',
        path: ['findings'],
      });
    }
    if (result.state !== 'finding' && result.findings.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only a finding state may carry findings.',
        path: ['findings'],
      });
    }
    if (result.findings.some((finding) => finding.ruleId !== result.ruleId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nested findings must match the rule result id.',
        path: ['findings'],
      });
    }
  });

export const CejelLlmCoverageSchema = z
  .object({
    supportedLanguages: z
      .array(z.enum(['JavaScript/TypeScript', 'Python']))
      .min(1)
      .refine((languages) => new Set(languages).size === languages.length, {
        message: 'Supported languages must be unique.',
      }),
    sourceFilesConsidered: z.number().int().nonnegative(),
    sourceFilesWithLlmIndicators: z.number().int().nonnegative(),
    detectedIntegrations: z.array(z.string().min(1)),
    enabledRuleIds: z.array(CejelLlmEnabledRuleIdSchema),
    deferredRuleIds: z.array(CejelLlmRuleIdSchema),
    limitations: z.array(z.string().min(1)),
  })
  .strict();

export const CejelLlmPackResultSchema = z
  .object({
    packId: z.literal(CEJEL_LLM_PACK_ID),
    packVersion: z.literal(CEJEL_LLM_PACK_VERSION),
    status: CejelLlmPackStatusSchema,
    findings: z.array(CejelLlmFindingSchema),
    ruleResults: z.array(CejelLlmRuleResultSchema),
    coverage: CejelLlmCoverageSchema,
    notes: z.string().min(1).max(1_000),
  })
  .strict()
  .superRefine((result, context) => {
    const expectedIds = [...CEJEL_LLM_ENABLED_RULE_IDS];
    const actualIds = result.ruleResults.map((rule) => rule.ruleId);
    if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rule results must contain every enabled rule exactly once in catalogue order.',
        path: ['ruleResults'],
      });
    }
    if (result.status === 'not_applicable' && result.findings.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A not-applicable pack cannot carry findings.',
        path: ['findings'],
      });
    }
    const expectedEnabled = [...CEJEL_LLM_ENABLED_RULE_IDS];
    if (
      result.coverage.enabledRuleIds.length !== expectedEnabled.length ||
      result.coverage.enabledRuleIds.some((id, index) => id !== expectedEnabled[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Coverage enabled rule ids must match the detector catalogue exactly.',
        path: ['coverage', 'enabledRuleIds'],
      });
    }
    const enabled = new Set<string>(expectedEnabled);
    const expectedDeferred = CEJEL_LLM_RULE_IDS.filter((id) => !enabled.has(id));
    if (
      result.coverage.deferredRuleIds.length !== expectedDeferred.length ||
      result.coverage.deferredRuleIds.some((id, index) => id !== expectedDeferred[index])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Coverage deferred rule ids must be the catalogue complement in order.',
        path: ['coverage', 'deferredRuleIds'],
      });
    }
    const canonicalFindings = (findings: typeof result.findings): readonly string[] =>
      findings.map((finding) => JSON.stringify(finding)).sort();
    const nestedFindings = result.ruleResults.flatMap((rule) => rule.findings);
    if (
      JSON.stringify(canonicalFindings(result.findings)) !==
      JSON.stringify(canonicalFindings(nestedFindings))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Top-level findings must exactly equal the nested rule findings.',
        path: ['findings'],
      });
    }
    if (result.findings.some((finding) => finding.confidence === 'low')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Low-confidence candidates cannot be emitted as public artifact findings.',
        path: ['findings'],
      });
    }
    const states = result.ruleResults.map((rule) => rule.state);
    if (
      result.status === 'not_applicable' &&
      states.some((state) => state !== 'not_applicable')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A not-applicable pack requires every rule to be not_applicable.',
        path: ['ruleResults'],
      });
    }
    if (
      result.status === 'assessed' &&
      states.some((state) => state === 'not_applicable' || state === 'insufficient_data')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An assessed pack cannot contain unassessed rule states.',
        path: ['ruleResults'],
      });
    }
  });

export type CejelLlmRuleId = z.infer<typeof CejelLlmRuleIdSchema>;
export type CejelLlmEnabledRuleId = z.infer<typeof CejelLlmEnabledRuleIdSchema>;
export type CejelLlmSeverity = z.infer<typeof CejelLlmSeveritySchema>;
export type CejelLlmConfidence = z.infer<typeof CejelLlmConfidenceSchema>;
export type CejelLlmRuleState = z.infer<typeof CejelLlmRuleStateSchema>;
export type CejelLlmPackStatus = z.infer<typeof CejelLlmPackStatusSchema>;
export type CejelLlmEvidence = z.infer<typeof CejelLlmEvidenceSchema>;
export type CejelLlmFinding = z.infer<typeof CejelLlmFindingSchema>;
export type CejelLlmRuleResult = z.infer<typeof CejelLlmRuleResultSchema>;
export type CejelLlmCoverage = z.infer<typeof CejelLlmCoverageSchema>;
export type CejelLlmPackResult = z.infer<typeof CejelLlmPackResultSchema>;
