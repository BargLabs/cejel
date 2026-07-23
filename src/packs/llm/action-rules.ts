import type { LlmSourceFile } from './rules.js';
import type { CejelLlmConfidence, CejelLlmFinding } from './types.js';
import { supportedJavaScriptModelCallIndices } from './javascript-integrations.js';
import { maskPythonNonCode } from './lexical.js';

export type LlmActionRuleId = 'LLM-VAL-001' | 'LLM-AGY-001';

export interface LlmActionRuleDefinition {
  readonly id: LlmActionRuleId;
  readonly title: string;
  readonly detectorConfidence: CejelLlmConfidence;
  readonly evidenceContract: string;
  readonly exclusions: readonly string[];
  applies(file: LlmSourceFile): boolean;
  detect(file: LlmSourceFile): readonly CejelLlmFinding[];
}

const MODEL_OUTPUT_PATTERN =
  /(?:\.output_text\b|\.choices\s*\[[^\]]+\]\s*\.message\s*\.content\b|\.content\s*\[[^\]]+\]\s*\.text\b)/;
const IDENTIFIER_ASSIGNMENT_PATTERN =
  /^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?!=)(.+)$/;
const STRUCTURED_PARSE_PATTERN = /\bJSON\.parse\s*\(([^)]*)\)/;
const RUNTIME_PARSE_PATTERN =
  /\b[A-Za-z_$][\w$]*(?:Schema|schema)\s*(?:\.strict\s*\(\s*\))?\.parse\s*\(/;
const CONSEQUENTIAL_DISPATCH_PATTERN =
  /\b(?:deploy|execute|executeAction|runCommand|transferFunds|sendPayment|grantAccess|revokeAccess|updateRole|deleteFile|deleteRecord|writeFile|sendEmail|sendMessage|publish)\s*\(/;

const TOOL_ASSIGNMENT_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:tool|defineTool|createTool)\s*\(/g;
const MEMBER_TOOL_REGISTRATION_PATTERN =
  /\b([A-Za-z_$][\w$]*)\.registerTool\s*\(/g;
const APPROVAL_FAIL_CLOSED_PATTERN =
  /if\s*\(\s*!\s*\(?\s*(?:await\s+)?(?:requestApproval|requireApproval|humanApproval|approvalGate|waitForApproval)\s*\([^)]*\)\s*\)?\s*\)\s*(?:\{\s*)?(?:throw\b|return\b)/s;
const ALLOWLIST_FAIL_CLOSED_PATTERN =
  /if\s*\(\s*!\s*[A-Za-z_$][\w$]*(?:ALLOWLIST|ALLOW_LIST|ALLOWED|PERMITTED)[A-Za-z0-9_$]*\s*\.(?:includes|has)\s*\([^)]*\)\s*\)\s*(?:\{\s*)?(?:throw\b|return\b)/s;

function isExcludedSourcePath(path: string): boolean {
  return /(?:^|\/)(?:__tests__|test|tests|fixtures?|examples?|vendor|generated)(?:\/|$)/i.test(path) ||
    /\.(?:test|spec|fixture)\.[cm]?[jt]sx?$/i.test(path) ||
    /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i.test(path);
}

/** Masks comments and string literals while preserving offsets and newlines. */
function maskNonCode(contents: string): string {
  const chars = [...contents];
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < chars.length; index += 1) {
    const character = chars[index] ?? '';
    const next = chars[index + 1] ?? '';
    if (lineComment) {
      if (character === '\n') lineComment = false;
      else chars[index] = ' ';
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        blockComment = false;
        index += 1;
      } else if (character !== '\n') chars[index] = ' ';
      continue;
    }
    if (quote) {
      if (character !== '\n') chars[index] = ' ';
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      lineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      blockComment = true;
      index += 1;
    } else if (character === "'" || character === '"' || character === '`') {
      chars[index] = ' ';
      quote = character;
    }
  }
  return chars.join('');
}

function lineStartDepths(contents: string): readonly number[] {
  const masked = maskNonCode(contents);
  const depths: number[] = [];
  let depth = 0;
  for (const line of masked.split('\n')) {
    depths.push(depth);
    for (const character of line) {
      if (character === '{') depth += 1;
      else if (character === '}') depth = Math.max(0, depth - 1);
    }
  }
  return depths;
}

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split('\n').length;
}

