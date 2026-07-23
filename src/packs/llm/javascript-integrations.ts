import { maskJavaScriptNonCode } from './lexical.js';

interface ImportedBindings {
  readonly openAiClasses: ReadonlySet<string>;
  readonly anthropicClasses: ReadonlySet<string>;
  readonly vercelCalls: ReadonlySet<string>;
}

interface FunctionScope {
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly parameters: ReadonlySet<string>;
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
  return masked.length;
}

function splitTopLevel(value: string, delimiter: string): readonly string[] {
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
    else if (character === delimiter && round === 0 && square === 0 && curly === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function topLevelCharacter(value: string, sought: string): number {
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
    else if (character === sought && round === 0 && square === 0 && curly === 0) return index;
  }
  return -1;
}

function matchingOpeningDelimiter(value: string, closeIndex: number): number {
  const close = value[closeIndex];
  const open = close === '}' ? '{' : close === ']' ? '[' : '(';
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    if (value[index] === close) depth += 1;
    if (value[index] === open) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function unwrapBindingParentheses(value: string): string {
  let normalized = value.trim();
  while (normalized.startsWith('(') && normalized.endsWith(')')) {
    if (matchingOpeningDelimiter(normalized, normalized.length - 1) !== 0) break;
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function bindingNames(pattern: string): ReadonlySet<string> {
  const names = new Set<string>();
  const collect = (input: string): void => {
    let normalized = unwrapBindingParentheses(input).trim();
    if (normalized.startsWith('...')) normalized = normalized.slice(3).trim();
    const defaultIndex = topLevelCharacter(normalized, '=');
    if (defaultIndex >= 0) normalized = normalized.slice(0, defaultIndex).trim();
    if (normalized.startsWith('[') && normalized.endsWith(']')) {
      for (const element of splitTopLevel(normalized.slice(1, -1), ',')) collect(element);
      return;
    }
    if (normalized.startsWith('{') && normalized.endsWith('}')) {
      for (const property of splitTopLevel(normalized.slice(1, -1), ',')) {
        const colon = topLevelCharacter(property, ':');
        if (colon >= 0) collect(property.slice(colon + 1));
        else collect(property);
      }
      return;
    }
    const identifier = normalized.match(/^[A-Za-z_$][\w$]*$/)?.[0];
    if (identifier) names.add(identifier);
  };
  collect(pattern);
  return names;
}

function parameterNames(parameters: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const parameter of splitTopLevel(parameters, ',')) {
    for (const name of bindingNames(parameter)) names.add(name);
  }
  return names;
}

function destructuringAssignmentEvents(
  masked: string,
  beforeIndex: number,
  identifier: string,
): readonly { readonly index: number; readonly expression?: string }[] {
  const events: { index: number; expression?: string }[] = [];
  const prefix = masked.slice(0, beforeIndex);
  for (let index = 0; index < prefix.length; index += 1) {
    if (
      prefix[index] !== '=' ||
      prefix[index - 1] === '=' ||
      prefix[index + 1] === '=' ||
      prefix[index + 1] === '>' ||
      /[!<>+\-*/%&|^?]/.test(prefix[index - 1] ?? '')
    ) continue;
    let targetEnd = index - 1;
    while (/\s/.test(prefix[targetEnd] ?? '')) targetEnd -= 1;
    if (!['}', ']'].includes(prefix[targetEnd] ?? '')) continue;
    const targetStart = matchingOpeningDelimiter(prefix, targetEnd);
    if (targetStart < 0) continue;
    const target = prefix.slice(targetStart, targetEnd + 1);
    if (bindingNames(target).has(identifier)) {
      events.push({ index: targetStart, expression: undefined });
    }
  }
  return events;
}

function functionScopes(masked: string): readonly FunctionScope[] {
  const scopes: FunctionScope[] = [];
  const patterns = [
    /\b(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)\s*\{/g,
    /(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*\{/g,
    /\b(?:async\s+)?(?!(?:if|for|while|switch|catch|with)\b)[A-Za-z_$][\w$]*\s*\(([^)]*)\)\s*\{/g,
  ];
  for (const pattern of patterns) {
    for (const match of masked.matchAll(pattern)) {
      const relativeBrace = match[0].lastIndexOf('{');
      const bodyStart = match.index + relativeBrace;
      scopes.push({
        bodyStart,
        bodyEnd: matchingBrace(masked, bodyStart),
        parameters: parameterNames(match[1] ?? match[2] ?? ''),
      });
    }
  }
  for (const match of masked.matchAll(
    /(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*(?!\{)/g,
  )) {
    const bodyStart = match.index + match[0].length;
    const tail = masked.slice(bodyStart);
    const terminators = [tail.indexOf(';'), tail.indexOf('\n')].filter(
      (index) => index >= 0,
    );
    const bodyEnd = bodyStart + (terminators.length > 0 ? Math.min(...terminators) : tail.length);
    scopes.push({
      bodyStart,
      bodyEnd,
      parameters: parameterNames(match[1] ?? match[2] ?? ''),
    });
  }
  return scopes;
}

function importedBindings(contents: string): ImportedBindings {
  const openAiClasses = new Set<string>();
  const anthropicClasses = new Set<string>();
  const vercelCalls = new Set<string>();
  const masked = maskJavaScriptNonCode(contents);
  for (const match of contents.matchAll(
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"](openai|@anthropic-ai\/sdk)['"]/g,
  )) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    if (match[2] === 'openai' && match[1]) openAiClasses.add(match[1]);
    if (match[2] === '@anthropic-ai/sdk' && match[1]) anthropicClasses.add(match[1]);
  }
  for (const match of contents.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"](openai|@anthropic-ai\/sdk)['"]\s*\)/g,
  )) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    if (match[2] === 'openai' && match[1]) openAiClasses.add(match[1]);
    if (match[2] === '@anthropic-ai/sdk' && match[1]) anthropicClasses.add(match[1]);
  }
  for (const match of contents.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"]ai['"]/g,
  )) {
    if ((masked[match.index] ?? ' ') === ' ') continue;
    for (const member of (match[1] ?? '').split(',')) {
      const binding = member.trim().match(/^(generateText|streamText)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (binding?.[1]) vercelCalls.add(binding[2] ?? binding[1]);
    }
  }
  return { openAiClasses, anthropicClasses, vercelCalls };
}

export function supportedJavaScriptModelCallIndices(contents: string): ReadonlySet<number> {
  const imports = importedBindings(contents);
  const masked = maskJavaScriptNonCode(contents);
  const indices = new Set<number>();
  const scopes = functionScopes(masked);

  const innermostScopeAt = (index: number): FunctionScope | undefined =>
    scopes
      .filter((scope) => scope.bodyStart < index && index < scope.bodyEnd)
      .sort((left, right) => right.bodyStart - left.bodyStart)[0];

  const bindingEvents = (
    identifier: string,
    beforeIndex: number,
  ): readonly { readonly index: number; readonly expression?: string }[] => {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `\\b(?:const|let|var)\\s+${escaped}\\b(?:\\s*=\\s*(?![=>])([^;\\n]+))?` +
        `|(?<![.$\\w])${escaped}\\s*=\\s*(?![=>])([^;\\n]+)` +
        `|\\b(?:function|class)\\s+${escaped}\\b`,
      'g',
    );
    const directEvents = [...masked.slice(0, beforeIndex).matchAll(pattern)].map((match) => ({
      index: match.index,
      expression: match[1] ?? match[2],
    }));
    const destructuringEvents = destructuringAssignmentEvents(masked, beforeIndex, identifier);
    return [...directEvents, ...destructuringEvents].sort((left, right) => left.index - right.index);
  };

  const visibleScopeChain = (callIndex: number): readonly (FunctionScope | undefined)[] => [
    ...scopes
      .filter((scope) => scope.bodyStart < callIndex && callIndex < scope.bodyEnd)
      .sort((left, right) => right.bodyStart - left.bodyStart),
    undefined,
  ];

  const latestEventInScope = (
    events: readonly { readonly index: number; readonly expression?: string }[],
    scope: FunctionScope | undefined,
  ) => events.filter((event) => innermostScopeAt(event.index) === scope).at(-1);

  const importedBindingIsVisible = (identifier: string, callIndex: number): boolean => {
    const events = bindingEvents(identifier, callIndex);
    for (const scope of visibleScopeChain(callIndex)) {
      if (scope?.parameters.has(identifier)) return false;
      if (latestEventInScope(events, scope)) return false;
    }
    return true;
  };

  const supportedClientBinding = (
    receiver: string,
    classes: ReadonlySet<string>,
    callIndex: number,
  ): boolean => {
    const events = bindingEvents(receiver, callIndex);
    for (const scope of visibleScopeChain(callIndex)) {
      if (scope?.parameters.has(receiver)) return false;
      const event = latestEventInScope(events, scope);
      if (!event) continue;
      if (!event.expression) return false;
      return [...classes].some((className) => {
        const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return (
          new RegExp(`^\\s*new\\s+${escapedClass}\\s*\\(`).test(event.expression ?? '') &&
          importedBindingIsVisible(className, event.index)
        );
      });
    }
    return false;
  };
  for (const match of masked.matchAll(
    /(?:\.responses\.create|\.chat\.completions\.create|\.messages\.create|\b[A-Za-z_$][\w$]*\s*\()/g,
  )) {
    const token = match[0];
    if (!token) continue;
    if (!token.startsWith('.')) {
      const name = token.match(/^([A-Za-z_$][\w$]*)/)?.[1];
      if (
        name &&
        imports.vercelCalls.has(name) &&
        importedBindingIsVisible(name, match.index)
      ) {
        indices.add(match.index);
      }
      continue;
    }
    const prefix = masked.slice(0, match.index);
    const receiver = prefix.match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
    const directClass = prefix.match(/new\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*$/)?.[1];
    if (
      (token.startsWith('.messages.create') &&
        ((receiver &&
          supportedClientBinding(receiver, imports.anthropicClasses, match.index)) ||
          (directClass &&
            imports.anthropicClasses.has(directClass) &&
            importedBindingIsVisible(directClass, match.index)))) ||
      (!token.startsWith('.messages.create') &&
        ((receiver &&
          supportedClientBinding(receiver, imports.openAiClasses, match.index)) ||
          (directClass &&
            imports.openAiClasses.has(directClass) &&
            importedBindingIsVisible(directClass, match.index))))
    ) {
      indices.add(match.index);
    }
  }
  return indices;
}

export function hasSupportedJavaScriptModelCall(contents: string): boolean {
  return supportedJavaScriptModelCallIndices(contents).size > 0;
}
