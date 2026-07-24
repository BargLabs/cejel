#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const SUPPORTED_DISCOVERY_METHODOLOGIES = new Set([
  'llm-opportunity-discovery-v1.5',
  'llm-opportunity-discovery-v1.7',
]);
const codePointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const COMMIT = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COHORTS = ['golden', 'untouched'];
const DISCOVERY_ROLES = ['primary_labeler', 'independent_reviewer', 'discovery_auditor'];
const MAPPABLE_CLASSES = ['defect_candidate', 'safe_or_controlled'];
const EXCLUDABLE_CLASSES = ['out_of_scope', 'ineligible_source', 'duplicate'];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalHash = (document, omittedKey) => {
  const hashable = structuredClone(document);
  if (omittedKey) delete hashable[omittedKey];
  return sha256(Buffer.from(canonicalize(hashable), 'utf8'));
};

function identityHash(prefix, document) {
  return `${prefix}-${sha256(Buffer.from(canonicalize(document), 'utf8'))}`;
}

export function deterministicRawHitId(hit) {
  return identityHash('llm-hit', {
    cohort: hit.cohort,
    repository_id: hit.repository_id,
    commit_sha: hit.commit_sha,
    rule_id: hit.rule_id,
    query_id: hit.query_id,
    anchor: hit.anchor,
  });
}

export function deterministicCandidateId(candidate) {
  return identityHash('llm-candidate', {
    cohort: candidate.cohort,
    repository_id: candidate.repository_id,
    commit_sha: candidate.commit_sha,
    rule_id: candidate.rule_id,
    anchor: candidate.anchor,
  });
}

export function deterministicQueryOutputManifestHash(row, hits) {
  return canonicalHash({
    schema_version: '1.0.0',
    cohort: row.cohort,
    repository_id: row.repository_id,
    commit_sha: row.commit_sha,
    rule_id: row.rule_id,
    query_id: row.query_id,
    raw_hits: [...hits]
      .map((hit) => ({
        hit_id: hit.hit_id,
        anchor: hit.anchor,
        matched_pattern_ids: hit.matched_pattern_ids,
      }))
      .sort((left, right) => codePointCompare(left.hit_id, right.hit_id)),
  });
}

