import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectDiscoveryHits } from './collect-discovery-hits.mjs';
import { canonicalize } from './freeze-cohorts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const collectorPath = resolve(here, 'collect-discovery-hits.mjs');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hash = (document, omitted) => {
  const value = structuredClone(document);
  if (omitted) delete value[omitted];
  return sha256(Buffer.from(canonicalize(value), 'utf8'));
};

function contract() {
  const document = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: 'llm-opportunity-discovery-v1.5',
    status: 'locked_before_source_access',
    locked_at: '2026-07-24T00:00:00Z',
    detector_results_seen_before_lock: false,
    source_accessed_before_lock: false,
    hash_contract: 'rfc8785-sha256-v1; contract excludes only contract_sha256',
    search_families: ['direct_calls'],
    allowed_exclusion_codes: ['out_of_rule_scope'],
    resource_ceilings: {
      maximum_eligible_files_per_repository: 10,
      maximum_hits_per_query: 10,
      maximum_candidates_per_repository_rule: 10,
    },
    file_eligibility: {
      extensions: ['.ts', '.py'],
      excluded_path_segments: ['.git', 'node_modules'],
    },
    discovery_tool: {
      path: 'calibration/llm/scripts/collect-discovery-hits.mjs',
      source_sha256: sha256(readFileSync(collectorPath)),
      dependency_paths: [
        'node:crypto',
        'node:fs',
        'node:path',
        'node:url',
        'calibration/llm/scripts/assemble-discovery-integrity.mjs',
        'calibration/llm/scripts/freeze-cohorts.mjs',
      ],
    },
    rules: [{
      rule_id: 'LLM-IOH-001',
      anchor_kinds: ['executable_sink'],
      canonical_locus: 'Anchor the final executable sink receiving model output.',
      negative_boundary_policy: 'Safe and controlled sinks remain negative opportunities.',
      candidate_normalization: 'Group source signals at the final sink source line.',
      query_recipes: [{
        query_id: 'ioh-direct',
        family: 'direct_calls',
        semantic_cues: ['direct executable sink following model output'],
        query_patterns: [{
          pattern_id: 'exec-call',
          regex: '\\bexecute\\s*\\(',
          flags: 'i',
          anchor_kind: 'executable_sink',
        }, {
          pattern_id: 'run-call',
          regex: '\\brun\\s*\\(',
          flags: 'i',
          anchor_kind: 'executable_sink',
        }],
      }],
    }],
  };
  document.contract_sha256 = hash(document, 'contract_sha256');
  return document;
}

function fixtureRoot() {
  const root = mkdtempSync(resolve(tmpdir(), 'cejel-discovery-fixture-'));
  mkdirSync(resolve(root, 'src'));
  mkdirSync(resolve(root, 'node_modules'));
  writeFileSync(resolve(root, 'src', 'b.ts'), 'execute(value)\nrun(value)\n', 'utf8');
  writeFileSync(resolve(root, 'src', 'a.py'), 'run(value)\n', 'utf8');
  writeFileSync(resolve(root, 'node_modules', 'ignored.ts'), 'execute(value)\n', 'utf8');
  return root;
}

function repositories(goldenRoot, untouchedRoot) {
  return {
    repositories: [{
      cohort: 'golden',
      repository_id: 'fixture/golden',
      commit_sha: 'a'.repeat(40),
      source_root: goldenRoot,
    }, {
      cohort: 'untouched',
      repository_id: 'fixture/untouched',
      commit_sha: 'b'.repeat(40),
      source_root: untouchedRoot,
    }],
  };
}

test('deterministically collects every locked recipe, zero row, file hash, and query manifest', () => {
  const golden = fixtureRoot();
  const untouched = fixtureRoot();
  try {
    writeFileSync(resolve(untouched, 'src', 'a.py'), 'literal = 1\n', 'utf8');
    writeFileSync(resolve(untouched, 'src', 'b.ts'), 'literal = 2\n', 'utf8');
    const input = { contract: contract(), repositories: repositories(golden, untouched) };
    const first = collectDiscoveryHits(input);
    const second = collectDiscoveryHits(input);
    assert.deepEqual(second, first);
    assert.equal(first.detector_results_seen_before_collection, false);
    assert.equal(first.eligible_file_inventories[0].eligible_file_count, 2);
    assert.equal(first.raw_hit_rows.length, 2);
    assert.equal(first.raw_hit_rows[0].observed_hit_count, 3);
    assert.equal(first.raw_hit_rows[1].observed_hit_count, 0);
    assert.match(first.raw_hit_rows[0].output_manifest_sha256, /^[a-f0-9]{64}$/);
    assert.match(first.eligible_file_inventories[0].eligible_file_manifest_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      first.raw_hits.map((hit) => hit.matched_pattern_ids.join(',')).sort(),
      ['exec-call', 'run-call', 'run-call'],
    );
    assert.ok(first.raw_hits.every((hit) => hit.hit_id.startsWith('llm-hit-')));
  } finally {
    rmSync(golden, { recursive: true, force: true });
    rmSync(untouched, { recursive: true, force: true });
  }
});

test('fails closed when a file or per-query hit ceiling is reached', () => {
  const golden = fixtureRoot();
  const untouched = fixtureRoot();
  try {
    const fileLimited = contract();
    fileLimited.resource_ceilings.maximum_eligible_files_per_repository = 2;
    fileLimited.contract_sha256 = hash(fileLimited, 'contract_sha256');
    assert.throws(
      () => collectDiscoveryHits({ contract: fileLimited, repositories: repositories(golden, untouched) }),
      /eligible file resource ceiling reached/,
    );
    const hitLimited = contract();
    hitLimited.resource_ceilings.maximum_hits_per_query = 3;
    hitLimited.contract_sha256 = hash(hitLimited, 'contract_sha256');
    assert.throws(
      () => collectDiscoveryHits({ contract: hitLimited, repositories: repositories(golden, untouched) }),
      /raw-hit resource ceiling reached/,
    );
  } finally {
    rmSync(golden, { recursive: true, force: true });
    rmSync(untouched, { recursive: true, force: true });
  }
});
