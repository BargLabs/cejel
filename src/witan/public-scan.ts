import { type WitanInputSignal, type WitanReport, WitanReportSchema } from './schemas.js';

import { isWitanNoMeasurementAbstention } from './abstention.js';
import { execGit } from './git-exec.js';
import { detectHistoryLimitations } from './history-depth.js';
import {
  type IngestDocument,
  discoverIngestInputs,
  expandIngestPattern,
  readIngestDocument,
  resolveIngestFilePath,
} from './ingest.js';
import {
  type IngestDocumentRecord,
  type ScannedSubject,
  assertStrictIngestBinding,
  buildInputBinding,
  normalizeRepositoryIdentity,
  plainIsoInstant,
} from './input-binding.js';
import {
  buildWitanInputFromRepo,
  explainNoMeasurementSourceCoverage,
  usesV27FalseAssuranceClosure,
} from './repo-signals.js';
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
  /** The running @cejel/cejel version, carried onto report.json's toolVersion. Not defaulted. */
  toolVersion?: string;
  /**
   * Refuse, before scoring, any ingested input whose declared subject is another repository or
   * commit, that was observed before the scanned commit existed, or that duplicates another input.
   * Default false: the binding status is recorded and scoring is identical to a build without it.
   */
  strictIngest?: boolean;
  /**
   * The scanned repository's identity (e.g. `github.com/owner/repo` or its clone URL), compared with
   * the repository an ingested input declares. Never inferred from clone state: without it, an
   * input's repository is recorded as `unverifiable` and binding rests on the commit.
   */
  subjectRepository?: string;
}

// Public scans fail closed rather than silently truncate when external evidence exceeds either
// combined budget. The document limit applies after canonical-path deduplication across explicit
// and auto-discovered inputs; the finding limit applies before any parsed findings reach scoring.
export const MAX_INGEST_DOCUMENTS = 128;
export const MAX_RETAINED_INGEST_FINDINGS = 10_000;
/** report.json's inputBinding.inputs bound (schemas.ts): every document plus one repeat each. */
export const MAX_INPUT_BINDING_RECORDS = 2 * MAX_INGEST_DOCUMENTS;

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
  const scannedSubject = readScannedSubject(
    options.repoPath,
    input.repo.headSha,
    options.subjectRepository,
  );
  const { signals: inputSignals, documents } = resolvePublicIngestInputs(options);
  const inputBinding =
    documents.length > 0
      ? buildInputBinding(documents, scannedSubject, options.strictIngest ? 'strict' : 'record-only')
      : undefined;
  if (options.strictIngest && inputBinding) assertStrictIngestBinding(documents, inputBinding);
  const scored = createWitanReport(
    input,
    inputSignals.length > 0 ? inputSignals : undefined,
    undefined,
    options.toolVersion,
  );
  // Attached after scoring, so it cannot reach any score; see detectHistoryLimitations.
  const historyLimitations = detectHistoryLimitations(
    options.repoPath,
    usesV27FalseAssuranceClosure(scored.rubricVersion),
  );
  const withHistory: WitanReport = historyLimitations
    ? { ...scored, historyLimitations }
    : scored;
  // Also attached after scoring: under the default record-only policy the binding status is a
  // disclosure, never a scoring input.
  const report: WitanReport = inputBinding ? { ...withHistory, inputBinding } : withHistory;
  if (report.verdict !== 'insufficient_source' || !isWitanNoMeasurementAbstention(report)) {
    return assertReportVerifiable(report);
  }

  const contextualReason = explainNoMeasurementSourceCoverage(
    options.repoPath,
    report.rubricVersion,
  );
  return assertReportVerifiable(
    contextualReason
      ? {
          ...report,
          insufficientSourceReason: contextualReason,
        }
      : report,
  );
}

/**
 * The final report, checked against the schema `cejel verify` applies. createWitanReport parses
 * what it builds, but historyLimitations, inputBinding and insufficientSourceReason are attached
 * after that parse; without this check a scan could write a report its own verifier rejects.
 * Validation only: the object returned is the one passed in (a parsed copy would reorder keys and
 * change the report's bytes). A failure is a Cejel defect and fails the scan before anything is
 * written, never a certificate that cannot be verified.
 */
export function assertReportVerifiable(report: WitanReport): WitanReport {
  const result = WitanReportSchema.safeParse(report);
  if (result.success) return report;
  const issues = result.error.issues
    .slice(0, 8)
    .map((issue) => `  - ${issue.path.join('.') || '<root>'}: ${issue.message}`);
  throw new Error(
    [
      'Cejel: the assembled report does not satisfy the report schema `cejel verify` applies; no certificate was written.',
      ...issues,
      ...(result.error.issues.length > issues.length
        ? [`  ...and ${result.error.issues.length - issues.length} more.`]
        : []),
    ].join('\n'),
  );
}

/**
 * The scanned subject an ingested input is compared with: the HEAD commit the scan read, that
 * commit's committer time (the deterministic freshness anchor; never the wall clock), and the
 * repository identity only when the caller named it.
 */
