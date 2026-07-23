#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ENABLED_RULE_IDS,
  hashOpportunityDiscoveryCoverage,
  hashOpportunityManifest,
  hashSourceEvidenceIndex,
} from './compute-metrics.mjs';
import { canonicalize, hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha256Canonical = (document) => sha256(Buffer.from(canonicalize(document), 'utf8'));

function writeNew(path, document) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function findGitCheckouts(root) {
  const found = [];
  const visit = (directory, depth) => {
    if (depth > 4) return;
    if (existsSync(join(directory, '.git'))) {
      found.push(directory);
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(join(directory, entry.name), depth + 1);
    }
  };
  visit(resolve(root), 0);
  return found;
}

function checkoutIndex(root) {
  const result = new Map();
  for (const directory of findGitCheckouts(root)) {
    const remote = execFileSync('git', ['-C', directory, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const match = remote.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/i);
    if (match) {
      const repositoryId = match[1].toLowerCase();
      if (result.has(repositoryId)) throw new Error(`${repositoryId}: duplicate Git checkout`);
      result.set(repositoryId, directory);
    }
  }
  return result;
}

function gitBytes(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: null, maxBuffer: 100 * 1024 * 1024 });
}

function sourceEvidence(cohort, repository, path, checkout) {
  const content = gitBytes(checkout, ['cat-file', 'blob', `${repository.commit_sha}:${path}`]);
  const blobSha1 = execFileSync(
    'git', ['-C', checkout, 'rev-parse', `${repository.commit_sha}:${path}`], { encoding: 'utf8' },
  ).trim();
  const treeEntry = gitBytes(checkout, ['ls-tree', '-z', repository.commit_sha, '--', path]);
  const nulIndex = treeEntry.indexOf(0);
  const tabIndex = treeEntry.indexOf(9);
  const metadata = tabIndex > 0 ? treeEntry.subarray(0, tabIndex).toString('utf8').split(' ') : [];
  const returnedPath = tabIndex > 0 && nulIndex === treeEntry.length - 1
    ? treeEntry.subarray(tabIndex + 1, nulIndex).toString('utf8')
    : null;
  if (
    treeEntry.indexOf(0, nulIndex + 1) !== -1 || returnedPath !== path ||
    !['100644', '100755'].includes(metadata[0]) || metadata[1] !== 'blob' || metadata[2] !== blobSha1
  ) throw new Error(`${repository.repository_id}:${path}: opportunity source is not one regular Git blob`);
  const segments = path.split('/');
  let treeSha1 = repository.git_tree_sha;
  const treeProof = [];
  for (let index = 0; index < segments.length; index += 1) {
    treeProof.push({
      tree_sha1: treeSha1,
      tree_base64: gitBytes(checkout, ['cat-file', 'tree', treeSha1]).toString('base64'),
    });
    if (index < segments.length - 1) {
      treeSha1 = execFileSync(
        'git',
        ['-C', checkout, 'rev-parse', `${repository.commit_sha}:${segments.slice(0, index + 1).join('/')}`],
        { encoding: 'utf8' },
      ).trim();
    }
  }
  return {
    cohort,
    repository_id: repository.repository_id,
    commit_sha: repository.commit_sha,
    git_tree_sha: repository.git_tree_sha,
    path,
    blob_sha1: blobSha1,
    content_base64: content.toString('base64'),
    content_sha256: sha256(content),
    tree_proof: treeProof,
  };
}

const ALLOWED_LABELS = ['present', 'absent', 'ambiguous', 'not_applicable', 'insufficient_source'];

