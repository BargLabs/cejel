import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { MAX_REPOSITORY_CONTENT_BYTES } from '../../filesystem-limits.js';

/**
 * THE BEHAVIOUR-FINGERPRINT CORPUS — synthetic, invented here, published by construction.
 *
 * Every byte below was written for this file. Nothing derives from a counterparty, a customer,
 * or any real repository: `cejel` is a public repository, so committing a fixture IS publishing
 * it, and the IP boundary in CLAUDE.md permits publishing the exam and never the answer key.
 * These fixtures are exam material — repository shapes a reader can reproduce.
 *
 * The corpus exists to make scoring behaviour MEASURABLE rather than DECLARED. See
 * `../behaviour-fingerprint.ts` for the digest derived from it and
 * `./rubric-behaviour-fingerprint.test.ts` for the guard.
 *
 * Secret-shaped strings below exist so A2's secret grammar has something to match. None is, or
 * has ever been, a live credential. Most say so in their own value
 * (`sk_live_synthetic_fixture_not_a_credential`); the PEM block in `j-pem-signing-library`
 * deliberately does NOT, because A2 correctly refuses to treat a key that announces itself as a
 * fixture as evidence of anything — see the comment at that fixture.
 */

/** A fixture repository: a file tree plus the commit date its single commit carries. */
export interface BehaviourFixture {
  readonly name: string;
  /** One line, printed in the guard's failure output so a reader knows what moved. */
  readonly intent: string;
  /** Criteria this fixture is built to exercise with a measured (non-N/A) result. */
  readonly exercises: readonly string[];
  /**
   * Committer date for the fixture's single commit. Deliberately NOT equal to the harness
   * `generatedAt` year on every fixture: `witan-rubric-v19`+ derives B4 audit freshness from the
   * scanned HEAD commit's committer year instead of the scan clock, and a corpus where those two
   * always agree cannot see that change.
   */
  readonly commitDate: string;
  /**
   * The commit sha materialising this fixture must produce. Asserted BEFORE any score is read,
   * so a git or filesystem difference fails as "this fixture is not reproducible here" rather
   * than being misread as a scoring change.
   */
  readonly headSha: string;
  readonly files: Readonly<Record<string, string>>;
}

const VITEST_TEST_FILE =
  "import { expect, it } from 'vitest';\n\nit('adds', () => {\n  expect(1 + 1).toBe(2);\n});\n";

const OVERSIZED = 'x'.repeat(MAX_REPOSITORY_CONTENT_BYTES + 1);

/**
 * An obviously-synthetic PEM private-key value, wrapped at 64 columns the way an exported
 * service-account JSON wraps one. The body is base64 of a repeated English sentence, never key
 * material — its only job is to be long enough for A2's v23 PEM grammar to treat it as a key
 * rather than a placeholder. Built the same way `pem-private-key-v23.test.ts` builds its own.
 */
const SYNTHETIC_PEM_VALUE = ((): string => {
  const raw = Array.from(
    { length: 24 },
    (_, index) => `cejel-behaviour-corpus-synthetic-pem-not-a-key-${index}`,
  ).join('|');
  const body = Buffer.from(raw, 'utf8').toString('base64');
  const wrapped: string[] = [];
  for (let index = 0; index < body.length; index += 64) {
    wrapped.push(body.slice(index, index + 64));
  }
  return `-----BEGIN PRIVATE KEY-----\n${wrapped.join('\n')}\n-----END PRIVATE KEY-----\n`;
})();

