import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WitanReport } from '../../schemas.js';

import { buildShallowA2Origin, cloneShallowA2Origin, ISSUE_556_SHAPE, removeShallowA2Fixtures } from './shallow-a2-shapes.js';
import { buildMatrixOrigin, cloneRepository, scanRepository } from './shallow-history-matrix.js';
import { buildDataLayerOrigin } from './verdict-cap-data-layer.js';

// Synthetic checkouts whose git history Cejel could not read in full, beside the complete clone of
// the same commit (goal_cejel_v17_unread_history_no_verdict_2026-11-02). Each case names its cause:
// - 'shallow': `git clone --depth N`;
// - 'shallow + failed read': a shallow clone whose history reads also failed (git missing from
//   PATH, or git refusing the repository), so the depth is read from the .git files;
// - 'depth unknown': a .git entry neither git nor the files can settle;
// - 'no git': a directory with no .git at all (an uploaded snapshot, a tarball, an archive export);
// - 'complete': the full clone of the same commit, scored as before;
// - 'complete + failed read': a complete partial clone whose history blobs are missing.

export type UnreadHistoryCause =
  | 'shallow'
  | 'shallow + failed read'
  | 'depth unknown'
  | 'no git'
  | 'complete'
  | 'complete + failed read';

export interface UnreadHistoryCase {
  readonly label: string;
  readonly cause: UnreadHistoryCause;
  /** The label of the complete clone of the same commit, where there is one. */
  readonly fullClone?: string;
  readonly scan: (rubricVersion: string) => WitanReport;
}

const scratch: string[] = [];

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** A copy of `repo` without its .git, in a fresh directory: an archive export of the commit. */
export function withoutGit(repo: string): string {
  const copy = join(scratchDir('cejel-unread-copy-'), 'repo');
  cpSync(repo, copy, { recursive: true, filter: (path) => !path.split(/[\\/]/).includes('.git') });
  return copy;
}

/** Runs `scan` with git removed from PATH, as on a host without git. */
export function withoutGitOnPath<T>(scan: () => T): T {
  const previous = process.env.PATH;
  process.env.PATH = scratchDir('cejel-unread-empty-path-');
  try {
    return scan();
  } finally {
    process.env.PATH = previous;
  }
}

export function removeUnreadHistoryFixtures(): void {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
  removeShallowA2Fixtures();
}

/** Builds every case. Slow: it clones each origin several times. */
export function buildUnreadHistoryCases(): UnreadHistoryCase[] {
  const cases: UnreadHistoryCase[] = [];
  const add = (label: string, cause: UnreadHistoryCause, path: string, fullClone?: string, noGitOnPath = false) => {
    cases.push({
      label,
      cause,
      ...(fullClone ? { fullClone } : {}),
      scan: (rubric) => (noGitOnPath ? withoutGitOnPath(() => scanRepository(path, rubric)) : scanRepository(path, rubric)),
    });
  };

  // C1: a secret committed and later deleted, beside a data layer.
  const c1 = buildDataLayerOrigin('secret-deleted');
  const c1Full = cloneRepository(c1);
  add('C1 secret deleted, full', 'complete', c1Full);
  add('C1 secret deleted, depth 1', 'shallow', cloneRepository(c1, 1), 'C1 secret deleted, full');
  add('C1 secret deleted, depth 1, git missing', 'shallow + failed read', cloneRepository(c1, 1), 'C1 secret deleted, full', true);
  add('C1 secret deleted, no .git', 'no git', withoutGit(c1Full), 'C1 secret deleted, full');

  const clean = buildDataLayerOrigin('clean');
  const cleanFull = cloneRepository(clean);
  add('data layer clean, full', 'complete', cleanFull);
  add('data layer clean, depth 1', 'shallow', cloneRepository(clean, 1), 'data layer clean, full');
  add('data layer clean, no .git', 'no git', withoutGit(cleanFull), 'data layer clean, full');

  const mixed = buildMatrixOrigin('mixed', 'ci-and-template');
  const mixedFull = cloneRepository(mixed);
  add('mixed history, full', 'complete', mixedFull);
  add('mixed history, depth 1', 'shallow', cloneRepository(mixed, 1), 'mixed history, full');
  add('mixed history, depth 12', 'shallow', cloneRepository(mixed, 12), 'mixed history, full');
  const corruptHead = cloneRepository(mixed, 1);
  writeFileSync(join(corruptHead, '.git', 'HEAD'), 'this is not a ref\n');
  add('mixed history, depth 1, corrupt HEAD', 'shallow + failed read', corruptHead, 'mixed history, full');
  const dangling = withoutGit(mixedFull);
  symlinkSync(join(dangling, 'gone', '.git'), join(dangling, '.git'));
  add('mixed history, dangling .git symlink', 'depth unknown', dangling, 'mixed history, full');
  const missingGitdir = withoutGit(mixedFull);
  writeFileSync(join(missingGitdir, '.git'), `gitdir: ${join(missingGitdir, 'missing', 'gitdir')}\n`);
  add('mixed history, .git file with missing gitdir', 'depth unknown', missingGitdir, 'mixed history, full');
  add('mixed history, no .git', 'no git', withoutGit(mixedFull), 'mixed history, full');

  // #556's shape: A2 would be not applicable on a decision that rests on history reads.
  const issue556 = buildShallowA2Origin(ISSUE_556_SHAPE);
  const issue556Full = cloneShallowA2Origin(issue556, 'full');
  add('#556 deleted .env, full', 'complete', issue556Full);
  add('#556 deleted .env, depth 1', 'shallow', cloneShallowA2Origin(issue556, 1), '#556 deleted .env, full');
  add('#556 deleted .env, missing blobs', 'complete + failed read', cloneShallowA2Origin(issue556, 'missing-blobs'), '#556 deleted .env, full');
  add('#556 deleted .env, no .git', 'no git', withoutGit(issue556Full), '#556 deleted .env, full');

  // A confirmed secret in the checked-out tree.
  const inTree = buildShallowA2Origin({ secret: 'in-tree', dataLayer: false, cryptoSurface: false });
  const inTreeFull = cloneShallowA2Origin(inTree, 'full');
  add('secret in tree, full', 'complete', inTreeFull);
  add('secret in tree, depth 1', 'shallow', cloneShallowA2Origin(inTree, 1), 'secret in tree, full');
  add('secret in tree, no .git', 'no git', withoutGit(inTreeFull), 'secret in tree, full');
  return cases;
}
