import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readPackageIdentity } from '../mcp/index.js';
import { createCejelMcpServer } from '../mcp/server.js';

// The Claude directory requires a readable title and the four safety annotations on every tool.
// The values are claims about the tool as built: `scan` reads a repository and returns a
// certificate, writes and deletes nothing, scores the same input the same way, and makes no
// network call. A change that makes any of these untrue must change this test with it.

describe('cejel MCP tool and resource metadata', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'cejel-mcp-annotations-test', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      createCejelMcpServer(readPackageIdentity()).connect(serverTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('gives scan a title and read-only, non-destructive, idempotent, closed-world annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    const scan = tools[0];
    expect(scan?.name).toBe('scan');
    expect(scan?.title).toBe('Scan repository trust');
    expect(scan?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it('gives both resources a title', async () => {
    const { resources } = await client.listResources();
    expect(Object.fromEntries(resources.map((resource) => [resource.name, resource.title]))).toEqual({
      certificate: 'Last scan certificate',
      badge: 'Last scan badge',
    });
  });
});
