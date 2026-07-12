import { resolve } from 'node:path';

import type { WitanInputSignal, WitanReport } from './witan/index.js';
import {
  buildWitanInputFromRepo,
  createWitanReport,
  discoverIngestInputs,
  expandIngestPattern,
  parseIngestFile,
} from './witan/index.js';

import { deriveProductIdentity } from './product-identity.js';
import { type WitanCliSummary, buildWitanCliSummary } from './summary.js';

export interface CejelScanOptions {
  /** Repository to score. Callers resolve relative paths before passing it in. */
  repoPath: string;
  /** Raw ingest values (file paths or single-level globs), in the order given. */
  ingestPatterns?: readonly string[];
  /** Warn on stderr when an explicit ingest pattern matches no files. */
  warnOnEmptyIngestMatch?: boolean;
}

export interface CejelScanResult {
  report: WitanReport;
  summary: WitanCliSummary;
}

/**
 * The single scan path shared by every surface: `cejel <path>` (src/index.ts) and the MCP
 * `scan` tool (src/mcp/server.ts) both call this and nothing else, so they can never drift
 * apart on scoring. Fully offline — deterministic repo-signal collection + rubric scoring,
 * no network, no model call. Pure with respect to output files: writing report/certificate/
 * badge artifacts stays in the CLI entry; this only computes.
 */
export function runCejelScan(options: CejelScanOptions): CejelScanResult {
  const identity = deriveProductIdentity(options.repoPath);
  const input = buildWitanInputFromRepo({
    productSlug: identity.productSlug,
    productDisplayName: identity.productDisplayName,
    repoPath: options.repoPath,
  });

  const inputSignals = resolveIngestSignals(options);
  const report = createWitanReport(input, inputSignals.length > 0 ? inputSignals : undefined);
  const summary = buildWitanCliSummary(report);

  return { report, summary };
}

/**
 * Resolve ingest patterns + .cejel/inputs/*.{sarif,json} auto-discovery into folded
 * WitanInputSignal[], deduping by resolved file path so an explicit path that also lands in
 * the auto-discovered directory is not double-counted. Warns (non-fatal) on stderr when an
 * explicit ingest glob matches no files.
 */
function resolveIngestSignals(options: CejelScanOptions): WitanInputSignal[] {
  const seen = new Set<string>();
  const files: string[] = [];

  for (const pattern of options.ingestPatterns ?? []) {
    const matches = expandIngestPattern(pattern);
    if (matches.length === 0 && options.warnOnEmptyIngestMatch) {
      process.stderr.write(`Cejel: --ingest pattern matched no files: ${pattern}\n`);
    }
    for (const match of matches) {
      const resolved = resolve(match);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      files.push(match);
    }
  }

  for (const discovered of discoverIngestInputs(options.repoPath)) {
    const resolved = resolve(discovered);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    files.push(discovered);
  }

  return files.flatMap((file) => parseIngestFile(file));
}
