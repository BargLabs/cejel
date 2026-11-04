import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderWitanHtmlReport } from '../html.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';
import { BEHAVIOUR_CORPUS, buildBehaviourFixture } from './fixtures/behaviour-corpus.js';
import {
  DISCLOSURE_GAP_FIXTURES,
  buildDisclosureGapFixture,
  removeDisclosureGapFixtures,
} from './fixtures/disclosure-gap-fixtures.js';
import { FALSE_ASSURANCE_FIXTURES, buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';

// #654 review, blocker 1: the certificate below the plain first page is unchanged.
//
// What is pinned. For every fixture of three corpora (the behaviour corpus, the disclosure-gap
// fixtures and the false-assurance fixtures), scored under the default rubric (v17) and the opt-in
// v27, certificate.html is rendered with fixed options. The first page this PR adds (the block
// between the cejel:first-page markers, and the whitespace after it) and the anchor ids it links
// to (every ` id="cejel-src-…"` attribute) are removed; what is left must equal, byte for byte, the
// certificate the renderer produced before the first page existed.
//   - certificate-below-first-page/*.html: the full rendered HTML of a representative set
//     (PINNED_IN_FULL below: scan limitations, Git LFS pointers, an unreadable file, a size limit,
//     a held-back file, a shallow clone, an insufficient-source abstention, findings), compared
//     as text so a failure shows the diff.
//   - certificate-below-first-page/certificate-sha256.json: the sha256 of the same bytes for every
//     fixture of the three corpora under both rubrics.
//
// How the pins were captured. Not by running this branch's renderer: a detached worktree of
// origin/main at 733a464d3 (the main this branch has merged, before any first-page code) was made
// with `git worktree add --detach`, this file was copied into it unchanged, and it was run there
// with CEJEL_CERTIFICATE_PIN_CAPTURE set to this branch's pin directory. In capture mode the file
// asserts that the HTML it writes has no first page and no cejel-src id, so a capture run against a
// renderer that already has the first page fails instead of writing pins. The worktree was removed
// afterwards. To re-capture after a deliberate certificate change, repeat that against the main
// that holds the change.
//
// Fixtures are scored with no ingested files, the same product name and a fixed generatedAt and
// CLI version, so the bytes depend only on the fixture and the code. One fixture is left out:
// a false-assurance fixture with symlinksToHostDirectory commits a symlink whose target is a fresh
// temporary directory, so its commit hash, which the certificate prints, differs on every build
// (today only review4-a4-working-directory-through-tracked-symlink). Every other fixture of the
// three corpora is in: 322 fixtures, 644 renders at capture.

const PIN_DIR = new URL('./fixtures/certificate-below-first-page/', import.meta.url);
const CAPTURE_DIR = process.env.CEJEL_CERTIFICATE_PIN_CAPTURE;
const GENERATED_AT = '2026-11-03T00:00:00.000Z';
const CLI_VERSION = '0.0.0-certificate-pin';
const RUBRICS = [
  ['v17', WITAN_RUBRIC_VERSION_V17],
  ['v27', WITAN_RUBRIC_VERSION_V27],
] as const;

const FIRST_PAGE_START = '<!-- cejel:first-page -->';
const FIRST_PAGE_END = '<!-- /cejel:first-page -->';
const ANCHOR_ID = / id="cejel-src-[^"]*"/g;

/** Fixtures whose full HTML is pinned, as `<corpus>/<name>`. */
const PINNED_IN_FULL: readonly string[] = [
  'bc/complete-node-service',
  'bc/committed-secret-and-pem',
  'bc/docs-only-repository',
  'bc/oversized-withheld-source',
  'dg/b2b3-workflow-lfs-pointer',
  'dg/b2b3-workflow-unreadable',
  'fa/a1-js-suite-as-lfs-pointers',
  'fa/a4-uv-locked-lockfile-too-large',
  'fa/history-shallow-clone-with-committed-secret',
];

/**
 * certificate.html as it was before the first page: the block between the markers and the
 * whitespace the renderer writes after it removed, and every cejel-src id removed. Kept here rather
 * than imported, so this file runs unchanged against a renderer that predates the first page.
 */
