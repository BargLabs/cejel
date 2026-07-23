import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { computeMetrics, ENABLED_RULE_IDS } from './compute-metrics.mjs';
import { canonicalize, hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';
import { createDetectorFreezeRecord } from './freeze-detector.mjs';

const thresholds = JSON.parse(readFileSync(new URL('../release-thresholds.json', import.meta.url), 'utf8'));
const sha = (value) => createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
const bound = (document, extra = {}) => ({ ...extra, document_sha256: sha(document), document });
const BUILD_SHA = 'b'.repeat(64);

function manifest(cohort, repositoryId, commit) {
  const entryWithoutHash = {
    repository_id: repositoryId,
    url: `https://github.com/${repositoryId}`,
    default_branch_observed: 'main',
    commit_sha: commit,
    git_tree_sha: 'd'.repeat(40),
    license_spdx: 'MIT',
    primary_language: 'typescript_javascript',
    primary_surface: 'chat_app',
    provider_surface: 'openai',
    inclusion_reason: 'Synthetic measurement evidence used by the unit test.',
    source_available_at_freeze: true,
  };
  const withoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', policy_id: 'llm-selection-v1',
    cohort, status: 'frozen', frozen_at: '2026-07-22T00:00:00Z',
    frozen_by: ['reviewer-a', 'reviewer-b'], review_method: 'two_independent_ai',
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; entry excludes entry_sha256; manifest excludes manifest_sha256 and attestation',
    repositories: [{ ...entryWithoutHash, entry_sha256: hashRepositoryEntry(entryWithoutHash) }],
  };
  return { ...withoutHash, manifest_sha256: hashManifest(withoutHash), attestation: { method: 'internal_dual_ai_review', reference: 'internal-witness:test' } };
}

function fixture() {
  const golden = manifest('golden', 'owner/golden', 'a'.repeat(40));
  const untouched = manifest('untouched', 'owner/untouched', 'c'.repeat(40));
  const ledger = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen',
    detector_build_sha256: BUILD_SHA, golden_manifest_sha256: golden.manifest_sha256,
    frozen_at: '2026-07-22T01:00:00Z', frozen_before_untouched: true,
    reviewed_by: ['reviewer-a', 'reviewer-b'], open_corrections: 0, entries: [],
  };
  const freeze = createDetectorFreezeRecord({
    gitCommit: 'e'.repeat(40), buildSha256: BUILD_SHA, artifactName: 'cejel',
    frozenAt: '2026-07-22T02:00:00Z',
    runtime: { name: 'node', version: 'v24', platform: 'linux', architecture: 'x64' },
    networkIsolation: { mode: 'no-egress', argvPrefix: ['/no-egress'], evidenceReference: 'internal-witness:no-egress', confirmed: true },
    ledger, ledgerSha256: sha(ledger),
  });
  const execution_receipts = [];
  const llm_reports = [];
  const label_records = [];
  for (const [cohort, current] of [['golden', golden], ['untouched', untouched]]) {
    const repository = current.repositories[0];
    const findings = ENABLED_RULE_IDS.map((ruleId) => ({
      ruleId, severity: 'warning', confidence: 'high', summary: `${ruleId} synthetic finding`,
      evidence: { path: 'src/app.ts', line: 1, label: 'synthetic evidence' },
    }));
    const report = {
      result: {
        status: 'assessed_with_limitations', findings,
        ruleResults: ENABLED_RULE_IDS.map((ruleId, index) => ({ ruleId, state: 'finding', findings: [findings[index]] })),
      },
    };
    const findingIds = findings.map((finding, index) => `llm-finding-${sha({ repository_id: repository.repository_id, index, finding })}`);
    const receipt = {
      schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', cohort,
      repository_id: repository.repository_id, commit_sha: repository.commit_sha,
      git_tree_sha: repository.git_tree_sha, manifest_sha256: current.manifest_sha256,
      detector_build_sha256: BUILD_SHA,
      detector_freeze_sha256: cohort === 'untouched' ? freeze.record_sha256 : null,
      network_isolation_mode: 'no-egress', completed_at: '2026-07-22T03:00:00Z',
      output_outside_source: true, llm_report_sha256: 'f'.repeat(64),
      llm_report_canonical_sha256: sha(report), finding_ids: findingIds,
      rule_states: ENABLED_RULE_IDS.map((rule_id) => ({ rule_id, state: 'finding' })),
    };
    execution_receipts.push(bound(receipt));
    llm_reports.push(bound(report, { cohort, repository_id: repository.repository_id }));
    ENABLED_RULE_IDS.forEach((ruleId, ruleIndex) => {
      for (const reviewer of ['reviewer-a', 'reviewer-b']) {
        const label = {
          schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
          label_id: `llm-label-${cohort}-${ruleIndex}-${reviewer}`,
          cohort, repository: { repository_id: repository.repository_id, commit_sha: repository.commit_sha },
          rule: { catalogue_id: 'llm-rules-v1', rule_id: ruleId, rule_version: '1.0.0' },
          opportunity_id: `${cohort}.opportunity:${ruleIndex}`, detector_finding_id: findingIds[ruleIndex],
          label: 'present', evidence: [{ kind: 'source_span', path_or_reference: 'src/app.ts', start_line: 1, end_line: 1, sha256: '9'.repeat(64), rationale: 'Synthetic evidence rationale for measurement testing.' }],
          review: { labeler_id: reviewer, role: reviewer === 'reviewer-a' ? 'primary_labeler' : 'independent_reviewer', independent_of_rule_author: true, detector_output_visible: true, adjudication_status: 'not_required' },
          created_at: '2026-07-22T04:00:00Z',
        };
        label_records.push(bound(label));
      }
    });
  }
  return {
    protocol_id: 'cejel-llm-calibration-v1',
    automatic_no_go_checks: {
      free_core_unchanged_without_pack: true, offline_scan_path_verified: true,
      all_findings_have_resolvable_evidence: true, prohibited_public_claims_absent: true,
      untouched_blinding_preserved: true,
    },
    evidence: {
      golden_manifest: bound(golden), untouched_manifest: bound(untouched), detector_freeze: bound(freeze),
      execution_receipts, llm_reports, label_records,
    },
  };
}

