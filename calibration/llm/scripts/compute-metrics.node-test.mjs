import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  computeMetrics,
  ENABLED_RULE_IDS,
  hashOpportunityManifest,
  hashSourceEvidenceIndex,
} from './compute-metrics.mjs';
import { canonicalize, hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';
import { createDetectorFreezeRecord } from './freeze-detector.mjs';

const thresholds = JSON.parse(readFileSync(new URL('../release-thresholds.json', import.meta.url), 'utf8'));
const sha = (value) => createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
const rawSha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const bound = (document, extra = {}) => ({ ...extra, document_sha256: sha(document), document });
const BUILD_SHA = 'b'.repeat(64);
const SOURCE_CONTENT = Buffer.from('const first = true;\nconst second = true;', 'utf8');
const SOURCE_SHA256 = createHash('sha256').update(SOURCE_CONTENT).digest('hex');
const gitObjectSha1 = (type, bytes) => createHash('sha1')
  .update(Buffer.from(`${type} ${bytes.length}\0`, 'utf8'))
  .update(bytes)
  .digest('hex');
const gitTreeEntry = (mode, name, sha1) => Buffer.concat([
  Buffer.from(`${mode} ${name}\0`, 'utf8'),
  Buffer.from(sha1, 'hex'),
]);
const SOURCE_BLOB_SHA1 = gitObjectSha1('blob', SOURCE_CONTENT);
const SOURCE_DIRECTORY_TREE = gitTreeEntry('100644', 'app.ts', SOURCE_BLOB_SHA1);
const SOURCE_DIRECTORY_TREE_SHA1 = gitObjectSha1('tree', SOURCE_DIRECTORY_TREE);
const ROOT_TREE = gitTreeEntry('40000', 'src', SOURCE_DIRECTORY_TREE_SHA1);
const ROOT_TREE_SHA1 = gitObjectSha1('tree', ROOT_TREE);

function manifest(cohort, repositoryId, commit) {
  const entryWithoutHash = {
    repository_id: repositoryId,
    url: `https://github.com/${repositoryId}`,
    default_branch_observed: 'main',
    commit_sha: commit,
    git_tree_sha: ROOT_TREE_SHA1,
    license_spdx: 'MIT',
    primary_language: 'typescript_javascript',
    primary_surface: 'chat_app',
    provider_surface: 'openai',
    inclusion_reason: 'Synthetic measurement evidence used by the unit test.',
    source_available_at_freeze: true,
  };
  const withoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', policy_id: 'llm-selection-v1.1',
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
  const sourceIndexWithoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen_before_detector_results',
    hash_contract:
      'rfc8785-sha256-v1; index excludes index_sha256 and attestation; file content_sha256 hashes decoded whole-file bytes',
    cohort_bindings: {
      golden_manifest_sha256: golden.manifest_sha256,
      untouched_manifest_sha256: untouched.manifest_sha256,
    },
    files: [['golden', golden], ['untouched', untouched]].map(([cohort, current]) => ({
      cohort,
      repository_id: current.repositories[0].repository_id,
      commit_sha: current.repositories[0].commit_sha,
      git_tree_sha: current.repositories[0].git_tree_sha,
      path: 'src/app.ts',
      blob_sha1: SOURCE_BLOB_SHA1,
      content_base64: SOURCE_CONTENT.toString('base64'),
      content_sha256: SOURCE_SHA256,
      tree_proof: [
        { tree_sha1: ROOT_TREE_SHA1, tree_base64: ROOT_TREE.toString('base64') },
        { tree_sha1: SOURCE_DIRECTORY_TREE_SHA1, tree_base64: SOURCE_DIRECTORY_TREE.toString('base64') },
      ],
    })),
  };
  const sourceEvidenceIndex = {
    ...sourceIndexWithoutHash,
    index_sha256: hashSourceEvidenceIndex(sourceIndexWithoutHash),
    attestation: { method: 'internal_witness', reference: 'internal-witness:test-source-index' },
  };
  const ledger = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen',
    detector_build_sha256: BUILD_SHA, golden_manifest_sha256: golden.manifest_sha256,
    golden_opportunity_manifest_sha256: '2'.repeat(64),
    frozen_at: '2026-07-22T01:00:00Z', frozen_before_untouched: true,
    reviewed_by: ['reviewer-a', 'reviewer-b'], open_corrections: 0, entries: [],
  };
  const freeze = createDetectorFreezeRecord({
    gitCommit: 'e'.repeat(40), buildSha256: BUILD_SHA, artifactName: 'cejel',
    frozenAt: '2026-07-22T02:00:00Z',
    runtime: { name: 'node', version: 'v24', platform: 'linux', architecture: 'x64' },
    networkIsolation: { mode: 'no-egress', argvPrefix: ['/no-egress'], evidenceReference: 'internal-witness:no-egress', confirmed: true },
    ledger, ledgerSha256: sha(ledger),
    goldenExecutionEvidenceSha256: '1'.repeat(64),
    goldenExecutionEvidence: { document: { executions: [{}] }, findings: new Map() },
  });
  const execution_receipts = [];
  const llm_reports = [];
  const label_records = [];
  const opportunities = [];
  for (const [cohort, current] of [['golden', golden], ['untouched', untouched]]) {
    const repository = current.repositories[0];
    const findings = ENABLED_RULE_IDS.flatMap((ruleId) => [0, 1].map((slot) => ({
      ruleId, severity: 'warning', confidence: 'high', summary: `${ruleId} synthetic finding ${slot}`,
      evidence: { path: 'src/app.ts', line: slot + 1, label: 'synthetic evidence' },
    })));
    const report = {
      result: {
        status: 'assessed_with_limitations', findings,
        ruleResults: ENABLED_RULE_IDS.map((ruleId, index) => ({
          ruleId,
          state: 'finding',
          findings: findings.slice(index * 2, (index * 2) + 2),
        })),
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
      for (const slot of [0, 1]) {
        const opportunityId = `${cohort}.opportunity:${ruleIndex}:${slot}`;
        opportunities.push({
          opportunity_id: opportunityId,
          cohort,
          repository_id: repository.repository_id,
          commit_sha: repository.commit_sha,
          rule_id: ruleId,
          evidence_scope: {
            kind: 'source_span',
            path_or_reference: 'src/app.ts',
            start_line: slot + 1,
            end_line: slot + 1,
            sha256: SOURCE_SHA256,
            rationale: 'Synthetic predefined evidence scope for measurement testing.',
          },
        });
        for (const reviewer of ['reviewer-a', 'reviewer-b']) {
          const label = {
            schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
            label_id: `llm-label-${cohort}-${ruleIndex}-${slot}-${reviewer}`,
            cohort, repository: { repository_id: repository.repository_id, commit_sha: repository.commit_sha },
            rule: { catalogue_id: 'llm-rules-v1', rule_id: ruleId, rule_version: '1.0.0' },
            opportunity_id: opportunityId, detector_finding_id: null,
            label: 'present', evidence: [{ kind: 'source_span', path_or_reference: 'src/app.ts', start_line: slot + 1, end_line: slot + 1, sha256: SOURCE_SHA256, rationale: 'Synthetic evidence rationale for measurement testing.' }],
            review: { labeler_id: reviewer, role: reviewer === 'reviewer-a' ? 'primary_labeler' : 'independent_reviewer', independent_of_rule_author: true, detector_output_visible: false, adjudication_status: 'not_required' },
            created_at: '2026-07-22T00:20:00Z',
          };
          label_records.push(bound(label));
        }
        const findingReview = {
          schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
          label_id: `llm-label-${cohort}-${ruleIndex}-${slot}-finding-review`,
          cohort, repository: { repository_id: repository.repository_id, commit_sha: repository.commit_sha },
          rule: { catalogue_id: 'llm-rules-v1', rule_id: ruleId, rule_version: '1.0.0' },
          opportunity_id: opportunityId, detector_finding_id: findingIds[(ruleIndex * 2) + slot],
          label: 'present', evidence: [{ kind: 'source_span', path_or_reference: 'src/app.ts', start_line: slot + 1, end_line: slot + 1, sha256: SOURCE_SHA256, rationale: 'Post-run finding match to the frozen opportunity evidence scope.' }],
          review: { labeler_id: 'reviewer-c', role: 'finding_reviewer', independent_of_rule_author: true, detector_output_visible: true, adjudication_status: 'not_required' },
          created_at: '2026-07-22T04:30:00Z',
        };
        label_records.push(bound(findingReview));
      }
    });
  }
  const opportunityWithoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen',
    frozen_at: '2026-07-22T00:30:00Z', frozen_before_detector_results: true,
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; manifest excludes manifest_sha256 and attestation',
    cohort_bindings: {
      golden_manifest_sha256: golden.manifest_sha256,
      untouched_manifest_sha256: untouched.manifest_sha256,
    },
    opportunities,
    blind_label_bindings: label_records
      .filter((record) => record.document.review.role !== 'finding_reviewer')
      .map((record) => ({
        label_id: record.document.label_id,
        document_sha256: record.document_sha256,
        role: record.document.review.role,
      })),
  };
  const opportunityManifest = {
    ...opportunityWithoutHash,
    manifest_sha256: hashOpportunityManifest(opportunityWithoutHash),
    attestation: { method: 'internal_witness', reference: 'internal-witness:test-opportunities' },
  };
  const preResultCommitment = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen_pre_result',
    created_at: '2026-07-22T00:45:00Z', detector_results_seen_before_commitment: false,
    golden_manifest_sha256: golden.manifest_sha256,
    untouched_manifest_sha256: untouched.manifest_sha256,
    opportunity_manifest_sha256: opportunityManifest.manifest_sha256,
    blind_label_bindings: opportunityManifest.blind_label_bindings,
  };
  const commitmentBinding = bound(preResultCommitment);
  for (const receiptBinding of execution_receipts) {
    receiptBinding.document.pre_result_commitment = {
      document_sha256: '6'.repeat(64), canonical_sha256: commitmentBinding.document_sha256,
      git_commit: '9'.repeat(40), git_path: 'calibration/llm/pre-result-commitment.json',
    };
    receiptBinding.document_sha256 = sha(receiptBinding.document);
  }
  const checkKinds = {
    free_core_unchanged_without_pack: 'test_run',
    offline_scan_path_verified: 'network_isolation_audit',
    all_findings_have_resolvable_evidence: 'derived_finding_path_audit',
    prohibited_public_claims_absent: 'claim_audit',
    untouched_blinding_preserved: 'chronology_audit',
  };
  const assertionNames = {
    free_core_unchanged_without_pack: 'default_without_pack_byte_identical',
    offline_scan_path_verified: 'network_isolation_receipts_match',
    all_findings_have_resolvable_evidence: 'all_finding_paths_cryptographically_resolved',
    prohibited_public_claims_absent: 'prohibited_claim_scan_zero_matches',
    untouched_blinding_preserved: 'pre_result_git_commit_precedes_execution',
  };
  const automatic_no_go_evidence = Object.fromEntries(Object.entries(checkKinds).map(([check_id, kind]) => {
    const evidenceContent = JSON.stringify({ check_id, detector_build_sha256: BUILD_SHA, verified: true });
    const audit = {
      schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', check_id,
      detector_build_sha256: BUILD_SHA, detector_source_commit: 'e'.repeat(40),
      generated_at: '2026-07-22T05:00:00Z', passed: true,
      assertions: [{
        name: assertionNames[check_id], passed: true,
        evidence_content: evidenceContent, evidence_sha256: rawSha(evidenceContent),
      }],
    };
    const content = JSON.stringify(audit);
    const document = {
      schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', check_id,
      observed_at: '2026-07-22T05:00:00Z',
      detector_binding: { build_sha256: BUILD_SHA, source_commit: 'e'.repeat(40) },
      artifacts: [{ kind, name: `${check_id}.json`, media_type: 'application/json', encoding: 'utf8', content, sha256: rawSha(content) }],
    };
    return [check_id, bound(document)];
  }));
  return {
    protocol_id: 'cejel-llm-calibration-v1',
    automatic_no_go_evidence,
    evidence: {
      golden_manifest: bound(golden), untouched_manifest: bound(untouched),
      source_evidence_index: bound(sourceEvidenceIndex),
      opportunity_manifest: bound(opportunityManifest), detector_freeze: bound(freeze),
      pre_result_commitment: commitmentBinding,
      execution_receipts, llm_reports, label_records,
    },
  };
}

