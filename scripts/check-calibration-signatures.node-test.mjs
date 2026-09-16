import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
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

test('a comments-only allowed-signers file names no signer, so the guard cannot pass on it', () => {
  const contents = ['# no keys yet', '', '   ', '# another comment'].join('\n');
  assert.deepEqual(parseAllowedSigners(contents), []);
});

test('a malformed signer line is not counted as a key', () => {
  // Two fields is a principal and a keytype with no key material. Counting it would let a typo
  // satisfy the "at least one signer" precondition.
  assert.deepEqual(parseAllowedSigners('operator@example.com ssh-ed25519'), []);
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
  // The first cut read %G? from plain `git log`, so verification used whatever
  // gpg.ssh.allowedSignersFile the environment set: a developer's personal file locally, and
  // nothing on a CI runner, where every commit returns E and the guard refuses correctly signed
  // records forever. Measured on the commit that admitted the operator key: U under ambient
  // config, G under the repository's file. Same commit, two verdicts, and the guard was reading
  // the wrong one.
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
