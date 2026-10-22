import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #560, #568, review pass 1 (an AI reviewer): git itself cannot be run (ENOENT). No fixture can
// produce that on demand, so in 'git-absent' mode this file replaces every execGit result with it
// and otherwise runs for real. Every history read then reports an expected absence, which used to
// make A2 not applicable on a repository whose history holds a secret, with nothing said. It is now
// an incomplete read wherever a `.git` entry is visible from the scanned path, and unchanged where
// none is. (Timeouts and the collector's recorder wiring are pinned in
// a2-history-read-failures-560.test.ts.)
const mode = { current: 'real' as 'real' | 'git-absent' };
vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      if (mode.current === 'git-absent') return { ok: false as const, reason: 'git_absent' as const };
      return actual.execGit(argv, options);
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const base = {
  'package.json': '{"name":"corner","version":"1.0.0"}\n',
  'src/a.js': 'export const a = 1;\n',
};
const repos = { deletedEnv: '', plain: '' };

beforeAll(() => {
  repos.deletedEnv = cloneShallowA2Origin(
    buildA2HistoryOrigin('mocked-deleted-env', [
      { write: base },
      { write: { '.env': SHALLOW_A2_SYNTHETIC_SECRET_LINE } },
      { remove: ['.env'] },
      { write: { 'README.md': '# c\n' } },
    ]),
    'full',
  );
  repos.plain = mkdtempSync(join(tmpdir(), 'cejel-a2-mocked-plain-'));
  cpSync(repos.deletedEnv, repos.plain, {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).includes('.git'),
  });
}, 120_000);

beforeEach(() => {
  mode.current = 'real';
});

afterAll(() => {
  mode.current = 'real';
  rmSync(repos.plain, { recursive: true, force: true });
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'a2-mocked-failures',
    productDisplayName: 'A2 mocked failures',
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

describe('#560, #568: git itself unavailable', () => {
  it('in a repository whose history holds a secret: v17 stays not applicable and says so; v27 abstains at 0', () => {
    // With git, the complete clone reports the deleted .env value.
    expect(a2(scoreAt(repos.deletedEnv, V27)).status).toBe('critical');

    mode.current = 'git-absent';
    const disclosure =
      "A2's applicability was decided from an incomplete read of the commit history: git could not be " +
      'run on the scanning host, so Cejel read none of the commit history. Marking A2 not applicable ' +
      "rests in part on Cejel's scans of earlier commits for .env files and credential-shaped values, " +
      'so a complete read of the history may make A2 applicable and give it a score. Re-scan on a host ' +
      'where git is installed.';
    const v17 = scoreAt(repos.deletedEnv, V17);
    expect(a2(v17).status).toBe('not_applicable');
    expect(a2(v17).disclosures).toEqual([disclosure]);

    const v27 = scoreAt(repos.deletedEnv, V27);
    const criterion = a2(v27);
    expect(criterion.status).toBe('insufficient_data');
    expect(criterion.score).toBe(0);
    expect(criterion.notes ?? '').toMatch(new RegExp(`^${WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX}`));
    expect(criterion.notes ?? '').toContain('git could not be run on the scanning host');
    expect(criterion.notes ?? '').toContain('Re-scan on a host where git is installed.');
  });

  it('in a directory with no .git anywhere above it: unchanged, not applicable with no disclosure', () => {
    mode.current = 'git-absent';
    for (const rubricVersion of [V17, V27]) {
      const criterion = a2(scoreAt(repos.plain, rubricVersion));
      expect(criterion.status, rubricVersion).toBe('not_applicable');
      expect(criterion.disclosures, rubricVersion).toBeUndefined();
    }
  });
});
