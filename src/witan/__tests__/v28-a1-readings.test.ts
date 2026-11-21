import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { readV28A1Readings } from '../repo-signals.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V27, WITAN_RUBRIC_VERSION_V28 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';
import { BEHAVIOUR_CORPUS, HERMETIC_GIT_ENV, buildBehaviourFixture } from './fixtures/behaviour-corpus.js';
import {
  V28_A1_FIXTURES,
  V28_ITEM_B_FIXTURES,
  V28_ITEM_B_NEGATIVE_FIXTURES,
  V28_ITEM_D_FIXTURES,
  V28_NO_READING_FIXTURES,
  type V28A1Fixture,
} from './fixtures/v28-a1-readings-fixtures.js';

// goal_cejel_v28_declaration_and_a1_readings_2026-11-20 (operator rulings 35 and 36, 20 Nov). v28 is
// v27 plus three A1 readings: coverage switched on by a flag, a runner config block or a runner
// plug-in counts as configured (item B); a repository is lean only where every configured runner is
// (item C); .NET test projects, Flutter and react-scripts are configured runners (item D). v28 may
// score above v27 only by those items, and each fixture that does is named below with its item.

const NO_COVERAGE = /no coverage configuration/i;
const NO_TEST_FILES = /A test runner is configured, but .*no concrete test file/i;
const AUTHENTICATED_ABSENCE = /^Reviewable source is present, but .*no concrete test file, configured test runner/i;

const dirs = new Map<string, string>();
const reports = new Map<string, Map<string, WitanReport>>();

function makeRepo(fixture: V28A1Fixture): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-v28-a1-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: HERMETIC_GIT_ENV, stdio: 'pipe' });
  git('init', '--quiet');
  for (const [relativePath, contents] of Object.entries(fixture.files)) {
    const path = join(dir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }
  git('add', '--all');
  git('commit', '--quiet', '--no-gpg-sign', '-m', 'synthetic');
  return dir;
}

