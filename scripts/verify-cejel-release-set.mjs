#!/usr/bin/env node
/** Guard 6: refuse a release unless every contracted asset has an own-platform receipt. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const EXPECTED_ASSETS = {
  'cejel-Darwin-arm64': { platform: 'darwin', architecture: 'arm64' },
  'cejel-Darwin-x86_64': { platform: 'darwin', architecture: 'x64' },
  'cejel-Linux-aarch64': { platform: 'linux', architecture: 'arm64' },
  'cejel-Linux-x86_64': { platform: 'linux', architecture: 'x64' },
};

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`verify-cejel-release-set: ${flag} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = { assetDir: undefined, releaseTag: undefined, packageJson: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--release-tag') options.releaseTag = valueAfter(argv, index++, arg);
    else if (arg === '--package-json') options.packageJson = valueAfter(argv, index++, arg);
    else if (!options.assetDir) options.assetDir = arg;
    else throw new Error(`verify-cejel-release-set: unexpected argument ${arg}`);
  }
  return options;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.assetDir || !options.releaseTag || !options.packageJson) {
    throw new Error(
      'usage: verify-cejel-release-set.mjs <asset-dir> --release-tag <vX.Y.Z> ' +
        '--package-json <path>',
    );
  }
  const assetDir = resolve(options.assetDir);
  const packageJsonPath = resolve(options.packageJson);
  const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (options.releaseTag !== `v${manifest.version}`) {
    throw new Error(
      `release tag ${options.releaseTag} does not match package version v${manifest.version}.`,
    );
  }

  for (const [asset, expected] of Object.entries(EXPECTED_ASSETS)) {
    const binaryPath = join(assetDir, asset);
    const receiptPath = `${binaryPath}.verified.json`;
    if (!existsSync(binaryPath)) throw new Error(`Guard 6: missing release asset ${asset}.`);
    if (!existsSync(receiptPath)) {
      throw new Error(`Guard 6: ${asset} has no own-platform verification receipt.`);
    }
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (receipt.asset !== basename(binaryPath)) {
      throw new Error(`Guard 6: receipt asset mismatch for ${asset}.`);
    }
    if (receipt.platform !== expected.platform || receipt.architecture !== expected.architecture) {
      throw new Error(
        `Guard 6: ${asset} was verified on ${receipt.platform}/${receipt.architecture}, ` +
          `expected ${expected.platform}/${expected.architecture}.`,
      );
    }
    if (receipt.binarySha256 !== sha256(binaryPath)) {
      throw new Error(`Guard 6: ${asset} changed after verification.`);
    }
    for (const guard of [1, 2, 3, 4, 5, 7]) {
      if (!receipt.guardsPassed?.includes(guard)) {
        throw new Error(`Guard 6: ${asset} is missing Guard ${guard}.`);
      }
    }
  }

  process.stdout.write(
    `Guard 6 passed: ${Object.keys(EXPECTED_ASSETS).length} assets match v${manifest.version} and carry own-platform receipts for Guards 1-5 and 7.\n`,
  );
}

main();
