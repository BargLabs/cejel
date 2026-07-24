import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assembleDiscoveryIntegrity,
  deterministicCandidateId,
  deterministicQueryOutputManifestHash,
  deterministicRawHitId,
  validateDiscoveryAnchorContract,
} from './assemble-discovery-integrity.mjs';
import { canonicalize } from './freeze-cohorts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const calibrationRoot = resolve(here, '..');
const scriptPath = resolve(here, 'collect-discovery-hits.mjs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = (document, omitted) => {
  const value = structuredClone(document);
  if (omitted) delete value[omitted];
  return sha256(Buffer.from(canonicalize(value), 'utf8'));
};
const digest = (value) => sha256(Buffer.from(value, 'utf8'));

function sealContract(contract) {
  contract.contract_sha256 = hash(contract, 'contract_sha256');
  return contract;
}

function sealLedger(ledger) {
  ledger.ledger_sha256 = hash(ledger, 'ledger_sha256');
  return ledger;
}

function sealAudit(audit) {
  audit.record_sha256 = hash(audit, 'record_sha256');
  return audit;
}

function contract() {
  return sealContract({
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: 'llm-opportunity-discovery-v1.5',
    status: 'locked_before_source_access',
    locked_at: '2026-07-24T00:00:00Z',
    detector_results_seen_before_lock: false,
    source_accessed_before_lock: false,
    hash_contract: 'rfc8785-sha256-v1; contract excludes only contract_sha256',
    search_families: ['semantic_search'],
    allowed_exclusion_codes: [
      'out_of_rule_scope',
      'ineligible_source_path',
      'duplicate_candidate',
    ],
    resource_ceilings: {
      maximum_eligible_files_per_repository: 10,
      maximum_hits_per_query: 10,
      maximum_candidates_per_repository_rule: 10,
    },
    file_eligibility: {
      extensions: ['.ts'],
      excluded_path_segments: ['.git'],
    },
    discovery_tool: {
      path: 'calibration/llm/scripts/collect-discovery-hits.mjs',
      source_sha256: sha256(readFileSync(scriptPath)),
      dependency_paths: [
        'node:crypto',
        'node:fs',
        'node:path',
        'node:url',
        'calibration/llm/scripts/freeze-cohorts.mjs',
      ],
    },
    rules: [{
      rule_id: 'LLM-IOH-001',
      anchor_kinds: ['executable_sink'],
      canonical_locus: 'The final executable sink that receives observable model output.',
      negative_boundary_policy: 'Safe and controlled sinks remain negative opportunities rather than exclusions.',
      candidate_normalization: 'All producer and alias signals group at the final executable sink line.',
      query_recipes: [{
        query_id: 'ioh-semantic',
        family: 'semantic_search',
        semantic_cues: ['model output and executable sink dataflow'],
        query_patterns: [{
          pattern_id: 'ioh-sink-call',
          regex: 'execute',
          flags: 'i',
          anchor_kind: 'executable_sink',
        }],
      }],
    }],
  });
}

const reviewers = ['blind-primary', 'blind-independent'];
const auditor = 'blind-discovery-auditor';
const commits = { golden: 'a'.repeat(40), untouched: 'b'.repeat(40) };
const repositories = { golden: 'fixture/golden', untouched: 'fixture/untouched' };
const sourceSha = digest('source');

function reviewRecords(decision = 'opportunity') {
  return [
    {
      reviewer_id: reviewers[0],
      role: 'primary_labeler',
      decision,
      rationale_sha256: digest(`primary:${decision}`),
    },
    {
      reviewer_id: reviewers[1],
      role: 'independent_reviewer',
      decision,
      rationale_sha256: digest(`independent:${decision}`),
    },
    {
      reviewer_id: auditor,
      role: 'discovery_auditor',
      decision,
      rationale_sha256: digest(`auditor:${decision}`),
    },
  ];
}

