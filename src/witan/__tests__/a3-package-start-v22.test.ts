import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';

const A3_HTTP_SUMMARY =
  'A production HTTP entrypoint handles requests directly but declares no health or readiness route.';
const B6_ESCALATION_SUMMARY =
  'An authored SQL artifact contains, or a direct database-driver call executes, an administrative role grant, SUPERUSER escalation, or schema-wide table privilege grant with no documented human gate.';

function makeRepo(files: Readonly<Record<string, string | undefined>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-a3-v22-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    if (contents === undefined) continue;
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  return repo;
}

function findings(
  files: Readonly<Record<string, string | undefined>>,
  rubricVersion: string,
  criterionId = 'A3',
) {
  const input = buildWitanInputFromRepo({
    productSlug: 'a3-v22-test',
    productDisplayName: 'A3 v22 test',
    repoPath: makeRepo(files),
    generatedAt: '2026-08-10T00:00:00.000Z',
    rubricVersion,
  });
  return input.signals?.find(({ criterionId: id }) => id === criterionId)?.findings ?? [];
}

function a3HttpFindings(
  files: Readonly<Record<string, string | undefined>>,
  rubricVersion: string,
) {
  return findings(files, rubricVersion).filter(({ summary }) => summary === A3_HTTP_SUMMARY);
}

const packageJson = (start?: string): string =>
  `${JSON.stringify(
    {
      private: true,
      scripts: {
        ...(start ? { start } : {}),
        build: 'node scripts/build.mjs',
      },
    },
    null,
    2,
  )}\n`;

describe('prospective v22 A3 package-start entrypoint closure', () => {
  it('keeps v17 as the public default and leaves v21 behavior unchanged', () => {
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    const files = {
      'package.json': packageJson('node src/edge-handler.js'),
      'src/edge-handler.js':
        "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.url)).listen(6201);\n",
      'scripts/build.mjs': "console.log('build');\n",
    };
    expect(a3HttpFindings(files, WITAN_RUBRIC_VERSION_V21)).toEqual([]);
  });

  it.each([
    {
      name: 'node JavaScript start target',
      path: 'src/edge-handler.js',
      start: 'node src/edge-handler.js',
    },
    {
      name: 'tsx TypeScript start target',
      path: 'services/operator-api.ts',
      start: 'tsx services/operator-api.ts',
    },
  ])('cites only the seeded $name and stays silent on its repair', (testCase) => {
    const shared = {
      'package.json': packageJson(testCase.start),
      'scripts/build.mjs': "console.log('build');\n",
    };
    const seeded = {
      ...shared,
      [testCase.path]:
        "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.method)).listen(6202);\n",
    };
    const repaired = {
      ...shared,
      [testCase.path]:
        "import http from 'node:http';\nhttp.createServer((request, response) => { if (request.url === '/ready') { response.end('ready'); return; } response.end(request.method); }).listen(6202);\n",
    };
    expect(a3HttpFindings(seeded, WITAN_RUBRIC_VERSION_V22)).toEqual([
      expect.objectContaining({
        severity: 'info',
        summary: A3_HTTP_SUMMARY,
        evidence: expect.objectContaining({ path: testCase.path }),
      }),
    ]);
    expect(a3HttpFindings(repaired, WITAN_RUBRIC_VERSION_V22)).toEqual([]);
  });

  it.each([
    {
      name: 'unanchored arbitrary file',
      files: {
        'package.json': packageJson(),
        'src/edge-handler.js':
          "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.url)).listen(6203);\n",
        'scripts/build.mjs': "console.log('build');\n",
      },
    },
    {
      name: 'missing declared target',
      files: {
        'package.json': packageJson('node src/missing.js'),
        'src/other-handler.js':
          "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.url)).listen(6204);\n",
        'scripts/build.mjs': "console.log('build');\n",
      },
    },
    {
      name: 'test-only declared target',
      files: {
        'package.json': packageJson('node tests/edge-handler.js'),
        'tests/edge-handler.js':
          "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.url)).listen(6205);\n",
        'scripts/build.mjs': "console.log('build');\n",
      },
    },
    {
      name: 'delegated request handler',
      files: {
        'package.json': packageJson('node src/edge-handler.js'),
        'src/edge-handler.js':
          "import http from 'node:http';\nimport { handler } from './handler.js';\nhttp.createServer(handler).listen(6206);\n",
        'src/handler.js': 'export function handler(_request, response) { response.end(); }\n',
        'scripts/build.mjs': "console.log('build');\n",
      },
    },
    {
      name: 'shell-wrapped start command',
      files: {
        'package.json': packageJson('NODE_ENV=production node src/edge-handler.js'),
        'src/edge-handler.js':
          "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.url)).listen(6207);\n",
        'scripts/build.mjs': "console.log('build');\n",
      },
    },
  ])('does not infer an omission for a $name', (testCase) => {
    expect(a3HttpFindings(testCase.files, WITAN_RUBRIC_VERSION_V22)).toEqual([]);
  });

  it('stays silent when any authored implementation file declares a health route', () => {
    const files = {
      'package.json': packageJson('node src/edge-handler.js'),
      'src/edge-handler.js':
        "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.url)).listen(6208);\n",
      'src/routes.js': "export const healthPath = '/health';\n",
      'scripts/build.mjs': "console.log('build');\n",
    };
    expect(a3HttpFindings(files, WITAN_RUBRIC_VERSION_V22)).toEqual([]);
  });

  it('anchors evidence to the package start target when a conventional server file coexists', () => {
    const files = {
      'package.json': packageJson('node services/operator-api.js'),
      'services/operator-api.js':
        "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.url)).listen(6209);\n",
      'src/server.js': 'export function formatStatus(status) { return { status }; }\n',
      'scripts/build.mjs': "console.log('build');\n",
    };
    expect(a3HttpFindings(files, WITAN_RUBRIC_VERSION_V22)).toEqual([
      expect.objectContaining({
        evidence: expect.objectContaining({ path: 'services/operator-api.js' }),
      }),
    ]);
  });

  it('inherits v21 B6 executed-escalation behavior', () => {
    const b6 = findings(
      {
        'migrations/roles.sql': 'ALTER ROLE release_worker SUPERUSER;\n',
        'README.md': '# Role migration\n',
      },
      WITAN_RUBRIC_VERSION_V22,
      'B6',
    );
    expect(b6).toEqual(
      expect.arrayContaining([expect.objectContaining({ summary: B6_ESCALATION_SUMMARY })]),
    );
  });
});
