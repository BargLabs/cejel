import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const protocolTest = new URL(
  '../../calibration/llm/scripts/collect-discovery-hits-v2.node-test.mjs',
  import.meta.url,
);

describe('resource-bounded discovery collector v2', () => {
  it('passes deterministic, historical-pin, timeout, continuation, and CLI fail-closed tests', () => {
    const output = execFileSync(process.execPath, ['--test', protocolTest.pathname], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(output).toContain('fail 0');
  });
});
