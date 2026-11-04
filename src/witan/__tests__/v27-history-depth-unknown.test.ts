import { chmodSync, cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { buildWitanCliSummary } from '../../summary.js';
import { renderWitanBadgeEndpoint } from '../badge.js';
import {
  HISTORY_DEPTH_UNKNOWN_INSTRUCTION,
  WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON,
  WITAN_V27_SHALLOW_HISTORY_REASON,
  isWitanV27HistoryDepthUnknownAbstention,
  readHistoryDepth,
} from '../history-depth.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildMatrixOrigin, cloneRepository, git, scanRepository } from './fixtures/shallow-history-matrix.js';

// Under witan-rubric-v27-prospective-2026-10-19 a shallow clone gets no composite and no verdict.
// The scan learns the depth from `git rev-parse --is-shallow-repository`. Where git cannot answer
// (git missing from PATH, or git unable to open the repository) the depth must not read as
// "complete": that would score a shallow clone, the case the abstention exists to prevent.
//
// - A directory with no git metadata at all is not a repository: it is scored as before.
// - Where git cannot answer but a `.git` entry is visible, Cejel reads the depth from the
//   repository's files: a `shallow` file in its git directory (the common directory, for a linked
//   worktree) means a shallow clone; a readable git directory without one means a complete clone.
// - Where neither git nor the files can say, v27 withholds the composite and the verdict with the
//   reason history_depth_unknown, which says how to fix it and scan again.
// Every other rubric is unchanged: it still scores each of these checkouts.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const canDenyReadAccess = platform() !== 'win32' && process.getuid?.() !== 0;
const scratch: string[] = [];

const repos = { full: '', shallow: '', shallowWorktree: '', shallowCorruptHead: '', noRepository: '' };

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** A copy of `repo` without its .git, in a fresh directory. */
function withoutGit(repo: string): string {
  const copy = join(scratchDir('cejel-depth-copy-'), 'repo');
  cpSync(repo, copy, { recursive: true, filter: (path) => !path.split(/[\\/]/).includes('.git') });
  return copy;
}

/** Runs `scan` with git removed from PATH, as on a host without git. */
function withoutGitOnPath<T>(scan: () => T): T {
  const previous = process.env.PATH;
  process.env.PATH = scratchDir('cejel-empty-path-');
  try {
    return scan();
  } finally {
    process.env.PATH = previous;
  }
}

const reasonOf = (report: WitanReport): string | undefined =>
  report.verdict === 'insufficient_source' ? report.insufficientSourceReason : undefined;
const isHistoryDepthUnknown = (report: WitanReport) => (reasonOf(report) ?? '').includes('(reason: history_depth_unknown)');

function expectScored(report: WitanReport, label: string): void {
  expect(report.verdict, label).not.toBe('insufficient_source');
  expect(report.overallScore, label).not.toBeNull();
}

function expectShallowAbstention(report: WitanReport, label: string): void {
  expect(report.verdict, label).toBe('insufficient_source');
  expect(report.overallScore, label).toBeNull();
  expect(reasonOf(report), label).toBe(WITAN_V27_SHALLOW_HISTORY_REASON);
}

function expectHistoryDepthUnknown(report: WitanReport, label: string): void {
  expect(report.verdict, label).toBe('insufficient_source');
  expect(report.overallScore, label).toBeNull();
  expect(report.codeTrustScore, label).toBeNull();
  expect(report.processTrustScore, label).toBeNull();
  expect(isHistoryDepthUnknown(report), label).toBe(true);
  expect(reasonOf(report), label).toBe(WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON);
  expect(isWitanV27HistoryDepthUnknownAbstention(report), label).toBe(true);
  // The reason says what to do: get git working on the repository, fetch the history, scan again.
  expect(reasonOf(report), label).toContain('git rev-parse --is-shallow-repository');
  expect(reasonOf(report), label).toContain('git fetch --unshallow');
  expect(reasonOf(report), label).toMatch(/then scan again\.$/);
  // Each criterion is still read and shown.
  expect(report.criteria.length, label).toBeGreaterThanOrEqual(11);
}

beforeAll(() => {
  const origin = buildMatrixOrigin('mixed', 'ci-and-template');
  repos.full = cloneRepository(origin);
  repos.shallow = cloneRepository(origin, 1);
  // A linked worktree of a shallow clone: its `.git` is a file, and the `shallow` file lives in the
  // common git directory, not in the worktree's own.
  repos.shallowWorktree = join(scratchDir('cejel-depth-worktree-'), 'wt');
  git(repos.shallow, ['worktree', 'add', '--quiet', '--detach', repos.shallowWorktree]);
  // A shallow clone git refuses to open: its HEAD is not a ref or an object name.
  repos.shallowCorruptHead = cloneRepository(origin, 1);
  writeFileSync(join(repos.shallowCorruptHead, '.git', 'HEAD'), 'this is not a ref\n');
  repos.noRepository = withoutGit(repos.full);
}, 300_000);

afterAll(() => {
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

describe('v27 when git cannot report the history depth', () => {
  it('git missing from PATH, shallow clone: v27 reads the shallow file and abstains as for any shallow clone', () => {
    expectShallowAbstention(withoutGitOnPath(() => scanRepository(repos.shallow, V27)), 'shallow, no git');
  });

  it("git missing from PATH, a linked worktree of a shallow clone: the shallow file is in the common git directory", () => {
    expectShallowAbstention(withoutGitOnPath(() => scanRepository(repos.shallowWorktree, V27)), 'worktree, no git');
  });

  it('git refuses the repository (a corrupt HEAD) on a shallow clone: v27 reads the shallow file and abstains', () => {
    expectShallowAbstention(scanRepository(repos.shallowCorruptHead, V27), 'corrupt HEAD');
  });

  it('git missing from PATH, complete clone: the git directory has no shallow file, so v27 scores it as before', () => {
    const report = withoutGitOnPath(() => scanRepository(repos.full, V27));
    expectScored(report, 'full, no git');
    expect(isHistoryDepthUnknown(report)).toBe(false);
  });

  // Until the operator's ruling of 2 Nov a directory with no git metadata was scored as before. It
  // has no history to read, so it now gets no composite and no verdict under every rubric, with or
  // without git on the host, and its reason is no_git_history, never history_depth_unknown.
  it('a directory with no git metadata is not a repository: Unrated: no git history, with or without git', () => {
    for (const [label, report] of [
      ['no repository', scanRepository(repos.noRepository, V27)],
      ['no repository, no git', withoutGitOnPath(() => scanRepository(repos.noRepository, V27))],
    ] as const) {
      expect(report.verdict, label).toBe('insufficient_source');
      expect(report.overallScore, label).toBeNull();
      expect(reasonOf(report) ?? '', label).toContain('(reason: no_git_history)');
      expect(isHistoryDepthUnknown(report), label).toBe(false);
      expect(buildWitanCliSummary(report).verdict, label).toBe('Unrated: no git history');
    }
  });

  it('a dangling .git symlink: neither git nor the files can say, so v27 withholds with history_depth_unknown', () => {
    const copy = withoutGit(repos.full);
    symlinkSync(join(copy, 'gone', '.git'), join(copy, '.git'));
    expectHistoryDepthUnknown(scanRepository(copy, V27), 'dangling symlink');
  });

  it('a .git file whose gitdir is missing: v27 withholds with history_depth_unknown', () => {
    const copy = withoutGit(repos.full);
    writeFileSync(join(copy, '.git'), `gitdir: ${join(copy, 'missing', 'gitdir')}\n`);
    expectHistoryDepthUnknown(scanRepository(copy, V27), 'missing gitdir');
  });

  it.skipIf(!canDenyReadAccess)('an unreadable .git directory: v27 withholds with history_depth_unknown', () => {
    const copy = cloneRepository(buildMatrixOrigin('mixed', 'ci-only'), 1);
    chmodSync(join(copy, '.git'), 0o000);
    try {
      expectHistoryDepthUnknown(scanRepository(copy, V27), 'unreadable .git');
      expectHistoryDepthUnknown(withoutGitOnPath(() => scanRepository(copy, V27)), 'unreadable .git, no git');
    } finally {
      chmodSync(join(copy, '.git'), 0o755);
    }
  });

  it('the history-depth-unknown abstention is labelled as unrated, not as insufficient source', () => {
    const copy = withoutGit(repos.full);
    symlinkSync(join(copy, 'gone', '.git'), join(copy, '.git'));
    const report = scanRepository(copy, V27);
    expect(buildWitanCliSummary(report).verdict).toBe('Unrated: history depth unknown');
    expect(renderWitanBadgeEndpoint(report).message).toBe('unrated: history depth unknown');
  });
});

// Until the operator's ruling of 2 Nov every other rubric scored each of these checkouts. The ruling
// gives v17 (and every rubric) the same reading of the depth and the same abstention as v27, with a
// reason that names the rubric; a complete clone whose files settle the depth is still scored.
describe('every other rubric reads the depth the same way since the ruling of 2 Nov', () => {
  it('v17 abstains on each shallow or unknown-depth checkout, with git and without it, and scores the complete clone', () => {
    const dangling = withoutGit(repos.full);
    symlinkSync(join(dangling, 'gone', '.git'), join(dangling, '.git'));
    const cases: [string, () => WitanReport, string | undefined][] = [
      ['shallow, no git', () => withoutGitOnPath(() => scanRepository(repos.shallow, V17)), 'shallow_history'],
      ['worktree, no git', () => withoutGitOnPath(() => scanRepository(repos.shallowWorktree, V17)), 'shallow_history'],
      ['corrupt HEAD', () => scanRepository(repos.shallowCorruptHead, V17), 'shallow_history'],
      ['full, no git', () => withoutGitOnPath(() => scanRepository(repos.full, V17)), undefined],
      ['dangling symlink', () => scanRepository(dangling, V17), 'history_depth_unknown'],
    ];
    for (const [label, scan, reason] of cases) {
      const report = scan();
      if (reason === undefined) {
        expectScored(report, label);
        expect(reasonOf(report), label).toBeUndefined();
      } else {
        expect(report.verdict, label).toBe('insufficient_source');
        expect(report.overallScore, label).toBeNull();
        expect(reasonOf(report) ?? '', label).toContain(`Under ${V17} Cejel gives no composite score and no verdict`);
        expect(reasonOf(report) ?? '', label).toContain(`(reason: ${reason})`);
      }
    }
  });
});

describe('readHistoryDepth', () => {
  it('reads git where git answers, and the files where it cannot', () => {
    expect(readHistoryDepth(repos.full)).toBe('complete');
    expect(readHistoryDepth(repos.shallow)).toBe('shallow');
    expect(readHistoryDepth(repos.shallowWorktree)).toBe('shallow');
    expect(readHistoryDepth(repos.shallowCorruptHead)).toBe('shallow');
    expect(readHistoryDepth(repos.noRepository)).toBe('not_a_repository');
    withoutGitOnPath(() => {
      expect(readHistoryDepth(repos.full)).toBe('complete');
      expect(readHistoryDepth(repos.shallow)).toBe('shallow');
      expect(readHistoryDepth(repos.shallowWorktree)).toBe('shallow');
      expect(readHistoryDepth(repos.noRepository)).toBe('not_a_repository');
    });
  });

  it('is unknown, never complete, where the git directory cannot be located or read', () => {
    const dangling = withoutGit(repos.full);
    symlinkSync(join(dangling, 'gone', '.git'), join(dangling, '.git'));
    expect(readHistoryDepth(dangling)).toBe('unknown');
    const emptyPointer = withoutGit(repos.full);
    writeFileSync(join(emptyPointer, '.git'), 'gitdir: \n');
    expect(readHistoryDepth(emptyPointer)).toBe('unknown');
  });

  it('the unknown-depth reason ends with the instruction', () => {
    expect(WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON.endsWith(HISTORY_DEPTH_UNKNOWN_INSTRUCTION)).toBe(true);
    expect(WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON).toContain('(reason: history_depth_unknown)');
    expect(WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON.length).toBeLessThanOrEqual(2000);
  });
});