function validateFragment(fragment, expectedCohort, manifest, role) {
  if (
    fragment.cohort !== expectedCohort ||
    typeof fragment.reviewer_id !== 'string' || fragment.reviewer_id.trim().length < 3 ||
    !Array.isArray(fragment.repositories) || !Array.isArray(fragment.coverage)
  ) {
    throw new Error(`${expectedCohort}: blind fragment has the wrong cohort or no repositories`);
  }
  const expectedRepositories = new Map(
    manifest.repositories.map((repository) => [repository.repository_id, repository]),
  );
  const seenRepositories = new Set();
  for (const [index, repository] of fragment.repositories.entries()) {
    const expected = expectedRepositories.get(repository?.repository_id);
    if (
      !expected || repository.commit_sha !== expected.commit_sha ||
      seenRepositories.has(repository.repository_id) || !Array.isArray(repository.opportunities)
    ) throw new Error(`${expectedCohort}: ${role} repository ${index} is invalid or duplicated`);
    seenRepositories.add(repository.repository_id);
  }
  if (seenRepositories.size !== expectedRepositories.size) {
    throw new Error(`${expectedCohort}: ${role} fragment does not cover every frozen repository exactly once`);
  }
  const items = fragment.repositories.flatMap((repository) =>
    (repository.opportunities || []).map((opportunity) => ({
      ...opportunity,
      repository_id: repository.repository_id,
      commit_sha: repository.commit_sha,
    })),
  );
  const identities = new Map();
  for (const [index, item] of items.entries()) {
    const identity = opportunityIdentity(item);
    if (identities.has(identity)) {
      throw new Error(`${expectedCohort}: ${role} opportunity ${index} is duplicated`);
    }
    identities.set(identity, item);
  }
  const coverageRows = new Map();
  for (const [index, row] of fragment.coverage.entries()) {
    const expected = expectedRepositories.get(row?.repository_id);
    const key = `${row?.repository_id}:${row?.rule_id}`;
    if (
      !expected || row.commit_sha !== expected.commit_sha || !ENABLED_RULE_IDS.includes(row.rule_id) ||
      coverageRows.has(key) || !Array.isArray(row.declared_opportunity_identities)
    ) throw new Error(`${expectedCohort}: ${role} coverage row ${index} is invalid or duplicated`);
    const declared = row.declared_opportunity_identities.map((item) => opportunityIdentity(item)).sort();
    if (new Set(declared).size !== declared.length) {
      throw new Error(`${expectedCohort}: ${role} coverage row ${index} repeats an opportunity identity`);
    }
    const observed = [...identities.entries()]
      .filter(([, item]) => item.repository_id === row.repository_id && item.rule_id === row.rule_id)
      .map(([identity]) => identity)
      .sort();
    if (canonicalize(declared) !== canonicalize(observed)) {
      throw new Error(`${expectedCohort}: ${role} coverage row ${index} differs from its opportunities`);
    }
    coverageRows.set(key, row);
  }
  for (const repository of manifest.repositories) {
    for (const ruleId of ENABLED_RULE_IDS) {
      if (!coverageRows.has(`${repository.repository_id}:${ruleId}`)) {
        throw new Error(`${expectedCohort}: ${role} coverage omits ${repository.repository_id}:${ruleId}`);
      }
    }
  }
  if (coverageRows.size !== manifest.repositories.length * ENABLED_RULE_IDS.length) {
    throw new Error(`${expectedCohort}: ${role} coverage is outside the frozen repository/rule matrix`);
  }
  return { items, identities };
}

const opportunityIdentity = (item) => canonicalize({
  repository_id: item.repository_id,
  commit_sha: item.commit_sha,
  rule_id: item.rule_id,
  path: item.path,
  start_line: item.start_line,
  end_line: item.end_line,
});

function labelId(cohort, opportunityId, role) {
  const digest = sha256(Buffer.from(`${cohort}:${opportunityId}:${role}`, 'utf8')).slice(0, 32);
  const suffix = {
    primary_labeler: 'primary',
    independent_reviewer: 'independent',
    adjudicator: 'adjudicator',
  }[role];
  return `llm-label-${cohort}-${digest}-${suffix}`;
}

function makeLabel(cohort, opportunity, sourceSha, role, reviewerId, createdAt, review = {}) {
  const document = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    label_id: labelId(cohort, opportunity.opportunity_id, role),
    cohort,
    repository: {
      repository_id: opportunity.repository_id,
      commit_sha: opportunity.commit_sha,
    },
    rule: { catalogue_id: 'llm-rules-v1', rule_id: opportunity.rule_id, rule_version: '1.0.0' },
    opportunity_id: opportunity.opportunity_id,
    detector_finding_id: null,
    label: opportunity.label,
    evidence: [{
      kind: 'source_span', path_or_reference: opportunity.path,
      start_line: opportunity.start_line, end_line: opportunity.end_line,
      sha256: sourceSha, rationale: opportunity.rationale,
    }],
    review: {
      labeler_id: reviewerId,
      role,
      independent_of_rule_author: true,
      detector_output_visible: false,
      adjudication_status: review.status || 'not_required',
    },
    created_at: createdAt,
  };
  if (review.supersedesLabelIds) document.review.supersedes_label_ids = review.supersedesLabelIds;
  if (review.rationale) document.review.rationale = review.rationale;
  return document;
}

