import { readFileSync } from 'node:fs';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleAuthenticatedCejelHttpRequest } from '../http/auth.js';

const ACCESS_TOKEN = 'test-only-cejel-mcp-access-token';
const ORIGINAL_ACCESS_TOKEN = process.env.CEJEL_MCP_ACCESS_TOKEN;
const ACCESS_MESSAGE =
  'Bearer token required. Request access at https://github.com/BargLabs/cejel/issues/new.';
const TEST_IDENTITY = {
  packageName: '@cejel/cejel',
  version: '0.2.2',
};

function handleRequest(request: Request): Promise<Response> {
  return handleAuthenticatedCejelHttpRequest(request, () => TEST_IDENTITY);
}

function initializeRequest(token?: string): Request {
  const headers = new Headers({
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  });
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);

  return new Request('https://cejel-mcp.vercel.app/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: {
          name: 'cejel-http-auth-test',
          version: '0.0.0',
        },
      },
    }),
  });
}

async function expectUnauthorized(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  expect(response.headers.get('content-type')).toContain('application/json');
  await expect(response.json()).resolves.toEqual({
    error: 'unauthorized',
    message: ACCESS_MESSAGE,
  });
}

describe.sequential('/api/mcp bearer authentication', () => {
  beforeEach(() => {
    process.env.CEJEL_MCP_ACCESS_TOKEN = ACCESS_TOKEN;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (ORIGINAL_ACCESS_TOKEN === undefined) {
      delete process.env.CEJEL_MCP_ACCESS_TOKEN;
    } else {
      process.env.CEJEL_MCP_ACCESS_TOKEN = ORIGINAL_ACCESS_TOKEN;
    }
  });

  it('rejects a request with no Authorization header', async () => {
    const identity = vi.fn(() => TEST_IDENTITY);
    await expectUnauthorized(
      await handleAuthenticatedCejelHttpRequest(initializeRequest(), identity),
    );
    expect(identity).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong bearer token', async () => {
    await expectUnauthorized(await handleRequest(initializeRequest('wrong-token')));
  });

  it('accepts the correct bearer token and completes the MCP handshake', async () => {
    const response = await handleRequest(initializeRequest(ACCESS_TOKEN));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 1,
        result: expect.objectContaining({
          protocolVersion: '2025-11-25',
          serverInfo: expect.objectContaining({
            name: '@cejel/cejel-http-mcp',
          }),
        }),
      }),
    );
  });

  it('keeps an authenticated GET event stream open for the client', async () => {
    const response = await handleRequest(
      new Request('https://cejel-mcp.vercel.app/api/mcp', {
        method: 'GET',
        headers: {
          accept: 'text/event-stream',
          authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    if (!response.body) throw new Error('Authenticated SSE response has no body.');

    const reader = response.body.getReader();
    const outcome = await Promise.race([
      reader.read().then((result) => (result.done ? 'closed' : 'event')),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 25)),
    ]);
    expect(outcome).not.toBe('closed');
    await reader.cancel();
  });

  it('allows credential-free browser preflight when the access token is configured', async () => {
    const response = await handleRequest(
      new Request('https://cejel-mcp.vercel.app/api/mcp', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://client.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('structurally routes every Vercel method through the authenticated handler', () => {
    const routeSource = readFileSync(new URL('../../api/mcp.ts', import.meta.url), 'utf8');

    expect(routeSource).toContain(
      "import { handleAuthenticatedCejelHttpRequest } from '../src/http/auth.js';",
    );
    expect(routeSource).not.toContain("from '../src/http/server.js'");
    expect(routeSource.match(/return handleAuthenticatedRequest\(request\);/g)).toHaveLength(4);
  });

  it('fails closed when the access-token environment variable is unset or empty', async () => {
    for (const configuredToken of [undefined, ''] as const) {
      if (configuredToken === undefined) {
        delete process.env.CEJEL_MCP_ACCESS_TOKEN;
      } else {
        process.env.CEJEL_MCP_ACCESS_TOKEN = configuredToken;
      }

      for (const method of ['GET', 'POST', 'DELETE', 'OPTIONS']) {
        const request = new Request('https://cejel-mcp.vercel.app/api/mcp', {
          method,
          headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
        });
        await expectUnauthorized(await handleRequest(request));
      }
    }
  });

  it('logs refusal metadata without logging the presented token', async () => {
    const presentedToken = 'never-log-this-presented-token';
    const request = initializeRequest(presentedToken);
    request.headers.set('user-agent', 'cejel-auth-observer/1.0');
    request.headers.set('x-vercel-ip-country', 'CA');

    await expectUnauthorized(await handleRequest(request));

    const serializedLogs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(serializedLogs).toContain('user_agent');
    expect(serializedLogs).toContain('x_vercel_ip_country');
    expect(serializedLogs).toContain('cejel-auth-observer/1.0');
    expect(serializedLogs).toContain('CA');
    expect(serializedLogs).not.toContain(presentedToken);
    expect(serializedLogs).not.toContain(presentedToken.slice(0, 8));
  });
});
