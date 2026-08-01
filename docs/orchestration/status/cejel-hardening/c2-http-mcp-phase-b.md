# C2 Phase B — authenticated HTTP MCP endpoint

Date: 2026-07-30

## Decision executed

Mechanism A-prime is implemented. `/api/mcp` remains available for authorized
remote clients and now requires an application-level bearer token from the
production environment variable `CEJEL_MCP_ACCESS_TOKEN`.

The route fails closed. If the variable is unset or empty, every exported
method (`GET`, `POST`, `DELETE`, and `OPTIONS`) returns `401`; no configuration
state disables authentication. Presented and configured UTF-8 token buffers
are compared with `crypto.timingSafeEqual` only when their lengths match.
When the variable is configured, a credential-free `OPTIONS` request may return
the CORS preflight response; it cannot execute an MCP operation or read data.

Caller-caused refusals emit the event `cejel_mcp_auth_refused` with:

- `reason`;
- `user_agent`, sourced from the `user-agent` header;
- `authorization_header_present`, recording presence only;
- `trusted_client_ip`, sourced from the platform-provided
  `x-vercel-forwarded-for` header;
- `x_forwarded_for_untrusted`, sourced from the client-settable
  `x-forwarded-for` header and explicitly named as untrusted;
- `x_vercel_ip_country`, sourced from the `x-vercel-ip-country` header;
- `request_path` and `request_method`;
- `presented_token_length`, only when a token was parsed.

The refusal reasons distinguish server misconfiguration, a missing or
non-Bearer Authorization header, a Bearer-shaped header without a parseable
token, and a parsed token that does not match. Server misconfiguration emits
the separate error event `cejel_mcp_auth_configuration_alert`; it is not
counted with caller-caused `401` events.

The presented token, its prefix, and the Authorization header are never
logged.

## Operator action completed

On 2026-08-01, a 384-bit randomly generated `CEJEL_MCP_ACCESS_TOKEN` was
provisioned as a sensitive variable in the `cejel-mcp` Vercel project's
**production** environment. Deployment `dpl_8LnyYZvW88g2uwj9EzeD5P9PqiV7`
was promoted after an authenticated MCP handshake succeeded. The token value
is not recorded in this repository or this status document.

## Refusal and authenticated handshake

Anonymous request:

```http
HTTP/1.1 401 Unauthorized
access-control-allow-origin: *
cache-control: no-store
content-type: application/json; charset=utf-8
www-authenticate: Bearer realm="cejel-mcp"

{"error":"unauthorized","message":"Bearer token required. Request access at https://github.com/BargLabs/cejel/issues/new."}
```

The same MCP `initialize` request with the configured bearer token:

```http
HTTP/1.1 200
access-control-allow-headers: authorization, content-type, mcp-session-id, last-event-id
access-control-allow-methods: GET, POST, DELETE, OPTIONS
access-control-allow-origin: *
content-type: application/json

{"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":true},"resources":{"listChanged":true}},"serverInfo":{"name":"@cejel/cejel-http-mcp","version":"0.2.2"}},"jsonrpc":"2.0","id":1}
```

## Caller identification and observation plan

The recurring caller could not be identified from the pre-change telemetry:
the available request records did not expose a stable client identifier, MCP
method, or payload classification. The new refusal metadata is the mechanism
for resolving that gap after production rollout.

On **2026-08-01 UTC**, or the first full UTC day after production deployment
if deployment occurs later, query `cejel_mcp_auth_refused` events and group by
`user_agent` and `x_vercel_ip_country`. Compare the resulting count with the
measured approximately 58-61 requests/day. Record whether the traffic stops,
continues as `401`, or authenticates, and whether the metadata identifies an
operator monitor, platform health check, or unknown external dependent.

## Production observation — 2026-08-01

The recurring caller reached the promoted deployment at 09:01:11 UTC. It sent
`POST /api/mcp` with no User-Agent and no Authorization header, so the request
was correctly refused as `authorization_header_absent`. No token was parsed
and no token length was logged. Vercel reported country `US` and
`trusted_client_ip` `172.69.134.236`.

That address falls within
[Cloudflare's published `172.64.0.0/13` IPv4 range](https://www.cloudflare.com/ips-v4/).
It is trustworthy only as the address that connected to Vercel: it is a
Cloudflare edge address, not caller-origin attribution. Do not use it to name
a caller or construct an origin blocklist. A service running on Cloudflare
Workers or fronted by Cloudflare can present the same address.

A separate earlier request identified itself as
`agent-tools.cloud-crawler/0.1 (+https://agent-tools.cloud)`. The anonymous
recurring probe is compatible with that kind of discovery or health-check
traffic, but the available evidence does not prove they are the same caller.

## Guard coupling

`@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js` remains in
`ALLOWED_EXTERNAL_MODULES`. Its comment now records that `/api/mcp` is
application-level bearer authenticated and that the transport remains
permitted for authorized remote clients without granting scoring code an
outbound-network capability. The #50 subprocess chokepoint and the #54/#55
structural offline guard remain intact.

## Public claims and registry

The repository, README, cejel.dev source, Cejel launch Markdown, and
Cejel-named presentation/PDF artifacts were searched for the production
domain, `/api/mcp`, and hosted/remote/HTTP MCP claims. No public claim offers
the endpoint, so no public-copy correction was required. The cejel.dev
distribution section continues to describe install/runtime paths and registry
directories only; its Smithery card describes the hosted directory, not a
hosted Cejel transport.

The Official MCP Registry API was checked on 2026-07-30 for
`io.github.BargLabs/cejel`. All seven published records, including latest
`0.2.2`, contain one OCI package with `stdio` transport and no `remotes`.
The checked-in `server.json` has the same OCI/stdio-only shape.

## Verification

- Pre-fix auth run: four security assertions failed because missing, wrong,
  and unconfigured credentials returned `200`, and refusal metadata was not
  logged. The positive handshake regression was already green because the
  anonymous route accepted every request.
- Review regression run: the new authenticated GET/SSE and browser-preflight
  assertions both failed before their fixes because the event stream closed
  immediately and credential-free preflight returned `401`.
- Final full suite: 734 tests in 38 files, all passing. This is +26 tests and
  +2 files against the Phase A baseline of 708 tests in 36 files; the branch
  itself adds 8 tests over the 726-test `origin/main` starting point.
- Strict TypeScript, production build, and distribution metadata validation
  pass.
- A candidate Docker image scans the LLM fixture corpus successfully under
  `docker run --rm --network=none`.
- No file under `leaderboard/` changed, the package version remains `0.2.2`,
  and no published board score moved.
