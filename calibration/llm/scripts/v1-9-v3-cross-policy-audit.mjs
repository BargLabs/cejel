#!/usr/bin/env node

import { execFile as execFileCallback, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { checkoutFrozenCohort } from './checkout-frozen-cohort.mjs';
import { canonicalize } from './freeze-cohorts.mjs';
import { validateImmutableManifest } from './run-frozen-cohort.mjs';

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const {
  POLICY_ID,
  SURFACE_IDS,
  SURFACE_SHA256,
} = require('./no-egress-policy.cjs');

export const PROTOCOL_ID = 'cejel-llm-v1.9-v3-cross-policy-audit-v1';
export const BINDINGS_PATH =
  'docs/experiments/llm-v1-9-v3-cross-policy-audit-2026-08-10/bindings.json';
export const PREREGISTRATION_PATH =
  'docs/experiments/llm-v1-9-v3-cross-policy-audit-2026-08-10/preregistration.md';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalHash(document) {
  return sha256(Buffer.from(canonicalize(document), 'utf8'));
}

function canonicalHashWithout(document, key) {
  const copy = structuredClone(document);
  delete copy[key];
  return canonicalHash(copy);
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} is not a SHA-256 digest`);
  }
}

function assertCommit(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${label} is not a full Git commit`);
  }
}

function isWithin(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function assertSeparated(paths) {
  const resolved = paths.map((path) => resolve(path));
  if (new Set(resolved).size !== resolved.length) throw new Error('audit paths must be distinct');
  for (let left = 0; left < resolved.length; left += 1) {
    for (let right = left + 1; right < resolved.length; right += 1) {
      if (isWithin(resolved[left], resolved[right]) || isWithin(resolved[right], resolved[left])) {
        throw new Error('audit paths must be separate and non-nested');
      }
    }
  }
}

function git(root, args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  }).trim();
}

function byteHash(path) {
  return sha256(readFileSync(path));
}

function readJson(path) {
  const bytes = readFileSync(path);
  return { bytes, document: JSON.parse(bytes.toString('utf8')) };
}

function writeExclusive(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(descriptor, bytes);
  } finally {
    closeSync(descriptor);
  }
}

function currentRuntime() {
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
  };
}

export function validateBindings(bindings) {
  if (
    bindings?.schema_version !== '1.0.0' ||
    bindings.protocol_id !== PROTOCOL_ID ||
    bindings.status !== 'preregistered_before_execution' ||
    JSON.stringify(bindings.runtime) !== JSON.stringify(currentRuntime()) ||
    bindings.historical_detector?.source_commit !== '5c92625ebd89c6ee071690b7b9dc770a5ef76a3e' ||
    bindings.historical_detector?.source_tree !== 'b6d5092768cc5ca3f1227a9812e457d2d8f04aff' ||
    bindings.historical_detector?.package_version !== '0.1.8' ||
    bindings.historical_detector?.build_output !== 'dist/index.js' ||
    bindings.historical_detector?.build_output_byte_sha256 !==
      'd8e4fd99e1802bbd48fd71930c05efefb4fa526f6277d1f87ff82492e17cfafa' ||
    bindings.historical_inputs?.golden_manifest?.canonical_sha256 !==
      'a710db4098e88090b1f49d90a6f88f4280038e9c5443f9581138f4206885b3b2' ||
    bindings.historical_inputs?.golden_manifest?.repositories !== 24 ||
    bindings.historical_inputs?.execution_evidence?.executions !== 24 ||
    bindings.v3_control?.merge_commit !== '356aefe84cb43a87c324856497d4aafe8914725c' ||
    bindings.v3_control?.policy_id !== POLICY_ID ||
    bindings.v3_control?.runtime_surface_count !== SURFACE_IDS.length ||
    bindings.v3_control?.runtime_surface_sha256 !== SURFACE_SHA256 ||
    !Array.isArray(bindings.preregistration_paths) ||
    !bindings.preregistration_paths.includes(BINDINGS_PATH) ||
    !bindings.preregistration_paths.includes(PREREGISTRATION_PATH) ||
    bindings.comparison?.all_other_fields !== 'exact' ||
    JSON.stringify(bindings.comparison?.excluded_json_pointers) !==
      JSON.stringify(['/generatedAt', '/repo/path', '/baseReportSha256'])
  ) throw new Error('cross-policy bindings are invalid or do not match this runtime');
  for (const [label, value] of [
    ['historical source commit', bindings.historical_detector.source_commit],
    ['historical source tree', bindings.historical_detector.source_tree],
    ['v3 control merge', bindings.v3_control.merge_commit],
  ]) assertCommit(value, label);
  for (const [path, hash] of Object.entries({
    ...bindings.historical_detector.build_tree,
    ...bindings.v3_control.assets,
  })) assertSha256(hash, path);
  return bindings;
}

