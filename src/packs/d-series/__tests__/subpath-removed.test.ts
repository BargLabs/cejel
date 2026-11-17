import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// #423: the `@cejel/cejel/d-series` subpath, deprecated in 0.6.2 (#419), is removed in 0.7.0. The
// source stays in this repository as the taxonomy and the precision-gate scripts load it from
// source, so nothing published may name it: not package.json's exports, not the tsup entry list.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Resolves a specifier the way an installed package's importer would, through the package's own exports. */
function resolveFromPackage(specifier: string): string {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `try { console.log(import.meta.resolve(${JSON.stringify(specifier)})); } catch (error) { console.log(error.code); }`,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe('the d-series subpath is removed (#423)', () => {
  it('no longer resolves, while the decision-contracts subpath beside it still does', () => {
    expect(resolveFromPackage('@cejel/cejel/d-series')).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
    expect(resolveFromPackage('@cejel/cejel/decision-contracts')).toMatch(
      /\/dist\/packs\/decision-contracts\/index\.js$/,
    );
  });

  it('is neither exported nor built', () => {
    const manifest = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(Object.keys(manifest.exports)).not.toContain('./d-series');
    expect(JSON.stringify(manifest.exports)).not.toContain('d-series');
    expect(readFileSync(`${ROOT}tsup.config.ts`, 'utf8')).not.toContain('src/packs/d-series/');
  });

  it('still exports every detector from source for the precision-gate scripts', async () => {
    const pack: Record<string, unknown> = await import('../index.js');
    for (const name of [
      'D_SERIES_RULE_TIERS',
      'scanDeclaredButUnreadConfig',
      'scanSwallowedErrors',
      'scanUnassertedSetTransforms',
      'scanEmptyFailureConflation',
      'scanSelfReferentialVerification',
      'scanUnobservedControls',
    ]) {
      expect(pack).toHaveProperty(name);
    }
  });
});
