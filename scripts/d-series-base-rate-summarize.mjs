#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RULE_IDS = ['D1', 'D2', 'D3', 'D4', 'D5'];
const Z_95 = 1.959963984540054;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function wilson(successes, total) {
  if (total === 0) return null;
  const p = successes / total;
  const z2 = Z_95 ** 2;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin =
    (Z_95 / denominator) *
    Math.sqrt((p * (1 - p)) / total + z2 / (4 * total ** 2));
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function inventoryTotals(rows) {
  const keys = [
    'trackedPaths',
    'regularFiles',
    'deniedPath',
    'nonRegular',
    'missingOrStatError',
    'd1AnalyzedFiles',
    'd2ToD5AnalyzedFiles',
    'd1ExcludedExtension',
    'd2ToD5ExcludedExtension',
    'tooLargeSkipped',
    'analyzedOver512000Bytes',
    'unparseableSkipped',
  ];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      rows.reduce((sum, row) => sum + Number(row.inventory?.[key] ?? 0), 0),
    ]),
  );
}

function ruleOutcome(row, ruleId) {
  const rule = row.rules?.[ruleId];
  if (row.repositoryError) {
    return { successful: false, error: row.repositoryError };
  }
  if (!row.inventory || !rule || rule.errored) {
    return { successful: false, error: rule?.error ?? 'missing rule result' };
  }
  return { successful: true, rule };
}

function outcomeSignature(row) {
  return JSON.stringify({
    repositoryError: row.repositoryError ?? null,
    inventory: row.inventory ?? null,
    rules: Object.fromEntries(
      RULE_IDS.map((ruleId) => {
        const rule = row.rules?.[ruleId];
        return [
          ruleId,
          rule
            ? {
                findingCount: rule.findingCount,
                errored: rule.errored,
                error: rule.error ?? null,
                findings: rule.findings ?? [],
              }
            : null,
        ];
      }),
    ),
  });
}

function aggregateCohort(rows, cohort) {
  const selected = rows.filter((row) => row.cohort === cohort);
  const inventoryRows = selected.filter((row) => row.inventory);
  const rules = {};
  for (const ruleId of RULE_IDS) {
    const successfulRows = selected.filter((row) => ruleOutcome(row, ruleId).successful);
    const analyzedFiles = successfulRows.reduce(
      (sum, row) =>
        sum +
        Number(
          ruleId === 'D1'
            ? row.inventory.d1AnalyzedFiles
            : row.inventory.d2ToD5AnalyzedFiles,
        ),
      0,
    );
    const findings = successfulRows.reduce(
      (sum, row) => sum + Number(row.rules[ruleId].findingCount ?? 0),
      0,
    );
    const positiveFiles = new Set(
      successfulRows.flatMap((row) =>
        (row.rules[ruleId].findings ?? []).map(
          (finding) => `${row.index}:${finding.evidence?.path ?? JSON.stringify(finding)}`,
        ),
      ),
    ).size;
    const positiveRepositories = successfulRows.filter(
      (row) => Number(row.rules[ruleId].findingCount ?? 0) > 0,
    ).length;
    const fileWilson = wilson(positiveFiles, analyzedFiles);
    const repositoryWilson = wilson(positiveRepositories, successfulRows.length);
    rules[ruleId] = {
      successfulRepositories: successfulRows.length,
      errorRepositories: selected.length - successfulRows.length,
      analyzedFiles,
      findings,
      positiveFiles,
      positiveRepositories,
      findingDensityPer1000Files: analyzedFiles === 0 ? null : (findings / analyzedFiles) * 1000,
      positiveFilePrevalence: analyzedFiles === 0 ? null : positiveFiles / analyzedFiles,
      positiveFileWilson95: fileWilson,
      positiveFileWilson95UpperPer1000: fileWilson ? fileWilson.upper * 1000 : null,
      positiveRepositoryPrevalence:
        successfulRows.length === 0 ? null : positiveRepositories / successfulRows.length,
      positiveRepositoryWilson95: repositoryWilson,
    };
  }
  return {
    corpusEntries: selected.length,
    inventoriedRepositories: inventoryRows.length,
    repositoryErrors: selected
      .filter((row) => row.repositoryError)
      .map((row) => ({
        index: row.index,
        fullName: row.fullName,
        revision: row.revision,
        error: row.repositoryError,
      })),
    ruleErrors: selected.flatMap((row) =>
      RULE_IDS.flatMap((ruleId) =>
        row.rules?.[ruleId]?.errored
          ? [
              {
                index: row.index,
                fullName: row.fullName,
                revision: row.revision,
                ruleId,
                error: row.rules[ruleId].error,
              },
            ]
          : [],
      ),
    ),
    inventory: inventoryTotals(inventoryRows),
    rules,
  };
}

