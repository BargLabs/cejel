#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';
import {
  validateDetectorFreezeRecord,
  validateGoldenCorrectionLedger,
} from './freeze-detector.mjs';

const execFile = promisify(execFileCallback);

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isWithin(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

export function assertSeparatedRoots(workRoot, outputRoot) {
  const work = resolve(workRoot);
  const output = resolve(outputRoot);
  if (isWithin(work, output) || isWithin(output, work)) {
    throw new Error('work-root and output-root must be separate, non-nested directories');
  }
  return { work, output };
}

export function validateImmutableManifest(manifest) {
  if (
    manifest?.schema_version !== '1.0.0' ||
    manifest?.protocol_id !== 'cejel-llm-calibration-v1' ||
    manifest?.status !== 'frozen' ||
    !['golden', 'untouched'].includes(manifest?.cohort)
  ) {
    throw new Error('runner requires a frozen golden or untouched immutable manifest');
  }
  if (
    manifest.detector_results_seen_before_freeze !== false ||
    !Array.isArray(manifest.frozen_by) ||
    manifest.frozen_by.length !== 2 ||
    typeof manifest.attestation?.reference !== 'string' ||
    manifest.attestation.reference.length < 8
  ) {
    throw new Error('immutable manifest lacks the required reviewed freeze declaration');
  }
  if (!Array.isArray(manifest.repositories) || manifest.repositories.length < 1) {
    throw new Error('immutable manifest contains no repositories');
  }
  if (hashManifest(manifest) !== manifest.manifest_sha256) {
    throw new Error('immutable manifest SHA-256 does not match its contents');
  }
  const seen = new Set();
  for (const repository of manifest.repositories) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.repository_id || '')) {
      throw new Error('immutable manifest contains an invalid repository id');
    }
    if (repository.url !== `https://github.com/${repository.repository_id}`) {
      throw new Error(`${repository.repository_id}: immutable manifest URL mismatch`);
    }
    if (!/^[a-f0-9]{40}$/.test(repository.commit_sha || '')) {
      throw new Error(`${repository.repository_id}: commit is not an immutable 40-character SHA`);
    }
    if (!/^[a-f0-9]{40}$/.test(repository.git_tree_sha || '')) {
      throw new Error(`${repository.repository_id}: Git tree is not an immutable 40-character SHA`);
    }
    if (hashRepositoryEntry(repository) !== repository.entry_sha256) {
      throw new Error(`${repository.repository_id}: entry SHA-256 does not match its contents`);
    }
    const id = repository.repository_id.toLowerCase();
    if (seen.has(id)) throw new Error(`${repository.repository_id}: duplicate repository`);
    seen.add(id);
  }
  return manifest;
}

export function assertCohortRunAllowed(cohort, freezeRecord, confirmedUntouched) {
  if (cohort === 'golden') return;
  if (cohort !== 'untouched') throw new Error(`unsupported cohort: ${cohort}`);
  if (!freezeRecord) {
    throw new Error('untouched execution requires a valid --detector-freeze record');
  }
  validateDetectorFreezeRecord(freezeRecord);
  if (!confirmedUntouched) {
    throw new Error('untouched execution requires --confirm-untouched-after-freeze');
  }
}

export function buildScanInvocation(isolationPrefix, cejel, source, output) {
  if (!Array.isArray(isolationPrefix) || isolationPrefix.length < 1) {
    throw new Error('scan execution requires a non-empty network-isolation argv prefix');
  }
  return {
    command: isolationPrefix[0],
    args: [
      ...isolationPrefix.slice(1),
      cejel,
      'scan',
      source,
      '--out',
      output,
      '--pack',
      'llm',
      '--quiet',
    ],
  };
}

function repositoryDirectoryName(repositoryId) {
  return repositoryId.replace('/', '__');
}

async function defaultRunner(command, args, options = {}) {
  const { stdout } = await execFile(command, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10 * 60_000,
    ...options,
  });
  return stdout.trim();
}

