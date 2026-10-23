import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { probeA2EnvPathHistoryRead } from '../repo-signals.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V23, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  ISSUE_556_SHAPE,
  buildA2HistoryOrigin,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  fixtureGit,
  fixtureGitWithInput,
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
// Every successful read that took commit ids on stdin, in call order (#572 review): the commits the
// batches of one reader received, concatenated, must be the rev-list order exactly. That pins the
// batch order and catches a commit dropped from a batch, which the scoring surface cannot show.
const stdinReads: { argv: readonly string[]; commits: string[] }[] = [];
const commitsOnStdin = (input: string | undefined): string[] => (input ?? '').split('\n').filter((line) => line !== '');

vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  const respond = (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
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
  };
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      const result = respond(argv, options);
      if (result.ok && argv.includes('--stdin')) stdinReads.push({ argv, commits: commitsOnStdin(options.input) });
      return result;
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
  stdinReads.length = 0;
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

// #572 review: each batched path is the only source of some finding, and the batches are read in
// order. The fixtures run git through the shared helper's isolated config (no global or system
// config, fixed identity and dates).
describe('#572 review: every batched path is the only source of some finding', () => {
  const SECRET_LINE = 'stripe_secret_key = "sk_live_' + 'FIXTUREonly0000abcdEFGH1234ijklMNOP"\n';
  const PLACEHOLDER_LINE = 'stripe_secret_key = "REPLACE_ME"\n';
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const newRepo = (prefix: string): string => {
    const root = mkdtempSync(join(tmpdir(), prefix));
    roots.push(root);
    fixtureGit(root, 'init', '--quiet', 'repo');
    return join(root, 'repo');
  };
  const put = (repo: string, path: string, text: string): void => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  const commitAll = (repo: string, message: string): void => {
    fixtureGit(repo, 'add', '-A');
    fixtureGit(repo, 'commit', '--quiet', '-m', message);
  };
  const revisions = (repo: string, count: number, label: string): void => {
    for (let index = 1; index <= count; index += 1) {
      put(repo, 'src/a.js', `export const a = '${label}-${index}';\n`);
      commitAll(repo, `${label} ${index}`);
    }
  };
  // fixtureGitWithInput has the larger output buffer that 50,002 commit ids need.
  const revList = (repo: string): string[] => fixtureGitWithInput(repo, '', 'rev-list', 'HEAD').split('\n');
  const isTreeEnumeration = (argv: readonly string[]) => argv[0] === 'diff-tree' && argv.includes('--diff-filter=AM');
  const isDeletedPathLog = (argv: readonly string[]) => argv[0] === 'log' && argv.includes('--diff-filter=D');
  const isEnvPathLog = (argv: readonly string[]) => argv[0] === 'log' && argv.includes('--diff-filter=AM');
  const batched = (reader: (argv: readonly string[]) => boolean): string[] =>
    stdinReads.filter(({ argv }) => reader(argv)).flatMap(({ commits }) => commits);

  // A history longer than one rev-list page. fast-import writes 50,002 commits in a few seconds. In
  // rev-list order (newest first) the root is index 50,001; index 50,000, the first commit of the
  // second page, adds a credential-named file with a secret; index 49,999, the last commit of the
  // first page, edits it to a placeholder; 49,999 empty commits follow. Only that one commit holds
  // the secret, so a page read that stops after the first page, or skips a commit at the boundary,
  // loses the finding.
  it('a rev-list page boundary: the finding lives only in the first commit of the second page', () => {
    const repo = newRepo('cejel-paging-boundary-');
    const who = 'Fixture <fixture@example.invalid> 1767225600 +0000';
    const lines: string[] = [];
    const blob = (mark: number, text: string) => lines.push('blob', `mark :${mark}`, `data ${Buffer.byteLength(text)}`, text);
    blob(1, '{"name":"boundary","version":"1.0.0"}\n');
    blob(2, 'export const a = 1;\n');
    blob(3, SECRET_LINE);
    blob(4, PLACEHOLDER_LINE);
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
    fixtureGitWithInput(repo, `${lines.join('\n')}\n`, 'fast-import', '--quiet');
    fixtureGit(repo, 'reset', '--quiet', '--hard', 'main');
    expect(fixtureGit(repo, 'rev-list', '--count', 'HEAD')).toBe('50002');
    const secretCommit = fixtureGit(repo, 'rev-list', '--max-count=1', '--skip=50000', 'HEAD');
    expect(fixtureGit(repo, 'show', `${secretCommit}:config/app.secret.txt`)).toBe(SECRET_LINE.trim());

    mode.current = 'real';
    const unlimited = scoreAt(repo, V17);
    expect(a2(unlimited).status).toBe('critical');
    mode.current = 'whole-only';
    stdinReads.length = 0;
    const paged = scoreAt(repo, V17);
    expect(paged.scanLimitations ?? []).toEqual([]);
    expect(projectWitanScoringSurface(paged)).toEqual(projectWitanScoringSurface(unlimited));
    expect(a2(paged).findings).toEqual(a2(unlimited).findings);
    expect(batched(isTreeEnumeration)).toEqual(revList(repo));
  }, 180_000);

  // A secret that only the tree enumeration can supply: a credential-named file added with a secret
  // and then edited to a placeholder, never deleted. The current tree holds no secret, the
  // deleted-path read never lists the file, and the oldest commits fall in the last batches.
  it('the tree enumeration alone supplies the finding, across batches read in order', () => {
    const repo = newRepo('cejel-paging-tree-only-');
    put(repo, 'package.json', '{"name":"tree-only","version":"1.0.0"}\n');
    put(repo, 'src/a.js', 'export const a = 1;\n');
    commitAll(repo, 'base');
    put(repo, 'config/app.secret.txt', SECRET_LINE);
    commitAll(repo, 'add');
    put(repo, 'config/app.secret.txt', PLACEHOLDER_LINE);
    commitAll(repo, 'placeholder');
    revisions(repo, 14, 'revision');
    const order = revList(repo);

    mode.current = 'real';
    const unlimited = scoreAt(repo, V17);
    expect(a2(unlimited).status).toBe('critical');
    expect(a2(unlimited).findings.some(({ summary }) => /git history/i.test(summary))).toBe(true);
    // 'limited': every whole-history read overflows. 'tree-only': react's path, where rev-list
    // succeeds and only the tree enumeration overflows.
    for (const limitedMode of ['limited', 'tree-only'] as const) {
      mode.current = limitedMode;
      stdinReads.length = 0;
      const batchedReport = scoreAt(repo, V17);
      expect(batchedReport.scanLimitations ?? [], limitedMode).toEqual([]);
      expect(projectWitanScoringSurface(batchedReport), limitedMode).toEqual(projectWitanScoringSurface(unlimited));
      expect(a2(batchedReport).findings, limitedMode).toEqual(a2(unlimited).findings);
      expect(batched(isTreeEnumeration), limitedMode).toEqual(order);
      expect(stdinReads.filter(({ argv }) => isTreeEnumeration(argv)).length, limitedMode).toBeGreaterThan(1);
      if (limitedMode === 'limited') {
        expect(batched(isDeletedPathLog)).toEqual(order);
        expect(batched(isEnvPathLog)).toEqual(order);
      } else {
        expect(batched(isDeletedPathLog)).toEqual([]);
        expect(batched(isEnvPathLog)).toEqual([]);
      }
    }
  }, 120_000);

  // The .env read stops at the first batch that lists a .env path. Here the only .env sits in a
  // middle batch, with batches after it that list none, so a read that ignored the stop, or kept
  // only the last batch's answer, would report no .env in history.
  it('the .env history read finds a .env in a middle batch and stops there', () => {
    const repo = newRepo('cejel-paging-env-middle-');
    put(repo, 'package.json', '{"name":"env-middle","version":"1.0.0"}\n');
    put(repo, 'src/a.js', 'export const a = 1;\n');
    commitAll(repo, 'base');
    revisions(repo, 10, 'early');
    put(repo, '.env', 'DEBUG=true\n');
    commitAll(repo, 'add .env');
    fixtureGit(repo, 'rm', '--quiet', '.env');
    commitAll(repo, 'remove .env');
    revisions(repo, 5, 'late');
    const order = revList(repo);
    const envCommit = fixtureGit(repo, 'log', '--format=%H', '--diff-filter=A', '--', '.env');
    const envIndex = order.indexOf(envCommit);
    expect(envIndex).toBeGreaterThan(MAX_BATCH);
    expect(envIndex).toBeLessThan(order.length - MAX_BATCH);

    mode.current = 'real';
    expect(probeA2EnvPathHistoryRead(repo)).toMatchObject({ found: true, limitations: [] });
    const unlimited = scoreAt(repo, V17);
    mode.current = 'limited';
    stdinReads.length = 0;
    expect(probeA2EnvPathHistoryRead(repo)).toMatchObject({ found: true, limitations: [] });
    const envBatches = stdinReads.filter(({ argv }) => isEnvPathLog(argv));
    expect(envBatches.length).toBeGreaterThan(1);
    expect(envBatches.at(-1)?.commits).toContain(envCommit);
    expect(batched(isEnvPathLog)).toEqual(order.slice(0, batched(isEnvPathLog).length));
    expect(batched(isEnvPathLog).length).toBeLessThan(order.length);
    const batchedReport = scoreAt(repo, V17);
    expect(batchedReport.scanLimitations ?? []).toEqual([]);
    expect(projectWitanScoringSurface(batchedReport)).toEqual(projectWitanScoringSurface(unlimited));
  }, 120_000);
});

