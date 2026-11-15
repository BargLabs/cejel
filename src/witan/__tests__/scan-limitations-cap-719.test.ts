import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
const overflow = (omitted: number) =>
  `${omitted} additional disclosed scan limitation(s) omitted at the 16-entry cap — see contentReadSummary for full counts.`;
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

function scan(rubricVersion: string, shallowCheck: 'timeout' | 'echo' | null, others: number): WitanReport {
  injected.shallowCheck = shallowCheck;
  injected.syntheticLimitations = synthetic(others);
  const report = scoreRepoWithPublicCejel({
    repoPath: repo,
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
