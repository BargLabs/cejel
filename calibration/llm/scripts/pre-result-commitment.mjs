import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalize } from './freeze-cohorts.mjs';

const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const repositoryRelativePath = (value) => typeof value === 'string' && value.length > 0 &&
  !value.startsWith('/') && !value.includes('\\') && !/^[A-Za-z]:/.test(value) &&
  value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
const gitObjectId = (format, type, bytes) => createHash(format)
  .update(Buffer.from(`${type} ${bytes.length}\0`, 'utf8'))
  .update(bytes)
  .digest('hex');

function parseTree(bytes, objectFormat) {
  const oidBytes = objectFormat === 'sha1' ? 20 : 32;
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    const nul = bytes.indexOf(0, space + 1);
    if (space < 1 || nul < 0 || nul + 1 + oidBytes > bytes.length) throw new Error('Git tree object is malformed');
    entries.push({
      mode: bytes.subarray(offset, space).toString('ascii'),
      name: bytes.subarray(space + 1, nul).toString('utf8'),
      oid: bytes.subarray(nul + 1, nul + 1 + oidBytes).toString('hex'),
    });
    offset = nul + 1 + oidBytes;
  }
  return entries;
}

function verifyTreeChain(proof, gitPath) {
  const segments = gitPath.split('/');
  let expectedTreeOid = proof.root_tree_oid;
  if (!Array.isArray(proof.tree_chain) || proof.tree_chain.length !== segments.length) {
    throw new Error('pre-result Git tree proof does not cover the complete path');
  }
  for (let index = 0; index < proof.tree_chain.length; index += 1) {
    const item = proof.tree_chain[index];
    const bytes = Buffer.from(item.content_base64 || '', 'base64');
    if (item.oid !== expectedTreeOid || gitObjectId(proof.object_format, 'tree', bytes) !== item.oid) {
      throw new Error('pre-result Git tree object does not verify');
    }
    const entry = parseTree(bytes, proof.object_format).find((candidate) => candidate.name === segments[index]);
    if (!entry) throw new Error('pre-result Git tree proof omits a path component');
    if (index < segments.length - 1) {
      if (!['40000', '040000'].includes(entry.mode)) throw new Error('pre-result Git path component is not a tree');
      expectedTreeOid = entry.oid;
    } else if (entry.oid !== proof.blob_oid || entry.mode === '40000' || entry.mode === '040000') {
      throw new Error('pre-result Git tree proof does not terminate at the commitment blob');
    }
  }
}

