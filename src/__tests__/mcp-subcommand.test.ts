import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseCliInvocation } from '../index.js';

// `cejel mcp` must serve the same MCP server as the `cejel-mcp` bin, so the Claude plugin can
// launch it as `npx -y @cejel/cejel@<version> mcp`, the pinned-launcher form the directory reads.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};

describe('cejel mcp subcommand', () => {
  it('parses `mcp` as its own command and refuses extra arguments', () => {
    expect(parseCliInvocation(['mcp'])).toEqual({ command: 'mcp' });
    expect(() => parseCliInvocation(['mcp', '.'])).toThrow(/takes no arguments/);
    expect(parseCliInvocation(['mcp', '--help'])).toMatchObject({ command: 'scan' });
  });

  it('serves the scan tool over stdio with the same identity and annotations as cejel-mcp', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'src/index.ts'), 'mcp'], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const pending = new Map<number, (message: Record<string, unknown>) => void>();
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const message = JSON.parse(buffer.slice(0, newline)) as { id?: number };
        buffer = buffer.slice(newline + 1);
        if (typeof message.id === 'number') pending.get(message.id)?.(message);
        newline = buffer.indexOf('\n');
      }
    });
    const request = (id: number, method: string, params: Record<string, unknown> = {}) =>
      new Promise<Record<string, unknown>>((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    try {
      const initialized = (await request(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'cejel-mcp-subcommand-test', version: '0.0.0' },
      })) as { result: { serverInfo: { name: string; version: string } } };
      expect(initialized.result.serverInfo).toEqual({
        name: `${manifest.name}-mcp`,
        version: manifest.version,
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const listed = (await request(2, 'tools/list')) as {
        result: { tools: Array<{ name: string; title?: string; annotations?: unknown }> };
      };
      expect(listed.result.tools.map(({ name, title, annotations }) => ({ name, title, annotations }))).toEqual([
        {
          name: 'scan',
          title: 'Scan repository trust',
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
      ]);
    } finally {
      child.kill();
    }
  }, 30_000);
});
