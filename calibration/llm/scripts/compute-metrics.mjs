#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalize,
  hashManifest,
  hashRepositoryEntry,
  validateReviewBindings,
} from './freeze-cohorts.mjs';
import { validateDetectorFreezeRecord } from './freeze-detector.mjs';
import { validateGitCommitmentProof, validatePreResultCommitment } from './pre-result-commitment.mjs';
import { findProhibitedPublicClaims } from './public-claims.mjs';
import { verifyGitHubExecutionProof } from './github-execution-proof.mjs';
import { verifyPublicSurfaces } from './verify-public-surfaces.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const calibrationRoot = resolve(here, '..');
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const LOCKED_ARTIFACT_PATHS = {
  selection_policy_sha256: 'selection-policy.json',
  golden_candidates_sha256: 'cohorts/golden-candidates.json',
  untouched_candidates_sha256: 'cohorts/untouched-candidates-v1.2.json',
  reserve_candidates_sha256: 'cohorts/reserve-candidates.json',
  selection_amendments_sha256: 'cohorts/selection-amendments.json',
  replacement_selection_sha256: 'cohorts/replacement-selection-v1.2.json',
};
const COUNT_KEYS = [
  'true_positives',
  'false_negatives',
  'false_positives',
  'true_negatives',
  'abstentions',
  'eligible_scans',
  'not_applicable',
  'all_scans',
  'reviewer_agreements',
  'double_labeled_items',
  'adjudicated_items',
  'unresolved_critical_false_positives',
  'gate_blocking_matched_findings',
];
const SUMMED_RULE_KEYS = [
  'true_positives',
  'false_negatives',
  'false_positives',
  'true_negatives',
  'unresolved_critical_false_positives',
  'gate_blocking_matched_findings',
];
const CHECK_TO_REASON = {
  free_core_unchanged_without_pack: 'default free-core report changed when --pack was not selected',
  offline_scan_path_verified: 'network or model call exists in the pack scan path',
  all_findings_have_resolvable_evidence: 'a finding lacks a resolvable repository-relative evidence pointer',
  prohibited_public_claims_absent: 'a prohibited hallucination-rate, universal-safety, or complete-framework claim exists',
  untouched_blinding_preserved: 'untouched-cohort results were inspected before detector and artifact freeze',
};
export const ENABLED_RULE_IDS = [
  'LLM-IOH-001',
  'LLM-VAL-001',
  'LLM-AGY-001',
  'LLM-AGY-002',
  'LLM-DAT-001',
  'LLM-PRV-001',
  'LLM-EVL-001',
  'LLM-EVL-002',
];

function rejectUnknownKeys(value, allowed, scope) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${scope} contains unknown field(s): ${unknown.sort().join(', ')}`);
}

const wilson95 = (numerator, denominator) => {
  if (denominator === 0) return null;
  const z = 1.959963984540054;
  const p = numerator / denominator;
  const denominatorAdjustment = 1 + (z * z) / denominator;
  const center = (p + (z * z) / (2 * denominator)) / denominatorAdjustment;
  const halfWidth = (z / denominatorAdjustment) * Math.sqrt(
    (p * (1 - p) / denominator) + (z * z) / (4 * denominator * denominator),
  );
  return {
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
    method: 'wilson_95',
  };
};

export const ratio = (numerator, denominator) => denominator === 0
  ? { numerator, denominator, value: null, status: 'not_estimable' }
  : {
      numerator,
      denominator,
      value: numerator / denominator,
      confidence_interval: wilson95(numerator, denominator),
      status: 'estimated',
    };

function validateCounts(counts, scope) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new Error(`${scope}.counts must be an object`);
  }
  rejectUnknownKeys(counts, COUNT_KEYS, `${scope}.counts`);
  for (const key of COUNT_KEYS) {
    if (!Number.isInteger(counts[key]) || counts[key] < 0) {
      throw new Error(`${scope}.counts.${key} must be a non-negative integer`);
    }
  }
  if (counts.abstentions > counts.eligible_scans) {
    throw new Error(`${scope}: abstentions exceed eligible_scans`);
  }
  if (counts.eligible_scans > counts.all_scans) {
    throw new Error(`${scope}: eligible_scans exceed all_scans`);
  }
  if (counts.not_applicable > counts.all_scans) {
    throw new Error(`${scope}: not_applicable exceeds all_scans`);
  }
  if (counts.double_labeled_items > counts.adjudicated_items) {
    throw new Error(`${scope}: double_labeled_items exceed adjudicated_items`);
  }
  if (counts.reviewer_agreements > counts.double_labeled_items) {
    throw new Error(`${scope}: reviewer_agreements exceed double_labeled_items`);
  }
  if (counts.unresolved_critical_false_positives > counts.false_positives) {
    throw new Error(`${scope}: unresolved critical false positives exceed false positives`);
  }
}

function metricsForCounts(counts) {
  const tp = counts.true_positives;
  const fn = counts.false_negatives;
  const fp = counts.false_positives;
  const tn = counts.true_negatives;
  return {
    finding_recall: ratio(tp, tp + fn),
    precision: ratio(tp, tp + fp),
    incorrect_finding_rate_fdr: ratio(fp, tp + fp),
    negative_false_positive_rate: ratio(fp, fp + tn),
    abstention_rate: ratio(counts.abstentions, counts.eligible_scans),
    not_applicable_rate: ratio(counts.not_applicable, counts.all_scans),
    raw_reviewer_agreement: ratio(counts.reviewer_agreements, counts.double_labeled_items),
    double_label_coverage: ratio(counts.double_labeled_items, counts.adjudicated_items),
  };
}

function cohenKappa(pairs) {
  if (pairs.length === 0) {
    return {
      observed_agreement: null,
      expected_agreement: null,
      value: null,
      denominator: 0,
      status: 'not_estimable',
      contingency: {},
    };
  }
  const categories = [...new Set(pairs.flat())].sort();
  const contingency = Object.fromEntries(categories.map((left) => [
    left,
    Object.fromEntries(categories.map((right) => [right, 0])),
  ]));
  const leftMarginal = Object.fromEntries(categories.map((category) => [category, 0]));
  const rightMarginal = Object.fromEntries(categories.map((category) => [category, 0]));
  let agreements = 0;
  for (const [left, right] of pairs) {
    contingency[left][right] += 1;
    leftMarginal[left] += 1;
    rightMarginal[right] += 1;
    if (left === right) agreements += 1;
  }
  const observed = agreements / pairs.length;
  const expected = categories.reduce(
    (total, category) => total + ((leftMarginal[category] / pairs.length) * (rightMarginal[category] / pairs.length)),
    0,
  );
  const value = expected === 1 ? null : (observed - expected) / (1 - expected);
  return {
    observed_agreement: observed,
    expected_agreement: expected,
    value,
    denominator: pairs.length,
    status: value === null ? 'not_estimable' : 'estimated',
    contingency,
  };
}

function supportForCounts(counts) {
  return {
    positive_defects: counts.true_positives + counts.false_negatives,
    reviewed_findings: counts.true_positives + counts.false_positives,
    matched_findings_total:
      counts.true_positives + counts.false_positives + counts.gate_blocking_matched_findings,
    gate_blocking_matched_findings: counts.gate_blocking_matched_findings,
    negative_opportunities: counts.false_positives + counts.true_negatives,
    eligible_scans: counts.eligible_scans,
    all_scans: counts.all_scans,
    double_labeled_items: counts.double_labeled_items,
    adjudicated_items: counts.adjudicated_items,
  };
}

function metricFailure(metric, comparator, threshold, label) {
  if (metric.status === 'not_estimable') return `${label} is not_estimable`;
  if (!comparator(metric.value, threshold)) return `${label} ${metric.value} does not meet ${threshold}`;
  return null;
}

function evaluateGate(input, thresholds, aggregateMetrics, perRule) {
  const automaticReasons = [];
  for (const [check, reason] of Object.entries(CHECK_TO_REASON)) {
    if (input.automatic_no_go_checks[check] !== true) automaticReasons.push(reason);
  }
  const unresolvedCritical = input.counts.unresolved_critical_false_positives;
  if (input.counts.gate_blocking_matched_findings > 0) {
    automaticReasons.push(
      `${input.counts.gate_blocking_matched_findings} matched finding(s) lack a binary present/absent adjudication`,
    );
  }
  if (unresolvedCritical > thresholds.limited_experimental_go.maximum_unresolved_critical_false_positives) {
    automaticReasons.push(`${unresolvedCritical} unresolved critical false positive(s)`);
  }
  const limitedRecall = aggregateMetrics.finding_recall;
  const limitedPrecision = aggregateMetrics.precision;
  if (
    limitedRecall.status === 'estimated' &&
    limitedRecall.value < thresholds.limited_experimental_go.minimum_finding_recall
  ) {
    automaticReasons.push(
      `finding_recall ${limitedRecall.value} is below automatic floor ${thresholds.limited_experimental_go.minimum_finding_recall}`,
    );
  }
  if (
    limitedPrecision.status === 'estimated' &&
    limitedPrecision.value < thresholds.limited_experimental_go.minimum_precision
  ) {
    automaticReasons.push(
      `precision ${limitedPrecision.value} is below automatic floor ${thresholds.limited_experimental_go.minimum_precision}`,
    );
  }

  const publicThresholds = thresholds.public_v1_go;
  const publicReasons = [
    metricFailure(aggregateMetrics.finding_recall, (value, threshold) => value >= threshold, publicThresholds.minimum_finding_recall, 'finding_recall'),
    metricFailure(aggregateMetrics.precision, (value, threshold) => value >= threshold, publicThresholds.minimum_precision, 'precision'),
    metricFailure(aggregateMetrics.incorrect_finding_rate_fdr, (value, threshold) => value <= threshold, publicThresholds.maximum_incorrect_finding_rate, 'incorrect_finding_rate_fdr'),
    metricFailure(aggregateMetrics.double_label_coverage, (value, threshold) => value >= threshold, publicThresholds.minimum_double_labeled_fraction, 'double_label_coverage'),
  ].filter(Boolean);
  if (unresolvedCritical > publicThresholds.maximum_unresolved_critical_false_positives) {
    publicReasons.push('unresolved critical false positives exceed the public-v1 maximum');
  }
  for (const rule of perRule) {
    if (rule.support.positive_defects < publicThresholds.minimum_positive_defects_per_rule_for_strong_claim) {
      publicReasons.push(
        `${rule.rule_id}: positive defect support ${rule.support.positive_defects} is below ${publicThresholds.minimum_positive_defects_per_rule_for_strong_claim}`,
      );
    }
    if (rule.counts.double_labeled_items < publicThresholds.minimum_double_labeled_items_per_enabled_rule) {
      publicReasons.push(
        `${rule.rule_id}: double-labeled support ${rule.counts.double_labeled_items} is below ${publicThresholds.minimum_double_labeled_items_per_enabled_rule}`,
      );
    }
  }

  const reviewReasons = [
    metricFailure(
      aggregateMetrics.double_label_coverage,
      (value, threshold) => value >= threshold,
      publicThresholds.minimum_double_labeled_fraction,
      'double_label_coverage',
    ),
  ].filter(Boolean);
  for (const rule of perRule) {
    if (rule.counts.double_labeled_items < publicThresholds.minimum_double_labeled_items_per_enabled_rule) {
      reviewReasons.push(
        `${rule.rule_id}: double-labeled support ${rule.counts.double_labeled_items} is below ${publicThresholds.minimum_double_labeled_items_per_enabled_rule}`,
      );
    }
  }

  const limitedThresholds = thresholds.limited_experimental_go;
  const limitedReasons = [
    metricFailure(aggregateMetrics.finding_recall, (value, threshold) => value >= threshold, limitedThresholds.minimum_finding_recall, 'finding_recall'),
    metricFailure(aggregateMetrics.precision, (value, threshold) => value >= threshold, limitedThresholds.minimum_precision, 'precision'),
    metricFailure(aggregateMetrics.incorrect_finding_rate_fdr, (value, threshold) => value <= threshold, limitedThresholds.maximum_incorrect_finding_rate, 'incorrect_finding_rate_fdr'),
    ...reviewReasons,
  ].filter(Boolean);
  if (unresolvedCritical > limitedThresholds.maximum_unresolved_critical_false_positives) {
    limitedReasons.push('unresolved critical false positives exceed the limited-experimental maximum');
  }

  let verdict;
  if (automaticReasons.length > 0) verdict = 'no_go';
  else if (publicReasons.length === 0) verdict = 'public_v1';
  else if (limitedReasons.length === 0) verdict = 'limited_experimental';
  else verdict = 'no_go';

  const decisionReasons = verdict === 'public_v1'
    ? ['all public-v1 thresholds passed']
    : verdict === 'limited_experimental'
      ? ['public-v1 thresholds did not pass', ...publicReasons, 'all limited-experimental thresholds passed']
      : automaticReasons.length > 0
        ? automaticReasons
        : limitedReasons;

  return {
    verdict,
    automatic_no_go: { triggered: automaticReasons.length > 0, reasons: automaticReasons },
    public_v1: { passed: automaticReasons.length === 0 && publicReasons.length === 0, reasons: publicReasons },
    limited_experimental: {
      passed: automaticReasons.length === 0 && limitedReasons.length === 0,
      required_label: limitedThresholds.required_label,
      required_publication: limitedThresholds.required_publication,
      reasons: limitedReasons,
    },
    decision_reasons: decisionReasons,
  };
}

function collectNotEstimable(aggregateMetrics, perRule) {
  const paths = [];
  for (const [metric, value] of Object.entries(aggregateMetrics)) {
    if (value.status === 'not_estimable') paths.push(`aggregate.${metric}`);
  }
  for (const rule of perRule) {
    for (const [metric, value] of Object.entries(rule.metrics)) {
      if (value.status === 'not_estimable') paths.push(`per_rule.${rule.rule_id}.${metric}`);
    }
  }
  return paths;
}

const sha256Canonical = (value) => createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');

function productionCalibrationContract() {
  const artifacts = Object.fromEntries(Object.entries(LOCKED_ARTIFACT_PATHS).map(([key, path]) => {
    const bytes = readFileSync(resolve(calibrationRoot, path));
    return [key, { byte_sha256: sha256Bytes(bytes), document: JSON.parse(bytes.toString('utf8')) }];
  }));
  const thresholdBytes = readFileSync(resolve(calibrationRoot, 'release-thresholds.json'));
  const thresholdDocument = JSON.parse(thresholdBytes.toString('utf8'));
  const publicSurfacePolicyBytes = readFileSync(resolve(calibrationRoot, 'public-surface-policy.json'));
  const publicSurfacePolicyDocument = JSON.parse(publicSurfacePolicyBytes.toString('utf8'));
  return {
    expected_cohort_size: 24,
    artifacts,
    release_thresholds: {
      byte_sha256: sha256Bytes(thresholdBytes),
      canonical_sha256: sha256Canonical(thresholdDocument),
    },
    public_surface_policy: {
      byte_sha256: sha256Bytes(publicSurfacePolicyBytes),
      canonical_sha256: sha256Canonical(publicSurfacePolicyDocument),
      document: publicSurfacePolicyDocument,
    },
  };
}

export function hashOpportunityManifest(manifest) {
  const hashable = structuredClone(manifest);
  delete hashable.manifest_sha256;
  return sha256Canonical(hashable);
}

export function hashSourceEvidenceIndex(index) {
  const hashable = structuredClone(index);
  delete hashable.index_sha256;
  return sha256Canonical(hashable);
}

export function hashOpportunityDiscoveryCoverage(record) {
  const hashable = structuredClone(record);
  delete hashable.record_sha256;
  return sha256Canonical(hashable);
}

function gitObjectSha1(type, bytes) {
  return createHash('sha1')
    .update(Buffer.from(`${type} ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

