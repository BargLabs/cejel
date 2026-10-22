import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hasVisibleGitMetadata, withGitDiscoveryConfinedTo } from '../git-exec.js';

// #560 F3: hasVisibleGitMetadata tells "git could not be run in a repository" from "this is not a
// repository" (#568) with a filesystem check only. It must find a `.git` entry in the scanned
// directory or a parent, as a directory or as the file a worktree or submodule uses, and must stop
// at the discovery ceiling of a confined (uploaded snapshot) scan.

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cejel-git-metadata-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('hasVisibleGitMetadata', () => {
  it('finds a .git directory in the scanned directory and from a subdirectory', () => {
    mkdirSync(join(root, 'repo', '.git'), { recursive: true });
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
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'snapshot', 'src'), { recursive: true });
    expect(hasVisibleGitMetadata(join(root, 'snapshot', 'src'))).toBe(true);
    expect(
      withGitDiscoveryConfinedTo(join(root, 'snapshot'), () => hasVisibleGitMetadata(join(root, 'snapshot', 'src'))),
    ).toBe(false);
    mkdirSync(join(root, 'snapshot', '.git'));
    expect(
      withGitDiscoveryConfinedTo(join(root, 'snapshot'), () => hasVisibleGitMetadata(join(root, 'snapshot', 'src'))),
    ).toBe(true);
  });
});