export async function runFrozenRepository(input, commandRunner = defaultRunner) {
  assertSeparatedRoots(input.workRoot, input.outputRoot);
  const source = join(input.workRoot, repositoryDirectoryName(input.repository.repository_id));
  const output = join(input.outputRoot, repositoryDirectoryName(input.repository.repository_id));
  if (existsSync(source) || existsSync(output)) {
    throw new Error(`${input.repository.repository_id}: source or output destination already exists`);
  }
  mkdirSync(dirname(source), { recursive: true });
  mkdirSync(dirname(output), { recursive: true });

  await commandRunner(
    'git',
    ['clone', '--no-checkout', input.repository.url, source],
    { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } },
  );
  await commandRunner(
    'git',
    ['-C', source, '-c', 'advice.detachedHead=false', 'checkout', '--detach', input.repository.commit_sha],
    { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } },
  );
  const actualCommit = await commandRunner('git', ['-C', source, 'rev-parse', 'HEAD']);
  if (actualCommit !== input.repository.commit_sha) {
    throw new Error(`${input.repository.repository_id}: checked-out commit differs from manifest`);
  }
  const actualTree = await commandRunner('git', ['-C', source, 'rev-parse', 'HEAD^{tree}']);
  if (actualTree !== input.repository.git_tree_sha) {
    throw new Error(`${input.repository.repository_id}: checked-out Git tree differs from manifest`);
  }

  const invocation = buildScanInvocation(input.isolationPrefix, input.cejel, source, output);
  await commandRunner(invocation.command, invocation.args, {
    cwd: dirname(input.cejel),
    env: { ...process.env, CI: '1' },
  });
  if (!existsSync(output)) mkdirSync(output, { recursive: true });
  const receipt = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    cohort: input.cohort,
    repository_id: input.repository.repository_id,
    commit_sha: actualCommit,
    git_tree_sha: actualTree,
    detector_build_sha256: input.detectorBuildSha256,
    detector_freeze_sha256: input.detectorFreezeSha256 || null,
    network_isolation_mode: input.networkIsolationMode,
    completed_at: new Date().toISOString(),
    output_outside_source: !isWithin(source, output) && !isWithin(output, source),
  };
  writeFileSync(join(output, 'calibration-execution.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { source, output, receipt };
}

function parseArgs(argv) {
  const options = {
    isolationArgs: [],
    confirmNetworkIsolation: false,
    confirmUntouchedAfterFreeze: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--network-isolation-arg=')) {
      const value = argument.slice('--network-isolation-arg='.length);
      if (!value) throw new Error('--network-isolation-arg requires a value');
      options.isolationArgs.push(value);
      continue;
    }
    const take = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case '--manifest': options.manifest = take(); break;
      case '--detector-freeze': options.detectorFreeze = take(); break;
      case '--golden-correction-ledger': options.ledger = take(); break;
      case '--cejel': options.cejel = take(); break;
      case '--work-root': options.workRoot = take(); break;
      case '--output-root': options.outputRoot = take(); break;
      case '--network-isolation-mode': options.isolationMode = take(); break;
      case '--network-isolation-command': options.isolationCommand = take(); break;
      case '--network-isolation-arg': options.isolationArgs.push(take()); break;
      case '--confirm-network-isolation': options.confirmNetworkIsolation = true; break;
      case '--confirm-untouched-after-freeze': options.confirmUntouchedAfterFreeze = true; break;
      case '--help': options.help = true; break;
      default: throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node calibration/llm/scripts/run-frozen-cohort.mjs \\
    --manifest <frozen-manifest.json> --cejel <local-built-cejel> \\
    --work-root <checkout-root> --output-root <separate-output-root> \\
    [--detector-freeze <record.json> --golden-correction-ledger <ledger.json>] \\
    [--confirm-untouched-after-freeze]

Golden runs may supply an explicitly confirmed isolation command directly. Untouched runs must use
the isolation command bound into a valid detector-freeze record and require the confirmation flag.
`;
}

export async function main(argv, commandRunner = defaultRunner) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  for (const [flag, value] of [
    ['--manifest', options.manifest],
    ['--cejel', options.cejel],
    ['--work-root', options.workRoot],
    ['--output-root', options.outputRoot],
  ]) {
    if (!value) throw new Error(`${flag} is required`);
  }
  const manifest = validateImmutableManifest(JSON.parse(readFileSync(resolve(options.manifest), 'utf8')));
  const cejel = realpathSync(resolve(options.cejel));
  const detectorBuildSha256 = sha256Bytes(readFileSync(cejel));
  const roots = assertSeparatedRoots(options.workRoot, options.outputRoot);

  let freezeRecord = null;
  let isolationPrefix;
  let isolationMode;
  if (options.detectorFreeze) {
    if (
      options.isolationCommand ||
      options.isolationMode ||
      options.isolationArgs.length > 0 ||
      options.confirmNetworkIsolation
    ) {
      throw new Error('detector-freeze execution does not accept network-isolation overrides');
    }
    freezeRecord = validateDetectorFreezeRecord(
      JSON.parse(readFileSync(resolve(options.detectorFreeze), 'utf8')),
    );
    if (freezeRecord.detector.build_sha256 !== detectorBuildSha256) {
      throw new Error('local Cejel build SHA-256 does not match detector-freeze record');
    }
    if (!options.ledger) {
      throw new Error('--golden-correction-ledger is required with --detector-freeze');
    }
    const ledgerBytes = readFileSync(resolve(options.ledger));
    if (sha256Bytes(ledgerBytes) !== freezeRecord.golden_correction_ledger.sha256) {
      throw new Error('golden correction ledger bytes do not match detector-freeze record');
    }
    validateGoldenCorrectionLedger(JSON.parse(ledgerBytes.toString('utf8')), detectorBuildSha256);
    isolationPrefix = freezeRecord.execution.network_isolation.argv_prefix;
    isolationMode = freezeRecord.execution.network_isolation.mode;
  } else {
    if (!options.confirmNetworkIsolation || !options.isolationCommand || !options.isolationMode) {
      if (manifest.cohort === 'golden') {
        throw new Error('golden execution requires an explicitly confirmed network-isolation command');
      }
    } else {
      isolationPrefix = [realpathSync(resolve(options.isolationCommand)), ...options.isolationArgs];
      isolationMode = options.isolationMode;
    }
  }

  assertCohortRunAllowed(
    manifest.cohort,
    freezeRecord,
    options.confirmUntouchedAfterFreeze,
  );
  if (!isolationPrefix) throw new Error('no network-isolation execution prefix is available');
  mkdirSync(roots.work, { recursive: true });
  mkdirSync(roots.output, { recursive: true });

  const completed = [];
  for (const repository of manifest.repositories) {
    completed.push(await runFrozenRepository({
      cohort: manifest.cohort,
      repository,
      cejel,
      workRoot: roots.work,
      outputRoot: roots.output,
      isolationPrefix,
      networkIsolationMode: isolationMode,
      detectorBuildSha256,
      detectorFreezeSha256: freezeRecord?.record_sha256,
    }, commandRunner));
  }
  console.log(JSON.stringify({
    status: 'completed',
    cohort: manifest.cohort,
    repositories: completed.length,
    detector_build_sha256: detectorBuildSha256,
    detector_freeze_sha256: freezeRecord?.record_sha256 || null,
    output_root: roots.output,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
