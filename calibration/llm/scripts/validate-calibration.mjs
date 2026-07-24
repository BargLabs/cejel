#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (relative) => JSON.parse(readFileSync(resolve(root, relative), 'utf8'));
const sha256File = (relative) =>
  createHash('sha256').update(readFileSync(resolve(root, relative))).digest('hex');
const policy = read('selection-policy.json');
const policyMatch = /^llm-selection-v1\.([2-9]|[1-9][0-9]+)$/.exec(policy.policy_id || '');
if (!policyMatch) throw new Error('selection policy id must match llm-selection-v1.N for N >= 2');
const cycle = `v1.${policyMatch[1]}`;
const modernCycle = Number.parseInt(policyMatch[1], 10) >= 4;
const thresholds = read('release-thresholds.json');
const golden = read(`cohorts/golden-candidates-${cycle}.json`);
const untouched = read(`cohorts/untouched-candidates-${cycle}.json`);
const amendments = read('cohorts/selection-amendments.json');
const replacementSelection = read(`cohorts/selection-${cycle}.json`);
const goldenSelection = modernCycle ? read(`cohorts/selection-golden-${cycle}.json`) : null;
const untouchedSelection = modernCycle ? read(`cohorts/selection-untouched-${cycle}.json`) : null;
const cycleReset = modernCycle ? read(`results/${cycle}-cycle-reset.json`) : null;
const priorReplacementSelection = read('cohorts/replacement-selection-v1.2.json');
const priorGolden = read('cohorts/golden-candidates.json');
const priorUntouchedV12 = read('cohorts/untouched-candidates-v1.2.json');
const development = read('development-corpus-v1.3.json');
const retiredUntouched = read('cohorts/untouched-candidates.json');
const reserve = read('cohorts/reserve-candidates.json');
const errors = [];

const canonicalize = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const sha256Canonical = (value) => createHash('sha256').update(canonicalize(value)).digest('hex');

const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const allowedLanguages = new Set(policy.strata.language);
const allowedSurfaces = new Set(policy.strata.surface);
const allowedProviders = new Set(policy.strata.provider);

