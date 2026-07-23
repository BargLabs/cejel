import type {
  CejelLlmConfidence,
  CejelLlmEnabledRuleId,
  CejelLlmFinding,
} from './types.js';
import { supportedJavaScriptModelCallIndices } from './javascript-integrations.js';
import { maskJavaScriptNonCode } from './lexical.js';

export interface LlmSourceFile {
  readonly path: string;
  readonly contents: string;
}

export interface LlmRuleDefinition {
  readonly id: CejelLlmEnabledRuleId;
  readonly title: string;
  readonly detectorConfidence: CejelLlmConfidence;
  readonly evidenceContract: string;
  readonly exclusions: readonly string[];
  applies(file: LlmSourceFile): boolean;
  detect(file: LlmSourceFile): readonly CejelLlmFinding[];
}

const MODEL_OUTPUT_PATTERN =
  /(?:\.output_text\b|\.choices\s*\[[^\]]+\]\s*\.message\s*\.content\b|\.content\s*\[[^\]]+\]\s*\.text\b)/;
const MODEL_CALL_PATTERN =
  /(?:\.responses\.create\s*\(|\.chat\.completions\.create\s*\(|\.messages\.create\s*\(|\bgenerateText\s*\(|\bstreamText\s*\()/;

interface DangerousSink {
  readonly name: string;
  readonly pattern: RegExp;
  readonly severity: CejelLlmFinding['severity'];
}

const BASE_DANGEROUS_SINKS: readonly DangerousSink[] = [
  {
    name: 'dynamic evaluation',
    pattern: /(?<![.\w$])(?:eval|Function)\s*\(/,
    severity: 'critical',
  },
  {
    name: 'raw HTML assignment',
    pattern: /(?:\.innerHTML\s*=|dangerouslySetInnerHTML\s*=)/,
    severity: 'warning',
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function importedProcessSinks(contents: string, maskedContents: string): readonly DangerousSink[] {
  const identifiers = new Set<string>();
  const namespaces = new Set<string>();
  const childProcessMembers = new Set(['exec', 'execSync', 'spawn', 'spawnSync']);

  for (const match of contents.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"](?:node:)?child_process['"]/g,
  )) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    for (const member of (match[1] ?? '').split(',')) {
      const binding = member.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (binding?.[1] && childProcessMembers.has(binding[1])) identifiers.add(binding[2] ?? binding[1]);
    }
  }
  for (const match of contents.matchAll(
    /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*['"](?:node:)?child_process['"]/g,
  )) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    if (match[1]) namespaces.add(match[1]);
  }
  for (const match of contents.matchAll(
    /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/g,
  )) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    for (const member of (match[1] ?? '').split(',')) {
      const binding = member.trim().match(/^([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?$/);
      if (binding?.[1] && childProcessMembers.has(binding[1])) identifiers.add(binding[2] ?? binding[1]);
    }
  }
  for (const match of contents.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/g,
  )) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    if (match[1]) namespaces.add(match[1]);
  }
  for (const match of contents.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"]execa['"]/g,
  )) {
    if ((maskedContents[match.index] ?? ' ') === ' ') continue;
    for (const member of (match[1] ?? '').split(',')) {
      const binding = member.trim().match(/^(execa)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (binding?.[1]) identifiers.add(binding[2] ?? binding[1]);
    }
  }

  const alternatives = [
    ...[...identifiers].map((identifier) => `(?<![.\\w$])${escapeRegExp(identifier)}`),
    ...[...namespaces].map(
      (namespace) => `\\b${escapeRegExp(namespace)}\\.(?:exec|execSync|spawn|spawnSync)`,
    ),
  ];
  return alternatives.length === 0
    ? []
    : [{
        name: 'shell execution',
        pattern: new RegExp(`(?:${alternatives.join('|')})\\s*\\(`),
        severity: 'critical',
      }];
}

const SENSITIVE_ENV_PATTERN =
  /process\.env\.(?:[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|PRIVATE_KEY|DATABASE_URL|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|SESSION_TOKEN)[A-Z0-9_]*)\b/;
const UNBOUNDED_LOOP_PATTERN = /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/g;
const IDENTIFIER_ASSIGNMENT_PATTERN =
  /^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;

function isExcludedSourcePath(path: string): boolean {
  return (
    /(?:^|\/)(?:__tests__|test|tests|fixtures?|examples?|vendor|generated)(?:\/|$)/i.test(
      path,
    ) || /\.(?:test|spec|fixture)\.[cm]?[jt]sx?$/i.test(path)
  );
}

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split('\n').length;
}

function finding(
  ruleId: CejelLlmEnabledRuleId,
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

function containsIdentifier(expression: string, identifiers: ReadonlySet<string>): boolean {
  for (const identifier of identifiers) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(expression)) return true;
  }
  return false;
}

function visibleOutputIdentifiers(scopes: readonly ReadonlyMap<string, boolean>[]): ReadonlySet<string> {
  const visible = new Map<string, boolean>();
  for (const scope of scopes) for (const [identifier, output] of scope) visible.set(identifier, output);
  return new Set([...visible].filter(([, output]) => output).map(([identifier]) => identifier));
}

function expressionContainsBoundModelOutput(
  expression: string,
  boundIdentifiers: ReadonlySet<string>,
): boolean {
  const normalized = expression.trim().replace(/;$/, '').trim();
  const output = normalized.match(MODEL_OUTPUT_PATTERN);
  if (!output || output.index === undefined) return false;
  const receiver = normalized.slice(0, output.index);
  const identifier = receiver.match(/([A-Za-z_$][\w$]*)[.\[\]\w$\s]*$/)?.[1];
  return Boolean(identifier && boundIdentifiers.has(identifier));
}

function detectUnsafeSink(file: LlmSourceFile): readonly CejelLlmFinding[] {
  if (isExcludedSourcePath(file.path)) return [];
  const maskedContents = maskJavaScriptNonCode(file.contents);
  const scopes: Map<string, boolean>[] = [new Map()];
  const dangerousSinks = [
    ...BASE_DANGEROUS_SINKS,
    ...importedProcessSinks(file.contents, maskedContents),
  ];
  const findings: CejelLlmFinding[] = [];
  const supportedCallIndices = supportedJavaScriptModelCallIndices(file.contents);
  let offset = 0;

  for (const line of maskedContents.split('\n')) {
    const assignment = line.match(IDENTIFIER_ASSIGNMENT_PATTERN);
    const identifier = assignment?.[1];
    const expression = assignment?.[2];
    const visibleBeforeAssignment = visibleOutputIdentifiers(scopes);
    if (identifier && expression) {
      const lineHasSupportedResponseAssignment = [...supportedCallIndices].some(
        (index) => offset <= index && index < offset + line.length,
      );
      scopes.at(-1)?.set(
        identifier,
        lineHasSupportedResponseAssignment ||
          expressionContainsBoundModelOutput(expression, visibleBeforeAssignment),
      );
    }
    const outputIdentifiers = visibleOutputIdentifiers(scopes);
    for (const sink of dangerousSinks) {
      const sinkMatch = line.match(sink.pattern);
      if (!sinkMatch) continue;
      const containsModelOutput =
        expressionContainsBoundModelOutput(line, outputIdentifiers) ||
        containsIdentifier(line, outputIdentifiers);
      if (!containsModelOutput) continue;

      findings.push(
        finding(
          'LLM-IOH-001',
          file,
          offset + (sinkMatch.index ?? 0),
          sink.severity,
          `Observable model output is passed directly to ${sink.name}.`,
          `Model output reaches ${sink.name}`,
          'high',
        ),
      );
    }
    for (const character of line) {
      if (character === '{') scopes.push(new Map());
      else if (character === '}' && scopes.length > 1) scopes.pop();
    }
    offset += line.length + 1;
  }
  return findings;
}

function matchingDelimiterEnd(
  contents: string,
  start: number,
  open: '(' | '{',
  close: ')' | '}',
): number | null {
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < contents.length; index += 1) {
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
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
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
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function detectUnboundedLoop(file: LlmSourceFile): readonly CejelLlmFinding[] {
  if (isExcludedSourcePath(file.path)) return [];

  const maskedContents = maskJavaScriptNonCode(file.contents);
  const findings: CejelLlmFinding[] = [];
  for (const match of maskedContents.matchAll(UNBOUNDED_LOOP_PATTERN)) {
    let bodyStart = match.index + match[0].length;
    while (/\s/.test(maskedContents[bodyStart] ?? '')) bodyStart += 1;
    if (maskedContents[bodyStart] !== '{') continue;
    const bodyEnd = matchingDelimiterEnd(maskedContents, bodyStart, '{', '}');
    if (bodyEnd === null) continue;
    const supportedCalls = supportedJavaScriptModelCallIndices(file.contents);
    if (![...supportedCalls].some((index) => bodyStart < index && index < bodyEnd)) continue;
    findings.push(
      finding(
        'LLM-AGY-002',
        file,
        match.index,
        'warning',
        'A recognized model call occurs inside a literal unconditional loop; no static step bound is observable.',
        'Model call inside unconditional loop body',
        'medium',
      ),
    );
  }
  return findings;
}

function modelCallArguments(
  contents: string,
): readonly { readonly text: string; readonly index: number }[] {
  const calls: { text: string; index: number }[] = [];
  const masked = maskJavaScriptNonCode(contents);
  const supportedCalls = supportedJavaScriptModelCallIndices(contents);
  for (const match of masked.matchAll(new RegExp(MODEL_CALL_PATTERN, 'g'))) {
    if (!supportedCalls.has(match.index)) continue;
    const openParen = match.index + match[0].lastIndexOf('(');
    const end = matchingDelimiterEnd(contents, openParen, '(', ')');
    if (end === null) continue;
    calls.push({ text: contents.slice(openParen + 1, end - 1), index: openParen + 1 });
  }
  return calls;
}

function detectSensitivePromptData(file: LlmSourceFile): readonly CejelLlmFinding[] {
  if (isExcludedSourcePath(file.path)) return [];
  const findings: CejelLlmFinding[] = [];
  for (const call of modelCallArguments(file.contents)) {
    const masked = maskJavaScriptNonCode(call.text);
    const candidates = [...call.text.matchAll(new RegExp(SENSITIVE_ENV_PATTERN, 'g'))];
    const sensitive = candidates.find((candidate) => {
      const index = candidate.index;
      if (index === undefined) return false;
      if ((masked[index] ?? ' ') !== ' ') return true;
      const prefix = call.text.slice(0, index);
      const backticks = [...prefix.matchAll(/(?<!\\)`/g)].length;
      return backticks % 2 === 1 && prefix.lastIndexOf('${') > prefix.lastIndexOf('}');
    });
    if (!sensitive) continue;
    const relativeIndex = sensitive.index ?? 0;
    findings.push(
      finding(
        'LLM-DAT-001',
        file,
        call.index + relativeIndex,
        'critical',
        'A secret-like environment value is placed directly in a model request.',
        `Sensitive environment value ${sensitive[0]} in model request`,
        'high',
      ),
    );
  }
  return findings;
}

function hasUnsafeSinkSurface(file: LlmSourceFile): boolean {
  return detectUnsafeSink(file).length > 0;
}

export const CEJEL_LLM_V1_RULES: readonly LlmRuleDefinition[] = [
  {
    id: 'LLM-IOH-001',
    title: 'Model output passed to a consequential sink',
    detectorConfidence: 'high',
    evidenceContract:
      'A supported model-output expression, or an identifier whose latest assignment in the visible lexical scope is directly from one, appears on the same line as a supported sink; process sinks additionally require a recognized local import or require binding.',
    exclusions: [
      'Inter-procedural data flow',
      'Identifiers transformed, reassigned, or referenced outside their observable lexical scope',
      'Method calls named exec without recognized child_process or execa import evidence, including RegExp.prototype.exec',
      'Sinks other than the enumerated dynamic-evaluation, shell, and raw-HTML forms',
    ],
    applies: hasUnsafeSinkSurface,
    detect: detectUnsafeSink,
  },
  {
    id: 'LLM-AGY-002',
    title: 'Unbounded agent loop',
    detectorConfidence: 'medium',
    evidenceContract:
      'A literal while(true) or for(;;) loop has a complete local brace-delimited body containing a recognized model call.',
    exclusions: [
      'Loops bounded by runtime controls outside the source file',
      'Framework-specific iteration limits not visible in the loop syntax',
    ],
    applies: (file) => detectUnboundedLoop(file).length > 0,
    detect: detectUnboundedLoop,
  },
  {
    id: 'LLM-DAT-001',
    title: 'Sensitive data passed to a model request',
    detectorConfidence: 'high',
    evidenceContract:
      'A narrowly named secret-like process.env value occurs inside the executable, syntactically matched arguments of a recognized model call; comments and string-literal lookalikes are masked before call extraction.',
    exclusions: [
      'Provider API keys used only to construct a client',
      'Sensitive values passed through helpers or aliases',
      'General personal-data classification',
    ],
    applies: (file) => detectSensitivePromptData(file).length > 0,
    detect: detectSensitivePromptData,
  },
];
