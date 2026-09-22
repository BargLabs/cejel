// goal_cejel_a3_health_route_idioms_v23_2026-09-22
//
// Under the prospective v23 rubric, the `health_readiness_route` info-severity finding (see
// repo-signals.ts collectA3ProdReadinessEvidence, `V20_HEALTH_OR_READINESS_ROUTE_PATTERN`)
// reported no health or readiness route on a real Express-shaped system that had one. This file
// catalogues the route idioms a production Express/Node service can use, records what the
// detector credited BEFORE this card and what it credits AFTER, and guards the negative cases
// (a string that merely resembles a health route but is not one) that must stay uncredited.
//
// This is an info-severity finding, not a scored metric (repo-signals.ts near line 3072): a row
// moving here moves no A3 score. It moves what the certificate tells the reader to do next.
//
// Idiom table (idiom | observed before this card | expected/observed after):
//
// | Idiom                                                          | Before | After  |
// |-----------------------------------------------------------------|--------|--------|
// | path in a const not adjacent to the route call                  | credit | credit | (already correct — pattern scans the whole file, not call-adjacency)
// | router mounted under a prefix, literal only in the mount file   | credit | credit | (already correct — same reason)
// | prefix segment: /api/health                                     | credit | credit | (already correct — multi-segment case)
// | prefix segment: /v1/readyz                                      | credit | credit | (already correct)
// | prefix segment: /_health (segment-internal, no slash before "health") | MISS | credit | (WIDENED — see pattern comment)
// | prefix segment: /-/ready                                        | credit | credit | (already correct — multi-segment case)
// | content-only name: /ping                                        | MISS   | MISS   | (stated limit — too ambiguous, not a named convention)
// | content-only name: /status                                      | MISS   | MISS   | (stated limit — too ambiguous, not a named convention)
// | content-only name: /up                                          | MISS   | credit | (WIDENED — documented Rails convention, slash-anchored only)
// | content-only name: /alive                                       | MISS   | MISS   | (stated limit — not a documented convention this card credits)
// | Fastify fastify.get('/healthz', ...)                             | credit | credit | (already correct — leading-slash literal)
// | Koa router.get('/health', ...)                                  | credit | credit | (already correct)
// | NestJS @Get('health') — no leading slash                        | MISS   | credit | (WIDENED — new bare-keyword alternative, exact whole-string match only)
// | Hapi { method: 'GET', path: '/health' }                         | credit | credit | (already correct)
// | @godaddy/terminus, literal path present in the wiring call       | credit | credit | (already correct — the literal is what is credited, not the import)
// | express-healthcheck import, no literal path anywhere in the repo | MISS   | MISS   | (stated limit — decision deferred to the handback, not implemented)
// | literal only in src/server/health.controller.ts                 | credit | credit | (already admitted — under src/, .ts extension)
// | literal only in app/api/health/route.ts (Next.js app router)    | credit | credit | (already admitted — under app/, .ts extension)
// | literal only in functions/health-service.js                     | MISS   | credit | (WIDENED — file-selection predicate now admits functions/)
// | README.md mentioning /health                                    | MISS   | MISS   | (correct — not an implementation file; stays uncredited)
// | outbound fetch('https://vendor.example/health')                 | MISS   | MISS   | (correct — the `:` in `https://` breaks the pattern's run; stays uncredited)
// | Dockerfile HEALTHCHECK against a path no code serves             | credit*| credit*| (*unrelated coupling: `healthChecks.length === 0` — the prod_readiness_primitives filename signal, a scored metric, out of scope — suppresses the finding regardless of this pattern; see the dedicated test below)
// | test file containing the string                                 | MISS   | MISS   | (correct — not an authored production path; stays uncredited)
// | trailing query string: /health?probe=1                          | MISS   | MISS   | (stated limit — deliberately not widened; see pattern comment)
//
// Every "Before" value in this table was produced by running the fixtures below against the
// detector on this branch before the widening in this same commit — not read off the pattern's
// prose description (goal_cejel_control_keyed_on_declared_identifier: a fixture written from a
// detector's description exercises the description, not the detector). Two of the three
// predicate-exclusion examples named in the originating card (src/server/health.controller.ts,
// app/api/health/route.ts) turned out to already be admitted by the existing predicate; only
// functions/health-service.js was a genuine gap. The table above reflects the verified, not the
// assumed, behavior.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';
import type { WitanCriterionSignalPayload } from '../schemas.js';

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-a3-health-idioms-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  return repo;
}

function scanA3(files: Readonly<Record<string, string>>): WitanCriterionSignalPayload | null {
  const input = buildWitanInputFromRepo({
    productSlug: 'a3-health-route-idioms-fixture',
    productDisplayName: 'A3 health route idioms fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-09-22T00:00:00.000Z',
    rubricVersion: WITAN_RUBRIC_VERSION_V23,
  });
  return (input.signals ?? []).find((candidate) => candidate.criterionId === 'A3') ?? null;
}

