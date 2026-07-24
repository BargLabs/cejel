#!/usr/bin/env node
/** Execute and compare a built Cejel binary before it can become a release asset. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MONOREPO_PACKAGE_ROOT = join(REPO_ROOT, 'packages/witan-cli');
const PACKAGE_ROOT = existsSync(join(MONOREPO_PACKAGE_ROOT, 'package.json'))
  ? MONOREPO_PACKAGE_ROOT
  : REPO_ROOT;
const BANNED_STRINGS = [
  'WITAN_CUSTOMER_ID',
  'WITAN_LICENSE_PUBLIC_KEY',
  'WITAN_BUILD_ID',
  'WITAN_ONPREM',
  'watermarkFooter',
];

function log(message) {
  process.stderr.write(`[verify-cejel-binary] ${message}\n`);
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`verify-cejel-binary: ${flag} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = { binary: undefined, sourceDist: undefined, receipt: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source-dist') options.sourceDist = valueAfter(argv, index++, arg);
    else if (arg === '--receipt') options.receipt = valueAfter(argv, index++, arg);
    else if (!options.binary) options.binary = arg;
    else throw new Error(`verify-cejel-binary: unexpected argument ${arg}`);
  }
  return options;
}

function makeFixtureRepo(label) {
  const repoPath = mkdtempSync(join(tmpdir(), `cejel-sea-${label}-`));
  const write = (relativePath, contents) => {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  };
  write(
    'package.json',
    `${JSON.stringify({ name: 'cejel-sea-fixture', version: '0.0.0', private: true }, null, 2)}\n`,
  );
  write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  write('src/engine.ts', 'export const add = (a: number, b: number): number => a + b;\n');
  write(
    'src/engine.test.ts',
    "import { expect, test } from 'vitest';\nimport { add } from './engine.js';\ntest('adds', () => expect(add(1, 2)).toBe(3));\n",
  );
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

function readArtifacts(outDir) {
  const reportPath = join(outDir, 'report.json');
  const summaryPath = join(outDir, 'summary.json');
  if (!existsSync(reportPath)) {
    throw new Error(`${reportPath} was not written (pass-by-absence).`);
  }
  if (!existsSync(summaryPath)) {
    throw new Error(`${summaryPath} was not written.`);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  if (typeof report.overallScore !== 'number' || Number.isNaN(report.overallScore)) {
    throw new Error(`${reportPath} has no numeric overallScore.`);
  }
  if (!Array.isArray(report.criteria) || report.criteria.length === 0) {
    throw new Error(`${reportPath} has no measured criteria.`);
  }
  if (typeof summary.verdict !== 'string' || summary.verdict.length === 0) {
    throw new Error(`${summaryPath} has no verdict.`);
  }
  return { report, summary };
}

function currentAssetName() {
  const os = execFileSync('uname', ['-s'], { encoding: 'utf8' }).trim();
  const arch = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim();
  return `cejel-${os}-${arch}`;
}

function findingCount(report) {
  return report.criteria.reduce((total, criterion) => total + (criterion.findings?.length ?? 0), 0);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function verifyBinary(binaryPath, sourceDistPath) {
  const expectedName = currentAssetName();
  if (basename(binaryPath) !== expectedName) {
    throw new Error(
      `Guard 4: ${basename(binaryPath)} does not equal the documented host asset ${expectedName}.`,
    );
  }

  const binaryContents = readFileSync(binaryPath);
  const banned = BANNED_STRINGS.filter((needle) => binaryContents.includes(needle));
  if (banned.length > 0) {
    throw new Error(`Guard 3: public binary contains commercial identifiers: ${banned.join(', ')}`);
  }

  const executeRepo = makeFixtureRepo('execute');
  try {
    const outDir = join(executeRepo, '.cejel');
    execFileSync(binaryPath, [executeRepo, '--out', outDir, '--quiet'], { stdio: 'inherit' });
    const { report } = readArtifacts(outDir);
    log(`Guard 1 passed: binary wrote ${report.criteria.length} measured criteria.`);
  } finally {
    rmSync(executeRepo, { recursive: true, force: true });
  }

  if (!existsSync(sourceDistPath)) {
    throw new Error(`Guard 5: source distribution ${sourceDistPath} does not exist.`);
  }
  const parityRepo = makeFixtureRepo('parity');
  try {
    const binaryOut = join(parityRepo, '.cejel-binary');
    const sourceOut = join(parityRepo, '.cejel-source');
    execFileSync(binaryPath, [parityRepo, '--out', binaryOut, '--quiet']);
    execFileSync(process.execPath, [sourceDistPath, parityRepo, '--out', sourceOut, '--quiet']);
    const binary = readArtifacts(binaryOut);
    const source = readArtifacts(sourceOut);
    const mismatches = [];
    if (binary.report.overallScore !== source.report.overallScore) {
      mismatches.push('overallScore');
    }
    if (binary.report.archetype !== source.report.archetype) mismatches.push('archetype');
    if (binary.report.criteria.length !== source.report.criteria.length) {
      mismatches.push('criteria count');
    }
    if (findingCount(binary.report) !== findingCount(source.report)) {
      mismatches.push('finding count');
    }
    if (binary.summary.verdict !== source.summary.verdict) mismatches.push('verdict');
    if (mismatches.length > 0) {
      throw new Error(`Guard 5: binary/source mismatch in ${mismatches.join(', ')}.`);
    }
    log(`Guard 5 passed: binary and source agree (${binary.summary.verdict}).`);
  } finally {
    rmSync(parityRepo, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.binary) {
    throw new Error(
      'usage: verify-cejel-binary.mjs <binary> [--source-dist <path>] [--receipt <path>]',
    );
  }
  const binaryPath = resolve(options.binary);
  const sourceDistPath = resolve(options.sourceDist ?? join(PACKAGE_ROOT, 'dist/index.js'));
  const receiptPath = resolve(options.receipt ?? `${binaryPath}.verified.json`);
  if (!existsSync(binaryPath)) throw new Error(`${binaryPath} does not exist.`);

  verifyBinary(binaryPath, sourceDistPath);
  writeFileSync(
    receiptPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        asset: basename(binaryPath),
        platform: process.platform,
        architecture: process.arch,
        binarySha256: sha256(binaryPath),
        guardsPassed: [1, 3, 4, 5],
        executedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  log(`Guards 1, 3, 4, and 5 passed; wrote ${receiptPath}.`);
}

main();
