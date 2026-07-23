import type { LlmSourceFile } from './rules.js';
import type { CejelLlmConfidence, CejelLlmFinding } from './types.js';
import { supportedJavaScriptModelCallIndices } from './javascript-integrations.js';
import { maskJavaScriptNonCode, maskPythonNonCode } from './lexical.js';

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
const NON_MUTATING_OR_INDETERMINATE_OPERATIONS = new Set([
  'describe',
  'eval',
  'get',
  'harvest',
  'inspect',
  'list',
  'read',
  'screenshot',
  'status',
]);

function isExcludedSourcePath(path: string): boolean {
  return /(?:^|\/)(?:__tests__|test|tests|fixtures?|examples?|vendor|generated)(?:\/|$)/i.test(path) ||
    /\.(?:test|spec|fixture)\.[cm]?[jt]sx?$/i.test(path) ||
    /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i.test(path);
}

const maskNonCode = maskJavaScriptNonCode;

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
  readonly constraintScope: string;
  readonly body: string;
  readonly bodyMasked: string;
  readonly bodyOffset: number;
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
      const methodIndex = method.index ?? 0;
      const methodLineWithinClass = classBodyMasked
        .slice(0, methodIndex)
        .split('\n').length - 1;
      const methodLine = classLine + methodLineWithinClass;
      const methodDeclarationLines = method[0].split('\n').length;
      const methodDeclarationLine = maskedLines[methodLine] ?? '';
      const methodIndent = methodDeclarationLine.match(/^\s*/)?.[0].length ?? 0;
      let methodEndLine = classEndLine;
      for (
        let later = methodLine + methodDeclarationLines;
        later < classEndLine;
        later += 1
      ) {
        const candidate = maskedLines[later] ?? '';
        if (candidate.trim().length === 0) continue;
        const indentation = candidate.match(/^\s*/)?.[0].length ?? 0;
        if (indentation <= methodIndent) {
          methodEndLine = later;
          break;
        }
      }
      const bodyOffset = offsets[methodLine] ?? classOffset + methodIndex;
      const bodyEndOffset = offsets[methodEndLine] ?? classEndOffset;
      const parameters = new Set<string>();
      for (const parameter of (method[1] ?? '').split(',')) {
        const identifier = parameter.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
        if (identifier && identifier !== 'self') parameters.add(identifier);
      }
      methods.push({
        constraintScope: classBody,
        body: file.contents.slice(bodyOffset, bodyEndOffset),
        bodyMasked: masked.slice(bodyOffset, bodyEndOffset),
        bodyOffset,
        parameters,
      });
    }
  }
  return methods;
}

