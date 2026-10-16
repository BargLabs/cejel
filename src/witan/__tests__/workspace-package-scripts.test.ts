import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_RUBRIC_VERSION_V26,
} from '../rubric-version.js';

// goal_cejel_v26_workspace_package_scripts_2026-10-14. A recognition fix under every selectable
// rubric, with no identifier bump (the #459/#427/#430 shape). In npm, yarn and pnpm workspaces the
// root package.json often only orchestrates and the scripts live in the workspace packages, so a
// check that reads the root alone asserts an absence the repository does not have. A3's v20+
// "declares neither a build nor a typecheck script" finding and B3's ci_script_depth now also read
// the package.json of each package the workspace DECLARES (root `workspaces`, array or
// `{ packages }` form, and `pnpm-workspace.yaml` `packages:`), expanded against the tracked file
// list, `!` negations honoured, capped, and admitted by A1's authored-production predicate. With
// no declaration, nothing changes: workspaces are never inferred from directory shape.
//
// Synthetic fixtures only. Nothing here is derived from a real repository.

const MANIFEST_SUMMARY =
  'A deployable service package manifest declares neither a build nor a typecheck script.';
const HEALTHCHECK_SUMMARY = 'A runtime Dockerfile declares no active HEALTHCHECK instruction.';

// Every selectable rubric that carries the v20 explicit-gap findings. v17-v19 do not.
const V20_PLUS = [
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_RUBRIC_VERSION_V26,
] as const;

// A direct HTTP entrypoint that never reads the request, so A3 is applicable and the third
// explicit-gap branch (no health route on a request-reading entrypoint) stays silent.
const SERVICE_ENTRYPOINT =
  "import http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(5400);\n";
const ROOT_WITH_WORKSPACES_ARRAY = (workspaces: readonly string[]): string =>
  `${JSON.stringify({ private: true, workspaces, scripts: { start: 'node src/main.js' } })}\n`;
const ROOT_WITHOUT_DECLARATION = '{"private":true,"scripts":{"start":"node src/main.js"}}\n';
const PACKAGE_WITH_BUILD = (name: string): string =>
  `{"name":"@fixture/${name}","scripts":{"build":"tsc -p ."}}\n`;
const PACKAGE_WITHOUT_BUILD = (name: string): string =>
  `{"name":"@fixture/${name}","scripts":{"start":"node index.js"}}\n`;
const CI_WITHOUT_COMMANDS =
  'name: ci\non:\n  push:\n    branches: [main]\njobs:\n  job:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n';
// v26 item 8 (docs/calibration/v26/ruling-item-8.md): under v26 the finding needs the root package
// to have something to build or check. Fixtures that assert it fires carry a root tsconfig, which
// no other rubric reads for this finding.
const ROOT_TSCONFIG = { 'tsconfig.json': '{"compilerOptions":{"strict":true}}\n' } as const;

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-workspace-scripts-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  // -f: a tracked node_modules/ manifest must reach the index even under a global gitignore.
  execFileSync('git', ['add', '-f', '-A', '.'], { cwd: repo });
  return repo;
}

function scan(files: Readonly<Record<string, string>>, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'workspace-scripts-fixture',
    productDisplayName: 'Workspace scripts fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-10-14T00:00:00.000Z',
    rubricVersion,
  });
  const signal = (id: string) => (input.signals ?? []).find((s) => s.criterionId === id);
  return {
    a3Finding: (summary: string) => signal('A3')?.findings?.find((f) => f.summary === summary),
    metric: (criterion: string, name: string) =>
      signal(criterion)?.metrics?.find((m) => m.name === name),
  };
}

const DECLARATION_FORMS: readonly { readonly name: string; readonly files: Record<string, string> }[] = [
  {
    // https://docs.npmjs.com/cli/v10/using-npm/workspaces
    name: 'npm `workspaces` array',
    files: {
      'package.json': ROOT_WITH_WORKSPACES_ARRAY(['packages/*']),
      'src/main.js': SERVICE_ENTRYPOINT,
      'packages/api/package.json': PACKAGE_WITH_BUILD('api'),
    },
  },
  {
    // https://classic.yarnpkg.com/lang/en/docs/workspaces/ (object form with `packages`)
    name: 'yarn `workspaces.packages`',
    files: {
      'package.json': `${JSON.stringify({
        private: true,
        workspaces: { packages: ['packages/*'], nohoist: ['**/react-native'] },
        scripts: { start: 'node src/main.js' },
      })}\n`,
      'src/main.js': SERVICE_ENTRYPOINT,
      'packages/api/package.json': PACKAGE_WITH_BUILD('api'),
    },
  },
  {
    // https://pnpm.io/pnpm-workspace_yaml
    name: '`pnpm-workspace.yaml` `packages:`',
    files: {
      'package.json': ROOT_WITHOUT_DECLARATION,
      'pnpm-workspace.yaml':
        "# workspace root\npackages:\n  # every app\n  - 'apps/*'\n  - \"packages/*\" # quoted\n\ncatalog:\n  react: ^18.0.0\n",
      'src/main.js': SERVICE_ENTRYPOINT,
      'packages/api/package.json': PACKAGE_WITH_BUILD('api'),
    },
  },
];

