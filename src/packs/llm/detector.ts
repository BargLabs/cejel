import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

import { CEJEL_LLM_ACTION_RULES } from './action-rules.js';
import {
  CEJEL_LLM_EVALUATION_RULES,
  detectCejelLlmEvaluationRules,
} from './evaluation-rules.js';
import { listCejelLlmPackFiles } from './files.js';
import {
  isExcludedLlmSourcePath,
  hasUnmaskedJavaScriptMatch,
  maskPythonNonCode,
} from './lexical.js';
import { hasSupportedJavaScriptModelCall } from './javascript-integrations.js';
import {
  CEJEL_LLM_PYTHON_RULES,
  hasSupportedPythonLlmIntegration,
} from './python-rules.js';
import { CEJEL_LLM_V1_RULES, type LlmSourceFile } from './rules.js';
import {
  CEJEL_LLM_PACK_ID,
  CEJEL_LLM_PACK_VERSION,
  CEJEL_LLM_ENABLED_RULE_IDS,
  CEJEL_LLM_RULE_IDS,
  CejelLlmPackResultSchema,
  type CejelLlmPackResult,
  type CejelLlmRuleResult,
} from './types.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.py',
]);
const MAX_SOURCE_BYTES = 1_000_000;
const ENABLED_RULE_ID_SET = new Set<string>(CEJEL_LLM_ENABLED_RULE_IDS);

