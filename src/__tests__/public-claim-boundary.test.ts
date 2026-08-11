import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const CLAIM_BOUNDARY =
  'Cejel scores engineering-trust signals; it does not claim to detect software defects or prove that code is safe.';

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function normalizeClaimCopy(contents: string): string {
  return contents.replace(/\s+/g, ' ').trim();
}

const publicClaimSurfaces = [
  {
    path: 'README.md (opening claim)',
    contents: readRepoFile('README.md').split('\n## Install\n', 1)[0] ?? '',
  },
  { path: 'package.json', contents: readRepoFile('package.json') },
  { path: 'action.yml', contents: readRepoFile('action.yml') },
  { path: 'action/action.yml', contents: readRepoFile('action/action.yml') },
  { path: 'server.json', contents: readRepoFile('server.json') },
  { path: 'src/mcp/server.ts', contents: readRepoFile('src/mcp/server.ts') },
  { path: 'src/http/server.ts', contents: readRepoFile('src/http/server.ts') },
] as const;

const crossPathDeterminismGuard = readRepoFile('src/__tests__/index.test.ts');
const reportReproducibilityClaimSurfaces = [
  ...publicClaimSurfaces,
  { path: 'README.md', contents: readRepoFile('README.md') },
] as const;
const unqualifiedReportReproducibilityClaim =
  /\b(?:report(?:\.json)?|report artifact|report digest)\b.{0,160}\b(?:byte-identical|any machine|same digest|reproduc(?:e|ible))\b|\b(?:byte-identical|any machine|same digest|reproduc(?:e|ible))\b.{0,160}\b(?:report(?:\.json)?|report artifact|report digest)\b/is;

describe('public product claim boundary', () => {
  it('states that the free-core product scores trust signals rather than detecting defects', () => {
    expect(normalizeClaimCopy(publicClaimSurfaces[0]?.contents ?? '')).toContain(CLAIM_BOUNDARY);
  });

  it.each(publicClaimSurfaces)(
    '$path does not imply that Cejel detects defects',
    ({ contents }) => {
      const copyWithoutBoundary = normalizeClaimCopy(contents).replaceAll(CLAIM_BOUNDARY, '');

      expect(copyWithoutBoundary).not.toMatch(
        /\bCejel\b.{0,160}\b(?:detects?|finds?|catches?|flags?|spots?)\b/is,
      );
      expect(copyWithoutBoundary).not.toMatch(
        /\b(?:detects?|finds?|catches?|flags?|spots?)\b.{0,160}\bwith Cejel\b/is,
      );
    },
  );

  it('allows unqualified report reproducibility claims only while cross-path determinism is guarded', () => {
    const surfacesWithClaim = reportReproducibilityClaimSurfaces.filter(({ contents }) =>
      unqualifiedReportReproducibilityClaim.test(normalizeClaimCopy(contents)),
    );

    if (surfacesWithClaim.length === 0) return;

    expect(crossPathDeterminismGuard).toContain(
      'writes byte-identical report artifacts for identical checkouts at different paths',
    );
    expect(crossPathDeterminismGuard).toContain(
      'expect(firstReportJson).toBe(secondReportJson)',
    );
  });
});
