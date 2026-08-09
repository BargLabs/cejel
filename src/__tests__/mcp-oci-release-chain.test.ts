import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const CHAIN_TEST = fileURLToPath(
  new URL('../../scripts/verify-mcp-oci-release-chain.node-test.mjs', import.meta.url),
);

describe('MCP Registry to OCI attestation release chain', () => {
  it('passes exact-link and fail-closed mismatch tests', () => {
    expect(() =>
      execFileSync(process.execPath, ['--test', CHAIN_TEST], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).not.toThrow();
  });
});
