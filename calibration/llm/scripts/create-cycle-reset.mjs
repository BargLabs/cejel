#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const REPOSITORY_ID = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CODE_POINT_COMPARE = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha256Canonical = (value) => sha256Bytes(Buffer.from(canonicalize(value), 'utf8'));

function fail(message) {
  throw new Error(`cycle reset: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value) &&
    Object.keys(value).sort(CODE_POINT_COMPARE).join('\0') === [...keys].sort(CODE_POINT_COMPARE).join('\0');
}

function normalizeRepositoryId(value, scope) {
  if (typeof value !== 'string' || !REPOSITORY_ID.test(value)) {
    fail(`${scope}: invalid repository identity`);
  }
  return value.toLowerCase();
}

function assertFalse(document, property, scope) {
  if (property in document && document[property] !== false) {
    fail(`${scope}: ${property} must be false`);
  }
}

function assertNoContamination(document, scope, requiredFlags = []) {
  if (!isObject(document)) fail(`${scope}: document must be an object`);
  for (const property of requiredFlags) {
    if (document[property] !== false) fail(`${scope}: ${property} must be false`);
  }
  for (const property of [
    'detector_results_seen',
    'detector_results_seen_for_new_cohorts',
    'source_accessed',
    'source_or_labels_used_for_selection',
    'repository_source_cloned_or_labeled',
    'repository_source_or_labels_used_for_new_cohort_selection',
  ]) assertFalse(document, property, scope);
}

function readDocument(path, scope) {
  const bytes = readFileSync(path);
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`${scope}: invalid JSON`);
  }
  if (!isObject(document)) fail(`${scope}: document must be an object`);
  return {
    path: resolve(path),
    document,
    byteSha256: sha256Bytes(bytes),
    canonicalSha256: sha256Canonical(document),
  };
}

function normalizedIds(repositories, scope) {
  if (!Array.isArray(repositories) || repositories.length === 0) {
    fail(`${scope}: repositories must be a non-empty array`);
  }
  const identities = repositories.map((repository, index) =>
    normalizeRepositoryId(repository?.repository_id, `${scope} repositories[${index}]`));
  if (new Set(identities).size !== identities.length) fail(`${scope}: duplicate repository identity`);
  return identities.sort(CODE_POINT_COMPARE);
}

function validatePriorReset(input) {
  const { document } = input;
  assertNoContamination(document, 'prior reset', [
    'detector_results_seen_for_new_cohorts',
    'repository_source_or_labels_used_for_new_cohort_selection',
  ]);
  if (
    document.schema_version !== '1.0.0' ||
    document.protocol_id !== 'cejel-llm-calibration-v1' ||
    document.record_type !== 'pre_result_cycle_reset' ||
    !/^v1\.[0-9]+$/.test(document.cycle || '') ||
    !isObject(document.historical_exclusions)
  ) fail('prior reset: invalid reset document');
  const exclusions = document.historical_exclusions;
  const identities = exclusions.repository_ids;
  if (!Array.isArray(identities) || !Number.isInteger(exclusions.repository_count) ||
      !SHA256.test(exclusions.repository_ids_sha256 || '')) {
    fail('prior reset: invalid historical exclusion ledger');
  }
  const normalized = identities.map((identity, index) =>
    normalizeRepositoryId(identity, `prior reset historical_exclusions.repository_ids[${index}]`));
  if (
    normalized.length !== exclusions.repository_count ||
    new Set(normalized).size !== normalized.length ||
    normalized.some((identity, index) => identity !== identities[index]) ||
    [...normalized].sort(CODE_POINT_COMPARE).some((identity, index) => identity !== normalized[index]) ||
    sha256Canonical(normalized) !== exclusions.repository_ids_sha256
  ) fail('prior reset: historical exclusion identities are not canonical and hash-bound');
  return normalized;
}

function validateCandidates(input, expectedCohort) {
  const { document } = input;
  assertNoContamination(document, `${expectedCohort} candidates`);
  if (
    !hasExactKeys(document, [
      'schema_version',
      'protocol_id',
      'policy_id',
      'cohort',
      'status',
      'selected_before_detector_results',
      'repositories',
    ]) ||
    document.schema_version !== '1.0.0' ||
    document.protocol_id !== 'cejel-llm-calibration-v1' ||
    typeof document.policy_id !== 'string' ||
    document.cohort !== expectedCohort ||
    document.status !== 'candidate_commit_freeze_pending' ||
    document.selected_before_detector_results !== true
  ) fail(`${expectedCohort} candidates: invalid candidate document`);
  return normalizedIds(document.repositories, `${expectedCohort} candidates`);
}

function validateProposal(input, label) {
  const { document } = input;
  assertNoContamination(document, `${label} proposal`, [
    'detector_results_seen',
    'source_accessed',
    'repository_source_cloned_or_labeled',
  ]);
  if (
    !hasExactKeys(document, [
      'schema_version',
      'reviewer_id',
      'generated_at',
      'search_mode',
      'detector_results_seen',
      'source_accessed',
      'repository_source_cloned_or_labeled',
      'repositories',
    ]) ||
    document.schema_version !== '1.0.0' ||
    document.search_mode !== 'github_repository_metadata_only' ||
    typeof document.reviewer_id !== 'string' || document.reviewer_id.trim().length < 3 ||
    Number.isNaN(Date.parse(document.generated_at))
  ) fail(`${label} proposal: invalid metadata-only proposal`);
  return {
    reviewerId: document.reviewer_id.trim(),
    identities: normalizedIds(document.repositories, `${label} proposal`),
  };
}

function sourceBinding(input, role, repositoryCount) {
  return {
    role,
    file_name: basename(input.path),
    byte_sha256: input.byteSha256,
    canonical_sha256: input.canonicalSha256,
    repository_count: repositoryCount,
  };
}

export function createCycleReset({
  priorReset,
  goldenCandidates,
  untouchedCandidates,
  proposalA,
  proposalB,
  cycle = 'v1.5',
  recordedAt,
}) {
  if (!/^v1\.[0-9]+$/.test(cycle) || cycle === 'v1.0') fail('cycle must match v1.N');
  if (
    typeof recordedAt !== 'string' ||
    !ISO_UTC_TIMESTAMP.test(recordedAt) ||
    Number.isNaN(Date.parse(recordedAt)) ||
    new Date(recordedAt).toISOString() !== recordedAt
  ) {
    fail('recordedAt must be an ISO timestamp');
  }
  const priorIds = validatePriorReset(priorReset);
  const goldenIds = validateCandidates(goldenCandidates, 'golden');
  const untouchedIds = validateCandidates(untouchedCandidates, 'untouched');
  const a = validateProposal(proposalA, 'proposal A');
  const b = validateProposal(proposalB, 'proposal B');
  if (a.reviewerId.toLowerCase() === b.reviewerId.toLowerCase()) {
    fail('proposal reviewers must be distinct');
  }
  const goldenSet = new Set(goldenIds);
  if (untouchedIds.some((identity) => goldenSet.has(identity))) {
    fail('golden and untouched candidate cohorts must be disjoint');
  }
  const identities = [...new Set([
    ...priorIds,
    ...goldenIds,
    ...untouchedIds,
    ...a.identities,
    ...b.identities,
  ])].sort(CODE_POINT_COMPARE);
  const document = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    cycle,
    record_type: 'pre_result_cycle_reset',
    recorded_at: recordedAt,
    detector_results_seen_for_new_cohorts: false,
    repository_source_or_labels_used_for_new_cohort_selection: false,
    prior_cycle: {
      cycle: priorReset.document.cycle,
      reset_byte_sha256: priorReset.byteSha256,
      reset_canonical_sha256: priorReset.canonicalSha256,
    },
    historical_exclusions: {
      repository_count: identities.length,
      repository_ids_sha256: sha256Canonical(identities),
      repository_ids: identities,
      source_bindings: [
        sourceBinding(priorReset, 'prior_reset', priorIds.length),
        sourceBinding(goldenCandidates, 'current_golden_candidates', goldenIds.length),
        sourceBinding(untouchedCandidates, 'current_untouched_candidates', untouchedIds.length),
        sourceBinding(proposalA, 'metadata_proposal_a', a.identities.length),
        sourceBinding(proposalB, 'metadata_proposal_b', b.identities.length),
      ],
    },
    selection_boundary: {
      current_golden_candidate_count: goldenIds.length,
      current_untouched_candidate_count: untouchedIds.length,
      metadata_proposals: [
        { reviewer_id: a.reviewerId, canonical_sha256: proposalA.canonicalSha256 },
        { reviewer_id: b.reviewerId, canonical_sha256: proposalB.canonicalSha256 },
      ],
      exact_union_rule: 'lowercase repository identity union across prior exclusions, current golden and untouched candidates, and both metadata-only proposals; sorted by Unicode code point',
      source_access_before_selection: false,
      detector_output_access_before_selection: false,
    },
  };
  return document;
}

export function writeCycleReset(output, document) {
  const target = resolve(output);
  const descriptor = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
  return target;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (!['--prior-reset', '--golden-candidates', '--untouched-candidates', '--proposal-a', '--proposal-b', '--output', '--cycle', '--recorded-at'].includes(argument)) {
      fail(`unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${argument} requires a value`);
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return `Usage: node calibration/llm/scripts/create-cycle-reset.mjs \\
  --prior-reset PATH --golden-candidates PATH --untouched-candidates PATH \\
  --proposal-a PATH --proposal-b PATH --recorded-at ISO --output PATH [--cycle v1.5]\n\n` +
    'Reads only JSON metadata documents, refuses contaminated inputs, and creates exactly one new output file.';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  for (const key of ['priorReset', 'goldenCandidates', 'untouchedCandidates', 'proposalA', 'proposalB', 'recordedAt', 'output']) {
    if (!options[key]) fail(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  const document = createCycleReset({
    priorReset: readDocument(options.priorReset, 'prior reset'),
    goldenCandidates: readDocument(options.goldenCandidates, 'golden candidates'),
    untouchedCandidates: readDocument(options.untouchedCandidates, 'untouched candidates'),
    proposalA: readDocument(options.proposalA, 'proposal A'),
    proposalB: readDocument(options.proposalB, 'proposal B'),
    cycle: options.cycle || 'v1.5',
    recordedAt: options.recordedAt,
  });
  const output = writeCycleReset(options.output, document);
  process.stdout.write(`${JSON.stringify({
    output: basename(output),
    cycle: document.cycle,
    historical_exclusion_count: document.historical_exclusions.repository_count,
    historical_exclusion_ids_sha256: document.historical_exclusions.repository_ids_sha256,
  })}\n`);
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