function assertRepoAnchor(repoRoot, preregistrationCommit, bindings) {
  const root = realpathSync(repoRoot);
  assertCommit(preregistrationCommit, 'preregistration commit');
  if (git(root, ['status', '--porcelain', '--untracked-files=all']) !== '') {
    throw new Error('result worktree must be clean before the sole run');
  }
  if (git(root, ['rev-parse', 'HEAD']) !== preregistrationCommit) {
    throw new Error('pre-run HEAD must equal the preregistration merge commit');
  }
  const trackingMain = git(root, ['rev-parse', 'origin/main']);
  const remoteLine = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const remoteMain = remoteLine.split(/\s+/)[0];
  if (trackingMain !== remoteMain) throw new Error('origin/main does not match independent remote main');
  execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', preregistrationCommit, trackingMain]);
  execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', bindings.v3_control.merge_commit, preregistrationCommit]);

  for (const path of bindings.preregistration_paths) {
    if (isAbsolute(path) || path.split(/[\\/]/).includes('..')) {
      throw new Error(`invalid preregistration path: ${path}`);
    }
    const localPath = realpathSync(resolve(root, path));
    if (!isWithin(root, localPath)) throw new Error(`preregistration path escapes repository: ${path}`);
    const committed = execFileSync('git', ['-C', root, 'show', `${preregistrationCommit}:${path}`]);
    if (!Buffer.from(committed).equals(readFileSync(localPath))) {
      throw new Error(`local bytes differ from preregistration blob: ${path}`);
    }
  }
  return { root, trackingMain, remoteMain };
}

function assertBoundFile(root, binding, label) {
  const path = realpathSync(resolve(root, binding.path));
  if (!isWithin(root, path)) throw new Error(`${label} escapes repository`);
  if (byteHash(path) !== binding.byte_sha256) throw new Error(`${label} byte SHA-256 mismatch`);
  const blob = git(root, ['hash-object', path]);
  if (binding.git_blob && blob !== binding.git_blob) throw new Error(`${label} Git blob mismatch`);
  return path;
}

function validateHistoricalInputs(repoRoot, bindings) {
  const manifestPath = assertBoundFile(
    repoRoot,
    bindings.historical_inputs.golden_manifest,
    'golden manifest',
  );
  const evidencePath = assertBoundFile(
    repoRoot,
    bindings.historical_inputs.execution_evidence,
    'historical execution evidence',
  );
  assertBoundFile(repoRoot, bindings.historical_inputs.terminal_no_go, 'terminal NO-GO');
  const manifest = validateImmutableManifest(readJson(manifestPath).document);
  if (
    manifest.cohort !== 'golden' ||
    manifest.manifest_sha256 !== bindings.historical_inputs.golden_manifest.canonical_sha256 ||
    manifest.repositories.length !== 24
  ) throw new Error('golden manifest does not match preregistration');
  const evidence = readJson(evidencePath).document;
  if (
    evidence?.schema_version !== '1.0.0' ||
    evidence.protocol_id !== 'cejel-llm-calibration-v1' ||
    evidence.cohort !== 'golden' ||
    evidence.golden_manifest_sha256 !== manifest.manifest_sha256 ||
    evidence.detector_build_sha256 !== bindings.historical_detector.build_output_byte_sha256 ||
    !Array.isArray(evidence.executions) || evidence.executions.length !== 24
  ) throw new Error('historical execution evidence does not match preregistration');
  const manifestById = new Map(manifest.repositories.map((repository) => [repository.repository_id, repository]));
  const evidenceById = new Map();
  for (const execution of evidence.executions) {
    const repository = manifestById.get(execution.repository_id);
    const document = execution?.llm_report?.document;
    if (
      !repository || evidenceById.has(execution.repository_id) ||
      document?.repo?.headSha !== repository.commit_sha ||
      canonicalHash(document) !== execution.llm_report.document_sha256 ||
      execution.receipt?.document?.commit_sha !== repository.commit_sha ||
      execution.receipt?.document?.git_tree_sha !== repository.git_tree_sha
    ) throw new Error(`${execution.repository_id || 'execution'}: historical evidence mismatch`);
    evidenceById.set(execution.repository_id, execution);
  }
  if (evidenceById.size !== manifestById.size) throw new Error('historical evidence repository set mismatch');
  return { manifest, evidenceById, manifestPath, evidencePath };
}

