// CLI half, split from the library half so the library can be imported by the test without
// running git. Usage: node scripts/check-calibration-signatures.mjs <base>...<head>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  ALLOWED_SIGNERS_PATH,
  isGuardedPath,
  parseAllowedSigners,
  summarize,
} from './check-calibration-signatures.mjs';

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function main() {
  const range = process.argv[2];
  if (!range) {
    process.stderr.write('usage: check-calibration-signatures.mjs <base>...<head>\n');
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

main();
