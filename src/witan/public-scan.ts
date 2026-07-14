import { resolve } from 'node:path';

import type { WitanInputSignal, WitanReport } from './schemas.js';

import { discoverIngestInputs, expandIngestPattern, parseIngestFile } from './ingest.js';
import { buildWitanInputFromRepo } from './repo-signals.js';
import { createWitanReport } from './scoring.js';

/**
 * The sealed repository-scoring path used by the public CLI and every published
 * leaderboard row. It deliberately exposes no domainCollectors/additionalSignals
 * escape hatch: board-only evidence is unrepresentable at this boundary.
 */
export interface PublicCejelScoreOptions {
  repoPath: string;
  productSlug: string;
  productDisplayName: string;
  generatedAt?: string;
  /** Public `--ingest` inputs. Auto-discovered .cejel/inputs are always included. */
  ingestPatterns?: readonly string[];
  warnOnEmptyIngestMatch?: boolean;
}

export function scoreRepoWithPublicCejel(options: PublicCejelScoreOptions): WitanReport {
  const input = buildWitanInputFromRepo({
    productSlug: options.productSlug,
    productDisplayName: options.productDisplayName,
    repoPath: options.repoPath,
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
  });
  const inputSignals = resolvePublicIngestSignals(options);
  return createWitanReport(input, inputSignals.length > 0 ? inputSignals : undefined);
}

/** Resolve the exact ingest surface available to `npx @cejel/cejel .`. */
export function resolvePublicIngestSignals(
  options: Pick<PublicCejelScoreOptions, 'repoPath' | 'ingestPatterns' | 'warnOnEmptyIngestMatch'>,
): WitanInputSignal[] {
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