function pythonToolExecution(
  method: PythonToolMethod,
): { readonly index: number; readonly parameter: string } | null {
  for (const invocation of method.bodyMasked.matchAll(
    /\b[A-Za-z_][A-Za-z0-9_.]*\.invoke\s*\(/g,
  )) {
    const openParen = (invocation.index ?? 0) + invocation[0].lastIndexOf('(');
    const end = matchingCallEnd(method.body, openParen);
    if (end === null) continue;
    const call = method.body.slice(invocation.index, end);
    if (
      !/\bmethod\s*=\s*['"][^'"]*execute[_-]?code[^'"]*['"]/i.test(call)
    ) {
      continue;
    }
    for (const parameter of method.parameters) {
      if (!/^code$/i.test(parameter)) continue;
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
        constrainedAnnotation.test(method.body) ||
        localValidator.test(method.constraintScope)
      ) {
        continue;
      }
      return {
        // The defect is introduced at the model-facing input declaration; the downstream
        // dispatcher merely demonstrates consequence. Anchoring the finding here also avoids
        // implying that every later invocation in the same toolkit is a separate defect.
        index: method.bodyOffset,
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
  let regexLiteral = false;
  let regexCharacterClass = false;

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
    if (regexLiteral) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '[') {
        regexCharacterClass = true;
      } else if (character === ']') {
        regexCharacterClass = false;
      } else if (character === '/' && !regexCharacterClass) {
        regexLiteral = false;
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
    if (character === '/') {
      const prefix = contents.slice(openParen, index);
      const previous = prefix.match(/(\S)\s*$/)?.[1];
      if (!previous || /[=(:,![{;?&|]/.test(previous)) {
        regexLiteral = true;
        regexCharacterClass = false;
        continue;
      }
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

export type RegisteredToolSideEffectKind = 'filesystem' | 'process';

export interface RegisteredToolParameterSideEffect {
  readonly registrationIndex: number;
  readonly sideEffectIndex: number;
  readonly kind: RegisteredToolSideEffectKind;
  readonly executesModelInput: boolean;
  readonly primaryForRegistration: boolean;
}

interface ObservableSideEffectBindings {
  readonly direct: ReadonlySet<string>;
  readonly namespaces: ReadonlyMap<string, ReadonlySet<string>>;
  readonly directKinds: ReadonlyMap<string, RegisteredToolSideEffectKind>;
  readonly namespaceKinds: ReadonlyMap<
    string,
    ReadonlyMap<string, RegisteredToolSideEffectKind>
  >;
}

function observableSideEffectBindings(
  contents: string,
  maskedContents: string,
): ObservableSideEffectBindings {
  const direct = new Set<string>();
  const namespaces = new Map<string, ReadonlySet<string>>();
  const directKinds = new Map<string, RegisteredToolSideEffectKind>();
  const namespaceKinds = new Map<
    string,
    ReadonlyMap<string, RegisteredToolSideEffectKind>
  >();
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
      if (imported && local && exports.has(imported)) {
        direct.add(local);
        directKinds.set(local, match[3] === 'fs' ? 'filesystem' : 'process');
      }
    }
  }

  const namespaceImport =
    /\bimport\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*(['"])(?:node:)?(fs|child_process)\2/g;
  for (const match of contents.matchAll(namespaceImport)) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    const namespace = match[1];
    const exports = match[3] ? OBSERVABLE_SIDE_EFFECT_EXPORTS[match[3]] : undefined;
    if (namespace && exports) {
      namespaces.set(namespace, exports);
      namespaceKinds.set(
        namespace,
        new Map(
          [...exports].map((operation) => [
            operation,
            match[3] === 'fs' ? 'filesystem' : 'process',
          ]),
        ),
      );
    }
  }
  return { direct, namespaces, directKinds, namespaceKinds };
}

interface ObservableSideEffectCall {
  readonly index: number;
  readonly end: number;
  readonly kind: RegisteredToolSideEffectKind;
  readonly argumentsText: string;
}

function observableSideEffectCalls(
  contents: string,
  bindings: ObservableSideEffectBindings,
): readonly ObservableSideEffectCall[] {
  const calls: ObservableSideEffectCall[] = [];
  for (const [binding, kind] of bindings.directKinds) {
    for (const match of contents.matchAll(
      new RegExp(`\\b${escapeRegExp(binding)}\\s*\\(`, 'g'),
    )) {
      const openParen = (match.index ?? 0) + match[0].lastIndexOf('(');
      const end = matchingCallEnd(contents, openParen);
      if (end === null) continue;
      calls.push({
        index: match.index ?? 0,
        end,
        kind,
        argumentsText: contents.slice(openParen + 1, end - 1),
      });
    }
  }
  for (const [namespace, operations] of bindings.namespaceKinds) {
    for (const [operation, kind] of operations) {
      for (const match of contents.matchAll(
        new RegExp(
          `\\b${escapeRegExp(namespace)}\\s*\\.\\s*${escapeRegExp(operation)}\\s*\\(`,
          'g',
        ),
      )) {
        const openParen = (match.index ?? 0) + match[0].lastIndexOf('(');
        const end = matchingCallEnd(contents, openParen);
        if (end === null) continue;
        calls.push({
          index: match.index ?? 0,
          end,
          kind,
          argumentsText: contents.slice(openParen + 1, end - 1),
        });
      }
    }
  }
  return calls.sort((left, right) => left.index - right.index);
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

interface LocalParameterSideEffectHelper {
  readonly name: string;
  readonly parameterIndexes: ReadonlySet<number>;
  readonly kind: RegisteredToolSideEffectKind;
  readonly depth: 0 | 1;
  readonly mutationWitness: boolean;
}

function fixedArrayOperationNames(body: string): readonly string[] {
  const operations: string[] = [];
  for (const array of body.matchAll(/\[([\s\S]{0,1200}?)\]/g)) {
    const argumentsList = splitTopLevelArguments(array[1] ?? '');
    for (const argument of argumentsList) {
      const operation = argument.trim().match(/^['"]([A-Za-z_][A-Za-z0-9_-]*)['"]$/)?.[1];
      if (operation) operations.push(operation.toLowerCase());
    }
  }
  return operations;
}

function splitTopLevelArguments(argumentsText: string): readonly string[] {
  const argumentsList: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  for (let index = 0; index < argumentsText.length; index += 1) {
    const character = argumentsText[index] ?? '';
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      argumentsList.push(argumentsText.slice(start, index));
      start = index + 1;
    }
  }
  argumentsList.push(argumentsText.slice(start));
  return argumentsList;
}

function containsAnyIdentifier(
  expression: string,
  identifiers: ReadonlySet<string>,
): boolean {
  for (const identifier of identifiers) {
    if (new RegExp(`\\b${escapeRegExp(identifier)}\\b`).test(expression)) return true;
  }
  return false;
}

function localParameterSideEffectHelpers(
  contents: string,
  maskedContents: string,
  bindings: ObservableSideEffectBindings,
): readonly LocalParameterSideEffectHelper[] {
  const hasFixedMutationOperation = (body: string): boolean =>
    fixedArrayOperationNames(body).some(
      (operation) => !NON_MUTATING_OR_INDETERMINATE_OPERATIONS.has(operation),
    );
  const declarations: {
    name: string;
    parameters: readonly string[];
    body: string;
  }[] = [];
  const declarationCounts = new Map<string, number>();
  for (const declaration of maskedContents.matchAll(
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::[^{\n]+)?\s*\{/g,
  )) {
    const name = declaration[1];
    if (!name) continue;
    const openBrace = (declaration.index ?? 0) + declaration[0].lastIndexOf('{');
    const end = matchingBraceEnd(maskedContents, openBrace);
    if (end === null) {
      continue;
    }
    const parameters = (declaration[2] ?? '')
      .split(',')
      .map((parameter) => parameter.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1])
      .filter((parameter): parameter is string => Boolean(parameter));
    const body = contents.slice(openBrace + 1, end - 1);
    declarations.push({ name, parameters, body });
    declarationCounts.set(name, (declarationCounts.get(name) ?? 0) + 1);
  }

  const direct: LocalParameterSideEffectHelper[] = [];
  for (const declaration of declarations) {
    if (declarationCounts.get(declaration.name) !== 1) continue;
    for (const call of observableSideEffectCalls(declaration.body, bindings)) {
      const parameterIndexes = new Set<number>();
      declaration.parameters.forEach((parameter, parameterIndex) => {
        if (
          new RegExp(`\\b${escapeRegExp(parameter)}\\b`).test(call.argumentsText)
        ) {
          parameterIndexes.add(parameterIndex);
        }
      });
      if (parameterIndexes.size > 0) {
        direct.push({
          name: declaration.name,
          parameterIndexes,
          kind: call.kind,
          depth: 0,
          mutationWitness: hasFixedMutationOperation(declaration.body),
        });
      }
    }
  }

  const composed: LocalParameterSideEffectHelper[] = [];
  for (const declaration of declarations) {
    if (declarationCounts.get(declaration.name) !== 1) continue;
    for (const callee of direct) {
      for (const call of declaration.body.matchAll(
        new RegExp(`\\b${escapeRegExp(callee.name)}\\s*\\(`, 'g'),
      )) {
        const openParen = (call.index ?? 0) + call[0].lastIndexOf('(');
        const end = matchingCallEnd(declaration.body, openParen);
        if (end === null) continue;
        const argumentsList = splitTopLevelArguments(
          declaration.body.slice(openParen + 1, end - 1),
        );
        const parameterIndexes = new Set<number>();
        declaration.parameters.forEach((parameter, parameterIndex) => {
          const tainted = boundedTaintedIdentifiers(
            declaration.body,
            new Set([parameter]),
            bindings,
            [],
          );
          if (
            [...callee.parameterIndexes].some((calleeIndex) =>
              containsAnyIdentifier(argumentsList[calleeIndex] ?? '', tainted)
            )
          ) {
            parameterIndexes.add(parameterIndex);
          }
        });
        if (parameterIndexes.size > 0) {
          composed.push({
            name: declaration.name,
            parameterIndexes,
            kind: callee.kind,
            depth: 1,
            mutationWitness:
              callee.mutationWitness ||
              hasFixedMutationOperation(declaration.body),
          });
        }
      }
    }
  }
  return [...direct, ...composed];
}

interface RegisteredToolHandler {
  readonly body: string;
  readonly bodyOffset: number;
  readonly modelInputIdentifiers: ReadonlySet<string>;
}

function registeredToolHandler(
  registration: MemberToolRegistration,
): RegisteredToolHandler | null {
  const patterns = [
    /\b(?:async\s+)?(?:execute|handler)\s*\(([^)]*)\)\s*(?::[^{\n]+)?\s*\{/,
    /\b(?:execute|handler)\s*:\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\{/,
  ];
  for (const pattern of patterns) {
    const declaration = pattern.exec(registration.maskedDeclaration);
    if (!declaration) continue;
    const openBrace = declaration.index + declaration[0].lastIndexOf('{');
    const end = matchingBraceEnd(registration.maskedDeclaration, openBrace);
    if (end === null) continue;
    const parameters = (declaration[1] ?? '')
      .split(',')
      .map((parameter) => parameter.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1])
      .filter((parameter): parameter is string => Boolean(parameter));
    const body = registration.declaration.slice(openBrace + 1, end - 1);
    const modelInputIdentifiers = new Set(
      parameters.filter((parameter, parameterIndex) => {
        if (parameter.startsWith('_')) return false;
        if (parameters.length === 1) return true;
        if (/^(?:params|input|args|payload|request)$/i.test(parameter)) return true;
        return (
          parameterIndex === 1 &&
          /(?:call)?id$/i.test(parameters[0] ?? '') &&
          new RegExp(`\\b${escapeRegExp(parameter)}\\s*\\.`).test(body)
        );
      }),
    );
    if (modelInputIdentifiers.size === 0) return null;
    return {
      body,
      bodyOffset: openBrace + 1,
      modelInputIdentifiers,
    };
  }
  return null;
}

function boundedTaintedIdentifiers(
  body: string,
  roots: ReadonlySet<string>,
  bindings: ObservableSideEffectBindings,
  helpers: readonly LocalParameterSideEffectHelper[],
): ReadonlySet<string> {
  const tainted = new Set(roots);
  const assignments = [
    ...body.matchAll(
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n;]+)?=\s*([\s\S]{0,2400}?);/g,
    ),
    ...body.matchAll(
      /(?<![.\w$])([A-Za-z_$][\w$]*)\s*=\s*(?!=)([\s\S]{0,1200}?);/g,
    ),
    ...body.matchAll(
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n;]+)?=\s*(`[\s\S]{0,2400}?`)\s*;/g,
    ),
  ];
  const destructuringAssignments = [...body.matchAll(
    /\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*([A-Za-z_$][\w$]*)\b/g,
  )];
  for (let pass = 0; pass < 3; pass += 1) {
    for (const assignment of assignments) {
      const identifier = assignment[1];
      const expression = assignment[2];
      if (!identifier || !expression || !containsAnyIdentifier(expression, tainted)) {
        continue;
      }
      const returnsProcessResult =
        [...bindings.directKinds].some(
          ([binding, kind]) =>
            kind === 'process' &&
            new RegExp(`^\\s*${escapeRegExp(binding)}\\s*\\(`).test(expression),
        ) ||
        [...bindings.namespaceKinds].some(([namespace, operations]) =>
          [...operations].some(
            ([operation, kind]) =>
              kind === 'process' &&
              new RegExp(
                `^\\s*${escapeRegExp(namespace)}\\s*\\.\\s*${escapeRegExp(operation)}\\s*\\(`,
              ).test(expression),
          ),
        ) ||
        helpers.some(
          (helper) =>
            helper.kind === 'process' &&
            new RegExp(`^\\s*${escapeRegExp(helper.name)}\\s*\\(`).test(expression),
        );
      const leadingCall = expression.match(
        /^\s*(?:await\s+)?(?:new\s+)?([A-Za-z_$][\w$]*)\s*\(/,
      )?.[1];
      const boundedBuiltinCall =
        leadingCall === undefined ||
        new Set(['String', 'Number', 'Boolean', 'URL']).has(leadingCall);
      if (!returnsProcessResult && boundedBuiltinCall) {
        tainted.add(identifier);
      }
    }
    for (const assignment of destructuringAssignments) {
      const source = assignment[2];
      if (!source || !tainted.has(source)) continue;
      for (const member of (assignment[1] ?? '').split(',')) {
        const identifier = member.trim().match(
          /^(?:[A-Za-z_$][\w$]*\s*:\s*)?([A-Za-z_$][\w$]*)/,
        )?.[1];
        if (identifier) tainted.add(identifier);
      }
    }
    for (const mutation of body.matchAll(
      /\b([A-Za-z_$][\w$]*)\.(?:push|unshift)\s*\(([\s\S]{0,500}?)\)\s*;/g,
    )) {
      const receiver = mutation[1];
      const expression = mutation[2];
      if (receiver && expression && containsAnyIdentifier(expression, tainted)) {
        tainted.add(receiver);
      }
    }
  }
  return tainted;
}

function boundedExecutableIdentifiers(
  body: string,
  roots: ReadonlySet<string>,
): ReadonlySet<string> {
  const executableTaint = new Set(roots);
  const destructuringAssignments = [
    ...body.matchAll(
      /\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*([A-Za-z_$][\w$]*)\s*;/g,
    ),
  ];
  const assignments = [
    ...body.matchAll(
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n;]+)?=\s*([\s\S]{0,2400}?);/g,
    ),
    ...body.matchAll(
      /(?<![.\w$])([A-Za-z_$][\w$]*)\s*=\s*(?!=)([\s\S]{0,1200}?);/g,
    ),
  ];
  for (let pass = 0; pass < 3; pass += 1) {
    for (const assignment of destructuringAssignments) {
      const source = assignment[2];
      if (!source || !executableTaint.has(source)) continue;
      for (const member of (assignment[1] ?? '').split(',')) {
        const identifier = member.trim().match(
          /^(?:[A-Za-z_$][\w$]*\s*:\s*)?([A-Za-z_$][\w$]*)/,
        )?.[1];
        if (identifier) executableTaint.add(identifier);
      }
    }
    for (const assignment of assignments) {
      const identifier = assignment[1];
      const expression = assignment[2];
      if (!identifier || !expression) continue;
      const chars = [...expression];
      for (const callName of ['JSON.stringify', 'Number']) {
        for (const call of expression.matchAll(
          new RegExp(`\\b${callName.replace('.', '\\.')}\\s*\\(`, 'g'),
        )) {
          const openParen = (call.index ?? 0) + call[0].lastIndexOf('(');
          const end = matchingCallEnd(expression, openParen);
          if (end === null) continue;
          for (let index = call.index ?? 0; index < end; index += 1) {
            if ((chars[index] ?? '') !== '\n') chars[index] = ' ';
          }
        }
      }
      if (containsAnyIdentifier(chars.join(''), executableTaint)) {
        executableTaint.add(identifier);
      }
    }
    for (const mutation of body.matchAll(
      /\b([A-Za-z_$][\w$]*)\.(?:push|unshift)\s*\(([\s\S]{0,500}?)\)\s*;/g,
    )) {
      const receiver = mutation[1];
      const expression = mutation[2];
      if (receiver && expression && containsAnyIdentifier(expression, executableTaint)) {
        executableTaint.add(receiver);
      }
    }
  }
  return executableTaint;
}

function helperCallSideEffects(
  body: string,
  tainted: ReadonlySet<string>,
  helpers: readonly LocalParameterSideEffectHelper[],
): readonly {
  readonly index: number;
  readonly kind: RegisteredToolSideEffectKind;
  readonly depth: 0 | 1;
  readonly mutationWitness: boolean;
  readonly argumentsText: string;
}[] {
  const sideEffects: {
    index: number;
    kind: RegisteredToolSideEffectKind;
    depth: 0 | 1;
    mutationWitness: boolean;
    argumentsText: string;
  }[] = [];
  for (const helper of helpers) {
    if (new RegExp(`\\bfunction\\s+${escapeRegExp(helper.name)}\\s*\\(`).test(body)) {
      continue;
    }
    for (const call of body.matchAll(
      new RegExp(`\\b${escapeRegExp(helper.name)}\\s*\\(`, 'g'),
    )) {
      const openParen = (call.index ?? 0) + call[0].lastIndexOf('(');
      const end = matchingCallEnd(body, openParen);
      if (end === null) continue;
      const argumentsList = splitTopLevelArguments(body.slice(openParen + 1, end - 1));
      if (
        [...helper.parameterIndexes].some((parameterIndex) =>
          containsAnyIdentifier(argumentsList[parameterIndex] ?? '', tainted)
        )
      ) {
        sideEffects.push({
          index: call.index ?? 0,
          kind: helper.kind,
          depth: helper.depth,
          mutationWitness: helper.mutationWitness,
          argumentsText: body.slice(openParen + 1, end - 1),
        });
      }
    }
  }
  return sideEffects;
}

interface ImportedApiParameterScope {
  readonly receiver: string;
  readonly start: number;
  readonly end: number;
}

function importedApiParameterScopes(
  contents: string,
  maskedContents: string,
): readonly ImportedApiParameterScope[] {
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
  const scopes: ImportedApiParameterScope[] = [];
  for (const declaration of maskedContents.matchAll(
    /\bfunction(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)\s*(?::[^{\n]+)?\s*\{/g,
  )) {
    const openBrace = (declaration.index ?? 0) + declaration[0].lastIndexOf('{');
    const end = matchingBraceEnd(maskedContents, openBrace) ?? maskedContents.length;
    for (const parameter of (declaration[1] ?? '').split(',')) {
      const binding = parameter.trim().match(
        /^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\b/,
      );
      const receiver = binding?.[1];
      const typeName = binding?.[2];
      if (receiver && typeName && importedTypes.has(typeName)) {
        scopes.push({ receiver, start: openBrace + 1, end: end - 1 });
      }
    }
  }
  const scopeCounts = new Map<string, number>();
  for (const scope of scopes) {
    scopeCounts.set(scope.receiver, (scopeCounts.get(scope.receiver) ?? 0) + 1);
  }
  return scopes.map((scope) => {
    const escaped = escapeRegExp(scope.receiver);
    const isUniqueImportedReceiver = scopeCounts.get(scope.receiver) === 1;
    const isShadowedByValueDeclaration = new RegExp(
      `\\b(?:const|let|var)\\s+${escaped}\\b`,
    ).test(maskedContents);
    return isUniqueImportedReceiver && !isShadowedByValueDeclaration
      ? { ...scope, start: 0, end: maskedContents.length }
      : scope;
  });
}

interface MemberToolRegistration {
  readonly receiver: string;
  readonly index: number;
  readonly end: number;
  readonly declaration: string;
  readonly maskedDeclaration: string;
}

function memberToolRegistrations(
  contents: string,
  maskedContents: string,
): readonly MemberToolRegistration[] {
  const apiParameterScopes = importedApiParameterScopes(contents, maskedContents);
  const registrations: MemberToolRegistration[] = [];
  for (const registration of maskedContents.matchAll(MEMBER_TOOL_REGISTRATION_PATTERN)) {
    const receiver = registration[1];
    const registrationIndex = registration.index ?? 0;
    if (
      !receiver ||
      !apiParameterScopes.some(
        (scope) =>
          scope.receiver === receiver &&
          registrationIndex >= scope.start &&
          registrationIndex < scope.end,
      )
    ) {
      continue;
    }
    const openParen = (registration.index ?? 0) + registration[0].lastIndexOf('(');
    const lineStart = maskedContents.lastIndexOf('\n', registrationIndex - 1) + 1;
    const indentation = maskedContents.slice(lineStart, registrationIndex).match(/^\s*/)?.[0] ?? '';
    const formattedClose = new RegExp(
      `^${indentation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\);?\\s*$`,
      'gm',
    );
    formattedClose.lastIndex = registrationIndex;
    const close = formattedClose.exec(maskedContents);
    const end = close
      ? (close.index ?? 0) + close[0].length
      : matchingCallEnd(maskedContents, openParen);
    if (end === null) continue;
    registrations.push({
      receiver,
      index: registrationIndex,
      end,
      declaration: contents.slice(registration.index, end),
      maskedDeclaration: maskedContents.slice(registration.index, end),
    });
  }
  return registrations;
}

/**
 * Establishes a bounded model-facing member-tool path: the registered handler parameter (or a
 * local alias) reaches an import-resolved mutation/execution call, directly or through one unique
 * local helper. Constants, read-only helpers, external middleware and deeper call graphs abstain.
 */
export function registeredToolParameterSideEffects(
  file: LlmSourceFile,
  includeControlled = false,
): readonly RegisteredToolParameterSideEffect[] {
  if (isExcludedSourcePath(file.path)) return [];
  const maskedContents = maskNonCode(file.contents);
  const bindings = observableSideEffectBindings(file.contents, maskedContents);
  const helpers = localParameterSideEffectHelpers(
    file.contents,
    maskedContents,
    bindings,
  );
  const findings: RegisteredToolParameterSideEffect[] = [];

  for (const registration of memberToolRegistrations(file.contents, maskedContents)) {
    if (!/\bparameters\s*:/.test(registration.maskedDeclaration)) continue;
    const handler = registeredToolHandler(registration);
    if (!handler) continue;
    const tainted = boundedTaintedIdentifiers(
      handler.body,
      handler.modelInputIdentifiers,
      bindings,
      helpers,
    );
    const executableTaint = boundedExecutableIdentifiers(
      handler.body,
      handler.modelInputIdentifiers,
    );
    const directCalls = observableSideEffectCalls(handler.body, bindings)
      .filter((call) => containsAnyIdentifier(call.argumentsText, tainted))
      .map((call) => ({
        index: call.index,
        kind: call.kind,
        depth: -1 as const,
        mutationWitness: true,
        argumentsText: call.argumentsText,
      }));
    const helperCalls = helperCallSideEffects(handler.body, tainted, helpers);
    const sideEffects = [...directCalls, ...helperCalls]
      .filter((sideEffect) => {
        if (sideEffect.kind === 'filesystem') return true;
        if (
          /\b(?:action|operation)\s*:\s*Type\.(?:String|Union|Literal)\s*\(/i.test(
            registration.maskedDeclaration,
          ) &&
          [...handler.modelInputIdentifiers].some((identifier) =>
            new RegExp(
              `\\b${escapeRegExp(identifier)}\\.(?:action|operation)\\b`,
              'i',
            ).test(handler.body)
          )
        ) {
          return true;
        }
        if (sideEffect.depth === -1) {
          return true;
        }
        if (sideEffect.mutationWitness) return true;
        const localContext = handler.body.slice(
          Math.max(0, sideEffect.index - 1800),
          sideEffect.index + sideEffect.argumentsText.length,
        );
        const fixedOperations = fixedArrayOperationNames(localContext);
        const hasNonReadOnlyOperation = fixedOperations.some(
          (operation) => !NON_MUTATING_OR_INDETERMINATE_OPERATIONS.has(operation),
        );
        return (
          hasNonReadOnlyOperation ||
          /(?:location\.href\s*=|window\.open\s*\(|\.scrollBy\s*\(|Input\.dispatch|\/json\/close\/)/.test(
            localContext,
          )
        );
      })
      .sort((left, right) => left.index - right.index);
    if (sideEffects.length === 0) continue;

    const first = sideEffects[0];
    if (!first) continue;
    const beforeSideEffect = handler.body.slice(0, first.index);
    if (
      APPROVAL_FAIL_CLOSED_PATTERN.test(beforeSideEffect) ||
      ALLOWLIST_FAIL_CLOSED_PATTERN.test(beforeSideEffect)
    ) {
      if (!includeControlled) continue;
    }

    let materializedExecution = false;
    let materializedExecutionIndex: number | null = null;
    if (first.kind === 'filesystem') {
      const taintedWrites = observableSideEffectCalls(handler.body, bindings)
        .filter(
          (call) =>
            call.kind === 'filesystem' &&
            containsAnyIdentifier(call.argumentsText, tainted),
        );
      for (const write of taintedWrites) {
        const writtenPath = splitTopLevelArguments(write.argumentsText)[0]
          ?.trim()
          .match(/^([A-Za-z_$][\w$]*)$/)?.[1];
        if (!writtenPath) continue;
        const laterExecution = observableSideEffectCalls(handler.body, bindings).some(
          (call) =>
            call.kind === 'process' &&
            call.index > write.index &&
            new RegExp(`\\b${escapeRegExp(writtenPath)}\\b`).test(call.argumentsText),
        );
        if (laterExecution) {
          materializedExecution = true;
          const argumentsStart = handler.body.indexOf(write.argumentsText, write.index);
          if (argumentsStart >= 0) {
            const executableIdentifiers = [...executableTaint];
            const commandLikeIdentifiers = executableIdentifiers.filter((identifier) =>
              /(?:command|cmd|code|script|shell)/i.test(identifier)
            );
            const anchorIdentifiers = commandLikeIdentifiers.length > 0
              ? commandLikeIdentifiers
              : executableIdentifiers;
            const executableOccurrences = anchorIdentifiers.flatMap((identifier) => {
              const match = new RegExp(`\\b${escapeRegExp(identifier)}\\b`).exec(
                write.argumentsText,
              );
              return match?.index === undefined ? [] : [argumentsStart + match.index];
            });
            if (executableOccurrences.length > 0) {
              materializedExecutionIndex = Math.min(...executableOccurrences);
            }
          }
          break;
        }
      }
    }

    const selectedSideEffects = [
      materializedExecutionIndex === null
        ? first
        : { ...first, index: materializedExecutionIndex },
      ...(first.kind === 'filesystem'
        ? sideEffects.slice(1).filter((sideEffect) => sideEffect.kind === 'filesystem').slice(0, 1)
        : []),
    ];
    selectedSideEffects.forEach((sideEffect, sideEffectIndex) => {
      findings.push({
        registrationIndex: registration.index,
        sideEffectIndex: registration.index + handler.bodyOffset + sideEffect.index,
        kind: sideEffect.kind,
        executesModelInput:
          materializedExecution ||
          (sideEffect.kind === 'process' &&
            sideEffect.depth <= 0 &&
            containsAnyIdentifier(sideEffect.argumentsText, executableTaint)),
        primaryForRegistration: sideEffectIndex === 0,
      });
    });
  }
  return findings;
}

function registeredToolSideEffectSurface(file: LlmSourceFile): boolean {
  return registeredToolParameterSideEffects(file, true).length > 0;
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
  for (const sideEffect of registeredToolParameterSideEffects(file)) {
    findings.push(
      finding(
        'LLM-AGY-001',
        file,
        sideEffect.primaryForRegistration
          ? sideEffect.registrationIndex
          : sideEffect.sideEffectIndex,
        'critical',
        `A locally registered model-facing tool passes handler input to an import-resolved side effect without an observable fail-closed allowlist or human approval gate.`,
        'Registered tool input reaches an import-resolved side-effecting operation',
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
      'A complete local tool declaration passes a recognized handler parameter or bounded alias to an import-resolved Node filesystem or child-process mutation API, directly or through one unique local helper, without a preceding fail-closed approval or operation-allowlist guard.',
    exclusions: [
      'Read-only and pure tools',
      'Unbound business-operation names whose side effects cannot be established locally',
      'Dynamic or remotely supplied registries and policy middleware',
      'Tool declarations not observably exposed to a model or agent',
      'Generic registerTool calls or agent objects without an import-resolved supported model call',
      'Registered handlers whose model-facing input does not reach the supported side effect',
      'Helpers deeper than one locally resolved call',
    ],
    applies: hasSideEffectingToolSurface,
    detect: detectSideEffectingToolWithoutAuthorityBoundary,
  },
];
