import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  computeMetricsForUnitTest,
  ENABLED_RULE_IDS,
  hashDirectoryTree,
  hashOpportunityDiscoveryCoverage,
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
const REVIEW_BINDINGS = {
  selection_policy_sha256: '1'.repeat(64),
  golden_candidates_sha256: '2'.repeat(64),
  untouched_candidates_sha256: '3'.repeat(64),
  reserve_candidates_sha256: '4'.repeat(64),
  selection_amendments_sha256: '5'.repeat(64),
  replacement_selection_sha256: '9'.repeat(64),
  review_record_sha256s: ['6'.repeat(64), '7'.repeat(64)],
};
const candidateRepository = (repository_id) => ({
  repository_id,
  url: `https://github.com/${repository_id}`,
  primary_language: 'typescript_javascript',
  primary_surface: 'chat_app',
  provider_surface: 'openai',
  inclusion_reason: 'Synthetic measurement evidence used by the unit test.',
});
const TEST_CALIBRATION_CONTRACT = {
  expected_cohort_size: 1,
  artifacts: {
    selection_policy_sha256: {
      byte_sha256: REVIEW_BINDINGS.selection_policy_sha256,
      document: {
        schema_version: '1.0.0', policy_id: 'llm-selection-v1.2',
        status: 'relocked_before_detector_results', detector_results_seen: false,
        target_size_per_cohort: 1,
      },
    },
    golden_candidates_sha256: {
      byte_sha256: REVIEW_BINDINGS.golden_candidates_sha256,
      document: {
        schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
        policy_id: 'llm-selection-v1.2', cohort: 'golden',
        status: 'candidate_commit_freeze_pending', selected_before_detector_results: true,
        repositories: [candidateRepository('owner/golden')],
      },
    },
    untouched_candidates_sha256: {
      byte_sha256: REVIEW_BINDINGS.untouched_candidates_sha256,
      document: {
        schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
        policy_id: 'llm-selection-v1.2', cohort: 'untouched',
        status: 'candidate_commit_freeze_pending', selected_before_detector_results: true,
        repositories: [candidateRepository('owner/untouched')],
      },
    },
    reserve_candidates_sha256: {
      byte_sha256: REVIEW_BINDINGS.reserve_candidates_sha256,
      document: {
        schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
        policy_id: 'llm-selection-v1.2', repositories: [],
      },
    },
    selection_amendments_sha256: {
      byte_sha256: REVIEW_BINDINGS.selection_amendments_sha256,
      document: {
        schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
        policy_id: 'llm-selection-v1.2', detector_results_seen: false,
        amendments: [{ kind: 'policy_relock_before_results' }],
      },
    },
  },
  release_thresholds: {
    byte_sha256: rawSha(JSON.stringify(thresholds)),
    canonical_sha256: sha(thresholds),
  },
  public_surface_policy: {
    byte_sha256: '8'.repeat(64),
    canonical_sha256: sha({
      schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
      policy_id: 'cejel-llm-public-surfaces-v1', status: 'locked_before_detector_results',
      detector_results_seen: false, repository_paths: ['README.md'], external_surfaces: [],
    }),
    document: {
      schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
      policy_id: 'cejel-llm-public-surfaces-v1', status: 'locked_before_detector_results',
      detector_results_seen: false, repository_paths: ['README.md'], external_surfaces: [],
    },
  },
};
const TEST_REPLACEMENT_SELECTION_WITHOUT_HASH = {
  schema_version: '1.0.0',
  protocol_id: 'cejel-llm-calibration-v1',
  policy_id: 'llm-selection-v1.2',
  incident_id: 'untouched-blinding-incident-2026-07-22',
  detector_results_seen: false,
  source_or_labels_used_for_selection: false,
  proposal_bindings: [
    { reviewer_id: 'codex-review-a', document_sha256: 'a'.repeat(64) },
    { reviewer_id: 'codex-review-b', document_sha256: 'b'.repeat(64) },
  ],
  candidate_document_sha256: sha(
    TEST_CALIBRATION_CONTRACT.artifacts.untouched_candidates_sha256.document,
  ),
  selected: [{ repository_id: 'owner/untouched' }],
};
TEST_CALIBRATION_CONTRACT.artifacts.replacement_selection_sha256 = {
  byte_sha256: REVIEW_BINDINGS.replacement_selection_sha256,
  document: {
    ...TEST_REPLACEMENT_SELECTION_WITHOUT_HASH,
    record_sha256: sha(TEST_REPLACEMENT_SELECTION_WITHOUT_HASH),
  },
};
const testTrustedExecutionVerification = (input) => {
  const proof = input.evidence.trusted_execution_proof.document;
  proof.commitment.document_sha256 = input.evidence.pre_result_commitment.document_sha256;
  proof.commitment.git_commit =
    input.evidence.execution_receipts[0].document.pre_result_commitment.git_commit;
  input.evidence.trusted_execution_proof = bound(proof);
  const freeCoreRecord = input.automatic_no_go_evidence.free_core_unchanged_without_pack.document;
  const freeCoreAudit = JSON.parse(freeCoreRecord.artifacts[0].content);
  const freeCoreParity = JSON.parse(freeCoreAudit.assertions[0].evidence_content);
  return ({
  proof_document_sha256: input.evidence.trusted_execution_proof.document_sha256,
  commitment_git_commit: input.evidence.trusted_execution_proof.document.commitment.git_commit,
  commitment_created_at: input.evidence.trusted_execution_proof.document.commitment.created_at,
  runs: ['golden', 'untouched'].map((cohort, index) => ({
    cohort,
    run_id: index + 1,
    run_started_at: '2026-07-22T02:00:00Z',
    head_sha: 'e'.repeat(40),
    workflow_sha256: '5'.repeat(64),
    artifact_archive_sha256: String(index + 1).repeat(64),
    evidence_bundle_sha256: String(index + 3).repeat(64),
    evidence_bundle: {
      schema_version: '1.0.0', protocol_id: input.protocol_id, cohort,
      pre_result_commitment_sha256: input.evidence.pre_result_commitment.document_sha256,
      detector_freeze_sha256: cohort === 'untouched'
        ? input.evidence.detector_freeze.document_sha256
        : null,
      free_core_parity_sha256: cohort === 'golden' ? sha(freeCoreParity) : null,
      execution_receipts: input.evidence.execution_receipts
        .filter(({ document }) => document.cohort === cohort)
        .map(({ document_sha256, document }) => ({
          repository_id: document.repository_id, document_sha256,
        }))
        .sort((left, right) => left.repository_id.localeCompare(right.repository_id)),
      llm_reports: input.evidence.llm_reports
        .filter((report) => report.cohort === cohort)
        .map(({ repository_id, document_sha256 }) => ({ repository_id, document_sha256 }))
        .sort((left, right) => left.repository_id.localeCompare(right.repository_id)),
    },
  })),
  });
};
const testPublicSurfaceVerification = (input) => ({
  policy_document_sha256: TEST_CALIBRATION_CONTRACT.public_surface_policy.canonical_sha256,
  repository_paths: input.evidence.pre_result_commitment.document.public_document_inventory,
  external_surfaces: [],
});
const computeMetrics = (input, lockedThresholds) =>
  computeMetricsForUnitTest(
    input,
    lockedThresholds,
    TEST_CALIBRATION_CONTRACT,
    testTrustedExecutionVerification(input),
    testPublicSurfaceVerification(input),
  );
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
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', policy_id: 'llm-selection-v1.2',
    cohort, status: 'frozen', frozen_at: '2026-07-22T00:00:00Z',
    frozen_by: ['reviewer-a', 'reviewer-b'], review_method: 'two_independent_ai',
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; entry excludes entry_sha256; manifest excludes manifest_sha256',
    review_bindings: REVIEW_BINDINGS,
    repositories: [{ ...entryWithoutHash, entry_sha256: hashRepositoryEntry(entryWithoutHash) }],
    attestation: { method: 'internal_dual_ai_review', reference: 'internal-witness:test' },
  };
  return { ...withoutHash, manifest_sha256: hashManifest(withoutHash) };
}

