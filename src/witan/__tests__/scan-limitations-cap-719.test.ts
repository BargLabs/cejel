import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { platform } from 'node:process';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { extractFirstPage, firstPageReadableText } from '../../__tests__/plain-first-page-helpers.js';
import { buildPlainSummary } from '../../plain-summary.js';
import { renderWitanHtmlReport } from '../html.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import { type WitanReport, WitanReportSchema } from '../schemas.js';

// #719 (independent review of #718): the history-depth sentence (historyDepthFailureLimitation) is
// added to the scan's limitations before every later one, and the list reached the report with no
// limit. The 16-entry trim beside availableSlots did nothing to a list that already held more than
// 16, so a scan with 16 other limitations and the depth sentence carried 17, failed the report
// schema's max(16), and wrote no report. The cap now holds where the report's list is assembled,
// keeps the depth sentence, and uses the existing overflow sentence and count. A list of 16 or fewer
// is untouched.
//
// Two seams, both test-only. execGit is mocked as #574's tests do, so the depth check times out or
// echoes its option back (an old git). trackContentReads is wrapped so the untracked scan's list
// starts with N synthetic limitations: real scans reach 16 only through many failed reads, which a
// small synthetic fixture cannot produce on demand. The synthetic entries go first, so the depth
// sentence sits past the 15th entry and a plain keep-the-first-15 trim would drop it.
const injected = vi.hoisted(() => ({
  shallowCheck: null as null | 'timeout' | 'echo',
  syntheticLimitations: [] as string[],
}));

vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      if (argv[0] === 'rev-parse' && argv.includes('--is-shallow-repository')) {
        if (injected.shallowCheck === 'timeout') return { ok: false as const, reason: 'timeout' as const };
        if (injected.shallowCheck === 'echo') return { ok: true as const, stdout: '--is-shallow-repository\n' };
      }
      return actual.execGit(argv, options);
    },
  };
});

vi.mock('../content-reads.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../content-reads.js')>();
  return {
    ...actual,
    trackContentReads: <T>(
      repoPath: string,
      collect: () => T,
      options?: Parameters<typeof actual.trackContentReads>[2],
    ) =>
      actual.trackContentReads(
        repoPath,
        () => {
          const value = collect();
          if (injected.syntheticLimitations.length === 0) return value;
          if (typeof value !== 'object' || value === null || !('productSlug' in value)) return value;
          const existing = (value as { scanLimitations?: string[] }).scanLimitations ?? [];
          return { ...value, scanLimitations: [...injected.syntheticLimitations, ...existing] };
        },
        options,
      ),
  };
});

const DEPTH_TIMEOUT =
  "Cejel: local git history-depth check exceeded the 30 second timeout. Cejel read the history depth from the repository's own shallow file, which is the file git reads to answer.";
const DEPTH_ECHO =
  "Cejel: local git history-depth check gave no answer (git printed neither true nor false). Cejel read the history depth from the repository's own shallow file, which is the file git reads to answer.";
// #726 follow-up: where capScanLimitations leaves entries out, they are collected limitations (git
// failures, scan notes), with any content-read candidates after them. contentReadSummary counts
// skipped file reads only, so the sentence points to no field for them.
const overflow = (omitted: number) =>
  `${omitted} additional disclosed scan limitation(s) omitted at the 16-entry cap; the report does not list them.`;
// The content-read candidate path keeps the original sentence: every entry it leaves out is a
// candidate built from the skipped reads contentReadSummary counts.
const candidateOverflow = (omitted: number) =>
  `${omitted} additional disclosed scan limitation(s) omitted at the 16-entry cap — see contentReadSummary for full counts.`;
const PLAIN_UNLISTED = (omitted: number) =>
  `${omitted} more limits on what was read are not listed, because the report keeps at most 16; the report does not list them anywhere else.`;