function validateOpportunityItem(item, cohort, role, index) {
  const segments = typeof item.path === 'string' ? item.path.split('/') : [];
  if (
    !ENABLED_RULE_IDS.includes(item.rule_id) || !ALLOWED_LABELS.includes(item.label) ||
    typeof item.path !== 'string' || item.path.length < 1 || item.path.startsWith('/') ||
    item.path.includes('\\') || segments.some((segment) => ['', '.', '..'].includes(segment)) ||
    !Number.isInteger(item.start_line) || !Number.isInteger(item.end_line) ||
    item.start_line < 1 || item.end_line < item.start_line ||
    typeof item.rationale !== 'string' || item.rationale.length < 20 ||
    !/^[a-f0-9]{64}$/.test(item.content_sha256 || '')
  ) throw new Error(`${cohort}: invalid ${role} opportunity ${index}`);
}

function validateAssemblyManifests(golden, untouched, expectedCohortSize) {
  const repositoryIds = new Set();
  for (const [cohort, manifest] of [['golden', golden], ['untouched', untouched]]) {
    if (
      manifest?.schema_version !== '1.0.0' || manifest.protocol_id !== 'cejel-llm-calibration-v1' ||
      manifest.cohort !== cohort || manifest.status !== 'frozen' ||
      manifest.detector_results_seen_before_freeze !== false ||
      hashManifest(manifest) !== manifest.manifest_sha256 ||
      !Array.isArray(manifest.repositories) || manifest.repositories.length !== expectedCohortSize
    ) throw new Error(`${cohort}: assembly requires the exact valid frozen cohort manifest`);
    for (const repository of manifest.repositories) {
      const normalizedId = String(repository.repository_id).toLowerCase();
      if (
        repositoryIds.has(normalizedId) || !/^[a-f0-9]{40}$/.test(repository.commit_sha || '') ||
        !/^[a-f0-9]{40}$/.test(repository.git_tree_sha || '') ||
        hashRepositoryEntry(repository) !== repository.entry_sha256
      ) throw new Error(`${cohort}: invalid, duplicate, or overlapping frozen repository`);
      repositoryIds.add(normalizedId);
    }
  }
}

