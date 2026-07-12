import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runWitanFreeCli } from '../index.js';
import { readPackageIdentity } from '../mcp/index.js';
import { createCejelMcpServer } from '../mcp/server.js';
import type { WitanCliSummary } from '../summary.js';

// REGRESSION GUARD (goal_cejel_mcp_server_wrapper_2026-07-09): the MCP `scan` tool must be
// a thin wrapper over the exact CLI scan path — never a fork or reimplementation of the
// scoring. This locks it the only way that can't drift silently: score the same fixture
// repo through BOTH surfaces and require the certs to be identical (scores, verdict, and
// findings — not just "both succeeded"). If the wrapper ever re-derives scores, rounds
// differently, or skips the ingest fold, this fails loud.

const PACKAGE_MANIFEST_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'package.json',
);

function writeFixtureFile(repoPath: string, relativePath: string, contents: string): void {
  const fullPath = join(repoPath, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${contents}\n`);
}

/** Deterministic fixture repo — content is fixed here in the committed test, so the CLI and
 * MCP runs below always score byte-identical input. */
function writeFixtureRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'cejel-mcp-parity-'));
  writeFixtureFile(
    repoPath,
    'package.json',
    JSON.stringify(
      { name: 'mcp-parity-fixture', version: '1.0.0', scripts: { test: 'vitest run' } },
      null,
      2,
    ),
  );
  writeFixtureFile(repoPath, 'src/index.ts', 'export const add = (a: number, b: number) => a + b;');
  writeFixtureFile(
    repoPath,
    'src/__tests__/index.test.ts',
    "import { add } from '../index.js';\nit('adds', () => expect(add(1, 2)).toBe(3));",
  );
  writeFixtureFile(repoPath, 'README.md', '# mcp-parity-fixture\n\nA fixture repo.');
  return repoPath;
}

/** generatedAt is the run timestamp — the only field allowed to differ between the runs. */
function withoutTimestamp<T extends { generatedAt: string }>(value: T): Omit<T, 'generatedAt'> {
  const { generatedAt: _generatedAt, ...rest } = value;
  return rest;
}

async function connectedClient(server: ReturnType<typeof createCejelMcpServer>): Promise<Client> {
  const client = new Client({ name: 'cejel-mcp-parity-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function toolResultText(result: unknown): string {
  const { content } = result as { content?: Array<{ type: string; text: string }> };
  const first = content?.[0];
  if (!first || first.type !== 'text') throw new Error('expected a text tool result');
  return first.text;
}

describe('cejel MCP scan tool parity with the CLI', () => {
  let fixtureRepo: string;
  let cliSummary: WitanCliSummary;
  let cliReport: { overallScore: number };
  let client: Client;

  beforeAll(async () => {
    fixtureRepo = writeFixtureRepo();
    const outDir = join(fixtureRepo, '.cejel-cli-run');
    const exitCode = await runWitanFreeCli([fixtureRepo, '--out-dir', outDir, '--quiet']);
    expect(exitCode).toBe(0);
    cliSummary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    cliReport = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));

    client = await connectedClient(createCejelMcpServer(readPackageIdentity()));
  });

  afterAll(async () => {
    await client.close();
  });

  it('derives the server name from package.json, never a hardcoded product name', async () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_MANIFEST_PATH, 'utf8')) as {
      name: string;
      version: string;
    };
    expect(client.getServerVersion()).toMatchObject({
      name: `${manifest.name}-mcp`,
      version: manifest.version,
    });
  });

  it('lists exactly one scan tool over stdio-compatible transport', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['scan']);
    const scanTool = tools[0];
    expect(scanTool?.inputSchema).toMatchObject({ type: 'object' });
    expect(Object.keys(scanTool?.inputSchema.properties ?? {}).sort()).toEqual(['format', 'path']);
  });

  it('returns the SAME trust cert as `cejel <fixture>` (summary format)', async () => {
    const result = await client.callTool({
      name: 'scan',
      arguments: { path: fixtureRepo },
    });
    const mcpSummary = JSON.parse(toolResultText(result)) as WitanCliSummary;

    // Full-summary equality (timestamp aside): overall + code/process sub-scores, verdict
    // band, finding counts, and the findings themselves — same scoring, not a fork.
    expect(withoutTimestamp(mcpSummary)).toEqual(withoutTimestamp(cliSummary));
    expect(mcpSummary.overallScore).toBe(cliSummary.overallScore);
    expect(mcpSummary.codeTrustScore).toBe(cliSummary.codeTrustScore);
    expect(mcpSummary.processTrustScore).toBe(cliSummary.processTrustScore);
    expect(mcpSummary.verdict).toBe(cliSummary.verdict);
  });

  it('returns the full report for format=json with the same overall score', async () => {
    const result = await client.callTool({
      name: 'scan',
      arguments: { path: fixtureRepo, format: 'json' },
    });
    const mcpReport = JSON.parse(toolResultText(result)) as {
      overallScore: number;
      criteria: unknown[];
    };
    expect(mcpReport.overallScore).toBe(cliReport.overallScore);
    expect(mcpReport.criteria.length).toBeGreaterThan(0);
  });

  it('exposes the last scan certificate + badge as resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri);
    expect(uris).toHaveLength(2);

    const certificateUri = uris.find((uri) => uri.includes('certificate'));
    const badgeUri = uris.find((uri) => uri.includes('badge'));
    expect(certificateUri).toBeDefined();
    expect(badgeUri).toBeDefined();

    const certificate = await client.readResource({ uri: certificateUri as string });
    expect((certificate.contents[0] as { text: string }).text).toContain('Trust Certificate');
    const badge = await client.readResource({ uri: badgeUri as string });
    expect((badge.contents[0] as { text: string }).text).toContain('<svg');
  });

  it('returns isError (not a crash) for a nonexistent path', async () => {
    const result = await client.callTool({
      name: 'scan',
      arguments: { path: join(fixtureRepo, 'does-not-exist') },
    });
    expect(result.isError).toBe(true);
    expect(toolResultText(result)).toContain('scan failed');
  });

  it('rejects resource reads on a fresh server before any scan has run', async () => {
    const freshClient = await connectedClient(createCejelMcpServer(readPackageIdentity()));
    try {
      const { resources } = await freshClient.listResources();
      const firstUri = resources[0]?.uri;
      expect(firstUri).toBeDefined();
      await expect(freshClient.readResource({ uri: firstUri as string })).rejects.toThrow(
        /No scan has run yet/,
      );
    } finally {
      await freshClient.close();
    }
  });
});
