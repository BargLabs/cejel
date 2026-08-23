# C2 Phase A — hosted HTTP MCP endpoint measurement

Date: 2026-07-30

Lane: C2

Base: `origin/main@74ae7f86bab42f8dfb10d92c6c59a566b9c1644d`

## Scope and stop condition

This is investigation and measurement only. It does not choose among removal,
hardening/keeping, or privatisation, and it makes no endpoint, deployment,
configuration, source, test, or runtime change.

## 30-day request-volume denominator

The exact UTC measurement window is
`2026-06-30T21:45:25Z` through `2026-07-30T21:45:25Z` (30 days).

The Vercel source was:

- team: `houman44s-projects`
  (`team_CahG9f6tPZP43Exf0cxca7x0`);
- project: `cejel-mcp`
  (`prj_Gha02qzF5eKGdw2iJM6QYJZTL8df`);
- environment: `production`;
- exact request path: `/api/mcp`;
- source: Vercel runtime-log aggregates grouped by `requestPath`, queried in
  bounded UTC partitions and summed because a single 30-day aggregate did not
  complete;
- identity check: Vercel project metadata names the project `cejel-mcp`, its
  production domains include `cejel-mcp.vercel.app`, and deployment metadata
  binds it to GitHub repository `BargLabs/cejel`. This identifies the project
  without relying on the name alone.

**Denominator: 832 production HTTP request records whose request path was
exactly `/api/mcp`.**

The status-code partition is 788 responses with HTTP 200, 43 with HTTP 202,
and 1 with HTTP 406. Thus 831/832 request records received a 2xx HTTP
response. This is a transport-level count, not a claim that 831 scans or MCP
operations completed successfully: the current endpoint emits no
operation-level success telemetry, and an HTTP 200 response can carry an MCP
protocol error.

The project was created at `2026-07-17T05:13:25.220Z`. Its first READY
production deployment in Vercel metadata was created at
`2026-07-17T05:14:08.390Z`. Therefore, for the first
16 days, 7 hours, 28 minutes, and 43.390 seconds of the requested window there
was no READY production endpoint in this Vercel project. The 832 request
records all fall in the remaining exposed portion of the window; missing
pre-deployment telemetry is not represented as observed traffic.

Partition arithmetic:

| UTC interval | `/api/mcp` request records |
| --- | ---: |
| 2026-07-17T05:13:25.220Z → 2026-07-17T21:45:25Z | 71 |
| 2026-07-17T21:45:25Z → 2026-07-18T21:45:25Z | 59 |
| 2026-07-18T21:45:25Z → 2026-07-19T21:45:25Z | 54 |
| 2026-07-19T21:45:25Z → 2026-07-20T21:45:25Z | 61 |
| 2026-07-20T21:45:25Z → 2026-07-21T21:45:25Z | 57 |
| 2026-07-21T21:45:25Z → 2026-07-22T21:45:25Z | 60 |
| 2026-07-22T21:45:25Z → 2026-07-23T21:45:25Z | 74 |
| 2026-07-23T21:45:25Z → 2026-07-24T21:45:25Z | 52 |
| 2026-07-24T21:45:25Z → 2026-07-25T21:45:25Z | 59 |
| 2026-07-25T21:45:25Z → 2026-07-26T21:45:25Z | 55 |
| 2026-07-26T21:45:25Z → 2026-07-27T21:45:25Z | 57 |
| 2026-07-27T21:45:25Z → 2026-07-28T21:45:25Z | 55 |
| 2026-07-28T21:45:25Z → 2026-07-29T21:45:25Z | 58 |
| 2026-07-29T21:45:25Z → 2026-07-30T21:45:25Z | 60 |
| **Total** | **832** |

The available Vercel runtime-log result does not expose a stable
privacy-preserving client identifier, so unique clients cannot be counted.
It also does not expose MCP method or tool-result payloads, so successful MCP
requests and successful `scan` calls cannot be separated from transport-level
2xx responses.

## References and inbound-link search

The text search covered these roots:

- `<operator-home>/projects/cejel`;
- `<operator-home>/projects/cejel-site`;
- `<operator-home>/projects/lab_notes`, the available studio and
  partner-planning corpus.

The search looked for endpoint domains, `/api/mcp`, `api/mcp.ts`,
`src/http/server.ts`, and hosted-HTTP-MCP descriptions. Exclusions were
`.git`, `.worktrees`, `.pnpm-store`, `node_modules`, `dist`, `build`, and
`.next`. Binary files, remote systems, and partner material not present in
these roots were not searchable.

No inbound URL or link to `cejel-mcp.vercel.app`, a branch alias, or
`/api/mcp` was found in any searched root. The Cejel repository contains the
route configuration and generated leaderboard evidence that names
`src/http/server.ts`. The site contains only copied/generated leaderboard
evidence naming `src/http/server.ts`, not an endpoint link. The notes corpus
contains the C2 card, audit/remediation references, and separate references
to the documented offline stdio `cejel-mcp`; it contains no inbound hosted
endpoint link.

This establishes absence only within the searched local text corpus. It does
not establish that no external bookmark, private message, unmounted partner
document, or direct MCP client configuration references the endpoint.

## Neutral option consequences

### Option A — remove

Removing the hosted endpoint eliminates the public upload surface and its
ongoing request volume. It also requires checking any operator-owned
monitoring or direct-client configuration not visible in the searched corpus.

**PR #55 guard coupling:** PR #55 added
`src/__tests__/offline-boundary-guard.ts`, whose
`ALLOWED_EXTERNAL_MODULES` explicitly permits
`@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`, the transport
imported by `src/http/server.ts`. Removal must remove that allowlist entry in
the same change. Removing the endpoint without the guard update would leave a
withdrawn transport sanctioned by the security guard.

### Option B — harden and keep

Keeping the endpoint preserves the observed hosted transport and requires the
security, disclosure, data-handling, ownership, and test work named in the
C2 card. The 832-request denominator is HTTP traffic, not evidence of 832
users or successful scans, so it does not by itself establish named-user
demand.

**PR #55 guard coupling:** retaining the hosted transport provides the reason
to retain
`@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js` in
`ALLOWED_EXTERNAL_MODULES`, because that transport remains a sanctioned
runtime dependency. The guard scope must still be reviewed alongside the
hardened design so the permission remains no broader than the production
surface requires.

### Option C — privatise

Privatisation preserves a non-public operator surface while changing who can
reach it. The selected design must define whether the hosted web-standard
transport remains in production/private use or is withdrawn entirely.

**PR #55 guard coupling:** if privatisation withdraws this transport from
production/public runtime use, the
`@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js` allowlist
entry must be removed in the same change. If the private design still executes
that transport, retaining the entry must be justified by that explicit
runtime path and the guard scope re-reviewed. Privatising while withdrawing
the transport but leaving the guard unchanged would leave a withdrawn
transport sanctioned.

No option is selected here. The operator owns the decision.

## Verification and unverified claims

`pnpm test` passed on the report-only branch:

- baseline: 708 tests in 36 files on `origin/main`;
- lane result: 708 passed in 36 files;
- delta: +0 tests, +0 files.

Unverified:

- unique-client count, because the available Vercel runtime-log result does
  not expose a stable client identifier;
- successful MCP operation and successful `scan` counts, because no
  operation-level telemetry or payload classification is available;
- references in binary files, remote systems, unmounted/private partner
  material, direct client configurations, bookmarks, or messages outside the
  three searched local roots;
- whether the recurring traffic represents synthetic monitoring, one client,
  or multiple clients; timing alone is insufficient attribution.
