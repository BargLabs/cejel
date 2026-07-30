#!/usr/bin/env node
/**
 * Guard against a silent-success install.
 *
 * With NODE_ENV=production, pnpm omits devDependencies. This package declares
 * `dependencies: {}`, so that yields an empty node_modules from an install that
 * exits 0 and prints "Already up to date" — the failure then surfaces later as a
 * missing binary and reads as a toolchain problem.
 *
 * NODE_ENV=production is NOT itself an error. Agent harnesses are Electron-hosted
 * and Electron sets it on the process that spawns their shells; it cannot be unset
 * and is harmless once .npmrc pins `production=false`. So this guard never fails on
 * the variable. It asserts the two things that actually matter, at the only points
 * each can be observed:
 *
 *   --phase=preinstall  the config that will govern the imminent install is in place
 *   --phase=verify      devDependencies are actually resolvable (post-condition)
 *
 * Note the key is `production`, not `prod`: `prod=false` is inert on the NODE_ENV
 * path while `pnpm config get prod` still reports `false`.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const rootArg = process.argv.find((a) => a.startsWith('--root='))?.slice(7);
// --root exists so the failure paths are testable without mutating this repo.
const repoRoot = rootArg
  ? pathToFileURL(rootArg.endsWith('/') ? rootArg : `${rootArg}/`)
  : new URL('../', import.meta.url);
const phase = process.argv.find((a) => a.startsWith('--phase='))?.slice(8) ?? 'verify';
const inProduction = process.env.NODE_ENV === 'production';

const CAUSE =
  'NODE_ENV=production makes pnpm skip devDependencies, and this package declares ' +
  'dependencies:{} — so the install completes, exits 0, and leaves node_modules empty.';

function fail(message) {
  console.error(`dev-environment guard failed (phase=${phase}): ${message}`);
  process.exitCode = 1;
}

if (phase === 'preinstall') {
  // devDependencies are legitimately absent here, so the effect cannot be observed
  // yet. Assert the protection that makes the upcoming install correct instead.
  let npmrc = '';
  try {
    npmrc = readFileSync(new URL('.npmrc', repoRoot), 'utf8');
  } catch {
    fail(`.npmrc is missing; it must pin "production=false". ${CAUSE}`);
    process.exit(1);
  }
  const pinned = npmrc
    .split(/\r?\n/)
    .map((l) => l.trim())
    .some((l) => l === 'production=false');
  if (!pinned) {
    fail(
      `.npmrc does not pin "production=false" (note: "prod=false" does not work). ${CAUSE}`,
    );
  }
} else {
  // Post-condition: every declared devDependency must actually resolve.
  const require = createRequire(new URL('package.json', repoRoot));
  const pkg = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8'));
  const declared = Object.keys(pkg.devDependencies ?? {});
  const missing = declared.filter((name) => {
    try {
      require.resolve(`${name}/package.json`);
      return false;
    } catch {
      try {
        require.resolve(name);
        return false;
      } catch {
        return true;
      }
    }
  });
  if (missing.length > 0) {
    fail(
      `${missing.length} of ${declared.length} devDependencies are not installed ` +
        `(${missing.join(', ')}). ${inProduction ? `Likely cause: ${CAUSE}` : 'Run a dependency install.'}`,
    );
  }
}
