import { type FalseAssuranceFixture, lfsPointerFor } from './false-assurance-fixtures.js';

// v27 (#519 follow-up, 2026-11-19): synthetic repositories for the Git LFS pointer abstention's
// citation (item A), the not-applicable result it keeps where no pointer could change it (item B),
// and the investigation of a scored criterion abstaining on unrelated pointers (item C). Written
// from scratch; no fixture is derived from any real repository.

const LFS_ATTRIBUTES = [
  '*.png filter=lfs diff=lfs merge=lfs -text',
  '*.zip filter=lfs diff=lfs merge=lfs -text',
  '*.bin filter=lfs diff=lfs merge=lfs -text',
  '*.woff2 filter=lfs diff=lfs merge=lfs -text',
  '*.mp3 filter=lfs diff=lfs merge=lfs -text',
  '*.onnx filter=lfs diff=lfs merge=lfs -text',
  '',
].join('\n');

// A small TypeScript library with no data layer and no ratable secrets surface: no `.env*` file,
// no `.gitignore`, no signing, HMAC or secret-comparison code, so A2 is not applicable.
const TS_LIBRARY: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({ name: 'imgkit', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`,
  'README.md': '# imgkit\n\nScales image dimensions.\n',
  LICENSE: 'MIT\n',
  'src/index.ts': 'export function scale(width: number, height: number, factor: number) {\n  return { width: width * factor, height: height * factor };\n}\n',
  'test/index.test.js':
    "import test from 'node:test';\nimport assert from 'node:assert';\n\ntest('scale', () => {\n  assert.strictEqual(2 * 2, 4);\n});\n",
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm install\n      - run: npm test\n',
};

const SIGN_SOURCE =
  "import { createHmac, timingSafeEqual } from 'node:crypto';\n\nexport function verify(secret: string, body: string, signature: string) {\n  const expected = createHmac('sha256', secret).update(body).digest();\n  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));\n}\n";

const BINARY_ASSET_POINTERS: Readonly<Record<string, string>> = {
  '.gitattributes': LFS_ATTRIBUTES,
  'assets/logo.png': lfsPointerFor('PNG image bytes'),
  'dist/tool.zip': lfsPointerFor('ZIP archive bytes'),
  'models/weights.bin': lfsPointerFor('model weight bytes'),
};

const DOCKERFILE = [
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

const COMPOSE = [
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
  '    healthcheck:',
  '      test: ["CMD", "pg_isready"]',
  '      interval: 10s',
  'volumes:',
  '  data: {}',
  '',
].join('\n');

const NODE_SERVICE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({ name: 'svc', version: '1.0.0', main: 'server.js', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '4.19.2' } }, null, 2)}\n`,
  'README.md': '# svc\n',
  LICENSE: 'MIT\n',
  'server.js': "const express = require('express');\nconst app = express();\napp.get('/', (req, res) => res.send('ok'));\napp.listen(3000);\n",
  'healthcheck.js': "require('http').get('http://localhost:3000/', (res) => process.exit(res.statusCode === 200 ? 0 : 1));\n",
  'test/server.test.js':
    "const test = require('node:test');\nconst assert = require('node:assert');\n\ntest('ok', () => {\n  assert.strictEqual(1, 1);\n});\n",
  Dockerfile: DOCKERFILE,
  'docker-compose.yml': COMPOSE,
};

export const V27_LFS_POINTER_FIXTURES: readonly FalseAssuranceFixture[] = [
  {
    name: 'lfs-a2-surface-sign-pointer',
    issue: '#519',
    purpose:
      'Item A: an A2 surface (.env.example and a .gitignore .env rule) and a Git LFS pointer at src/sign.ts. Under v27 A2 abstains and cites src/sign.ts.',
    commits: [
      {
        ...TS_LIBRARY,
        '.env.example': 'API_URL=\n',
        '.gitignore': '.env\nnode_modules\n',
        '.gitattributes': 'src/sign.ts filter=lfs diff=lfs merge=lfs -text\n',
        'src/sign.ts': lfsPointerFor(SIGN_SOURCE),
      },
    ],
  },
  {
    name: 'lfs-a2-binary-asset-pointers',
    issue: '#519',
    purpose:
      'Item B: no A2 surface, and Git LFS pointers at assets/logo.png, dist/tool.zip and models/weights.bin. Under v27 A2 stays not applicable and names the pointers it read.',
    commits: [{ ...TS_LIBRARY, ...BINARY_ASSET_POINTERS }],
  },
  {
    name: 'lfs-a2-binary-asset-pointers-and-hmac-source',
    issue: '#519',
    purpose:
      'Item B: the same repository with a pointer added at src/crypto/hmac.ts, a file A2\'s signing and HMAC detector reads. Under v27 A2 abstains and cites that pointer.',
    commits: [
      {
        ...TS_LIBRARY,
        ...BINARY_ASSET_POINTERS,
        '.gitattributes': `${LFS_ATTRIBUTES}src/crypto/hmac.ts filter=lfs diff=lfs merge=lfs -text\n`,
        'src/crypto/hmac.ts': lfsPointerFor(SIGN_SOURCE),
      },
    ],
  },
  {
    name: 'lfs-a2-binary-asset-pointers-and-gitignore-pointer',
    issue: '#519',
    purpose:
      'Item B: no A2 surface in what was read, binary-asset pointers, and the .gitignore itself a pointer. A2 reads .gitignore for an .env rule, so under v27 A2 abstains.',
    commits: [
      {
        ...TS_LIBRARY,
        ...BINARY_ASSET_POINTERS,
        '.gitignore': lfsPointerFor('.env\n'),
      },
    ],
  },
  {
    name: 'lfs-a3-docker-compose-with-image-and-font-pointers',
    issue: '#519',
    purpose:
      'Item C: a service A3 can score from its Dockerfile (non-root USER, HEALTHCHECK) and compose file (restart policies, a volume, healthchecks), beside Git LFS pointers for a .png and a .woff2.',
    commits: [
      {
        ...NODE_SERVICE,
        '.gitattributes': LFS_ATTRIBUTES,
        // A3's health-check reader (isHealthCheckSignalFile) reads every file under helm/, k8s/ or
        // kubernetes/ for a liveness or readiness probe, whatever its extension, so it reads these.
        'helm/svc/Chart.yaml': 'apiVersion: v2\nname: svc\nversion: 1.0.0\nicon: file://icon.png\n',
        'helm/svc/icon.png': lfsPointerFor('PNG image bytes'),
        'helm/svc/files/inter.woff2': lfsPointerFor('WOFF2 font bytes'),
      },
    ],
  },
  {
    name: 'lfs-a3-docker-compose-control',
    issue: '#519',
    purpose: 'Item C control: the same service and chart with no Git LFS pointer.',
    commits: [{ ...NODE_SERVICE, 'helm/svc/Chart.yaml': 'apiVersion: v2\nname: svc\nversion: 1.0.0\nicon: file://icon.png\n' }],
  },
  {
    name: 'lfs-a2-history-env-with-audio-and-model-pointers',
    issue: '#519',
    purpose:
      'Item C: A2 scored from history scanning (a non-template .env committed and later deleted), beside Git LFS pointers for an .mp3 and an .onnx file.',
    commits: [
      { ...TS_LIBRARY, '.env': 'LOG_LEVEL=info\n' },
      {
        '.env': null,
        '.gitattributes': LFS_ATTRIBUTES,
        'media/chime.mp3': lfsPointerFor('MP3 audio bytes'),
        'models/classifier.onnx': lfsPointerFor('ONNX model bytes'),
      },
    ],
  },
  {
    name: 'lfs-a2-history-env-control',
    issue: '#519',
    purpose: 'Item C control: the same history with no Git LFS pointer.',
    commits: [{ ...TS_LIBRARY, '.env': 'LOG_LEVEL=info\n' }, { '.env': null }],
  },
];

export function v27LfsPointerFixture(name: string): FalseAssuranceFixture {
  const found = V27_LFS_POINTER_FIXTURES.find((fixture) => fixture.name === name);
  if (!found) throw new Error(`unknown v27 LFS pointer fixture ${name}`);
  return found;
}
