import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalize } from './freeze-cohorts.mjs';

const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function validatePreResultCommitment(document) {
  const allowed = [
    'schema_version', 'protocol_id', 'status', 'created_at', 'detector_results_seen_before_commitment',
    'golden_manifest_sha256', 'untouched_manifest_sha256', 'opportunity_manifest_sha256',
    'blind_label_bindings',
  ];
  const unknown = Object.keys(document || {}).filter((key) => !allowed.includes(key));
  if (
    unknown.length > 0 || document?.schema_version !== '1.0.0' ||
    document?.protocol_id !== 'cejel-llm-calibration-v1' || document?.status !== 'frozen_pre_result' ||
    document?.detector_results_seen_before_commitment !== false ||
    typeof document.created_at !== 'string' || Number.isNaN(Date.parse(document.created_at)) ||
    !/^[a-f0-9]{64}$/.test(document.golden_manifest_sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(document.untouched_manifest_sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(document.opportunity_manifest_sha256 || '') ||
    !Array.isArray(document.blind_label_bindings) || document.blind_label_bindings.length < 2
  ) throw new Error('pre-result commitment is invalid');
  const ids = new Set();
  for (const binding of document.blind_label_bindings) {
    const bindingUnknown = Object.keys(binding || {}).filter((key) => !['label_id', 'document_sha256', 'role'].includes(key));
    if (
      bindingUnknown.length > 0 || !/^llm-label-[a-z0-9-]{8,80}$/.test(binding?.label_id || '') ||
      !/^[a-f0-9]{64}$/.test(binding?.document_sha256 || '') ||
      !['primary_labeler', 'independent_reviewer', 'adjudicator'].includes(binding?.role) ||
      ids.has(binding.label_id)
    ) throw new Error('pre-result commitment has an invalid or duplicate blind-label binding');
    ids.add(binding.label_id);
  }
  return document;
}

export async function verifyGitCommittedPreResult(input, commandRunner) {
  if (!/^[a-f0-9]{40}$/.test(input.gitCommit || '')) throw new Error('commitment Git commit must be a full SHA');
  if (!input.gitPath || input.gitPath.startsWith('/') || input.gitPath.split('/').includes('..')) {
    throw new Error('commitment Git path must be repository-relative');
  }
  const bytes = readFileSync(resolve(input.documentPath));
  const document = validatePreResultCommitment(JSON.parse(bytes.toString('utf8')));
  const committed = await commandRunner(
    'git',
    ['-C', resolve(input.gitRepo), 'show', `${input.gitCommit}:${input.gitPath}`],
    { preserveOutput: true },
  );
  const committedBytes = Buffer.from(committed, 'utf8');
  if (sha256Bytes(committedBytes) !== sha256Bytes(bytes)) {
    throw new Error('pre-result commitment bytes do not match the exact Git blob named by the commitment');
  }
  if (![document.golden_manifest_sha256, document.untouched_manifest_sha256].includes(input.manifestSha256)) {
    throw new Error('pre-result commitment does not bind the cohort manifest');
  }
  return {
    document,
    document_sha256: sha256Bytes(bytes),
    canonical_sha256: sha256Bytes(Buffer.from(canonicalize(document), 'utf8')),
    git_commit: input.gitCommit,
    git_path: input.gitPath,
  };
}
