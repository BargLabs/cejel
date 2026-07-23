import type { LlmRuleDefinition, LlmSourceFile } from './rules.js';
import { maskPythonNonCode } from './lexical.js';
import type {
  CejelLlmConfidence,
  CejelLlmEnabledRuleId,
  CejelLlmFinding,
} from './types.js';

const PYTHON_INTEGRATION_PATTERN =
  /(?:^|\n)\s*(?:from\s+(?:openai|anthropic)\s+import\s+|import\s+(?:openai|anthropic)\b)/;
const PYTHON_MODEL_CALL_PATTERN =
  /\.(?:responses\.create|chat\.completions\.create|messages\.create)\s*\(/;
const PYTHON_MODEL_OUTPUT_PATTERN =
  /(?:\.output_text\b|\.choices\s*\[[^\]]+\]\s*\.message\.content\b|\.content\s*\[[^\]]+\]\s*\.text\b)/;
const PYTHON_IDENTIFIER_ASSIGNMENT_PATTERN =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;
const PYTHON_SENSITIVE_ENV_PATTERN =
  /(?:os\.environ\s*\[\s*['"]([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|PRIVATE_KEY|DATABASE_URL|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|SESSION_TOKEN)[A-Z0-9_]*)['"]\s*\]|os\.getenv\(\s*['"]([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|PRIVATE_KEY|DATABASE_URL|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|SESSION_TOKEN)[A-Z0-9_]*)['"])/;

const PYTHON_DANGEROUS_SINKS: readonly {
  readonly name: string;
  readonly pattern: RegExp;
}[] = [
  { name: 'dynamic evaluation', pattern: /(?<![.\w])(?:eval|exec)\s*\(/ },
  { name: 'shell execution', pattern: /\bos\.system\s*\(/ },
  {
    name: 'subprocess execution',
    pattern: /\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(/,
  },
];

interface PythonSdkImports {
  readonly constructors: ReadonlySet<string>;
  readonly modules: ReadonlySet<string>;
}

function pythonSdkImports(masked: string): PythonSdkImports {
  const constructors = new Set<string>();
  const modules = new Set<string>();
  for (const match of masked.matchAll(
    /(?:^|\n)\s*from\s+(openai|anthropic)\s+import\s+(OpenAI|Anthropic)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/g,
  )) {
    if (match[2]) constructors.add(match[3] ?? match[2]);
  }
  for (const match of masked.matchAll(
    /(?:^|\n)\s*import\s+(openai|anthropic)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/g,
  )) {
    if (match[1]) modules.add(match[2] ?? match[1]);
  }
  return { constructors, modules };
}

function pythonParameters(line: string): readonly string[] {
  const parameters = line.match(/^\s*(?:async\s+)?def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/)?.[1];
  if (parameters === undefined) return [];
  return parameters.split(',').flatMap((parameter) => {
    const name = parameter.trim().match(/^(?:\*{1,2})?([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
    return name ? [name] : [];
  });
}

export function supportedPythonModelCallIndices(contents: string): ReadonlySet<number> {
  const masked = maskPythonNonCode(contents);
  const imports = pythonSdkImports(masked);
  type PythonBinding = 'client' | 'constructor' | 'module' | 'other';
  const scopes: { indent: number; bindings: Map<string, PythonBinding> }[] = [
    {
      indent: -1,
      bindings: new Map([
        ...[...imports.modules].map((name) => [name, 'module'] as const),
        ...[...imports.constructors].map((name) => [name, 'constructor'] as const),
      ]),
    },
  ];
  const indices = new Set<number>();
  let offset = 0;
  const visibleBinding = (name: string): PythonBinding | undefined => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const value = scopes[index]?.bindings.get(name);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  for (const line of masked.split('\n')) {
    const indentation = line.match(/^\s*/)?.[0].length ?? 0;
    if (line.trim().length > 0) {
      while (scopes.length > 1 && indentation <= (scopes.at(-1)?.indent ?? -1)) scopes.pop();
    }
    let statementOffset = 0;
    for (const statement of line.split(';')) {
      for (const match of statement.matchAll(new RegExp(PYTHON_MODEL_CALL_PATTERN, 'g'))) {
        const prefix = statement.slice(0, match.index);
        const receiver = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/)?.[1];
        const directConstructor = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*$/)?.[1];
        const receiverBinding = receiver ? visibleBinding(receiver) : undefined;
        if (
          receiverBinding === 'client' || receiverBinding === 'module' ||
          (directConstructor && visibleBinding(directConstructor) === 'constructor')
        ) {
          indices.add(offset + statementOffset + match.index);
        }
      }
      const assignment = statement.match(PYTHON_IDENTIFIER_ASSIGNMENT_PATTERN);
      const identifier = assignment?.[1];
      const expression = assignment?.[2]?.trim() ?? '';
      if (identifier) {
        const constructor = [...imports.constructors].some((name) =>
          visibleBinding(name) === 'constructor' && new RegExp(`^${name}\\s*\\(`).test(expression),
        );
        const moduleConstructor = [...imports.modules].some((name) =>
          visibleBinding(name) === 'module' &&
            new RegExp(`^${name}\\.(?:OpenAI|Anthropic)\\s*\\(`).test(expression),
        );
        scopes.at(-1)?.bindings.set(
          identifier,
          constructor || moduleConstructor ? 'client' : 'other',
        );
      }
      statementOffset += statement.length + 1;
    }
    const parameters = pythonParameters(line);
    if (parameters.length > 0) {
      scopes.push({
        indent: indentation,
        bindings: new Map(parameters.map((name) => [name, 'other'] as const)),
      });
    } else if (/^\s*class\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(line)) {
      scopes.push({ indent: indentation, bindings: new Map() });
    }
    offset += line.length + 1;
  }
  return indices;
}

function isExcludedSourcePath(path: string): boolean {
  return (
    /(?:^|\/)(?:__tests__|test|tests|fixtures?|examples?|vendor|generated)(?:\/|$)/i.test(
      path,
    ) || /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i.test(path)
  );
}

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split('\n').length;
}

function pythonFinding(
  ruleId: CejelLlmEnabledRuleId,
  file: LlmSourceFile,
  index: number,
  severity: CejelLlmFinding['severity'],
  confidence: CejelLlmConfidence,
  summary: string,
  label: string,
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

function containsIdentifier(expression: string, identifiers: ReadonlySet<string>): boolean {
  for (const identifier of identifiers) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(expression)) return true;
  }
  return false;
}

function visiblePythonOutputIdentifiers(
  scopes: readonly { readonly aliases: ReadonlyMap<string, boolean> }[],
): ReadonlySet<string> {
  const visible = new Map<string, boolean>();
  for (const scope of scopes) {
    for (const [identifier, output] of scope.aliases) visible.set(identifier, output);
  }
  return new Set([...visible].filter(([, output]) => output).map(([identifier]) => identifier));
}

function expressionContainsBoundPythonModelOutput(
  expression: string,
  boundIdentifiers: ReadonlySet<string>,
): boolean {
  const normalized = expression.trim();
  const output = normalized.match(PYTHON_MODEL_OUTPUT_PATTERN);
  if (!output || output.index === undefined) return false;
  const receiver = normalized.slice(0, output.index);
  const identifier = receiver.match(/([A-Za-z_][A-Za-z0-9_]*)[.\[\]\w\s]*$/)?.[1];
  return Boolean(identifier && boundIdentifiers.has(identifier));
}

export function hasSupportedPythonLlmIntegration(file: LlmSourceFile): boolean {
  const maskedContents = maskPythonNonCode(file.contents);
  return (
    !isExcludedSourcePath(file.path) &&
    PYTHON_INTEGRATION_PATTERN.test(maskedContents) &&
    supportedPythonModelCallIndices(file.contents).size > 0
  );
}

export function detectPythonUnsafeModelOutputSink(
  file: LlmSourceFile,
): readonly CejelLlmFinding[] {
  if (!hasSupportedPythonLlmIntegration(file)) return [];
  const maskedContents = maskPythonNonCode(file.contents);
  const scopes: { indent: number; aliases: Map<string, boolean> }[] = [
    { indent: -1, aliases: new Map() },
  ];
  const findings: CejelLlmFinding[] = [];
  const supportedCalls = supportedPythonModelCallIndices(file.contents);
  let offset = 0;

  for (const line of maskedContents.split('\n')) {
    const indentation = line.match(/^\s*/)?.[0].length ?? 0;
    if (line.trim().length > 0) {
      while (scopes.length > 1 && indentation <= (scopes.at(-1)?.indent ?? -1)) scopes.pop();
    }
    const assignment = line.match(PYTHON_IDENTIFIER_ASSIGNMENT_PATTERN);
    const identifier = assignment?.[1];
    const expression = assignment?.[2];
    const visibleBeforeAssignment = visiblePythonOutputIdentifiers(scopes);
    if (identifier && expression) {
      const lineHasSupportedResponseAssignment = [...supportedCalls].some(
        (index) => offset <= index && index < offset + line.length,
      );
      scopes.at(-1)?.aliases.set(
        identifier,
        lineHasSupportedResponseAssignment ||
          expressionContainsBoundPythonModelOutput(expression, visibleBeforeAssignment),
      );
    }
    const outputIdentifiers = visiblePythonOutputIdentifiers(scopes);
    for (const sink of PYTHON_DANGEROUS_SINKS) {
      const sinkMatch = line.match(sink.pattern);
      if (!sinkMatch) continue;
      if (
        !expressionContainsBoundPythonModelOutput(line, outputIdentifiers) &&
        !containsIdentifier(line, outputIdentifiers)
      ) {
        continue;
      }
      findings.push(
        pythonFinding(
          'LLM-IOH-001',
          file,
          offset + (sinkMatch.index ?? 0),
          'critical',
          'high',
          `Observable model output is passed directly to ${sink.name}.`,
          `Model output reaches ${sink.name}`,
        ),
      );
    }
    if (/^\s*(?:(?:async\s+)?def|class)\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(line)) {
      scopes.push({ indent: indentation, aliases: new Map() });
    }
    offset += line.length + 1;
  }
  return findings;
}

export function detectPythonUnboundedAgentLoop(
  file: LlmSourceFile,
): readonly CejelLlmFinding[] {
  if (!hasSupportedPythonLlmIntegration(file)) return [];
  const findings: CejelLlmFinding[] = [];
  const lines = maskPythonNonCode(file.contents).split('\n');
  const supportedCalls = supportedPythonModelCallIndices(file.contents);
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const loop = line.match(/^(\s*)while\s+True\s*:\s*(?:#.*)?$/);
    if (!loop) {
      offset += line.length + 1;
      continue;
    }
    const loopIndent = loop[1]?.length ?? 0;
    const bodyStartOffset = offset + line.length + 1;
    let bodyEndOffset = bodyStartOffset;
    for (let bodyIndex = lineIndex + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const candidate = lines[bodyIndex] ?? '';
      if (candidate.trim().length === 0 || candidate.trimStart().startsWith('#')) {
        bodyEndOffset += candidate.length + 1;
        continue;
      }
      const indent = candidate.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= loopIndent) break;
      bodyEndOffset += candidate.length + 1;
    }
    if (![...supportedCalls].some((index) => bodyStartOffset <= index && index < bodyEndOffset)) {
      offset += line.length + 1;
      continue;
    }
    findings.push(
      pythonFinding(
        'LLM-AGY-002',
        file,
        offset + (line.indexOf('while') >= 0 ? line.indexOf('while') : 0),
        'warning',
        'medium',
        'An official SDK model call occurs inside a literal while True loop; no static step bound is observable.',
        'Model call inside unconditional Python loop body',
      ),
    );
    offset += line.length + 1;
  }
  return findings;
}

function matchingPythonCallEnd(contents: string, openParen: number): number | null {
  let depth = 0;
  let quote: "'" | '"' | "'''" | '"""' | null = null;
  let escaped = false;
  let comment = false;

  for (let index = openParen; index < contents.length; index += 1) {
    const character = contents[index] ?? '';
    if (comment) {
      if (character === '\n') comment = false;
      continue;
    }
    if (quote) {
      if (quote.length === 3 && contents.startsWith(quote, index)) {
        quote = null;
        index += 2;
      } else if (quote.length === 1) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
      }
      continue;
    }
    if (character === '#') {
      comment = true;
      continue;
    }
    const triple = contents.slice(index, index + 3);
    if (triple === "'''" || triple === '"""') {
      quote = triple;
      index += 2;
      continue;
    }
    if (character === "'" || character === '"') {
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

function pythonModelCallArguments(
  contents: string,
): readonly { readonly text: string; readonly index: number }[] {
  const calls: { text: string; index: number }[] = [];
  const masked = maskPythonNonCode(contents);
  const supportedCalls = supportedPythonModelCallIndices(contents);
  for (const match of masked.matchAll(new RegExp(PYTHON_MODEL_CALL_PATTERN, 'g'))) {
    if (!supportedCalls.has(match.index)) continue;
    const openParen = match.index + match[0].lastIndexOf('(');
    const end = matchingPythonCallEnd(contents, openParen);
    if (end === null) continue;
    calls.push({ text: contents.slice(openParen + 1, end - 1), index: openParen + 1 });
  }
  return calls;
}

export function detectPythonSensitivePromptData(
  file: LlmSourceFile,
): readonly CejelLlmFinding[] {
  if (!hasSupportedPythonLlmIntegration(file)) return [];
  const findings: CejelLlmFinding[] = [];
  for (const call of pythonModelCallArguments(file.contents)) {
    const masked = maskPythonNonCode(call.text);
    const sensitive = [...call.text.matchAll(new RegExp(PYTHON_SENSITIVE_ENV_PATTERN, 'g'))].find(
      (candidate) => candidate.index !== undefined && (masked[candidate.index] ?? ' ') !== ' ',
    );
    if (!sensitive) continue;
    const variable = sensitive[1] ?? sensitive[2] ?? 'secret-like environment value';
    findings.push(
      pythonFinding(
        'LLM-DAT-001',
        file,
        call.index + (sensitive.index ?? 0),
        'critical',
        'high',
        'A secret-like environment value is placed directly in a model request.',
        `Sensitive environment value ${variable} in model request`,
      ),
    );
  }
  return findings;
}

export const CEJEL_LLM_PYTHON_RULES: readonly LlmRuleDefinition[] = [
  {
    id: 'LLM-IOH-001',
    title: 'Python model output passed to a consequential sink',
    detectorConfidence: 'high',
    evidenceContract:
      'An official OpenAI or Anthropic Python integration, a supported response-output shape or still-live direct alias in the visible function or class scope, and a direct eval, exec, os.system, or subprocess sink are observable in one non-test source file.',
    exclusions: [
      'Inter-procedural or cross-file data flow',
      'Identifiers transformed or reassigned after model-output extraction',
      'Shell wrappers and sink APIs outside the enumerated Python standard-library forms',
    ],
    applies: (file) => detectPythonUnsafeModelOutputSink(file).length > 0,
    detect: detectPythonUnsafeModelOutputSink,
  },
  {
    id: 'LLM-AGY-002',
    title: 'Unbounded Python agent loop',
    detectorConfidence: 'medium',
    evidenceContract:
      'A literal while True loop has a complete local indentation-delimited body containing an official OpenAI or Anthropic Python SDK model call.',
    exclusions: [
      'Runtime bounds or cancellation enforced outside the source file',
      'Framework-specific iteration controls not visible in loop syntax',
    ],
    applies: (file) => detectPythonUnboundedAgentLoop(file).length > 0,
    detect: detectPythonUnboundedAgentLoop,
  },
  {
    id: 'LLM-DAT-001',
    title: 'Sensitive Python environment data passed to a model request',
    detectorConfidence: 'high',
    evidenceContract:
      'A narrowly named os.environ or os.getenv secret-like value occurs inside the executable, syntactically matched arguments of an official SDK model call after comments and strings are excluded from call extraction.',
    exclusions: [
      'Provider API keys used only for client construction',
      'Values passed through aliases, helpers, or external configuration layers',
      'General personal-data or semantic sensitivity classification',
    ],
    applies: (file) => detectPythonSensitivePromptData(file).length > 0,
    detect: detectPythonSensitivePromptData,
  },
];
