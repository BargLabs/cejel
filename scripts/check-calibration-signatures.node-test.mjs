import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GUARDED_PATH_PREFIXES,
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
