#!/usr/bin/env node
/** Build the free public Cejel Node SEA executable for the current host platform. */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MONOREPO_PACKAGE_ROOT = join(REPO_ROOT, 'packages/witan-cli');
const PACKAGE_ROOT = existsSync(join(MONOREPO_PACKAGE_ROOT, 'package.json'))
  ? MONOREPO_PACKAGE_ROOT
  : REPO_ROOT;

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`sea-build-cejel: ${flag} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    bundle: undefined,
    outDir: undefined,
    baseNode: undefined,
    requirePublicTree: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--bundle') options.bundle = valueAfter(argv, index++, arg);
    else if (arg === '--out-dir') options.outDir = valueAfter(argv, index++, arg);
    else if (arg === '--base-node') options.baseNode = valueAfter(argv, index++, arg);
    else if (arg === '--require-public-tree') options.requirePublicTree = true;
    else throw new Error(`sea-build-cejel: unknown argument ${arg}`);
  }
  return options;
}

function log(message) {
  process.stderr.write(`[sea-build-cejel] ${message}\n`);
}

function currentAssetName() {
  const os = execFileSync('uname', ['-s'], { encoding: 'utf8' }).trim();
  const arch = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim();
  const assetName = `cejel-${os}-${arch}`;
  if (!/^cejel-(Darwin|Linux)-(arm64|x86_64|aarch64)$/.test(assetName)) {
    throw new Error(
      `sea-build-cejel: unsupported release platform ${assetName}; refusing to emit an asset outside the documented curl contract.`,
    );
  }
  return assetName;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.requirePublicTree && PACKAGE_ROOT !== REPO_ROOT) {
    throw new Error(
      'sea-build-cejel: release builds must run from the extracted public source tree, not ' +
        'directly from the private monorepo.',
    );
  }

  const bundlePath = resolve(options.bundle ?? join(PACKAGE_ROOT, 'dist/sea/cejel.js'));
  const outDir = resolve(options.outDir ?? join(PACKAGE_ROOT, '.build/cejel-sea'));
  const baseNode = resolve(options.baseNode ?? process.execPath);
  const assetName = currentAssetName();
  const binaryPath = join(outDir, assetName);
  const blobPath = join(outDir, `${assetName}.sea-prep.blob`);
  const configPath = join(outDir, `${assetName}.sea-prep.json`);

  if (!existsSync(bundlePath)) {
    throw new Error(
      `sea-build-cejel: ${bundlePath} not found. Run the package's build:sea-js script first.`,
    );
  }
  if (!existsSync(baseNode)) {
    throw new Error(`sea-build-cejel: base Node executable ${baseNode} does not exist.`);
  }
  if (!readFileSync(baseNode).includes(SENTINEL_FUSE)) {
    throw new Error(`sea-build-cejel: ${baseNode} does not contain the Node SEA sentinel fuse.`);
  }

  const postjectBin = join(PACKAGE_ROOT, 'node_modules/.bin/postject');
  if (!existsSync(postjectBin)) {
    throw new Error(
      `sea-build-cejel: ${postjectBin} not found. Install the public package dependencies first.`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  for (const path of [binaryPath, blobPath, configPath]) {
    rmSync(path, { force: true });
  }

  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        main: bundlePath,
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useCodeCache: true,
      },
      null,
      2,
    )}\n`,
  );

  log(`generating SEA blob with ${baseNode}`);
  execFileSync(baseNode, ['--experimental-sea-config', configPath], { stdio: 'inherit' });
  copyFileSync(baseNode, binaryPath);
  chmodSync(binaryPath, 0o755);

  if (process.platform === 'darwin') {
    try {
      execFileSync('codesign', ['--remove-signature', binaryPath], { stdio: 'inherit' });
    } catch {
      log('base executable had no removable signature; continuing to injection');
    }
  }

  log(`injecting SEA blob into ${assetName}`);
  execFileSync(
    postjectBin,
    [
      binaryPath,
      'NODE_SEA_BLOB',
      blobPath,
      '--sentinel-fuse',
      SENTINEL_FUSE,
      ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : []),
    ],
    { stdio: 'inherit' },
  );

  if (process.platform === 'darwin') {
    // A failed re-sign produces an executable macOS refuses to launch, so this is fatal.
    execFileSync('codesign', ['--sign', '-', binaryPath], { stdio: 'inherit' });
  }

  rmSync(blobPath, { force: true });
  rmSync(configPath, { force: true });
  log(`done: ${binaryPath}`);
  process.stdout.write(`${binaryPath}\n`);
}

main();
