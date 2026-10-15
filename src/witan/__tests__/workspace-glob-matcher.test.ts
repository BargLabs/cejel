import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_GLOB_MAX_LENGTH,
  WORKSPACE_GLOB_MAX_SEGMENTS,
  workspaceGlobMatcher,
} from '../repo-signals.js';

// goal_cejel_scan_path_regex_bounds_2026-10-15. The workspace glob matcher no longer compiles a
// regex; it must keep the former regex's language exactly. The former builder is frozen here, as
// it stood at #479, as the oracle. Synthetic patterns and paths only.
function formerWorkspaceGlobToRegExp(pattern: string): RegExp | null {
  const normalised = pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '');
  if (
    normalised === '' ||
    normalised.startsWith('/') ||
    /(^|\/)\.\.?(\/|$)/.test(normalised) ||
    /[[\]{}()!+@\\]/.test(normalised)
  ) {
    return null;
  }
  const segments = normalised
    .split('/')
    .filter((segment, index, all) => !(segment === '**' && all[index - 1] === '**'));
  const anySegment = '(?!\\.)[^/]+';
  if (segments.length === 1 && segments[0] === '**') return new RegExp(`^${anySegment}(?:/${anySegment})*$`);
  let source = '';
  segments.forEach((segment, index) => {
    if (segment === '**') {
      source += index === 0 ? `(?:${anySegment}/)*` : `(?:/${anySegment})*`;
      return;
    }
    if (index > 0 && !(index === 1 && segments[0] === '**')) source += '/';
    const body = segment
      .split('')
      .map((char) =>
        char === '*' ? '[^/]*' : char === '?' ? '[^/]' : char.replace(/[.^$|]/g, '\\$&'),
      )
      .join('');
    source += /^[*?]/.test(segment) ? `(?!\\.)${body}` : body;
  });
  return new RegExp(`^${source}$`);
}

function agree(pattern: string, paths: readonly string[]): string[] {
  const former = formerWorkspaceGlobToRegExp(pattern);
  const current = workspaceGlobMatcher(pattern);
  if ((former === null) !== (current === null)) {
    return [`${JSON.stringify(pattern)}: former ${former === null ? 'null' : 'parsed'}, current ${current === null ? 'null' : 'parsed'}`];
  }
  if (former === null || current === null) return [];
  return paths
    .filter((path) => former.test(path) !== current(path))
    .map((path) => `${JSON.stringify(pattern)} vs ${JSON.stringify(path)}: former ${former.test(path)}`);
}

// Every glob the workspace tests and behaviour corpus declare, plus the shapes #479 documents.
const EXISTING_PATTERNS = [
  'packages/*',
  'apps/*',
  'packages/**',
  '**/legacy/**',
  'packages/legacy',
  '**/react-native',
  './packages/*/',
  '  packages/*  ',
  '**',
  '**/**',
  '**/*',
  'a/**/b',
  'a/**',
  '**/b',
  'a/**/**/b',
  'packages/?pp',
  'packages/.hidden',
  'packages/*.js',
  'a//b',
  '',
  '/abs',
  '../up',
  'a/../b',
  './',
  'a/./b',
  'packages/[ab]',
  'packages/{a,b}',
  'packages/(a)',
  'packages/+a',
  'packages/@scope',
  'packages\\a',
  'a.b',
  'a$b',
  'a^b',
  'a|b',
];
const EXISTING_PATHS = [
  'packages/api',
  'packages/web',
  'packages/legacy',
  'packages/old/legacy',
  'packages/old/legacy/x',
  'packages/app/generated/client',
  'packages/.hidden',
  'packages/.hidden/x',
  'packages/app.js',
  'packages/app',
  'apps/site',
  'a/b',
  'a/x/b',
  'a/.x/b',
  'a/x/y/b',
  'a',
  'b',
  'x/b',
  '.x/b',
  'a//b',
  'aXb',
  'a.b',
  'a$b',
  'a|b',
  'react-native',
  'deep/react-native',
  '',
];

