import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  execFromIdentifierRunStarts,
  stripLineLedHashCommentLines,
  widenToLeadingBlankRun,
} from '../linear-strips.js';

// #550: sixteen literals shaped `^\s*X` under `m`, or `(?:^|[{,])\s*X`, retried a run of blank
// lines from every line start, because `\s` matches `\n` (quadratic). The PEM assignment pattern
// retried a run of identifier characters from each of its characters. Each site below is checked
// against its old literal, which lives only here, over generated inputs: blank runs, CRLF, tabs,
// NBSP, U+2028, U+2029, NEL, and the site's own tokens at the start, middle and end. The new
// literal is read from the production source, so a change to it is what this test checks.

const source = readFileSync(fileURLToPath(new URL('../repo-signals.ts', import.meta.url)), 'utf8');
const productionLiterals: string[] = [];
{
  const file = ts.createSourceFile('repo-signals.ts', source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) productionLiterals.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
}

/** The production literals that contain `marker`, compiled; `count` of them are expected. */
function production(marker: string, count = 1): RegExp[] {
  const found = productionLiterals.filter((literal) => literal.includes(marker));
  expect(found, `production literals containing ${marker}`).toHaveLength(count);
  return found.map((literal) => {
    const end = literal.lastIndexOf('/');
    return new RegExp(literal.slice(1, end), literal.slice(end + 1));
  });
}

const BLANKS = [' ', '\t', '\n', '\r', '\r\n', '\u{2028}', '\u{2029}', '\u{85}', '\u{a0}'];

function* samples(tokens: readonly string[], count: number, maxLength = 14): Generator<string> {
  let seed = 0x2545f491;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
  const alphabet = [...tokens, ...BLANKS, ...BLANKS];
  for (let index = 0; index < count; index += 1) {
    const length = Math.floor(next() * maxLength);
    let text = '';
    for (let position = 0; position < length; position += 1) {
      text += alphabet[Math.floor(next() * alphabet.length)];
    }
    yield text;
  }
}

function execRecord(match: RegExpExecArray | null): string {
  return JSON.stringify(match === null ? null : { groups: [...match], index: match.index });
}

