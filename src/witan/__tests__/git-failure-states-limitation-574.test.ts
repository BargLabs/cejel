import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { GitExecFailureReason } from '../git-exec.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  buildA2HistoryOrigin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #574 item 3: a failed or timed-out git call never silently changes which evidence a scan reads.
// The three sites the call-site record (git-call-sites-574.test.ts) found silent on main are each
// failed here through the execGit mock, as #560's tests do: a chosen read fails with a chosen
// reason and every other call runs the real git. Under every rubric the report states the failed
// read in its scan limitations; under every rubric but v27 nothing else about the scores moves;
// under v27 a criterion whose score the failed read decides abstains, as #560 set for A2.
const injected = vi.hoisted(() => ({
  fail: null as null | ((argv: readonly string[]) => GitExecFailureReason | null),
}));
vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      const reason = injected.fail?.(argv) ?? null;
      return reason ? { ok: false as const, reason } : actual.execGit(argv, options);
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const isShallowCheck = (argv: readonly string[]) => argv[0] === 'rev-parse' && argv.includes('--is-shallow-repository');
const isCommitTimeRead = (argv: readonly string[]) =>
  argv[0] === 'show' && argv.includes('-s') && argv.includes('--format=%ct');

const SHALLOW_CHECK_TIMEOUT =
  'Cejel: local git shallow-clone check exceeded the 30 second timeout. Cejel could not tell from git whether this clone is shallow.';
const HISTORY_DEPTH_TIMEOUT =
  "Cejel: local git history-depth check exceeded the 30 second timeout. Cejel read the history depth from the repository's own shallow file, which is the file git reads to answer.";
const COMMIT_TIME_FAILED =
  "Cejel: local git HEAD committer-time discovery failed. Cejel recorded each ingested input's freshness as unverifiable.";

const files = {
  'package.json': '{"name":"loaded-host","version":"1.0.0","scripts":{"test":"node --test"}}\n',
  'src/a.js': 'export const a = 1;\n',
  'test/a.test.js': "import { test } from 'node:test';\ntest('a', () => {});\n",
  '.github/workflows/ci.yml':
    'name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n',
};
const repos = { complete: '', shallow: '' };
let ingestDir = '';
let ingestPath = '';

beforeAll(() => {
  const origin = buildA2HistoryOrigin('loaded-host', [
    { write: files },
    { write: { 'README.md': '# loaded host\n' } },
    { write: { 'src/b.js': 'export const b = 2;\n' } },
  ]);
  repos.complete = cloneShallowA2Origin(origin, 'full');
  repos.shallow = cloneShallowA2Origin(origin, 1);
  ingestDir = mkdtempSync(join(tmpdir(), 'cejel-574-ingest-'));
  ingestPath = join(ingestDir, 'scanner.json');
  // Observed long before any commit could exist, so it is stale wherever the commit time is known.
  writeFileSync(
    ingestPath,
    `${JSON.stringify({ version: '1.1', tool: 'scanner', observedAt: '2000-01-01T00:00:00Z', signals: [] })}\n`,
  );
}, 120_000);

afterEach(() => {
  injected.fail = null;
});

afterAll(() => {
  injected.fail = null;
  rmSync(ingestDir, { recursive: true, force: true });
  removeShallowA2Fixtures();
});

function scan(repoPath: string, rubricVersion: string, ingest = false): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'loaded-host',
    productDisplayName: 'Loaded host',
    generatedAt: '2026-11-11T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: ingest ? [ingestPath] : [],
    autoDiscoverIngest: false,
  });
}

function scanFailing(
  repoPath: string,
  rubricVersion: string,
  fail: (argv: readonly string[]) => GitExecFailureReason | null,
  ingest = false,
): WitanReport {
  injected.fail = fail;
  try {
    return scan(repoPath, rubricVersion, ingest);
  } finally {
    injected.fail = null;
  }
}

