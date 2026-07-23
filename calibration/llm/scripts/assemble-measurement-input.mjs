#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const sha256Canonical = (document) =>
  createHash('sha256').update(canonicalize(document), 'utf8').digest('hex');

function loadDocument(base, path) {
  const document = JSON.parse(readFileSync(resolve(base, path), 'utf8'));
  return { document_sha256: sha256Canonical(document), document };
}

function loadByteBoundDocument(base, path) {
  const bytes = readFileSync(resolve(base, path));
  const document = JSON.parse(bytes.toString('utf8'));
  return {
    byte_sha256: createHash('sha256').update(bytes).digest('hex'),
    document_sha256: sha256Canonical(document),
    document,
  };
}

export function assembleMeasurementInput(specification, baseDirectory) {
  const requiredPaths = [
    'golden_manifest',
    'untouched_manifest',
    'source_evidence_index',
    'opportunity_manifest',
    'opportunity_discovery_coverage',
    'release_thresholds',
    'pre_result_commitment',
    'trusted_execution_proof',
    'detector_freeze',
  ];
  for (const key of requiredPaths) {
    if (typeof specification[key] !== 'string') throw new Error(`${key} path is required`);
  }
  for (const key of ['execution_receipts', 'llm_reports', 'label_records']) {
    if (!Array.isArray(specification[key]) || specification[key].length < 1) {
      throw new Error(`${key} paths are required`);
    }
  }
  const checkPaths = specification.automatic_no_go_evidence;
  if (!checkPaths || Object.values(checkPaths).some((value) => typeof value !== 'string')) {
    throw new Error('automatic_no_go_evidence must contain evidence-record paths');
  }
  return {
    $schema: './schemas/measurement-input.schema.json',
    protocol_id: 'cejel-llm-calibration-v1',
    automatic_no_go_evidence: Object.fromEntries(
      Object.entries(checkPaths).map(([check, path]) => [check, loadDocument(baseDirectory, path)]),
    ),
    evidence: {
      golden_manifest: loadDocument(baseDirectory, specification.golden_manifest),
      untouched_manifest: loadDocument(baseDirectory, specification.untouched_manifest),
      source_evidence_index: loadDocument(baseDirectory, specification.source_evidence_index),
      opportunity_manifest: loadDocument(baseDirectory, specification.opportunity_manifest),
      opportunity_discovery_coverage: loadDocument(
        baseDirectory,
        specification.opportunity_discovery_coverage,
      ),
      release_thresholds: loadByteBoundDocument(baseDirectory, specification.release_thresholds),
      pre_result_commitment: loadDocument(baseDirectory, specification.pre_result_commitment),
      trusted_execution_proof: loadDocument(baseDirectory, specification.trusted_execution_proof),
      detector_freeze: loadDocument(baseDirectory, specification.detector_freeze),
      execution_receipts: specification.execution_receipts.map((path) => loadDocument(baseDirectory, path)),
      llm_reports: specification.llm_reports.map((entry) => ({
        cohort: entry.cohort,
        repository_id: entry.repository_id,
        ...loadDocument(baseDirectory, entry.path),
      })),
      label_records: specification.label_records.map((path) => loadDocument(baseDirectory, path)),
    },
  };
}

export function main(argv) {
  if (argv.length !== 2) {
    throw new Error('usage: assemble-measurement-input.mjs <evidence-paths.json> <output.json>');
  }
  const specificationPath = resolve(argv[0]);
  const output = resolve(argv[1]);
  const specification = JSON.parse(readFileSync(specificationPath, 'utf8'));
  const document = assembleMeasurementInput(specification, dirname(specificationPath));
  let descriptor;
  try {
    descriptor = openSync(output, 'wx', 0o644);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
