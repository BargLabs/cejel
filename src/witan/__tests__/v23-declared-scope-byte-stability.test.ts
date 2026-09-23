import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V22 } from '../rubric-version.js';

// docs/orchestration/goal_cejel_v23_declared_scope_is_false_2026-09-11.md constraint: this PR
// touches rubric-version.ts (a file repo-signals.ts imports from) but must produce byte-identical
// v17 and v22 scan output — only the V23 declaration comment and this test suite change. Rather
// than assume a comment-only diff is behavior-inert, this pins the exact sha256 of the v17 and
// v22 buildWitanInputFromRepo() output against a deterministic fixture.
//
// "Deterministic" has to be earned, not assumed. The output embeds repo.headSha, so the fixture
// COMMIT hash is part of every pinned value — and the first version of this file let that commit
// inherit the running machine's global git config. On any machine with commit.gpgsign=true the
// commit object grew a `gpgsig` block from that machine's own key, the commit hash became
// machine-specific, and both pins failed identically on origin/main from a macOS host and from a
// Linux container (2026-09-15) while passing on CI, which has no signing key. A guard that reads
// red on every developer machine and green only on CI is not guarding anything a developer can
// see. So: every git call below runs with the global and system config masked, identity and dates
// supplied through the environment, and the commit explicitly unsigned. The fixture commit hash
// is then asserted first, by name, so a future environmental drift fails as "fixture not
// reproducible" rather than masquerading as a scan-output change.

// Masks ~/.gitconfig and /etc/gitconfig (signing, hooks path, default branch, autocrlf, …) so the
// fixture depends only on what this file states.
const HERMETIC_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
  GIT_AUTHOR_DATE: '2026-09-11T00:00:00+00:00',
  GIT_COMMITTER_DATE: '2026-09-11T00:00:00+00:00',
  TZ: 'UTC',
};

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' });
}

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-v23-scope-fixture-'));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  return dir;
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = join(dir, rel);
  mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function commitAll(dir: string, message: string): void {
  git(dir, ['add', '-A']);
  // --no-gpg-sign is belt-and-braces over the masked config: an unsigned commit's hash is a
  // function of tree + identity + dates + message and nothing on the machine.
  git(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', message]);
}

function buildFixtureRepo(): string {
  const dir = makeTmpRepo();
  writeFile(
    dir,
    'package.json',
    JSON.stringify(
      { name: 'v23-scope-fixture', version: '1.0.0', scripts: { test: 'vitest run --coverage' } },
      null,
      2,
    ),
  );
  writeFile(dir, 'src/index.ts', 'export const value = 1;\n');
  writeFile(
    dir,
    'src/index.test.ts',
    "import { expect, it } from 'vitest';\nit('works', () => expect(1).toBe(1));\n",
  );
  writeFile(dir, 'README.md', '# fixture\n');
  commitAll(dir, 'initial commit');
  return dir;
}

// The hash of the unsigned fixture commit above. Recorded so a drift in the FIXTURE fails by that
// name instead of surfacing as a mysterious scan-output change: if this assertion fails, nothing
// below it is interpretable, and the cause is the environment (git version, a config this file
// failed to mask), not repo-signals.ts.
const FIXTURE_HEAD_SHA = 'ba2f0ef8c102ea735794b27f7aea5b5ba547263a';

function inputFor(rubricVersion: string): Record<string, unknown> {
  const dir = buildFixtureRepo();
  const headSha = git(dir, ['rev-parse', 'HEAD']).trim();
  expect(
    headSha,
    'fixture commit is not reproducible on this machine — the scan-output pins below cannot be interpreted until this is',
  ).toBe(FIXTURE_HEAD_SHA);
  return buildWitanInputFromRepo({
    productSlug: 'v23-scope-fixture',
    productDisplayName: 'v23 scope fixture',
    repoPath: dir,
    generatedAt: '2026-09-11T00:00:00.000Z',
    rubricVersion,
  }) as unknown as Record<string, unknown>;
}

function hashOf(input: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// These pins were UNCHANGED from the original capture through goal_cejel_v23_declared_scope,
// with the fixture made hermetic reproducing them exactly on a macOS host (commit.gpgsign=true,
// gpg.format=ssh) and a Linux container on origin/main da90785 (2026-09-15).
//
// goal_cejel_withheld_paths_always_disclosed_2026-09-22 moved both pins on purpose: this fixture
// has no oversized/unreadable/withheld file, so buildWitanInputFromRepo's per-path skip and
// scoring output are unchanged, but its return value now always carries an additive
// `withheldPaths: []` — presence of the empty array is itself the "nothing was withheld"
// disclosure this card adds, not a re-pinned score. That was originally stated only as a comment,
// backed by a diff run by hand; each case below now proves it mechanically — delete
// `withheldPaths` from the current output, re-serialize the same way (`JSON.stringify(input)`,
// no whitespace, matching hashFor above), and assert equality with the pre-1.3 pin, recovered
// from `git show v0.4.10:src/witan/__tests__/v23-declared-scope-byte-stability.test.ts` (the
// last capture of this file before goal_cejel_withheld_paths_always_disclosed_2026-09-22).
describe('v23 declared-scope fix: v17/v22 scan output carries withheldPaths: [] and is otherwise byte-identical to the pre-1.3 capture', () => {
  it('v17 output gained withheldPaths: [] only', () => {
    const input = inputFor(WITAN_RUBRIC_VERSION_V17);
    expect(hashOf(input)).toBe(
      '56ac5957223e66c26d6026ee2506aa33308b89209140c3cfcab9876aadf49707',
    );
    const { withheldPaths, ...withoutWithheldPaths } = input;
    expect(withheldPaths).toEqual([]);
    expect(
      hashOf(withoutWithheldPaths),
      'the pre-1.3 v17 output bytes must be recoverable by removing exactly the withheldPaths field',
    ).toBe('53801b02f7cc46781c18cab43c315798f349dd90af76b42a5965e3c81f654554');
  });

  it('v22 output gained withheldPaths: [] only', () => {
    const input = inputFor(WITAN_RUBRIC_VERSION_V22);
    expect(hashOf(input)).toBe(
      '8140d8d1152913a7db566d5c3383a6ade492fd4a0600838dbc7cf85cf62468ed',
    );
    const { withheldPaths, ...withoutWithheldPaths } = input;
    expect(withheldPaths).toEqual([]);
    expect(
      hashOf(withoutWithheldPaths),
      'the pre-1.3 v22 output bytes must be recoverable by removing exactly the withheldPaths field',
    ).toBe('1b63a05c2c9c36c083e4dd7d12472ca27f6e4ae7ab01ab8addb8bdce7b98fbe2');
  });
});