export const BEHAVIOUR_FIXTURES: readonly BehaviourFixture[] = [
  {
    name: 'a-instrumented-service',
    intent: 'A JS/TS service with broad positive evidence on every repository-scored criterion.',
    exercises: ['A1', 'A2', 'A3', 'A4', 'A5', 'B2', 'B3', 'B4', 'B6'],
    commitDate: '2026-03-04T09:00:00+00:00',
    headSha: '340ba61521b6840f3c20e90d20ed3888b0edee55',
    files: {
      'package.json': `${JSON.stringify(
        {
          name: 'instrumented-service',
          version: '2.1.0',
          type: 'module',
          scripts: {
            start: 'node src/server.js',
            test: 'vitest run',
            'test:coverage': 'vitest run --coverage',
            lint: 'eslint .',
            typecheck: 'tsc --noEmit',
            build: 'tsc -p tsconfig.json',
          },
          dependencies: { express: '4.19.2', pino: '9.1.0', pg: '8.11.5' },
          devDependencies: { vitest: '2.0.0', eslint: '9.0.0', typescript: '5.5.0' },
        },
        null,
        2,
      )}\n`,
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n",
      'tsconfig.json': `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`,
      'src/server.js': [
        "import express from 'express';",
        "import pino from 'pino';",
        "import { pool } from './db.js';",
        '',
        "const logger = pino({ name: 'instrumented-service' });",
        'const app = express();',
        '',
        "app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));",
        "app.get('/readyz', async (_req, res) => {",
        "  await pool.query('select 1');",
        "  res.status(200).json({ status: 'ready' });",
        '});',
        '',
        'app.use((err, req, res, next) => {',
        "  logger.error({ err, requestId: req.headers['x-request-id'] }, 'unhandled');",
        '  if (res.headersSent) return next(err);',
        "  res.status(500).json({ error: 'internal' });",
        '});',
        '',
        'export default app;',
      ].join('\n'),
      'src/db.js': [
        "import { Pool } from 'pg';",
        '',
        'export const pool = new Pool({ connectionString: process.env.DATABASE_URL });',
      ].join('\n'),
      'src/server.test.js': VITEST_TEST_FILE,
      'src/db.test.js': VITEST_TEST_FILE,
      'migrations/0001_init.sql': [
        'create table orders (id uuid primary key, tenant_id uuid not null);',
        'alter table orders enable row level security;',
        'create policy orders_tenant_isolation on orders',
        '  using (tenant_id = current_setting(\'app.tenant_id\')::uuid)',
        '  with check (tenant_id = current_setting(\'app.tenant_id\')::uuid);',
      ].join('\n'),
      '.env.example': 'DATABASE_URL=\nSESSION_SECRET=\n',
      '.gitignore': '.env\nnode_modules/\n',
      'Dockerfile': 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "src/server.js"]\n',
      '.github/workflows/ci.yml': [
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
        '      - run: pnpm install --frozen-lockfile',
        '      - run: pnpm lint',
        '      - run: pnpm typecheck',
        '      - run: pnpm test',
        '      - run: pnpm build',
      ].join('\n'),
      '.github/workflows/deploy.yml': [
        'name: deploy',
        'on:',
        '  workflow_dispatch:',
        'jobs:',
        '  deploy:',
        '    runs-on: ubuntu-latest',
        '    environment: production',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: ./scripts/deploy.sh',
      ].join('\n'),
      '.github/PULL_REQUEST_TEMPLATE.md': '## What changed\n\n## How it was verified\n',
      '.github/CODEOWNERS': '* @instrumented-service/maintainers\n',
      '.github/dependabot.yml':
        'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: "/"\n    schedule:\n      interval: weekly\n',
      'scripts/deploy.sh': '#!/usr/bin/env bash\nset -euo pipefail\nnpm run build\n',
      'CHANGELOG.md': '# Changelog\n\n## 2.1.0 - 2026-03-04\n\n- Added readiness probe.\n',
      'SECURITY.md': '# Security policy\n\nReport issues to security@example.invalid.\n',
      'docs/runbooks/incident-response.md':
        '# Incident response\n\n1. Page the on-call.\n2. Check `/readyz`.\n',
      'README.md': [
        '# instrumented-service',
        '',
        'An example order service used as a scoring fixture.',
        '',
        '## Verification',
        '',
        'Run `pnpm test` for the unit suite and `pnpm test:coverage` for coverage.',
      ].join('\n'),
    },
  },
  {
    name: 'b-sparse-repo',
    intent: 'A repository with almost no evidence — the abstention and not-applicable surface.',
    exercises: ['A1', 'A3', 'A5'],
    commitDate: '2023-11-20T09:00:00+00:00',
    headSha: '05ad5db45e19c05a9f1c831b635171120c42815d',
    files: {
      'README.md': '# sparse\n\nA small utility.\n',
      'main.go': 'package main\n\nfunc main() {\n\tprintln("hello")\n}\n',
    },
  },
  {
    name: 'c-secret-hazard-store',
    intent:
      'Hardcoded synthetic credentials in authored production paths, a non-constant-time secret comparison, and raw SQL over a table with no row-level security.',
    exercises: ['A2', 'A4'],
    commitDate: '2025-06-12T09:00:00+00:00',
    headSha: 'fa18135161d34eefe8c34f4b16d50c3b621af197',
    files: {
      'package.json': `${JSON.stringify(
        {
          name: 'hazard-store',
          version: '0.1.0',
          scripts: { start: 'node src/index.js' },
          dependencies: { pg: '8.11.5' },
        },
        null,
        2,
      )}\n`,
      'src/index.js': [
        "import { Client } from 'pg';",
        '',
        "const stripeSecretKey = 'sk_live_synthetic_fixture_not_a_credential';",
        "const client = new Client({ connectionString: 'postgres://app:hunter2@db/app' });",
        '',
        'export async function findOrder(id) {',
        '  await client.connect();',
        '  return client.query(`select * from orders where id = ${id}`);',
        '}',
        '',
        'export { stripeSecretKey };',
      ].join('\n'),
      'src/signing.js': [
        "import { createHmac } from 'node:crypto';",
        '',
        'export function sign(payload) {',
        "  return createHmac('sha256', process.env.SIGNING_SECRET).update(payload).digest('hex');",
        '}',
        '',
        'export function verify(signature, expected) {',
        '  return signature === expected;',
        '}',
      ].join('\n'),
      'migrations/0001_orders.sql':
        'create table orders (id uuid primary key, tenant_id uuid not null);\n',
      '.env.example': 'DATABASE_URL=\nSTRIPE_SECRET_KEY=\n',
      'README.md': '# hazard-store\n\nAn order store.\n',
    },
  },
  {
    name: 'd-overclaiming-readme',
    intent:
      'A README asserting verification and production-readiness the tree does not support (A5 claim-vs-reality), an npm placeholder test script, and GitHub\'s DIRECTORY form of the pull-request template (B2) — the shape 0.4.9 changed under an unchanged v17 identifier.',
    exercises: ['A3', 'A5', 'B2'],
    commitDate: '2024-02-08T09:00:00+00:00',
    headSha: 'b4b250c77cf094f27db5aabb24cee17233b74961',
    files: {
      'package.json': `${JSON.stringify(
        {
          name: 'overclaimer',
          version: '1.0.0',
          scripts: { test: 'echo "Error: no test specified" && exit 1' },
        },
        null,
        2,
      )}\n`,
      'src/index.js': 'export function add(a, b) {\n  return a + b;\n}\n',
      'src/handlers.js':
        'export function handle(request) {\n  return { ok: true, path: request.path };\n}\n',
      '.github/PULL_REQUEST_TEMPLATE/feature.md': '# Feature\n\n## Rationale\n',
      'README.md': [
        '# overclaimer',
        '',
        'Production-ready. Fully tested with 100% test coverage and continuous integration on',
        'every commit. Battle-tested at scale with comprehensive monitoring and alerting.',
        '',
        'Security audited. Zero known vulnerabilities.',
      ].join('\n'),
    },
  },
  {
    name: 'e-python-service',
    intent: 'A non-JavaScript repository — the Python detector paths for tests, CI and packaging.',
    exercises: ['A1', 'A3', 'A4', 'B3', 'B4'],
    commitDate: '2025-01-30T09:00:00+00:00',
    headSha: '1b9a4971cfb4e691ae8782eb3f1eb5f972dd0ba3',
    files: {
      'pyproject.toml': [
        '[project]',
        'name = "python-service"',
        'version = "0.3.0"',
        'dependencies = ["fastapi==0.111.0", "psycopg[binary]==3.1.19"]',
        '',
        '[tool.pytest.ini_options]',
        'addopts = "--cov=app --cov-report=term"',
      ].join('\n'),
      'requirements.txt': 'fastapi==0.111.0\npsycopg[binary]==3.1.19\n',
      'app/__init__.py': '',
      'app/main.py': [
        'import logging',
        'import os',
        '',
        'from fastapi import FastAPI',
        '',
        'logger = logging.getLogger(__name__)',
        'app = FastAPI()',
        'DATABASE_URL = os.environ["DATABASE_URL"]',
        '',
        '',
        '@app.get("/health")',
        'def health():',
        '    return {"status": "ok"}',
      ].join('\n'),
      'tests/test_main.py': [
        'from app.main import health',
        '',
        '',
        'def test_health():',
        '    assert health() == {"status": "ok"}',
      ].join('\n'),
      '.github/workflows/ci.yml': [
        'name: ci',
        'on: [push, pull_request]',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: pip install -r requirements.txt',
        '      - run: pytest --cov=app',
      ].join('\n'),
      'CHANGELOG.md': '# Changelog\n\n## 0.3.0 - 2025-01-30\n\n- Health endpoint.\n',
      'docs/runbooks/oncall.md': '# On-call\n\nRestart the service with `systemctl restart app`.\n',
      'README.md': '# python-service\n\nRun `pytest` to verify.\n',
    },
  },
  {
    name: 'f-privileged-migrations',
    intent:
      'Administrative SQL in authored migrations and a shell escalation path — B6 privileged-operation gating, plus B4 audit artifacts with a stale year.',
    exercises: ['B4', 'B6', 'A2'],
    commitDate: '2024-09-17T09:00:00+00:00',
    headSha: '851ae7dd42ebd46ba651ec76b85ba1b86c508956',
    files: {
      'package.json': `${JSON.stringify(
        {
          name: 'privileged-migrations',
          version: '0.2.0',
          scripts: { migrate: 'node src/admin.js', test: 'node --test' },
        },
        null,
        2,
      )}\n`,
      'src/admin.js': [
        "import { Client } from 'pg';",
        '',
        'const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });',
        '',
        'export async function grantAppRole() {',
        '  await client.connect();',
        "  await client.query('grant app_role to reporting_user');",
        "  await client.query('alter role app_role with superuser');",
        '}',
      ].join('\n'),
      'scripts/bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'sudo systemctl stop app',
        'sudo -u postgres psql -c "alter role app_role with login"',
        'sudo systemctl start app',
      ].join('\n'),
      'migrations/0001_roles.sql': [
        'create role app_role nologin;',
        'alter role app_role with login;',
        'grant usage on schema public to app_role;',
      ].join('\n'),
      'migrations/0002_policies.sql': [
        'alter table ledger enable row level security;',
        'create policy ledger_read on ledger for select using (true);',
      ].join('\n'),
      'src/index.js': 'export const name = "privileged-migrations";\n',
      'src/index.test.js':
        "import { test } from 'node:test';\nimport assert from 'node:assert';\n\ntest('name', () => assert.ok(true));\n",
      '.gitignore': '.env\n',
      'AUDIT.md': '# Audit log\n\n## 2024-09-17\n\n- Reviewed role grants.\n',
      'CHANGELOG.md': '# Changelog\n\n## 0.2.0 - 2024-09-17\n\n- Role migrations.\n',
      'SECURITY.md': '# Security\n\nsecurity@example.invalid\n',
      'README.md': '# privileged-migrations\n\nRun `npm run migrate`.\n',
    },
  },
  {
    name: 'g-withheld-oversized-evidence',
    intent:
      'A repository whose only evidence for several signals sits in a file the walk withholds for size — the v23 per-signal abstention and withheld-path abstention surface.',
    exercises: ['A1', 'A3', 'A5', 'B3'],
    commitDate: '2026-07-02T09:00:00+00:00',
    headSha: 'b65bac8194bb3e9b0d9db518898ed4fa3bca906e',
    files: {
      'package.json': `${JSON.stringify(
        { name: 'withheld-evidence', version: '1.0.0', scripts: { test: 'vitest run' } },
        null,
        2,
      )}\n`,
      'src/index.ts': 'export const value = 1;\n',
      'src/index.test.ts': VITEST_TEST_FILE,
      // Over MAX_REPOSITORY_CONTENT_BYTES: the walk withholds it, so any signal whose
      // file-selection test would have admitted it abstains under v23 instead of reporting
      // a plain absence.
      'src/generated-client.ts': `// generated\nexport const blob = '${OVERSIZED}';\n`,
      'README.md': `# withheld-evidence\n\n${'Documentation. '.repeat(40)}\n`,
      '.github/workflows/ci.yml': `name: ci\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n`,
    },
  },
  {
    name: 'h-direct-http-entrypoint',
    intent:
      'A bare Node HTTP server in a conventionally named entry file, with no deploy config at all — A3 is not applicable below witan-rubric-v20 and applicable from v20 up.',
    exercises: ['A3', 'A1'],
    commitDate: '2025-04-22T09:00:00+00:00',
    headSha: '4e21ece25aa802fe7a3e4f18c34e3e83ca47551e',
    files: {
      'index.js': [
        "import http from 'node:http';",
        '',
        'const PORT = Number(process.env.PORT ?? 8080);',
        '',
        'http.createServer((req, res) => {',
        "  res.writeHead(200, { 'content-type': 'application/json' });",
        '  res.end(JSON.stringify({ path: req.url }));',
        '}).listen(PORT);',
      ].join('\n'),
      'README.md': '# direct-http-entrypoint\n\nA single-file HTTP echo server.\n',
    },
  },
  {
    name: 'i-package-start-gateway',
    intent:
      'A Node HTTP server reachable only through a simple `start` script naming a file no entry-file convention matches — A3 is not applicable below witan-rubric-v22 and applicable from v22 up.',
    exercises: ['A3', 'A1', 'A4'],
    commitDate: '2025-08-14T09:00:00+00:00',
    headSha: 'd2679e998ea5aa7dca556cfb0e123a983b4b811b',
    files: {
      'package.json': `${JSON.stringify(
        {
          name: 'package-start-gateway',
          version: '1.2.0',
          type: 'module',
          scripts: { start: 'node lib/gateway.js', test: 'vitest run' },
          dependencies: {},
          devDependencies: { vitest: '2.0.0' },
        },
        null,
        2,
      )}\n`,
      'lib/gateway.js': [
        "import http from 'node:http';",
        '',
        'const PORT = Number(process.env.PORT ?? 3000);',
        '',
        'http.createServer((_req, res) => {',
        '  res.writeHead(204);',
        '  res.end();',
        '}).listen(PORT);',
      ].join('\n'),
      'lib/gateway.test.js': VITEST_TEST_FILE,
      'README.md': '# package-start-gateway\n\nStart with `npm start`.\n',
    },
  },
  {
    name: 'j-pem-signing-library',
    intent:
      'A library whose only secret-shaped content is a PEM-formatted private-key assignment — A2 is not applicable below witan-rubric-v23 and becomes measurable at v23, where the PEM grammar is a secret grammar in its own right.',
    exercises: ['A2', 'A1'],
    commitDate: '2026-01-19T09:00:00+00:00',
    headSha: 'e0d5cb6e9b143f7b0d92f27c4fe793be1dc38ea4',
    files: {
      'package.json': `${JSON.stringify(
        { name: 'pem-signing-library', version: '0.5.0', scripts: { test: 'vitest run' } },
        null,
        2,
      )}\n`,
      // No "synthetic"/"fixture"/"sample" wording INSIDE this file, deliberately: A2's PEM
      // grammar rejects a key whose surrounding five lines read as dev/self-signed/placeholder
      // material, so a fixture that announced itself would be correctly ignored and would prove
      // nothing. The synthetic provenance is stated here, in the corpus, where a reader reads it.
      'config/service-account.json': `${JSON.stringify(
        {
          type: 'service_account',
          project_id: 'cejel-corpus-j',
          private_key: SYNTHETIC_PEM_VALUE,
          client_email: 'signer@cejel-corpus-j.invalid',
        },
        null,
        2,
      )}\n`,
      'src/sign.js': [
        "import { readFileSync } from 'node:fs';",
        '',
        'export function loadKey() {',
        "  return JSON.parse(readFileSync('config/service-account.json', 'utf8')).private_key;",
        '}',
      ].join('\n'),
      'src/sign.test.js': VITEST_TEST_FILE,
      'README.md': '# pem-signing-library\n\nDetached signatures.\n',
    },
  },
];

