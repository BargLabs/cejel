#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';
import { assembleDiscoveryIntegrity } from './assemble-discovery-integrity.mjs';
import { validatePreResultCommitment } from './pre-result-commitment.mjs';
import { verifyPublicSurfaces } from './verify-public-surfaces.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha256Canonical = (document) => sha256(Buffer.from(canonicalize(document), 'utf8'));

function readDocument(path) {
  const bytes = readFileSync(path);
  return { bytes, document: JSON.parse(bytes.toString('utf8')) };
}

function parseArgs(argv) {
  const options = { confirmNoDetectorResults: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--confirm-no-detector-results') {
      options.confirmNoDetectorResults = true;
      continue;
    }
    const value = argv[index + 1];
    if (!argument?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`${argument || 'argument'} requires a value`);
    }
    options[argument.slice(2).replaceAll('-', '_')] = value;
    index += 1;
  }
  return options;
}

function validatePrivateEvidence(privateRoot, opportunityManifest, discoveryCoverage, discoveryIntegrity) {
  const sourceIndex = readDocument(resolve(privateRoot, 'source-evidence-index.json')).document;
  const labelBindings = new Map(
    opportunityManifest.blind_label_bindings.map((binding) => [binding.label_id, binding]),
  );
  const observedLabels = new Set();
  for (const name of readdirSync(resolve(privateRoot, 'labels')).sort()) {
    if (!name.endsWith('.json')) throw new Error('private label directory contains a non-JSON file');
    const { document } = readDocument(resolve(privateRoot, 'labels', name));
    const binding = labelBindings.get(document.label_id);
    if (
      name !== `${document.label_id}.json` ||
      !binding ||
      binding.role !== document.review?.role ||
      binding.document_sha256 !== sha256Canonical(document) ||
      observedLabels.has(document.label_id)
    ) throw new Error('private blind label does not match its opportunity-manifest binding');
    observedLabels.add(document.label_id);
  }
  if (
    observedLabels.size !== labelBindings.size ||
    discoveryCoverage.bindings?.source_evidence_index_sha256 !== sourceIndex.index_sha256 ||
    discoveryCoverage.bindings?.opportunity_manifest_sha256 !== opportunityManifest.manifest_sha256
  ) throw new Error('private evidence is incomplete or its discovery bindings do not match');
  if (
    discoveryIntegrity?.status !== 'discovery_integrity_validated' ||
    discoveryIntegrity?.bindings?.opportunity_manifest_sha256 !== opportunityManifest.manifest_sha256 ||
    !/^[a-f0-9]{64}$/.test(discoveryIntegrity.record_sha256 || '')
  ) throw new Error('private discovery integrity record does not bind the frozen opportunity manifest');
}

