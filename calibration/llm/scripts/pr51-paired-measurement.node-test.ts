import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { CEJEL_LLM_ENABLED_RULE_IDS } from '../../../src/packs/llm/index.js';

import {
  armOutputPath,
  assertArmBundleCommit,
  decidePair,
  expectedCandidateTree,
  PR51_PAIRED_PROTOCOL_ID,
  scoreArm,
  validateArmMeasurement,
  validateFrozenInputs,
  type ArmMeasurement,
  type OpportunityManifest,
  type Opportunity,
  type PreResultCommitment,
  type PreregistrationBindings,
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
    runtime: {
      name: 'node', version: 'v24.0.0', platform: 'darwin', architecture: 'arm64',
      git_version: 'git version 2.50.1',
    },
    prior_arm_byte_sha256: null,
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

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

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

describe('PR #51 paired measurement integrity guards', () => {
  it('rejects tracked and untracked changes in a frozen checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'cejel-pr51-frozen-'));
    try {
      execFileSync('git', ['init', '-q', root]);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Cejel Test']);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@cejel.invalid']);
      writeFileSync(resolve(root, 'fixture.txt'), 'frozen\n');
      writeFileSync(resolve(root, '.gitignore'), '*.ignored\n');
      execFileSync('git', ['-C', root, 'add', 'fixture.txt', '.gitignore']);
      execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture']);
      const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const tree = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
      const manifest = {
        schema_version: '1.0.0',
        protocol_id: 'cejel-llm-calibration-v1',
        status: 'frozen',
        cohort: 'golden',
        manifest_sha256: 'a'.repeat(64),
        repositories: [{ repository_id: 'synthetic/repo', commit_sha: commit, git_tree_sha: tree }],
      };
      const matrix = {
        repositories: [{
          cohort: 'golden', repository_id: 'synthetic/repo', commit_sha: commit, source_root: root,
        }],
      };
      assert.equal(validateFrozenInputs(manifest, matrix).length, 1);
      writeFileSync(resolve(root, 'contamination.ignored'), 'ignored but visible to a scanner\n');
      assert.throws(() => validateFrozenInputs(manifest, matrix), /tracked, untracked, or ignored files/);
      rmSync(resolve(root, 'contamination.ignored'));
      writeFileSync(resolve(root, 'untracked.txt'), 'not frozen\n');
      assert.throws(() => validateFrozenInputs(manifest, matrix), /tracked, untracked, or ignored files/);
      rmSync(resolve(root, 'untracked.txt'));
      writeFileSync(resolve(root, 'fixture.txt'), 'changed\n');
      assert.throws(() => validateFrozenInputs(manifest, matrix), /tracked, untracked, or ignored files/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a bundle compiled from any commit other than its arm commit', () => {
    assert.doesNotThrow(() => assertArmBundleCommit('a'.repeat(40), 'a'.repeat(40), 'a'.repeat(40)));
    assert.throws(
      () => assertArmBundleCommit('b'.repeat(40), 'a'.repeat(40), 'a'.repeat(40)),
      /not built from the exact committed detector revision/,
    );
  });

  it('rejects raw arm output inside any repository root', () => {
    const root = mkdtempSync(join(tmpdir(), 'cejel-pr51-output-'));
    const external = mkdtempSync(join(tmpdir(), 'cejel-pr51-external-'));
    try {
      mkdirSync(resolve(root, 'nested'));
      assert.throws(() => armOutputPath(resolve(root, 'nested', 'arm.json'), [root]), /must be outside/);
      assert.equal(armOutputPath(resolve(external, 'arm.json'), [root]), resolve(realpathSync(external), 'arm.json'));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('rejects a structurally valid arm with changed bound metadata', () => {
    const bindingBytes = Buffer.from('synthetic bindings\n');
    const commitmentBytes = Buffer.from('synthetic commitment\n');
    const runtime = {
      name: 'node', version: 'v24.0.0', platform: 'darwin', architecture: 'arm64',
      git_version: 'git version 2.50.1',
    };
    const manifest = {
      schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen', cohort: 'golden',
      manifest_sha256: 'b'.repeat(64),
      repositories: [{ repository_id: 'example/repo', commit_sha: '1'.repeat(40), git_tree_sha: '2'.repeat(40) }],
    };
    const opportunityManifest: OpportunityManifest = {
      schema_version: '1.0.0', protocol_id: PR51_PAIRED_PROTOCOL_ID, status: 'frozen',
      manifest_sha256: 'c'.repeat(64),
      label_counts: { present: 0, absent: 0, not_applicable: 0 }, opportunities: [],
    };
    const bindings: PreregistrationBindings = {
      schema_version: '1.0.0', protocol_id: PR51_PAIRED_PROTOCOL_ID,
      status: 'preregistered_before_measurement',
      inputs: {
        golden_manifest: { path: 'golden', byte_sha256: 'a'.repeat(64), canonical_sha256: 'b'.repeat(64), repositories: 1 },
        opportunity_manifest: {
          path: 'opportunities', byte_sha256: 'a'.repeat(64), canonical_sha256: 'c'.repeat(64),
          opportunities: 0, present: 0, absent: 0, not_applicable: 0,
        },
      },
      harness: { path: 'harness', byte_sha256: 'f'.repeat(64) },
      builder: { path: 'builder', byte_sha256: 'e'.repeat(64) },
      candidate_source: {
        repository: 'BargLabs/cejel', pull_request: 51, original_base_commit: '3'.repeat(40),
        original_head_commit: '4'.repeat(40), original_stable_patch_id: '5'.repeat(40), expected_commit_count: 1,
        application_method: 'git-merge-tree-write-tree',
      },
      network_isolation: {
        wrapper: { path: 'wrapper', byte_sha256: '6'.repeat(64) },
        hook: { path: 'hook', byte_sha256: '7'.repeat(64) },
        probe: { path: 'probe', byte_sha256: '8'.repeat(64) },
      },
    };
    const commitment: PreResultCommitment = {
      schema_version: '1.0.0', protocol_id: PR51_PAIRED_PROTOCOL_ID, status: 'frozen_pre_result',
      created_at: '2026-08-08T00:00:00.000Z', detector_results_seen_before_commitment: false,
      preregistration_commit: '9'.repeat(40), baseline_commit: 'a'.repeat(40), candidate_commit: 'b'.repeat(40),
      candidate_pr: 51, candidate_diff_sha256: 'd'.repeat(64),
      execution_bundles: { baseline_sha256: '0'.repeat(64), candidate_sha256: '1'.repeat(64) },
      runtime, execution_order: ['baseline', 'candidate'], bindings_byte_sha256: sha256(bindingBytes),
    };
    const measurement = arm([]);
    Object.assign(measurement, {
      detector_commit: commitment.baseline_commit,
      golden_manifest_sha256: manifest.manifest_sha256,
      opportunity_manifest_sha256: opportunityManifest.manifest_sha256,
      bindings_byte_sha256: sha256(bindingBytes),
      pre_result_commitment_byte_sha256: sha256(commitmentBytes),
      runtime,
    });
    measurement.repositories[0].rule_states = CEJEL_LLM_ENABLED_RULE_IDS.map((ruleId) => ({
      rule_id: ruleId,
      state: 'not_applicable',
    }));
    assert.doesNotThrow(() => validateArmMeasurement(
      measurement, 'baseline', manifest, opportunityManifest, bindings, bindingBytes,
      commitment, commitmentBytes, null,
    ));
    measurement.execution_bundle_sha256 = '9'.repeat(64);
    assert.throws(() => validateArmMeasurement(
      measurement, 'baseline', manifest, opportunityManifest, bindings, bindingBytes,
      commitment, commitmentBytes, null,
    ), /does not share the commitment/);
  });

  it('derives the rebased candidate tree from Git without relying on context-sensitive patch IDs', () => {
    const root = mkdtempSync(join(tmpdir(), 'cejel-pr51-tree-'));
    try {
      execFileSync('git', ['init', '-q', root]);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Cejel Test']);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@cejel.invalid']);
      writeFileSync(resolve(root, 'context.txt'), 'before\nafter\n');
      execFileSync('git', ['-C', root, 'add', 'context.txt']);
      execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'base']);
      const originalBase = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      execFileSync('git', ['-C', root, 'switch', '-q', '-c', 'original']);
      writeFileSync(resolve(root, 'feature.txt'), 'original change\n');
      execFileSync('git', ['-C', root, 'add', 'feature.txt']);
      execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'feature']);
      const originalHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      execFileSync('git', ['-C', root, 'switch', '-q', '-c', 'baseline', originalBase]);
      writeFileSync(resolve(root, 'context.txt'), 'new preface\nbefore\nafter\n');
      execFileSync('git', ['-C', root, 'add', 'context.txt']);
      execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'later context']);
      const baseline = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const expectedTree = expectedCandidateTree(root, baseline, originalBase, originalHead);
      execFileSync('git', ['-C', root, 'cherry-pick', originalHead], { stdio: 'ignore' });
      const candidateTree = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
      assert.equal(candidateTree, expectedTree);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
