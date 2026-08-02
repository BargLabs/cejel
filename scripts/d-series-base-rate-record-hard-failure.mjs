#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new Error(message);
}

const [resultArgument, manifestArgument, indexArgument] = process.argv.slice(2);
if (!resultArgument || !manifestArgument || !indexArgument) {
  fail('usage: d-series-base-rate-record-hard-failure.mjs RESULT MANIFEST INDEX');
}

const resultPath = resolve(resultArgument);
const manifestPath = resolve(manifestArgument);
const index = Number(indexArgument);
if (!Number.isSafeInteger(index) || index < 1) fail('INDEX must be a positive integer');

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const entries = manifest.selected ?? manifest.repositories;
const entry = entries?.[index - 1];
if (!entry) fail(`manifest has no repository at index ${index}`);

const result = JSON.parse(readFileSync(resultPath, 'utf8'));
if (result.completedAt) fail('refusing to modify a completed result');
if (result.manifestSha256 !== sha256(manifestBytes)) fail('manifest SHA-256 mismatch');
if (!Array.isArray(result.repositories)) fail('result has no repositories array');
if (result.repositories.some((row) => row.index === index)) {
  fail(`result already contains repository index ${index}`);
}
const priorMaximum = Math.max(0, ...result.repositories.map((row) => Number(row.index ?? 0)));
if (priorMaximum !== index - 1) {
  fail(`hard failure must be the next index: prior=${priorMaximum}, requested=${index}`);
}

result.repositories.push({
  index,
  fullName: entry.fullName,
  revision: entry.revision,
  cohort: entry.cohort ?? 'fresh',
  repositoryError: {
    name: 'WorkerOutOfMemory',
    message:
      'Exact whole-repository rule evaluation did not complete after isolated attempts at 4 GiB, 12 GiB, and 48 GiB V8 heap ceilings; D1 exhausted memory before producing a result, and D2-D5 were not attempted. This row is an explicit error and must not be counted as a zero or in analyzed-file denominators.',
    attemptedHeapMiB: [4096, 12288, 49152],
    eligibleFileCount: 150560,
    eligibleBytes: 1975278356,
    maximumEligibleFileBytes: 4993443,
  },
});

const temporaryPath = `${resultPath}.hard-failure.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(result, null, 2)}\n`);
renameSync(temporaryPath, resultPath);
process.stdout.write(
  `recorded explicit hard failure index=${index} ${entry.fullName}@${entry.revision}\n`,
);
