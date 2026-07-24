import { maskPythonNonCode } from './lexical.js';
import type { LlmSourceFile } from './rules.js';
import type { CejelLlmFinding } from './types.js';

interface PythonFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly startLine: number;
  readonly bodyStartLine: number;
  readonly endLine: number;
  readonly className?: string;
  readonly classStartLine?: number;
  readonly classEndLine?: number;
  readonly modelFacing: boolean;
}

const OFFICIAL_SDK_IMPORT =
  /(?:^|\n)\s*(?:from\s+(?:openai|anthropic)\s+import\s+|import\s+(?:openai|anthropic)\b)/;
const MODEL_CALL =
  /\.(?:responses\.create|chat\.completions\.create|messages\.create)\s*\(/;
const MODEL_OUTPUT =
  /(?:\.output_text\b|\.choices\s*\[[^\]]+\]\s*\.message\.content\b|\.content\s*\[[^\]]+\]\s*\.text\b)/;
const DANGEROUS_SINK =
  /(?<![.\w])(?:eval|exec)\s*\(|\bos\.system\s*\(|\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(/;
const CONSEQUENTIAL_ACTION =
  /\b[A-Za-z_][A-Za-z0-9_]*Action\s*\(/;
const CLOSED_VALIDATION =
  /\b(?:model_validate|parse_obj|validate_python|TypeAdapter\s*\([^)]*\)\.validate_python)\s*\(/;

function isExcludedSourcePath(path: string): boolean {
  return (
    /(?:^|\/)(?:__tests__|test|tests|fixtures?|examples?|vendor|generated)(?:\/|$)/i.test(
      path,
    ) || /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i.test(path)
  );
}

function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function parametersFromHeader(header: string): readonly string[] {
  const open = header.indexOf('(');
  const close = header.lastIndexOf(')');
  if (open < 0 || close <= open) return [];
  return header.slice(open + 1, close).split(',').flatMap((raw) => {
    const name = raw.trim().match(/^(?:\*{1,2})?([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
    return name && name !== 'self' && name !== 'cls' ? [name] : [];
  });
}

function pythonFunctions(masked: string): readonly PythonFunction[] {
  const lines = masked.split('\n');
  const classes: {
    readonly name: string;
    readonly indent: number;
    readonly startLine: number;
    readonly endLine: number;
  }[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const declaration = line.match(
      /^(\s*)class\s+([A-Za-z_][A-Za-z0-9_]*)\b[^:]*:/,
    );
    if (!declaration) continue;
    const classIndent = declaration[1]?.length ?? 0;
    let endLine = lines.length;
    for (let later = lineIndex + 1; later < lines.length; later += 1) {
      const candidate = lines[later] ?? '';
      if (candidate.trim().length === 0) continue;
      if (indentation(candidate) <= classIndent) {
        endLine = later;
        break;
      }
    }
    classes.push({
      name: declaration[2] ?? '',
      indent: classIndent,
      startLine: lineIndex,
      endLine,
    });
  }
  const functions: PythonFunction[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const declaration = line.match(
      /^(\s*)(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    );
    if (!declaration) continue;
    let headerEnd = lineIndex;
    let header = line;
    let balance = (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0);
    while (balance > 0 && headerEnd + 1 < lines.length && headerEnd - lineIndex < 40) {
      headerEnd += 1;
      const continuation = lines[headerEnd] ?? '';
      header += `\n${continuation}`;
      balance +=
        (continuation.match(/\(/g)?.length ?? 0) -
        (continuation.match(/\)/g)?.length ?? 0);
    }
    const functionIndent = declaration[1]?.length ?? 0;
    let endLine = lines.length;
    for (let later = headerEnd + 1; later < lines.length; later += 1) {
      const candidate = lines[later] ?? '';
      if (candidate.trim().length === 0) continue;
      if (indentation(candidate) <= functionIndent) {
        endLine = later;
        break;
      }
    }
    const preceding = lines
      .slice(Math.max(0, lineIndex - 3), lineIndex)
      .join('\n');
    const containingClass = classes
      .filter((candidate) =>
        candidate.startLine < lineIndex &&
        lineIndex < candidate.endLine &&
        candidate.indent < functionIndent
      )
      .sort((left, right) => right.indent - left.indent)[0];
    functions.push({
      name: declaration[2] ?? '',
      parameters: parametersFromHeader(header),
      startLine: lineIndex,
      bodyStartLine: headerEnd + 1,
      endLine,
      ...(containingClass
        ? {
            className: containingClass.name,
            classStartLine: containingClass.startLine,
            classEndLine: containingClass.endLine,
          }
        : {}),
      modelFacing: /@(?:[A-Za-z_][A-Za-z0-9_.]*\.)?tool\b/.test(preceding),
    });
    lineIndex = headerEnd;
  }
  return functions;
}

function containsAlias(value: string, aliases: ReadonlySet<string>): boolean {
  for (const alias of aliases) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(value)) {
      return true;
    }
  }
  return false;
}

function topLevelArguments(value: string): readonly string[] {
  const parts: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') round += 1;
    else if (character === ')') round -= 1;
    else if (character === '[') square += 1;
    else if (character === ']') square -= 1;
    else if (character === '{') curly += 1;
    else if (character === '}') curly -= 1;
    else if (character === ',' && round === 0 && square === 0 && curly === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function callArguments(line: string, name: string): readonly string[] | null {
  const pattern = new RegExp(`\\b(?:self\\.)?${name}\\s*\\(`);
  const match = pattern.exec(line);
  if (!match || match.index === undefined) return null;
  const open = match.index + match[0].lastIndexOf('(');
  let depth = 0;
  for (let index = open; index < line.length; index += 1) {
    if (line[index] === '(') depth += 1;
    else if (line[index] === ')') {
      depth -= 1;
      if (depth === 0) return topLevelArguments(line.slice(open + 1, index));
    }
  }
  return null;
}

function assignmentTarget(line: string): string | undefined {
  return line.match(
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(?!=)/,
  )?.[1];
}

function loopTargets(line: string): readonly string[] {
  const match = line.match(
    /^\s*(?:async\s+)?for\s+(.+?)\s+in\s+(.+?)\s*:/,
  );
  if (!match) return [];
  return (match[1] ?? '').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}

function logicalStatement(
  lines: readonly string[],
  startLine: number,
  endLine: number,
): string {
  let statement = lines[startLine] ?? '';
  let balance =
    (statement.match(/[\(\[\{]/g)?.length ?? 0) -
    (statement.match(/[\)\]\}]/g)?.length ?? 0);
  for (
    let lineIndex = startLine + 1;
    balance > 0 && lineIndex < endLine && lineIndex <= startLine + 40;
    lineIndex += 1
  ) {
    const continuation = lines[lineIndex] ?? '';
    statement += `\n${continuation}`;
    balance +=
      (continuation.match(/[\(\[\{]/g)?.length ?? 0) -
      (continuation.match(/[\)\]\}]/g)?.length ?? 0);
  }
  return statement;
}

function modelFacingMethodNames(masked: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of masked.matchAll(
    /(?:yield\s+self\.|(?:tools|functions)\s*=\s*\[[^\]]*self\.|\.append\s*\(\s*\([^,]+,\s*self\.)([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

function finding(
  ruleId: 'LLM-IOH-001' | 'LLM-VAL-001',
  file: LlmSourceFile,
  line: number,
  summary: string,
): CejelLlmFinding {
  return {
    ruleId,
    severity: 'critical',
    confidence: 'high',
    summary,
    evidence: {
      path: file.path,
      line,
      label: ruleId === 'LLM-IOH-001'
        ? 'Model-derived value reaches an unsafe interpreter or execution sink'
        : 'Model-derived value reaches a consequential action without closed validation',
    },
  };
}

/**
 * Bounded, same-file Python lineage. It follows official-SDK model output through local helper
 * calls and treats explicitly registered/decorated tool parameters as model-controlled inputs.
 * It deliberately does not cross modules or infer arbitrary framework magic.
 */
export function detectPythonInterproceduralModelOutput(
  file: LlmSourceFile,
): readonly CejelLlmFinding[] {
  if (!file.path.toLowerCase().endsWith('.py') || isExcludedSourcePath(file.path)) return [];
  const masked = maskPythonNonCode(file.contents);
  const hasOfficialModelCall = OFFICIAL_SDK_IMPORT.test(masked) && MODEL_CALL.test(masked);
  const functions = pythonFunctions(masked);
  if (!hasOfficialModelCall && functions.every((fn) => !fn.modelFacing) &&
      modelFacingMethodNames(masked).size === 0) return [];

  const lines = masked.split('\n');
  const taintedParameters = new Map<PythonFunction, Set<string>>();
  for (const fn of functions) {
    const functionBody = lines.slice(fn.bodyStartLine, fn.endLine).join('\n');
    const registrationScope = lines.slice(
      fn.classStartLine ?? 0,
      fn.classEndLine ?? lines.length,
    ).join('\n');
    const registered = modelFacingMethodNames(registrationScope);
    const semanticModelInputs = hasOfficialModelCall &&
      (DANGEROUS_SINK.test(functionBody) || CONSEQUENTIAL_ACTION.test(functionBody))
      ? fn.parameters.filter((parameter) =>
          /^(?:response|responses|prediction|predictions|model_output|model_response)$/i.test(
            parameter,
          ),
        )
      : [];
    taintedParameters.set(
      fn,
      new Set([
        ...(fn.modelFacing || registered.has(fn.name) ? fn.parameters : []),
        ...semanticModelInputs,
      ]),
    );
  }
  const taintedReturns = new Set<PythonFunction>();

  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    for (const fn of functions) {
      const aliases = new Set(taintedParameters.get(fn) ?? []);
      for (let lineIndex = fn.bodyStartLine; lineIndex < fn.endLine; lineIndex += 1) {
        const line = lines[lineIndex] ?? '';
        const statement = logicalStatement(lines, lineIndex, fn.endLine);
        const target = assignmentTarget(statement);
        const sourceExpression = target ? statement.slice(statement.indexOf('=') + 1) : '';
        const directModelCall = hasOfficialModelCall && MODEL_CALL.test(sourceExpression);
        const modelOutput = MODEL_OUTPUT.test(sourceExpression) &&
          (directModelCall || containsAlias(sourceExpression, aliases));
        let localCallTainted = false;

        for (const callee of functions.filter(
          (candidate) => candidate.className === fn.className,
        )) {
          const args = callArguments(statement, callee.name);
          if (!args) continue;
          const calleeTaints = taintedParameters.get(callee) ?? new Set<string>();
          for (let index = 0; index < args.length; index += 1) {
            const argument = args[index] ?? '';
            if (!containsAlias(argument, aliases)) continue;
            const named = argument.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
            const parameter = named ?? callee.parameters[index];
            if (parameter && !calleeTaints.has(parameter)) {
              calleeTaints.add(parameter);
              changed = true;
            }
          }
          taintedParameters.set(callee, calleeTaints);
          if (taintedReturns.has(callee) && args.some((arg) => containsAlias(arg, aliases))) {
            localCallTainted = true;
          }
          // A local parser/adapter called with model-derived input preserves provenance unless
          // the call itself is an observable closed validator.
          if (
            args.some((arg) => containsAlias(arg, aliases)) &&
            !CLOSED_VALIDATION.test(statement)
          ) localCallTainted = true;
        }

        if (target) {
          const becomesTainted =
            directModelCall ||
            modelOutput ||
            localCallTainted ||
            (containsAlias(sourceExpression, aliases) && !CLOSED_VALIDATION.test(sourceExpression));
          if (becomesTainted) aliases.add(target);
        }

        const loop = statement.match(/^\s*(?:async\s+)?for\s+.+?\s+in\s+(.+?)\s*:/);
        if (loop?.[1] && containsAlias(loop[1], aliases)) {
          for (const loopTarget of loopTargets(line)) aliases.add(loopTarget);
        }

        const returned = statement.match(/^\s*return\s+([\s\S]+)$/)?.[1];
        if (
          returned &&
          (containsAlias(returned, aliases) || localCallTainted) &&
          !taintedReturns.has(fn)
        ) {
          taintedReturns.add(fn);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const findings: CejelLlmFinding[] = [];
  const seen = new Set<string>();
  for (const fn of functions) {
    const aliases = new Set(taintedParameters.get(fn) ?? []);
    const taintedControlDepths: number[] = [];
    const taintedBranchAtDepth = new Map<number, boolean>();
    for (let lineIndex = fn.bodyStartLine; lineIndex < fn.endLine; lineIndex += 1) {
      const line = lines[lineIndex] ?? '';
      const statement = logicalStatement(lines, lineIndex, fn.endLine);
      const lineIndent = indentation(line);
      while (
        taintedControlDepths.length > 0 &&
        (taintedControlDepths.at(-1) ?? -1) >= lineIndent
      ) taintedControlDepths.pop();
      const target = assignmentTarget(statement);
      const expression = target ? statement.slice(statement.indexOf('=') + 1) : '';
      const directModelCall = hasOfficialModelCall && MODEL_CALL.test(expression);
      let callTainted = false;
      for (const callee of functions.filter(
        (candidate) => candidate.className === fn.className,
      )) {
        const args = callArguments(statement, callee.name);
        if (args?.some((arg) => containsAlias(arg, aliases))) callTainted = true;
      }
      if (target) {
        if (
          directModelCall ||
          (MODEL_OUTPUT.test(expression) && containsAlias(expression, aliases)) ||
          callTainted ||
          (containsAlias(expression, aliases) && !CLOSED_VALIDATION.test(expression))
        ) aliases.add(target);
      }
      const loop = statement.match(/^\s*(?:async\s+)?for\s+.+?\s+in\s+(.+?)\s*:/);
      if (loop?.[1] && containsAlias(loop[1], aliases)) {
        for (const loopTarget of loopTargets(line)) aliases.add(loopTarget);
      }
      const conditional = statement.match(
        /^\s*(?:if|elif|while)\s+([\s\S]+?)\s*:/,
      );
      if (conditional) {
        const branchTainted = Boolean(
          conditional[1] && containsAlias(conditional[1], aliases),
        );
        taintedBranchAtDepth.set(lineIndent, branchTainted);
        if (branchTainted) taintedControlDepths.push(lineIndent);
      } else if (/^\s*else\s*:/.test(statement)) {
        if (taintedBranchAtDepth.get(lineIndent)) taintedControlDepths.push(lineIndent);
      }
      const directlyTainted = containsAlias(statement, aliases);
      const controlTainted = taintedControlDepths.length > 0 &&
        lineIndent > (taintedControlDepths.at(-1) ?? Number.MAX_SAFE_INTEGER);
      if (!directlyTainted && !controlTainted) continue;
      const lineNumber = lineIndex + 1;
      if (DANGEROUS_SINK.test(statement)) {
        const key = `IOH:${lineNumber}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push(
            finding(
              'LLM-IOH-001',
              file,
              lineNumber,
              'Model-derived data reaches a Python interpreter or command-execution sink.',
            ),
          );
        }
      }
      const write = statement.match(
        /\b(?:write_file|write_text)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([\s\S]+)\)/,
      );
      const writtenPath = write?.[1];
      const writtenContents = write?.[2];
      const laterBody = lines.slice(lineIndex + 1, fn.endLine).join('\n');
      const scriptMaterialization = Boolean(
        writtenPath &&
        writtenContents &&
        containsAlias(writtenContents, aliases) &&
        new RegExp(
          `\\b(?:execute|run)[A-Za-z0-9_]*file\\s*\\(\\s*${writtenPath}\\b`,
          'i',
        ).test(laterBody),
      );
      if (scriptMaterialization) {
        const key = `IOH:${lineNumber}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push(
            finding(
              'LLM-IOH-001',
              file,
              lineNumber,
              'Model-derived code is materialized to a file that is subsequently executed.',
            ),
          );
        }
      }
      if (CONSEQUENTIAL_ACTION.test(statement) && !CLOSED_VALIDATION.test(statement)) {
        const key = `VAL:${lineNumber}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push(
            finding(
              'LLM-VAL-001',
              file,
              lineNumber,
              'Model-derived structured data reaches a consequential action constructor without observable closed validation.',
            ),
          );
        }
      }
    }
  }
  return findings;
}
