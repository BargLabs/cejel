import type { WitanReport } from './witan/index.js';
import { scoreRepoWithPublicCejel } from './witan/index.js';

import { deriveProductIdentity } from './product-identity.js';
import { type WitanCliSummary, buildWitanCliSummary } from './summary.js';

export interface CejelScanOptions {
  /** Repository to score. Callers resolve relative paths before passing it in. */
  repoPath: string;
  /** Optional certificate display-name override; the stable repository slug is unchanged. */
  productDisplayName?: string;
  /** Raw ingest values (file paths or single-level globs), in the order given. */
  ingestPatterns?: readonly string[];
  /** Warn on stderr when an explicit ingest pattern matches no files. */
  warnOnEmptyIngestMatch?: boolean;
}

export interface CejelScanResult {
  report: WitanReport;
  summary: WitanCliSummary;
  /** UTC timestamp for this invocation; retained for provenance artifacts only. */
  generatedAt: string;
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
  const generatedAt = new Date().toISOString();
  const report = scoreRepoWithPublicCejel({
    productSlug: identity.productSlug,
    productDisplayName: options.productDisplayName ?? identity.productDisplayName,
    repoPath: options.repoPath,
    generatedAt,
    ingestPatterns: options.ingestPatterns,
    // Local CLI/MCP scans retain the documented convenience default: their operator controls
    // the repository. Direct public/leaderboard scans default this off because their targets
    // are third-party repositories and must opt in explicitly.
    autoDiscoverIngest: true,
    warnOnEmptyIngestMatch: options.warnOnEmptyIngestMatch,
  });
  const summary = buildWitanCliSummary(report);

  return { report, summary, generatedAt };
}
