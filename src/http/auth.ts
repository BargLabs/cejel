import { timingSafeEqual } from 'node:crypto';

import {
  type CejelHttpMcpIdentity,
  handleCejelHttpRequest,
} from './server.js';

const ACCESS_REQUEST_URL = 'https://github.com/BargLabs/cejel/issues/new';

function presentedBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1];
}

function tokensMatch(presentedToken: string, configuredToken: string): boolean {
  const presented = Buffer.from(presentedToken, 'utf8');
  const configured = Buffer.from(configuredToken, 'utf8');
  return presented.length === configured.length && timingSafeEqual(presented, configured);
}

function refuseUnauthorized(
  request: Request,
  reason: 'access_token_unconfigured' | 'authorization_missing_or_invalid',
): Response {
  console.warn('cejel_mcp_auth_refused', {
    reason,
    user_agent: request.headers.get('user-agent') ?? 'unknown',
    x_vercel_ip_country: request.headers.get('x-vercel-ip-country') ?? 'unknown',
  });

  return new Response(
    JSON.stringify({
      error: 'unauthorized',
      message: `Bearer token required. Request access at ${ACCESS_REQUEST_URL}.`,
    }),
    {
      status: 401,
      statusText: 'Unauthorized',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'WWW-Authenticate': 'Bearer realm="cejel-mcp"',
      },
    },
  );
}

export async function handleAuthenticatedCejelHttpRequest(
  request: Request,
  identity: () => CejelHttpMcpIdentity,
): Promise<Response> {
  const configuredToken = process.env.CEJEL_MCP_ACCESS_TOKEN;
  if (!configuredToken) {
    return refuseUnauthorized(request, 'access_token_unconfigured');
  }

  // Browsers do not include credentials on a CORS preflight. Once the endpoint
  // is configured fail-closed, OPTIONS may advertise the Authorization header
  // without granting access to an MCP operation.
  if (request.method === 'OPTIONS') {
    return handleCejelHttpRequest(request, identity());
  }

  const presentedToken = presentedBearerToken(request);
  if (!presentedToken || !tokensMatch(presentedToken, configuredToken)) {
    return refuseUnauthorized(request, 'authorization_missing_or_invalid');
  }

  return handleCejelHttpRequest(request, identity());
}
