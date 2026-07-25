#!/usr/bin/env node

/**
 * Creates an exact private source checkout for detector-independent discovery.
 * It deliberately has no dependency on the Cejel detector and never runs a scan.
 */

import { execFile as execFileCallback } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';

const execFile = promisify(execFileCallback);

function assertManifest(manifest, expectedCohort) {
  if (
    manifest?.schema_version !== '1.0.0' ||
    manifest.protocol_id !== 'cejel-llm-calibration-v1' ||
    manifest.status !== 'frozen' ||
    manifest.cohort !== expectedCohort ||
    !Array.isArray(manifest.repositories) ||
    manifest.repositories.length < 1 ||
    hashManifest(manifest) !== manifest.manifest_sha256
  ) throw new Error('manifest is not a valid frozen cohort');
  for (const repository of manifest.repositories) {
    if (
      !/^[a-f0-9]{40}$/.test(repository?.commit_sha || '') ||
      !/^[a-f0-9]{40}$/.test(repository?.git_tree_sha || '') ||
      hashRepositoryEntry(repository) !== repository.entry_sha256
    ) throw new Error(`${repository?.repository_id || 'repository'} is not an immutable manifest entry`);
  }
}

function repositoryDirectory(repositoryId) {
  return repositoryId.replace('/', '__');
}

async function runGit(args, options = {}) {
  const { stdout } = await execFile('git', args, {
    encoding: 'utf8',
    timeout: 30 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' },
    ...options,
  });
  return stdout.trim();
}

export async function checkoutFrozenCohort({ manifest, workRoot }) {
  assertManifest(manifest, manifest.cohort);
  const root = resolve(workRoot);
  if (existsSync(root)) throw new Error('checkout work root already exists');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const matrix = [];
  try {
    for (const repository of manifest.repositories) {
      const sourceRoot = join(root, repositoryDirectory(repository.repository_id));
      await runGit(['clone', '--no-checkout', repository.url, sourceRoot]);
      await runGit(['-C', sourceRoot, '-c', 'advice.detachedHead=false', 'checkout', '--detach', repository.commit_sha]);
      const [commit, tree] = await Promise.all([
        runGit(['-C', sourceRoot, 'rev-parse', 'HEAD']),
        runGit(['-C', sourceRoot, 'rev-parse', 'HEAD^{tree}']),
      ]);
      if (commit !== repository.commit_sha || tree !== repository.git_tree_sha) {
        throw new Error(`${repository.repository_id}: checkout does not match frozen commit/tree`);
      }
      matrix.push({
        cohort: manifest.cohort,
        repository_id: repository.repository_id,
        commit_sha: repository.commit_sha,
        source_root: sourceRoot,
      });
    }
  } catch (error) {
    throw new Error(`frozen checkout failed before discovery: ${error.message}`);
  }
  return { repositories: matrix };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '').replaceAll('-', '_');
    const value = argv[index + 1];
    if (!key || !value) throw new Error('every checkout option requires a value');
    options[key] = value;
  }
  return options;
}

export async function main(argv) {
  const options = parseArgs(argv);
  for (const key of ['manifest', 'work_root', 'output']) {
    if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  }
  const output = resolve(options.output);
  if (existsSync(output)) throw new Error('checkout matrix output already exists');
  const manifest = JSON.parse(readFileSync(resolve(options.manifest), 'utf8'));
  const matrix = await checkoutFrozenCohort({ manifest, workRoot: options.work_root });
  const descriptor = openSync(output, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
  process.stdout.write(`${JSON.stringify({ status: 'checked_out_for_detector_independent_discovery', cohort: manifest.cohort, repositories: matrix.repositories.length })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
