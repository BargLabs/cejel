import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  renderWitanBadgeEndpoint,
  renderWitanBadgeSvg,
  renderWitanHtmlReport,
} from './witan/index.js';

import { runCejelScan } from './scan.js';
import { renderTerminalCertificate } from './terminal.js';

export interface WitanCliOptions {
  repoPath: string;
  outDir: string;
  minScore?: number;
  quiet: boolean;
  /** Raw --ingest values (file paths or single-level globs), in the order given. */
  ingestPatterns: string[];
}

const DEFAULT_OUT_DIR = '.cejel';

async function main(): Promise<void> {
  const exitCode = await runWitanFreeCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

/**
 * Zero-config public entry: `npx @cejel/cejel .` (or `npx @cejel/cejel`, defaulting to the
 * current directory). Fully offline — reuses this package's deterministic, no-LLM scoring core
 * and repo-signal collector; this module only adds ergonomic defaults + presentation.
 */
export async function runWitanFreeCli(args: readonly string[]): Promise<number> {
  const options = parseArgs(args);

  const { report, summary } = runCejelScan({
    repoPath: options.repoPath,
    ingestPatterns: options.ingestPatterns,
    warnOnEmptyIngestMatch: !options.quiet,
  });

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(join(options.outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(join(options.outDir, 'certificate.html'), renderWitanHtmlReport(report), 'utf8');
  writeFileSync(
    join(options.outDir, 'badge.json'),
    JSON.stringify(renderWitanBadgeEndpoint(report), null, 2),
    'utf8',
  );
  writeFileSync(join(options.outDir, 'badge.svg'), renderWitanBadgeSvg(report), 'utf8');
  writeFileSync(join(options.outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  if (!options.quiet) {
    process.stdout.write(renderTerminalCertificate(summary));
    process.stdout.write(
      `\nWrote:\n  ${options.outDir}/report.json\n  ${options.outDir}/certificate.html\n  ${options.outDir}/badge.json\n  ${options.outDir}/badge.svg\n`,
    );
  }

  if (options.minScore != null && report.overallScore < options.minScore) {
    process.stderr.write(
      `Cejel: overall score ${report.overallScore.toFixed(1)}/4.0 is below the required minimum ${options.minScore.toFixed(1)}/4.0\n`,
    );
    return 1;
  }

  return 0;
}

export function parseArgs(args: readonly string[]): WitanCliOptions {
  let repoPath: string | undefined;
  let outDir = DEFAULT_OUT_DIR;
  let minScore: number | undefined;
  let quiet = false;
  const ingestPatterns: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--' || arg === undefined) continue;
    if (arg === '--quiet') {
      quiet = true;
      continue;
    }
    if (arg === '--out-dir') {
      const value = args[index + 1];
      if (!value) throw new Error('Missing value for --out-dir');
      outDir = value;
      index += 1;
      continue;
    }
    if (arg === '--min-score') {
      const value = args[index + 1];
      if (!value) throw new Error('Missing value for --min-score');
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 4) {
        throw new Error(`--min-score must be between 0 and 4, got: ${value}`);
      }
      minScore = parsed;
      index += 1;
      continue;
    }
    if (arg === '--ingest') {
      const value = args[index + 1];
      if (!value) throw new Error('Missing value for --ingest');
      ingestPatterns.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown Cejel CLI flag: ${arg}`);
    }
    // First bare positional argument is the repo path.
    if (repoPath === undefined) repoPath = arg;
  }

  return {
    repoPath: resolve(repoPath ?? '.'),
    outDir,
    ...(minScore != null ? { minScore } : {}),
    quiet,
    ingestPatterns,
  };
}

function isEntryPoint(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  // npm's installed node_modules/.bin/cejel is a symlink to dist/index.js: argv[1] is the
  // symlink path while import.meta.url resolves to the real file, so the comparison must
  // go through the same realpath or `npx @cejel/cejel`/`.bin/cejel` silently exits 0 doing nothing.
  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(invokedPath);
  } catch {
    resolvedPath = invokedPath;
  }
  return import.meta.url === pathToFileURL(resolvedPath).href;
}

if (isEntryPoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Cejel CLI error.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
