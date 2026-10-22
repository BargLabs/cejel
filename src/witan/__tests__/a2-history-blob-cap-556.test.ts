import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import { buildA2HistoryOrigin, cloneShallowA2Origin, removeShallowA2Fixtures } from './fixtures/shallow-a2-shapes.js';

// #560, operator decision of 2026-10-22 (#526): the history secret scan's cap on how many historical
// files it reads (5,000) counts as an incomplete read of the commit history. Before, a scan that
// stopped at the cap with nothing found let A2 be marked not applicable, or score, as if it had
// read every candidate. Under witan-rubric-v27-prospective-2026-10-19 A2 now abstains at 0 unless a
// confirmed critical finding stands; every other rubric keeps its scoring and, where A2 is not
// applicable, says so.
//
// Speed: reaching the cap takes 5,000 historical blob reads, one `git show` each, about 90 s per
// scan on a developer laptop. This file replaces only `git show` of the fixture's own certs/*.pem
// blobs with the bytes git would return (each file holds its own name), so the scan's enumeration,
// cap and decisions all run for real. No production code has a knob for the cap.
const blobReads = { count: 0 };
vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      const match = argv[0] === 'show' ? /^[0-9a-f]{40}:certs\/(c[0-9]+)\.pem$/.exec(argv[1] ?? '') : null;
      if (match) {
        blobReads.count += 1;
        return { ok: true as const, stdout: `${match[1]}\n` };
      }
      return actual.execGit(argv, options);
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const CAP_CAUSE = "Cejel's scan of earlier commits for credential-shaped values stopped at its own cap of 5,000 historical files";
const CAP_DISCLOSURE =
  "A2's applicability was decided from an incomplete read of the commit history: " +
  `${CAP_CAUSE}. Marking A2 not applicable rests in part on Cejel's scans of earlier commits for .env ` +
  'files and credential-shaped values, so a complete read of the history may make A2 applicable and ' +
  "give it a score. A re-scan of the same repository will not lift Cejel's own limit.";

function certs(count: number): Record<string, string> {
  const files: Record<string, string> = {
    'package.json': '{"name":"cap","version":"1.0.0"}\n',
    'src/a.js': 'export const a = 1;\n',
  };
  for (let index = 0; index < count; index += 1) files[`certs/c${index}.pem`] = `c${index}\n`;
  return files;
}

const repos: Record<'over' | 'at' | 'overApplicable', string> = { over: '', at: '', overApplicable: '' };

beforeAll(() => {
  // One commit adding 5,001 credential-shaped paths (.pem): one more than the cap. Control: exactly
  // 5,000, which the scan reads in full. The third adds a .gitignore .env rule, a tree surface that
  // makes A2 applicable, so A2 takes the scoring path.
  repos.over = cloneShallowA2Origin(buildA2HistoryOrigin('cap-over', [{ write: certs(5_001) }, { write: { 'README.md': '# c\n' } }]), 'full');
  repos.at = cloneShallowA2Origin(buildA2HistoryOrigin('cap-at', [{ write: certs(5_000) }, { write: { 'README.md': '# c\n' } }]), 'full');
  repos.overApplicable = cloneShallowA2Origin(
    buildA2HistoryOrigin('cap-over-applicable', [{ write: certs(5_001) }, { write: { '.gitignore': '.env\n' } }]),
    'full',
  );
}, 120_000);

afterAll(() => {
  removeShallowA2Fixtures();
});

function scan(repoPath: string, rubricVersion: string): { report: WitanReport; reads: number } {
  const before = blobReads.count;
  const report = scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'cap-fixture',
    productDisplayName: 'Cap fixture',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  return { report, reads: blobReads.count - before };
}

function a2(report: WitanReport): WitanCriterionScore {
  const found = report.criteria.find(({ id }) => id === 'A2');
  if (!found) throw new Error('no A2');
  return found;
}

describe('#560: the history secret scan cap counts as an incomplete read', () => {
  it('over the cap with no other A2 surface: v17 stays not applicable and says so; v27 abstains at 0', () => {
    const v17 = scan(repos.over, V17);
    expect(v17.reads).toBe(5_000);
    expect(a2(v17.report).status).toBe('not_applicable');
    expect(a2(v17.report).disclosures).toEqual([CAP_DISCLOSURE]);
    expect(v17.report.scanLimitations ?? []).toEqual([]);

    const v27 = scan(repos.over, V27);
    expect(v27.reads).toBe(5_000);
    const criterion = a2(v27.report);
    expect(criterion.status).toBe('insufficient_data');
    expect(criterion.score).toBe(0);
    expect(criterion.notes ?? '').toContain(CAP_CAUSE);
    expect(criterion.notes ?? '').toContain('would otherwise have been marked not applicable');
    expect(criterion.notes ?? '').toContain("A re-scan of the same repository will not lift Cejel's own limit.");
    expect(criterion.notes ?? '').not.toContain('fetch-depth');
    expect(criterion.notes ?? '').not.toContain('scan limitations');
    expect(v27.report.codeTrustScore as number).toBeLessThan(v17.report.codeTrustScore as number);
  });

  it('exactly at the cap the scan reads every candidate: A2 stays not applicable under v17 and v27, with no disclosure', () => {
    for (const rubricVersion of [V17, V27]) {
      const { report, reads } = scan(repos.at, rubricVersion);
      expect(reads, rubricVersion).toBe(5_000);
      expect(a2(report).status, rubricVersion).toBe('not_applicable');
      expect(a2(report).disclosures, rubricVersion).toBeUndefined();
    }
  });

  it('over the cap where A2 applies: v17 scores with the cap finding as before; v27 abstains at 0', () => {
    const v17 = a2(scan(repos.overApplicable, V17).report);
    expect(v17.status).not.toBe('insufficient_data');
    expect(v17.findings.map(({ summary }) => summary)).toContain(
      'History secret scan reached the credential-path safety valve before scanning every matching blob.',
    );
    const v27 = a2(scan(repos.overApplicable, V27).report);
    expect(v27.status).toBe('insufficient_data');
    expect(v27.score).toBe(0);
    expect(v27.notes ?? '').toContain(CAP_CAUSE);
    expect(v27.notes ?? '').toContain('no confirmed critical finding stands on what was read');
  });
});
