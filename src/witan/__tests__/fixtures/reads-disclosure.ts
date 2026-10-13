import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// SYNTHETIC repositories for the certificate reads-disclosure tests
// (goal_cejel_certificate_reads_disclosure_2026-10-13). Authored here; nothing is derived from a
// real repository. Each is materialised at test time, like the behaviour corpus, so no nested
// package.json or .github/workflows tree is tracked in this repository.

const OVERSIZED_BYTES = 512_001;

const SERVICE_ENTRYPOINT: Readonly<Record<string, string>> = {
  'vercel.json': '{}\n',
  'src/main.js':
    "import http from 'node:http';\n" +
    'http.createServer((request, response) => response.end(request.method)).listen(5300);\n',
};

function workflow(name: string, run: string): string {
  return `name: ${name}\non:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n  job:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: ${run}\n`;
}

const ROOT_SCRIPTS =
  '{"scripts":{"start":"node src/main.js","test":"vitest run","lint":"eslint .","typecheck":"tsc --noEmit","build":"tsc"}}\n';

/** F1: ten recognised workflow files with varied names — each of A3, B2, B3 cites fewer than it read. */
export const F1_TEN_WORKFLOWS: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/build.yml': workflow('build', 'pnpm build'),
  '.github/workflows/ci.yml': workflow('ci', 'pnpm test'),
  '.github/workflows/codeql.yml': workflow('codeql', 'echo scan'),
  '.github/workflows/docs.yml': workflow('docs', 'echo docs'),
  '.github/workflows/lint.yml': workflow('lint', 'pnpm lint'),
  '.github/workflows/nightly.yml': workflow('nightly', 'pnpm test'),
  '.github/workflows/release.yml': workflow('release', 'echo release'),
  '.github/workflows/smoke.yml': workflow('smoke', 'echo smoke'),
  '.github/workflows/typecheck.yaml': workflow('typecheck', 'pnpm typecheck'),
  '.github/workflows/zz-final.yml': workflow('final', 'echo final'),
};

/** F2: one workflow file, the common case — output must be byte-identical to before the change. */
export const F2_ONE_WORKFLOW: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': workflow('ci', 'pnpm test'),
};

function workspaceManifest(name: string): string {
  return `{"name":"@fixture/${name}","scripts":{"test":"vitest run","lint":"eslint .","typecheck":"tsc --noEmit","build":"tsc"}}\n`;
}

/** F3: workspace monorepo — a root package.json with no scripts and 7 workspace manifests that hold them. */
export const F3_WORKSPACE_ROOT_WITHOUT_SCRIPTS: Readonly<Record<string, string>> = {
  'package.json': '{"private":true,"workspaces":["packages/*"],"scripts":{"start":"node src/main.js"}}\n',
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': workflow('ci', 'echo ok'),
  ...Object.fromEntries(
    ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'].map((name) => [
      `packages/${name}/package.json`,
      workspaceManifest(name),
    ]),
  ),
};

/** F4: monorepo with no root package.json at all. */
export const F4_NO_ROOT_PACKAGE_JSON: Readonly<Record<string, string>> = {
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': workflow('ci', 'echo ok'),
  'packages/alpha/package.json': workspaceManifest('alpha'),
  'packages/bravo/package.json': workspaceManifest('bravo'),
  'packages/charlie/package.json': workspaceManifest('charlie'),
};

/** F5: one readable workflow and one over the 512,000-byte content ceiling, so present != read. */
export const F5_ONE_WORKFLOW_SKIPPED: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': workflow('ci', 'pnpm test'),
  '.github/workflows/huge.yml':
    workflow('huge', 'echo huge') + '# '.padEnd(OVERSIZED_BYTES, 'x') + '\n',
};

/** F5b: two readable workflows plus one skipped, so read (2) > cited (1) and one is not read. */
export const F5B_TWO_READ_ONE_SKIPPED: Readonly<Record<string, string>> = {
  ...F5_ONE_WORKFLOW_SKIPPED,
  '.github/workflows/lint.yml': workflow('lint', 'pnpm lint'),
};

export const READS_DISCLOSURE_FIXTURES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  'f1-ten-workflows': F1_TEN_WORKFLOWS,
  'f2-one-workflow': F2_ONE_WORKFLOW,
  'f3-workspace-root-without-scripts': F3_WORKSPACE_ROOT_WITHOUT_SCRIPTS,
  'f4-no-root-package-json': F4_NO_ROOT_PACKAGE_JSON,
  'f5-one-workflow-skipped': F5_ONE_WORKFLOW_SKIPPED,
  'f5b-two-read-one-skipped': F5B_TWO_READ_ONE_SKIPPED,
};

export function makeReadsDisclosureRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-reads-disclosure-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  return repo;
}