function refreshBlindLabelBindings(candidate) {
  const manifest = candidate.evidence.opportunity_manifest.document;
  manifest.blind_label_bindings = candidate.evidence.label_records
    .filter((record) => record.document.review.role !== 'finding_reviewer')
    .map((record) => ({
      label_id: record.document.label_id,
      document_sha256: record.document_sha256,
      role: record.document.review.role,
    }));
  manifest.manifest_sha256 = hashOpportunityManifest(manifest);
  candidate.evidence.opportunity_manifest = bound(manifest);
  const commitment = candidate.evidence.pre_result_commitment.document;
  commitment.opportunity_manifest_sha256 = manifest.manifest_sha256;
  commitment.blind_label_bindings = manifest.blind_label_bindings;
  candidate.evidence.pre_result_commitment = bound(commitment);
  for (const receipt of candidate.evidence.execution_receipts) {
    receipt.document.pre_result_commitment.canonical_sha256 =
      candidate.evidence.pre_result_commitment.document_sha256;
    receipt.document_sha256 = sha(receipt.document);
  }
}

function refreshSourceEvidenceIndex(candidate) {
  const index = candidate.evidence.source_evidence_index.document;
  index.index_sha256 = hashSourceEvidenceIndex(index);
  candidate.evidence.source_evidence_index = bound(index);
}