const [manifestArgument, rawResultArgument, outputArgument] = process.argv.slice(2);
if (!manifestArgument || !rawResultArgument || !outputArgument) {
  throw new Error('usage: d-series-base-rate-summarize.mjs MANIFEST RAW_RESULT OUTPUT');
}

const manifest = readJson(manifestArgument);
const entries = manifest.selected ?? manifest.repositories;
const raw = readJson(rawResultArgument);
if (!raw.completedAt) throw new Error('raw result is incomplete');
if (raw.manifestSha256 !== sha256(manifestArgument)) {
  throw new Error('raw result manifest SHA-256 mismatch');
}
if (!Array.isArray(entries) || entries.length !== 2023) {
  throw new Error(`expected 2023 frozen entries, received ${entries?.length ?? 'none'}`);
}

const rowsByIndex = new Map();
for (const row of raw.repositories) {
  const rows = rowsByIndex.get(row.index) ?? [];
  rows.push(row);
  rowsByIndex.set(row.index, rows);
}

const canonicalRows = [];
const duplicateIndexes = [];
const inconsistentDuplicateIndexes = [];
for (const [zeroBasedIndex, entry] of entries.entries()) {
  const index = zeroBasedIndex + 1;
  const rows = rowsByIndex.get(index) ?? [];
  if (rows.length === 0) throw new Error(`missing result for frozen index ${index}`);
  if (rows.some((row) => row.revision !== entry.revision)) {
    throw new Error(`revision mismatch at frozen index ${index}`);
  }
  if (rows.length > 1) {
    duplicateIndexes.push({ index, fullName: entry.fullName, attempts: rows.length });
    const signatures = new Set(rows.map(outcomeSignature));
    if (signatures.size > 1) inconsistentDuplicateIndexes.push(index);
  }
  canonicalRows.push({ ...rows[0], fullName: entry.fullName, cohort: entry.cohort ?? 'fresh' });
}
if (inconsistentDuplicateIndexes.length > 0) {
  throw new Error(
    `duplicate measurement outcomes differ at indexes ${inconsistentDuplicateIndexes.join(',')}`,
  );
}

const canonicalCostRows = canonicalRows.filter((row) => row.inventory);
const rawCostRows = raw.repositories.filter((row) => row.inventory);
const cost = (rows) => ({
  rows: rows.length,
  peakDiskKilobytes: Math.max(0, ...rows.map((row) => Number(row.peakDiskKilobytes ?? 0))),
  cloneWallMilliseconds: rows.reduce(
    (sum, row) => sum + Number(row.cloneWallMilliseconds ?? 0),
    0,
  ),
  bytesTransferred: rows.reduce(
    (sum, row) => sum + (row.bytesTransferred === null ? 0 : Number(row.bytesTransferred ?? 0)),
    0,
  ),
  unknownTransferRows: rows.filter((row) => row.bytesTransferred === null).length,
});

const summary = {
  schemaVersion: 'cejel-d-series-base-rate-summary-v1',
  generatedAt: raw.completedAt,
  manifestPath: manifestArgument,
  manifestSha256: sha256(manifestArgument),
  rawResultPath: rawResultArgument,
  rawResultSha256: sha256(rawResultArgument),
  rawCompletedAt: raw.completedAt,
  streamedDeleteConfirmed: raw.streamedDeleteConfirmed === true,
  canonicalization: {
    key: 'frozen manifest index plus revision',
    selection: 'first recorded outcome for each frozen index',
    rawRows: raw.repositories.length,
    canonicalRows: canonicalRows.length,
    excessDuplicateAttempts: raw.repositories.length - canonicalRows.length,
    duplicateIndexCount: duplicateIndexes.length,
    duplicateIndexes,
    inconsistentDuplicateIndexes,
    cause:
      'On resume, redacted stored fullName values did not equal unredacted manifest fullName values, so those indexes were re-attempted. Outcomes were identical and duplicate attempts are excluded from all canonical denominators.',
  },
  cohorts: {
    fresh: aggregateCohort(canonicalRows, 'fresh'),
    legacy23: aggregateCohort(canonicalRows, 'legacy-23'),
    allStage2: aggregateCohort(
      canonicalRows.map((row) => ({ ...row, cohort: 'all-stage2' })),
      'all-stage2',
    ),
  },
  cost: {
    canonicalRecordedRows: cost(canonicalCostRows),
    rawRecordedAttempts: cost(rawCostRows),
    hardFailureAttemptsNotRepresentedInRecordedCostRows: {
      index: 928,
      heapsMiB: [4096, 12288, 49152],
    },
  },
};

const outputPath = resolve(outputArgument);
const temporaryPath = `${outputPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(summary, null, 2)}\n`);
renameSync(temporaryPath, outputPath);
process.stdout.write(
  `canonical rows=${summary.canonicalization.canonicalRows} duplicates=${summary.canonicalization.excessDuplicateAttempts}\n`,
);