function rejectUnknownKeys(value, allowed, scope) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${scope} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${scope} contains unknown field(s): ${unknown.sort().join(', ')}`);
  }
}

function exactUniqueStrings(values, scope, minimum = 0) {
  if (
    !Array.isArray(values) ||
    values.length < minimum ||
    values.some((value) => typeof value !== 'string' || value.length < 1) ||
    new Set(values).size !== values.length
  ) throw new Error(`${scope} must be an array of unique non-empty strings`);
  return values;
}

function validSourceAnchor(anchor, scope) {
  rejectUnknownKeys(
    anchor,
    ['kind', 'path', 'start_line', 'end_line', 'content_sha256'],
    scope,
  );
  if (
    typeof anchor.kind !== 'string' ||
    typeof anchor.path !== 'string' ||
    anchor.path.length < 1 ||
    anchor.path.startsWith('/') ||
    anchor.path.includes('\\') ||
    anchor.path.split('/').some((segment) => ['', '.', '..'].includes(segment)) ||
    !Number.isInteger(anchor.start_line) ||
    !Number.isInteger(anchor.end_line) ||
    anchor.start_line < 1 ||
    anchor.end_line < anchor.start_line ||
    !SHA256.test(anchor.content_sha256 || '')
  ) throw new Error(`${scope} is not a valid immutable source anchor`);
}

function validateContract(contract) {
  rejectUnknownKeys(contract, [
    '$schema', 'schema_version', 'protocol_id', 'methodology_id', 'status', 'locked_at',
    'detector_results_seen_before_lock', 'source_accessed_before_lock', 'hash_contract',
    'search_families', 'allowed_exclusion_codes', 'resource_ceilings', 'file_eligibility', 'discovery_tool',
    'rules', 'contract_sha256',
  ], 'discovery anchor contract');
  if (
    contract.schema_version !== '1.0.0' ||
    contract.protocol_id !== 'cejel-llm-calibration-v1' ||
    !SUPPORTED_DISCOVERY_METHODOLOGIES.has(contract.methodology_id) ||
    contract.status !== 'locked_before_source_access' ||
    contract.detector_results_seen_before_lock !== false ||
    contract.source_accessed_before_lock !== false ||
    typeof contract.locked_at !== 'string' ||
    Number.isNaN(Date.parse(contract.locked_at)) ||
    contract.hash_contract !== 'rfc8785-sha256-v1; contract excludes only contract_sha256' ||
    canonicalHash(contract, 'contract_sha256') !== contract.contract_sha256
  ) throw new Error('discovery anchor contract is not a valid pre-source lock');
  const families = exactUniqueStrings(contract.search_families, 'contract search families', 1);
  const exclusionCodes = exactUniqueStrings(
    contract.allowed_exclusion_codes,
    'contract exclusion codes',
    1,
  );
  rejectUnknownKeys(
    contract.resource_ceilings,
    ['maximum_eligible_files_per_repository', 'maximum_hits_per_query',
      'maximum_candidates_per_repository_rule'],
    'contract resource ceilings',
  );
  for (const value of Object.values(contract.resource_ceilings)) {
    if (!Number.isInteger(value) || value < 1) throw new Error('contract resource ceilings must be positive integers');
  }
  rejectUnknownKeys(
    contract.file_eligibility,
    ['extensions', 'excluded_path_segments'],
    'contract file eligibility',
  );
  if (
    !exactUniqueStrings(contract.file_eligibility.extensions, 'eligible source extensions', 1)
      .every((extension) => /^\.[a-z0-9]+$/i.test(extension)) ||
    !exactUniqueStrings(
      contract.file_eligibility.excluded_path_segments,
      'excluded source path segments',
      1,
    ).every((segment) => !/[\\/]/.test(segment))
  ) throw new Error('contract file eligibility is invalid');
  rejectUnknownKeys(
    contract.discovery_tool,
    ['path', 'source_sha256', 'dependency_paths'],
    'contract discovery tool',
  );
  if (
    contract.discovery_tool.path !== 'calibration/llm/scripts/collect-discovery-hits.mjs' ||
    contract.discovery_tool.source_sha256 !==
      sha256(readFileSync(fileURLToPath(new URL('./collect-discovery-hits.mjs', import.meta.url)))) ||
    contract.discovery_tool.path.includes('src/packs/llm') ||
    exactUniqueStrings(contract.discovery_tool.dependency_paths, 'discovery tool dependencies')
      .some((path) => path.includes('src/packs/llm'))
  ) throw new Error('discovery tool is invalid or detector-dependent');
  if (!Array.isArray(contract.rules) || contract.rules.length < 1) {
    throw new Error('contract must declare at least one rule');
  }
  const rules = new Map();
  const queryIds = new Set();
  for (const [index, rule] of contract.rules.entries()) {
    const scope = `contract rule ${index}`;
    rejectUnknownKeys(rule, [
      'rule_id', 'anchor_kinds', 'canonical_locus', 'negative_boundary_policy',
      'candidate_normalization', 'query_recipes',
    ], scope);
    if (
      typeof rule.rule_id !== 'string' ||
      rules.has(rule.rule_id) ||
      typeof rule.canonical_locus !== 'string' ||
      rule.canonical_locus.length < 20 ||
      typeof rule.negative_boundary_policy !== 'string' ||
      rule.negative_boundary_policy.length < 20 ||
      typeof rule.candidate_normalization !== 'string' ||
      rule.candidate_normalization.length < 20
    ) throw new Error(`${scope} is incomplete or duplicated`);
    const anchorKinds = exactUniqueStrings(rule.anchor_kinds, `${scope} anchor kinds`, 1);
    if (!Array.isArray(rule.query_recipes) || rule.query_recipes.length !== families.length) {
      throw new Error(`${scope} must contain exactly one recipe per search family`);
    }
    const seenFamilies = new Set();
    const recipes = new Map();
    for (const [recipeIndex, recipe] of rule.query_recipes.entries()) {
      const recipeScope = `${scope} query recipe ${recipeIndex}`;
      rejectUnknownKeys(recipe, ['query_id', 'family', 'semantic_cues', 'query_patterns'], recipeScope);
      if (
        typeof recipe.query_id !== 'string' ||
        queryIds.has(recipe.query_id) ||
        !families.includes(recipe.family) ||
        seenFamilies.has(recipe.family)
      ) throw new Error(`${recipeScope} is duplicated or outside the locked methodology`);
      exactUniqueStrings(recipe.semantic_cues, `${recipeScope} semantic cues`, 1);
      if (!Array.isArray(recipe.query_patterns) || recipe.query_patterns.length < 1) {
        throw new Error(`${recipeScope} must lock at least one machine-readable query pattern`);
      }
      const patternIds = new Set();
      const patternAnchorKinds = new Set();
      for (const [patternIndex, pattern] of recipe.query_patterns.entries()) {
        rejectUnknownKeys(
          pattern,
          ['pattern_id', 'regex', 'flags', 'anchor_kind'],
          `${recipeScope} pattern ${patternIndex}`,
        );
        if (
          typeof pattern.pattern_id !== 'string' || pattern.pattern_id.length < 3 ||
          patternIds.has(pattern.pattern_id) || typeof pattern.regex !== 'string' ||
          pattern.regex.length < 1 || !/^[gimsuy]*$/.test(pattern.flags || '') ||
          !anchorKinds.includes(pattern.anchor_kind)
        ) throw new Error(`${recipeScope} has an invalid query pattern`);
        try {
          new RegExp(pattern.regex, pattern.flags.replaceAll('g', ''));
        } catch {
          throw new Error(`${recipeScope} has an invalid query pattern`);
        }
        patternIds.add(pattern.pattern_id);
        patternAnchorKinds.add(pattern.anchor_kind);
      }
      if (patternAnchorKinds.size !== 1) {
        throw new Error(`${recipeScope} patterns must share one canonical anchor kind`);
      }
      queryIds.add(recipe.query_id);
      seenFamilies.add(recipe.family);
      recipes.set(recipe.query_id, recipe);
    }
    if (seenFamilies.size !== families.length) throw new Error(`${scope} omits a search family`);
    rules.set(rule.rule_id, { ...rule, anchorKinds: new Set(anchorKinds), recipes });
  }
  return {
    contract,
    rules,
    exclusionCodes: new Set(exclusionCodes),
  };
}

export function validateDiscoveryAnchorContract(contract) {
  return validateContract(contract).contract;
}

function validateLedger(ledger, contractState) {
  rejectUnknownKeys(ledger, [
    'schema_version', 'protocol_id', 'methodology_id', 'status', 'frozen_at',
    'detector_results_seen_before_freeze', 'hash_contract', 'blind_reviewers', 'auditor_id',
    'bindings', 'repository_matrix', 'eligible_file_inventories', 'raw_hit_rows', 'raw_hits',
    'candidates', 'opportunity_bindings', 'resource_usage', 'unresolved_candidate_ids',
    'ledger_sha256',
  ], 'candidate ledger');
  if (
    ledger.schema_version !== '1.0.0' ||
    ledger.protocol_id !== 'cejel-llm-calibration-v1' ||
    ledger.methodology_id !== contractState.contract.methodology_id ||
    ledger.status !== 'frozen_before_detector_results' ||
    ledger.detector_results_seen_before_freeze !== false ||
    typeof ledger.frozen_at !== 'string' ||
    Number.isNaN(Date.parse(ledger.frozen_at)) ||
    ledger.hash_contract !== 'rfc8785-sha256-v1; ledger excludes only ledger_sha256' ||
    canonicalHash(ledger, 'ledger_sha256') !== ledger.ledger_sha256
  ) throw new Error('candidate ledger is not a valid pre-result frozen record');
  const reviewers = exactUniqueStrings(ledger.blind_reviewers, 'blind reviewers', 2);
  if (reviewers.length !== 2 ||
      new Set(reviewers.map((value) => value.toLowerCase())).size !== 2 ||
      typeof ledger.auditor_id !== 'string' ||
      ledger.auditor_id.length < 3 ||
      reviewers.map((value) => value.toLowerCase()).includes(ledger.auditor_id.toLowerCase())) {
    throw new Error('candidate ledger requires two distinct blind reviewers and a distinct auditor');
  }
  rejectUnknownKeys(
    ledger.bindings,
    ['golden_manifest_sha256', 'untouched_manifest_sha256', 'anchor_contract_sha256'],
    'candidate ledger bindings',
  );
  if (
    !SHA256.test(ledger.bindings.golden_manifest_sha256 || '') ||
    !SHA256.test(ledger.bindings.untouched_manifest_sha256 || '') ||
    ledger.bindings.anchor_contract_sha256 !== contractState.contract.contract_sha256
  ) throw new Error('candidate ledger bindings are invalid');

  const repositories = new Map();
  for (const [index, repository] of ledger.repository_matrix.entries()) {
    const scope = `repository matrix row ${index}`;
    rejectUnknownKeys(repository, ['cohort', 'repository_id', 'commit_sha'], scope);
    const key = `${repository.cohort}:${repository.repository_id}`;
    if (
      !COHORTS.includes(repository.cohort) ||
      !REPOSITORY.test(repository.repository_id || '') ||
      !COMMIT.test(repository.commit_sha || '') ||
      repositories.has(key)
    ) throw new Error(`${scope} is invalid or duplicated`);
    repositories.set(key, repository);
  }
  if (repositories.size < 2 ||
      ![...repositories.values()].some((item) => item.cohort === 'golden') ||
      ![...repositories.values()].some((item) => item.cohort === 'untouched')) {
    throw new Error('repository matrix must represent both cohorts');
  }

  const inventories = new Map();
  for (const [index, inventory] of ledger.eligible_file_inventories.entries()) {
    const scope = `eligible file inventory ${index}`;
    rejectUnknownKeys(inventory, [
      'cohort', 'repository_id', 'commit_sha', 'eligible_file_count',
      'eligible_file_manifest_sha256', 'ceiling_reached',
    ], scope);
    const key = `${inventory.cohort}:${inventory.repository_id}`;
    const repository = repositories.get(key);
    if (
      !repository ||
      inventory.commit_sha !== repository.commit_sha ||
      inventories.has(key) ||
      !Number.isInteger(inventory.eligible_file_count) ||
      inventory.eligible_file_count < 0 ||
      inventory.eligible_file_count >
        contractState.contract.resource_ceilings.maximum_eligible_files_per_repository ||
      !SHA256.test(inventory.eligible_file_manifest_sha256 || '') ||
      inventory.ceiling_reached !== false
    ) throw new Error(`${scope} is invalid or a resource ceiling was reached`);
    inventories.set(key, inventory);
  }
  if (inventories.size !== repositories.size) {
    throw new Error('eligible file inventories must cover the exact repository matrix');
  }

  const hits = new Map();
  for (const [index, hit] of ledger.raw_hits.entries()) {
    const scope = `raw hit ${index}`;
    rejectUnknownKeys(hit, [
      'hit_id', 'cohort', 'repository_id', 'commit_sha', 'rule_id', 'query_id', 'anchor',
      'matched_pattern_ids',
    ], scope);
    const repository = repositories.get(`${hit.cohort}:${hit.repository_id}`);
    const rule = contractState.rules.get(hit.rule_id);
    const recipe = rule?.recipes.get(hit.query_id);
    validSourceAnchor(hit.anchor, `${scope} anchor`);
    if (
      typeof hit.hit_id !== 'string' ||
      hit.hit_id !== deterministicRawHitId(hit) ||
      hits.has(hit.hit_id) ||
      !repository ||
      hit.commit_sha !== repository.commit_sha ||
      !recipe ||
      !rule.anchorKinds.has(hit.anchor.kind)
    ) throw new Error(`${scope} is invalid, duplicated, or outside the locked contract`);
    const expectedPatternIds = new Set(recipe.query_patterns.map((pattern) => pattern.pattern_id));
    if (
      !Array.isArray(hit.matched_pattern_ids) || hit.matched_pattern_ids.length < 1 ||
      !hit.matched_pattern_ids.every((patternId) => expectedPatternIds.has(patternId)) ||
      [...hit.matched_pattern_ids].sort().join('\u0000') !== hit.matched_pattern_ids.join('\u0000') ||
      new Set(hit.matched_pattern_ids).size !== hit.matched_pattern_ids.length
    ) throw new Error(`${scope} has invalid machine-readable pattern bindings`);
    hits.set(hit.hit_id, hit);
  }

  const rowHitIds = new Set();
  const rows = new Map();
  for (const [index, row] of ledger.raw_hit_rows.entries()) {
    const scope = `raw hit row ${index}`;
    rejectUnknownKeys(row, [
      'cohort', 'repository_id', 'commit_sha', 'rule_id', 'query_id', 'hit_ids',
      'observed_hit_count', 'output_manifest_sha256', 'ceiling_reached',
    ], scope);
    const repository = repositories.get(`${row.cohort}:${row.repository_id}`);
    const recipe = contractState.rules.get(row.rule_id)?.recipes.get(row.query_id);
    const key = `${row.cohort}:${row.repository_id}:${row.rule_id}:${row.query_id}`;
    const rowIds = exactUniqueStrings(row.hit_ids, `${scope} hit IDs`);
    if (
      !repository ||
      row.commit_sha !== repository.commit_sha ||
      !recipe ||
      rows.has(key) ||
      row.observed_hit_count !== rowIds.length ||
      !SHA256.test(row.output_manifest_sha256 || '') ||
      row.observed_hit_count >
        contractState.contract.resource_ceilings.maximum_hits_per_query ||
      row.ceiling_reached !== false
    ) throw new Error(`${scope} is invalid or a resource ceiling was reached`);
    for (const hitId of rowIds) {
      const hit = hits.get(hitId);
      if (
        !hit ||
        rowHitIds.has(hitId) ||
        hit.cohort !== row.cohort ||
        hit.repository_id !== row.repository_id ||
        hit.rule_id !== row.rule_id ||
        hit.query_id !== row.query_id
      ) throw new Error(`${scope} does not bind each raw hit exactly once`);
      rowHitIds.add(hitId);
    }
    if (
      row.output_manifest_sha256 !== deterministicQueryOutputManifestHash(
        row,
        rowIds.map((hitId) => hits.get(hitId)),
      )
    ) throw new Error(`${scope} output manifest does not bind its exact raw-hit set`);
    rows.set(key, row);
  }
  for (const repository of repositories.values()) {
    for (const rule of contractState.rules.values()) {
      for (const queryId of rule.recipes.keys()) {
        const key = `${repository.cohort}:${repository.repository_id}:${rule.rule_id}:${queryId}`;
        if (!rows.has(key)) throw new Error(`raw-hit matrix omits explicit row ${key}`);
      }
    }
  }
  if (
    rows.size !== repositories.size * [...contractState.rules.values()]
      .reduce((total, rule) => total + rule.recipes.size, 0) ||
    rowHitIds.size !== hits.size
  ) throw new Error('raw-hit rows do not provide total exact coverage, including zero-hit cells');

  const candidates = new Map();
  const supportedHits = new Set();
  const auditorAdded = new Set();
  for (const [index, candidate] of ledger.candidates.entries()) {
    const scope = `candidate ${index}`;
    rejectUnknownKeys(candidate, [
      'candidate_id', 'cohort', 'repository_id', 'commit_sha', 'rule_id', 'origin',
      'semantic_class', 'anchor', 'supporting_hit_ids', 'disposition', 'opportunity_id',
      'exclusion', 'reviews',
    ], scope);
    const repository = repositories.get(`${candidate.cohort}:${candidate.repository_id}`);
    const rule = contractState.rules.get(candidate.rule_id);
    validSourceAnchor(candidate.anchor, `${scope} anchor`);
    const supportingHitIds = exactUniqueStrings(candidate.supporting_hit_ids, `${scope} supporting hits`);
    if (
      typeof candidate.candidate_id !== 'string' ||
      candidate.candidate_id !== deterministicCandidateId(candidate) ||
      candidates.has(candidate.candidate_id) ||
      !repository ||
      candidate.commit_sha !== repository.commit_sha ||
      !rule ||
      !rule.anchorKinds.has(candidate.anchor.kind) ||
      !['locked_search', 'reviewer_manual', 'auditor_added'].includes(candidate.origin) ||
      ![...MAPPABLE_CLASSES, ...EXCLUDABLE_CLASSES].includes(candidate.semantic_class)
    ) throw new Error(`${scope} is invalid or outside the anchor contract`);
    if (candidate.origin === 'locked_search' && supportingHitIds.length < 1) {
      throw new Error(`${scope} from locked search must bind a raw hit`);
    }
    for (const hitId of supportingHitIds) {
      const hit = hits.get(hitId);
      if (
        !hit ||
        supportedHits.has(hitId) ||
        hit.cohort !== candidate.cohort ||
        hit.repository_id !== candidate.repository_id ||
        hit.rule_id !== candidate.rule_id
      ) throw new Error(`${scope} does not account for each raw hit exactly once`);
      supportedHits.add(hitId);
    }
    const reviews = exactUniqueStrings(
      candidate.reviews?.map((review) => review.reviewer_id),
      `${scope} reviewer IDs`,
      3,
    );
    if (
      reviews.length !== 3 ||
      canonicalize([...reviews].sort()) !==
        canonicalize([...reviewers, ledger.auditor_id].sort()) ||
      candidate.reviews.some((review) => {
        try {
          rejectUnknownKeys(
            review,
            ['reviewer_id', 'role', 'decision', 'rationale_sha256'],
            `${scope} review`,
          );
        } catch {
          return true;
        }
        return !DISCOVERY_ROLES.includes(review.role) ||
          !['opportunity', 'excluded'].includes(review.decision) ||
          !SHA256.test(review.rationale_sha256 || '');
      }) ||
      new Set(candidate.reviews.map((review) => review.role)).size !== 3 ||
      candidate.reviews.some((review) =>
        (review.role === 'primary_labeler' && review.reviewer_id !== ledger.blind_reviewers[0]) ||
        (review.role === 'independent_reviewer' && review.reviewer_id !== ledger.blind_reviewers[1]) ||
        (review.role === 'discovery_auditor' && review.reviewer_id !== ledger.auditor_id))
    ) throw new Error(`${scope} lacks three distinct complete discovery reviews`);
    const decisions = new Set(candidate.reviews.map((review) => review.decision));
    if (decisions.size !== 1 || !decisions.has(candidate.disposition)) {
      throw new Error(`${scope} has an unresolved reviewer disposition`);
    }
    if (candidate.disposition === 'opportunity') {
      if (
        !MAPPABLE_CLASSES.includes(candidate.semantic_class) ||
        typeof candidate.opportunity_id !== 'string' ||
        candidate.opportunity_id.length < 6 ||
        candidate.exclusion !== null
      ) throw new Error(`${scope} has an invalid opportunity mapping`);
    } else {
      if (MAPPABLE_CLASSES.includes(candidate.semantic_class)) {
        throw new Error(`${scope}: safe/controlled or defect candidates cannot be excluded`);
      }
      rejectUnknownKeys(candidate.exclusion, ['code', 'rationale_sha256', 'duplicate_of_candidate_id'], `${scope} exclusion`);
      if (
        typeof candidate.opportunity_id !== 'object' || candidate.opportunity_id !== null ||
        !contractState.exclusionCodes.has(candidate.exclusion.code) ||
        !SHA256.test(candidate.exclusion.rationale_sha256 || '') ||
        (candidate.semantic_class === 'duplicate' &&
          typeof candidate.exclusion.duplicate_of_candidate_id !== 'string') ||
        (candidate.semantic_class !== 'duplicate' &&
          candidate.exclusion.duplicate_of_candidate_id !== null)
      ) throw new Error(`${scope} has an invalid hash-bound exclusion`);
      const expectedCode = {
        out_of_scope: 'out_of_rule_scope',
        ineligible_source: 'ineligible_source_path',
        duplicate: 'duplicate_candidate',
      }[candidate.semantic_class];
      if (candidate.exclusion.code !== expectedCode) {
        throw new Error(`${scope} exclusion code does not match its semantic class`);
      }
    }
    if (candidate.origin === 'auditor_added') auditorAdded.add(candidate.candidate_id);
    candidates.set(candidate.candidate_id, candidate);
  }
  if (supportedHits.size !== hits.size) {
    throw new Error('candidate ledger leaves one or more raw hits unaccounted');
  }
  const candidatesPerCell = new Map();
  for (const candidate of candidates.values()) {
    const key = `${candidate.cohort}:${candidate.repository_id}:${candidate.rule_id}`;
    candidatesPerCell.set(key, (candidatesPerCell.get(key) || 0) + 1);
  }
  if ([...candidatesPerCell.values()].some((count) =>
    count > contractState.contract.resource_ceilings.maximum_candidates_per_repository_rule)) {
    throw new Error('candidate ledger exceeds a repository/rule candidate ceiling');
  }

  const opportunityBindings = new Map();
  for (const [index, binding] of ledger.opportunity_bindings.entries()) {
    const scope = `opportunity binding ${index}`;
    rejectUnknownKeys(binding, ['opportunity_id', 'candidate_id'], scope);
    const candidate = candidates.get(binding.candidate_id);
    if (
      typeof binding.opportunity_id !== 'string' ||
      opportunityBindings.has(binding.opportunity_id) ||
      !candidate ||
      candidate.disposition !== 'opportunity' ||
      candidate.opportunity_id !== binding.opportunity_id
    ) throw new Error(`${scope} is invalid, duplicated, or not bijective`);
    opportunityBindings.set(binding.opportunity_id, candidate);
  }
  const mappedCandidates = [...candidates.values()].filter((candidate) =>
    candidate.disposition === 'opportunity');
  if (
    opportunityBindings.size !== mappedCandidates.length ||
    mappedCandidates.some((candidate) => !opportunityBindings.has(candidate.opportunity_id))
  ) throw new Error('candidate/opportunity mapping is not bijective');
  for (const candidate of candidates.values()) {
    if (candidate.semantic_class !== 'duplicate') continue;
    const target = candidates.get(candidate.exclusion.duplicate_of_candidate_id);
    if (
      !target ||
      target.candidate_id === candidate.candidate_id ||
      target.cohort !== candidate.cohort ||
      target.repository_id !== candidate.repository_id ||
      target.rule_id !== candidate.rule_id
    ) throw new Error(`candidate ${candidate.candidate_id} has an invalid duplicate target`);
  }
  exactUniqueStrings(ledger.unresolved_candidate_ids, 'unresolved candidate IDs');
  if (ledger.unresolved_candidate_ids.length !== 0) {
    throw new Error('candidate ledger contains unresolved candidates');
  }
  if (!Array.isArray(ledger.resource_usage)) {
    throw new Error('candidate ledger has incomplete resource usage');
  }
  const resourceUsage = new Map();
  for (const [index, usage] of ledger.resource_usage.entries()) {
    const scope = `resource usage ${index}`;
    rejectUnknownKeys(
      usage,
      ['cohort', 'repository_id', 'eligible_files', 'raw_hits', 'candidates', 'ceiling_reached'],
      scope,
    );
    const key = `${usage.cohort}:${usage.repository_id}`;
    const inventory = inventories.get(key);
    const expectedHits = [...hits.values()].filter((hit) =>
      hit.cohort === usage.cohort && hit.repository_id === usage.repository_id).length;
    const expectedCandidates = [...candidates.values()].filter((candidate) =>
      candidate.cohort === usage.cohort && candidate.repository_id === usage.repository_id).length;
    if (
      !inventory ||
      resourceUsage.has(key) ||
      usage.eligible_files !== inventory.eligible_file_count ||
      usage.raw_hits !== expectedHits ||
      usage.candidates !== expectedCandidates ||
      usage.ceiling_reached !== false
    ) throw new Error(`${scope} is incomplete, inconsistent, or reached a ceiling`);
    resourceUsage.set(key, usage);
  }
  if (resourceUsage.size !== repositories.size) {
    throw new Error('candidate ledger resource usage does not cover every repository');
  }
  return { ledger, repositories, candidates, opportunityBindings, auditorAdded };
}

function validateAudit(audit, contractState, ledgerState) {
  rejectUnknownKeys(audit, [
    'schema_version', 'protocol_id', 'methodology_id', 'status', 'completed_at',
    'detector_output_visible', 'independent_of_rule_author', 'auditor_id', 'bindings',
    'reviewed_candidate_ids', 'auditor_added_candidate_ids', 'circulation',
    'unresolved_candidate_ids', 'resource_ceiling_exhausted', 'record_sha256',
  ], 'discovery audit');
  if (
    audit.schema_version !== '1.0.0' ||
    audit.protocol_id !== 'cejel-llm-calibration-v1' ||
    audit.methodology_id !== contractState.contract.methodology_id ||
    audit.status !== 'complete_before_detector_results' ||
    audit.detector_output_visible !== false ||
    audit.independent_of_rule_author !== true ||
    audit.auditor_id !== ledgerState.ledger.auditor_id ||
    typeof audit.completed_at !== 'string' ||
    Number.isNaN(Date.parse(audit.completed_at)) ||
    audit.resource_ceiling_exhausted !== false ||
    Date.parse(audit.completed_at) < Date.parse(ledgerState.ledger.frozen_at) ||
    Date.parse(ledgerState.ledger.frozen_at) < Date.parse(contractState.contract.locked_at) ||
    canonicalHash(audit, 'record_sha256') !== audit.record_sha256
  ) throw new Error('discovery audit is invalid, non-blind, or incomplete');
  rejectUnknownKeys(
    audit.bindings,
    ['anchor_contract_sha256', 'candidate_ledger_sha256'],
    'discovery audit bindings',
  );
  if (
    audit.bindings.anchor_contract_sha256 !== contractState.contract.contract_sha256 ||
    audit.bindings.candidate_ledger_sha256 !== ledgerState.ledger.ledger_sha256
  ) throw new Error('discovery audit does not bind the contract and candidate ledger');
  const reviewed = exactUniqueStrings(audit.reviewed_candidate_ids, 'audited candidate IDs');
  if (
    canonicalize([...reviewed].sort()) !==
      canonicalize([...ledgerState.candidates.keys()].sort())
  ) throw new Error('discovery auditor did not review the exact final candidate union');
  const added = exactUniqueStrings(audit.auditor_added_candidate_ids, 'auditor-added candidate IDs');
  if (
    canonicalize([...added].sort()) !== canonicalize([...ledgerState.auditorAdded].sort())
  ) throw new Error('discovery audit does not declare the exact auditor-added identities');
  const circulated = new Set();
  for (const [index, item] of audit.circulation.entries()) {
    const scope = `auditor-addition circulation ${index}`;
    rejectUnknownKeys(item, [
      'candidate_id', 'primary_reviewer_id', 'independent_reviewer_id',
      'primary_review_sha256', 'independent_review_sha256',
    ], scope);
    const [primary, independent] = ledgerState.ledger.blind_reviewers;
    if (
      !ledgerState.auditorAdded.has(item.candidate_id) ||
      circulated.has(item.candidate_id) ||
      item.primary_reviewer_id !== primary ||
      item.independent_reviewer_id !== independent ||
      !SHA256.test(item.primary_review_sha256 || '') ||
      !SHA256.test(item.independent_review_sha256 || '')
    ) throw new Error(`${scope} is invalid or incomplete`);
    const candidate = ledgerState.candidates.get(item.candidate_id);
    const primaryReview = candidate.reviews.find((review) => review.role === 'primary_labeler');
    const independentReview =
      candidate.reviews.find((review) => review.role === 'independent_reviewer');
    if (
      item.primary_review_sha256 !== canonicalHash(primaryReview) ||
      item.independent_review_sha256 !== canonicalHash(independentReview)
    ) throw new Error(`${scope} does not bind the two circulated review records`);
    circulated.add(item.candidate_id);
  }
  if (
    circulated.size !== ledgerState.auditorAdded.size ||
    [...ledgerState.auditorAdded].some((candidateId) => !circulated.has(candidateId))
  ) throw new Error('every auditor-added identity must circulate to both blind reviewers');
  exactUniqueStrings(audit.unresolved_candidate_ids, 'audit unresolved candidate IDs');
  if (audit.unresolved_candidate_ids.length !== 0) {
    throw new Error('discovery audit contains unresolved candidates');
  }
  return audit;
}

function validateOpportunityBijection(opportunityManifest, ledgerState) {
  if (!opportunityManifest || !Array.isArray(opportunityManifest.opportunities)) {
    throw new Error('opportunity manifest is required for candidate/opportunity bijection');
  }
  const opportunityIds = exactUniqueStrings(
    opportunityManifest.opportunities.map((item) => item?.opportunity_id),
    'opportunity manifest IDs',
  );
  if (
    canonicalize([...opportunityIds].sort()) !==
      canonicalize([...ledgerState.opportunityBindings.keys()].sort())
  ) throw new Error('opportunity manifest and candidate ledger are not bijective');
  for (const opportunity of opportunityManifest.opportunities) {
    const candidate = ledgerState.opportunityBindings.get(opportunity.opportunity_id);
    if (
      !candidate ||
      opportunity.cohort !== candidate.cohort ||
      opportunity.repository_id !== candidate.repository_id ||
      opportunity.commit_sha !== candidate.commit_sha ||
      opportunity.rule_id !== candidate.rule_id ||
      opportunity.evidence_scope?.path_or_reference !== candidate.anchor.path ||
      opportunity.evidence_scope?.start_line !== candidate.anchor.start_line ||
      opportunity.evidence_scope?.end_line !== candidate.anchor.end_line ||
      opportunity.evidence_scope?.sha256 !== candidate.anchor.content_sha256
    ) throw new Error(`opportunity ${opportunity.opportunity_id} does not use its candidate's canonical anchor`);
  }
}

