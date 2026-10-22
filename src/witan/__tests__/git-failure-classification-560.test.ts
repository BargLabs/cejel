import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { classifyGitFailure, execGit } from '../git-exec.js';
import { buildA2HistoryOrigin, cloneShallowA2Origin, removeShallowA2Fixtures } from './fixtures/shallow-a2-shapes.js';

// #560 review (B1): a git failure was classified from text that included Node's error.message,
// which quotes the whole argv ("Command failed: git ... show <commit>:<path>"), so a repository
// path such as `secrets/not a git repository.txt` turned a failed historical blob read into an
// expected absence (dropped silently), and `secrets/timeout.txt` or `secrets/maxBuffer.txt` into
// one of Cejel's own limits. Classification now reads only the spawn error's code and git's own
// stderr lines.

const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('expected a failure');
};

describe('classifyGitFailure reads only fields Node and git control', () => {
  it('ignores argv text in error.message', () => {
    for (const path of ['secrets/not a git repository.txt', 'secrets/timeout.txt', 'secrets/maxBuffer.txt', 'ETIMEDOUT ENOBUFS timed out']) {
      const error = Object.assign(new Error(`Command failed: git --no-pager show 0123abcd:${path}`), {
        status: 128,
        stderr: 'fatal: could not fetch 0123abcd from promisor remote\n',
      });
      expect(classifyGitFailure(error), path).toBe('exec_failed');
    }
  });

  it('ignores a path git echoes inside one of its own messages', () => {
    for (const stderr of [
      "fatal: path 'secrets/not a git repository.txt' does not exist in '0123abcd'\n",
      "fatal: invalid object name '0123abcd:fatal: not a git repository'.\n",
      "error: unable to read 'secrets/timeout.txt'\nfatal: maxBuffer timed out\n",
    ]) {
      expect(classifyGitFailure(Object.assign(new Error('Command failed'), { status: 128, stderr })), stderr).toBe(
        'exec_failed',
      );
    }
  });

  it("still recognises git's own no-repository and no-revision messages", () => {
    for (const stderr of [
      'fatal: not a git repository (or any of the parent directories): .git\n',
      "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions\n",
      "fatal: your current branch 'main' does not have any commits yet\n",
      'fatal: Needed a single revision\n',
    ]) {
      expect(classifyGitFailure(Object.assign(new Error('x'), { status: 128, stderr })), stderr).toBe('not_a_repo');
    }
  });

  it("classifies Node's own output-limit and timeout errors, as Node throws them", () => {
    const overflow = caught(() =>
      execFileSync(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], {
        maxBuffer: 10,
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
    expect(classifyGitFailure(overflow)).toBe('buffer_exceeded');
    const slow = caught(() =>
      execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeout: 200, stdio: ['pipe', 'pipe', 'pipe'] }),
    );
    expect(classifyGitFailure(slow)).toBe('timeout');
  });

  it('real git: a missing path named like a git message is a failed read, and a directory outside git is not a repository', () => {
    const repo = cloneShallowA2Origin(
      buildA2HistoryOrigin('classify', [{ write: { 'README.md': '# c\n' } }]),
      'full',
    );
    try {
      for (const path of ['secrets/not a git repository.txt', 'secrets/timeout.txt', 'secrets/maxBuffer.txt']) {
        expect(execGit(['show', `HEAD:${path}`], { cwd: repo }), path).toMatchObject({ ok: false, reason: 'exec_failed' });
      }
      const plain = mkdtempSync(join(tmpdir(), 'cejel-classify-plain-'));
      try {
        expect(execGit(['rev-parse', 'HEAD'], { cwd: plain })).toMatchObject({ ok: false, reason: 'not_a_repo' });
      } finally {
        rmSync(plain, { recursive: true, force: true });
      }
    } finally {
      removeShallowA2Fixtures();
    }
  });
});
