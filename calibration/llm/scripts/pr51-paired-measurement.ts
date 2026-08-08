import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectCejelLlmPack, snapshotCejelLlmPackInput } from '../../../src/packs/llm/index.js';
import type { CejelLlmFinding, CejelLlmRuleState } from '../../../src/packs/llm/index.js';
import { canonicalize, hashManifest } from './freeze-cohorts.mjs';

export const PR51_PAIRED_PROTOCOL_ID = 'cejel-pr51-paired-golden-v1';

type ArmName = 'baseline' | 'candidate';

interface FrozenRepository {
  repository_id: string;
  commit_sha: string;
  git_tree_sha: string;
}

interface FrozenManifest {
  schema_version: string;
  protocol_id: string;
  status: string;
  cohort: string;
  manifest_sha256: string;
  repositories: FrozenRepository[];
}

interface CheckoutMatrix {
  repositories: Array<{
    cohort: string;
    repository_id: string;
    commit_sha: string;
    source_root: string;
  }>;
}

interface PreregistrationBindings {
  schema_version: string;
  protocol_id: string;
  status: string;
  inputs: {
    golden_manifest: { path: string; byte_sha256: string; canonical_sha256: string; repositories: number };
    opportunity_manifest: {
      path: string;
      byte_sha256: string;
      canonical_sha256: string;
      opportunities: number;
      present: number;
      absent: number;
      not_applicable: number;
    };
  };
  harness: { path: string; byte_sha256: string };
}

interface PreResultCommitment {
  schema_version: string;
  protocol_id: string;
  status: string;
  created_at: string;
  detector_results_seen_before_commitment: false;
  preregistration_commit: string;
  baseline_commit: string;
  candidate_commit: string;
  candidate_pr: 51;
  candidate_diff_sha256: string;
  execution_bundles: { baseline_sha256: string; candidate_sha256: string };
  execution_order: ['baseline', 'candidate'];
  bindings_byte_sha256: string;
}

export interface Opportunity {
  opportunity_id: string;
  repository_id: string;
  rule_id: string;
  ground_truth_label: 'present' | 'absent' | 'not_applicable';
  evidence_scope: {
    path_or_reference: string;
    start_line: number;
    end_line: number;
  };
}

interface OpportunityManifest {
  schema_version: string;
  protocol_id: string;
  status: string;
  manifest_sha256: string;
  label_counts: { present: number; absent: number; not_applicable: number };
  opportunities: Opportunity[];
}

export interface RepositoryMeasurement {
  repository_id: string;
  commit_sha: string;
  git_tree_sha: string;
  input_source_sha256: string;
  findings: CejelLlmFinding[];
  rule_states: Array<{ rule_id: string; state: CejelLlmRuleState }>;
}

export interface ArmMeasurement {
  schema_version: '1.0.0';
  protocol_id: typeof PR51_PAIRED_PROTOCOL_ID;
  status: 'completed_arm';
  arm: ArmName;
  detector_commit: string;
  golden_manifest_sha256: string;
  opportunity_manifest_sha256: string;
  bindings_byte_sha256: string;
  pre_result_commitment_byte_sha256: string;
  harness_byte_sha256: string;
  execution_bundle_sha256: string;
  completed_at: string;
  repositories: RepositoryMeasurement[];
}