const criterion = (report: WitanReport, id: string): WitanCriterionScore => {
  const found = report.criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

/** What a rubric's scores are: each criterion's status and score, the composite and the verdict. */
const scores = (report: WitanReport) => ({
  verdict: report.verdict,
  overallScore: report.overallScore,
  criteria: report.criteria.map(({ id, status, score }) => ({ id, status, score })),
});

describe('#574: a failed shallow-clone check is stated (history-depth.ts isShallowRepository and readHistoryDepth)', () => {
  it('every rubric states both failed reads; no rubric but v27 moves a score, status or verdict', () => {
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const idle = scan(repos.complete, rubricVersion);
      const loaded = scanFailing(repos.complete, rubricVersion, (argv) => (isShallowCheck(argv) ? 'timeout' : null));
      expect(idle.scanLimitations ?? [], rubricVersion).not.toContain(SHALLOW_CHECK_TIMEOUT);
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(SHALLOW_CHECK_TIMEOUT);
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(HISTORY_DEPTH_TIMEOUT);
      if (rubricVersion !== V27) expect(scores(loaded), rubricVersion).toEqual(scores(idle));
    }
  });

  it('v27: B2 and A2, whose scores the shallow answer decides, abstain in the composite at 0; v27 stays at or below v17', () => {
    const fail = (argv: readonly string[]) => (isShallowCheck(argv) ? 'timeout' : null);
    const idle = scan(repos.complete, V27);
    expect(criterion(idle, 'B2').status).not.toBe('insufficient_data');
    const loaded = scanFailing(repos.complete, V27, fail);
    const b2 = criterion(loaded, 'B2');
    expect(b2.status).toBe('insufficient_data');
    expect(b2.score).toBe(0);
    expect(b2.notes ?? '').toContain('could not tell whether this clone is shallow');
    expect(criterion(loaded, 'A2').status).toBe('insufficient_data');
    expect(criterion(loaded, 'A2').notes ?? '').toContain('30-second timeout');
    const v17 = scanFailing(repos.complete, V17, fail);
    expect(loaded.overallScore).toBeLessThanOrEqual(v17.overallScore);
  });

  it('on a shallow clone the report still withholds its verdict for the history, and the failed read is stated', () => {
    for (const rubricVersion of [V17, V27]) {
      const idle = scan(repos.shallow, rubricVersion);
      expect(idle.historyLimitations, rubricVersion).toBeDefined();
      const loaded = scanFailing(repos.shallow, rubricVersion, (argv) => (isShallowCheck(argv) ? 'exec_failed' : null));
      // The disclosure says git reported the clone shallow; git did not answer, so it is not written.
      // The report-level reason reads the shallow file (readHistoryDepth) and stands.
      expect(loaded.historyLimitations, rubricVersion).toBeUndefined();
      expect(loaded.verdict, rubricVersion).toBe('insufficient_source');
      expect(loaded.insufficientSourceReason, rubricVersion).toBe(idle.insufficientSourceReason);
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(
        "Cejel: local git history-depth check failed. Cejel read the history depth from the repository's own shallow file, which is the file git reads to answer.",
      );
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(
        'Cejel: local git shallow-clone check failed. Cejel could not tell from git whether this clone is shallow.',
      );
    }
  });

  it('an expected absence (git answers "no repository") adds no scan limitation, as before', () => {
    const idle = scan(repos.complete, V17);
    const absent = scanFailing(repos.complete, V17, (argv) => (isShallowCheck(argv) ? 'not_a_repo' : null));
    expect(absent.scanLimitations).toEqual(idle.scanLimitations);
  });
});

describe("#574: a failed HEAD committer-time read is stated (public-scan.ts readScannedSubject)", () => {
  it('every rubric states it where an ingested input reads it; no score, status or verdict moves', () => {
    for (const rubricVersion of [V17, V27]) {
      const idle = scan(repos.complete, rubricVersion, true);
      expect(idle.inputBinding?.inputs[0]?.checks.freshness, rubricVersion).toBe('stale');
      expect(idle.scanLimitations ?? [], rubricVersion).not.toContain(COMMIT_TIME_FAILED);
      const loaded = scanFailing(repos.complete, rubricVersion, (argv) => (isCommitTimeRead(argv) ? 'exec_failed' : null), true);
      expect(loaded.inputBinding?.inputs[0]?.checks.freshness, rubricVersion).toBe('unverifiable');
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(COMMIT_TIME_FAILED);
      expect(scores(loaded), rubricVersion).toEqual(scores(idle));
    }
  });

  it('with no ingested input the commit time decides nothing, and nothing is added', () => {
    const idle = scan(repos.complete, V17);
    const loaded = scanFailing(repos.complete, V17, (argv) => (isCommitTimeRead(argv) ? 'timeout' : null));
    expect(loaded.scanLimitations).toEqual(idle.scanLimitations);
  });
});
