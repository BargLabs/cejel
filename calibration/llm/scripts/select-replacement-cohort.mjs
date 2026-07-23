#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const POLICY_ID = 'llm-selection-v1.2';
const SURFACE_TARGETS = {
  gateway: 1,
  chat_app: 3,
  local_model: 3,
  rag: 4,
  agent_tools: 6,
  evaluation_or_framework: 7,
};
const REQUIRED_PROVIDERS = ['anthropic', 'openai', 'local_or_open_model'];
const LANGUAGES = new Set(['typescript_javascript', 'python', 'mixed']);
const PROVIDERS = new Set(['openai', 'anthropic', 'multi_provider', 'local_or_open_model']);
const SURFACES = new Set(Object.keys(SURFACE_TARGETS));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha256Canonical = (document) => sha256(Buffer.from(canonicalize(document), 'utf8'));

function validateProposal(proposal, scope) {
  const generatedAtMs = Date.parse(proposal?.generated_at);
  const detectorBlind = proposal?.detector_results_seen === false || proposal?.detector_accessed === false;
  const sourceBlind = proposal?.source_accessed === false ||
    proposal?.repository_source_cloned_or_labeled === false;
  if (
    !proposal || typeof proposal.reviewer_id !== 'string' || proposal.reviewer_id.trim().length < 3 ||
    !String(proposal.search_mode || '').includes('metadata') || !Array.isArray(proposal.repositories) ||
    proposal.repositories.length < 40 || Number.isNaN(generatedAtMs) || !detectorBlind || !sourceBlind ||
    proposal.detector_results_seen === true || proposal.detector_accessed === true ||
    proposal.source_accessed === true || proposal.repository_source_cloned_or_labeled === true
  ) throw new Error(`${scope}: proposal is not a valid metadata-only independent search`);
  const repositories = new Map();
  for (const [index, repository] of proposal.repositories.entries()) {
    const evidence = repository?.metadata_evidence;
    const sizeKb = evidence?.size_kb ?? evidence?.size;
    const key = String(repository?.repository_id || '').toLowerCase();
    if (
      !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository?.repository_id || '') ||
      repository.url !== `https://github.com/${repository.repository_id}` ||
      !LANGUAGES.has(repository.primary_language) || !SURFACES.has(repository.primary_surface) ||
      !PROVIDERS.has(repository.provider_surface) ||
      typeof repository.inclusion_reason !== 'string' || repository.inclusion_reason.length < 20 ||
      !evidence || evidence.archived !== false || evidence.fork !== false ||
      typeof evidence.default_branch !== 'string' || evidence.default_branch.length < 1 ||
      !Number.isFinite(sizeKb) || sizeKb < 0 || sizeKb > 4 * 1024 * 1024 ||
      repositories.has(key)
    ) throw new Error(`${scope}: invalid or duplicated repository ${index}`);
    repositories.set(key, repository);
  }
  return { reviewerId: proposal.reviewer_id.trim(), repositories, generatedAtMs };
}

function normalizedCandidate(repository) {
  return {
    repository_id: repository.repository_id,
    url: repository.url,
    primary_language: repository.primary_language,
    primary_surface: repository.primary_surface,
    provider_surface: repository.provider_surface,
    inclusion_reason: repository.inclusion_reason,
  };
}

function classification(candidate) {
  return canonicalize({
    url: candidate.url,
    primary_language: candidate.primary_language,
    primary_surface: candidate.primary_surface,
    provider_surface: candidate.provider_surface,
  });
}

function selectionHash(surface, repositoryId) {
  return sha256(Buffer.from(`${POLICY_ID}|${surface}|${repositoryId.toLowerCase()}`, 'utf8'));
}