function score(name: string, rubricVersion: string): WitanReport {
  const dir = dirs.get(name) as string;
  const byRubric = reports.get(name) ?? new Map<string, WitanReport>();
  reports.set(name, byRubric);
  const cached = byRubric.get(rubricVersion);
  if (cached) return cached;
  const report = scoreRepoWithPublicCejel({
    repoPath: dir,
    productSlug: 'synthetic-v28',
    productDisplayName: 'Synthetic v28',
    generatedAt: '2026-11-20T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  byRubric.set(rubricVersion, report);
  return report;
}

const a1 = (name: string, rubricVersion: string) => {
  const criterion = score(name, rubricVersion).criteria.find(({ id }) => id === 'A1');
  if (!criterion) throw new Error(`${name}: no A1 under ${rubricVersion}`);
  return criterion;
};
const finding = (name: string, rubricVersion: string, pattern: RegExp) =>
  a1(name, rubricVersion).findings.find(({ summary }) => pattern.test(summary));
const metricValue = (name: string, rubricVersion: string, metric: string) =>
  a1(name, rubricVersion).metrics?.find((candidate) => candidate.name === metric)?.value;
const trackedFiles = (dir: string): string[] =>
  execFileSync('git', ['ls-files', '-z'], { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' }).split('\0').filter(Boolean);

beforeAll(() => {
  for (const fixture of V28_A1_FIXTURES) dirs.set(fixture.name, makeRepo(fixture));
}, 120_000);

// main's v27 reading of each item B fixture: whether the no-coverage finding fires.
const ITEM_B_V27_FINDING: Readonly<Record<string, boolean>> = {
  'v28b-script-coverage-flag': false,
  'v28b-unreached-script-coverage-flag': true,
  'v28b-vitest-coverage-block': false,
  'v28b-jest-collect-coverage': false,
  'v28b-jest-json-collect-coverage': true,
  'v28b-pytest-cov-in-ci': false,
  'v28b-pytest-cov-in-tox-commands': true,
  'v28b-pytest-cov-in-addopts': true,
  'v28b-pytest-cov-plugin-in-pyproject': true,
  'v28b-pytest-cov-plugin-in-requirements': true,
  'v28b-dotnet-xplat-collect-in-ci': false,
  'v28b-flutter-test-coverage-in-ci': false,
};

// The source each item B fixture's reading cites, at its line.
const ITEM_B_SOURCE: Readonly<Record<string, { path: string; line: number }>> = {
  'v28b-script-coverage-flag': { path: 'package.json', line: 6 },
  'v28b-unreached-script-coverage-flag': { path: 'package.json', line: 7 },
  'v28b-vitest-coverage-block': { path: 'vitest.config.ts', line: 5 },
  'v28b-jest-collect-coverage': { path: 'jest.config.js', line: 2 },
  'v28b-jest-json-collect-coverage': { path: 'jest.config.json', line: 2 },
  'v28b-pytest-cov-in-ci': { path: '.github/workflows/test.yml', line: 9 },
  'v28b-pytest-cov-in-tox-commands': { path: 'tox.ini', line: 7 },
  'v28b-pytest-cov-in-addopts': { path: 'pyproject.toml', line: 6 },
  'v28b-pytest-cov-plugin-in-pyproject': { path: 'pyproject.toml', line: 8 },
  'v28b-pytest-cov-plugin-in-requirements': { path: 'requirements-dev.txt', line: 2 },
  'v28b-dotnet-xplat-collect-in-ci': { path: '.github/workflows/test.yml', line: 8 },
  'v28b-flutter-test-coverage-in-ci': { path: '.github/workflows/test.yml', line: 8 },
};

describe('item B: coverage switched on by a flag, a config block or a plug-in', () => {
  for (const { name } of V28_ITEM_B_FIXTURES) {
    it(`${name}: no no-coverage finding under v28, the source cited at its line, coverage_percent unchanged`, () => {
      expect(finding(name, WITAN_RUBRIC_VERSION_V28, NO_COVERAGE)).toBeUndefined();
      const source = ITEM_B_SOURCE[name] as { path: string; line: number };
      expect(
        a1(name, WITAN_RUBRIC_VERSION_V28).evidence.some(
          (pointer) => pointer.kind === 'coverage' && pointer.path === source.path && pointer.line === source.line,
        ),
        JSON.stringify(a1(name, WITAN_RUBRIC_VERSION_V28).evidence),
      ).toBe(true);
      expect(metricValue(name, WITAN_RUBRIC_VERSION_V28, 'coverage_percent')).toBe(
        metricValue(name, WITAN_RUBRIC_VERSION_V27, 'coverage_percent'),
      );
    });
    it(`${name}: under v27, as on main`, () => {
      expect(finding(name, WITAN_RUBRIC_VERSION_V27, NO_COVERAGE) !== undefined).toBe(ITEM_B_V27_FINDING[name]);
    });
  }

  for (const { name } of V28_ITEM_B_NEGATIVE_FIXTURES) {
    it(`${name}: the no-coverage finding still fires under v28 and v27`, () => {
      expect(finding(name, WITAN_RUBRIC_VERSION_V28, NO_COVERAGE)).toBeDefined();
      expect(finding(name, WITAN_RUBRIC_VERSION_V27, NO_COVERAGE)).toBeDefined();
      expect(a1(name, WITAN_RUBRIC_VERSION_V28).evidence.filter(({ kind }) => kind === 'coverage')).toEqual([]);
    });
  }
});

describe('item C: a repository is lean only where every configured runner is lean', () => {
  const mixed = 'v28c-node-test-sdk-beside-pytest-suite';
  it(`${mixed}: v28's no-coverage finding fires for the pytest suite, and the lean evidence is still cited`, () => {
    const fired = finding(mixed, WITAN_RUBRIC_VERSION_V28, NO_COVERAGE);
    expect(fired).toBeDefined();
    expect(fired?.evidence?.path).toBe('tests/test_core.py');
    expect(a1(mixed, WITAN_RUBRIC_VERSION_V28).evidence.some(({ label }) => /^Lean built-in test toolchain/.test(label))).toBe(true);
  });
  it(`${mixed}: v27 reads it as lean, as on main`, () => {
    expect(finding(mixed, WITAN_RUBRIC_VERSION_V27, NO_COVERAGE)).toBeUndefined();
  });
  const leanOnly = 'v28c-node-test-only';
  it(`${leanOnly}: keeps the lean reading under v28`, () => {
    expect(finding(leanOnly, WITAN_RUBRIC_VERSION_V28, NO_COVERAGE)).toBeUndefined();
    expect(a1(leanOnly, WITAN_RUBRIC_VERSION_V28).evidence.some(({ label }) => /^Lean built-in test toolchain/.test(label))).toBe(true);
    expect(projectWitanScoringSurface(score(leanOnly, WITAN_RUBRIC_VERSION_V28))).toEqual(
      projectWitanScoringSurface(score(leanOnly, WITAN_RUBRIC_VERSION_V27)),
    );
  });
});

const ITEM_D_RUNNER: Readonly<Record<string, { path: string; line: number }>> = {
  'v28d-dotnet-test-project': { path: 'tests/Synthetic.Tests/Synthetic.Tests.csproj', line: 6 },
  'v28d-flutter-test-project': { path: 'pubspec.yaml', line: 10 },
  'v28d-react-scripts-test-project': { path: 'package.json', line: 8 },
  'v28d-react-scripts-no-test-files': { path: 'package.json', line: 8 },
  'v28d-dotnet-coverlet-collector': { path: 'tests/Synthetic.Tests/Synthetic.Tests.csproj', line: 6 },
};

describe('item D: .NET test projects, Flutter and react-scripts are configured runners', () => {
  for (const { name } of V28_ITEM_D_FIXTURES) {
    it(`${name}: the runner is cited at the line that establishes it under v28, and not under v27`, () => {
      const runner = ITEM_D_RUNNER[name] as { path: string; line: number };
      const cites = (rubricVersion: string) =>
        a1(name, rubricVersion).evidence.some(
          (pointer) => /^Configured test runner/.test(pointer.label) && pointer.path === runner.path && pointer.line === runner.line,
        );
      expect(cites(WITAN_RUBRIC_VERSION_V28), JSON.stringify(a1(name, WITAN_RUBRIC_VERSION_V28).evidence)).toBe(true);
      expect(cites(WITAN_RUBRIC_VERSION_V27)).toBe(false);
    });
  }
  for (const name of ['v28d-dotnet-test-project', 'v28d-flutter-test-project', 'v28d-react-scripts-test-project']) {
    it(`${name}: with test files and no coverage, v28's no-coverage finding fires; v27's does not`, () => {
      expect(finding(name, WITAN_RUBRIC_VERSION_V28, NO_COVERAGE)).toBeDefined();
      expect(finding(name, WITAN_RUBRIC_VERSION_V27, NO_COVERAGE)).toBeUndefined();
    });
  }
  it('v28d-dotnet-coverlet-collector: the coverage plug-in counts under v28, cited at its line', () => {
    const name = 'v28d-dotnet-coverlet-collector';
    expect(finding(name, WITAN_RUBRIC_VERSION_V28, NO_COVERAGE)).toBeUndefined();
    expect(
      a1(name, WITAN_RUBRIC_VERSION_V28).evidence.some(
        ({ kind, path, line }) => kind === 'coverage' && path === 'tests/Synthetic.Tests/Synthetic.Tests.csproj' && line === 8,
      ),
    ).toBe(true);
  });
  it('v28d-react-scripts-no-test-files: v28 says no test files where main gives the authenticated absence', () => {
    const name = 'v28d-react-scripts-no-test-files';
    expect(finding(name, WITAN_RUBRIC_VERSION_V28, NO_TEST_FILES)).toBeDefined();
    expect(finding(name, WITAN_RUBRIC_VERSION_V28, AUTHENTICATED_ABSENCE)).toBeUndefined();
    expect(finding(name, WITAN_RUBRIC_VERSION_V27, AUTHENTICATED_ABSENCE)).toBeDefined();
    expect(finding(name, WITAN_RUBRIC_VERSION_V27, NO_TEST_FILES)).toBeUndefined();
  });
});

// Every fixture on which v28 scores above v27 anywhere (composite, either trust score, or any
// criterion), with the item whose reading raises it. Each is listed in the RUBRIC_CHANGELOG entry.
export const V28_DECLARED_RISES: Readonly<Record<string, 'B' | 'C' | 'D'>> = {
  'v28d-dotnet-test-project': 'D',
  'v28d-flutter-test-project': 'D',
  'v28d-react-scripts-test-project': 'D',
  'v28d-react-scripts-no-test-files': 'D',
  'v28d-dotnet-coverlet-collector': 'D',
  // Item B fixtures whose runner only v28 recognises: the rise is item D's runner credit.
  'v28b-dotnet-xplat-collect-in-ci': 'D',
  'v28b-flutter-test-coverage-in-ci': 'D',
};

function rises(v27: WitanReport, v28: WitanReport): string[] {
  const moved: string[] = [];
  const above = (a: number | null | undefined, b: number | null | undefined) => typeof a === 'number' && typeof b === 'number' && a > b;
  if (above(v28.overallScore, v27.overallScore)) moved.push('overallScore');
  if (above(v28.codeTrustScore, v27.codeTrustScore)) moved.push('codeTrustScore');
  if (above(v28.processTrustScore, v27.processTrustScore)) moved.push('processTrustScore');
  if (v28.overallScore !== null && v27.overallScore === null) moved.push('overallScore (v27 abstained)');
  for (const criterion of v28.criteria) {
    const before = v27.criteria.find(({ id }) => id === criterion.id);
    if (above(criterion.score, before?.score)) moved.push(criterion.id);
  }
  return moved;
}

describe('no rise above v27 except by items B to D', () => {
  it('every v28 rise over v27 is a declared fixture whose item B to D reading applies, and every declared rise rises', () => {
    const undeclared: string[] = [];
    for (const { name } of V28_A1_FIXTURES) {
      const moved = rises(score(name, WITAN_RUBRIC_VERSION_V27), score(name, WITAN_RUBRIC_VERSION_V28));
      const item = V28_DECLARED_RISES[name];
      if (moved.length > 0 && item === undefined) undeclared.push(`${name}: ${moved.join(', ')}`);
      if (item !== undefined) {
        expect(moved.length, `${name} is declared to rise by item ${item}, but does not`).toBeGreaterThan(0);
        const dir = dirs.get(name) as string;
        expect(readV28A1Readings(dir, trackedFiles(dir)).items, name).toContain(item);
      }
    }
    expect(undeclared).toEqual([]);
  });

  it("where no item B to D reading applies, v28's scoring surface and A1 evidence are v27's", () => {
    for (const { name } of V28_NO_READING_FIXTURES) {
      const dir = dirs.get(name) as string;
      expect(readV28A1Readings(dir, trackedFiles(dir)).items, name).toEqual([]);
      expect(projectWitanScoringSurface(score(name, WITAN_RUBRIC_VERSION_V28)), name).toEqual(
        projectWitanScoringSurface(score(name, WITAN_RUBRIC_VERSION_V27)),
      );
      expect(a1(name, WITAN_RUBRIC_VERSION_V28).evidence, name).toEqual(a1(name, WITAN_RUBRIC_VERSION_V27).evidence);
    }
  });

  it('on the behaviour corpus, v28 never rises above v27 where no item B to D reading applies', () => {
    const offending: string[] = [];
    for (const fixture of BEHAVIOUR_CORPUS) {
      const dir = buildBehaviourFixture(fixture);
      const options = {
        repoPath: dir,
        productSlug: fixture.name,
        productDisplayName: fixture.name,
        generatedAt: '2026-11-20T00:00:00.000Z',
        ingestPatterns: [],
        autoDiscoverIngest: false,
      };
      const v27 = scoreRepoWithPublicCejel({ ...options, rubricVersion: WITAN_RUBRIC_VERSION_V27 });
      const v28 = scoreRepoWithPublicCejel({ ...options, rubricVersion: WITAN_RUBRIC_VERSION_V28 });
      const items = readV28A1Readings(dir, trackedFiles(dir)).items;
      if (items.length === 0) {
        if (JSON.stringify(projectWitanScoringSurface(v28)) !== JSON.stringify(projectWitanScoringSurface(v27))) {
          offending.push(`${fixture.name}: scoring surface differs with no v28 reading`);
        }
      } else if (rises(v27, v28).length > 0 && V28_DECLARED_RISES[fixture.name] === undefined) {
        offending.push(`${fixture.name}: ${rises(v27, v28).join(', ')} (items ${items.join(', ')})`);
      }
    }
    expect(offending).toEqual([]);
  }, 300_000);
});
