import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCycleReset, writeCycleReset } from './create-cycle-reset.mjs';
import { canonicalize } from './freeze-cohorts.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonicalHash = (value) => sha256(Buffer.from(canonicalize(value), 'utf8'));

function input(path, document) {
  const bytes = Buffer.from(JSON.stringify(document, null, 2));
  writeFileSync(path, bytes);
  return { path, document, byteSha256: sha256(bytes), canonicalSha256: canonicalHash(document) };
}

function repository(repositoryId) {
  return { repository_id: repositoryId };
}

function prior(ids) {
  const normalized = ids.map((id) => id.toLowerCase()).sort();
  return {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', cycle: 'v1.4',
    record_type: 'pre_result_cycle_reset', detector_results_seen_for_new_cohorts: false,
    repository_source_or_labels_used_for_new_cohort_selection: false,
    historical_exclusions: {
      repository_count: normalized.length,
      repository_ids_sha256: canonicalHash(normalized), repository_ids: normalized,
    },
  };
}

function candidates(cohort, ids) {
  return {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', policy_id: 'llm-selection-v1.4', cohort,
    status: 'candidate_commit_freeze_pending', selected_before_detector_results: true,
    repositories: ids.map(repository),
  };
}

function proposal(reviewerId, ids) {
  return {
    schema_version: '1.0.0', reviewer_id: reviewerId,
    generated_at: '2026-07-24T00:00:00.000Z',
    search_mode: 'github_repository_metadata_only', detector_results_seen: false,
    source_accessed: false, repository_source_cloned_or_labeled: false,
    repositories: ids.map(repository),
  };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-cycle-reset-'));
  const write = (name, value) => input(join(directory, name), value);
  return {
    directory,
    priorReset: write('prior.json', prior(['old/a', 'old/b'])),
    goldenCandidates: write('golden.json', candidates('golden', ['Golden/A', 'Golden/B'])),
    untouchedCandidates: write('untouched.json', candidates('untouched', ['Fresh/C', 'Fresh/D'])),
    proposalA: write('proposal-a.json', proposal('metadata-a', ['old/a', 'fresh/e', 'fresh/f'])),
    proposalB: write('proposal-b.json', proposal('metadata-b', ['fresh/f', 'fresh/g'])),
  };
}

test('creates an exact normalized and sorted union with byte and canonical source bindings', () => {
  const values = fixture();
  try {
    const document = createCycleReset({ ...values, cycle: 'v1.5', recordedAt: '2026-07-24T01:00:00.000Z' });
    assert.deepEqual(document.historical_exclusions.repository_ids, [
      'fresh/c', 'fresh/d', 'fresh/e', 'fresh/f', 'fresh/g', 'golden/a', 'golden/b', 'old/a', 'old/b',
    ]);
    assert.equal(document.historical_exclusions.repository_count, 9);
    assert.equal(document.historical_exclusions.repository_ids_sha256,
      canonicalHash(document.historical_exclusions.repository_ids));
    assert.equal(document.historical_exclusions.source_bindings.length, 5);
    for (const binding of document.historical_exclusions.source_bindings) {
      assert.match(binding.byte_sha256, /^[a-f0-9]{64}$/);
      assert.match(binding.canonical_sha256, /^[a-f0-9]{64}$/);
    }
    const output = join(values.directory, 'cycle-reset.json');
    writeCycleReset(output, document);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), document);
    assert.throws(() => writeCycleReset(output, document), /EEXIST/);
  } finally {
    rmSync(values.directory, { recursive: true, force: true });
  }
});

test('supports a 404-identity union without embedding a current cohort count', () => {
  const values = fixture();
  try {
    const ids = Array.from({ length: 400 }, (_, index) => `catalog/repo-${String(index).padStart(3, '0')}`);
    values.priorReset = input(join(values.directory, 'large-prior.json'), prior(ids));
    values.proposalA = input(join(values.directory, 'large-proposal-a.json'),
      proposal('metadata-a', ['catalog/repo-000']));
    values.proposalB = input(join(values.directory, 'large-proposal-b.json'),
      proposal('metadata-b', ['catalog/repo-001']));
    const document = createCycleReset({ ...values, cycle: 'v1.5', recordedAt: '2026-07-24T01:00:00.000Z' });
    assert.equal(document.historical_exclusions.repository_count, 404);
    assert.equal(document.historical_exclusions.repository_ids.length, 404);
  } finally {
    rmSync(values.directory, { recursive: true, force: true });
  }
});

test('fails closed for contaminated inputs, duplicate identities, broken hashes, and overlapping cohorts', () => {
  const values = fixture();
  try {
    values.proposalA.document.source_accessed = true;
    assert.throws(() => createCycleReset({ ...values, recordedAt: '2026-07-24T01:00:00.000Z' }), /source_accessed must be false/);
    values.proposalA.document.source_accessed = false;
    values.proposalA.document.detector_output = { findings: [] };
    assert.throws(() => createCycleReset({ ...values, recordedAt: '2026-07-24T01:00:00.000Z' }), /invalid metadata-only proposal/);
    delete values.proposalA.document.detector_output;
    values.goldenCandidates.document.repositories.push(repository('golden/a'));
    assert.throws(() => createCycleReset({ ...values, recordedAt: '2026-07-24T01:00:00.000Z' }), /duplicate repository identity/);
    values.goldenCandidates.document.repositories.pop();
    values.priorReset.document.historical_exclusions.repository_ids_sha256 = '0'.repeat(64);
    assert.throws(() => createCycleReset({ ...values, recordedAt: '2026-07-24T01:00:00.000Z' }), /not canonical and hash-bound/);
    values.priorReset.document.historical_exclusions.repository_ids_sha256 = canonicalHash(['old/a', 'old/b']);
    values.untouchedCandidates.document.repositories[0] = repository('golden/a');
    assert.throws(() => createCycleReset({ ...values, recordedAt: '2026-07-24T01:00:00.000Z' }), /must be disjoint/);
    assert.throws(() => createCycleReset({ ...values, recordedAt: '2026-07-24' }), /ISO timestamp/);
  } finally {
    rmSync(values.directory, { recursive: true, force: true });
  }
});
