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
// A path cut short would name a file that does not exist, a false citation, so an over-limit path
// is never truncated (unlike an ingested finding's `location`, which clampFinding in
// finding-limits.ts truncates: that is a third party's free-text locator, not a path Cejel cites).
//
// The fit changes only what is cited, never what is found or how it scores:
// - A criterion's score reads how many pointers its signal holds (scoreCriterion's evidenceCount
//   and fallbackMetricsForEvidence in scoring.ts), so a pointer cannot be removed before scoring.
//   markOverLimitPaths swaps each over-limit path for a marker that satisfies the schema, one
//   marker per distinct path, and the scorer runs on every pointer.
// - dropMarkedCitations then removes each marked evidence pointer from the scored output. A finding
//   anchored on a marked pointer keeps its severity, summary and place; only its anchor is replaced
//   by OVER_LIMIT_ANCHOR, a stated anchor that is not a file (review of #697, item A).
// - Each criterion states how many distinct paths it did not cite, however many pointers or
//   findings cited each one (item B), in its disclosures, or in its notes where the four
//   disclosures the schema allows are used.
// - A withheld path over the limit is left out of withheldPaths and stated the same way, on one
//   criterion, never as a scan limitation: scan limitations move the badge and the --min-score gate,
//   and a path's length must not (item C).
//
// An input with no over-limit path is returned unchanged (the same object), and the scored output
// is untouched, so every report that validated before this module existed is byte-identical.

export const REPORT_PATH_MAX = 700;

// NUL cannot occur in a repository path git tracks or a file system names, so a marker can never
// be a real path; it is never written, since dropMarkedCitations removes or replaces every pointer
// carrying one. The number tells distinct over-limit paths apart, so each is counted once.
const MARKER_PREFIX = '\u0000cejel:path-over-report-limit:';
const MARKER_SUFFIX = '\u0000';

/** The label of the anchor a finding keeps when the path it cited is over the limit. */
export const OVER_LIMIT_ANCHOR_LABEL = `Path longer than the report's ${REPORT_PATH_MAX}-character limit; not cited`;

/**
 * The stated anchor of a finding whose cited path is over the limit. The schema requires a path,
 * url or content hash; '.' is the repository-level anchor scoring already uses for a finding with
 * no file of its own (ensureFindingsExplainStatus), and the certificate's plain lists print no
 * location for it. The label says why, so it cannot be read as the file the finding is about.
 */
export const OVER_LIMIT_ANCHOR: WitanEvidencePointer = Object.freeze({
  kind: 'repository',
  label: OVER_LIMIT_ANCHOR_LABEL,
  path: '.',
}) as WitanEvidencePointer;

export function overReportPathLimit(path: string | undefined): boolean {
  return path !== undefined && path.length > REPORT_PATH_MAX;
}

type InputSignal = NonNullable<WitanReportInputPayload['signals']>[number];
type InputPointer = NonNullable<InputSignal['positiveEvidence']>[number];
type InputFinding = NonNullable<InputSignal['findings']>[number];
type InputWithheldPath = NonNullable<WitanReportInputPayload['withheldPaths']>[number];

function markSignal(signal: InputSignal, markerFor: (path: string) => string): InputSignal {
  const marks =
    (signal.positiveEvidence ?? []).some(({ path }) => overReportPathLimit(path)) ||
    (signal.findings ?? []).some(({ evidence }) => overReportPathLimit(evidence.path));
  if (!marks) return signal;
  const markPointer = (pointer: InputPointer): InputPointer =>
    pointer.path !== undefined && overReportPathLimit(pointer.path)
      ? { ...pointer, path: markerFor(pointer.path) }
      : pointer;
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
  readonly droppedWithheldPaths: readonly InputWithheldPath[];
}

/**
 * Before the input is parsed: mark each over-limit evidence path, so the scorer still counts the
 * pointer, and leave each over-limit withheld path out of withheldPaths, which no score reads.
 */
export function markOverLimitPaths(input: WitanReportInputPayload): MarkedReportInput {
  const markers = new Map<string, string>();
  const markerFor = (path: string): string => {
    let marker = markers.get(path);
    if (marker === undefined) {
      marker = `${MARKER_PREFIX}${markers.size}${MARKER_SUFFIX}`;
      markers.set(path, marker);
    }
    return marker;
  };
  const signals = input.signals?.map((signal) => markSignal(signal, markerFor));
  const signalsMarked = signals?.some((signal, index) => signal !== input.signals?.[index]) ?? false;
  const droppedWithheldPaths = (input.withheldPaths ?? []).filter(({ path }) => overReportPathLimit(path));
  if (!signalsMarked && droppedWithheldPaths.length === 0) return { input, droppedWithheldPaths };
  return {
    input: {
      ...input,
      ...(signalsMarked ? { signals } : {}),
      ...(droppedWithheldPaths.length > 0
        ? { withheldPaths: input.withheldPaths?.filter(({ path }) => !overReportPathLimit(path)) }
        : {}),
    },
    droppedWithheldPaths,
  };
}

function isMarked(pointer: WitanEvidencePointer): boolean {
  return pointer.path?.startsWith(MARKER_PREFIX) === true;
}

/** False only for a pointer markOverLimitPaths marked, which dropMarkedCitations will not cite. */
export function isCitablePointer(pointer: WitanEvidencePointer): boolean {
  return !isMarked(pointer);
}

const NO_SHORTENING = 'No path is shortened, since a shortened path would name a file that does not exist.';