function validateV3Assets(repoRoot, bindings) {
  for (const [path, expectedHash] of Object.entries(bindings.v3_control.assets)) {
    const localPath = realpathSync(resolve(repoRoot, path));
    if (!isWithin(repoRoot, localPath) || byteHash(localPath) !== expectedHash) {
      throw new Error(`${path}: v3 asset byte mismatch`);
    }
    const committedBytes = execFileSync(
      'git',
      ['-C', repoRoot, 'show', `${bindings.v3_control.merge_commit}:${path}`],
    );
    if (sha256(committedBytes) !== expectedHash) {
      throw new Error(`${path}: v3 control merge byte mismatch`);
    }
  }
}

function buildHashes(root, expected) {
  execFileSync('./node_modules/.bin/tsup', [], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  const actual = {};
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) actual[relative(root, path).split(sep).join('/')] = byteHash(path);
    }
  };
  walk(join(root, 'dist'));
  if (canonicalize(actual) !== canonicalize(expected)) throw new Error('historical build tree mismatch');
  return actual;
}

function authenticateHistoricalDetector(root, bindings) {
  const detectorRoot = realpathSync(root);
  if (git(detectorRoot, ['status', '--porcelain', '--untracked-files=all']) !== '') {
    throw new Error('historical detector tracked/untracked worktree is not clean');
  }
  if (
    git(detectorRoot, ['rev-parse', 'HEAD']) !== bindings.historical_detector.source_commit ||
    git(detectorRoot, ['rev-parse', 'HEAD^{tree}']) !== bindings.historical_detector.source_tree
  ) throw new Error('historical detector commit/tree mismatch');
  const packageDocument = readJson(join(detectorRoot, 'package.json')).document;
  if (packageDocument.version !== bindings.historical_detector.package_version) {
    throw new Error('historical detector package version mismatch');
  }
  for (const [path, expected] of [
    ['package.json', bindings.historical_detector.package_json_byte_sha256],
    ['pnpm-lock.yaml', bindings.historical_detector.lockfile_byte_sha256],
    ['tsup.config.ts', bindings.historical_detector.tsup_config_byte_sha256],
  ]) {
    if (byteHash(join(detectorRoot, path)) !== expected) throw new Error(`${path} historical byte mismatch`);
  }
  const first = buildHashes(detectorRoot, bindings.historical_detector.build_tree);
  const second = buildHashes(detectorRoot, bindings.historical_detector.build_tree);
  if (canonicalize(first) !== canonicalize(second)) throw new Error('historical build is not reproducible');
  if (git(detectorRoot, ['status', '--porcelain', '--untracked-files=all']) !== '') {
    throw new Error('historical detector source changed during build');
  }
  return {
    root: detectorRoot,
    executable: realpathSync(join(detectorRoot, bindings.historical_detector.build_output)),
    build_tree: second,
  };
}

export function validateProbe(probe) {
  if (
    probe?.policy !== POLICY_ID ||
    probe.denied !== SURFACE_IDS.length ||
    probe.attempted !== SURFACE_IDS.length ||
    probe.surface_sha256 !== SURFACE_SHA256 ||
    canonicalize(probe.surface_ids) !== canonicalize(SURFACE_IDS) ||
    probe.complete_for_declared_surface !== true ||
    probe.allowed_local_git !== true ||
    probe.denied_git_variants !== 3
  ) throw new Error('v3 cross-policy probe failed');
  return probe;
}

export function normalizeHistoricalReport(document) {
  const copy = structuredClone(document);
  if (
    !Object.hasOwn(copy, 'generatedAt') ||
    !copy.repo || !Object.hasOwn(copy.repo, 'path') ||
    !Object.hasOwn(copy, 'baseReportSha256')
  ) throw new Error('LLM report lacks a preregistered run-environment field');
  delete copy.generatedAt;
  delete copy.repo.path;
  delete copy.baseReportSha256;
  return copy;
}

