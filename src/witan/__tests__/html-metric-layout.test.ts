import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderWitanHtmlReport } from '../html.js';
import type { WitanReport } from '../schemas.js';

const workDir = mkdtempSync(join(tmpdir(), 'cejel-html-layout-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// CI flake fix (2026-09): the first Chrome launch in a fresh CI job pays a one-time cold-start
// cost (binary/shared-library page-cache warmup, first-run profile creation) that occasionally
// exceeds the 15s budget below on a shared GitHub-hosted runner, throwing `spawnSync ETIMEDOUT`
// on whichever viewport case happens to run first (it.each preserves array order, so 1280 always
// paid this cost; 1440 immediately after was always fast because the OS page cache was warm).
// Paying that cost once here, with its own generous-but-bounded timeout, keeps the per-viewport
// budget below tight (it still catches a genuine rendering regression) while removing the
// ordering-dependent flake. A truly broken/missing Chrome still fails loudly here instead of
// being silently retried or masked.
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
      'HTML layout regression guard requires Chrome/Chromium; set CEJEL_CHROME_BIN to its executable path.',
    );
  }
  return executable;
}

function sentenceLengthMetricReport(): WitanReport {
  return {
    productSlug: 'html-layout-fixture',
    productDisplayName: 'HTML layout fixture',
    repo: { path: '/tmp/html-layout-fixture', headSha: 'a'.repeat(40) },
    rubricVersion: 'witan-rubric-v17-2026-07-24',
    verdict: 'conditional',
    codeTrustScore: 3,
    processTrustScore: 3,
    overallScore: 3,
    criteria: [
      {
        id: 'A1',
        category: 'code_trust',
        title: 'Verification depth',
        score: 3,
        status: 'info',
        evidence: [],
        findings: [],
        metrics: [
          {
            name: 'verification_script_ratio',
            label: 'Verification script ratio',
            value: 1,
            max: 5,
            weight: 1,
            unit: 'ratio',
            kind: 'saturating_count',
            presentation: {
              components: [
                { label: 'repository CI command: test', count: 1 },
                { label: 'repository CI command: coverage', count: 0 },
                { label: 'repository CI command: lint', count: 0 },
                { label: 'repository CI command: type-check', count: 0 },
                { label: 'test-runner configuration', count: 0 },
              ],
            },
          },
        ],
      },
    ],
  };
}

function renderAtViewport(
  html: string,
  width: number,
): { innerWidth: number; clientWidth: number; scrollWidth: number } {
  const measuredHtml = html.replace(
    '</body>',
    `<script>document.title = window.innerWidth + ',' + document.documentElement.clientWidth + ',' + document.documentElement.scrollWidth;</script></body>`,
  );
  const htmlPath = join(workDir, `certificate-${width}.html`);
  writeFileSync(htmlPath, measuredHtml);
  const rendered = execFileSync(
    chromeExecutable(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${join(workDir, `chrome-${width}`)}`,
      `--window-size=${width},1200`,
      '--dump-dom',
      pathToFileURL(htmlPath).href,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  const measurement = rendered.match(/<title>(\d+),(\d+),(\d+)<\/title>/);
  if (!measurement) throw new Error(`Chromium did not return layout widths at ${width}px`);
  return {
    innerWidth: Number(measurement[1]),
    clientWidth: Number(measurement[2]),
    scrollWidth: Number(measurement[3]),
  };
}

describe('HTML metric-value overflow regression', () => {
  const html = renderWitanHtmlReport(sentenceLengthMetricReport());

  it('lets sentence-length metric values wrap inside their card', () => {
    const rule = html.match(/\.criterion-metrics\s*>\s*li\s*>\s*\.metric-value\s*\{([^}]*)\}/);
    expect(rule, 'metric values need a dedicated wrapping rule').not.toBeNull();
    const declarations = rule?.[1] ?? '';
    expect(declarations).toMatch(/white-space:\s*normal/);
    expect(declarations).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
    expect(declarations).not.toMatch(/white-space:\s*nowrap/);
  });

  it.each([1280, 1440])(
    'keeps the rendered document within the %ipx viewport allowance',
    (viewportWidth) => {
      const { innerWidth, clientWidth, scrollWidth } = renderAtViewport(html, viewportWidth);
      expect(innerWidth).toBe(viewportWidth);
      expect(
        scrollWidth,
        `sentence-length metric overflowed at ${viewportWidth}px: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth + 20);
      console.info(
        `viewport=${innerWidth}px clientWidth=${clientWidth}px scrollWidth=${scrollWidth}px allowance=${clientWidth + 20}px PASS`,
      );
    },
    15_000,
  );
});
