import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  ISSUE_556_SHAPE,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  fixtureGit,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #567: on a large complete history, A2's whole-history reads (the `.env`-path log, the tree
// enumeration, the deleted-path log and `rev-list HEAD`) stopped at Cejel's own 8 MiB output limit,
// and A2 lost that evidence (biomejs, react). Such a read is now re-run in pages and batches. A
// fixture large enough to pass 8 MiB would make this file slow, so in 'limited' mode execGit reports
// the output limit for any whole-history call and for any batch of more than MAX_BATCH commits, and
// everything else runs for real. The complete clone must then read exactly what it reads unlimited.
const MAX_BATCH = 4;
// 'whole-only' (#572 review, M2): only the whole-history calls report the output limit; the paged
// rev-list and the 1,000-commit batches run for real, so a fixture longer than one rev-list page
// (50,000 commits) exercises paging across a page boundary.
// 'tree-only' (#572 review, pass 1 L1): react's real path. `rev-list HEAD` and both logs run for
// real; only the tree enumeration overflows, whole or in a batch of more than MAX_BATCH commits.
const mode = {
  current: 'real' as 'real' | 'limited' | 'one-commit-too-big' | 'whole-only' | 'tree-only',
  bigCommit: '',
};
const overflow = { ok: false as const, reason: 'buffer_exceeded' as const };

vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      if (mode.current === 'tree-only') {
        const commits = (options.input ?? '').split('\n').filter((line) => line !== '');
        if (argv[0] === 'diff-tree' && argv.includes('--stdin') && commits.length > MAX_BATCH) return overflow;
        return actual.execGit(argv, options);
      }
      if (mode.current !== 'real') {
        const wholeHistory =
          (argv[0] === 'rev-list' && argv.length === 2 && argv[1] === 'HEAD') ||
          (argv[0] === 'log' && argv.includes('HEAD') && argv.includes('--name-only'));
        if (wholeHistory) return overflow;
        if (mode.current === 'whole-only') return actual.execGit(argv, options);
        const readsCommitsOnStdin = argv.includes('--stdin');
        if (readsCommitsOnStdin) {
          const commits = (options.input ?? '').split('\n').filter((line) => line !== '');
          if (commits.length > MAX_BATCH) return overflow;
          if (mode.current === 'one-commit-too-big' && commits.includes(mode.bigCommit) && argv[0] === 'diff-tree') {
            return overflow;
          }
        }
      }
      return actual.execGit(argv, options);
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
let clone = '';

beforeAll(() => {
  clone = cloneShallowA2Origin(buildShallowA2Origin(ISSUE_556_SHAPE), 'full');
}, 120_000);

beforeEach(() => {
  mode.current = 'real';
});

