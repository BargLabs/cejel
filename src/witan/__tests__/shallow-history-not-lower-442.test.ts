import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V27, WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';
import { HERMETIC_GIT_ENV } from './fixtures/behaviour-corpus.js';

// #442, operator decision of 2026-10-26: a shallow clone must not lower the history score. On a
// shallow clone A2 and B2 either abstain with insufficient_data and a stated reason, or keep the
// score they would have had with full history and state the limitation; they never score the
// truncated history lower.
//
// The repro, rebuilt synthetically: a Python library with a pull-request CI workflow and twenty
// commits, every other one a pull-request merge subject, scanned as a full clone and as the depth-1
// clone a default actions/checkout makes. B2's pr_merge_ratio reads the twelve most recent commits;
// at depth 1 it reads one, so it scores the window as 0 of 1 or 1 of 1 depending only on the
// subject of HEAD. Both HEAD shapes are built, so the abstention cannot depend on which way the
// truncated ratio points.
//
// witan-rubric-v27-prospective-2026-10-19 is outside this file: it already abstains on both
// criteria as a read failure kept in the composite at 0 (false-assurance-v27.test.ts), and its
// no-rise property against v17 is pinned there.

const RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== WITAN_RUBRIC_VERSION_V27);
const SEVERITY: Readonly<Record<string, number>> = { verified: 0, info: 1, warning: 2, critical: 3 };

const FILES: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "cachelib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# cachelib\n\nA small cache library.\n',
  LICENSE: 'MIT\n',
  '.gitignore': '.env\n__pycache__/\n',
  '.env.example': 'CACHE_URL=\n',
  'src/cachelib/__init__.py': 'def get(cache, key, default=None):\n    return cache.get(key, default)\n',
  'src/cachelib/config.py': 'import os\n\nCACHE_URL = os.environ.get("CACHE_URL", "")\n',
  'tests/test_cache.py': 'from cachelib import get\n\n\ndef test_get_default():\n    assert get({}, "a", 1) == 1\n',
  '.github/pull_request_template.md': '## Summary\n',
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n',
};

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: HERMETIC_GIT_ENV,
    encoding: 'utf8',
  }).trim();
}

/** Twenty commits; odd-numbered ones carry a pull-request merge subject. HEAD is commit 19 or 20. */
function buildOrigin(headIsMerge: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), `cejel-442-origin-${headIsMerge ? 'merge' : 'plain'}-`));
  git(dir, ['init', '--quiet']);
  for (const [path, contents] of Object.entries(FILES)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'initial commit']);
  const last = headIsMerge ? 19 : 20;
  for (let index = 1; index <= last; index += 1) {
    writeFileSync(join(dir, 'src', 'cachelib', `m${index}.py`), `VALUE_${index} = ${index}\n`);
    git(dir, ['add', '-A']);
    git(dir, [
      'commit',
      '--quiet',
      '-m',
      index % 2 === 1 ? `Merge pull request #${index} from contributor/topic-${index}` : `add module ${index}`,
    ]);
  }
  return dir;
}

function clone(origin: string, depth?: number): string {
  const target = join(mkdtempSync(join(tmpdir(), 'cejel-442-clone-')), 'repo');
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

const reports = new Map<string, WitanReport>();
function scan(repoPath: string, rubricVersion: string): WitanReport {
  const key = `${repoPath}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  const scored = scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'shallow-history-442',
    productDisplayName: 'Shallow history #442',
    generatedAt: '2026-10-27T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(report: WitanReport, id: string): WitanCriterionScore {
  const found = report.criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

const round = (score: number) => Math.round(score * 10) / 10;

/** process_trust as scoring.ts's averageScore computes it with every unscored criterion left out. */
function processTrustWithoutUnscored(report: WitanReport): number {
  const scored = report.criteria.filter(
    ({ category, status }) =>
      category === 'process_trust' && status !== 'not_applicable' && status !== 'insufficient_data',
  );
  return scored.length === 0 ? 0 : round(scored.reduce((sum, { score }) => sum + score, 0) / scored.length);
}

let clones: { name: string; full: string; shallow: string; depth12: string }[];

beforeAll(() => {
  clones = [false, true].map((headIsMerge) => {
    const origin = buildOrigin(headIsMerge);
    return {
      name: headIsMerge ? 'HEAD is a pull-request merge' : 'HEAD is not a pull-request merge',
      full: clone(origin),
      shallow: clone(origin, 1),
      depth12: clone(origin, 12),
    };
  });
  for (const { shallow, full, depth12 } of clones) {
    expect(git(shallow, ['rev-parse', '--is-shallow-repository'])).toBe('true');
    expect(git(depth12, ['rev-parse', '--is-shallow-repository'])).toBe('true');
    expect(git(full, ['rev-parse', '--is-shallow-repository'])).toBe('false');
  }
}, 120_000);

describe('#442: a shallow clone does not score the truncated history lower', () => {
  it('A2 and B2 on a depth-1 clone abstain out of the composite or score no lower than the full clone', () => {
    const problems: string[] = [];
    for (const { name, full, shallow } of clones) {
      for (const rubricVersion of RUBRICS) {
        for (const id of ['A2', 'B2']) {
          const before = criterion(scan(full, rubricVersion), id);
          const after = criterion(scan(shallow, rubricVersion), id);
          if (after.status === 'insufficient_data' || after.status === 'not_applicable') continue;
          if (before.status === 'insufficient_data' || before.status === 'not_applicable') continue;
          if (after.score < before.score) {
            problems.push(`${name} ${rubricVersion} ${id} score ${before.score} -> ${after.score}`);
          }
          if ((SEVERITY[after.status] ?? 99) > (SEVERITY[before.status] ?? 99)) {
            problems.push(`${name} ${rubricVersion} ${id} status ${before.status} -> ${after.status}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('B2 abstains on a depth-1 clone whichever way the one visible commit points, and says why', () => {
    for (const { name, shallow } of clones) {
      for (const rubricVersion of RUBRICS) {
        const b2 = criterion(scan(shallow, rubricVersion), 'B2');
        expect(b2.status, `${name} ${rubricVersion}`).toBe('insufficient_data');
        expect(b2.score, `${name} ${rubricVersion}`).toBe(0);
        expect(b2.notes ?? '', `${name} ${rubricVersion}`).toMatch(
          /^B2 abstained: this repository is a shallow clone with fewer than 12 commits visible/,
        );
        expect(b2.notes ?? '', `${name} ${rubricVersion}`).toContain('left out of the composite');
      }
    }
  });

  it('the abstention is left out of the composite: it is not a read failure held at 0', () => {
    for (const { name, shallow } of clones) {
      for (const rubricVersion of RUBRICS) {
        const report = scan(shallow, rubricVersion);
        expect(report.processTrustScore, `${name} ${rubricVersion}`).toBe(processTrustWithoutUnscored(report));
      }
    }
  });

  it('a full clone, and a shallow clone that holds the whole window, score B2 exactly as before', () => {
    for (const { name, full, depth12 } of clones) {
      for (const rubricVersion of RUBRICS) {
        const scored = criterion(scan(full, rubricVersion), 'B2');
        expect(scored.status, `${name} ${rubricVersion}`).not.toBe('insufficient_data');
        expect(scored.metrics.map(({ name: metric }) => metric)).toContain('pr_merge_ratio');
        expect(criterion(scan(depth12, rubricVersion), 'B2'), `${name} ${rubricVersion}`).toEqual(scored);
      }
    }
  });
});
