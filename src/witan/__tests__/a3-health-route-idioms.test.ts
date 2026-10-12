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
// | NestJS @Get('health') — no leading slash                        | MISS   | credit | (WIDENED — Get decorator context, exact whole-string match only)
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
import {
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
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

function scanA3At(
  files: Readonly<Record<string, string>>,
  rubricVersion: string,
): WitanCriterionSignalPayload | null {
  const input = buildWitanInputFromRepo({
    productSlug: 'a3-health-route-idioms-fixture',
    productDisplayName: 'A3 health route idioms fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-10-12T00:00:00.000Z',
    rubricVersion,
  });
  return (input.signals ?? []).find((candidate) => candidate.criterionId === 'A3') ?? null;
}

/** Every selectable rubric except v25: the scored health component is filename-only in all. */
const FILENAME_ONLY_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter(
  (rubric) => rubric !== WITAN_RUBRIC_VERSION_V25,
);

/** The 'health or readiness signal' count (0 or 1) inside prod_readiness_primitives. */
function healthComponent(files: Readonly<Record<string, string>>, rubricVersion: string): number {
  // A Procfile makes the fixture a deployable service under EVERY rubric, including the default
  // v17, whose entrypoint pattern does not recognise BASE's direct createServer(...).listen().
  const deployable = { Procfile: 'web: node src/main.js\n', ...files };
  const metric = scanA3At(deployable, rubricVersion)?.metrics?.find(
    (candidate) => candidate.name === 'prod_readiness_primitives',
  );
  const component = metric?.presentation?.components?.find(
    (candidate) => candidate.label === 'health or readiness signal',
  );
  if (!component) throw new Error(`no health component under ${rubricVersion}`);
  return component.count;
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

// An ordinary public Express app file: the health route declared inline, querying the database
// inside try/catch. Authored generically; used at each location in the catalogue below.
const INLINE_APP =
  "import express from 'express';\n" +
  "import { Pool } from 'pg';\n" +
  'const pool = new Pool();\n' +
  'const app = express();\n' +
  'app.use((req, _res, next) => {\n' +
  '  console.log(req.method, req.url);\n' +
  '  next();\n' +
  '});\n' +
  "app.get('/health', async (_req, res) => {\n" +
  '  try {\n' +
  "    await pool.query('select 1');\n" +
  '    res.json({ ok: true });\n' +
  '  } catch {\n' +
  '    res.status(503).json({ ok: false });\n' +
  '  }\n' +
  '});\n' +
  'app.listen(3000);\n';

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
    it.each([
      "if (status === 'ready') { doWork(); }",
      "socket.on('live', cb);",
      "const config = { mode: 'health' };",
    ])('does not credit an ordinary keyword literal: %s', (source) => {
      expectMissing(scanA3({ ...BASE, 'src/state.ts': source + '\n' }));
    });

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

  describe('inline route in an application file — location catalogue (goal_cejel_a3_handler_shapes_and_inline_health_2026-10-12)', () => {
    // Isolates FILE SELECTION from the finding's entrypoint precondition: the entrypoint is the
    // BASE `src/main.js` (direct createServer, reads req.url, no health route), so the absence
    // finding is raised in the baseline, and it disappears if and only if the route file under
    // test is read and its route literal matches. `credited` below is that disappearance.
    it.each([
      ['src/app.ts', true],
      ['server.ts', true],
      ['index.js', true],
      ['server/index.ts', true],
      ['backend/server.ts', true],
      ['api/index.ts', true],
    ])('v23 finding: inline /health in %s is read -> credited=%s', (path, expected) => {
      const a3 = scanA3({ ...BASE, [path]: INLINE_APP });
      if (expected) expectCredited(a3);
      else expectMissing(a3);
    });

    it('routes/health.ts is credited by the filename signal, which also suppresses the finding', () => {
      expectCredited(scanA3({ ...BASE, 'routes/health.ts': INLINE_APP }));
    });

    it('the observed shape end to end: one root server.ts that is the entrypoint AND declares the route', () => {
      const files = {
        'package.json': '{"scripts":{"build":"tsc"}}\n',
        'server.ts': INLINE_APP,
      };
      expectCredited(scanA3(files));
    });

    describe('what the widened file selection must still refuse', () => {
      it.each([
        ['server.test.ts', 'a root-level test file'],
        ['test/server.ts', 'a test directory'],
        ['examples/server.js', 'an examples directory'],
        ['scripts/serve.ts', 'a scripts directory'],
        ['docs/api/index.js', 'a docs tree that merely contains api/'],
        ['README.md', 'a README'],
        ['vendor/server/index.js', 'vendored code'],
      ])('%s (%s) is not read', (path) => {
        expectMissing(scanA3({ ...BASE, [path]: INLINE_APP }));
      });

      it.each([
        ["fetch('https://vendor.example/health').then(() => {});\n", 'an outbound URL'],
        ["app.get('/health?probe=1', (_req, res) => res.end());\n", 'a query-string route'],
        ["const config = { mode: 'health' };\n", 'a bare keyword literal'],
      ])('a root server.ts holding only %s (%s) stays uncredited', (source) => {
        expectMissing(scanA3({ ...BASE, 'server.ts': source }));
      });
    });
  });

  describe('scored "health or readiness signal" component — default rubric vs prospective v25', () => {
    // Location table (component count: 1 = credited, 0 = not). v23 stands for every rubric that
    // keeps the filename-only scored signal; the loop below checks all of them.
    //
    //   Location            v17 default  v22-v24  v25     v23 info finding (after widening)
    //   src/app.ts (ctrl)       0          0       1      read (already admitted)
    //   server.ts               0          0       1      read (widened: repo-root single-file server)
    //   index.js                0          0       1      read (widened)
    //   server/index.ts         0          0       1      read (widened)
    //   backend/server.ts       0          0       1      read (widened)
    //   api/index.ts            0          0       1      read (widened; Vercel functions)
    //   routes/health.ts        1          1       1      suppressed by the filename signal
    //
    // "Before" for the finding column was MISS for the five widened rows (recorded by running
    // the rows above against the unwidened predicate); the scored columns are unchanged by the
    // predicate widening and only v25 moved, by design.
    it.each([
      ['src/app.ts', 0, 1],
      ['server.ts', 0, 1],
      ['index.js', 0, 1],
      ['server/index.ts', 0, 1],
      ['backend/server.ts', 0, 1],
      ['api/index.ts', 0, 1],
      ['routes/health.ts', 1, 1],
    ])('%s: filename-only rubrics=%s, v25=%s', (path, filenameOnly, v25) => {
      const files = { ...BASE, [path]: INLINE_APP };
      for (const rubric of FILENAME_ONLY_RUBRICS) {
        expect(healthComponent(files, rubric), rubric).toBe(filenameOnly);
      }
      expect(healthComponent(files, WITAN_RUBRIC_VERSION_V25)).toBe(v25);
    });

    it('v25 changes nothing else about the criterion for an inline route', () => {
      const withRoute = scanA3At({ ...BASE, 'server.ts': INLINE_APP }, WITAN_RUBRIC_VERSION_V25);
      const without = scanA3At(BASE, WITAN_RUBRIC_VERSION_V25);
      const value = (a3: WitanCriterionSignalPayload | null, name: string) =>
        a3?.metrics?.find((candidate) => candidate.name === name)?.value;
      expect(value(withRoute, 'prod_readiness_primitives')).toBe(
        (value(without, 'prod_readiness_primitives') as number) + 1,
      );
      for (const name of ['prod_workflow_depth', 'observability_depth', 'rollback_safety_depth']) {
        expect(value(withRoute, name), name).toBe(value(without, name));
      }
    });

    it('v25 cites the route file and line as evidence', () => {
      const a3 = scanA3At({ ...BASE, 'server.ts': INLINE_APP }, WITAN_RUBRIC_VERSION_V25);
      const pointer = a3?.positiveEvidence?.find(
        (entry) => entry.label === 'Health/readiness route',
      );
      expect(pointer?.path).toBe('server.ts');
      expect(pointer?.line).toBe(9);
    });

    it('v25 does not count a filename signal and an inline route twice', () => {
      const files = { ...BASE, 'routes/health.ts': INLINE_APP, 'server.ts': INLINE_APP };
      expect(healthComponent(files, WITAN_RUBRIC_VERSION_V25)).toBe(1);
      const a3 = scanA3At(files, WITAN_RUBRIC_VERSION_V25);
      expect(
        a3?.positiveEvidence?.filter((entry) => /Health\/readiness/.test(entry.label)),
      ).toHaveLength(1);
    });

    describe('v25 refuses everything the info finding refuses (and a commented-out route)', () => {
      it.each([
        ['server.test.ts', INLINE_APP],
        ['test/server.ts', INLINE_APP],
        ['examples/server.js', INLINE_APP],
        ['scripts/serve.ts', INLINE_APP],
        ['docs/api/index.js', INLINE_APP],
        ['vendor/server/index.js', INLINE_APP],
        ['README.md', 'Hit /health to check liveness.\n'],
        ['server.ts', "fetch('https://vendor.example/health').then(() => {});\n"],
        ['server.ts', "app.get('/health?probe=1', (_req, res) => res.end());\n"],
        ['server.ts', "const config = { mode: 'health' };\n"],
        ['server.ts', "app.get('/ping', (_req, res) => res.end());\n"],
        ['server.ts', "// app.get('/health', handler);\n"],
        ['server.ts', "/* app.get('/health', handler); */\nexport {};\n"],
      ])('%s holding %j earns no credit', (path, source) => {
        expect(healthComponent({ ...BASE, [path]: source }, WITAN_RUBRIC_VERSION_V25)).toBe(0);
      });
    });

    it('a real inline route still credits when an unrelated commented-out one precedes it', () => {
      const source = "// app.get('/healthz', old);\n" + INLINE_APP;
      expect(healthComponent({ ...BASE, 'server.ts': source }, WITAN_RUBRIC_VERSION_V25)).toBe(1);
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