function rewriteOpportunityEvidence(candidate, opportunityId, replacement) {
  const opportunity = candidate.evidence.opportunity_manifest.document.opportunities.find(
    (item) => item.opportunity_id === opportunityId,
  );
  Object.assign(opportunity.evidence_scope, replacement);
  for (const key of ['start_line', 'end_line']) {
    if (!(key in replacement)) delete opportunity.evidence_scope[key];
  }
  for (const record of candidate.evidence.label_records.filter(
    (item) => item.document.opportunity_id === opportunityId,
  )) {
    Object.assign(record.document.evidence[0], replacement);
    for (const key of ['start_line', 'end_line']) {
      if (!(key in replacement)) delete record.document.evidence[0][key];
    }
    record.document_sha256 = sha(record.document);
  }
  refreshBlindLabelBindings(candidate);
}

test('derives denominated counts from cryptographically bound receipts, reports, and labels', () => {
  const output = computeMetrics(fixture(), thresholds);
  assert.equal(output.counts.true_positives, 16);
  assert.equal(output.counts.adjudicated_items, 16);
  assert.equal(output.metrics.double_label_coverage.denominator, 16);
  assert.equal(output.metrics.double_label_coverage.value, 1);
  assert.equal(output.quality_controls.cohen_kappa.denominator, 16);
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
  assert.throws(() => computeMetrics(incomplete, thresholds), /detector finding lacks final adjudication/);
});

