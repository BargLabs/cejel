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

function isDirectPythonModelOutputAssignment(expression: string): boolean {
  const normalized = expression.trim();
  const output = normalized.match(PYTHON_MODEL_OUTPUT_PATTERN);
  if (!output || output.index === undefined) return false;
  const receiver = normalized.slice(0, output.index);
  const trailing = normalized.slice(output.index + output[0].length);
  return /^[A-Za-z_][A-Za-z0-9_.\[\]\s]*$/.test(receiver) && trailing.trim().length === 0;
}

export function hasSupportedPythonLlmIntegration(file: LlmSourceFile): boolean {
  const maskedContents = maskPythonNonCode(file.contents);
  return (
    !isExcludedSourcePath(file.path) &&
    PYTHON_INTEGRATION_PATTERN.test(maskedContents) &&
    PYTHON_MODEL_CALL_PATTERN.test(maskedContents)
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
  let offset = 0;

  for (const line of maskedContents.split('\n')) {
    const indentation = line.match(/^\s*/)?.[0].length ?? 0;
    if (line.trim().length > 0) {
      while (scopes.length > 1 && indentation <= (scopes.at(-1)?.indent ?? -1)) scopes.pop();
    }
    const assignment = line.match(PYTHON_IDENTIFIER_ASSIGNMENT_PATTERN);
    const identifier = assignment?.[1];
    const expression = assignment?.[2];
    if (identifier && expression) {
      scopes.at(-1)?.aliases.set(identifier, isDirectPythonModelOutputAssignment(expression));
    }
    const outputIdentifiers = visiblePythonOutputIdentifiers(scopes);
    for (const sink of PYTHON_DANGEROUS_SINKS) {
      const sinkMatch = line.match(sink.pattern);
      if (!sinkMatch) continue;
      if (
        !PYTHON_MODEL_OUTPUT_PATTERN.test(line) &&
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
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const loop = line.match(/^(\s*)while\s+True\s*:\s*(?:#.*)?$/);
    if (!loop) {
      offset += line.length + 1;
      continue;
    }
    const loopIndent = loop[1]?.length ?? 0;
    const body: string[] = [];
    for (let bodyIndex = lineIndex + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const candidate = lines[bodyIndex] ?? '';
      if (candidate.trim().length === 0 || candidate.trimStart().startsWith('#')) {
        body.push(candidate);
        continue;
      }
      const indent = candidate.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= loopIndent) break;
      body.push(candidate);
    }
    if (!PYTHON_MODEL_CALL_PATTERN.test(body.join('\n'))) {
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
  for (const match of masked.matchAll(new RegExp(PYTHON_MODEL_CALL_PATTERN, 'g'))) {
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