export function assembleDiscoveryIntegrity(input) {
  const contractState = validateContract(input.contract);
  const ledgerState = validateLedger(input.candidateLedger, contractState);
  const audit = validateAudit(input.discoveryAudit, contractState, ledgerState);
  validateOpportunityBijection(input.opportunityManifest, ledgerState);
  const document = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    methodology_id: contractState.contract.methodology_id,
    status: 'discovery_integrity_validated',
    bindings: {
      anchor_contract_sha256: contractState.contract.contract_sha256,
      candidate_ledger_sha256: ledgerState.ledger.ledger_sha256,
      discovery_audit_sha256: audit.record_sha256,
    },
    counts: {
      repositories: ledgerState.repositories.size,
      raw_hits: ledgerState.ledger.raw_hits.length,
      candidates: ledgerState.candidates.size,
      opportunities: ledgerState.opportunityBindings.size,
      auditor_added_candidates: ledgerState.auditorAdded.size,
      unresolved_candidates: 0,
    },
  };
  return {
    ...document,
    record_sha256: canonicalHash(document),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '').replaceAll('-', '_');
    const value = argv[index + 1];
    if (!key || !value) throw new Error('every option requires a value');
    options[key] = value;
  }
  return options;
}

export function main(argv) {
  const options = parseArgs(argv);
  for (const key of ['contract', 'candidate_ledger', 'discovery_audit', 'opportunity_manifest', 'output']) {
    if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  }
  const read = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));
  const result = assembleDiscoveryIntegrity({
    contract: read(options.contract),
    candidateLedger: read(options.candidate_ledger),
    discoveryAudit: read(options.discovery_audit),
    opportunityManifest: read(options.opportunity_manifest),
  });
  let descriptor;
  try {
    descriptor = openSync(resolve(options.output), 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