function certificateBelowFirstPage(html: string): string {
  const start = html.indexOf(FIRST_PAGE_START);
  const end = html.indexOf(FIRST_PAGE_END);
  const withoutPage =
    start === -1 || end === -1
      ? html
      : `${html.slice(0, start)}${html.slice(end + FIRST_PAGE_END.length).replace(/^\n {4}/, '')}`;
  return withoutPage.replace(ANCHOR_ID, '');
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const pinFileName = (key: string): string => `${key.replaceAll('/', '__')}.html`;

const renders = new Map<string, string>();
const builtDirectories: string[] = [];

function scoreAndRender(key: string, repoPath: string): void {
  for (const [short, rubricVersion] of RUBRICS) {
    const report: WitanReport = scoreRepoWithPublicCejel({
      repoPath,
      productSlug: 'certificate-pin',
      productDisplayName: 'Certificate pin fixture',
      generatedAt: GENERATED_AT,
      rubricVersion,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });
    renders.set(`${short}/${key}`, renderWitanHtmlReport(report, { cliVersion: CLI_VERSION, generatedAt: GENERATED_AT }));
  }
}

beforeAll(() => {
  for (const fixture of BEHAVIOUR_CORPUS) {
    const dir = buildBehaviourFixture(fixture);
    builtDirectories.push(dir);
    scoreAndRender(`bc/${fixture.name}`, dir);
  }
  for (const fixture of DISCLOSURE_GAP_FIXTURES) {
    scoreAndRender(`dg/${fixture.name}`, buildDisclosureGapFixture(fixture));
  }
  for (const fixture of FALSE_ASSURANCE_FIXTURES) {
    if (fixture.symlinksToHostDirectory !== undefined) continue;
    const dir = buildFalseAssuranceFixture(fixture);
    builtDirectories.push(dir);
    scoreAndRender(`fa/${fixture.name}`, dir);
  }
}, 1_200_000);

afterAll(() => {
  removeDisclosureGapFixtures();
  for (const dir of builtDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe.runIf(CAPTURE_DIR !== undefined)('capture (run against main, never against this branch)', () => {
  it('writes the pins from a renderer with no first page', () => {
    const dir = CAPTURE_DIR ?? '';
    mkdirSync(dir, { recursive: true });
    const digests: Record<string, string> = {};
    for (const [key, html] of [...renders].sort(([a], [b]) => a.localeCompare(b))) {
      expect(html.includes(FIRST_PAGE_START) || html.includes('cejel-src-'), `${key}: renderer already has the first page`).toBe(
        false,
      );
      digests[key] = sha256(html);
    }
    for (const key of PINNED_IN_FULL) {
      for (const [short] of RUBRICS) {
        const html = renders.get(`${short}/${key}`);
        expect(html, `${short}/${key}`).toBeDefined();
        writeFileSync(join(dir, pinFileName(`${short}/${key}`)), html ?? '');
      }
    }
    writeFileSync(join(dir, 'certificate-sha256.json'), `${JSON.stringify(digests, null, 2)}\n`);
  });
});

describe.skipIf(CAPTURE_DIR !== undefined)('the certificate below the first page is byte-identical to main', () => {
  it('the representative renders match their full pinned HTML', () => {
    const pinned = readdirSync(PIN_DIR).filter((name) => name.endsWith('.html')).sort();
    const expected = PINNED_IN_FULL.flatMap((key) => RUBRICS.map(([short]) => pinFileName(`${short}/${key}`))).sort();
    expect(pinned).toEqual(expected);
    for (const key of PINNED_IN_FULL) {
      for (const [short] of RUBRICS) {
        const name = pinFileName(`${short}/${key}`);
        const pin = readFileSync(new URL(name, PIN_DIR), 'utf8');
        expect(pin.includes(FIRST_PAGE_START) || pin.includes('cejel-src-'), `${name} predates the first page`).toBe(false);
        const html = renders.get(`${short}/${key}`) ?? '';
        // The strip must remove something, or a renderer that dropped the first page would pass
        // trivially and this test would no longer say what it says.
        expect(html.includes(FIRST_PAGE_START), `${name}: no first page to remove`).toBe(true);
        expect(certificateBelowFirstPage(html), name).toBe(pin);
      }
    }
  });

  it('every fixture of the three corpora matches its pinned digest', () => {
    const digests = JSON.parse(readFileSync(new URL('certificate-sha256.json', PIN_DIR), 'utf8')) as Record<
      string,
      string
    >;
    expect(Object.keys(digests).sort()).toEqual([...renders.keys()].sort());
    const moved = [...renders]
      .filter(([key, html]) => sha256(certificateBelowFirstPage(html)) !== digests[key])
      .map(([key]) => key);
    expect(moved).toEqual([]);
  });
});