const HEALTH_ROUTE_ABSENCE_SUMMARY =
  'A production HTTP entrypoint handles requests directly but declares no health or readiness route.';

function expectCredited(a3: WitanCriterionSignalPayload | null): void {
  expect((a3?.findings ?? []).map((finding) => finding.summary)).not.toContain(
    HEALTH_ROUTE_ABSENCE_SUMMARY,
  );
}

function expectMissing(a3: WitanCriterionSignalPayload | null): void {
  expect((a3?.findings ?? []).map((finding) => finding.summary)).toContain(
    HEALTH_ROUTE_ABSENCE_SUMMARY,
  );
}

// A direct http.createServer entrypoint that branches on req.url, satisfying the "handles
// requests directly" gate so every fixture below isolates the health-route pattern itself —
// same shape as a3-runtime-pattern-coverage.test.ts's SERVER_WITHOUT_HEALTH_ROUTE.
const BASE: Readonly<Record<string, string>> = {
  'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
  'src/main.js':
    "import http from 'node:http';\n" +
    'http.createServer((req, res) => {\n' +
    "  if (req.url === '/users') { res.end('users'); return; }\n" +
    "  res.end('not found');\n" +
    '}).listen(5300);\n',
};

function withRoute(route: string): Readonly<Record<string, string>> {
  return {
    ...BASE,
    'src/main.js':
      "import http from 'node:http';\n" +
      'http.createServer((req, res) => {\n' +
      `  if (req.url === '${route}') { res.end('ok'); return; }\n` +
      "  if (req.url === '/users') { res.end('users'); return; }\n" +
      "  res.end('not found');\n" +
      '}).listen(5300);\n',
  };
}

