import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17 } from '../rubric-version.js';

// NO SILENT RE-SCORE UNDER THE CALIBRATED DEFAULT — cejel-native.
//
// leaderboard/RUBRIC_CHANGELOG.md cites "the rubric-rescore-protocol regression guard in the
// source monorepo's test suite". That guard lives in BargLabs/alfred, runs against alfred's own
// copy of the scanner (which has diverged from this one), and its golden fixture carries
// `test: 'vitest run'` with test files present — so the three v17 behaviour changes that
// shipped in 0.4.9 (#303: test-script content check, A1 authenticated-absence credits,
// PR-template directory form) touched nothing it measures. It could not have fired for this
// repository under any version string. This file is the guard that can.
//
// Each fixture below is the minimal repository shape one of those changes moves. Its full v17
// report is pinned by sha256, plus the specific metric each change moves, so a future change
// to v17 scoring under the SAME rubric identifier fails here by name and cannot ship without a
// RUBRIC_CHANGELOG.md entry and a human re-pinning the numbers. Pins were captured on
// origin/main fe4210a (2026-09-15). Demonstrated red against the v0.4.8 source (7606392):
// every fixture's report hash differs and the named metrics move exactly as the 0.4.9 entry
// records.
//
// Fixture git is hermetic (see v23-declared-scope-byte-stability.test.ts for why): global and
// system config masked, identity and dates via env, commits unsigned, fixture commit sha
// asserted first so environmental drift fails as "fixture not reproducible", never as a
// scoring change.
//
// Re-pinned once, for report format 1.2 (goal_cejel_rubric_behaviour_fingerprint_2026-09-15):
// report.json gained `rubricBehaviourFingerprint`, so every full-report hash below moved while
// every pinned METRIC stayed put. That split is the point — the metric pins are the scoring
// assertion and the hash pins are the byte assertion, and a format change moves only the second.
// The mechanical proof that the added field is the whole delta is in
// src/__tests__/index.test.ts ("byte-identical report artifacts"), which deletes exactly that key
// and recovers the 0.4.9 bytes. Recorded in leaderboard/RUBRIC_CHANGELOG.md, 2026-09-16 entry.
//
// This file is now the narrow, per-shape guard; the broad one is
// rubric-behaviour-fingerprint.test.ts, which scores a thirteen-fixture corpus under every
// selectable rubric. Both stay: this one names the exact 0.4.9 metrics and directions, which a
// digest cannot.
//
// Re-pinned a second time, for report format 1.3 (goal_cejel_withheld_paths_always_disclosed_
// 2026-09-22): report.json gained an always-present `withheldPaths` field (empty on these
// fixtures, none of which have an oversized/unreadable/withheld file), so every hash below moved
// while every pinned METRIC — checked first, on the line above the hash assertion — stayed put.
// That was originally stated only as a comment; each fixture's `oldReportSha256` (recovered from
// `git show v0.4.10:src/witan/__tests__/v17-scoring-surface-golden.test.ts`, the last capture of
// this file before that change) and the assertion in the loop below make it mechanical: delete
// `withheldPaths` from the current report and re-serialize it (`JSON.stringify(report)`, matching
// how `reportSha256` above is computed) to prove that field is the only delta.

const HERMETIC_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
  GIT_AUTHOR_DATE: '2026-09-15T00:00:00+00:00',
  GIT_COMMITTER_DATE: '2026-09-15T00:00:00+00:00',
  TZ: 'UTC',
};

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' });
}

function writeFile(dir: string, rel: string, content: string): void {
  mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(join(dir, rel), content, 'utf8');
}

interface Fixture {
  readonly name: string;
  readonly files: Record<string, string>;
  readonly fixtureHeadSha: string;
  readonly reportSha256: string;
  /** Pre-1.3 pin (before the additive withheldPaths field), recovered from v0.4.10. */
  readonly oldReportSha256: string;
  /** criterionId.metricName -> pinned value */
  readonly pinnedMetrics: Record<string, number | null>;
}

