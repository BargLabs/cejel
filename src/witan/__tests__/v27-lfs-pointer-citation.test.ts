import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { serializeWitanReport } from '../attestation.js';
import { buildRelyingPartySummary } from '../certificate-presentation.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { buildPlainSummary } from '../../plain-summary.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_RUBRIC_VERSION_V28,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import { buildFalseAssuranceFixture, falseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { V27_LFS_POINTER_FIXTURES } from './fixtures/v27-lfs-pointer-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// v27 (#519 follow-up, 2026-11-19). Item A: a criterion that abstains on Git LFS pointers cites
// each pointer it read in its evidence, and its note says how many. Item B: A2 keeps its
// not-applicable result where every pointer it read is at a path whose content A2's applicability
// checks could not use, names them in a disclosure, and is left out of
// contentReadSummary.affectedCriteria. v17 to v26 are byte-identical to main on every new fixture
// (the pins were captured from main 6b4392627 before any code change). v27's scores, statuses and
// finding counts are pinned from main too, apart from the not-applicable results item B keeps.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
// v28 (2026-11-20) postdates these main pins and carries v27's gate; it is measured against v27 on
// these fixtures in leaderboard/RUBRIC_CHANGELOG.md (v28 declared) and v28-a1-readings.test.ts.
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27 && version !== WITAN_RUBRIC_VERSION_V28);

const PINS_PATH = new URL('./fixtures/v27-lfs-pointer-main-pins.json', import.meta.url);
const CAPTURE = process.env.V27_LFS_POINTER_PINS;

const POINTER_LABEL = 'Git LFS pointer; its content is not in this checkout';

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function fixtureNamed(name: string) {
  return V27_LFS_POINTER_FIXTURES.find((entry) => entry.name === name) ?? falseAssuranceFixture(name);
}

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    repo = buildFalseAssuranceFixture(fixtureNamed(name));
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'lfs-pointer-fixture',
    productDisplayName: 'LFS pointer fixture',
    generatedAt: '2026-11-19T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(name: string, rubricVersion: string, id: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const pointerPaths = (score: WitanCriterionScore): string[] =>
  score.evidence.filter(({ label }) => label === POINTER_LABEL).map(({ path }) => path ?? '');

/** What item A must not move: every criterion's score, status and finding count, and the composite. */
function scoringSurface(scored: WitanReport): string {
  return JSON.stringify({
    composite: scored.codeTrustScore ?? null,
    verdict: scored.verdict ?? null,
    criteria: scored.criteria.map(({ id, score, status, findings }) => [id, score, status, findings.length]),
  });
}

const NAMES = V27_LFS_POINTER_FIXTURES.map(({ name }) => name);
// Item B keeps A2 not applicable on these; every other criterion keeps main's v27 scoring surface.
const KEPT_NOT_APPLICABLE = new Set([
  'lfs-a2-binary-asset-pointers',
  'lfs-b4-security-policy-pointer',
  'lfs-a3-docker-compose-with-image-and-font-pointers',
]);