describe('#550: the blank-run literals give exactly what their old forms gave', () => {
  const testSites: readonly [string, RegExp, string, number, readonly string[]][] = [
    ['url', /^\s*url\s+["'][^"']+["']/m, 'url\\s+["\']', 1, ['url', '"x"', "'y'", '"', 'a']],
    ['HEALTHCHECK', /^\s*HEALTHCHECK\s+(?!NONE\b)/im, '(?:(?=.)\\s)*HEALTHCHECK', 1, ['HEALTHCHECK', 'healthcheck', 'NONE', 'x']],
    ['test|tests|check', /^\s*(?:test|tests|check)\s*:/m, '(?:test|tests|check)\\s*:/m', 2, ['test', 'tests', 'check', ':', 'x']],
    ['working-directory', /^\s*(?:-\s+)?working-directory\s*:/m, 'working-directory\\s*:', 1, ['working-directory', '-', ':', 'x']],
    ['[coverage:…]', /^\s*\[coverage:(?:run|report)\]\s*$/m, '\\[coverage:(?:run|report)\\]', 1, ['[coverage:run]', '[coverage:report]', 'x']],
    ['SimpleCov', /^(?!\s*#).*\bSimpleCov\b/m, 'SimpleCov', 1, ['SimpleCov', '#', 'x', 'require ']],
    ['run', /^\s*run\s+(?:(?:[A-Z]\w*(?:::\w+)*(?:\.new)?|lambda)\b|->)/m, '*run\\s+', 1, ['run', 'App', 'Foo::Bar', '.new', 'lambda', '->', 'x']],
    ['CMD|ENTRYPOINT', /^\s*(?:CMD|ENTRYPOINT)\s+.*(?:\b(?:start|serve|server|qgis|nginx|apache|gunicorn|uvicorn)\b|manage\.py\s+runserver).*$/im, '(?:CMD|ENTRYPOINT)\\s+', 1, ['CMD', 'entrypoint', 'start', 'serve', 'manage.py', 'runserver', 'x']],
    ['collectCoverage: true', /(?:^|[{,])\s*["']?collectCoverage["']?\s*:\s*true\b/m, '?collectCoverage["\']?\\s*:\\s*true', 1, ['{', ',', '"', 'collectCoverage', ':', 'true', 'x', 'collectCoverage: true', '{collectCoverage:true']],
    ['coverageThreshold|…', /(?:^|[{,])\s*["']?(?:coverageThreshold|coverageProvider|coverageDirectory)["']?\s*:/m, '?(?:coverageThreshold|', 1, ['{', ',', "'", 'coverageThreshold', 'coverageDirectory', ':', 'x']],
  ];

  it.each(testSites)('test(): %s', (name, old, marker, count, tokens) => {
    const literals = production(marker, count);
    let matched = 0;
    let multiLine = 0;
    for (const text of samples(tokens, 30_000)) {
      const expected = old.test(text);
      for (const literal of literals) expect(literal.test(text), JSON.stringify(text)).toBe(expected);
      if (expected) matched += 1;
      const leading = /^[{,]?\s*/.exec(old.exec(text)?.[0] ?? '')?.[0] ?? '';
      if (/[\n\r\u{2028}\u{2029}]/u.test(leading)) multiLine += 1;
    }
    // Not vacuous: some samples match, some do not, and some old matches crossed a blank line
    // (SimpleCov's crosses only inside its lookahead, which consumes nothing).
    expect(matched).toBeGreaterThan(100);
    expect(matched).toBeLessThan(30_000);
    if (name !== 'SimpleCov') expect(multiLine).toBeGreaterThan(0);
  });

  const execSites: readonly [string, RegExp, string, readonly string[]][] = [
    ['coverage (vitest, both sites)', /(?:^|[{,])\s*["']?coverage["']?\s*:\s*([^,\r\n}]*)/im, '?coverage["\']?\\s*:\\s*([^,', ['{', ',', '}', '"', "'", 'coverage', 'Coverage', ':', 'false', 'x']],
    ['test block', /(?:^|[{,])\s*["']?test["']?\s*:\s*\{/m, '?test["\']?\\s*:\\s*\\{', ['{', ',', '}', '"', 'test', ':', 'x', 'test: {', '"test":{']],
    ['jest coverage keys', /(?:^|[{,])\s*["']?(collectCoverage|coverageThreshold|coverageProvider|coverageDirectory)["']?\s*:\s*([^,\r\n}]*)/m, '?(collectCoverage|', ['{', ',', '}', '"', 'collectCoverage', 'coverageProvider', ':', 'true', 'x']],
  ];

  it.each(execSites)('exec(), widened: %s', (_name, old, marker, tokens) => {
    const literals = production(marker, marker.startsWith('?coverage[') ? 2 : 1);
    let widened = 0;
    for (const text of samples(tokens, 30_000)) {
      const expected = old.exec(text);
      for (const literal of literals) {
        const narrow = literal.exec(text);
        if (narrow !== null && expected !== null && narrow.index !== expected.index) widened += 1;
        expect(execRecord(widenToLeadingBlankRun(narrow, text)), JSON.stringify(text)).toBe(execRecord(expected));
      }
    }
    // Not vacuous: the old match often began on an earlier blank line than the narrow one.
    expect(widened).toBeGreaterThan(100);
  });

  it('replace(): stripLineLedHashCommentLines gives what .replace(/^\\s*#.*$/gm, "") gave', () => {
    expect(source).toContain('stripLineLedHashCommentLines(contents)');
    let crossed = 0;
    for (const text of samples(['#', 'a', 'b c', '##'], 60_000, 16)) {
      const expected = text.replace(/^\s*#.*$/gm, '');
      expect(stripLineLedHashCommentLines(text), JSON.stringify(text)).toBe(expected);
      if (expected !== text.replace(/^(?:(?=.)\s)*#.*$/gm, '')) crossed += 1;
    }
    // Not vacuous: the old replace often removed blank lines before a comment line.
    expect(crossed).toBeGreaterThan(100);
  });

  it('exec() loop: execFromIdentifierRunStarts gives every match the g PEM assignment pattern gave', () => {
    const old =
      /(?:["'])?([A-Za-z_$][\w$.-]*)(?:["'])?\s*[:=]\s*(?:\|[-+0-9]*\s*\r?\n[ \t]*)?["'`]?-----BEGIN((?: (?:RSA|DSA|EC|OPENSSH|ENCRYPTED))? PRIVATE KEY)-----([\s\S]{0,32768}?)-----END\2-----/g;
    const [sticky] = production('PRIVATE KEY)-----([\\s\\S]{0,32768}?)-----END\\2-----');
    expect(sticky?.sticky).toBe(true);
    const tokens = [
      'a', 'Z9', '9', '.', '-', '$', '_', '"', "'", '`', ':', '=', '|', '|-', 'x.y',
      '-----BEGIN PRIVATE KEY-----', '-----END PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----', 'k',
      'k: -----BEGIN PRIVATE KEY-----', 'a.b=-----BEGIN RSA PRIVATE KEY-----', '9x: |\n  -----BEGIN PRIVATE KEY-----',
    ];
    let matched = 0;
    for (const text of samples(tokens, 40_000, 12)) {
      const expected: string[] = [];
      old.lastIndex = 0;
      for (let match = old.exec(text); match !== null; match = old.exec(text)) expected.push(execRecord(match));
      const actual: string[] = [];
      for (
        let match = execFromIdentifierRunStarts(sticky!, text, 0);
        match !== null;
        match = execFromIdentifierRunStarts(sticky!, text, match.index + match[0].length)
      ) {
        actual.push(execRecord(match));
      }
      expect(actual, JSON.stringify(text)).toEqual(expected);
      if (expected.length > 0) matched += 1;
    }
    expect(matched).toBeGreaterThan(100);
  });

  it('each rewrite stays linear on its worst input', () => {
    // Work per input: the blank-run forms scan each line's leading blanks once (worst: many blank
    // lines); the widening walks one blank run back (worst: one long blank run before the key);
    // the PEM driver tries the pattern once per identifier run and quote (worst: one long run).
    const blankLines = `${' \n'.repeat(200_000)}\t`;
    const started = performance.now();
    stripLineLedHashCommentLines(`${blankLines}#`);
    widenToLeadingBlankRun(
      /(?:^|[{,])(?:(?=.)\s)*["']?coverage["']?\s*:\s*([^,\r\n}]*)/im.exec(`${blankLines}coverage: 1`),
      `${blankLines}coverage: 1`,
    );
    for (const literal of production('(?:(?=.)\\s)*', 15)) literal.test(blankLines);
    const [sticky] = production('PRIVATE KEY)-----([\\s\\S]{0,32768}?)-----END\\2-----');
    execFromIdentifierRunStarts(sticky!, `${'a'.repeat(400_000)}\r`, 0);
    execFromIdentifierRunStarts(sticky!, `${'.env.'.repeat(80_000)}\u{2028}`, 0);
    // The old forms take minutes on these 400 KB inputs; the linear ones take milliseconds.
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
