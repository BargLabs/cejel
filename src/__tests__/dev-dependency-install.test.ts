import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Guard for a silent-success failure mode: with NODE_ENV=production, pnpm skips
// devDependencies, and because this package declares `dependencies: {}` the install
// exits 0 and leaves node_modules empty.
//
// NODE_ENV=production is deliberately NOT treated as an error. Agent harnesses are
// Electron-hosted and set it unavoidably; it is harmless once .npmrc pins
// `production=false`. A guard that rejected the variable would fail every automated
// run for no reason and would be deleted by the first agent it blocked. These tests
// pin the corrected contract: assert the effect, never the ambient variable.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const guard = join(repoRoot, 'scripts', 'assert-dev-environment.mjs');

function runGuard(args: string[], env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync(process.execPath, [guard, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stderr: '', stdout };
  } catch (error) {
    const e = error as { status?: number; stderr?: string; stdout?: string };
    return { status: e.status ?? 1, stderr: e.stderr ?? '', stdout: e.stdout ?? '' };
  }
}

function fixtureRoot(npmrc: string | null, devDependencies: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-devenv-'));
  if (npmrc !== null) writeFileSync(join(dir, '.npmrc'), npmrc);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'f', devDependencies }));
  return dir;
}

describe('devDependency installation does not depend on NODE_ENV', () => {
  test('.npmrc pins production=false', () => {
    const directives = readFileSync(join(repoRoot, '.npmrc'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    expect(
      directives,
      'Removing production=false lets NODE_ENV=production produce an empty node_modules from an install that reports success. Note "prod=false" is inert.',
    ).toContain('production=false');
  });

  test('NODE_ENV=production alone is not an error in either phase', () => {
    expect(runGuard(['--phase=preinstall'], { NODE_ENV: 'production' }).status).toBe(0);
    expect(runGuard(['--phase=verify'], { NODE_ENV: 'production' }).status).toBe(0);
  });

  test('preinstall fails when the pin is absent, and names the cause', () => {
    const root = fixtureRoot('# no pin here\n', {});
    const result = runGuard([`--root=${root}`, '--phase=preinstall'], { NODE_ENV: 'production' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('production=false');
    expect(result.stderr).toContain('NODE_ENV=production');
  });

  test('preinstall fails when .npmrc is missing, reporting once', () => {
    const root = fixtureRoot(null, {});
    const result = runGuard([`--root=${root}`, '--phase=preinstall'], { NODE_ENV: 'production' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.npmrc is missing');
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
  });

  test('verify fails when a devDependency is not installed, and names NODE_ENV', () => {
    const root = fixtureRoot('production=false\n', { 'definitely-not-installed-pkg': '1.0.0' });
    const result = runGuard([`--root=${root}`, '--phase=verify'], { NODE_ENV: 'production' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('definitely-not-installed-pkg');
    expect(result.stderr).toContain('NODE_ENV=production');
  });

  test('install, test, and CI each invoke the guard with an explicit phase', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['pnpm:devPreinstall']).toContain('--phase=preinstall');
    expect(pkg.scripts.pretest).toContain('--phase=verify');
    const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('assert-dev-environment.mjs --phase=preinstall');
  });
});
