#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { writeV22CalibrationManifest } from './v22-public-calibration-artifacts.mjs';

// This tracked launcher is the execution boundary the v4 host wrapper accepts. The compiled
// implementation comes from the same frozen tree's `pnpm build`; no public CLI flag can select
// a prospective rubric.
const detectorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const entrypoint = resolve(detectorRoot, 'dist/index.js');
const { runWitanV22CalibrationCli } = await import(pathToFileURL(entrypoint).href);

function outputDirectory(argv) {
  if (
    argv.length !== 5 ||
    argv[0] !== 'scan' ||
    !argv[1] ||
    argv[2] !== '--out' ||
    !argv[3] ||
    argv[4] !== '--quiet'
  ) {
    throw new Error('usage: run-v22-public-calibration.mjs scan <source> --out <output> --quiet');
  }
  return resolve(argv[3]);
}

try {
  const argv = process.argv.slice(2);
  const output = outputDirectory(argv);
  const exitCode = await runWitanV22CalibrationCli(argv);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  } else {
    writeV22CalibrationManifest(output);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