function finding(
  ruleId: LlmActionRuleId,
  file: LlmSourceFile,
  index: number,
  severity: CejelLlmFinding['severity'],
  summary: string,
  label: string,
  confidence: CejelLlmConfidence,
): CejelLlmFinding {
  return {
    ruleId,
    severity,
    confidence,
    summary,
    evidence: {
      path: file.path,
      line: lineNumberAt(file.contents, index),
      label,
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function modelOutputAliasesBeforeLines(
  maskedLines: readonly string[],
  depths: readonly number[],
  lineOffsets: readonly number[],
  supportedCallIndices: ReadonlySet<number>,
): readonly ReadonlySet<string>[] {
  const aliasesByDepth = new Map<number, Set<string>>();
  const snapshots: ReadonlySet<string>[] = [];

  for (let lineIndex = 0; lineIndex < maskedLines.length; lineIndex += 1) {
    const depth = depths[lineIndex] ?? 0;
    for (const knownDepth of aliasesByDepth.keys()) {
      if (knownDepth > depth) aliasesByDepth.delete(knownDepth);
    }

    const aliases = aliasesByDepth.get(depth) ?? new Set<string>();
    aliasesByDepth.set(depth, aliases);
    snapshots.push(new Set(aliases));

    const assignment = (maskedLines[lineIndex] ?? '').match(IDENTIFIER_ASSIGNMENT_PATTERN);
    const identifier = assignment?.[1];
    const expression = assignment?.[2];
    if (!identifier || !expression) continue;
    const lineStart = lineOffsets[lineIndex] ?? 0;
    const lineHasSupportedResponseAssignment = [...supportedCallIndices].some(
      (index) => lineStart <= index && index < lineStart + (maskedLines[lineIndex]?.length ?? 0),
    );
    if (
      lineHasSupportedResponseAssignment ||
      expressionContainsModelOutput(expression, aliases)
    ) aliases.add(identifier);
    else aliases.delete(identifier);
  }

  return snapshots;
}

function expressionContainsModelOutput(
  expression: string,
  modelOutputAliases: ReadonlySet<string>,
): boolean {
  const output = expression.match(MODEL_OUTPUT_PATTERN);
  if (output?.index !== undefined) {
    const receiver = expression.slice(0, output.index);
    const identifier = receiver.match(/([A-Za-z_$][\w$]*)[.\[\]\w$\s]*$/)?.[1];
    if (identifier && modelOutputAliases.has(identifier)) return true;
  }
  for (const alias of modelOutputAliases) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(expression)) return true;
  }
  return false;
}

function hasFailClosedValidation(segment: string, identifier: string): boolean {
  const escaped = escapeRegExp(identifier);
  const explicitParse = new RegExp(
    `\\b[A-Za-z_$][\\w$]*(?:Schema|schema)\\s*(?:\\.strict\\s*\\(\\s*\\))?\\.parse\\s*\\(\\s*${escaped}\\s*\\)`,
  );
  const allowlistGuard = new RegExp(
    `if\\s*\\(\\s*!\\s*[A-Za-z_$][\\w$]*(?:ALLOWLIST|ALLOW_LIST|ALLOWED|PERMITTED)[A-Za-z0-9_$]*\\s*\\.(?:includes|has)\\s*\\(\\s*${escaped}\\.[A-Za-z_$][\\w$]*\\s*\\)\\s*\\)\\s*(?:\\{\\s*)?(?:throw\\b|return\\b)`,
    's',
  );
  return explicitParse.test(segment) || allowlistGuard.test(segment);
}

/**
 * Detects only a direct, local JSON.parse(model output) -> object field -> named consequential
 * dispatcher path. Absence of a match is not evidence that runtime validation exists.
 */
export function detectUnvalidatedConsequentialAction(
  file: LlmSourceFile,
): readonly CejelLlmFinding[] {
  if (file.path.toLowerCase().endsWith('.py')) {
    return detectPythonUnvalidatedConsequentialAction(file);
  }
  if (isExcludedSourcePath(file.path)) return [];

  const findings: CejelLlmFinding[] = [];
  const lines = file.contents.split('\n');
  const maskedLines = maskNonCode(file.contents).split('\n');
  const depths = lineStartDepths(file.contents);
  const lineOffsets: number[] = [];
  let runningOffset = 0;
  for (const line of maskedLines) {
    lineOffsets.push(runningOffset);
    runningOffset += line.length + 1;
  }
  const aliasesBeforeLines = modelOutputAliasesBeforeLines(
    maskedLines,
    depths,
    lineOffsets,
    supportedJavaScriptModelCallIndices(file.contents),
  );
  let offset = 0;

  for (let assignmentLine = 0; assignmentLine < lines.length; assignmentLine += 1) {
    const line = maskedLines[assignmentLine] ?? '';
    const assignment = line.match(IDENTIFIER_ASSIGNMENT_PATTERN);
    const identifier = assignment?.[1];
    const expression = assignment?.[2];
    const structuredParse = expression?.match(STRUCTURED_PARSE_PATTERN);
    if (!identifier || !expression || !structuredParse?.[1]) {
      offset += line.length + 1;
      continue;
    }
    if (
      !expressionContainsModelOutput(
        structuredParse[1],
        aliasesBeforeLines[assignmentLine] ?? new Set<string>(),
      )
    ) {
      offset += line.length + 1;
      continue;
    }
    // A checked runtime parse on the assignment path prevents this detector from asserting the
    // absence of validation. It intentionally does not emit a verified-control result.
    if (RUNTIME_PARSE_PATTERN.test(expression)) {
      offset += line.length + 1;
      continue;
    }

    let dispatchOffset = offset + line.length + 1;
    const assignmentDepth = depths[assignmentLine] ?? 0;
    for (let dispatchLine = assignmentLine + 1; dispatchLine < lines.length; dispatchLine += 1) {
      const candidate = maskedLines[dispatchLine] ?? '';
      const candidateDepth = depths[dispatchLine] ?? 0;
      if (candidateDepth < assignmentDepth) break;
      if (candidateDepth !== assignmentDepth) {
        dispatchOffset += (lines[dispatchLine] ?? '').length + 1;
        continue;
      }
      const dispatch = candidate.match(CONSEQUENTIAL_DISPATCH_PATTERN);
      const dispatchExpression = dispatch
        ? candidate.slice((dispatch.index ?? 0) + dispatch[0].length)
        : '';
      const fieldUse = new RegExp(
        `\\b${escapeRegExp(identifier)}\\.([A-Za-z_$][\\w$]*)\\b`,
      ).exec(dispatchExpression);
      if (dispatch && fieldUse?.[1]) {
        const between = maskedLines.slice(assignmentLine + 1, dispatchLine).join('\n');
        if (!hasFailClosedValidation(between, identifier)) {
          findings.push(
            finding(
              'LLM-VAL-001',
              file,
              dispatchOffset + (dispatch.index ?? 0),
              'critical',
              `Model-produced structured field ${identifier}.${fieldUse[1]} reaches a consequential dispatcher without observable runtime validation.`,
              `Unvalidated ${identifier}.${fieldUse[1]} reaches consequential dispatch`,
              'high',
            ),
          );
        }
        break;
      }
      dispatchOffset += candidate.length + 1;
    }

    offset += line.length + 1;
  }

  return findings;
}

interface PythonToolMethod {
  readonly classBody: string;
  readonly classBodyMasked: string;
  readonly classOffset: number;
  readonly parameters: ReadonlySet<string>;
}

function pythonModelFacingToolMethods(file: LlmSourceFile): readonly PythonToolMethod[] {
  if (isExcludedSourcePath(file.path)) return [];
  const masked = maskPythonNonCode(file.contents);
  const originalLines = file.contents.split('\n');
  const maskedLines = masked.split('\n');
  const offsets: number[] = [];
  let offset = 0;
  for (const line of originalLines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const methods: PythonToolMethod[] = [];
  for (let classLine = 0; classLine < maskedLines.length; classLine += 1) {
    const declaration = (maskedLines[classLine] ?? '').match(
      /^(\s*)class\s+[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*:/,
    );
    if (!declaration) continue;
    const classIndent = declaration[1]?.length ?? 0;
    let classEndLine = maskedLines.length;
    for (let later = classLine + 1; later < maskedLines.length; later += 1) {
      const candidate = maskedLines[later] ?? '';
      if (candidate.trim().length === 0) continue;
      const indentation = candidate.match(/^\s*/)?.[0].length ?? 0;
      if (indentation <= classIndent) {
        classEndLine = later;
        break;
      }
    }
    const classOffset = offsets[classLine] ?? 0;
    const classEndOffset = offsets[classEndLine] ?? file.contents.length;
    const classBody = file.contents.slice(classOffset, classEndOffset);
    const classBodyMasked = masked.slice(classOffset, classEndOffset);
    if (!/\bargs_schema\s*(?::[^=\n]+)?=/.test(classBodyMasked)) continue;
    for (const method of classBodyMasked.matchAll(
      /\bdef\s+_run\s*\(([\s\S]{0,1200}?)\)\s*(?:->[^:\n]+)?\s*:/g,
    )) {
      const parameters = new Set<string>();
      for (const parameter of (method[1] ?? '').split(',')) {
        const identifier = parameter.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
        if (identifier && identifier !== 'self') parameters.add(identifier);
      }
      methods.push({ classBody, classBodyMasked, classOffset, parameters });
    }
  }
  return methods;
}

function pythonToolExecution(
  method: PythonToolMethod,
): { readonly index: number; readonly parameter: string } | null {
  for (const invocation of method.classBodyMasked.matchAll(
    /\b[A-Za-z_][A-Za-z0-9_.]*\.invoke\s*\(/g,
  )) {
    const openParen = (invocation.index ?? 0) + invocation[0].lastIndexOf('(');
    const end = matchingCallEnd(method.classBody, openParen);
    if (end === null) continue;
    const call = method.classBody.slice(invocation.index, end);
    if (
      !/\bmethod\s*=\s*['"][^'"]*(?:execute|command|code|run)[^'"]*['"]/i.test(call)
    ) {
      continue;
    }
    for (const parameter of method.parameters) {
      const escaped = escapeRegExp(parameter);
      if (!new RegExp(`['"][A-Za-z_][A-Za-z0-9_]*['"]\\s*:\\s*${escaped}\\b`).test(call)) {
        continue;
      }
      const constrainedAnnotation = new RegExp(
        `\\b${escaped}\\s*:\\s*(?:Literal|Enum|Annotated)\\s*\\[`,
      );
      const localValidator = new RegExp(
        `\\bfield_validator\\s*\\(\\s*['"]${escaped}['"]`,
      );
      if (
        constrainedAnnotation.test(method.classBody) ||
        localValidator.test(method.classBody)
      ) {
        continue;
      }
      return {
        index: method.classOffset + (invocation.index ?? 0),
        parameter,
      };
    }
  }
  return null;
}

function detectPythonUnvalidatedConsequentialAction(
  file: LlmSourceFile,
): readonly CejelLlmFinding[] {
  const findings: CejelLlmFinding[] = [];
  for (const method of pythonModelFacingToolMethods(file)) {
    const execution = pythonToolExecution(method);
    if (!execution) continue;
    findings.push(
      finding(
        'LLM-VAL-001',
        file,
        execution.index,
        'critical',
        `A model-facing structured tool parameter reaches a supported execution dispatcher without an observable closed constraint.`,
        `Unconstrained structured field ${execution.parameter} reaches execution dispatch`,
        'high',
      ),
    );
  }
  return findings;
}

function hasConsequentialStructuredActionSurface(file: LlmSourceFile): boolean {
  if (file.path.toLowerCase().endsWith('.py')) {
    return pythonModelFacingToolMethods(file).some(
      (method) => pythonToolExecution(method) !== null,
    );
  }
  if (isExcludedSourcePath(file.path)) return false;
  const maskedLines = maskNonCode(file.contents).split('\n');
  const depths = lineStartDepths(file.contents);
  const lineOffsets: number[] = [];
  let runningOffset = 0;
  for (const line of maskedLines) {
    lineOffsets.push(runningOffset);
    runningOffset += line.length + 1;
  }
  const aliasesBeforeLines = modelOutputAliasesBeforeLines(
    maskedLines,
    depths,
    lineOffsets,
    supportedJavaScriptModelCallIndices(file.contents),
  );
  for (let lineIndex = 0; lineIndex < maskedLines.length; lineIndex += 1) {
    const assignment = (maskedLines[lineIndex] ?? '').match(IDENTIFIER_ASSIGNMENT_PATTERN);
    const expression = assignment?.[2];
    const parsed = expression?.match(STRUCTURED_PARSE_PATTERN)?.[1];
    if (
      !parsed ||
      !expressionContainsModelOutput(parsed, aliasesBeforeLines[lineIndex] ?? new Set<string>())
    ) {
      continue;
    }
    const depth = depths[lineIndex] ?? 0;
    for (let later = lineIndex + 1; later < maskedLines.length; later += 1) {
      const laterDepth = depths[later] ?? 0;
      if (laterDepth < depth) break;
      if (laterDepth === depth && CONSEQUENTIAL_DISPATCH_PATTERN.test(maskedLines[later] ?? '')) {
        return true;
      }
    }
  }
  return false;
}

function matchingCallEnd(contents: string, openParen: number): number | null {
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openParen; index < contents.length; index += 1) {
    const character = contents[index] ?? '';
    const next = contents[index + 1] ?? '';
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function isToolExposed(
  contents: string,
  maskedContents: string,
  toolName: string,
  afterIndex: number,
): boolean {
  const escaped = escapeRegExp(toolName);
  const remainder = maskedContents.slice(afterIndex);
  const supportedCalls = supportedJavaScriptModelCallIndices(contents);
  for (const match of remainder.matchAll(new RegExp(
    `\\b(?:generateText|streamText)\\s*\\([\\s\\S]{0,2000}?\\btools\\s*:\\s*\\{[^}]*\\b${escaped}\\b`,
    'gs',
  ))) {
    if (supportedCalls.has(afterIndex + match.index)) return true;
  }
  return false;
}

const OBSERVABLE_SIDE_EFFECT_EXPORTS: Readonly<Record<string, ReadonlySet<string>>> = {
  fs: new Set([
    'appendFile',
    'appendFileSync',
    'rename',
    'renameSync',
    'rm',
    'rmSync',
    'unlink',
    'unlinkSync',
    'writeFile',
    'writeFileSync',
  ]),
  child_process: new Set(['execFile', 'execFileSync', 'spawn', 'spawnSync']),
};

interface ObservableSideEffectBindings {
  readonly direct: ReadonlySet<string>;
  readonly namespaces: ReadonlyMap<string, ReadonlySet<string>>;
}

function observableSideEffectBindings(
  contents: string,
  maskedContents: string,
): ObservableSideEffectBindings {
  const direct = new Set<string>();
  const namespaces = new Map<string, ReadonlySet<string>>();
  const namedImport =
    /\bimport\s*\{([^}]*)\}\s*from\s*(['"])(?:node:)?(fs|child_process)\2/g;
  for (const match of contents.matchAll(namedImport)) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    const exports = match[3] ? OBSERVABLE_SIDE_EFFECT_EXPORTS[match[3]] : undefined;
    if (!exports) continue;
    for (const specifier of (match[1] ?? '').split(',')) {
      const binding = specifier
        .trim()
        .match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      const imported = binding?.[1];
      const local = binding?.[2] ?? imported;
      if (imported && local && exports.has(imported)) direct.add(local);
    }
  }

  const namespaceImport =
    /\bimport\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*(['"])(?:node:)?(fs|child_process)\2/g;
  for (const match of contents.matchAll(namespaceImport)) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    const namespace = match[1];
    const exports = match[3] ? OBSERVABLE_SIDE_EFFECT_EXPORTS[match[3]] : undefined;
    if (namespace && exports) namespaces.set(namespace, exports);
  }
  return { direct, namespaces };
}

function observableSideEffectIndex(
  declaration: string,
  bindings: ObservableSideEffectBindings,
  helperNames: ReadonlySet<string> = new Set(),
): number | null {
  let earliest: number | null = null;
  const consider = (index: number): void => {
    if (earliest === null || index < earliest) earliest = index;
  };
  for (const binding of bindings.direct) {
    const match = new RegExp(`\\b${escapeRegExp(binding)}\\s*\\(`).exec(declaration);
    if (match) consider(match.index);
  }
  for (const [namespace, exports] of bindings.namespaces) {
    const operations = [...exports].map(escapeRegExp).join('|');
    const match = new RegExp(
      `\\b${escapeRegExp(namespace)}\\s*\\.\\s*(?:${operations})\\s*\\(`,
    ).exec(declaration);
    if (match) consider(match.index);
  }
  for (const helperName of helperNames) {
    const match = new RegExp(`\\b${escapeRegExp(helperName)}\\s*\\(`).exec(declaration);
    if (match) consider(match.index);
  }
  return earliest;
}

function matchingBraceEnd(contents: string, openBrace: number): number | null {
  let depth = 0;
  for (let index = openBrace; index < contents.length; index += 1) {
    const character = contents[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function localSideEffectHelpers(
  maskedContents: string,
  bindings: ObservableSideEffectBindings,
): ReadonlySet<string> {
  const helpers = new Set<string>();
  for (const declaration of maskedContents.matchAll(
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{\n]+)?\s*\{/g,
  )) {
    const name = declaration[1];
    if (!name) continue;
    const openBrace = (declaration.index ?? 0) + declaration[0].lastIndexOf('{');
    const end = matchingBraceEnd(maskedContents, openBrace);
    if (end === null) continue;
    const body = maskedContents.slice(openBrace + 1, end - 1);
    if (observableSideEffectIndex(body, bindings) !== null) helpers.add(name);
  }
  return helpers;
}

function importedApiParameterNames(
  contents: string,
  maskedContents: string,
): ReadonlySet<string> {
  const importedTypes = new Set<string>();
  for (const declaration of contents.matchAll(
    /\bimport\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^.'"][^'"]*)['"]/g,
  )) {
    if ((maskedContents[declaration.index] ?? ' ') === ' ') continue;
    for (const member of (declaration[1] ?? '').split(',')) {
      const binding = member.trim().match(
        /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/,
      );
      const local = binding?.[2] ?? binding?.[1];
      if (local) importedTypes.add(local);
    }
  }
  const parameters = new Set<string>();
  for (const typeName of importedTypes) {
    const escaped = escapeRegExp(typeName);
    for (const match of maskedContents.matchAll(
      new RegExp(`(?:\\(|,)\\s*([A-Za-z_$][\\w$]*)\\s*:\\s*${escaped}\\b`, 'g'),
    )) {
      if (match[1]) parameters.add(match[1]);
    }
  }
  return parameters;
}

interface MemberToolRegistration {
  readonly receiver: string;
  readonly index: number;
  readonly end: number;
  readonly declaration: string;
}

function memberToolRegistrations(
  contents: string,
  maskedContents: string,
): readonly MemberToolRegistration[] {
  const apiParameters = importedApiParameterNames(contents, maskedContents);
  const registrations: MemberToolRegistration[] = [];
  for (const registration of maskedContents.matchAll(MEMBER_TOOL_REGISTRATION_PATTERN)) {
    const receiver = registration[1];
    if (!receiver || !apiParameters.has(receiver)) continue;
    const openParen = (registration.index ?? 0) + registration[0].lastIndexOf('(');
    const end = matchingCallEnd(maskedContents, openParen);
    if (end === null) continue;
    registrations.push({
      receiver,
      index: registration.index ?? 0,
      end,
      declaration: maskedContents.slice(registration.index, end),
    });
  }
  return registrations;
}

function registeredToolSideEffectSurface(file: LlmSourceFile): boolean {
  if (isExcludedSourcePath(file.path)) return false;
  const maskedContents = maskNonCode(file.contents);
  const bindings = observableSideEffectBindings(file.contents, maskedContents);
  const helpers = localSideEffectHelpers(maskedContents, bindings);
  return memberToolRegistrations(file.contents, maskedContents).some(
    (registration) =>
      /\b(?:execute|handler)\s*(?::|[=(])/.test(registration.declaration) &&
      observableSideEffectIndex(registration.declaration, bindings, helpers) !== null,
  );
}

function hasSideEffectingToolSurface(file: LlmSourceFile): boolean {
  if (isExcludedSourcePath(file.path)) return false;
  const masked = maskNonCode(file.contents);
  const bindings = observableSideEffectBindings(file.contents, masked);
  for (const registration of masked.matchAll(TOOL_ASSIGNMENT_PATTERN)) {
    const toolName = registration[1];
    if (!toolName) continue;
    const openParen = (registration.index ?? 0) + registration[0].lastIndexOf('(');
    const end = matchingCallEnd(file.contents, openParen);
    if (end === null) continue;
    if (
      observableSideEffectIndex(masked.slice(registration.index, end), bindings) !== null &&
      isToolExposed(file.contents, masked, toolName, end)
    ) {
      return true;
    }
  }
  return registeredToolSideEffectSurface(file);
}

/**
 * Detects a fully local tool declaration containing a narrowly recognized side effect and a local
 * model/agent exposure. Dynamic registries and external policy middleware deliberately abstain.
 */
export function detectSideEffectingToolWithoutAuthorityBoundary(
  file: LlmSourceFile,
): readonly CejelLlmFinding[] {
  if (isExcludedSourcePath(file.path)) return [];

  const findings: CejelLlmFinding[] = [];
  const maskedContents = maskNonCode(file.contents);
  const sideEffectBindings = observableSideEffectBindings(file.contents, maskedContents);
  const sideEffectHelpers = localSideEffectHelpers(maskedContents, sideEffectBindings);
  for (const registration of maskedContents.matchAll(TOOL_ASSIGNMENT_PATTERN)) {
    const toolName = registration[1];
    if (!toolName) continue;
    const openParen = (registration.index ?? 0) + registration[0].lastIndexOf('(');
    const end = matchingCallEnd(file.contents, openParen);
    if (end === null) continue;
    const declaration = maskedContents.slice(registration.index, end);
    const sideEffectIndex = observableSideEffectIndex(declaration, sideEffectBindings);
    if (
      sideEffectIndex === null ||
      !isToolExposed(file.contents, maskedContents, toolName, end)
    ) continue;

    const beforeSideEffect = declaration.slice(0, sideEffectIndex);
    if (
      APPROVAL_FAIL_CLOSED_PATTERN.test(beforeSideEffect) ||
      ALLOWLIST_FAIL_CLOSED_PATTERN.test(beforeSideEffect)
    ) {
      continue;
    }

    findings.push(
      finding(
        'LLM-AGY-001',
        file,
        (registration.index ?? 0) + sideEffectIndex,
        'critical',
        `Exposed tool ${toolName} performs a recognized side effect without an observable fail-closed allowlist or human approval gate.`,
        `Exposed ${toolName} tool reaches side-effecting operation`,
        'high',
      ),
    );
  }
  for (const registration of memberToolRegistrations(file.contents, maskedContents)) {
    if (!/\b(?:execute|handler)\s*(?::|[=(])/.test(registration.declaration)) continue;
    const sideEffectIndex = observableSideEffectIndex(
      registration.declaration,
      sideEffectBindings,
      sideEffectHelpers,
    );
    if (sideEffectIndex === null) continue;
    const beforeSideEffect = registration.declaration.slice(0, sideEffectIndex);
    if (
      APPROVAL_FAIL_CLOSED_PATTERN.test(beforeSideEffect) ||
      ALLOWLIST_FAIL_CLOSED_PATTERN.test(beforeSideEffect)
    ) {
      continue;
    }
    findings.push(
      finding(
        'LLM-AGY-001',
        file,
        registration.index + sideEffectIndex,
        'critical',
        `A locally registered model-facing tool performs a recognized side effect without an observable fail-closed allowlist or human approval gate.`,
        'Registered tool reaches an import-resolved side-effecting operation',
        'high',
      ),
    );
  }
  return findings;
}

export const CEJEL_LLM_ACTION_RULES: readonly LlmActionRuleDefinition[] = [
  {
    id: 'LLM-VAL-001',
    title: 'Consequential structured action lacks validation',
    detectorConfidence: 'high',
    evidenceContract:
      'A direct local JSON.parse of recognized model output supplies an object field to a named consequential dispatcher without an intervening fail-closed runtime parse or allowlist guard.',
    exclusions: [
      'Inter-procedural or dynamically assembled dispatch',
      'Read-only rendering and fixed operations',
      'Runtime validation whose implementation is external or cannot be resolved locally',
    ],
    applies: hasConsequentialStructuredActionSurface,
    detect: detectUnvalidatedConsequentialAction,
  },
  {
    id: 'LLM-AGY-001',
    title: 'Side-effecting tool lacks an authority boundary',
    detectorConfidence: 'high',
    evidenceContract:
      'A complete local tool declaration calls an import-resolved Node filesystem or child-process mutation API and is exposed through a local tools registry without a preceding fail-closed approval or operation-allowlist guard.',
    exclusions: [
      'Read-only and pure tools',
      'Unbound business-operation names whose side effects cannot be established locally',
      'Dynamic or remotely supplied registries and policy middleware',
      'Tool declarations not observably exposed to a model or agent',
      'Generic registerTool calls or agent objects without an import-resolved supported model call',
    ],
    applies: hasSideEffectingToolSurface,
    detect: detectSideEffectingToolWithoutAuthorityBoundary,
  },
];
