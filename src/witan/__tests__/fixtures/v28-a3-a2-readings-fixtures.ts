// Synthetic repositories for v28's A3 and A2 readings (goal_cejel_v28_a3_health_readings_and_a2_pem,
// operator rulings 35 and 36, 20 Nov 2026). Every file below is written for these tests; none is
// copied from a real repository. Each fixture is one or more commits; a path whose contents are
// `null` in a later commit is removed in that commit.

import { lfsPointerFor } from './false-assurance-fixtures.js';

export interface V28A3A2Fixture {
  readonly name: string;
  readonly commits: readonly Readonly<Record<string, string | null>>[];
}

const SERVER_JS = "import http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(8080);\n";
const BUILD_JS = "console.log('build');\n";

const RUNTIME_WITH_HEALTHCHECK =
  'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nHEALTHCHECK CMD wget -qO- http://localhost:8080/ || exit 1\nCMD ["npm", "start"]\n';
const RUNTIME_WITHOUT_HEALTHCHECK = 'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nCMD ["npm", "run", "start:worker"]\n';

const TWO_RUNTIME_DOCKERFILES: Readonly<Record<string, string>> = {
  'package.json': '{"scripts":{"start":"node src/server.js","start:worker":"node src/worker.js","build":"node scripts/build.js"}}\n',
  'api/Dockerfile': RUNTIME_WITH_HEALTHCHECK,
  'worker/Dockerfile': RUNTIME_WITHOUT_HEALTHCHECK,
  'src/server.js': SERVER_JS,
  'src/worker.js': "setInterval(() => console.log('tick'), 1000);\n",
  'scripts/build.js': BUILD_JS,
};

// A deterministic, obviously synthetic base64 body, wrapped at 64 columns: never a real key.
function syntheticPemKey(seed: string): string {
  const raw = Array.from({ length: 24 }, (_, i) => `cejel-v28-synthetic-key-material-${seed}-${i}`).join('|');
  const body = Buffer.from(raw, 'utf8').toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
  return ['-----BEGIN PRIVATE KEY-----', ...lines, '-----END PRIVATE KEY-----', ''].join('\n');
}

const LIBRARY_SOURCE: Readonly<Record<string, string>> = {
  'package.json': '{"name":"synthetic-lib","version":"1.0.0","scripts":{"test":"node --test"}}\n',
  'src/index.js': 'export const add = (a, b) => a + b;\n',
};

