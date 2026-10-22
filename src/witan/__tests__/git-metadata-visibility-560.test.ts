import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hasVisibleGitMetadata, withGitDiscoveryConfinedTo } from '../git-exec.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';

// #560 F3: hasVisibleGitMetadata tells "git could not be run in a repository" from "this is not a
// repository" (#568) with a filesystem check only. It must find a `.git` entry in the scanned
// directory or a parent, as a directory or as the file a worktree or submodule uses, and must stop
// at the discovery ceiling of a confined (uploaded snapshot) scan. #560 review (G2): a `.git` entry
// counts only when it looks like git metadata: a directory holding `HEAD`, or a file with a
// `gitdir:` line. A stray empty `.git` directory in a parent, or another `.git` file, does not.

/** A `.git` directory that looks like git metadata: it holds HEAD. */
function gitDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'HEAD'), 'ref: refs/heads/main\n');
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cejel-git-metadata-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('hasVisibleGitMetadata', () => {
  it('finds a .git directory in the scanned directory and from a subdirectory', () => {
    gitDirectory(join(root, 'repo', '.git'));
    mkdirSync(join(root, 'repo', 'packages', 'a'), { recursive: true });
    expect(hasVisibleGitMetadata(join(root, 'repo'))).toBe(true);
    expect(hasVisibleGitMetadata(join(root, 'repo', 'packages', 'a'))).toBe(true);
  });

  it('finds the .git file a worktree or submodule uses', () => {
    mkdirSync(join(root, 'worktree', 'src'), { recursive: true });
    writeFileSync(join(root, 'worktree', '.git'), 'gitdir: /elsewhere/.git/worktrees/w\n');
    mkdirSync(join(root, 'super', 'sub'), { recursive: true });
    writeFileSync(join(root, 'super', 'sub', '.git'), 'gitdir: ../.git/modules/sub\n');
    expect(hasVisibleGitMetadata(join(root, 'worktree', 'src'))).toBe(true);
    expect(hasVisibleGitMetadata(join(root, 'super', 'sub'))).toBe(true);
  });

  it('is false where no .git entry exists in the directory or any parent', () => {
    mkdirSync(join(root, 'plain', 'nested'), { recursive: true });
    expect(hasVisibleGitMetadata(join(root, 'plain', 'nested'))).toBe(false);
  });

  it('is false for a path that does not exist', () => {
    expect(hasVisibleGitMetadata(join(root, 'missing'))).toBe(false);
  });

  it('stops at the discovery ceiling of a confined scan', () => {
    // .git sits in the parent of the confined root: git itself would not look there, so neither
    // may this check. Inside the root it is found as usual.
    gitDirectory(join(root, '.git'));
    mkdirSync(join(root, 'snapshot', 'src'), { recursive: true });
    expect(hasVisibleGitMetadata(join(root, 'snapshot', 'src'))).toBe(true);
    expect(
      withGitDiscoveryConfinedTo(join(root, 'snapshot'), () => hasVisibleGitMetadata(join(root, 'snapshot', 'src'))),
    ).toBe(false);
    gitDirectory(join(root, 'snapshot', '.git'));
    expect(
      withGitDiscoveryConfinedTo(join(root, 'snapshot'), () => hasVisibleGitMetadata(join(root, 'snapshot', 'src'))),
    ).toBe(true);
  });

  it('does not count a .git entry that does not look like git metadata', () => {
    mkdirSync(join(root, 'stray', '.git'), { recursive: true });
    mkdirSync(join(root, 'stray', 'proj'), { recursive: true });
    expect(hasVisibleGitMetadata(join(root, 'stray', 'proj'))).toBe(false);
    mkdirSync(join(root, 'notes'), { recursive: true });
    writeFileSync(join(root, 'notes', '.git'), 'not a gitfile\n');
    expect(hasVisibleGitMetadata(join(root, 'notes'))).toBe(false);
    writeFileSync(join(root, 'notes', '.git'), '# comment\ngitdir: /elsewhere/.git\n');
    expect(hasVisibleGitMetadata(join(root, 'notes'))).toBe(true);
  });
});

describe('a stray empty .git directory in a parent is not an unopenable repository (#560 review, G2)', () => {
  it('A2 stays not applicable with no disclosure under v17 and v27', () => {
    mkdirSync(join(root, 'stray', '.git'), { recursive: true });
    mkdirSync(join(root, 'stray', 'proj', 'src'), { recursive: true });
    writeFileSync(join(root, 'stray', 'proj', 'package.json'), '{"name":"stray","version":"1.0.0"}\n');
    writeFileSync(join(root, 'stray', 'proj', 'src', 'a.js'), 'export const a = 1;\n');
    for (const rubricVersion of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27]) {
      const report = scoreRepoWithPublicCejel({
        repoPath: join(root, 'stray', 'proj'),
        productSlug: 'stray-fixture',
        productDisplayName: 'Stray fixture',
        generatedAt: '2026-10-22T00:00:00.000Z',
        rubricVersion,
        ingestPatterns: [],
        autoDiscoverIngest: false,
      });
      const a2 = report.criteria.find(({ id }) => id === 'A2');
      expect(a2?.status, rubricVersion).toBe('not_applicable');
      expect(a2?.disclosures, rubricVersion).toBeUndefined();
    }
  });
});
