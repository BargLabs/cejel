import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const outboundTransport = new StreamableHTTPClientTransport(
  new URL('https://example.invalid/mcp'),
);
