import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

import { renderWitanBadgeSvg, renderWitanHtmlReport } from '../witan/index.js';
import { WitanReportSchema } from '../witan/schemas.js';
import { type CejelScanResult, runCejelScan } from '../scan.js';

export interface CejelHttpMcpIdentity {
  packageName: string;
  version: string;
}

const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_UPLOAD_BYTES = 3_500_000;

const remoteFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(500)
    .describe('Relative repository path, such as src/index.ts; absolute and parent paths are rejected.'),
  content: z
    .string()
    .max(MAX_FILE_BYTES)
    .describe('UTF-8 file contents. Each file is limited to 1,000,000 characters.'),
});

const summaryFindingSchema = z
  .object({
    criterionId: z.string().describe('Cejel rubric criterion that produced the finding.'),
    severity: z.enum(['critical', 'warning', 'info']).describe('Finding severity.'),
    summary: z.string().describe('Human-readable explanation of the finding.'),
  })
  .strict();

const externalSourceSchema = z
  .object({
    source: z.string().describe('Stable source identifier, such as sarif:semgrep.'),
    label: z.string().describe('Display name of the contributing scanner.'),
    findingCount: z.number().int().describe('Number of findings ingested from this source.'),
    dimensions: z.array(z.string()).describe('Rubric criteria adjusted by this source.'),
  })
  .strict();

const externalFindingSchema = z
  .object({
    source: z.string().describe('Stable source identifier.'),
    label: z.string().describe('Display name of the contributing scanner.'),
    dimension: z.string().describe('Rubric criterion receiving the finding.'),
    severity: z.enum(['critical', 'warning', 'info']).describe('Finding severity.'),
    ruleId: z.string().describe('Source scanner rule identifier.'),
    message: z.string().describe('Source scanner message.'),
    location: z.string().optional().describe('Optional source location supplied by the scanner.'),
  })
  .strict();

const summaryOutputSchema = z
  .object({
    productSlug: z.string().describe('Stable slug identifying the scanned repository.'),
    productDisplayName: z.string().describe('Display name derived from the scanned repository.'),
    generatedAt: z.string().datetime().describe('UTC timestamp at which the certificate was generated.'),
    overallScore: z.number().min(0).max(4).describe('Overall Cejel trust score from 0 to 4.'),
    codeTrustScore: z.number().min(0).max(4).describe('Code-trust score from 0 to 4.'),
    processTrustScore: z.number().min(0).max(4).describe('Process-trust score from 0 to 4.'),
    verdict: z.string().describe('Fail-closed human-readable verdict.'),
    findingCount: z.number().int().describe('Total native findings in the certificate.'),
    topFindings: z.array(summaryFindingSchema).describe('Highest-severity native findings, capped for display.'),
    contributingSources: z.array(z.string()).describe('External scanners whose findings were ingested.'),
    externalSources: z.array(externalSourceSchema).describe('Per-scanner ingestion summaries.'),
    externalFindingCount: z.number().int().describe('Total ingested external findings.'),
    topExternalFindings: z
      .array(externalFindingSchema)
      .describe('Highest-severity ingested findings, capped for display.'),
    insufficientSourceReason: z
      .string()
      .optional()
      .describe('Present when Cejel abstains because the snapshot has no ratable source tree.'),
  })
  .strict();

const scanOutputSchema = z
  .object({
    status: z.enum(['success', 'error']).describe('Whether the scan completed successfully.'),
    format: z.enum(['summary', 'json']).describe('Output representation selected for the scan.'),
    summary: summaryOutputSchema
      .optional()
      .describe('Compact certificate summary, present when format is summary.'),
    report: WitanReportSchema
      .optional()
      .describe('Complete structured certificate, present when format is json.'),
    error: z.string().optional().describe('Failure reason, present when status is error.'),
  })
  .strict()
  .describe('Structured scan result envelope; the text content contains the selected certificate JSON.');

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

  server.registerTool(
    'scan',
    {
      title: 'Scan repository trust',
      description: `Score an uploaded repository snapshot with ${identity.packageName}'s deterministic engineering-trust scan. Pass relative paths and file contents; the adapter never reads a caller's local filesystem. The scan makes no outbound network calls, keeps no uploaded source after the request, and returns either a compact certificate summary or the full structured report.`,
      inputSchema: {
        files: z
          .array(remoteFileSchema)
          .min(1)
          .max(MAX_FILES)
          .describe(
            `Repository snapshot as 1-${MAX_FILES} relative file paths and UTF-8 contents; total upload size is limited to ${MAX_UPLOAD_BYTES} bytes.`,
          ),
        format: z
          .enum(['summary', 'json'])
          .optional()
          .describe('Return summary (default) for a compact certificate, or json for the complete report.'),
      },
      outputSchema: scanOutputSchema,
      annotations: {
        title: 'Scan repository trust',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ files, format }) => {
      let repositoryPath: string | undefined;
      try {
        repositoryPath = await writeRemoteRepository(files);
        const result = runCejelScan({ repoPath: repositoryPath });
        lastScan = result;
        const payload = format === 'json' ? result.report : result.summary;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
          structuredContent: {
            status: 'success',
            format: format ?? 'summary',
            ...(format === 'json' ? { report: result.report } : { summary: result.summary }),
          },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `scan failed: ${message}` }],
          structuredContent: {
            status: 'error',
            format: format ?? 'summary',
            error: message,
          },
        };
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
