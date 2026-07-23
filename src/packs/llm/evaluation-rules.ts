import { isAbsolute } from 'node:path';

import { hasUnmaskedJavaScriptMatch, maskJavaScriptNonCode } from './lexical.js';
import { supportedJavaScriptModelCallIndices } from './javascript-integrations.js';
import type { LlmSourceFile } from './rules.js';
import type {
  CejelLlmConfidence,
  CejelLlmFinding,
  CejelLlmRuleId,
} from './types.js';

export type CejelLlmEvaluationRuleId = Extract<
  CejelLlmRuleId,
  'LLM-PRV-001' | 'LLM-EVL-001' | 'LLM-EVL-002'
>;

/** LLM-PRV-001 is `info` in the frozen contract; the shared alpha schema does not yet carry it. */
export type CejelLlmEvaluationFinding = CejelLlmFinding & {
  readonly ruleId: CejelLlmEvaluationRuleId;
};

export interface LlmEvaluationRuleDefinition {
  readonly id: CejelLlmEvaluationRuleId;
  readonly title: string;
  readonly detectorConfidence: CejelLlmConfidence;
  readonly evidenceContract: string;
  readonly exclusions: readonly string[];
  applies(files: readonly LlmSourceFile[]): boolean;
  detect(files: readonly LlmSourceFile[]): readonly CejelLlmEvaluationFinding[];
}

interface LocalEmission {
  readonly index: number;
  readonly properties: ReadonlySet<string>;
}

interface ModelInvocation {
  readonly index: number;
  readonly identity: string | null;
  readonly judge: boolean;
}

interface AggregateAssignment {
  readonly index: number;
  readonly denominatorCollections: ReadonlySet<string>;
}

interface DenominatorAliasAssignment {
  readonly index: number;
  readonly collection: string;
}