export interface ArmScore {
  findings: number;
  true_positives: number;
  false_positives: number;
  abstentions: number;
  recall: number;
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalHashWithout(document: object, excludedKey: string): string {
  const hashable = structuredClone(document) as Record<string, unknown>;
  delete hashable[excludedKey];
  return sha256(canonicalize(hashable));
}

function readJson<T>(path: string): { bytes: Buffer; document: T } {
  const bytes = readFileSync(resolve(path));
  return { bytes, document: JSON.parse(bytes.toString('utf8')) as T };
}

function assertSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} is not a SHA-256 digest`);
  }
}

function assertCommit(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${label} is not a full Git commit SHA`);
  }
}

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function validateBindings(
  bindings: PreregistrationBindings,
  bindingBytes: Buffer,
  manifestBytes: Buffer,
  manifest: FrozenManifest,
  opportunityBytes: Buffer,
  opportunityManifest: OpportunityManifest,
  detectorRoot: string,
): void {
  if (
    bindings?.schema_version !== '1.0.0' ||
    bindings.protocol_id !== PR51_PAIRED_PROTOCOL_ID ||
    bindings.status !== 'preregistered_before_measurement' ||
    bindings.inputs?.golden_manifest?.path !== 'calibration/llm/cohorts/golden-manifest-v1.9.json' ||
    bindings.inputs?.opportunity_manifest?.path !==
      'calibration/llm/results/v1.9-golden-opportunity-manifest.json' ||
    bindings.harness?.path !== 'calibration/llm/scripts/pr51-paired-measurement.ts'
  ) throw new Error('preregistration bindings are invalid');
  assertSha(bindings.inputs?.golden_manifest?.byte_sha256, 'golden manifest byte binding');
  assertSha(bindings.inputs?.golden_manifest?.canonical_sha256, 'golden manifest canonical binding');
  assertSha(bindings.inputs?.opportunity_manifest?.byte_sha256, 'opportunity manifest byte binding');
  assertSha(bindings.inputs?.opportunity_manifest?.canonical_sha256, 'opportunity manifest canonical binding');
  assertSha(bindings.harness?.byte_sha256, 'harness byte binding');
  if (
    sha256(manifestBytes) !== bindings.inputs.golden_manifest.byte_sha256 ||
    manifest.manifest_sha256 !== bindings.inputs.golden_manifest.canonical_sha256 ||
    hashManifest(manifest) !== manifest.manifest_sha256 ||
    manifest.repositories.length !== bindings.inputs.golden_manifest.repositories
  ) throw new Error('golden manifest does not match the preregistered binding');
  if (
    sha256(opportunityBytes) !== bindings.inputs.opportunity_manifest.byte_sha256 ||
    opportunityManifest.manifest_sha256 !== bindings.inputs.opportunity_manifest.canonical_sha256 ||
    canonicalHashWithout(opportunityManifest, 'manifest_sha256') !== opportunityManifest.manifest_sha256 ||
    opportunityManifest.opportunities.length !== bindings.inputs.opportunity_manifest.opportunities ||
    opportunityManifest.label_counts.present !== bindings.inputs.opportunity_manifest.present ||
    opportunityManifest.label_counts.absent !== bindings.inputs.opportunity_manifest.absent ||
    opportunityManifest.label_counts.not_applicable !== bindings.inputs.opportunity_manifest.not_applicable
  ) throw new Error('opportunity manifest does not match the preregistered binding');
  const harnessBytes = readFileSync(resolve(detectorRoot, bindings.harness.path));
  if (sha256(harnessBytes) !== bindings.harness.byte_sha256) {
    throw new Error('measurement harness does not match the preregistered binding');
  }
  if (sha256(bindingBytes) === bindings.harness.byte_sha256) {
    throw new Error('binding and harness digests unexpectedly collide');
  }
}

