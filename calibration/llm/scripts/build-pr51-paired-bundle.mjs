#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function isWithin(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const repositoryRoot = realpathSync(resolve(dirname(scriptPath), '../../..'));
const outputFlag = process.argv.indexOf('--output-dir');
if (outputFlag === -1 || !process.argv[outputFlag + 1] || process.argv.length !== 4) {
  fail('usage: build-pr51-paired-bundle.mjs --output-dir <new-directory-outside-repository>');
}

const outputDirectory = resolve(process.argv[outputFlag + 1]);
if (existsSync(outputDirectory)) fail('bundle output directory already exists');
if (isWithin(repositoryRoot, outputDirectory)) fail('bundle output directory must be outside the repository');
if (git(repositoryRoot, ['status', '--porcelain', '--untracked-files=all']) !== '') {
  fail('detector checkout must be completely clean before building an arm bundle');
}

const detectorCommit = git(repositoryRoot, ['rev-parse', 'HEAD^{commit}']);
const tsup = resolve(repositoryRoot, 'node_modules/.bin/tsup');
if (!existsSync(tsup)) fail('local tsup executable is unavailable; install the locked dependencies first');

execFileSync(tsup, [
  'calibration/llm/scripts/pr51-paired-measurement.ts',
  '--format', 'esm',
  '--platform', 'node',
  '--target', 'node18',
  '--out-dir', outputDirectory,
  '--no-config',
  '--define.__CEJEL_PR51_ARM_COMMIT__', JSON.stringify(detectorCommit),
], { cwd: repositoryRoot, stdio: 'inherit' });

const bundlePath = resolve(outputDirectory, 'pr51-paired-measurement.js');
if (!existsSync(bundlePath)) fail('tsup did not produce the expected runner bundle');
process.stdout.write(`${JSON.stringify({
  detector_commit: detectorCommit,
  bundle_path: bundlePath,
  bundle_sha256: sha256(readFileSync(bundlePath)),
})}\n`);