const RESULT_EMITTER_PATTERN = /\b(?:writeFileSync|appendFileSync|Bun\.write)\s*\(/g;
const MODEL_CALL_PATTERN =
  /(?:\.responses\.create|\.chat\.completions\.create|\.messages\.create|\b(?:generateText|streamText))\s*\(/g;
const ASSIGNMENT_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
const DENOMINATOR_ALIAS_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.length\s*;/g;
const AGGREGATE_NAME_PATTERN = /(?:rate|score|accuracy|average|mean|percentage|pct)/i;
const MODEL_LITERAL_PATTERN = /\bmodel\s*:\s*(['"`])([^'"`$]+)\1/;
const MODEL_IDENTIFIER_PATTERN = /\bmodel\s*:\s*([A-Za-z_$][\w$]*)/;
const LITERAL_BINDING_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`$]+)\2\s*;/g;
const LINEAGE_MODEL_KEYS = new Set([
  'model',
  'modelId',
  'modelVersion',
  'providerModelId',
  'producerModel',
]);
const LINEAGE_CONFIG_KEYS = new Set([
  'promptDigest',
  'promptHash',
  'policyDigest',
  'policyHash',
  'configDigest',
  'configHash',
  'configVersion',
  'evaluationConfigVersion',
  'evaluationManifest',
  'repositoryCommit',
]);
const DENOMINATOR_KEYS = new Set([
  'eligibleTotal',
  'eligibleCount',
  'totalCases',
  'totalCount',
  'denominator',
  'caseResults',
  'rawResults',
  'results',
]);
const OUTCOME_COUNT_PATTERN =
  /^(?:error|errors|refusal|refusals|abstention|abstentions|excluded|exclusions|excludedCount)$/i;
const INDEPENDENT_ADJUDICATOR_PATTERN =
  /\b(?:humanReview|humanAdjudication|manualReview|evidenceVerification|exactMatch|schemaCheck|propertyCheck|deterministicGrade|independentDecision)\b/;

function completeLocalSource(file: LlmSourceFile): boolean {
  if (!file.path || isAbsolute(file.path)) return false;
  const segments = file.path.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  return !segments.some((segment) =>
    /^(?:test|tests|__tests__|fixtures?|examples?|docs?|node_modules|vendor|generated)$/i.test(
      segment,
    ),
  );
}

function hasSupportedEvaluationImport(file: LlmSourceFile): boolean {
  return hasUnmaskedJavaScriptMatch(
    file.contents,
    /(?:from\s+['"](?:openai|@anthropic-ai\/sdk|ai)['"]|require\(\s*['"](?:openai|@anthropic-ai\/sdk|ai)['"]\s*\))/,
  );
}

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split('\n').length;
}

function matchingDelimiter(contents: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = start; index < contents.length; index += 1) {
    const character = contents[index];
    if (!character) break;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function objectProperties(objectBody: string): ReadonlySet<string> {
  const properties = new Set<string>();
  for (const match of objectBody.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=:|,|$)/g)) {
    const property = match[1];
    if (property) properties.add(property);
  }
  return properties;
}

function directObjectEmission(contents: string, emitterIndex: number): LocalEmission | null {
  const callStart = contents.indexOf('(', emitterIndex);
  if (callStart < 0) return null;
  const callEnd = matchingDelimiter(contents, callStart, '(', ')');
  if (callEnd < 0) return null;
  const call = contents.slice(callStart + 1, callEnd);
  const stringifyIndex = call.indexOf('JSON.stringify');
  if (stringifyIndex < 0) return null;
  const objectStart = call.indexOf('{', stringifyIndex);
  if (objectStart < 0) return null;
  const objectEnd = matchingDelimiter(call, objectStart, '{', '}');
  if (objectEnd < 0) return null;
  return {
    index: emitterIndex,
    properties: objectProperties(call.slice(objectStart + 1, objectEnd)),
  };
}

function localEmissions(file: LlmSourceFile): readonly LocalEmission[] {
  const emissions: LocalEmission[] = [];
  const masked = maskJavaScriptNonCode(file.contents);
  for (const match of file.contents.matchAll(RESULT_EMITTER_PATTERN)) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    const emission = directObjectEmission(file.contents, match.index);
    if (emission) emissions.push(emission);
  }
  return emissions;
}

function hasAny(properties: ReadonlySet<string>, candidates: ReadonlySet<string>): boolean {
  for (const property of properties) if (candidates.has(property)) return true;
  return false;
}

function finding(
  ruleId: CejelLlmEvaluationRuleId,
  file: LlmSourceFile,
  index: number,
  severity: CejelLlmEvaluationFinding['severity'],
  summary: string,
  label: string,
): CejelLlmEvaluationFinding {
  return {
    ruleId,
    severity,
    confidence: 'high',
    summary,
    evidence: {
      path: file.path,
      line: lineNumberAt(file.contents, index),
      label,
    },
  };
}

function detectMissingProvenance(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  const findings: CejelLlmEvaluationFinding[] = [];
  for (const file of files) {
    if (!completeLocalSource(file) || !hasSupportedEvaluationImport(file)) continue;
    const aggregateAssignments = aggregateAssignmentsIn(file.contents);
    if (aggregateAssignments.size === 0) continue;
    for (const emission of localEmissions(file)) {
      const emittedAggregates = [...aggregateAssignments].filter(([name]) =>
        emission.properties.has(name),
      );
      if (emittedAggregates.length === 0) continue;
      const firstAggregateIndex = Math.min(
        ...emittedAggregates.map(([, assignment]) => assignment.index),
      );
      if (!hasLocalLlmEvaluationInvocation(file, firstAggregateIndex)) continue;
      const hasModelLineage = hasAny(emission.properties, LINEAGE_MODEL_KEYS);
      const hasConfigurationLineage = hasAny(emission.properties, LINEAGE_CONFIG_KEYS);
      if (hasModelLineage && hasConfigurationLineage) continue;
      findings.push(
        finding(
          'LLM-PRV-001',
          file,
          emission.index,
          'info',
          'A locally emitted LLM evaluation aggregate does not retain both model and prompt/policy evaluation-configuration lineage.',
          'Evaluation result emitted without complete reproducible system provenance',
        ),
      );
    }
  }
  return findings;
}

function aggregateAssignmentsIn(contents: string): ReadonlyMap<string, AggregateAssignment> {
  const assignments = new Map<string, AggregateAssignment>();
  const masked = maskJavaScriptNonCode(contents);
  for (const match of contents.matchAll(ASSIGNMENT_PATTERN)) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    const name = match[1];
    const expression = match[2];
    if (!name || !expression) continue;
    if (!AGGREGATE_NAME_PATTERN.test(name)) continue;
    if (/\.length\s*\/|\/\s*[A-Za-z_$][\w$]*\.length\b|\.reduce\s*\(/.test(expression)) {
      const denominatorCollections = new Set<string>();
      for (const denominator of expression.matchAll(
        /\/\s*([A-Za-z_$][\w$]*)\.length\b/g,
      )) {
        if (denominator[1]) denominatorCollections.add(denominator[1]);
      }
      assignments.set(name, { index: match.index, denominatorCollections });
    }
  }
  return assignments;
}

function denominatorAliasAssignments(
  contents: string,
): ReadonlyMap<string, DenominatorAliasAssignment> {
  const assignments = new Map<string, DenominatorAliasAssignment>();
  const masked = maskJavaScriptNonCode(contents);
  for (const match of contents.matchAll(DENOMINATOR_ALIAS_PATTERN)) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    const alias = match[1];
    const collection = match[2];
    if (alias && collection) assignments.set(alias, { index: match.index, collection });
  }
  return assignments;
}

function hasOutcomeCounts(properties: ReadonlySet<string>): boolean {
  return [...properties].some((property) => OUTCOME_COUNT_PATTERN.test(property));
}

function hasLocalLlmEvaluationInvocation(file: LlmSourceFile, beforeIndex: number): boolean {
  return modelInvocations(file.contents).some((invocation) => invocation.index < beforeIndex);
}

function detectMissingDenominator(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  const findings: CejelLlmEvaluationFinding[] = [];
  for (const file of files) {
    if (!completeLocalSource(file) || !hasSupportedEvaluationImport(file)) continue;
    const aggregateAssignments = aggregateAssignmentsIn(file.contents);
    const denominatorAliases = denominatorAliasAssignments(file.contents);
    if (aggregateAssignments.size === 0) continue;
    const iteratesCases = /\.(?:map|filter|reduce|forEach)\s*\(|\bfor\s*\([^)]*\bof\b/.test(
      file.contents,
    );
    if (!iteratesCases) continue;
    for (const emission of localEmissions(file)) {
      const emittedAggregates = [...aggregateAssignments].filter(([name]) =>
        emission.properties.has(name),
      );
      if (emittedAggregates.length === 0) continue;
      const firstAggregateIndex = Math.min(
        ...emittedAggregates.map(([, assignment]) => assignment.index),
      );
      if (!hasLocalLlmEvaluationInvocation(file, firstAggregateIndex)) continue;
      if (hasAny(emission.properties, DENOMINATOR_KEYS)) continue;
      const emittedAliasHasLineage = [...emission.properties].some((property) => {
        const alias = denominatorAliases.get(property);
        if (!alias || alias.index >= emission.index) return false;
        return emittedAggregates.some(([, aggregate]) =>
          aggregate.denominatorCollections.has(alias.collection),
        );
      });
      if (emittedAliasHasLineage) continue;
      // Outcome counts alone are not a substitute for the eligible denominator, but when both are
      // present another integration layer can decide whether they sum reproducibly. This isolated
      // detector abstains instead of making that inference.
      if (hasOutcomeCounts(emission.properties)) continue;
      findings.push(
        finding(
          'LLM-EVL-001',
          file,
          emission.index,
          'warning',
          'A locally computed evaluation aggregate is emitted without its eligible-case denominator or raw case-level results.',
          'Evaluation aggregate emitted without reproducible denominator',
        ),
      );
    }
  }
  return findings;
}

function literalBindings(contents: string): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();
  for (const match of contents.matchAll(LITERAL_BINDING_PATTERN)) {
    const identifier = match[1];
    const value = match[3];
    if (identifier && value) bindings.set(identifier, value);
  }
  return bindings;
}

function modelIdentity(call: string, bindings: ReadonlyMap<string, string>): string | null {
  const literal = call.match(MODEL_LITERAL_PATTERN)?.[2];
  if (literal) return literal;
  const identifier = call.match(MODEL_IDENTIFIER_PATTERN)?.[1];
  return identifier ? (bindings.get(identifier) ?? null) : null;
}

function modelInvocations(contents: string): readonly ModelInvocation[] {
  const bindings = literalBindings(contents);
  const invocations: ModelInvocation[] = [];
  const masked = maskJavaScriptNonCode(contents);
  const supportedIndices = supportedJavaScriptModelCallIndices(contents);
  for (const match of contents.matchAll(MODEL_CALL_PATTERN)) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    if (!supportedIndices.has(match.index)) continue;
    const callStart = contents.indexOf('(', match.index);
    if (callStart < 0) continue;
    const callEnd = matchingDelimiter(contents, callStart, '(', ')');
    if (callEnd < 0) continue;
    const call = contents.slice(match.index, callEnd + 1);
    const judge = /\b(?:system|instructions?)\s*:\s*(['"`])[^'"`]*(?:judge|grader|evaluate|score)[^'"`]*\1/i.test(
      call,
    );
    invocations.push({ index: match.index, identity: modelIdentity(call, bindings), judge });
  }
  return invocations;
}

