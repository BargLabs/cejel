import { resolve } from 'node:path';

import type { WitanInputSignal, WitanReport } from './schemas.js';

import { isWitanNoMeasurementAbstention } from './abstention.js';
import { discoverIngestInputs, expandIngestPattern, parseIngestFile } from './ingest.js';
import { buildWitanInputFromRepo, explainNoMeasurementSourceCoverage } from './repo-signals.js';
import { assertSelectableRubricVersion } from './rubric-version.js';
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
  /** Explicit experimental rubric pin. Omitted public calls retain the current shared default. */
  rubricVersion?: string;
  /** Explicit operator-supplied `--ingest` inputs. */
  ingestPatterns?: readonly string[];
  /** Opt in to untrusted `.cejel/inputs` authored by the scanned repository. Default: false. */
  autoDiscoverIngest?: boolean;
  warnOnEmptyIngestMatch?: boolean;
}

export function scoreRepoWithPublicCejel(options: PublicCejelScoreOptions): WitanReport {
  // A present-but-unwired selector must fail closed, not fall through to whatever
  // createWitanReport does with a version string it doesn't recognize. An absent selector is
  // untouched here — the schema default (the calibrated public rubric) applies downstream.
  if (options.rubricVersion !== undefined) {
    assertSelectableRubricVersion(options.rubricVersion);
  }
  const input = buildWitanInputFromRepo({
    productSlug: options.productSlug,
    productDisplayName: options.productDisplayName,
    repoPath: options.repoPath,
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
    ...(options.rubricVersion ? { rubricVersion: options.rubricVersion } : {}),
  });
  const inputSignals = resolvePublicIngestSignals(options);
  const report = createWitanReport(input, inputSignals.length > 0 ? inputSignals : undefined);
  if (report.verdict !== 'insufficient_source' || !isWitanNoMeasurementAbstention(report)) {
    return report;
  }

  const contextualReason = explainNoMeasurementSourceCoverage(
    options.repoPath,
    report.rubricVersion,
  );
  return contextualReason
    ? {
        ...report,
        insufficientSourceReason: contextualReason,
      }
    : report;
}

/** Resolve the sealed public-scan ingest surface; repository-authored inputs require opt-in. */
export function resolvePublicIngestSignals(
  options: Pick<
    PublicCejelScoreOptions,
    'repoPath' | 'ingestPatterns' | 'autoDiscoverIngest' | 'warnOnEmptyIngestMatch'
  >,
): WitanInputSignal[] {
  const seen = new Set<string>();
  const explicitFiles: string[] = [];

  for (const pattern of options.ingestPatterns ?? []) {
    const matches = expandIngestPattern(pattern);
    if (matches.length === 0 && options.warnOnEmptyIngestMatch) {
      process.stderr.write(`Cejel: --ingest pattern matched no files: ${pattern}\n`);
    }
    for (const match of matches) {
      const resolved = resolve(match);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      explicitFiles.push(match);
    }
  }

  const signals = explicitFiles.flatMap((file) =>
    parseIngestFile(file, { provenance: 'operator_supplied' }),
  );
  if (!options.autoDiscoverIngest) return signals;

  for (const discovered of discoverIngestInputs(options.repoPath)) {
    const resolved = resolve(discovered);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    signals.push(...parseIngestFile(discovered, { provenance: 'auto_discovered' }));
  }

  return signals;
}