// #572 merged with #571: the batched readers word the control-character limitation by #571's shared
// rule, with the rubric's own flags, exactly as the one-shot reads do. The history holds a key-shaped
// JSON path (credential-shaped under v23 only, so the flags decide its sentence) and an `.env`-shaped
// path, both later deleted so the deleted-path and `.env` reads meet them too. No other control-
// character path is present, so a reader that wrote the wrong sentence would add a second one.
describe('#572 with #571: batched reads word the control-character limitation as the one-shot reads do', () => {
  it('the same limitations under v17, v23 and v27, whichever reads overflow', () => {
    const repo = cloneShallowA2Origin(
      buildA2HistoryOrigin('paging-control-characters', [
        {
          write: {
            'package.json': '{"name":"paging-control","version":"1.0.0"}\n',
            'src/a.js': 'export const a = 1;\n',
            'config/\bservice-account.json': '{}\n',
            'config/\t.env': 'X=1\n',
          },
        },
        { remove: ['config/\bservice-account.json', 'config/\t.env'] },
        ...Array.from({ length: 8 }, (_, index) => ({ write: { 'README.md': `# r${index}\n` } })),
      ]),
      'full',
    );
    const sorted = (report: WitanReport) => [...(report.scanLimitations ?? [])].sort();
    const credentialShaped = /^Git history contained a credential-shaped pathname with control characters\./;
    const otherPath = /^Git history contained a pathname with control characters that is not credential-shaped\./;
    for (const rubricVersion of [V17, WITAN_RUBRIC_VERSION_V23, V27]) {
      mode.current = 'real';
      const unlimited = sorted(scoreAt(repo, rubricVersion));
      // Under v23 the key-shaped JSON is credential-shaped, so both paths get the same sentence.
      const expected = rubricVersion === WITAN_RUBRIC_VERSION_V23 ? [credentialShaped] : [credentialShaped, otherPath];
      expect(unlimited.length, rubricVersion).toBe(expected.length);
      expected.forEach((pattern) => expect(unlimited.some((line) => pattern.test(line)), rubricVersion).toBe(true));
      for (const limitedMode of ['limited', 'tree-only'] as const) {
        mode.current = limitedMode;
        expect(sorted(scoreAt(repo, rubricVersion)), `${rubricVersion} ${limitedMode}`).toEqual(unlimited);
      }
    }
    mode.current = 'real';
  }, 120_000);
});

