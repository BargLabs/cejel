import { timingSafeEqual } from 'node:crypto';

import {
  type CejelHttpMcpIdentity,
  handleCejelHttpRequest,
} from './server.js';

const ACCESS_REQUEST_URL = 'https://github.com/BargLabs/cejel/issues/new';

type RefusalReason =
  | 'access_token_unconfigured'
  | 'authorization_header_absent'
  | 'token_absent'
  | 'token_mismatch';

type PresentedAuthorization =
  | { token: string }
  | { refusalReason: 'authorization_header_absent' | 'token_absent' };

function presentedAuthorization(request: Request): PresentedAuthorization {
  const authorization = request.headers.get('authorization');
  if (!authorization) return { refusalReason: 'authorization_header_absent' };

  const match = authorization.match(/^Bearer(?: (.*))?$/i);
  if (!match) return { refusalReason: 'authorization_header_absent' };

  const token = match[1];
  if (!token || !/^[^\s]+$/.test(token)) return { refusalReason: 'token_absent' };
  return { token };
}

function tokensMatch(presentedToken: string, configuredToken: string): boolean {
  const presented = Buffer.from(presentedToken, 'utf8');
  const configured = Buffer.from(configuredToken, 'utf8');
  return presented.length === configured.length && timingSafeEqual(presented, configured);
}

function refuseUnauthorized(
  request: Request,
  reason: RefusalReason,
  presentedToken?: string,
): Response {
  const metadata = {
    reason,
    user_agent: request.headers.get('user-agent') ?? 'unknown',
    authorization_header_present: request.headers.has('authorization'),
    trusted_client_ip: request.headers.get('x-vercel-forwarded-for') ?? 'unknown',
    x_forwarded_for_untrusted: request.headers.get('x-forwarded-for') ?? 'unknown',
    x_vercel_ip_country: request.headers.get('x-vercel-ip-country') ?? 'unknown',
    request_path: new URL(request.url).pathname,
    request_method: request.method,
    ...(presentedToken === undefined
      ? {}
      : { presented_token_length: presentedToken.length }),
  };

  if (reason === 'access_token_unconfigured') {
    console.error('cejel_mcp_auth_configuration_alert', metadata);
  } else {
    console.warn('cejel_mcp_auth_refused', metadata);
  }

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
  const authorization = presentedAuthorization(request);
  const configuredToken = process.env.CEJEL_MCP_ACCESS_TOKEN;
  if (!configuredToken) {
    return refuseUnauthorized(
      request,
      'access_token_unconfigured',
      'token' in authorization ? authorization.token : undefined,
    );
  }

  // Browsers do not include credentials on a CORS preflight. Once the endpoint
  // is configured fail-closed, OPTIONS may advertise the Authorization header
  // without granting access to an MCP operation.
  if (request.method === 'OPTIONS') {
    return handleCejelHttpRequest(request, identity());
  }

  if ('refusalReason' in authorization) {
    return refuseUnauthorized(request, authorization.refusalReason);
  }

  if (!tokensMatch(authorization.token, configuredToken)) {
    return refuseUnauthorized(request, 'token_mismatch', authorization.token);
  }

  return handleCejelHttpRequest(request, identity());
}
