import type {
  WitanCriterionScore,
  WitanEvidencePointer,
  WitanReportInputPayload,
} from './schemas.js';

// #612: the report schema caps every `path` at 700 characters (WitanEvidencePointerSchema,
// WitanWithheldPathSchema, WitanRepoRefSchema in schemas.ts). A repository can hold a file whose
// relative path is longer, and one such path cited as evidence or listed as withheld used to fail
// WitanReportInputSchema.parse(), so the scan wrote no report under any rubric. This module is the
// one place a scanner-produced path is fitted to that cap.
//
// A path cut short would name a file that does not exist, a false citation, so an over-limit item
// is dropped, never truncated (unlike an ingested finding's `location`, which clampFinding in
// finding-limits.ts truncates: that is a third party's free-text locator, not a path Cejel cites).
//
// The drop changes only what is cited. A criterion's score reads how many pointers its signal
// holds (scoreCriterion's evidenceCount and fallbackMetricsForEvidence in scoring.ts), so the
// pointer cannot be removed before scoring. markOverLimitPaths swaps each over-limit path for a
// marker that satisfies the schema, the scorer runs on every pointer, and dropMarkedCitations then
// removes each marked pointer, and any finding anchored on one, from the scored output and states
// the count on the criterion.
//
// An input with no over-limit path is returned unchanged (the same object), and the scored output
// is untouched, so every report that validated before this module existed is byte-identical.

export const REPORT_PATH_MAX = 700;

// NUL cannot occur in a repository path git tracks or a file system names, so the marker can never
// be a real path; it is never written, since dropMarkedCitations removes every pointer carrying it.
const OVER_LIMIT_PATH_MARKER = '\u0000cejel:path-over-report-limit\u0000';

export function overReportPathLimit(path: string | undefined): boolean {
  return path !== undefined && path.length > REPORT_PATH_MAX;
}

type InputSignal = NonNullable<WitanReportInputPayload['signals']>[number];
type InputPointer = NonNullable<InputSignal['positiveEvidence']>[number];
type InputFinding = NonNullable<InputSignal['findings']>[number];

function markPointer(pointer: InputPointer): InputPointer {
  return overReportPathLimit(pointer.path) ? { ...pointer, path: OVER_LIMIT_PATH_MARKER } : pointer;
}

function markSignal(signal: InputSignal): InputSignal {
  const marks =
    (signal.positiveEvidence ?? []).some(({ path }) => overReportPathLimit(path)) ||
    (signal.findings ?? []).some(({ evidence }) => overReportPathLimit(evidence.path));
  if (!marks) return signal;
  return {
    ...signal,
    ...(signal.positiveEvidence ? { positiveEvidence: signal.positiveEvidence.map(markPointer) } : {}),
    ...(signal.findings
      ? {
          findings: signal.findings.map(
            (finding): InputFinding =>
              overReportPathLimit(finding.evidence.path)
                ? { ...finding, evidence: markPointer(finding.evidence) }
                : finding,
          ),
        }
      : {}),
  };
}

export interface MarkedReportInput {
  readonly input: WitanReportInputPayload;
  /** Withheld paths left out of withheldPaths because they are over the limit. */
  readonly droppedWithheldPaths: number;
}

/**
 * Before the input is parsed: mark each over-limit evidence path, so the scorer still counts the
 * pointer, and leave each over-limit withheld path out of withheldPaths, which no score reads.
 */
export function markOverLimitPaths(input: WitanReportInputPayload): MarkedReportInput {
  const signals = input.signals?.map(markSignal);
  const signalsMarked = signals?.some((signal, index) => signal !== input.signals?.[index]) ?? false;
  const withheldPaths = input.withheldPaths?.filter(({ path }) => !overReportPathLimit(path));
  const droppedWithheldPaths = (input.withheldPaths?.length ?? 0) - (withheldPaths?.length ?? 0);
  if (!signalsMarked && droppedWithheldPaths === 0) return { input, droppedWithheldPaths: 0 };
  return {
    input: {
      ...input,
      ...(signalsMarked ? { signals } : {}),
      ...(droppedWithheldPaths > 0 ? { withheldPaths } : {}),
    },
    droppedWithheldPaths,
  };
}