function fixture() {
  const golden = manifest('golden', 'owner/golden', 'a'.repeat(40));
  const untouched = manifest('untouched', 'owner/untouched', 'c'.repeat(40));
  const sourceIndexWithoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen_before_detector_results',
    hash_contract:
      'rfc8785-sha256-v1; index excludes only index_sha256; file content_sha256 hashes decoded whole-file bytes',
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
  const sourceIndexHashable = {
    ...sourceIndexWithoutHash,
    attestation: { method: 'internal_witness', reference: 'internal-witness:test-source-index' },
  };
  const sourceEvidenceIndex = {
    ...sourceIndexHashable,
    index_sha256: hashSourceEvidenceIndex(sourceIndexHashable),
  };
  const ledger = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen',
    detector_build_sha256: BUILD_SHA, golden_manifest_sha256: golden.manifest_sha256,
    golden_opportunity_manifest_sha256: '2'.repeat(64),
    golden_label_evidence_sha256: '3'.repeat(64),
    missed_defect_opportunity_ids: [],
    frozen_at: '2026-07-22T01:00:00Z', frozen_before_untouched: true,
    reviewed_by: ['reviewer-a', 'reviewer-b'], open_corrections: 0, entries: [],
  };
  const freeze = createDetectorFreezeRecord({
    gitCommit: 'e'.repeat(40), sourceTreeSha: 'f'.repeat(40),
    buildSha256: BUILD_SHA, artifactName: 'cejel',
    build: {
      command: ['npm', 'run', 'build'],
      outputRelativePath: 'dist/index.js',
      firstBuildSha256: BUILD_SHA,
      secondBuildSha256: BUILD_SHA,
      firstOutputTreeSha256: 'a'.repeat(64),
      secondOutputTreeSha256: 'a'.repeat(64),
    },
    releaseThresholds: {
      byteSha256: '8'.repeat(64),
      canonicalSha256: '9'.repeat(64),
    },
    frozenAt: '2026-07-22T02:00:00Z',
    runtime: { name: 'node', version: 'v24', platform: 'linux', architecture: 'x64' },
    workflow: { path: '.github/workflows/llm-calibration.yml', sha256: '5'.repeat(64) },
    networkIsolation: {
      mode: 'node-runtime-deny-hook-v1',
      argvPrefix: ['calibration/llm/scripts/no-egress-wrapper.sh'],
      evidenceReference: 'internal-witness:no-egress',
      wrapperSha256: '1'.repeat(64), hookSha256: '2'.repeat(64),
      probePath: 'calibration/llm/scripts/no-egress-probe.mjs',
      probeSha256: '3'.repeat(64),
      probeOutputSha256: '4'.repeat(64), probeDenied: 5, probeAttempted: 5,
      confirmed: true,
    },
    ledger, ledgerSha256: sha(ledger),
    goldenExecutionEvidenceSha256: '1'.repeat(64),
    goldenExecutionEvidence: { document: { executions: [{}] }, findings: new Map() },
    releaseThresholds: {
      byteSha256: TEST_CALIBRATION_CONTRACT.release_thresholds.byte_sha256,
      canonicalSha256: TEST_CALIBRATION_CONTRACT.release_thresholds.canonical_sha256,
    },
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
      network_isolation_mode: 'node-runtime-deny-hook-v1', completed_at: '2026-07-22T03:00:00Z',
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
    hash_contract: 'rfc8785-sha256-v1; manifest excludes only manifest_sha256',
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
  const opportunityHashable = {
    ...opportunityWithoutHash,
    attestation: { method: 'internal_witness', reference: 'internal-witness:test-opportunities' },
  };
  const opportunityManifest = {
    ...opportunityHashable,
    manifest_sha256: hashOpportunityManifest(opportunityHashable),
  };
  const opportunityDiscoveryWithoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen_before_detector_results', frozen_at: '2026-07-22T00:35:00Z',
    detector_results_seen_before_freeze: false,
    review_method: 'two_independent_ai',
    blind_reviewers: ['reviewer-a', 'reviewer-b'],
    bindings: {
      golden_manifest_sha256: golden.manifest_sha256,
      untouched_manifest_sha256: untouched.manifest_sha256,
      source_evidence_index_sha256: sourceEvidenceIndex.index_sha256,
      opportunity_manifest_sha256: opportunityManifest.manifest_sha256,
    },
    coverage: [['golden', golden], ['untouched', untouched]].flatMap(([cohort, current]) =>
      ENABLED_RULE_IDS.map((ruleId) => ({
        cohort,
        repository_id: current.repositories[0].repository_id,
        commit_sha: current.repositories[0].commit_sha,
        rule_id: ruleId,
        declared_opportunity_ids: opportunities
          .filter((opportunity) =>
            opportunity.cohort === cohort && opportunity.rule_id === ruleId)
          .map((opportunity) => opportunity.opportunity_id),
        blind_review_evidence: [
          {
            reviewer_id: 'reviewer-a',
            role: 'primary_labeler',
            methodology_id: 'llm-opportunity-discovery-v1.4',
            coverage_row_sha256: rawSha(`${cohort}:${ruleId}:reviewer-a`),
          },
          {
            reviewer_id: 'reviewer-b',
            role: 'independent_reviewer',
            methodology_id: 'llm-opportunity-discovery-v1.4',
            coverage_row_sha256: rawSha(`${cohort}:${ruleId}:reviewer-b`),
          },
        ],
      }))),
  };
  const opportunityDiscoveryCoverage = {
    ...opportunityDiscoveryWithoutHash,
    record_sha256: hashOpportunityDiscoveryCoverage(opportunityDiscoveryWithoutHash),
  };
  const preResultCommitment = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen_pre_result',
    created_at: '2026-07-22T00:45:00Z', detector_results_seen_before_commitment: false,
    golden_manifest_sha256: golden.manifest_sha256,
    untouched_manifest_sha256: untouched.manifest_sha256,
    opportunity_manifest_sha256: opportunityManifest.manifest_sha256,
    opportunity_discovery_coverage_sha256: opportunityDiscoveryCoverage.record_sha256,
    discovery_integrity_sha256: rawSha('discovery-integrity'),
    release_thresholds: {
      byte_sha256: TEST_CALIBRATION_CONTRACT.release_thresholds.byte_sha256,
      canonical_sha256: TEST_CALIBRATION_CONTRACT.release_thresholds.canonical_sha256,
    },
    public_surface_policy: {
      byte_sha256: TEST_CALIBRATION_CONTRACT.public_surface_policy.byte_sha256,
      canonical_sha256: TEST_CALIBRATION_CONTRACT.public_surface_policy.canonical_sha256,
    },
    free_core_baseline_commit: 'd'.repeat(40),
    blind_label_bindings: opportunityManifest.blind_label_bindings,
    public_document_inventory: [{
      path: 'README.md', content_sha256: rawSha('Cejel reports static, evidence-backed engineering signals.'),
    }],
  };
  const commitmentBinding = bound(preResultCommitment);
  const commitmentBytes = Buffer.from(`${JSON.stringify(preResultCommitment, null, 2)}\n`, 'utf8');
  const commitmentBlobOid = gitObjectSha1('blob', commitmentBytes);
  const leafTreeBytes = gitTreeEntry('100644', 'pre-result-commitment.json', commitmentBlobOid);
  const leafTreeOid = gitObjectSha1('tree', leafTreeBytes);
  const llmTreeBytes = gitTreeEntry('40000', 'llm', leafTreeOid);
  const llmTreeOid = gitObjectSha1('tree', llmTreeBytes);
  const calibrationTreeBytes = gitTreeEntry('40000', 'calibration', llmTreeOid);
  const commitmentTreeOid = gitObjectSha1('tree', calibrationTreeBytes);
  const commitmentCommitBytes = Buffer.from(
    `tree ${commitmentTreeOid}\nauthor Test <test@example.com> 1784681400 +0000\ncommitter Test <test@example.com> 1784681400 +0000\n\nFreeze calibration commitment\n`,
    'utf8',
  );
  const commitmentCommitOid = gitObjectSha1('commit', commitmentCommitBytes);
  const commitmentProof = {
    object_format: 'sha1', commit_oid: commitmentCommitOid, root_tree_oid: commitmentTreeOid,
    blob_oid: commitmentBlobOid, commit_content_base64: commitmentCommitBytes.toString('base64'),
    blob_content_base64: commitmentBytes.toString('base64'), committed_at_unix: 1784681400,
    git_path: 'calibration/llm/pre-result-commitment.json',
    tree_chain: [
      { oid: commitmentTreeOid, content_base64: calibrationTreeBytes.toString('base64') },
      { oid: llmTreeOid, content_base64: llmTreeBytes.toString('base64') },
      { oid: leafTreeOid, content_base64: leafTreeBytes.toString('base64') },
    ],
  };
  const trustedExecutionProof = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    provider: 'github_actions_public_v1', repository: 'BargLabs/cejel',
    commitment: {
      git_commit: commitmentCommitOid,
      document_sha256: commitmentBinding.document_sha256,
      comment_id: 42,
      comment_api_url: 'https://api.github.com/repos/BargLabs/cejel/issues/comments/42',
      created_at: '2026-07-22T01:00:00Z',
    },
    runs: [
      {
        cohort: 'golden', run_id: 1,
        run_api_url: 'https://api.github.com/repos/BargLabs/cejel/actions/runs/1',
        head_sha: 'e'.repeat(40),
        artifact: {
          id: 1, api_url: 'https://api.github.com/repos/BargLabs/cejel/actions/artifacts/1',
          archive_sha256: '1'.repeat(64), evidence_bundle_sha256: '3'.repeat(64),
        },
      },
      {
        cohort: 'untouched', run_id: 2,
        run_api_url: 'https://api.github.com/repos/BargLabs/cejel/actions/runs/2',
        head_sha: 'e'.repeat(40),
        artifact: {
          id: 2, api_url: 'https://api.github.com/repos/BargLabs/cejel/actions/artifacts/2',
          archive_sha256: '2'.repeat(64), evidence_bundle_sha256: '4'.repeat(64),
        },
      },
    ],
  };
  for (const receiptBinding of execution_receipts) {
    receiptBinding.document.pre_result_commitment = {
      document_sha256: rawSha(commitmentBytes.toString('utf8')), canonical_sha256: commitmentBinding.document_sha256,
      git_commit: commitmentCommitOid, git_path: 'calibration/llm/pre-result-commitment.json',
      git_proof: commitmentProof,
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
    const parityClockContent = readFileSync(
      new URL('./fixed-clock-hook.cjs', import.meta.url),
    );
    const payloads = {
      free_core_unchanged_without_pack: {
        fixture: {
          path: 'calibration/llm/fixtures/free-core-parity',
          tree_sha256: hashDirectoryTree(fileURLToPath(
            new URL('../fixtures/free-core-parity/', import.meta.url),
          )),
        },
        clock: {
          fixed_iso: '2026-07-23T00:00:00.000Z',
          hook_path: 'calibration/llm/scripts/fixed-clock-hook.cjs',
          hook_sha256: rawSha(parityClockContent),
          hook_content_base64: parityClockContent.toString('base64'),
        },
        baseline: {
          git_commit: 'd'.repeat(40), executable_sha256: 'c'.repeat(64),
          argv: ['scan', '/fixture', '--out', '/isolated-output', '--quiet'],
          stdout_base64: '', stderr_base64: '', exit_code: 0,
          output_tree_sha256: '9'.repeat(64),
        },
        candidate: {
          git_commit: 'e'.repeat(40), executable_sha256: BUILD_SHA,
          argv: ['scan', '/fixture', '--out', '/isolated-output', '--quiet'],
          stdout_base64: '', stderr_base64: '', exit_code: 0,
          output_tree_sha256: '9'.repeat(64),
        },
      },
      offline_scan_path_verified: {
        executions: execution_receipts.map(({ document: receipt }) => ({
          cohort: receipt.cohort, repository_id: receipt.repository_id,
          network_isolation_mode: receipt.network_isolation_mode, no_egress_confirmed: true,
        })).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b))),
      },
      all_findings_have_resolvable_evidence: {
        findings: execution_receipts.flatMap(({ document: receipt }, receiptIndex) =>
          receipt.finding_ids.map((finding_id, findingIndex) => ({
            finding_id,
            path: llm_reports[receiptIndex].document.result.findings[findingIndex].evidence.path,
            line: llm_reports[receiptIndex].document.result.findings[findingIndex].evidence.line,
          }))).sort((a, b) => a.finding_id.localeCompare(b.finding_id)),
      },
      prohibited_public_claims_absent: {
        documents: [{
          path: 'README.md', content: 'Cejel reports static, evidence-backed engineering signals.',
          sha256: rawSha('Cejel reports static, evidence-backed engineering signals.'),
        }],
      },
      untouched_blinding_preserved: {
        executions: execution_receipts.filter(({ document }) => document.cohort === 'untouched').map(({ document }) => ({
          repository_id: document.repository_id,
          commitment_git_oid: document.pre_result_commitment.git_proof.commit_oid,
          commitment_time_unix: document.pre_result_commitment.git_proof.committed_at_unix,
          completed_at: document.completed_at,
        })).sort((a, b) => a.repository_id.localeCompare(b.repository_id)),
      },
    };
    const evidenceContent = JSON.stringify(payloads[check_id]);
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
      opportunity_manifest: bound(opportunityManifest),
      opportunity_discovery_coverage: bound(opportunityDiscoveryCoverage),
      release_thresholds: {
        byte_sha256: TEST_CALIBRATION_CONTRACT.release_thresholds.byte_sha256,
        ...bound(thresholds),
      },
      detector_freeze: bound(freeze),
      pre_result_commitment: commitmentBinding,
      trusted_execution_proof: bound(trustedExecutionProof),
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
  const discovery = candidate.evidence.opportunity_discovery_coverage.document;
  discovery.bindings.opportunity_manifest_sha256 = manifest.manifest_sha256;
  discovery.record_sha256 = hashOpportunityDiscoveryCoverage(discovery);
  candidate.evidence.opportunity_discovery_coverage = bound(discovery);
  const commitment = candidate.evidence.pre_result_commitment.document;
  commitment.opportunity_manifest_sha256 = manifest.manifest_sha256;
  commitment.opportunity_discovery_coverage_sha256 = discovery.record_sha256;
  commitment.blind_label_bindings = manifest.blind_label_bindings;
  candidate.evidence.pre_result_commitment = bound(commitment);
  const commitmentBytes = Buffer.from(`${JSON.stringify(commitment, null, 2)}\n`, 'utf8');
  const blobOid = gitObjectSha1('blob', commitmentBytes);
  const leafTreeBytes = gitTreeEntry('100644', 'pre-result-commitment.json', blobOid);
  const leafTreeOid = gitObjectSha1('tree', leafTreeBytes);
  const llmTreeBytes = gitTreeEntry('40000', 'llm', leafTreeOid);
  const llmTreeOid = gitObjectSha1('tree', llmTreeBytes);
  const calibrationTreeBytes = gitTreeEntry('40000', 'calibration', llmTreeOid);
  const treeOid = gitObjectSha1('tree', calibrationTreeBytes);
  const commitBytes = Buffer.from(
    `tree ${treeOid}\nauthor Test <test@example.com> 1784681400 +0000\ncommitter Test <test@example.com> 1784681400 +0000\n\nFreeze calibration commitment\n`,
    'utf8',
  );
  const commitOid = gitObjectSha1('commit', commitBytes);
  for (const receipt of candidate.evidence.execution_receipts) {
    receipt.document.pre_result_commitment.canonical_sha256 =
      candidate.evidence.pre_result_commitment.document_sha256;
    receipt.document.pre_result_commitment.document_sha256 = rawSha(commitmentBytes.toString('utf8'));
    receipt.document.pre_result_commitment.git_commit = commitOid;
    receipt.document.pre_result_commitment.git_proof = {
      object_format: 'sha1', commit_oid: commitOid, root_tree_oid: treeOid, blob_oid: blobOid,
      commit_content_base64: commitBytes.toString('base64'),
      blob_content_base64: commitmentBytes.toString('base64'), committed_at_unix: 1784681400,
      git_path: 'calibration/llm/pre-result-commitment.json',
      tree_chain: [
        { oid: treeOid, content_base64: calibrationTreeBytes.toString('base64') },
        { oid: llmTreeOid, content_base64: llmTreeBytes.toString('base64') },
        { oid: leafTreeOid, content_base64: leafTreeBytes.toString('base64') },
      ],
    };
    receipt.document_sha256 = sha(receipt.document);
  }
  const chronologyRecord = candidate.automatic_no_go_evidence.untouched_blinding_preserved.document;
  const chronologyArtifact = chronologyRecord.artifacts[0];
  const chronologyAudit = JSON.parse(chronologyArtifact.content);
  chronologyAudit.assertions[0].evidence_content = JSON.stringify({
    executions: candidate.evidence.execution_receipts
      .filter(({ document }) => document.cohort === 'untouched')
      .map(({ document }) => ({
        repository_id: document.repository_id,
        commitment_git_oid: document.pre_result_commitment.git_proof.commit_oid,
        commitment_time_unix: document.pre_result_commitment.git_proof.committed_at_unix,
        completed_at: document.completed_at,
      })).sort((a, b) => a.repository_id.localeCompare(b.repository_id)),
  });
  chronologyAudit.assertions[0].evidence_sha256 = rawSha(chronologyAudit.assertions[0].evidence_content);
  chronologyArtifact.content = JSON.stringify(chronologyAudit);
  chronologyArtifact.sha256 = rawSha(chronologyArtifact.content);
  candidate.automatic_no_go_evidence.untouched_blinding_preserved = bound(chronologyRecord);
}

