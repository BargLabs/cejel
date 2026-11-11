import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
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
// every other character `\s` matches, NEL, lone CR, and the site's own tokens. The new literal is
// read from the production source, so a change to it is what this test checks.
//
// #716 review: the first rewrite spelled the in-line blank `(?:(?=.)\s)`. V8 12.4 (Node 22)
// compiles that group wrongly under `m` once the regex tiers up to native code (the first call is
// right, later ones are not), so the rewrite is a character class, `[^\S\n\r` plus the two
// Unicode line terminators `]`, and these checks run every literal many times on purpose.

const source = readFileSync(fileURLToPath(new URL('../repo-signals.ts', import.meta.url)), 'utf8');
const stripsSource = readFileSync(fileURLToPath(new URL('../linear-strips.ts', import.meta.url)), 'utf8');
function regexLiterals(name: string, text: string): string[] {
  const literals: string[] = [];
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) literals.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return literals;
}
const productionLiterals = regexLiterals('repo-signals.ts', source);

/** The production literals that contain `marker`, compiled; `count` of them are expected. */
function production(marker: string, count = 1): RegExp[] {
  const found = productionLiterals.filter((literal) => literal.includes(marker));
  expect(found, `production literals containing ${marker}`).toHaveLength(count);
  return found.map((literal) => {
    const end = literal.lastIndexOf('/');
    return new RegExp(literal.slice(1, end), literal.slice(end + 1));
  });
}

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const NEL = String.fromCharCode(0x85);
/** The in-line blank as the production source spells it: ASCII escapes only. */
const IN_LINE_BLANK = String.raw`[^\S\n\r\u2028\u2029]`;
const PEM_MARKER = 'PRIVATE KEY)-----([\\s\\S]{0,32768}?)-----END\\2-----';
const SAMPLES = 100_000;

// The ASCII blanks, and every other character `\s` matches or a line can end at: VT, FF, NBSP,
// U+1680, U+2000-U+200A, U+202F, U+205F, U+3000, U+FEFF, NEL (not `\s`, but not `.`-excluded
// either), LS and PS. Lone CR is in the first list.
const COMMON_BLANKS = [' ', '\t', '\n', '\r', '\r\n'];
const UNICODE_BLANKS = [
  0x0b, 0x0c, 0xa0, 0x1680,
  ...Array.from({ length: 11 }, (_, offset) => 0x2000 + offset),
  0x202f, 0x205f, 0x3000, 0xfeff, 0x85, 0x2028, 0x2029,
].map((code) => String.fromCharCode(code));
const LINE_END = new RegExp(`[\\n\\r${LS}${PS}]`);

function* samples(tokens: readonly string[], count: number, maxLength = 14): Generator<string> {
  let seed = 0x2545f491;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
  for (let index = 0; index < count; index += 1) {
    const length = Math.floor(next() * maxLength);
    let text = '';
    for (let position = 0; position < length; position += 1) {
      const roll = next();
      const pool = roll < 0.45 ? tokens : roll < 0.8 ? COMMON_BLANKS : UNICODE_BLANKS;
      text += pool[Math.floor(next() * pool.length)];
    }
    yield text;
  }
}

function execRecord(match: RegExpExecArray | null): string {
  return JSON.stringify(match === null ? null : { groups: [...match], index: match.index });
}

