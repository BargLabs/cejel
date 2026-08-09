import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectDiscoveryHitsV2,
  groupCorroboratedCandidateLociV2,
  validateResourceBoundedDiscoveryContract,
} from './collect-discovery-hits-v2.mjs';
import { collectDiscoveryHits } from './collect-discovery-hits.mjs';
import { canonicalize } from './freeze-cohorts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const calibrationRoot = resolve(here, '..');
const collectorPath = resolve(here, 'collect-discovery-hits-v2.mjs');
const historicalCollectorPath = resolve(here, 'collect-discovery-hits.mjs');
const historicalContractPath = resolve(calibrationRoot, 'discovery-anchor-contract-v1.9.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hash = (document, omitted) => {
  const value = structuredClone(document);
  if (omitted) delete value[omitted];
  return sha256(Buffer.from(canonicalize(value), 'utf8'));
};

function contract({ budgetMilliseconds = 1_000, patterns } = {}) {
  const document = {
    schema_version: '2.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: 'llm-opportunity-discovery-v2.0',
    status: 'locked_before_source_access',
    locked_at: '2026-08-09T00:00:00Z',
    detector_results_seen_before_lock: false,
    source_accessed_before_lock: false,
    hash_contract: 'rfc8785-sha256-v1; contract excludes only contract_sha256',
    search_families: ['direct_calls'],
    allowed_exclusion_codes: ['out_of_rule_scope'],
    resource_ceilings: {
      maximum_eligible_files_per_repository: 10,
      maximum_hits_per_query: 10,
      maximum_candidates_per_repository_rule: 10,
      maximum_regex_scan_milliseconds_per_file: budgetMilliseconds,
    },
    file_eligibility: {
      extensions: ['.ts'],
      excluded_path_segments: ['.git', 'node_modules'],
    },
    discovery_tool: {
      path: 'calibration/llm/scripts/collect-discovery-hits-v2.mjs',
      source_sha256: sha256(readFileSync(collectorPath)),
      dependency_paths: [
        'node:crypto',
        'node:fs',
        'node:path',
        'node:url',
        'node:worker_threads',
        'calibration/llm/scripts/freeze-cohorts.mjs',
      ],
    },
    rules: [{
      rule_id: 'LLM-IOH-001',
      anchor_kinds: ['executable_sink'],
      canonical_locus: 'Anchor the final executable sink receiving model output.',
      negative_boundary_policy: 'Safe and controlled sinks remain negative opportunities.',
      candidate_normalization: 'Group source signals at the final executable sink source line.',
      query_recipes: [{
        query_id: 'ioh-direct',
        family: 'direct_calls',
        semantic_cues: ['direct executable sink following model output'],
        query_patterns: patterns || [{
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

function fixture(files) {
  const root = mkdtempSync(resolve(tmpdir(), 'cejel-discovery-v2-fixture-'));
  mkdirSync(resolve(root, 'src'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(resolve(root, 'src', name), content, 'utf8');
  }
  return root;
}

function historicalContract(v2Contract) {
  const document = structuredClone(v2Contract);
  document.schema_version = '1.0.0';
  document.methodology_id = 'llm-opportunity-discovery-v1.9';
  delete document.resource_ceilings.maximum_regex_scan_milliseconds_per_file;
  document.discovery_tool = {
    path: 'calibration/llm/scripts/collect-discovery-hits.mjs',
    source_sha256: sha256(readFileSync(historicalCollectorPath)),
    dependency_paths: [
      'node:crypto',
      'node:fs',
      'node:path',
      'node:url',
      'calibration/llm/scripts/assemble-discovery-integrity.mjs',
      'calibration/llm/scripts/freeze-cohorts.mjs',
    ],
  };
  document.contract_sha256 = hash(document, 'contract_sha256');
  return document;
}

function repositories(sourceRoot) {
  return {
    repositories: [{
      cohort: 'golden',
      repository_id: 'fixture/golden',
      commit_sha: 'a'.repeat(40),
      source_root: sourceRoot,
    }],
  };
}

const catastrophicPatterns = [{
  pattern_id: 'catastrophic-backtracking',
  regex: '(a+)+$',
  flags: '',
  anchor_kind: 'executable_sink',
}, {
  pattern_id: 'exec-call',
  regex: '\\bexecute\\s*\\(',
  flags: '',
  anchor_kind: 'executable_sink',
}];

test('preserves the SHA-pinned v1.9 collector and historical contract bytes', () => {
  assert.equal(
    sha256(readFileSync(historicalCollectorPath)),
    '2183a2c2c0da7eee0a070a726cca6c6762a54363ea94c0784ed2275b8b3ab92b',
  );
  assert.equal(
    sha256(readFileSync(historicalContractPath)),
    '1217a089b72e3eb6e3e843e5d66ecb97a72716a6052e60fcd74ca2bc849d08d3',
  );
  const historical = JSON.parse(readFileSync(historicalContractPath, 'utf8'));
  assert.throws(
    () => validateResourceBoundedDiscoveryContract(historical),
    /not a valid pre-source lock/,
  );
});

test('collects deterministic complete output through the separately pinned v2 surface', async () => {
  const root = fixture({ 'b.ts': 'execute(value)\nrun(value)\n', 'a.ts': 'run(value)\n' });
  try {
    const input = { contract: contract(), repositories: repositories(root) };
    const first = await collectDiscoveryHitsV2(input);
    const second = await collectDiscoveryHitsV2(input);
    assert.deepEqual(second, first);
    assert.equal(first.schema_version, '2.0.0');
    assert.equal(first.collector_id, 'cejel-llm-discovery-collector-v2');
    assert.equal(first.status, 'collected_before_review');
    assert.equal(first.complete, true);
    assert.deepEqual(first.resource_exhaustions, []);
    assert.equal(first.raw_hit_rows.length, 1);
    assert.equal(first.raw_hit_rows[0].observed_hit_count, 3);
    assert.equal(first.raw_hit_rows[0].ceiling_reached, false);
    assert.equal(first.resource_usage[0].regex_file_timeouts, 0);
    assert.match(first.collection_sha256, /^[a-f0-9]{64}$/);
    const historical = collectDiscoveryHits({
      contract: historicalContract(input.contract),
      repositories: input.repositories,
    });
    assert.deepEqual(first.eligible_file_inventories, historical.eligible_file_inventories);
    assert.deepEqual(first.raw_hit_rows, historical.raw_hit_rows);
    assert.deepEqual(first.raw_hits, historical.raw_hits);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('terminates pathological regex work, flags the exact file, and continues with a fresh worker', async () => {
  const root = fixture({
    'a-pathological.ts': `execute(value)\n${'a'.repeat(50_000)}!\n`,
    'b-safe.ts': 'execute(value)\n',
  });
  try {
    const started = Date.now();
    const result = await collectDiscoveryHitsV2({
      contract: contract({ budgetMilliseconds: 100, patterns: catastrophicPatterns }),
      repositories: repositories(root),
    });
    assert.ok(Date.now() - started < 5_000, 'pathological scan must remain bounded');
    assert.equal(result.status, 'resource_ceiling_reached_before_review');
    assert.equal(result.complete, false);
    assert.deepEqual(result.resource_exhaustions.map((item) => item.path), ['src/a-pathological.ts']);
    assert.deepEqual(
      result.resource_exhaustions[0].affected_query_ids,
      ['ioh-direct'],
    );
    assert.equal(result.raw_hit_rows[0].ceiling_reached, true);
    assert.equal(result.resource_usage[0].regex_file_timeouts, 1);
    assert.equal(result.resource_usage[0].ceiling_reached, true);
    assert.deepEqual(result.raw_hits.map((hit) => hit.anchor.path), ['src/b-safe.ts']);
    assert.ok(!JSON.stringify(result).includes('maximum elapsed'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writes the resource-exhaustion record and exits nonzero from the CLI', () => {
  const root = fixture({ 'pathological.ts': `${'a'.repeat(50_000)}!\n` });
  const runRoot = mkdtempSync(resolve(tmpdir(), 'cejel-discovery-v2-cli-'));
  const contractPath = resolve(runRoot, 'contract.json');
  const repositoriesPath = resolve(runRoot, 'repositories.json');
  const outputPath = resolve(runRoot, 'result.json');
  try {
    writeFileSync(
      contractPath,
      `${JSON.stringify(contract({ budgetMilliseconds: 100, patterns: catastrophicPatterns }))}\n`,
      'utf8',
    );
    writeFileSync(repositoriesPath, `${JSON.stringify(repositories(root))}\n`, 'utf8');
    const run = spawnSync(process.execPath, [
      collectorPath,
      '--contract', contractPath,
      '--repositories', repositoriesPath,
      '--output', outputPath,
    ], { encoding: 'utf8', timeout: 5_000 });
    assert.equal(run.error, undefined);
    assert.equal(run.status, 2);
    const result = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(result.complete, false);
    assert.equal(result.resource_exhaustions[0].path, 'src/pathological.ts');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(runRoot, { recursive: true, force: true });
  }
});

test('requires a finite v2 time ceiling and preserves corroboration provenance', () => {
  const excessive = contract({ budgetMilliseconds: 60_001 });
  assert.throws(
    () => validateResourceBoundedDiscoveryContract(excessive),
    /must not exceed 60000 milliseconds/,
  );
  const anchor = {
    kind: 'executable_sink', path: 'src/a.ts', start_line: 4, end_line: 4,
    content_sha256: 'c'.repeat(64),
  };
  const hit = (id, queryId) => ({
    hit_id: id, cohort: 'golden', repository_id: 'fixture/golden', commit_sha: 'a'.repeat(40),
    rule_id: 'LLM-IOH-001', query_id: queryId, anchor,
  });
  const grouped = groupCorroboratedCandidateLociV2([
    hit('h3', 'third'), hit('h1', 'first'), hit('h2', 'second'),
  ], 3);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].supporting_hit_ids, ['h1', 'h2', 'h3']);
});
