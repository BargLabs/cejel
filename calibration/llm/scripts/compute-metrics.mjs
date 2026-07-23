#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalize, hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';
import { validateDetectorFreezeRecord } from './freeze-detector.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const calibrationRoot = resolve(here, '..');
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
];
const SUMMED_RULE_KEYS = [
  'true_positives',
  'false_negatives',
  'false_positives',
  'true_negatives',
  'unresolved_critical_false_positives',
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

  const limitedThresholds = thresholds.limited_experimental_go;
  const limitedReasons = [
    metricFailure(aggregateMetrics.finding_recall, (value, threshold) => value >= threshold, limitedThresholds.minimum_finding_recall, 'finding_recall'),
    metricFailure(aggregateMetrics.precision, (value, threshold) => value >= threshold, limitedThresholds.minimum_precision, 'precision'),
    metricFailure(aggregateMetrics.incorrect_finding_rate_fdr, (value, threshold) => value <= threshold, limitedThresholds.maximum_incorrect_finding_rate, 'incorrect_finding_rate_fdr'),
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

function unwrapBoundDocument(wrapper, scope) {
  if (!wrapper || typeof wrapper !== 'object' || !wrapper.document) {
    throw new Error(`${scope} must contain a document and document_sha256`);
  }
  if (sha256Canonical(wrapper.document) !== wrapper.document_sha256) {
    throw new Error(`${scope} document SHA-256 mismatch`);
  }
  return wrapper.document;
}

function validateManifestBinding(wrapper, expectedCohort) {
  const manifest = unwrapBoundDocument(wrapper, `${expectedCohort} manifest`);
  if (
    manifest.cohort !== expectedCohort || manifest.status !== 'frozen' ||
    hashManifest(manifest) !== manifest.manifest_sha256
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

function validateLabelRecord(label, scope) {
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
      !item || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || typeof item.rationale !== 'string' || item.rationale.length < 20
    ) ||
    typeof label.review?.labeler_id !== 'string' || label.review.labeler_id.length < 3 ||
    !['primary_labeler', 'independent_reviewer', 'adjudicator'].includes(label.review.role) ||
    label.review.independent_of_rule_author !== true ||
    !['not_required', 'pending', 'adjudicated'].includes(label.review.adjudication_status) ||
    typeof label.created_at !== 'string' || Number.isNaN(Date.parse(label.created_at))
  ) throw new Error(`${scope} is not a valid label record`);
  if (
    label.review.role === 'adjudicator' &&
    (!Array.isArray(label.review.supersedes_label_ids) || label.review.supersedes_label_ids.length < 2 ||
      typeof label.review.rationale !== 'string' || label.review.rationale.length < 20)
  ) throw new Error(`${scope} has an invalid adjudication record`);
  return label;
}

export function deriveCountsFromEvidence(input) {
  const evidence = input.evidence;
  if (!evidence || typeof evidence !== 'object') throw new Error('measurement evidence is required');
  const golden = validateManifestBinding(evidence.golden_manifest, 'golden');
  const untouched = validateManifestBinding(evidence.untouched_manifest, 'untouched');
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
      !Array.isArray(receipt.rule_states)
    ) throw new Error(`execution receipt does not match frozen evidence: ${key}`);
    if (receipt.cohort === 'untouched' && receipt.detector_freeze_sha256 !== freeze.record_sha256) {
      throw new Error(`untouched execution receipt is not bound to detector freeze: ${key}`);
    }
    receipts.set(key, receipt);
  }
  if (receipts.size !== repositories.size) throw new Error('execution receipts do not cover every frozen repository');

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
    const findingIds = report.result.findings.map((finding, findingIndex) =>
      `llm-finding-${sha256Canonical({ repository_id: wrapper.repository_id, index: findingIndex, finding })}`
    );
    if (canonicalize(findingIds) !== canonicalize(receipt.finding_ids)) {
      throw new Error(`LLM report finding IDs do not match receipt: ${key}`);
    }
    report.result.findings.forEach((finding, findingIndex) => {
      findings.set(findingIds[findingIndex], { ...finding, cohort: wrapper.cohort, repository_id: wrapper.repository_id });
    });
    reports.set(key, report);
  }
  if (reports.size !== repositories.size) throw new Error('LLM reports do not cover every frozen repository');

  if (!Array.isArray(evidence.label_records) || evidence.label_records.length < 1) {
    throw new Error('at least one bound label record is required');
  }
  const labelsByOpportunity = new Map();
  const labelIds = new Set();
  for (const [index, wrapper] of evidence.label_records.entries()) {
    const label = validateLabelRecord(unwrapBoundDocument(wrapper, `label record ${index}`), `label record ${index}`);
    if (labelIds.has(label.label_id)) throw new Error(`duplicate label_id: ${label.label_id}`);
    labelIds.add(label.label_id);
    const repoKey = `${label.cohort}:${label.repository?.repository_id}`;
    const expected = repositories.get(repoKey);
    if (!expected || label.repository.commit_sha !== expected.repository.commit_sha) {
      throw new Error(`label record is not bound to a frozen repository: ${label.label_id}`);
    }
    if (label.detector_finding_id) {
      const finding = findings.get(label.detector_finding_id);
      if (!finding) throw new Error(`label references an unknown detector finding: ${label.label_id}`);
      if (
        finding.cohort !== label.cohort || finding.repository_id !== label.repository.repository_id ||
        finding.ruleId !== label.rule.rule_id
      ) throw new Error(`label finding binding does not match repository, cohort, and rule: ${label.label_id}`);
    }
    const key = `${repoKey}:${label.rule.rule_id}:${label.opportunity_id}`;
    const group = labelsByOpportunity.get(key) || [];
    group.push(label);
    labelsByOpportunity.set(key, group);
  }

  const finalItems = [];
  for (const [key, labels] of labelsByOpportunity) {
    const originals = labels.filter((label) => label.review.role !== 'adjudicator');
    const adjudicators = labels.filter((label) => label.review.role === 'adjudicator');
    if (originals.length < 1) throw new Error(`${key}: requires at least one original label`);
    const independentIds = new Set(originals.map((label) => label.review.labeler_id.trim().toLowerCase()));
    if (originals.length > 2) throw new Error(`${key}: double-label protocol permits exactly two original labels`);
    if (originals.length === 2 && independentIds.size !== 2) {
      throw new Error(`${key}: double labels require two distinct labeler identities`);
    }
    const doubleLabeled = independentIds.size >= 2;
    const agreement = doubleLabeled && new Set(originals.map((label) => label.label)).size === 1;
    if (doubleLabeled) {
      const roles = new Set(originals.map((label) => label.review.role));
      if (!roles.has('primary_labeler') || !roles.has('independent_reviewer')) {
        throw new Error(`${key}: double labels require primary and independent-reviewer roles`);
      }
    }
    let final;
    if (adjudicators.length > 0) {
      if (adjudicators.length !== 1) throw new Error(`${key}: requires exactly one final adjudicator record`);
      if (!doubleLabeled || agreement) throw new Error(`${key}: adjudication is only valid for a two-reviewer disagreement`);
      const superseded = new Set(adjudicators[0].review.supersedes_label_ids || []);
      if (originals.some((label) => !superseded.has(label.label_id))) {
        throw new Error(`${key}: adjudication does not supersede every original label`);
      }
      final = adjudicators[0];
    } else {
      if (originals.length !== 1 && !agreement) throw new Error(`${key}: disagreement requires adjudication`);
      final = originals[0];
    }
    if (final.label === 'ambiguous') throw new Error(`${key}: final label remains ambiguous`);
    finalItems.push({
      final,
      doubleLabeled,
      agreement,
      reviewerPair: doubleLabeled ? originals.map((label) => label.label) : null,
    });
  }

  const finalFindingIdList = finalItems.map((item) => item.final.detector_finding_id).filter(Boolean);
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
        target[item.final.detector_finding_id ? 'true_positives' : 'false_negatives'] += 1;
      } else if (item.final.label === 'absent') {
        target[item.final.detector_finding_id ? 'false_positives' : 'true_negatives'] += 1;
        if (item.final.detector_finding_id && findings.get(item.final.detector_finding_id)?.severity === 'critical') {
          target.unresolved_critical_false_positives += 1;
        }
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
    bindings: {
      golden_manifest_sha256: golden.manifest_sha256,
      untouched_manifest_sha256: untouched.manifest_sha256,
      detector_freeze_sha256: freeze.record_sha256,
      execution_receipts: receipts.size,
      llm_reports: reports.size,
      label_records: evidence.label_records.length,
      adjudicated_items: aggregate.adjudicated_items,
    },
  };
}

