import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V23, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  ISSUE_556_SHAPE,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  fixtureGitWithInput,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #586: A2's batched re-read of a whole-history read that stopped at Cejel's own limit (#567) has a
// time budget. When it is spent the read must be declared incomplete, under every rubric, through
// the same path as a read that stops at Cejel's own timeout. A read that hits no limit never starts
// a re-read and must be unchanged.
//
// The clock is the test's, not a hook in the scanner: performance.now is spied to return the real
// time plus an offset, and the mocked execGit moves the offset forward after each git call. A step
// far larger than any budget spends a read's budget after its first git call, whatever the budget's
// value, so the test does not depend on that value.
const MAX_BATCH = 4;
const STEP_PAST_ANY_BUDGET_MS = 1e9;
const mode = { current: 'real' as 'real' | 'limited' };
const clock = { offset: 0, step: 0, onEveryCall: false, jumpAtRereadCall: 0 };
const overflow = { ok: false as const, reason: 'buffer_exceeded' as const };
// Every git call of a re-read (paged rev-list or commits on stdin), in order. The one-shot tree
// enumeration also reads commits on stdin, so it is recorded too ('diff-tree batch').
const fallbackCalls: string[] = [];

vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  const respond = (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
    if (mode.current === 'limited') {
      const wholeHistory =
        (argv[0] === 'rev-list' && argv.length === 2 && argv[1] === 'HEAD') ||
        (argv[0] === 'log' && argv.includes('HEAD') && argv.includes('--name-only'));
      if (wholeHistory) return overflow;
      if (argv.includes('--stdin')) {
        const commits = (options.input ?? '').split('\n').filter((line) => line !== '');
        if (commits.length > MAX_BATCH) return overflow;
      }
    }
    return actual.execGit(argv, options);
  };
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      const result = respond(argv, options);
      const reread = (argv[0] === 'rev-list' && argv.length > 2) || argv.includes('--stdin');
      if (reread) fallbackCalls.push(argv[0] === 'rev-list' ? 'rev-list page' : `${argv[0]} batch`);
      if (reread || clock.onEveryCall) clock.offset += clock.step;
      if (reread && fallbackCalls.length === clock.jumpAtRereadCall) clock.offset += STEP_PAST_ANY_BUDGET_MS;
      return result;
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V23 = WITAN_RUBRIC_VERSION_V23;
const V27 = WITAN_RUBRIC_VERSION_V27;
const BUDGET_LIMITATION =
  /^Cejel: local git (history tree enumeration|deleted-path history scan|environment-file history scan) stopped at Cejel's \d+-second time budget for re-reading history in batches\. Cejel continued with reduced Git history evidence\.$/;
let clone = '';

beforeAll(() => {
  clone = cloneShallowA2Origin(buildShallowA2Origin(ISSUE_556_SHAPE), 'full');
}, 120_000);