const HERMETIC_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Cejel Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@cejel.invalid',
  GIT_COMMITTER_NAME: 'Cejel Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@cejel.invalid',
  TZ: 'UTC',
};

/**
 * Materialise a fixture as a hermetic single-commit git repository in a temp directory.
 *
 * Hermetic for the same reason `v23-declared-scope-byte-stability.test.ts` is: global and system
 * git config masked, identity and dates supplied by environment, the commit unsigned. The caller
 * asserts the resulting commit sha against a pin BEFORE interpreting any score, so environmental
 * drift fails as "fixture not reproducible", never as "scoring changed".
 */
export function materialiseFixture(fixture: BehaviourFixture): string {
  const dir = mkdtempSync(join(tmpdir(), `cejel-behaviour-${fixture.name}-`));
  const env: NodeJS.ProcessEnv = {
    ...HERMETIC_GIT_ENV,
    GIT_AUTHOR_DATE: fixture.commitDate,
    GIT_COMMITTER_DATE: fixture.commitDate,
  };
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir, env });
  for (const [relative, content] of Object.entries(fixture.files)) {
    const absolute = join(dir, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
  }
  execFileSync('git', ['add', '-A'], { cwd: dir, env });
  execFileSync('git', ['commit', '--quiet', '--no-gpg-sign', '-m', 'fixture'], { cwd: dir, env });
  return dir;
}

/** The fixture's HEAD sha, read back with the same hermetic environment. */
export function fixtureHeadSha(dir: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: dir,
    env: HERMETIC_GIT_ENV,
    encoding: 'utf8',
  }).trim();
}
