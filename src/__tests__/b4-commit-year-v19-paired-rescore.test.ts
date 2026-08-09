import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HARNESS_TEST = fileURLToPath(
  new URL('../../scripts/b4-commit-year-v19-paired-rescore.node-test.mjs', import.meta.url),
);

describe('B4 commit-year v19 paired-rescore protocol', () => {
  it('passes ancestry-independent harness, decision, rendering, and board-placement tests', () => {
    expect(() =>
      execFileSync(process.execPath, ['--test', HARNESS_TEST], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).not.toThrow();
  });
});