function detectSoleSelfJudge(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  const findings: CejelLlmEvaluationFinding[] = [];
  for (const file of files) {
    if (!completeLocalSource(file) || !hasSupportedEvaluationImport(file)) continue;
    if (INDEPENDENT_ADJUDICATOR_PATTERN.test(file.contents)) continue;
    const invocations = modelInvocations(file.contents);
    const judges = invocations.filter((invocation) => invocation.judge);
    const producers = invocations.filter((invocation) => !invocation.judge);
    if (judges.length !== 1 || producers.length !== 1) continue;
    const judge = judges[0];
    const producer = producers[0];
    if (!judge?.identity || !producer?.identity || judge.identity !== producer.identity) continue;
    // A complete local result emission is required before an absence finding. Otherwise this may
    // be self-critique or an intermediate draft rather than the accepted evaluation result.
    if (localEmissions(file).length === 0) continue;
    findings.push(
      finding(
        'LLM-EVL-002',
        file,
        judge.index,
        'warning',
        `The producer and sole model-assisted judge resolve to the same configured model (${judge.identity}), with no local independent adjudicator.`,
        `Judge invocation reuses producer model ${judge.identity}`,
      ),
    );
  }
  return findings;
}

function hasAggregateEvaluationSurface(files: readonly LlmSourceFile[]): boolean {
  return files.some((file) => {
    if (!completeLocalSource(file) || !hasSupportedEvaluationImport(file)) return false;
    const aggregates = aggregateAssignmentsIn(file.contents);
    if (aggregates.size === 0) return false;
    return localEmissions(file).some((emission) => {
      const emitted = [...aggregates].filter(([name]) => emission.properties.has(name));
      if (emitted.length === 0) return false;
      const first = Math.min(...emitted.map(([, assignment]) => assignment.index));
      return hasLocalLlmEvaluationInvocation(file, first);
    });
  });
}