// #586: the output side of the batched reads. The batch-order check above records what each batch
// was asked for; these fixtures make a dropped or reordered batch OUTPUT change a finding.
describe('#586: a batched read keeps every batch output, in order', () => {
  const SECRET_NEWER = 'stripe_secret_key = "sk_live_' + 'FIXTUREonly1111abcdEFGH1234ijklMNOP"\n';
  const SECRET_OLDER = 'stripe_secret_key = "sk_live_' + 'FIXTUREonly2222abcdEFGH1234ijklMNOP"\n';
  const base = { 'package.json': '{"name":"paging-586","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };
  const readmeRevisions = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ write: { 'README.md': `# revision ${index}\n` } }));
  const historyEvidence = (report: WitanReport) =>
    a2(report).findings.flatMap(({ summary, evidence }) => (/git history/i.test(summary) ? [evidence] : []));

  // The only secret is in the second-newest commit (the newest is HEAD, which the history scan
  // skips), so it lies in the first batch the tree enumeration reads. A read that dropped the first
  // successful batch's output would find nothing.
  it("the only finding lives in the newest batch, so dropping the first batch's output loses it", () => {
    const repo = cloneShallowA2Origin(
      buildA2HistoryOrigin('paging-586-newest-batch', [
        { write: base },
        ...readmeRevisions(14),
        { write: { 'config/app.secret.txt': SECRET_NEWER } },
        { write: { 'config/app.secret.txt': 'stripe_secret_key = "REPLACE_ME"\n' } },
      ]),
      'full',
    );
    const secretCommit = fixtureGit(repo, 'rev-list', '--max-count=1', '--skip=1', 'HEAD');
    mode.current = 'real';
    const unlimited = scoreAt(repo, V17);
    expect(a2(unlimited).status).toBe('critical');
    expect(historyEvidence(unlimited).map((evidence) => evidence?.contentHash)).toEqual([secretCommit]);
    for (const limitedMode of ['limited', 'tree-only'] as const) {
      mode.current = limitedMode;
      stdinReads.length = 0;
      const batchedReport = scoreAt(repo, V17);
      const treeBatches = stdinReads.filter(({ argv }) => argv[0] === 'diff-tree');
      expect(treeBatches.length, limitedMode).toBeGreaterThan(1);
      expect(treeBatches[0]?.commits, limitedMode).toContain(secretCommit);
      expect(batchedReport.scanLimitations ?? [], limitedMode).toEqual([]);
      expect(projectWitanScoringSurface(batchedReport), limitedMode).toEqual(projectWitanScoringSurface(unlimited));
      expect(a2(batchedReport).findings, limitedMode).toEqual(a2(unlimited).findings);
    }
    mode.current = 'real';
  }, 120_000);

  // Two secrets: one in the newest batch, one in the oldest. The history scan stops at the first
  // secret in entry order and cites that commit, so the newest-first order decides which commit the
  // finding names. Outputs collected in any other order would cite the older one.
  it('the finding cites the newest secret, so batch outputs read out of order change it', () => {
    const repo = cloneShallowA2Origin(
      buildA2HistoryOrigin('paging-586-two-secrets', [
        { write: base },
        { write: { 'config/app.secret.txt': SECRET_OLDER } },
        { write: { 'config/app.secret.txt': 'stripe_secret_key = "REPLACE_ME"\n' } },
        ...readmeRevisions(14),
        { write: { 'config/app.secret.txt': SECRET_NEWER } },
        { write: { 'config/app.secret.txt': 'stripe_secret_key = "STILL_REPLACE_ME"\n' } },
      ]),
      'full',
    );
    const order = fixtureGit(repo, 'rev-list', 'HEAD').split('\n');
    const newerCommit = order[1];
    const olderCommit = order[order.length - 2];
    expect(fixtureGit(repo, 'show', `${olderCommit}:config/app.secret.txt`)).toBe(SECRET_OLDER.trim());
    mode.current = 'real';
    const unlimited = scoreAt(repo, V17);
    expect(historyEvidence(unlimited).map((evidence) => evidence?.contentHash)).toEqual([newerCommit]);
    for (const limitedMode of ['limited', 'tree-only'] as const) {
      mode.current = limitedMode;
      stdinReads.length = 0;
      const batchedReport = scoreAt(repo, V17);
      const treeBatches = stdinReads.filter(({ argv }) => argv[0] === 'diff-tree');
      expect(treeBatches[0]?.commits, limitedMode).toContain(newerCommit);
      expect(treeBatches.at(-1)?.commits, limitedMode).toContain(olderCommit);
      expect(projectWitanScoringSurface(batchedReport), limitedMode).toEqual(projectWitanScoringSurface(unlimited));
      expect(a2(batchedReport).findings, limitedMode).toEqual(a2(unlimited).findings);
    }
    mode.current = 'real';
  }, 120_000);

  // #572 round-4 review: with an `.env`-shaped control-character path present, the batched `.env`
  // read's extra sentence was masked (scanLimitations is a set). With only the key-shaped JSON path,
  // each rubric's one-shot reads give exactly one sentence, so a batched read that worded the path
  // with the wrong flags would add a second.
  let keyJsonOnlyRepo = '';
  const keyJsonOnly = (): string => {
    keyJsonOnlyRepo ||= cloneShallowA2Origin(
      buildA2HistoryOrigin('paging-586-key-json-only', [
        { write: { ...base, 'config/\bservice-account.json': '{}\n' } },
        { remove: ['config/\bservice-account.json'] },
        ...readmeRevisions(8),
      ]),
      'full',
    );
    return keyJsonOnlyRepo;
  };
  it.each([V17, WITAN_RUBRIC_VERSION_V23, V27])(
    'a key-shaped JSON control-character path alone gives one sentence under %s, however the reads run',
    (rubricVersion) => {
      const repo = keyJsonOnly();
      const credentialShaped = /^Git history contained a credential-shaped pathname with control characters\./;
      const otherPath = /^Git history contained a pathname with control characters that is not credential-shaped\./;
      mode.current = 'real';
      const unlimited = [...(scoreAt(repo, rubricVersion).scanLimitations ?? [])];
      expect(unlimited.length).toBe(1);
      expect(unlimited[0]).toMatch(rubricVersion === WITAN_RUBRIC_VERSION_V23 ? credentialShaped : otherPath);
      for (const limitedMode of ['limited', 'tree-only'] as const) {
        mode.current = limitedMode;
        expect([...(scoreAt(repo, rubricVersion).scanLimitations ?? [])], limitedMode).toEqual(unlimited);
      }
      mode.current = 'real';
    },
    120_000,
  );
});

