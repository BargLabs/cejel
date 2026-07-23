import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalize, hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';
import {
  buildDetectorArtifact,
  createDetectorFreezeRecord,
  validateDetectorFreezeRecord,
  validateFrozenGoldenManifest,
  validateGoldenCorrectionLedger,
  validateGoldenExecutionEvidence,
  validateGoldenLabelEvidence,
  validateGoldenOpportunityEvidence,
} from './freeze-detector.mjs';
import {
  assertCohortRunAllowed,
  assertSeparatedRoots,
  buildScanInvocation,
  main as runCohortMain,
  runFrozenRepository,
  validateImmutableManifest,
} from './run-frozen-cohort.mjs';
import { validatePreResultCommitment, verifyGitCommittedPreResult } from './pre-result-commitment.mjs';

const BUILD_SHA = 'b'.repeat(64);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const REVIEW_BINDINGS = {
  selection_policy_sha256: '1'.repeat(64),
  golden_candidates_sha256: '2'.repeat(64),
  untouched_candidates_sha256: '3'.repeat(64),
  reserve_candidates_sha256: '4'.repeat(64),
  selection_amendments_sha256: '5'.repeat(64),
  replacement_selection_sha256: '9'.repeat(64),
  review_record_sha256s: ['6'.repeat(64), '7'.repeat(64)],
};