describe('workspace glob matcher keeps the former regex language exactly', () => {
  it('agrees with the former regex on every existing glob case', () => {
    const disagreements = EXISTING_PATTERNS.flatMap((pattern) => agree(pattern, EXISTING_PATHS));
    expect(disagreements).toEqual([]);
  });

  // mulberry32 with a fixed seed: the same pairs on every run.
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  }
  const pick = <T,>(random: () => number, items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T;

  function tally(pairs: readonly (readonly [string, readonly string[]])[]) {
    let total = 0;
    let parsed = 0;
    let matched = 0;
    for (const [pattern, paths] of pairs) {
      total += paths.length;
      const matcher = workspaceGlobMatcher(pattern);
      if (matcher === null) continue;
      parsed += paths.length;
      matched += paths.filter((path) => matcher(path)).length;
    }
    return { total, parsed, matched };
  }

  it('agrees with the former regex on 6,000 seeded random character-level pairs (alphabet `a b . / * ?`)', () => {
    const random = seeded(0x5eed_2026);
    const alphabet = ['a', 'b', '.', '/', '*', '?'];
    const word = (max: number): string =>
      Array.from({ length: Math.floor(random() * (max + 1)) }, () => pick(random, alphabet)).join('');
    const pairs = Array.from({ length: 1_000 }, () => [word(8), Array.from({ length: 6 }, () => word(8))] as const);

    const disagreements = pairs.flatMap(([pattern, paths]) => agree(pattern, paths));
    const counts = tally(pairs);
    expect(counts.total).toBe(6_000);
    expect(counts.parsed).toBeGreaterThan(2_000);
    expect(disagreements).toEqual([]);
  });

  it('agrees with the former regex on 6,000 seeded random segment-level pairs, half of them instantiated from the pattern', () => {
    // Character-level sampling rarely produces a `**` segment or a match, so this set draws whole
    // segments over the same alphabet and builds half of each pattern's paths from the pattern.
    const random = seeded(0x2026_1015);
    // `**` is listed three times so that globstar patterns are common.
    const globSegments = ['a', 'b', '*', '?', '**', '**', '**', '.a', 'a*', '*b', '?a', 'a.b', '*.*', '*a*', '', '.'];
    const pathSegments = ['a', 'b', 'ab', '.a', 'a.b', 'ba', '', 'aa', '.', '..', '*', '?'];
    const instantiate = (segment: string): string => {
      if (segment === '**') {
        return Array.from({ length: Math.floor(random() * 3) }, () => pick(random, pathSegments)).join('/');
      }
      return segment
        .split('')
        .map((char) =>
          char === '*'
            ? Array.from({ length: Math.floor(random() * 3) }, () => pick(random, ['a', 'b', '.'])).join('')
            : char === '?'
              ? pick(random, ['a', 'b', '.'])
              : char,
        )
        .join('');
    };
    const pairs = Array.from({ length: 1_000 }, () => {
      const segments = Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(random, globSegments));
      const pattern = segments.join('/');
      const instantiated = Array.from({ length: 3 }, () =>
        segments.map(instantiate).filter((part, index) => part !== '' || segments[index] !== '**').join('/'),
      );
      const free = Array.from({ length: 3 }, () =>
        Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(random, pathSegments)).join('/'),
      );
      return [pattern, [...instantiated, ...free]] as const;
    });

    const disagreements = pairs.flatMap(([pattern, paths]) => agree(pattern, paths));
    const counts = tally(pairs);
    expect(counts.total).toBe(6_000);
    expect(pairs.filter(([pattern]) => pattern.split('/').includes('**')).length).toBeGreaterThan(200);
    expect(counts.matched).toBeGreaterThan(1_000);
    expect(disagreements).toEqual([]);
  });
});

describe('workspace glob complexity caps', () => {
  it(`a pattern longer than ${WORKSPACE_GLOB_MAX_LENGTH} characters is unparseable`, () => {
    const atCap = `packages/${'x'.repeat(WORKSPACE_GLOB_MAX_LENGTH - 'packages/'.length)}`;
    expect(atCap).toHaveLength(WORKSPACE_GLOB_MAX_LENGTH);
    expect(workspaceGlobMatcher(atCap)?.(atCap)).toBe(true);
    expect(workspaceGlobMatcher(`${atCap}x`)).toBeNull();
  });

  it(`a pattern of more than ${WORKSPACE_GLOB_MAX_SEGMENTS} segments is unparseable`, () => {
    const atCap = Array.from({ length: WORKSPACE_GLOB_MAX_SEGMENTS }, () => '*').join('/');
    const path = Array.from({ length: WORKSPACE_GLOB_MAX_SEGMENTS }, () => 'p').join('/');
    expect(workspaceGlobMatcher(atCap)?.(path)).toBe(true);
    expect(workspaceGlobMatcher(`${atCap}/*`)).toBeNull();
  });
});
