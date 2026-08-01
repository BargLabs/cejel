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
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    expect(console.warn).toHaveBeenCalledWith(
      'cejel_mcp_auth_refused',
      expect.objectContaining({
        reason: 'authorization_header_absent',
        authorization_header_present: false,
      }),
    );
  });

  it('rejects a request with the wrong bearer token', async () => {
    await expectUnauthorized(await handleRequest(initializeRequest('wrong-token')));
    expect(console.warn).toHaveBeenCalledWith(
      'cejel_mcp_auth_refused',
      expect.objectContaining({
        reason: 'token_mismatch',
        presented_token_length: 'wrong-token'.length,
      }),
    );
  });

  it('rejects a Bearer-shaped header with no parseable token', async () => {
    const request = initializeRequest();
    request.headers.set('authorization', 'Bearer two tokens');

    await expectUnauthorized(await handleRequest(request));
    expect(console.warn).toHaveBeenCalledWith(
      'cejel_mcp_auth_refused',
      expect.objectContaining({ reason: 'token_absent' }),
    );
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
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
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
    expect(console.error).not.toHaveBeenCalled();
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

    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'cejel_mcp_auth_configuration_alert',
      expect.objectContaining({ reason: 'access_token_unconfigured' }),
    );
  });

  it('logs trusted refusal metadata without logging the presented token', async () => {
    const presentedToken = 'never-log-this-presented-token';
    const request = initializeRequest(presentedToken);
    request.headers.set('user-agent', 'cejel-auth-observer/1.0');
    request.headers.set('x-vercel-forwarded-for', '203.0.113.8');
    request.headers.set('x-forwarded-for', '198.51.100.23');
    request.headers.set('x-vercel-ip-country', 'CA');

    await expectUnauthorized(await handleRequest(request));

    expect(console.warn).toHaveBeenCalledWith(
      'cejel_mcp_auth_refused',
      expect.objectContaining({
        reason: 'token_mismatch',
        user_agent: 'cejel-auth-observer/1.0',
        authorization_header_present: true,
        trusted_client_ip: '203.0.113.8',
        x_forwarded_for_untrusted: '198.51.100.23',
        x_vercel_ip_country: 'CA',
        request_path: '/api/mcp',
        request_method: 'POST',
        presented_token_length: presentedToken.length,
      }),
    );

    const serializedLogs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(serializedLogs).not.toContain(presentedToken);
    expect(serializedLogs).not.toContain(presentedToken.slice(0, 8));
    expect(serializedLogs).not.toContain(presentedToken.slice(-8));
  });

  it.each([
    {
      reason: 'access_token_unconfigured',
      authorization: 'Bearer never-log-unconfigured-token-value',
      configure: false,
      logger: 'error',
    },
    {
      reason: 'authorization_header_absent',
      authorization: 'Basic never-log-wrong-scheme-token-value',
      configure: true,
      logger: 'warn',
    },
    {
      reason: 'token_absent',
      authorization: 'Bearer never-log-unparseable-token-value extra',
      configure: true,
      logger: 'warn',
    },
    {
      reason: 'token_mismatch',
      authorization: 'Bearer never-log-mismatched-token-value',
      configure: true,
      logger: 'warn',
    },
  ] as const)(
    'does not disclose credential material on the $reason path',
    async ({ reason, authorization, configure, logger }) => {
      if (!configure) delete process.env.CEJEL_MCP_ACCESS_TOKEN;
      const request = initializeRequest();
      request.headers.set('authorization', authorization);

      await expectUnauthorized(await handleRequest(request));

      const serializedLogs = JSON.stringify([
        ...vi.mocked(console.warn).mock.calls,
        ...vi.mocked(console.error).mock.calls,
      ]);
      const credentialMaterial = authorization.replace(/^(?:Bearer|Basic) /, '').split(' ')[0];
      if (!credentialMaterial) throw new Error('Test authorization has no credential material.');
      expect(serializedLogs).toContain(reason);
      expect(serializedLogs).not.toContain(credentialMaterial);
      expect(serializedLogs).not.toContain(credentialMaterial.slice(0, 12));
      expect(serializedLogs).not.toContain(credentialMaterial.slice(-12));

      if (logger === 'error') {
        expect(console.error).toHaveBeenCalledOnce();
        expect(console.warn).not.toHaveBeenCalled();
      } else {
        expect(console.warn).toHaveBeenCalledOnce();
        expect(console.error).not.toHaveBeenCalled();
      }
    },
  );

  it('keeps server misconfiguration alerts separate from caller refusals', async () => {
    delete process.env.CEJEL_MCP_ACCESS_TOKEN;

    await expectUnauthorized(await handleRequest(initializeRequest('presented-token')));

    expect(console.error).toHaveBeenCalledWith(
      'cejel_mcp_auth_configuration_alert',
      expect.objectContaining({
        reason: 'access_token_unconfigured',
        presented_token_length: 'presented-token'.length,
      }),
    );
    expect(console.warn).not.toHaveBeenCalled();
  });
});
