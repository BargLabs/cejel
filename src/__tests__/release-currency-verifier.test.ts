import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const VERIFIER_TEST = fileURLToPath(
  new URL('../../scripts/verify-release-currency.node-test.mjs', import.meta.url),
);

describe('release-currency verifier', () => {
  it('fails closed for stale, unreachable, and cross-surface digest mismatch fixtures', () => {
    expect(() =>
      execFileSync(process.execPath, ['--test', VERIFIER_TEST], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).not.toThrow();
  });
});