export function assembleBlindEvidence(input) {
  validateAssemblyManifests(
    input.goldenManifest,
    input.untouchedManifest,
    input.expectedCohortSize ?? 24,
  );
  const frozenAtMs = Date.parse(input.frozenAt);
  const latestManifestFreeze = Math.max(
    Date.parse(input.goldenManifest.frozen_at),
    Date.parse(input.untouchedManifest.frozen_at),
  );
  if (
    Number.isNaN(frozenAtMs) || Number.isNaN(latestManifestFreeze) ||
    frozenAtMs < latestManifestFreeze || frozenAtMs > Date.now() + 60_000 ||
    typeof input.attestationReference !== 'string' || input.attestationReference.length < 8
  ) throw new Error('blind evidence freeze time or attestation reference is invalid');
  const manifests = new Map([
    ['golden', input.goldenManifest],
    ['untouched', input.untouchedManifest],
  ]);
  const checkouts = new Map([
    ['golden', checkoutIndex(input.goldenRoot)],
    ['untouched', checkoutIndex(input.untouchedRoot)],
  ]);
  const sourceFiles = new Map();
  const opportunities = [];
  const labels = [];
  const opportunityByIdentity = new Map();
  const primaryLabelByIdentity = new Map();
  const disagreements = [];
  for (const cohort of ['golden', 'untouched']) {
    const manifest = manifests.get(cohort);
    const repositories = new Map(manifest.repositories.map((repository) => [repository.repository_id, repository]));
    const primaryFragment = validateFragment(input.primary[cohort], cohort, manifest, 'primary');
    const independentFragment = validateFragment(input.independent[cohort], cohort, manifest, 'independent');
    const primary = primaryFragment.items.sort((left, right) =>
      opportunityIdentity(left).localeCompare(opportunityIdentity(right)));
    const independent = independentFragment.items;
    if (
      primaryFragment.identities.size !== independentFragment.identities.size ||
      [...primaryFragment.identities.keys()].some((identity) => !independentFragment.identities.has(identity))
    ) throw new Error(`${cohort}: independent review does not cover the exact primary opportunity inventory`);
    for (const [index, item] of primary.entries()) {
      validateOpportunityItem(item, cohort, 'primary', index);
      const repository = repositories.get(item.repository_id);
      const checkout = checkouts.get(cohort).get(item.repository_id.toLowerCase());
      if (
        !repository || repository.commit_sha !== item.commit_sha || !checkout ||
        !ENABLED_RULE_IDS.includes(item.rule_id)
      ) throw new Error(`${cohort}: invalid primary opportunity ${index}`);
      const actualCommit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      if (actualCommit !== repository.commit_sha) throw new Error(`${item.repository_id}: checkout moved`);
      const actualTree = execFileSync(
        'git', ['-C', checkout, 'rev-parse', `${repository.commit_sha}^{tree}`], { encoding: 'utf8' },
      ).trim();
      if (actualTree !== repository.git_tree_sha) throw new Error(`${item.repository_id}: frozen tree differs from Git`);
      const sourceKey = `${cohort}:${item.repository_id}:${item.path}`;
      if (!sourceFiles.has(sourceKey)) {
        sourceFiles.set(sourceKey, sourceEvidence(cohort, repository, item.path, checkout));
      }
      const source = sourceFiles.get(sourceKey);
      if (item.content_sha256 !== source.content_sha256) {
        throw new Error(`${sourceKey}: labeler whole-file digest differs from Git`);
      }
      let sourceText;
      try {
        sourceText = new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.from(source.content_base64, 'base64'),
        );
      } catch {
        throw new Error(`${sourceKey}: opportunity source is not UTF-8 text`);
      }
      const lineCount = sourceText.length === 0 ? 0 : sourceText.split('\n').length;
      if (item.end_line > lineCount) throw new Error(`${sourceKey}: label span exceeds whole-file bytes`);
      const opportunityId = `llm-opportunity-${cohort}-${sha256(
        Buffer.from(`${cohort}:${opportunityIdentity(item)}`, 'utf8'),
      ).slice(0, 32)}`;
      const opportunity = {
        opportunity_id: opportunityId,
        cohort,
        repository_id: item.repository_id,
        commit_sha: item.commit_sha,
        rule_id: item.rule_id,
        evidence_scope: {
          kind: 'source_span', path_or_reference: item.path,
          start_line: item.start_line, end_line: item.end_line,
          sha256: source.content_sha256, rationale: item.rationale,
        },
      };
      opportunities.push(opportunity);
      opportunityByIdentity.set(opportunityIdentity(item), { opportunity, primary: item });
      const primaryLabel = makeLabel(
        cohort, { ...item, opportunity_id: opportunityId }, source.content_sha256,
        'primary_labeler', input.primary[cohort].reviewer_id, input.frozenAt,
      );
      labels.push(primaryLabel);
      primaryLabelByIdentity.set(`${cohort}:${opportunityIdentity(item)}`, primaryLabel);
    }
    for (const [index, item] of independent.entries()) {
      validateOpportunityItem(item, cohort, 'independent', index);
      const matched = opportunityByIdentity.get(opportunityIdentity(item));
      if (!matched) throw new Error(`${cohort}: independent label ${index} has no exact primary opportunity`);
      const source = sourceFiles.get(`${cohort}:${item.repository_id}:${item.path}`);
      if (item.content_sha256 !== source.content_sha256) {
        throw new Error(`${cohort}: independent label ${index} whole-file digest differs from Git`);
      }
      const primaryLabel = primaryLabelByIdentity.get(`${cohort}:${opportunityIdentity(item)}`);
      const disagreement = item.label !== matched.primary.label;
      if (disagreement) primaryLabel.review.adjudication_status = 'pending';
      const independentLabel = makeLabel(
        cohort, { ...item, opportunity_id: matched.opportunity.opportunity_id }, source.content_sha256,
        'independent_reviewer', input.independent[cohort].reviewer_id, input.frozenAt,
        { status: disagreement ? 'pending' : 'not_required' },
      );
      labels.push(independentLabel);
      if (disagreement) disagreements.push({
        cohort,
        identity: opportunityIdentity(item),
        opportunity: { ...matched.primary, opportunity_id: matched.opportunity.opportunity_id },
        sourceSha: source.content_sha256,
        supersedesLabelIds: [primaryLabel.label_id, independentLabel.label_id].sort(),
      });
    }
  }
  const reviewerIds = new Set([
    input.primary.golden.reviewer_id,
    input.primary.untouched.reviewer_id,
    input.independent.golden.reviewer_id,
    input.independent.untouched.reviewer_id,
  ]);
  const normalizedReviewerIds = new Set(
    [...reviewerIds].map((reviewerId) => reviewerId.trim().toLowerCase()),
  );
  if (
    reviewerIds.size !== 2 || normalizedReviewerIds.size !== 2 ||
    input.primary.golden.reviewer_id !== input.independent.untouched.reviewer_id ||
    input.primary.untouched.reviewer_id !== input.independent.golden.reviewer_id
  ) throw new Error('blind evidence must use exactly two cross-reviewing independent identities');
  const decisions = input.adjudication?.decisions || [];
  if (disagreements.length > 0 && !input.adjudication) {
    throw new Error(`${disagreements.length} blind disagreement(s) require a distinct adjudication fragment`);
  }
  if (!Array.isArray(decisions) || decisions.length !== disagreements.length) {
    throw new Error('adjudication decisions must cover every and only blind disagreement');
  }
  if (disagreements.length > 0) {
    const adjudicatorId = input.adjudication.reviewer_id;
    if (
      typeof adjudicatorId !== 'string' || adjudicatorId.trim().length < 3 ||
      [...reviewerIds].some((reviewerId) => reviewerId.trim().toLowerCase() === adjudicatorId.trim().toLowerCase())
    ) throw new Error('blind disagreements require a distinct named adjudicator');
    const decisionMap = new Map();
    for (const [index, decision] of decisions.entries()) {
      const key = `${decision?.cohort}:${opportunityIdentity(decision || {})}`;
      if (
        !['golden', 'untouched'].includes(decision?.cohort) || !ALLOWED_LABELS.includes(decision.label) ||
        typeof decision.rationale !== 'string' || decision.rationale.length < 20 || decisionMap.has(key)
      ) throw new Error(`invalid or duplicate adjudication decision ${index}`);
      decisionMap.set(key, decision);
    }
    for (const disagreement of disagreements) {
      const decision = decisionMap.get(`${disagreement.cohort}:${disagreement.identity}`);
      if (!decision) throw new Error('adjudication decisions omit a blind disagreement');
      labels.push(makeLabel(
        disagreement.cohort,
        { ...disagreement.opportunity, label: decision.label, rationale: decision.rationale },
        disagreement.sourceSha,
        'adjudicator',
        adjudicatorId,
        input.frozenAt,
        {
          status: 'adjudicated',
          supersedesLabelIds: disagreement.supersedesLabelIds,
          rationale: decision.rationale,
        },
      ));
    }
  }
  const sourceIndexWithoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen_before_detector_results',
    hash_contract: 'rfc8785-sha256-v1; index excludes only index_sha256; file content_sha256 hashes decoded whole-file bytes',
    cohort_bindings: {
      golden_manifest_sha256: input.goldenManifest.manifest_sha256,
      untouched_manifest_sha256: input.untouchedManifest.manifest_sha256,
    },
    files: [...sourceFiles.values()].sort((left, right) =>
      `${left.cohort}:${left.repository_id}:${left.path}`.localeCompare(
        `${right.cohort}:${right.repository_id}:${right.path}`,
      )),
    attestation: { method: 'internal_witness', reference: input.attestationReference },
  };
  const sourceEvidenceIndex = {
    ...sourceIndexWithoutHash,
    index_sha256: hashSourceEvidenceIndex(sourceIndexWithoutHash),
  };
  const labelWrappers = labels
    .map((document) => ({ document_sha256: sha256Canonical(document), document }))
    .sort((left, right) => left.document.label_id.localeCompare(right.document.label_id));
  const opportunityWithoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1', status: 'frozen',
    frozen_at: input.frozenAt, frozen_before_detector_results: true,
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; manifest excludes only manifest_sha256',
    cohort_bindings: sourceIndexWithoutHash.cohort_bindings,
    opportunities: opportunities.sort((left, right) => left.opportunity_id.localeCompare(right.opportunity_id)),
    blind_label_bindings: labelWrappers.map(({ document_sha256, document }) => ({
      label_id: document.label_id, document_sha256, role: document.review.role,
    })),
    attestation: { method: 'internal_witness', reference: input.attestationReference },
  };
  const opportunityManifest = {
    ...opportunityWithoutHash,
    manifest_sha256: hashOpportunityManifest(opportunityWithoutHash),
  };
  const coverage = [];
  for (const [cohort, manifest] of manifests) {
    for (const repository of manifest.repositories) {
      for (const ruleId of ENABLED_RULE_IDS) {
        coverage.push({
          cohort,
          repository_id: repository.repository_id,
          commit_sha: repository.commit_sha,
          rule_id: ruleId,
          declared_opportunity_ids: opportunities.filter((item) =>
            item.cohort === cohort && item.repository_id === repository.repository_id &&
            item.rule_id === ruleId).map((item) => item.opportunity_id),
        });
      }
    }
  }
  const coverageWithoutHash = {
    schema_version: '1.0.0', protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen_before_detector_results', frozen_at: input.frozenAt,
    detector_results_seen_before_freeze: false, review_method: 'two_independent_ai',
    blind_reviewers: [...reviewerIds].sort(),
    bindings: {
      ...sourceIndexWithoutHash.cohort_bindings,
      source_evidence_index_sha256: sourceEvidenceIndex.index_sha256,
      opportunity_manifest_sha256: opportunityManifest.manifest_sha256,
    },
    coverage,
  };
  const opportunityDiscoveryCoverage = {
    ...coverageWithoutHash,
    record_sha256: hashOpportunityDiscoveryCoverage(coverageWithoutHash),
  };
  return { sourceEvidenceIndex, opportunityManifest, opportunityDiscoveryCoverage, labelWrappers };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '').replaceAll('-', '_');
    const value = argv[index + 1];
    if (!key || !value) throw new Error('every assembly option requires a value');
    options[key] = value;
  }
  return options;
}

