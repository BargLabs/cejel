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
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// Every verification runs with the repository's allowed-signers pinned on the command line.
// Reading %G? without it asks git to verify against whatever gpg.ssh.allowedSignersFile the
// ambient environment happens to set: a developer's personal file locally, and nothing at all on
// a CI runner, where every commit would come back E and the guard would refuse correctly signed
// records forever. The file named in docs/security is the authority, so it is the file consulted.
export const gitVerifyArgs = (allowedSignersPath) => [
  '-c',
  `gpg.ssh.allowedSignersFile=${allowedSignersPath}`,
];
const git = (args) =>
  execFileSync('git', [...gitVerifyArgs(ALLOWED_SIGNERS_PATH), ...args], {
    encoding: 'utf8',
  }).trim();

export function main(argv = process.argv) {
  const range = argv[2];
  if (!range) {
    process.stderr.write(
      'usage: node scripts/check-calibration-signatures.mjs <base>...<head>\n' +
        'Refusing with a non-zero status rather than succeeding on no input: a guard whose\n' +
        'documented invocation exits 0 in silence is the defect this guard exists to close.\n',
    );
    process.exitCode = 2;
    return;
  }

  if (!existsSync(ALLOWED_SIGNERS_PATH)) {
    process.stderr.write(
      'calibration_signature_guard_no_allowed_signers: docs/security/allowed-signers does not exist.\n' +
        'Fails closed on purpose: with no file, "nobody may sign" would otherwise read as "anybody may".\n',
    );
    process.exitCode = 1;
    return;
  }
  const signers = parseAllowedSigners(readFileSync(ALLOWED_SIGNERS_PATH, 'utf8'));
  if (signers.length === 0) {
    process.stderr.write(
      'calibration_signature_guard_empty_allowed_signers: docs/security/allowed-signers names no key.\n' +
        'An operator must add their SSH signing key before a calibration record can be verified here.\n',
    );
    process.exitCode = 1;
    return;
  }

  const shas = git(['rev-list', range]).split('\n').filter(Boolean);
  const commits = [];
  for (const sha of shas) {
    const files = git(['show', '--name-only', '--format=', sha]).split('\n').filter(Boolean);
    if (!files.some(isGuardedPath)) continue;
    const [status, subject] = git(['show', '-s', '--format=%G?%n%s', sha]).split('\n');
    commits.push({ sha: sha.slice(0, 8), status, subject, files: files.filter(isGuardedPath) });
  }

  const result = summarize(commits);
  // The expected non-zero value stated before the verdict: "examined 0 commits, ok" and
  // "examined 9 commits, ok" must never print identically.
  process.stdout.write(
    `calibration_signature_guard examinedCommitCount=${result.examinedCommitCount} verified=${result.verifiedCount} signers=${signers.length}\n`,
  );
  if (result.ok) return;
  for (const commit of result.unverified) {
    process.stderr.write(
      `calibration_signature_unverified: ${commit.sha} %G?=${commit.status} "${commit.subject}" touches ${commit.files.join(', ')}\n`,
    );
  }
  process.stderr.write(
    '\nEvery commit touching docs/calibration/ must carry a signature from a key in\n' +
      'docs/security/allowed-signers. %G?=N is unsigned; E is signed by a key this repository\n' +
      'does not list. A squash merge substitutes GitHub\'s web-flow key and produces E — merge\n' +
      'calibration PRs with --merge, never --squash.\n',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
