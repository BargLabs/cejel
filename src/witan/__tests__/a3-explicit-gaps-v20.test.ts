import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V19,
  WITAN_RUBRIC_VERSION_V20,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';

const V20_A3_SUMMARIES = new Set([
  'A deployable service package manifest declares neither a build nor a typecheck script.',
  'A runtime Dockerfile declares no active HEALTHCHECK instruction.',
  'A production HTTP entrypoint handles requests directly but declares no health or readiness route.',
]);

function makeRepo(files: Readonly<Record<string, string | undefined>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-a3-v20-'));
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

function a3Findings(
  files: Readonly<Record<string, string | undefined>>,
  rubricVersion: string,
) {
  const input = buildWitanInputFromRepo({
    productSlug: 'a3-v20-test',
    productDisplayName: 'A3 v20 test',
    repoPath: makeRepo(files),
    generatedAt: '2026-08-10T00:00:00.000Z',
    rubricVersion,
  });
  const a3 = input.signals?.find(({ criterionId }) => criterionId === 'A3');
  return (a3?.findings ?? []).filter(({ summary }) => V20_A3_SUMMARIES.has(summary));
}

describe('prospective v20 A3 explicit-gap findings', () => {
  it('keeps v17 as the public default and leaves v19 byte behavior free of v20 findings', () => {
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    const files = {
      'package.json': '{"scripts":{"start":"node src/main.js"}}\n',
      'src/main.js':
        "import http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(5100);\n",
    };
    expect(a3Findings(files, WITAN_RUBRIC_VERSION_V17)).toEqual([]);
    expect(a3Findings(files, WITAN_RUBRIC_VERSION_V19)).toEqual([]);
  });

  it.each([
    {
      name: 'manifest script omission',
      defectFile: 'package.json',
      summary:
        'A deployable service package manifest declares neither a build nor a typecheck script.',
      seeded: {
        'package.json': '{"scripts":{"start":"node src/main.js","test":"node --test"}}\n',
        'src/main.js':
          "import http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(5200);\n",
      },
      repaired: {
        'package.json':
          '{"scripts":{"start":"node src/main.js","test":"node --test","build":"tsc --noEmit"}}\n',
        'src/main.js':
          "import http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(5200);\n",
      },
    },
    {
      name: 'direct HTTP readiness omission',
      defectFile: 'src/main.js',
      summary:
        'A production HTTP entrypoint handles requests directly but declares no health or readiness route.',
      seeded: {
        'package.json':
          '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
        'src/main.js':
          "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.method)).listen(5300);\n",
      },
      repaired: {
        'package.json':
          '{"scripts":{"start":"node src/main.js","typecheck":"tsc --noEmit"}}\n',
        'src/main.js':
          "import http from 'node:http';\nhttp.createServer((request, response) => { if (request.url === '/ready') { response.end('ready'); return; } response.end(request.method); }).listen(5300);\n",
      },
    },
    {
      name: 'runtime container healthcheck omission',
      defectFile: 'deploy/Dockerfile',
      summary: 'A runtime Dockerfile declares no active HEALTHCHECK instruction.',
      seeded: {
        'package.json':
          '{"scripts":{"start":"node src/service.js","build":"node scripts/build.js"}}\n',
        'deploy/Dockerfile':
          'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nCMD ["node", "src/service.js"]\n',
        'src/service.js': "console.log('service');\n",
        'scripts/build.js': "console.log('build');\n",
      },
      repaired: {
        'package.json':
          '{"scripts":{"start":"node src/service.js","build":"node scripts/build.js"}}\n',
        'deploy/Dockerfile':
          'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nHEALTHCHECK CMD node -e "process.exit(0)"\nCMD ["node", "src/service.js"]\n',
        'src/service.js': "console.log('service');\n",
        'scripts/build.js': "console.log('build');\n",
      },
    },
  ])('cites only the seeded $name defect path and stays silent on its repair', (testCase) => {
    const seeded = a3Findings(testCase.seeded, WITAN_RUBRIC_VERSION_V20);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatchObject({
      severity: 'info',
      summary: testCase.summary,
      evidence: { path: testCase.defectFile },
    });
    expect(a3Findings(testCase.repaired, WITAN_RUBRIC_VERSION_V20)).toEqual([]);
  });

  it('does not infer a health-route omission when the entrypoint delegates request handling', () => {
    const files = {
      'package.json':
        '{"scripts":{"start":"node src/main.js","build":"node scripts/build.js"}}\n',
      'src/main.js':
        "import http from 'node:http';\nimport { handler } from './handler.js';\nhttp.createServer(handler).listen(5400);\n",
      'src/handler.js': 'export function handler(_request, response) { response.end(); }\n',
      'scripts/build.js': "console.log('build');\n",
    };
    expect(a3Findings(files, WITAN_RUBRIC_VERSION_V20)).toEqual([]);
  });

  it('does not infer a health-route omission when an authored route module declares one', () => {
    const files = {
      'package.json':
        '{"scripts":{"start":"node src/main.js","build":"node scripts/build.js"}}\n',
      'src/main.js':
        "import http from 'node:http';\nhttp.createServer((request, response) => response.end(request.method)).listen(5500);\n",
      'src/routes.js': "export const readinessPath = '/readiness';\n",
      'scripts/build.js': "console.log('build');\n",
    };
    expect(a3Findings(files, WITAN_RUBRIC_VERSION_V20)).toEqual([]);
  });
});
