// Linear replacements for strip regexes over repository and ingest text. Each regex below has an
// unanchored quantified prefix or a `.*$` that a line terminator stops, so the engine retried it
// from every position: quadratic on a long blank run, or on many candidates before a lone `\r`.
// Each helper returns exactly what its regex returned; linear-strips.test.ts checks that.

const LINE_TERMINATOR_PATTERN = /[\n\r\u2028\u2029]/;
const WHITESPACE_PATTERN = /\s/;

/** Index of the last line terminator (`.` does not match one), or -1. */
function lastLineTerminator(text: string): number {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (LINE_TERMINATOR_PATTERN.test(text[index] ?? '')) return index;
  }
  return -1;
}

/** `text.replace(/\s+#.*$/, '')` (also the `u` form). */
export function stripTrailingHashComment(text: string): string {
  // `.*$` cannot cross a line terminator, so only a `#` after the last one can start the comment.
  for (let index = text.indexOf('#', lastLineTerminator(text) + 1); index !== -1; index = text.indexOf('#', index + 1)) {
    if (index === 0 || !WHITESPACE_PATTERN.test(text[index - 1] ?? '')) continue;
    return text.slice(0, index).trimEnd();
  }
  return text;
}

/** `text.replace(/(^|\s)#.*$/, '')`. */
export function stripHashCommentAtStartOrAfterBlank(text: string): string {
  for (let index = text.indexOf('#', lastLineTerminator(text) + 1); index !== -1; index = text.indexOf('#', index + 1)) {
    if (index === 0) return '';
    if (WHITESPACE_PATTERN.test(text[index - 1] ?? '')) return text.slice(0, index - 1);
  }
  return text;
}

/** `text.replace(/[?#].*$/, '')`. */
export function stripFromQueryOrFragment(text: string): string {
  const from = lastLineTerminator(text) + 1;
  for (let index = from; index < text.length; index += 1) {
    const character = text[index];
    if (character === '?' || character === '#') return text.slice(0, index);
  }
  return text;
}

/** `segment.replace(/\s*\)+$/u, '')`: a trailing `)` run and the blanks before it. */
export function stripTrailingCloseParentheses(segment: string): string {
  let end = segment.length;
  while (end > 0 && segment[end - 1] === ')') end -= 1;
  if (end === segment.length) return segment;
  return segment.slice(0, end).trimEnd();
}

/** `text.replace(/\/+$/u, '')`: the trailing `/` run. */
export function stripTrailingSlashes(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === '/') end -= 1;
  return end === text.length ? text : text.slice(0, end);
}

/**
 * `/(^|\n)\s*schedule:\s*\r?\n\s*-\s*cron:/.test(text)`: a `schedule:` key whose preceding blank
 * run reaches the start or holds a newline, followed by a blank run holding a newline, `-`, blanks
 * and `cron:`. Each blank run is walked at most twice, so the scan is linear.
 */
export function hasScheduleCronTrigger(text: string): boolean {
  const key = 'schedule:';
  for (let index = text.indexOf(key); index !== -1; index = text.indexOf(key, index + 1)) {
    let before = index - 1;
    let newlineBefore = false;
    while (before >= 0 && WHITESPACE_PATTERN.test(text[before] ?? '')) {
      if (text[before] === '\n') newlineBefore = true;
      before -= 1;
    }
    if (before !== -1 && !newlineBefore) continue;
    let after = index + key.length;
    let newlineAfter = false;
    while (after < text.length && WHITESPACE_PATTERN.test(text[after] ?? '')) {
      if (text[after] === '\n') newlineAfter = true;
      after += 1;
    }
    if (!newlineAfter || text[after] !== '-') continue;
    after += 1;
    while (after < text.length && WHITESPACE_PATTERN.test(text[after] ?? '')) after += 1;
    if (text.startsWith('cron:', after)) return true;
  }
  return false;
}

/**
 * `/(?:^|\/)\.?[^\s]*\.sh$/i.test(text)`: the text ends in `.sh`, and the run of non-blanks it ends
 * starts at the beginning of the text or right after a `/`, with at least `.sh` after that start.
 */
export function isShellScriptPath(text: string): boolean {
  if (!/\.sh$/i.test(text.slice(-3))) return false;
  let start = text.length;
  while (start > 0 && !WHITESPACE_PATTERN.test(text[start - 1] ?? '')) start -= 1;
  if (start === 0) return true;
  const slash = text.indexOf('/', start);
  return slash !== -1 && text.length - (slash + 1) >= 3;
}

/**
 * `pattern.exec(line)` for a pattern shaped `^<prefix>(.*)$` with no `m` or `s` flag, whose prefix
 * cannot match a line terminator. Such a pattern can match only a line holding no terminator (the
 * prefix cannot consume one and `.` does not), so a line holding one returns null at once instead
 * of letting the engine retry the prefix's blank runs against `(.*)$` (quadratic).
 */
export function execOnTerminatorFreeLine(pattern: RegExp, line: string): RegExpExecArray | null {
  return LINE_TERMINATOR_PATTERN.test(line) ? null : pattern.exec(line);
}

const VERSION_OPERATOR_CHARACTERS = new Set(['>', '<', '=', '~', '!', '^']);
const VERSION_DIGIT_PATTERN = /[\d.]/;

/**
 * `/([><=~!^]+[\d.]+)/.exec(text)?.[1]`: the first run of version operators that is followed by a
 * digit or `.`, with the digits and dots after it. One left-to-right pass: a maximal operator run
 * either is followed by a digit or `.` (the match starts at the run's first character) or no
 * suffix of it can be.
 */
export function firstVersionConstraint(text: string): string | undefined {
  let index = 0;
  while (index < text.length) {
    if (!VERSION_OPERATOR_CHARACTERS.has(text[index] ?? '')) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < text.length && VERSION_OPERATOR_CHARACTERS.has(text[index] ?? '')) index += 1;
    if (index < text.length && VERSION_DIGIT_PATTERN.test(text[index] ?? '')) {
      let end = index;
      while (end < text.length && VERSION_DIGIT_PATTERN.test(text[end] ?? '')) end += 1;
      return text.slice(start, end);
    }
  }
  return undefined;
}
