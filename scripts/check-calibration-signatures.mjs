#!/usr/bin/env node
// A calibration record that cannot be verified is a record, not an attestation.
//
// cejel treats docs/calibration/** as an authority path — B10 and the disclosure boundary both
// rest on it — while nothing in this repository has ever been able to establish that authority.
// Measured 2026-09-16 across every commit that has ever touched docs/calibration/: five reported
// %G? = N (unsigned) and three reported E (signed, signer unverifiable). None reported G. The
// repository ships no allowed-signers file and no check reads a signature, so the
// --merge-not--squash discipline preserves something no reader can confirm.
//
// This check closes that, forward only. It verifies that every commit in a range which touches a
// guarded path carries a signature from a key in docs/security/allowed-signers. It fails closed:
// a missing or empty allowed-signers file is a failure, not a skip, because "nobody is allowed to
// sign" must never read the same as "everybody is".
//
// It does NOT retroactively bless history. The commits listed in docs/security/README.md predate
// the gate and stay permanently unverifiable; that is disclosed there rather than papered over.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const ALLOWED_SIGNERS_PATH = join(REPO_ROOT, 'docs/security/allowed-signers');
export const GUARDED_PATH_PREFIXES = ['docs/calibration/'];

export function isGuardedPath(file) {
  return GUARDED_PATH_PREFIXES.some((prefix) => file.startsWith(prefix));
}

// A signer line is `<principal> <keytype> <base64>`; comments and blanks carry no authority.
export function parseAllowedSigners(contents) {
  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .filter((line) => line.split(/\s+/).length >= 3);
}

export function summarize(commits) {
  const unverified = commits.filter((commit) => commit.status !== 'G');
  return {
    examinedCommitCount: commits.length,
    verifiedCount: commits.length - unverified.length,
    unverified,
    ok: unverified.length === 0,
  };
}