function pointerEscape(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function differingPointers(left, right, pointer = '') {
  if (Object.is(left, right)) return [];
  if (
    left === null || right === null || typeof left !== 'object' || typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) return [pointer || '/'];
  if (Array.isArray(left)) {
    const differences = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length || index >= right.length) differences.push(`${pointer}/${index}`);
      else differences.push(...differingPointers(left[index], right[index], `${pointer}/${index}`));
    }
    return differences;
  }
  const differences = [];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    const child = `${pointer}/${pointerEscape(key)}`;
    if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) differences.push(child);
    else differences.push(...differingPointers(left[key], right[key], child));
  }
  return differences;
}

export function compareHistoricalReport(expected, actual) {
  const expectedNormalized = normalizeHistoricalReport(expected);
  const actualNormalized = normalizeHistoricalReport(actual);
  const expectedHash = canonicalHash(expectedNormalized);
  const actualHash = canonicalHash(actualNormalized);
  return {
    expected_document_canonical_sha256: canonicalHash(expected),
    actual_document_canonical_sha256: canonicalHash(actual),
    expected_normalized_sha256: expectedHash,
    actual_normalized_sha256: actualHash,
    normalized_match: expectedHash === actualHash,
    differing_json_pointers: differingPointers(expectedNormalized, actualNormalized),
  };
}

export function validateAuditEvents(bytes) {
  const lines = bytes.toString('utf8').split(/\r?\n/).filter(Boolean);
  const events = lines.map((line) => JSON.parse(line));
  if (events.filter((event) => event?.kind === 'adapter_loaded').length !== 1) {
    throw new Error('cross-policy adapter load evidence is missing or duplicated');
  }
  const allowedSubcommands = new Set(['diff-tree', 'log', 'ls-files', 'rev-list', 'rev-parse', 'show']);
  for (const event of events) {
    if (event?.kind === 'adapter_loaded' && Object.keys(event).length === 1) continue;
    if (
      event?.kind === 'historical_git_translated' &&
      Object.keys(event).sort().join(',') === 'kind,subcommand' &&
      allowedSubcommands.has(event.subcommand)
    ) continue;
    if (
      event?.kind === 'denied_surface' &&
      Object.keys(event).sort().join(',') === 'kind,surface' &&
      SURFACE_IDS.includes(event.surface)
    ) continue;
    throw new Error('cross-policy audit log contains an invalid event');
  }
  return {
    event_count: events.length,
    adapter_loaded: true,
    historical_git_calls: events.filter((event) => event.kind === 'historical_git_translated').length,
    historical_git_subcommands: [...new Set(events
      .filter((event) => event.kind === 'historical_git_translated')
      .map((event) => event.subcommand))].sort(),
    denied_surfaces: events.filter((event) => event.kind === 'denied_surface').map((event) => event.surface),
  };
}

async function runProcess(command, args, options = {}) {
  try {
    const result = await execFile(command, args, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30 * 60_000,
      ...options,
    });
    return { exit_code: 0, signal: null, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exit_code: Number.isInteger(error.code) ? error.code : null,
      signal: error.signal || null,
      stdout: error.stdout || '',
      stderr: error.stderr || String(error.message),
    };
  }
}

function directoryName(repositoryId) {
  return repositoryId.replace('/', '__');
}

