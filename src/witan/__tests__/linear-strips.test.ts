import { describe, expect, it } from 'vitest';

import {
  execOnTerminatorFreeLine,
  firstVersionConstraint,
  hasScheduleCronTrigger,
  isShellScriptPath,
  stripFromQueryOrFragment,
  stripHashCommentAtStartOrAfterBlank,
  stripTrailingCloseParentheses,
  stripTrailingHashComment,
  stripTrailingSlashes,
} from '../linear-strips.js';

// Each helper replaces a regex over repository or ingest text that was quadratic: on a long blank
// run (`/\s+#.*$/`, `/\s*\)+$/u`), or on many candidates before a lone line terminator that `.`
// does not match (`/[?#].*$/`, `/(^|\s)#.*$/`). An 80,000-character line took 3-4 s. Each helper
// must give exactly the regex's result on every input, and stay linear.

function* samples(alphabet: readonly string[], count: number): Generator<string> {
  let seed = 0x2545f491;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
  for (let index = 0; index < count; index += 1) {
    const length = Math.floor(next() * 14);
    let text = '';
    for (let position = 0; position < length; position += 1) {
      text += alphabet[Math.floor(next() * alphabet.length)];
    }
    yield text;
  }
}

describe('linear replacements for quadratic strip regexes', () => {
  const alphabet = [' ', '\t', '\n', '\r', '\u00a0', '\u2028', '\u2029', '#', '?', 'a', ')', '(', '/'];
  const cases: readonly [string, (text: string) => string, (text: string) => string][] = [
    ['/\\s+#.*$/', stripTrailingHashComment, (text) => text.replace(/\s+#.*$/, '')],
    ['/\\s+#.*$/u', stripTrailingHashComment, (text) => text.replace(/\s+#.*$/u, '')],
    ['/(^|\\s)#.*$/', stripHashCommentAtStartOrAfterBlank, (text) => text.replace(/(^|\s)#.*$/, '')],
    ['/[?#].*$/', stripFromQueryOrFragment, (text) => text.replace(/[?#].*$/, '')],
    ['/\\s*\\)+$/u', stripTrailingCloseParentheses, (text) => text.replace(/\s*\)+$/u, '')],
    ['/\\/+$/u', stripTrailingSlashes, (text) => text.replace(/\/+$/u, '')],
  ];

  it.each(cases)('gives exactly what %s gives', (_regex, helper, regex) => {
    for (const text of samples(alphabet, 40_000)) expect(helper(text)).toBe(regex(text));
  });

  it('finds a schedule trigger exactly as /(^|\\n)\\s*schedule:\\s*\\r?\\n\\s*-\\s*cron:/ does', () => {
    const tokens = ['schedule:', 'cron:', '-', ' ', '\n', '\r', '\t', '\u00a0', 'x', ':'];
    const pattern = /(^|\n)\s*schedule:\s*\r?\n\s*-\s*cron:/;
    for (const text of samples(tokens, 60_000)) expect(hasScheduleCronTrigger(text)).toBe(pattern.test(text));
    expect(hasScheduleCronTrigger("on:\n  schedule:\n    - cron: '0 1 * * *'\n")).toBe(true);
  });

  it('recognises a shell script path exactly as /(?:^|\\/)\\.?[^\\s]*\\.sh$/i does', () => {
    const tokens = ['/', '.', 'sh', 'SH', 's', 'h', ' ', '\t', '\n', 'a', '.sh', '\u00a0'];
    const pattern = /(?:^|\/)\.?[^\s]*\.sh$/i;
    for (const text of samples(tokens, 60_000)) expect(isShellScriptPath(text)).toBe(pattern.test(text));
  });

  it('reads a run key exactly as /^([ \\t]*)(?:-[ \\t]+)?run:[ \\t]*(.*)$/ does', () => {
    const pattern = /^([ \t]*)(?:-[ \t]+)?run:[ \t]*(.*)$/;
    const tokens = [' ', '\t', '-', 'run:', 'run', ':', 'x', '\r', '\n', '\u2028', '\u2029', '\u00a0', '|'];
    for (const text of samples(tokens, 60_000)) {
      expect(JSON.stringify(execOnTerminatorFreeLine(pattern, text))).toBe(JSON.stringify(pattern.exec(text)));
    }
  });

  it('finds a version constraint exactly as /([><=~!^]+[\\d.]+)/ does', () => {
    const tokens = ['>', '<', '=', '~', '!', '^', '1', '.', 'a', '-', ',', '>=', '~=', '0.1'];
    for (const text of samples(tokens, 60_000)) {
      expect(firstVersionConstraint(text)).toBe(/([><=~!^]+[\d.]+)/.exec(text)?.[1]);
    }
  });

  it('stays linear on 500,000-character blank runs and candidate runs', () => {
    const blanks = ' '.repeat(500_000);
    const hashes = ' #'.repeat(250_000);
    const marks = '?#'.repeat(250_000);
    const started = performance.now();
    expect(stripTrailingHashComment(`a:${blanks}x`)).toBe(`a:${blanks}x`);
    expect(stripTrailingHashComment(`a:${blanks}# c`)).toBe('a:');
    // A final line terminator disqualifies every candidate, so the text is unchanged (the old
    // regexes agree, but take about a minute to say so).
    expect(stripTrailingHashComment(`${hashes}\n`)).toBe(`${hashes}\n`);
    expect(stripHashCommentAtStartOrAfterBlank(`${hashes}\r`)).toBe(`${hashes}\r`);
    expect(stripFromQueryOrFragment(`${marks}\u2028`)).toBe(`${marks}\u2028`);
    expect(stripTrailingCloseParentheses(`a${blanks}x`)).toBe(`a${blanks}x`);
    expect(stripTrailingCloseParentheses(`a${blanks})`)).toBe('a');
    expect(stripTrailingSlashes(`./${'/'.repeat(500_000)}a`)).toBe(`./${'/'.repeat(500_000)}a`);
    expect(hasScheduleCronTrigger(`${' \n'.repeat(250_000)}\t`)).toBe(false);
    expect(isShellScriptPath(`${'/'.repeat(500_000)}x`)).toBe(false);
    const runKey = /^([ \t]*)(?:-[ \t]+)?run:[ \t]*(.*)$/;
    expect(execOnTerminatorFreeLine(runKey, `      - run:${'\t'.repeat(500_000)}\rx`)).toBeNull();
    expect(firstVersionConstraint(`a${'~'.repeat(500_000)}x`)).toBeUndefined();
    expect(firstVersionConstraint(`a${'~'.repeat(500_000)}1`)).toBe(`${'~'.repeat(500_000)}1`);
    expect(isShellScriptPath(`a ${'/a'.repeat(250_000)}.sh`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