export function main(argv) {
  const options = parseArgs(argv);
  for (const key of [
    'golden_manifest', 'untouched_manifest', 'golden_root', 'untouched_root',
    'primary_golden', 'primary_untouched', 'independent_golden', 'independent_untouched',
    'frozen_at', 'attestation_reference', 'private_output_root',
  ]) if (!options[key]) throw new Error(`--${key.replaceAll('_', '-')} is required`);
  const result = assembleBlindEvidence({
    goldenManifest: JSON.parse(readFileSync(resolve(options.golden_manifest), 'utf8')),
    untouchedManifest: JSON.parse(readFileSync(resolve(options.untouched_manifest), 'utf8')),
    goldenRoot: options.golden_root,
    untouchedRoot: options.untouched_root,
    primary: {
      golden: JSON.parse(readFileSync(resolve(options.primary_golden), 'utf8')),
      untouched: JSON.parse(readFileSync(resolve(options.primary_untouched), 'utf8')),
    },
    independent: {
      golden: JSON.parse(readFileSync(resolve(options.independent_golden), 'utf8')),
      untouched: JSON.parse(readFileSync(resolve(options.independent_untouched), 'utf8')),
    },
    adjudication: options.adjudication
      ? JSON.parse(readFileSync(resolve(options.adjudication), 'utf8'))
      : undefined,
    frozenAt: options.frozen_at,
    attestationReference: options.attestation_reference,
  });
  const outputRoot = resolve(options.private_output_root);
  if (existsSync(outputRoot)) {
    throw new Error('private evidence output root must not already exist');
  }
  mkdirSync(join(outputRoot, 'labels'), { recursive: true, mode: 0o700 });
  const realOutputRoot = realpathSync(outputRoot);
  try {
    const containingRepository = execFileSync(
      'git', ['-C', realOutputRoot, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (containingRepository) {
      throw new Error('private evidence output must be outside every Git working tree');
    }
  } catch (error) {
    if (error.message === 'private evidence output must be outside every Git working tree') throw error;
  }
  chmodSync(realOutputRoot, 0o700);
  chmodSync(join(realOutputRoot, 'labels'), 0o700);
  writeNew(join(realOutputRoot, 'source-evidence-index.json'), result.sourceEvidenceIndex);
  writeNew(join(realOutputRoot, 'opportunity-manifest.json'), result.opportunityManifest);
  writeNew(join(realOutputRoot, 'opportunity-discovery-coverage.json'), result.opportunityDiscoveryCoverage);
  for (const wrapper of result.labelWrappers) {
    writeNew(join(realOutputRoot, 'labels', `${wrapper.document.label_id}.json`), wrapper.document);
  }
  console.log(JSON.stringify({
    status: 'assembled_blind_pre_result_evidence',
    opportunities: result.opportunityManifest.opportunities.length,
    labels: result.labelWrappers.length,
    source_files: result.sourceEvidenceIndex.files.length,
    source_evidence_index_sha256: result.sourceEvidenceIndex.index_sha256,
    opportunity_manifest_sha256: result.opportunityManifest.manifest_sha256,
    opportunity_discovery_coverage_sha256: result.opportunityDiscoveryCoverage.record_sha256,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