const PLAIN_CANDIDATE = (omitted: number) =>
  `${omitted} more limits on what was read are not listed, because the report keeps at most 16; the certificate below has the full counts.`;
const FULL_COUNTS_CLAIM = 'the certificate below has the full counts';
const synthetic = (count: number) =>
  Array.from({ length: count }, (_, index) => `Synthetic scan limitation ${index + 1} for the #719 cap fixture.`);

let repo = '';

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'cejel-719-cap-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '--quiet');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'package.json'), '{"name":"cap-fixture","version":"1.0.0","scripts":{"test":"node --test"}}\n');
  writeFileSync(join(repo, 'index.js'), 'export const value = 1;\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'fixture');
}, 60_000);

afterEach(() => {
  injected.shallowCheck = null;
  injected.syntheticLimitations = [];
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

function scan(
  rubricVersion: string,
  shallowCheck: 'timeout' | 'echo' | null,
  others: number,
  repoPath: string = repo,
): WitanReport {
  injected.shallowCheck = shallowCheck;
  injected.syntheticLimitations = synthetic(others);
  const report = scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'cap-fixture',
    productDisplayName: 'Cap fixture',
    generatedAt: '2026-11-15T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  // The report as written: a JSON round trip through the report schema, which caps the list at 16.
  return WitanReportSchema.parse(JSON.parse(JSON.stringify(report)));
}

const RUBRICS = [...new Set([WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V23, WITAN_RUBRIC_VERSION_V27, ...WITAN_SELECTABLE_RUBRIC_VERSIONS])];

describe('#719: the 16-entry cap holds where the report list is assembled, and keeps the history-depth sentence', () => {
  it.each(RUBRICS)('16 other limitations and a failed depth check: 16 entries, the depth sentence kept, the overflow sentence (%s)', (rubricVersion) => {
    const report = scan(rubricVersion, 'timeout', 16);
    expect(report.scanLimitations).toEqual([...synthetic(14), DEPTH_TIMEOUT, overflow(2)]);
  });

  it.each(RUBRICS)('16 other limitations and an old-git echo: 16 entries, the depth sentence kept, the overflow sentence (%s)', (rubricVersion) => {
    const report = scan(rubricVersion, 'echo', 16);
    expect(report.scanLimitations).toEqual([...synthetic(14), DEPTH_ECHO, overflow(2)]);
  });

  it.each(RUBRICS)('15 other limitations and a failed depth check: unchanged, 16 entries and no overflow sentence (%s)', (rubricVersion) => {
    const report = scan(rubricVersion, 'timeout', 15);
    expect(report.scanLimitations).toEqual([...synthetic(15), DEPTH_TIMEOUT]);
  });

  it.each(RUBRICS)('17 other limitations and no depth sentence: the first 15 and the overflow sentence (%s)', (rubricVersion) => {
    const report = scan(rubricVersion, null, 17);
    expect(report.scanLimitations).toEqual([...synthetic(15), overflow(2)]);
  });
});

function firstPageText(report: WitanReport): string {
  const html = renderWitanHtmlReport(report, { cliVersion: '0.0.0', generatedAt: '2026-11-15T00:00:00.000Z' });
  return firstPageReadableText(extractFirstPage(html));
}

const cappedCheckKeys = (report: WitanReport) =>
  buildPlainSummary(report)
    .checkNext.filter(({ key }) => key.startsWith('scan-limitation:capped'))
    .map(({ key, text }) => ({ key, text }));

describe('#726 follow-up: the overflow sentence points to contentReadSummary only where that field holds the omitted entries', () => {
  it.each(RUBRICS)('over the cap from collected limitations: the plain first page says the report does not list them (%s)', (rubricVersion) => {
    const report = scan(rubricVersion, 'timeout', 16);
    expect(report.scanLimitations?.at(-1)).toBe(overflow(2));
    const notKnown = buildPlainSummary(report).notKnown.map(({ text }) => text);
    expect(notKnown).toContain(PLAIN_UNLISTED(2));
    expect(notKnown.join('\n')).not.toContain(FULL_COUNTS_CLAIM);
    const checks = cappedCheckKeys(report);
    expect(checks.map(({ key }) => key)).toEqual(['scan-limitation:capped-unlisted']);
    expect(checks[0]?.text).not.toMatch(/certificate below/);
    const page = firstPageText(report);
    expect(page).toContain(PLAIN_UNLISTED(2));
    expect(page).not.toContain(FULL_COUNTS_CLAIM);
  });

  // chmod-based unreadable files do not deny access to root, or on Windows.
  const canDenyReadAccess = platform !== 'win32' && process.getuid?.() !== 0;

  describe.skipIf(!canDenyReadAccess)('the content-read candidate path', () => {
    let candidateRepo = '';

    beforeAll(() => {
      // Two content-read candidates under v23: A1's coverage file cannot be read (a per-signal read
      // failure) and A3's health-route file is over the content size limit (a per-signal large file).
      candidateRepo = mkdtempSync(join(tmpdir(), 'cejel-719-candidates-'));
      const git = (...args: string[]) => execFileSync('git', args, { cwd: candidateRepo, stdio: 'ignore' });
      git('init', '--quiet');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      git('config', 'commit.gpgsign', 'false');
      const healthRoute =
        'export function health(request, response) {\n' +
        "  if (request.url === '/healthz') return response.end('ok');\n" +
        "  if (request.url === '/readyz') return response.end('ready');\n" +
        '}\n';
      const files: Record<string, string> = {
        'package.json': '{"name":"candidate-fixture","scripts":{"start":"node src/main.js","test":"vitest run"}}\n',
        'src/main.js':
          "import http from 'node:http';\n" +
          'http.createServer((request, response) => response.end(request.method)).listen(5300);\n',
        'src/main.test.js': "import { expect, it } from 'vitest';\nit('runs', () => expect(1).toBe(1));\n",
        'src/health.js': healthRoute + '// '.padEnd(512_001 - healthRoute.length, 'x') + '\n',
        'coverage.json': JSON.stringify({ total: { lines: { pct: 92 } } }),
      };
      for (const [path, contents] of Object.entries(files)) {
        mkdirSync(dirname(join(candidateRepo, path)), { recursive: true });
        writeFileSync(join(candidateRepo, path), contents);
      }
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      chmodSync(join(candidateRepo, 'coverage.json'), 0o000);
    }, 60_000);

    afterAll(() => {
      if (!candidateRepo) return;
      chmodSync(join(candidateRepo, 'coverage.json'), 0o644);
      rmSync(candidateRepo, { recursive: true, force: true });
    });

    it('15 collected limitations and four candidates: the original sentence, translation and check-next line', () => {
      // Alone, the fixture yields four content-read candidates (a wholesale read failure, a
      // wholesale coverage limit, A1's unreadable signal and A3's large-file signals), all built from
      // the skipped reads contentReadSummary counts. After 15 collected limitations one slot is left,
      // so all four are left out and the slot holds the original sentence.
      const alone = scan(WITAN_RUBRIC_VERSION_V23, null, 0, candidateRepo);
      expect(alone.scanLimitations).toHaveLength(4);
      const report = scan(WITAN_RUBRIC_VERSION_V23, null, 15, candidateRepo);
      expect(report.contentReadSummary?.byReason.unreadable).toBe(1);
      expect(report.contentReadSummary?.byReason.tooLarge).toBe(1);
      expect(report.scanLimitations).toEqual([...synthetic(15), candidateOverflow(4)]);
      expect(buildPlainSummary(report).notKnown.map(({ text }) => text)).toContain(PLAIN_CANDIDATE(4));
      expect(cappedCheckKeys(report).map(({ key }) => key)).toEqual(['scan-limitation:capped']);
      expect(firstPageText(report)).toContain(PLAIN_CANDIDATE(4));
    });
  });
});