test('requires untouched receipts to bind the frozen detector', () => {
  const candidate = fixture();
  const receipt = candidate.evidence.execution_receipts[1].document;
  receipt.detector_freeze_sha256 = '0'.repeat(64);
  candidate.evidence.execution_receipts[1] = bound(receipt);
  assert.throws(() => computeMetrics(candidate, thresholds), /not bound to detector freeze/);
});

test('requires each report rule state to agree exactly with its top-level and nested findings', () => {
  const retainedFinding = fixture();
  const retainedReport = retainedFinding.evidence.llm_reports[1].document;
  retainedReport.result.ruleResults[0].state = 'not_applicable';
  retainedFinding.evidence.llm_reports[1] = bound(retainedReport, {
    cohort: 'untouched',
    repository_id: 'owner/untouched',
  });
  const retainedReceipt = retainedFinding.evidence.execution_receipts[1].document;
  retainedReceipt.llm_report_canonical_sha256 = sha(retainedReport);
  retainedReceipt.rule_states[0].state = 'not_applicable';
  retainedFinding.evidence.execution_receipts[1] = bound(retainedReceipt);
  assert.throws(
    () => computeMetrics(retainedFinding, thresholds),
    /rule state and findings are inconsistent/,
  );

  const emptyFindingState = fixture();
  const emptyReport = emptyFindingState.evidence.llm_reports[1].document;
  emptyReport.result.findings = emptyReport.result.findings.filter(
    (finding) => finding.ruleId !== 'LLM-IOH-001',
  );
  emptyReport.result.ruleResults[0].findings = [];
  emptyFindingState.evidence.llm_reports[1] = bound(emptyReport, {
    cohort: 'untouched',
    repository_id: 'owner/untouched',
  });
  const emptyReceipt = emptyFindingState.evidence.execution_receipts[1].document;
  emptyReceipt.llm_report_canonical_sha256 = sha(emptyReport);
  emptyFindingState.evidence.execution_receipts[1] = bound(emptyReceipt);
  assert.throws(
    () => computeMetrics(emptyFindingState, thresholds),
    /rule state and findings are inconsistent/,
  );

  const nestedMismatch = fixture();
  const nestedReport = nestedMismatch.evidence.llm_reports[1].document;
  nestedReport.result.ruleResults[0].findings = [nestedReport.result.findings[2]];
  nestedMismatch.evidence.llm_reports[1] = bound(nestedReport, {
    cohort: 'untouched',
    repository_id: 'owner/untouched',
  });
  const nestedReceipt = nestedMismatch.evidence.execution_receipts[1].document;
  nestedReceipt.llm_report_canonical_sha256 = sha(nestedReport);
  nestedMismatch.evidence.execution_receipts[1] = bound(nestedReceipt);
  assert.throws(
    () => computeMetrics(nestedMismatch, thresholds),
    /rule state and findings are inconsistent/,
  );
});