function hasModelJudgeSurface(files: readonly LlmSourceFile[]): boolean {
  return files.some((file) => {
    if (!completeLocalSource(file) || !hasSupportedEvaluationImport(file)) return false;
    const invocations = modelInvocations(file.contents);
    return (
      invocations.some((invocation) => invocation.judge) &&
      invocations.some((invocation) => !invocation.judge) &&
      localEmissions(file).length > 0
    );
  });
}

export const CEJEL_LLM_EVALUATION_RULES: readonly LlmEvaluationRuleDefinition[] = [
  {
    id: 'LLM-PRV-001',
    title: 'Declared evaluation lacks reproducible system provenance',
    detectorConfidence: 'high',
    evidenceContract:
      'A complete local aggregate-to-result-emitter path is visible, while the emitted object lacks model or prompt/policy evaluation-configuration lineage.',
    exclusions: [
      'External or dynamically assembled result reporters',
      'Exploratory code without a locally emitted aggregate',
      'Tests, examples, fixtures, documentation, generated code, and unresolved paths',
    ],
    applies: hasAggregateEvaluationSurface,
    detect: detectMissingProvenance,
  },
  {
    id: 'LLM-EVL-001',
    title: 'Evaluation result omits its eligible denominator or exclusions',
    detectorConfidence: 'high',
    evidenceContract:
      'A complete local case-iteration, aggregate-calculation, and direct result-emission path is visible, while the emitted object lacks a denominator or raw case results.',
    exclusions: [
      'Counts without an aggregate rate or average',
      'External or dynamically assembled result reporters',
      'Tests, examples, fixtures, documentation, generated code, and unresolved paths',
    ],
    applies: hasAggregateEvaluationSurface,
    detect: detectMissingDenominator,
  },
  {
    id: 'LLM-EVL-002',
    title: 'Evaluated system is its own sole judge',
    detectorConfidence: 'high',
    evidenceContract:
      'Exactly one local producer and one explicit model-assisted judge resolve to the same literal model identity, a result is locally emitted, and no recognized independent adjudicator is present.',
    exclusions: [
      'Unresolved or provider-managed model identities',
      'Distinct judge models and locally declared independent adjudication',
      'Tests, examples, fixtures, documentation, generated code, and unresolved paths',
    ],
    applies: hasModelJudgeSurface,
    detect: detectSoleSelfJudge,
  },
];

export function detectCejelLlmEvaluationRules(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  return CEJEL_LLM_EVALUATION_RULES.flatMap((rule) => rule.detect(files));
}
