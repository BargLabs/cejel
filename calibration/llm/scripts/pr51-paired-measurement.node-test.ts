import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decidePair,
  PR51_PAIRED_PROTOCOL_ID,
  scoreArm,
  type ArmMeasurement,
  type Opportunity,
} from './pr51-paired-measurement.js';

function arm(findings: ArmMeasurement['repositories'][number]['findings']): ArmMeasurement {
  return {
    schema_version: '1.0.0',
    protocol_id: PR51_PAIRED_PROTOCOL_ID,
    status: 'completed_arm',
    arm: 'baseline',
    detector_commit: 'a'.repeat(40),
    golden_manifest_sha256: 'b'.repeat(64),
    opportunity_manifest_sha256: 'c'.repeat(64),
    bindings_byte_sha256: 'd'.repeat(64),
    pre_result_commitment_byte_sha256: 'e'.repeat(64),
    harness_byte_sha256: 'f'.repeat(64),
    execution_bundle_sha256: '0'.repeat(64),
    completed_at: '2026-08-08T00:00:00.000Z',
    repositories: [{
      repository_id: 'example/repo',
      commit_sha: '1'.repeat(40),
      git_tree_sha: '2'.repeat(40),
      input_source_sha256: '3'.repeat(64),
      findings,
      rule_states: [{ rule_id: 'LLM-EVL-002', state: 'insufficient_data' }],
    }],
  };
}

const opportunities: Opportunity[] = [
  {
    opportunity_id: 'positive-one',
    repository_id: 'example/repo',
    rule_id: 'LLM-EVL-002',
    ground_truth_label: 'present',
    evidence_scope: { path_or_reference: 'judge.ts', start_line: 10, end_line: 14 },
  },
  {
    opportunity_id: 'positive-two',
    repository_id: 'example/repo',
    rule_id: 'LLM-EVL-002',
    ground_truth_label: 'present',
    evidence_scope: { path_or_reference: 'other.ts', start_line: 30, end_line: 30 },
  },
];

describe('PR #51 paired measurement scoring', () => {
  it('matches only an exact repository, rule, path, and positive span', () => {
    const measurement = arm([
      {
        ruleId: 'LLM-EVL-002',
        severity: 'warning',
        confidence: 'high',
        summary: 'matched',
        evidence: { path: 'judge.ts', line: 12, label: 'one local chain' },
      },
      {
        ruleId: 'LLM-EVL-002',
        severity: 'warning',
        confidence: 'high',
        summary: 'unmatched',
        evidence: { path: 'judge.ts', line: 20, label: 'outside span' },
      },
    ]);

    assert.deepEqual(scoreArm(measurement, opportunities), {
      findings: 2,
      true_positives: 1,
      false_positives: 1,
      abstentions: 1,
      recall: 0.5,
    });
  });

  it('counts duplicate findings conservatively as false positives', () => {
    const duplicate = {
      ruleId: 'LLM-EVL-002' as const,
      severity: 'warning' as const,
      confidence: 'high' as const,
      summary: 'duplicate',
      evidence: { path: 'judge.ts', line: 12, label: 'same opportunity' },
    };
    assert.deepEqual(scoreArm(arm([duplicate, duplicate]), opportunities), {
      findings: 2,
      true_positives: 1,
      false_positives: 1,
      abstentions: 1,
      recall: 0.5,
    });
  });

  it('does not relabel missed positive opportunities as scan-level abstentions', () => {
    const measurement = arm([]);
    measurement.repositories[0].rule_states = [{ rule_id: 'LLM-EVL-002', state: 'not_applicable' }];
    assert.deepEqual(scoreArm(measurement, opportunities), {
      findings: 0,
      true_positives: 0,
      false_positives: 0,
      abstentions: 0,
      recall: 0,
    });
  });

  it('implements the locked disposition rule', () => {
    const baseline = { findings: 3, true_positives: 0, false_positives: 3, abstentions: 0, recall: 0 };
    assert.equal(decidePair(baseline, { ...baseline, findings: 4, true_positives: 1, recall: 1 / 34 }), 'merge');
    assert.equal(decidePair(baseline, { ...baseline, findings: 2, false_positives: 2 }), 'merge');
    assert.equal(decidePair(baseline, baseline), 'close');
    assert.equal(decidePair(baseline, { ...baseline, findings: 4, false_positives: 4 }), 'close');
    assert.equal(decidePair({ ...baseline, true_positives: 1, recall: 1 / 34 }, baseline), 'close');
  });
});