describe('#550: the blank-run literals give exactly what their old forms gave', () => {
  it('the in-line blank class is exactly `\\s` that `.` also matches, on every BMP character', () => {
    const blank = new RegExp(IN_LINE_BLANK);
    const whitespace = /\s/;
    const dot = /./;
    // Twice over, so the second pass runs the tiered-up (native) code.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let code = 0; code <= 0xffff; code += 1) {
        const character = String.fromCharCode(code);
        expect(blank.test(character), code.toString(16)).toBe(whitespace.test(character) && dot.test(character));
      }
    }
  });

  it('no literal spells the lookahead blank, and the source holds no raw line or paragraph separator', () => {
    const literals = [...productionLiterals, ...regexLiterals('linear-strips.ts', stripsSource)];
    expect(literals.length).toBeGreaterThan(100);
    expect(literals.filter((literal) => literal.includes('(?=.)'))).toEqual([]);
    for (const text of [source, stripsSource]) expect(text.includes(LS) || text.includes(PS)).toBe(false);
  });

  const testSites: readonly [string, RegExp, string, number, readonly string[]][] = [
    ['url', /^\s*url\s+["'][^"']+["']/m, 'url\\s+["\']', 1, ['url', '"x"', "'y'", '"', 'a']],
    ['HEALTHCHECK', /^\s*HEALTHCHECK\s+(?!NONE\b)/im, 'HEALTHCHECK\\s+(?!NONE', 1, ['HEALTHCHECK', 'healthcheck', 'NONE', 'x']],
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
    let unicode = 0;
    for (const text of samples(tokens, SAMPLES)) {
      const expected = old.test(text);
      for (const literal of literals) expect(literal.test(text), JSON.stringify(text)).toBe(expected);
      if (expected) {
        matched += 1;
        if (UNICODE_BLANKS.some((blank) => text.includes(blank))) unicode += 1;
      }
      const leading = /^[{,]?\s*/.exec(old.exec(text)?.[0] ?? '')?.[0] ?? '';
      if (LINE_END.test(leading)) multiLine += 1;
    }
    // Not vacuous: some samples match, some do not, some matches hold a Unicode blank, and some old
    // matches crossed a blank line (SimpleCov's crosses only inside its lookahead, which consumes
    // nothing).
    expect(matched).toBeGreaterThan(100);
    expect(matched).toBeLessThan(SAMPLES);
    expect(unicode).toBeGreaterThan(100);
    if (name !== 'SimpleCov') expect(multiLine).toBeGreaterThan(0);
    // The form is the class, checked last so a wrong answer above is reported first.
    for (const literal of literals) expect(literal.source).toContain(IN_LINE_BLANK);
  }, 60_000);

  const execSites: readonly [string, RegExp, string, readonly string[]][] = [
    ['coverage (vitest, both sites)', /(?:^|[{,])\s*["']?coverage["']?\s*:\s*([^,\r\n}]*)/im, '?coverage["\']?\\s*:\\s*([^,', ['{', ',', '}', '"', "'", 'coverage', 'Coverage', ':', 'false', 'x']],
    ['test block', /(?:^|[{,])\s*["']?test["']?\s*:\s*\{/m, '?test["\']?\\s*:\\s*\\{', ['{', ',', '}', '"', 'test', ':', 'x', 'test: {', '"test":{']],
    ['jest coverage keys', /(?:^|[{,])\s*["']?(collectCoverage|coverageThreshold|coverageProvider|coverageDirectory)["']?\s*:\s*([^,\r\n}]*)/m, '?(collectCoverage|', ['{', ',', '}', '"', 'collectCoverage', 'coverageProvider', ':', 'true', 'x']],
  ];

  it.each(execSites)('exec(), widened: %s', (_name, old, marker, tokens) => {
    const literals = production(marker, marker.startsWith('?coverage[') ? 2 : 1);
    let widened = 0;
    for (const text of samples(tokens, SAMPLES)) {
      const expected = old.exec(text);
      for (const literal of literals) {
        const narrow = literal.exec(text);
        if (narrow !== null && expected !== null && narrow.index !== expected.index) widened += 1;
        expect(execRecord(widenToLeadingBlankRun(narrow, text)), JSON.stringify(text)).toBe(execRecord(expected));
      }
    }
    // Not vacuous: the old match often began on an earlier blank line than the narrow one.
    expect(widened).toBeGreaterThan(100);
    for (const literal of literals) expect(literal.source).toContain(IN_LINE_BLANK);
  }, 60_000);

  it('every exec() of a (?:^|[{,]) line-bounded literal is widened back', () => {
    const literal = `/(?:^|[{,])${IN_LINE_BLANK}*`;
    let execs = 0;
    for (let at = source.indexOf(literal); at !== -1; at = source.indexOf(literal, at + 1)) {
      const lineEnd = source.indexOf('\n', at);
      if (!source.slice(at, lineEnd).includes('.exec(')) continue;
      execs += 1;
      expect(source.slice(0, at).trimEnd().endsWith('widenToLeadingBlankRun('), source.slice(at, lineEnd)).toBe(true);
    }
    expect(execs).toBe(4);
  });

  it('replace(): stripLineLedHashCommentLines gives what .replace(/^\\s*#.*$/gm, "") gave', () => {
    expect(source).toContain('stripLineLedHashCommentLines(contents)');
    const lineBounded = new RegExp(`^${IN_LINE_BLANK}*#.*$`, 'gm');
    let crossed = 0;
    for (const text of samples(['#', 'a', 'b c', '##'], SAMPLES, 16)) {
      const expected = text.replace(/^\s*#.*$/gm, '');
      expect(stripLineLedHashCommentLines(text), JSON.stringify(text)).toBe(expected);
      if (expected !== text.replace(lineBounded, '')) crossed += 1;
    }
    // Not vacuous: the old replace often removed blank lines before a comment line.
    expect(crossed).toBeGreaterThan(100);
  }, 60_000);

  it('exec() loop: execFromIdentifierRunStarts gives every match the g PEM assignment pattern gave', () => {
    const old =
      /(?:["'])?([A-Za-z_$][\w$.-]*)(?:["'])?\s*[:=]\s*(?:\|[-+0-9]*\s*\r?\n[ \t]*)?["'`]?-----BEGIN((?: (?:RSA|DSA|EC|OPENSSH|ENCRYPTED))? PRIVATE KEY)-----([\s\S]{0,32768}?)-----END\2-----/g;
    const [sticky] = production(PEM_MARKER);
    expect(sticky?.sticky).toBe(true);
    const tokens = [
      'a', 'Z9', '9', '.', '-', '$', '_', '"', "'", '`', ':', '=', '|', '|-', 'x.y',
      '-----BEGIN PRIVATE KEY-----', '-----END PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----', 'k',
      'k: -----BEGIN PRIVATE KEY-----', 'a.b=-----BEGIN RSA PRIVATE KEY-----', '9x: |\n  -----BEGIN PRIVATE KEY-----',
    ];
    let matched = 0;
    for (const text of samples(tokens, SAMPLES, 12)) {
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
  }, 60_000);

  it('each blank-run rewrite stays linear on its worst input', () => {
    // Work per input: the blank-run forms scan each line's leading blanks once (worst: many blank
    // lines); the widening walks one blank run back (worst: one long blank run before the key).
    const blankLines = `${' \n'.repeat(200_000)}\t`;
    const started = performance.now();
    stripLineLedHashCommentLines(`${blankLines}#`);
    widenToLeadingBlankRun(
      new RegExp(`(?:^|[{,])${IN_LINE_BLANK}*["']?coverage["']?\\s*:\\s*([^,\\r\\n}]*)`, 'im').exec(`${blankLines}coverage: 1`),
      `${blankLines}coverage: 1`,
    );
    for (const literal of production(IN_LINE_BLANK, 15)) literal.test(blankLines);
    // The old forms take minutes on these 400 KB inputs; the linear ones take milliseconds.
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe('#550: the PEM driver tries the sticky pattern once per identifier run and once per quote', () => {
  // The ReDoS guard calls `.test()` on the sticky literal, which never reaches the driver, so the
  // guard cannot see a superlinear driver. This runs the driver itself on the guard's
  // identifier-run families, twenty times longer, inside a vm with a time limit: a quadratic driver
  // fails here (timeout, or too many attempts) instead of hanging the suite. The attempt count is
  // the deterministic check; the time limit only turns a hang into a failure.
  const families: readonly [string, string, number][] = [
    ['word-then-cr', `${'a'.repeat(400_000)}\r`, 1],
    ['word-then-ps', `${'a'.repeat(400_000)}${PS}`, 1],
    ['env-dots-then-ls', `${'.env.'.repeat(80_000)}${LS}`, 1],
    ['env-dots-then-nel', `${'.env.'.repeat(80_000)}${NEL}`, 1],
    // Each quote is a candidate start, and so is the run after it.
    ['quoted-words-then-cr', `${'"ab'.repeat(100_000)}\r`, 200_000],
  ];

  it.each(families)('%s', (_name, input, expectedAttempts) => {
    const [sticky] = production(PEM_MARKER);
    let attempts = 0;
    class CountingRegExp extends RegExp {
      override exec(text: string): RegExpExecArray | null {
        attempts += 1;
        return super.exec(text);
      }
    }
    const counting = new CountingRegExp(sticky!.source, sticky!.flags);
    const result = runInNewContext(
      'run()',
      { run: () => execFromIdentifierRunStarts(counting, input, 0) },
      { timeout: 2_000 },
    ) as RegExpExecArray | null;
    expect(result).toBeNull();
    expect(attempts).toBe(expectedAttempts);
  }, 30_000);
});