function decodeCanonicalBase64(value, scope) {
  if (typeof value !== 'string' || value.length < 1 || value.length % 4 !== 0) {
    throw new Error(`${scope} is not canonical base64`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error(`${scope} is not canonical base64`);
  return bytes;
}

function parseGitTree(bytes, scope) {
  const entries = [];
  const names = new Set();
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    const nul = space < 0 ? -1 : bytes.indexOf(0x00, space + 1);
    if (space <= offset || nul <= space + 1 || nul + 21 > bytes.length) {
      throw new Error(`${scope} is a malformed Git tree object`);
    }
    const mode = bytes.subarray(offset, space).toString('ascii');
    const nameBytes = bytes.subarray(space + 1, nul);
    const name = nameBytes.toString('utf8');
    if (
      !/^(40000|100644|100755|120000|160000)$/.test(mode) ||
      name.length < 1 || name.includes('/') || name === '.' || name === '..' ||
      !Buffer.from(name, 'utf8').equals(nameBytes) || names.has(name)
    ) throw new Error(`${scope} contains an invalid Git tree entry`);
    names.add(name);
    entries.push({ mode, name, sha1: bytes.subarray(nul + 1, nul + 21).toString('hex') });
    offset = nul + 21;
  }
  return entries;
}

function countSourceLines(bytes, scope) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${scope} is not UTF-8 source text`);
  }
  return text.length === 0 ? 0 : text.split('\n').length;
}

function verifyGitTreeProof(file, scope) {
  const segments = file.path.split('/');
  if (
    !isRepositoryRelativePath(file.path) || file.path.includes('\\') ||
    segments.some((segment) => segment.length === 0 || segment === '.') ||
    file.tree_proof.length !== segments.length
  ) throw new Error(`${scope} has an invalid repository path or Git tree-proof depth`);

  if (file.tree_proof[0].tree_sha1 !== file.git_tree_sha) {
    throw new Error(`${scope} Git tree proof is not rooted at the frozen repository tree`);
  }
  for (const [index, proof] of file.tree_proof.entries()) {
    const treeBytes = decodeCanonicalBase64(proof.tree_base64, `${scope} tree proof ${index}`);
    if (gitObjectSha1('tree', treeBytes) !== proof.tree_sha1) {
      throw new Error(`${scope} Git tree object SHA-1 mismatch`);
    }
    const entry = parseGitTree(treeBytes, `${scope} tree proof ${index}`)
      .find((candidate) => candidate.name === segments[index]);
    if (!entry) throw new Error(`${scope} path is absent from its Git tree proof`);
    const final = index === segments.length - 1;
    if (!final) {
      if (entry.mode !== '40000' || entry.sha1 !== file.tree_proof[index + 1].tree_sha1) {
        throw new Error(`${scope} Git tree proof has a broken directory link`);
      }
    } else if (!['100644', '100755'].includes(entry.mode) || entry.sha1 !== file.blob_sha1) {
      throw new Error(`${scope} Git tree proof does not resolve to the declared source blob`);
    }
  }

  const content = decodeCanonicalBase64(file.content_base64, `${scope} content`);
  if (gitObjectSha1('blob', content) !== file.blob_sha1) {
    throw new Error(`${scope} Git blob SHA-1 mismatch`);
  }
  const contentSha256 = createHash('sha256').update(content).digest('hex');
  if (contentSha256 !== file.content_sha256) {
    throw new Error(`${scope} whole-file SHA-256 mismatch`);
  }
  return { content, lineCount: countSourceLines(content, scope) };
}

function validateSourceEvidenceIndexBinding(wrapper, golden, untouched, repositories) {
  const index = unwrapBoundDocument(wrapper, 'source evidence index');
  rejectUnknownKeys(
    index,
    ['$schema', 'schema_version', 'protocol_id', 'status', 'hash_contract', 'cohort_bindings',
      'files', 'index_sha256', 'attestation'],
    'source evidence index',
  );
  if (
    index?.schema_version !== '1.0.0' || index.protocol_id !== 'cejel-llm-calibration-v1' ||
    index.status !== 'frozen_before_detector_results' ||
    index.hash_contract !==
      'rfc8785-sha256-v1; index excludes only index_sha256; file content_sha256 hashes decoded whole-file bytes' ||
    index.cohort_bindings?.golden_manifest_sha256 !== golden.manifest_sha256 ||
    index.cohort_bindings?.untouched_manifest_sha256 !== untouched.manifest_sha256 ||
    hashSourceEvidenceIndex(index) !== index.index_sha256 ||
    !Array.isArray(index.files) || index.files.length < 1 ||
    typeof index.attestation?.method !== 'string' || index.attestation.method.length < 3 ||
    typeof index.attestation?.reference !== 'string' || index.attestation.reference.length < 8
  ) throw new Error('source evidence index binding is not a valid frozen index');
  rejectUnknownKeys(
    index.cohort_bindings,
    ['golden_manifest_sha256', 'untouched_manifest_sha256'],
    'source evidence index cohort bindings',
  );
  rejectUnknownKeys(index.attestation, ['method', 'reference'], 'source evidence index attestation');

  const files = new Map();
  for (const [fileIndex, file] of index.files.entries()) {
    const scope = `source evidence file ${fileIndex}`;
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error(`${scope} is invalid`);
    rejectUnknownKeys(
      file,
      ['cohort', 'repository_id', 'commit_sha', 'git_tree_sha', 'path', 'blob_sha1',
        'content_base64', 'content_sha256', 'tree_proof'],
      scope,
    );
    if (!Array.isArray(file.tree_proof) || file.tree_proof.length < 1) throw new Error(`${scope} is invalid`);
    for (const [proofIndex, proof] of file.tree_proof.entries()) {
      if (!proof || typeof proof !== 'object' || Array.isArray(proof)) throw new Error(`${scope} proof is invalid`);
      rejectUnknownKeys(proof, ['tree_sha1', 'tree_base64'], `${scope} tree proof ${proofIndex}`);
    }
    if (
      !['golden', 'untouched'].includes(file.cohort) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(file.repository_id || '') ||
      !/^[a-f0-9]{40}$/.test(file.commit_sha || '') || !/^[a-f0-9]{40}$/.test(file.git_tree_sha || '') ||
      !/^[a-f0-9]{40}$/.test(file.blob_sha1 || '') || !/^[a-f0-9]{64}$/.test(file.content_sha256 || '') ||
      typeof file.path !== 'string' || typeof file.content_base64 !== 'string' ||
      file.tree_proof.some((proof) =>
        !/^[a-f0-9]{40}$/.test(proof.tree_sha1 || '') ||
        typeof proof.tree_base64 !== 'string' || proof.tree_base64.length < 1)
    ) throw new Error(`${scope} is invalid`);
    const repository = repositories.get(`${file.cohort}:${file.repository_id}`);
    if (
      !repository || repository.repository.commit_sha !== file.commit_sha ||
      repository.repository.git_tree_sha !== file.git_tree_sha
    ) throw new Error(`${scope} is not bound to a frozen repository commit and tree`);
    const key = `${file.cohort}:${file.repository_id}:${file.path}`;
    if (files.has(key)) throw new Error(`duplicate source evidence path: ${key}`);
    files.set(key, { file, ...verifyGitTreeProof(file, scope) });
  }
  return { index, files };
}

function unwrapBoundDocument(wrapper, scope) {
  if (!wrapper || typeof wrapper !== 'object' || !wrapper.document) {
    throw new Error(`${scope} must contain a document and document_sha256`);
  }
  if (sha256Canonical(wrapper.document) !== wrapper.document_sha256) {
    throw new Error(`${scope} document SHA-256 mismatch`);
  }
  return wrapper.document;
}

function validateReleaseThresholdBinding(wrapper, thresholds, contract, preResultCommitment, freeze) {
  const document = unwrapBoundDocument(wrapper, 'release thresholds');
  const canonicalSha256 = sha256Canonical(document);
  if (
    wrapper.byte_sha256 !== contract.release_thresholds.byte_sha256 ||
    wrapper.document_sha256 !== contract.release_thresholds.canonical_sha256 ||
    canonicalSha256 !== contract.release_thresholds.canonical_sha256 ||
    canonicalize(document) !== canonicalize(thresholds) ||
    preResultCommitment.release_thresholds?.byte_sha256 !== contract.release_thresholds.byte_sha256 ||
    preResultCommitment.release_thresholds?.canonical_sha256 !== contract.release_thresholds.canonical_sha256 ||
    freeze.release_thresholds?.byte_sha256 !== contract.release_thresholds.byte_sha256 ||
    freeze.release_thresholds?.canonical_sha256 !== contract.release_thresholds.canonical_sha256
  ) throw new Error('release thresholds do not match the exact pre-result locked artifact');
  return {
    byte_sha256: wrapper.byte_sha256,
    canonical_sha256: wrapper.document_sha256,
  };
}

function isRepositoryRelativePath(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/.test(path) && !path.split(/[\\/]/).includes('..');
}

function validateManifestBinding(wrapper, expectedCohort) {
  const manifest = unwrapBoundDocument(wrapper, `${expectedCohort} manifest`);
  if (
    manifest.schema_version !== '1.0.0' ||
    manifest.protocol_id !== 'cejel-llm-calibration-v1' ||
    manifest.policy_id !== 'llm-selection-v1.2' ||
    manifest.cohort !== expectedCohort || manifest.status !== 'frozen' ||
    hashManifest(manifest) !== manifest.manifest_sha256 ||
    !validateReviewBindings(manifest.review_bindings)
  ) {
    throw new Error(`${expectedCohort} manifest binding is not a valid frozen manifest`);
  }
  for (const repository of manifest.repositories || []) {
    if (hashRepositoryEntry(repository) !== repository.entry_sha256) {
      throw new Error(`${expectedCohort} manifest has an invalid repository-entry binding`);
    }
  }
  return manifest;
}

function validateCohortAnchors(golden, untouched, contract) {
  const policy = contract.artifacts.selection_policy_sha256?.document;
  const goldenCandidates = contract.artifacts.golden_candidates_sha256?.document;
  const untouchedCandidates = contract.artifacts.untouched_candidates_sha256?.document;
  const reserve = contract.artifacts.reserve_candidates_sha256?.document;
  const amendments = contract.artifacts.selection_amendments_sha256?.document;
  const replacementSelection = contract.artifacts.replacement_selection_sha256?.document;
  const replacementHashable = replacementSelection ? structuredClone(replacementSelection) : null;
  if (replacementHashable) delete replacementHashable.record_sha256;
  if (
    policy?.schema_version !== '1.0.0' || policy.policy_id !== 'llm-selection-v1.2' ||
    policy.status !== 'relocked_before_detector_results' || policy.detector_results_seen !== false ||
    policy.target_size_per_cohort !== contract.expected_cohort_size ||
    reserve?.schema_version !== '1.0.0' || reserve.protocol_id !== 'cejel-llm-calibration-v1' ||
    reserve.policy_id !== policy.policy_id || !Array.isArray(reserve.repositories) ||
    amendments?.schema_version !== '1.0.0' || amendments.protocol_id !== 'cejel-llm-calibration-v1' ||
    amendments.policy_id !== policy.policy_id || amendments.detector_results_seen !== false ||
    !Array.isArray(amendments.amendments) || amendments.amendments.length < 1 ||
    replacementSelection?.schema_version !== '1.0.0' ||
    replacementSelection.protocol_id !== 'cejel-llm-calibration-v1' ||
    replacementSelection.policy_id !== policy.policy_id ||
    replacementSelection.incident_id !== 'untouched-blinding-incident-2026-07-22' ||
    replacementSelection.detector_results_seen !== false ||
    replacementSelection.source_or_labels_used_for_selection !== false ||
    !Array.isArray(replacementSelection.proposal_bindings) ||
    replacementSelection.proposal_bindings.length !== 2 ||
    new Set(replacementSelection.proposal_bindings.map((item) => item.reviewer_id.toLowerCase())).size !== 2 ||
    replacementSelection.proposal_bindings.some((item) =>
      !/^[a-f0-9]{64}$/.test(item.document_sha256 || '')) ||
    replacementSelection.candidate_document_sha256 !== sha256Canonical(untouchedCandidates) ||
    replacementSelection.record_sha256 !== sha256Canonical(replacementHashable) ||
    !Array.isArray(replacementSelection.selected) ||
    replacementSelection.selected.length !== contract.expected_cohort_size ||
    canonicalize(replacementSelection.selected.map((item) => item.repository_id)) !==
      canonicalize(untouchedCandidates.repositories.map((item) => item.repository_id))
  ) throw new Error('locked selection policy, reserve, or amendment contract is invalid');

  const expectedReviewBindings = Object.fromEntries(
    Object.entries(contract.artifacts).map(([key, artifact]) => [key, artifact.byte_sha256]),
  );
  for (const [cohort, manifest, candidates] of [
    ['golden', golden, goldenCandidates],
    ['untouched', untouched, untouchedCandidates],
  ]) {
    if (
      candidates?.schema_version !== '1.0.0' ||
      candidates.protocol_id !== 'cejel-llm-calibration-v1' ||
      candidates.policy_id !== policy.policy_id ||
      candidates.cohort !== cohort ||
      candidates.status !== 'candidate_commit_freeze_pending' ||
      candidates.selected_before_detector_results !== true ||
      !Array.isArray(candidates.repositories) ||
      candidates.repositories.length !== contract.expected_cohort_size ||
      manifest.repositories.length !== contract.expected_cohort_size
    ) throw new Error(`${cohort} cohort does not match the exact locked candidate contract`);
    for (const [key, expectedHash] of Object.entries(expectedReviewBindings)) {
      if (manifest.review_bindings[key] !== expectedHash) {
        throw new Error(`${cohort} cohort review binding does not match locked ${key}`);
      }
    }
    for (let index = 0; index < candidates.repositories.length; index += 1) {
      const candidate = candidates.repositories[index];
      const repository = manifest.repositories[index];
      for (const key of [
        'repository_id',
        'url',
        'primary_language',
        'primary_surface',
        'provider_surface',
        'inclusion_reason',
      ]) {
        if (repository?.[key] !== candidate?.[key]) {
          throw new Error(`${cohort} cohort repository order or candidate membership changed at index ${index}`);
        }
      }
    }
  }
  const goldenIds = new Set(golden.repositories.map((repository) => repository.repository_id.toLowerCase()));
  for (const repository of untouched.repositories) {
    if (goldenIds.has(repository.repository_id.toLowerCase())) {
      throw new Error(`frozen cohorts overlap at ${repository.repository_id}`);
    }
  }
}

function validatePublicSurfaceBinding(preResultCommitment, contract) {
  const policy = contract.public_surface_policy;
  if (
    policy?.document?.schema_version !== '1.0.0' ||
    policy.document.protocol_id !== 'cejel-llm-calibration-v1' ||
    policy.document.policy_id !== 'cejel-llm-public-surfaces-v1' ||
    policy.document.status !== 'locked_before_detector_results' ||
    policy.document.detector_results_seen !== false ||
    !Array.isArray(policy.document.repository_paths) ||
    !Array.isArray(policy.document.external_surfaces) ||
    preResultCommitment.public_surface_policy?.byte_sha256 !== policy.byte_sha256 ||
    preResultCommitment.public_surface_policy?.canonical_sha256 !== policy.canonical_sha256
  ) throw new Error('pre-result commitment does not bind the locked public-surface policy');
  const expected = [
    ...policy.document.repository_paths,
    ...policy.document.external_surfaces
      .filter((surface) => surface.required_before_public_release === true)
      .map((surface) => surface.url),
  ].sort();
  const observed = preResultCommitment.public_document_inventory.map((item) => item.path).sort();
  if (canonicalize(observed) !== canonicalize(expected)) {
    throw new Error('public-document inventory does not exactly cover the locked public surfaces');
  }
  return policy.document;
}

function validateOpportunityManifestBinding(wrapper, golden, untouched, repositories, sourceFiles) {
  const manifest = unwrapBoundDocument(wrapper, 'opportunity manifest');
  rejectUnknownKeys(
    manifest,
    ['$schema', 'schema_version', 'protocol_id', 'status', 'frozen_at', 'frozen_before_detector_results',
      'detector_results_seen_before_freeze', 'hash_contract', 'cohort_bindings', 'opportunities',
      'blind_label_bindings', 'manifest_sha256', 'attestation'],
    'opportunity manifest',
  );
  if (
    manifest?.schema_version !== '1.0.0' || manifest.protocol_id !== 'cejel-llm-calibration-v1' ||
    manifest.status !== 'frozen' || manifest.frozen_before_detector_results !== true ||
    manifest.detector_results_seen_before_freeze !== false ||
    manifest.hash_contract !== 'rfc8785-sha256-v1; manifest excludes only manifest_sha256' ||
    manifest.cohort_bindings?.golden_manifest_sha256 !== golden.manifest_sha256 ||
    manifest.cohort_bindings?.untouched_manifest_sha256 !== untouched.manifest_sha256 ||
    hashOpportunityManifest(manifest) !== manifest.manifest_sha256 ||
    !Array.isArray(manifest.opportunities) || manifest.opportunities.length < 2 ||
    !Array.isArray(manifest.blind_label_bindings) || manifest.blind_label_bindings.length < 2 ||
    typeof manifest.frozen_at !== 'string' || Number.isNaN(Date.parse(manifest.frozen_at)) ||
    typeof manifest.attestation?.method !== 'string' || manifest.attestation.method.length < 3 ||
    typeof manifest.attestation?.reference !== 'string' || manifest.attestation.reference.length < 8
  ) throw new Error('opportunity manifest binding is not a valid frozen inventory');
  rejectUnknownKeys(
    manifest.cohort_bindings,
    ['golden_manifest_sha256', 'untouched_manifest_sha256'],
    'opportunity manifest cohort bindings',
  );
  rejectUnknownKeys(manifest.attestation, ['method', 'reference'], 'opportunity manifest attestation');

  const opportunities = new Map();
  const evidenceKinds = new Map();
  const nonSourceScopes = new Set();
  const sourceScopes = [];
  const representedCohorts = new Set();
  for (const [index, opportunity] of manifest.opportunities.entries()) {
    const scope = `opportunity manifest item ${index}`;
    if (!opportunity || typeof opportunity !== 'object' || Array.isArray(opportunity)) {
      throw new Error(`${scope} is invalid`);
    }
    rejectUnknownKeys(
      opportunity,
      ['opportunity_id', 'cohort', 'repository_id', 'commit_sha', 'rule_id', 'evidence_scope'],
      scope,
    );
    if (opportunity?.evidence_scope && typeof opportunity.evidence_scope === 'object') {
      rejectUnknownKeys(
        opportunity.evidence_scope,
        ['kind', 'path_or_reference', 'start_line', 'end_line', 'sha256', 'rationale'],
        `${scope} evidence scope`,
      );
    }
    if (
      typeof opportunity?.opportunity_id !== 'string' ||
      !/^[a-z0-9][a-z0-9._:-]{5,160}$/.test(opportunity.opportunity_id) ||
      !['golden', 'untouched'].includes(opportunity.cohort) ||
      !ENABLED_RULE_IDS.includes(opportunity.rule_id) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(opportunity.repository_id || '') ||
      !/^[a-f0-9]{40}$/.test(opportunity.commit_sha || '') ||
      !['source_span', 'manifest_key', 'configuration', 'external_result'].includes(opportunity.evidence_scope?.kind) ||
      typeof opportunity.evidence_scope?.path_or_reference !== 'string' ||
      (opportunity.evidence_scope?.kind === 'source_span' &&
        (!isRepositoryRelativePath(opportunity.evidence_scope.path_or_reference) ||
          opportunity.evidence_scope?.start_line === undefined)) ||
      ((opportunity.evidence_scope?.start_line === undefined) !==
        (opportunity.evidence_scope?.end_line === undefined)) ||
      (opportunity.evidence_scope?.start_line !== undefined &&
        (!Number.isInteger(opportunity.evidence_scope.start_line) || opportunity.evidence_scope.start_line < 1 ||
          !Number.isInteger(opportunity.evidence_scope.end_line) ||
          opportunity.evidence_scope.end_line < opportunity.evidence_scope.start_line)) ||
      !/^[a-f0-9]{64}$/.test(opportunity.evidence_scope?.sha256 || '') ||
      typeof opportunity.evidence_scope?.rationale !== 'string' ||
      opportunity.evidence_scope.rationale.length < 20
    ) throw new Error(`${scope} is invalid`);
    if (opportunities.has(opportunity.opportunity_id)) {
      throw new Error(`duplicate predefined opportunity_id: ${opportunity.opportunity_id}`);
    }
    const evidenceIdentity = canonicalize({
      cohort: opportunity.cohort,
      repository_id: opportunity.repository_id,
      commit_sha: opportunity.commit_sha,
      rule_id: opportunity.rule_id,
      path_or_reference: opportunity.evidence_scope.path_or_reference,
    });
    const priorKind = evidenceKinds.get(evidenceIdentity);
    if (priorKind && priorKind !== opportunity.evidence_scope.kind) {
      throw new Error(`${scope} reuses an evidence identity with another scope kind`);
    }
    evidenceKinds.set(evidenceIdentity, opportunity.evidence_scope.kind);
    if (opportunity.evidence_scope.kind === 'source_span') {
      if (sourceScopes.some((prior) =>
        prior.identity === evidenceIdentity &&
        prior.startLine <= opportunity.evidence_scope.end_line &&
        opportunity.evidence_scope.start_line <= prior.endLine
      )) throw new Error(`${scope} overlaps another same-rule source opportunity`);
      sourceScopes.push({
        identity: evidenceIdentity,
        startLine: opportunity.evidence_scope.start_line,
        endLine: opportunity.evidence_scope.end_line,
      });
    } else {
      if (nonSourceScopes.has(evidenceIdentity)) {
        throw new Error(`${scope} duplicates another same-rule non-source opportunity`);
      }
      nonSourceScopes.add(evidenceIdentity);
    }
    const expected = repositories.get(`${opportunity.cohort}:${opportunity.repository_id}`);
    if (!expected || expected.repository.commit_sha !== opportunity.commit_sha) {
      throw new Error(`${scope} is not bound to a frozen repository`);
    }
    if (opportunity.evidence_scope.kind === 'source_span') {
      const source = sourceFiles.get(
        `${opportunity.cohort}:${opportunity.repository_id}:${opportunity.evidence_scope.path_or_reference}`,
      );
      if (!source) throw new Error(`${scope} source path is absent from the frozen source evidence index`);
      if (source.file.content_sha256 !== opportunity.evidence_scope.sha256) {
        throw new Error(`${scope} source SHA-256 does not match the verified whole file`);
      }
      if (opportunity.evidence_scope.end_line > source.lineCount) {
        throw new Error(`${scope} source line bounds exceed the verified whole file`);
      }
    }
    representedCohorts.add(opportunity.cohort);
    opportunities.set(opportunity.opportunity_id, opportunity);
  }
  if (!representedCohorts.has('golden') || !representedCohorts.has('untouched')) {
    throw new Error('opportunity manifest must contain predefined opportunities for both cohorts');
  }
  const blindLabelBindings = new Map();
  for (const [index, binding] of manifest.blind_label_bindings.entries()) {
    const scope = `opportunity manifest blind-label binding ${index}`;
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw new Error(`${scope} is invalid`);
    rejectUnknownKeys(binding, ['label_id', 'document_sha256', 'role'], scope);
    if (
      !/^llm-label-[a-z0-9-]{8,80}$/.test(binding.label_id || '') ||
      !/^[a-f0-9]{64}$/.test(binding.document_sha256 || '') ||
      !['primary_labeler', 'independent_reviewer', 'adjudicator'].includes(binding.role) ||
      blindLabelBindings.has(binding.label_id)
    ) throw new Error(`${scope} is invalid or duplicated`);
    blindLabelBindings.set(binding.label_id, binding);
  }
  return { manifest, opportunities, blindLabelBindings };
}

function validateOpportunityDiscoveryCoverage(
  wrapper,
  golden,
  untouched,
  sourceEvidenceIndex,
  opportunityManifest,
  opportunities,
  repositories,
) {
  const record = unwrapBoundDocument(wrapper, 'opportunity-discovery coverage');
  rejectUnknownKeys(
    record,
    ['schema_version', 'protocol_id', 'status', 'frozen_at', 'detector_results_seen_before_freeze',
      'review_method', 'blind_reviewers', 'bindings', 'coverage', 'record_sha256'],
    'opportunity-discovery coverage',
  );
  if (
    record?.schema_version !== '1.0.0' ||
    record.protocol_id !== 'cejel-llm-calibration-v1' ||
    record.status !== 'frozen_before_detector_results' ||
    record.detector_results_seen_before_freeze !== false ||
    !['two_human', 'two_independent_ai'].includes(record.review_method) ||
    !Array.isArray(record.blind_reviewers) ||
    record.blind_reviewers.length !== 2 ||
    new Set(record.blind_reviewers.map((reviewer) => String(reviewer).trim().toLowerCase())).size !== 2 ||
    record.blind_reviewers.some((reviewer) => typeof reviewer !== 'string' || reviewer.trim().length < 3) ||
    typeof record.frozen_at !== 'string' || Number.isNaN(Date.parse(record.frozen_at)) ||
    record.bindings?.golden_manifest_sha256 !== golden.manifest_sha256 ||
    record.bindings?.untouched_manifest_sha256 !== untouched.manifest_sha256 ||
    record.bindings?.source_evidence_index_sha256 !== sourceEvidenceIndex.index_sha256 ||
    record.bindings?.opportunity_manifest_sha256 !== opportunityManifest.manifest_sha256 ||
    !Array.isArray(record.coverage) ||
    hashOpportunityDiscoveryCoverage(record) !== record.record_sha256
  ) throw new Error('opportunity-discovery coverage is not a valid independent frozen record');
  rejectUnknownKeys(
    record.bindings,
    ['golden_manifest_sha256', 'untouched_manifest_sha256', 'source_evidence_index_sha256',
      'opportunity_manifest_sha256'],
    'opportunity-discovery coverage bindings',
  );

  const rows = new Map();
  for (const [index, row] of record.coverage.entries()) {
    const scope = `opportunity-discovery coverage row ${index}`;
    rejectUnknownKeys(
      row,
      ['cohort', 'repository_id', 'commit_sha', 'rule_id', 'declared_opportunity_ids'],
      scope,
    );
    const repository = repositories.get(`${row?.cohort}:${row?.repository_id}`);
    if (
      !repository ||
      row.commit_sha !== repository.repository.commit_sha ||
      !ENABLED_RULE_IDS.includes(row.rule_id) ||
      !Array.isArray(row.declared_opportunity_ids) ||
      new Set(row.declared_opportunity_ids).size !== row.declared_opportunity_ids.length ||
      row.declared_opportunity_ids.some((id) => typeof id !== 'string' || !opportunities.has(id))
    ) throw new Error(`${scope} is invalid or not bound to a frozen repository/rule`);
    const key = `${row.cohort}:${row.repository_id}:${row.rule_id}`;
    if (rows.has(key)) throw new Error(`duplicate opportunity-discovery coverage row: ${key}`);
    const expectedIds = [...opportunities.values()]
      .filter((opportunity) =>
        opportunity.cohort === row.cohort &&
        opportunity.repository_id === row.repository_id &&
        opportunity.rule_id === row.rule_id)
      .map((opportunity) => opportunity.opportunity_id)
      .sort();
    if (canonicalize([...row.declared_opportunity_ids].sort()) !== canonicalize(expectedIds)) {
      throw new Error(`${scope} does not declare the exact frozen opportunities`);
    }
    rows.set(key, row);
  }
  for (const { cohort, repository } of repositories.values()) {
    for (const ruleId of ENABLED_RULE_IDS) {
      if (!rows.has(`${cohort}:${repository.repository_id}:${ruleId}`)) {
        throw new Error(`opportunity-discovery coverage omits ${cohort}:${repository.repository_id}:${ruleId}`);
      }
    }
  }
  if (rows.size !== repositories.size * ENABLED_RULE_IDS.length) {
    throw new Error('opportunity-discovery coverage contains rows outside the exact repository/rule matrix');
  }
  return record;
}

function validateLabelRecord(label, scope) {
  if (!label || typeof label !== 'object' || Array.isArray(label)) throw new Error(`${scope} is not a valid label record`);
  rejectUnknownKeys(
    label,
    ['schema_version', 'protocol_id', 'label_id', 'cohort', 'repository', 'rule', 'opportunity_id',
      'detector_finding_id', 'label', 'evidence', 'review', 'created_at'],
    scope,
  );
  if (label.repository && typeof label.repository === 'object') {
    rejectUnknownKeys(label.repository, ['repository_id', 'commit_sha'], `${scope} repository`);
  }
  if (label.rule && typeof label.rule === 'object') {
    rejectUnknownKeys(label.rule, ['catalogue_id', 'rule_id', 'rule_version'], `${scope} rule`);
  }
  if (label.review && typeof label.review === 'object') {
    rejectUnknownKeys(
      label.review,
      ['labeler_id', 'role', 'independent_of_rule_author', 'detector_output_visible',
        'adjudication_status', 'supersedes_label_ids', 'rationale'],
      `${scope} review`,
    );
  }
  for (const [index, item] of (Array.isArray(label.evidence) ? label.evidence : []).entries()) {
    rejectUnknownKeys(
      item,
      ['kind', 'path_or_reference', 'start_line', 'end_line', 'sha256', 'rationale'],
      `${scope} evidence ${index}`,
    );
  }
  if (
    label?.schema_version !== '1.0.0' || label?.protocol_id !== 'cejel-llm-calibration-v1' ||
    !/^llm-label-[a-z0-9-]{8,80}$/.test(label.label_id || '') ||
    !['golden', 'untouched'].includes(label.cohort) ||
    !ENABLED_RULE_IDS.includes(label.rule?.rule_id) ||
    label.rule?.catalogue_id !== 'llm-rules-v1' || label.rule?.rule_version !== '1.0.0' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(label.repository?.repository_id || '') ||
    !/^[a-f0-9]{40}$/.test(label.repository?.commit_sha || '') ||
    typeof label.opportunity_id !== 'string' || label.opportunity_id.length < 6 ||
    !['present', 'absent', 'ambiguous', 'not_applicable', 'insufficient_source'].includes(label.label) ||
    !Array.isArray(label.evidence) || label.evidence.length < 1 || label.evidence.some((item) =>
      !item || !['source_span', 'manifest_key', 'configuration', 'external_result'].includes(item.kind) ||
      typeof item.path_or_reference !== 'string' || item.path_or_reference.length < 1 ||
      (item.kind === 'source_span' && (!isRepositoryRelativePath(item.path_or_reference) ||
        !Number.isInteger(item.start_line) || item.start_line < 1 ||
        !Number.isInteger(item.end_line) || item.end_line < item.start_line)) ||
      ((item.start_line === undefined) !== (item.end_line === undefined)) ||
      !/^[a-f0-9]{64}$/.test(item.sha256 || '') || typeof item.rationale !== 'string' || item.rationale.length < 20
    ) ||
    typeof label.review?.labeler_id !== 'string' || label.review.labeler_id.length < 3 ||
    !['primary_labeler', 'independent_reviewer', 'adjudicator', 'finding_reviewer'].includes(label.review.role) ||
    label.review.independent_of_rule_author !== true ||
    !['not_required', 'pending', 'adjudicated'].includes(label.review.adjudication_status) ||
    typeof label.created_at !== 'string' || Number.isNaN(Date.parse(label.created_at))
  ) throw new Error(`${scope} is not a valid label record`);
  if (
    ['primary_labeler', 'independent_reviewer', 'adjudicator'].includes(label.review.role) &&
    label.review.detector_output_visible !== false
  ) throw new Error(`${scope} first-pass label must be blind to detector output`);
  if (
    label.review.role === 'adjudicator' &&
    (!Array.isArray(label.review.supersedes_label_ids) || label.review.supersedes_label_ids.length < 2 ||
      typeof label.review.rationale !== 'string' || label.review.rationale.length < 20 ||
      label.review.detector_output_visible !== false || label.review.adjudication_status !== 'adjudicated')
  ) throw new Error(`${scope} has an invalid adjudication record`);
  if (
    label.review.role === 'finding_reviewer' &&
    (label.review.detector_output_visible !== true || label.review.adjudication_status !== 'not_required' ||
      !/^llm-finding-[a-f0-9]{64}$/.test(label.detector_finding_id || ''))
  ) throw new Error(`${scope} has an invalid post-run finding-review record`);
  if (label.review.role !== 'finding_reviewer' && label.detector_finding_id != null) {
    throw new Error(`${scope} blind ground-truth labels cannot carry detector finding IDs`);
  }
  return label;
}

function evidenceItemExactlyMatchesScope(item, scope) {
  return item.kind === scope.kind &&
    item.path_or_reference === scope.path_or_reference &&
    item.sha256 === scope.sha256 &&
    item.start_line === scope.start_line &&
    item.end_line === scope.end_line;
}

function findingEvidenceMatchesOpportunity(finding, opportunity) {
  const scope = opportunity.evidence_scope;
  if (finding.evidence.path !== scope.path_or_reference) return false;
  if (scope.start_line === undefined) return true;
  return finding.evidence.line >= scope.start_line && finding.evidence.line <= scope.end_line;
}

function deriveCheckSpecificAssertion(checkId, payload, context) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (checkId === 'free_core_unchanged_without_pack') {
    rejectUnknownKeys(payload, ['fixture', 'baseline', 'candidate'], 'free-core parity evidence');
    const validateRun = (run, scope) => {
      rejectUnknownKeys(
        run,
        ['git_commit', 'executable_sha256', 'argv', 'stdout_base64', 'stderr_base64', 'exit_code'],
        `free-core parity ${scope}`,
      );
      return /^[a-f0-9]{40}$/.test(run.git_commit || '') &&
        /^[a-f0-9]{64}$/.test(run.executable_sha256 || '') &&
        Array.isArray(run.argv) && run.argv.length >= 2 && run.argv[0] === 'scan' &&
        !run.argv.includes('--pack') && run.argv.every((part) => typeof part === 'string') &&
        run.exit_code === 0;
    };
    if (!payload.fixture || typeof payload.fixture !== 'object') return false;
    rejectUnknownKeys(payload.fixture, ['path', 'tree_sha256'], 'free-core parity fixture');
    if (payload.fixture.path !== 'src/packs/llm/__tests__/fixtures' ||
      !/^[a-f0-9]{64}$/.test(payload.fixture.tree_sha256 || '')) return false;
    if (!validateRun(payload.baseline, 'baseline') || !validateRun(payload.candidate, 'candidate')) {
      return false;
    }
    const baselineStdout = Buffer.from(payload.baseline.stdout_base64 || '', 'base64');
    const candidateStdout = Buffer.from(payload.candidate.stdout_base64 || '', 'base64');
    const baselineStderr = Buffer.from(payload.baseline.stderr_base64 || '', 'base64');
    const candidateStderr = Buffer.from(payload.candidate.stderr_base64 || '', 'base64');
    return payload.candidate.git_commit === context.freeze.detector.git_commit &&
      payload.candidate.executable_sha256 === context.freeze.detector.build_sha256 &&
      payload.baseline.git_commit === context.preResultCommitment.free_core_baseline_commit &&
      payload.baseline.git_commit !== payload.candidate.git_commit &&
      canonicalize(payload.baseline.argv) === canonicalize(payload.candidate.argv) &&
      baselineStdout.length > 0 && baselineStdout.equals(candidateStdout) &&
      baselineStderr.equals(candidateStderr);
  }
  if (checkId === 'prohibited_public_claims_absent') {
    rejectUnknownKeys(payload, ['documents'], 'public-claim evidence');
    if (!Array.isArray(payload.documents) || payload.documents.length < 1) return false;
    const observed = payload.documents.map((document) => {
      rejectUnknownKeys(document, ['path', 'content', 'sha256'], 'public-claim document');
      if (!((isRepositoryRelativePath(document.path) || /^https:\/\//.test(document.path)) &&
        typeof document.content === 'string' &&
        sha256Bytes(Buffer.from(document.content, 'utf8')) === document.sha256 &&
        findProhibitedPublicClaims(document.content).length === 0)) return null;
      return { path: document.path, content_sha256: document.sha256 };
    });
    if (observed.includes(null) || new Set(observed.map((item) => item.path)).size !== observed.length) return false;
    const sort = (items) => [...items].sort((a, b) => a.path.localeCompare(b.path));
    return canonicalize(sort(observed)) === canonicalize(sort(context.publicDocumentInventory));
  }
  if (checkId === 'offline_scan_path_verified') {
    rejectUnknownKeys(payload, ['executions'], 'network-isolation evidence');
    const expected = [...context.receipts.values()].map((receipt) => ({
      cohort: receipt.cohort, repository_id: receipt.repository_id,
      network_isolation_mode: receipt.network_isolation_mode, no_egress_confirmed: true,
    })).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)));
    return canonicalize(payload.executions) === canonicalize(expected) && expected.every((item) =>
      item.network_isolation_mode === context.freeze.execution.network_isolation.mode
    );
  }
  if (checkId === 'all_findings_have_resolvable_evidence') {
    rejectUnknownKeys(payload, ['findings'], 'finding-path evidence');
    const expected = [...context.findings.entries()].map(([finding_id, finding]) => ({
      finding_id, path: finding.evidence.path, line: finding.evidence.line,
    })).sort((a, b) => a.finding_id.localeCompare(b.finding_id));
    return canonicalize(payload.findings) === canonicalize(expected) && expected.every((item) =>
      isRepositoryRelativePath(item.path) && Number.isInteger(item.line) && item.line >= 1
    );
  }
  if (checkId === 'untouched_blinding_preserved') {
    rejectUnknownKeys(payload, ['executions'], 'chronology evidence');
    const expected = [...context.receipts.values()].filter((receipt) => receipt.cohort === 'untouched').map((receipt) => ({
      repository_id: receipt.repository_id,
      commitment_git_oid: receipt.pre_result_commitment.git_proof.commit_oid,
      commitment_time_unix: receipt.pre_result_commitment.git_proof.committed_at_unix,
      completed_at: receipt.completed_at,
    })).sort((a, b) => a.repository_id.localeCompare(b.repository_id));
    return canonicalize(payload.executions) === canonicalize(expected) && expected.every((item) =>
      item.commitment_time_unix * 1000 < Date.parse(item.completed_at)
    );
  }
  return false;
}

function validateAutomaticCheckRecord(wrapper, checkId, derivedStatus, requiredEvidenceKind, freeze, context) {
  const requiredAssertionNames = {
    free_core_unchanged_without_pack: 'default_without_pack_byte_identical',
    offline_scan_path_verified: 'network_isolation_receipts_match',
    all_findings_have_resolvable_evidence: 'all_finding_paths_cryptographically_resolved',
    prohibited_public_claims_absent: 'prohibited_claim_scan_zero_matches',
    untouched_blinding_preserved: 'pre_result_git_commit_precedes_execution',
  };
  const document = unwrapBoundDocument(wrapper, `automatic no-go evidence ${checkId}`);
  if (document && typeof document === 'object') {
    rejectUnknownKeys(
      document,
      ['schema_version', 'protocol_id', 'check_id', 'observed_at', 'detector_binding', 'artifacts'],
      `automatic no-go evidence ${checkId}`,
    );
    if (document.detector_binding && typeof document.detector_binding === 'object') {
      rejectUnknownKeys(
        document.detector_binding,
        ['build_sha256', 'source_commit'],
        `automatic no-go evidence ${checkId} detector binding`,
      );
    }
    for (const [index, item] of (Array.isArray(document.artifacts) ? document.artifacts : []).entries()) {
      rejectUnknownKeys(
        item,
        ['kind', 'name', 'media_type', 'encoding', 'content', 'sha256'],
        `automatic no-go evidence ${checkId} artifact ${index}`,
      );
    }
  }
  if (
    document?.schema_version !== '1.0.0' || document?.protocol_id !== 'cejel-llm-calibration-v1' ||
    document?.check_id !== checkId ||
    typeof document.observed_at !== 'string' || Number.isNaN(Date.parse(document.observed_at)) ||
    document.detector_binding?.build_sha256 !== freeze.detector.build_sha256 ||
    document.detector_binding?.source_commit !== freeze.detector.git_commit ||
    !Array.isArray(document.artifacts) || document.artifacts.length !== 1 ||
    document.artifacts.some((item) =>
      !item || !['test_run', 'network_isolation_audit', 'derived_finding_path_audit',
        'claim_audit', 'chronology_audit'].includes(item.kind) ||
      typeof item.name !== 'string' || item.name.length < 3 || item.media_type !== 'application/json' ||
      item.encoding !== 'utf8' || typeof item.content !== 'string' ||
      !/^[a-f0-9]{64}$/.test(item.sha256 || '') ||
      createHash('sha256').update(Buffer.from(item.content, 'utf8')).digest('hex') !== item.sha256
    )
  ) throw new Error(`automatic no-go evidence ${checkId} is invalid`);
  const artifact = document.artifacts.find((item) => item.kind === requiredEvidenceKind);
  if (!artifact) {
    throw new Error(`automatic no-go evidence ${checkId} requires ${requiredEvidenceKind} evidence`);
  }
  let audit;
  try {
    audit = JSON.parse(artifact.content);
  } catch {
    throw new Error(`automatic no-go evidence ${checkId} artifact is not valid JSON`);
  }
  rejectUnknownKeys(
    audit,
    ['schema_version', 'protocol_id', 'check_id', 'detector_build_sha256',
      'detector_source_commit', 'generated_at', 'passed', 'assertions'],
    `automatic no-go evidence ${checkId} audit`,
  );
  if (!Array.isArray(audit.assertions) || audit.assertions.length < 1) {
    throw new Error(`automatic no-go evidence ${checkId} audit lacks assertions`);
  }
  for (const [index, assertion] of audit.assertions.entries()) {
    rejectUnknownKeys(assertion, ['name', 'passed', 'evidence_content', 'evidence_sha256'], `${checkId} assertion ${index}`);
    if (
      typeof assertion.name !== 'string' || assertion.name.length < 3 ||
      typeof assertion.passed !== 'boolean' || typeof assertion.evidence_content !== 'string' ||
      assertion.evidence_content.length < 2 || !/^[a-f0-9]{64}$/.test(assertion.evidence_sha256 || '') ||
      createHash('sha256').update(Buffer.from(assertion.evidence_content, 'utf8')).digest('hex') !==
        assertion.evidence_sha256
    ) throw new Error(`automatic no-go evidence ${checkId} assertion ${index} is invalid`);
  }
  if (
    audit.schema_version !== '1.0.0' || audit.protocol_id !== 'cejel-llm-calibration-v1' ||
    audit.check_id !== checkId || audit.detector_build_sha256 !== freeze.detector.build_sha256 ||
    audit.detector_source_commit !== freeze.detector.git_commit ||
    typeof audit.generated_at !== 'string' || Number.isNaN(Date.parse(audit.generated_at)) ||
    typeof audit.passed !== 'boolean' ||
    audit.passed !== audit.assertions.every((assertion) => assertion.passed)
  ) throw new Error(`automatic no-go evidence ${checkId} audit binding or result is invalid`);
  if (!audit.assertions.some((assertion) => assertion.name === requiredAssertionNames[checkId])) {
    throw new Error(`automatic no-go evidence ${checkId} lacks its required check-specific assertion`);
  }
  const requiredAssertion = audit.assertions.find((assertion) => assertion.name === requiredAssertionNames[checkId]);
  let payload;
  try {
    payload = JSON.parse(requiredAssertion.evidence_content);
  } catch {
    throw new Error(`automatic no-go evidence ${checkId} check-specific payload is not valid JSON`);
  }
  const passed = deriveCheckSpecificAssertion(checkId, payload, context);
  if (requiredAssertion.passed !== passed || audit.passed !== passed || audit.assertions.length !== 1) {
    throw new Error(`automatic no-go evidence ${checkId} result is not derived from its check-specific payload`);
  }
  if (typeof derivedStatus === 'boolean' && passed !== derivedStatus) {
    throw new Error(`automatic no-go evidence ${checkId} contradicts derived evidence`);
  }
  return { passed, document_sha256: wrapper.document_sha256 };
}

function deriveAutomaticNoGoChecks(input, freeze, untouched, receipts, findings, preResultCommitment) {
  const records = input.automatic_no_go_evidence;
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    throw new Error('automatic_no_go_evidence must be an object of content-addressed records');
  }
  rejectUnknownKeys(records, Object.keys(CHECK_TO_REASON), 'automatic_no_go_evidence');
  const offline = freeze.execution?.network_isolation?.explicitly_confirmed === true &&
    [...receipts.values()].every((receipt) =>
      receipt.network_isolation_mode === freeze.execution.network_isolation.mode
    );
  const freezeTime = Date.parse(freeze.frozen_at);
  const chronology = freeze.untouched_results_seen_before_freeze === false &&
    Date.parse(untouched.frozen_at) <= freezeTime &&
    [...receipts.values()].filter((receipt) => receipt.cohort === 'untouched').every((receipt) =>
      typeof receipt.completed_at === 'string' && Date.parse(receipt.completed_at) > freezeTime
    );
  const pathsResolvable = [...findings.values()].every((finding) => {
    const path = finding?.evidence?.path;
    return typeof path === 'string' && path.length > 0 && !path.startsWith('/') &&
      !/^[A-Za-z]:[\\/]/.test(path) && !path.split(/[\\/]/).includes('..') &&
      Number.isInteger(finding?.evidence?.line) && finding.evidence.line >= 1;
  });
  const rules = {
    free_core_unchanged_without_pack: { derived: undefined, kind: 'test_run' },
    offline_scan_path_verified: { derived: offline, kind: 'network_isolation_audit' },
    all_findings_have_resolvable_evidence: { derived: pathsResolvable, kind: 'derived_finding_path_audit' },
    prohibited_public_claims_absent: { derived: undefined, kind: 'claim_audit' },
    untouched_blinding_preserved: { derived: chronology, kind: 'chronology_audit' },
  };
  const checks = {};
  const bindings = {};
  for (const [checkId, rule] of Object.entries(rules)) {
    const validated = validateAutomaticCheckRecord(
      records[checkId], checkId, rule.derived, rule.kind, freeze,
      {
        freeze,
        receipts,
        findings,
        preResultCommitment,
        publicDocumentInventory: preResultCommitment.public_document_inventory,
      },
    );
    checks[checkId] = validated.passed;
    bindings[checkId] = validated.document_sha256;
  }
  return { checks, bindings };
}

export function deriveCountsFromEvidence(
  input,
  thresholds,
  calibrationContract = productionCalibrationContract(),
  trustedExecutionVerification,
  publicSurfaceVerification,
) {
  const evidence = input.evidence;
  if (!evidence || typeof evidence !== 'object') throw new Error('measurement evidence is required');
  const golden = validateManifestBinding(evidence.golden_manifest, 'golden');
  const untouched = validateManifestBinding(evidence.untouched_manifest, 'untouched');
  validateCohortAnchors(golden, untouched, calibrationContract);
  const freeze = validateDetectorFreezeRecord(unwrapBoundDocument(evidence.detector_freeze, 'detector freeze'));
  if (freeze.golden_correction_ledger?.golden_manifest_sha256 !== golden.manifest_sha256) {
    throw new Error('detector freeze is not bound to the golden manifest');
  }

  const manifests = new Map([['golden', golden], ['untouched', untouched]]);
  const repositories = new Map();
  for (const [cohort, manifest] of manifests) {
    for (const repository of manifest.repositories) {
      const key = `${cohort}:${repository.repository_id}`;
      if (repositories.has(key)) throw new Error(`duplicate manifest repository: ${key}`);
      repositories.set(key, { cohort, manifest, repository });
    }
  }

  const { index: sourceEvidenceIndex, files: sourceFiles } = validateSourceEvidenceIndexBinding(
    evidence.source_evidence_index,
    golden,
    untouched,
    repositories,
  );

  const { manifest: opportunityManifest, opportunities, blindLabelBindings } = validateOpportunityManifestBinding(
    evidence.opportunity_manifest,
    golden,
    untouched,
    repositories,
    sourceFiles,
  );
  const preResultCommitment = validatePreResultCommitment(
    unwrapBoundDocument(evidence.pre_result_commitment, 'pre-result commitment'),
  );
  if (
    preResultCommitment.golden_manifest_sha256 !== golden.manifest_sha256 ||
    preResultCommitment.untouched_manifest_sha256 !== untouched.manifest_sha256 ||
    preResultCommitment.opportunity_manifest_sha256 !== opportunityManifest.manifest_sha256 ||
    canonicalize(preResultCommitment.blind_label_bindings) !==
      canonicalize(opportunityManifest.blind_label_bindings)
  ) throw new Error('pre-result commitment does not match frozen manifests and blind labels');
  validatePublicSurfaceBinding(preResultCommitment, calibrationContract);
  if (
    !publicSurfaceVerification ||
    publicSurfaceVerification.policy_document_sha256 !==
      calibrationContract.public_surface_policy.canonical_sha256 ||
    canonicalize(publicSurfaceVerification.repository_paths) !== canonicalize(
      preResultCommitment.public_document_inventory
        .filter((item) => calibrationContract.public_surface_policy.document.repository_paths.includes(item.path)),
    ) ||
    canonicalize((publicSurfaceVerification.external_surfaces || []).map((item) => item.url).sort()) !==
      canonicalize(
        calibrationContract.public_surface_policy.document.external_surfaces
          .map((item) => item.url).sort(),
      )
  ) throw new Error('measurement lacks live-authenticated public-surface verification');
  const opportunityDiscoveryCoverage = validateOpportunityDiscoveryCoverage(
    evidence.opportunity_discovery_coverage,
    golden,
    untouched,
    sourceEvidenceIndex,
    opportunityManifest,
    opportunities,
    repositories,
  );
  if (
    preResultCommitment.opportunity_discovery_coverage_sha256 !==
      opportunityDiscoveryCoverage.record_sha256
  ) throw new Error('pre-result commitment does not bind opportunity-discovery coverage');
  const releaseThresholdBinding = validateReleaseThresholdBinding(
    evidence.release_thresholds,
    thresholds,
    calibrationContract,
    preResultCommitment,
    freeze,
  );

  const trustedExecutionProof = unwrapBoundDocument(
    evidence.trusted_execution_proof,
    'trusted execution proof',
  );
  if (
    !trustedExecutionVerification ||
    trustedExecutionVerification.proof_document_sha256 !==
      evidence.trusted_execution_proof.document_sha256 ||
    trustedExecutionProof.commitment?.document_sha256 !==
      evidence.pre_result_commitment.document_sha256 ||
    trustedExecutionProof.commitment?.git_commit !==
      trustedExecutionVerification.commitment_git_commit ||
    trustedExecutionVerification.commitment_created_at !==
      trustedExecutionProof.commitment?.created_at
  ) {
    throw new Error('measurement lacks a live-verified trusted execution proof');
  }

  if (!Array.isArray(evidence.execution_receipts) || !Array.isArray(evidence.llm_reports)) {
    throw new Error('execution_receipts and llm_reports evidence arrays are required');
  }
  const receipts = new Map();
  for (const [index, wrapper] of evidence.execution_receipts.entries()) {
    const receipt = unwrapBoundDocument(wrapper, `execution receipt ${index}`);
    const key = `${receipt.cohort}:${receipt.repository_id}`;
    const expected = repositories.get(key);
    if (!expected || receipts.has(key)) throw new Error(`execution receipt repository is missing or duplicated: ${key}`);
    if (
      receipt.protocol_id !== input.protocol_id || receipt.commit_sha !== expected.repository.commit_sha ||
      receipt.git_tree_sha !== expected.repository.git_tree_sha ||
      receipt.manifest_sha256 !== expected.manifest.manifest_sha256 ||
      receipt.detector_build_sha256 !== freeze.detector.build_sha256 ||
      receipt.output_outside_source !== true || !Array.isArray(receipt.finding_ids) ||
      !Array.isArray(receipt.rule_states) || typeof receipt.completed_at !== 'string' ||
      Number.isNaN(Date.parse(receipt.completed_at))
    ) throw new Error(`execution receipt does not match frozen evidence: ${key}`);
    if (receipt.cohort === 'untouched' && receipt.detector_freeze_sha256 !== freeze.record_sha256) {
      throw new Error(`untouched execution receipt is not bound to detector freeze: ${key}`);
    }
    if (
      receipt.pre_result_commitment?.canonical_sha256 !== evidence.pre_result_commitment.document_sha256 ||
      !/^[a-f0-9]{40}$/.test(receipt.pre_result_commitment?.git_commit || '') ||
      typeof receipt.pre_result_commitment?.git_path !== 'string' ||
      Date.parse(preResultCommitment.created_at) >= Date.parse(receipt.completed_at)
    ) throw new Error(`execution receipt lacks a valid pre-result Git commitment: ${key}`);
    validateGitCommitmentProof(
      receipt.pre_result_commitment.git_proof,
      preResultCommitment,
      receipt.pre_result_commitment.document_sha256,
      receipt.pre_result_commitment.git_commit,
      receipt.pre_result_commitment.git_path,
      preResultCommitment.created_at,
    );
    if (receipt.pre_result_commitment.git_proof.committed_at_unix * 1000 >= Date.parse(receipt.completed_at)) {
      throw new Error(`pre-result Git commit does not predate detector execution: ${key}`);
    }
    receipts.set(key, receipt);
  }
  if (receipts.size !== repositories.size) throw new Error('execution receipts do not cover every frozen repository');
  const verifiedRuns = new Map();
  for (const run of trustedExecutionVerification.runs || []) {
    if (!['golden', 'untouched'].includes(run?.cohort) || verifiedRuns.has(run.cohort)) {
      throw new Error('trusted execution proof must contain exactly one distinct run per cohort');
    }
    if (!run.evidence_bundle || run.evidence_bundle.cohort !== run.cohort) {
      throw new Error('trusted execution run lacks its downloaded evidence bundle');
    }
    if (run.workflow_sha256 !== freeze.execution.workflow.sha256) {
      throw new Error('trusted execution run used workflow bytes outside the detector freeze');
    }
    verifiedRuns.set(run.cohort, run);
  }
  if (verifiedRuns.size !== 2) {
    throw new Error('trusted execution proof does not cover both calibration cohorts');
  }
  for (const cohort of ['golden', 'untouched']) {
    const run = verifiedRuns.get(cohort);
    let freeCoreParitySha256 = null;
    if (cohort === 'golden') {
      const record = input.automatic_no_go_evidence.free_core_unchanged_without_pack.document;
      const audit = JSON.parse(record.artifacts[0].content);
      const assertion = audit.assertions.find((item) =>
        item.name === 'default_without_pack_byte_identical');
      freeCoreParitySha256 = sha256Canonical(JSON.parse(assertion.evidence_content));
    }
    const expectedBundle = {
      schema_version: '1.0.0',
      protocol_id: input.protocol_id,
      cohort,
      pre_result_commitment_sha256: evidence.pre_result_commitment.document_sha256,
      detector_freeze_sha256: cohort === 'untouched'
        ? evidence.detector_freeze.document_sha256
        : null,
      free_core_parity_sha256: freeCoreParitySha256,
      execution_receipts: evidence.execution_receipts
        .filter(({ document }) => document.cohort === cohort)
        .map(({ document_sha256, document }) => ({
          repository_id: document.repository_id,
          document_sha256,
        }))
        .sort((left, right) => left.repository_id.localeCompare(right.repository_id)),
      llm_reports: evidence.llm_reports
        .filter((report) => report.cohort === cohort)
        .map(({ repository_id, document_sha256 }) => ({ repository_id, document_sha256 }))
        .sort((left, right) => left.repository_id.localeCompare(right.repository_id)),
    };
    if (canonicalize(run.evidence_bundle) !== canonicalize(expectedBundle)) {
      throw new Error(`${cohort}: downloaded GitHub artifact does not bind the measurement evidence`);
    }
    for (const receipt of [...receipts.values()].filter((item) => item.cohort === cohort)) {
      if (Date.parse(receipt.completed_at) <= Date.parse(run.run_started_at)) {
        throw new Error(`${cohort}: receipt completion does not follow the trusted workflow start`);
      }
    }
  }
  const earliestDetectorCompletion = Math.min(
    ...[...receipts.values()].map((receipt) => Date.parse(receipt.completed_at)),
  );
  if (Date.parse(opportunityManifest.frozen_at) >= earliestDetectorCompletion) {
    throw new Error('opportunity inventory was not frozen before detector results');
  }

  const reports = new Map();
  const findings = new Map();
  for (const [index, wrapper] of evidence.llm_reports.entries()) {
    const report = unwrapBoundDocument(wrapper, `LLM report ${index}`);
    const key = `${wrapper.cohort}:${wrapper.repository_id}`;
    const receipt = receipts.get(key);
    if (!receipt || reports.has(key)) throw new Error(`LLM report repository is missing or duplicated: ${key}`);
    if (sha256Canonical(report) !== receipt.llm_report_canonical_sha256) {
      throw new Error(`LLM report canonical SHA-256 does not match receipt: ${key}`);
    }
    if (!Array.isArray(report?.result?.findings) || !Array.isArray(report?.result?.ruleResults)) {
      throw new Error(`LLM report is structurally incomplete: ${key}`);
    }
    if (report.result.findings.some((finding) =>
      !ENABLED_RULE_IDS.includes(finding?.ruleId) || typeof finding?.severity !== 'string' ||
      typeof finding?.confidence !== 'string' || typeof finding?.summary !== 'string' ||
      !isRepositoryRelativePath(finding?.evidence?.path) ||
      !Number.isInteger(finding?.evidence?.line) || finding.evidence.line < 1
    )) throw new Error(`LLM report contains an invalid finding: ${key}`);
    const reportRuleStates = report.result.ruleResults.map((result) => ({
      rule_id: result?.ruleId,
      state: result?.state,
    }));
    if (
      reportRuleStates.length !== ENABLED_RULE_IDS.length ||
      new Set(reportRuleStates.map((entry) => entry.rule_id)).size !== ENABLED_RULE_IDS.length ||
      report.result.ruleResults.some((result) =>
        !ENABLED_RULE_IDS.includes(result?.ruleId) ||
        !['finding', 'verified_control', 'not_applicable', 'insufficient_data'].includes(result?.state) ||
        !Array.isArray(result?.findings)
      ) ||
      canonicalize([...reportRuleStates].sort((left, right) => left.rule_id.localeCompare(right.rule_id))) !==
        canonicalize([...receipt.rule_states].sort((left, right) => left.rule_id.localeCompare(right.rule_id)))
    ) throw new Error(`LLM report rule states do not match the receipt and frozen catalogue: ${key}`);
    for (const result of report.result.ruleResults) {
      const topLevelFindings = report.result.findings.filter((finding) => finding.ruleId === result.ruleId);
      const canonicalFindingSet = (items) => items.map((finding) => sha256Canonical(finding)).sort();
      if (
        (result.state === 'finding') !== (topLevelFindings.length > 0) ||
        canonicalize(canonicalFindingSet(result.findings)) !==
          canonicalize(canonicalFindingSet(topLevelFindings))
      ) throw new Error(`LLM report rule state and findings are inconsistent: ${key}:${result.ruleId}`);
    }
    const findingIds = report.result.findings.map((finding, findingIndex) =>
      `llm-finding-${sha256Canonical({ repository_id: wrapper.repository_id, index: findingIndex, finding })}`
    );
    if (canonicalize(findingIds) !== canonicalize(receipt.finding_ids)) {
      throw new Error(`LLM report finding IDs do not match receipt: ${key}`);
    }
    report.result.findings.forEach((finding, findingIndex) => {
      if (findings.has(findingIds[findingIndex])) throw new Error(`duplicate finding ID across reports: ${findingIds[findingIndex]}`);
      findings.set(findingIds[findingIndex], { ...finding, cohort: wrapper.cohort, repository_id: wrapper.repository_id });
    });
    reports.set(key, report);
  }
  if (reports.size !== repositories.size) throw new Error('LLM reports do not cover every frozen repository');
  const automatic = deriveAutomaticNoGoChecks(input, freeze, untouched, receipts, findings, preResultCommitment);

  if (!Array.isArray(evidence.label_records) || evidence.label_records.length < 1) {
    throw new Error('at least one bound label record is required');
  }
  const labelsByOpportunity = new Map();
  const labelIds = new Set();
  for (const [index, wrapper] of evidence.label_records.entries()) {
    const label = validateLabelRecord(unwrapBoundDocument(wrapper, `label record ${index}`), `label record ${index}`);
    if (labelIds.has(label.label_id)) throw new Error(`duplicate label_id: ${label.label_id}`);
    labelIds.add(label.label_id);
    if (label.review.role !== 'finding_reviewer') {
      const binding = blindLabelBindings.get(label.label_id);
      if (!binding || binding.document_sha256 !== wrapper.document_sha256 || binding.role !== label.review.role) {
        throw new Error(`blind ground-truth label is not bound into the pre-result opportunity manifest: ${label.label_id}`);
      }
      if (Date.parse(label.created_at) > Date.parse(opportunityManifest.frozen_at)) {
        throw new Error(`blind ground-truth label postdates the opportunity-manifest freeze: ${label.label_id}`);
      }
    } else if (blindLabelBindings.has(label.label_id)) {
      throw new Error(`post-run finding review cannot be bound as a blind label: ${label.label_id}`);
    }
    const repoKey = `${label.cohort}:${label.repository?.repository_id}`;
    const expected = repositories.get(repoKey);
    if (!expected || label.repository.commit_sha !== expected.repository.commit_sha) {
      throw new Error(`label record is not bound to a frozen repository: ${label.label_id}`);
    }
    if (label.review.role === 'finding_reviewer') {
      const receipt = receipts.get(repoKey);
      if (!receipt || Date.parse(label.created_at) <= Date.parse(receipt.completed_at)) {
        throw new Error(`finding-review record must postdate its matching execution receipt: ${label.label_id}`);
      }
    }
    const predefined = opportunities.get(label.opportunity_id);
    if (predefined) {
      if (
        predefined.cohort !== label.cohort || predefined.repository_id !== label.repository.repository_id ||
        predefined.commit_sha !== label.repository.commit_sha || predefined.rule_id !== label.rule.rule_id
      ) throw new Error(`label does not match its predefined opportunity: ${label.label_id}`);
      const evidenceMatchesInventory = label.evidence.some((item) =>
        evidenceItemExactlyMatchesScope(item, predefined.evidence_scope)
      );
      if (!evidenceMatchesInventory) {
        throw new Error(`label evidence does not match its frozen opportunity scope: ${label.label_id}`);
      }
    } else {
      throw new Error(`label references an opportunity absent from the frozen inventory: ${label.label_id}`);
    }
    if (label.detector_finding_id) {
      const finding = findings.get(label.detector_finding_id);
      if (!finding) throw new Error(`label references an unknown detector finding: ${label.label_id}`);
      if (
        finding.cohort !== label.cohort || finding.repository_id !== label.repository.repository_id ||
        finding.ruleId !== label.rule.rule_id
      ) throw new Error(`label finding binding does not match repository, cohort, and rule: ${label.label_id}`);
      if (!findingEvidenceMatchesOpportunity(finding, predefined)) {
        throw new Error(`detector finding evidence does not overlap its frozen opportunity: ${label.label_id}`);
      }
    }
    const key = `${repoKey}:${label.rule.rule_id}:${label.opportunity_id}`;
    const group = labelsByOpportunity.get(key) || [];
    group.push(label);
    labelsByOpportunity.set(key, group);
  }

  const observedBlindLabelIds = new Set(
    evidence.label_records
      .map((wrapper) => wrapper.document)
      .filter((label) => label.review.role !== 'finding_reviewer')
      .map((label) => label.label_id),
  );
  for (const labelId of blindLabelBindings.keys()) {
    if (!observedBlindLabelIds.has(labelId)) {
      throw new Error(`pre-result blind-label binding lacks its label record: ${labelId}`);
    }
  }

  const finalItems = [];
  for (const [key, labels] of labelsByOpportunity) {
    const findingReviews = labels.filter((label) => label.review.role === 'finding_reviewer');
    const originals = labels.filter((label) =>
      ['primary_labeler', 'independent_reviewer'].includes(label.review.role)
    );
    const adjudicators = labels.filter((label) => label.review.role === 'adjudicator');
    if (originals.length < 1) throw new Error(`${key}: requires at least one original label`);
    const primaryLabels = originals.filter((label) => label.review.role === 'primary_labeler');
    const independentLabels = originals.filter((label) => label.review.role === 'independent_reviewer');
    if (primaryLabels.length !== 1) throw new Error(`${key}: requires exactly one primary label`);
    const independentIds = new Set(originals.map((label) => label.review.labeler_id.trim().toLowerCase()));
    if (originals.length > 2) throw new Error(`${key}: double-label protocol permits exactly two original labels`);
    if (originals.length === 2 && independentIds.size !== 2) {
      throw new Error(`${key}: double labels require two distinct labeler identities`);
    }
    const doubleLabeled = independentIds.size >= 2;
    const agreement = doubleLabeled && new Set(originals.map((label) => label.label)).size === 1;
    if (findingReviews.length > 1) throw new Error(`${key}: permits at most one matched detector finding`);
    if (doubleLabeled) {
      const roles = new Set(originals.map((label) => label.review.role));
      if (!roles.has('primary_labeler') || !roles.has('independent_reviewer')) {
        throw new Error(`${key}: double labels require primary and independent-reviewer roles`);
      }
    }
    if (independentLabels.length > 1) throw new Error(`${key}: permits at most one independent-reviewer label`);
    let final;
    if (adjudicators.length > 0) {
      if (adjudicators.length !== 1) throw new Error(`${key}: requires exactly one final adjudicator record`);
      if (!doubleLabeled || agreement) throw new Error(`${key}: adjudication is only valid for a two-reviewer disagreement`);
      const superseded = new Set(adjudicators[0].review.supersedes_label_ids || []);
      if (superseded.size !== originals.length || originals.some((label) => !superseded.has(label.label_id))) {
        throw new Error(`${key}: adjudication must supersede exactly every original label`);
      }
      if (originals.some((label) => label.review.adjudication_status !== 'pending')) {
        throw new Error(`${key}: disagreement originals must be pending adjudication`);
      }
      if (independentIds.has(adjudicators[0].review.labeler_id.trim().toLowerCase())) {
        throw new Error(`${key}: adjudicator identity must differ from both original labelers`);
      }
      final = adjudicators[0];
    } else {
      if (originals.length !== 1 && !agreement) throw new Error(`${key}: disagreement requires adjudication`);
      if (originals.some((label) => label.review.adjudication_status !== 'not_required')) {
        throw new Error(`${key}: unadjudicated originals must use not_required status`);
      }
      final = originals[0];
    }
    if (final.label === 'ambiguous') throw new Error(`${key}: final label remains ambiguous`);
    if (findingReviews.length === 1 && findingReviews[0].label !== final.label) {
      throw new Error(`${key}: finding review must preserve the blind final ground-truth label`);
    }
    finalItems.push({
      final,
      detectorFindingId: findingReviews[0]?.detector_finding_id ?? null,
      doubleLabeled,
      agreement,
      reviewerPair: doubleLabeled
        ? [primaryLabels[0].label, independentLabels[0].label]
        : null,
    });
  }


  for (const opportunity of opportunities.values()) {
    const key = `${opportunity.cohort}:${opportunity.repository_id}:${opportunity.rule_id}:${opportunity.opportunity_id}`;
    const labels = labelsByOpportunity.get(key) || [];
    const primaryCount = labels.filter((label) => label.review.role === 'primary_labeler').length;
    if (primaryCount !== 1) {
      throw new Error(`predefined opportunity requires exactly one primary label: ${opportunity.opportunity_id}`);
    }
  }

  const finalFindingIdList = finalItems.map((item) => item.detectorFindingId).filter(Boolean);
  const labeledFindingIds = new Set(finalFindingIdList);
  if (labeledFindingIds.size !== finalFindingIdList.length) {
    throw new Error('a detector finding was assigned to more than one final adjudicated opportunity');
  }
  for (const findingId of findings.keys()) {
    if (!labeledFindingIds.has(findingId)) throw new Error(`detector finding lacks final adjudication: ${findingId}`);
  }

  const emptyCounts = (allScans) => ({
    true_positives: 0, false_negatives: 0, false_positives: 0, true_negatives: 0,
    abstentions: 0, eligible_scans: 0, not_applicable: 0, all_scans: allScans,
    reviewer_agreements: 0, double_labeled_items: 0, adjudicated_items: 0,
    unresolved_critical_false_positives: 0,
    gate_blocking_matched_findings: 0,
  });
  const untouchedRepositoryCount = untouched.repositories.length;
  const aggregate = emptyCounts(untouchedRepositoryCount);
  const byRule = new Map(ENABLED_RULE_IDS.map((ruleId) => [ruleId, emptyCounts(untouchedRepositoryCount)]));
  const aggregateReviewerPairs = [];
  const reviewerPairsByRule = new Map(ENABLED_RULE_IDS.map((ruleId) => [ruleId, []]));
  for (const [key, report] of reports) {
    if (!key.startsWith('untouched:')) continue;
    const states = new Map(report.result.ruleResults.map((result) => [result.ruleId, result.state]));
    let aggregateApplicable = false;
    let aggregateInsufficient = false;
    for (const ruleId of ENABLED_RULE_IDS) {
      const counts = byRule.get(ruleId);
      const state = states.get(ruleId);
      if (state === 'not_applicable') counts.not_applicable += 1;
      else {
        counts.eligible_scans += 1;
        aggregateApplicable = true;
      }
      if (state === 'insufficient_data') {
        counts.abstentions += 1;
        aggregateInsufficient = true;
      }
    }
    if (aggregateApplicable) aggregate.eligible_scans += 1;
    else aggregate.not_applicable += 1;
    if (aggregateInsufficient) aggregate.abstentions += 1;
  }
  for (const item of finalItems) {
    if (item.final.cohort !== 'untouched') continue;
    const counts = byRule.get(item.final.rule.rule_id);
    const targets = [counts, aggregate];
    for (const target of targets) {
      const eligibleAdjudicated = item.final.label !== 'not_applicable';
      if (eligibleAdjudicated) target.adjudicated_items += 1;
      if (eligibleAdjudicated && item.doubleLabeled) target.double_labeled_items += 1;
      if (eligibleAdjudicated && item.agreement) target.reviewer_agreements += 1;
      if (item.final.label === 'present') {
        target[item.detectorFindingId ? 'true_positives' : 'false_negatives'] += 1;
      } else if (item.final.label === 'absent') {
        target[item.detectorFindingId ? 'false_positives' : 'true_negatives'] += 1;
        if (item.detectorFindingId && findings.get(item.detectorFindingId)?.severity === 'critical') {
          target.unresolved_critical_false_positives += 1;
        }
      } else if (item.detectorFindingId) {
        target.gate_blocking_matched_findings += 1;
      }
    }
    if (item.final.label !== 'not_applicable' && item.reviewerPair) {
      aggregateReviewerPairs.push(item.reviewerPair);
      reviewerPairsByRule.get(item.final.rule.rule_id).push(item.reviewerPair);
    }
  }
  return {
    detectorVersion: freeze.detector.build_sha256,
    counts: aggregate,
    perRule: ENABLED_RULE_IDS.map((rule_id) => ({ rule_id, counts: byRule.get(rule_id) })),
    reviewerAgreement: {
      aggregate: cohenKappa(aggregateReviewerPairs),
      perRule: Object.fromEntries(ENABLED_RULE_IDS.map((ruleId) => [ruleId, cohenKappa(reviewerPairsByRule.get(ruleId))])),
    },
    automaticNoGoChecks: automatic.checks,
    bindings: {
      golden_manifest_sha256: golden.manifest_sha256,
      untouched_manifest_sha256: untouched.manifest_sha256,
      source_evidence_index_sha256: sourceEvidenceIndex.index_sha256,
      opportunity_manifest_sha256: opportunityManifest.manifest_sha256,
      opportunity_discovery_coverage_sha256: opportunityDiscoveryCoverage.record_sha256,
      release_thresholds: releaseThresholdBinding,
      detector_freeze_sha256: freeze.record_sha256,
      trusted_execution_proof_sha256: evidence.trusted_execution_proof.document_sha256,
      execution_receipts: receipts.size,
      llm_reports: reports.size,
      label_records: evidence.label_records.length,
      adjudicated_items: aggregate.adjudicated_items,
      automatic_no_go_evidence: automatic.bindings,
    },
  };
}

function computeMetricsWithContract(
  input,
  thresholds,
  calibrationContract,
  trustedExecutionVerification,
  publicSurfaceVerification,
) {
  const derived = deriveCountsFromEvidence(
    input,
    thresholds,
    calibrationContract,
    trustedExecutionVerification,
    publicSurfaceVerification,
  );
  rejectUnknownKeys(
    input,
    ['$schema', 'protocol_id', 'automatic_no_go_evidence', 'evidence'],
    'measurement input',
  );
  if (input.protocol_id !== 'cejel-llm-calibration-v1') throw new Error('unsupported protocol_id');
  if (!thresholds || thresholds.protocol_id !== input.protocol_id || thresholds.status !== 'locked_before_detector_results') {
    throw new Error('release thresholds are missing, unlocked, or use a different protocol');
  }
  if (
    thresholds.public_v1_go.minimum_precision !==
      1 - thresholds.public_v1_go.maximum_incorrect_finding_rate ||
    thresholds.limited_experimental_go.minimum_precision !==
      1 - thresholds.limited_experimental_go.maximum_incorrect_finding_rate
  ) {
    throw new Error('release precision and incorrect-finding thresholds are inconsistent');
  }
  const counts = derived.counts;
  const rules = derived.perRule;
  validateCounts(counts, 'aggregate');
  if (!Array.isArray(rules) || rules.length !== ENABLED_RULE_IDS.length) {
    throw new Error(`per_rule must contain exactly ${ENABLED_RULE_IDS.length} frozen enabled rules`);
  }
  const ruleIds = new Set();
  const perRule = rules.map((rule, index) => {
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      rejectUnknownKeys(rule, ['rule_id', 'counts'], `per_rule[${index}]`);
    }
    if (!rule || typeof rule.rule_id !== 'string' || !/^LLM-[A-Z]{3}-\d{3}$/.test(rule.rule_id)) {
      throw new Error(`per_rule[${index}].rule_id is invalid`);
    }
    if (ruleIds.has(rule.rule_id)) throw new Error(`duplicate per-rule entry: ${rule.rule_id}`);
    ruleIds.add(rule.rule_id);
    validateCounts(rule.counts, `per_rule.${rule.rule_id}`);
    if (rule.counts.all_scans !== counts.all_scans) {
      throw new Error(`per_rule.${rule.rule_id}.counts.all_scans must equal aggregate all_scans`);
    }
    return {
      rule_id: rule.rule_id,
      counts: rule.counts,
      support: supportForCounts(rule.counts),
      metrics: metricsForCounts(rule.counts),
    };
  }).sort((left, right) => left.rule_id.localeCompare(right.rule_id, 'en-US'));
  const missingRules = ENABLED_RULE_IDS.filter((ruleId) => !ruleIds.has(ruleId));
  const extraRules = [...ruleIds].filter((ruleId) => !ENABLED_RULE_IDS.includes(ruleId));
  if (missingRules.length > 0 || extraRules.length > 0) {
    throw new Error(
      `per_rule must match the frozen enabled catalogue; missing=[${missingRules.join(',')}], ` +
      `extra=[${extraRules.sort().join(',')}]`,
    );
  }
  for (const key of SUMMED_RULE_KEYS) {
    const sum = rules.reduce((total, rule) => total + rule.counts[key], 0);
    if (sum !== counts[key]) {
      throw new Error(`aggregate ${key} ${counts[key]} does not equal per-rule sum ${sum}`);
    }
  }

  const aggregateMetrics = metricsForCounts(counts);
  const evaluation = evaluateGate(
    { ...input, automatic_no_go_checks: derived.automaticNoGoChecks, counts },
    thresholds,
    aggregateMetrics,
    perRule,
  );
  return {
    schema_version: '1.0.0',
    protocol_id: input.protocol_id,
    detector_version: derived.detectorVersion,
    evidence_bindings: derived.bindings,
    counts,
    support: supportForCounts(counts),
    metrics: aggregateMetrics,
    per_rule: perRule,
    quality_controls: {
      unresolved_critical_false_positives: counts.unresolved_critical_false_positives,
      gate_blocking_matched_findings: counts.gate_blocking_matched_findings,
      double_label_coverage: aggregateMetrics.double_label_coverage,
      cohen_kappa: derived.reviewerAgreement.aggregate,
      cohen_kappa_per_rule: derived.reviewerAgreement.perRule,
      automatic_no_go_checks: derived.automaticNoGoChecks,
    },
    not_estimable: collectNotEstimable(aggregateMetrics, perRule),
    release_evaluation: evaluation,
    warnings: [
      'Wilson intervals describe binomial uncertainty only; corpus-selection limits must be reported separately.',
      'A rule below the positive-support threshold cannot carry a strong rule-level performance claim.',
    ],
  };
}

export function computeMetrics(
  input,
  thresholds,
  trustedExecutionVerification,
  publicSurfaceVerification,
) {
  return computeMetricsWithContract(
    input,
    thresholds,
    productionCalibrationContract(),
    trustedExecutionVerification,
    publicSurfaceVerification,
  );
}

export function computeMetricsForUnitTest(
  input,
  thresholds,
  calibrationContract,
  trustedExecutionVerification,
  publicSurfaceVerification,
) {
  if (!process.env.NODE_TEST_CONTEXT) {
    throw new Error('test-only calibration contract override is unavailable outside node:test');
  }
  return computeMetricsWithContract(
    input,
    thresholds,
    calibrationContract,
    trustedExecutionVerification,
    publicSurfaceVerification,
  );
}

function readEvidenceBundleFromArchive(path) {
  const listing = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  if (canonicalize(listing) !== canonicalize(['evidence-bundle.json'])) {
    throw new Error(`${path}: calibration artifact must contain only evidence-bundle.json`);
  }
  return JSON.parse(execFileSync('unzip', ['-p', path, 'evidence-bundle.json'], {
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  }));
}

export async function main(argv) {
  const path = argv[0];
  if (!path) {
    throw new Error(
      'usage: compute-metrics.mjs <measurement-input.json> --artifact <run-id>=<downloaded.zip> [...]',
    );
  }
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const thresholds = JSON.parse(readFileSync(resolve(calibrationRoot, 'release-thresholds.json'), 'utf8'));
  const artifactBytesByRunId = new Map();
  const evidenceBundleByRunId = new Map();
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] !== '--artifact' || !argv[index + 1]) throw new Error(`unknown argument: ${argv[index]}`);
    const separator = argv[index + 1].indexOf('=');
    const runId = Number(argv[index + 1].slice(0, separator));
    const artifactPath = argv[index + 1].slice(separator + 1);
    if (separator < 1 || !Number.isSafeInteger(runId) || !artifactPath) {
      throw new Error('--artifact requires <run-id>=<downloaded.zip>');
    }
    artifactBytesByRunId.set(runId, readFileSync(artifactPath));
    evidenceBundleByRunId.set(runId, readEvidenceBundleFromArchive(artifactPath));
    index += 1;
  }
  const proof = unwrapBoundDocument(input.evidence?.trusted_execution_proof, 'trusted execution proof');
  const verification = await verifyGitHubExecutionProof(proof, {
    artifactBytesByRunId,
    evidenceBundleByRunId,
  });
  const publicVerification = await verifyPublicSurfaces(
    productionCalibrationContract().public_surface_policy.document,
    input.evidence.pre_result_commitment.document.public_document_inventory,
    { repositoryRoot: resolve(calibrationRoot, '../..') },
  );
  console.log(JSON.stringify(
    computeMetrics(input, thresholds, verification, publicVerification),
    null,
    2,
  ));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
