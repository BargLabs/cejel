import { resolve } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { renderWitanBadgeSvg, renderWitanHtmlReport } from '../witan/index.js';

import { type CejelScanResult, runCejelScan } from '../scan.js';

/**
 * Published-package identity, always read from package.json (see src/mcp/index.ts) — the
 * product name may still change, so nothing here hardcodes it: server name, tool copy, and
 * resource URIs all derive from the name a rename would edit in one place.
 */
export interface CejelMcpIdentity {
  /** npm package name from package.json (also the CLI bin name). */
  packageName: string;
  /** Package version from package.json. */
  version: string;
}

/**
 * Thin MCP wrapper around the existing trust-certificate scan: ONE `scan` tool that calls
 * the same runCejelScan path as the CLI (never a reimplementation — the parity regression
 * test locks this), plus two read-only resources exposing the last scan's certificate and
 * badge. stdio-only, fully offline: no network, no telemetry, no model call, and no files
 * written — the tool computes and returns; artifact-writing stays a CLI concern.
 */
export function createCejelMcpServer(identity: CejelMcpIdentity): McpServer {
  let lastScan: CejelScanResult | undefined;
  const certificateUri = `${identity.packageName}://last-scan/certificate.html`;
  const badgeUri = `${identity.packageName}://last-scan/badge.svg`;

  const server = new McpServer({
    name: `${identity.packageName}-mcp`,
    version: identity.version,
  });

  server.tool(
    'scan',
    `Score a repository's engineering-trust signals (tests, secrets, isolation, claim-vs-reality, CI discipline) with the ${identity.packageName} trust-certificate scan — the exact same offline, deterministic scoring as running the ${identity.packageName} CLI on the path. Returns the trust cert as JSON: overall + code/process sub-scores (0-4), verdict band, and top findings. No network, no telemetry, no signup. After a scan, the full HTML certificate and SVG badge are readable as the resources ${certificateUri} and ${badgeUri}.`,
    {
      path: z
        .string()
        .min(1)
        .describe('Path to the repository to score (absolute, or relative to the server CWD)'),
      format: z
        .enum(['summary', 'json'])
        .optional()
        .describe(
          "summary (default): compact cert digest — scores, verdict, top findings. json: the full structured report, identical to the CLI's report.json.",
        ),
    },
    async ({ path, format }) => {
      let result: CejelScanResult;
      try {
        result = runCejelScan({ repoPath: resolve(path) });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `scan failed for ${path}: ${message}` }],
        };
      }
      lastScan = result;
      const payload = format === 'json' ? result.report : result.summary;
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.resource(
    'certificate',
    certificateUri,
    {
      description:
        'Self-contained HTML trust certificate from the most recent scan tool call (no external assets).',
      mimeType: 'text/html',
    },
    async (uri) => {
      if (!lastScan) throw new Error('No scan has run yet — call the scan tool first.');
      return {
        contents: [
          { uri: uri.href, mimeType: 'text/html', text: renderWitanHtmlReport(lastScan.report) },
        ],
      };
    },
  );

  server.resource(
    'badge',
    badgeUri,
    {
      description:
        'Static, self-contained SVG trust-score badge from the most recent scan tool call.',
      mimeType: 'image/svg+xml',
    },
    async (uri) => {
      if (!lastScan) throw new Error('No scan has run yet — call the scan tool first.');
      return {
        contents: [
          { uri: uri.href, mimeType: 'image/svg+xml', text: renderWitanBadgeSvg(lastScan.report) },
        ],
      };
    },
  );

  return server;
}
