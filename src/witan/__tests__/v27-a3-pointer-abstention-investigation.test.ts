import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import {
  type FalseAssuranceFixture,
  buildFalseAssuranceFixture,
  lfsPointerFor,
} from './fixtures/false-assurance-fixtures.js';

// v27 A3 Git LFS pointer abstention: investigation only (2026-11-20; refs #519 #749). No file under
// src/ outside __tests__/ changes, so no report under any rubric moves. These synthetic repositories
// (written from scratch, none derived from a real repository) reproduce the item B tables in
// docs/v27-a3-pointer-abstention-investigation-2026-11-20.md. Run in dump mode to print them:
//   V27_A3_POINTER_DUMP=/tmp/a3-dump.txt pnpm vitest run src/witan/__tests__/v27-a3-pointer-abstention-investigation.test.ts
// The always-on assertions pin what the report states: under v27 A3 abstains on every fixture whose
// pointer A3 read and cites only the pointer, and v27 is never above v17 on A3 or the composite.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const LFS_ATTRIBUTES = '*.png filter=lfs diff=lfs merge=lfs -text\n';

const CI_WORKFLOW =
  'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n';

const STRONG_DOCKERFILE = [
  'FROM node:20-slim',
  'WORKDIR /app',
  'COPY . .',
  'RUN npm ci --omit=dev',
  'USER node',
  'HEALTHCHECK --interval=30s CMD node healthcheck.js',
  'EXPOSE 3000',
  'CMD ["node", "server.js"]',
  '',
].join('\n');

const WEAK_DOCKERFILE = ['FROM node:20-slim', 'WORKDIR /app', 'COPY . .', 'RUN npm ci --omit=dev', 'EXPOSE 3000', 'CMD ["npm", "start"]', ''].join('\n');

const STRONG_COMPOSE = [
  'services:',
  '  web:',
  '    build: .',
  '    restart: unless-stopped',
  '    ports:',
  '      - "3000:3000"',
  '    volumes:',
  '      - data:/app/data',
  '    healthcheck:',
  '      test: ["CMD", "node", "healthcheck.js"]',
  '      interval: 30s',
  '  db:',
  '    image: postgres:16',
  '    restart: always',
  '    volumes:',
  '      - pgdata:/var/lib/postgresql/data',
  '    healthcheck:',
  '      test: ["CMD", "pg_isready"]',
  '      interval: 10s',
  'volumes:',
  '  data: {}',
  '  pgdata: {}',
  '',
].join('\n');

const SERVER =
  "const express = require('express');\nconst health = require('./src/routes/health');\nconst app = express();\nhealth(app);\napp.get('/', (req, res) => res.send('ok'));\napp.listen(process.env.PORT || 3000);\n";

// A service with every A3 production-readiness primitive v17 reads: a build script, CI, a
// Dockerfile (non-root USER, HEALTHCHECK) and a compose file (healthchecks, named volumes, restart
// policies), an env template, a health route file, an error boundary, a structured logger and a
// rollback note.
const STRONG_SERVICE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { build: 'tsc -p .', start: 'node server.js', test: 'node --test' }, dependencies: { express: '4.19.2', pino: '9.0.0' } }, null, 2)}\n`,
  'README.md': '# svc\n',
  LICENSE: 'MIT\n',
  'server.js': SERVER,
  'healthcheck.js': "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1));\n",
  'src/routes/health.js': "module.exports = (app) => app.get('/health', (req, res) => res.json({ status: 'ok' }));\n",
  'src/middleware/error.js':
    "module.exports = function errorHandler(err, req, res, next) {\n  res.status(500).json({ error: 'internal' });\n};\n",
  'src/logger.js': "const pino = require('pino');\nmodule.exports = pino();\n",
  'docs/operations.md': '# Operations\n\nTo roll back, redeploy the previous image tag. Every migration is reversible.\n',
  '.env.example': 'PORT=3000\nDATABASE_URL=\n',
  '.github/workflows/ci.yml': CI_WORKFLOW,
  Dockerfile: STRONG_DOCKERFILE,
  'docker-compose.yml': STRONG_COMPOSE,
  'test/server.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\n\ntest('ok', () => {\n  assert.strictEqual(1, 1);\n});\n",
};

// A service whose Dockerfile has neither a non-root USER nor a HEALTHCHECK, and nothing else A3
// credits beyond the Dockerfile, the server and CI.
const WEAK_SERVICE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '4.19.2' } }, null, 2)}\n`,
  'README.md': '# svc\n',
  LICENSE: 'MIT\n',
  'server.js': "const express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('ok'));\napp.listen(process.env.PORT || 3000);\n",
  '.github/workflows/ci.yml': CI_WORKFLOW,
  Dockerfile: WEAK_DOCKERFILE,
  'test/server.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\n\ntest('ok', () => {\n  assert.strictEqual(1, 1);\n});\n",
};

