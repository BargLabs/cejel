import assert from 'node:assert/strict';
import test from 'node:test';

import { selectReplacementCohort } from './select-replacement-cohort.mjs';

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
    reviewer_id: reviewerId,
    search_mode: 'metadata_only',
    detector_results_seen: false,
    repository_source_cloned_or_labeled: false,
    generated_at: '2026-07-23T04:20:00.000Z',
    repositories,
  };
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
  }), /required anthropic/);
});

test('supports a fresh policy cycle without rewriting the v1.2 audit record shape', () => {
  const proposalA = proposal('codex-metadata-review-a', 'a');
  const proposalB = proposal('codex-metadata-review-b', 'b');
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