if (policy.status !== 'relocked_before_detector_results' || policy.detector_results_seen !== false) {
  errors.push('selection policy is not locked before detector results');
}
if (
  amendments.protocol_id !== 'cejel-llm-calibration-v1' ||
  amendments.policy_id !== policy.policy_id ||
  amendments.supersedes_policy_id !== policy.supersedes_policy_id ||
  amendments.detector_results_seen !== false ||
  !Array.isArray(amendments.amendments) ||
  amendments.amendments.length === 0
) {
  errors.push('selection amendment log is absent, malformed, or contaminated by detector results');
}
if (!amendments.amendments.some((entry) =>
  entry.kind === 'policy_relock_before_results' && entry.to === policy.policy_id
)) errors.push('selection amendment log does not record the pre-result policy re-lock');
const { record_sha256: replacementRecordHash, ...replacementWithoutHash } = replacementSelection;
if (modernCycle) {
  const expectedSelectorSourceSha256 = cycle === 'v1.4'
    ? replacementSelection.selector_source_sha256
    : sha256File('scripts/select-replacement-cohort.mjs');
  const validateSelectionRecord = (record, cohort, candidates) => {
    const { record_sha256: recordHash, ...recordWithoutHash } = record;
    if (
      record.schema_version !== '1.0.0' ||
      record.protocol_id !== 'cejel-llm-calibration-v1' ||
      record.policy_id !== policy.policy_id ||
      record.cohort !== cohort ||
      record.detector_results_seen !== false ||
      record.source_or_labels_used_for_selection !== false ||
      record.candidate_document_sha256 !== sha256Canonical(candidates) ||
      recordHash !== sha256Canonical(recordWithoutHash) ||
      record.selected?.length !== policy.target_size_per_cohort ||
      canonicalize(record.selected.map((entry) => entry.repository_id)) !==
        canonicalize(candidates.repositories.map((entry) => entry.repository_id)) ||
      record.selector_source_sha256 !==
        expectedSelectorSourceSha256 ||
      record.selection_evidence_record_sha256 !==
        sha256File(`results/${cycle}-cycle-reset.json`) ||
      record.historical_exclusion_ledger_sha256 !==
        sha256File(`results/${cycle}-cycle-reset.json`)
    ) errors.push(`${cohort}: ${cycle} selection record is absent, malformed, or unbound`);
  };
  validateSelectionRecord(goldenSelection, 'golden', golden);
  validateSelectionRecord(untouchedSelection, 'untouched', untouched);
  const historicalIds = cycleReset?.historical_exclusions?.repository_ids || [];
  const untouchedExclusions = [...new Set([
    ...historicalIds,
    ...golden.repositories.map((repository) => repository.repository_id.toLowerCase()),
  ])].sort();
  if (
    goldenSelection.excluded_repository_count !== historicalIds.length ||
    goldenSelection.excluded_repository_ids_sha256 !== sha256Canonical(historicalIds) ||
    untouchedSelection.excluded_repository_count !== untouchedExclusions.length ||
    untouchedSelection.excluded_repository_ids_sha256 !== sha256Canonical(untouchedExclusions)
  ) errors.push(`${cycle} selection records do not bind the complete historical and sibling exclusion sets`);
  if (
    untouchedSelection.golden_sibling_candidate_sha256 !==
      sha256File(`cohorts/golden-candidates-${cycle}.json`) ||
    untouchedSelection.golden_sibling_selection_record_sha256 !==
      sha256File(`cohorts/selection-golden-${cycle}.json`)
  ) errors.push('untouched: golden sibling bindings are absent or invalid');
  const canonicalHistoricalIds = historicalIds.map((identity) => String(identity).toLowerCase());
  if (
    cycleReset?.schema_version !== '1.0.0' ||
    cycleReset?.protocol_id !== 'cejel-llm-calibration-v1' ||
    cycleReset?.cycle !== cycle ||
    cycleReset?.record_type !== 'pre_result_cycle_reset' ||
    cycleReset?.detector_results_seen_for_new_cohorts !== false ||
    cycleReset?.repository_source_or_labels_used_for_new_cohort_selection !== false ||
    cycleReset?.historical_exclusions?.repository_count !== historicalIds.length ||
    new Set(canonicalHistoricalIds).size !== canonicalHistoricalIds.length ||
    canonicalHistoricalIds.some((identity, index) => identity !== historicalIds[index]) ||
    [...canonicalHistoricalIds].sort().some((identity, index) => identity !== canonicalHistoricalIds[index]) ||
    cycleReset?.historical_exclusions?.repository_ids_sha256 !==
      sha256Canonical(canonicalHistoricalIds)
  ) errors.push(`${cycle} cycle reset or historical exclusion ledger is invalid`);
  if (
    replacementSelection.schema_version !== '1.0.0' ||
    replacementSelection.protocol_id !== 'cejel-llm-calibration-v1' ||
    replacementSelection.policy_id !== policy.policy_id ||
    replacementSelection.record_type !== 'dual_cohort_metadata_selection' ||
    replacementSelection.detector_results_seen !== false ||
    replacementSelection.source_or_labels_used_for_selection !== false ||
    replacementRecordHash !== sha256Canonical(replacementWithoutHash) ||
    replacementSelection.selector_source_sha256 !== expectedSelectorSourceSha256 ||
    replacementSelection.cycle_reset_sha256 !==
      sha256File(`results/${cycle}-cycle-reset.json`) ||
    replacementSelection.historical_repository_count !== historicalIds.length ||
    replacementSelection.historical_repository_ids_sha256 !==
      sha256Canonical(canonicalHistoricalIds) ||
    replacementSelection.cohorts?.golden?.candidate_byte_sha256 !==
      sha256File(`cohorts/golden-candidates-${cycle}.json`) ||
    replacementSelection.cohorts?.golden?.selection_record_byte_sha256 !==
      sha256File(`cohorts/selection-golden-${cycle}.json`) ||
    replacementSelection.cohorts?.untouched?.candidate_byte_sha256 !==
      sha256File(`cohorts/untouched-candidates-${cycle}.json`) ||
    replacementSelection.cohorts?.untouched?.selection_record_byte_sha256 !==
      sha256File(`cohorts/selection-untouched-${cycle}.json`)
  ) errors.push(`${cycle} dual-cohort selection envelope is absent, malformed, or unbound`);
} else if (
  replacementSelection.protocol_id !== 'cejel-llm-calibration-v1' ||
  replacementSelection.policy_id !== policy.policy_id ||
  replacementSelection.detector_results_seen !== false ||
  replacementSelection.source_or_labels_used_for_selection !== false ||
  replacementSelection.candidate_document_sha256 !== sha256Canonical(untouched) ||
  replacementRecordHash !== sha256Canonical(replacementWithoutHash) ||
  replacementSelection.selected?.length !== policy.target_size_per_cohort ||
  canonicalize(replacementSelection.selected.map((entry) => entry.repository_id)) !==
    canonicalize(untouched.repositories.map((entry) => entry.repository_id))
) errors.push('replacement selection record is absent, malformed, or does not bind the current untouched cohort');
if (
  thresholds.protocol_id !== 'cejel-llm-calibration-v1' ||
  thresholds.status !== 'locked_before_detector_results' ||
  thresholds.detector_results_seen !== false
) {
  errors.push('release thresholds are not locked before detector results');
}
if (
  thresholds.public_v1_go.minimum_precision !==
    1 - thresholds.public_v1_go.maximum_incorrect_finding_rate
) {
  errors.push('public-v1 precision and incorrect-finding thresholds are inconsistent');
}
if (
  thresholds.limited_experimental_go.minimum_precision !==
    1 - thresholds.limited_experimental_go.maximum_incorrect_finding_rate
) {
  errors.push('experimental precision and incorrect-finding thresholds are inconsistent');
}

