import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Golden calibration anchors for A2 secret-posture — goal_cejel_calibration_findings_precision_2026-07-06.
//
// These build TEMP git repos at test-run time rather than committing static fixture files
// into this repo's tracked tree. Two reasons: (1) a literal high-entropy secret-shaped
// string checked into alfred's own git history would make alfred's OWN Cejel score depend
// on a test fixture rather than the product's real posture (self-pollution — alfred is one
// of the "real repos" this same goal calibrates against); (2) it avoids ever giving a
// generic secret scanner (gitleaks/trufflehog/GitHub push protection) a real-looking value
// to alarm on in permanent history. Building at test time reproduces the exact same
// deterministic engine behavior without either downside.

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'cejel-calibration@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Cejel Calibration Fixture'], { cwd: dir });
}

function writeAndTrack(dir: string, relativePath: string, contents: string): void {
  const fullPath = join(dir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${contents}\n`, 'utf8');
  execFileSync('git', ['add', relativePath], { cwd: dir });
}

function commit(dir: string, message: string): void {
  execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'ignore' });
}

// A synthetic but realistic-SHAPED high-entropy value (matches the sk-ant-api03-<80+ chars>
// pattern the secret-scan detector below looks for) — not a live credential. Assembled from
// segments so it never appears as one contiguous literal secret-shaped string in this source
// file itself.
const PLANTED_REAL_SECRET = [
  'sk-ant-api03',
  'Q7wErTyUiOp1AsDfGhJkL2zXcVbNm3QwErTyUiOp4AsDfGhJkL5zXcVbNm6QwErTyUiOp7AsDfGhJkL8',
].join('-');

// Planted-bad anchor: a REAL committed high-entropy secret in a tracked .env, no RLS,
// no tests — A2 MUST fire critical here (true-positive anchor).
export function buildPlantedBadRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-calibration-planted-bad-'));
  initGitRepo(dir);
  writeAndTrack(
    dir,
    'package.json',
    JSON.stringify({ name: 'planted-bad-fixture', version: '0.0.0' }, null, 2),
  );
  writeAndTrack(dir, '.env', `ANTHROPIC_API_KEY=${PLANTED_REAL_SECRET}`);
  writeAndTrack(dir, 'index.js', 'module.exports = () => {};');
  commit(dir, 'planted-bad: real committed secret, no RLS, no tests');
  return dir;
}

// Planted-clean anchor: .env.example with placeholder values, .gitignore excluding .env,
// tests present — A2 MUST NOT fire critical here (true-negative anchor).
export function buildPlantedCleanRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-calibration-planted-clean-'));
  initGitRepo(dir);
  writeAndTrack(
    dir,
    'package.json',
    JSON.stringify(
      { name: 'planted-clean-fixture', version: '0.0.0', scripts: { test: 'vitest run' } },
      null,
      2,
    ),
  );
  writeAndTrack(
    dir,
    '.env.example',
    [
      'ANTHROPIC_API_KEY=YOUR_API_KEY_HERE',
      // Long ALL-CAPS snake_case placeholder with no "your"/"example"/etc marker word —
      // clears the 40-char generic secret-shape threshold, so this specifically exercises
      // ALL_CAPS_SNAKE_PLACEHOLDER_PATTERN rather than the pre-existing keyword checks.
      'STRIPE_SECRET_KEY=INSERT_SECRET_VALUE_BEFORE_RUNNING_THIS_APPLICATION',
    ].join('\n'),
  );
  writeAndTrack(dir, '.gitignore', '.env\nnode_modules/\n');
  writeAndTrack(dir, 'index.js', 'module.exports = () => {};');
  writeAndTrack(
    dir,
    'index.test.js',
    "const { test, expect } = require('vitest');\ntest('works', () => { expect(true).toBe(true); });",
  );
  commit(dir, 'planted-clean: env template + gitignore + tests, no real secret ever committed');
  return dir;
}

// A synthetic "sk-" branded secret shape (not a live credential) reused across the v2
// fixtures below — long enough to clear SECRET_VALUE_BRANDED_PATTERN's 24-char minimum.
const PLANTED_BRANDED_SECRET = 'sk-abcdEFGH1234ijklMNOP5678qrstUVWX9012';

// FP anchor (goal_cejel_launch_hardening_combined_2026-07-06, Phase 2 fix #1): a checksum
// (SHA-256 hex digest) assigned to a token-named identifier must never fire A2 critical —
// only real, high-entropy secret VALUES should, not anything that merely sits next to a
// secret-shaped keyword.
export function buildChecksumFalsePositiveRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-a2v2-checksum-fp-'));
  initGitRepo(dir);
  writeAndTrack(
    dir,
    'package.json',
    JSON.stringify({ name: 'checksum-fp-fixture', version: '0.0.0' }, null, 2),
  );
  writeAndTrack(dir, '.gitignore', '.env\nnode_modules/\n');
  const bundleDigest = createHash('sha256').update('cejel-a2-v2-checksum-fixture').digest('hex');
  writeAndTrack(
    dir,
    'src/bundle.js',
    [
      '// SHA-256 digest of the built bundle, used for a subresource-integrity check.',
      `export const bundleToken = '${bundleDigest}';`,
    ].join('\n'),
  );
  commit(dir, 'checksum-fp: sha256 digest assigned to a token-named identifier');
  return dir;
}

// FN anchor (Phase 2 fix #2): a hardcoded secret in a deployable-looking service with NO
// .env/.env.example/.gitignore-.env-rule/data-layer surface anywhere must still fire A2
// critical — the archetype N/A gate must never make a real committed secret invisible.
export function buildHardcodedSecretNoEnvSurfaceRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-a2v2-hardcoded-secret-'));
  initGitRepo(dir);
  writeAndTrack(
    dir,
    'package.json',
    JSON.stringify({ name: 'hardcoded-secret-fixture', version: '0.0.0' }, null, 2),
  );
  writeAndTrack(
    dir,
    'src/payments.js',
    [
      `const stripe_secret_key = '${PLANTED_BRANDED_SECRET}';`,
      'module.exports = { stripe_secret_key };',
    ].join('\n'),
  );
  commit(dir, 'hardcoded-secret: sk- style key with no .env surface anywhere in the repo');
  return dir;
}

// FN anchor (Phase 2 fix #3): the secret keyword can appear anywhere inside a longer
// identifier (not just immediately before `=`/`:`) — `stripe_secret_key`, `myApiKey`, and
// `access_token_value` must all be caught. This fixture carries an explicit .gitignore
// .env rule so it isolates the NAMING fix from the archetype-gate fix above.
export function buildVariableNamingSecretRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-a2v2-naming-'));
  initGitRepo(dir);
  writeAndTrack(
    dir,
    'package.json',
    JSON.stringify({ name: 'naming-fixture', version: '0.0.0' }, null, 2),
  );
  writeAndTrack(dir, '.gitignore', '.env\nnode_modules/\n');
  writeAndTrack(
    dir,
    'src/auth.js',
    [
      `const myApiKey = '${PLANTED_BRANDED_SECRET}';`,
      `const access_token_value = '${PLANTED_BRANDED_SECRET.replace(/2$/, '3')}';`,
    ].join('\n'),
  );
  commit(dir, 'naming: secret keyword embedded inside a longer identifier');
  return dir;
}