describe('item A — a v27 abstention on Git LFS pointers cites the pointers it rests on', () => {
  it('A2 with a surface and a pointer at src/sign.ts abstains and names src/sign.ts as a pointer', () => {
    const a2 = criterion('lfs-a2-surface-sign-pointer', V27, 'A2');
    expect(a2.status).toBe('insufficient_data');
    expect(pointerPaths(a2)).toEqual(['src/sign.ts']);
    expect(a2.notes).toContain('This abstention rests on 1 Git LFS pointer, cited in this criterion\'s evidence.');
    expect(a2.findings).toEqual([]);
    expect(a2.metrics).toEqual([]);
  });

  it('every criterion that abstains on a pointer cites each one it read, and nothing else', () => {
    const b6 = criterion('lfs-a2-surface-sign-pointer', V27, 'B6');
    expect(b6.status).toBe('insufficient_data');
    expect(pointerPaths(b6)).toEqual(['src/sign.ts']);
    expect(b6.evidence.every(({ label }) => label === POINTER_LABEL)).toBe(true);
  });

  it('the Markdown and HTML certificates list the citations and still say the criterion was not measured', () => {
    const scored = report('lfs-a2-surface-sign-pointer', V27);
    const markdown = renderWitanMarkdownReport(scored);
    expect(markdown).toContain('- A2: Insufficient data');
    expect(markdown).toMatch(/- A2: .*Git LFS pointer; its content is not in this checkout.*src\/sign\.ts/);
    const html = renderWitanHtmlReport(scored);
    expect(html).toContain('<strong>A2 - ');
    expect(html).toContain('Insufficient data — no measurable signal; excluded from composite (unmeasured, not inapplicable).');
    expect(html).toContain('<code>src/sign.ts:1');
  });

  it('the scan limitation no longer says file paths are omitted where pointer paths are cited', () => {
    const limitations = report('lfs-a2-surface-sign-pointer', V27).scanLimitations ?? [];
    expect(limitations).toContain(
      '2 criteria abstained because relevant repository content could not be read. Counts and errno classes are recorded in contentReadSummary, which lists no file paths; each criterion that abstained on a Git LFS pointer cites the pointer paths in its evidence.',
    );
    expect(limitations.join(' ')).not.toContain('file paths are intentionally omitted');
  });

  it('the plain summary translates the reworded limitation, and no longer says the files are not named', () => {
    const plain = JSON.stringify(buildPlainSummary(report('lfs-a2-surface-sign-pointer', V27)));
    expect(plain).toContain('the evidence of each area that read a Git LFS pointer names it');
    expect(plain).not.toContain('does not name them');
  });

  it('scores, statuses and finding counts are main\'s under v27, apart from the not-applicable results item B keeps', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<string, string>;
    for (const name of NAMES.filter((entry) => !KEPT_NOT_APPLICABLE.has(entry))) {
      expect(scoringSurface(report(name, V27)), name).toBe(pins[`v27-scoring-surface/${name}`]);
    }
  });
});