function refreshSourceEvidenceIndex(candidate) {
  const index = candidate.evidence.source_evidence_index.document;
  index.index_sha256 = hashSourceEvidenceIndex(index);
  candidate.evidence.source_evidence_index = bound(index);
  const discovery = candidate.evidence.opportunity_discovery_coverage.document;
  discovery.bindings.source_evidence_index_sha256 = index.index_sha256;
  discovery.record_sha256 = hashOpportunityDiscoveryCoverage(discovery);
  candidate.evidence.opportunity_discovery_coverage = bound(discovery);
  refreshBlindLabelBindings(candidate);
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

function replaceFrozenOpportunityWithUnmatchedFindingReview(candidate) {
  const opportunityId = 'untouched.opportunity:0:0';
  const receipt = candidate.evidence.execution_receipts.find(
    ({ document }) => document.cohort === 'untouched',
  ).document;
  const report = candidate.evidence.llm_reports.find(
    (item) => item.cohort === 'untouched',
  ).document;
  const findingId = receipt.finding_ids[0];
  const finding = report.result.findings[0];
  candidate.evidence.opportunity_manifest.document.opportunities =
    candidate.evidence.opportunity_manifest.document.opportunities.filter(
      (opportunity) => opportunity.opportunity_id !== opportunityId,
    );
  candidate.evidence.label_records = candidate.evidence.label_records.filter(
    (record) => record.document.opportunity_id !== opportunityId,
  );
  const coverageRow = candidate.evidence.opportunity_discovery_coverage.document.coverage.find(
    (row) => row.cohort === 'untouched' && row.rule_id === finding.ruleId,
  );
  coverageRow.declared_opportunity_ids = coverageRow.declared_opportunity_ids.filter(
    (id) => id !== opportunityId,
  );
  const review = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    label_id: 'llm-label-untouched-unmatched-finding-review',
    cohort: 'untouched',
    repository: {
      repository_id: receipt.repository_id,
      commit_sha: receipt.commit_sha,
    },
    rule: {
      catalogue_id: 'llm-rules-v1',
      rule_id: finding.ruleId,
      rule_version: '1.0.0',
    },
    opportunity_id: null,
    detector_finding_id: findingId,
    label: 'absent',
    evidence: [{
      kind: 'external_result',
      path_or_reference: `llm-report:${findingId}`,
      sha256: sha(finding),
      rationale: 'Independent post-result review binds the exact unmatched detector finding.',
    }],
    review: {
      labeler_id: 'reviewer-c',
      role: 'finding_reviewer',
      independent_of_rule_author: true,
      detector_output_visible: true,
      adjudication_status: 'not_required',
    },
    created_at: '2026-07-22T04:30:00Z',
  };
  candidate.evidence.label_records.push(bound(review));
  refreshBlindLabelBindings(candidate);
  return review;
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

test('counts an exact unmatched finding review as FP without changing the recall denominator', () => {
  const candidate = fixture();
  replaceFrozenOpportunityWithUnmatchedFindingReview(candidate);
  const output = computeMetrics(candidate, thresholds);
  assert.equal(output.counts.true_positives, 15);
  assert.equal(output.counts.false_negatives, 0);
  assert.equal(output.counts.false_positives, 1);
  assert.equal(output.counts.adjudicated_items, 15);
  assert.equal(output.metrics.finding_recall.denominator, 15);
  assert.equal(output.metrics.precision.denominator, 16);
  assert.equal(output.metrics.negative_false_positive_rate.numerator, 1);
});

test('unmatched finding reviews fail closed on label, digest, independence, and overlap', () => {
  const wrongLabel = fixture();
  const wrongLabelReview = replaceFrozenOpportunityWithUnmatchedFindingReview(wrongLabel);
  wrongLabelReview.label = 'present';
  const wrongLabelBinding = wrongLabel.evidence.label_records.find(
    (record) => record.document.label_id === wrongLabelReview.label_id,
  );
  wrongLabelBinding.document_sha256 = sha(wrongLabelReview);
  assert.throws(
    () => computeMetrics(wrongLabel, thresholds),
    /unmatched finding review must use the binary absent label/,
  );

  const wrongDigest = fixture();
  const wrongDigestReview = replaceFrozenOpportunityWithUnmatchedFindingReview(wrongDigest);
  wrongDigestReview.evidence[0].sha256 = 'f'.repeat(64);
  const wrongDigestBinding = wrongDigest.evidence.label_records.find(
    (record) => record.document.label_id === wrongDigestReview.label_id,
  );
  wrongDigestBinding.document_sha256 = sha(wrongDigestReview);
  assert.throws(
    () => computeMetrics(wrongDigest, thresholds),
    /does not bind the exact actual finding/,
  );

  const notIndependent = fixture();
  const notIndependentReview = replaceFrozenOpportunityWithUnmatchedFindingReview(notIndependent);
  notIndependentReview.review.independent_of_rule_author = false;
  const notIndependentBinding = notIndependent.evidence.label_records.find(
    (record) => record.document.label_id === notIndependentReview.label_id,
  );
  notIndependentBinding.document_sha256 = sha(notIndependentReview);
  assert.throws(() => computeMetrics(notIndependent, thresholds), /not a valid label record/);

  const overlapsFrozen = fixture();
  const existingReview = overlapsFrozen.evidence.label_records.find((record) =>
    record.document.cohort === 'untouched' &&
    record.document.opportunity_id === 'untouched.opportunity:0:0' &&
    record.document.review.role === 'finding_reviewer'
  );
  const finding = overlapsFrozen.evidence.llm_reports.find(
    (item) => item.cohort === 'untouched',
  ).document.result.findings[0];
  existingReview.document.opportunity_id = null;
  existingReview.document.label = 'absent';
  existingReview.document.evidence = [{
    kind: 'external_result',
    path_or_reference: `llm-report:${existingReview.document.detector_finding_id}`,
    sha256: sha(finding),
    rationale: 'Synthetic exact binding that still overlaps a frozen opportunity.',
  }];
  existingReview.document_sha256 = sha(existingReview.document);
  assert.throws(
    () => computeMetrics(overlapsFrozen, thresholds),
    /unmatched finding review overlaps a frozen opportunity/,
  );
});

test('test-only contract override reaches cohort anchoring and changed thresholds are rejected', () => {
  const wrongSizeContract = structuredClone(TEST_CALIBRATION_CONTRACT);
  wrongSizeContract.expected_cohort_size = 2;
  assert.throws(
    () => {
      const candidate = fixture();
      return computeMetricsForUnitTest(
        candidate,
        thresholds,
        wrongSizeContract,
        testTrustedExecutionVerification(candidate),
        testPublicSurfaceVerification(candidate),
      );
    },
    /locked selection policy|locked candidate contract/,
  );

  const changedThresholds = structuredClone(thresholds);
  changedThresholds.limited_experimental_go.minimum_precision = 0.01;
  assert.throws(
    () => computeMetrics(fixture(), changedThresholds),
    /release thresholds do not match the exact pre-result locked artifact/,
  );
});

test('opportunity discovery coverage must be complete and independently reviewed', () => {
  const omitted = fixture();
  const coverage = omitted.evidence.opportunity_discovery_coverage.document;
  coverage.coverage.pop();
  coverage.record_sha256 = hashOpportunityDiscoveryCoverage(coverage);
  omitted.evidence.opportunity_discovery_coverage = bound(coverage);
  assert.throws(() => computeMetrics(omitted, thresholds), /opportunity-discovery coverage omits/);

  const duplicateReviewer = fixture();
  const duplicateCoverage = duplicateReviewer.evidence.opportunity_discovery_coverage.document;
  duplicateCoverage.blind_reviewers[1] = duplicateCoverage.blind_reviewers[0];
  duplicateCoverage.record_sha256 = hashOpportunityDiscoveryCoverage(duplicateCoverage);
  duplicateReviewer.evidence.opportunity_discovery_coverage = bound(duplicateCoverage);
  assert.throws(
    () => computeMetrics(duplicateReviewer, thresholds),
    /not a valid independent frozen record/,
  );

  const unboundPrivateReview = fixture();
  const unboundCoverage = unboundPrivateReview.evidence.opportunity_discovery_coverage.document;
  unboundCoverage.coverage[0].blind_review_evidence[0].methodology_id = 'informal-search';
  unboundCoverage.record_sha256 = hashOpportunityDiscoveryCoverage(unboundCoverage);
  unboundPrivateReview.evidence.opportunity_discovery_coverage = bound(unboundCoverage);
  assert.throws(
    () => computeMetrics(unboundPrivateReview, thresholds),
    /invalid or not bound to a frozen repository\/rule/,
  );
});

test('source and opportunity attestations are included in their internal hashes', () => {
  const source = fixture();
  source.evidence.source_evidence_index.document.attestation.reference = 'internal-witness:changed-source';
  source.evidence.source_evidence_index = bound(source.evidence.source_evidence_index.document);
  assert.throws(() => computeMetrics(source, thresholds), /not a valid frozen index/);

  const opportunity = fixture();
  opportunity.evidence.opportunity_manifest.document.attestation.reference =
    'internal-witness:changed-opportunity';
  opportunity.evidence.opportunity_manifest =
    bound(opportunity.evidence.opportunity_manifest.document);
  assert.throws(() => computeMetrics(opportunity, thresholds), /not a valid frozen inventory/);
});

test('publishes and gate-blocks matched findings without a binary present/absent adjudication', () => {
  for (const label of ['not_applicable', 'insufficient_source']) {
    const candidate = fixture();
    for (const record of candidate.evidence.label_records.filter((item) =>
      item.document.cohort === 'untouched' &&
      item.document.opportunity_id === 'untouched.opportunity:0:0'
    )) {
      record.document.label = label;
      record.document_sha256 = sha(record.document);
    }
    refreshBlindLabelBindings(candidate);
    const output = computeMetrics(candidate, thresholds);
    assert.equal(output.counts.gate_blocking_matched_findings, 1);
    assert.equal(output.support.matched_findings_total, 16);
    assert.equal(output.release_evaluation.verdict, 'no_go');
    assert.match(
      output.release_evaluation.automatic_no_go.reasons.join('\n'),
      /matched finding.*binary present\/absent adjudication/,
    );
  }
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
  assert.throws(() => computeMetrics(contradiction, thresholds), /not derived from its check-specific payload/);

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

  const unequalFreeCore = fixture();
  const parityRecord = unequalFreeCore.automatic_no_go_evidence.free_core_unchanged_without_pack.document;
  const parityArtifact = parityRecord.artifacts[0];
  const parityAudit = JSON.parse(parityArtifact.content);
  const parityPayload = JSON.parse(parityAudit.assertions[0].evidence_content);
  parityPayload.candidate.stdout_base64 = Buffer.from('{"verdict":"changed"}\n').toString('base64');
  parityAudit.assertions[0].evidence_content = JSON.stringify(parityPayload);
  parityAudit.assertions[0].evidence_sha256 = rawSha(parityAudit.assertions[0].evidence_content);
  parityArtifact.content = JSON.stringify(parityAudit);
  parityArtifact.sha256 = rawSha(parityArtifact.content);
  unequalFreeCore.automatic_no_go_evidence.free_core_unchanged_without_pack = bound(parityRecord);
  assert.throws(() => computeMetrics(unequalFreeCore, thresholds), /not derived from its check-specific payload/);

  const substitutedParityHook = fixture();
  const substitutedHookRecord =
    substitutedParityHook.automatic_no_go_evidence.free_core_unchanged_without_pack.document;
  const substitutedHookArtifact = substitutedHookRecord.artifacts[0];
  const substitutedHookAudit = JSON.parse(substitutedHookArtifact.content);
  const substitutedHookPayload = JSON.parse(substitutedHookAudit.assertions[0].evidence_content);
  const foreignHook = Buffer.from("'use strict';\n// foreign hook".padEnd(160, 'x'));
  substitutedHookPayload.clock.hook_content_base64 = foreignHook.toString('base64');
  substitutedHookPayload.clock.hook_sha256 = rawSha(foreignHook);
  substitutedHookAudit.assertions[0].evidence_content = JSON.stringify(substitutedHookPayload);
  substitutedHookAudit.assertions[0].evidence_sha256 =
    rawSha(substitutedHookAudit.assertions[0].evidence_content);
  substitutedHookArtifact.content = JSON.stringify(substitutedHookAudit);
  substitutedHookArtifact.sha256 = rawSha(substitutedHookArtifact.content);
  substitutedParityHook.automatic_no_go_evidence.free_core_unchanged_without_pack =
    bound(substitutedHookRecord);
  assert.throws(
    () => computeMetrics(substitutedParityHook, thresholds),
    /not derived from its check-specific payload/,
  );

  const substitutedFixture = fixture();
  const substitutedFixtureRecord =
    substitutedFixture.automatic_no_go_evidence.free_core_unchanged_without_pack.document;
  const substitutedFixtureArtifact = substitutedFixtureRecord.artifacts[0];
  const substitutedFixtureAudit = JSON.parse(substitutedFixtureArtifact.content);
  const substitutedFixturePayload = JSON.parse(substitutedFixtureAudit.assertions[0].evidence_content);
  substitutedFixturePayload.fixture.tree_sha256 = '0'.repeat(64);
  substitutedFixtureAudit.assertions[0].evidence_content = JSON.stringify(substitutedFixturePayload);
  substitutedFixtureAudit.assertions[0].evidence_sha256 =
    rawSha(substitutedFixtureAudit.assertions[0].evidence_content);
  substitutedFixtureArtifact.content = JSON.stringify(substitutedFixtureAudit);
  substitutedFixtureArtifact.sha256 = rawSha(substitutedFixtureArtifact.content);
  substitutedFixture.automatic_no_go_evidence.free_core_unchanged_without_pack =
    bound(substitutedFixtureRecord);
  assert.throws(
    () => computeMetrics(substitutedFixture, thresholds),
    /not derived from its check-specific payload/,
  );

  const falsePublicClaim = fixture();
  const claimRecord2 = falsePublicClaim.automatic_no_go_evidence.prohibited_public_claims_absent.document;
  const claimArtifact2 = claimRecord2.artifacts[0];
  const claimAudit2 = JSON.parse(claimArtifact2.content);
  const claimPayload2 = JSON.parse(claimAudit2.assertions[0].evidence_content);
  claimPayload2.documents[0].content = 'Cejel detects hallucinations.';
  claimPayload2.documents[0].sha256 = rawSha(claimPayload2.documents[0].content);
  claimAudit2.assertions[0].evidence_content = JSON.stringify(claimPayload2);
  claimAudit2.assertions[0].evidence_sha256 = rawSha(claimAudit2.assertions[0].evidence_content);
  claimArtifact2.content = JSON.stringify(claimAudit2);
  claimArtifact2.sha256 = rawSha(claimArtifact2.content);
  falsePublicClaim.automatic_no_go_evidence.prohibited_public_claims_absent = bound(claimRecord2);
  assert.throws(() => computeMetrics(falsePublicClaim, thresholds), /not derived from its check-specific payload/);

  const omittedPublicDocument = fixture();
  const omittedRecord = omittedPublicDocument.automatic_no_go_evidence.prohibited_public_claims_absent.document;
  const omittedArtifact = omittedRecord.artifacts[0];
  const omittedAudit = JSON.parse(omittedArtifact.content);
  omittedAudit.assertions[0].evidence_content = JSON.stringify({ documents: [] });
  omittedAudit.assertions[0].evidence_sha256 = rawSha(omittedAudit.assertions[0].evidence_content);
  omittedArtifact.content = JSON.stringify(omittedAudit);
  omittedArtifact.sha256 = rawSha(omittedArtifact.content);
  omittedPublicDocument.automatic_no_go_evidence.prohibited_public_claims_absent = bound(omittedRecord);
  assert.throws(() => computeMetrics(omittedPublicDocument, thresholds), /not derived from its check-specific payload/);
});

test('measurement rejects fabricated pre-result Git object proofs and post-execution commitments', () => {
  const badBlob = fixture();
  badBlob.evidence.execution_receipts[0].document.pre_result_commitment.git_proof.blob_oid = 'f'.repeat(40);
  badBlob.evidence.execution_receipts[0] = bound(badBlob.evidence.execution_receipts[0].document);
  assert.throws(() => computeMetrics(badBlob, thresholds), /Git tree proof does not terminate|Git object proof does not verify/);

  const badIntermediateTree = fixture();
  badIntermediateTree.evidence.execution_receipts[0].document.pre_result_commitment.git_proof.tree_chain[1].content_base64 =
    Buffer.from('fabricated tree').toString('base64');
  badIntermediateTree.evidence.execution_receipts[0] = bound(badIntermediateTree.evidence.execution_receipts[0].document);
  assert.throws(() => computeMetrics(badIntermediateTree, thresholds), /Git tree object does not verify/);

  const lateCommit = fixture();
  for (const receipt of lateCommit.evidence.execution_receipts) {
    receipt.document.pre_result_commitment.git_proof.committed_at_unix = 1893456000;
    receipt.document_sha256 = sha(receipt.document);
  }
  assert.throws(() => computeMetrics(lateCommit, thresholds), /Git object proof does not verify|does not predate/);
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

  const overlappingInventory = fixture();
  overlappingInventory.evidence.opportunity_manifest.document.opportunities.push({
    ...structuredClone(overlappingInventory.evidence.opportunity_manifest.document.opportunities[0]),
    opportunity_id: 'golden.overlapping-opportunity:0:0',
  });
  refreshBlindLabelBindings(overlappingInventory);
  assert.throws(
    () => computeMetrics(overlappingInventory, thresholds),
    /overlaps another same-rule source opportunity/,
  );

  const duplicateNonSourceInventory = fixture();
  const originalNonSource = duplicateNonSourceInventory.evidence.opportunity_manifest.document
    .opportunities[0];
  rewriteOpportunityEvidence(duplicateNonSourceInventory, originalNonSource.opportunity_id, {
    kind: 'configuration',
    path_or_reference: 'package.json#scripts',
    sha256: SOURCE_SHA256,
    rationale: 'Synthetic configuration scope used to enforce unique non-source identities.',
  });
  duplicateNonSourceInventory.evidence.opportunity_manifest.document.opportunities.push({
    ...structuredClone(originalNonSource),
    opportunity_id: 'golden.duplicate-configuration:0:0',
  });
  refreshBlindLabelBindings(duplicateNonSourceInventory);
  assert.throws(
    () => computeMetrics(duplicateNonSourceInventory, thresholds),
    /duplicates another same-rule non-source opportunity/,
  );
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

test('requires live trusted execution verification and exact downloaded evidence bindings', () => {
  const candidate = fixture();
  const verification = testTrustedExecutionVerification(candidate);
  verification.runs[0].evidence_bundle.execution_receipts[0].document_sha256 = 'f'.repeat(64);
  assert.throws(
    () => computeMetricsForUnitTest(
      candidate,
      thresholds,
      TEST_CALIBRATION_CONTRACT,
      verification,
      testPublicSurfaceVerification(candidate),
    ),
    /downloaded GitHub artifact does not bind/,
  );
  assert.throws(
    () => computeMetricsForUnitTest(
      candidate,
      thresholds,
      TEST_CALIBRATION_CONTRACT,
      null,
      testPublicSurfaceVerification(candidate),
    ),
    /live-verified trusted execution proof/,
  );
  const wrongHead = fixture();
  const wrongHeadVerification = testTrustedExecutionVerification(wrongHead);
  wrongHeadVerification.runs[0].workflow_sha256 = 'a'.repeat(64);
  assert.throws(
    () => computeMetricsForUnitTest(
      wrongHead,
      thresholds,
      TEST_CALIBRATION_CONTRACT,
      wrongHeadVerification,
      testPublicSurfaceVerification(wrongHead),
    ),
    /workflow bytes outside the detector freeze/,
  );
});