function validateCommitment(
  commitment: PreResultCommitment,
  commitmentBytes: Buffer,
  arm: ArmName,
  detectorRoot: string,
  bindingBytes: Buffer,
  commitmentGitRepo: string,
  commitmentGitCommit: string,
  commitmentGitPath: string,
): string {
  if (
    commitment?.schema_version !== '1.0.0' ||
    commitment.protocol_id !== PR51_PAIRED_PROTOCOL_ID ||
    commitment.status !== 'frozen_pre_result' ||
    commitment.detector_results_seen_before_commitment !== false ||
    commitment.candidate_pr !== 51 ||
    JSON.stringify(commitment.execution_order) !== JSON.stringify(['baseline', 'candidate']) ||
    Number.isNaN(Date.parse(commitment.created_at))
  ) throw new Error('pre-result commitment is invalid');
  assertCommit(commitment.preregistration_commit, 'preregistration commit');
  assertCommit(commitment.baseline_commit, 'baseline commit');
  assertCommit(commitment.candidate_commit, 'candidate commit');
  assertSha(commitment.candidate_diff_sha256, 'candidate diff binding');
  assertSha(commitment.execution_bundles?.baseline_sha256, 'baseline execution bundle binding');
  assertSha(commitment.execution_bundles?.candidate_sha256, 'candidate execution bundle binding');
  assertSha(commitment.bindings_byte_sha256, 'bindings byte binding');
  if (sha256(bindingBytes) !== commitment.bindings_byte_sha256) {
    throw new Error('pre-result commitment does not bind the preregistration inputs');
  }
  assertCommit(commitmentGitCommit, 'pre-result commitment Git commit');
  if (
    commitmentGitPath.startsWith('/') || commitmentGitPath.includes('\\') ||
    commitmentGitPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) throw new Error('pre-result commitment Git path must be repository-relative');
  const commitmentRepo = realpathSync(resolve(commitmentGitRepo));
  const committedBytes = execFileSync(
    'git', ['-C', commitmentRepo, 'show', `${commitmentGitCommit}:${commitmentGitPath}`],
  );
  if (!committedBytes.equals(commitmentBytes)) {
    throw new Error('pre-result commitment bytes do not match the committed Git blob');
  }
  try {
    git(commitmentRepo, ['merge-base', '--is-ancestor', commitment.preregistration_commit, commitmentGitCommit]);
  } catch {
    throw new Error('pre-result commitment Git commit does not descend from the preregistration');
  }
  const committedAt = Number(git(commitmentRepo, ['show', '-s', '--format=%ct', commitmentGitCommit])) * 1000;
  if (!Number.isSafeInteger(committedAt) || Date.parse(commitment.created_at) > committedAt) {
    throw new Error('pre-result commitment document postdates its Git commit');
  }
  const head = git(detectorRoot, ['rev-parse', 'HEAD^{commit}']);
  const expected = arm === 'baseline' ? commitment.baseline_commit : commitment.candidate_commit;
  if (head !== expected) throw new Error(`${arm} checkout is not at its committed detector revision`);
  const expectedBundle = arm === 'baseline'
    ? commitment.execution_bundles.baseline_sha256
    : commitment.execution_bundles.candidate_sha256;
  if (sha256(readFileSync(fileURLToPath(import.meta.url))) !== expectedBundle) {
    throw new Error(`${arm} execution bundle does not match the pre-result commitment`);
  }
  if (git(detectorRoot, ['status', '--porcelain', '--untracked-files=no']) !== '') {
    throw new Error(`${arm} detector checkout has tracked changes`);
  }
  try {
    git(detectorRoot, ['merge-base', '--is-ancestor', commitment.preregistration_commit, head]);
  } catch {
    throw new Error('preregistration commit is not an ancestor of the detector revision');
  }
  const diff = execFileSync(
    'git',
    ['-C', detectorRoot, 'diff', '--binary', commitment.baseline_commit, commitment.candidate_commit],
  );
  if (sha256(diff) !== commitment.candidate_diff_sha256) {
    throw new Error('candidate diff does not match the pre-result commitment');
  }
  return head;
}

