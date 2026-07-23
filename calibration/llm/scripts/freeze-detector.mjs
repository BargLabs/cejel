#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalize,
  hashManifest,
  hashRepositoryEntry,
  validateReviewBindings,
} from './freeze-cohorts.mjs';

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const calibrationRoot = resolve(here, '..');

export const FROZEN_LLM_RULE_IDS = [
  'LLM-IOH-001',
  'LLM-VAL-001',
  'LLM-AGY-001',
  'LLM-AGY-002',
  'LLM-DAT-001',
  'LLM-PRV-001',
  'LLM-EVL-001',
  'LLM-EVL-002',
];

export const FROZEN_SUPPORT_MATRIX = {
  javascript_typescript: {
    status: 'fixture_backed_alpha',
    extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'],
    integration_indicators: [
      'OpenAI SDK',
      'Anthropic SDK',
      'Vercel AI SDK',
      'LangChain imports',
      'recognized model-call shapes',
    ],
    enabled_rule_ids: [...FROZEN_LLM_RULE_IDS],
  },
  python: {
    status: 'narrow_fixture_backed_alpha',
    extensions: ['.py'],
    integration_indicators: ['OpenAI official SDK', 'Anthropic official SDK'],
    enabled_rule_ids: ['LLM-IOH-001', 'LLM-AGY-002', 'LLM-DAT-001'],
  },
  limitations: [
    'Static local source-pattern analysis only; no target application or model execution.',
    'No whole-program data-flow, model-quality, factuality, or hallucination-rate claim.',
    'Action-governance and evaluation-hygiene checks require complete local JavaScript or TypeScript paths.',
  ],
};

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const sha256Canonical = (value) => sha256Bytes(Buffer.from(canonicalize(value), 'utf8'));

function unwrapBoundDocument(wrapper, scope) {
  if (!wrapper?.document || sha256Canonical(wrapper.document) !== wrapper.document_sha256) {
    throw new Error(`${scope} has an invalid canonical document binding`);
  }
  return wrapper.document;
}

export function hashDetectorFreezeRecord(record) {
  const { record_sha256: _excluded, ...hashable } = record;
  return createHash('sha256').update(canonicalize(hashable), 'utf8').digest('hex');
}

function validUtc(value) {
  return typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));
}

const LEDGER_KEYS = [
  'schema_version', 'protocol_id', 'status', 'detector_build_sha256',
  'golden_manifest_sha256', 'golden_opportunity_manifest_sha256', 'frozen_at', 'frozen_before_untouched',
  'golden_label_evidence_sha256', 'missed_defect_opportunity_ids',
  'reviewed_by', 'open_corrections', 'entries',
];

function labelEvidenceExactlyMatchesOpportunity(label, opportunity) {
  const scope = opportunity.evidence_scope;
  return Array.isArray(label.evidence) && label.evidence.some((item) =>
    item.kind === scope.kind &&
    item.path_or_reference === scope.path_or_reference &&
    item.sha256 === scope.sha256 &&
    item.start_line === scope.start_line &&
    item.end_line === scope.end_line
  );
}

function goldenFindingMatchesOpportunity(finding, opportunity) {
  const scope = opportunity.evidence_scope;
  return finding.finding.ruleId === opportunity.rule_id &&
    finding.repository_id === opportunity.repository_id &&
    finding.finding.evidence?.path === scope.path_or_reference &&
    (scope.start_line === undefined ||
      (finding.finding.evidence?.line >= scope.start_line &&
        finding.finding.evidence?.line <= scope.end_line));
}

