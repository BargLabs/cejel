import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RECOVERY_TEST = fileURLToPath(
  new URL('../../scripts/b4-commit-year-v19-alfred-recovery.node-test.mjs', import.meta.url),
);

describe('B4 commit-year v19 Alfred recovery protocol', () => {
  it('passes frozen-input, decision, and rendering tests', () => {
    expect(() =>
      execFileSync(process.execPath, ['--test', RECOVERY_TEST], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).not.toThrow();
  });
});