function fixture() {
  const anchorContract = contract();
  const anchor = {
    kind: 'executable_sink',
    path: 'src/app.ts',
    start_line: 12,
    end_line: 12,
    content_sha256: sourceSha,
  };
  const rawHit = {
    cohort: 'golden',
    repository_id: repositories.golden,
    commit_sha: commits.golden,
    rule_id: 'LLM-IOH-001',
    query_id: 'ioh-semantic',
    anchor,
  };
  const candidate = {
    cohort: 'golden',
    repository_id: repositories.golden,
    commit_sha: commits.golden,
    rule_id: 'LLM-IOH-001',
    origin: 'locked_search',
    semantic_class: 'defect_candidate',
    anchor,
    supporting_hit_ids: [deterministicRawHitId(rawHit)],
    disposition: 'opportunity',
    opportunity_id: 'opportunity-golden-001',
    exclusion: null,
    reviews: reviewRecords(),
  };
  candidate.candidate_id = deterministicCandidateId(candidate);
  rawHit.hit_id = deterministicRawHitId(rawHit);
  rawHit.matched_pattern_ids = ['ioh-sink-call'];
  const ledger = sealLedger({
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: 'llm-opportunity-discovery-v1.5',
    status: 'frozen_before_detector_results',
    frozen_at: '2026-07-24T01:00:00Z',
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; ledger excludes only ledger_sha256',
    blind_reviewers: reviewers,
    auditor_id: auditor,
    bindings: {
      golden_manifest_sha256: digest('golden-manifest'),
      untouched_manifest_sha256: digest('untouched-manifest'),
      anchor_contract_sha256: anchorContract.contract_sha256,
    },
    repository_matrix: ['golden', 'untouched'].map((cohort) => ({
      cohort,
      repository_id: repositories[cohort],
      commit_sha: commits[cohort],
    })),
    eligible_file_inventories: ['golden', 'untouched'].map((cohort) => ({
      cohort,
      repository_id: repositories[cohort],
      commit_sha: commits[cohort],
      eligible_file_count: 1,
      eligible_file_manifest_sha256: digest(`${cohort}:files`),
      ceiling_reached: false,
    })),
    raw_hit_rows: [
      {
        cohort: 'golden',
        repository_id: repositories.golden,
        commit_sha: commits.golden,
        rule_id: 'LLM-IOH-001',
        query_id: 'ioh-semantic',
        hit_ids: [rawHit.hit_id],
        observed_hit_count: 1,
        output_manifest_sha256: '',
        ceiling_reached: false,
      },
      {
        cohort: 'untouched',
        repository_id: repositories.untouched,
        commit_sha: commits.untouched,
        rule_id: 'LLM-IOH-001',
        query_id: 'ioh-semantic',
        hit_ids: [],
        observed_hit_count: 0,
        output_manifest_sha256: '',
        ceiling_reached: false,
      },
    ],
    raw_hits: [rawHit],
    candidates: [candidate],
    opportunity_bindings: [{
      opportunity_id: candidate.opportunity_id,
      candidate_id: candidate.candidate_id,
    }],
    resource_usage: [
      {
        cohort: 'golden',
        repository_id: repositories.golden,
        eligible_files: 1,
        raw_hits: 1,
        candidates: 1,
        ceiling_reached: false,
      },
      {
        cohort: 'untouched',
        repository_id: repositories.untouched,
        eligible_files: 1,
        raw_hits: 0,
        candidates: 0,
        ceiling_reached: false,
      },
    ],
    unresolved_candidate_ids: [],
  });
  ledger.raw_hit_rows[0].output_manifest_sha256 = deterministicQueryOutputManifestHash(
    ledger.raw_hit_rows[0],
    [rawHit],
  );
  ledger.raw_hit_rows[1].output_manifest_sha256 = deterministicQueryOutputManifestHash(
    ledger.raw_hit_rows[1],
    [],
  );
  sealLedger(ledger);
  const discoveryAudit = sealAudit({
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: 'llm-opportunity-discovery-v1.5',
    status: 'complete_before_detector_results',
    completed_at: '2026-07-24T01:30:00Z',
    detector_output_visible: false,
    independent_of_rule_author: true,
    auditor_id: auditor,
    bindings: {
      anchor_contract_sha256: anchorContract.contract_sha256,
      candidate_ledger_sha256: ledger.ledger_sha256,
    },
    reviewed_candidate_ids: [candidate.candidate_id],
    auditor_added_candidate_ids: [],
    circulation: [],
    unresolved_candidate_ids: [],
    resource_ceiling_exhausted: false,
  });
  const opportunityManifest = {
    opportunities: [{
      opportunity_id: candidate.opportunity_id,
      cohort: candidate.cohort,
      repository_id: candidate.repository_id,
      commit_sha: candidate.commit_sha,
      rule_id: candidate.rule_id,
      evidence_scope: {
        kind: 'source_span',
        path_or_reference: candidate.anchor.path,
        start_line: candidate.anchor.start_line,
        end_line: candidate.anchor.end_line,
        sha256: candidate.anchor.content_sha256,
      },
    }],
  };
  return { contract: anchorContract, candidateLedger: ledger, discoveryAudit, opportunityManifest };
}

