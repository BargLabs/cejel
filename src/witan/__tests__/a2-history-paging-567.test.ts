import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  ISSUE_556_SHAPE,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  fixtureGit,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #567: on a large complete history, A2's whole-history reads (the `.env`-path log, the tree
// enumeration, the deleted-path log and `rev-list HEAD`) stopped at Cejel's own 8 MiB output limit,
// and A2 lost that evidence (biomejs, react). Such a read is now re-run in pages and batches. A
// fixture large enough to pass 8 MiB would make this file slow, so in 'limited' mode execGit reports
// the output limit for any whole-history call and for any batch of more than MAX_BATCH commits, and
// everything else runs for real. The complete clone must then read exactly what it reads unlimited.
const MAX_BATCH = 4;
const mode = { current: 'real' as 'real' | 'limited' | 'one-commit-too-big', bigCommit: '' };
const overflow = { ok: false as const, reason: 'buffer_exceeded' as const };

vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      if (mode.current !== 'real') {
        const wholeHistory =
          (argv[0] === 'rev-list' && argv.length === 2 && argv[1] === 'HEAD') ||
          (argv[0] === 'log' && argv.includes('HEAD') && argv.includes('--name-only'));
        if (wholeHistory) return overflow;
        const readsCommitsOnStdin = argv.includes('--stdin');
        if (readsCommitsOnStdin) {
          const commits = (options.input ?? '').split('\n').filter((line) => line !== '');
          if (commits.length > MAX_BATCH) return overflow;
          if (mode.current === 'one-commit-too-big' && commits.includes(mode.bigCommit) && argv[0] === 'diff-tree') {
            return overflow;
          }
        }
      }
      return actual.execGit(argv, options);
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
let clone = '';

beforeAll(() => {
  clone = cloneShallowA2Origin(buildShallowA2Origin(ISSUE_556_SHAPE), 'full');
}, 120_000);

beforeEach(() => {
  mode.current = 'real';
});

afterAll(() => {
  mode.current = 'real';
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'a2-history-paging',
    productDisplayName: 'A2 history paging',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function a2(report: WitanReport): WitanCriterionScore {
  const found = report.criteria.find(({ id }) => id === 'A2');
  if (!found) throw new Error('no A2');
  return found;
}

describe("#567: a whole-history read that stops at Cejel's own output limit is re-run in batches", () => {
  it('the batched read gives exactly the unlimited result under v17 and v27, with no scan limitation', () => {
    for (const rubricVersion of [V17, V27]) {
      mode.current = 'real';
      const unlimited = scoreAt(clone, rubricVersion);
      expect(a2(unlimited).status, rubricVersion).toBe('critical');
      mode.current = 'limited';
      const batched = scoreAt(clone, rubricVersion);
      expect(batched.scanLimitations ?? [], rubricVersion).toEqual([]);
      expect(projectWitanScoringSurface(batched), rubricVersion).toEqual(projectWitanScoringSurface(unlimited));
      expect(a2(batched).findings, rubricVersion).toEqual(a2(unlimited).findings);
    }
  });

  it('a single commit that still overflows is declared, and the rest of the history is still read', () => {
    // The commit that added the secret-bearing .env: the tree enumeration cannot read it even alone.
    mode.bigCommit = fixtureGit(clone, 'log', '--format=%H', '--diff-filter=A', '--', '.env');
    mode.current = 'one-commit-too-big';
    const report = scoreAt(clone, V17);
    expect(report.scanLimitations).toEqual([
      'Cejel: local git history tree enumeration exceeded the 8 MiB output limit. Cejel continued with reduced Git history evidence.',
    ]);
    // The deleted-path scan still finds .env and reads its value through the per-path log, so the
    // critical finding stands on what was read.
    expect(a2(report).status).toBe('critical');
  });
});
