import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { buildRelyingPartySummary } from '../certificate-presentation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { classifyBuildStepCommand } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_RUBRIC_VERSION_V26,
} from '../rubric-version.js';
import {
  ALL_BUILD_STEP_FIXTURES,
  ALL_THREE_HOLD,
  B1,
  B2,
  B3,
  CHAIN_HEALTHCHECK,
  type BuildStepFixture,
} from './fixtures/build-step-evidence-fixtures.js';

// v26 item 8, implemented from the operator-signed ruling docs/calibration/v26/ruling-item-8.md.
// A3's "A deployable service package manifest declares neither a build nor a typecheck script."
// claims the deployed package has no build or type-check step, and two script names do not settle
// that. Under v26 alone it fires only when all three hold:
//   B-1 the package has something to build or check (authored TypeScript or a tsconfig);
//   B-2 no step runs a compiler, type checker or bundler from a fixed vocabulary, matched as a
//       command word, in any package script, CI `run`, Dockerfile `RUN` or Makefile/justfile target;
//   B-3 every such place was read (no withheld or delegated CI, no withheld Dockerfile or recipe
//       file, no manifest left unread, no command Cejel could not parse).
// B-1 fails: no finding, nothing to disclose. A step is found: no finding, nothing to disclose.
// B-3 fails: no finding, and one sentence in "What was not established". Never insufficient_data.
// Every metric is unchanged.
//
// Synthetic fixtures only (fixtures/build-step-evidence-fixtures.ts).

const BUILD_FINDING =
  'A deployable service package manifest declares neither a build nor a typecheck script.';
const HEALTHCHECK_FINDING = 'A runtime Dockerfile declares no active HEALTHCHECK instruction.';
const DISCLOSURE =
  'Whether this package has a build or type-check step outside the files read cannot be settled from static evidence; Cejel makes no finding on it.';

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-build-step-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  execFileSync('git', ['add', '-A', '.'], { cwd: repo });
  return repo;
}

const repoByFixture = new Map<string, string>();
const reportCache = new Map<string, WitanReport>();