for (const [expectedCohort, manifest] of [['golden', golden], ['untouched', untouched]]) {
  if (manifest.protocol_id !== 'cejel-llm-calibration-v1' || manifest.policy_id !== policy.policy_id) {
    errors.push(`${expectedCohort}: protocol or policy mismatch`);
  }
  if (manifest.cohort !== expectedCohort || manifest.selected_before_detector_results !== true) {
    errors.push(`${expectedCohort}: invalid cohort declaration`);
  }
  if (manifest.repositories.length !== policy.target_size_per_cohort) {
    errors.push(`${expectedCohort}: expected ${policy.target_size_per_cohort} repositories, got ${manifest.repositories.length}`);
  }
  const ids = new Set();
  for (const repo of manifest.repositories) {
    if (!repoPattern.test(repo.repository_id)) errors.push(`${expectedCohort}: invalid repository_id ${repo.repository_id}`);
    if (repo.url !== `https://github.com/${repo.repository_id}`) errors.push(`${expectedCohort}: URL mismatch for ${repo.repository_id}`);
    if (ids.has(repo.repository_id.toLowerCase())) errors.push(`${expectedCohort}: duplicate ${repo.repository_id}`);
    ids.add(repo.repository_id.toLowerCase());
    if (!allowedLanguages.has(repo.primary_language)) errors.push(`${expectedCohort}: invalid language for ${repo.repository_id}`);
    if (!allowedSurfaces.has(repo.primary_surface)) errors.push(`${expectedCohort}: invalid surface for ${repo.repository_id}`);
    if (!allowedProviders.has(repo.provider_surface)) errors.push(`${expectedCohort}: invalid provider for ${repo.repository_id}`);
    if (repo.inclusion_reason.length < 20) errors.push(`${expectedCohort}: short inclusion reason for ${repo.repository_id}`);
  }
  for (const [surface, expected] of Object.entries({
    gateway: 1,
    chat_app: 3,
    local_model: 3,
    rag: 4,
    agent_tools: 6,
    evaluation_or_framework: 7,
  })) {
    const actual = manifest.repositories.filter((repository) =>
      repository.primary_surface === surface).length;
    if (actual !== expected) errors.push(`${expectedCohort}: ${surface} quota is ${actual}, expected ${expected}`);
  }
  if (
    manifest.repositories.filter((repository) =>
      repository.primary_language === 'typescript_javascript').length < 4 ||
    manifest.repositories.filter((repository) =>
      repository.primary_language === 'python').length < 8
  ) errors.push(`${expectedCohort}: minimum language representation is not preserved`);
  for (const provider of ['anthropic', 'openai', 'local_or_open_model']) {
    if (!manifest.repositories.some((repository) => repository.provider_surface === provider)) {
      errors.push(`${expectedCohort}: required ${provider} provider surface is absent`);
    }
  }
}

const goldenIds = new Set(golden.repositories.map((repo) => repo.repository_id.toLowerCase()));
for (const repo of untouched.repositories) {
  if (goldenIds.has(repo.repository_id.toLowerCase())) errors.push(`cohort overlap: ${repo.repository_id}`);
}
if (modernCycle) {
  const historicalIds = new Set(cycleReset.historical_exclusions.repository_ids);
  for (const repository of [...golden.repositories, ...untouched.repositories]) {
    if (historicalIds.has(repository.repository_id.toLowerCase())) {
      errors.push(`historical cohort overlap: ${repository.repository_id}`);
    }
  }
}

