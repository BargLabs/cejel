#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  linkSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
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
const codePointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function selectionCycle(policyId) {
  const match = /^llm-selection-(v1\.([2-9]|[1-9][0-9]+))$/.exec(policyId || '');
  if (!match) throw new Error('selection policy id must match llm-selection-v1.N for N >= 2');
  return {
    cycle: match[1],
    minor: Number.parseInt(match[2], 10),
    modern: Number.parseInt(match[2], 10) >= 4,
  };
}

function hasExactKeys(value, keys) {
  return (
    value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort(codePointCompare).join('\0') === [...keys].sort(codePointCompare).join('\0')
  );
}

function validateProposal(proposal, scope) {
  const generatedAtMs = Date.parse(proposal?.generated_at);
  if (
    !hasExactKeys(proposal, [
      'schema_version',
      'reviewer_id',
      'generated_at',
      'search_mode',
      'detector_results_seen',
      'source_accessed',
      'repository_source_cloned_or_labeled',
      'repositories',
    ]) ||
    proposal.schema_version !== '1.0.0' ||
    !proposal || typeof proposal.reviewer_id !== 'string' || proposal.reviewer_id.trim().length < 3 ||
    proposal.search_mode !== 'github_repository_metadata_only' || !Array.isArray(proposal.repositories) ||
    proposal.repositories.length < 40 || Number.isNaN(generatedAtMs) ||
    proposal.detector_results_seen !== false || proposal.source_accessed !== false ||
    proposal.repository_source_cloned_or_labeled !== false
  ) throw new Error(`${scope}: proposal is not a valid metadata-only independent search`);
  const repositories = new Map();
  for (const [index, repository] of proposal.repositories.entries()) {
    const evidence = repository?.metadata_evidence;
    const sizeKb = evidence?.size_kb;
    const key = String(repository?.repository_id || '').toLowerCase();
    if (
      !hasExactKeys(repository, [
        'repository_id',
        'url',
        'primary_language',
        'primary_surface',
        'provider_surface',
        'inclusion_reason',
        'metadata_evidence',
      ]) ||
      !hasExactKeys(evidence, ['archived', 'fork', 'default_branch', 'size_kb']) ||
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

function selectionHash(policyId, surface, repositoryId) {
  return sha256(Buffer.from(`${policyId}|${surface}|${repositoryId.toLowerCase()}`, 'utf8'));
}

function validateHistoricalExclusionLedger(ledger, expectedCycle) {
  const exclusions = ledger?.historical_exclusions;
  if (
    ledger?.schema_version !== '1.0.0' ||
    ledger?.protocol_id !== 'cejel-llm-calibration-v1' ||
    ledger?.cycle !== expectedCycle ||
    ledger?.record_type !== 'pre_result_cycle_reset' ||
    ledger?.detector_results_seen_for_new_cohorts !== false ||
    ledger?.repository_source_or_labels_used_for_new_cohort_selection !== false ||
    !exclusions ||
    !Array.isArray(exclusions.repository_ids) ||
    !Number.isInteger(exclusions.repository_count) ||
    !/^[a-f0-9]{64}$/.test(exclusions.repository_ids_sha256 || '')
  ) throw new Error(`${expectedCycle} selection requires a valid pre-result historical exclusion ledger`);
  const normalized = exclusions.repository_ids.map((identity) => String(identity).toLowerCase());
  if (
    normalized.length !== exclusions.repository_count ||
    new Set(normalized).size !== normalized.length ||
    normalized.some((identity, index) => identity !== exclusions.repository_ids[index]) ||
    [...normalized].sort(codePointCompare).some((identity, index) => identity !== normalized[index]) ||
    sha256Canonical(normalized) !== exclusions.repository_ids_sha256
  ) throw new Error(`${expectedCycle} historical exclusion identities are incomplete or non-canonical`);
  return new Set(normalized);
}

function validateSiblingCandidate(document, policyId) {
  if (
    document?.schema_version !== '1.0.0' ||
    document?.protocol_id !== 'cejel-llm-calibration-v1' ||
    document?.policy_id !== policyId ||
    document?.cohort !== 'golden' ||
    document?.status !== 'candidate_commit_freeze_pending' ||
    document?.selected_before_detector_results !== true ||
    !Array.isArray(document?.repositories) ||
    document.repositories.length !== 24
  ) throw new Error('modern untouched selection requires the exact fresh golden candidate document');
  const identities = document.repositories.map((repository) =>
    String(repository?.repository_id || '').toLowerCase());
  if (
    identities.some((identity) => !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(identity)) ||
    new Set(identities).size !== identities.length
  ) throw new Error('modern golden sibling candidate identities are invalid');
  return new Set(identities);
}

function validateSiblingSelectionRecord(record, candidateDocument, historicalLedgerSha256, policyId) {
  const recordWithoutHash = { ...record };
  delete recordWithoutHash.record_sha256;
  if (
    record?.schema_version !== '1.0.0' ||
    record?.protocol_id !== 'cejel-llm-calibration-v1' ||
    record?.policy_id !== policyId ||
    record?.cohort !== 'golden' ||
    record?.detector_results_seen !== false ||
    record?.source_or_labels_used_for_selection !== false ||
    record?.selection_evidence_record_sha256 !== historicalLedgerSha256 ||
    record?.historical_exclusion_ledger_sha256 !== historicalLedgerSha256 ||
    record?.candidate_document_sha256 !== sha256Canonical(candidateDocument) ||
    record?.record_sha256 !== sha256Canonical(recordWithoutHash)
  ) throw new Error('modern untouched selection requires the valid golden sibling selection record');
}

function constrainedSelection(pool, compare) {
  const providerBit = (provider) => {
    const index = REQUIRED_PROVIDERS.indexOf(provider);
    return index === -1 ? 0 : 1 << index;
  };
  const capLanguage = (language, count) =>
    Math.min(count, language === 'typescript_javascript' ? 4 : language === 'python' ? 8 : 0);
  const listCompare = (left, right) => {
    const a = [...left].sort(compare);
    const b = [...right].sort(compare);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const order = compare(a[index], b[index]);
      if (order !== 0) return order;
    }
    return a.length - b.length;
  };
  const retainBest = (states, key, candidate) => {
    const current = states.get(key);
    if (!current || listCompare(candidate.entries, current.entries) < 0) states.set(key, candidate);
  };
  const surfaceOptions = new Map();
  for (const [surface, target] of Object.entries(SURFACE_TARGETS)) {
    const candidates = pool.filter((entry) => entry.candidate.primary_surface === surface);
    let states = new Map([['0|0|0|0', {
      count: 0,
      providerMask: 0,
      typescriptCount: 0,
      pythonCount: 0,
      entries: [],
    }]]);
    for (const entry of candidates) {
      const next = new Map(states);
      for (const state of states.values()) {
        if (state.count >= target) continue;
        const candidate = {
          count: state.count + 1,
          providerMask: state.providerMask | providerBit(entry.candidate.provider_surface),
          typescriptCount: capLanguage(
            'typescript_javascript',
            state.typescriptCount + Number(entry.candidate.primary_language === 'typescript_javascript'),
          ),
          pythonCount: capLanguage(
            'python',
            state.pythonCount + Number(entry.candidate.primary_language === 'python'),
          ),
          entries: [...state.entries, entry],
        };
        const key = [
          candidate.count,
          candidate.providerMask,
          candidate.typescriptCount,
          candidate.pythonCount,
        ].join('|');
        retainBest(next, key, candidate);
      }
      states = next;
    }
    const options = [...states.values()].filter((state) => state.count === target);
    if (options.length === 0) throw new Error(`replacement pool cannot fill ${surface} quota`);
    surfaceOptions.set(surface, options);
  }
  let combined = new Map([['0|0|0', {
    providerMask: 0,
    typescriptCount: 0,
    pythonCount: 0,
    entries: [],
  }]]);
  for (const surface of Object.keys(SURFACE_TARGETS)) {
    const next = new Map();
    for (const state of combined.values()) {
      for (const option of surfaceOptions.get(surface)) {
        const candidate = {
          providerMask: state.providerMask | option.providerMask,
          typescriptCount: capLanguage(
            'typescript_javascript',
            state.typescriptCount + option.typescriptCount,
          ),
          pythonCount: capLanguage('python', state.pythonCount + option.pythonCount),
          entries: [...state.entries, ...option.entries],
        };
        const key = [
          candidate.providerMask,
          candidate.typescriptCount,
          candidate.pythonCount,
        ].join('|');
        retainBest(next, key, candidate);
      }
    }
    combined = next;
  }
  const allProviders = (1 << REQUIRED_PROVIDERS.length) - 1;
  const selected = combined.get(`${allProviders}|4|8`)?.entries;
  if (!selected) {
    throw new Error('replacement pool cannot satisfy provider and language constraints with exact surface quotas');
  }
  return selected;
}

export function selectReplacementCohort({
  proposalA,
  proposalB,
  excludedIds,
  selectedAt,
  selectorSourceSha256,
  incidentRecordSha256,
  policyId = POLICY_ID,
  selectionEventId = 'untouched-blinding-incident-2026-07-22',
  cohort = 'untouched',
  historicalExclusionLedger,
  historicalExclusionLedgerSha256,
  siblingCandidateDocument,
  siblingCandidateDocumentSha256,
  siblingSelectionRecord,
  siblingSelectionRecordSha256,
}) {
  if (!['golden', 'untouched'].includes(cohort)) {
    throw new Error('replacement cohort must be golden or untouched');
  }
  const policyCycle = selectionCycle(policyId);
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
  if (policyCycle.modern) {
    if (!/^[a-f0-9]{64}$/.test(historicalExclusionLedgerSha256 || '')) {
      throw new Error(`${policyCycle.cycle} selection requires the byte hash of its historical exclusion ledger`);
    }
    if (incidentRecordSha256 !== historicalExclusionLedgerSha256) {
      throw new Error(`${policyCycle.cycle} selection evidence must be the exact historical exclusion ledger`);
    }
    const historical = validateHistoricalExclusionLedger(
      historicalExclusionLedger,
      policyCycle.cycle,
    );
    const expected = new Set(historical);
    if (cohort === 'untouched') {
      if (
        !/^[a-f0-9]{64}$/.test(siblingCandidateDocumentSha256 || '') ||
        !/^[a-f0-9]{64}$/.test(siblingSelectionRecordSha256 || '')
      ) {
        throw new Error('modern untouched selection requires byte hashes for its golden sibling artifacts');
      }
      validateSiblingSelectionRecord(
        siblingSelectionRecord,
        siblingCandidateDocument,
        historicalExclusionLedgerSha256,
        policyId,
      );
      for (const identity of validateSiblingCandidate(siblingCandidateDocument, policyId)) {
        expected.add(identity);
      }
    } else if (
      siblingCandidateDocument ||
      siblingCandidateDocumentSha256 ||
      siblingSelectionRecord ||
      siblingSelectionRecordSha256
    ) {
      throw new Error('modern golden selection cannot bind a sibling candidate');
    }
    if (
      exclusions.size !== expected.size ||
      [...expected].some((identity) => !exclusions.has(identity))
    ) throw new Error('modern exclusions must exactly match the historical ledger and golden sibling');
  }
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
      ? (codePointCompare(left.reviewerId, right.reviewerId) <= 0 ? a : b)
      : records[0];
    const candidate = normalizedCandidate(source);
    pool.push({
      candidate,
      tier: records.length === 2 ? 0 : 1,
      selection_hash: selectionHash(policyId, candidate.primary_surface, candidate.repository_id),
      proposed_by: records.length === 2
        ? [left.reviewerId, right.reviewerId].sort(codePointCompare)
        : [a ? left.reviewerId : right.reviewerId],
    });
  }
  const compare = (a, b) =>
    a.tier - b.tier || codePointCompare(a.selection_hash, b.selection_hash) ||
    codePointCompare(a.candidate.repository_id, b.candidate.repository_id);
  pool.sort(compare);
  const selected = constrainedSelection(pool, compare);
  const surfaceOrder = new Map(Object.keys(SURFACE_TARGETS).map((surface, index) => [surface, index]));
  selected.sort((a, b) =>
    surfaceOrder.get(a.candidate.primary_surface) - surfaceOrder.get(b.candidate.primary_surface) || compare(a, b));
  const candidateDocument = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    policy_id: policyId,
    cohort,
    status: 'candidate_commit_freeze_pending',
    selected_before_detector_results: true,
    repositories: selected.map((entry) => entry.candidate),
  };
  const recordWithoutHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    policy_id: policyId,
    ...(policyId === POLICY_ID
      ? { incident_id: selectionEventId }
      : { selection_event_id: selectionEventId, cohort }),
    selected_at: selectedAt,
    detector_results_seen: false,
    source_or_labels_used_for_selection: false,
    algorithm: 'exact-surface dynamic constraint selection with required-provider mask and capped language minima; tier=dual-identical-before-single; sha256(policy|surface|lowercase-repository)',
    selector_source_sha256: selectorSourceSha256,
    ...(policyId === POLICY_ID
      ? { incident_record_sha256: incidentRecordSha256 }
      : { selection_evidence_record_sha256: incidentRecordSha256 }),
    surface_targets: SURFACE_TARGETS,
    required_provider_surfaces: REQUIRED_PROVIDERS,
    ...(policyCycle.modern
      ? {
        historical_exclusion_ledger_sha256: historicalExclusionLedgerSha256,
        ...(cohort === 'untouched'
          ? {
            golden_sibling_candidate_sha256: siblingCandidateDocumentSha256,
            golden_sibling_selection_record_sha256: siblingSelectionRecordSha256,
          }
          : {}),
      }
      : {}),
    proposal_bindings: [
      { reviewer_id: left.reviewerId, document_sha256: sha256Canonical(proposalA) },
      { reviewer_id: right.reviewerId, document_sha256: sha256Canonical(proposalB) },
    ].sort((a, b) => codePointCompare(a.reviewer_id, b.reviewer_id)),
    excluded_repository_count: exclusions.size,
    excluded_repository_ids_sha256: sha256Canonical([...exclusions].sort(codePointCompare)),
    classification_conflicts_excluded: classificationConflicts.sort(codePointCompare),
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

function writeTemporary(path, document) {
  const temporaryPath = resolve(
    dirname(path),
    `.${basename(path)}.${process.pid}.${sha256(Buffer.from(path)).slice(0, 12)}.tmp`,
  );
  const descriptor = openSync(temporaryPath, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } catch (error) {
    closeSync(descriptor);
    removeIfPresent(temporaryPath);
    throw error;
  }
  try {
    closeSync(descriptor);
  } catch (error) {
    removeIfPresent(temporaryPath);
    throw error;
  }
  return temporaryPath;
}

function removeIfPresent(path) {
  if (path && existsSync(path)) unlinkSync(path);
}

export function writeSelectionPair(candidatePath, candidateDocument, recordPath, selectionRecord) {
  if (existsSync(candidatePath) || existsSync(recordPath)) {
    throw new Error('selection outputs already exist; refusing a partial or overwrite publication');
  }
  let candidateTemporary;
  let recordTemporary;
  let recordPublished = false;
  let candidatePublished = false;
  try {
    candidateTemporary = writeTemporary(candidatePath, candidateDocument);
    recordTemporary = writeTemporary(recordPath, selectionRecord);
    linkSync(recordTemporary, recordPath);
    recordPublished = true;
    linkSync(candidateTemporary, candidatePath);
    candidatePublished = true;
    removeIfPresent(recordTemporary);
    removeIfPresent(candidateTemporary);
  } catch (error) {
    removeIfPresent(candidateTemporary);
    removeIfPresent(recordTemporary);
    if (recordPublished) removeIfPresent(recordPath);
    if (candidatePublished) removeIfPresent(candidatePath);
    throw error;
  }
}

export function main(argv) {
  const options = parseArgs(argv);
  for (const key of [
    'proposal_a', 'proposal_b', 'selected_at',
    'candidate_output', 'record_output',
  ]) {
    if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  }
  const read = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));
  const proposalA = read(options.proposal_a);
  const proposalB = read(options.proposal_b);
  const policyId = options.policy_id || POLICY_ID;
  const policyCycle = selectionCycle(policyId);
  const cohort = options.cohort || 'untouched';
  const excludedIds = new Set();
  let historicalExclusionLedger;
  let historicalExclusionLedgerSha256;
  let siblingCandidateDocument;
  let siblingCandidateDocumentSha256;
  let siblingSelectionRecord;
  let siblingSelectionRecordSha256;
  if (policyCycle.modern) {
    if (!options.exclusion_ledger) {
      throw new Error(`--exclusion-ledger is required for ${policyCycle.cycle}`);
    }
    const ledgerPath = resolve(options.exclusion_ledger);
    const ledgerBytes = readFileSync(ledgerPath);
    historicalExclusionLedger = JSON.parse(ledgerBytes);
    historicalExclusionLedgerSha256 = sha256(ledgerBytes);
    for (const identity of historicalExclusionLedger?.historical_exclusions?.repository_ids || []) {
      excludedIds.add(identity);
    }
    if (cohort === 'untouched') {
      if (!options.sibling_candidate) {
        throw new Error('--sibling-candidate is required for modern untouched selection');
      }
      if (!options.sibling_selection_record) {
        throw new Error('--sibling-selection-record is required for modern untouched selection');
      }
      const siblingBytes = readFileSync(resolve(options.sibling_candidate));
      siblingCandidateDocument = JSON.parse(siblingBytes);
      siblingCandidateDocumentSha256 = sha256(siblingBytes);
      const siblingRecordBytes = readFileSync(resolve(options.sibling_selection_record));
      siblingSelectionRecord = JSON.parse(siblingRecordBytes);
      siblingSelectionRecordSha256 = sha256(siblingRecordBytes);
      for (const repository of siblingCandidateDocument.repositories || []) {
        excludedIds.add(repository.repository_id);
      }
    }
  } else {
    if (!options.incident_record) throw new Error('--incident-record is required');
    if (!options.exclude_files) throw new Error('--exclude-files is required');
    for (const path of options.exclude_files.split(',')) {
      for (const repository of read(path).repositories || []) excludedIds.add(repository.repository_id);
    }
  }
  const result = selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds,
    selectedAt: options.selected_at,
    selectorSourceSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    incidentRecordSha256: policyCycle.modern
      ? historicalExclusionLedgerSha256
      : sha256(readFileSync(resolve(options.incident_record))),
    policyId,
    selectionEventId: options.selection_event_id ||
      (policyCycle.modern
        ? `${policyCycle.cycle}-pre-result-cycle-reset`
        : 'untouched-blinding-incident-2026-07-22'),
    cohort,
    historicalExclusionLedger,
    historicalExclusionLedgerSha256,
    siblingCandidateDocument,
    siblingCandidateDocumentSha256,
    siblingSelectionRecord,
    siblingSelectionRecordSha256,
  });
  writeSelectionPair(
    resolve(options.candidate_output),
    result.candidateDocument,
    resolve(options.record_output),
    result.selectionRecord,
  );
  console.log(JSON.stringify({
    status: `replacement_${result.candidateDocument.cohort}_candidates_selected`,
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
