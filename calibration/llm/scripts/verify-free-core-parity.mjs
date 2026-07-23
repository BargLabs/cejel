#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function hashTree(root) {
  const entries = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error('free-core fixture cannot contain symbolic links');
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) entries.push({
        path: relative(root, path).replaceAll('\\', '/'), sha256: sha256(readFileSync(path)),
      });
    }
  };
  visit(root);
  return sha256(Buffer.from(canonicalize(entries), 'utf8'));
}

function run(executable, argv, gitCommit) {
  const result = spawnSync(executable, argv, {
    encoding: null, env: { ...process.env, CI: '1' }, maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    git_commit: gitCommit,
    executable_sha256: sha256(readFileSync(executable)),
    argv,
    stdout_base64: result.stdout.toString('base64'),
    stderr_base64: result.stderr.toString('base64'),
    exit_code: result.status,
  };
}

export function main(argv) {
  if (argv.length !== 6) {
    throw new Error(
      'usage: verify-free-core-parity.mjs <baseline-cejel> <baseline-commit> <candidate-cejel> <candidate-commit> <fixture-dir> <output.json>',
    );
  }
  const [baselinePath, baselineCommit, candidatePath, candidateCommit, fixturePath, outputPath] = argv;
  if (!/^[a-f0-9]{40}$/.test(baselineCommit) || !/^[a-f0-9]{40}$/.test(candidateCommit)) {
    throw new Error('baseline and candidate commits must be full Git SHAs');
  }
  const fixture = resolve(fixturePath);
  const scanArgv = ['scan', fixture, '--format', 'json', '--quiet'];
  const document = {
    fixture: {
      path: 'test/fixtures/free-core-parity',
      tree_sha256: hashTree(fixture),
    },
    baseline: run(resolve(baselinePath), scanArgv, baselineCommit),
    candidate: run(resolve(candidatePath), scanArgv, candidateCommit),
  };
  if (
    document.baseline.exit_code !== 0 || document.candidate.exit_code !== 0 ||
    document.baseline.stdout_base64 !== document.candidate.stdout_base64 ||
    document.baseline.stderr_base64 !== document.candidate.stderr_base64
  ) throw new Error('default free-core output differs between baseline and candidate');
  let descriptor;
  try {
    descriptor = openSync(resolve(outputPath), 'wx', 0o644);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
