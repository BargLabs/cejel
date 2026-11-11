import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { GitExecFailureReason } from '../git-exec.js';
import { isWitanHistoryDepthUnknownAbstention } from '../history-depth.js';
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

// #574 item 3, review of b67489a96 (operator rulings of 11 Nov, items A and C).
//
// Item A: a scan reads its history depth once (readHistoryDepthAnswer, which falls back to the
// shallow file git itself reads), and every criterion uses that one answer. Before, each of four
// `rev-parse --is-shallow-repository` checks fell back on its own: on a depth-1 clone whose B2 check
// alone failed, v17's B2 read the truncated window as complete; on a full clone where one check
// failed, v27's A2 or B2 abstained although another check had answered "complete". v27's A2 and B2
// abstain on the depth only where git failed and the files cannot settle it.
//
// Item C: v27 A1's builtin-copy check lists every tracked file (filesIncludingExcluded); a failed
// listing is a stated scan limitation, as every other failed `ls-files` is.
//
// Failures are injected through the execGit mock, as #560's tests do. `fail` sees the argv and the
// call's stack, so a test can fail the call one function makes and run the real git for the rest.
const injected = vi.hoisted(() => ({
  fail: null as null | ((argv: readonly string[], stack: string) => GitExecFailureReason | null),
  shallowChecks: 0,
  gitEntry: undefined as string | undefined,
}));
vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      if (argv[0] === 'rev-parse' && argv.includes('--is-shallow-repository')) injected.shallowChecks += 1;
      let stack = '';
      if (injected.fail) {
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = 64;
        stack = new Error('stack').stack ?? '';
        Error.stackTraceLimit = limit;
      }
      const reason = injected.fail?.(argv, stack) ?? null;
      return reason ? { ok: false as const, reason } : actual.execGit(argv, options);
    },
    // Where a test sets gitEntry, the history-depth reader's files fallback reads it as the `.git`
    // entry: a gitfile whose git directory is gone, so the files cannot settle the depth.
    findVisibleGitMetadata: (repoPath: string) => injected.gitEntry ?? actual.findVisibleGitMetadata(repoPath),
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const isShallowCheck = (argv: readonly string[]) => argv[0] === 'rev-parse' && argv.includes('--is-shallow-repository');
const calledFrom = (stack: string, name: string) => new RegExp(`\\b${name}\\b`).test(stack);

const DEPTH_TIMEOUT_SETTLED =
  "Cejel: local git history-depth check exceeded the 30 second timeout. Cejel read the history depth from the repository's own shallow file, which is the file git reads to answer.";
const DEPTH_TIMEOUT_UNSETTLED =
  "Cejel: local git history-depth check exceeded the 30 second timeout. Cejel could not read the history depth from the repository's files either.";
const BUILTIN_LISTING_TIMEOUT =
  "Cejel: local git full tracked-file inventory exceeded the 30 second timeout. A1 credited no copy of pytest's collected items made through a builtin, because the files that may replace the builtin could not be listed.";

const files = {
  'package.json': '{"name":"loaded-host","version":"1.0.0","scripts":{"test":"node --test"}}\n',
  'src/a.js': 'export const a = 1;\n',
  'test/a.test.js': "import { test } from 'node:test';\ntest('a', () => {});\n",
  '.github/workflows/ci.yml':
    'name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n',
};
// A pytest suite whose conftest.py hook empties the collected items and puts back a copy made
// through the builtin list(): v27 A1 credits the copy only where every tracked file can be listed.
const pythonFiles = {
  'pyproject.toml': '[project]\nname = "loaded-host-py"\nversion = "1.0.0"\n',
  'src/loaded/__init__.py': 'VALUE = 1\n',
  'tests/test_value.py': 'def test_value():\n    assert 1 == 1\n',
  'tests/conftest.py':
    'def pytest_collection_modifyitems(config, items):\n    saved = list(items)\n    items.clear()\n    items.extend(saved)\n',
};
const repos = { complete: '', shallow: '', python: '' };
let scratch = '';
let danglingGitFile = '';

beforeAll(() => {
  const origin = buildA2HistoryOrigin('one-answer', [
    { write: files },
    { write: { 'README.md': '# loaded host\n' } },
    { write: { 'src/b.js': 'export const b = 2;\n' } },
  ]);
  repos.complete = cloneShallowA2Origin(origin, 'full');
  repos.shallow = cloneShallowA2Origin(origin, 1);
  repos.python = cloneShallowA2Origin(buildA2HistoryOrigin('one-answer-py', [{ write: pythonFiles }]), 'full');
  scratch = mkdtempSync(join(tmpdir(), 'cejel-574-one-answer-'));
  danglingGitFile = join(scratch, '.git');
  writeFileSync(danglingGitFile, `gitdir: ${join(scratch, 'gone')}\n`);
}, 120_000);

afterEach(() => {
  injected.fail = null;
  injected.gitEntry = undefined;
});

afterAll(() => {
  injected.fail = null;
  injected.gitEntry = undefined;
  rmSync(scratch, { recursive: true, force: true });
  removeShallowA2Fixtures();
});

function scan(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'loaded-host',
    productDisplayName: 'Loaded host',
    generatedAt: '2026-11-11T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function scanFailing(
  repoPath: string,
  rubricVersion: string,
  fail: (argv: readonly string[], stack: string) => GitExecFailureReason | null,
): WitanReport {
  injected.fail = fail;
  try {
    return scan(repoPath, rubricVersion);
  } finally {
    injected.fail = null;
  }
}

