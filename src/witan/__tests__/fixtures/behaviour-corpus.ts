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
