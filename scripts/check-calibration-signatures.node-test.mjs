import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALLOWED_SIGNERS_PATH,
  GUARDED_PATH_PREFIXES,
  gitVerifyArgs,
  isGuardedPath,
  parseAllowedSigners,
  summarize,
} from './check-calibration-signatures.mjs';

test('docs/calibration is guarded and neighbouring doc paths are not', () => {
  assert.equal(isGuardedPath('docs/calibration/free-core-v50/holdout-reveal-2026-08-18.md'), true);
  assert.equal(isGuardedPath('docs/experiments/v17-behaviour-delta/result.md'), false);
  assert.equal(isGuardedPath('docs/adr/0022-certificate-legibility.md'), false);
  assert.deepEqual(GUARDED_PATH_PREFIXES, ['docs/calibration/']);
});

test('root FREEZE.md is guarded without prefix-matching neighbouring files', () => {
  assert.equal(isGuardedPath('FREEZE.md'), true);
  assert.equal(isGuardedPath('FREEZE.md.backup'), false);
  assert.equal(isGuardedPath('docs/FREEZE.md'), false);
});

test('a comments-only allowed-signers file names no signer, so the guard cannot pass on it', () => {
  const contents = ['# no keys yet', '', '   ', '# another comment'].join('\n');
  assert.deepEqual(parseAllowedSigners(contents), []);
});

test('a malformed signer line is not counted as a key', () => {
  // Two fields is a principal and a keytype with no key material. Counting it would let a typo
  // satisfy the "at least one signer" precondition.
  assert.deepEqual(parseAllowedSigners('operator@example.com ssh-ed25519'), []);
  assert.deepEqual(parseAllowedSigners('this names no key'), []);
  assert.equal(parseAllowedSigners('operator@example.com ssh-ed25519 AAAAC3Nz').length, 1);
});

