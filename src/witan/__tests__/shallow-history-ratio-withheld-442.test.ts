import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { SHALLOW_HISTORY_LIMITATION } from '../history-depth.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { HERMETIC_GIT_ENV } from './fixtures/behaviour-corpus.js';

// #442, operator decision of 2026-10-27, which revises #603's: on a shallow clone with fewer than
// the twelve commits B2's pull-request merge ratio reads, B2 keeps scoring the evidence it reads
// from the checked-out files (pr_trace_primitives: CI workflows, the pull-request template, a
// review-gate record) and withholds only pr_merge_ratio. Withholding all of B2, as #603 did, took
// that file evidence out of the composite with the ratio, and a default actions/checkout could
// then fall a verdict band below its own full clone.
//
// The matrix, built synthetically: forty commits whose subjects are all pull-request merges, none,
// or alternating; the checked-out files carrying a CI workflow and a pull-request template, a CI
// workflow alone, or no PR-trace file at all; each scanned as a full clone and at depths 1, 5, 11
// (just under the window) and 12 (at it). Every shallow row is compared with the same
// repository's full clone, never only with main.
//
// v27 was unchanged by the 27 Oct decision, abstaining on B2 as a read failure kept in the
// composite at 0, until the v27 freeze change F1 (2026-10-28) put it on this path too.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const WINDOW = 12;
const COMMITS = 40;

const HISTORIES = ['pr-merges', 'no-pr-merges', 'mixed'] as const;
const EVIDENCE = ['ci-and-template', 'ci-only', 'none'] as const;
const DEPTHS = [1, 5, WINDOW - 1, WINDOW] as const;
type History = (typeof HISTORIES)[number];
type Evidence = (typeof EVIDENCE)[number];

const BASE_FILES: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "cachelib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# cachelib\n\nA small cache library.\n',
  LICENSE: 'MIT\n',
  '.gitignore': '.env\n__pycache__/\n',
  '.env.example': 'CACHE_URL=\n',
  'src/cachelib/__init__.py': 'def get(cache, key, default=None):\n    return cache.get(key, default)\n',
  'src/cachelib/config.py': 'import os\n\nCACHE_URL = os.environ.get("CACHE_URL", "")\n',
  'tests/test_cache.py': 'from cachelib import get\n\n\ndef test_get_default():\n    assert get({}, "a", 1) == 1\n',
};
const CI_WORKFLOW =
  'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n';

function files(evidence: Evidence): Record<string, string> {
  return {
    ...BASE_FILES,
    ...(evidence === 'none' ? {} : { '.github/workflows/ci.yml': CI_WORKFLOW }),
    ...(evidence === 'ci-and-template' ? { '.github/pull_request_template.md': '## Summary\n' } : {}),
  };
}

function isMergeSubject(history: History, index: number): boolean {
  return history === 'pr-merges' || (history === 'mixed' && index % 2 === 1);
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: HERMETIC_GIT_ENV,
    encoding: 'utf8',
  }).trim();
}

/** COMMITS commits: the files, then one module per commit, each subject shaped by the history. */
function buildOrigin(history: History, evidence: Evidence): string {
  const dir = mkdtempSync(join(tmpdir(), `cejel-442-v2-${history}-${evidence}-`));
  git(dir, ['init', '--quiet']);
  for (const [path, contents] of Object.entries(files(evidence))) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'initial commit']);
  for (let index = 1; index < COMMITS; index += 1) {
    writeFileSync(join(dir, 'src', 'cachelib', `m${index}.py`), `VALUE_${index} = ${index}\n`);
    git(dir, ['add', '-A']);
    git(dir, [
      'commit',
      '--quiet',
      '-m',
      isMergeSubject(history, index) ? `Merge pull request #${index} from contributor/topic-${index}` : `add module ${index}`,
    ]);
  }
  return dir;
}

function clone(origin: string, depth?: number): string {
  const target = join(mkdtempSync(join(tmpdir(), 'cejel-442-v2-clone-')), 'repo');
  git(tmpdir(), [
    '-c',
    'protocol.file.allow=always',
    'clone',
    '--quiet',
    ...(depth === undefined ? [] : ['--depth', String(depth)]),
    `file://${origin}`,
    target,
  ]);
  return target;
}