const INTEGRATION_PATTERNS: readonly {
  readonly name: string;
  readonly pattern: RegExp;
}[] = [
  { name: 'OpenAI SDK', pattern: /(?:from\s+['"]openai['"]|require\(\s*['"]openai['"]\s*\))/ },
  {
    name: 'Anthropic SDK',
    pattern: /(?:from\s+['"]@anthropic-ai\/sdk['"]|require\(\s*['"]@anthropic-ai\/sdk['"]\s*\))/,
  },
  { name: 'Vercel AI SDK', pattern: /(?:from\s+['"]ai['"]|require\(\s*['"]ai['"]\s*\))/ },
  {
    name: 'LangChain',
    pattern:
      /(?:from\s+['"](?:@langchain\/|langchain\/)|require\(\s*['"](?:@langchain\/|langchain\/))/,
  },
  {
    name: 'OpenAI Python SDK',
    pattern: /(?:^|\n)\s*(?:from\s+openai\s+import\s+|import\s+openai\b)/,
  },
  {
    name: 'Anthropic Python SDK',
    pattern: /(?:^|\n)\s*(?:from\s+anthropic\s+import\s+|import\s+anthropic\b)/,
  },
];

const RULE_CONFIDENCE = new Map(
  [...CEJEL_LLM_V1_RULES, ...CEJEL_LLM_ACTION_RULES, ...CEJEL_LLM_EVALUATION_RULES].map(
    (rule) => [rule.id, rule.detectorConfidence] as const,
  ),
);

function isPythonSource(file: LlmSourceFile): boolean {
  return extname(file.path).toLowerCase() === '.py';
}

function supportedSourcePath(path: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase());
}

function readSourceFile(repoPath: string, relativePath: string): LlmSourceFile | null {
  const root = resolve(repoPath);
  const fullPath = resolve(root, relativePath);
  if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) return null;

  try {
    const stat = lstatSync(fullPath);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return null;
    return { path: relativePath, contents: readFileSync(fullPath, 'utf8') };
  } catch {
    return null;
  }
}

function detectedIntegrations(files: readonly LlmSourceFile[]): readonly string[] {
  const detected = new Set<string>();
  for (const file of files) {
    if (isExcludedLlmSourcePath(file.path)) continue;
    for (const integration of INTEGRATION_PATTERNS) {
      const detectedHere = isPythonSource(file)
        ? integration.pattern.test(maskPythonNonCode(file.contents))
        : hasUnmaskedJavaScriptMatch(file.contents, integration.pattern);
      if (detectedHere) detected.add(integration.name);
    }
  }
  return [...detected].sort();
}

export interface CejelLlmInputSnapshot {
  readonly repoFiles: readonly string[];
  readonly sourceSha256: string;
}

export function snapshotCejelLlmPackInput(repoPath: string): CejelLlmInputSnapshot {
  const repoFiles = listCejelLlmPackFiles(repoPath);
  const hash = createHash('sha256');
  for (const path of repoFiles.filter(supportedSourcePath)) {
    const file = readSourceFile(repoPath, path);
    if (!file) continue;
    hash.update(path, 'utf8');
    hash.update('\0');
    hash.update(file.contents, 'utf8');
    hash.update('\0');
  }
  return { repoFiles, sourceSha256: hash.digest('hex') };
}

/**
 * Deterministic, offline Free LLM Pack alpha collector.
 *
 * This returns a pack-native result rather than a WitanCriterionSignalPayload because the current
 * core criterion schema has no LLM criterion id. A later, separate integration change can adapt
 * this result after adding an LLM rubric/criterion without misattributing findings to A1-B6.
 */
export function collectCejelLlmPack(
  repoPath: string,
  repoFiles: readonly string[],
): CejelLlmPackResult {
  const sourceFiles = repoFiles
    .filter(supportedSourcePath)
    .map((path) => readSourceFile(repoPath, path))
    .filter((file): file is LlmSourceFile => file !== null);
  const integrations = detectedIntegrations(sourceFiles);
  const javascriptSourceFiles = sourceFiles.filter((file) => !isPythonSource(file));
  const javascriptLlmFiles = javascriptSourceFiles.filter(
    (file) =>
      !isExcludedLlmSourcePath(file.path) && hasSupportedJavaScriptModelCall(file.contents),
  );
  const pythonLlmFiles = sourceFiles.filter(
    (file) => isPythonSource(file) && hasSupportedPythonLlmIntegration(file),
  );
  const actionSurfaceFiles = sourceFiles.filter((file) =>
    CEJEL_LLM_ACTION_RULES.some((rule) => rule.applies(file)),
  );
  const applicable =
    javascriptLlmFiles.length > 0 ||
    pythonLlmFiles.length > 0 ||
    actionSurfaceFiles.length > 0;
  const findings = applicable
    ? [
        ...javascriptLlmFiles.flatMap((file) =>
          CEJEL_LLM_V1_RULES.flatMap((rule) => rule.detect(file)),
        ),
        // A model-facing tool registration is itself a frozen-contract activator. Action rules
        // therefore inspect every supported source file rather than depending on an unrelated
        // direct official-SDK call in the same file.
        ...sourceFiles.flatMap((file) =>
          CEJEL_LLM_ACTION_RULES.flatMap((rule) => rule.detect(file)),
        ),
        ...pythonLlmFiles.flatMap((file) =>
          CEJEL_LLM_PYTHON_RULES.flatMap((rule) => rule.detect(file)),
        ),
        // Inspect every supported JS/TS file, but evaluation rules require their own recognized
        // model invocation before a local result emission. Repository-level applicability alone is
        // never evidence that an unrelated metrics writer is an LLM evaluation.
        ...detectCejelLlmEvaluationRules(javascriptSourceFiles),
      ]
    : [];
  const ruleResults: CejelLlmRuleResult[] = CEJEL_LLM_ENABLED_RULE_IDS.map((ruleId) => {
    const ruleFindings = findings.filter((finding) => finding.ruleId === ruleId);
    const confidence = RULE_CONFIDENCE.get(ruleId) ?? 'low';
    if (!applicable) {
      return {
        ruleId,
        state: 'not_applicable',
        confidence,
        findings: [],
        notes: 'No supported LLM call path was detected, so this rule was not assessed.',
      };
    }
    if (ruleFindings.length > 0) {
      return {
        ruleId,
        state: 'finding',
        confidence,
        findings: ruleFindings,
        notes: 'The rule evidence contract matched observable source evidence.',
      };
    }
    const ruleApplicable =
      CEJEL_LLM_V1_RULES.filter((rule) => rule.id === ruleId).some((rule) =>
        javascriptLlmFiles.some((file) => rule.applies(file)),
      ) ||
      CEJEL_LLM_PYTHON_RULES.filter((rule) => rule.id === ruleId).some((rule) =>
        pythonLlmFiles.some((file) => rule.applies(file)),
      ) ||
      CEJEL_LLM_ACTION_RULES.filter((rule) => rule.id === ruleId).some((rule) =>
        sourceFiles.some((file) => rule.applies(file)),
      ) ||
      CEJEL_LLM_EVALUATION_RULES.filter((rule) => rule.id === ruleId).some((rule) =>
        rule.applies(javascriptSourceFiles),
      );
    if (!ruleApplicable) {
      return {
        ruleId,
        state: 'not_applicable',
        confidence,
        findings: [],
        notes: 'The rule-specific surface was not observed in supported local source.',
      };
    }
    return {
      ruleId,
      state: 'insufficient_data',
      confidence,
      findings: [],
      notes: 'No finding matched, but this alpha detector does not yet prove that a control exists.',
    };
  });
  const status = applicable ? 'assessed_with_limitations' : 'not_applicable';
  const indicatorPaths = new Set([
    ...javascriptLlmFiles.map((file) => file.path),
    ...pythonLlmFiles.map((file) => file.path),
    ...actionSurfaceFiles.map((file) => file.path),
  ]);
  const integrationSet = new Set(integrations);
  if (actionSurfaceFiles.length > 0) integrationSet.add('Model-facing tool registration');

  return CejelLlmPackResultSchema.parse({
    packId: CEJEL_LLM_PACK_ID,
    packVersion: CEJEL_LLM_PACK_VERSION,
    status,
    findings,
    ruleResults,
    coverage: {
      supportedLanguages: ['JavaScript/TypeScript', 'Python'],
      sourceFilesConsidered: sourceFiles.length,
      sourceFilesWithLlmIndicators: indicatorPaths.size,
      detectedIntegrations: [...integrationSet].sort(),
      enabledRuleIds: [...CEJEL_LLM_ENABLED_RULE_IDS],
      deferredRuleIds: CEJEL_LLM_RULE_IDS.filter(
        (ruleId) => !ENABLED_RULE_ID_SET.has(ruleId),
      ),
      limitations: [
        'Alpha coverage is limited to fixture-backed JavaScript, TypeScript, and Python source patterns in files up to 1 MB.',
        'Rules use bounded, observable source patterns and do not claim whole-program data-flow analysis.',
        'Action-governance and evaluation-hygiene rules currently require complete local JavaScript or TypeScript paths.',
        'No model-quality, factuality, prompt-injection-resistance, or general hallucination rate is measured.',
      ],
    },
    notes:
      applicable
        ? 'Static LLM application-integrity alpha; findings require calibration before public release.'
        : 'No supported LLM call path was detected; LLM controls were not scored.',
  });
}

/** Public pack-owned entry point. It scans only the repository's tracked/local file boundary. */
export function scanCejelLlmPack(repoPath: string): CejelLlmPackResult {
  const snapshot = snapshotCejelLlmPackInput(repoPath);
  return collectCejelLlmPack(repoPath, snapshot.repoFiles);
}
