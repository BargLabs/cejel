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
// v22 buildWitanInputFromRepo() output against a deterministic fixture (fixed commit identity,
// author/committer date, and message so the git commit hash — and therefore the JSON output — is
// reproducible across runs and machines). The expected hashes were captured by running this same
// fixture against the pre-fix origin/main code before making any change in this PR.

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-v23-scope-fixture-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = join(dir, rel);
  mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function commitAll(dir: string, message: string, date: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', message], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
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
  commitAll(dir, 'initial commit', '2026-09-11T00:00:00+00:00');
  return dir;
}

function hashFor(rubricVersion: string): string {
  const dir = buildFixtureRepo();
  const input = buildWitanInputFromRepo({
    productSlug: 'v23-scope-fixture',
    productDisplayName: 'v23 scope fixture',
    repoPath: dir,
    generatedAt: '2026-09-11T00:00:00.000Z',
    rubricVersion,
  });
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

describe('v23 declared-scope fix leaves v17/v22 scan output byte-identical', () => {
  it('v17 output hash is unchanged', () => {
    expect(hashFor(WITAN_RUBRIC_VERSION_V17)).toBe(
      '53801b02f7cc46781c18cab43c315798f349dd90af76b42a5965e3c81f654554',
    );
  });

  it('v22 output hash is unchanged', () => {
    expect(hashFor(WITAN_RUBRIC_VERSION_V22)).toBe(
      '1b63a05c2c9c36c083e4dd7d12472ca27f6e4ae7ab01ab8addb8bdce7b98fbe2',
    );
  });
});