function scan(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'shallow-history-442',
    productDisplayName: 'Shallow history #442',
    generatedAt: '2026-10-27T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function criterion(report: WitanReport, id: string): WitanCriterionScore {
  const found = report.criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

/** A metric's normalized value, as scoreMetrics reads it. */
function normalized(score: WitanCriterionScore, name: string): number | undefined {
  const metric = score.metrics.find((entry) => entry.name === name);
  if (!metric) return undefined;
  return metric.max ? Math.min(metric.value / metric.max, 1) : Math.min(metric.value, 1);
}

const compare = (shallow: number, full: number) => (shallow < full ? 'below' : shallow > full ? 'above' : 'equal');
const BAND = ['unverified', 'at_risk', 'conditional', 'verified'];
// Higher is better, so compare() reads it the same way as a score.
const SEVERITY: Readonly<Record<string, number>> = { critical: 0, warning: 1, info: 2, verified: 3 };

interface Row {
  readonly history: History;
  readonly evidence: Evidence;
  readonly depth: number;
  readonly rubric: string;
  readonly full: WitanReport;
  readonly shallow: WitanReport;
}

let rows: Row[];

beforeAll(() => {
  rows = [];
  for (const history of HISTORIES) {
    for (const evidence of EVIDENCE) {
      const origin = buildOrigin(history, evidence);
      const fullPath = clone(origin);
      expect(git(fullPath, ['rev-parse', '--is-shallow-repository'])).toBe('false');
      const full = new Map([V17, V27].map((rubric) => [rubric, scan(fullPath, rubric)]));
      for (const depth of DEPTHS) {
        const shallowPath = clone(origin, depth);
        expect(git(shallowPath, ['rev-parse', '--is-shallow-repository'])).toBe('true');
        expect(Number(git(shallowPath, ['rev-list', '--count', 'HEAD']))).toBe(depth);
        for (const rubric of [V17, V27]) {
          rows.push({ history, evidence, depth, rubric, full: full.get(rubric)!, shallow: scan(shallowPath, rubric) });
        }
      }
    }
  }
}, 300_000);

const underWindow = (row: Row) => row.depth < WINDOW;
const hasPrTraceFiles = (row: Row) => row.evidence !== 'none';

describe('#442 (27 Oct): on a shallow clone B2 keeps its file evidence and withholds only the ratio', () => {
  it('v17, under the window: B2 is scored on pr_trace_primitives alone, with the full clone\'s file evidence', () => {
    const subject = rows.filter((row) => row.rubric === V17 && underWindow(row) && hasPrTraceFiles(row));
    expect(subject.length).toBe(HISTORIES.length * 2 * 3);
    for (const row of subject) {
      const label = `${row.history} ${row.evidence} depth ${row.depth}`;
      const full = criterion(row.full, 'B2');
      const shallow = criterion(row.shallow, 'B2');
      expect(shallow.status, label).not.toBe('insufficient_data');
      expect(shallow.metrics.map(({ name }) => name), label).toEqual(['pr_trace_primitives']);
      expect(full.metrics.map(({ name }) => name), label).toEqual(['pr_trace_primitives', 'pr_merge_ratio']);
      const { appliedWeightShare: _shallowShare, ...shallowPrimitives } = shallow.metrics[0]!;
      const { appliedWeightShare: _fullShare, ...fullPrimitives } = full.metrics[0]!;
      expect(shallowPrimitives, label).toEqual(fullPrimitives);
      expect(shallow.evidence, label).toEqual(full.evidence);
      expect(shallow.notes ?? '', label).toMatch(
        /^B2 abstained from the pull-request merge ratio only: this repository is a shallow clone with fewer than 12 commits visible, so the pull-request merge ratio cannot be read over its window\./,
      );
    }
  });

  it('v17, under the window: B2 is below the full clone only where the full clone\'s ratio is better than its file evidence, above only where it is worse', () => {
    for (const row of rows.filter((entry) => entry.rubric === V17 && underWindow(entry) && hasPrTraceFiles(entry))) {
      const label = `${row.history} ${row.evidence} depth ${row.depth}`;
      const full = criterion(row.full, 'B2');
      const shallow = criterion(row.shallow, 'B2');
      const ratio = normalized(full, 'pr_merge_ratio')!;
      const primitives = normalized(full, 'pr_trace_primitives')!;
      const direction = compare(shallow.score, full.score);
      if (direction === 'below') expect(ratio, label).toBeGreaterThan(primitives);
      if (direction === 'above') expect(ratio, label).toBeLessThan(primitives);
      if (ratio === primitives) expect(direction, label).toBe('equal');
      // v17's calibrated B2 status reads the ratio itself (calibratedCriterionStateV11: verified when
      // it is positive, warning when it is 0). With the ratio withheld the status comes from the
      // score bands, so it falls below the full clone's only where the full clone's verified rested
      // on a positive ratio, and rises above it only where the full clone's ratio was 0 or worse
      // than its file evidence.
      const status = compare(SEVERITY[shallow.status]!, SEVERITY[full.status]!);
      if (status === 'below') expect(ratio, label).toBeGreaterThan(0);
      if (status === 'above') expect(ratio === 0 || ratio < primitives, label).toBe(true);
    }
  });

  it('v17, under the window: the display-only disclosure says B2 left the ratio out and was scored on the files', () => {
    for (const row of rows.filter((entry) => entry.rubric === V17 && entry.depth < WINDOW)) {
      expect(row.shallow.historyLimitations).toEqual([SHALLOW_HISTORY_LIMITATION]);
      expect(row.full.historyLimitations).toBeUndefined();
    }
    expect(SHALLOW_HISTORY_LIMITATION).toContain('leaves that ratio out when fewer commits are visible than it reads');
    expect(SHALLOW_HISTORY_LIMITATION).not.toContain('left out of the composite');
  });

  it('v17: every criterion but B2 scores on a shallow clone exactly as on its full clone, so the overall moves only with B2', () => {
    for (const row of rows.filter((entry) => entry.rubric === V17)) {
      const label = `${row.history} ${row.evidence} depth ${row.depth}`;
      const others = (report: WitanReport) =>
        report.criteria.filter(({ id }) => id !== 'B2').map(({ id, status, score }) => ({ id, status, score }));
      expect(others(row.shallow), label).toEqual(others(row.full));
      expect(row.shallow.codeTrustScore, label).toBe(row.full.codeTrustScore);
      const b2 = compare(criterion(row.shallow, 'B2').score, criterion(row.full, 'B2').score);
      const overall = compare(row.shallow.overallScore!, row.full.overallScore!);
      if (overall !== 'equal') expect(overall, label).toBe(b2);
      const band = compare(BAND.indexOf(row.shallow.verdict), BAND.indexOf(row.full.verdict));
      if (band !== 'equal') expect(band, label).toBe(b2);
    }
  });

  it('v17, at the window and without PR-trace files: B2 and the report match the full clone', () => {
    for (const row of rows.filter((entry) => entry.rubric === V17 && (!underWindow(entry) || !hasPrTraceFiles(entry)))) {
      const label = `${row.history} ${row.evidence} depth ${row.depth}`;
      expect(criterion(row.shallow, 'B2'), label).toEqual(criterion(row.full, 'B2'));
      expect(row.shallow.overallScore, label).toBe(row.full.overallScore);
      if (!hasPrTraceFiles(row)) expect(criterion(row.shallow, 'B2').status, label).toBe('insufficient_data');
    }
  });

  // Changed by the v27 freeze change F1 (operator decision 2026-10-28): until then v27 abstained on
  // all of B2 here as a read failure kept in the composite at 0. It now takes this path too
  // (v27-shallow-history-f1.test.ts measures it against the full clone).
  it('v27 since F1: under the window B2 is v17\'s, the ratio withheld and the file evidence scored', () => {
    for (const row of rows.filter((entry) => entry.rubric === V27 && underWindow(entry) && hasPrTraceFiles(entry))) {
      const label = `${row.history} ${row.evidence} depth ${row.depth}`;
      const v17 = rows.find(
        (entry) => entry.rubric === V17 && entry.history === row.history && entry.evidence === row.evidence && entry.depth === row.depth,
      )!;
      expect(criterion(row.shallow, 'B2'), label).toEqual(criterion(v17.shallow, 'B2'));
    }
  });
});

// The PR body's table: one markdown row per shallow case, written to the temporary directory.
describe('#442 matrix table', () => {
  it('is written to cejel-442-matrix.md in the temporary directory', () => {
    const cell = (report: WitanReport) => {
      const b2 = criterion(report, 'B2');
      return `B2 ${b2.status} ${b2.score}; overall ${report.overallScore} ${report.verdict}`;
    };
    const lines = rows.map((row) => {
      const full = criterion(row.full, 'B2');
      const shallow = criterion(row.shallow, 'B2');
      const score = compare(shallow.score, full.score);
      // An abstention has no status to rank; '-' where either side abstained.
      const status =
        SEVERITY[shallow.status] === undefined || SEVERITY[full.status] === undefined
          ? shallow.status === full.status
            ? 'equal'
            : '-'
          : compare(SEVERITY[shallow.status]!, SEVERITY[full.status]!);
      const overall = compare(row.shallow.overallScore!, row.full.overallScore!);
      const band = compare(BAND.indexOf(row.shallow.verdict), BAND.indexOf(row.full.verdict));
      const rubric = row.rubric === V17 ? 'v17' : 'v27';
      return `| ${rubric} | ${row.history} | ${row.evidence} | ${row.depth} | ${cell(row.full)} | ${cell(row.shallow)} | ${score} | ${status} | ${overall} | ${band} |`;
    });
    expect(lines.length).toBe(HISTORIES.length * EVIDENCE.length * DEPTHS.length * 2);
    writeFileSync(join(tmpdir(), 'cejel-442-matrix.md'), `${lines.join('\n')}\n`);
  });
});
