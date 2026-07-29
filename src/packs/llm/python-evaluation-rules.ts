import { isExcludedLlmSourcePath, maskPythonNonCode } from './lexical.js';
import type { CejelLlmEvaluationFinding } from './evaluation-rules.js';
import type { LlmSourceFile } from './rules.js';

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split('\n').length;
}

function escaped(identifier: string): string {
  return identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface PythonClassBlock {
  readonly index: number;
  readonly end: number;
  readonly name: string;
  readonly contents: string;
}

function pythonIndentedBlockEnd(masked: string, declarationEnd: number, indentation: number): number {
  const firstBodyLine = masked.indexOf('\n', declarationEnd);
  if (firstBodyLine < 0) return masked.length;
  const lines = masked.slice(firstBodyLine + 1).matchAll(/^([ \t]*)(\S.*)$/gm);
  for (const line of lines) {
    if ((line[1]?.length ?? 0) <= indentation) {
      return firstBodyLine + 1 + line.index;
    }
  }
  return masked.length;
}

function pythonClassBlocks(masked: string): readonly PythonClassBlock[] {
  const declarations = [...masked.matchAll(
    /^([ \t]*)class\s+[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*:/gm,
  )];
  return declarations.map((declaration) => {
    const indentation = declaration[1]?.length ?? 0;
    const end = pythonIndentedBlockEnd(
      masked,
      declaration.index + declaration[0].length,
      indentation,
    );
    return {
      index: declaration.index,
      end,
      name: declaration[0].match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? '',
      contents: masked.slice(declaration.index, end),
    };
  });
}

interface PythonFunctionBlock {
  readonly index: number;
  readonly end: number;
  readonly name: string;
  readonly contents: string;
  readonly contextName: string;
}

const EVALUATOR_CONTEXT_PATTERN =
  /(?:eval|evaluation|evaluator|judge|judg|grade|grader|grading|score|scoring|benchmark|assess|metric)/i;
// The component identifier (the segment tested against PYTHON_JUDGE_COMPONENT_PATTERN below) is
// captured as a single plain identifier -- not as a nested optional-prefix/keyword/optional-suffix
// alternation -- specifically to avoid quadratic backtracking on long non-matching identifier
// chains. Whether a matched identifier actually qualifies is decided afterward in JS via
// PYTHON_JUDGE_COMPONENT_PATTERN.test(...), not by the shape of this regex.
const PYTHON_MODEL_OR_JUDGE_CALL_PATTERN =
  /\b(?:(?:[A-Za-z_][A-Za-z0-9_]*\.)*(?:responses\.create|chat\.completions\.create|messages\.create)|(?:[A-Za-z_][A-Za-z0-9_]*\.)*([A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*\.(?:invoke|ainvoke|predict|apredict|complete|acomplete|generate|agenerate|evaluate|aevaluate|judge|grade|score|run|arun)|(?:self\.)?_?(?:evaluate|judge|grade)(?:_[A-Za-z_][A-Za-z0-9_]*)?)\s*\(/g;
// Tested only against the short, already-captured component identifier (group 1 above), never
// against the whole file -- anchored to underscore/start/end boundaries so a component must
// contain one of these words as a whole delimited segment, not an arbitrary substring.
const PYTHON_JUDGE_COMPONENT_PATTERN =
  /(?:^|_)(?:llm|model|judge|grader|evaluator|generator|metrics_manager)(?:_|$)/i;
const PYTHON_RESULT_KEY_PATTERN =
  /^(?:score|scores|verdict|result|results|metric|metrics|passed|correct|status|output|actualoutput|judgment|judgement|grade|accuracy)$/i;
const PYTHON_CONFIG_LINEAGE_KEY_PATTERN =
  /^(?:promptdigest|prompthash|promptid|promptversion|policydigest|policyhash|policyid|policyversion|configdigest|confighash|configid|configversion|evaluationconfigversion|evaluationmanifest|repositorycommit)$/i;
const PYTHON_AGGREGATE_ASSIGNMENT_PATTERN =
  /^[ \t]*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\[[^\]\n]+\])?)\s*(?::[^=\n]+)?=\s*([^\n]+)$/gm;
// Anchored to underscore/start/end boundaries so e.g. "moderate_count" (containing "rate" as a
// mid-word substring) does not qualify as an aggregate name.
const PYTHON_AGGREGATE_NAME_PATTERN =
  /(?:^|_)(?:rate|score|accuracy|average|mean|percentage|pct)s?(?:_|$)/i;
const PYTHON_DENOMINATOR_DIVISION_PATTERN = /\/\s*len\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/;
const PYTHON_DENOMINATOR_CALL_PATTERN =
  /\b(?:statistics\.mean|np\.mean|numpy\.mean|mean)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/;
const PYTHON_DENOMINATOR_KEY_PATTERN =
  /^(?:eligibletotal|eligiblecount|totalcases|totalcount|denominator|caseresults|rawresults|results)$/i;
const PYTHON_OUTCOME_COUNT_KEY_PATTERN =
  /^(?:error|errors|refusal|refusals|abstention|abstentions|excluded|exclusions|excludedcount)$/i;

function pythonFunctionBlocks(
  masked: string,
  classes: readonly PythonClassBlock[],
): readonly PythonFunctionBlock[] {
  const declarations = [...masked.matchAll(
    /^([ \t]*)(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)(?:\s*->[^:]+)?\s*:/gm,
  )];
  return declarations.map((declaration) => {
    const indentation = declaration[1]?.length ?? 0;
    const end = pythonIndentedBlockEnd(
      masked,
      declaration.index + declaration[0].length,
      indentation,
    );
    const owner = classes
      .filter((candidate) => declaration.index > candidate.index && declaration.index < candidate.end)
      .sort((left, right) => right.index - left.index)[0];
    return {
      index: declaration.index,
      end,
      name: declaration[2] ?? '',
      contents: masked.slice(declaration.index, end),
      contextName: `${owner?.name ?? ''}.${declaration[2] ?? ''}`,
    };
  });
}

function matchingBrace(masked: string, start: number): number {
  let depth = 0;
  for (let index = start; index < masked.length; index += 1) {
    if (masked[index] === '{') depth += 1;
    if (masked[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchingParenthesis(masked: string, start: number): number {
  let depth = 0;
  for (let index = start; index < masked.length; index += 1) {
    if (masked[index] === '(') depth += 1;
    if (masked[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function observablePythonResultIndex(
  masked: string,
  identifier: string,
  after: number,
  persistedOnly = false,
): number | null {
  const name = escaped(identifier);
  const tail = masked.slice(after);
  let persistedIndex: number | null = null;
  for (const call of tail.matchAll(
    /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/g,
  )) {
    const callee = call[1];
    if (!callee || !/(?:store|save|log|write|record)/i.test(callee)) continue;
    const callStart = tail.indexOf('(', call.index);
    const callEnd = matchingParenthesis(tail, callStart);
    if (callStart < 0 || callEnd < 0) continue;
    if (new RegExp(`\\b${name}\\b`).test(tail.slice(callStart + 1, callEnd))) {
      persistedIndex = after + call.index;
      break;
    }
  }
  if (persistedOnly) return persistedIndex;
  const returned = new RegExp(`\\breturn\\s+${name}\\b`).exec(tail);
  const returnedIndex = returned ? after + returned.index : null;
  if (persistedIndex === null) return returnedIndex;
  if (returnedIndex === null) return persistedIndex;
  return Math.min(persistedIndex, returnedIndex);
}

function observablePythonResultEnd(masked: string, observableIndex: number): number {
  const callStart = masked.indexOf('(', observableIndex);
  const lineEnd = masked.indexOf('\n', observableIndex);
  if (callStart >= 0 && (lineEnd < 0 || callStart < lineEnd)) {
    const callEnd = matchingParenthesis(masked, callStart);
    if (callEnd >= 0) return callEnd + 1;
  }
  return lineEnd < 0 ? masked.length : lineEnd;
}

function normalizedPythonKeys(expression: string): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const match of expression.matchAll(
    /(?:^|[{,(]\s*)?(?:['"]([A-Za-z_][A-Za-z0-9_]*)['"]|([A-Za-z_][A-Za-z0-9_]*))\s*(?=:|=)/g,
  )) {
    const key = match[1] ?? match[2];
    if (key) keys.add(key.replaceAll('_', '').toLowerCase());
  }
  return keys;
}

function pythonStructuredResultExpressions(
  file: LlmSourceFile,
  block: PythonFunctionBlock,
): readonly { readonly index: number; readonly keys: ReadonlySet<string> }[] {
  const results: { index: number; keys: ReadonlySet<string> }[] = [];
  const original = file.contents.slice(block.index, block.end);
  const masked = block.contents;
  const bound = new Map<string, { index: number; keys: ReadonlySet<string> }>();

  for (const assignment of masked.matchAll(
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(\{|[A-Za-z_][A-Za-z0-9_]*(?:Result|Record|Metrics?)\s*\()/gm,
  )) {
    const identifier = assignment[1];
    const expressionStart = assignment.index + assignment[0].lastIndexOf(assignment[2] ?? '');
    if (!identifier || expressionStart < assignment.index) continue;
    const opener = masked[expressionStart];
    let expressionEnd = -1;
    if (opener === '{') {
      expressionEnd = matchingBrace(masked, expressionStart);
    } else {
      const callStart = masked.indexOf('(', expressionStart);
      let depth = 0;
      for (let index = callStart; index >= 0 && index < masked.length; index += 1) {
        if (masked[index] === '(') depth += 1;
        if (masked[index] === ')') {
          depth -= 1;
          if (depth === 0) {
            expressionEnd = index;
            break;
          }
        }
      }
    }
    if (expressionEnd < 0) continue;
    const observableIndex = observablePythonResultIndex(masked, identifier, expressionEnd + 1);
    if (observableIndex === null) continue;
    const observableTail = masked.slice(
      expressionEnd + 1,
      observablePythonResultEnd(masked, observableIndex),
    );
    const propertyMatches = [...observableTail.matchAll(
      new RegExp(`\\b${escaped(identifier)}\\.([A-Za-z_][A-Za-z0-9_]*)`, 'g'),
    )];
    const lineageMatches = [...observableTail.matchAll(
      /\b(prompt_digest|prompt_hash|prompt_id|prompt_version|policy_digest|policy_hash|policy_id|policy_version|config_digest|config_hash|config_id|config_version|evaluation_config_version|evaluation_manifest|repository_commit)\b/gi,
    )];
    const keys = new Set([
      ...normalizedPythonKeys(original.slice(expressionStart, expressionEnd + 1)),
      ...propertyMatches
        .map((property) => property[1])
        .filter((property): property is string => Boolean(property))
        .map((property) => property.replaceAll('_', '').toLowerCase()),
      ...lineageMatches
        .map((lineage) => lineage[1])
        .filter((lineage): lineage is string => Boolean(lineage))
        .map((lineage) => lineage.replaceAll('_', '').toLowerCase()),
    ]);
    const outcomeMutation = propertyMatches.find((property) =>
      PYTHON_RESULT_KEY_PATTERN.test(
        (property[1] ?? '').replaceAll('_', '').toLowerCase(),
      )
    );
    const persistenceIndex = observablePythonResultIndex(
      masked,
      identifier,
      expressionEnd + 1,
      true,
    );
    bound.set(identifier, {
      index: block.index + (
        persistenceIndex ??
        (outcomeMutation ? expressionEnd + 1 + outcomeMutation.index : expressionStart)
      ),
      keys,
    });
  }

  for (const result of bound.values()) results.push(result);

  for (const direct of masked.matchAll(
    /(?:\b(?:return|json\.dump|[A-Za-z_][A-Za-z0-9_.]*(?:append|save|store|record|write|insert|log|info))\s*(?:\([^{}\n]{0,240})?\s*\{|\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]\n]{1,100}\]){1,4}\s*=\s*\{)/g,
  )) {
    const brace = masked.indexOf('{', direct.index);
    const end = brace < 0 ? -1 : matchingBrace(masked, brace);
    if (end < 0) continue;
    results.push({
      index: block.index + brace,
      keys: normalizedPythonKeys(original.slice(brace, end + 1)),
    });
  }

  const mutatedRoots = new Map<
    string,
    {
      index: number;
      mutations: { readonly index: number; readonly key: string }[];
    }
  >();
  for (const mutation of masked.matchAll(
    /\b((?:self\.)?[A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]\n]+\]\s*=|\.(?:append|extend|add|update)\s*\()/g,
  )) {
    const root = mutation[1];
    const property = mutation[2];
    if (!root || !property) continue;
    const current = mutatedRoots.get(root) ?? {
      index: block.index + mutation.index,
      mutations: [],
    };
    current.mutations.push({
      index: mutation.index,
      key: property.replaceAll('_', '').toLowerCase(),
    });
    mutatedRoots.set(root, current);
  }
  for (const [root, result] of mutatedRoots) {
    const localStart = result.index - block.index;
    const observableIndex = observablePythonResultIndex(
      masked,
      root,
      localStart,
    );
    if (observableIndex === null) continue;
    const observableEnd = observablePythonResultEnd(masked, observableIndex);
    const keys = new Set(
      result.mutations
        .filter((mutation) => mutation.index < observableEnd)
        .map((mutation) => mutation.key),
    );
    const persistenceIndex = observablePythonResultIndex(
      masked,
      root,
      localStart,
      true,
    );
    for (const lineage of masked.slice(localStart, observableEnd).matchAll(
      /\b(prompt_digest|prompt_hash|prompt_id|prompt_version|policy_digest|policy_hash|policy_id|policy_version|config_digest|config_hash|config_id|config_version|evaluation_config_version|evaluation_manifest|repository_commit)\b/gi,
    )) {
      if (lineage[1]) keys.add(lineage[1].replaceAll('_', '').toLowerCase());
    }
    results.push({
      keys,
      index: persistenceIndex === null ? result.index : block.index + persistenceIndex,
    });
  }
  return results;
}

/**
 * Detects bounded Python evaluation results whose local evaluator/judge scope both invokes a
 * recognized model/judge operation and returns or persists a structured result without immutable
 * prompt, policy, or configuration lineage. Model identity alone is deliberately not sufficient.
 */
export function detectPythonMissingEvaluationProvenance(
  file: LlmSourceFile,
): readonly CejelLlmEvaluationFinding[] {
  if (!file.path.toLowerCase().endsWith('.py') || isExcludedLlmSourcePath(file.path)) return [];
  const masked = maskPythonNonCode(file.contents);
  const classes = pythonClassBlocks(masked);
  const blocks = pythonFunctionBlocks(masked, classes);
  for (const block of blocks) {
    if (!EVALUATOR_CONTEXT_PATTERN.test(block.contextName)) continue;
    const nestedBlocks = blocks.filter(
      (candidate) => candidate.index > block.index && candidate.end <= block.end,
    );
    const invocations = [...block.contents.matchAll(PYTHON_MODEL_OR_JUDGE_CALL_PATTERN)]
      .filter((invocation) => (
        invocation[1] === undefined || PYTHON_JUDGE_COMPONENT_PATTERN.test(invocation[1])
      ))
      .filter((invocation) => {
        const lineStart = block.contents.lastIndexOf('\n', invocation.index) + 1;
        return (
          !/\bdef\s*$/.test(block.contents.slice(lineStart, invocation.index)) &&
          !/(?:similarity|embedding|encoder|classifier|rerank)/i.test(invocation[0])
        );
      })
      .filter((invocation) => !nestedBlocks.some((nested) => {
        const absoluteIndex = block.index + invocation.index;
        return absoluteIndex > nested.index && absoluteIndex < nested.end;
      }));
    if (invocations.length === 0) continue;
    for (const result of pythonStructuredResultExpressions(file, block).filter(
      (candidate) => !nestedBlocks.some(
        (nested) => candidate.index > nested.index && candidate.index < nested.end,
      ),
    )) {
      if (!invocations.some((invocation) =>
        block.index + invocation.index < result.index
      )) continue;
      const hasOutcome = [...result.keys].some((key) => PYTHON_RESULT_KEY_PATTERN.test(key));
      const hasConfiguration = [...result.keys].some((key) =>
        PYTHON_CONFIG_LINEAGE_KEY_PATTERN.test(key)
      );
      if (!hasOutcome || hasConfiguration) continue;
      return [{
        ruleId: 'LLM-PRV-001',
        severity: 'info',
        confidence: 'high',
        summary:
          'A Python evaluator returns or persists a structured model result without immutable prompt, policy, or evaluation-configuration lineage.',
        evidence: {
          path: file.path,
          line: lineNumberAt(file.contents, result.index),
          label: 'Structured evaluation result retained without reproducible configuration provenance',
        },
      }];
    }
  }
  return [];
}

interface PythonAggregateAssignment {
  readonly index: number;
  readonly denominatorCollections: ReadonlySet<string>;
}

function pythonAggregateAssignmentsIn(
  masked: string,
): ReadonlyMap<string, PythonAggregateAssignment> {
  const assignments = new Map<string, PythonAggregateAssignment>();
  for (const match of masked.matchAll(PYTHON_AGGREGATE_ASSIGNMENT_PATTERN)) {
    const target = match[1];
    const expression = match[2];
    if (!target || !expression) continue;
    const staticSubscript = target.match(
      /\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]$/,
    )?.[2];
    const withoutSubscript = target.replace(/\[[^\]\n]+\]$/, '');
    const leaf = staticSubscript ?? withoutSubscript.split('.').at(-1);
    if (!leaf || !PYTHON_AGGREGATE_NAME_PATTERN.test(leaf)) continue;
    const division = PYTHON_DENOMINATOR_DIVISION_PATTERN.exec(expression);
    const call = PYTHON_DENOMINATOR_CALL_PATTERN.exec(expression);
    if (!division && !call) continue;
    const denominatorCollections = new Set<string>();
    if (division?.[1]) denominatorCollections.add(division[1]);
    if (call?.[1]) denominatorCollections.add(call[1]);
    assignments.set(leaf, { index: match.index, denominatorCollections });
  }
  return assignments;
}

/**
 * Detects a Python evaluation aggregate (an average/rate/accuracy computed by dividing by a case
 * collection's length, or by a statistics/numpy mean call) that reaches a structured result
 * emission without its eligible-case denominator or raw per-case results. Mirrors the JS/TS
 * detectMissingDenominator detector using the same structured-result-expression primitive PRV-001
 * already relies on, so an aggregate silently computed over a shrunk collection (e.g. after
 * dropping errored cases) is not reported as if it covered every eligible case.
 */
export function detectPythonMissingDenominator(
  file: LlmSourceFile,
): readonly CejelLlmEvaluationFinding[] {
  if (!file.path.toLowerCase().endsWith('.py') || isExcludedLlmSourcePath(file.path)) return [];
  const masked = maskPythonNonCode(file.contents);
  const classes = pythonClassBlocks(masked);
  const blocks = pythonFunctionBlocks(masked, classes);
  const findings: CejelLlmEvaluationFinding[] = [];
  for (const block of blocks) {
    if (!EVALUATOR_CONTEXT_PATTERN.test(block.contextName)) continue;
    const nestedBlocks = blocks.filter(
      (candidate) => candidate.index > block.index && candidate.end <= block.end,
    );
    const aggregates = pythonAggregateAssignmentsIn(block.contents);
    if (aggregates.size === 0) continue;
    const invocations = [...block.contents.matchAll(PYTHON_MODEL_OR_JUDGE_CALL_PATTERN)]
      .filter((invocation) => (
        invocation[1] === undefined || PYTHON_JUDGE_COMPONENT_PATTERN.test(invocation[1])
      ))
      .filter((invocation) => {
        const lineStart = block.contents.lastIndexOf('\n', invocation.index) + 1;
        return !/\bdef\s*$/.test(block.contents.slice(lineStart, invocation.index));
      })
      .filter((invocation) => !nestedBlocks.some((nested) => {
        const absoluteIndex = block.index + invocation.index;
        return absoluteIndex > nested.index && absoluteIndex < nested.end;
      }));
    if (invocations.length === 0) continue;
    for (const result of pythonStructuredResultExpressions(file, block).filter(
      (candidate) => !nestedBlocks.some(
        (nested) => candidate.index > nested.index && candidate.index < nested.end,
      ),
    )) {
      const emittedAggregates = [...aggregates].filter(([name]) => result.keys.has(
        name.replaceAll('_', '').toLowerCase(),
      ));
      if (emittedAggregates.length === 0) continue;
      const firstAggregateIndex = Math.min(
        ...emittedAggregates.map(([, assignment]) => assignment.index),
      );
      if (!invocations.some((invocation) => invocation.index < firstAggregateIndex)) continue;
      if ([...result.keys].some((key) => PYTHON_DENOMINATOR_KEY_PATTERN.test(key))) continue;
      const aggregateKeyNames = new Set(
        emittedAggregates.map(([name]) => name.replaceAll('_', '').toLowerCase()),
      );
      const nonAggregateKeys = [...result.keys].filter((key) => !aggregateKeyNames.has(key));
      if (
        nonAggregateKeys.length > 0 &&
        nonAggregateKeys.every((key) => PYTHON_OUTCOME_COUNT_KEY_PATTERN.test(key))
      ) continue;
      findings.push({
        ruleId: 'LLM-EVL-001',
        severity: 'warning',
        confidence: 'high',
        summary:
          'A locally computed Python evaluation aggregate is emitted without its eligible-case denominator or raw case-level results.',
        evidence: {
          path: file.path,
          line: lineNumberAt(file.contents, result.index),
          label: 'Evaluation aggregate emitted without reproducible denominator',
        },
      });
    }
  }
  return findings;
}

/**
 * Detects a complete same-instance Python self-judge path: the judge configuration falls back to
 * the producer configuration, both aliases are stored on the instance and invoked, and a judge
 * verdict is retained on the completed result. This helper is deliberately separate from the
 * Python direct rules so repository-level orchestration can integrate it without broadening them.
 */
export function detectPythonConfiguredSelfJudge(
  file: LlmSourceFile,
): readonly CejelLlmEvaluationFinding[] {
  if (!file.path.toLowerCase().endsWith('.py') || isExcludedLlmSourcePath(file.path)) return [];
  const masked = maskPythonNonCode(file.contents);

  for (const classBlock of pythonClassBlocks(masked)) {
    const classContents = classBlock.contents;
    for (const alias of classContents.matchAll(
      /\bif\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+None\s*:\s*\n[ \t]+\1\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/gi,
    )) {
      const judgeParameter = alias[1];
      const producerParameter = alias[2];
      if (!judgeParameter || !producerParameter) continue;
      if (!/judge/i.test(judgeParameter) || !/(?:llm|model)/i.test(producerParameter)) {
        continue;
      }
      const invokedAssignment = (parameter: string): string | undefined =>
        [...classContents.matchAll(
          new RegExp(
            `\\bself\\.([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${escaped(parameter)}\\b`,
            'gi',
          ),
        )]
          .map((candidate) => candidate[1])
          .find((attribute) =>
            Boolean(attribute) &&
            new RegExp(
              `\\bself\\.${escaped(attribute ?? '')}\\.(?:ainvoke|invoke|acomplete|complete)\\s*\\(`,
            ).test(classContents),
          );
      const judgeAttribute = invokedAssignment(judgeParameter);
      const producerAttribute = invokedAssignment(producerParameter);
      if (!judgeAttribute || !producerAttribute || judgeAttribute === producerAttribute) continue;
      if (!/judge/i.test(judgeAttribute)) continue;

      const judgeInvoked = new RegExp(
        `\\bself\\.${escaped(judgeAttribute)}\\.(?:ainvoke|invoke|acomplete|complete)\\s*\\(`,
      ).test(classContents);
      const producerInvoked = new RegExp(
        `\\bself\\.${escaped(producerAttribute)}\\.(?:ainvoke|invoke|acomplete|complete)\\s*\\(`,
      ).test(classContents);
      if (!judgeInvoked || !producerInvoked) continue;

      const verdictAssignment = [...classContents.matchAll(
        /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*await\s+self\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi,
      )].find((candidate) => /judge/i.test(candidate[2] ?? ''));
      const verdictIdentifier = verdictAssignment?.[1];
      if (!verdictIdentifier || verdictAssignment.index === undefined) continue;
      const verdictTailWithLaterMethods = classContents.slice(
        verdictAssignment.index + verdictAssignment[0].length,
      );
      const nextMethod = /\n[ \t]+(?:async\s+)?def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.exec(
        verdictTailWithLaterMethods,
      );
      const verdictTail = nextMethod
        ? verdictTailWithLaterMethods.slice(0, nextMethod.index)
        : verdictTailWithLaterMethods;
      const directlyRetainedVerdict = new RegExp(
        `\\bself\\.[A-Za-z_][A-Za-z0-9_.\\[\\]-]*\\.(?:judgement|judgment|verdict|judge_result)\\s*=\\s*${escaped(verdictIdentifier)}\\b`,
        'i',
      ).test(verdictTail);
      const retainedThroughLocalResult = [...verdictTail.matchAll(
        /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*self\.[A-Za-z_][A-Za-z0-9_.\[\]-]*/g,
      )].some((resultAlias) =>
        Boolean(resultAlias[1]) &&
        new RegExp(
          `\\b${escaped(resultAlias[1] ?? '')}\\.(?:judgement|judgment|verdict|judge_result)\\s*=\\s*${escaped(verdictIdentifier)}\\b`,
          'i',
        ).test(verdictTail),
      );
      const retainedVerdict = directlyRetainedVerdict || retainedThroughLocalResult;
      if (!retainedVerdict) continue;

      const completionMatch = [...classContents.matchAll(
        /\bif\s+self\.[A-Za-z_][A-Za-z0-9_.]*use_judge[A-Za-z0-9_]*\s*:\s*\n[ \t]+await\s+self\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi,
      )].at(-1);
      const completionJudge = Boolean(
        completionMatch?.[1] && /judge/i.test(completionMatch[1]),
      );
      if (!completionJudge) continue;
      const completionIndex = completionMatch?.index;
      if (completionIndex === undefined) continue;

      return [{
        ruleId: 'LLM-EVL-002',
        severity: 'warning',
        confidence: 'high',
        summary:
          'A Python evaluation instance defaults its judge to the producer model and retains that judge verdict as the completed result without an independently configured judge.',
        evidence: {
          path: file.path,
          line: lineNumberAt(
            file.contents,
            classBlock.index + completionIndex,
          ),
          label: 'Configured judge aliases the producer model through completion',
        },
      }];
    }
  }
  return [];
}