test('automatic no-go checks require hashed evidence and agree with derived chronology', () => {
  const tampered = fixture();
  tampered.automatic_no_go_evidence.free_core_unchanged_without_pack.document.artifacts[0].content += ' ';
  assert.throws(() => computeMetrics(tampered, thresholds), /SHA-256 mismatch/);

  const contradiction = fixture();
  const record = contradiction.automatic_no_go_evidence.untouched_blinding_preserved.document;
  const artifact = record.artifacts[0];
  const audit = JSON.parse(artifact.content);
  audit.passed = false;
  audit.assertions[0].passed = false;
  artifact.content = JSON.stringify(audit);
  artifact.sha256 = rawSha(artifact.content);
  contradiction.automatic_no_go_evidence.untouched_blinding_preserved = bound(record);
  assert.throws(() => computeMetrics(contradiction, thresholds), /contradicts derived evidence/);

  const wrongKind = fixture();
  const claim = wrongKind.automatic_no_go_evidence.prohibited_public_claims_absent.document;
  claim.artifacts[0].kind = 'test_run';
  wrongKind.automatic_no_go_evidence.prohibited_public_claims_absent = bound(claim);
  assert.throws(() => computeMetrics(wrongKind, thresholds), /requires claim_audit evidence/);

  const fabricatedAssertion = fixture();
  const freeCoreRecord = fabricatedAssertion.automatic_no_go_evidence.free_core_unchanged_without_pack.document;
  const freeCoreArtifact = freeCoreRecord.artifacts[0];
  const freeCoreAudit = JSON.parse(freeCoreArtifact.content);
  freeCoreAudit.assertions[0].evidence_content = '{"verified":false}';
  freeCoreArtifact.content = JSON.stringify(freeCoreAudit);
  freeCoreArtifact.sha256 = rawSha(freeCoreArtifact.content);
  fabricatedAssertion.automatic_no_go_evidence.free_core_unchanged_without_pack = bound(freeCoreRecord);
  assert.throws(() => computeMetrics(fabricatedAssertion, thresholds), /assertion 0 is invalid/);

  const genericAssertion = fixture();
  const claimRecord = genericAssertion.automatic_no_go_evidence.prohibited_public_claims_absent.document;
  const claimArtifact = claimRecord.artifacts[0];
  const claimAudit = JSON.parse(claimArtifact.content);
  claimAudit.assertions[0].name = 'generic-passed-assertion';
  claimArtifact.content = JSON.stringify(claimAudit);
  claimArtifact.sha256 = rawSha(claimArtifact.content);
  genericAssertion.automatic_no_go_evidence.prohibited_public_claims_absent = bound(claimRecord);
  assert.throws(() => computeMetrics(genericAssertion, thresholds), /required check-specific assertion/);
});