const releaseIneligibleIds = new Set(
  [
    ...golden.repositories,
    ...untouched.repositories,
    ...priorGolden.repositories,
    ...priorUntouchedV12.repositories,
    ...retiredUntouched.repositories,
    ...reserve.repositories,
    ...(replacementSelection.classification_conflicts_excluded ?? []).map(
      (repository_id) => ({ repository_id }),
    ),
    ...(priorReplacementSelection.classification_conflicts_excluded ?? []).map(
      (repository_id) => ({ repository_id }),
    ),
  ].map((repo) => repo.repository_id.toLowerCase()),
);
if (
  development.protocol_id !== 'cejel-llm-calibration-v1' ||
  development.status !== 'frozen_before_first_scan' ||
  development.selected_from_metadata_only !== true ||
  development.detector_results_seen_before_freeze !== false ||
  development.excluded_from_all_release_cohorts !== true ||
  development.repositories?.length !== 12
) {
  errors.push('v1.3 development corpus is not frozen as development-only before scanning');
} else {
  const developmentIds = new Set();
  for (const repo of development.repositories) {
    const id = repo.repository_id?.toLowerCase();
    if (!id || !repoPattern.test(repo.repository_id)) {
      errors.push(`development: invalid repository_id ${repo.repository_id ?? '<unknown>'}`);
      continue;
    }
    if (developmentIds.has(id)) errors.push(`development: duplicate ${repo.repository_id}`);
    developmentIds.add(id);
    if (releaseIneligibleIds.has(id)) {
      errors.push(`development: repository was already used or reserved ${repo.repository_id}`);
    }
    if (
      repo.url !== `https://github.com/${repo.repository_id}` ||
      !/^[a-f0-9]{40}$/.test(repo.commit_sha ?? '') ||
      !/^[a-f0-9]{40}$/.test(repo.git_tree_sha ?? '')
    ) {
      errors.push(`development: unpinned identity ${repo.repository_id}`);
    }
  }
}

const frozen = new Map();
for (const cohort of ['golden', 'untouched']) {
  const manifestPath = resolve(root, 'cohorts', `${cohort}-manifest-${cycle}.json`);
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  frozen.set(cohort, manifest);
  const validReviewGovernance =
    (manifest.review_method === 'two_human' &&
      manifest.attestation?.method === 'internal_witness') ||
    (manifest.review_method === 'two_independent_ai' &&
      manifest.attestation?.method === 'internal_dual_ai_review') ||
    (manifest.review_method === 'two_sequential_ai_passes' &&
      manifest.attestation?.method === 'internal_ai_two_pass_review');
  if (
    manifest.cohort !== cohort ||
    manifest.status !== 'frozen' ||
    manifest.detector_results_seen_before_freeze !== false ||
    !Array.isArray(manifest.frozen_by) ||
    new Set(manifest.frozen_by).size !== 2 ||
    !validReviewGovernance ||
    !manifest.attestation?.reference?.startsWith('internal-witness:')
  ) {
    errors.push(`${cohort}: invalid immutable freeze governance fields`);
  }
  const reviewBindings = manifest.review_bindings;
  if (
    !reviewBindings ||
    ['selection_policy_sha256', 'golden_candidates_sha256', 'untouched_candidates_sha256',
      'reserve_candidates_sha256', 'selection_amendments_sha256', 'replacement_selection_sha256']
      .some((key) => !/^[a-f0-9]{64}$/.test(reviewBindings[key] || '')) ||
    !Array.isArray(reviewBindings.review_record_sha256s) ||
    reviewBindings.review_record_sha256s.length !== 2 ||
    new Set(reviewBindings.review_record_sha256s).size !== 2
  ) errors.push(`${cohort}: normative review-artifact bindings are missing or invalid`);
  if (manifest.repositories?.length !== policy.target_size_per_cohort) {
    errors.push(`${cohort}: immutable manifest repository count mismatch`);
    continue;
  }
  for (const repo of manifest.repositories) {
    if (!/^[a-f0-9]{40}$/.test(repo.commit_sha ?? '') || !/^[a-f0-9]{40}$/.test(repo.git_tree_sha ?? '')) {
      errors.push(`${cohort}: non-immutable commit or tree for ${repo.repository_id ?? '<unknown>'}`);
    }
    const { entry_sha256: entryHash, ...entryWithoutHash } = repo;
    if (entryHash !== sha256Canonical(entryWithoutHash)) {
      errors.push(`${cohort}: entry hash mismatch for ${repo.repository_id ?? '<unknown>'}`);
    }
  }
  const { manifest_sha256: manifestHash, ...manifestWithoutHash } = manifest;
  if (manifestHash !== sha256Canonical(manifestWithoutHash)) {
    errors.push(`${cohort}: manifest hash mismatch`);
  }
}
if (frozen.size === 1) errors.push('immutable freeze is partial; both cohorts must be frozen together');
if (frozen.size === 2) {
  const frozenGolden = new Set(frozen.get('golden').repositories.map((repo) => repo.repository_id.toLowerCase()));
  for (const repo of frozen.get('untouched').repositories) {
    if (frozenGolden.has(repo.repository_id.toLowerCase())) errors.push(`frozen cohort overlap: ${repo.repository_id}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({
  status: 'valid',
  policy_id: policy.policy_id,
  golden_candidates: golden.repositories.length,
  untouched_candidates: untouched.repositories.length,
  development_only_repositories: development.repositories.length,
  overlap: 0,
  immutable_freeze: frozen.size === 2 ? 'valid' : 'pending',
  release_thresholds: 'locked',
}, null, 2));