export function validateGoldenLabelEvidence(
  wrappers,
  goldenManifest,
  goldenOpportunityEvidence,
  goldenExecutionEvidence,
) {
  if (!Array.isArray(wrappers) || wrappers.length < 1) {
    throw new Error('golden label evidence requires bound blind labels and finding reviews');
  }
  const opportunityBindings = new Map(
    (goldenOpportunityEvidence.manifest.blind_label_bindings || [])
      .map((binding) => [binding.label_id, binding]),
  );
  const repositories = new Map(
    goldenManifest.repositories.map((repository) => [repository.repository_id, repository]),
  );
  const labelsByOpportunity = new Map();
  const blindBindings = [];
  const findingReviewBindings = [];
  const labelIds = new Set();
  for (const [index, wrapper] of wrappers.entries()) {
    const label = unwrapBoundDocument(wrapper, `golden label evidence ${index}`);
    if (
      label?.schema_version !== '1.0.0' || label.protocol_id !== 'cejel-llm-calibration-v1' ||
      label.cohort !== 'golden' || typeof label.label_id !== 'string' || labelIds.has(label.label_id) ||
      !['primary_labeler', 'independent_reviewer', 'adjudicator', 'finding_reviewer']
        .includes(label.review?.role) ||
      !['present', 'absent', 'ambiguous', 'not_applicable', 'insufficient_source'].includes(label.label)
    ) throw new Error(`golden label evidence ${index} is invalid or duplicated`);
    labelIds.add(label.label_id);
    const opportunity = goldenOpportunityEvidence.opportunities.get(label.opportunity_id);
    const repository = repositories.get(label.repository?.repository_id);
    if (
      !opportunity || !repository || repository.commit_sha !== label.repository?.commit_sha ||
      opportunity.repository_id !== label.repository.repository_id ||
      opportunity.commit_sha !== label.repository.commit_sha ||
      opportunity.rule_id !== label.rule?.rule_id ||
      !labelEvidenceExactlyMatchesOpportunity(label, opportunity)
    ) throw new Error(`golden label evidence ${index} does not match its frozen opportunity`);
    const group = labelsByOpportunity.get(label.opportunity_id) || [];
    group.push(label);
    labelsByOpportunity.set(label.opportunity_id, group);
    if (label.review.role === 'finding_reviewer') {
      const finding = goldenExecutionEvidence.findings.get(label.detector_finding_id);
      if (
        !finding || !goldenFindingMatchesOpportunity(finding, opportunity) ||
        label.review.detector_output_visible !== true
      ) throw new Error(`golden finding review ${label.label_id} does not match an actual finding`);
      findingReviewBindings.push({
        label_id: label.label_id,
        document_sha256: wrapper.document_sha256,
        detector_finding_id: label.detector_finding_id,
        opportunity_id: label.opportunity_id,
      });
    } else {
      const binding = opportunityBindings.get(label.label_id);
      if (
        !binding || binding.document_sha256 !== wrapper.document_sha256 ||
        binding.role !== label.review.role || label.detector_finding_id != null ||
        label.review.detector_output_visible !== false
      ) throw new Error(`golden blind label ${label.label_id} is not pre-result committed`);
      blindBindings.push({
        label_id: label.label_id,
        document_sha256: wrapper.document_sha256,
        role: label.review.role,
      });
    }
  }

  const finalLabels = new Map();
  const matchedOpportunities = new Set();
  const matchedFindingIds = new Set();
  for (const opportunity of goldenOpportunityEvidence.opportunities.values()) {
    const labels = labelsByOpportunity.get(opportunity.opportunity_id) || [];
    const primary = labels.filter((label) => label.review.role === 'primary_labeler');
    const independent = labels.filter((label) => label.review.role === 'independent_reviewer');
    const adjudicators = labels.filter((label) => label.review.role === 'adjudicator');
    const findingReviews = labels.filter((label) => label.review.role === 'finding_reviewer');
    if (primary.length !== 1 || independent.length > 1 || adjudicators.length > 1 || findingReviews.length > 1) {
      throw new Error(`golden opportunity ${opportunity.opportunity_id} has incomplete or duplicate labels`);
    }
    const originals = [...primary, ...independent];
    let final = primary[0];
    if (adjudicators.length === 1) {
      const superseded = new Set(adjudicators[0].review.supersedes_label_ids || []);
      if (
        originals.length !== 2 || originals[0].label === originals[1].label ||
        superseded.size !== 2 || originals.some((label) => !superseded.has(label.label_id))
      ) throw new Error(`golden opportunity ${opportunity.opportunity_id} has invalid adjudication`);
      final = adjudicators[0];
    } else if (originals.length === 2 && originals[0].label !== originals[1].label) {
      throw new Error(`golden opportunity ${opportunity.opportunity_id} has an unadjudicated disagreement`);
    }
    if (final.label === 'ambiguous') {
      throw new Error(`golden opportunity ${opportunity.opportunity_id} remains ambiguous`);
    }
    finalLabels.set(opportunity.opportunity_id, final.label);
    if (findingReviews.length === 1) {
      const review = findingReviews[0];
      if (review.label !== final.label || matchedFindingIds.has(review.detector_finding_id)) {
        throw new Error(`golden opportunity ${opportunity.opportunity_id} has an invalid finding review`);
      }
      matchedFindingIds.add(review.detector_finding_id);
      matchedOpportunities.add(opportunity.opportunity_id);
    }
  }
  const missedOpportunityIds = [...finalLabels]
    .filter(([opportunityId, label]) => label === 'present' && !matchedOpportunities.has(opportunityId))
    .map(([opportunityId]) => opportunityId)
    .sort();
  if (matchedFindingIds.size !== goldenExecutionEvidence.findings.size) {
    throw new Error('every golden detector finding requires exactly one opportunity-bound finding review');
  }
  const bindingDocument = {
    blind_label_bindings: blindBindings.sort((left, right) => left.label_id.localeCompare(right.label_id)),
    finding_review_bindings: findingReviewBindings.sort((left, right) =>
      left.label_id.localeCompare(right.label_id)
    ),
  };
  return {
    document_sha256: sha256Canonical(bindingDocument),
    missedOpportunityIds,
    finalLabels,
  };
}