/** Item A: every runtime Dockerfile is checked, and a compose healthcheck or a probe covers one. */
export const V28_ITEM_A_FIXTURES: readonly V28A3A2Fixture[] = [
  { name: 'v28-a3a-two-runtime-dockerfiles', commits: [TWO_RUNTIME_DOCKERFILES] },
  {
    name: 'v28-a3a-compose-healthcheck-covers-second',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        'docker-compose.yml': [
          'services:',
          '  api:',
          '    build: ./api',
          '  worker:',
          '    build:',
          '      context: ./worker',
          '    healthcheck:',
          '      test: ["CMD", "node", "-e", "process.exit(0)"]',
          '      interval: 30s',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'v28-a3a-compose-dockerfile-key-covers-second',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        'deploy/compose.yaml': [
          'services:',
          '  worker:',
          '    build:',
          '      context: ..',
          '      dockerfile: worker/Dockerfile',
          '    healthcheck:',
          '      test: ["CMD-SHELL", "node -e \'process.exit(0)\'"]',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'v28-a3a-compose-healthcheck-no-build',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        'docker-compose.yml': [
          'services:',
          '  worker:',
          '    image: synthetic/worker:latest',
          '    healthcheck:',
          '      test: ["CMD", "node", "-e", "process.exit(0)"]',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'v28-a3a-compose-healthcheck-interpolated-build',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        'docker-compose.yml': [
          'services:',
          '  worker:',
          '    build: ${WORKER_CONTEXT}',
          '    healthcheck:',
          '      test: ["CMD", "node", "-e", "process.exit(0)"]',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'v28-a3a-compose-healthcheck-disabled',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        'docker-compose.yml': [
          'services:',
          '  worker:',
          '    build: ./worker',
          '    healthcheck:',
          '      disable: true',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'v28-a3a-probe-linked-by-compose-image',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        'docker-compose.yml': ['services:', '  worker:', '    build: ./worker', '    image: synthetic/worker:1.4.0', ''].join('\n'),
        'k8s/worker.yaml': [
          'apiVersion: apps/v1',
          'kind: Deployment',
          'metadata:',
          '  name: worker',
          'spec:',
          '  template:',
          '    spec:',
          '      containers:',
          '        - name: worker',
          '          image: synthetic/worker:1.4.0',
          '          readinessProbe:',
          '            exec:',
          '              command: ["node", "-e", "process.exit(0)"]',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    name: 'v28-a3a-probe-image-not-linked',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        'k8s/worker.yaml': [
          'apiVersion: apps/v1',
          'kind: Deployment',
          'metadata:',
          '  name: worker',
          'spec:',
          '  template:',
          '    spec:',
          '      containers:',
          '        - name: worker',
          '          image: synthetic/worker:1.4.0',
          '          livenessProbe:',
          '            httpGet:',
          '              path: /',
          '              port: 8080',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    // A skaffold file, which only item A's reading reads, is committed as a Git LFS pointer, so the
    // reading reads a pointer where an image link could be.
    name: 'v28-a3a-skaffold-file-is-lfs-pointer',
    commits: [
      {
        ...TWO_RUNTIME_DOCKERFILES,
        '.gitattributes': 'skaffold.yaml filter=lfs diff=lfs merge=lfs -text\n',
        'skaffold.yaml': lfsPointerFor('build:\n  artifacts:\n    - image: synthetic/worker\n      context: worker\n'),
      },
    ],
  },
  {
    // Trips the build/typecheck branch under v23 (no build or typecheck script) and has a runtime
    // Dockerfile with no HEALTHCHECK, so v23 never reaches its healthcheck branch.
    name: 'v28-a3a-build-branch-and-uncovered-dockerfile',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/server.js"}}\n',
        Dockerfile: 'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nCMD ["npm", "start"]\n',
        'src/server.js': SERVER_JS,
      },
    ],
  },
];

const DIRECT_HTTP_NO_ROUTE =
  "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.method)).listen(5300);\n";
const PROCFILE = 'web: node src/main.js\n';

/** Item B: the v20 health-route fixtures (a3-explicit-gaps-v20.test.ts), each given a Procfile. */
export const V28_ITEM_B_FIXTURES: readonly V28A3A2Fixture[] = [
  {
    name: 'v28-a3b-direct-http-no-route',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
        'src/main.js': DIRECT_HTTP_NO_ROUTE,
        Procfile: PROCFILE,
      },
    ],
  },
  {
    name: 'v28-a3b-direct-http-ready-route',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
        'src/main.js':
          "import http from 'node:http';\nhttp.createServer((request, response) => { if (request.url === '/ready') { response.end('ready'); return; } response.end(request.method); }).listen(5300);\n",
        Procfile: PROCFILE,
      },
    ],
  },
  {
    name: 'v28-a3b-delegated-handler',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/main.js","build":"node scripts/build.js"}}\n',
        'src/main.js': "import http from 'node:http';\nimport { handler } from './handler.js';\nhttp.createServer(handler).listen(5400);\n",
        'src/handler.js': 'export function handler(_request, response) { response.end(); }\n',
        'scripts/build.js': BUILD_JS,
        Procfile: PROCFILE,
      },
    ],
  },
  {
    name: 'v28-a3b-route-module',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/main.js","build":"node scripts/build.js"}}\n',
        'src/main.js': DIRECT_HTTP_NO_ROUTE,
        'src/routes.js': "export const readinessPath = '/readiness';\n",
        'scripts/build.js': BUILD_JS,
        Procfile: PROCFILE,
      },
    ],
  },
  {
    // A file the health-route reading would read is withheld (over the size ceiling): no finding.
    name: 'v28-a3b-withheld-route-file',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
        'src/main.js': DIRECT_HTTP_NO_ROUTE,
        'src/routes.js': `export const readinessPath = '/readiness';\n${'// '.padEnd(512_001, 'x')}\n`,
        Procfile: PROCFILE,
      },
    ],
  },
  {
    // The v20 fixture as it stands, with no other deployable surface: A3 is not applicable under
    // v27, and v28 does not carry v20's widened applicability.
    name: 'v28-a3b-bare-v20-fixture',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
        'src/main.js': DIRECT_HTTP_NO_ROUTE,
      },
    ],
  },
];

/** Item C: a PEM private key in a key file, in the tree and in history. */
export const V28_ITEM_C_FIXTURES: readonly V28A3A2Fixture[] = [
  {
    name: 'v28-a2c-tracked-key-file',
    commits: [{ ...LIBRARY_SOURCE, '.env.example': 'API_URL=\n', 'deploy/server.key': syntheticPemKey('tracked') }],
  },
  {
    name: 'v28-a2c-key-in-history-only',
    commits: [
      { ...LIBRARY_SOURCE, '.env.example': 'API_URL=\n' },
      { 'deploy/server.key': syntheticPemKey('history') },
      { 'deploy/server.key': null },
    ],
  },
  {
    // The key is the only secrets surface: A2 is not applicable under v27 and scored under v28.
    name: 'v28-a2c-key-only-secrets-surface',
    commits: [{ ...LIBRARY_SOURCE, 'deploy/server.key': syntheticPemKey('only') }],
  },
];

/** Item D: the v20 manifest-script fixture, given a Procfile so that A3 applies under v27 too. */
export const V28_ITEM_D_FIXTURES: readonly V28A3A2Fixture[] = [
  {
    name: 'v28-a3d-build-typecheck-omission',
    commits: [
      {
        'package.json': '{"scripts":{"start":"node src/main.js","test":"node --test"}}\n',
        'src/main.js': "import http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(5200);\n",
        Procfile: PROCFILE,
      },
    ],
  },
];

export const V28_A3_A2_FIXTURES: readonly V28A3A2Fixture[] = [
  ...V28_ITEM_A_FIXTURES,
  ...V28_ITEM_B_FIXTURES,
  ...V28_ITEM_C_FIXTURES,
  ...V28_ITEM_D_FIXTURES,
];
