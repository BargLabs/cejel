import { describe, expect, it } from 'vitest';

import { linearStripsForTest } from '../repo-signals.js';

const { stripTrailingHashComment, stripTrailingCloseParentheses } = linearStripsForTest;

// Each helper replaces a regex that was quadratic on a long blank run in repository text
// (`/\s+#.*$/` twice, `/\s*\)+$/u`): an 80,000-character line took 3-4 s. The helpers must give
// exactly the regex's result on every input, and stay linear.

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
  const alphabet = [' ', '\t', '\n', '\r', ' ', ' ', '#', 'a', ')', '('];

  it('drops a trailing hash comment exactly as /\\s+#.*$/ and /\\s+#.*$/u do', () => {
    for (const text of samples(alphabet, 40_000)) {
      expect(stripTrailingHashComment(text)).toBe(text.replace(/\s+#.*$/, ''));
      expect(stripTrailingHashComment(text)).toBe(text.replace(/\s+#.*$/u, ''));
    }
  });

  it('drops trailing close parentheses exactly as /\\s*\\)+$/u does', () => {
    for (const text of samples(alphabet, 40_000)) {
      expect(stripTrailingCloseParentheses(text)).toBe(text.replace(/\s*\)+$/u, ''));
    }
  });

  it('stays linear on a 500,000-character blank run', () => {
    const blanks = ' '.repeat(500_000);
    const started = performance.now();
    expect(stripTrailingHashComment(`a:${blanks}x`)).toBe(`a:${blanks}x`);
    expect(stripTrailingHashComment(`a:${blanks}# c`)).toBe('a:');
    expect(stripTrailingCloseParentheses(`a${blanks}x`)).toBe(`a${blanks}x`);
    expect(stripTrailingCloseParentheses(`a${blanks})`)).toBe('a');
    expect(performance.now() - started).toBeLessThan(500);
  });
});
