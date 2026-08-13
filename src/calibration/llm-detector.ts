import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  collectCejelLlmPack,
  createCejelLlmPackArtifact,
  serializeCejelLlmPackArtifact,
  snapshotCejelLlmPackInput,
} from '../packs/llm/index.js';
import { deriveProductIdentity } from '../product-identity.js';
import { runCejelScan } from '../scan.js';
import { serializeWitanReport } from '../witan/index.js';

interface CalibrationInvocation {
  source: string;
  output: string;
}

function parseCalibrationInvocation(argv: readonly string[]): CalibrationInvocation {
  const args = [...argv];
  if (args[0] === 'scan') args.shift();
  const source = args.shift();
  if (!source || source.startsWith('-')) {
    throw new Error('usage: llm-detector scan <source> --out <output> --quiet');
  }
  let output: string | undefined;
  let quiet = false;
  while (args.length > 0) {
    const argument = args.shift();
    if (argument === '--out') {
      output = args.shift();
      if (!output || output.startsWith('-')) throw new Error('--out requires a directory');
    } else if (argument === '--quiet') {
      quiet = true;
    } else {
      throw new Error(`unknown calibration detector argument: ${argument}`);
    }
  }
  if (!output || !quiet) {
    throw new Error('usage: llm-detector scan <source> --out <output> --quiet');
  }
  return { source: resolve(source), output: resolve(output) };
}

function toolVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version?: unknown };
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('Cejel package manifest has no version.');
  }
  return manifest.version;
}

function assertUnchangedInput(
  before: ReturnType<typeof snapshotCejelLlmPackInput>,
  after: ReturnType<typeof snapshotCejelLlmPackInput>,
): void {
  if (before.sourceSha256 !== after.sourceSha256) {
    throw new Error('supported source changed during the calibration scan');
  }
}

export function runCalibrationLlmDetector(argv: readonly string[]): void {
  const invocation = parseCalibrationInvocation(argv);
  const identity = deriveProductIdentity(invocation.source);
  const initial = snapshotCejelLlmPackInput(invocation.source);
  const { report, generatedAt } = runCejelScan({
    repoPath: invocation.source,
    ingestPatterns: [],
    warnOnEmptyIngestMatch: false,
  });
  const beforePack = snapshotCejelLlmPackInput(invocation.source);
  assertUnchangedInput(initial, beforePack);
  const result = collectCejelLlmPack(invocation.source, beforePack.repoFiles);
  const afterPack = snapshotCejelLlmPackInput(invocation.source);
  assertUnchangedInput(beforePack, afterPack);
  const serializedBaseReport = serializeWitanReport(report);
  const artifact = createCejelLlmPackArtifact(result, {
    generatedAt,
    // Calibration results can be published. A stable product slug identifies the subject while
    // an operator checkout path would disclose unrelated local/customer directory structure.
    repoPath: identity.productSlug,
    ...(report.repo.headSha ? { headSha: report.repo.headSha } : {}),
    baseReportSha256: createHash('sha256').update(serializedBaseReport).digest('hex'),
    inputSourceSha256: beforePack.sourceSha256,
    toolVersion: toolVersion(),
  });
  mkdirSync(invocation.output, { recursive: true });
  writeFileSync(
    join(invocation.output, 'llm-report.json'),
    serializeCejelLlmPackArtifact(artifact),
    'utf8',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCalibrationLlmDetector(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
