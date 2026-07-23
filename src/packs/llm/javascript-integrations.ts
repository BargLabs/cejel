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

function parameterNames(parameters: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const parameter of parameters.split(',')) {
    const name = parameter.trim().match(/^(?:\.\.\.\s*)?([A-Za-z_$][\w$]*)/)?.[1];
    if (name) names.add(name);
  }
  return names;
}

function functionScopes(masked: string): readonly FunctionScope[] {
  const scopes: FunctionScope[] = [];
  const patterns = [
    /\b(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)\s*\{/g,
    /(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*\{/g,
    /\b(?:async\s+)?[A-Za-z_$][\w$]*\s*\(([^)]*)\)\s*\{/g,
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

  const importedBindingIsVisible = (identifier: string, callIndex: number): boolean => {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const containingScopes = scopes.filter(
      (scope) => scope.bodyStart < callIndex && callIndex < scope.bodyEnd,
    );
    if (containingScopes.some((scope) => scope.parameters.has(identifier))) return false;
    const innermostStart = containingScopes.reduce(
      (latest, scope) => Math.max(latest, scope.bodyStart),
      0,
    );
    return !new RegExp(
      `\\b(?:const|let|var|function|class)\\s+${escaped}\\b`,
    ).test(masked.slice(innermostStart, callIndex));
  };

  const supportedClientBinding = (
    receiver: string,
    classes: ReadonlySet<string>,
    callIndex: number,
  ): boolean => {
    const escapedReceiver = receiver.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const containingScopes = scopes
      .filter((scope) => scope.bodyStart < callIndex && callIndex < scope.bodyEnd)
      .sort((left, right) => right.bodyStart - left.bodyStart);
    const innermost = containingScopes[0];
    const scopeStart = innermost?.bodyStart ?? 0;
    const declarations = [...masked.slice(scopeStart, callIndex).matchAll(
      new RegExp(`\\b(?:const|let|var)\\s+${escapedReceiver}\\s*=\\s*([^;\\n]+)`, 'g'),
    )];
    const declaration = declarations.at(-1);
    if (declaration?.[1]) {
      return [...classes].some((className) => {
        const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^\\s*new\\s+${escapedClass}\\s*\\(`).test(declaration[1] ?? '');
      });
    }
    if (containingScopes.some((scope) => scope.parameters.has(receiver))) return false;
    if (innermost) {
      const globalDeclarations = [...masked.slice(0, innermost.bodyStart).matchAll(
        new RegExp(`\\b(?:const|let|var)\\s+${escapedReceiver}\\s*=\\s*([^;\\n]+)`, 'g'),
      )].filter((match) =>
        !scopes.some(
          (scope) => scope.bodyStart < match.index && match.index < scope.bodyEnd,
        ),
      );
      const globalDeclaration = globalDeclarations.at(-1)?.[1];
      if (!globalDeclaration) return false;
      return [...classes].some((className) => {
        const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^\\s*new\\s+${escapedClass}\\s*\\(`).test(globalDeclaration);
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