const DIAGRAM_POINTER = lfsPointerFor('PNG architecture diagram bytes');

export const A3_POINTER_FIXTURES: readonly FalseAssuranceFixture[] = [
  {
    name: 'a3-strong-control',
    issue: '#519',
    purpose: 'B1 control: the strong service with no Git LFS pointer.',
    commits: [STRONG_SERVICE],
  },
  {
    name: 'a3-strong-docs-image-pointer',
    issue: '#519',
    purpose: 'B1: the strong service with a Git LFS pointer at docs/architecture.png, which the rollback_safety_depth scan reads (every file under docs/).',
    commits: [{ ...STRONG_SERVICE, '.gitattributes': LFS_ATTRIBUTES, 'docs/architecture.png': DIAGRAM_POINTER }],
  },
  {
    name: 'a3-weak-control',
    issue: '#519',
    purpose: 'B2 control: the weak service with no Git LFS pointer.',
    commits: [WEAK_SERVICE],
  },
  {
    name: 'a3-weak-docs-image-pointer',
    issue: '#519',
    purpose: 'B2: the weak service with the same pointer at docs/architecture.png.',
    commits: [{ ...WEAK_SERVICE, '.gitattributes': LFS_ATTRIBUTES, 'docs/architecture.png': DIAGRAM_POINTER }],
  },
  {
    name: 'a3-strong-compose-pointer',
    issue: '#519',
    purpose: 'B3: the strong service with docker-compose.yml committed as a Git LFS pointer.',
    commits: [
      {
        ...STRONG_SERVICE,
        '.gitattributes': 'docker-compose.yml filter=lfs diff=lfs merge=lfs -text\n',
        'docker-compose.yml': lfsPointerFor(STRONG_COMPOSE),
      },
    ],
  },
  {
    name: 'a3-strong-dockerfile-pointer',
    issue: '#519',
    purpose: 'B3: the strong service with its Dockerfile committed as a Git LFS pointer (the HEALTHCHECK is behind it).',
    commits: [
      {
        ...STRONG_SERVICE,
        '.gitattributes': 'Dockerfile filter=lfs diff=lfs merge=lfs -text\n',
        Dockerfile: lfsPointerFor(STRONG_DOCKERFILE),
      },
    ],
  },
  {
    name: 'a3-strong-health-route-pointer',
    issue: '#519',
    purpose:
      'B3: the strong service with its Dockerfile HEALTHCHECK and healthcheck.js removed, and src/routes/health.js, the only remaining health signal, committed as a Git LFS pointer.',
    commits: [
      {
        ...STRONG_SERVICE,
        'healthcheck.js': null,
        Dockerfile: STRONG_DOCKERFILE.replace(/^HEALTHCHECK.*\n/m, ''),
        '.gitattributes': 'src/routes/health.js filter=lfs diff=lfs merge=lfs -text\n',
        'src/routes/health.js': lfsPointerFor(STRONG_SERVICE['src/routes/health.js'] ?? ''),
      },
    ],
  },
  {
    name: 'a3-strong-health-route-control',
    issue: '#519',
    purpose: 'B3 control: the same repository with src/routes/health.js committed as content.',
    commits: [{ ...STRONG_SERVICE, 'healthcheck.js': null, Dockerfile: STRONG_DOCKERFILE.replace(/^HEALTHCHECK.*\n/m, '') }],
  },
  {
    name: 'a3-strong-web-image-pointer',
    issue: '#519',
    purpose: 'B4: the strong service with a Git LFS pointer at public/images/logo.png, a web directory no A3 read selects.',
    commits: [{ ...STRONG_SERVICE, '.gitattributes': LFS_ATTRIBUTES, 'public/images/logo.png': lfsPointerFor('PNG logo bytes') }],
  },
  {
    name: 'a3-strong-helm-icon-pointer',
    issue: '#519',
    purpose: 'B4: the strong service with a Git LFS pointer at helm/svc/icon.png, which the health-check reader reads (every file under helm/, k8s/ or kubernetes/) for a probe.',
    commits: [
      {
        ...STRONG_SERVICE,
        '.gitattributes': LFS_ATTRIBUTES,
        'helm/svc/Chart.yaml': 'apiVersion: v2\nname: svc\nversion: 1.0.0\nicon: file://icon.png\n',
        'helm/svc/icon.png': lfsPointerFor('PNG chart icon bytes'),
      },
    ],
  },
  {
    name: 'a3-library-entrypoint-pointer',
    issue: '#519',
    purpose: 'Item C: no path-only deploy surface, and server.js, the file the applicability gate reads for a port binding, committed as a Git LFS pointer.',
    commits: [
      {
        'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { test: 'node --test' } }, null, 2)}\n`,
        'README.md': '# svc\n',
        LICENSE: 'MIT\n',
        '.github/workflows/ci.yml': CI_WORKFLOW,
        '.gitattributes': 'server.js filter=lfs diff=lfs merge=lfs -text\n',
        'server.js': lfsPointerFor(SERVER),
        'test/server.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\n\ntest('ok', () => {\n  assert.strictEqual(1, 1);\n});\n",
      },
    ],
  },
  {
    name: 'a3-library-entrypoint-control',
    issue: '#519',
    purpose: 'Item C control: the same repository with server.js committed as content.',
    commits: [
      {
        'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { test: 'node --test' } }, null, 2)}\n`,
        'README.md': '# svc\n',
        LICENSE: 'MIT\n',
        '.github/workflows/ci.yml': CI_WORKFLOW,
        'server.js': SERVER,
        'test/server.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\n\ntest('ok', () => {\n  assert.strictEqual(1, 1);\n});\n",
      },
    ],
  },
];

