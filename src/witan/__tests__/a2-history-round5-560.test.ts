import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  cloneShallowA2Origin,
  fixtureGit,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #560, review round 5 (pass 1 on cf7fde7ac, an AI reviewer). Real git, constructed fixtures only.
//
// F1: git prints a missing object's path unquoted ("fatal: bad object <commit>:<path>"), and one of
// Cejel's "no repository" patterns matched its phrase anywhere later in the line. A deleted .env
// under a directory named after that phrase, with its blob gone, was dropped as an expected absence:
// no scan limitation, no abstention, A2 a warning above the intact clone's critical. Every phrase
// Cejel recognises is now tried as such a directory name.
//
// F2: a submodule (a gitlink, mode 160000) at a credential-shaped path has no content in this
// repository. Reading it failed, and that counted as an incomplete read: v27 abstained and v17
// disclosed, both falsely, on a complete clone.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const base = { 'package.json': '{"name":"corner","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };
const FAILED_BLOB_READ =
  'Cejel: local git historical blob read failed. Cejel continued with reduced Git history evidence.';

afterAll(() => {
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'a2-round5',
    productDisplayName: 'A2 round 5',
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

describe('#560 F1: a missing object whose path contains a git "no repository" phrase is a failed read', () => {
  it.each([
    'not inside a work tree',
    'not a git repository (or any of the parent directories): .git',
    'not a git repository (or any parent up to mount point x)',
    'not in a git directory',
    'this operation must be run in a work tree',
    'Needed a single revision',
    "ambiguous argument 'HEAD': unknown revision or path not in the working tree.",
    "your current branch 'main' does not have any commits yet",
  ])('%s', (phrase) => {
    const envPath = `${phrase}/.env`;
    // The origin's objects are loose, so one blob can be removed to make its read fail.
    const origin = buildA2HistoryOrigin('missing-object', [
      { write: base },
      { write: { [envPath]: SHALLOW_A2_SYNTHETIC_SECRET_LINE } },
      { remove: [envPath] },
      { write: { 'README.md': '# c\n' } },
    ]);
    const blob = fixtureGit(origin, 'rev-parse', `HEAD~2:${envPath}`);
    rmSync(join(origin, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));

    const v17 = scoreAt(origin, V17);
    expect(v17.scanLimitations).toEqual([FAILED_BLOB_READ]);
    const v27 = a2(scoreAt(origin, V27));
    expect(v27.status).toBe('insufficient_data');
    expect(v27.score).toBe(0);
    expect(v27.notes ?? '').toMatch(new RegExp(`^${WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX}`));
    expect(v27.notes ?? '').toContain('Cejel could not read part of the commit history');
  });
});

describe('#560 F2: a submodule at a credential-shaped path is not a failed history read', () => {
  it('a complete clone with a submodule at config/secrets: no scan limitation, no abstention, no disclosure', () => {
    const submodule = buildA2HistoryOrigin('submodule-content', [{ write: { 'README.md': '# s\n' } }]);
    const superproject = buildA2HistoryOrigin('superproject', [{ write: base }]);
    fixtureGit(superproject, 'submodule', '--quiet', 'add', `file://${submodule}`, 'config/secrets');
    fixtureGit(superproject, 'commit', '--quiet', '-m', 'add submodule');
    // A later commit, so the submodule's commit is not HEAD (the history scan skips HEAD itself).
    fixtureGit(superproject, 'commit', '--quiet', '--allow-empty', '-m', 'later');
    const clone = cloneShallowA2Origin(superproject, 'full');
    expect(fixtureGit(clone, 'ls-files', '--stage', 'config/secrets')).toMatch(/^160000 /);

    for (const rubricVersion of [V17, V27]) {
      const report = scoreAt(clone, rubricVersion);
      expect(report.scanLimitations ?? [], rubricVersion).toEqual([]);
      expect(a2(report).status, rubricVersion).not.toBe('insufficient_data');
      expect(a2(report).disclosures, rubricVersion).toBeUndefined();
    }
  });
});

// Round 6 (pass 2 on 5aaa0d314, R5-1): a `.git` file whose gitdir is missing (a copied submodule or
// worktree) makes git print "fatal: not a git repository: <gitdir>". Round 5's exact-message list did
// not recognise that form, so HEAD resolution threw and the scan failed; on main the scan completed as
// a directory with no repository. It completes again, under v17 and v27.
describe('#560 R5-1: a .git file pointing at a missing gitdir is still "no repository"', () => {
  it('the scan completes under v17 and v27, as on main', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cejel-dangling-gitdir-'));
    try {
      writeFileSync(join(dir, '.git'), 'gitdir: /nonexistent/modules/x\n');
      writeFileSync(join(dir, 'package.json'), '{"name":"dangling","version":"1.0.0"}\n');
      writeFileSync(join(dir, 'index.js'), 'export const a = 1;\n');
      for (const rubricVersion of [V17, V27]) {
        const report = scoreAt(dir, rubricVersion);
        expect(report.repo.headSha, rubricVersion).toBeUndefined();
        expect(report.scanLimitations ?? [], rubricVersion).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A path holding a line break followed by a git message could only reach git's error output if
// Cejel passed it to git. Every history path with a control character (a line break is one) is
// skipped before any read, so such a path is counted under the control-character rule, never read
// and never classified; git-exec.test.ts pins the classifier's first-"fatal:"-line rule as well.
describe('#560: a history path with a line break and a git message is never read', () => {
  it('a deleted credential path "secrets/a<newline>fatal: not a git repository ..." with its blob gone', () => {
    const path = 'secrets/a\nfatal: not a git repository (or any of the parent directories): .git';
    const origin = buildA2HistoryOrigin('newline-path', [
      { write: base },
      { write: { [path]: SHALLOW_A2_SYNTHETIC_SECRET_LINE } },
      { remove: [path] },
      { write: { 'README.md': '# c\n' } },
    ]);
    const blob = fixtureGit(origin, 'rev-parse', `HEAD~2:${path}`);
    rmSync(join(origin, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));

    const v17 = scoreAt(origin, V17);
    expect(v17.scanLimitations).toEqual([
      'Git history contained a credential-shaped pathname with control characters. Cejel omitted that path from historical blob inspection and continued with reduced history evidence.',
    ]);
    const v27 = a2(scoreAt(origin, V27));
    expect(v27.status).toBe('insufficient_data');
    expect(v27.notes ?? '').toContain('unread because its name contains control characters');
  });
});
