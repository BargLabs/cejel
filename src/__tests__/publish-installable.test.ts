import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// Hermetic install-from-tarball regression test. The real 2026-07-06 `npm publish`
// attempt failed with EUNSUPPORTEDPROTOCOL because internal workspace packages were
// declared under `dependencies` with the pnpm workspace protocol — invisible to the
// prior check, which only grepped `dist/` for those imports (always passes; tsup
// bundles them). This test instead
// packs, installs, and RUNS the published artifact exactly as an npm consumer would,
// entirely offline (no registry reachable, no network dependency in the assertions).
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_MANIFEST = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  name: string;
};
const INSTALLED_PACKAGE_DIR = join('node_modules', ...PACKAGE_MANIFEST.name.split('/'));

const OFFLINE_NPM_ENV = {
  ...process.env,
  NPM_CONFIG_UPDATE_NOTIFIER: 'false',
  NPM_CONFIG_FUND: 'false',
  NPM_CONFIG_AUDIT: 'false',
};

// `npm pack --json` runs the `prepack` lifecycle script (pnpm build) first, and that
// script's own banner/log lines land on the SAME stdout stream `execFileSync` captures —
// so the JSON result is the last thing on stdout, not the only thing. Anchor on the
// trailing `[...]` array rather than parsing the whole capture as JSON.
function parseNpmPackJson(packOutput: string): Array<{ filename: string }> {
  const match = packOutput.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/);
  const jsonBlock = match?.[1];
  if (!jsonBlock) {
    throw new Error(`npm pack --json output did not end with a JSON array:\n${packOutput}`);
  }
  return JSON.parse(jsonBlock) as Array<{ filename: string }>;
}

describe('cejel install-from-tarball (published artifact)', () => {
  let installDir: string;
  let binPath: string;

  beforeAll(() => {
    execFileSync('pnpm', ['run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'pipe' });

    const packDestination = mkdtempSync(join(tmpdir(), 'cejel-pack-'));
    const packOutput = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', packDestination],
      { cwd: PACKAGE_ROOT, encoding: 'utf8', env: OFFLINE_NPM_ENV },
    );
    const packResults = parseNpmPackJson(packOutput);
    const packResult = packResults[0];
    if (!packResult) throw new Error('npm pack --json produced no output entry');
    const tarballPath = join(packDestination, packResult.filename);

    installDir = mkdtempSync(join(tmpdir(), 'cejel-install-'));
    writeFileSync(
      join(installDir, 'package.json'),
      JSON.stringify({ name: 'cejel-install-smoke', private: true, version: '0.0.0' }, null, 2),
    );
    execFileSync('npm', ['install', tarballPath, '--no-audit', '--no-fund', '--loglevel=error'], {
      cwd: installDir,
      env: OFFLINE_NPM_ENV,
    });
    binPath = join(installDir, 'node_modules', '.bin', 'cejel');
  }, 120_000);

  it('installs with no unresolvable internal workspace-protocol runtime dependency', () => {
    const installedManifest = JSON.parse(
      readFileSync(join(installDir, INSTALLED_PACKAGE_DIR, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(installedManifest.dependencies ?? {}).toEqual({});
  });

  it('links node_modules/.bin/cejel', () => {
    expect(existsSync(binPath)).toBe(true);
    expect(lstatSync(binPath).isSymbolicLink()).toBe(true);
  });

  it('runs the installed bin offline via the .bin symlink and prints a trust cert', () => {
    const targetRepo = mkdtempSync(join(tmpdir(), 'cejel-target-'));

    const output = execFileSync(binPath, [], { cwd: targetRepo, encoding: 'utf8' });

    expect(output).toContain('Cejel Trust Certificate');
    const certificateHtml = readFileSync(join(targetRepo, '.cejel', 'certificate.html'), 'utf8');
    const reportJson = readFileSync(join(targetRepo, '.cejel', 'report.json'), 'utf8');
    const badgeSvg = readFileSync(join(targetRepo, '.cejel', 'badge.svg'), 'utf8');
    for (const artifact of [output, certificateHtml, reportJson, badgeSvg]) {
      expect(artifact).not.toContain('Witan');
    }
  });

  it('ships LICENSE in the installed package (AGPL-3.0-only)', () => {
    const installedLicense = readFileSync(
      join(installDir, INSTALLED_PACKAGE_DIR, 'LICENSE'),
      'utf8',
    );
    expect(installedLicense).toContain('GNU Affero General Public License');
  });
});

// Regression guard for the pre-#333 packaging bug: `dist/` is gitignored and `npm publish`
// packs whatever happens to be on disk, so a stale/never-built `dist/` could ship silently.
// `prepublishOnly`/`prepack` (package.json) must make that impossible —
// prove it by deliberately staling `dist/index.js` before packing.
describe('cejel publish path can never ship a stale dist/', () => {
  it('declares prepublishOnly and prepack scripts that run the build', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts.prepublishOnly).toMatch(/build/);
    expect(manifest.scripts.prepack).toMatch(/build/);
  });

  it('rebuilds dist/ during pack even when the on-disk dist is stale', () => {
    const staleMarker = '/* STALE PRE-BUILD PLACEHOLDER — prepack must overwrite this */';
    const distDir = join(PACKAGE_ROOT, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'index.js'), staleMarker);

    try {
      const packDestination = mkdtempSync(join(tmpdir(), 'cejel-pack-stale-'));
      const packOutput = execFileSync(
        'npm',
        ['pack', '--json', '--pack-destination', packDestination],
        { cwd: PACKAGE_ROOT, encoding: 'utf8', env: OFFLINE_NPM_ENV },
      );
      const packResult = parseNpmPackJson(packOutput)[0];
      if (!packResult) throw new Error('npm pack --json produced no output entry');
      const tarballPath = join(packDestination, packResult.filename);

      const extractDir = mkdtempSync(join(tmpdir(), 'cejel-extract-'));
      execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir]);
      const packedIndex = readFileSync(join(extractDir, 'package', 'dist', 'index.js'), 'utf8');

      expect(packedIndex).not.toContain(staleMarker);
      expect(packedIndex).toContain('#!/usr/bin/env node');
    } finally {
      // Leave the package directory in a freshly-built state for any test/tooling that runs after.
      execFileSync('pnpm', ['run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'pipe' });
    }
  }, 60_000);
});