const criterion = (report: WitanReport, id: string): WitanCriterionScore => {
  const found = report.criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};
const reading = (report: WitanReport, id: string) => {
  const { status, score } = criterion(report, id);
  return { status, score };
};
const scores = (report: WitanReport) => ({
  verdict: report.verdict,
  overallScore: report.overallScore,
  insufficientSourceReason: report.insufficientSourceReason,
  criteria: report.criteria.map(({ id, status, score }) => ({ id, status, score })),
});

const everyShallowCheck = (argv: readonly string[]) => (isShallowCheck(argv) ? ('timeout' as const) : null);

describe('#574 item A: one history-depth answer per scan', () => {
  it('a scan asks git for the history depth once', () => {
    for (const rubricVersion of [V17, V27]) {
      injected.shallowChecks = 0;
      scan(repos.complete, rubricVersion);
      expect(injected.shallowChecks, rubricVersion).toBe(1);
      injected.shallowChecks = 0;
      scan(repos.shallow, rubricVersion);
      expect(injected.shallowChecks, rubricVersion).toBe(1);
    }
  });

  it('v17, depth-1 clone: a failed check where B2 read it leaves B2 as git answering gives it', () => {
    const idle = scan(repos.shallow, V17);
    const b2Only = scanFailing(repos.shallow, V17, (argv, stack) =>
      isShallowCheck(argv) && calledFrom(stack, 'collectB2PrTraceEvidence') ? 'timeout' : null,
    );
    expect(reading(b2Only, 'B2')).toEqual(reading(idle, 'B2'));
    expect(scores(b2Only)).toEqual(scores(idle));
  });

  it('depth-1 clone, every check failing: every rubric scores as git answering gives it, and states the failed read', () => {
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const idle = scan(repos.shallow, rubricVersion);
      const loaded = scanFailing(repos.shallow, rubricVersion, everyShallowCheck);
      expect(scores(loaded), rubricVersion).toEqual(scores(idle));
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(DEPTH_TIMEOUT_SETTLED);
      expect(idle.scanLimitations ?? [], rubricVersion).not.toContain(DEPTH_TIMEOUT_SETTLED);
    }
  });

  it('v27, full clone of 3 commits: a check failing in A2 or in B2 alone moves nothing', () => {
    const idle = scan(repos.complete, V27);
    for (const caller of ['a2HistoryIncompleteness', 'collectB2PrTraceEvidence']) {
      const loaded = scanFailing(repos.complete, V27, (argv, stack) =>
        isShallowCheck(argv) && calledFrom(stack, caller) ? 'timeout' : null,
      );
      expect(scores(loaded), caller).toEqual(scores(idle));
    }
  });

  it('full clone, every check failing: the shallow file settles "complete", so no rubric moves, v27 included', () => {
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const idle = scan(repos.complete, rubricVersion);
      const loaded = scanFailing(repos.complete, rubricVersion, everyShallowCheck);
      expect(scores(loaded), rubricVersion).toEqual(scores(idle));
      expect(criterion(loaded, 'B2').notes, rubricVersion).toBe(criterion(idle, 'B2').notes);
      expect(criterion(loaded, 'A2').notes, rubricVersion).toBe(criterion(idle, 'A2').notes);
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(DEPTH_TIMEOUT_SETTLED);
    }
  });

  it('git failing and the files unable to settle the depth: stated under every rubric, no verdict, and v27 A2 and B2 abstain', () => {
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      injected.gitEntry = danglingGitFile;
      const loaded = scanFailing(repos.complete, rubricVersion, everyShallowCheck);
      injected.gitEntry = undefined;
      expect(loaded.scanLimitations ?? [], rubricVersion).toContain(DEPTH_TIMEOUT_UNSETTLED);
      expect(loaded.scanLimitations ?? [], rubricVersion).not.toContain(DEPTH_TIMEOUT_SETTLED);
      expect(isWitanHistoryDepthUnknownAbstention(loaded), rubricVersion).toBe(true);
      expect(loaded.overallScore, rubricVersion).toBeNull();
      if (rubricVersion === V27) {
        expect(criterion(loaded, 'A2').status).toBe('insufficient_data');
        const b2 = criterion(loaded, 'B2');
        expect(b2.status).toBe('insufficient_data');
        expect(b2.score).toBe(0);
        expect(b2.notes ?? '').toContain('could not tell whether this clone is shallow');
      }
    }
  });
});

describe("#574 item C: v27 A1's builtin-copy listing states a failed ls-files", () => {
  const failListing = (argv: readonly string[], stack: string) =>
    argv[0] === 'ls-files' && calledFrom(stack, 'filesIncludingExcluded') ? ('timeout' as const) : null;

  it('v27: the failed listing is a scan limitation, and A1 still says the files could not be listed', () => {
    const idle = scan(repos.python, V27);
    expect(idle.scanLimitations ?? []).not.toContain(BUILTIN_LISTING_TIMEOUT);
    const loaded = scanFailing(repos.python, V27, failListing);
    expect(loaded.scanLimitations ?? []).toContain(BUILTIN_LISTING_TIMEOUT);
    expect(criterion(loaded, 'A1').notes ?? '').toContain("the repository's files could not be listed");
  });

  it('v17 reads no builtin copy, so nothing is listed and nothing is added', () => {
    const idle = scan(repos.python, V17);
    const loaded = scanFailing(repos.python, V17, failListing);
    expect(loaded.scanLimitations).toEqual(idle.scanLimitations);
    expect(scores(loaded)).toEqual(scores(idle));
  });
});