export function computeMetrics(input, thresholds) {
  const derived = deriveCountsFromEvidence(input);
  rejectUnknownKeys(
    input,
    ['$schema', 'protocol_id', 'automatic_no_go_checks', 'evidence'],
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
  if (!input.automatic_no_go_checks || typeof input.automatic_no_go_checks !== 'object') {
    throw new Error('automatic_no_go_checks must be an object');
  }
  rejectUnknownKeys(
    input.automatic_no_go_checks,
    Object.keys(CHECK_TO_REASON),
    'automatic_no_go_checks',
  );
  for (const check of Object.keys(CHECK_TO_REASON)) {
    if (typeof input.automatic_no_go_checks[check] !== 'boolean') {
      throw new Error(`automatic_no_go_checks.${check} must be boolean`);
    }
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
  const evaluation = evaluateGate({ ...input, counts }, thresholds, aggregateMetrics, perRule);
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
      double_label_coverage: aggregateMetrics.double_label_coverage,
      cohen_kappa: derived.reviewerAgreement.aggregate,
      cohen_kappa_per_rule: derived.reviewerAgreement.perRule,
      automatic_no_go_checks: input.automatic_no_go_checks,
    },
    not_estimable: collectNotEstimable(aggregateMetrics, perRule),
    release_evaluation: evaluation,
    warnings: [
      'Wilson intervals describe binomial uncertainty only; corpus-selection limits must be reported separately.',
      'A rule below the positive-support threshold cannot carry a strong rule-level performance claim.',
    ],
  };
}

export function main(argv) {
  const path = argv[0];
  if (!path) throw new Error('usage: compute-metrics.mjs <measurement-input.json>');
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const thresholds = JSON.parse(readFileSync(resolve(calibrationRoot, 'release-thresholds.json'), 'utf8'));
  console.log(JSON.stringify(computeMetrics(input, thresholds), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
