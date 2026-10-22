import { afterAll, describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';
import { buildA2HistoryOrigin, cloneShallowA2Origin, removeShallowA2Fixtures } from './fixtures/shallow-a2-shapes.js';

// #569: the scan limitation for a history path skipped for control characters said "a
// credential-shaped pathname" for every such path. On the public row axios the only one is
// `\bMIGRATION_GUIDE.md`, which is not credential-shaped, so the report stated something false. The
// credential-shaped sentence is now kept for credential- or `.env`-shaped paths, and other paths get
// a sentence that says what is true of them. Both are scan limitations, so a report with either one
// is gated exactly as before (unrated v17 badge, `--min-score` refuses). Real git, constructed
// fixtures only.

const CREDENTIAL_SHAPED =
  'Git history contained a credential-shaped pathname with control characters. Cejel omitted that path from historical blob inspection and continued with reduced history evidence.';
const OTHER =
  'Git history contained a pathname with control characters that is not credential-shaped. Cejel did not read that path in its history scans.';
const base = { 'package.json': '{"name":"corner","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };

afterAll(() => {
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'control-character-limitation',
    productDisplayName: 'Control character limitation',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function repoWith(name: string, files: Record<string, string>): string {
  return cloneShallowA2Origin(buildA2HistoryOrigin(name, [{ write: { ...base, ...files } }, { write: { 'README.md': '# c\n' } }]), 'full');
}

describe('#569: the control-character limitation calls a path credential-shaped only when it is', () => {
  it('a path that is not credential- or .env-shaped gets the accurate sentence, under v17 and v27', () => {
    const repo = repoWith('control-character-other', { '\bMIGRATION_GUIDE.md': '# m\n' });
    for (const rubricVersion of [WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27]) {
      expect(scoreAt(repo, rubricVersion).scanLimitations, rubricVersion).toEqual([OTHER]);
    }
  });

  it('a credential-shaped path keeps the credential-shaped sentence', () => {
    const repo = repoWith('control-character-credential', { 'secrets\tkey.txt': 'x\n' });
    expect(scoreAt(repo, WITAN_RUBRIC_VERSION_V17).scanLimitations).toEqual([CREDENTIAL_SHAPED]);
  });

  it('an .env-shaped path keeps the credential-shaped sentence', () => {
    const repo = repoWith('control-character-env', { 'config/\t.env': 'X=1\n' });
    expect(scoreAt(repo, WITAN_RUBRIC_VERSION_V17).scanLimitations).toEqual([CREDENTIAL_SHAPED]);
  });

  it('both kinds in one history give both sentences', () => {
    const repo = repoWith('control-character-both', { '\bMIGRATION_GUIDE.md': '# m\n', 'secrets\tkey.txt': 'x\n' });
    expect([...(scoreAt(repo, WITAN_RUBRIC_VERSION_V17).scanLimitations ?? [])].sort()).toEqual(
      [CREDENTIAL_SHAPED, OTHER].sort(),
    );
  });
});