afterAll(() => {
  mode.current = 'real';
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'a2-history-paging',
    productDisplayName: 'A2 history paging',
    generatedAt: '2026-10-22T00:00:00.000Z',
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

describe("#567: a whole-history read that stops at Cejel's own output limit is re-run in batches", () => {
  it('the batched read gives exactly the unlimited result under v17 and v27, with no scan limitation', () => {
    for (const rubricVersion of [V17, V27]) {
      mode.current = 'real';
      const unlimited = scoreAt(clone, rubricVersion);
      expect(a2(unlimited).status, rubricVersion).toBe('critical');
      mode.current = 'limited';
      const batched = scoreAt(clone, rubricVersion);
      expect(batched.scanLimitations ?? [], rubricVersion).toEqual([]);
      expect(projectWitanScoringSurface(batched), rubricVersion).toEqual(projectWitanScoringSurface(unlimited));
      expect(a2(batched).findings, rubricVersion).toEqual(a2(unlimited).findings);
    }
  });

  it('a single commit that still overflows is declared, and the rest of the history is still read', () => {
    // The commit that added the secret-bearing .env: the tree enumeration cannot read it even alone.
    mode.bigCommit = fixtureGit(clone, 'log', '--format=%H', '--diff-filter=A', '--', '.env');
    mode.current = 'one-commit-too-big';
    const report = scoreAt(clone, V17);
    expect(report.scanLimitations).toEqual([
      'Cejel: local git history tree enumeration exceeded the 8 MiB output limit. Cejel continued with reduced Git history evidence.',
    ]);
    // The deleted-path scan still finds .env and reads its value through the per-path log, so the
    // critical finding stands on what was read.
    expect(a2(report).status).toBe('critical');
  });
});

// #572 review (pass 2, M2): two of the batched paths had no fixture that depended on them alone.
describe('#572 review: every batched path is the only source of some finding', () => {
  const S_ = { secretLine: 'stripe_secret_key = "sk_live_' + 'FIXTUREonly0000abcdEFGH1234ijklMNOP"\n' };

  // A history longer than one rev-list page. fast-import writes 50,002 commits in a few seconds. In
  // rev-list order (newest first) the root is index 50,001; index 50,000, the first commit of the
  // second page, adds a credential-named file with a secret; index 49,999, the last commit of the
  // first page, edits it to a placeholder; 49,999 empty commits follow. Only that one commit holds
  // the secret, so a page read that stops after the first page, or skips a commit at the boundary,
  // loses the finding.
  it('a rev-list page boundary: the finding lives only in the first commit of the second page', () => {
    const root = mkdtempSync(join(tmpdir(), 'cejel-paging-boundary-'));
    try {
      const repo = join(root, 'repo');
      execFileSync('git', ['init', '--quiet', '-b', 'main', repo]);
      const who = 'Fixture <fixture@example.invalid> 1767225600 +0000';
      const lines: string[] = [];
      const blob = (mark: number, text: string) => lines.push('blob', `mark :${mark}`, `data ${Buffer.byteLength(text)}`, text);
      blob(1, '{"name":"boundary","version":"1.0.0"}\n');
      blob(2, 'export const a = 1;\n');
      blob(3, S_.secretLine);
      blob(4, 'stripe_secret_key = "REPLACE_ME"\n');
      const commit = (mark: number, from: number | null, ops: string[]) => {
        lines.push('commit refs/heads/main', `mark :${mark}`, `author ${who}`, `committer ${who}`, 'data 2', 'c');
        if (from !== null) lines.push(`from :${from}`);
        lines.push(...ops, '');
      };
      commit(10, null, ['M 100644 :1 package.json', 'M 100644 :2 src/a.js']);
      commit(11, 10, ['M 100644 :3 config/app.secret.txt']);
      commit(12, 11, ['M 100644 :4 config/app.secret.txt']);
      let previous = 12;
      for (let index = 1; index < 50_000; index += 1) {
        commit(12 + index, previous, []);
        previous = 12 + index;
      }
      execFileSync('git', ['fast-import', '--quiet'], { cwd: repo, input: lines.join('\n') + '\n', maxBuffer: 1 << 26 });
      execFileSync('git', ['reset', '--quiet', '--hard', 'main'], { cwd: repo });
      expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()).toBe('50002');
      const secretCommit = execFileSync('git', ['rev-list', '--max-count=1', '--skip=50000', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
      expect(execFileSync('git', ['show', `${secretCommit}:config/app.secret.txt`], { cwd: repo, encoding: 'utf8' })).toBe(S_.secretLine);

      mode.current = 'real';
      const unlimited = scoreAt(repo, V17);
      expect(a2(unlimited).status).toBe('critical');
      mode.current = 'whole-only';
      const paged = scoreAt(repo, V17);
      expect(paged.scanLimitations ?? []).toEqual([]);
      expect(projectWitanScoringSurface(paged)).toEqual(projectWitanScoringSurface(unlimited));
      expect(a2(paged).findings).toEqual(a2(unlimited).findings);
    } finally {
      mode.current = 'real';
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);

  // A secret that only the tree enumeration can supply: a credential-named file added with a secret
  // and then edited to a placeholder, never deleted. The current tree holds no secret, the
  // deleted-path read never lists the file, and the oldest commits fall in the last batches.
  it('the tree enumeration alone supplies the finding, across batches', () => {
    const root = mkdtempSync(join(tmpdir(), 'cejel-paging-tree-only-'));
    try {
      const repo = join(root, 'repo');
      execFileSync('git', ['init', '--quiet', '-b', 'main', repo]);
      const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
          cwd: repo,
          encoding: 'utf8',
          env: { ...process.env, GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' },
        });
      const write = (path: string, text: string) => execFileSync('sh', ['-c', 'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1"', 'sh', join(repo, path), text]);
      write('package.json', '{"name":"tree-only","version":"1.0.0"}\n');
      write('src/a.js', 'export const a = 1;\n');
      git('add', '-A'); git('commit', '--quiet', '-m', 'base');
      write('config/app.secret.txt', S_.secretLine);
      git('add', '-A'); git('commit', '--quiet', '-m', 'add');
      write('config/app.secret.txt', 'stripe_secret_key = "REPLACE_ME"\n');
      git('add', '-A'); git('commit', '--quiet', '-m', 'placeholder');
      for (let index = 1; index <= 14; index += 1) {
        write('src/a.js', `export const a = ${index + 1};\n`);
        git('commit', '--quiet', '-am', `revision ${index}`);
      }

      mode.current = 'real';
      const unlimited = scoreAt(repo, V17);
      expect(a2(unlimited).status).toBe('critical');
      expect(a2(unlimited).findings.some(({ summary }) => /git history/i.test(summary))).toBe(true);
      // 'limited': every whole-history read overflows. 'tree-only': react's path, where rev-list
      // succeeds and only the tree enumeration overflows.
      for (const limitedMode of ['limited', 'tree-only'] as const) {
        mode.current = limitedMode;
        const batched = scoreAt(repo, V17);
        expect(batched.scanLimitations ?? [], limitedMode).toEqual([]);
        expect(projectWitanScoringSurface(batched), limitedMode).toEqual(projectWitanScoringSurface(unlimited));
        expect(a2(batched).findings, limitedMode).toEqual(a2(unlimited).findings);
      }
    } finally {
      mode.current = 'real';
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