export function validateGoldenCorrectionLedger(
  document,
  expectedBuildSha256,
  expectedGoldenManifestSha256,
  goldenExecutionEvidence,
  goldenOpportunityEvidence,
  goldenLabelEvidence,
) {
  if (
    document?.schema_version !== '1.0.0' ||
    document?.protocol_id !== 'cejel-llm-calibration-v1'
  ) {
    throw new Error('golden correction ledger has an unsupported schema or protocol');
  }
  if (document.status !== 'frozen' || document.frozen_before_untouched !== true) {
    throw new Error('golden correction ledger must be frozen before untouched execution');
  }
  if (document.detector_build_sha256 !== expectedBuildSha256) {
    throw new Error('golden correction ledger is not bound to this detector build SHA-256');
  }
  const unknown = Object.keys(document).filter((key) => !LEDGER_KEYS.includes(key));
  if (unknown.length > 0) throw new Error(`golden correction ledger has unknown fields: ${unknown.join(', ')}`);
  if (!/^[a-f0-9]{64}$/.test(document.golden_manifest_sha256 || '')) {
    throw new Error('golden correction ledger lacks a frozen golden manifest SHA-256');
  }
  if (expectedGoldenManifestSha256 && document.golden_manifest_sha256 !== expectedGoldenManifestSha256) {
    throw new Error('golden correction ledger is not bound to the supplied golden manifest');
  }
  if (
    !/^[a-f0-9]{64}$/.test(document.golden_opportunity_manifest_sha256 || '') ||
    (goldenOpportunityEvidence &&
      document.golden_opportunity_manifest_sha256 !== goldenOpportunityEvidence.manifest.manifest_sha256)
  ) throw new Error('golden correction ledger is not bound to the frozen opportunity manifest');
  if (
    !/^[a-f0-9]{64}$/.test(document.golden_label_evidence_sha256 || '') ||
    !Array.isArray(document.missed_defect_opportunity_ids) ||
    new Set(document.missed_defect_opportunity_ids).size !== document.missed_defect_opportunity_ids.length ||
    document.missed_defect_opportunity_ids.some((id) => typeof id !== 'string' || id.length < 3)
  ) throw new Error('golden correction ledger lacks exact committed label/missed-defect bindings');
  if (
    goldenLabelEvidence &&
    (document.golden_label_evidence_sha256 !== goldenLabelEvidence.document_sha256 ||
      canonicalize([...document.missed_defect_opportunity_ids].sort()) !==
        canonicalize(goldenLabelEvidence.missedOpportunityIds))
  ) throw new Error('golden correction ledger does not match committed labels and derived missed defects');
  if (!validUtc(document.frozen_at)) {
    throw new Error('golden correction ledger frozen_at must be a UTC ISO-8601 timestamp');
  }
  if (!Array.isArray(document.reviewed_by) || document.reviewed_by.length !== 2) {
    throw new Error('golden correction ledger requires two reviewers');
  }
  if (new Set(document.reviewed_by.map((name) => String(name).trim().toLowerCase())).size !== 2) {
    throw new Error('golden correction ledger reviewers must be distinct');
  }
  if (!Array.isArray(document.entries)) {
    throw new Error('golden correction ledger entries must be an array');
  }
  const correctionIds = new Set();
  const missedCorrectionIds = new Set();
  for (const [index, entry] of document.entries.entries()) {
    const scope = `golden correction ledger entry ${index}`;
    const allowed = [
      'correction_id', 'status', 'finding_id', 'opportunity_id', 'rule_id', 'repository_id', 'commit_sha',
      'original_outcome', 'final_outcome', 'rationale', 'evidence', 'resolved_at',
    ];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${scope} must be an object`);
    const entryUnknown = Object.keys(entry).filter((key) => !allowed.includes(key));
    if (entryUnknown.length > 0) throw new Error(`${scope} has unknown fields: ${entryUnknown.join(', ')}`);
    if (!/^llm-correction-[a-z0-9-]{8,80}$/.test(entry.correction_id || '')) throw new Error(`${scope} correction_id is invalid`);
    if (correctionIds.has(entry.correction_id)) throw new Error(`${scope} correction_id is duplicated`);
    correctionIds.add(entry.correction_id);
    if (!['resolved', 'accepted_no_change'].includes(entry.status)) throw new Error(`${scope} status is not closed`);
    if (entry.finding_id !== null && !/^llm-finding-[a-f0-9]{64}$/.test(entry.finding_id || '')) throw new Error(`${scope} finding_id is invalid`);
    if (entry.opportunity_id !== null && typeof entry.opportunity_id !== 'string') throw new Error(`${scope} opportunity_id is invalid`);
    if (!FROZEN_LLM_RULE_IDS.includes(entry.rule_id)) throw new Error(`${scope} rule_id is invalid`);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.repository_id || '')) throw new Error(`${scope} repository_id is invalid`);
    if (!/^[a-f0-9]{40}$/.test(entry.commit_sha || '')) throw new Error(`${scope} commit_sha is invalid`);
    if (!['detector_finding', 'missed_defect', 'classification_error'].includes(entry.original_outcome)) throw new Error(`${scope} original_outcome is invalid`);
    if (!['true_positive', 'false_positive', 'false_negative', 'accepted_limitation'].includes(entry.final_outcome)) throw new Error(`${scope} final_outcome is invalid`);
    if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 20) throw new Error(`${scope} rationale is too short`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length < 1 || entry.evidence.some((item) =>
      !item || typeof item.reference !== 'string' || item.reference.length < 3 || !/^[a-f0-9]{64}$/.test(item.sha256 || '')
    )) throw new Error(`${scope} evidence is invalid`);
    if (!validUtc(entry.resolved_at)) throw new Error(`${scope} resolved_at is invalid`);
    if (!goldenExecutionEvidence) throw new Error(`${scope} requires golden execution evidence`);
    const repository = goldenExecutionEvidence.repositories.get(entry.repository_id);
    if (!repository || repository.commit_sha !== entry.commit_sha) {
      throw new Error(`${scope} does not match the frozen golden repository and commit`);
    }
    if (entry.original_outcome === 'missed_defect') {
      if (!goldenOpportunityEvidence) throw new Error(`${scope} missed_defect requires golden opportunity evidence`);
      if (entry.finding_id !== null || typeof entry.opportunity_id !== 'string') {
        throw new Error(`${scope} missed_defect requires a null finding and frozen opportunity`);
      }
      const opportunity = goldenOpportunityEvidence.opportunities.get(entry.opportunity_id);
      if (
        !opportunity || opportunity.repository_id !== entry.repository_id ||
        opportunity.commit_sha !== entry.commit_sha || opportunity.rule_id !== entry.rule_id
      ) throw new Error(`${scope} does not match a frozen golden opportunity`);
      const proofSha = sha256Canonical(opportunity.evidence_scope);
      if (!entry.evidence.some((item) =>
        item.reference === `opportunity:${entry.opportunity_id}` && item.sha256 === proofSha
      )) throw new Error(`${scope} is not bound to the frozen opportunity source proof`);
      if (!['false_negative', 'accepted_limitation'].includes(entry.final_outcome)) {
        throw new Error(`${scope} missed_defect must resolve as false_negative or accepted_limitation`);
      }
      if (missedCorrectionIds.has(entry.opportunity_id)) {
        throw new Error(`${scope} duplicates a missed-defect correction`);
      }
      missedCorrectionIds.add(entry.opportunity_id);
    } else {
      if (entry.opportunity_id !== null || !entry.finding_id) {
        throw new Error(`${scope} detector outcome requires a finding and null opportunity`);
      }
      const finding = goldenExecutionEvidence.findings.get(entry.finding_id);
      if (
        !finding || finding.repository_id !== entry.repository_id ||
        finding.finding.ruleId !== entry.rule_id
      ) throw new Error(`${scope} does not match an actual golden report finding and rule`);
      if (!entry.evidence.some((item) =>
        item.reference === `llm-report:${entry.finding_id}` && item.sha256 === finding.finding_sha256
      )) throw new Error(`${scope} is not bound to the actual golden report finding evidence`);
    }
  }
  if (
    canonicalize([...missedCorrectionIds].sort()) !==
    canonicalize([...document.missed_defect_opportunity_ids].sort())
  ) throw new Error('golden correction ledger omits or adds a derived missed-defect correction');
  if (document.open_corrections !== 0) {
    throw new Error('golden correction ledger must have zero open corrections');
  }
  return document;
}

export function validateFrozenGoldenManifest(manifest) {
  if (
    manifest?.schema_version !== '1.0.0' || manifest?.protocol_id !== 'cejel-llm-calibration-v1' ||
    manifest?.cohort !== 'golden' || manifest?.status !== 'frozen' ||
    !Array.isArray(manifest.repositories) || manifest.repositories.length < 1 ||
    hashManifest(manifest) !== manifest.manifest_sha256 ||
    !validateReviewBindings(manifest.review_bindings)
  ) throw new Error('--golden-manifest must be a valid frozen golden manifest');
  for (const repository of manifest.repositories) {
    if (
      !/^[a-f0-9]{40}$/.test(repository.commit_sha || '') ||
      !/^[a-f0-9]{40}$/.test(repository.git_tree_sha || '') ||
      hashRepositoryEntry(repository) !== repository.entry_sha256
    ) throw new Error('--golden-manifest contains an invalid immutable repository entry');
  }
  return manifest;
}

export function validateGoldenOpportunityEvidence(manifest, goldenManifest) {
  const { manifest_sha256: _hash, attestation: _attestation, ...hashable } = manifest || {};
  if (
    manifest?.schema_version !== '1.0.0' || manifest?.protocol_id !== 'cejel-llm-calibration-v1' ||
    manifest?.status !== 'frozen' || manifest?.frozen_before_detector_results !== true ||
    manifest?.detector_results_seen_before_freeze !== false ||
    manifest?.cohort_bindings?.golden_manifest_sha256 !== goldenManifest.manifest_sha256 ||
    sha256Canonical(hashable) !== manifest.manifest_sha256 || !Array.isArray(manifest.opportunities)
  ) throw new Error('golden opportunity manifest is invalid or not pre-result bound');
  const opportunities = new Map();
  const evidenceKinds = new Map();
  const nonSourceScopes = new Set();
  const sourceScopes = [];
  for (const opportunity of manifest.opportunities.filter((item) => item.cohort === 'golden')) {
    if (opportunities.has(opportunity.opportunity_id)) throw new Error('duplicate golden opportunity');
    const repository = goldenManifest.repositories.find((item) => item.repository_id === opportunity.repository_id);
    if (
      !repository || repository.commit_sha !== opportunity.commit_sha ||
      !FROZEN_LLM_RULE_IDS.includes(opportunity.rule_id) ||
      !/^[a-f0-9]{64}$/.test(opportunity.evidence_scope?.sha256 || '')
    ) throw new Error('golden opportunity does not match the frozen golden cohort');
    const evidenceIdentity = canonicalize({
      repository_id: opportunity.repository_id,
      commit_sha: opportunity.commit_sha,
      rule_id: opportunity.rule_id,
      path_or_reference: opportunity.evidence_scope?.path_or_reference,
    });
    const priorKind = evidenceKinds.get(evidenceIdentity);
    if (priorKind && priorKind !== opportunity.evidence_scope?.kind) {
      throw new Error('golden opportunity reuses an evidence identity with another scope kind');
    }
    evidenceKinds.set(evidenceIdentity, opportunity.evidence_scope?.kind);
    if (opportunity.evidence_scope?.kind === 'source_span') {
      const startLine = opportunity.evidence_scope.start_line;
      const endLine = opportunity.evidence_scope.end_line;
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine < startLine) {
        throw new Error('golden source opportunity has invalid line bounds');
      }
      if (sourceScopes.some((prior) =>
        prior.identity === evidenceIdentity && prior.startLine <= endLine && startLine <= prior.endLine
      )) throw new Error('golden source opportunities overlap for the same rule and path');
      sourceScopes.push({ identity: evidenceIdentity, startLine, endLine });
    } else {
      if (nonSourceScopes.has(evidenceIdentity)) {
        throw new Error('golden non-source opportunity is duplicated for the same rule and reference');
      }
      nonSourceScopes.add(evidenceIdentity);
    }
    opportunities.set(opportunity.opportunity_id, opportunity);
  }
  if (opportunities.size < 1) throw new Error('golden opportunity manifest contains no golden opportunities');
  return { manifest, opportunities };
}

export function validateGoldenExecutionEvidence(document, goldenManifest, expectedBuildSha256) {
  if (
    document?.schema_version !== '1.0.0' || document?.protocol_id !== 'cejel-llm-calibration-v1' ||
    document?.cohort !== 'golden' || document?.golden_manifest_sha256 !== goldenManifest.manifest_sha256 ||
    document?.detector_build_sha256 !== expectedBuildSha256 || !Array.isArray(document.executions)
  ) throw new Error('golden execution evidence index is invalid or bound to another build/manifest');
  const repositories = new Map(goldenManifest.repositories.map((repository) => [repository.repository_id, repository]));
  const seen = new Set();
  const findings = new Map();
  for (const [index, execution] of document.executions.entries()) {
    const receipt = unwrapBoundDocument(execution.receipt, `golden execution ${index} receipt`);
    const report = unwrapBoundDocument(execution.llm_report, `golden execution ${index} report`);
    const repository = repositories.get(execution.repository_id);
    if (!repository || seen.has(execution.repository_id)) {
      throw new Error(`golden execution ${index} repository is absent or duplicated`);
    }
    seen.add(execution.repository_id);
    if (
      receipt.cohort !== 'golden' || receipt.repository_id !== execution.repository_id ||
      receipt.commit_sha !== repository.commit_sha || receipt.git_tree_sha !== repository.git_tree_sha ||
      receipt.manifest_sha256 !== goldenManifest.manifest_sha256 ||
      receipt.detector_build_sha256 !== expectedBuildSha256 ||
      receipt.llm_report_canonical_sha256 !== sha256Canonical(report) ||
      !Array.isArray(receipt.finding_ids) || !Array.isArray(report?.result?.findings)
    ) throw new Error(`golden execution ${index} receipt/report does not match frozen evidence`);
    const findingIds = report.result.findings.map((finding, findingIndex) =>
      `llm-finding-${sha256Canonical({ repository_id: execution.repository_id, index: findingIndex, finding })}`
    );
    if (canonicalize(findingIds) !== canonicalize(receipt.finding_ids)) {
      throw new Error(`golden execution ${index} finding IDs do not match the report`);
    }
    report.result.findings.forEach((finding, findingIndex) => {
      const findingId = findingIds[findingIndex];
      if (findings.has(findingId)) throw new Error(`duplicate golden finding ID: ${findingId}`);
      findings.set(findingId, {
        repository_id: execution.repository_id,
        finding,
        finding_sha256: sha256Canonical(finding),
      });
    });
  }
  if (seen.size !== repositories.size) {
    throw new Error('golden execution evidence does not cover every frozen golden repository');
  }
  return { document, repositories, findings };
}

export function createDetectorFreezeRecord(input) {
  if (!/^[a-f0-9]{40}$/.test(input.gitCommit || '')) {
    throw new Error('detector Git commit must be a full 40-character SHA');
  }
  if (!/^[a-f0-9]{64}$/.test(input.buildSha256 || '')) {
    throw new Error('detector build SHA-256 is invalid');
  }
  if (!validUtc(input.frozenAt)) throw new Error('detector frozen_at must be UTC ISO-8601');
  if (!input.networkIsolation?.confirmed || input.networkIsolation.argvPrefix?.length < 1) {
    throw new Error('detector freeze requires an explicitly confirmed no-egress argv prefix');
  }
  if (!input.networkIsolation.mode || !input.networkIsolation.evidenceReference) {
    throw new Error('detector freeze requires network-isolation mode and evidence reference');
  }

  const withoutHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    status: 'detector_frozen_before_untouched',
    frozen_at: input.frozenAt,
    detector: {
      git_commit: input.gitCommit,
      build_sha256: input.buildSha256,
      artifact_name: input.artifactName,
      runtime: input.runtime,
    },
    execution: {
      command_template: [
        '{network_isolation_argv_prefix...}',
        '{cejel_binary}',
        'scan',
        '{source}',
        '--out',
        '{output}',
        '--pack',
        'llm',
        '--quiet',
      ],
      network_isolation: {
        mode: input.networkIsolation.mode,
        argv_prefix: input.networkIsolation.argvPrefix,
        evidence_reference: input.networkIsolation.evidenceReference,
        explicitly_confirmed: true,
      },
    },
    rule_ids: [...FROZEN_LLM_RULE_IDS],
    support_matrix: FROZEN_SUPPORT_MATRIX,
    golden_correction_ledger: {
      sha256: input.ledgerSha256,
      golden_manifest_sha256: input.ledger.golden_manifest_sha256,
      golden_opportunity_manifest_sha256: input.ledger.golden_opportunity_manifest_sha256,
      golden_label_evidence_sha256: input.ledger.golden_label_evidence_sha256,
      missed_defects: input.ledger.missed_defect_opportunity_ids.length,
      status: 'frozen',
      entries: input.ledger.entries.length,
      open_corrections: 0,
      frozen_at: input.ledger.frozen_at,
    },
    golden_execution_evidence: {
      sha256: input.goldenExecutionEvidenceSha256,
      executions: input.goldenExecutionEvidence.document.executions.length,
      findings: input.goldenExecutionEvidence.findings.size,
      golden_manifest_sha256: input.ledger.golden_manifest_sha256,
      detector_build_sha256: input.buildSha256,
    },
    untouched_results_seen_before_freeze: false,
  };
  return { ...withoutHash, record_sha256: hashDetectorFreezeRecord(withoutHash) };
}

export function validateDetectorFreezeRecord(record) {
  if (
    record?.schema_version !== '1.0.0' ||
    record?.protocol_id !== 'cejel-llm-calibration-v1' ||
    record?.status !== 'detector_frozen_before_untouched'
  ) {
    throw new Error('invalid or non-frozen detector-freeze record');
  }
  if (
    !/^[a-f0-9]{64}$/.test(record.golden_execution_evidence?.sha256 || '') ||
    record.golden_execution_evidence?.golden_manifest_sha256 !== record.golden_correction_ledger?.golden_manifest_sha256 ||
    record.golden_execution_evidence?.detector_build_sha256 !== record.detector?.build_sha256 ||
    !Number.isInteger(record.golden_execution_evidence?.executions) ||
    !Number.isInteger(record.golden_execution_evidence?.findings)
  ) throw new Error('detector freeze lacks bound golden execution evidence');
  if (!validUtc(record.frozen_at) || record.untouched_results_seen_before_freeze !== false) {
    throw new Error('detector freeze does not preserve the untouched boundary');
  }
  if (!/^[a-f0-9]{40}$/.test(record.detector?.git_commit || '')) {
    throw new Error('detector freeze has an invalid Git commit');
  }
  if (!/^[a-f0-9]{64}$/.test(record.detector?.build_sha256 || '')) {
    throw new Error('detector freeze has an invalid build SHA-256');
  }
  if (canonicalize(record.rule_ids) !== canonicalize(FROZEN_LLM_RULE_IDS)) {
    throw new Error('detector freeze rule IDs do not match the frozen v1 catalogue');
  }
  if (canonicalize(record.support_matrix) !== canonicalize(FROZEN_SUPPORT_MATRIX)) {
    throw new Error('detector freeze support matrix does not match the frozen alpha declaration');
  }
  if (
    canonicalize(record.execution?.command_template) !==
    canonicalize([
      '{network_isolation_argv_prefix...}',
      '{cejel_binary}',
      'scan',
      '{source}',
      '--out',
      '{output}',
      '--pack',
      'llm',
      '--quiet',
    ])
  ) {
    throw new Error('detector freeze command template is not the calibration command');
  }
  const isolation = record.execution?.network_isolation;
  if (
    isolation?.explicitly_confirmed !== true ||
    !Array.isArray(isolation.argv_prefix) ||
    isolation.argv_prefix.length < 1
  ) {
    throw new Error('detector freeze lacks confirmed no-egress execution');
  }
  if (
    record.golden_correction_ledger?.status !== 'frozen' ||
    record.golden_correction_ledger?.open_corrections !== 0 ||
    !/^[a-f0-9]{64}$/.test(record.golden_correction_ledger?.sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(record.golden_correction_ledger?.golden_manifest_sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(record.golden_correction_ledger?.golden_label_evidence_sha256 || '') ||
    !Number.isInteger(record.golden_correction_ledger?.missed_defects) ||
    record.golden_correction_ledger.missed_defects < 0
  ) {
    throw new Error('detector freeze lacks a closed golden correction ledger');
  }
  if (hashDetectorFreezeRecord(record) !== record.record_sha256) {
    throw new Error('detector-freeze record SHA-256 does not match its contents');
  }
  return record;
}

function parseArgs(argv) {
  const options = {
    isolationArgs: [],
    goldenLabelRecords: [],
    confirmNetworkIsolation: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--network-isolation-arg=')) {
      const value = argument.slice('--network-isolation-arg='.length);
      if (!value) throw new Error('--network-isolation-arg requires a value');
      options.isolationArgs.push(value);
      continue;
    }
    const take = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case '--detector-repo': options.detectorRepo = take(); break;
      case '--cejel': options.cejel = take(); break;
      case '--golden-correction-ledger': options.ledger = take(); break;
      case '--golden-manifest': options.goldenManifest = take(); break;
      case '--opportunity-manifest': options.opportunityManifest = take(); break;
      case '--golden-execution-evidence': options.goldenExecutionEvidence = take(); break;
      case '--golden-label-record': options.goldenLabelRecords.push(take()); break;
      case '--network-isolation-mode': options.isolationMode = take(); break;
      case '--network-isolation-command': options.isolationCommand = take(); break;
      case '--network-isolation-arg': options.isolationArgs.push(take()); break;
      case '--network-isolation-evidence': options.isolationEvidence = take(); break;
      case '--confirm-network-isolation': options.confirmNetworkIsolation = true; break;
      case '--frozen-at': options.frozenAt = take(); break;
      case '--output': options.output = take(); break;
      case '--help': options.help = true; break;
      default: throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node calibration/llm/scripts/freeze-detector.mjs \\
    --detector-repo . --cejel ./dist/index.js \\
    --golden-correction-ledger ./golden-corrections.json \\
    --golden-manifest calibration/llm/cohorts/golden-manifest.json \\
    --opportunity-manifest ./opportunity-manifest.json \\
    --golden-execution-evidence ./golden-execution-evidence.json \\
    --golden-label-record ./labels/golden-primary.json \\
    --golden-label-record ./labels/golden-finding-review.json \\
    --network-isolation-mode sandbox-no-egress \\
    --network-isolation-command /path/to/isolation-wrapper \\
    --network-isolation-evidence internal-witness:isolation-proof \\
    --confirm-network-isolation

The detector repository must be clean. The output is created exclusively and is never overwritten.
Repeat --golden-label-record for every committed golden blind label and finding review.
`;
}

async function run(command, args, options = {}) {
  const { stdout } = await execFile(command, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  });
  return stdout.trim();
}

