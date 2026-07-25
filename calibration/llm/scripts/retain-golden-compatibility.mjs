#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalize } from './freeze-cohorts.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function retainGoldenCompatibilityEvidence(sourcePath, destinationPath) {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  const bytes = readFileSync(source);
  const document = JSON.parse(bytes.toString('utf8'));
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('golden free-core compatibility evidence must be a JSON object');
  }

  let descriptor;
  try {
    descriptor = openSync(destination, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }

  const retained = readFileSync(destination);
  const sourceByteSha256 = sha256(bytes);
  const retainedByteSha256 = sha256(retained);
  if (retainedByteSha256 !== sourceByteSha256) {
    throw new Error('retained free-core compatibility evidence differs from its source bytes');
  }
  if ((lstatSync(destination).mode & 0o777) !== 0o600) {
    throw new Error('retained free-core compatibility evidence must have mode 0600');
  }
  return {
    byte_sha256: retainedByteSha256,
    document_sha256: sha256(Buffer.from(canonicalize(document), 'utf8')),
  };
}

export function main(argv) {
  if (argv.length !== 2) {
    throw new Error(
      'usage: retain-golden-compatibility.mjs <free-core-parity.json> <retained-output.json>',
    );
  }
  process.stdout.write(
    `${JSON.stringify(retainGoldenCompatibilityEvidence(argv[0], argv[1]))}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
