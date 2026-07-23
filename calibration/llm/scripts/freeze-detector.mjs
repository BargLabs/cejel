#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const calibrationRoot = resolve(here, '..');

export const FROZEN_LLM_RULE_IDS = [
  'LLM-IOH-001',
  'LLM-VAL-001',
  'LLM-AGY-001',
  'LLM-AGY-002',
  'LLM-DAT-001',
  'LLM-PRV-001',
  'LLM-EVL-001',
  'LLM-EVL-002',
];

export const FROZEN_SUPPORT_MATRIX = {
  javascript_typescript: {
    status: 'fixture_backed_alpha',
    extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'],
    integration_indicators: [
      'OpenAI SDK',
      'Anthropic SDK',
      'Vercel AI SDK',
      'LangChain imports',
      'recognized model-call shapes',
    ],
    enabled_rule_ids: [...FROZEN_LLM_RULE_IDS],
  },
  python: {
    status: 'narrow_fixture_backed_alpha',
    extensions: ['.py'],
    integration_indicators: ['OpenAI official SDK', 'Anthropic official SDK'],
    enabled_rule_ids: ['LLM-IOH-001', 'LLM-AGY-002', 'LLM-DAT-001'],
  },
  limitations: [
    'Static local source-pattern analysis only; no target application or model execution.',
    'No whole-program data-flow, model-quality, factuality, or hallucination-rate claim.',
    'Action-governance and evaluation-hygiene checks require complete local JavaScript or TypeScript paths.',
  ],
};

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function hashDetectorFreezeRecord(record) {
  const { record_sha256: _excluded, ...hashable } = record;
  return createHash('sha256').update(canonicalize(hashable), 'utf8').digest('hex');
}

function validUtc(value) {
  return typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));
}

export function validateGoldenCorrectionLedger(document, expectedBuildSha256) {
  if (
    document?.schema_version !== '1.0.0' ||
    document?.protocol_id !== 'cejel-llm-calibration-v1'
  ) {
    throw new Error('golden correction ledger has an unsupported schema or protocol');
  }
  if (document.status !== 'frozen' || document.frozen_before_untouched !== true) {
    throw new Error('golden correction ledger must be frozen before untouched execution');
  }
  if (document.detector_build_sha256 !== expectedBuildSha256) {
    throw new Error('golden correction ledger is not bound to this detector build SHA-256');
  }
  if (!/^[a-f0-9]{64}$/.test(document.golden_manifest_sha256 || '')) {
    throw new Error('golden correction ledger lacks a frozen golden manifest SHA-256');
  }
  if (!validUtc(document.frozen_at)) {
    throw new Error('golden correction ledger frozen_at must be a UTC ISO-8601 timestamp');
  }
  if (!Array.isArray(document.reviewed_by) || document.reviewed_by.length !== 2) {
    throw new Error('golden correction ledger requires two reviewers');
  }
  if (new Set(document.reviewed_by.map((name) => String(name).trim().toLowerCase())).size !== 2) {
    throw new Error('golden correction ledger reviewers must be distinct');
  }
  if (!Array.isArray(document.entries)) {
    throw new Error('golden correction ledger entries must be an array');
  }
  if (document.open_corrections !== 0) {
    throw new Error('golden correction ledger must have zero open corrections');
  }
  return document;
}

export function createDetectorFreezeRecord(input) {
  if (!/^[a-f0-9]{40}$/.test(input.gitCommit || '')) {
    throw new Error('detector Git commit must be a full 40-character SHA');
  }
  if (!/^[a-f0-9]{64}$/.test(input.buildSha256 || '')) {
    throw new Error('detector build SHA-256 is invalid');
  }
  if (!validUtc(input.frozenAt)) throw new Error('detector frozen_at must be UTC ISO-8601');
  if (!input.networkIsolation?.confirmed || input.networkIsolation.argvPrefix?.length < 1) {
    throw new Error('detector freeze requires an explicitly confirmed no-egress argv prefix');
  }
  if (!input.networkIsolation.mode || !input.networkIsolation.evidenceReference) {
    throw new Error('detector freeze requires network-isolation mode and evidence reference');
  }

  const withoutHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    status: 'detector_frozen_before_untouched',
    frozen_at: input.frozenAt,
    detector: {
      git_commit: input.gitCommit,
      build_sha256: input.buildSha256,
      artifact_name: input.artifactName,
      runtime: input.runtime,
    },
    execution: {
      command_template: [
        '{network_isolation_argv_prefix...}',
        '{cejel_binary}',
        'scan',
        '{source}',
        '--out',
        '{output}',
        '--pack',
        'llm',
        '--quiet',
      ],
      network_isolation: {
        mode: input.networkIsolation.mode,
        argv_prefix: input.networkIsolation.argvPrefix,
        evidence_reference: input.networkIsolation.evidenceReference,
        explicitly_confirmed: true,
      },
    },
    rule_ids: [...FROZEN_LLM_RULE_IDS],
    support_matrix: FROZEN_SUPPORT_MATRIX,
    golden_correction_ledger: {
      sha256: input.ledgerSha256,
      status: 'frozen',
      entries: input.ledger.entries.length,
      open_corrections: 0,
      frozen_at: input.ledger.frozen_at,
    },
    untouched_results_seen_before_freeze: false,
  };
  return { ...withoutHash, record_sha256: hashDetectorFreezeRecord(withoutHash) };
}