describe('item B — under v27 a not-applicable result stands where no pointer A2 read could change it', () => {
  it('binary-asset pointers only: A2 is not applicable, names the pointers it read, and is not an affected criterion', () => {
    const name = 'lfs-a2-binary-asset-pointers';
    const a2 = criterion(name, V27, 'A2');
    expect(a2.status).toBe('not_applicable');
    const disclosure = (a2.disclosures ?? []).find((sentence) => sentence.includes('Git LFS pointer'));
    expect(disclosure).toBeDefined();
    expect(disclosure).toContain('assets/logo.png');
    expect(disclosure).toContain('models/weights.bin');
    // dist/ is withheld from every collector by the repository walk (a denied path), so A2 never
    // read dist/tool.zip and the disclosure does not call it a pointer A2 read.
    expect(disclosure).not.toContain('dist/tool.zip');
    expect(report(name, V27).contentReadSummary?.byReason.deniedPath).toBe(1);
    expect(report(name, V27).contentReadSummary?.affectedCriteria).not.toContain('A2');
    const { disclosures: _disclosures, ...rest } = a2;
    const { disclosures: _v17Disclosures, ...v17Rest } = criterion(name, V17, 'A2');
    expect(rest).toEqual(v17Rest);
  });

  it('a pointer added at src/crypto/hmac.ts, which A2\'s signing and HMAC detector reads, abstains and cites it', () => {
    const a2 = criterion('lfs-a2-binary-asset-pointers-and-hmac-source', V27, 'A2');
    expect(a2.status).toBe('insufficient_data');
    expect(pointerPaths(a2)).toContain('src/crypto/hmac.ts');
    expect(pointerPaths(a2)).toEqual(['assets/logo.png', 'models/weights.bin', 'src/crypto/hmac.ts']);
    expect(report('lfs-a2-binary-asset-pointers-and-hmac-source', V27).contentReadSummary?.affectedCriteria).toContain('A2');
  });

  it('a .gitignore that is a pointer abstains: A2 reads .gitignore for an .env rule', () => {
    const a2 = criterion('lfs-a2-binary-asset-pointers-and-gitignore-pointer', V27, 'A2');
    expect(a2.status).toBe('insufficient_data');
    expect(pointerPaths(a2)).toContain('.gitignore');
  });

  it('a pointer at a JSON data file, which the committed-secret scan reads as text, still abstains (#519)', () => {
    const a2 = criterion('review-a2-lfs-data-in-not-applicable-library', V27, 'A2');
    expect(a2.status).toBe('insufficient_data');
    expect(pointerPaths(a2)).toEqual(['data/sample.json']);
  });

  it('B4: a SECURITY.md pointer leaves B4 not applicable, since its security-policy-only gate decides from paths', () => {
    const name = 'lfs-b4-security-policy-pointer';
    const b4 = criterion(name, V27, 'B4');
    expect(b4.status).toBe('not_applicable');
    expect(b4.disclosures?.some((sentence) => sentence.startsWith('Files B4 read are Git LFS pointers') && sentence.includes('SECURITY.md'))).toBe(true);
    expect(report(name, V27).contentReadSummary?.affectedCriteria).not.toContain('B4');
    const { disclosures: _disclosures, ...rest } = b4;
    expect(rest).toEqual(criterion(name, V17, 'B4'));
    // A5 and B6 read SECURITY.md for its content (a claim source, a governance document), so they
    // still abstain on it and cite it; A2 does not read it.
    expect(report(name, V27).contentReadSummary?.affectedCriteria).toEqual(['A5', 'B6']);
    expect(pointerPaths(criterion(name, V27, 'A5'))).toEqual(['SECURITY.md']);
    expect(pointerPaths(criterion(name, V27, 'B6'))).toEqual(['SECURITY.md']);
    expect(criterion(name, V27, 'A2')).toEqual(criterion(name, V17, 'A2'));
  });

  it('the certificate lists the disclosure, and its LFS sentence names the not-applicable case', () => {
    const text = buildRelyingPartySummary(report('lfs-a2-binary-asset-pointers', V27)).notEstablished;
    expect(text).toContain('A2 read are Git LFS pointers');
    expect(text).toContain('or stayed not applicable where none of the pointers it read could change that');
    const v17Text = buildRelyingPartySummary(report('lfs-a2-binary-asset-pointers', V17)).notEstablished;
    expect(v17Text).not.toContain('stayed not applicable');
  });
});

describe('v27 is never above v17 on the new fixtures, on every path out of the denominator', () => {
  for (const name of NAMES) {
    it(name, () => {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems).toEqual([]);
      expect(lostFindings(before, after)).toEqual([]);
      // The not-applicable gate: a criterion v27 marks not applicable is one v17 marks not
      // applicable on the same commit, so it leaves the denominator under both.
      for (const v27 of after.criteria.filter(({ status }) => status === 'not_applicable')) {
        expect(before.criteria.find(({ id }) => id === v27.id)?.status, `${name} ${v27.id}`).toBe('not_applicable');
      }
    });
  }
});

describe('every rubric but v27 is byte-identical to main on the new fixtures', () => {
  it.runIf(CAPTURE !== undefined)('writes the pins', () => {
    const pins: Record<string, string> = {};
    for (const name of NAMES) {
      for (const rubricVersion of OTHER_RUBRICS) pins[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
      pins[`v27-scoring-surface/${name}`] = scoringSurface(report(name, V27));
    }
    writeFileSync(CAPTURE ?? '', `${JSON.stringify(pins, null, 2)}\n`);
  });

  it.runIf(CAPTURE === undefined)('matches main on every fixture under every rubric but v27', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<string, string>;
    expect(Object.keys(pins)).toHaveLength(NAMES.length * (OTHER_RUBRICS.length + 1));
    for (const name of NAMES) {
      for (const rubricVersion of OTHER_RUBRICS) {
        const key = `${rubricVersion}/${name}`;
        expect(sha256(serializeWitanReport(report(name, rubricVersion))), key).toBe(pins[key]);
      }
    }
  });
});
