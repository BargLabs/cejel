import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  selectReplacementCohort,
  writeSelectionPair,
} from './select-replacement-cohort.mjs';

const targets = {
  gateway: 4,
  chat_app: 6,
  local_model: 6,
  rag: 8,
  agent_tools: 12,
  evaluation_or_framework: 14,
};

function proposal(reviewerId, suffix) {
  const repositories = [];
  let serial = 0;
  for (const [surface, count] of Object.entries(targets)) {
    for (let index = 0; index < count; index += 1) {
      serial += 1;
      const provider = surface === 'gateway' && index === 0
        ? 'anthropic'
        : surface === 'chat_app' && index === 0
          ? 'openai'
          : surface === 'local_model'
            ? 'local_or_open_model'
            : 'multi_provider';
      const repositoryId = `fixture${suffix}/repo-${surface}-${String(index).padStart(2, '0')}`;
      repositories.push({
        repository_id: repositoryId,
        url: `https://github.com/${repositoryId}`,
        primary_language: serial % 3 === 0 ? 'typescript_javascript' : 'python',
        primary_surface: surface,
        provider_surface: provider,
        inclusion_reason: `Metadata-only replacement fixture for the ${surface} selection stratum.`,
        metadata_evidence: {
          archived: false,
          fork: false,
          default_branch: 'main',
          size_kb: 100,
        },
      });
    }
  }
  return {
    schema_version: '1.0.0',
    reviewer_id: reviewerId,
    search_mode: 'github_repository_metadata_only',
    detector_results_seen: false,
    source_accessed: false,
    repository_source_cloned_or_labeled: false,
    generated_at: '2026-07-23T04:20:00.000Z',
    repositories,
  };
}

function historicalLedger(repositoryIds = []) {
  const normalized = [...repositoryIds].map((identity) => identity.toLowerCase()).sort();
  return {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    cycle: 'v1.4',
    record_type: 'pre_result_cycle_reset',
    detector_results_seen_for_new_cohorts: false,
    repository_source_or_labels_used_for_new_cohort_selection: false,
    historical_exclusions: {
      repository_count: normalized.length,
      repository_ids_sha256: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
      repository_ids: normalized,
    },
  };
}

function fixtureHash(policyId, surface, repositoryId) {
  return createHash('sha256')
    .update(`${policyId}|${surface}|${repositoryId.toLowerCase()}`)
    .digest('hex');
}

test('deterministically preserves surface quotas and required provider strata', () => {
  const proposalA = proposal('codex-metadata-review-a', 'a');
  const proposalB = proposal('codex-metadata-review-b', 'b');
  const input = {
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
  };
  const first = selectReplacementCohort(input);
  const second = selectReplacementCohort(input);
  assert.deepEqual(first, second);
  assert.equal(first.candidateDocument.repositories.length, 24);
  for (const [surface, expected] of Object.entries({
    gateway: 1,
    chat_app: 3,
    local_model: 3,
    rag: 4,
    agent_tools: 6,
    evaluation_or_framework: 7,
  })) {
    assert.equal(
      first.candidateDocument.repositories.filter((repository) =>
        repository.primary_surface === surface).length,
      expected,
    );
  }
  for (const provider of ['anthropic', 'openai', 'local_or_open_model']) {
    assert.ok(first.candidateDocument.repositories.some((repository) =>
      repository.provider_surface === provider));
  }
  assert.match(first.selectionRecord.record_sha256, /^[a-f0-9]{64}$/);
});

test('rejects non-metadata review, duplicate identity, and insufficient provider coverage', () => {
  const proposalA = proposal('codex-metadata-review-a', 'a');
  const proposalB = proposal('codex-metadata-review-b', 'b');
  proposalA.source_accessed = true;
  assert.throws(() => selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
  }), /metadata-only/);
  proposalA.source_accessed = false;
  proposalA.repositories.push(proposalA.repositories[0]);
  assert.throws(() => selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
  }), /duplicated repository/);
  proposalA.repositories.pop();
  for (const candidate of [...proposalA.repositories, ...proposalB.repositories]) {
    if (candidate.provider_surface === 'anthropic') candidate.provider_surface = 'multi_provider';
  }
  assert.throws(() => selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
  }), /provider and language constraints/);
});