export async function createPreResultCommitment(input) {
  const repositoryRoot = realpathSync(resolve(input.repositoryRoot));
  const privateRoot = realpathSync(resolve(input.privateEvidenceRoot));
  const privateRelative = relative(repositoryRoot, privateRoot);
  if (!privateRelative.startsWith('..') || privateRelative === '') {
    throw new Error('private evidence root must be outside the repository');
  }
  if (!input.confirmNoDetectorResults) {
    throw new Error('pre-result commitment requires --confirm-no-detector-results');
  }
  const createdAtMs = Date.parse(input.createdAt);
  if (Number.isNaN(createdAtMs) || createdAtMs > Date.now() + 60_000) {
    throw new Error('pre-result commitment created_at is invalid or in the future');
  }
  if (!/^[a-f0-9]{40}$/.test(input.freeCoreBaselineCommit || '')) {
    throw new Error('free-core baseline must be a full Git commit SHA');
  }
  execFileSync(
    'git',
    ['-C', repositoryRoot, 'merge-base', '--is-ancestor', input.freeCoreBaselineCommit, 'HEAD'],
    { stdio: 'ignore' },
  );
  const head = execFileSync(
    'git', ['-C', repositoryRoot, 'rev-parse', 'HEAD^{commit}'], { encoding: 'utf8' },
  ).trim();
  if (head === input.freeCoreBaselineCommit) {
    throw new Error('free-core baseline must precede the candidate commit');
  }

  const selectionPolicy =
    readDocument(resolve(repositoryRoot, 'calibration/llm/selection-policy.json')).document;
  const cycle = selectionPolicy.policy_id?.replace(/^llm-selection-/, '');
  if (!/^v1\.[0-9]+$/.test(cycle || '')) {
    throw new Error('current selection policy has an unsupported policy_id');
  }
  const goldenManifest = readDocument(
    resolve(repositoryRoot, `calibration/llm/cohorts/golden-manifest-${cycle}.json`),
  ).document;
  const untouchedManifest = readDocument(
    resolve(repositoryRoot, `calibration/llm/cohorts/untouched-manifest-${cycle}.json`),
  ).document;
  const opportunityManifest = readDocument(resolve(privateRoot, 'opportunity-manifest.json')).document;
  const discoveryCoverage =
    readDocument(resolve(privateRoot, 'opportunity-discovery-coverage.json')).document;
  const candidateLedger = readDocument(resolve(privateRoot, 'candidate-ledger.json')).document;
  const discoveryAudit = readDocument(resolve(privateRoot, 'discovery-audit.json')).document;
  const discoveryIntegrity =
    readDocument(resolve(privateRoot, 'discovery-integrity.json')).document;
  const discoveryContract = readDocument(
    resolve(repositoryRoot, `calibration/llm/discovery-anchor-contract-${cycle}.json`),
  ).document;
  if (
    opportunityManifest.cohort_bindings?.golden_manifest_sha256 !== goldenManifest.manifest_sha256 ||
    opportunityManifest.cohort_bindings?.untouched_manifest_sha256 !== untouchedManifest.manifest_sha256 ||
    discoveryCoverage.bindings?.golden_manifest_sha256 !== goldenManifest.manifest_sha256 ||
    discoveryCoverage.bindings?.untouched_manifest_sha256 !== untouchedManifest.manifest_sha256
  ) throw new Error('private evidence does not bind the current frozen cohort manifests');
  const recomputedIntegrity = assembleDiscoveryIntegrity({
    contract: discoveryContract,
    candidateLedger,
    discoveryAudit,
    opportunityManifest,
  });
  if (
    sha256Canonical(recomputedIntegrity) !== sha256Canonical(discoveryIntegrity) ||
    recomputedIntegrity.record_sha256 !== discoveryIntegrity.record_sha256
  ) throw new Error('private discovery integrity record does not rederive from the locked inputs');
  validatePrivateEvidence(privateRoot, opportunityManifest, discoveryCoverage, discoveryIntegrity);

  const thresholds = readDocument(resolve(repositoryRoot, 'calibration/llm/release-thresholds.json'));
  const publicPolicy =
    readDocument(resolve(repositoryRoot, 'calibration/llm/public-surface-policy.json'));
  const localInventory = publicPolicy.document.repository_paths.map((path) => ({
    path,
    content_sha256: sha256(readFileSync(resolve(repositoryRoot, path))),
  }));
  const verifiedSurfaces = await verifyPublicSurfaces(
    publicPolicy.document,
    localInventory,
    { repositoryRoot, fetchImpl: input.fetchImpl },
  );
  if (verifiedSurfaces.policy_document_sha256 !== sha256Canonical(publicPolicy.document)) {
    throw new Error('public-surface policy canonical hash does not verify');
  }

  const document = validatePreResultCommitment({
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen_pre_result',
    created_at: input.createdAt,
    detector_results_seen_before_commitment: false,
    golden_manifest_sha256: goldenManifest.manifest_sha256,
    untouched_manifest_sha256: untouchedManifest.manifest_sha256,
    opportunity_manifest_sha256: opportunityManifest.manifest_sha256,
    opportunity_discovery_coverage_sha256: discoveryCoverage.record_sha256,
    discovery_integrity_sha256: discoveryIntegrity.record_sha256,
    release_thresholds: {
      byte_sha256: sha256(thresholds.bytes),
      canonical_sha256: sha256Canonical(thresholds.document),
    },
    public_surface_policy: {
      byte_sha256: sha256(publicPolicy.bytes),
      canonical_sha256: sha256Canonical(publicPolicy.document),
    },
    free_core_baseline_commit: input.freeCoreBaselineCommit,
    public_document_inventory: [
      ...verifiedSurfaces.repository_paths,
      ...verifiedSurfaces.external_surfaces.map((surface) => ({
        path: surface.url,
        content_sha256: surface.content_sha256,
      })),
    ],
    blind_label_bindings: opportunityManifest.blind_label_bindings,
  });
  return document;
}

export async function main(argv) {
  const options = parseArgs(argv);
  for (const key of [
    'repository_root', 'private_evidence_root', 'free_core_baseline_commit', 'created_at', 'output',
  ]) if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  const document = await createPreResultCommitment({
    repositoryRoot: options.repository_root,
    privateEvidenceRoot: options.private_evidence_root,
    freeCoreBaselineCommit: options.free_core_baseline_commit,
    createdAt: options.created_at,
    confirmNoDetectorResults: options.confirmNoDetectorResults,
  });
  let descriptor;
  try {
    descriptor = openSync(resolve(options.output), 'wx', 0o644);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  console.log(JSON.stringify({
    status: 'created_pre_result_commitment',
    opportunity_manifest_sha256: document.opportunity_manifest_sha256,
    opportunity_discovery_coverage_sha256: document.opportunity_discovery_coverage_sha256,
    discovery_integrity_sha256: document.discovery_integrity_sha256,
    blind_label_bindings: document.blind_label_bindings.length,
    public_document_inventory: document.public_document_inventory.length,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