export function readScannedSubject(
  repoPath: string,
  headSha: string | undefined,
  subjectRepository: string | undefined,
): ScannedSubject {
  let repository: string | undefined;
  if (subjectRepository !== undefined) {
    repository = normalizeRepositoryIdentity(subjectRepository);
    if (repository === undefined) {
      // The value is not echoed: a clone URL that fails to normalize may still carry userinfo
      // credentials, and may carry terminal controls. Its length is diagnostic and discloses nothing.
      throw new Error(
        `Cejel: --subject-repository value (${subjectRepository.length} characters, not echoed) is not a repository identity Cejel can compare. Expected a form such as github.com/owner/repo or https://github.com/owner/repo.git, with a DNS host name and a path.`,
      );
    }
  }
  let commitTime: string | undefined;
  if (headSha) {
    const result = execGit(['show', '-s', '--format=%ct', 'HEAD'], { cwd: repoPath });
    const seconds = result.ok ? Number(result.stdout.trim()) : Number.NaN;
    // A committer time outside years 0000-9999 (or outside the Date range, where toISOString
    // throws) is treated as unknown: freshness is then unverifiable rather than a crash or an
    // expanded-year datetime the report schema rejects.
    if (Number.isSafeInteger(seconds) && seconds >= 0) {
      commitTime = plainIsoInstant(seconds * 1000);
    }
  }
  return {
    ...(repository !== undefined ? { repository } : {}),
    ...(headSha ? { commit: headSha.toLowerCase() } : {}),
    ...(commitTime !== undefined ? { commitTime } : {}),
  };
}

/** Resolve the sealed public-scan ingest surface; repository-authored inputs require opt-in. */
export function resolvePublicIngestSignals(
  options: Pick<
    PublicCejelScoreOptions,
    'repoPath' | 'ingestPatterns' | 'autoDiscoverIngest' | 'warnOnEmptyIngestMatch'
  >,
): WitanInputSignal[] {
  return resolvePublicIngestInputs(options).signals;
}

/**
 * The ingest surface plus one binding record per document. Deduplication is unchanged: a path
 * supplied twice is read once (and recorded as a `same-path` duplicate), and identical bytes at
 * two paths are both scored, as they always were, and recorded as a `same-content` duplicate.
 */
export function resolvePublicIngestInputs(
  options: Pick<
    PublicCejelScoreOptions,
    'repoPath' | 'ingestPatterns' | 'autoDiscoverIngest' | 'warnOnEmptyIngestMatch'
  >,
): { signals: WitanInputSignal[]; documents: IngestDocumentRecord[] } {
  const seen = new Set<string>();
  const documents: Array<{
    file: string;
    displayPath: string;
    provenance: 'operator_supplied' | 'auto_discovered';
  }> = [];
  // At most one repeat record per distinct path (the first repeat seen), so a path given a
  // thousand times, or both with --ingest and through .cejel/inputs, cannot grow the record past
  // the schema's bound: MAX_INGEST_DOCUMENTS documents plus one repeat each is
  // MAX_INPUT_BINDING_RECORDS.
  const samePathRepeats = new Map<
    string,
    { file: string; displayPath: string; provenance: 'operator_supplied' | 'auto_discovered' }
  >();

  const addDocument = (
    file: string,
    provenance: 'operator_supplied' | 'auto_discovered',
  ): void => {
    const resolved = resolveIngestFilePath(file);
    if (seen.has(resolved)) {
      if (!samePathRepeats.has(resolved)) {
        samePathRepeats.set(resolved, { file: resolved, displayPath: file, provenance });
      }
      return;
    }
    seen.add(resolved);
    documents.push({ file: resolved, displayPath: file, provenance });
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
  const records: IngestDocumentRecord[] = [];
  const readByPath = new Map<string, IngestDocument>();
  const scoredDigests = new Set<string>();
  let retainedFindings = 0;
  for (const document of documents) {
    const read = readIngestDocument(document.file, {
      maxFindingCandidates: MAX_RETAINED_INGEST_FINDINGS - retainedFindings,
      provenance: document.provenance,
    });
    const parsed = read.signals;
    const documentFindings = parsed.reduce((count, signal) => count + signal.findings.length, 0);
    retainedFindings += documentFindings;
    if (retainedFindings > MAX_RETAINED_INGEST_FINDINGS) {
      throw new Error(
        `Cejel: ${retainedFindings.toLocaleString('en-US')} retained findings exceed the ${MAX_RETAINED_INGEST_FINDINGS.toLocaleString('en-US')} retained ingest finding budget; refusing to truncate evidence.`,
      );
    }
    signals.push(...parsed);
    readByPath.set(document.file, read);
    records.push({
      sha256: read.sha256,
      format: read.format,
      provenance: document.provenance,
      identity: read.identity,
      displayPath: document.displayPath,
      ...(scoredDigests.has(read.sha256) ? { duplicate: 'same-content' as const } : {}),
    });
    scoredDigests.add(read.sha256);
  }
  for (const repeat of samePathRepeats.values()) {
    const read = readByPath.get(repeat.file);
    if (!read) continue;
    records.push({
      sha256: read.sha256,
      format: read.format,
      provenance: repeat.provenance,
      identity: read.identity,
      displayPath: repeat.displayPath,
      duplicate: 'same-path',
    });
  }
  return { signals, documents: records };
}
