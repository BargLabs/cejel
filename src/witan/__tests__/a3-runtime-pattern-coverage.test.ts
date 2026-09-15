// Remediation-loop guards for goal_cejel_a3_runtime_pattern_coverage_0_4_9_2026-09-14.
//
// Each of A3's three signals below named a capability by pattern-matching a single narrow
// spelling of it. A user who added the capability in its ordinary, public-documentation form —
// not the exact spelling the pattern required — saw the finding unchanged after fixing the exact
// thing it named. That defeats the remediation loop: read a finding, fix it, rerun, see nothing
// move. Every `it` below is a before/after pair proving the signal DOES move for the common form,
// plus a negative guard proving an unrelated or absent capability still reports absent.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';
import type { WitanCriterionSignalPayload } from '../schemas.js';

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-a3-pattern-coverage-'));
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
    productSlug: 'a3-pattern-fixture',
    productDisplayName: 'A3 pattern fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-09-14T00:00:00.000Z',
    rubricVersion: WITAN_RUBRIC_VERSION_V23,
  });
  return (input.signals ?? []).find((candidate) => candidate.criterionId === 'A3') ?? null;
}

const HEALTH_ROUTE_ABSENCE_SUMMARY =
  'A production HTTP entrypoint handles requests directly but declares no health or readiness route.';

describe('A3 health/readiness route — public-documentation idioms beyond the bare keyword', () => {
  const SERVER_WITHOUT_HEALTH_ROUTE: Readonly<Record<string, string>> = {
    'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
    'src/main.js':
      "import http from 'node:http';\n" +
      'http.createServer((req, res) => {\n' +
      "  if (req.url === '/users') { res.end('users'); return; }\n" +
      "  res.end('not found');\n" +
      '}).listen(5300);\n',
  };

  function serverWithRoute(route: string): Readonly<Record<string, string>> {
    return {
      ...SERVER_WITHOUT_HEALTH_ROUTE,
      'src/main.js':
        "import http from 'node:http';\n" +
        'http.createServer((req, res) => {\n' +
        `  if (req.url === '${route}') { res.end('ok'); return; }\n` +
        "  if (req.url === '/users') { res.end('users'); return; }\n" +
        "  res.end('not found');\n" +
        '}).listen(5300);\n',
    };
  }

  it('reports the absence finding on the unmodified service (baseline for every case below)', () => {
    const a3 = scanA3(SERVER_WITHOUT_HEALTH_ROUTE);
    expect((a3?.findings ?? []).map((finding) => finding.summary)).toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
  });

  it('closes the finding for the Kubernetes convention (/healthz)', () => {
    const a3 = scanA3(serverWithRoute('/healthz'));
    expect((a3?.findings ?? []).map((finding) => finding.summary)).not.toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
  });

  it('closes the finding for a mounted prefix (/api/health)', () => {
    const a3 = scanA3(serverWithRoute('/api/health'));
    expect((a3?.findings ?? []).map((finding) => finding.summary)).not.toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
  });

  it('closes the finding for a suffixed segment (/health/live)', () => {
    const a3 = scanA3(serverWithRoute('/health/live'));
    expect((a3?.findings ?? []).map((finding) => finding.summary)).not.toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
  });

  it('closes the finding for a template literal with an interpolated prefix', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVER_WITHOUT_HEALTH_ROUTE,
      'src/main.js':
        "import http from 'node:http';\n" +
        "const BASE_PATH = '/svc';\n" +
        'http.createServer((req, res) => {\n' +
        '  if (req.url === `${BASE_PATH}/health`) { res.end(\'ok\'); return; }\n' +
        "  res.end('not found');\n" +
        '}).listen(5300);\n',
    };
    const a3 = scanA3(files);
    expect((a3?.findings ?? []).map((finding) => finding.summary)).not.toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
  });

  it('negative guard: an unrelated compound word ("live-chat", "readytoship") does not close the finding', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVER_WITHOUT_HEALTH_ROUTE,
      'src/main.js':
        "import http from 'node:http';\n" +
        'http.createServer((req, res) => {\n' +
        "  if (req.url === '/live-chat') { res.end('chat'); return; }\n" +
        "  if (req.url === '/readytoship') { res.end('ok'); return; }\n" +
        "  res.end('not found');\n" +
        '}).listen(5300);\n',
    };
    const a3 = scanA3(files);
    expect((a3?.findings ?? []).map((finding) => finding.summary)).toContain(
      HEALTH_ROUTE_ABSENCE_SUMMARY,
    );
  });
});