/** The sentence a criterion carries for the distinct paths it did not cite. Plain words: the first page shows it. */
export function overLimitCitationDisclosure(count: number): string {
  const one = count === 1;
  return `Cejel did not cite ${count} repository ${one ? 'path' : 'paths'} here because ${one ? 'it is' : 'they are'} longer than the report's ${REPORT_PATH_MAX}-character path limit. Every finding that cited ${one ? 'it' : 'one'} is kept, with that citation left out, and the score and status were computed with ${one ? 'it' : 'them'}. ${NO_SHORTENING}`;
}

/** Recognises the withheld-path statement, so the certificate does not also say nothing was withheld. */
export const OVER_LIMIT_WITHHELD_MARK = 'not listed in withheldPaths because';

/** The sentence for withheld paths left out of withheldPaths. */
export function overLimitWithheldPathsDisclosure(count: number, signals: readonly string[]): string {
  const one = count === 1;
  const it = one ? 'it' : 'them';
  const head = `${count} withheld repository ${one ? 'path is' : 'paths are'} ${OVER_LIMIT_WITHHELD_MARK} ${one ? 'it is' : 'they are'} longer than the report's ${REPORT_PATH_MAX}-character path limit; contentReadSummary still counts ${it}.`;
  const named = signals.length > 0 ? ` Checks that would have read ${it}: ${signals.join(', ')}.` : '';
  const counted =
    signals.length > 0 ? ` ${signals.length} ${signals.length === 1 ? 'check' : 'checks'} would have read ${it}.` : '';
  const withNames = `${head}${named} ${NO_SHORTENING}`;
  return withNames.length <= STATEMENT_MAX ? withNames : `${head}${counted} ${NO_SHORTENING}`;
}

/** True where a report states withheld paths it does not list (see overLimitWithheldPathsDisclosure). */
export function statesUnlistedWithheldPaths(
  criteria: readonly Pick<WitanCriterionScore, 'disclosures' | 'notes'>[],
): boolean {
  return criteria.some(
    ({ disclosures, notes }) =>
      (disclosures ?? []).some((sentence) => sentence.includes(OVER_LIMIT_WITHHELD_MARK)) ||
      notes?.includes(OVER_LIMIT_WITHHELD_MARK) === true,
  );
}

const DISCLOSURES_MAX = 4;
const STATEMENT_MAX = 1000;

/**
 * Put a statement on a criterion: in its disclosures, or, where the four the schema allows are
 * used, appended to its notes. Neither moves a score, status, badge or gate. Only where the notes
 * cannot hold it either is it returned as a scan limitation naming the criterion, so that it is
 * never left unstated.
 */
function stateOn(
  criterion: WitanCriterionScore,
  sentence: string,
): { criterion: WitanCriterionScore; limitation?: string } {
  const disclosures = criterion.disclosures ?? [];
  if (disclosures.length < DISCLOSURES_MAX) {
    return { criterion: { ...criterion, disclosures: [...disclosures, sentence] } };
  }
  const notes = criterion.notes ? `${criterion.notes} ${sentence}` : sentence;
  if (notes.length <= STATEMENT_MAX) return { criterion: { ...criterion, notes } };
  return { criterion, limitation: `${criterion.id}: ${sentence}` };
}

export interface DroppedCitations {
  readonly criteria: WitanCriterionScore[];
  /** Statements that fit on no criterion: four disclosures used and no room left in the notes. */
  readonly overflowLimitations: string[];
}

/**
 * After scoring: remove every marked evidence pointer from each criterion's output, re-anchor every
 * finding that cited one on OVER_LIMIT_ANCHOR, and state on that criterion how many distinct paths
 * it did not cite. Then state the withheld paths left out of withheldPaths on one criterion: the
 * first, in report order, that a check reading them belongs to, else the report's first criterion.
 * Score, status and metrics are returned exactly as scored; a criterion with nothing to state is
 * returned unchanged.
 */
export function dropMarkedCitations(
  criteria: readonly WitanCriterionScore[],
  droppedWithheldPaths: readonly InputWithheldPath[] = [],
): DroppedCitations {
  const overflowLimitations: string[] = [];
  const fitted = criteria.map((criterion) => {
    const dropped = new Set<string>();
    const evidence = criterion.evidence.filter((pointer) => {
      if (!isMarked(pointer)) return true;
      dropped.add(pointer.path as string);
      return false;
    });
    const findings = criterion.findings.map((finding) => {
      if (!isMarked(finding.evidence)) return finding;
      dropped.add(finding.evidence.path as string);
      return { ...finding, evidence: { ...OVER_LIMIT_ANCHOR } };
    });
    if (dropped.size === 0) return criterion;
    const stated = stateOn({ ...criterion, evidence, findings }, overLimitCitationDisclosure(dropped.size));
    if (stated.limitation !== undefined) overflowLimitations.push(stated.limitation);
    return stated.criterion;
  });
  if (droppedWithheldPaths.length > 0) {
    const signals = [...new Set(droppedWithheldPaths.flatMap(({ signalsAdmitting }) => signalsAdmitting))].sort();
    const admitting = new Set(signals.map((signal) => signal.split('.')[0]));
    const index = Math.max(
      0,
      fitted.findIndex(({ id }) => admitting.has(id)),
    );
    const sentence = overLimitWithheldPathsDisclosure(droppedWithheldPaths.length, signals);
    const target = fitted[index];
    if (target === undefined) {
      overflowLimitations.push(sentence);
    } else {
      const stated = stateOn(target, sentence);
      if (stated.limitation !== undefined) overflowLimitations.push(stated.limitation);
      fitted[index] = stated.criterion;
    }
  }
  return { criteria: fitted, overflowLimitations };
}

const SCAN_LIMITATIONS_MAX = 16;

/**
 * Append the statements that fit on no criterion to the scan limitations. Throws, and so writes no
 * report, only where the schema's sixteen entries are already used; a drop is never left unstated.
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