const TEST_FILE = "import { expect, it } from 'vitest';\nit('works', () => expect(1).toBe(1));\n";
const CI = 'name: ci\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n';

const FIXTURES: readonly Fixture[] = [
  {
    // 0.4.9 change 1, direction DOWN, the shape that moved django/vite/alfred on the corpus:
    // a real test entrypoint that delegates to a runner the content check does not name.
    name: 'delegating-test-script',
    files: {
      'package.json': JSON.stringify(
        { name: 'f', version: '1.0.0', scripts: { test: 'turbo test', lint: 'eslint .', typecheck: 'tsc --noEmit', build: 'tsc' } },
        null,
        2,
      ),
      'src/index.ts': 'export const value = 1;\n',
      'src/index.test.ts': TEST_FILE,
      '.github/workflows/ci.yml': CI,
      'README.md': '# fixture\n',
    },
    fixtureHeadSha: '57528d5757b04f14b3b21adb41163866ff428242',
    reportSha256: '4148f107f8c0c8f4ddd4ba8211995db7520643812d323c98db42ec836b628cc7',
    oldReportSha256: '7e9c7cbf7d9e8f0b1ca447ca8b42ec3615d8513e06c2164583aa7be9d51840dd',
    // v0.4.8: ci_script_depth 5. The CI workflow still credits A1's test command (`npm test`
    // in ci.yml), so A1.verification_script_ratio is 3 on both sides — only B3 moves.
    pinnedMetrics: { 'B3.ci_script_depth': 4, 'A1.verification_script_ratio': 3 },
  },
  {
    // 0.4.9 change 1, direction DOWN, the shape the change was written for: npm's default
    // placeholder, which pre-0.4.9 was credited identically to a real runner.
    name: 'npm-placeholder-test-script',
    files: {
      'package.json': JSON.stringify(
        { name: 'f', version: '1.0.0', scripts: { test: 'echo "Error: no test specified" && exit 1', lint: 'eslint .', build: 'tsc' } },
        null,
        2,
      ),
      'src/index.ts': 'export const value = 1;\n',
      'src/index.test.ts': TEST_FILE,
      'README.md': '# fixture\n',
    },
    fixtureHeadSha: '92be8bb76999ef1ea948ca3ed3e6dc7397b14fd2',
    reportSha256: '80127d6130c4333b381486e15ecd7754c6836a25ba69eb2d61e5760e1a5d14ed',
    oldReportSha256: '60fe4d3762c96820669b526f9ac59503c2ebd1f2dd171cf7d690ae2475fd4688',
    // v0.4.8: ci_script_depth 3, verification_script_ratio 2, overall 1.4 (now 1.1).
    pinnedMetrics: { 'B3.ci_script_depth': 2, 'A1.verification_script_ratio': 1 },
  },
  {
    // 0.4.9 change 2, direction UP: package-level lint/typecheck, no test files, so A1 takes
    // its authenticated-absence path — which pre-0.4.9 zeroed lint/typecheck too.
    name: 'lint-typecheck-no-tests',
    files: {
      'package.json': JSON.stringify(
        { name: 'f', version: '1.0.0', scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' } },
        null,
        2,
      ),
      'src/index.ts': 'export const value = 1;\n',
      'src/util.ts': 'export const other = 2;\n',
      'README.md': '# fixture\n',
    },
    fixtureHeadSha: 'e3d5165eb7fcbc480718d4b93088f8e586f20535',
    reportSha256: 'ee12a81cbadd11f81999fa7fcb54ec1d660966494e7a6414fd1c80e86fe26c4d',
    oldReportSha256: 'f8563bde4d02b210d1a6118abd6f73c123e4f686bdd72c7bc0e8faf7bd6e959c',
    // v0.4.8: verification_script_ratio 0, A1 score 0, overall 0.8 (now 2 / 0.5 / 0.9).
    pinnedMetrics: { 'A1.verification_script_ratio': 2 },
  },
  {
    // 0.4.9 change 3, direction UP: GitHub's directory form of the PR template, which
    // pre-0.4.9 read as no template at all.
    name: 'pr-template-directory-form',
    files: {
      'package.json': JSON.stringify({ name: 'f', version: '1.0.0', scripts: { test: 'vitest run' } }, null, 2),
      'src/index.ts': 'export const value = 1;\n',
      'src/index.test.ts': TEST_FILE,
      '.github/PULL_REQUEST_TEMPLATE/feature.md': '# Feature\n',
      '.github/workflows/ci.yml': CI,
      'README.md': '# fixture\n',
    },
    fixtureHeadSha: 'b72b860e9fbba8005bf25328de8fe68954169f38',
    reportSha256: '5ddfc7cf6b45c0cdbe32d45cebb1e4aca0130f0d40223fd2e40b579ae75f44df',
    oldReportSha256: 'cdd35ca03149707985d2130731b4d0f7c9d3953c74a341854097c3d30c2b9c94',
    // v0.4.8: pr_trace_primitives 1, B2 score 1.6, overall 1.3 (now 2 / 3.2 / 1.7).
    pinnedMetrics: { 'B2.pr_trace_primitives': 2 },
  },
];

function buildFixture(fixture: Fixture): string {
  const dir = mkdtempSync(join(tmpdir(), `witan-v17-golden-${fixture.name}-`));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  for (const [rel, content] of Object.entries(fixture.files)) writeFile(dir, rel, content);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', 'initial commit']);
  return dir;
}

function metricValue(report: ReturnType<typeof scoreRepoWithPublicCejel>, key: string): number | null {
  const [criterionId, metricName] = key.split('.');
  const criterion = report.criteria.find((c) => c.id === criterionId);
  const metric = criterion?.metrics?.find((m) => m.name === metricName);
  return metric?.value ?? null;
}

describe('v17 scoring surface is pinned — a behaviour change under the calibrated default cannot ship unrecorded', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: fixture reproduces, report hash and named metrics match their pins`, () => {
      const dir = buildFixture(fixture);
      expect(
        git(dir, ['rev-parse', 'HEAD']).trim(),
        'fixture commit is not reproducible on this machine — nothing below is interpretable',
      ).toBe(fixture.fixtureHeadSha);
      const report = scoreRepoWithPublicCejel({
        repoPath: dir,
        productSlug: fixture.name,
        productDisplayName: fixture.name,
        generatedAt: '2026-09-15T00:00:00.000Z',
        rubricVersion: WITAN_RUBRIC_VERSION_V17,
        ingestPatterns: [],
        autoDiscoverIngest: false,
      });
      const observed: Record<string, number | null> = {};
      for (const key of Object.keys(fixture.pinnedMetrics)) observed[key] = metricValue(report, key);
      expect(observed, `${fixture.name}: a pinned v17 metric moved — record it in leaderboard/RUBRIC_CHANGELOG.md and re-pin`).toEqual(fixture.pinnedMetrics);
      const hash = createHash('sha256').update(JSON.stringify(report)).digest('hex');
      expect(hash, `${fixture.name}: v17 report changed under an unchanged rubric identifier — record it in leaderboard/RUBRIC_CHANGELOG.md and re-pin`).toBe(fixture.reportSha256);

      const { withheldPaths, ...withoutWithheldPaths } = report as unknown as Record<string, unknown>;
      expect(withheldPaths).toEqual([]);
      expect(
        createHash('sha256').update(JSON.stringify(withoutWithheldPaths)).digest('hex'),
        `${fixture.name}: the pre-1.3 report bytes must be recoverable by removing exactly the withheldPaths field`,
      ).toBe(fixture.oldReportSha256);
    });
  }
});