test('E is not a pass: a signature from an unlisted key fails exactly like an unsigned commit', () => {
  // This is the case the repository has actually been in. Every commit that has touched
  // docs/calibration/ reported N or E and none reported G, so a guard that accepted E would
  // have passed the entire unverifiable history and reported success.
  const result = summarize([
    { sha: 'aaaaaaaa', status: 'G', subject: 'signed by a listed key', files: ['docs/calibration/a.md'] },
    { sha: 'bbbbbbbb', status: 'E', subject: 'squash-merged, web-flow key', files: ['docs/calibration/b.md'] },
    { sha: 'cccccccc', status: 'N', subject: 'unsigned direct commit', files: ['docs/calibration/c.md'] },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.examinedCommitCount, 3);
  assert.equal(result.verifiedCount, 1);
  assert.deepEqual(
    result.unverified.map((commit) => commit.sha),
    ['bbbbbbbb', 'cccccccc'],
  );
});

test('an empty range reports the count it examined, so a vacuous pass is legible', () => {
  const result = summarize([]);
  assert.equal(result.ok, true);
  assert.equal(result.examinedCommitCount, 0);
});

test('the documented invocation refuses instead of exiting 0 in silence', () => {
  // The first cut of this guard split the CLI into a second file, so the path named in the
  // README and in this file's own header was a pure library: running it printed nothing and
  // exited 0. A guard whose documented command always passes is the defect this guard exists
  // to close, reproduced inside it. Asserted on the real entry point, not on a copy.
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./check-calibration-signatures.mjs', import.meta.url))], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage: node scripts\/check-calibration-signatures\.mjs/);
  assert.equal(run.stdout, '');
});

test('verification is pinned to the repository allowed-signers, not to ambient config', () => {
  // Plain git log inherits a developer's personal allowlist, or no allowlist on
  // CI. Bind the repository file explicitly; a signed commit alone is not proof
  // that the signer belongs to this repository's enrolled SSH keys.
  assert.deepEqual(gitVerifyArgs('/repo/docs/security/allowed-signers'), [
    '-c',
    'gpg.ssh.allowedSignersFile=/repo/docs/security/allowed-signers',
  ]);
  assert.ok(ALLOWED_SIGNERS_PATH.endsWith('docs/security/allowed-signers'));
});

test('the pinned file is the one the guard reports its signer count from', () => {
  // Counting signers from one file while verifying against another is the same defect wearing a
  // different hat: the count would say "1 signer configured" while git consulted a file that
  // listed none.
  const source = readFileSync(
    fileURLToPath(new URL('./check-calibration-signatures.mjs', import.meta.url)),
    'utf8',
  );
  assert.match(source, /gitVerifyArgs\(ALLOWED_SIGNERS_PATH\)/);
  assert.match(source, /readFileSync\(ALLOWED_SIGNERS_PATH, 'utf8'\)/);
});

test('a trusted OpenPGP G signature cannot satisfy the SSH allowlist', t => {
  // Real disposable GPG key + trusted keyring: status G must be true so only the
  // SSH-envelope defence can reject. Removing `&& ssh` must make this test fail.
  // Keep the path short enough for macOS gpg-agent Unix socket limits.
  const root = mkdtempSync(join(tmpdir(), 'ce-'));
  const repo = join(root, 'repo');
  const keyring = join(root, 'gnupg');
  mkdirSync(repo); mkdirSync(keyring, { mode: 0o700 });
  const env = { ...process.env, GNUPGHOME: keyring, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const run = (command, args) => execFileSync(command, args, {
    cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  t.after(() => {
    spawnSync('gpgconf', ['--homedir', keyring, '--kill', 'gpg-agent'], { env });
    rmSync(root, { recursive: true, force: true });
  });
  run('gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', '',
    '--quick-generate-key', 'Envelope Fixture <envelope@example.invalid>', 'ed25519', 'sign', '0']);
  run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', join(root, 'ssh-key')]);
  run('git', ['init', '-q']);
  run('git', ['config', 'user.name', 'Envelope Fixture']);
  run('git', ['config', 'user.email', 'envelope@example.invalid']);
  run('git', ['config', 'gpg.format', 'openpgp']);
  run('git', ['config', 'user.signingkey', 'envelope@example.invalid']);
  mkdirSync(join(repo, 'docs/security'), { recursive: true });
  mkdirSync(join(repo, 'scripts'));
  const allowlist = join(repo, 'docs/security/allowed-signers');
  writeFileSync(allowlist, `fixture@example.invalid ${readFileSync(join(root, 'ssh-key.pub'), 'utf8')}`);
  // Exercise the real CLI with its repository-relative allowlist, not a second reader.
  copyFileSync(fileURLToPath(new URL('./check-calibration-signatures.mjs', import.meta.url)),
    join(repo, 'scripts/check-calibration-signatures.mjs'));
  run('git', ['add', '.']);
  run('git', ['commit', '--no-gpg-sign', '-qm', 'fixture baseline']);
  const base = run('git', ['rev-parse', 'HEAD']);
  writeFileSync(join(repo, 'FREEZE.md'), '{}\n');
  run('git', ['add', 'FREEZE.md']);
  run('git', ['commit', '-S', '-qm', 'GPG signed marker']);
  const sha = run('git', ['rev-parse', 'HEAD']);
  assert.equal(run('git', [...gitVerifyArgs(allowlist), 'show', '-s', '--format=%G?', sha]), 'G');
  assert.match(run('git', ['cat-file', 'commit', sha]), /^gpgsig -----BEGIN PGP SIGNATURE-----$/m);
  const result = spawnSync(process.execPath, ['scripts/check-calibration-signatures.mjs', `${base}..${sha}`], {
    cwd: repo, env, encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /examinedCommitCount=1 verified=0 signers=1/);
  assert.match(result.stderr, /calibration_signature_unverified: [0-9a-f]+ %G\?=G "GPG signed marker" touches FREEZE\.md/);
});
