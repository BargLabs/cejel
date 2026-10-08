import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { type CejelMcpIdentity, createCejelMcpServer } from './server.js';

/**
 * Serve the Cejel MCP server over stdio. Shared by the `cejel-mcp` bin (src/mcp/index.ts) and the
 * `cejel mcp` subcommand (src/index.ts). This module has no entry-point check of its own: once
 * bundled into dist/index.js it shares that file's import.meta.url, so a check here would start
 * the server on every CLI invocation. Resolves once connected; the open stdin keeps it serving.
 */
export async function serveCejelMcpOverStdio(identity: CejelMcpIdentity): Promise<void> {
  await createCejelMcpServer(identity).connect(new StdioServerTransport());
}
