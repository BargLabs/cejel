import { isAbsolute } from 'node:path';

import { hasUnmaskedJavaScriptMatch, maskJavaScriptNonCode } from './lexical.js';
import { supportedJavaScriptModelCallIndices } from './javascript-integrations.js';
import {
  detectPythonConfiguredSelfJudge,
  detectPythonMissingEvaluationProvenance,
} from './python-evaluation-rules.js';
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
  /(?:\.responses\.create|\.chat\.completions\.create|\.messages\.create|\b(?:generateText|streamText|fetch))\s*\(/g;
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
  'configId',
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
const DISCRETE_CASE_KEY_PATTERN =
  /^(?:case|caseId|scenario|sample|sampleId|run|runId|input|expected|expectedOutput)$/i;
const DISCRETE_OUTCOME_KEY_PATTERN =
  /^(?:ok|passed|success|successful|correct|score|verdict|result|actualOutput|output|latency|duration|error|failedPairs|contentChanged|editReflected)$/i;
const CASE_COLLECTION_KEY_PATTERN = /^(?:cases|rows|samples|caseResults|results)$/i;
const CASE_RESULT_KEY_PATTERN =
  /^(?:status|actualOutput|output|score|verdict|correct|success|error|latency|metrics)$/i;
function hasIndependentAcceptanceSignal(file: LlmSourceFile): boolean {
  const masked = maskJavaScriptNonCode(file.contents);
  const emissions = localEmissions(file);
  for (const match of masked.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:humanReview|humanAdjudication|manualReview|evidenceVerification|exactMatch|schemaCheck|propertyCheck|deterministicGrade|independentDecision)\s*\(/g,
  )) {
    const identifier = match[1];
    if (!identifier) continue;
    if (emissions.some((emission) => {
      if (emission.index <= match.index) return false;
      const callStart = masked.indexOf('(', emission.index);
      const callEnd = callStart < 0 ? -1 : matchingDelimiter(masked, callStart, '(', ')');
      if (callEnd < 0) return false;
      const escaped = identifier.replaceAll('$', '\\$');
      return new RegExp(`\\b${escaped}\\b`).test(masked.slice(callStart, callEnd + 1));
    })) return true;
    const tail = masked.slice(match.index + match[0].length);
    const escaped = identifier.replaceAll('$', '\\$');
    const gate = new RegExp(
      `\\bif\\s*\\([^)]*\\b${escaped}\\b[^)]*\\)\\s*(?:\\{[\\s\\S]{0,300}?\\b(?:throw|return|writeFileSync|appendFileSync|Bun\\.write)\\b|(?:throw|return)\\b)`,
    );
    if (gate.test(tail)) return true;
  }
  return /\bif\s*\([^)]*(?:humanReview|humanAdjudication|manualReview|evidenceVerification|exactMatch|schemaCheck|propertyCheck|deterministicGrade|independentDecision)\s*\([^)]*\)[^)]*\)\s*(?:\{[\s\S]{0,300}?\b(?:throw|return|writeFileSync|appendFileSync|Bun\.write)\b|(?:throw|return)\b)/.test(
    masked,
  );
}

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
  return supportedJavaScriptModelCallIndices(file.contents).size > 0 ||
    supportedEvaluationHttpInvocationIndices(file.contents).size > 0 ||
    supportedLangChainEvaluationInvocationIndices(file.contents).size > 0 ||
    hasUnmaskedJavaScriptMatch(
    file.contents,
    /(?:from\s+['"](?:openai|@anthropic-ai\/sdk|ai)['"]|require\(\s*['"](?:openai|@anthropic-ai\/sdk|ai)['"]\s*\))/,
  );
}

function supportedLangChainEvaluationInvocationIndices(contents: string): ReadonlySet<number> {
  const indices = new Set<number>();
  const masked = maskJavaScriptNonCode(contents);
  if (
    !/(?:from\s+['"]@langchain\/core\/runnables['"]|require\(\s*['"]@langchain\/core\/runnables['"]\s*\))/.test(
      contents,
    ) ||
    !/(?:from\s+['"]@langchain\/core\/prompts['"]|require\(\s*['"]@langchain\/core\/prompts['"]\s*\))/.test(
      contents,
    )
  ) return indices;
  for (const sequence of masked.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*RunnableSequence\.from\s*\(/g,
  )) {
    const executor = sequence[1];
    if (!executor) continue;
    const callStart = masked.indexOf('(', sequence.index);
    const callEnd = matchingDelimiter(masked, callStart, '(', ')');
    if (callStart < 0 || callEnd < 0) continue;
    const sequenceBody = masked.slice(callStart + 1, callEnd);
    if (
      !/\bPromptTemplate\.fromTemplate\s*\(/.test(sequenceBody) ||
      !/(?:withStructuredOutput|model|llm)/i.test(sequenceBody)
    ) continue;
    const escapedExecutor = executor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const invocationPattern = new RegExp(
      `\\b${escapedExecutor}\\.(?:invoke|batch)\\s*\\(`,
      'g',
    );
    for (const invocation of masked.slice(callEnd + 1).matchAll(invocationPattern)) {
      indices.add(callEnd + 1 + invocation.index);
    }
  }
  return indices;
}

function supportedEvaluationHttpInvocationIndices(contents: string): ReadonlySet<number> {
  const indices = new Set<number>();
  const masked = maskJavaScriptNonCode(contents);
  const declaresEvaluationRequest =
    /['"]X-Flowise-Evaluation['"]\s*:\s*['"]true['"]/.test(contents) &&
    /\bevaluation\s*:\s*true\b/.test(masked);
  if (!declaresEvaluationRequest) return indices;
  for (const match of contents.matchAll(
    /\baxios\.post\s*\(\s*`[^`]*\/api\/v1\/prediction\/\$\{[^}]+\}[^`]*`/g,
  )) {
    if ((masked[match.index] ?? ' ') !== ' ') indices.add(match.index);
  }
  return indices;
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

interface BoundObject {
  readonly name: string;
  readonly index: number;
  readonly end: number;
  readonly properties: ReadonlySet<string>;
}

function boundObjectLiterals(contents: string): readonly BoundObject[] {
  const objects: BoundObject[] = [];
  const masked = maskJavaScriptNonCode(contents);
  for (const match of contents.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:[^=\n]+)?\s*=\s*\{/g,
  )) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    const name = match[1];
    if (!name) continue;
    const start = contents.indexOf('{', match.index);
    const end = matchingDelimiter(contents, start, '{', '}');
    if (end < 0) continue;
    objects.push({
      name,
      index: match.index,
      end,
      properties: objectProperties(masked.slice(start + 1, end)),
    });
  }
  return objects;
}

function resolvedIdentifierEmissionOrReturnIndex(
  contents: string,
  identifier: string,
  afterIndex: number,
): number | null {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = maskJavaScriptNonCode(contents.slice(afterIndex));
  const redeclaration = new RegExp(
    `\\b(?:const|let|var)\\s+${escaped}\\b`,
  ).exec(tail);
  const observableTail = redeclaration ? tail.slice(0, redeclaration.index) : tail;
  const serializedEmission = new RegExp(
    `\\b(?:writeFileSync|appendFileSync|Bun\\.write|console\\.(?:log|info))\\s*\\([\\s\\S]{0,500}?JSON\\.stringify\\s*\\(\\s*${escaped}\\b`,
  ).exec(observableTail);
  const returned = new RegExp(`\\breturn\\s+${escaped}\\s*;?`).exec(observableTail);
  const indices = [serializedEmission?.index, returned?.index]
    .filter((index): index is number => index !== undefined)
    .map((index) => afterIndex + index);
  return indices.length > 0 ? Math.min(...indices) : null;
}

function assignedProperties(
  contents: string,
  identifier: string,
  afterIndex: number,
  beforeIndex = contents.length,
): ReadonlySet<string> {
  const properties = new Set<string>();
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const maskedTail = maskJavaScriptNonCode(contents.slice(afterIndex, beforeIndex));
  const redeclaration = new RegExp(
    `\\b(?:const|let|var)\\s+${escaped}\\b`,
  ).exec(maskedTail);
  const masked = redeclaration
    ? maskedTail.slice(0, redeclaration.index)
    : maskedTail;
  const pattern = new RegExp(`\\b${escaped}\\.([A-Za-z_$][\\w$]*)\\s*=`, 'g');
  for (const match of masked.matchAll(pattern)) {
    if (match[1]) properties.add(match[1]);
  }
  return properties;
}

function configurationInputLocus(
  contents: string,
  beforeIndex: number,
): number | null {
  const masked = maskJavaScriptNonCode(contents);
  let earliest: number | null = null;
  for (const declaration of contents.matchAll(
    /\bimport\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g,
  )) {
    if (declaration.index >= beforeIndex || (masked[declaration.index] ?? ' ') === ' ') continue;
    for (const member of (declaration[1] ?? '').split(',')) {
      const binding = member.trim().match(
        /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/,
      );
      const local = binding?.[2] ?? binding?.[1];
      if (!local || !/(?:prompt|policy|config|system)/i.test(local)) continue;
      const tail = masked.slice(declaration.index + declaration[0].length, beforeIndex);
      if (!new RegExp(`\\b${local.replaceAll('$', '\\$')}\\b`).test(tail)) continue;
      earliest = earliest === null ? declaration.index : Math.min(earliest, declaration.index);
    }
  }
  return earliest;
}

interface JavaScriptFunctionScope {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

function javaScriptFunctionScopes(masked: string): readonly JavaScriptFunctionScope[] {
  const scopes: JavaScriptFunctionScope[] = [];
  const patterns = [
    /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::[^{\n]+)?\s*\{/gm,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=\n]+)?=>\s*\{/g,
  ];
  for (const pattern of patterns) {
    for (const declaration of masked.matchAll(pattern)) {
      const functionName = declaration[1];
      if (
        !functionName ||
        /^(?:if|for|while|switch|catch|with)$/i.test(functionName)
      ) {
        continue;
      }
      const start = declaration.index + declaration[0].lastIndexOf('{');
      const end = matchingDelimiter(masked, start, '{', '}');
      if (start >= 0 && end >= 0) scopes.push({ name: functionName, start, end });
    }
  }
  return scopes;
}

function hasScopedInvocationBefore(
  contents: string,
  invocations: readonly ModelInvocation[],
  resultIndex: number,
): boolean {
  const scopes = javaScriptFunctionScopes(maskJavaScriptNonCode(contents));
  const resultScope = scopes
    .filter((scope) => resultIndex > scope.start && resultIndex < scope.end)
    .sort((left, right) => right.start - left.start)[0];
  if (resultScope) {
    return invocations.some(
      (invocation) =>
        invocation.index > resultScope.start &&
        invocation.index < resultIndex &&
        !scopes.some(
          (scope) =>
            scope.start > resultScope.start &&
            scope.end < resultScope.end &&
            invocation.index > scope.start &&
            invocation.index < scope.end,
        ),
    );
  }
  return invocations.some(
    (invocation) =>
      invocation.index < resultIndex &&
      !scopes.some(
        (scope) =>
          invocation.index > scope.start &&
          invocation.index < scope.end,
      ),
  );
}

function hasLocalOrResolvedHelperInvocationBefore(
  contents: string,
  invocations: readonly ModelInvocation[],
  resultIndex: number,
): boolean {
  if (hasScopedInvocationBefore(contents, invocations, resultIndex)) return true;
  const masked = maskJavaScriptNonCode(contents);
  const scopes = javaScriptFunctionScopes(masked);
  const resultScope = scopes
    .filter((scope) => resultIndex > scope.start && resultIndex < scope.end)
    .sort((left, right) => right.start - left.start)[0];
  if (!resultScope) return false;
  const callerPrefix = masked.slice(resultScope.start + 1, resultIndex);
  return scopes.some((callee) => {
    if (callee.start === resultScope.start) return false;
    const ownsModelInvocation = invocations.some(
      (invocation) =>
        invocation.index > callee.start &&
        invocation.index < callee.end &&
        !scopes.some(
          (nested) =>
            nested.start > callee.start &&
            nested.end < callee.end &&
            invocation.index > nested.start &&
            invocation.index < nested.end,
        ),
    );
    if (!ownsModelInvocation) return false;
    const escapedName = callee.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(?:\\bawait\\s+|=\\s*|\\breturn\\s+)${escapedName}\\s*\\(`,
    ).test(callerPrefix);
  });
}

function parameterBackedPerCaseProvenanceFinding(
  file: LlmSourceFile,
  objects: readonly BoundObject[],
  invocations: readonly ModelInvocation[],
): CejelLlmEvaluationFinding | null {
  const masked = maskJavaScriptNonCode(file.contents);
  for (const declaration of masked.matchAll(
    /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::[^{\n]+)?\s*\{/gm,
  )) {
    const functionName = declaration[1];
    if (
      !functionName ||
      /^(?:if|for|while|switch|catch|with)$/i.test(functionName)
    ) {
      continue;
    }
    const openBrace = declaration.index + declaration[0].lastIndexOf('{');
    const end = matchingDelimiter(masked, openBrace, '{', '}');
    if (end < 0) continue;
    const body = masked.slice(openBrace + 1, end);
    const parameters = (declaration[2] ?? '')
      .split(',')
      .map((parameter) => parameter.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1])
      .filter((parameter): parameter is string => Boolean(parameter));
    for (const root of parameters) {
      const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const returned = new RegExp(`\\breturn\\s+${escapedRoot}\\s*;?`).exec(body);
      if (!returned) continue;
      const returnIndex = openBrace + 1 + returned.index;
      if (!invocations.some(
        (invocation) =>
          invocation.index > openBrace &&
          invocation.index < returnIndex,
      )) {
        continue;
      }
      for (const candidate of objects) {
        if (candidate.index <= openBrace || candidate.index >= end) continue;
        const escapedCase = candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const push = new RegExp(
          `\\b${escapedRoot}(?:\\.[A-Za-z_$][\\w$]*|\\[[^\\]]+\\]){1,5}\\.push\\s*\\(\\s*${escapedCase}\\s*\\)`,
        ).exec(body);
        if (!push) continue;
        const pushIndex = openBrace + 1 + push.index;
        const properties = assignedProperties(
          file.contents,
          candidate.name,
          candidate.end,
          pushIndex,
        );
        const hasEvaluationIdentity = [...properties].some((property) =>
          /^(?:uuid|evaluationId|evaluationRunId|runId|caseId)$/i.test(property),
        );
        const resultPropertyCount = [...properties].filter((property) =>
          CASE_RESULT_KEY_PATTERN.test(property),
        ).length;
        if (!hasEvaluationIdentity || resultPropertyCount < 3) continue;
        const allProperties = new Set([...candidate.properties, ...properties]);
        if (hasAny(allProperties, LINEAGE_CONFIG_KEYS)) continue;
        return finding(
          'LLM-PRV-001',
          file,
          candidate.index,
          'info',
          'A parameter-backed evaluation collection retains per-case results without prompt/policy evaluation-configuration lineage.',
          'Per-case evaluation record stored without reproducible configuration provenance',
        );
      }
    }
  }
  return null;
}

function returnedCollectionProvenanceFinding(
  file: LlmSourceFile,
  objects: readonly BoundObject[],
  invocations: readonly ModelInvocation[],
): CejelLlmEvaluationFinding | null {
  const masked = maskJavaScriptNonCode(file.contents);
  const scopes = javaScriptFunctionScopes(masked);
  for (const scope of scopes) {
    if (!/(?:eval|evaluation|evaluator|judge|grader|score|benchmark|assess|metric)/i.test(
      scope.name,
    )) continue;
    const body = masked.slice(scope.start + 1, scope.end);
    for (const declaration of body.matchAll(
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:[^=\n]+)?\s*=\s*\[\s*\]\s*;?/g,
    )) {
      const collection = declaration[1];
      if (!collection) continue;
      const declarationIndex = scope.start + 1 + declaration.index;
      const escapedCollection = collection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const observable = new RegExp(
        `(?:\\breturn\\s+${escapedCollection}\\s*;?|\\b(?:writeFileSync|appendFileSync|Bun\\.write|console\\.(?:log|info))\\s*\\([\\s\\S]{0,500}?JSON\\.stringify\\s*\\(\\s*${escapedCollection}\\b)`,
      ).exec(masked.slice(declarationIndex, scope.end));
      if (!observable) continue;
      const observableIndex = declarationIndex + observable.index;
      if (!hasScopedInvocationBefore(file.contents, invocations, observableIndex)) continue;
      const scopeInvocations = invocations.filter(
        (invocation) =>
          invocation.index > scope.start &&
          invocation.index < observableIndex &&
          hasScopedInvocationBefore(file.contents, [invocation], observableIndex),
      );

      let properties: ReadonlySet<string> | null = null;
      let evidenceIndex = declarationIndex;
      for (const inlinePush of masked.slice(declarationIndex, observableIndex).matchAll(
        new RegExp(`\\b${escapedCollection}\\.push\\s*\\(\\s*\\{`, 'g'),
      )) {
        const pushIndex = declarationIndex + inlinePush.index;
        if (!scopeInvocations.some((invocation) => invocation.index < pushIndex)) continue;
        const objectStart = masked.indexOf('{', pushIndex);
        const objectEnd = matchingDelimiter(masked, objectStart, '{', '}');
        if (objectStart >= 0 && objectEnd >= 0 && objectEnd < observableIndex) {
          const candidateProperties = objectProperties(masked.slice(objectStart + 1, objectEnd));
          if (
            [...candidateProperties].some((property) =>
              DISCRETE_OUTCOME_KEY_PATTERN.test(property) ||
              CASE_RESULT_KEY_PATTERN.test(property)
            )
          ) {
            properties = candidateProperties;
            evidenceIndex = objectStart;
            break;
          }
        }
      }
      if (!properties) {
        for (const invocation of scopeInvocations) {
          const lineStart = masked.lastIndexOf('\n', invocation.index) + 1;
          const assignmentPrefix = masked.slice(lineStart, invocation.index);
          const alias = assignmentPrefix.match(
            /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:[A-Za-z_$][\w$.]*)?$/,
          )?.[1];
          if (!alias) continue;
          const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(
            `\\b${escapedCollection}\\.push\\s*\\(\\s*${escapedAlias}\\s*\\)`,
          ).test(masked.slice(invocation.index, observableIndex))) {
            properties = new Set(['result']);
            evidenceIndex = invocation.index;
            break;
          }
        }
      }
      if (!properties) {
        const candidate = objects.find((object) => {
          if (object.index <= declarationIndex || object.end >= observableIndex) return false;
          const escapedObject = object.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(
            `\\b${escapedCollection}\\.push\\s*\\(\\s*${escapedObject}\\s*\\)`,
          ).test(masked.slice(object.end, observableIndex));
        });
        if (candidate) {
          properties = new Set([
            ...candidate.properties,
            ...assignedProperties(file.contents, candidate.name, candidate.end, observableIndex),
          ]);
          evidenceIndex = candidate.index;
        }
      }
      if (!properties) continue;
      const collectionProperties = assignedProperties(
        file.contents,
        collection,
        declarationIndex + declaration[0].length,
        observableIndex,
      );
      const hasOutcome = [...properties].some((property) =>
        DISCRETE_OUTCOME_KEY_PATTERN.test(property) ||
        CASE_RESULT_KEY_PATTERN.test(property)
      );
      if (
        !hasOutcome ||
        hasAny(new Set([...properties, ...collectionProperties]), LINEAGE_CONFIG_KEYS)
      ) continue;
      return finding(
        'LLM-PRV-001',
        file,
        evidenceIndex,
        'info',
        'A local evaluation result collection is returned or persisted without immutable prompt, policy, or evaluation-configuration lineage.',
        'Evaluation result collection retained without reproducible configuration provenance',
      );
    }
  }
  return null;
}

/**
 * Covers two complete, local evaluation-result forms that do not compute an aggregate:
 * an identifier-bound discrete result that is emitted or returned, and an incrementally built
 * per-case result collection that is returned. It intentionally requires model/case/outcome
 * structure or explicit per-case lineage and never infers provenance from an arbitrary object.
 */
export function detectBoundedEvaluationResultProvenance(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  const findings: CejelLlmEvaluationFinding[] = [];
  for (const file of files) {
    if (!completeLocalSource(file) || !hasSupportedEvaluationImport(file)) continue;
    const invocations = modelInvocations(file.contents);
    if (invocations.length === 0) continue;
    const findingsBeforeFile = findings.length;
    const objects = boundObjectLiterals(file.contents);
    let found = false;

    for (const object of objects) {
      const emissionIndex = resolvedIdentifierEmissionOrReturnIndex(
        file.contents,
        object.name,
        object.end,
      );
      if (
        emissionIndex === null ||
        !hasLocalOrResolvedHelperInvocationBefore(file.contents, invocations, emissionIndex)
      ) {
        continue;
      }
      const hasModel = hasAny(object.properties, LINEAGE_MODEL_KEYS);
      const hasCase = [...object.properties].some((property) =>
        DISCRETE_CASE_KEY_PATTERN.test(property),
      );
      const outcomeCount = [...object.properties].filter((property) =>
        DISCRETE_OUTCOME_KEY_PATTERN.test(property),
      ).length;
      const hasConfiguration = hasAny(object.properties, LINEAGE_CONFIG_KEYS);
      if (!hasModel || !hasCase || outcomeCount < 2 || hasConfiguration) continue;
      findings.push(
        finding(
          'LLM-PRV-001',
          file,
          configurationInputLocus(file.contents, object.index) ?? object.index,
          'info',
          'A locally emitted discrete LLM evaluation result does not retain prompt/policy evaluation-configuration lineage.',
          'Discrete evaluation result emitted without reproducible configuration provenance',
        ),
      );
      found = true;
      break;
    }
    if (found) continue;

    for (const root of objects) {
      const rootProperties = assignedProperties(file.contents, root.name, root.end);
      const hasEvaluationIdentity = [...rootProperties].some((property) =>
        /^(?:evaluationId|evaluationRunId|runId|datasetId)$/i.test(property),
      );
      if (!hasEvaluationIdentity) continue;
      const collection = [...rootProperties].find((property) =>
        CASE_COLLECTION_KEY_PATTERN.test(property),
      );
      if (!collection) continue;
      const escapedRoot = root.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedCollection = collection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`\\b${escapedRoot}\\.${escapedCollection}\\s*=\\s*\\[\\s*\\]`).test(
        maskJavaScriptNonCode(file.contents),
      )) continue;
      const emissionIndex = resolvedIdentifierEmissionOrReturnIndex(
        file.contents,
        root.name,
        root.end,
      );
      if (
        emissionIndex === null ||
        !hasLocalOrResolvedHelperInvocationBefore(file.contents, invocations, emissionIndex)
      ) {
        continue;
      }

      const perCase = objects.find((candidate) => {
        if (candidate.index <= root.index) return false;
        const properties = assignedProperties(file.contents, candidate.name, candidate.end);
        const resultPropertyCount = [...properties].filter((property) =>
          CASE_RESULT_KEY_PATTERN.test(property),
        ).length;
        if (resultPropertyCount < 3) return false;
        const escapedCase = candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(
          `\\b${escapedRoot}\\.${escapedCollection}(?:\\[[^\\]]+\\])?(?:\\.[A-Za-z_$][\\w$]*)?\\.push\\s*\\(\\s*${escapedCase}\\s*\\)`,
        ).test(maskJavaScriptNonCode(file.contents));
      });
      if (!perCase) continue;
      const allProperties = new Set([
        ...rootProperties,
        ...assignedProperties(file.contents, perCase.name, perCase.end),
      ]);
      if (hasAny(allProperties, LINEAGE_CONFIG_KEYS)) continue;
      findings.push(
        finding(
          'LLM-PRV-001',
          file,
          perCase.index,
          'info',
          'A locally returned per-case LLM evaluation result does not retain prompt/policy evaluation-configuration lineage.',
          'Per-case evaluation results returned without reproducible configuration provenance',
        ),
      );
      break;
    }
    if (findings.length > findingsBeforeFile) continue;

    const parameterBacked = parameterBackedPerCaseProvenanceFinding(
      file,
      objects,
      invocations,
    );
    if (parameterBacked) {
      findings.push(parameterBacked);
      continue;
    }
    const returnedCollection = returnedCollectionProvenanceFinding(
      file,
      objects,
      invocations,
    );
    if (returnedCollection) findings.push(returnedCollection);
  }
  return findings;
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

function detectMissingProvenanceIncludingBoundedResults(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  const aggregateFindings = detectMissingProvenance(files);
  const aggregatePaths = new Set(aggregateFindings.map((item) => item.evidence.path));
  return [
    ...aggregateFindings,
    ...detectBoundedEvaluationResultProvenance(files).filter(
      (item) => !aggregatePaths.has(item.evidence.path),
    ),
    ...files.flatMap((file) => detectPythonMissingEvaluationProvenance(file)),
  ];
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
  for (const index of supportedEvaluationHttpInvocationIndices(contents)) {
    if (!invocations.some((invocation) => invocation.index === index)) {
      invocations.push({ index, identity: null, judge: false });
    }
  }
  for (const index of supportedLangChainEvaluationInvocationIndices(contents)) {
    if (!invocations.some((invocation) => invocation.index === index)) {
      invocations.push({ index, identity: null, judge: true });
    }
  }
  invocations.sort((left, right) => left.index - right.index);
  return invocations;
}

function detectSoleSelfJudge(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  const findings: CejelLlmEvaluationFinding[] = [];
  for (const file of files) {
    if (!completeLocalSource(file) || !hasSupportedEvaluationImport(file)) continue;
    if (hasIndependentAcceptanceSignal(file)) continue;
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

function detectSoleSelfJudgeAcrossLanguages(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  return [
    ...detectSoleSelfJudge(files),
    ...files.flatMap((file) => detectPythonConfiguredSelfJudge(file)),
  ];
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

function hasProvenanceEvaluationSurface(files: readonly LlmSourceFile[]): boolean {
  return (
    hasAggregateEvaluationSurface(files) ||
    detectBoundedEvaluationResultProvenance(files).length > 0 ||
    files.some((file) => detectPythonMissingEvaluationProvenance(file).length > 0)
  );
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
  }) || files.some((file) => detectPythonConfiguredSelfJudge(file).length > 0);
}

export const CEJEL_LLM_EVALUATION_RULES: readonly LlmEvaluationRuleDefinition[] = [
  {
    id: 'LLM-PRV-001',
    title: 'Declared evaluation lacks reproducible system provenance',
    detectorConfidence: 'high',
    evidenceContract:
      'A recognized direct or locally called-helper model invocation precedes a complete local evaluation result that is emitted or returned while lacking model or prompt/policy evaluation-configuration lineage. Recognized invocations include import-resolved SDK calls, a complete authenticated OpenAI-compatible REST request, and a complete local Flowise evaluation request. Supported results are aggregate-to-emitter paths, identifier-bound discrete results with model/case/outcome fields, and incrementally built per-case collections with an evaluation identity and resolved return.',
    exclusions: [
      'External or dynamically assembled result reporters',
      'Exploratory code without a locally emitted or returned evaluation result',
      'Generic returned objects and model metadata without declared case/outcome semantics',
      'Generic HTTP requests and model helpers not observably called by the result-producing scope',
      'Tests, examples, fixtures, documentation, generated code, and unresolved paths',
    ],
    applies: hasProvenanceEvaluationSurface,
    detect: detectMissingProvenanceIncludingBoundedResults,
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
      'Exactly one local producer and one explicit model-assisted judge resolve to the same literal model identity, a result is locally emitted, and no observable independent review signal participates in evaluation acceptance or gating.',
    exclusions: [
      'Unresolved or provider-managed model identities',
      'Distinct judge models and locally declared independent adjudication',
      'Tests, examples, fixtures, documentation, generated code, and unresolved paths',
    ],
    applies: hasModelJudgeSurface,
    detect: detectSoleSelfJudgeAcrossLanguages,
  },
];

export function detectCejelLlmEvaluationRules(
  files: readonly LlmSourceFile[],
): readonly CejelLlmEvaluationFinding[] {
  return CEJEL_LLM_EVALUATION_RULES.flatMap((rule) => rule.detect(files));
}
