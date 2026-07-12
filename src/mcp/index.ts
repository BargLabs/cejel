import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { type CejelMcpIdentity, createCejelMcpServer } from './server.js';

/**
 * Read the published name + version from package.json instead of hardcoding either — the
 * product name may still change, and the rename must only have to touch package.json.
 * package.json sits exactly two levels above this file in every layout this runs from:
 * src/mcp/index.ts in dev (tsx) and dist/mcp/index.js in the built/published package.
 */
export function readPackageIdentity(): CejelMcpIdentity {
  const manifestUrl = new URL('../../package.json', import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
    name: string;
    version: string;
  };
  return { packageName: manifest.name, version: manifest.version };
}

async function main(): Promise<void> {
  const server = createCejelMcpServer(readPackageIdentity());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isEntryPoint(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  // npm's installed node_modules/.bin shim is a symlink to dist/mcp/index.js: argv[1] is the
  // symlink path while import.meta.url resolves to the real file, so the comparison must go
  // through the same realpath or the npx-invoked bin silently exits 0 doing nothing (same
  // guard as src/index.ts).
  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(invokedPath);
  } catch {
    resolvedPath = invokedPath;
  }
  return import.meta.url === pathToFileURL(resolvedPath).href;
}

if (isEntryPoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown MCP server error.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
