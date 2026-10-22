import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildA2HistoryOrigin, cloneShallowA2Origin, removeShallowA2Fixtures } from './fixtures/shallow-a2-shapes.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// The 5,000-file cap cause of #560's failed-history abstention, on a real scan: the full no-rise
// property against v17, with A2 a failed-history abstention held in the denominator. The other
// causes are in v27-no-rise-failed-history.test.ts. This case has a file of its own because it is
// slow: both rubrics read 5,000 historical blobs, about 115 s alone and up to about 185 s beside the
// rest of the suite or under host load (#558 round 7). In its own file it does not hold a worker the
// other cases need, and its timeouts (600 s for the fixture and for the case) leave over 3x headroom
// over the slowest measured run, for CI runners with fewer cores (#561).

function score(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'failed-history-no-rise',
    productDisplayName: 'Failed-history no-rise',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

const a2 = (report: WitanReport): WitanCriterionScore => report.criteria.find(({ id }) => id === 'A2')!;

describe('#560 failed-history abstention at the history secret scan cap passes the no-rise property against v17', () => {
  let overCap = '';

  beforeAll(() => {
    const files: Record<string, string> = {
      'package.json': '{"name":"corner","version":"1.0.0"}\n',
      'src/a.js': 'export const a = 1;\n',
      '.gitignore': '.env\n',
    };
    for (let index = 0; index < 5_001; index += 1) files[`certs/c${index}.pem`] = `c${index}\n`;
    overCap = cloneShallowA2Origin(
      buildA2HistoryOrigin('no-rise-over-cap', [{ write: files }, { write: { 'README.md': '# c\n' } }]),
      'full',
    );
  }, 600_000);

  afterAll(() => {
    removeShallowA2Fixtures();
  });

  it('the history secret scan cap of 5,000 files', () => {
    const before = score(overCap, WITAN_RUBRIC_VERSION_V17);
    const after = score(overCap, WITAN_RUBRIC_VERSION_V27);
    expect(a2(after).status).toBe('insufficient_data');
    expect(a2(after).notes ?? '').toContain('stopped at its own cap of 5,000 historical files');
    const result = checkNoRise(before, after);
    expect(result.problems).toEqual([]);
    expect(lostFindings(before, after)).toEqual([]);
    expect(result.introducedAbstentions.filter(({ id }) => id === 'A2')).toEqual([
      { id: 'A2', kind: 'failed-history', denominator: 'kept' },
    ]);
  }, 600_000);
});
