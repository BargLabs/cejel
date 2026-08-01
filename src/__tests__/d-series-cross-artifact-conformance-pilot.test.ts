import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('D-series cross-artifact conformance pilot harness', () => {
  it('keeps the synthetic checker contract fail-closed', () => {
    const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
    const output = execFileSync(
      process.execPath,
      ['--test', 'scripts/d-series-cross-artifact-conformance-pilot.node-test.mjs'],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    expect(output).toContain('pass 7');
    expect(output).toContain('fail 0');
  });
});
