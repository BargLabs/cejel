import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderWitanHtmlReport } from '../html.js';
import type { WitanReport } from '../schemas.js';

// Track A3 (ADR-0022): the glossary and "not applicable" sections collapse by default behind
// native <details>/<summary> — no JavaScript, so the certificate stays a single, offline,
// self-contained HTML file. This suite proves that against a real browser loading the file
// directly from disk (file://, no server), not just against the raw markup string — see
// html-metric-layout.test.ts for the same Chrome-launch pattern this file reuses.

const workDir = mkdtempSync(join(tmpdir(), 'cejel-details-disclosure-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// Same one-time cold-start warmup as html-metric-layout.test.ts (2026-09 CI flake fix); each
// test file that launches Chrome pays this cost once in its own beforeAll.
beforeAll(() => {
  execFileSync(
    chromeExecutable(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${join(workDir, 'chrome-warmup')}`,
      '--dump-dom',
      'about:blank',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
}, 30_000);

function chromeExecutable(): string {
  const configured = process.env.CEJEL_CHROME_BIN;
  const playwrightHeadlessShells = [
    join(homedir(), 'Library/Caches/ms-playwright'),
    join(homedir(), '.cache/ms-playwright'),
  ].flatMap((cacheRoot) => {
    if (!existsSync(cacheRoot)) return [];
    return readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium_headless_shell-'))
      .map((entry) =>
        process.platform === 'darwin'
          ? join(cacheRoot, entry.name, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
          : join(cacheRoot, entry.name, 'chrome-headless-shell-linux64/chrome-headless-shell'),
      )
      .filter(existsSync)
      .sort()
      .reverse();
  });
  const candidates = [
    configured,
    ...playwrightHeadlessShells,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((candidate): candidate is string => Boolean(candidate));
  const executable = candidates.find(existsSync);
  if (!executable) {
    throw new Error(
      'Details-disclosure guard requires Chrome/Chromium; set CEJEL_CHROME_BIN to its executable path.',
    );
  }
  return executable;
}

function fixtureReport(): WitanReport {
  return {
    productSlug: 'details-disclosure-fixture',
    productDisplayName: 'Details disclosure fixture',
    repo: { path: '/tmp/details-disclosure-fixture', headSha: 'a'.repeat(40) },
    rubricVersion: 'witan-rubric-v17-2026-07-24',
    verdict: 'conditional',
    codeTrustScore: 3,
    processTrustScore: 3,
    overallScore: 3,
    criteria: [
      {
        id: 'A1',
        category: 'code_trust',
        title: 'Test integrity',
        score: 3,
        status: 'info',
        evidence: [],
        findings: [],
        metrics: [],
      },
      {
        id: 'B4',
        category: 'process_trust',
        title: 'Audit trail',
        score: 0,
        status: 'not_applicable',
        evidence: [],
        findings: [],
        metrics: [],
        notes: 'No audit-trail surface detected.',
      },
    ],
  };
}

function dumpDom(htmlPath: string, extraArgs: readonly string[] = []): string {
  return execFileSync(
    chromeExecutable(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${mkdtempSync(join(workDir, 'chrome-run-'))}`,
      '--dump-dom',
      ...extraArgs,
      pathToFileURL(htmlPath).href,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
}

describe('Track A3 — collapsible sections open natively from a file:// URL', () => {
  const html = renderWitanHtmlReport(fixtureReport());

  it('ships with zero <script> tags — the toggle below is entirely native browser behavior', () => {
    expect(html).not.toContain('<script');
  });

  it('renders the glossary and not-applicable group as collapsed <details> by default', () => {
    const glossaryMatch = html.match(/<details>\s*<summary><h2 id="glossary-heading">/);
    const naGroupMatch = html.match(/<details class="na-group">\s*<summary><h3 class="na-heading">/);

    expect(glossaryMatch, 'glossary must be a <details> with no open attribute').not.toBeNull();
    expect(naGroupMatch, 'na-group must be a <details> with no open attribute').not.toBeNull();
    // Collapsed content is still present in the markup (native <details> hides it via the UA
    // stylesheet, not by omitting it) — a reader with JS disabled, or a machine parser, still
    // sees the full glossary and not-applicable reasons.
    expect(html).toContain('Plain-language glossary');
    expect(html).toContain('No audit-trail surface detected.');
  });

  it('opens directly from disk (no server) and reflects a native summary click as open', () => {
    const htmlPath = join(workDir, 'certificate.html');
    writeFileSync(htmlPath, html);

    const initialDump = dumpDom(htmlPath);
    expect(initialDump).toContain('Cejel Trust Certificate');
    // Freshly loaded from disk: neither <details> has opened itself.
    expect(initialDump).not.toMatch(/<details[^>]* open/);

    // Instrumentation lives only in this test's own copy of the file, never in the shipped
    // renderer output (asserted script-free above) — it drives a real click on the <summary>
    // element, exercising the browser's native HTMLDetailsElement toggle, then reports the
    // resulting `open` state and the previously-collapsed glossary text through document.title
    // (the same "smuggle a value out via <title> before --dump-dom" trick html-metric-
    // layout.test.ts uses, since --dump-dom takes a single static snapshot and can't itself
    // simulate a click).
    const instrumentedHtml = html.replace(
      '</body>',
      `<script>
        document.querySelectorAll('details summary').forEach((summary) => summary.click());
        const allOpen = [...document.querySelectorAll('details')].every((d) => d.open);
        const glossaryVisible = document.getElementById('glossary-heading') !== null &&
          getComputedStyle(document.querySelector('.glossary dl')).display !== 'none';
        document.title = allOpen && glossaryVisible ? 'ALL-OPEN' : 'NOT-OPEN';
      </script></body>`,
    );
    const instrumentedPath = join(workDir, 'certificate-instrumented.html');
    writeFileSync(instrumentedPath, instrumentedHtml);
    const afterClickDump = dumpDom(instrumentedPath);

    expect(afterClickDump).toContain('<title>ALL-OPEN</title>');
    expect(afterClickDump).toMatch(/<details[^>]* open/);
  });
});