async function scanRepositories({
  matrix,
  manifest,
  evidenceById,
  executable,
  wrapper,
  outputRoot,
  auditRoot,
}) {
  mkdirSync(outputRoot, { mode: 0o700 });
  mkdirSync(auditRoot, { mode: 0o700 });
  const matrixById = new Map(matrix.repositories.map((row) => [row.repository_id, row]));
  const rows = [];
  let instrumentFailure = null;
  for (const repository of manifest.repositories) {
    const source = realpathSync(matrixById.get(repository.repository_id)?.source_root || '');
    const name = directoryName(repository.repository_id);
    const output = join(outputRoot, name);
    const auditLog = join(auditRoot, `${name}.jsonl`);
    if (existsSync(output) || existsSync(auditLog)) throw new Error(`${repository.repository_id}: output already exists`);
    const environment = {
      ...process.env,
      CI: '1',
      CEJEL_HISTORICAL_SCAN_ROOT: source,
      CEJEL_NO_EGRESS_AUDIT_LOG: auditLog,
    };
    delete environment.NODE_OPTIONS;
    const processResult = await runProcess(wrapper, [
      process.execPath,
      executable,
      'scan',
      source,
      '--out',
      output,
      '--pack',
      'llm',
      '--quiet',
    ], { cwd: dirname(executable), env: environment });
    let audit;
    try {
      if (!existsSync(auditLog)) throw new Error('audit log was not emitted');
      audit = validateAuditEvents(readFileSync(auditLog));
    } catch (error) {
      instrumentFailure = `${repository.repository_id}: ${error.message}`;
      rows.push({
        repository_id: repository.repository_id,
        commit_sha: repository.commit_sha,
        git_tree_sha: repository.git_tree_sha,
        process: { exit_code: processResult.exit_code, signal: processResult.signal },
        instrument_error: error.message,
      });
      break;
    }
    const reportPath = join(output, 'llm-report.json');
    if (processResult.exit_code !== 0 || !existsSync(reportPath)) {
      rows.push({
        repository_id: repository.repository_id,
        commit_sha: repository.commit_sha,
        git_tree_sha: repository.git_tree_sha,
        process: {
          exit_code: processResult.exit_code,
          signal: processResult.signal,
          stdout_sha256: sha256(Buffer.from(processResult.stdout)),
          stderr_sha256: sha256(Buffer.from(processResult.stderr)),
        },
        audit,
        report_emitted: false,
        normalized_match: false,
        differing_json_pointers: ['/'],
      });
      continue;
    }
    const actualBytes = readFileSync(reportPath);
    const actual = JSON.parse(actualBytes.toString('utf8'));
    const expected = evidenceById.get(repository.repository_id).llm_report.document;
    const comparison = compareHistoricalReport(expected, actual);
    rows.push({
      repository_id: repository.repository_id,
      commit_sha: repository.commit_sha,
      git_tree_sha: repository.git_tree_sha,
      process: { exit_code: 0, signal: null },
      audit,
      report_emitted: true,
      actual_report_byte_sha256: sha256(actualBytes),
      ...comparison,
    });
  }
  return { rows, instrumentFailure };
}

export function deriveDisposition(rows, instrumentFailure = null) {
  if (instrumentFailure) return 'INSTRUMENT_FAILURE';
  const allMatch = rows.length === 24 && rows.every((row) => row.normalized_match === true);
  if (!allMatch) return 'DIFFERENCE';
  const denied = rows.flatMap((row) => row.audit.denied_surfaces);
  return denied.length === 0
    ? 'MATCH_NO_DENIED_SURFACE_ATTEMPTS'
    : 'MATCH_WITH_DENIED_SURFACE_ATTEMPTS';
}

function renderMarkdown(result) {
  const lines = [
    '# LLM v1.9 detector under v3 isolation — cross-policy audit result',
    '',
    `Status: **${result.disposition}**`,
    '',
    '**CONSTRAINTS-VERSION: 2026-08-01.4**',
    '',
    `Sole-run scans attempted: ${result.scan_count}; normalized matches: ${result.normalized_matches}/24; denied-surface events: ${result.denied_surface_events}.`,
    '',
    'This retrospective audit uses the already-spent v1.9 golden cohort. It is not a new calibration, does not alter the v1.9 NO-GO, and does not prove comprehensive no-egress.',
    '',
    '## Bindings',
    '',
    `- Preregistration merge: \`${result.preregistration_commit}\``,
    `- Historical detector: \`${result.historical_detector.source_commit}\` / \`${result.historical_detector.build_sha256}\``,
    `- V3 control merge: \`${result.v3_control.merge_commit}\``,
    `- V3 declared runtime surface: ${result.v3_control.surface_count} paths / \`${result.v3_control.surface_sha256}\``,
    `- Golden manifest: \`${result.golden_manifest_sha256}\` (${result.repository_count} repositories)`,
    '',
    '## Repository outcomes',
    '',
    '| Repository | Exit | Match | Denied surfaces | Historical Git calls | Changed pointers |',
    '|---|---:|:---:|---:|---:|---|',
  ];
  for (const row of result.repositories) {
    lines.push(`| ${row.repository_id} | ${row.process.exit_code ?? row.process.signal ?? 'error'} | ${row.normalized_match === true ? 'yes' : 'no'} | ${row.audit?.denied_surfaces?.length ?? 'n/a'} | ${row.audit?.historical_git_calls ?? 'n/a'} | ${(row.differing_json_pointers || []).join(', ') || '—'} |`);
  }
  lines.push('', '## Claim boundary', '', result.claim_boundary, '');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { confirmSoleRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--confirm-sole-run') {
      options.confirmSoleRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    index += 1;
    options[argument.replace(/^--/, '').replaceAll('-', '_')] = value;
  }
  return options;
}