function report(fixture: BuildStepFixture, rubricVersion: string): WitanReport {
  const key = `${fixture.name}@${rubricVersion}`;
  const cached = reportCache.get(key);
  if (cached) return cached;
  let repo = repoByFixture.get(fixture.name);
  if (!repo) {
    repo = makeRepo(fixture.files);
    repoByFixture.set(fixture.name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'build-step-fixture',
    productDisplayName: 'Build step fixture',
    generatedAt: '2026-10-15T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reportCache.set(key, scored);
  return scored;
}

function a3(fixture: BuildStepFixture, rubricVersion: string): WitanCriterionScore {
  const found = report(fixture, rubricVersion).criteria.find((criterion) => criterion.id === 'A3');
  if (!found) throw new Error(`no A3 in ${fixture.name}`);
  return found;
}

const finding = (fixture: BuildStepFixture, rubricVersion: string, summary = BUILD_FINDING) =>
  a3(fixture, rubricVersion).findings.find((candidate) => candidate.summary === summary);

const disclosed = (fixture: BuildStepFixture, rubricVersion: string): boolean =>
  buildRelyingPartySummary(report(fixture, rubricVersion)).notEstablished.includes(DISCLOSURE);

function expectSettledWithoutFinding(fixture: BuildStepFixture): void {
  expect(a3(fixture, WITAN_RUBRIC_VERSION_V26).status).not.toBe('insufficient_data');
  expect(finding(fixture, WITAN_RUBRIC_VERSION_V26)).toBeUndefined();
  expect(disclosed(fixture, WITAN_RUBRIC_VERSION_V26)).toBe(false);
}

function expectAbstainedWithDisclosure(fixture: BuildStepFixture): void {
  const criterion = a3(fixture, WITAN_RUBRIC_VERSION_V26);
  expect(criterion.status).not.toBe('insufficient_data');
  expect(criterion.findings.find((candidate) => candidate.summary === BUILD_FINDING)).toBeUndefined();
  expect(criterion.notes).toContain(DISCLOSURE);
  expect(disclosed(fixture, WITAN_RUBRIC_VERSION_V26)).toBe(true);
  expect(disclosed(fixture, WITAN_RUBRIC_VERSION_V25)).toBe(false);
}

function expectFires(fixture: BuildStepFixture): void {
  const fired = finding(fixture, WITAN_RUBRIC_VERSION_V26);
  expect(fired?.severity).toBe('info');
  expect(fired?.evidence.path).toBe('package.json');
  expect(fired?.evidence.label).toBe('Deployable service manifest without a build or typecheck script');
  expect(disclosed(fixture, WITAN_RUBRIC_VERSION_V26)).toBe(false);
}

describe('B-1: the finding needs something to build or check', () => {
  it('a plain JavaScript service with no tsconfig and no build script: no finding and no disclosure under v26; the finding fires under v25', () => {
    expectSettledWithoutFinding(B1.javascriptService);
    expect(finding(B1.javascriptService, WITAN_RUBRIC_VERSION_V25)?.evidence.path).toBe('package.json');
  });

  it('a declaration file alone is not authored source', () => {
    expectSettledWithoutFinding(B1.declarationOnly);
    expect(finding(B1.declarationOnly, WITAN_RUBRIC_VERSION_V25)).toBeDefined();
  });

  it('TypeScript inside a nested package with its own manifest belongs to that package, not the root', () => {
    expectSettledWithoutFinding(B1.nestedPackageTypeScript);
    expect(finding(B1.nestedPackageTypeScript, WITAN_RUBRIC_VERSION_V25)).toBeDefined();
  });

  it('authored TypeScript source with no tsconfig is something to build: the finding fires', () => {
    expectFires(B1.sourceOnly);
  });

  it('a tsconfig with JavaScript source is something to check: the finding fires', () => {
    expectFires(B1.tsconfigOnly);
  });
});

describe('B-2: a step in any of the four places settles it', () => {
  it('package scripts: a script named `compile` running tsc gives no finding', () => {
    expectSettledWithoutFinding(B2.scripts.positive);
    expect(finding(B2.scripts.positive, WITAN_RUBRIC_VERSION_V25)).toBeDefined();
  });

  it('package scripts: `echo tscope` is not a step, so the finding still fires', () => {
    expectFires(B2.scripts.negative);
  });

  it('CI: `run: npx tsc --noEmit` gives no finding', () => {
    expectSettledWithoutFinding(B2.ci.positive);
    expect(finding(B2.ci.positive, WITAN_RUBRIC_VERSION_V25)).toBeDefined();
  });

  it('CI: a path containing `webpack` and `echo tscope` are not steps, so the finding still fires', () => {
    expectFires(B2.ci.negative);
  });

  it('Dockerfile: `RUN pnpm run build:server`, where that script runs tsup, gives no finding', () => {
    expectSettledWithoutFinding(B2.dockerfile.scriptReference);
  });

  it('Dockerfile: a continued `RUN ... && npx tsc -p .` gives no finding when the step is nowhere else', () => {
    expectSettledWithoutFinding(B2.dockerfile.positive);
    expect(finding(B2.dockerfile.positive, WITAN_RUBRIC_VERSION_V25)).toBeDefined();
  });

  it('Dockerfile: the exec form `RUN ["npx", "tsc", ...]` gives no finding', () => {
    expectSettledWithoutFinding(B2.dockerfile.execForm);
  });

  it('Dockerfile: a path containing `webpack` is not a step, so the finding still fires', () => {
    expectFires(B2.dockerfile.negative);
  });

  it('Makefile: a target running `tsc -p .` gives no finding', () => {
    expectSettledWithoutFinding(B2.recipe.positive);
    expect(finding(B2.recipe.positive, WITAN_RUBRIC_VERSION_V25)).toBeDefined();
  });

  it("justfile: a task runner's `build` target gives no finding", () => {
    expectSettledWithoutFinding(B2.recipe.buildTarget);
  });

  it('Makefile: a path containing `webpack` is not a step, so the finding still fires', () => {
    expectFires(B2.recipe.negative);
  });
});

describe('B-3: a place that was not read leaves it unsettled', () => {
  for (const [label, fixture] of [
    ['a withheld workflow', B3.withheldWorkflow],
    ['a delegated reusable workflow', B3.reusableWorkflow],
    ['a delegated local action', B3.localAction],
    ['the workspace read cap', B3.workspaceCap],
    ['a withheld Dockerfile', B3.withheldDockerfile],
    ['a withheld Makefile', B3.withheldMakefile],
    ['a command Cejel cannot parse', B3.unparseableCommand],
    ['a workspace manifest Cejel cannot parse', B3.unparseableManifest],
    ['a workspace declaration Cejel cannot read', B3.unreadableWorkspaceDeclaration],
    ['a CI system whose commands are not read as `run` steps', B3.otherCiSystem],
  ] as const) {
    it(`${label}: no finding and the disclosure line`, () => {
      expectAbstainedWithDisclosure(fixture);
    });
  }

  it('the v25 finding fires on each B-3 fixture except the workspace cap, which v25 already treats as unread', () => {
    for (const fixture of Object.values(B3)) {
      expect(finding(fixture, WITAN_RUBRIC_VERSION_V25) !== undefined, fixture.name).toBe(
        fixture !== B3.workspaceCap,
      );
    }
  });
});

describe('all three hold', () => {
  it('a TypeScript service with no step anywhere and every place read: the finding fires with its current wording and evidence', () => {
    expectFires(ALL_THREE_HOLD);
    const v25 = finding(ALL_THREE_HOLD, WITAN_RUBRIC_VERSION_V25);
    expect(finding(ALL_THREE_HOLD, WITAN_RUBRIC_VERSION_V26)).toEqual(v25);
  });
});

describe('the explicit-gap chain is not restructured', () => {
  it('where this branch stops firing under v26, the Dockerfile HEALTHCHECK branch that follows it fires', () => {
    expect(finding(CHAIN_HEALTHCHECK, WITAN_RUBRIC_VERSION_V25)).toBeDefined();
    expect(finding(CHAIN_HEALTHCHECK, WITAN_RUBRIC_VERSION_V25, HEALTHCHECK_FINDING)).toBeUndefined();
    expect(finding(CHAIN_HEALTHCHECK, WITAN_RUBRIC_VERSION_V26)).toBeUndefined();
    expect(finding(CHAIN_HEALTHCHECK, WITAN_RUBRIC_VERSION_V26, HEALTHCHECK_FINDING)?.evidence.path).toBe(
      'Dockerfile',
    );
  });
});

describe('metrics, evidence and the other rubrics are unchanged', () => {
  for (const fixture of ALL_BUILD_STEP_FIXTURES) {
    it(`${fixture.name}: A3 metrics and positive evidence are identical under v25 and v26`, () => {
      const v25 = a3(fixture, WITAN_RUBRIC_VERSION_V25);
      const v26 = a3(fixture, WITAN_RUBRIC_VERSION_V26);
      expect(v26.metrics).toEqual(v25.metrics);
      expect(v26.positiveEvidence).toEqual(v25.positiveEvidence);
    });
  }

  it('no rubric but v26 carries the disclosure, and v17 and v20-v25 keep the finding where v25 has it', () => {
    for (const rubric of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V20, WITAN_RUBRIC_VERSION_V22]) {
      expect(disclosed(B3.reusableWorkflow, rubric)).toBe(false);
      expect(a3(B3.reusableWorkflow, rubric).notes ?? '').not.toContain(DISCLOSURE);
    }
    expect(finding(B1.javascriptService, WITAN_RUBRIC_VERSION_V20)).toBeDefined();
    expect(finding(B1.javascriptService, WITAN_RUBRIC_VERSION_V22)).toBeDefined();
    expect(finding(B1.javascriptService, WITAN_RUBRIC_VERSION_V17)).toBeUndefined();
  });
});

describe('the B-2 vocabulary is matched as a command word after shell splitting', () => {
  it.each([
    'tsc',
    'tsc -p tsconfig.build.json',
    'npx tsc --noEmit',
    'pnpm exec vue-tsc --noEmit',
    'yarn tsup src/index.ts',
    'esbuild src/main.ts --bundle --outfile=dist/main.js',
    'swc src -d dist',
    'babel src --out-dir lib',
    'rollup -c',
    'webpack --mode production',
    'webpack-cli build',
    'npx vite build',
    'next build',
    'nest build',
    'ncc build src/index.ts -o dist',
    'parcel build src/index.html',
    'bun build ./src/index.ts --outdir dist',
    'ng build',
    'svelte-check --tsconfig ./tsconfig.json',
    './node_modules/.bin/tsc -b',
    'NODE_ENV=production webpack',
    'cross-env NODE_ENV=production rollup -c',
    'npm ci && npm run build',
    'cd app && tsc -p .',
    '(cd app && tsc -p .)',
    'sh -c "tsc --noEmit"',
    'if [ -f tsconfig.json ]; then tsc --noEmit; fi',
    'pnpm -r typecheck',
    'pnpm --filter api build',
    'yarn workspace api build',
    'turbo run build --filter=api',
    'nx run api:build',
    'nx run-many -t typecheck',
    'lerna run build',
    'make build',
    'just typecheck',
    'tsc \\\n  -p .',
  ])('step: %s', (command) => {
    expect(classifyBuildStepCommand(command)).toBe('step');
  });

  it.each([
    'echo tscope',
    'echo tsc',
    'tscope --version',
    'node tools/webpack-report/index.js',
    'cat webpack.config.js',
    'cp -r config/webpack /srv/config',
    'vite',
    'vite preview',
    'next dev',
    'nest start',
    'npm test',
    'npm run lint',
    'pnpm install --frozen-lockfile',
    'make test',
    'node dist/main.js',
    'echo build',
    'git tag build',
    '# tsc --noEmit',
  ])('no step: %s', (command) => {
    expect(classifyBuildStepCommand(command)).toBe('none');
  });

  it.each([
    'echo "unterminated',
    '$BUILD_COMMAND --prod',
    '${{ matrix.command }}',
    '`which tsc` -p .',
    'npm run $TARGET',
    'pnpm run "${SCRIPT}"',
  ])('unparseable: %s', (command) => {
    expect(classifyBuildStepCommand(command)).toBe('unparseable');
  });
});