describe('A3 build/typecheck finding reads declared workspace packages (v20+)', () => {
  for (const form of DECLARATION_FORMS) {
    it.each(V20_PLUS)(`${form.name}: a workspace package's build script silences the finding — %s`, (rubric) => {
      expect(scan(form.files, rubric).a3Finding(MANIFEST_SUMMARY)).toBeUndefined();
    });
  }

  it.each(V20_PLUS)('a `!` negation that excludes the only package with build leaves the finding firing — %s', (rubric) => {
    const finding = scan(
      {
        ...ROOT_TSCONFIG,
        'package.json': ROOT_WITH_WORKSPACES_ARRAY(['packages/*', '!packages/legacy']),
        'src/main.js': SERVICE_ENTRYPOINT,
        'packages/legacy/package.json': PACKAGE_WITH_BUILD('legacy'),
        'packages/web/package.json': PACKAGE_WITHOUT_BUILD('web'),
      },
      rubric,
    ).a3Finding(MANIFEST_SUMMARY);
    expect(finding?.evidence?.path).toBe('package.json');
    expect(finding?.evidence?.label).toBe(
      'Deployable service manifest without a build or typecheck script (1 declared workspace package.json file read)',
    );
  });

  it.each(V20_PLUS)('a pnpm `!` negation is honoured the same way — %s', (rubric) => {
    const finding = scan(
      {
        ...ROOT_TSCONFIG,
        'package.json': ROOT_WITHOUT_DECLARATION,
        'pnpm-workspace.yaml': "packages:\n  - 'packages/**'\n  - '!**/legacy/**'\n",
        'src/main.js': SERVICE_ENTRYPOINT,
        'packages/old/legacy/package.json': PACKAGE_WITH_BUILD('legacy'),
        'packages/web/package.json': PACKAGE_WITHOUT_BUILD('web'),
      },
      rubric,
    ).a3Finding(MANIFEST_SUMMARY);
    expect(finding?.evidence?.label).toBe(
      'Deployable service manifest without a build or typecheck script (1 declared workspace package.json file read)',
    );
  });

  it.each(V20_PLUS)('vendored and generated manifests a workspace glob reaches are not counted — %s', (rubric) => {
    // node_modules/ never reaches the scan inventory (hard-excluded before any collector); the
    // generated/ tree does, and only A1's authored-production predicate keeps it out.
    const finding = scan(
      {
        ...ROOT_TSCONFIG,
        'package.json': ROOT_WITH_WORKSPACES_ARRAY(['packages/**']),
        'src/main.js': SERVICE_ENTRYPOINT,
        'packages/app/package.json': PACKAGE_WITHOUT_BUILD('app'),
        'packages/app/node_modules/dep/package.json': PACKAGE_WITH_BUILD('dep'),
        'packages/app/generated/client/package.json': PACKAGE_WITH_BUILD('client'),
      },
      rubric,
    ).a3Finding(MANIFEST_SUMMARY);
    expect(finding?.evidence?.label).toBe(
      'Deployable service manifest without a build or typecheck script (1 declared workspace package.json file read)',
    );
  });

  it('past the 200-manifest read cap, an unread manifest is not an observed absence', () => {
    // 201 declared packages; only the last in path order declares build, so the cap leaves it
    // unread. A3 must not assert the absence; B3 states how many of how many it read.
    const files: Record<string, string> = {
      'package.json': ROOT_WITH_WORKSPACES_ARRAY(['packages/*']),
      'src/main.js': SERVICE_ENTRYPOINT,
      '.github/workflows/ci.yml': CI_WITHOUT_COMMANDS,
    };
    for (let index = 0; index < 200; index += 1) {
      const name = `p${String(index).padStart(3, '0')}`;
      files[`packages/${name}/package.json`] = PACKAGE_WITHOUT_BUILD(name);
    }
    files['packages/zz-last/package.json'] = PACKAGE_WITH_BUILD('zz-last');
    const result = scan(files, WITAN_RUBRIC_VERSION_V25);
    expect(result.a3Finding(MANIFEST_SUMMARY)).toBeUndefined();
    const depth = result.metric('B3', 'ci_script_depth');
    expect(depth?.value).toBe(0);
    expect(depth?.presentation?.condition).toBe(
      'package scripts for this metric are read from the root package.json and the first 200 of 201 declared workspace package.json files; 1 other package.json file present',
    );
  });

  it.each(V20_PLUS)('no workspace declaration: a nested manifest with build changes nothing — %s', (rubric) => {
    const finding = scan(
      {
        ...ROOT_TSCONFIG,
        'package.json': ROOT_WITHOUT_DECLARATION,
        'src/main.js': SERVICE_ENTRYPOINT,
        'packages/api/package.json': PACKAGE_WITH_BUILD('api'),
      },
      rubric,
    ).a3Finding(MANIFEST_SUMMARY);
    expect(finding?.evidence?.path).toBe('package.json');
    expect(finding?.evidence?.label).toBe(
      'Deployable service manifest without a build or typecheck script',
    );
  });
});