export function selectReplacementCohort({
  proposalA,
  proposalB,
  excludedIds,
  selectedAt,
  selectorSourceSha256,
  incidentRecordSha256,
}) {
  const left = validateProposal(proposalA, 'proposal A');
  const right = validateProposal(proposalB, 'proposal B');
  if (left.reviewerId.toLowerCase() === right.reviewerId.toLowerCase()) {
    throw new Error('replacement search requires two distinct reviewer identities');
  }
  const selectedAtMs = Date.parse(selectedAt);
  if (
    Number.isNaN(selectedAtMs) || selectedAtMs > Date.now() + 60_000 ||
    selectedAtMs < Math.max(left.generatedAtMs, right.generatedAtMs) ||
    !/^[a-f0-9]{64}$/.test(selectorSourceSha256 || '') ||
    !/^[a-f0-9]{64}$/.test(incidentRecordSha256 || '')
  ) {
    throw new Error('replacement selection time is invalid');
  }
  const exclusions = new Set([...excludedIds].map((id) => String(id).toLowerCase()));
  const identities = new Set([...left.repositories.keys(), ...right.repositories.keys()]);
  const pool = [];
  const classificationConflicts = [];
  for (const identity of identities) {
    if (exclusions.has(identity)) continue;
    const a = left.repositories.get(identity);
    const b = right.repositories.get(identity);
    if (a && b && classification(a) !== classification(b)) {
      classificationConflicts.push(identity);
      continue;
    }
    const records = [a, b].filter(Boolean);
    const source = records.length === 2
      ? (left.reviewerId.localeCompare(right.reviewerId) <= 0 ? a : b)
      : records[0];
    const candidate = normalizedCandidate(source);
    pool.push({
      candidate,
      tier: records.length === 2 ? 0 : 1,
      selection_hash: selectionHash(candidate.primary_surface, candidate.repository_id),
      proposed_by: records.length === 2
        ? [left.reviewerId, right.reviewerId].sort()
        : [a ? left.reviewerId : right.reviewerId],
    });
  }
  const compare = (a, b) =>
    a.tier - b.tier || a.selection_hash.localeCompare(b.selection_hash) ||
    a.candidate.repository_id.localeCompare(b.candidate.repository_id);
  pool.sort(compare);
  const remaining = { ...SURFACE_TARGETS };
  const selected = [];
  const selectedIds = new Set();
  const add = (entry) => {
    selected.push(entry);
    selectedIds.add(entry.candidate.repository_id.toLowerCase());
    remaining[entry.candidate.primary_surface] -= 1;
  };
  for (const provider of REQUIRED_PROVIDERS) {
    const entry = pool.find((candidate) =>
      candidate.candidate.provider_surface === provider &&
      remaining[candidate.candidate.primary_surface] > 0 &&
      !selectedIds.has(candidate.candidate.repository_id.toLowerCase()));
    if (!entry) throw new Error(`replacement pool cannot preserve required ${provider} provider coverage`);
    add(entry);
  }
  for (const surface of Object.keys(SURFACE_TARGETS)) {
    for (const entry of pool.filter((candidate) => candidate.candidate.primary_surface === surface)) {
      if (remaining[surface] === 0) break;
      if (!selectedIds.has(entry.candidate.repository_id.toLowerCase())) add(entry);
    }
    if (remaining[surface] !== 0) throw new Error(`replacement pool cannot fill ${surface} quota`);
  }
  const byLanguage = Object.fromEntries([...LANGUAGES].map((language) => [
    language,
    selected.filter((entry) => entry.candidate.primary_language === language).length,
  ]));
  if (byLanguage.typescript_javascript < 4 || byLanguage.python < 8) {
    throw new Error('deterministic selection does not preserve minimum TypeScript/Python representation');
  }
  const surfaceOrder = new Map(Object.keys(SURFACE_TARGETS).map((surface, index) => [surface, index]));
  selected.sort((a, b) =>
    surfaceOrder.get(a.candidate.primary_surface) - surfaceOrder.get(b.candidate.primary_surface) || compare(a, b));
  const candidateDocument = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    policy_id: POLICY_ID,
    cohort: 'untouched',
    status: 'candidate_commit_freeze_pending',
    selected_before_detector_results: true,
    repositories: selected.map((entry) => entry.candidate),
  };
  const recordWithoutHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    policy_id: POLICY_ID,
    incident_id: 'untouched-blinding-incident-2026-07-22',
    selected_at: selectedAt,
    detector_results_seen: false,
    source_or_labels_used_for_selection: false,
    algorithm: 'provider-seed-then-surface-quota; tier=dual-identical-before-single; sha256(policy|surface|lowercase-repository)',
    selector_source_sha256: selectorSourceSha256,
    incident_record_sha256: incidentRecordSha256,
    surface_targets: SURFACE_TARGETS,
    required_provider_surfaces: REQUIRED_PROVIDERS,
    proposal_bindings: [
      { reviewer_id: left.reviewerId, document_sha256: sha256Canonical(proposalA) },
      { reviewer_id: right.reviewerId, document_sha256: sha256Canonical(proposalB) },
    ].sort((a, b) => a.reviewer_id.localeCompare(b.reviewer_id)),
    excluded_repository_count: exclusions.size,
    excluded_repository_ids_sha256: sha256Canonical([...exclusions].sort()),
    classification_conflicts_excluded: classificationConflicts.sort(),
    selected: selected.map((entry) => ({
      repository_id: entry.candidate.repository_id,
      tier: entry.tier,
      selection_hash: entry.selection_hash,
      proposed_by: entry.proposed_by,
    })),
    candidate_document_sha256: sha256Canonical(candidateDocument),
  };
  return {
    candidateDocument,
    selectionRecord: { ...recordWithoutHash, record_sha256: sha256Canonical(recordWithoutHash) },
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '').replaceAll('-', '_');
    const value = argv[index + 1];
    if (!key || !value) throw new Error('every selection option requires a value');
    options[key] = value;
  }
  return options;
}

function writeNew(path, document) {
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

export function main(argv) {
  const options = parseArgs(argv);
  for (const key of [
    'proposal_a', 'proposal_b', 'exclude_files', 'incident_record', 'selected_at',
    'candidate_output', 'record_output',
  ]) {
    if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  }
  const read = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));
  const proposalA = read(options.proposal_a);
  const proposalB = read(options.proposal_b);
  const excludedIds = new Set();
  for (const path of options.exclude_files.split(',')) {
    for (const repository of read(path).repositories || []) excludedIds.add(repository.repository_id);
  }
  const result = selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds,
    selectedAt: options.selected_at,
    selectorSourceSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    incidentRecordSha256: sha256(readFileSync(resolve(options.incident_record))),
  });
  writeNew(resolve(options.candidate_output), result.candidateDocument);
  writeNew(resolve(options.record_output), result.selectionRecord);
  console.log(JSON.stringify({
    status: 'replacement_untouched_candidates_selected',
    repositories: result.candidateDocument.repositories.length,
    selection_record_sha256: result.selectionRecord.record_sha256,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