test('preserves the legacy v1.2 audit record shape and supports a fresh v1.3 shape', () => {
  const proposalA = proposal('codex-metadata-review-a', 'a');
  const proposalB = proposal('codex-metadata-review-b', 'b');
  const legacy = selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
  });
  assert.deepEqual(Object.keys(legacy.candidateDocument), [
    'schema_version',
    'protocol_id',
    'policy_id',
    'cohort',
    'status',
    'selected_before_detector_results',
    'repositories',
  ]);
  assert.equal(legacy.candidateDocument.policy_id, 'llm-selection-v1.2');
  assert.equal(legacy.candidateDocument.cohort, 'untouched');
  assert.equal(legacy.selectionRecord.incident_id, 'untouched-blinding-incident-2026-07-22');
  assert.equal(legacy.selectionRecord.incident_record_sha256, 'b'.repeat(64));
  assert.equal('cohort' in legacy.selectionRecord, false);
  assert.equal('selection_event_id' in legacy.selectionRecord, false);
  const result = selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
    policyId: 'llm-selection-v1.3',
    selectionEventId: 'v1.3-fresh-untouched-cohort',
  });
  assert.equal(result.candidateDocument.policy_id, 'llm-selection-v1.3');
  assert.equal(result.selectionRecord.policy_id, 'llm-selection-v1.3');
  assert.equal(result.selectionRecord.selection_event_id, 'v1.3-fresh-untouched-cohort');
  assert.equal(result.selectionRecord.selection_evidence_record_sha256, 'b'.repeat(64));
  assert.equal('incident_id' in result.selectionRecord, false);
  assert.equal('incident_record_sha256' in result.selectionRecord, false);
});

test('selects fresh golden and untouched cohorts from one pre-result pool without overlap', () => {
  const proposalA = proposal('codex-metadata-review-a', 'a');
  const proposalB = proposal('codex-metadata-review-b', 'b');
  const common = {
    proposalA,
    proposalB,
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
    policyId: 'llm-selection-v1.4',
    historicalExclusionLedger: historicalLedger(),
    historicalExclusionLedgerSha256: 'c'.repeat(64),
  };
  const golden = selectReplacementCohort({
    ...common,
    excludedIds: new Set(),
    selectionEventId: 'v1.4-fresh-golden-cohort',
    cohort: 'golden',
  });
  const goldenIds = new Set(
    golden.candidateDocument.repositories.map((repository) => repository.repository_id.toLowerCase()),
  );
  const untouched = selectReplacementCohort({
    ...common,
    excludedIds: goldenIds,
    selectionEventId: 'v1.4-fresh-untouched-cohort',
    cohort: 'untouched',
    siblingCandidateDocument: golden.candidateDocument,
    siblingCandidateDocumentSha256: 'd'.repeat(64),
    siblingSelectionRecord: golden.selectionRecord,
    siblingSelectionRecordSha256: 'e'.repeat(64),
  });
  assert.equal(golden.candidateDocument.cohort, 'golden');
  assert.equal(golden.selectionRecord.cohort, 'golden');
  assert.equal(untouched.candidateDocument.cohort, 'untouched');
  assert.equal(untouched.selectionRecord.cohort, 'untouched');
  assert.equal(untouched.candidateDocument.repositories.length, 24);
  for (const cohort of [golden, untouched]) {
    assert.ok(cohort.candidateDocument.repositories.filter((repository) =>
      repository.primary_language === 'typescript_javascript').length >= 4);
    assert.ok(cohort.candidateDocument.repositories.filter((repository) =>
      repository.primary_language === 'python').length >= 8);
    for (const provider of ['anthropic', 'openai', 'local_or_open_model']) {
      assert.ok(cohort.candidateDocument.repositories.some((repository) =>
        repository.provider_surface === provider));
    }
  }
  assert.equal(
    untouched.candidateDocument.repositories.some((repository) =>
      goldenIds.has(repository.repository_id.toLowerCase())),
    false,
  );
});

