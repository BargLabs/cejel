#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (relative) => JSON.parse(readFileSync(resolve(root, relative), 'utf8'));
const policy = read('selection-policy.json');
const thresholds = read('release-thresholds.json');
const golden = read('cohorts/golden-candidates.json');
const untouched = read('cohorts/untouched-candidates-v1.2.json');
const amendments = read('cohorts/selection-amendments.json');
const replacementSelection = read('cohorts/replacement-selection-v1.2.json');
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
if (
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
}

const goldenIds = new Set(golden.repositories.map((repo) => repo.repository_id.toLowerCase()));
for (const repo of untouched.repositories) {
  if (goldenIds.has(repo.repository_id.toLowerCase())) errors.push(`cohort overlap: ${repo.repository_id}`);
}

const releaseIneligibleIds = new Set(
  [
    ...golden.repositories,
    ...untouched.repositories,
    ...retiredUntouched.repositories,
    ...reserve.repositories,
    ...(replacementSelection.classification_conflicts_excluded ?? []).map(
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
  const manifestPath = resolve(root, 'cohorts', `${cohort}-manifest-v1.2.json`);
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