export async function runAudit(options) {
  for (const key of [
    'repo_root',
    'preregistration_commit',
    'historical_detector_root',
    'work_root',
    'output_root',
    'audit_root',
    'result_json',
    'result_markdown',
  ]) if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  if (!options.confirmSoleRun) throw new Error('--confirm-sole-run is required');
  for (const path of [options.work_root, options.output_root, options.audit_root, options.result_json, options.result_markdown]) {
    if (existsSync(path)) throw new Error(`fresh output path required: ${basename(path)}`);
  }
  assertSeparated([
    options.repo_root,
    options.historical_detector_root,
    options.work_root,
    options.output_root,
    options.audit_root,
    options.result_json,
    options.result_markdown,
  ]);

  const repoRoot = realpathSync(options.repo_root);
  const bindings = validateBindings(readJson(join(repoRoot, BINDINGS_PATH)).document);
  const anchor = assertRepoAnchor(repoRoot, options.preregistration_commit, bindings);
  const inputs = validateHistoricalInputs(repoRoot, bindings);
  validateV3Assets(repoRoot, bindings);
  const detector = authenticateHistoricalDetector(options.historical_detector_root, bindings);
  const wrapper = realpathSync(join(repoRoot, 'calibration/llm/scripts/v1-9-v3-cross-policy-wrapper.sh'));
  const probePath = realpathSync(join(repoRoot, 'calibration/llm/scripts/no-egress-probe.mjs'));
  const probeEnvironment = { ...process.env };
  delete probeEnvironment.NODE_OPTIONS;
  const probeProcess = await runProcess(wrapper, [probePath], { cwd: repoRoot, env: probeEnvironment });
  if (probeProcess.exit_code !== 0) throw new Error(`v3 probe process failed: ${probeProcess.stderr}`);
  const probe = validateProbe(JSON.parse(probeProcess.stdout));

  const matrix = await checkoutFrozenCohort({ manifest: inputs.manifest, workRoot: options.work_root });
  const scanned = await scanRepositories({
    matrix,
    manifest: inputs.manifest,
    evidenceById: inputs.evidenceById,
    executable: detector.executable,
    wrapper,
    outputRoot: resolve(options.output_root),
    auditRoot: resolve(options.audit_root),
  });
  const disposition = deriveDisposition(scanned.rows, scanned.instrumentFailure);
  const deniedSurfaceEvents = scanned.rows.flatMap((row) => row.audit?.denied_surfaces || []).length;
  const result = {
    schema_version: '1.0.0',
    protocol_id: PROTOCOL_ID,
    status: 'completed_sole_run',
    disposition,
    generated_at: new Date().toISOString(),
    preregistration_commit: options.preregistration_commit,
    remote_main_at_execution: anchor.remoteMain,
    historical_detector: {
      source_commit: bindings.historical_detector.source_commit,
      source_tree: bindings.historical_detector.source_tree,
      build_sha256: bindings.historical_detector.build_output_byte_sha256,
      build_tree: detector.build_tree,
    },
    v3_control: {
      merge_commit: bindings.v3_control.merge_commit,
      policy_id: POLICY_ID,
      surface_count: SURFACE_IDS.length,
      surface_sha256: SURFACE_SHA256,
      probe,
    },
    golden_manifest_sha256: inputs.manifest.manifest_sha256,
    repository_count: inputs.manifest.repositories.length,
    scan_count: scanned.rows.length,
    normalized_matches: scanned.rows.filter((row) => row.normalized_match === true).length,
    denied_surface_events: deniedSurfaceEvents,
    instrument_failure: scanned.instrumentFailure,
    comparison_exclusions: ['/generatedAt', '/repo/path', '/baseReportSha256'],
    repositories: scanned.rows,
    claim_boundary: bindings.claim_boundary,
  };
  result.result_sha256 = canonicalHash(result);
  writeExclusive(resolve(options.result_json), `${JSON.stringify(result, null, 2)}\n`);
  writeExclusive(resolve(options.result_markdown), `${renderMarkdown(result)}\n`);
  return result;
}

export async function main(argv) {
  const options = parseArgs(argv);
  try {
    const result = await runAudit(options);
    process.stdout.write(`${JSON.stringify({ disposition: result.disposition, scans: result.scan_count, result_sha256: result.result_sha256 })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