const canonicalSha = (value) => createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
const gitObjectSha1 = (type, bytes) => createHash('sha1')
  .update(Buffer.from(`${type} ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
const gitTreeEntry = (mode, name, oid) => Buffer.concat([
  Buffer.from(`${mode} ${name}\0`, 'utf8'), Buffer.from(oid, 'hex'),
]);
const bound = (document) => ({ document_sha256: canonicalSha(document), document });

function ledger(goldenManifestSha256 = immutableManifest('golden').manifest_sha256) {
  return {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen',
    detector_build_sha256: BUILD_SHA,
    golden_manifest_sha256: goldenManifestSha256,
    golden_opportunity_manifest_sha256: '2'.repeat(64),
    golden_label_evidence_sha256: '3'.repeat(64),
    missed_defect_opportunity_ids: [],
    frozen_at: '2026-07-22T20:00:00Z',
    frozen_before_untouched: true,
    reviewed_by: ['Alice Example', 'Bob Example'],
    open_corrections: 0,
    entries: [],
  };
}

function goldenOpportunityAndLabels(includeFinding = true) {
  const execution = goldenExecutionEvidence(includeFinding);
  const repository = execution.manifest.repositories[0];
  const opportunity = {
    opportunity_id: 'llm-opportunity-example-0001',
    cohort: 'golden',
    repository_id: repository.repository_id,
    commit_sha: repository.commit_sha,
    rule_id: 'LLM-IOH-001',
    evidence_scope: {
      kind: 'source_span',
      path_or_reference: 'src/app.ts',
      sha256: '9'.repeat(64),
      start_line: 1,
      end_line: 1,
    },
  };
  const primary = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    label_id: 'llm-label-primary-example-0001',
    opportunity_id: opportunity.opportunity_id,
    cohort: 'golden',
    repository: {
      repository_id: repository.repository_id,
      commit_sha: repository.commit_sha,
    },
    rule: { rule_id: opportunity.rule_id },
    label: 'present',
    detector_finding_id: null,
    evidence: [{ ...opportunity.evidence_scope }],
    review: { role: 'primary_labeler', detector_output_visible: false },
  };
  const findingReview = {
    ...primary,
    label_id: 'llm-label-finding-example-0001',
    detector_finding_id: execution.findingId,
    review: { role: 'finding_reviewer', detector_output_visible: true },
  };
  const withoutHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen',
    frozen_before_detector_results: true,
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; manifest excludes only manifest_sha256',
    cohort_bindings: { golden_manifest_sha256: execution.manifest.manifest_sha256 },
    blind_label_bindings: [{
      label_id: primary.label_id,
      document_sha256: canonicalSha(primary),
      role: 'primary_labeler',
    }],
    opportunities: [opportunity],
    attestation: { method: 'internal_witness', reference: 'internal-witness:test' },
  };
  const manifest = { ...withoutHash, manifest_sha256: canonicalSha(withoutHash) };
  return {
    execution,
    opportunity,
    manifest,
    primary: bound(primary),
    findingReview: bound(findingReview),
    validatedOpportunity: validateGoldenOpportunityEvidence(manifest, execution.manifest),
  };
}

function goldenExecutionEvidence(includeFinding = true) {
  const manifest = immutableManifest('golden');
  const repository = manifest.repositories[0];
  const finding = {
    ruleId: 'LLM-IOH-001', severity: 'warning', confidence: 'high',
    summary: 'Synthetic golden correction finding.',
    evidence: { path: 'src/app.ts', line: 1, label: 'synthetic evidence' },
  };
  const report = { result: { findings: includeFinding ? [finding] : [], ruleResults: [] } };
  const findingId = `llm-finding-${canonicalSha({ repository_id: repository.repository_id, index: 0, finding })}`;
  const receipt = {
    protocol_id: 'cejel-llm-calibration-v1', cohort: 'golden', repository_id: repository.repository_id,
    commit_sha: repository.commit_sha, git_tree_sha: repository.git_tree_sha,
    manifest_sha256: manifest.manifest_sha256, detector_build_sha256: BUILD_SHA,
    llm_report_canonical_sha256: canonicalSha(report), finding_ids: includeFinding ? [findingId] : [],
  };
  const document = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', cohort: 'golden',
    golden_manifest_sha256: manifest.manifest_sha256, detector_build_sha256: BUILD_SHA,
    executions: [{ repository_id: repository.repository_id, receipt: bound(receipt), llm_report: bound(report) }],
  };
  return {
    manifest, finding, findingId, document,
    validated: validateGoldenExecutionEvidence(document, manifest, BUILD_SHA),
  };
}

function detectorFreeze() {
  const execution = goldenExecutionEvidence();
  const goldenLedger = validateGoldenCorrectionLedger(
    ledger(execution.manifest.manifest_sha256), BUILD_SHA, execution.manifest.manifest_sha256, execution.validated,
  );
  return createDetectorFreezeRecord({
    gitCommit: COMMIT_SHA,
    sourceTreeSha: TREE_SHA,
    buildSha256: BUILD_SHA,
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
    artifactName: 'cejel',
    frozenAt: '2026-07-22T21:00:00Z',
    runtime: { name: 'node', version: 'v24.0.0', platform: 'linux', architecture: 'x64' },
    workflow: { path: '.github/workflows/llm-calibration.yml', sha256: '5'.repeat(64) },
    networkIsolation: {
      mode: 'node-runtime-deny-hook-v1',
      argvPrefix: ['/usr/local/bin/no-egress'],
      evidenceReference: 'internal-witness:test-isolation',
      wrapperSha256: '1'.repeat(64), hookSha256: '2'.repeat(64),
      probePath: '/usr/local/bin/no-egress-probe.mjs',
      probeSha256: '3'.repeat(64), probeOutputSha256: '4'.repeat(64),
      probeDenied: 5, probeAttempted: 5,
      confirmed: true,
    },
    ledger: goldenLedger,
    ledgerSha256: 'e'.repeat(64),
    goldenExecutionEvidence: execution.validated,
    goldenExecutionEvidenceSha256: canonicalSha(execution.document),
  });
}

function immutableManifest(cohort = 'untouched') {
  const withoutEntryHash = {
    repository_id: 'owner/repository',
    url: 'https://github.com/owner/repository',
    default_branch_observed: 'main',
    commit_sha: COMMIT_SHA,
    git_tree_sha: TREE_SHA,
    license_spdx: 'MIT',
    primary_language: 'typescript_javascript',
    primary_surface: 'agent_tools',
    provider_surface: 'openai',
    inclusion_reason: 'Synthetic unit-test repository entry only.',
    source_available_at_freeze: true,
  };
  const repository = {
    ...withoutEntryHash,
    entry_sha256: hashRepositoryEntry(withoutEntryHash),
  };
  const withoutManifestHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    policy_id: 'llm-selection-v1.2',
    cohort,
    status: 'frozen',
    frozen_at: '2026-07-22T19:00:00Z',
    frozen_by: ['Alice Example', 'Bob Example'],
    review_method: 'two_human',
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; entry excludes entry_sha256; manifest excludes manifest_sha256',
    review_bindings: REVIEW_BINDINGS,
    repositories: [repository],
    attestation: { method: 'internal_witness', reference: 'internal-witness:test' },
  };
  return {
    ...withoutManifestHash,
    manifest_sha256: hashManifest(withoutManifestHash),
  };
}

test('detector freeze binds build, runtime, rules, support, isolation, and closed golden ledger', () => {
  const record = detectorFreeze();
  assert.equal(validateDetectorFreezeRecord(record), record);
  assert.equal(record.rule_ids.length, 8);
  assert.equal(record.support_matrix.python.status, 'narrow_fixture_backed_alpha');
  assert.equal(record.golden_correction_ledger.open_corrections, 0);
  assert.equal(record.golden_correction_ledger.golden_manifest_sha256, ledger().golden_manifest_sha256);
  assert.equal(record.golden_execution_evidence.executions, 1);
  assert.equal(record.detector.source_tree_sha, TREE_SHA);
  assert.equal(record.detector.build.deterministic_rebuild_verified, true);
  assert.throws(
    () => validateDetectorFreezeRecord({ ...record, frozen_at: '2026-07-23T00:00:00Z' }),
    /SHA-256/,
  );
});

test('detector build provenance executes twice and rejects unrelated or nondeterministic output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-build-proof-'));
  mkdirSync(join(root, 'dist'));
  let executions = 0;
  const deterministic = await buildDetectorArtifact({
    detectorRepo: root,
    command: 'npm',
    args: ['run', 'build'],
    outputRelativePath: 'dist/index.js',
  }, async (_command, _args, options) => {
    assert.equal(options.cwd, realpathSync(root));
    executions += 1;
    writeFileSync(join(root, 'dist/index.js'), 'stable build\n');
    return '';
  });
  assert.equal(executions, 2);
  assert.equal(deterministic.provenance.firstBuildSha256, deterministic.buildSha256);
  assert.equal(
    deterministic.provenance.firstOutputTreeSha256,
    deterministic.provenance.secondOutputTreeSha256,
  );
  assert.deepEqual(deterministic.provenance.command, ['npm', 'run', 'build']);

  let version = 0;
  await assert.rejects(() => buildDetectorArtifact({
    detectorRepo: root,
    command: 'npm',
    args: ['run', 'build'],
    outputRelativePath: 'dist/index.js',
  }, async () => {
    version += 1;
    writeFileSync(join(root, 'dist/index.js'), `build ${version}\n`);
    return '';
  }), /not deterministic/);
  version = 0;
  await assert.rejects(() => buildDetectorArtifact({
    detectorRepo: root,
    command: 'npm',
    args: ['run', 'build'],
    outputRelativePath: 'dist/index.js',
  }, async () => {
    version += 1;
    writeFileSync(join(root, 'dist/index.js'), 'stable entry\n');
    writeFileSync(join(root, 'dist/chunk.js'), `chunk ${version}\n`);
    return '';
  }), /not deterministic/);
  await assert.rejects(() => buildDetectorArtifact({
    detectorRepo: root,
    command: 'npm',
    args: ['run', 'build'],
    outputRelativePath: '../unrelated-cejel',
  }), /repository-relative/);
  await assert.rejects(() => buildDetectorArtifact({
    detectorRepo: root,
    command: '/bin/cp',
    args: ['/tmp/unrelated-cejel', 'dist/index.js'],
    outputRelativePath: 'dist/index.js',
  }), /committed npm\/pnpm run build script/);
});

test('golden correction ledger must match the exact detector build and have no open corrections', () => {
  assert.throws(() => validateGoldenCorrectionLedger(ledger(), 'f'.repeat(64)), /not bound/);
  assert.throws(
    () => validateGoldenCorrectionLedger({ ...ledger(), open_corrections: 1 }, BUILD_SHA),
    /zero open/,
  );
  assert.throws(
    () => validateGoldenCorrectionLedger(ledger(), BUILD_SHA, 'f'.repeat(64)),
    /supplied golden manifest/,
  );
  assert.throws(
    () => validateGoldenCorrectionLedger({ ...ledger(), entries: [{ correction_id: 'bad' }] }, BUILD_SHA),
    /correction_id is invalid/,
  );
  const execution = goldenExecutionEvidence();
  const closedEntry = {
    correction_id: 'llm-correction-example-0001', status: 'resolved',
    finding_id: execution.findingId, opportunity_id: null, rule_id: 'LLM-IOH-001',
    repository_id: 'owner/repository', commit_sha: COMMIT_SHA,
    original_outcome: 'detector_finding', final_outcome: 'false_positive',
    rationale: 'The source evidence proves this finding was incorrect.',
    evidence: [{ reference: `llm-report:${execution.findingId}`, sha256: canonicalSha(execution.finding) }],
    resolved_at: '2026-07-22T20:00:00Z',
  };
  assert.doesNotThrow(() => validateGoldenCorrectionLedger(
    { ...ledger(execution.manifest.manifest_sha256), entries: [closedEntry] },
    BUILD_SHA,
    execution.manifest.manifest_sha256,
    execution.validated,
  ));
  assert.throws(() => validateGoldenCorrectionLedger(
    { ...ledger(execution.manifest.manifest_sha256), entries: [{ ...closedEntry, commit_sha: 'f'.repeat(40) }] },
    BUILD_SHA,
    execution.manifest.manifest_sha256,
    execution.validated,
  ), /frozen golden repository and commit/);
});

test('golden labels derive the exact missed-defect ledger set with no omissions or extras', () => {
  const evidence = goldenOpportunityAndLabels();
  const matched = validateGoldenLabelEvidence(
    [evidence.primary, evidence.findingReview],
    evidence.execution.manifest,
    evidence.validatedOpportunity,
    evidence.execution.validated,
  );
  assert.deepEqual(matched.missedOpportunityIds, []);

  assert.throws(() => validateGoldenLabelEvidence(
    [evidence.primary],
    evidence.execution.manifest,
    evidence.validatedOpportunity,
    evidence.execution.validated,
  ), /every golden detector finding requires exactly one opportunity-bound finding review/);

  const overlappingManifest = structuredClone(evidence.manifest);
  overlappingManifest.opportunities.push({
    ...structuredClone(evidence.opportunity),
    opportunity_id: 'llm-opportunity-overlap-0002',
  });
  const { manifest_sha256: _oldHash, ...overlappingHashable } = overlappingManifest;
  overlappingManifest.manifest_sha256 = canonicalSha(overlappingHashable);
  assert.throws(
    () => validateGoldenOpportunityEvidence(overlappingManifest, evidence.execution.manifest),
    /overlap/,
  );

  const missedEvidence = goldenOpportunityAndLabels(false);
  const missed = validateGoldenLabelEvidence(
    [missedEvidence.primary],
    missedEvidence.execution.manifest,
    missedEvidence.validatedOpportunity,
    missedEvidence.execution.validated,
  );
  assert.deepEqual(missed.missedOpportunityIds, [missedEvidence.opportunity.opportunity_id]);
  const missedEntry = {
    correction_id: 'llm-correction-missed-example-0001',
    status: 'resolved',
    finding_id: null,
    opportunity_id: missedEvidence.opportunity.opportunity_id,
    rule_id: missedEvidence.opportunity.rule_id,
    repository_id: missedEvidence.opportunity.repository_id,
    commit_sha: missedEvidence.opportunity.commit_sha,
    original_outcome: 'missed_defect',
    final_outcome: 'false_negative',
    rationale: 'The committed blind label identifies a defect with no matching golden finding.',
    evidence: [{
      reference: `opportunity:${missedEvidence.opportunity.opportunity_id}`,
      sha256: canonicalSha(missedEvidence.opportunity.evidence_scope),
    }],
    resolved_at: '2026-07-22T20:00:00Z',
  };
  const exactLedger = {
    ...ledger(missedEvidence.execution.manifest.manifest_sha256),
    golden_opportunity_manifest_sha256: missedEvidence.validatedOpportunity.manifest.manifest_sha256,
    golden_label_evidence_sha256: missed.document_sha256,
    missed_defect_opportunity_ids: [...missed.missedOpportunityIds],
    entries: [missedEntry],
  };
  assert.doesNotThrow(() => validateGoldenCorrectionLedger(
    exactLedger,
    BUILD_SHA,
    missedEvidence.execution.manifest.manifest_sha256,
    missedEvidence.execution.validated,
    missedEvidence.validatedOpportunity,
    missed,
  ));
  assert.throws(() => validateGoldenCorrectionLedger(
    { ...exactLedger, entries: [] },
    BUILD_SHA,
    missedEvidence.execution.manifest.manifest_sha256,
    missedEvidence.execution.validated,
    missedEvidence.validatedOpportunity,
    missed,
  ), /omits or adds/);
  assert.throws(() => validateGoldenCorrectionLedger(
    {
      ...exactLedger,
      missed_defect_opportunity_ids: ['llm-opportunity-extra-0002'],
    },
    BUILD_SHA,
    missedEvidence.execution.manifest.manifest_sha256,
    missedEvidence.execution.validated,
    missedEvidence.validatedOpportunity,
    missed,
  ), /does not match committed labels/);
});

test('detector freeze validates the actual golden manifest and every repository-entry hash', () => {
  const golden = immutableManifest('golden');
  assert.equal(validateFrozenGoldenManifest(golden), golden);
  const tampered = { ...golden, repositories: [{ ...golden.repositories[0], commit_sha: 'f'.repeat(40) }] };
  assert.throws(() => validateFrozenGoldenManifest(tampered), /valid frozen golden manifest|repository entry/);
});

test('pre-result commitment is verified against exact Git blob bytes before execution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-commitment-test-'));
  const path = join(root, 'commitment.json');
  const document = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen_pre_result',
    created_at: '2026-07-22T18:00:00Z', detector_results_seen_before_commitment: false,
    golden_manifest_sha256: immutableManifest('golden').manifest_sha256,
    untouched_manifest_sha256: immutableManifest('untouched').manifest_sha256,
    opportunity_manifest_sha256: '6'.repeat(64),
    opportunity_discovery_coverage_sha256: '9'.repeat(64),
    release_thresholds: {
      byte_sha256: 'b'.repeat(64),
      canonical_sha256: 'c'.repeat(64),
    },
    public_surface_policy: {
      byte_sha256: 'd'.repeat(64),
      canonical_sha256: 'e'.repeat(64),
    },
    free_core_baseline_commit: 'd'.repeat(40),
    blind_label_bindings: [
      { label_id: 'llm-label-example-0001', document_sha256: '7'.repeat(64), role: 'primary_labeler' },
      { label_id: 'llm-label-example-0002', document_sha256: '8'.repeat(64), role: 'independent_reviewer' },
    ],
    public_document_inventory: [{ path: 'README.md', content_sha256: 'a'.repeat(64) }],
  };
  const bytes = `${JSON.stringify(document)}\n`;
  writeFileSync(path, bytes, 'utf8');
  assert.equal(validatePreResultCommitment(document), document);
  const blobOid = gitObjectSha1('blob', Buffer.from(bytes));
  const leafTree = gitTreeEntry('100644', 'pre-result-commitment.json', blobOid);
  const leafTreeOid = gitObjectSha1('tree', leafTree);
  const llmTree = gitTreeEntry('40000', 'llm', leafTreeOid);
  const llmTreeOid = gitObjectSha1('tree', llmTree);
  const rootTree = gitTreeEntry('40000', 'calibration', llmTreeOid);
  const treeOid = gitObjectSha1('tree', rootTree);
  const commitContent = `tree ${treeOid}\nauthor Test <test@example.com> 1784746800 +0000\ncommitter Test <test@example.com> 1784746800 +0000\n\nFreeze\n`;
  const commitOid = gitObjectSha1('commit', Buffer.from(commitContent));
  const runner = async (_command, args) => {
    const operation = args.slice(2).join(' ');
    if (operation === 'rev-parse --show-object-format') return 'sha1';
    if (operation === `rev-parse ${commitOid}^{commit}`) return commitOid;
    if (operation === `rev-parse ${commitOid}^{tree}`) return treeOid;
    if (operation === `rev-parse ${commitOid}:calibration/llm/pre-result-commitment.json`) return blobOid;
    if (operation === `cat-file commit ${commitOid}`) return commitContent;
    if (operation === `cat-file blob ${blobOid}`) return bytes;
    if (operation === `cat-file tree ${treeOid}`) return rootTree;
    if (operation === `cat-file tree ${llmTreeOid}`) return llmTree;
    if (operation === `cat-file tree ${leafTreeOid}`) return leafTree;
    if (operation === `show -s --format=%ct ${commitOid}`) return '1784746800';
    throw new Error(`unexpected Git command: ${operation}`);
  };
  const verified = await verifyGitCommittedPreResult({
    documentPath: path, gitRepo: root, gitCommit: commitOid,
    gitPath: 'calibration/llm/pre-result-commitment.json',
    manifestSha256: immutableManifest('golden').manifest_sha256,
  }, runner);
  assert.equal(verified.git_commit, commitOid);
  assert.equal(verified.git_proof.blob_oid, blobOid);
  await assert.rejects(() => verifyGitCommittedPreResult({
    documentPath: path, gitRepo: root, gitCommit: commitOid,
    gitPath: 'calibration/llm/pre-result-commitment.json',
    manifestSha256: immutableManifest('golden').manifest_sha256,
  }, async (_command, args) => {
    const value = await runner(_command, args);
    return args.includes('blob') ? `${JSON.stringify(document)} ` : value;
  }), /exact Git blob/);
});

test('untouched execution requires both a valid detector freeze and explicit post-freeze confirmation', () => {
  const record = detectorFreeze();
  assert.throws(() => assertCohortRunAllowed('untouched', null, true), /detector-freeze/);
  assert.throws(() => assertCohortRunAllowed('untouched', record, false), /confirm-untouched/);
  assert.doesNotThrow(() => assertCohortRunAllowed('untouched', record, true));
  assert.doesNotThrow(() => assertCohortRunAllowed('golden', null, false));
});

test('runner CLI refuses untouched before any clone when detector freeze is absent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-llm-refusal-test-'));
  const manifestPath = join(root, 'untouched-manifest.json');
  const cejelPath = join(root, 'cejel');
  writeFileSync(manifestPath, `${JSON.stringify(immutableManifest())}\n`, 'utf8');
  writeFileSync(cejelPath, '# synthetic local build\n', 'utf8');
  const commands = [];

  await assert.rejects(
    () => runCohortMain([
      '--manifest', manifestPath,
      '--cejel', cejelPath,
      '--work-root', join(root, 'work'),
      '--output-root', join(root, 'output'),
    ], async (command, args) => {
      commands.push([command, args]);
      return '';
    }),
    /detector-freeze/,
  );
  assert.deepEqual(commands, []);
});

test('immutable manifest validation rejects mutable or tampered repository identities', () => {
  const manifest = immutableManifest();
  assert.equal(validateImmutableManifest(manifest), manifest);
  const sequentialWithoutHash = {
    ...manifest,
    frozen_by: ['codex-owner-pass-1', 'codex-owner-pass-2'],
    review_method: 'two_sequential_ai_passes',
    attestation: {
      method: 'internal_ai_two_pass_review',
      reference: 'internal-witness:two-pass-test',
    },
  };
  delete sequentialWithoutHash.manifest_sha256;
  const sequentialManifest = {
    ...sequentialWithoutHash,
    manifest_sha256: hashManifest(sequentialWithoutHash),
  };
  assert.equal(validateImmutableManifest(sequentialManifest), sequentialManifest);
  assert.throws(
    () => validateImmutableManifest({ ...manifest, repositories: [{ ...manifest.repositories[0], commit_sha: 'main' }] }),
    /manifest SHA-256|immutable/,
  );
});

test('scan invocation preserves argv boundaries and output roots cannot contain source roots', () => {
  assert.deepEqual(
    buildScanInvocation(['/usr/bin/no-egress', '--'], '/opt/cejel', '/work/repo', '/results/repo'),
    {
      command: '/usr/bin/no-egress',
      args: ['--', '/opt/cejel', 'scan', '/work/repo', '--out', '/results/repo', '--pack', 'llm', '--quiet'],
    },
  );
  assert.throws(() => assertSeparatedRoots('/tmp/work', '/tmp/work/results'), /separate/);
  assert.doesNotThrow(() => assertSeparatedRoots('/tmp/work-a', '/tmp/results-b'));
});

test('repository runner checks out and verifies only manifest commit/tree before isolated scan', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-llm-runner-test-'));
  const workRoot = join(root, 'work');
  const outputRoot = join(root, 'output');
  const commands = [];
  const commandRunner = async (command, args) => {
    commands.push([command, args]);
    if (command === 'git' && args[0] === 'clone') {
      mkdirSync(args.at(-1), { recursive: true });
      return '';
    }
    if (command === 'git' && args.at(-1) === 'HEAD') return COMMIT_SHA;
    if (command === 'git' && args.at(-1) === 'HEAD^{tree}') return TREE_SHA;
    if (command === '/usr/bin/no-egress') {
      const outputIndex = args.indexOf('--out');
      mkdirSync(args[outputIndex + 1], { recursive: true });
      writeFileSync(join(args[outputIndex + 1], 'llm-report.json'), JSON.stringify({
        result: { findings: [], ruleResults: [{ ruleId: 'LLM-IOH-001', state: 'not_applicable' }] },
      }));
    }
    return '';
  };
  const repository = immutableManifest().repositories[0];
  const result = await runFrozenRepository({
    cohort: 'untouched',
    repository,
    cejel: '/opt/cejel',
    workRoot,
    outputRoot,
    isolationPrefix: ['/usr/bin/no-egress', '--'],
    networkIsolationMode: 'test-no-egress',
    detectorBuildSha256: BUILD_SHA,
    detectorFreezeSha256: detectorFreeze().record_sha256,
    manifestSha256: immutableManifest().manifest_sha256,
    preResultCommitment: {
      document_sha256: '3'.repeat(64), canonical_sha256: '4'.repeat(64),
      git_commit: '5'.repeat(40), git_path: 'calibration/llm/pre-result-commitment.json',
    },
  }, commandRunner);

  assert.equal(result.receipt.commit_sha, COMMIT_SHA);
  assert.equal(result.receipt.git_tree_sha, TREE_SHA);
  assert.equal(result.receipt.output_outside_source, true);
  assert.equal(result.receipt.manifest_sha256, immutableManifest().manifest_sha256);
  assert.match(result.receipt.llm_report_canonical_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(commands[0], [
    'git',
    ['clone', '--no-checkout', 'https://github.com/owner/repository', result.source],
  ]);
  assert.ok(commands.some(([command, args]) => command === 'git' && args.includes('--detach') && args.includes(COMMIT_SHA)));
  assert.ok(commands.some(([command]) => command === '/usr/bin/no-egress'));
});
