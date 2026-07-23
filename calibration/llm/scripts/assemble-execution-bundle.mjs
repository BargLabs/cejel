#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const sha256Canonical = (document) =>
  createHash('sha256').update(canonicalize(document), 'utf8').digest('hex');

function executionDirectories(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort();
}

export function assembleExecutionBundle(
  cohort,
  outputRoot,
  preResultCommitmentSha256,
  detectorFreezeSha256,
) {
  if (!['golden', 'untouched'].includes(cohort)) throw new Error('cohort must be golden or untouched');
  const executionReceipts = [];
  const llmReports = [];
  for (const directory of executionDirectories(outputRoot)) {
    const receipt = JSON.parse(readFileSync(join(directory, 'calibration-execution.json'), 'utf8'));
    const report = JSON.parse(readFileSync(join(directory, 'llm-report.json'), 'utf8'));
    if (receipt.cohort !== cohort || typeof receipt.repository_id !== 'string') {
      throw new Error(`${directory}: execution receipt has the wrong cohort or repository`);
    }
    executionReceipts.push({
      repository_id: receipt.repository_id,
      document_sha256: sha256Canonical(receipt),
    });
    llmReports.push({
      repository_id: receipt.repository_id,
      document_sha256: sha256Canonical(report),
    });
  }
  if (executionReceipts.length < 1) throw new Error('execution output contains no repositories');
  const sort = (items) => items.sort((left, right) => left.repository_id.localeCompare(right.repository_id));
  return {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    cohort,
    pre_result_commitment_sha256: preResultCommitmentSha256,
    detector_freeze_sha256: detectorFreezeSha256,
    execution_receipts: sort(executionReceipts),
    llm_reports: sort(llmReports),
  };
}

export function main(argv) {
  if (argv.length !== 5) {
    throw new Error(
      'usage: assemble-execution-bundle.mjs <cohort> <output-root> <pre-result-canonical-sha256> <detector-freeze-canonical-sha256> <output.json>',
    );
  }
  const [cohort, outputRoot, preResultSha, detectorFreezeSha, outputPath] = argv;
  if (!/^[a-f0-9]{64}$/.test(preResultSha) ||
    !(detectorFreezeSha === 'none' || /^[a-f0-9]{64}$/.test(detectorFreezeSha))) {
    throw new Error('pre-result and detector-freeze canonical SHA-256 values are required');
  }
  const document = assembleExecutionBundle(
    cohort,
    resolve(outputRoot),
    preResultSha,
    detectorFreezeSha === 'none' ? null : detectorFreezeSha,
  );
  let descriptor;
  try {
    descriptor = openSync(resolve(outputPath), 'wx', 0o644);
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