describe('A3 observability depth — structured-logging/correlation idioms beyond the vendor list', () => {
  const SERVICE: Readonly<Record<string, string>> = {
    'src/server.js': "const express = require('express');\nconst app = express();\napp.listen(3000);\n",
    'package.json': JSON.stringify({ name: 'svc', version: '1.0.0', scripts: { build: 'tsc' } }),
  };

  function observabilityDepth(signal: WitanCriterionSignalPayload | null): number {
    return signal?.metrics?.find((candidate) => candidate.name === 'observability_depth')?.value ?? 0;
  }

  it('a pino logger plus request-correlation middleware moves the count from zero', () => {
    const before = scanA3(SERVICE);
    const after = scanA3({
      ...SERVICE,
      'src/logging.js':
        "const pino = require('pino');\n" +
        'const log = pino();\n' +
        'function withRequestId(req, res, next) {\n' +
        "  req.correlationId = req.headers['x-request-id'] || Math.random().toString(36);\n" +
        "  log.info('assigned', req.correlationId);\n" +
        '  next();\n' +
        '}\n' +
        'module.exports = { withRequestId };\n',
    });

    expect(observabilityDepth(before)).toBe(0);
    expect(observabilityDepth(after)).toBe(1);
  });

  it('a winston/bunyan/morgan file also moves the count from zero', () => {
    const after = scanA3({
      ...SERVICE,
      'src/access-log.js':
        "const morgan = require('morgan');\n" + "module.exports = morgan('combined');\n",
    });
    expect(observabilityDepth(after)).toBe(1);
  });

  it('negative guard: a file with neither a vendor name nor a widened idiom still scores zero', () => {
    const after = scanA3({
      ...SERVICE,
      'src/util.js': 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n',
    });
    expect(observabilityDepth(after)).toBe(0);
  });
});

describe('A3 error boundary — the Express four-argument error-middleware signature', () => {
  // Cited: repo-signals.ts collectA3ProdReadinessEvidence, the `errorBoundaries` filename filter
  // feeding the `prod_readiness_primitives` metric's "error boundary" component. It matched only
  // the frontend/React convention (a file named error-boundary.* or ending in error.(tsx|jsx|ts|js))
  // and never read file content, so an Express error-handling middleware layer — which can be
  // named and placed anywhere — never moved this component regardless of where it was added.
  const SERVICE: Readonly<Record<string, string>> = {
    'src/server.js': "const express = require('express');\nconst app = express();\napp.listen(3000);\n",
    'package.json': JSON.stringify({ name: 'svc', version: '1.0.0', scripts: { build: 'tsc' } }),
  };

  function primitivesValue(signal: WitanCriterionSignalPayload | null): number {
    return signal?.metrics?.find((candidate) => candidate.name === 'prod_readiness_primitives')?.value ?? 0;
  }

  it('a four-argument (err, req, res, next) handler, in a file the filename check ignores, moves the count', () => {
    const before = scanA3(SERVICE);
    const after = scanA3({
      ...SERVICE,
      // Named "errorHandler.js", not "error.js" or "*error-boundary*" — the filename check
      // matches neither, isolating this test to the new content-based detection.
      'src/errorHandler.js':
        'function errorHandler(err, req, res, next) {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '}\n' +
        'module.exports = errorHandler;\n',
    });

    expect(primitivesValue(after)).toBe(primitivesValue(before) + 1);
  });

  it('the TypeScript-typed canonical form (err: Error, req: Request, res: Response, next: NextFunction) also moves the count', () => {
    const before = scanA3(SERVICE);
    const after = scanA3({
      ...SERVICE,
      'src/errorHandler.ts':
        'export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '}\n',
    });

    expect(primitivesValue(after)).toBe(primitivesValue(before) + 1);
  });

  it('negative guard: an ordinary two-argument request handler does not count as an error boundary', () => {
    const before = scanA3(SERVICE);
    const after = scanA3({
      ...SERVICE,
      'src/handler.js':
        "app.get('/', (req, res) => { res.json({ ok: true }); });\n" + 'module.exports = app;\n',
    });

    expect(primitivesValue(after)).toBe(primitivesValue(before));
  });

  it('negative guard: an unrelated four-argument function with different parameter names does not count', () => {
    const before = scanA3(SERVICE);
    const after = scanA3({
      ...SERVICE,
      'src/math.js': 'function combine(a, b, c, d) { return a + b + c + d; }\nmodule.exports = { combine };\n',
    });

    expect(primitivesValue(after)).toBe(primitivesValue(before));
  });
});
