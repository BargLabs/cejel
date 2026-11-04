import { execFileSync } from 'node:child_process';

import { HERMETIC_GIT_ENV } from './behaviour-corpus.js';

// Operator ruling of 2 Nov (goal_cejel_v17_unread_history_no_verdict_2026-11-02): under every
// rubric a directory that is not a git repository gets no composite and no verdict, and A2 abstains
// there unless a confirmed critical finding stands. Tests that write a few files to a temporary
// directory to exercise one detector meant a complete clone of those files; this makes the
// directory one, a single hermetic commit, so the detector is read as before.

/** Turns `root` into a git repository holding its current files in one commit. */
export function commitFixture(root: string): string {
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      env: HERMETIC_GIT_ENV,
      stdio: 'pipe',
    });
  git('init', '--quiet');
  git('add', '-A');
  git('commit', '--quiet', '--allow-empty', '-m', 'fixture');
  return root;
}
