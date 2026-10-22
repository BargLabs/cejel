import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { WITAN_A2_HISTORY_APPLICABILITY_PREFIX } from '../abstention.js';
import type { GitExecFailureReason } from '../git-exec.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  ISSUE_556_SHAPE,
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #560 review (J1, J5): collector-level tests of A2's history-read failures. A test-file mock of
// execGit fails one chosen git read with a chosen reason and passes every other call to the real
// git, so the collector's own wiring (which reads go through its recorder, and how each reason is
// classified and worded) is what is tested. A real 30-second timeout cannot be produced quickly
// and no production code has a knob for it, so the timeout reason is injected here.
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
const isEnvPathRead = (argv: readonly string[]) => argv[0] === 'log' && argv.includes('--diff-filter=AM');
const isBlobRead = (argv: readonly string[]) => argv[0] === 'show';

const repos = { none: '', issue: '', namedSecret: '' };

beforeAll(() => {
  repos.none = cloneShallowA2Origin(buildShallowA2Origin({ secret: 'none', dataLayer: false, cryptoSurface: false }), 'full');
  repos.issue = cloneShallowA2Origin(buildShallowA2Origin(ISSUE_556_SHAPE), 'full');
  const base = { 'package.json': '{"name":"inject","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };
  repos.namedSecret = cloneShallowA2Origin(
    buildA2HistoryOrigin('inject-secret', [
      { write: base },
      { write: { 'secrets/key.txt': SHALLOW_A2_SYNTHETIC_SECRET_LINE } },
      { remove: ['secrets/key.txt'] },
      { write: { 'README.md': '# r\n' } },
    ]),
    'full',
  );
}, 120_000);

afterEach(() => {
  injected.fail = null;
});

afterAll(() => {
  removeShallowA2Fixtures();
});

function scan(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'inject-fixture',
    productDisplayName: 'Inject fixture',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

const a2 = (report: WitanReport): WitanCriterionScore => {
  const found = report.criteria.find(({ id }) => id === 'A2');
  if (!found) throw new Error('no A2');
  return found;
};

describe('#560 J5: the collector counts a failure of the .env-path history read on its own', () => {
  it('control: a complete clone with no A2 surface is not applicable, with no disclosure', () => {
    for (const rubricVersion of [V17, V27]) {
      expect(a2(scan(repos.none, rubricVersion)).status, rubricVersion).toBe('not_applicable');
      expect(a2(scan(repos.none, rubricVersion)).disclosures, rubricVersion).toBeUndefined();
    }
  });

  it('only the .env-path read fails: v17 stays not applicable and discloses it; v27 abstains at 0', () => {
    injected.fail = (argv) => (isEnvPathRead(argv) ? 'exec_failed' : null);
    const v17 = scan(repos.none, V17);
    expect(v17.scanLimitations).toEqual([
      'Cejel: local git environment-file history scan failed. Cejel continued with reduced Git history evidence.',
    ]);
    expect(a2(v17).status).toBe('not_applicable');
    expect((a2(v17).disclosures ?? []).some((text) => text.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX))).toBe(true);
    const v27 = a2(scan(repos.none, V27));
    expect(v27.status).toBe('insufficient_data');
    expect(v27.score).toBe(0);
    expect(v27.notes ?? '').toContain('Cejel could not read part of the commit history');
  });
});

describe('#560 J1: a history read that hits the timeout', () => {
  it('scoring path: v27 abstains, names the timeout, and says a re-scan may (not will not) lift it', () => {
    injected.fail = (argv) => (isBlobRead(argv) ? 'timeout' : null);
    const v17 = scan(repos.issue, V17);
    expect(v17.scanLimitations).toEqual([
      'Cejel: local git historical blob read exceeded the 30 second timeout. Cejel continued with reduced Git history evidence.',
    ]);
    expect(a2(v17).status).toBe('warning');
    const note = a2(scan(repos.issue, V27)).notes ?? '';
    expect(a2(scan(repos.issue, V27)).status).toBe('insufficient_data');
    expect(note).toContain("stopped at Cejel's own 30-second timeout");
    expect(note).toContain("A re-scan of the same repository may not lift Cejel's own timeout");
    expect(note).not.toContain('will not lift');
    expect(note).not.toContain('could not read part');
    expect(note).not.toContain('fetch-depth');
  });

  it('not-applicable path: v17 discloses the timeout with the same wording; v27 abstains', () => {
    injected.fail = (argv) => (isBlobRead(argv) ? 'timeout' : null);
    const v17 = a2(scan(repos.namedSecret, V17));
    expect(v17.status).toBe('not_applicable');
    const disclosure = (v17.disclosures ?? []).find((text) => text.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX)) ?? '';
    expect(disclosure).toContain("stopped at Cejel's own 30-second timeout");
    expect(disclosure).toContain('may not lift');
    expect(disclosure).not.toContain('will not lift');
    expect(a2(scan(repos.namedSecret, V27)).status).toBe('insufficient_data');
  });

  it('an output limit with the timeout: the size limit will not lift, the timeout may not', () => {
    injected.fail = (argv) => (isBlobRead(argv) ? 'timeout' : isEnvPathRead(argv) ? 'buffer_exceeded' : null);
    const note = a2(scan(repos.namedSecret, V27)).notes ?? '';
    expect(note).toContain('30-second timeout and 8 MiB output limit');
    expect(note).toContain(
      "A re-scan of the same repository will not lift Cejel's own limit on size, and may not lift its timeout",
    );
  });
});
