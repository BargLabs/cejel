#!/usr/bin/env node
/** Prove a verified Cejel binary produces a complete certificate with networking denied. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const LINUX_OFFLINE_IMAGE = process.env.CEJEL_OFFLINE_IMAGE ?? 'cejel-sea-offline-verifier:ci';

function log(message) {
  process.stderr.write(`[verify-cejel-binary-offline] ${message}\n`);
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`verify-cejel-binary-offline: ${flag} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = { binary: undefined, receipt: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--receipt') options.receipt = valueAfter(argv, index++, arg);
    else if (!options.binary) options.binary = arg;
    else throw new Error(`verify-cejel-binary-offline: unexpected argument ${arg}`);
  }
  return options;
}

function makeFixtureRepo() {
  const repoPath = mkdtempSync(join(tmpdir(), 'cejel-sea-offline-'));
  const write = (relativePath, contents) => {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  };
  write(
    'package.json',
    `${JSON.stringify({ name: 'cejel-offline-fixture', version: '0.0.0', private: true }, null, 2)}\n`,
  );
  write('src/engine.ts', 'export const value = 42;\n');
  write('src/engine.test.ts', "import { test } from 'vitest';\ntest('exists', () => {});\n");
  execFileSync('git', ['init', '-q', repoPath]);
  execFileSync('git', ['-C', repoPath, 'add', '-A']);
  execFileSync('git', [
    '-C',
    repoPath,
    '-c',
    'user.email=cejel-verify@example.com',
    '-c',
    'user.name=cejel-verify',
    'commit',
    '-q',
    '-m',
    'fixture',
  ]);
  return repoPath;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertCompleteCertificate(repoPath) {
  const outDir = join(repoPath, '.cejel');
  const reportPath = join(outDir, 'report.json');
  const certificatePath = join(outDir, 'certificate.html');
  const attestationPath = join(outDir, 'attestation.json');
  for (const path of [reportPath, certificatePath, attestationPath]) {
    if (!existsSync(path)) throw new Error(`Guard 2: offline run did not write ${path}.`);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (typeof report.overallScore !== 'number' || !Array.isArray(report.criteria)) {
    throw new Error('Guard 2: offline report is not a complete scoreable certificate.');
  }
  return report;
}

function runOffline(binaryPath, repoPath) {
  if (process.platform === 'linux') {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '-v',
        `${repoPath}:/work`,
        '-w',
        '/work',
        '-v',
        `${binaryPath}:/cejel:ro`,
        '--tmpfs',
        '/tmp:rw,nosuid,nodev,size=64m',
        '--env',
        'HOME=/tmp',
        LINUX_OFFLINE_IMAGE,
        'sh',
        '-eu',
        '-c',
        'git --version >/dev/null; git config --global --add safe.directory /work; exec /cejel "$@"',
        'cejel-offline',
        '.',
        '--out',
        '/work/.cejel',
        '--quiet',
      ],
      { stdio: 'inherit' },
    );
    return `docker --network none (${LINUX_OFFLINE_IMAGE})`;
  }
  if (process.platform === 'darwin') {
    execFileSync(
      'sandbox-exec',
      [
        '-p',
        '(version 1)(allow default)(deny network*)',
        binaryPath,
        repoPath,
        '--out',
        join(repoPath, '.cejel'),
        '--quiet',
      ],
      { stdio: 'inherit' },
    );
    return 'sandbox-exec deny network';
  }
  throw new Error(`Guard 2: unsupported release platform ${process.platform}.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.binary) {
    throw new Error('usage: verify-cejel-binary-offline.mjs <binary> [--receipt <path>]');
  }
  const binaryPath = resolve(options.binary);
  const receiptPath = resolve(options.receipt ?? `${binaryPath}.verified.json`);
  if (!existsSync(binaryPath)) throw new Error(`${binaryPath} does not exist.`);
  if (!existsSync(receiptPath)) {
    throw new Error(`Guard 2 requires the Guards 1/3/4/5 receipt ${receiptPath}.`);
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.asset !== basename(binaryPath) || receipt.binarySha256 !== sha256(binaryPath)) {
    throw new Error('Guard 2 receipt does not bind to this binary.');
  }
  for (const guard of [1, 3, 4, 5]) {
    if (!receipt.guardsPassed?.includes(guard)) {
      throw new Error(`Guard 2 receipt is missing prerequisite Guard ${guard}.`);
    }
  }

  const repoPath = makeFixtureRepo();
  try {
    const offlineMethod = runOffline(binaryPath, repoPath);
    const report = assertCompleteCertificate(repoPath);
    receipt.guardsPassed = [...new Set([...receipt.guardsPassed, 2])].sort();
    receipt.offlineMethod = offlineMethod;
    receipt.offlineVerifiedAt = new Date().toISOString();
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    log(`Guard 2 passed via ${offlineMethod}; overallScore=${report.overallScore}.`);
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
}

main();
