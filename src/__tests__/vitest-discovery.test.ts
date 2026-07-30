import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const vitestPackagePath = require.resolve('vitest/package.json');
const vitestCliPath = join(dirname(vitestPackagePath), 'vitest.mjs');

describe('Vitest discovery', () => {
  test('does not collect tests from nested worktrees', () => {
    const output = execFileSync(
      process.execPath,
      [vitestCliPath, 'list', '--filesOnly', '--root', repoRoot],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );
    const collectedPaths = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    expect(collectedPaths.length).toBeGreaterThan(0);
    expect(
      collectedPaths.filter((path) => path.split(/[\\/]/).includes('.worktrees')),
    ).toEqual([]);
  });
});
