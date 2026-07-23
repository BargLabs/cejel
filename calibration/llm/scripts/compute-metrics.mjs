#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  if (counts.double_labeled_items > counts.all_scans) {
    throw new Error(`${scope}: double_labeled_items exceed all_scans`);
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
    double_label_coverage: ratio(counts.double_labeled_items, counts.all_scans),
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

export function computeMetrics(input, thresholds) {
  rejectUnknownKeys(
    input,
    ['$schema', 'protocol_id', 'detector_version', 'automatic_no_go_checks', 'counts', 'per_rule'],
    'measurement input',
  );
  if (input.protocol_id !== 'cejel-llm-calibration-v1') throw new Error('unsupported protocol_id');
  if (typeof input.detector_version !== 'string' || input.detector_version.trim().length < 1) {
    throw new Error('detector_version must be a non-empty string');
  }
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
  validateCounts(input.counts, 'aggregate');
  if (!Array.isArray(input.per_rule) || input.per_rule.length !== ENABLED_RULE_IDS.length) {
    throw new Error(`per_rule must contain exactly ${ENABLED_RULE_IDS.length} frozen enabled rules`);
  }
  const ruleIds = new Set();
  const perRule = input.per_rule.map((rule, index) => {
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      rejectUnknownKeys(rule, ['rule_id', 'counts'], `per_rule[${index}]`);
    }
    if (!rule || typeof rule.rule_id !== 'string' || !/^LLM-[A-Z]{3}-\d{3}$/.test(rule.rule_id)) {
      throw new Error(`per_rule[${index}].rule_id is invalid`);
    }
    if (ruleIds.has(rule.rule_id)) throw new Error(`duplicate per-rule entry: ${rule.rule_id}`);
    ruleIds.add(rule.rule_id);
    validateCounts(rule.counts, `per_rule.${rule.rule_id}`);
    if (rule.counts.all_scans !== input.counts.all_scans) {
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
    const sum = input.per_rule.reduce((total, rule) => total + rule.counts[key], 0);
    if (sum !== input.counts[key]) {
      throw new Error(`aggregate ${key} ${input.counts[key]} does not equal per-rule sum ${sum}`);
    }
  }

  const aggregateMetrics = metricsForCounts(input.counts);
  const evaluation = evaluateGate(input, thresholds, aggregateMetrics, perRule);
  return {
    schema_version: '1.0.0',
    protocol_id: input.protocol_id,
    detector_version: input.detector_version,
    counts: input.counts,
    support: supportForCounts(input.counts),
    metrics: aggregateMetrics,
    per_rule: perRule,
    quality_controls: {
      unresolved_critical_false_positives: input.counts.unresolved_critical_false_positives,
      double_label_coverage: aggregateMetrics.double_label_coverage,
      automatic_no_go_checks: input.automatic_no_go_checks,
    },
    not_estimable: collectNotEstimable(aggregateMetrics, perRule),
    release_evaluation: evaluation,
    warnings: [
      'Cohen kappa requires the full reviewer-by-category contingency table and is not inferred from aggregate agreement.',
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