function isMarked(pointer: WitanEvidencePointer): boolean {
  return pointer.path === OVER_LIMIT_PATH_MARKER;
}

/** False only for a pointer markOverLimitPaths marked, which dropMarkedCitations will remove. */
export function isCitablePointer(pointer: WitanEvidencePointer): boolean {
  return !isMarked(pointer);
}

/** The sentence a criterion carries for the items it did not cite. Plain words: the first page shows it. */
export function overLimitCitationDisclosure(count: number): string {
  return `Cejel did not cite ${count} evidence ${count === 1 ? 'item' : 'items'} here because ${count === 1 ? 'its repository path is' : 'their repository paths are'} longer than the report's ${REPORT_PATH_MAX}-character path limit. The score and status were computed with ${count === 1 ? 'it' : 'them'}; no path is shortened, since a shortened path would name a file that does not exist.`;
}

/** The scan limitation for withheld paths left out of withheldPaths. */
export function overLimitWithheldPathsLimitation(count: number): string {
  return `${count} withheld ${count === 1 ? 'path is' : 'paths are'} not listed in withheldPaths because ${count === 1 ? 'it is' : 'they are'} longer than the report's ${REPORT_PATH_MAX}-character path limit; contentReadSummary still counts ${count === 1 ? 'it' : 'them'}. No path is shortened, since a shortened path would name a file that does not exist.`;
}

const DISCLOSURES_MAX = 4;

export interface DroppedCitations {
  readonly criteria: WitanCriterionScore[];
  /** Sentences for criteria that already carry the most disclosures the schema allows. */
  readonly overflowLimitations: string[];
}

/**
 * After scoring: remove every marked pointer, and every finding anchored on one, from each
 * criterion's output, and state the count once on that criterion. Score, status and metrics are
 * returned exactly as scored. A criterion with nothing marked is returned unchanged.
 */
export function dropMarkedCitations(criteria: readonly WitanCriterionScore[]): DroppedCitations {
  const overflowLimitations: string[] = [];
  const fitted = criteria.map((criterion) => {
    const evidence = criterion.evidence.filter((pointer) => !isMarked(pointer));
    const findings = criterion.findings.filter((finding) => !isMarked(finding.evidence));
    const dropped =
      criterion.evidence.length - evidence.length + (criterion.findings.length - findings.length);
    if (dropped === 0) return criterion;
    const sentence = overLimitCitationDisclosure(dropped);
    const existing = criterion.disclosures ?? [];
    if (existing.length >= DISCLOSURES_MAX) {
      // The schema holds at most four disclosures; the drop is then stated as a scan limitation
      // naming the criterion, never left unstated.
      overflowLimitations.push(`${criterion.id}: ${sentence}`);
      return { ...criterion, evidence, findings };
    }
    return { ...criterion, evidence, findings, disclosures: [...existing, sentence] };
  });
  return { criteria: fitted, overflowLimitations };
}

const SCAN_LIMITATIONS_MAX = 16;

/**
 * Append the drop statements to the scan limitations. Throws, and so writes no report, only where
 * the schema's sixteen entries are already used; a drop is never left unstated.
 */
export function withDropLimitations(
  scanLimitations: readonly string[],
  statements: readonly string[],
): string[] {
  if (statements.length === 0) return [...scanLimitations];
  if (scanLimitations.length + statements.length > SCAN_LIMITATIONS_MAX) {
    throw new Error(
      `Cejel: ${statements.length} statement(s) of items dropped for a path over the report's ${REPORT_PATH_MAX}-character limit do not fit beside ${scanLimitations.length} scan limitations (at most ${SCAN_LIMITATIONS_MAX}); refusing to drop them without saying so.`,
    );
  }
  return [...scanLimitations, ...statements];
}
