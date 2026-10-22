import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WITAN_A2_HISTORY_APPLICABILITY_PREFIX, WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #560 review (B1), end to end with real git: a deleted secret in a credential-shaped path whose name
// reads like a git message, on a blobless clone. The historical blob read fails because the blob is
// not present and Cejel's git boundary never fetches it. Before the fix, `not a git repository` in the
// path made that failure an expected absence (no scan limitation, no disclosure, no abstention: A2
// not applicable and the score above the complete clone's, under v17 and v27), and `timeout` or
// `maxBuffer` made it one of Cejel's own limits. Now each is "could not read part of the commit
// history", and v27 never scores the blobless clone above the complete one.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const NAMES = ['not a git repository', 'timeout', 'maxBuffer'] as const;
const FAILED_BLOB_READ =
  'Cejel: local git historical blob read failed. Cejel continued with reduced Git history evidence.';
const COMPOSITES = ['overallScore', 'codeTrustScore', 'processTrustScore'] as const;

const clones = new Map<string, { full: string; blobless: string }>();

beforeAll(() => {
  const base = { 'package.json': '{"name":"names","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };
  for (const name of NAMES) {
    const path = `secrets/${name}.txt`;
    const origin = buildA2HistoryOrigin(name.replace(/ /g, '-'), [
      { write: base },
      { write: { [path]: SHALLOW_A2_SYNTHETIC_SECRET_LINE } },
      { remove: [path] },
      { write: { 'README.md': '# r\n' } },
    ]);
    clones.set(name, { full: cloneShallowA2Origin(origin, 'full'), blobless: cloneShallowA2Origin(origin, 'blobless') });
  }
}, 120_000);

afterAll(() => {
  removeShallowA2Fixtures();
});

function scan(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'names-fixture',
    productDisplayName: 'Names fixture',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

const a2 = (report: WitanReport): WitanCriterionScore => {
  const found = report.criteria.find(({ id }) => id === 'A2');
  if (!found) throw new Error('no A2');
  return found;
};

describe('#560: a path named like a git message cannot change how a failed history read is classified', () => {
  for (const name of NAMES) {
    it(`secrets/${name}.txt on a blobless clone`, () => {
      const { full, blobless } = clones.get(name) as { full: string; blobless: string };
      expect(a2(scan(full, V27)).status).toBe('critical');

      const v17 = scan(blobless, V17);
      expect(v17.scanLimitations).toEqual([FAILED_BLOB_READ]);
      expect(a2(v17).status).toBe('not_applicable');
      const disclosure = (a2(v17).disclosures ?? []).find((text) => text.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX));
      expect(disclosure).toContain('Cejel could not read part of the commit history');
      expect(disclosure).toContain('set fetch-depth: 0 and no filter');
      expect(disclosure).not.toMatch(/timeout|output limit|will not lift|may not lift/);

      const v27 = scan(blobless, V27);
      expect(v27.scanLimitations).toEqual([FAILED_BLOB_READ]);
      expect(a2(v27).status).toBe('insufficient_data');
      expect(a2(v27).score).toBe(0);
      const note = a2(v27).notes ?? '';
      expect(note.startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX)).toBe(true);
      expect(note).toContain('Cejel could not read part of the commit history');
      expect(note).not.toMatch(/timeout|output limit|will not lift|may not lift/);

      const complete = scan(full, V27);
      for (const composite of COMPOSITES) {
        const before = complete[composite];
        const after = v27[composite];
        if (after !== null) expect(before, composite).not.toBeNull();
        if (after !== null && before !== null) expect(after, composite).toBeLessThanOrEqual(before);
      }
    });
  }
});