test('requires a frozen opportunity inventory and exact primary-label coverage', () => {
  const missingPrimary = fixture();
  missingPrimary.evidence.label_records = missingPrimary.evidence.label_records.filter((record) =>
    record.document.opportunity_id !== 'untouched.opportunity:0:0'
  );
  refreshBlindLabelBindings(missingPrimary);
  assert.throws(() => computeMetrics(missingPrimary, thresholds), /requires exactly one primary label/);

  const unboundOpportunity = fixture();
  const primary = unboundOpportunity.evidence.label_records.find((record) =>
    record.document.cohort === 'untouched' && record.document.review.role === 'primary_labeler'
  );
  primary.document.opportunity_id = 'untouched.unfrozen:0:0';
  primary.document_sha256 = sha(primary.document);
  refreshBlindLabelBindings(unboundOpportunity);
  assert.throws(() => computeMetrics(unboundOpportunity, thresholds), /absent from the frozen inventory/);

  const substitutedEvidence = fixture();
  const substitutedPrimary = substitutedEvidence.evidence.label_records.find((record) =>
    record.document.cohort === 'untouched' && record.document.review.role === 'primary_labeler'
  );
  substitutedPrimary.document.evidence[0].sha256 = '7'.repeat(64);
  substitutedPrimary.document_sha256 = sha(substitutedPrimary.document);
  refreshBlindLabelBindings(substitutedEvidence);
  assert.throws(() => computeMetrics(substitutedEvidence, thresholds), /does not match its frozen opportunity scope/);

  const tamperedInventory = fixture();
  tamperedInventory.evidence.opportunity_manifest.document.opportunities[0].evidence_scope.rationale =
    'A different rationale that preserves schema validity but changes the frozen inventory.';
  tamperedInventory.evidence.opportunity_manifest.document_sha256 = sha(
    tamperedInventory.evidence.opportunity_manifest.document,
  );
  assert.throws(() => computeMetrics(tamperedInventory, thresholds), /not a valid frozen inventory/);

  const lateInventory = fixture();
  lateInventory.evidence.opportunity_manifest.document.frozen_at = '2026-07-22T03:00:00Z';
  refreshBlindLabelBindings(lateInventory);
  assert.throws(() => computeMetrics(lateInventory, thresholds), /not frozen before detector results/);
});