describe('A3 health/readiness route — idiom catalogue', () => {
  it('sanity: the unmodified baseline still reports the absence finding', () => {
    expectMissing(scanA3(BASE));
  });

  describe('already credited before this card (unchanged)', () => {
    it('a path held in a constant, not adjacent to the route call', () => {
      const a3 = scanA3({
        ...BASE,
        'src/main.js':
          "import http from 'node:http';\n" +
          "const HEALTH_PATH = '/health';\n" +
          'http.createServer((req, res) => {\n' +
          '  if (req.url === HEALTH_PATH) { res.end("ok"); return; }\n' +
          "  if (req.url === '/users') { res.end('users'); return; }\n" +
          "  res.end('not found');\n" +
          '}).listen(5300);\n',
      });
      expectCredited(a3);
    });

    it('a router mounted under a prefix, with the literal only in the mounting file', () => {
      const a3 = scanA3({
        ...BASE,
        'src/app.js':
          "import http from 'node:http';\n" +
          "import healthRouter from './routes/health.js';\n" +
          'http.createServer((req, res) => {\n' +
          "  if (req.url.startsWith('/health')) { healthRouter(req, res); return; }\n" +
          "  if (req.url === '/users') { res.end('users'); return; }\n" +
          "  res.end('not found');\n" +
          '}).listen(5300);\n',
        'src/routes/health.js': 'export default function health(req, res) { res.end("ok"); }\n',
      });
      expectCredited(a3);
    });

    it.each(['/api/health', '/v1/readyz', '/-/ready'])(
      'a multi-segment prefix: %s',
      (route) => {
        expectCredited(scanA3(withRoute(route)));
      },
    );

    it('Fastify: fastify.get(\'/healthz\', ...)', () => {
      const a3 = scanA3({
        ...BASE,
        'src/server.ts':
          "import Fastify from 'fastify';\n" +
          'const fastify = Fastify();\n' +
          "fastify.get('/healthz', async () => ({ ok: true }));\n" +
          'fastify.listen({ port: 3000 });\n',
      });
      expectCredited(a3);
    });

    it('Koa router: router.get(\'/health\', ...)', () => {
      const a3 = scanA3({
        ...BASE,
        'src/koa.ts':
          "import Koa from 'koa';\n" +
          "import Router from 'koa-router';\n" +
          'const app = new Koa();\n' +
          'const router = new Router();\n' +
          "router.get('/health', ctx => { ctx.body = 'ok'; });\n" +
          'app.use(router.routes());\n',
      });
      expectCredited(a3);
    });

    it('Hapi: { method: \'GET\', path: \'/health\' }', () => {
      const a3 = scanA3({
        ...BASE,
        'src/hapi.ts':
          "import Hapi from '@hapi/hapi';\n" +
          'const server = Hapi.server({ port: 3000 });\n' +
          'server.route({\n' +
          "  method: 'GET',\n" +
          "  path: '/health',\n" +
          '  handler: () => "ok",\n' +
          '});\n',
      });
      expectCredited(a3);
    });

    it('@godaddy/terminus with a literal path present in the wiring call', () => {
      const a3 = scanA3({
        ...BASE,
        'src/terminus.ts':
          "import terminus from '@godaddy/terminus';\n" +
          "import http from 'node:http';\n" +
          'const server = http.createServer();\n' +
          'terminus(server, { healthChecks: { "/health": async () => {} } });\n',
      });
      expectCredited(a3);
    });

    it('the literal lives in src/server/health.controller.ts', () => {
      const a3 = scanA3({
        ...BASE,
        'src/server/health.controller.ts': "export const path = '/health';\n",
      });
      expectCredited(a3);
    });

    it('the literal lives in app/api/health/route.ts (Next.js app router)', () => {
      const a3 = scanA3({
        ...BASE,
        'app/api/health/route.ts':
          "export const path = '/health';\nexport function GET() { return new Response('ok'); }\n",
      });
      expectCredited(a3);
    });
  });

  describe('widened by this card', () => {
    it('a segment-internal underscore prefix: /_health', () => {
      expectCredited(scanA3(withRoute('/_health')));
    });

    it('the Rails convention: /up (slash-anchored)', () => {
      expectCredited(scanA3(withRoute('/up')));
    });

    it("NestJS decorator string with no leading slash: @Get('health')", () => {
      const a3 = scanA3({
        ...BASE,
        'src/health.controller.ts':
          "import { Controller, Get } from '@nestjs/common';\n" +
          '@Controller()\n' +
          'export class HealthController {\n' +
          "  @Get('health')\n" +
          '  check() { return { ok: true }; }\n' +
          '}\n',
      });
      expectCredited(a3);
    });

    it('a serverless functions/ directory: functions/health-service.js', () => {
      const a3 = scanA3({
        ...BASE,
        'functions/health-service.js': "export const path = '/health';\n",
      });
      expectCredited(a3);
    });
  });

  describe('stated limits — deliberately still uncredited', () => {
    it.each(['/ping', '/status', '/alive'])(
      'ambiguous content-only name without a named convention: %s',
      (route) => {
        expectMissing(scanA3(withRoute(route)));
      },
    );

    it('a bare decorator-style keyword is NOT credited for "up" (avoids matching direction/toggle literals like \'up\' | \'down\')', () => {
      const a3 = scanA3({
        ...BASE,
        'src/config.ts': "export type Direction = 'up' | 'down';\n",
      });
      expectMissing(a3);
    });

    it('a health-check library import with no literal path anywhere in the repo (express-healthcheck)', () => {
      // Whether an import of a known health-check dependency should itself count as evidence,
      // with no literal path required, is a decision this card defers to the handback rather
      // than making unilaterally.
      const a3 = scanA3({
        ...BASE,
        'src/healthcheck-wire.ts':
          "import healthcheck from 'express-healthcheck';\n" +
          "import express from 'express';\n" +
          'const app = express();\n' +
          'app.use(healthcheck());\n',
      });
      expectMissing(a3);
    });

    it('a trailing query string: /health?probe=1', () => {
      expectMissing(scanA3(withRoute('/health?probe=1')));
    });
  });

  describe('non-routes that must stay uncredited', () => {
    it('a README mention of /health', () => {
      const a3 = scanA3({ ...BASE, 'README.md': 'Hit /health to check liveness.\n' });
      expectMissing(a3);
    });

    it('the string appearing only in a test file', () => {
      const a3 = scanA3({
        ...BASE,
        'src/health.test.js': "test('serves /health', () => { expect(true).toBe(true); });\n",
      });
      expectMissing(a3);
    });

    it('an outbound fetch to another service\'s /health endpoint', () => {
      // The `:` in `https://` breaks the pattern's leading-run character class — a full outbound
      // URL never matches. Crediting this would be a false assertion, which this product treats
      // as worse than a miss.
      const a3 = scanA3({
        ...BASE,
        'src/client.js': "fetch('https://vendor.example/health').then(() => {});\n",
      });
      expectMissing(a3);
    });

    it('a comment mentioning /health with no route registered anywhere', () => {
      const a3 = scanA3({
        ...BASE,
        'src/notes.js': "// remember to add a /health route eventually\n",
      });
      expectMissing(a3);
    });
  });

  describe('unrelated coupling, unchanged (out of scope for this card)', () => {
    it('a Dockerfile HEALTHCHECK against a path no code serves suppresses the finding via the prod_readiness_primitives filename signal, not this pattern', () => {
      // isHealthCheckSignalFile (a different, scored A3 metric: prod_readiness_primitives) treats
      // any Dockerfile with a HEALTHCHECK instruction as evidence, which also short-circuits this
      // info-severity finding via the pre-existing `healthChecks.length === 0` guard. That
      // coupling predates this card and is out of scope (scored A3 metrics are not touched here);
      // recorded so a future reader does not mistake this for the health-route pattern matching.
      const a3 = scanA3({
        ...BASE,
        Dockerfile: 'FROM node:20\nHEALTHCHECK CMD curl -f http://localhost/health || exit 1\n',
      });
      expectCredited(a3);
    });
  });
});
