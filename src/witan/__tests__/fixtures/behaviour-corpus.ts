import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// THE BEHAVIOUR-FINGERPRINT CORPUS.
//
// A committed set of SYNTHETIC repository shapes, invented for this file. `cejel` is a public
// repository, so anything committed here is published: nothing below is derived from any
// counterparty, customer, or real repository, and no fixture reproduces private content. The
// shapes are ordinary public idioms — an npm package manifest, a GitHub workflow, a Django-less
// Python project, a SQL migration — written from scratch.
//
// Purpose: give `rubric-behaviour-fingerprint.test.ts` something to MEASURE. A rubric identifier
// is a name its author controls; scoring can change underneath it. Scoring this corpus under
// every selectable rubric and digesting the scoring-relevant output turns "the rubric did not
// change" from a declaration into an observation.
//
// Fixtures are materialised into a temp directory and git-committed at test time rather than
// tracked as files in this repository. Three reasons, the first two inherited from
// calibration-fixtures.ts: a tracked secret-shaped literal would pollute cejel's own A2 posture
// and could alarm a generic secret scanner; a tracked nested `package.json` would join the pnpm
// workspace; and a tracked nested `.github/workflows` directory is a confusing near-miss for
// this repository's own CI. Every fixture's HEAD sha is pinned, so a fixture that stops
// reproducing fails as "fixture not reproducible" rather than as a scoring change.

/** Fixed identity, dates and config so each fixture's commit sha is reproducible anywhere. */
export const HERMETIC_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Cejel Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@cejel.invalid',
  GIT_COMMITTER_NAME: 'Cejel Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@cejel.invalid',
  GIT_AUTHOR_DATE: '2026-09-15T00:00:00+00:00',
  GIT_COMMITTER_DATE: '2026-09-15T00:00:00+00:00',
  TZ: 'UTC',
};