function assertNoEgressHookActive(): void {
  let message = '';
  try {
    // No arguments cannot form a connection. With the committed hook it fails first at the policy.
    (createConnection as unknown as (options: object) => unknown)({});
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  if (!message.includes('Cejel calibration no-egress policy denied net.createConnection')) {
    throw new Error('measurement must run under calibration/llm/scripts/no-egress-wrapper.sh');
  }
}

function validateFrozenInputs(
  manifest: FrozenManifest,
  matrix: CheckoutMatrix,
): Array<FrozenRepository & { source_root: string }> {
  if (
    manifest?.schema_version !== '1.0.0' ||
    manifest.protocol_id !== 'cejel-llm-calibration-v1' ||
    manifest.status !== 'frozen' ||
    manifest.cohort !== 'golden' ||
    !Array.isArray(manifest.repositories) ||
    !Array.isArray(matrix?.repositories) ||
    matrix.repositories.length !== manifest.repositories.length
  ) throw new Error('frozen golden manifest or checkout matrix is invalid');
  const matrixById = new Map(matrix.repositories.map((entry) => [entry.repository_id, entry]));
  return manifest.repositories.map((repository) => {
    const checkout = matrixById.get(repository.repository_id);
    if (
      !checkout || checkout.cohort !== 'golden' || checkout.commit_sha !== repository.commit_sha
    ) throw new Error(`${repository.repository_id}: checkout matrix does not match frozen manifest`);
    const sourceRoot = realpathSync(resolve(checkout.source_root));
    if (
      git(sourceRoot, ['rev-parse', 'HEAD^{commit}']) !== repository.commit_sha ||
      git(sourceRoot, ['rev-parse', 'HEAD^{tree}']) !== repository.git_tree_sha
    ) throw new Error(`${repository.repository_id}: checkout does not match frozen commit and tree`);
    return { ...repository, source_root: sourceRoot };
  });
}

export function scoreArm(
  measurement: ArmMeasurement,
  opportunities: readonly Opportunity[],
): ArmScore {
  const present = opportunities.filter((opportunity) => opportunity.ground_truth_label === 'present');
  const matchedPresent = new Set<string>();
  let findings = 0;
  let falsePositives = 0;
  for (const repository of measurement.repositories) {
    for (const finding of repository.findings) {
      findings += 1;
      const matches = present.filter((opportunity) =>
        finding.evidence.line !== null &&
        opportunity.repository_id === repository.repository_id &&
        opportunity.rule_id === finding.ruleId &&
        opportunity.evidence_scope.path_or_reference === finding.evidence.path &&
        opportunity.evidence_scope.start_line <= finding.evidence.line &&
        opportunity.evidence_scope.end_line >= finding.evidence.line &&
        !matchedPresent.has(opportunity.opportunity_id));
      if (matches.length === 1) matchedPresent.add(matches[0].opportunity_id);
      else falsePositives += 1;
    }
  }
  const truePositives = matchedPresent.size;
  const abstentions = measurement.repositories.filter((repository) =>
    repository.rule_states.some((rule) => rule.state === 'insufficient_data')).length;
  return {
    findings,
    true_positives: truePositives,
    false_positives: falsePositives,
    abstentions,
    recall: present.length === 0 ? 0 : truePositives / present.length,
  };
}

export function decidePair(baseline: ArmScore, candidate: ArmScore): 'merge' | 'close' {
  if (candidate.recall > baseline.recall) return 'merge';
  if (candidate.recall === baseline.recall && candidate.false_positives < baseline.false_positives) {
    return 'merge';
  }
  return 'close';
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2).replaceAll('-', '_');
    if (key === 'confirm_network_isolation') {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function required(options: Record<string, string | boolean>, key: string): string {
  const value = options[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`--${key.replaceAll('_', '-')} is required`);
  }
  return value;
}

function validateArmMeasurement(
  measurement: ArmMeasurement,
  expectedArm: ArmName,
  commitmentBytes: Buffer,
): void {
  if (
    measurement?.schema_version !== '1.0.0' ||
    measurement.protocol_id !== PR51_PAIRED_PROTOCOL_ID ||
    measurement.status !== 'completed_arm' ||
    measurement.arm !== expectedArm ||
    measurement.pre_result_commitment_byte_sha256 !== sha256(commitmentBytes) ||
    !Array.isArray(measurement.repositories)
  ) throw new Error(`${expectedArm} measurement is invalid or does not share the commitment`);
}

async function runArm(options: Record<string, string | boolean>): Promise<void> {
  const arm = required(options, 'arm');
  if (arm !== 'baseline' && arm !== 'candidate') throw new Error('--arm must be baseline or candidate');
  if (options.confirm_network_isolation !== true) {
    throw new Error('--confirm-network-isolation is required');
  }
  assertNoEgressHookActive();
  const detectorRoot = realpathSync(resolve(required(options, 'detector_root')));
  const manifestEvidence = readJson<FrozenManifest>(required(options, 'manifest'));
  const matrix = readJson<CheckoutMatrix>(required(options, 'matrix')).document;
  const opportunityEvidence = readJson<OpportunityManifest>(required(options, 'opportunities'));
  const bindingEvidence = readJson<PreregistrationBindings>(required(options, 'bindings'));
  const commitmentEvidence = readJson<PreResultCommitment>(required(options, 'commitment'));
  validateBindings(
    bindingEvidence.document,
    bindingEvidence.bytes,
    manifestEvidence.bytes,
    manifestEvidence.document,
    opportunityEvidence.bytes,
    opportunityEvidence.document,
    detectorRoot,
  );
  const detectorCommit = validateCommitment(
    commitmentEvidence.document,
    commitmentEvidence.bytes,
    arm,
    detectorRoot,
    bindingEvidence.bytes,
    required(options, 'commitment_git_repo'),
    required(options, 'commitment_git_commit'),
    required(options, 'commitment_git_path'),
  );
  const repositories = validateFrozenInputs(manifestEvidence.document, matrix);
  if (arm === 'candidate') {
    const priorEvidence = readJson<ArmMeasurement>(required(options, 'prior_arm'));
    validateArmMeasurement(priorEvidence.document, 'baseline', commitmentEvidence.bytes);
    if (
      priorEvidence.document.detector_commit !== commitmentEvidence.document.baseline_commit ||
      priorEvidence.document.golden_manifest_sha256 !== manifestEvidence.document.manifest_sha256 ||
      priorEvidence.document.opportunity_manifest_sha256 !== opportunityEvidence.document.manifest_sha256 ||
      priorEvidence.document.bindings_byte_sha256 !== sha256(bindingEvidence.bytes)
    ) throw new Error('baseline arm does not match the committed paired inputs');
  }
  const measured: RepositoryMeasurement[] = [];
  for (const repository of repositories) {
    const snapshot = snapshotCejelLlmPackInput(repository.source_root);
    const result = collectCejelLlmPack(repository.source_root, snapshot.repoFiles);
    measured.push({
      repository_id: repository.repository_id,
      commit_sha: repository.commit_sha,
      git_tree_sha: repository.git_tree_sha,
      input_source_sha256: snapshot.sourceSha256,
      findings: result.findings,
      rule_states: result.ruleResults.map((rule) => ({ rule_id: rule.ruleId, state: rule.state })),
    });
  }
  const document: ArmMeasurement = {
    schema_version: '1.0.0',
    protocol_id: PR51_PAIRED_PROTOCOL_ID,
    status: 'completed_arm',
    arm,
    detector_commit: detectorCommit,
    golden_manifest_sha256: manifestEvidence.document.manifest_sha256,
    opportunity_manifest_sha256: opportunityEvidence.document.manifest_sha256,
    bindings_byte_sha256: sha256(bindingEvidence.bytes),
    pre_result_commitment_byte_sha256: sha256(commitmentEvidence.bytes),
    harness_byte_sha256: sha256(readFileSync(resolve(detectorRoot, bindingEvidence.document.harness.path))),
    execution_bundle_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    completed_at: new Date().toISOString(),
    repositories: measured,
  };
  const output = resolve(required(options, 'output'));
  if (existsSync(output)) throw new Error('arm output already exists');
  const descriptor = openSync(output, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'completed_arm',
    arm,
    repositories: measured.length,
    output,
  })}\n`);
}

function scorePair(options: Record<string, string | boolean>): void {
  const baselineEvidence = readJson<ArmMeasurement>(required(options, 'baseline'));
  const candidateEvidence = readJson<ArmMeasurement>(required(options, 'candidate'));
  const opportunityEvidence = readJson<OpportunityManifest>(required(options, 'opportunities'));
  const bindingEvidence = readJson<PreregistrationBindings>(required(options, 'bindings'));
  if (
    bindingEvidence.document?.schema_version !== '1.0.0' ||
    bindingEvidence.document.protocol_id !== PR51_PAIRED_PROTOCOL_ID ||
    bindingEvidence.document.status !== 'preregistered_before_measurement' ||
    sha256(readFileSync(fileURLToPath(import.meta.url))) !== bindingEvidence.document.harness.byte_sha256 ||
    canonicalHashWithout(opportunityEvidence.document, 'manifest_sha256') !==
      opportunityEvidence.document.manifest_sha256 ||
    baselineEvidence.document.arm !== 'baseline' ||
    candidateEvidence.document.arm !== 'candidate' ||
    baselineEvidence.document.status !== 'completed_arm' ||
    candidateEvidence.document.status !== 'completed_arm' ||
    baselineEvidence.document.pre_result_commitment_byte_sha256 !==
      candidateEvidence.document.pre_result_commitment_byte_sha256 ||
    baselineEvidence.document.golden_manifest_sha256 !== candidateEvidence.document.golden_manifest_sha256 ||
    baselineEvidence.document.bindings_byte_sha256 !== sha256(bindingEvidence.bytes) ||
    candidateEvidence.document.bindings_byte_sha256 !== sha256(bindingEvidence.bytes) ||
    sha256(opportunityEvidence.bytes) !== bindingEvidence.document.inputs.opportunity_manifest.byte_sha256 ||
    baselineEvidence.document.opportunity_manifest_sha256 !== opportunityEvidence.document.manifest_sha256 ||
    candidateEvidence.document.opportunity_manifest_sha256 !== opportunityEvidence.document.manifest_sha256
  ) throw new Error('paired arms do not share the same frozen inputs and commitment');
  if (baselineEvidence.document.repositories.length !== candidateEvidence.document.repositories.length) {
    throw new Error('paired arms contain different repository counts');
  }
  for (const [index, baselineRepository] of baselineEvidence.document.repositories.entries()) {
    const candidateRepository = candidateEvidence.document.repositories[index];
    if (
      !candidateRepository ||
      baselineRepository.repository_id !== candidateRepository.repository_id ||
      baselineRepository.commit_sha !== candidateRepository.commit_sha ||
      baselineRepository.git_tree_sha !== candidateRepository.git_tree_sha ||
      baselineRepository.input_source_sha256 !== candidateRepository.input_source_sha256
    ) throw new Error('paired arms do not contain identical frozen source inputs');
  }
  const baseline = scoreArm(baselineEvidence.document, opportunityEvidence.document.opportunities);
  const candidate = scoreArm(candidateEvidence.document, opportunityEvidence.document.opportunities);
  process.stdout.write(`${JSON.stringify({
    schema_version: '1.0.0',
    protocol_id: PR51_PAIRED_PROTOCOL_ID,
    status: 'paired_diagnostic_complete',
    baseline,
    candidate,
    delta: {
      findings: candidate.findings - baseline.findings,
      true_positives: candidate.true_positives - baseline.true_positives,
      false_positives: candidate.false_positives - baseline.false_positives,
      abstentions: candidate.abstentions - baseline.abstentions,
      recall: candidate.recall - baseline.recall,
    },
    disposition: decidePair(baseline, candidate),
    claim_boundary: 'Paired diagnostic on the retired v1.9 golden cohort; not a new calibration or release claim.',
  }, null, 2)}\n`);
}

function validatePreregistration(options: Record<string, string | boolean>): void {
  const detectorRoot = realpathSync(resolve(required(options, 'detector_root')));
  const manifestEvidence = readJson<FrozenManifest>(required(options, 'manifest'));
  const opportunityEvidence = readJson<OpportunityManifest>(required(options, 'opportunities'));
  const bindingEvidence = readJson<PreregistrationBindings>(required(options, 'bindings'));
  validateBindings(
    bindingEvidence.document,
    bindingEvidence.bytes,
    manifestEvidence.bytes,
    manifestEvidence.document,
    opportunityEvidence.bytes,
    opportunityEvidence.document,
    detectorRoot,
  );
  process.stdout.write(`${JSON.stringify({
    status: 'preregistration_bindings_valid',
    repositories: manifestEvidence.document.repositories.length,
    opportunities: opportunityEvidence.document.opportunities.length,
    present: opportunityEvidence.document.label_counts.present,
  })}\n`);
}

export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const mode = required(options, 'mode');
  if (mode === 'run-arm') return runArm(options);
  if (mode === 'score-pair') return scorePair(options);
  if (mode === 'validate-preregistration') return validatePreregistration(options);
  throw new Error('--mode must be validate-preregistration, run-arm, or score-pair');
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))
) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
