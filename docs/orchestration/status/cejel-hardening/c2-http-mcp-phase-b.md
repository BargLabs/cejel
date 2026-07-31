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

Refusals emit the event `cejel_mcp_auth_refused` with:

- `reason`;
- `user_agent`, sourced from the `user-agent` header;
- `x_vercel_ip_country`, sourced from the `x-vercel-ip-country` header.

The presented token, its prefix, and the Authorization header are never
logged.

## Operator action required

An operator must provision a strong, randomly generated
`CEJEL_MCP_ACCESS_TOKEN` in the `cejel-mcp` Vercel project's **production**
environment and redeploy production after this change merges. Grant the token
to approved clients out of band. This change does not create, store, or set
the production token, and it does not modify Vercel Deployment Protection.

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