// THE COUPLING. The three v20 explicit-gap findings are one `if / else if` chain in
// collectA3ProdReadinessEvidence: (1) a manifest without a build or typecheck script; else (2) a
// runtime Dockerfile without an active HEALTHCHECK; else (3) an HTTP entrypoint without a health
// route. When branch 1 stops firing on a workspace monorepo, branches 2 and 3 start running there.
// The chain is not restructured; this pins the direction the public delta should expect.
describe('the A3 explicit-gap chain after branch 1 stops firing on a workspace monorepo (v20+)', () => {
  it.each(V20_PLUS)('a runtime Dockerfile without HEALTHCHECK now gets the HEALTHCHECK finding — %s', (rubric) => {
    const result = scan(
      {
        'package.json': ROOT_WITH_WORKSPACES_ARRAY(['packages/*']),
        'packages/api/package.json': PACKAGE_WITH_BUILD('api'),
        'packages/api/src/service.js': "console.log('service');\n",
        Dockerfile:
          'FROM node:22-alpine\nWORKDIR /srv\nCOPY . .\nCMD ["node", "packages/api/src/service.js"]\n',
      },
      rubric,
    );
    expect(result.a3Finding(MANIFEST_SUMMARY)).toBeUndefined();
    expect(result.a3Finding(HEALTHCHECK_SUMMARY)?.evidence?.path).toBe('Dockerfile');
  });
});

describe('B3 ci_script_depth reads declared workspace packages (every rubric, v17 included)', () => {
  const lib = (root: string): Record<string, string> => ({
    'package.json': root,
    'packages/lib/package.json': '{"name":"@fixture/lib","scripts":{"test":"vitest run"}}\n',
    '.github/workflows/ci.yml': CI_WITHOUT_COMMANDS,
  });

  it("a workspace package's test script counts under v17", () => {
    const depth = scan(lib('{"private":true,"workspaces":["packages/*"]}\n'), WITAN_RUBRIC_VERSION_V17).metric(
      'B3',
      'ci_script_depth',
    );
    expect(depth?.value).toBe(1);
    expect(depth?.presentation?.condition).toBe(
      'package scripts for this metric are read from the root package.json and 1 declared workspace package.json file',
    );
  });

  it('without a workspace declaration the nested test script is not read under v17 (unchanged)', () => {
    const depth = scan(lib('{"private":true}\n'), WITAN_RUBRIC_VERSION_V17).metric('B3', 'ci_script_depth');
    expect(depth?.value).toBe(0);
    expect(depth?.presentation?.condition).toBe(
      'package scripts for this metric are read from the root package.json only; 1 other package.json file present',
    );
  });

  it('a placeholder test script in a workspace package earns nothing, as at the root', () => {
    const depth = scan(
      {
        ...lib('{"private":true,"workspaces":["packages/*"]}\n'),
        'packages/lib/package.json':
          '{"name":"@fixture/lib","scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}\n',
      },
      WITAN_RUBRIC_VERSION_V17,
    ).metric('B3', 'ci_script_depth');
    expect(depth?.value).toBe(0);
  });
});