beforeEach(() => {
  mode.current = 'real';
  Object.assign(clock, { offset: 0, step: 0, onEveryCall: false, jumpAtRereadCall: 0 });
  fallbackCalls.length = 0;
  const realNow = performance.now.bind(performance);
  vi.spyOn(performance, 'now').mockImplementation(() => realNow() + clock.offset);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'a2-history-fallback-budget',
    productDisplayName: 'A2 history fallback budget',
    generatedAt: '2026-10-23T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function a2(report: WitanReport): WitanCriterionScore {
  const found = report.criteria.find(({ id }) => id === 'A2');
  if (!found) throw new Error('no A2');
  return found;
}

describe('#586: a spent re-read budget is declared, never returned as the whole history', () => {
  it.each([V17, V23, V27])('under %s, every re-read that runs out of time declares its read incomplete', (rubricVersion) => {
    mode.current = 'limited';
    Object.assign(clock, { step: STEP_PAST_ANY_BUDGET_MS });
    const report = scoreAt(clone, rubricVersion);
    const budgetLines = (report.scanLimitations ?? []).filter((line) => BUDGET_LIMITATION.test(line));
    // All three readers fall back (rev-list HEAD overflows), each reads its first rev-list page
    // within its budget, and each then finds the budget spent and says so once.
    expect(budgetLines.map((line) => line.replace(/ stopped at.*/, '')).sort()).toEqual([
      'Cejel: local git deleted-path history scan',
      'Cejel: local git environment-file history scan',
      'Cejel: local git history tree enumeration',
    ]);
    // No git call of a re-read starts once its budget is spent: one rev-list page per reader.
    expect(fallbackCalls).toEqual(['rev-list page', 'rev-list page', 'rev-list page']);
    if (rubricVersion === V27) {
      // ADR-0001: a stopped read is a read failure, so v27's A2 abstains and says why.
      expect(a2(report).status).toBe('insufficient_data');
      expect(a2(report).score).toBe(0);
      expect(a2(report).notes ?? '').toContain("time budget for re-reading history in batches");
      expect(a2(report).notes ?? '').toContain(
        "A re-scan of the same repository may not lift Cejel's own time budget, which depends on the machine and its load.",
      );
      expect(a2(report).notes ?? '').not.toContain('will not lift');
    } else {
      // Every other rubric scores A2 on what was read, and the report carries the limitation, so
      // the badge is unrated and --min-score refuses, as for a read stopped at the limit today.
      expect(a2(report).status).not.toBe('insufficient_data');
    }
  });

  // The budget runs out partway: the first re-read has read its rev-list page and some batches when
  // the clock passes its budget. It keeps what it read, stops, and declares the read incomplete; the
  // re-reads after it start their own budgets and finish.
  it.each([V17, V27])('under %s, a budget spent partway through the batches still declares the read incomplete', (rubricVersion) => {
    mode.current = 'limited';
    Object.assign(clock, { jumpAtRereadCall: 3 });
    const report = scoreAt(clone, rubricVersion);
    const budgetLines = (report.scanLimitations ?? []).filter((line) => BUDGET_LIMITATION.test(line));
    expect(budgetLines).toHaveLength(1);
    expect(fallbackCalls.slice(0, 3)).toEqual(['rev-list page', fallbackCalls[1], fallbackCalls[2]]);
    expect(fallbackCalls[1]).toMatch(/batch$/);
    // The secret is still found by the reads that finished, so A2 stays critical under both rubrics:
    // v27 abstains on a failed read only when nothing critical was found (a confirmed critical is
    // never withdrawn). The limitation is declared either way.
    expect(a2(report).status).toBe('critical');
  });

  it('a budget that is not spent changes nothing: the re-read gives exactly the unlimited result', () => {
    mode.current = 'real';
    const unlimited = scoreAt(clone, V27);
    mode.current = 'limited';
    Object.assign(clock, { step: 0 });
    const batched = scoreAt(clone, V27);
    expect(batched.scanLimitations ?? []).toEqual([]);
    expect(projectWitanScoringSurface(batched)).toEqual(projectWitanScoringSurface(unlimited));
    expect(a2(batched)).toEqual(a2(unlimited));
  });
});

describe('#586: a read that hits no limit is unchanged, however long it takes', () => {
  it.each([V17, V27])('under %s, a clock far past any budget on every git call changes nothing', (rubricVersion) => {
    mode.current = 'real';
    const before = scoreAt(clone, rubricVersion);
    Object.assign(clock, { step: STEP_PAST_ANY_BUDGET_MS, onEveryCall: true });
    const slow = scoreAt(clone, rubricVersion);
    // Only the one-shot tree enumeration reads commits on stdin (the scan runs it more than once);
    // no rev-list page and no batched log, so no re-read starts.
    expect(fallbackCalls.length).toBeGreaterThan(0);
    expect(fallbackCalls.filter((call) => call !== 'diff-tree batch')).toEqual([]);
    expect(slow.scanLimitations ?? []).toEqual(before.scanLimitations ?? []);
    expect(projectWitanScoringSurface(slow)).toEqual(projectWitanScoringSurface(before));
    expect(a2(slow)).toEqual(a2(before));
  });
});

// The rev-list pages of a re-read are under the budget too. With more than one page of commits
// (50,000), a re-read whose budget is spent after the first page must not read the second.
describe('#586: the budget also bounds the rev-list pages', () => {
  it('a 50,002-commit history: no second page once the budget is spent', () => {
    const repo = cloneShallowA2Origin(buildShallowA2Origin(ISSUE_556_SHAPE), 'full');
    const who = 'Fixture <fixture@example.invalid> 1767225600 +0000';
    const lines: string[] = [];
    let previous = fixtureGitWithInput(repo, '', 'rev-parse', 'HEAD');
    for (let index = 0; index < 50_000; index += 1) {
      lines.push('commit refs/heads/main', `mark :${index + 1}`, `author ${who}`, `committer ${who}`, 'data 2', 'c');
      lines.push(index === 0 ? `from ${previous}` : `from :${index}`, '');
    }
    fixtureGitWithInput(repo, `${lines.join('\n')}\n`, 'fast-import', '--quiet', '--force');
    fixtureGitWithInput(repo, '', 'reset', '--quiet', '--hard', 'refs/heads/main');
    previous = fixtureGitWithInput(repo, '', 'rev-list', '--count', 'HEAD');
    expect(Number(previous)).toBeGreaterThan(50_000);

    mode.current = 'limited';
    Object.assign(clock, { step: STEP_PAST_ANY_BUDGET_MS });
    const report = scoreAt(repo, V17);
    expect((report.scanLimitations ?? []).filter((line) => BUDGET_LIMITATION.test(line))).toHaveLength(3);
    expect(fallbackCalls).toEqual(['rev-list page', 'rev-list page', 'rev-list page']);
  }, 180_000);
});