test('cryptographically verifies source bytes, Git path proofs, and source-span bounds', () => {
  const fabricatedHash = fixture();
  const fabricatedFile = fabricatedHash.evidence.source_evidence_index.document.files[0];
  fabricatedFile.content_sha256 = '7'.repeat(64);
  refreshSourceEvidenceIndex(fabricatedHash);
  assert.throws(() => computeMetrics(fabricatedHash, thresholds), /whole-file SHA-256 mismatch/);

  const swappedTreeObject = fixture();
  const swappedProof = swappedTreeObject.evidence.source_evidence_index.document.files[0].tree_proof[0];
  const alteredTree = Buffer.from(ROOT_TREE);
  alteredTree[0] ^= 1;
  swappedProof.tree_base64 = alteredTree.toString('base64');
  refreshSourceEvidenceIndex(swappedTreeObject);
  assert.throws(() => computeMetrics(swappedTreeObject, thresholds), /Git tree object SHA-1 mismatch/);

  const missingPath = fixture();
  rewriteOpportunityEvidence(missingPath, 'golden.opportunity:0:0', {
    kind: 'source_span',
    path_or_reference: 'src/missing.ts',
    start_line: 1,
    end_line: 1,
    sha256: SOURCE_SHA256,
    rationale: 'Synthetic missing source path intended to test frozen proof enforcement.',
  });
  assert.throws(() => computeMetrics(missingPath, thresholds), /absent from the frozen source evidence index/);

  const outOfBounds = fixture();
  rewriteOpportunityEvidence(outOfBounds, 'golden.opportunity:0:0', {
    kind: 'source_span',
    path_or_reference: 'src/app.ts',
    start_line: 3,
    end_line: 3,
    sha256: SOURCE_SHA256,
    rationale: 'Synthetic out-of-bounds source span intended to test line enforcement.',
  });
  assert.throws(() => computeMetrics(outOfBounds, thresholds), /line bounds exceed the verified whole file/);
});

test('requires detector findings to overlap the exact frozen opportunity evidence', () => {
  const swappedFindings = fixture();
  const reviews = swappedFindings.evidence.label_records.filter((record) =>
    record.document.cohort === 'untouched' && record.document.rule.rule_id === 'LLM-IOH-001' &&
    record.document.review.role === 'finding_reviewer'
  );
  const firstFindingId = reviews[0].document.detector_finding_id;
  reviews[0].document.detector_finding_id = reviews[1].document.detector_finding_id;
  reviews[1].document.detector_finding_id = firstFindingId;
  for (const review of reviews) review.document_sha256 = sha(review.document);
  assert.throws(
    () => computeMetrics(swappedFindings, thresholds),
    /detector finding evidence does not overlap its frozen opportunity/,
  );

  const nonSourceReference = fixture();
  rewriteOpportunityEvidence(nonSourceReference, 'untouched.opportunity:0:0', {
    kind: 'configuration',
    path_or_reference: 'configuration:model-provider',
    sha256: SOURCE_SHA256,
    rationale: 'Synthetic configuration reference intended to test exact non-source matching.',
  });
  assert.throws(
    () => computeMetrics(nonSourceReference, thresholds),
    /detector finding evidence does not overlap its frozen opportunity/,
  );

  const nonSourceLineSubstitution = fixture();
  rewriteOpportunityEvidence(nonSourceLineSubstitution, 'untouched.opportunity:0:0', {
    kind: 'configuration',
    path_or_reference: 'configuration:model-provider',
    sha256: SOURCE_SHA256,
    rationale: 'Synthetic configuration reference intended to test exact label matching.',
  });
  const substituted = nonSourceLineSubstitution.evidence.label_records.find((record) =>
    record.document.opportunity_id === 'untouched.opportunity:0:0' &&
    record.document.review.role === 'primary_labeler'
  );
  substituted.document.evidence[0].start_line = 1;
  substituted.document.evidence[0].end_line = 1;
  substituted.document_sha256 = sha(substituted.document);
  refreshBlindLabelBindings(nonSourceLineSubstitution);
  assert.throws(
    () => computeMetrics(nonSourceLineSubstitution, thresholds),
    /label evidence does not match its frozen opportunity scope/,
  );
});

