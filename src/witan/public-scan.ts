import type { WitanInputSignal, WitanReport } from './schemas.js';

import { isWitanNoMeasurementAbstention } from './abstention.js';
import {
  discoverIngestInputs,
  expandIngestPattern,
  parseIngestFile,
  resolveIngestFilePath,
} from './ingest.js';
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

// Public scans fail closed rather than silently truncate when external evidence exceeds either
// combined budget. The document limit applies after canonical-path deduplication across explicit
// and auto-discovered inputs; the finding limit applies before any parsed findings reach scoring.
export const MAX_INGEST_DOCUMENTS = 128;
export const MAX_RETAINED_INGEST_FINDINGS = 10_000;

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
  const documents: Array<{
    file: string;
    provenance: 'operator_supplied' | 'auto_discovered';
  }> = [];

  const addDocument = (
    file: string,
    provenance: 'operator_supplied' | 'auto_discovered',
  ): void => {
    const resolved = resolveIngestFilePath(file);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    documents.push({ file: resolved, provenance });
    if (documents.length > MAX_INGEST_DOCUMENTS) {
      throw new Error(
        `Cejel: ${documents.length} unique ingest documents exceed the ${MAX_INGEST_DOCUMENTS} ingest document budget; refusing to produce a partial certificate.`,
      );
    }
  };

  for (const pattern of options.ingestPatterns ?? []) {
    // Stop directory enumeration once enough candidates exist to prove the combined budget can
    // be exceeded; canonical deduplication still happens in addDocument below.
    const matches = expandIngestPattern(pattern, MAX_INGEST_DOCUMENTS + 1);
    if (matches.length === 0 && options.warnOnEmptyIngestMatch) {
      process.stderr.write(`Cejel: --ingest pattern matched no files: ${pattern}\n`);
    }
    for (const match of matches) {
      addDocument(match, 'operator_supplied');
    }
  }

  if (options.autoDiscoverIngest) {
    for (const discovered of discoverIngestInputs(
      options.repoPath,
      MAX_INGEST_DOCUMENTS + 1,
    )) {
      addDocument(discovered, 'auto_discovered');
    }
  }

  const signals: WitanInputSignal[] = [];
  let retainedFindings = 0;
  for (const document of documents) {
    const parsed = parseIngestFile(document.file, {
      maxFindingCandidates: MAX_RETAINED_INGEST_FINDINGS - retainedFindings,
      provenance: document.provenance,
    });
    const documentFindings = parsed.reduce((count, signal) => count + signal.findings.length, 0);
    retainedFindings += documentFindings;
    if (retainedFindings > MAX_RETAINED_INGEST_FINDINGS) {
      throw new Error(
        `Cejel: ${retainedFindings.toLocaleString('en-US')} retained findings exceed the ${MAX_RETAINED_INGEST_FINDINGS.toLocaleString('en-US')} retained ingest finding budget; refusing to truncate evidence.`,
      );
    }
    signals.push(...parsed);
  }
  return signals;
}