function reseal(input) {
  sealLedger(input.candidateLedger);
  input.discoveryAudit.bindings.candidate_ledger_sha256 = input.candidateLedger.ledger_sha256;
  sealAudit(input.discoveryAudit);
  return input;
}

test('assembles a complete ledger with an explicit zero-hit row and exact bijection', () => {
  const result = assembleDiscoveryIntegrity(fixture());
  assert.equal(result.status, 'discovery_integrity_validated');
  assert.deepEqual(result.counts, {
    repositories: 2,
    raw_hits: 1,
    candidates: 1,
    opportunities: 1,
    auditor_added_candidates: 0,
    unresolved_candidates: 0,
  });
  assert.match(result.record_sha256, /^[a-f0-9]{64}$/);
});

test('rejects a missing explicit zero row and an unaccounted raw hit', () => {
  const missingZero = fixture();
  missingZero.candidateLedger.raw_hit_rows.pop();
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(missingZero)),
    /omits explicit row/,
  );

  const unaccounted = fixture();
  unaccounted.candidateLedger.candidates[0].origin = 'reviewer_manual';
  unaccounted.candidateLedger.candidates[0].supporting_hit_ids = [];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(unaccounted)),
    /unaccounted/,
  );
});

test('accepts only allowed hash-bound exclusions and never excludes safe or controlled cases', () => {
  const allowed = fixture();
  const candidate = allowed.candidateLedger.candidates[0];
  candidate.semantic_class = 'out_of_scope';
  candidate.disposition = 'excluded';
  candidate.opportunity_id = null;
  candidate.exclusion = {
    code: 'out_of_rule_scope',
    rationale_sha256: digest('outside the rule contract'),
    duplicate_of_candidate_id: null,
  };
  candidate.reviews = reviewRecords('excluded');
  allowed.candidateLedger.opportunity_bindings = [];
  allowed.opportunityManifest.opportunities = [];
  assert.equal(
    assembleDiscoveryIntegrity(reseal(allowed)).counts.opportunities,
    0,
  );

  const safe = fixture();
  const safeCandidate = safe.candidateLedger.candidates[0];
  safeCandidate.semantic_class = 'safe_or_controlled';
  safeCandidate.disposition = 'excluded';
  safeCandidate.opportunity_id = null;
  safeCandidate.exclusion = {
    code: 'out_of_rule_scope',
    rationale_sha256: digest('incorrect safe exclusion'),
    duplicate_of_candidate_id: null,
  };
  safeCandidate.reviews = reviewRecords('excluded');
  safe.candidateLedger.opportunity_bindings = [];
  safe.opportunityManifest.opportunities = [];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(safe)),
    /safe\/controlled or defect candidates cannot be excluded/,
  );

  const unknownCode = fixture();
  const unknownCandidate = unknownCode.candidateLedger.candidates[0];
  unknownCandidate.semantic_class = 'out_of_scope';
  unknownCandidate.disposition = 'excluded';
  unknownCandidate.opportunity_id = null;
  unknownCandidate.exclusion = {
    code: 'looks_safe',
    rationale_sha256: digest('unregistered exclusion'),
    duplicate_of_candidate_id: null,
  };
  unknownCandidate.reviews = reviewRecords('excluded');
  unknownCode.candidateLedger.opportunity_bindings = [];
  unknownCode.opportunityManifest.opportunities = [];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(unknownCode)),
    /invalid hash-bound exclusion/,
  );
});

test('rejects a non-bijective candidate/opportunity mapping and unresolved reviews', () => {
  const nonBijective = fixture();
  nonBijective.candidateLedger.opportunity_bindings = [];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(nonBijective)),
    /not bijective/,
  );

  const disagreement = fixture();
  disagreement.candidateLedger.candidates[0].reviews[1].decision = 'excluded';
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(disagreement)),
    /unresolved reviewer disposition/,
  );

  const unresolved = fixture();
  unresolved.candidateLedger.unresolved_candidate_ids = [
    unresolved.candidateLedger.candidates[0].candidate_id,
  ];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(unresolved)),
    /contains unresolved candidates/,
  );
});