test('enforces blind first-pass labels and adjudication lifecycle states', () => {
  const visible = fixture();
  const primary = visible.evidence.label_records.find((record) =>
    record.document.cohort === 'untouched' && record.document.review.role === 'primary_labeler'
  );
  primary.document.review.detector_output_visible = true;
  primary.document_sha256 = sha(primary.document);
  refreshBlindLabelBindings(visible);
  assert.throws(() => computeMetrics(visible, thresholds), /first-pass label must be blind/);

  const leakedFinding = fixture();
  const leakedPrimary = leakedFinding.evidence.label_records.find((record) =>
    record.document.cohort === 'untouched' && record.document.review.role === 'primary_labeler'
  );
  leakedPrimary.document.detector_finding_id =
    leakedFinding.evidence.execution_receipts[1].document.finding_ids[0];
  leakedPrimary.document_sha256 = sha(leakedPrimary.document);
  refreshBlindLabelBindings(leakedFinding);
  assert.throws(() => computeMetrics(leakedFinding, thresholds), /blind ground-truth labels cannot carry/);

  const pendingAgreement = fixture();
  const agreeingPrimary = pendingAgreement.evidence.label_records.find((record) =>
    record.document.cohort === 'untouched' && record.document.review.role === 'primary_labeler'
  );
  agreeingPrimary.document.review.adjudication_status = 'pending';
  agreeingPrimary.document_sha256 = sha(agreeingPrimary.document);
  refreshBlindLabelBindings(pendingAgreement);
  assert.throws(() => computeMetrics(pendingAgreement, thresholds), /must use not_required status/);
});

test('requires review coverage and per-rule double-label minimums for experimental GO', () => {
  const candidate = fixture();
  candidate.evidence.label_records = candidate.evidence.label_records.filter((record) => !(
    record.document.cohort === 'untouched' &&
    record.document.opportunity_id === 'untouched.opportunity:0:0' &&
    record.document.review.role === 'independent_reviewer'
  ));
  refreshBlindLabelBindings(candidate);
  const output = computeMetrics(candidate, thresholds);
  assert.equal(output.release_evaluation.verdict, 'no_go');
  assert.equal(output.release_evaluation.limited_experimental.passed, false);
  assert.match(output.release_evaluation.limited_experimental.reasons.join('\n'), /LLM-IOH-001: double-labeled support 1 is below 2/);
});

test('derives Cohen kappa from the full paired-label contingency table', () => {
  const candidate = fixture();
  const pair = candidate.evidence.label_records.filter((record) =>
    record.document.cohort === 'untouched' &&
    record.document.opportunity_id === 'untouched.opportunity:0:0' &&
    ['primary_labeler', 'independent_reviewer'].includes(record.document.review.role)
  );
  const independent = pair.find((record) => record.document.review.role === 'independent_reviewer');
  independent.document.label = 'absent';
  independent.document.review.adjudication_status = 'pending';
  independent.document_sha256 = sha(independent.document);
  const primary = pair.find((record) => record.document.review.role === 'primary_labeler');
  primary.document.review.adjudication_status = 'pending';
  primary.document_sha256 = sha(primary.document);
  const adjudicator = structuredClone(primary.document);
  adjudicator.label_id = 'llm-label-untouched-0-0-adjudicator';
  adjudicator.review = {
    labeler_id: 'reviewer-c', role: 'adjudicator', independent_of_rule_author: true,
    detector_output_visible: false, adjudication_status: 'adjudicated',
    supersedes_label_ids: pair.map((record) => record.document.label_id),
    rationale: 'The source evidence supports the original present label after resolving the disagreement.',
  };
  candidate.evidence.label_records.push(bound(adjudicator));
  refreshBlindLabelBindings(candidate);

  const output = computeMetrics(candidate, thresholds);
  assert.equal(output.quality_controls.cohen_kappa.denominator, 16);
  assert.equal(output.quality_controls.cohen_kappa.observed_agreement, 0.9375);
  assert.equal(output.quality_controls.cohen_kappa.expected_agreement, 0.9375);
  assert.equal(output.quality_controls.cohen_kappa.value, 0);
  assert.equal(output.quality_controls.cohen_kappa.contingency.present.absent, 1);
});
