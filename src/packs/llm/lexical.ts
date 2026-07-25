/**
 * Conservative lexical masks used to prevent source-pattern matches in comments and literals.
 * Offsets and newlines are preserved. Template literal interpolation is intentionally masked too;
 * unsupported interpolation flows abstain instead of risking a false positive.
 */
export function maskJavaScriptNonCode(contents: string): string {
  const chars = [...contents];
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let regexLiteral = false;
  let regexCharacterClass = false;
  let lastCodeCharacter = '';
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
        chars[index] = chars[index + 1] = ' ';
        blockComment = false;
        index += 1;
      } else if (character !== '\n') chars[index] = ' ';
      continue;
    }
    if (regexLiteral) {
      if (character !== '\n') chars[index] = ' ';
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
        while (/[a-z]/i.test(chars[index + 1] ?? '')) {
          chars[index + 1] = ' ';
          index += 1;
        }
        lastCodeCharacter = '/';
      } else if (character === '\n') {
        regexLiteral = false;
      }
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
      chars[index] = chars[index + 1] = ' ';
      lineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      chars[index] = chars[index + 1] = ' ';
      blockComment = true;
      index += 1;
    } else if (
      character === '/' &&
      (!lastCodeCharacter || /[({[=,:;!?&|+\-*%^~<>]/.test(lastCodeCharacter))
    ) {
      chars[index] = ' ';
      regexLiteral = true;
      regexCharacterClass = false;
    } else if (character === "'" || character === '"' || character === '`') {
      chars[index] = ' ';
      quote = character;
      lastCodeCharacter = character;
    } else if (!/\s/.test(character)) {
      lastCodeCharacter = character;
    }
  }
  return chars.join('');
}

export function maskPythonNonCode(contents: string): string {
  const chars = [...contents];
  let quote: "'" | '"' | null = null;
  let triple = false;
  let escaped = false;
  let comment = false;
  for (let index = 0; index < chars.length; index += 1) {
    const character = chars[index] ?? '';
    if (comment) {
      if (character === '\n') comment = false;
      else chars[index] = ' ';
      continue;
    }
    if (quote) {
      if (character !== '\n') chars[index] = ' ';
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (triple && contents.slice(index, index + 3) === quote.repeat(3)) {
        chars[index] = chars[index + 1] = chars[index + 2] = ' ';
        quote = null;
        triple = false;
        index += 2;
      } else if (!triple && character === quote) quote = null;
      continue;
    }
    if (character === '#') {
      chars[index] = ' ';
      comment = true;
    } else if (character === "'" || character === '"') {
      triple = contents.slice(index, index + 3) === character.repeat(3);
      quote = character;
      chars[index] = ' ';
      if (triple) {
        chars[index + 1] = chars[index + 2] = ' ';
        index += 2;
      }
    }
  }
  return chars.join('');
}

export function isExcludedLlmSourcePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    /(?:^|\/)(?:__tests__|test|tests|fixtures?|examples?|docs?|vendor|generated)(?:\/|$)/i.test(
      normalized,
    ) ||
    /\.(?:test|spec|fixture)\.[cm]?[jt]sx?$/i.test(normalized) ||
    /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i.test(normalized)
  );
}

export function hasUnmaskedJavaScriptMatch(contents: string, pattern: RegExp): boolean {
  const masked = maskJavaScriptNonCode(contents);
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  for (const match of contents.matchAll(new RegExp(pattern.source, flags))) {
    if (match.index !== undefined && (masked[match.index] ?? ' ') !== ' ') return true;
  }
  return false;
}