export function validateDetectorFreezeRecord(record) {
  if (
    record?.schema_version !== '1.0.0' ||
    record?.protocol_id !== 'cejel-llm-calibration-v1' ||
    record?.status !== 'detector_frozen_before_untouched'
  ) {
    throw new Error('invalid or non-frozen detector-freeze record');
  }
  if (!validUtc(record.frozen_at) || record.untouched_results_seen_before_freeze !== false) {
    throw new Error('detector freeze does not preserve the untouched boundary');
  }
  if (!/^[a-f0-9]{40}$/.test(record.detector?.git_commit || '')) {
    throw new Error('detector freeze has an invalid Git commit');
  }
  if (!/^[a-f0-9]{64}$/.test(record.detector?.build_sha256 || '')) {
    throw new Error('detector freeze has an invalid build SHA-256');
  }
  if (canonicalize(record.rule_ids) !== canonicalize(FROZEN_LLM_RULE_IDS)) {
    throw new Error('detector freeze rule IDs do not match the frozen v1 catalogue');
  }
  if (canonicalize(record.support_matrix) !== canonicalize(FROZEN_SUPPORT_MATRIX)) {
    throw new Error('detector freeze support matrix does not match the frozen alpha declaration');
  }
  if (
    canonicalize(record.execution?.command_template) !==
    canonicalize([
      '{network_isolation_argv_prefix...}',
      '{cejel_binary}',
      'scan',
      '{source}',
      '--out',
      '{output}',
      '--pack',
      'llm',
      '--quiet',
    ])
  ) {
    throw new Error('detector freeze command template is not the calibration command');
  }
  const isolation = record.execution?.network_isolation;
  if (
    isolation?.explicitly_confirmed !== true ||
    !Array.isArray(isolation.argv_prefix) ||
    isolation.argv_prefix.length < 1
  ) {
    throw new Error('detector freeze lacks confirmed no-egress execution');
  }
  if (
    record.golden_correction_ledger?.status !== 'frozen' ||
    record.golden_correction_ledger?.open_corrections !== 0 ||
    !/^[a-f0-9]{64}$/.test(record.golden_correction_ledger?.sha256 || '')
  ) {
    throw new Error('detector freeze lacks a closed golden correction ledger');
  }
  if (hashDetectorFreezeRecord(record) !== record.record_sha256) {
    throw new Error('detector-freeze record SHA-256 does not match its contents');
  }
  return record;
}

function parseArgs(argv) {
  const options = { isolationArgs: [], confirmNetworkIsolation: false };
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
      case '--detector-repo': options.detectorRepo = take(); break;
      case '--cejel': options.cejel = take(); break;
      case '--golden-correction-ledger': options.ledger = take(); break;
      case '--network-isolation-mode': options.isolationMode = take(); break;
      case '--network-isolation-command': options.isolationCommand = take(); break;
      case '--network-isolation-arg': options.isolationArgs.push(take()); break;
      case '--network-isolation-evidence': options.isolationEvidence = take(); break;
      case '--confirm-network-isolation': options.confirmNetworkIsolation = true; break;
      case '--frozen-at': options.frozenAt = take(); break;
      case '--output': options.output = take(); break;
      case '--help': options.help = true; break;
      default: throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node calibration/llm/scripts/freeze-detector.mjs \\
    --detector-repo . --cejel ./dist/index.js \\
    --golden-correction-ledger ./golden-corrections.json \\
    --network-isolation-mode sandbox-no-egress \\
    --network-isolation-command /path/to/isolation-wrapper \\
    --network-isolation-evidence internal-witness:isolation-proof \\
    --confirm-network-isolation

The detector repository must be clean. The output is created exclusively and is never overwritten.
`;
}

async function run(command, args, options = {}) {
  const { stdout } = await execFile(command, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  });
  return stdout.trim();
}

function writeNewFile(path, document) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', 0o644);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export async function main(argv, commandRunner = run) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  for (const [flag, value] of [
    ['--cejel', options.cejel],
    ['--golden-correction-ledger', options.ledger],
    ['--network-isolation-mode', options.isolationMode],
    ['--network-isolation-command', options.isolationCommand],
    ['--network-isolation-evidence', options.isolationEvidence],
  ]) {
    if (!value) throw new Error(`${flag} is required`);
  }
  if (!options.confirmNetworkIsolation) {
    throw new Error('--confirm-network-isolation is required');
  }

  const detectorRepo = resolve(options.detectorRepo || '.');
  const cejel = realpathSync(resolve(options.cejel));
  const ledgerPath = resolve(options.ledger);
  const buildBytes = readFileSync(cejel);
  const buildSha256 = sha256Bytes(buildBytes);
  const gitCommit = await commandRunner('git', ['-C', detectorRepo, 'rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(gitCommit)) throw new Error('detector repository HEAD is not a full commit');
  const gitStatus = await commandRunner('git', ['-C', detectorRepo, 'status', '--porcelain']);
  if (gitStatus.length > 0) throw new Error('detector repository must be clean before detector freeze');

  const ledgerBytes = readFileSync(ledgerPath);
  const ledger = validateGoldenCorrectionLedger(
    JSON.parse(ledgerBytes.toString('utf8')),
    buildSha256,
  );
  const record = createDetectorFreezeRecord({
    gitCommit,
    buildSha256,
    artifactName: basename(cejel),
    frozenAt: options.frozenAt || new Date().toISOString(),
    runtime: {
      name: process.release.name,
      version: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    networkIsolation: {
      mode: options.isolationMode,
      argvPrefix: [realpathSync(resolve(options.isolationCommand)), ...options.isolationArgs],
      evidenceReference: options.isolationEvidence,
      confirmed: true,
    },
    ledger,
    ledgerSha256: sha256Bytes(ledgerBytes),
  });
  validateDetectorFreezeRecord(record);
  const output = resolve(
    options.output || resolve(calibrationRoot, 'detector-freeze.json'),
  );
  writeNewFile(output, record);
  console.log(JSON.stringify({
    status: record.status,
    output,
    detector_git_commit: gitCommit,
    detector_build_sha256: buildSha256,
    record_sha256: record.record_sha256,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
