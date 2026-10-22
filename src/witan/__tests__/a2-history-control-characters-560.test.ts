import { afterAll, describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
} from './fixtures/shallow-a2-shapes.js';

// #560, review pass 1 (an AI reviewer): a credential-shaped history path with control characters in
// its name is left unread (a fixed rule, unchanged, with its existing scan limitation), so a value
// kept under such a name never reached the scan and A2 could be marked not applicable over it. It
// now counts as an incomplete read of the history. A path with control characters that A2 would not
// have read anyway is still not counted (shallow-a2-applicability-556.test.ts). Real git,
// constructed fixtures only. File-name classification of failed reads is pinned in
// a2-history-path-names-560.test.ts and git-failure-classification-560.test.ts.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const base = {
  'package.json': '{"name":"corner","version":"1.0.0"}\n',
  'src/a.js': 'export const a = 1;\n',
};
const SECRET = `stripe_secret_key = "${SHALLOW_A2_SYNTHETIC_SECRET_LINE.trim().split('=')[1]}"\n`;

afterAll(() => {
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'a2-history-failure-classes',
    productDisplayName: 'A2 history failure classes',
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

/** A credential-shaped file holding the synthetic key, committed, deleted, then one more commit. */
function deletedSecretOrigin(name: string, path: string): string {
  return buildA2HistoryOrigin(name, [
    { write: base },
    { write: { [path]: SECRET } },
    { remove: [path] },
    { write: { 'README.md': '# c\n' } },
  ]);
}

describe('#560: a credential-shaped history path skipped for control characters counts as an incomplete read', () => {
  it('v17 stays not applicable and says so; v27 abstains at 0; the scan limitation is unchanged', () => {
    const repo = cloneShallowA2Origin(deletedSecretOrigin('control-character-secret', 'secrets\tkey.txt'), 'full');
    const limitation =
      'Git history contained a credential-shaped pathname with control characters. Cejel omitted that path from historical blob inspection and continued with reduced history evidence.';

    const v17 = scoreAt(repo, V17);
    expect(v17.scanLimitations).toEqual([limitation]);
    expect(a2(v17).status).toBe('not_applicable');
    expect(a2(v17).disclosures).toEqual([
      "A2's applicability was decided from an incomplete read of the commit history: Cejel left a " +
        'credential-shaped path in the commit history unread because its name contains control ' +
        "characters (the scan limitations say so). Marking A2 not applicable rests in part on Cejel's " +
        'scans of earlier commits for .env files and credential-shaped values, so a complete read of ' +
        "the history may make A2 applicable and give it a score. A re-scan of the same repository will " +
        "not lift Cejel's own rule on control characters in paths.",
    ]);

    const v27 = scoreAt(repo, V27);
    expect(v27.scanLimitations).toEqual([limitation]);
    const criterion = a2(v27);
    expect(criterion.status).toBe('insufficient_data');
    expect(criterion.score).toBe(0);
    expect(criterion.notes ?? '').toContain('unread because its name contains control characters');
    expect(criterion.notes ?? '').not.toContain('fetch-depth');
    expect(v27.codeTrustScore as number).toBeLessThan(v17.codeTrustScore as number);
  });
});