test('requires a distinct blind auditor and circulation of every auditor addition', () => {
  const colliding = fixture();
  colliding.candidateLedger.auditor_id = reviewers[0];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(colliding)),
    /distinct auditor/,
  );

  const added = fixture();
  added.candidateLedger.candidates[0].origin = 'auditor_added';
  added.candidateLedger.candidates[0].supporting_hit_ids = [
    added.candidateLedger.raw_hits[0].hit_id,
  ];
  added.discoveryAudit.auditor_added_candidate_ids = [
    added.candidateLedger.candidates[0].candidate_id,
  ];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(added)),
    /circulate to both blind reviewers/,
  );
  added.discoveryAudit.circulation = [{
    candidate_id: added.candidateLedger.candidates[0].candidate_id,
    primary_reviewer_id: reviewers[0],
    independent_reviewer_id: reviewers[1],
    primary_review_sha256: hash(
      added.candidateLedger.candidates[0].reviews.find(
        (review) => review.role === 'primary_labeler',
      ),
    ),
    independent_review_sha256: hash(
      added.candidateLedger.candidates[0].reviews.find(
        (review) => review.role === 'independent_reviewer',
      ),
    ),
  }];
  assert.equal(
    assembleDiscoveryIntegrity(reseal(added)).counts.auditor_added_candidates,
    1,
  );
});

test('rejects non-deterministic hit and candidate IDs and swapped ledger reviewer roles', () => {
  const wrongHit = fixture();
  wrongHit.candidateLedger.raw_hits[0].hit_id = 'llm-hit-not-derived';
  wrongHit.candidateLedger.raw_hit_rows[0].hit_ids = ['llm-hit-not-derived'];
  wrongHit.candidateLedger.candidates[0].supporting_hit_ids = ['llm-hit-not-derived'];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(wrongHit)),
    /invalid, duplicated, or outside the locked contract/,
  );

  const wrongCandidate = fixture();
  wrongCandidate.candidateLedger.candidates[0].candidate_id = 'llm-candidate-not-derived';
  wrongCandidate.candidateLedger.opportunity_bindings[0].candidate_id = 'llm-candidate-not-derived';
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(wrongCandidate)),
    /invalid or outside the anchor contract/,
  );

  const swappedRoles = fixture();
  const reviews = swappedRoles.candidateLedger.candidates[0].reviews;
  [reviews[0].reviewer_id, reviews[1].reviewer_id] = [reviews[1].reviewer_id, reviews[0].reviewer_id];
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(swappedRoles)),
    /lacks three distinct complete discovery reviews/,
  );
});

test('fails closed when any resource ceiling is reached', () => {
  const rowCeiling = fixture();
  rowCeiling.candidateLedger.raw_hit_rows[0].ceiling_reached = true;
  assert.throws(
    () => assembleDiscoveryIntegrity(reseal(rowCeiling)),
    /resource ceiling was reached/,
  );

  const auditCeiling = fixture();
  auditCeiling.discoveryAudit.resource_ceiling_exhausted = true;
  sealAudit(auditCeiling.discoveryAudit);
  assert.throws(
    () => assembleDiscoveryIntegrity(auditCeiling),
    /invalid, non-blind, or incomplete/,
  );
});

test('the locked public contract validates and discovery tooling has no LLM detector dependency', () => {
  const publicContract = JSON.parse(
    readFileSync(resolve(calibrationRoot, 'discovery-anchor-contract-v1.6.json'), 'utf8'),
  );
  assert.equal(
    validateDiscoveryAnchorContract(publicContract).methodology_id,
    'llm-opportunity-discovery-v1.5',
  );
  const source = readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]*src\/packs\/llm|import\([^)]*src\/packs\/llm/);
  assert.ok(
    publicContract.discovery_tool.dependency_paths.every(
      (path) => !path.includes('src/packs/llm'),
    ),
  );
  assert.equal(publicContract.discovery_tool.source_sha256, sha256(Buffer.from(source)));
});

test('accepts only explicitly supported discovery methodology versions', () => {
  const contract = JSON.parse(
    readFileSync(resolve(calibrationRoot, 'discovery-anchor-contract-v1.6.json'), 'utf8'),
  );
  contract.methodology_id = 'llm-opportunity-discovery-v1.7';
  sealContract(contract);
  assert.equal(validateDiscoveryAnchorContract(contract).methodology_id, 'llm-opportunity-discovery-v1.7');

  contract.methodology_id = 'llm-opportunity-discovery-v9.9';
  sealContract(contract);
  assert.throws(() => validateDiscoveryAnchorContract(contract), /valid pre-source lock/);
});