function writeNewFile(path, document) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', 0o644);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export async function main(argv, commandRunner = run) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  for (const [flag, value] of [
    ['--cejel', options.cejel],
    ['--golden-correction-ledger', options.ledger],
    ['--golden-manifest', options.goldenManifest],
    ['--opportunity-manifest', options.opportunityManifest],
    ['--golden-execution-evidence', options.goldenExecutionEvidence],
    ['--network-isolation-mode', options.isolationMode],
    ['--network-isolation-command', options.isolationCommand],
    ['--network-isolation-evidence', options.isolationEvidence],
  ]) {
    if (!value) throw new Error(`${flag} is required`);
  }
  if (!options.confirmNetworkIsolation) {
    throw new Error('--confirm-network-isolation is required');
  }
  if (options.goldenLabelRecords.length < 1) {
    throw new Error('--golden-label-record is required at least once');
  }

  const detectorRepo = resolve(options.detectorRepo || '.');
  const cejel = realpathSync(resolve(options.cejel));
  const ledgerPath = resolve(options.ledger);
  const goldenManifest = validateFrozenGoldenManifest(
    JSON.parse(readFileSync(resolve(options.goldenManifest), 'utf8')),
  );
  const buildBytes = readFileSync(cejel);
  const buildSha256 = sha256Bytes(buildBytes);
  const goldenOpportunityEvidence = validateGoldenOpportunityEvidence(
    JSON.parse(readFileSync(resolve(options.opportunityManifest), 'utf8')),
    goldenManifest,
  );
  const goldenExecutionEvidenceBytes = readFileSync(resolve(options.goldenExecutionEvidence));
  const goldenExecutionEvidence = validateGoldenExecutionEvidence(
    JSON.parse(goldenExecutionEvidenceBytes.toString('utf8')),
    goldenManifest,
    buildSha256,
  );
  const goldenLabelEvidence = validateGoldenLabelEvidence(
    options.goldenLabelRecords.map((labelPath) => {
      const document = JSON.parse(readFileSync(resolve(labelPath), 'utf8'));
      return {
        document,
        document_sha256: sha256Canonical(document),
      };
    }),
    goldenManifest,
    goldenOpportunityEvidence,
    goldenExecutionEvidence,
  );
  const gitCommit = await commandRunner('git', ['-C', detectorRepo, 'rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(gitCommit)) throw new Error('detector repository HEAD is not a full commit');
  const gitStatus = await commandRunner('git', ['-C', detectorRepo, 'status', '--porcelain']);
  if (gitStatus.length > 0) throw new Error('detector repository must be clean before detector freeze');

  const ledgerBytes = readFileSync(ledgerPath);
  const ledger = validateGoldenCorrectionLedger(
    JSON.parse(ledgerBytes.toString('utf8')),
    buildSha256,
    goldenManifest.manifest_sha256,
    goldenExecutionEvidence,
    goldenOpportunityEvidence,
    goldenLabelEvidence,
  );
  const record = createDetectorFreezeRecord({
    gitCommit,
    buildSha256,
    artifactName: basename(cejel),
    frozenAt: options.frozenAt || new Date().toISOString(),
    runtime: {
      name: process.release.name,
      version: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    networkIsolation: {
      mode: options.isolationMode,
      argvPrefix: [realpathSync(resolve(options.isolationCommand)), ...options.isolationArgs],
      evidenceReference: options.isolationEvidence,
      confirmed: true,
    },
    ledger,
    ledgerSha256: sha256Bytes(ledgerBytes),
    goldenExecutionEvidence,
    goldenExecutionEvidenceSha256: sha256Bytes(goldenExecutionEvidenceBytes),
  });
  validateDetectorFreezeRecord(record);
  const output = resolve(
    options.output || resolve(calibrationRoot, 'detector-freeze.json'),
  );
  writeNewFile(output, record);
  console.log(JSON.stringify({
    status: record.status,
    output,
    detector_git_commit: gitCommit,
    detector_build_sha256: buildSha256,
    record_sha256: record.record_sha256,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