test('derives denominated counts from cryptographically bound receipts, reports, and labels', () => {
  const output = computeMetrics(fixture(), thresholds);
  assert.equal(output.counts.true_positives, 8);
  assert.equal(output.counts.adjudicated_items, 8);
  assert.equal(output.metrics.double_label_coverage.denominator, 8);
  assert.equal(output.metrics.double_label_coverage.value, 1);
  assert.equal(output.quality_controls.cohen_kappa.denominator, 8);
  assert.equal(output.quality_controls.cohen_kappa.status, 'not_estimable');
  assert.equal(output.quality_controls.cohen_kappa.observed_agreement, 1);
  assert.equal(output.evidence_bindings.execution_receipts, 2);
  assert.equal(output.release_evaluation.verdict, 'limited_experimental');
});

test('rejects arbitrary evidence changes and incomplete finding adjudication', () => {
  const tampered = fixture();
  tampered.evidence.label_records[0].document.label = 'absent';
  assert.throws(() => computeMetrics(tampered, thresholds), /SHA-256 mismatch/);

  const incomplete = fixture();
  incomplete.evidence.label_records = incomplete.evidence.label_records.filter(
    (record) => record.document.detector_finding_id !== incomplete.evidence.execution_receipts[0].document.finding_ids[0],
  );
  assert.throws(() => computeMetrics(incomplete, thresholds), /lacks final adjudication/);
});

test('requires untouched receipts to bind the frozen detector', () => {
  const candidate = fixture();
  const receipt = candidate.evidence.execution_receipts[1].document;
  receipt.detector_freeze_sha256 = '0'.repeat(64);
  candidate.evidence.execution_receipts[1] = bound(receipt);
  assert.throws(() => computeMetrics(candidate, thresholds), /not bound to detector freeze/);
});

test('derives Cohen kappa from the full paired-label contingency table', () => {
  const candidate = fixture();
  const pair = candidate.evidence.label_records.filter((record) =>
    record.document.cohort === 'untouched' && record.document.opportunity_id === 'untouched.opportunity:0'
  );
  const independent = pair.find((record) => record.document.review.role === 'independent_reviewer');
  independent.document.label = 'absent';
  independent.document.review.adjudication_status = 'pending';
  independent.document_sha256 = sha(independent.document);
  const primary = pair.find((record) => record.document.review.role === 'primary_labeler');
  primary.document.review.adjudication_status = 'pending';
  primary.document_sha256 = sha(primary.document);
  const adjudicator = structuredClone(primary.document);
  adjudicator.label_id = 'llm-label-untouched-0-adjudicator';
  adjudicator.review = {
    labeler_id: 'reviewer-c', role: 'adjudicator', independent_of_rule_author: true,
    detector_output_visible: true, adjudication_status: 'adjudicated',
    supersedes_label_ids: pair.map((record) => record.document.label_id),
    rationale: 'The source evidence supports the original present label after resolving the disagreement.',
  };
  candidate.evidence.label_records.push(bound(adjudicator));

  const output = computeMetrics(candidate, thresholds);
  assert.equal(output.quality_controls.cohen_kappa.denominator, 8);
  assert.equal(output.quality_controls.cohen_kappa.observed_agreement, 0.875);
  assert.equal(output.quality_controls.cohen_kappa.expected_agreement, 0.875);
  assert.equal(output.quality_controls.cohen_kappa.value, 0);
  assert.equal(output.quality_controls.cohen_kappa.contingency.present.absent, 1);
});