test('v1.4 rejects incomplete historical exclusions and a missing golden sibling binding', () => {
  const common = {
    proposalA: proposal('codex-metadata-review-a', 'a'),
    proposalB: proposal('codex-metadata-review-b', 'b'),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
    policyId: 'llm-selection-v1.4',
    historicalExclusionLedger: historicalLedger(['prior/repository']),
    historicalExclusionLedgerSha256: 'c'.repeat(64),
  };
  assert.throws(() => selectReplacementCohort({
    ...common,
    excludedIds: new Set(),
    cohort: 'golden',
  }), /exactly match/);
  assert.throws(() => selectReplacementCohort({
    ...common,
    excludedIds: new Set(['prior/repository']),
    cohort: 'untouched',
  }), /golden sibling/);
});

test('constraint selection finds feasible provider placement that provider-first greedy misses', () => {
  const policyId = 'llm-selection-v1.3';
  const proposalA = proposal('codex-metadata-review-a', 'a');
  const proposalB = proposal('codex-metadata-review-b', 'b');
  const repositories = [...proposalA.repositories, ...proposalB.repositories];
  for (const repository of repositories) repository.provider_surface = 'multi_provider';
  const gateway = repositories
    .filter((repository) => repository.primary_surface === 'gateway')
    .sort((left, right) =>
      fixtureHash(policyId, 'gateway', left.repository_id)
        .localeCompare(fixtureHash(policyId, 'gateway', right.repository_id)));
  gateway[0].provider_surface = 'anthropic';
  gateway[1].provider_surface = 'openai';
  repositories.find((repository) => repository.primary_surface === 'chat_app').provider_surface = 'anthropic';
  repositories.find((repository) => repository.primary_surface === 'local_model').provider_surface =
    'local_or_open_model';
  const result = selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
    policyId,
  });
  for (const provider of ['anthropic', 'openai', 'local_or_open_model']) {
    assert.ok(result.candidateDocument.repositories.some((repository) =>
      repository.provider_surface === provider));
  }
});

test('rejects ambiguous metadata mode and unapproved proposal fields', () => {
  const proposalA = proposal('codex-metadata-review-a', 'a');
  const proposalB = proposal('codex-metadata-review-b', 'b');
  proposalA.search_mode = 'metadata_plus_source';
  assert.throws(() => selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
  }), /metadata-only/);
  proposalA.search_mode = 'github_repository_metadata_only';
  proposalA.detector_accessed = false;
  assert.throws(() => selectReplacementCohort({
    proposalA,
    proposalB,
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
  }), /metadata-only/);
});

test('publishes the candidate and record together without overwriting either target', () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-selection-pair-'));
  try {
    const candidatePath = join(root, 'candidate.json');
    const recordPath = join(root, 'record.json');
    writeSelectionPair(candidatePath, { candidate: true }, recordPath, { record: true });
    assert.deepEqual(JSON.parse(readFileSync(candidatePath, 'utf8')), { candidate: true });
    assert.deepEqual(JSON.parse(readFileSync(recordPath, 'utf8')), { record: true });
    rmSync(candidatePath);
    writeFileSync(recordPath, '{"existing":true}\n', 'utf8');
    assert.throws(() => writeSelectionPair(
      candidatePath,
      { candidate: false },
      recordPath,
      { record: false },
    ), /already exist/);
    assert.equal(readFileSync(recordPath, 'utf8'), '{"existing":true}\n');
    assert.throws(() => readFileSync(candidatePath, 'utf8'), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsupported replacement cohort names', () => {
  assert.throws(() => selectReplacementCohort({
    proposalA: proposal('codex-metadata-review-a', 'a'),
    proposalB: proposal('codex-metadata-review-b', 'b'),
    excludedIds: new Set(),
    selectedAt: '2026-07-23T04:30:00.000Z',
    selectorSourceSha256: 'a'.repeat(64),
    incidentRecordSha256: 'b'.repeat(64),
    cohort: 'development',
  }), /golden or untouched/);
});
