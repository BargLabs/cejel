#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
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

function run(executable, argv, gitCommit, output, clock) {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const artifact of [
    'llm-report.json',
    'llm-attestation.json',
    'llm-certificate.html',
  ]) {
    writeFileSync(resolve(output, artifact), 'pre-existing opt-in artifact sentinel\n', 'utf8');
  }
  const result = spawnSync(executable, argv, {
    encoding: null,
    env: {
      ...process.env,
      CI: '1',
      CEJEL_PARITY_FIXED_TIME: clock.fixed_iso,
      NODE_OPTIONS: `--require=${clock.hook_path}`,
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const outputTreeSha256 = hashTree(output);
  return {
    git_commit: gitCommit,
    executable_sha256: sha256(readFileSync(executable)),
    argv,
    stdout_base64: result.stdout.toString('base64'),
    stderr_base64: result.stderr.toString('base64'),
    exit_code: result.status,
    output_tree_sha256: outputTreeSha256,
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
  const fixtureRelativePath = relative(process.cwd(), fixture).replaceAll('\\', '/');
  if (
    fixtureRelativePath !== 'calibration/llm/fixtures/free-core-parity' ||
    fixtureRelativePath.startsWith('../')
  ) throw new Error('free-core parity requires the committed calibration fixture');
  const clockHookPath = resolve('calibration/llm/scripts/fixed-clock-hook.cjs');
  const clockHookBytes = readFileSync(clockHookPath);
  const clock = {
    fixed_iso: '2026-07-23T00:00:00.000Z',
    hook_path: 'calibration/llm/scripts/fixed-clock-hook.cjs',
    hook_sha256: sha256(clockHookBytes),
    hook_content_base64: clockHookBytes.toString('base64'),
  };
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'cejel-free-core-parity-'));
  const runtimeClock = { ...clock, hook_path: clockHookPath };
  try {
    const runtimeOutput = join(temporaryRoot, 'output');
    const scanArgv = ['scan', fixture, '--out', runtimeOutput, '--quiet'];
    const baseline = run(resolve(baselinePath), scanArgv, baselineCommit, runtimeOutput, runtimeClock);
    const candidate = run(resolve(candidatePath), scanArgv, candidateCommit, runtimeOutput, runtimeClock);
    const document = {
      fixture: {
        path: fixtureRelativePath,
        tree_sha256: hashTree(fixture),
      },
      clock,
      baseline,
      candidate,
    };
    if (
      baseline.exit_code !== 0 || candidate.exit_code !== 0 ||
      baseline.stdout_base64 !== candidate.stdout_base64 ||
      baseline.stderr_base64 !== candidate.stderr_base64 ||
      baseline.output_tree_sha256 !== candidate.output_tree_sha256
    ) throw new Error('default free-core output differs between baseline and candidate');
    let descriptor;
    try {
      descriptor = openSync(resolve(outputPath), 'wx', 0o644);
      writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
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