export interface BehaviourFixture {
  /** Stable identifier; also the report's productSlug, so it must be slug-shaped. */
  readonly name: string;
  /** Why this shape is in the corpus. Prose only — coverage is measured, never declared. */
  readonly purpose: string;
  /**
   * Author and committer date, ISO-8601 with an offset. Defaults to the corpus-wide 2026-09-15.
   * Only set it where the fixture's POINT is that the commit year differs from the scan year —
   * B4's audit-freshness reference year, which witan-rubric-v19 moves off the scan clock and onto
   * HEAD's committer metadata.
   */
  readonly commitDate?: string;
  readonly files: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------------------------

const VITEST_FILE =
  "import { expect, it } from 'vitest';\n\nit('adds', () => {\n  expect(1 + 1).toBe(2);\n});\n";

const CI_WORKFLOW = [
  'name: ci',
  'on:',
  '  push:',
  '    branches: [main]',
  '  pull_request:',
  'jobs:',
  '  verify:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: npm ci',
  '      - run: npm run lint',
  '      - run: npm run typecheck',
  '      - run: npm test',
  '      - run: npm run build',
  '',
].join('\n');

const DEPLOY_WORKFLOW = [
  'name: deploy',
  'on:',
  '  workflow_dispatch:',
  'jobs:',
  '  deploy:',
  '    runs-on: ubuntu-latest',
  '    environment: production',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: npm ci',
  '      - run: npm run build',
  '      - name: deploy',
  '        run: ./scripts/deploy.sh',
  '      - name: rollback on failure',
  '        if: failure()',
  '        run: ./scripts/rollback.sh',
  '',
].join('\n');

const PR_TEMPLATE = [
  '## What changed',
  '',
  '## Why',
  '',
  '## Verification',
  '',
  '- [ ] tests pass',
  '- [ ] linked issue',
  '',
].join('\n');

const OBSERVABLE_SERVER = [
  "import { AsyncLocalStorage } from 'node:async_hooks';",
  "import express from 'express';",
  "import pino from 'pino';",
  '',
  'const logger = pino();',
  'const requestContext = new AsyncLocalStorage();',
  '',
  'export const app = express();',
  '',
  'app.use((req, res, next) => {',
  "  const correlationId = req.header('x-correlation-id') ?? 'local';",
  '  requestContext.run({ correlationId }, next);',
  '});',
  '',
  "app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));",
  "app.get('/readyz', (_req, res) => res.status(200).json({ status: 'ready' }));",
  '',
  "app.get('/orders', async (_req, res) => {",
  '  logger.info({ route: "/orders" }, "listing orders");',
  '  res.json(await listOrders());',
  '});',
  '',
  'app.use((err, _req, res, _next) => {',
  "  logger.error({ err }, 'unhandled request error');",
  "  res.status(500).json({ error: 'internal_error' });",
  '});',
  '',
  'async function listOrders() {',
  '  return [];',
  '}',
  '',
].join('\n');

const RLS_MIGRATION = [
  '-- 0001: orders table with per-tenant row level security.',
  'CREATE TABLE orders (',
  '  id uuid PRIMARY KEY,',
  '  tenant_id uuid NOT NULL,',
  '  total_cents integer NOT NULL',
  ');',
  '',
  'ALTER TABLE orders ENABLE ROW LEVEL SECURITY;',
  '',
  'CREATE POLICY orders_tenant_isolation ON orders',
  '  USING (tenant_id = current_setting(\'app.tenant_id\')::uuid)',
  '  WITH CHECK (tenant_id = current_setting(\'app.tenant_id\')::uuid);',
  '',
].join('\n');

/**
 * A synthetic branded secret shape, assembled from segments so this source file never contains
 * one contiguous credential-shaped literal. Same technique as calibration-fixtures.ts.
 */
const SYNTHETIC_BRANDED_SECRET = ['sk', 'liveFIXTUREonly0000abcdEFGH1234ijklMNOP'].join('-');

/**
 * An unbranded, high-entropy credential shape with no English-word composition and no
 * placeholder vocabulary — invented, and assembled from segments for the same reason.
 */
const SYNTHETIC_DOCS_CREDENTIAL = ['Qv8Ht2Nx6Br4Ls9Dw3', 'Pk7Zf1Mj5Cy0Ag4Tu8Ei2Ro6Xn'].join('');

/** A PEM envelope with a placeholder body — markers only, never key material. */
const SYNTHETIC_PEM_PLACEHOLDER = [
  '-----BEGIN PRIVATE KEY-----',
  'REPLACE_THIS_PLACEHOLDER_BEFORE_USE_IT_IS_NOT_A_KEY',
  '-----END PRIVATE KEY-----',
  '',
].join('\n');

function manifest(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * A Node HTTP server constructed and bound in ONE chained expression, serving a route and no
 * health or readiness route. The chaining matters: `createServer(...).listen(<port>)` is what the
 * v20 direct-entrypoint pattern recognises, and it is deliberately not the `server.listen(PORT)`
 * shape the v17 deployable-service pattern looks for.
 */
function directHttpServer(port: number): string {
  return (
    "const http = require('node:http');\n\n" +
    'http.createServer((req, res) => {\n' +
    "  if (req.url === '/items') {\n" +
    "    res.writeHead(200, { 'content-type': 'application/json' });\n" +
    '    res.end(JSON.stringify({ items: [] }));\n' +
    '    return;\n' +
    '  }\n' +
    '  res.writeHead(404);\n' +
    "  res.end('not found');\n" +
    `}).listen(${port});\n`
  );
}

// ---------------------------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------------------------

export const BEHAVIOUR_CORPUS: readonly BehaviourFixture[] = [
  {
    name: 'complete-node-service',
    purpose:
      'A conventionally well-run TypeScript service: real verification scripts, tests, CI, ' +
      'deploy with rollback, PR template, CODEOWNERS, dependency automation, pinned manifest, ' +
      'env template, health routes, structured logging, error middleware, RLS migration, ADRs. ' +
      'The high-water mark of the corpus — most criteria reach a measured, non-zero score here.',
    files: {
      'package.json': manifest({
        name: 'complete-node-service',
        version: '1.4.2',
        private: true,
        scripts: {
          build: 'tsc -p tsconfig.json',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          test: 'vitest run --coverage',
          start: 'node dist/server.js',
        },
        dependencies: { express: '4.19.2', pino: '9.3.2' },
        devDependencies: { typescript: '5.5.4', vitest: '2.0.5' },
      }),
      'package-lock.json': manifest({ name: 'complete-node-service', lockfileVersion: 3, packages: {} }),
      'src/server.ts': OBSERVABLE_SERVER,
      'src/orders.ts': 'export interface Order {\n  id: string;\n  totalCents: number;\n}\n',
      'src/config.ts':
        'export const config = {\n' +
        '  databaseUrl: process.env.DATABASE_URL ?? "",\n' +
        '  port: Number(process.env.PORT ?? 3000),\n' +
        '};\n',
      'src/server.test.ts': VITEST_FILE,
      'src/orders.test.ts': VITEST_FILE,
      'migrations/0001_orders.sql': RLS_MIGRATION,
      'scripts/deploy.sh': '#!/usr/bin/env bash\nset -euo pipefail\necho "deploying"\n',
      'scripts/rollback.sh': '#!/usr/bin/env bash\nset -euo pipefail\necho "rolling back"\n',
      '.github/workflows/ci.yml': CI_WORKFLOW,
      '.github/workflows/deploy.yml': DEPLOY_WORKFLOW,
      '.github/PULL_REQUEST_TEMPLATE.md': PR_TEMPLATE,
      '.github/CODEOWNERS': '* @example-org/platform\n',
      '.github/dependabot.yml':
        'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: "/"\n    schedule:\n      interval: weekly\n',
      '.env.example': 'DATABASE_URL=postgres://user:password@localhost:5432/app\nPORT=3000\n',
      '.gitignore': '.env\nnode_modules/\ndist/\ncoverage/\n',
      'README.md':
        '# complete-node-service\n\nAn order service used as a scan fixture.\n\n' +
        '## Install\n\n```sh\nnpm install\n```\n\n## Usage\n\n```sh\nnpm start\n```\n\n' +
        '## Testing\n\n```sh\nnpm test\n```\n',
      'CHANGELOG.md': '# Changelog\n\n## 1.4.2\n\n- Added readiness route.\n',
      'CONTRIBUTING.md': '# Contributing\n\nOpen a pull request against `main`.\n',
      'SECURITY.md': '# Security\n\nReport issues privately to the maintainers.\n',
      'docs/adr/0001-record-architecture-decisions.md':
        '# 1. Record architecture decisions\n\nStatus: accepted\n\n## Context\n\n' +
        'Decisions were not written down.\n\n## Decision\n\nUse ADRs.\n\n## Consequences\n\n' +
        'Each significant change carries a record.\n',
      'docs/runbook.md':
        '# Runbook\n\n## Rollback\n\nRun `scripts/rollback.sh` and confirm `/healthz` returns 200.\n',
    },
  },
  {
    name: 'minimal-source-no-process',
    purpose:
      'The floor: authored source with no verification scripts, no tests, no CI, no process ' +
      'artifacts at all. Exercises the absence path of every criterion that the high-water ' +
      'fixture exercises positively.',
    files: {
      'package.json': manifest({ name: 'minimal-source-no-process', version: '0.1.0' }),
      'src/index.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
      'src/parse.ts':
        'export function parsePort(value: string | undefined): number {\n' +
        '  return Number(value ?? 3000);\n}\n',
      'src/format.ts': 'export const format = (n: number): string => n.toFixed(2);\n',
    },
  },
  {
    name: 'committed-secret-and-pem',
    purpose:
      'A2 negative posture: a branded secret-shaped literal in tracked source, a committed ' +
      '.env, and a PEM private-key envelope. The PEM is the grammar witan-rubric-v23 added, so ' +
      'this fixture is where a v23-only detector change becomes visible against v17.',
    files: {
      'package.json': manifest({
        name: 'committed-secret-and-pem',
        version: '0.2.0',
        scripts: { test: 'vitest run' },
      }),
      'src/payments.ts':
        '// Fixture only: a synthetic value in a real-looking assignment position.\n' +
        `export const stripeSecretKey = '${SYNTHETIC_BRANDED_SECRET}';\n` +
        'export const charge = (cents: number): number => cents;\n',
      'src/payments.test.ts': VITEST_FILE,
      'config/service-account.json': manifest({
        type: 'service_account',
        private_key: SYNTHETIC_PEM_PLACEHOLDER.replace(/\n/g, '\\n'),
      }),
      '.env': `STRIPE_SECRET_KEY=${SYNTHETIC_BRANDED_SECRET}\nDATABASE_URL=postgres://localhost/app\n`,
      'README.md': '# committed-secret-and-pem\n\nA deliberately bad secret posture.\n',
    },
  },
  {
    name: 'placeholder-test-script',
    purpose:
      "npm's default placeholder `test` script alongside real test files. The shape 0.4.9's " +
      'test-script content check moved DOWN under an unchanged v17 identifier; retained so the ' +
      'corpus keeps a fixture for a behaviour change that has already happened once.',
    files: {
      'package.json': manifest({
        name: 'placeholder-test-script',
        version: '1.0.0',
        scripts: {
          test: 'echo "Error: no test specified" && exit 1',
          lint: 'eslint .',
          build: 'tsc',
        },
      }),
      'src/index.ts': 'export const value = 1;\n',
      'src/index.test.ts': VITEST_FILE,
      'README.md': '# placeholder-test-script\n\nA fixture repository.\n',
    },
  },
  {
    name: 'lint-typecheck-no-tests',
    purpose:
      "A1's authenticated-absence path: package-level lint and typecheck scripts with no test " +
      'files anywhere. The shape 0.4.9 moved UP under an unchanged v17 identifier.',
    files: {
      'package.json': manifest({
        name: 'lint-typecheck-no-tests',
        version: '1.0.0',
        scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' },
      }),
      'src/index.ts': 'export const value = 1;\n',
      'src/util.ts': 'export const other = 2;\n',
      'README.md': '# lint-typecheck-no-tests\n\nA fixture repository.\n',
    },
  },
  {
    name: 'pr-template-directory-form',
    purpose:
      "GitHub's directory form of the pull-request template plus a CI workflow. The shape 0.4.9 " +
      'moved UP under an unchanged v17 identifier; also the corpus\'s B2 process-trace fixture.',
    files: {
      'package.json': manifest({
        name: 'pr-template-directory-form',
        version: '1.0.0',
        scripts: { test: 'vitest run' },
      }),
      'src/index.ts': 'export const value = 1;\n',
      'src/index.test.ts': VITEST_FILE,
      '.github/PULL_REQUEST_TEMPLATE/feature.md': PR_TEMPLATE,
      '.github/PULL_REQUEST_TEMPLATE/bugfix.md': '## Bug\n\n## Fix\n\n## Verification\n',
      '.github/workflows/ci.yml': CI_WORKFLOW,
      'README.md': '# pr-template-directory-form\n\nA fixture repository.\n',
    },
  },
  {
    name: 'python-service',
    purpose:
      'A non-JavaScript ecosystem: requirements/pyproject dependency surface, pytest tests, a ' +
      'Makefile verification entry point, a GitHub workflow. Guards against a corpus whose ' +
      'coverage is an accident of every fixture carrying a package.json.',
    files: {
      'pyproject.toml':
        '[project]\nname = "python-service"\nversion = "0.3.1"\ndependencies = [\n' +
        '  "flask==3.0.3",\n  "psycopg[binary]==3.2.1",\n]\n\n' +
        '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
      'requirements.txt': 'flask==3.0.3\npsycopg[binary]==3.2.1\n',
      'app/__init__.py': '',
      'app/main.py':
        'import logging\n\nfrom flask import Flask\n\n'
        + 'logger = logging.getLogger(__name__)\napp = Flask(__name__)\n\n\n'
        + '@app.get("/healthz")\ndef healthz():\n    return {"status": "ok"}, 200\n\n\n'
        + '@app.get("/items")\ndef items():\n    logger.info("listing items")\n    return {"items": []}\n',
      'app/store.py':
        'import os\n\nDATABASE_URL = os.environ.get("DATABASE_URL", "")\n\n\n'
        + 'def fetch_all():\n    return []\n',
      'tests/test_main.py':
        'from app.main import app\n\n\ndef test_healthz():\n'
        + '    client = app.test_client()\n    assert client.get("/healthz").status_code == 200\n',
      'tests/test_store.py':
        'from app.store import fetch_all\n\n\ndef test_fetch_all():\n    assert fetch_all() == []\n',
      'Makefile':
        'lint:\n\truff check .\n\ntest:\n\tpytest -q\n\ntypecheck:\n\tmypy app\n\n.PHONY: lint test typecheck\n',
      '.github/workflows/ci.yml': [
        'name: ci',
        'on: [push, pull_request]',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: pip install -r requirements.txt',
        '      - run: make lint',
        '      - run: make test',
        '',
      ].join('\n'),
      '.gitignore': '.env\n__pycache__/\n.venv/\n',
      '.env.example': 'DATABASE_URL=postgresql://localhost:5432/app\n',
      'README.md':
        '# python-service\n\nA small Flask service used as a scan fixture.\n\n' +
        '## Install\n\n```sh\npip install -r requirements.txt\n```\n\n' +
        '## Testing\n\n```sh\nmake test\n```\n',
    },
  },
  {
    name: 'docs-only-repository',
    purpose:
      'No ratable source tree. Exercises the archetype abstention path end to end: null ' +
      'composite scores, the insufficient_source verdict, and its stated reason — the one part ' +
      'of the scoring surface no scored fixture can reach.',
    files: {
      'README.md': '# docs-only-repository\n\nA documentation site source.\n',
      'docs/index.md': '# Index\n\nStart here.\n',
      'docs/guide.md': '# Guide\n\nHow to use the thing.\n',
      'docs/faq.md': '# FAQ\n\n## Is this a source tree?\n\nNo.\n',
      'CONTRIBUTING.md': '# Contributing\n\nEdit the markdown and open a pull request.\n',
    },
  },
  {
    name: 'oversized-withheld-source',
    purpose:
      "A source file above cejel's own 512,000-byte content ceiling. The repository walk " +
      'withholds it, which is the input witan-rubric-v23 reads as an abstention rather than an ' +
      'absence; under v17 the same shape reports a plain absence. Without this fixture the ' +
      'v23 abstention semantics are unmeasured.',
    files: {
      'package.json': manifest({
        name: 'oversized-withheld-source',
        version: '1.0.0',
        scripts: { test: 'vitest run', start: 'node src/server.js' },
      }),
      'src/server.js':
        "const http = require('node:http');\n" +
        "const server = http.createServer((req, res) => {\n  res.end('ok');\n});\n" +
        'server.listen(3000);\n' +
        `// ${'x'.repeat(512_001)}\n`,
      'src/index.js': 'module.exports = { add: (a, b) => a + b };\n',
      'src/index.test.js':
        "const { test, expect } = require('vitest');\ntest('adds', () => { expect(1 + 1).toBe(2); });\n",
      'README.md': '# oversized-withheld-source\n\nA fixture repository.\n',
    },
  },
  {
    name: 'privileged-migrations',
    purpose:
      'Administrative SQL in authored migration files — GRANT, ALTER ROLE, and a role-bypass ' +
      'change — with no human approval gate on the workflow that runs them. The shape ' +
      "witan-rubric-v21 added bounded recognition of, and the corpus's B6 fixture.",
    files: {
      'package.json': manifest({
        name: 'privileged-migrations',
        version: '2.0.0',
        scripts: { test: 'vitest run', migrate: 'node scripts/migrate.js' },
      }),
      'src/index.ts': 'export const version = 2;\n',
      'src/index.test.ts': VITEST_FILE,
      'migrations/0001_orders.sql': RLS_MIGRATION,
      'migrations/0002_grants.sql': [
        '-- 0002: application role grants.',
        'CREATE ROLE app_service NOLOGIN;',
        'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_service;',
        'GRANT billing_admin TO app_service;',
        'ALTER ROLE app_service SUPERUSER;',
        '',
      ].join('\n'),
      'scripts/migrate.js':
        "const { Client } = require('pg');\n" +
        'async function main() {\n' +
        '  const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });\n' +
        '  await client.connect();\n' +
        "  await client.query('GRANT USAGE ON SCHEMA public TO app_service');\n" +
        '  await client.end();\n' +
        '}\nmain();\n',
      '.github/workflows/migrate.yml': [
        'name: migrate',
        'on:',
        '  push:',
        '    branches: [main]',
        'jobs:',
        '  migrate:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm run migrate',
        '',
      ].join('\n'),
      'README.md': '# privileged-migrations\n\nA fixture repository.\n',
    },
  },
  {
    name: 'direct-http-entrypoint-no-health',
    purpose:
      'An entrypoint-named file that constructs and binds a Node HTTP server in one chained ' +
      'expression, handles requests itself, and declares no health or readiness route. Not a ' +
      "deployable service to witan-rubric-v17 (whose entrypoint pattern wants `server.listen(` " +
      'directly); the shape witan-rubric-v20 added. Deliberately carries NO `start` script, so ' +
      'a v20 movement here cannot be confused with the v22 mechanism below.',
    files: {
      'package.json': manifest({
        name: 'direct-http-entrypoint-no-health',
        version: '0.5.0',
        scripts: { test: 'vitest run', build: 'node scripts/build.mjs' },
      }),
      'server.js': directHttpServer(3000),
      'scripts/build.mjs': "console.log('build');\n",
      'lib/items.js': 'module.exports = { list: () => [] };\n',
      'lib/items.test.js':
        "const { test, expect } = require('vitest');\n" +
        "const { list } = require('./items.js');\n" +
        "test('lists', () => { expect(list()).toEqual([]); });\n",
      'README.md': '# direct-http-entrypoint-no-health\n\nA fixture repository.\n',
    },
  },
  {
    name: 'start-declared-http-entrypoint',
    purpose:
      'The same unhealthy HTTP entrypoint, in a file no entrypoint-name convention reaches — ' +
      'findable only by following the root `start` command to it. The shape witan-rubric-v22 ' +
      'added, and the one place in the corpus where v22 can differ from v21.',
    files: {
      'package.json': manifest({
        name: 'start-declared-http-entrypoint',
        version: '0.5.0',
        scripts: { start: 'node service/edge-handler.js', test: 'vitest run' },
      }),
      'service/edge-handler.js': directHttpServer(4000),
      'lib/items.js': 'module.exports = { list: () => [] };\n',
      'lib/items.test.js':
        "const { test, expect } = require('vitest');\n" +
        "const { list } = require('./items.js');\n" +
        "test('lists', () => { expect(list()).toEqual([]); });\n",
      'README.md': '# start-declared-http-entrypoint\n\nA fixture repository.\n',
    },
  },
  {
    name: 'stale-audit-trail',
    purpose:
      'An audit trail written in a year that is not the scan year. B4 rates freshness against ' +
      'the SCAN year up to witan-rubric-v18 and against HEAD\'s committer year from v19, so this ' +
      'is the one fixture where those two rubrics can disagree — and the one place the corpus ' +
      "shows that v17's B4 freshness reads a clock rather than the repository.",
    commitDate: '2024-03-04T00:00:00+00:00',
    files: {
      'package.json': manifest({
        name: 'stale-audit-trail',
        version: '3.1.0',
        scripts: { test: 'vitest run', lint: 'eslint .' },
      }),
      'src/index.ts': 'export const version = 3;\n',
      'src/index.test.ts': VITEST_FILE,
      'CHANGELOG.md':
        '# Changelog\n\n## 3.1.0 — 2024-03-04\n\n- Added a retry to the export job.\n\n' +
        '## 3.0.0 — 2024-01-11\n\n- Split the reporting module out.\n',
      'SECURITY.md': '# Security\n\nReport issues privately to the maintainers.\n',
      'docs/runbook.md':
        '# Runbook\n\n## Export job\n\nRe-run the export job from the 2024 operations checklist.\n',
      'README.md': '# stale-audit-trail\n\nA fixture repository.\n',
    },
  },
  {
    name: 'real-credential-in-docs',
    purpose:
      'A2: a real-shaped credential committed to a documentation path. Up to witan-rubric-v22 the ' +
      'path-based non-production credential exemption removes docs/ and .md files from the ' +
      "secret scan, so the value is never read; witan-rubric-v24's content-context classification " +
      'reads it and flags it. This is the one fixture where v24 and its v22 parent can disagree. ' +
      'Added 2026-10-01: once v24 stopped falling to the legacy scoring path, no other fixture ' +
      'separated the two and their fingerprints collided.',
    files: {
      'package.json': manifest({
        name: 'real-credential-in-docs',
        version: '1.0.0',
        scripts: { test: 'vitest run' },
      }),
      '.gitignore': '.env\n.env.*\n!.env.example\n',
      'src/index.ts': 'export const version = "1.0.0";\n',
      'src/index.test.ts': VITEST_FILE,
      'docs/runbook.md':
        '# Ingest credential rotation\n\n' +
        'The ingest worker authenticates to the analytics collector on start-up. Rotate the\n' +
        'value below every quarter and restart the worker pool.\n\n' +
        `    ANALYTICS_INGEST_TOKEN=${SYNTHETIC_DOCS_CREDENTIAL}\n`,
      'README.md': '# real-credential-in-docs\n\nA fixture repository.\n',
    },
  },
  {
    name: 'control-described-not-built',
    purpose:
      'A3, B2, B6: every control here is only DESCRIBED — in a test file, a code comment, a ' +
      'changelog, a calibration review note, a CODEOWNERS file in a directory GitHub never reads, ' +
      'and a file whose name merely ends in "-error.ts". None is the control. Until cejel #433 each ' +
      'of them was credited under every rubric; this fixture is how the fingerprint sees that fix. ' +
      'Added 2026-10-09: the 0.4.11 entry records that the corpus could not see a v17 behaviour ' +
      'change because it held none of the shapes the change acted on.',
    files: {
      'package.json': manifest({
        name: 'control-described-not-built',
        version: '1.0.0',
        scripts: { start: 'node src/server.js', test: 'vitest run' },
      }),
      'src/server.js':
        "const express = require('express');\n\n" +
        'const app = express();\n' +
        '// Errors should eventually go through app.use((err, req, res, next) => res.status(500).end()).\n' +
        "app.get('/items', (req, res) => res.json({ items: [] }));\n" +
        'app.listen(3000);\n\n' +
        'module.exports = app;\n',
      'src/packs/swallowed-error.ts':
        'export function swallow(run: () => void): void {\n' +
        '  try {\n' +
        '    run();\n' +
        '  } catch {\n' +
        '    // ignored\n' +
        '  }\n' +
        '}\n',
      'src/jobs.ts':
        '/*\n' +
        ' * Planned: if (!config.killSwitch) return; before any job runs.\n' +
        ' */\n' +
        'export const runJobs = (): number => 0;\n',
      'src/__tests__/roles.test.ts':
        "import { expect, it } from 'vitest';\n\n" +
        "it('recognises a fail-closed elevation', () => {\n" +
        "  const sql = \"SELECT pg_has_role(current_user, 'admin', 'MEMBER'); SET ROLE admin;\";\n" +
        '  expect(sql).toContain(\'SET ROLE\');\n' +
        '});\n',
      'CHANGELOG.md':
        '# Changelog\n\n## 1.0.0\n\n' +
        '- The admin checker now recognises docs saying privileged operations are human-executed.\n',
      'calibration/round-1/reviews/reviewer-b.md':
        '# Reviewer B\n\nThe required review setup was interrupted, so the second pass ran a day ' +
        'later.\n',
      '.github/workflows/CODEOWNERS': '* @example-org/maintainers\n',
      'README.md': '# control-described-not-built\n\nA fixture repository.\n',
    },
  },
  {
    name: 'inline-health-route-and-prettier-handler',
    purpose:
      'A3: an Express service whose only health route is declared inline in the application ' +
      'file (no health.ts, no Dockerfile HEALTHCHECK, no probes), and whose error handler is ' +
      'written in Prettier\'s multi-line style with an underscored `_req` and a trailing comma, ' +
      'registered in the same file. Two shapes, two mechanisms: the handler is credited by the ' +
      'widened error-middleware shape pattern under every rubric, the inline route only by ' +
      'witan-rubric-v25 (the scored health component is filename-only everywhere else). Added ' +
      '2026-10-12 so the fingerprint can see both; before it the corpus held neither shape.',
    files: {
      'package.json': manifest({
        name: 'inline-health-route-and-prettier-handler',
        version: '1.0.0',
        scripts: { start: 'node src/server.js', build: 'tsc', test: 'vitest run' },
      }),
      'src/server.ts':
        "import express, { type ErrorRequestHandler } from 'express';\n" +
        "import { Pool } from 'pg';\n\n" +
        'const pool = new Pool();\n' +
        'const app = express();\n\n' +
        "app.get('/health', async (_req, res) => {\n" +
        '  try {\n' +
        "    await pool.query('select 1');\n" +
        '    res.json({ ok: true });\n' +
        '  } catch {\n' +
        '    res.status(503).json({ ok: false });\n' +
        '  }\n' +
        '});\n\n' +
        'const errorHandler: ErrorRequestHandler = (\n' +
        '  error,\n' +
        '  _req,\n' +
        '  res,\n' +
        '  next,\n' +
        ') => {\n' +
        "  res.status(500).json({ message: 'internal error' });\n" +
        '};\n' +
        'app.use(errorHandler);\n\n' +
        'app.listen(3000);\n',
      'src/items.test.ts':
        "import { expect, it } from 'vitest';\n\nit('adds', () => {\n  expect(1 + 1).toBe(2);\n});\n",
      'README.md': '# inline-health-route-and-prettier-handler\n\nA fixture repository.\n',
    },
  },
  {
    name: 'ava-live-assertions',
    purpose: 'An imported AVA runner and live t.is assertion must not be called hollow (#427); synthetic public idiom.',
    files: {
      'package.json': '{"name":"ava-live-assertions","scripts":{"test":"ava"},"devDependencies":{"ava":"6.0.0"}}\n',
      'index.js': 'export const value = 1;\n',
      'test.js': "import test from 'ava';\ntest('value', t => { t.is(1, 1); });\n",
    },
  },
  {
    name: 'public-digest-lookup',
    purpose: 'A public content hash lookup is not secret authentication evidence (#430); synthetic ordinary map lookup.',
    files: {
      'package.json': '{"name":"public-digest-lookup","scripts":{"test":"node --test"}}\n',
      'src/lookup.js': 'export const lookup = (rows, contentDigest) => rows.find(row => row.contentDigest === contentDigest);\n',
      'src/lookup.test.js': "import assert from 'node:assert';\nassert.strictEqual(1, 1);\n",
    },
  },
  {
    name: 'workspace-package-scripts',
    purpose:
      'A workspace root that only orchestrates, with build and test scripts in a declared package: A3 and B3 must read the declared packages, not the root alone; synthetic npm workspace.',
    files: {
      'package.json':
        '{"name":"workspace-package-scripts","private":true,"workspaces":["packages/*"],"scripts":{"start":"node packages/api/src/server.js"}}\n',
      'packages/api/package.json':
        '{"name":"@fixture/api","scripts":{"build":"tsc -p .","test":"vitest run"}}\n',
      'packages/api/src/server.js':
        "import http from 'node:http';\n\nhttp.createServer((_req, res) => res.end('ok')).listen(8080);\n",
      '.github/workflows/ci.yml':
        'name: ci\non:\n  push:\n    branches: [main]\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo ok\n',
      'README.md': '# workspace-package-scripts\n\nA fixture repository.\n',
    },
  },
  {
    name: 'coverage-config-setup-cfg',
    purpose:
      'Coverage configured where coverage.py documents it for setup.cfg, a [coverage:report] section: A1 must not report no coverage configuration; synthetic Python package.',
    files: {
      'setup.cfg':
        '[metadata]\nname = coverage-config-setup-cfg\n\n[coverage:run]\nsource = src\n\n[coverage:report]\nfail_under = 85\n',
      'src/inventory.py': 'def count(items):\n    return len(items)\n',
      'tests/test_inventory.py':
        'from src.inventory import count\n\n\ndef test_count():\n    assert count([1, 2]) == 2\n',
      '.github/workflows/ci.yml':
        'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pytest\n',
    },
  },
  {
    name: 'coverage-config-maven-jacoco',
    purpose:
      'Coverage configured by applying the JaCoCo Maven plugin in <build><plugins>: A1 must not report no coverage configuration; synthetic Maven project.',
    files: {
      'pom.xml':
        '<project>\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>example</groupId>\n  <artifactId>coverage-config-maven-jacoco</artifactId>\n  <version>1.0.0</version>\n  <build>\n    <plugins>\n      <plugin>\n        <groupId>org.jacoco</groupId>\n        <artifactId>jacoco-maven-plugin</artifactId>\n        <version>0.8.12</version>\n        <executions>\n          <execution><goals><goal>prepare-agent</goal></goals></execution>\n        </executions>\n      </plugin>\n    </plugins>\n  </build>\n</project>\n',
      'src/main/java/example/Inventory.java':
        'package example;\n\npublic final class Inventory {\n  public static int count(int[] items) { return items.length; }\n}\n',
      'src/test/java/example/InventoryTest.java':
        'package example;\n\nclass InventoryTest {\n  @Test void counts() { assertEquals(2, Inventory.count(new int[] {1, 2})); }\n}\n',
      '.github/workflows/ci.yml':
        'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: mvn test\n',
    },
  },
  {
    name: 'coverage-command-go-ci',
    purpose:
      'Coverage collected by a go test cover flag in a CI run step, with no configuration file: A1 must not report no coverage configuration; synthetic Go module.',
    files: {
      'go.mod': 'module example.invalid/inventory\n\ngo 1.22\n',
      'inventory.go': 'package inventory\n\nfunc Count(items []int) int { return len(items) }\n',
      'inventory_test.go':
        'package inventory\n\nimport "testing"\n\nfunc TestCount(t *testing.T) {\n\tif Count([]int{1, 2}) != 2 {\n\t\tt.Fatal("count")\n\t}\n}\n',
      '.github/workflows/ci.yml':
        'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: go test -race -coverprofile=coverage.out ./...\n',
    },
  },
  {
    name: 'xunit-assertions',
    purpose:
      'An xUnit test asserting with Assert.Equal must not be called hollow (#406); synthetic .NET project in the xUnit template layout.',
    files: {
      'src/Inventory/Inventory.cs':
        'namespace Inventory;\n\npublic static class Stock\n{\n    public static int Count(int[] items) => items.Length;\n}\n',
      'tests/Inventory.Tests/StockTests.cs':
        'using Inventory;\nusing Xunit;\n\npublic class StockTests\n{\n    [Fact]\n    public void Counts()\n    {\n        Assert.Equal(2, Stock.Count(new[] { 1, 2 }));\n    }\n}\n',
    },
  },
  {
    name: 'nunit-ignored-fixture',
    purpose:
      'An NUnit fixture class under [Ignore] is hollow and a live Assert.That fixture is not: the documented suite-level skip, beside the recognized assertion; synthetic .NET project.',
    files: {
      'src/Inventory/Inventory.cs':
        'namespace Inventory;\n\npublic static class Stock\n{\n    public static int Count(int[] items) => items.Length;\n}\n',
      'tests/Inventory.Tests/StockTests.cs':
        'using Inventory;\nusing NUnit.Framework;\n\n[TestFixture]\npublic class StockTests\n{\n    [Test]\n    public void Counts() => Assert.That(Stock.Count(new[] { 1, 2 }), Is.EqualTo(2));\n}\n',
      'tests/Inventory.Tests/ReorderTests.cs':
        'using Inventory;\nusing NUnit.Framework;\n\n[TestFixture, Ignore("reorder rules not written yet")]\npublic class ReorderTests\n{\n    [Test]\n    public void Reorders() => Assert.That(Stock.Count(new int[0]), Is.EqualTo(0));\n}\n',
    },
  },
  {
    name: 'xctest-assertions',
    purpose:
      'A Swift XCTest case asserting with XCTAssertEqual must not be called hollow; synthetic Swift package.',
    files: {
      'Package.swift':
        '// swift-tools-version:5.9\nimport PackageDescription\n\nlet package = Package(\n    name: "Inventory",\n    targets: [.target(name: "Inventory"), .testTarget(name: "InventoryTests", dependencies: ["Inventory"])]\n)\n',
      'Sources/Inventory/Inventory.swift': 'public func count(_ items: [Int]) -> Int { items.count }\n',
      'Tests/InventoryTests/InventoryTests.swift':
        'import XCTest\n@testable import Inventory\n\nfinal class InventoryTests: XCTestCase {\n    func testCounts() {\n        XCTAssertEqual(count([1, 2]), 2)\n    }\n}\n',
    },
  },
  {
    name: 'scalatest-assertions',
    purpose:
      'A ScalaTest suite asserting with assert( and an org.scalatest import must not be called hollow; synthetic sbt project.',
    files: {
      'build.sbt': 'name := "inventory"\n\nlibraryDependencies += "org.scalatest" %% "scalatest" % "3.2.19" % Test\n',
      'src/main/scala/example/Inventory.scala':
        'package example\n\nobject Inventory {\n  def count(items: Seq[Int]): Int = items.size\n}\n',
      'src/test/scala/example/InventorySpec.scala':
        'package example\n\nimport org.scalatest.funsuite.AnyFunSuite\n\nclass InventorySpec extends AnyFunSuite {\n  test("counts") {\n    assert(Inventory.count(Seq(1, 2)) == 2)\n  }\n}\n',
    },
  },
  {
    name: 'kotest-matchers',
    purpose:
      'A Kotest spec asserting with shouldBe and a Kotest matcher import must not be called hollow; synthetic Gradle Kotlin project.',
    files: {
      'build.gradle.kts': 'plugins {\n    kotlin("jvm") version "2.0.21"\n}\n\ndependencies {\n    testImplementation("io.kotest:kotest-runner-junit5:5.9.1")\n}\n',
      'src/main/kotlin/example/Inventory.kt': 'package example\n\nfun count(items: List<Int>): Int = items.size\n',
      'src/test/kotlin/example/InventoryTest.kt':
        'package example\n\nimport io.kotest.core.spec.style.StringSpec\nimport io.kotest.matchers.shouldBe\n\nclass InventoryTest : StringSpec({\n    "counts" {\n        count(listOf(1, 2)) shouldBe 2\n    }\n})\n',
    },
  },
  {
    name: 'tape-assertions',
    purpose:
      'A tape test asserting with t.equal under a required tape binding must not be called hollow; synthetic npm package.',
    files: {
      'package.json': '{"name":"tape-assertions","scripts":{"test":"tape test/*.js"},"devDependencies":{"tape":"5.9.0"}}\n',
      'index.js': 'exports.count = (items) => items.length;\n',
      'test/count.js':
        "const test = require('tape');\nconst { count } = require('..');\n\ntest('counts', (t) => {\n  t.equal(count([1, 2]), 2);\n  t.end();\n});\n",
    },
  },
  {
    name: 'hmac-digest-compare',
    purpose:
      'A digest assigned from a keyed createHmac computation and compared with === is a secret compare, decided by what produced it and not by its name; synthetic webhook verifier.',
    files: {
      'package.json': '{"name":"hmac-digest-compare","scripts":{"test":"node --test"}}\n',
      'src/webhook.js':
        "import { createHmac } from 'node:crypto';\n\nexport function verify(body, sig, key) {\n  const digest = createHmac('sha256', key).update(body).digest('hex');\n  if (digest === sig) return true;\n  return false;\n}\n",
      'src/webhook.test.js': "import assert from 'node:assert';\nassert.strictEqual(1, 1);\n",
    },
  },
  {
    name: 'unkeyed-digest-controls',
    purpose:
      'A plain unkeyed hash compared as digest, and an HMAC computed into mac beside an unrelated contentDigest === etag, are not secret compares; synthetic cache helpers.',
    files: {
      'package.json': '{"name":"unkeyed-digest-controls","scripts":{"test":"node --test"}}\n',
      'src/cache.js':
        "import { createHash, createHmac } from 'node:crypto';\n\nexport const matches = (body, expected) => {\n  const digest = createHash('sha256').update(body).digest('hex');\n  return digest === expected;\n};\nexport const sign = (key, body) => {\n  const mac = createHmac('sha256', key).update(body).digest('hex');\n  return mac;\n};\nexport const fresh = (contentDigest, etag) => contentDigest === etag;\n",
      'src/cache.test.js': "import assert from 'node:assert';\nassert.strictEqual(1, 1);\n",
    },
  },
];

/**
 * `git rev-parse HEAD` for each fixture as built by `buildBehaviourFixture`.
 *
 * Checked FIRST, before any score is read. A fixture that stops reproducing — a changed file, a
 * git version that writes a different tree, an environment that leaks identity past
 * HERMETIC_GIT_ENV — then fails as "this fixture is not reproducible", which is what it is,
 * instead of surfacing as a scoring change and sending someone to look for a detector edit that
 * never happened.
 */
export const BEHAVIOUR_CORPUS_HEAD_SHAS: Readonly<Record<string, string>> = Object.freeze({
  'complete-node-service': '479ded2feedcfe9b19432c8e073d4e7100f9a71f',
  'minimal-source-no-process': '55158da785884b3ece82a874e8099fc2154f05bc',
  'committed-secret-and-pem': '36c7ab54ce57d1996d4f53b7e6eb71d434aaa998',
  'placeholder-test-script': '4b7394697e3452e66c512910c03427bc8e6a145c',
  'lint-typecheck-no-tests': 'e470b2c6ad50aa6ccd9dab3ab89d6aadd9f080b2',
  'pr-template-directory-form': '288797b56a43e532e178692e0acc17876448033e',
  'python-service': '2a1715dcd9e3d05123af76901e496806b7e511ea',
  'docs-only-repository': '76ccaa1bf82f29ac5d83ff5871991a1e13257dc2',
  'oversized-withheld-source': 'b14ddbf323797e1132eec0ac0c139eec7ba0e5fa',
  'privileged-migrations': '78b6c2959a108a5ac6550fc7c41c47d8220dd77f',
  'direct-http-entrypoint-no-health': 'df7defc0be8b18d5cd4e67f31e0b2b037c7f1747',
  'start-declared-http-entrypoint': 'be28e80ec078cb060f71f179003580b53fc393f3',
  'stale-audit-trail': 'a230b07e26ca88245bee21a13bc68c8935897d98',
  'real-credential-in-docs': 'd7eef4fd2f815f56a01325683f4cc63cdcb4e79d',
  'control-described-not-built': 'fdfd0e13868a4220e216cc657c250d4ef238da6e',
  'inline-health-route-and-prettier-handler': 'f884b252dc78d8b5d82baa2a939c50fea6893941',
  'ava-live-assertions': 'ccc905405ee8f63b0b287e0b275eebeb488a3e6d',
  'public-digest-lookup': '5515c03624cb9d7e0ccf2ede8b4a6710f219b3a7',
  'workspace-package-scripts': 'eb763f23df607357fa7548de2176668f2c41028b',
  'coverage-config-setup-cfg': 'd841dafc8516cdd992452c70ca53cd4a40cfcc14',
  'coverage-config-maven-jacoco': 'c20014d3fadc4ac6b96a0a9178bd311c64f83a89',
  'coverage-command-go-ci': '882274b74b5e5ce1bec2a096a023dadb4a36aae4',
  'xunit-assertions': 'e51a5a5f9889cd9c51c76573eba4605ca4a1d331',
  'nunit-ignored-fixture': '0f132f45df4dc690faa31e2cf2d0623cb799d1bc',
  'xctest-assertions': 'e4e1b8588b06138db564f24afea9a02b95a0bcaf',
  'scalatest-assertions': '5dae8bbb750b957cc9de542982d630e7250e27a5',
  'kotest-matchers': '8f4e6c3402b30e7b377f18e330ef66ebb32ba472',
  'tape-assertions': '347020854b8d0c69f33539345c665d8bd6c09a5f',
});

/**
 * Materialise a fixture into a fresh temp directory and commit it. Commits are unsigned and take
 * their identity and dates from HERMETIC_GIT_ENV, so the resulting sha is machine-independent.
 */
export function buildBehaviourFixture(fixture: BehaviourFixture): string {
  const dir = mkdtempSync(join(tmpdir(), `cejel-behaviour-${fixture.name}-`));
  const env = fixture.commitDate
    ? {
        ...HERMETIC_GIT_ENV,
        GIT_AUTHOR_DATE: fixture.commitDate,
        GIT_COMMITTER_DATE: fixture.commitDate,
      }
    : HERMETIC_GIT_ENV;
  git(dir, ['init', '--quiet', '--initial-branch=main'], env);
  for (const [relativePath, contents] of Object.entries(fixture.files)) {
    const fullPath = join(dir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  git(dir, ['add', '-A'], env);
  git(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', 'initial commit'], env);
  return dir;
}

export function fixtureHeadSha(dir: string): string {
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

function git(dir: string, args: readonly string[], env = HERMETIC_GIT_ENV): string {
  return execFileSync('git', [...args], { cwd: dir, env, encoding: 'utf8' });
}