function commitTimestamp(content) {
  const line = content.split('\n').find((candidate) => candidate.startsWith('committer '));
  const match = line?.match(/ ([0-9]+) [+-][0-9]{4}$/);
  const value = Number(match?.[1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Git commit object lacks a valid committer timestamp');
  return value;
}

export function validatePreResultCommitment(document) {
  const allowed = [
    'schema_version', 'protocol_id', 'status', 'created_at', 'detector_results_seen_before_commitment',
    'golden_manifest_sha256', 'untouched_manifest_sha256', 'opportunity_manifest_sha256',
    'opportunity_discovery_coverage_sha256', 'release_thresholds',
    'public_surface_policy', 'free_core_baseline_commit',
    'blind_label_bindings', 'public_document_inventory',
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
    !/^[a-f0-9]{64}$/.test(document.opportunity_discovery_coverage_sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(document.release_thresholds?.byte_sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(document.release_thresholds?.canonical_sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(document.public_surface_policy?.byte_sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(document.public_surface_policy?.canonical_sha256 || '') ||
    !/^[a-f0-9]{40}$/.test(document.free_core_baseline_commit || '') ||
    !Array.isArray(document.blind_label_bindings) || document.blind_label_bindings.length < 2 ||
    !Array.isArray(document.public_document_inventory) || document.public_document_inventory.length < 1
  ) throw new Error('pre-result commitment is invalid');
  if (
    !document.release_thresholds || typeof document.release_thresholds !== 'object' ||
    Object.keys(document.release_thresholds).some((key) =>
      !['byte_sha256', 'canonical_sha256'].includes(key))
  ) throw new Error('pre-result commitment has an invalid release-threshold binding');
  if (
    !document.public_surface_policy || typeof document.public_surface_policy !== 'object' ||
    Object.keys(document.public_surface_policy).some((key) =>
      !['byte_sha256', 'canonical_sha256'].includes(key)
    )
  ) throw new Error('pre-result commitment has an invalid public-surface policy binding');
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
  const paths = new Set();
  for (const item of document.public_document_inventory) {
    const itemUnknown = Object.keys(item || {}).filter((key) => !['path', 'content_sha256'].includes(key));
    if (itemUnknown.length > 0 ||
        !(repositoryRelativePath(item?.path) || /^https:\/\/[^\s]+$/.test(item?.path || '')) ||
        !/^[a-f0-9]{64}$/.test(item.content_sha256 || '') ||
        paths.has(item.path)) throw new Error('pre-result commitment has an invalid public-document inventory');
    paths.add(item.path);
  }
  return document;
}

export async function verifyGitCommittedPreResult(input, commandRunner) {
  if (!/^[a-f0-9]{40}$/.test(input.gitCommit || '')) throw new Error('commitment Git commit must be a full SHA');
  if (!input.gitPath || input.gitPath.startsWith('/') || input.gitPath.split('/').includes('..')) {
    throw new Error('commitment Git path must be repository-relative');
  }
  if (!repositoryRelativePath(input.gitPath)) throw new Error('commitment Git path must be repository-relative');
  const bytes = readFileSync(resolve(input.documentPath));
  const document = validatePreResultCommitment(JSON.parse(bytes.toString('utf8')));
  const repo = resolve(input.gitRepo);
  const objectFormat = (await commandRunner('git', ['-C', repo, 'rev-parse', '--show-object-format'])).trim();
  if (!['sha1', 'sha256'].includes(objectFormat)) throw new Error('unsupported Git object format');
  const resolvedCommit = (await commandRunner('git', ['-C', repo, 'rev-parse', `${input.gitCommit}^{commit}`])).trim();
  if (resolvedCommit !== input.gitCommit) throw new Error('commitment Git commit does not resolve exactly');
  const treeOid = (await commandRunner('git', ['-C', repo, 'rev-parse', `${input.gitCommit}^{tree}`])).trim();
  const blobOid = (await commandRunner('git', ['-C', repo, 'rev-parse', `${input.gitCommit}:${input.gitPath}`])).trim();
  const commitContent = await commandRunner('git', ['-C', repo, 'cat-file', 'commit', input.gitCommit], { preserveOutput: true });
  const committed = await commandRunner(
    'git',
    ['-C', repo, 'cat-file', 'blob', blobOid],
    { preserveOutput: true },
  );
  const committedBytes = Buffer.from(committed, 'utf8');
  const treeChain = [];
  let currentTreeOid = treeOid;
  for (const [index, segment] of input.gitPath.split('/').entries()) {
    const raw = await commandRunner(
      'git', ['-C', repo, 'cat-file', 'tree', currentTreeOid], { preserveBuffer: true },
    );
    const treeBytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'binary');
    treeChain.push({ oid: currentTreeOid, content_base64: treeBytes.toString('base64') });
    const entry = parseTree(treeBytes, objectFormat).find((candidate) => candidate.name === segment);
    if (!entry) throw new Error('commitment Git path is absent from its tree object');
    if (index < input.gitPath.split('/').length - 1) {
      if (!['40000', '040000'].includes(entry.mode)) throw new Error('commitment Git path component is not a tree');
      currentTreeOid = entry.oid;
    } else if (entry.oid !== blobOid) {
      throw new Error('commitment Git tree chain does not terminate at the resolved blob');
    }
  }
  if (sha256Bytes(committedBytes) !== sha256Bytes(bytes)) {
    throw new Error('pre-result commitment bytes do not match the exact Git blob named by the commitment');
  }
  if (![document.golden_manifest_sha256, document.untouched_manifest_sha256].includes(input.manifestSha256)) {
    throw new Error('pre-result commitment does not bind the cohort manifest');
  }
  const commitBytes = Buffer.from(commitContent, 'utf8');
  if (gitObjectId(objectFormat, 'commit', commitBytes) !== input.gitCommit) {
    throw new Error('Git commit object bytes do not match the requested commit');
  }
  if (!commitContent.split('\n').includes(`tree ${treeOid}`)) {
    throw new Error('Git commit object does not bind the resolved root tree');
  }
  if (gitObjectId(objectFormat, 'blob', committedBytes) !== blobOid) {
    throw new Error('Git blob bytes do not match the resolved blob object');
  }
  const committedAtUnix = Number((await commandRunner(
    'git', ['-C', repo, 'show', '-s', '--format=%ct', input.gitCommit],
  )).trim());
  if (committedAtUnix !== commitTimestamp(commitContent) || Date.parse(document.created_at) > committedAtUnix * 1000) {
    throw new Error('pre-result commitment document chronology exceeds its Git commit');
  }
  return {
    document,
    document_sha256: sha256Bytes(bytes),
    canonical_sha256: sha256Bytes(Buffer.from(canonicalize(document), 'utf8')),
    git_commit: input.gitCommit,
    git_path: input.gitPath,
    git_proof: {
      object_format: objectFormat,
      commit_oid: input.gitCommit,
      root_tree_oid: treeOid,
      blob_oid: blobOid,
      commit_content_base64: commitBytes.toString('base64'),
      blob_content_base64: committedBytes.toString('base64'),
      committed_at_unix: committedAtUnix,
      git_path: input.gitPath,
      tree_chain: treeChain,
    },
  };
}

export function validateGitCommitmentProof(proof, expectedDocument, expectedRawSha256, expectedCommit, expectedPath, createdAt) {
  if (!proof || !['sha1', 'sha256'].includes(proof.object_format) || proof.commit_oid !== expectedCommit ||
      !/^[a-f0-9]{40,64}$/.test(proof.root_tree_oid || '') || !/^[a-f0-9]{40,64}$/.test(proof.blob_oid || '') ||
      typeof proof.commit_content_base64 !== 'string' || typeof proof.blob_content_base64 !== 'string' ||
      proof.git_path !== expectedPath || !repositoryRelativePath(expectedPath) ||
      !Number.isSafeInteger(proof.committed_at_unix)) throw new Error('pre-result Git object proof is invalid');
  const commitBytes = Buffer.from(proof.commit_content_base64, 'base64');
  const blobBytes = Buffer.from(proof.blob_content_base64, 'base64');
  let blobDocument;
  try {
    blobDocument = JSON.parse(blobBytes.toString('utf8'));
  } catch {
    throw new Error('pre-result Git blob is not valid JSON');
  }
  verifyTreeChain(proof, expectedPath);
  if (gitObjectId(proof.object_format, 'commit', commitBytes) !== proof.commit_oid ||
      gitObjectId(proof.object_format, 'blob', blobBytes) !== proof.blob_oid ||
      !commitBytes.toString('utf8').split('\n').includes(`tree ${proof.root_tree_oid}`) ||
      sha256Bytes(blobBytes) !== expectedRawSha256 ||
      canonicalize(blobDocument) !== canonicalize(expectedDocument) ||
      commitTimestamp(commitBytes.toString('utf8')) !== proof.committed_at_unix ||
      Date.parse(createdAt) > proof.committed_at_unix * 1000) {
    throw new Error('pre-result Git object proof does not verify');
  }
  return proof;
}