/** The fixtures whose pointer an A3 read reaches, so v27's A3 abstains on them. */
const A3_READS_POINTER = [
  'a3-strong-docs-image-pointer',
  'a3-weak-docs-image-pointer',
  'a3-strong-compose-pointer',
  'a3-strong-dockerfile-pointer',
  'a3-strong-health-route-pointer',
  'a3-strong-helm-icon-pointer',
  'a3-library-entrypoint-pointer',
] as const;

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = A3_POINTER_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'a3-pointer-fixture',
    productDisplayName: 'A3 pointer fixture',
    generatedAt: '2026-11-20T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function a3(name: string, rubricVersion: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === 'A3');
  if (!found) throw new Error(`${name}@${rubricVersion} has no A3`);
  return found;
}

describe('v27 A3 Git LFS pointer abstention investigation (refs #519 #749)', () => {
  it.each(A3_READS_POINTER)('%s: v27 A3 abstains and cites only the pointer; v17 scores what it read', (name) => {
    const v27 = a3(name, V27);
    expect(v27.status).toBe('insufficient_data');
    expect(v27.score).toBe(0);
    expect(v27.metrics).toEqual([]);
    expect(v27.findings).toEqual([]);
    expect(v27.evidence.length).toBeGreaterThan(0);
    expect(v27.evidence.every(({ label }) => /Git LFS pointer/.test(label))).toBe(true);
    expect(report(name, V27).contentReadSummary?.affectedCriteria).toContain('A3');
    expect(a3(name, V17).status).not.toBe('insufficient_data');
  });

  it('a pointer no A3 read selects leaves A3 as under v17', () => {
    const v17 = a3('a3-strong-web-image-pointer', V17);
    const v27 = a3('a3-strong-web-image-pointer', V27);
    expect({ score: v27.score, status: v27.status, metrics: v27.metrics, findings: v27.findings }).toEqual({
      score: v17.score,
      status: v17.status,
      metrics: v17.metrics,
      findings: v17.findings,
    });
  });

  it('v17 with a pointer never scores A3 above its content-complete control', () => {
    for (const [pointer, control] of [
      ['a3-strong-docs-image-pointer', 'a3-strong-control'],
      ['a3-weak-docs-image-pointer', 'a3-weak-control'],
      ['a3-strong-compose-pointer', 'a3-strong-control'],
      ['a3-strong-dockerfile-pointer', 'a3-strong-control'],
      ['a3-strong-health-route-pointer', 'a3-strong-health-route-control'],
      ['a3-strong-helm-icon-pointer', 'a3-strong-control'],
    ] as const) {
      expect(a3(pointer, V17).score, pointer).toBeLessThanOrEqual(a3(control, V17).score);
    }
  });

  it('a pointer at the file the applicability gate reads turns a scored service into v17 not-applicable', () => {
    expect(a3('a3-library-entrypoint-pointer', V17).status).toBe('not_applicable');
    expect(a3('a3-library-entrypoint-control', V17).status).not.toBe('not_applicable');
    expect(a3('a3-library-entrypoint-control', V17).score).toBeGreaterThan(0);
  });

  it.each(A3_POINTER_FIXTURES.map(({ name }) => name))('%s: v27 is not above v17 on A3 or the composite', (name) => {
    expect(a3(name, V27).score).toBeLessThanOrEqual(a3(name, V17).score);
    const v17Overall = report(name, V17).overallScore;
    const v27Overall = report(name, V27).overallScore;
    if (v17Overall !== null && v27Overall !== null) expect(v27Overall).toBeLessThanOrEqual(v17Overall);
  });

  it.runIf(process.env.V27_A3_POINTER_DUMP !== undefined)('dumps A3 under v17 and v27', () => {
    const out: string[] = [];
    for (const { name, purpose } of A3_POINTER_FIXTURES) {
      out.push(`## ${name}`, `purpose: ${purpose}`);
      for (const rubricVersion of [V17, V27]) {
        const r = report(name, rubricVersion);
        const c = a3(name, rubricVersion);
        const tag = rubricVersion === V17 ? 'v17' : 'v27';
        out.push(`${tag}: overall ${r.overallScore} verdict ${r.verdict}; A3 ${c.score} ${c.status}`);
        for (const m of c.metrics) {
          const components = (m.presentation?.components ?? []).map(({ label, count }) => `${label}=${count}`).join(', ');
          out.push(`  metric ${m.name}=${m.value}${components ? ` [${components}]` : ''}`);
        }
        for (const f of c.findings) out.push(`  finding ${f.severity}: ${f.summary}`);
        for (const e of c.evidence) out.push(`  evidence ${e.path}:${e.line ?? '-'} ${e.label}`);
        for (const d of c.disclosures ?? []) out.push(`  disclosure ${d}`);
        out.push(`  notes ${c.notes ?? '-'}`);
        out.push(`  affectedCriteria ${(r.contentReadSummary?.affectedCriteria ?? []).join(',') || '-'}; lfsPointer ${r.contentReadSummary?.byReason.lfsPointer ?? 0}`);
        for (const s of r.scanLimitations ?? []) if (/abstained/.test(s)) out.push(`  scanLimitation ${s}`);
      }
      out.push('');
    }
    writeFileSync(process.env.V27_A3_POINTER_DUMP ?? '', `${out.join('\n')}\n`);
  });
});
