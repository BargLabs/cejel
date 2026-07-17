import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

import { renderWitanBadgeSvg, renderWitanHtmlReport } from '../witan/index.js';
import { type CejelScanResult, runCejelScan } from '../scan.js';

export interface CejelHttpMcpIdentity {
  packageName: string;
  version: string;
}

const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_UPLOAD_BYTES = 3_500_000;

const remoteFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(MAX_FILE_BYTES),
});

function validateRelativePath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/');
  if (
    normalized.includes('\0') ||
    isAbsolute(normalized) ||
    normalized.split('/').some((segment) => segment === '..' || segment.length === 0)
  ) {
    throw new Error(`Invalid repository file path: ${filePath}`);
  }
  return normalized;
}

async function writeRemoteRepository(
  files: readonly { path: string; content: string }[],
): Promise<string> {
  if (files.length === 0) throw new Error('At least one repository file is required.');

  let totalBytes = 0;
  const repositoryPath = await mkdtemp(join(tmpdir(), 'cejel-http-'));
  try {
    for (const file of files) {
      const path = validateRelativePath(file.path);
      totalBytes += Buffer.byteLength(file.content, 'utf8');
      if (totalBytes > MAX_UPLOAD_BYTES) {
        throw new Error(`Repository snapshot exceeds the ${MAX_UPLOAD_BYTES} byte limit.`);
      }

      const target = resolve(repositoryPath, path);
      const relativeTarget = relative(repositoryPath, target);
      if (relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
        throw new Error(`Invalid repository file path: ${file.path}`);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
    return repositoryPath;
  } catch (error: unknown) {
    await rm(repositoryPath, { recursive: true, force: true });
    throw error;
  }
}

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'content-type, mcp-session-id, last-event-id');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Expose-Headers', 'mcp-session-id, last-event-id, content-type');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createCejelHttpMcpServer(identity: CejelHttpMcpIdentity): McpServer {
  let lastScan: CejelScanResult | undefined;
  const certificateUri = 'cejel://last-scan/certificate.html';
  const badgeUri = 'cejel://last-scan/badge.svg';
  const server = new McpServer({
    name: `${identity.packageName}-http-mcp`,
    version: identity.version,
  });

  server.tool(
    'scan',
    `Score an uploaded repository snapshot with ${identity.packageName}'s deterministic engineering-trust scan. The remote Toolbox adapter accepts file contents, makes no outbound network calls, and does not retain the snapshot after the request.`,
    {
      files: z
        .array(remoteFileSchema)
        .min(1)
        .max(MAX_FILES)
        .describe('Repository snapshot as relative file paths and UTF-8 contents.'),
      format: z
        .enum(['summary', 'json'])
        .optional()
        .describe('summary (default) or json for the full structured certificate.'),
    },
    async ({ files, format }) => {
      let repositoryPath: string | undefined;
      try {
        repositoryPath = await writeRemoteRepository(files);
        const result = runCejelScan({ repoPath: repositoryPath });
        lastScan = result;
        const payload = format === 'json' ? result.report : result.summary;
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: 'text' as const, text: `scan failed: ${message}` }] };
      } finally {
        if (repositoryPath) await rm(repositoryPath, { recursive: true, force: true });
      }
    },
  );

  server.resource(
    'certificate',
    certificateUri,
    {
      description: 'Self-contained HTML trust certificate from the most recent remote scan.',
      mimeType: 'text/html',
    },
    async (uri) => {
      if (!lastScan) throw new Error('No scan has run yet — call the scan tool first.');
      return { contents: [{ uri: uri.href, mimeType: 'text/html', text: renderWitanHtmlReport(lastScan.report) }] };
    },
  );

  server.resource(
    'badge',
    badgeUri,
    {
      description: 'Static SVG trust-score badge from the most recent remote scan.',
      mimeType: 'image/svg+xml',
    },
    async (uri) => {
      if (!lastScan) throw new Error('No scan has run yet — call the scan tool first.');
      return { contents: [{ uri: uri.href, mimeType: 'image/svg+xml', text: renderWitanBadgeSvg(lastScan.report) }] };
    },
  );

  return server;
}

export async function handleCejelHttpRequest(
  request: Request,
  identity: CejelHttpMcpIdentity,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return corsResponse(new Response(null, { status: 204 }));
  }

  const server = createCejelHttpMcpServer(identity);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return corsResponse(await transport.handleRequest(request));
}
