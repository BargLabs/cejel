import { type FalseAssuranceFixture, lfsPointerFor } from './false-assurance-fixtures.js';

// Synthetic repositories for v27 A3's Git LFS pointer abstention (refs #519 #753). Written from
// scratch; none is derived from a real repository. A3_POINTER_FIXTURES are #753's investigation
// fixtures, moved here unchanged from v27-a3-pointer-abstention-investigation.test.ts so that the
// below-maximum rule's tests (v27-a3-pointer-below-maximum.test.ts) and the floor guard
// (v27-a3-pointer-floor-guard.test.ts) can build the same repositories without importing a test file.

export const LFS_ATTRIBUTES = '*.png filter=lfs diff=lfs merge=lfs -text\n';

export const CI_WORKFLOW =
  'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n';

export const STRONG_DOCKERFILE = [
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

export const WEAK_DOCKERFILE = ['FROM node:20-slim', 'WORKDIR /app', 'COPY . .', 'RUN npm ci --omit=dev', 'EXPOSE 3000', 'CMD ["npm", "start"]', ''].join('\n');

export const STRONG_COMPOSE = [
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

export const SERVER =
  "const express = require('express');\nconst health = require('./src/routes/health');\nconst app = express();\nhealth(app);\napp.get('/', (req, res) => res.send('ok'));\napp.listen(process.env.PORT || 3000);\n";

const NODE_TEST =
  "const test = require('node:test');\nconst assert = require('node:assert');\n\ntest('ok', () => {\n  assert.strictEqual(1, 1);\n});\n";

// A service with every A3 production-readiness primitive v17 reads: a build script, CI, a
// Dockerfile (non-root USER, HEALTHCHECK) and a compose file (healthchecks, named volumes, restart
// policies), an env template, a health route file, an error boundary, a structured logger and a
// rollback note.
export const STRONG_SERVICE: Readonly<Record<string, string>> = {
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
  'test/server.test.js': NODE_TEST,
};

// A service whose Dockerfile has neither a non-root USER nor a HEALTHCHECK, and nothing else A3
// credits beyond the Dockerfile, the server and CI.
export const WEAK_SERVICE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '4.19.2' } }, null, 2)}\n`,
  'README.md': '# svc\n',
  LICENSE: 'MIT\n',
  'server.js': "const express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('ok'));\napp.listen(process.env.PORT || 3000);\n",
  '.github/workflows/ci.yml': CI_WORKFLOW,
  Dockerfile: WEAK_DOCKERFILE,
  'test/server.test.js': NODE_TEST,
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
        'test/server.test.js': NODE_TEST,
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
        'test/server.test.js': NODE_TEST,
      },
    ],
  },
];

// ------------------------------------------------------------------------------------------------
// v27 A3 below-maximum rule (2026-11-20, operator ruling on #753).
// ------------------------------------------------------------------------------------------------

/** Four rollback notes under docs/: rollback_safety_depth at its maximum of 4. */
const ROLLBACK_AT_MAXIMUM: Readonly<Record<string, string>> = {
  'docs/rollback.md': '# Rollback\n\nRoll back by redeploying the previous release.\n',
  'docs/migrations.md': '# Migrations\n\nEvery migration ships with a down migration.\n',
  'docs/runbook.md': '# Runbook\n\nIf a deploy fails, roll back first and investigate after.\n',
};

const HELM_CHART: Readonly<Record<string, string>> = {
  '.gitattributes': LFS_ATTRIBUTES,
  'helm/svc/Chart.yaml': 'apiVersion: v2\nname: svc\nversion: 1.0.0\nicon: file://icon.png\n',
  'helm/svc/icon.png': lfsPointerFor('PNG chart icon bytes'),
};

/**
 * The strong service with rollback notes at 4 of 4 and a Git LFS pointer at docs/architecture.png:
 * v27 keeps v17's A3 with the at-maximum disclosure. Also #612's part-3 fixture for that producer.
 */
export const A3_ROLLBACK_AT_MAXIMUM_POINTER_FILES: Readonly<Record<string, string>> = {
  ...STRONG_SERVICE,
  ...ROLLBACK_AT_MAXIMUM,
  '.gitattributes': LFS_ATTRIBUTES,
  'docs/architecture.png': DIAGRAM_POINTER,
};

/** The strong service without its env template: production-readiness checks at 5 of 6. */
const FIVE_OF_SIX_SERVICE: Readonly<Record<string, string | null>> = { ...STRONG_SERVICE, '.env.example': null };

export const A3_BELOW_MAXIMUM_FIXTURES: readonly FalseAssuranceFixture[] = [
  {
    name: 'a3-rollback-at-maximum-control',
    issue: '#519',
    purpose: 'The strong service with four rollback notes under docs/ (rollback_safety_depth 4 of 4) and no Git LFS pointer.',
    commits: [{ ...STRONG_SERVICE, ...ROLLBACK_AT_MAXIMUM }],
  },
  {
    name: 'a3-rollback-at-maximum-docs-image-pointer',
    issue: '#519',
    purpose:
      'The same with a Git LFS pointer at docs/architecture.png: only the rollback-note scan reads it, and that count is already at its maximum, so v27 keeps v17\'s A3.',
    commits: [A3_ROLLBACK_AT_MAXIMUM_POINTER_FILES],
  },
  {
    name: 'a3-five-of-six-control',
    issue: '#519',
    purpose: 'The strong service without .env.example (production-readiness checks 5 of 6), with a helm chart and its icon committed as content.',
    commits: [{ ...FIVE_OF_SIX_SERVICE, 'helm/svc/Chart.yaml': HELM_CHART['helm/svc/Chart.yaml'] ?? '', 'helm/svc/icon.png': 'PNG chart icon bytes\n' }],
  },
  {
    name: 'a3-five-of-six-helm-icon-pointer',
    issue: '#519',
    purpose:
      'The same with helm/svc/icon.png a Git LFS pointer, read by the health-check component while production-readiness checks are at 5 of 6, so v27 abstains.',
    commits: [{ ...FIVE_OF_SIX_SERVICE, ...HELM_CHART }],
  },
];

// ------------------------------------------------------------------------------------------------
// The floor guard's pairs (item B): one control and one pointer reading per A3 content read #753
// item C lists, the pointer at the file that read reads.
// ------------------------------------------------------------------------------------------------

const LIBRARY_PACKAGE = `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'src/index.js', scripts: { start: 'node src/index.js', test: 'node --test' } }, null, 2)}\n`;

const LIBRARY_BASE: Readonly<Record<string, string>> = {
  'package.json': LIBRARY_PACKAGE,
  'README.md': '# svc\n',
  LICENSE: 'MIT\n',
  'src/index.js': 'module.exports = { add: (a, b) => a + b };\n',
  '.github/workflows/ci.yml': CI_WORKFLOW,
  'test/index.test.js': NODE_TEST,
};

const DEPLOY_WORKFLOW =
  'name: deploy\non:\n  push:\n    branches: [main]\njobs:\n  ship:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: flyctl auth docker\n      - run: fly deploy --remote-only\n';

const RUNTIME_DOCKERFILE = ['FROM node:20-slim', 'WORKDIR /app', 'COPY . .', 'CMD ["npm", "start"]', ''].join('\n');

const K8S_DEPLOYMENT = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: svc',
  'spec:',
  '  template:',
  '    spec:',
  '      containers:',
  '        - name: svc',
  '          image: svc:1.0.0',
  '          readinessProbe:',
  '            httpGet:',
  '              path: /health',
  '              port: 3000',
  '',
].join('\n');

/** The strong service with every health signal removed: no HEALTHCHECK, no healthcheck.js, no health route. */
const NO_HEALTH_SERVICE: Readonly<Record<string, string | null>> = {
  ...STRONG_SERVICE,
  'healthcheck.js': null,
  'src/routes/health.js': null,
  'server.js': SERVER.replace("const health = require('./src/routes/health');\n", '').replace('health(app);\n', ''),
  Dockerfile: STRONG_DOCKERFILE.replace(/^HEALTHCHECK.*\n/m, ''),
};

/** The strong service whose error middleware is named so the filename check does not credit it. */
const CONTENT_ERROR_BOUNDARY_SERVICE: Readonly<Record<string, string | null>> = {
  ...STRONG_SERVICE,
  'src/middleware/error.js': null,
  'src/middleware/handlers.js': STRONG_SERVICE['src/middleware/error.js'] ?? '',
};

function pointerAt(files: Readonly<Record<string, string | null>>, path: string): Record<string, string | null> {
  return {
    ...files,
    '.gitattributes': `${path} filter=lfs diff=lfs merge=lfs -text\n`,
    [path]: lfsPointerFor(files[path] ?? path),
  };
}

export interface A3FloorPair {
  /** The read, as named in A3_CONTENT_READS (v27-a3-pointer-floor-guard.test.ts). */
  readonly read: string;
  readonly control: FalseAssuranceFixture;
  readonly pointer: FalseAssuranceFixture;
}

function pair(read: string, path: string, files: Readonly<Record<string, string | null>>): A3FloorPair {
  const slug = read.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return {
    read,
    control: { name: `a3-floor-${slug}-control`, issue: '#519', purpose: `Floor guard control for ${read}.`, commits: [files] },
    pointer: {
      name: `a3-floor-${slug}-pointer`,
      issue: '#519',
      purpose: `Floor guard: ${path}, which ${read} reads, committed as a Git LFS pointer.`,
      commits: [pointerAt(files, path)],
    },
  };
}

export const A3_FLOOR_PAIRS: readonly A3FloorPair[] = [
  pair('gate: CI workflow deploy job', '.github/workflows/deploy.yml', { ...LIBRARY_BASE, '.github/workflows/deploy.yml': DEPLOY_WORKFLOW }),
  pair('gate: server entrypoint port binding', 'server.js', {
    ...LIBRARY_BASE,
    'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { test: 'node --test' } }, null, 2)}\n`,
    'server.js': SERVER,
  }),
  pair('gate: Dockerfile runtime command', 'Dockerfile', { ...LIBRARY_BASE, Dockerfile: RUNTIME_DOCKERFILE }),
  pair('prod_readiness_primitives: build or type-check script', 'package.json', STRONG_SERVICE),
  pair('prod_readiness_primitives: Dockerfile HEALTHCHECK', 'Dockerfile', {
    ...NO_HEALTH_SERVICE,
    Dockerfile: STRONG_DOCKERFILE,
  }),
  pair('prod_readiness_primitives: k8s probe', 'k8s/deployment.yaml', { ...NO_HEALTH_SERVICE, 'k8s/deployment.yaml': K8S_DEPLOYMENT }),
  pair('prod_readiness_primitives: health signal file', 'src/routes/health.js', {
    ...STRONG_SERVICE,
    'healthcheck.js': null,
    Dockerfile: STRONG_DOCKERFILE.replace(/^HEALTHCHECK.*\n/m, ''),
  }),
  pair('prod_readiness_primitives: error middleware content', 'src/middleware/handlers.js', CONTENT_ERROR_BOUNDARY_SERVICE),
  pair('observability_depth', 'src/logger.js', STRONG_SERVICE),
  pair('rollback_safety_depth', 'docs/operations.md', STRONG_SERVICE),
  pair('evidence: citation line', 'docker-compose.yml', STRONG_SERVICE),
  pair('runtime container read', 'Dockerfile', STRONG_SERVICE),
];
