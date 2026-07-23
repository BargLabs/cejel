import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { computeMetrics, ENABLED_RULE_IDS } from './compute-metrics.mjs';

const thresholds = JSON.parse(readFileSync(new URL('../release-thresholds.json', import.meta.url), 'utf8'));

const counts = (overrides = {}) => ({
  true_positives: 8,
  false_negatives: 2,
  false_positives: 0,
  true_negatives: 5,
  abstentions: 2,
  eligible_scans: 24,
  not_applicable: 0,
  all_scans: 24,
  reviewer_agreements: 4,
  double_labeled_items: 5,
  unresolved_critical_false_positives: 0,
  ...overrides,
});

const input = (countOverrides = {}, inputOverrides = {}) => {
  const perRuleCounts = counts(countOverrides);
  const aggregate = { ...perRuleCounts };
  for (const key of [
    'true_positives',
    'false_negatives',
    'false_positives',
    'true_negatives',
    'unresolved_critical_false_positives',
  ]) {
    aggregate[key] = perRuleCounts[key] * ENABLED_RULE_IDS.length;
  }
  return {
    protocol_id: 'cejel-llm-calibration-v1',
    detector_version: 'test-artifact-sha256',
    automatic_no_go_checks: {
      free_core_unchanged_without_pack: true,
      offline_scan_path_verified: true,
      all_findings_have_resolvable_evidence: true,
      prohibited_public_claims_absent: true,
      untouched_blinding_preserved: true,
    },
    counts: aggregate,
    per_rule: ENABLED_RULE_IDS.map((rule_id) => ({
      rule_id,
      counts: { ...perRuleCounts },
    })),
    ...inputOverrides,
  };
};

test('emits denominated aggregate and per-rule metrics and a public-v1 decision', () => {
  const output = computeMetrics(input(), thresholds);
  assert.equal(output.metrics.finding_recall.value, 0.8);
  assert.equal(output.metrics.precision.value, 1);
  assert.equal(output.metrics.incorrect_finding_rate_fdr.value, 0);
  assert.equal(output.metrics.abstention_rate.denominator, 24);
  assert.equal(output.metrics.double_label_coverage.value, 5 / 24);
  const validationRule = output.per_rule.find((rule) => rule.rule_id === 'LLM-VAL-001');
  assert.equal(validationRule.support.positive_defects, 10);
  assert.equal(validationRule.metrics.finding_recall.denominator, 10);
  assert.equal(output.release_evaluation.verdict, 'public_v1');
  assert.deepEqual(output.not_estimable, []);
});

test('returns limited_experimental when public thresholds fail but limited thresholds pass', () => {
  const output = computeMetrics(input({
    true_positives: 7,
    false_negatives: 3,
    false_positives: 1,
    double_labeled_items: 0,
    reviewer_agreements: 0,
  }), thresholds);
  assert.equal(output.release_evaluation.verdict, 'limited_experimental');
  assert.equal(output.release_evaluation.public_v1.passed, false);
  assert.equal(output.release_evaluation.limited_experimental.passed, true);
  assert.equal(output.release_evaluation.limited_experimental.required_label, 'experimental');
});

test('automatic check failure and unresolved critical false positive force no-go', () => {
  const candidate = input({
    true_positives: 8,
    false_positives: 1,
    unresolved_critical_false_positives: 1,
  });
  candidate.automatic_no_go_checks.all_findings_have_resolvable_evidence = false;
  const output = computeMetrics(candidate, thresholds);
  assert.equal(output.release_evaluation.verdict, 'no_go');
  assert.equal(output.release_evaluation.automatic_no_go.triggered, true);
  assert.match(output.release_evaluation.decision_reasons.join('\n'), /resolvable repository-relative evidence/);
  assert.match(output.release_evaluation.decision_reasons.join('\n'), /8 unresolved critical/);
});

test('zero denominators are not_estimable and cannot pass a release gate', () => {
  const zero = counts({
    true_positives: 0,
    false_negatives: 0,
    false_positives: 0,
    true_negatives: 0,
    abstentions: 0,
    eligible_scans: 0,
    not_applicable: 0,
    all_scans: 0,
    reviewer_agreements: 0,
    double_labeled_items: 0,
  });
  const output = computeMetrics(input({}, {
    counts: zero,
    per_rule: ENABLED_RULE_IDS.map((rule_id) => ({ rule_id, counts: { ...zero } })),
  }), thresholds);
  assert.equal(output.metrics.finding_recall.status, 'not_estimable');
  assert.equal(output.metrics.finding_recall.value, null);
  assert.equal(output.release_evaluation.verdict, 'no_go');
  assert.ok(output.not_estimable.includes('aggregate.finding_recall'));
  assert.match(output.release_evaluation.decision_reasons.join('\n'), /not_estimable/);
});

test('rejects inconsistent aggregate and per-rule denominators', () => {
  const candidate = input();
  candidate.per_rule[0].counts.true_positives = 7;
  assert.throws(() => computeMetrics(candidate, thresholds), /does not equal per-rule sum/);
  const subsetError = input({ unresolved_critical_false_positives: 1 });
  assert.throws(() => computeMetrics(subsetError, thresholds), /exceed false positives/);
});

test('normalizes per-rule output order for deterministic evaluation', () => {
  const base = input();
  const reversed = { ...base, per_rule: [...base.per_rule].reverse() };
  assert.deepEqual(computeMetrics(base, thresholds), computeMetrics(reversed, thresholds));
  assert.deepEqual(
    computeMetrics(base, thresholds).per_rule.map((rule) => rule.rule_id),
    [...ENABLED_RULE_IDS].sort((left, right) => left.localeCompare(right, 'en-US')),
  );
});

test('requires the exact frozen eight-rule catalogue with no omissions or fake ids', () => {
  const omitted = input();
  omitted.per_rule = omitted.per_rule.slice(1);
  assert.throws(() => computeMetrics(omitted, thresholds), /exactly 8 frozen enabled rules/);

  const fake = input();
  fake.per_rule = fake.per_rule.map((rule, index) => index === 0
    ? { ...rule, rule_id: 'LLM-EXM-001' }
    : rule);
  assert.throws(() => computeMetrics(fake, thresholds), /frozen enabled catalogue/);

  const duplicate = input();
  duplicate.per_rule[0] = { ...duplicate.per_rule[1] };
  assert.throws(() => computeMetrics(duplicate, thresholds), /duplicate per-rule entry/);
});
