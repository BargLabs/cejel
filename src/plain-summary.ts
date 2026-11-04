import {
  WITAN_A2_HISTORY_APPLICABILITY_PREFIX,
  WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX,
  WITAN_A2_TENANT_ISOLATION_UNSETTLED_DISCLOSURE,
  WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE,
  WITAN_A4_LOCKFILE_COVERAGE_NOT_COMPUTED_PREFIX,
  WITAN_A4_LOCKFILE_REQUIREMENT_NOT_DETERMINED_PREFIX,
  WITAN_A5_RECONCILIATION_UNSETTLED_DISCLOSURE,
  WITAN_B2_UNCREDITED_CI_WORKFLOW_PREFIX,
  WITAN_B3_PUBLISHING_CI_WORKFLOW_PREFIX,
  WITAN_B3_UNCREDITED_CI_WORKFLOW_PREFIX,
  WITAN_B3_UNSHOWN_CHECK_PREFIX,
  WITAN_NO_MEASUREMENT_REASON,
  renderWitanAbstentionLabel,
} from './witan/abstention.js';
import {
  buildRelyingPartySummary,
  formatCertificateMetricLabel,
  formatCertificateMetricValue,
  isCoverageNotMeasured,
  isCoveragePercentageUnpublished,
} from './witan/certificate-presentation.js';
import { computeMeasuredCoverage } from './witan/coverage.js';
import { isProspectiveRubricVersion } from './witan/rubric-version.js';
import { METRIC_DERIVED_FINDING_PATTERN } from './witan/finding-presentation.js';
import {
  SHALLOW_HISTORY_LIMITATION,
  SHALLOW_HISTORY_V27_ABSTENTION,
  WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON,
  WITAN_V27_SHALLOW_HISTORY_REASON,
} from './witan/history-depth.js';
import {
  type NextCheckKind,
  PLAIN_INSUFFICIENT_SOURCE_KINDS,
  type PlainDisclosureKind,
  type PlainInsufficientSourceKind,
  type PlainReadGapFileAdvice,
  type PlainScanLimitationKind,
  resolveNextCheck,
} from './witan/next-checks.js';
import { usesV27FalseAssuranceClosure } from './witan/repo-signals.js';
import type {
  WitanCriterionMetric,
  WitanCriterionScore,
  WitanEvidencePointer,
  WitanFinding,
  WitanReport,
  WitanScoredVerdict,
  WitanWithheldPath,
} from './witan/schemas.js';

// goal_cejel_four_question_summary_2026-11-02. A first-time reader could not tell what a result
// meant. buildPlainSummary reduces a report to four lists in plain words: what holds, what is
// wrong, what is not known, and what to check next. It is pure and deterministic, reads only the
// typed WitanReport, and adds no evidence claim: every line restates something the report records,
// in fixed reviewed words. Presentation only: nothing here feeds a score, status, verdict,
// report.json or attestation.json byte.
//
// Rules the lists keep (the lessons the card names):
// - A criterion that was not examined, or recorded no measurement and no evidence, is never listed
//   as holding; it is listed as not known.
// - Nothing is dropped: an unrecognised finding, disclosure or limitation is listed as itself when
//   its own words are plain, and by a fixed sentence pointing to the certificate when they are not.
// - Counts share the certificate's denominators (computeMeasuredCoverage), or name the difference.
// - No text on the first page uses the engine's vocabulary or an assurance word (PLAIN_WORD_GUARD).

export type PlainSource =
  | { kind: 'verdict' }
  | { kind: 'criterion'; criterionId: string }
  | { kind: 'finding'; criterionId: string; findingIndex: number }
  | { kind: 'disclosure'; criterionId: string; disclosureIndex: number }
  | { kind: 'criterion-note'; criterionId: string }
  | { kind: 'scan-limitation'; limitationIndex: number }
  | { kind: 'history-limitation'; limitationIndex: number }
  | { kind: 'content-reads' }
  | { kind: 'not-established' };

export interface PlainItem {
  /** Stable within a report, e.g. "wrong/finding/A5/0". */
  readonly id: string;
  /** The area of the repository the line is about, in plain words. */
  readonly area: string;
  /** One plain sentence. */
  readonly text: string;
  /** A file path (with line) or URL quoted verbatim from the report, when the source names one. */
  readonly location?: string;
  readonly source: PlainSource;
  /** The id of the element in certificate.html that holds the source. */
  readonly anchor: string;
}

export interface PlainWrongItem extends PlainItem {
  readonly level: 'critical' | 'warning';
}

export interface PlainCheckNextItem {
  readonly id: string;
  /** The id of the Wrong or Not known item this line serves. */
  readonly for: string;
  readonly area: string;
  /** The next-checks table key the line came from, or the key that had no entry. */
  readonly key: string;
  readonly text: string;
  /** False when no table entry exists and the line points to the certificate instead. */
  readonly fromTable: boolean;
  readonly anchor: string;
}

export interface PlainSummary {
  /**
   * Present when the report's rubric is prospective (v27): the certificate hero's uncalibrated
   * notice in plain words, shown above the verdict line (v2 item E).
   */
  readonly prospectiveNotice?: string;
  /** The verdict and score in words, one sentence. */
  readonly verdictLine: string;
  /** What the result does not cover, one sentence. */
  readonly notCovered: string;
  /** The certificate's own counts: criteria measured, criteria in the report, and how many do not apply. */
  readonly areas: { readonly measured: number; readonly total: number; readonly notApplicable: number };
  readonly areasLine: string;
  readonly holds: readonly PlainItem[];
  /** Present exactly when What holds is empty: the one sentence saying why (v2 item C). */
  readonly holdsNote?: string;
  /** Present when a listed area scores below 4: its label and its score are set separately (v2 item D). */
  readonly holdsLead?: string;
  readonly wrong: readonly PlainWrongItem[];
  /** Present when the Wrong count differs from the certificate's findings list; names the difference. */
  readonly wrongNote?: string;
  readonly notKnown: readonly PlainItem[];
  readonly checkNext: readonly PlainCheckNextItem[];
}

// ---- anchors in certificate.html ----------------------------------------------------------------

export const PLAIN_ANCHOR_VERDICT = 'cejel-src-verdict';
export const PLAIN_ANCHOR_NOT_ESTABLISHED = 'cejel-src-not-established';
export const PLAIN_ANCHOR_CONTENT_READS = 'cejel-src-content-reads';
export const plainCriterionAnchor = (criterionId: string): string => `cejel-src-criterion-${criterionId}`;
export const plainFindingAnchor = (criterionId: string, findingIndex: number): string =>
  `cejel-src-finding-${criterionId}-${findingIndex}`;
export const plainScanLimitationAnchor = (index: number): string => `cejel-src-scan-limitation-${index}`;
export const plainHistoryLimitationAnchor = (index: number): string => `cejel-src-history-limitation-${index}`;

// ---- plain words ---------------------------------------------------------------------------------

/**
 * Words kept off the first page: the engine's vocabulary (item C of the card, plus "criterion")
 * and assurance words Cejel never asserts. Text quoted from a report is shown only when it passes.
 */
export const PLAIN_WORD_GUARD: readonly RegExp[] = [
  /\brubrics?\b/i,
  /\bpin(?:s|ned|ning)?\b/i,
  /\b(?:A[1-5]|B[1-6])\b/,
  /\battestations?\b/i,
  /\bcomposites?\b/i,
  /\bbands?\b/i,
  /\bdimensions?\b/i,
  /\bsarif\b/i,
  /\bdigests?\b/i,
  /\bcriteri(?:on|a)\b/i,
  /\bsafe(?:ly|ty)?\b/i,
  /\bsecure(?:ly)?\b/i,
  /\bcorrect(?:ly|ness)?\b/i,
  /\bcomplete(?:ly|ness)?\b/i,
  /\bcomplian(?:t|ce)\b/i,
];

export function isPlainText(text: string): boolean {
  return PLAIN_WORD_GUARD.every((pattern) => !pattern.test(text));
}

const PLAIN_AREA_NAMES: Readonly<Record<string, string>> = {
  A1: 'Tests',
  A2: 'Secrets and data isolation',
  A3: 'Production readiness',
  A4: 'Dependencies',
  A5: 'Documentation claims against the code',
  B1: 'Records of automated work',
  B2: 'Pull request history',
  B3: 'Automated checks (CI)',
  B4: 'Change and audit records',
  B5: 'Recorded lessons',
  B6: 'Human approval for privileged operations',
  'validation-integrity': 'Backtest and validation process',
  calibration: 'Model and strategy calibration',
  'promotion-governance': 'Strategy promotion approvals',
  'risk-governance': 'Risk limits and oversight',
  'execution-integrity': 'Live execution',
  'real-outcome-evidence': 'Real trading outcomes',
  'data-confidence': 'Market data feeds',
  'audit-completeness': 'Audit trail',
  'claim-reality': 'Claims against reality',
};

/** The plain name of a criterion's area; an unrecognised criterion is shown by its own title. */
export function plainAreaName(criterion: Pick<WitanCriterionScore, 'id' | 'title'>): string {
  const known = PLAIN_AREA_NAMES[criterion.id];
  if (known !== undefined) return known;
  return isPlainText(criterion.title) ? criterion.title : 'Another area Cejel looks at';
}

const SCORED_VERDICT_LABELS: Readonly<Record<WitanScoredVerdict, string>> = {
  verified: 'Verified',
  conditional: 'Conditional',
  at_risk: 'At risk',
  unverified: 'Unverified',
};

const VERDICT_SCALE = '(from best to worst, the results are Verified, Conditional, At risk and Unverified)';

/**
 * v2 item E: PROSPECTIVE_RUBRIC_NOTICE (rubric-version.ts), which the certificate's hero carries,
 * in plain words: prospective, not calibrated, no precision or recall claim, not comparable.
 */
export const PLAIN_PROSPECTIVE_NOTICE =
  'Prospective, not calibrated: this result uses a trial version of the scoring rules that has not been calibrated, so its score, verdict and findings carry no precision or recall claim (no claim about how often they are right or what they miss) and cannot be compared with a result under the default rules.';

export const PLAIN_NOT_COVERED =
  "What this result does not cover: Cejel read the repository's files and history and did not run the code or its tests, so this result does not show that the code works as intended or that it has no vulnerabilities.";

// ---- no overall result: the reason, in plain words (v2 item B) ------------------------------------
//
// Every insufficientSourceReason the engine produces is recognised by its producer's fixed wording
// and given one plain sentence, built from the reason's own counts where it has them. The #635
// version printed one sentence ("found no source code here that it can rate") for every reason,
// which was false for most of them. A reason no entry matches (a caller-supplied one, or a new
// producer) is shown as PLAIN_INSUFFICIENT_SOURCE_FALLBACK.

export const PLAIN_INSUFFICIENT_SOURCE_FALLBACK = 'Cejel could not rate the source here; see the certificate below.';

const NO_MEASUREMENT_COVERAGE_PATTERN = new RegExp(
  `^${escapeRegExp(WITAN_NO_MEASUREMENT_REASON)} Source coverage: (\\d+) of (\\d+) source-shaped files \\(([\\d.]+)%\\) are criterion-ratable, below the (\\d+)% reviewable-source threshold \\((\\d+) tracked files in total\\)\\.$`,
);

const INSUFFICIENT_SOURCE_TABLE: ReadonlyArray<{
  readonly kind: Exclude<PlainInsufficientSourceKind, 'other'>;
  readonly pattern: RegExp;
  readonly plain: (match: RegExpExecArray) => string;
}> = [
  {
    kind: 'shallow-history',
    pattern: new RegExp(`^${escapeRegExp(WITAN_V27_SHALLOW_HISTORY_REASON)}$`),
    plain: () =>
      "Cejel read a shallow clone (only part of the commit history), and under these scoring rules a shallow clone gets no score and no verdict; each area's own reading is still shown in the certificate below.",
  },
  {
    kind: 'history-depth-unknown',
    pattern: new RegExp(`^${escapeRegExp(WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON)}$`),
    plain: () =>
      "Cejel could not tell how much of the commit history it read, and under these scoring rules that gives no score and no verdict; each area's own reading is still shown in the certificate below.",
  },
  {
    kind: 'no-measurement',
    pattern: new RegExp(`^${escapeRegExp(WITAN_NO_MEASUREMENT_REASON)}$`),
    plain: () => 'None of the checks Cejel runs produced a measurement here, so it gives no score rather than a zero.',
  },
  {
    kind: 'no-measurement-source-coverage',
    pattern: NO_MEASUREMENT_COVERAGE_PATTERN,
    plain: (m) =>
      `None of the checks Cejel runs produced a measurement here, and only ${m[1]} of ${m[2]} source-shaped files (${m[3]}%) are files those checks rate, below the ${m[4]}% Cejel needs; it gives no score rather than a zero.`,
  },
  {
    kind: 'empty',
    pattern: /^Repository has no tracked files — there is nothing to certify\.$/,
    plain: () => 'The repository has no tracked files, so there is nothing to rate.',
  },
  {
    kind: 'ignored-target',
    pattern: /^The requested scan path \(.*\) is excluded by this repository's Git ignore rules, so Cejel found no tracked source to evaluate\./s,
    plain: () => "The folder scanned is excluded by the repository's Git ignore rules, so Cejel found no tracked files there to rate.",
  },
  {
    kind: 'generated-only',
    pattern:
      /^(\d+) of (\d+) source-shaped file\(s\) are under generated, vendor, build, distribution, coverage, or bundled-asset paths; only (\d+) authored source-shaped file\(s\) remain\./,
    plain: (m) =>
      `${m[1]} of ${m[2]} source-shaped files are generated, vendored or built output, and only ${m[3]} written by hand remain, too few to rate.`,
  },
  {
    kind: 'independent-catalog',
    pattern:
      /^(\d+) of (\d+) source-shaped file\(s\) are under independent solution, exercise, challenge, or algorithm catalog paths; only (\d+) source-shaped file\(s\) remain outside that catalog\./,
    plain: (m) =>
      `${m[1]} of ${m[2]} source-shaped files sit in separate solution, exercise, challenge or algorithm folders, so there is no single product to rate.`,
  },
  {
    kind: 'docs-source-role',
    pattern: /^(\d+) source-shaped file\(s\) are tests\/fixtures around a documentation tree; no authored product source remains\./,
    plain: () => 'The only source-shaped files are tests or fixtures around documentation, so there is no product source to rate.',
  },
  {
    kind: 'artifact-dominance',
    pattern: /^(\d+) authored source-shaped file\(s\) accompany (\d+) packaged, font, image, or media artifact\(s\)/,
    plain: (m) =>
      `Only ${m[1]} hand-written source-shaped ${m[1] === '1' ? 'file sits' : 'files sit'} beside ${m[2]} packaged, font, image or media files, too little of the repository to rate.`,
  },
  {
    kind: 'binary-distribution',
    pattern: /^0 source file\(s\) found among (\d+) tracked file\(s\); repo appears to be a binary\/bundled-distribution tree/,
    plain: (m) =>
      `No source file was found among ${m[1]} tracked files; the repository looks like packaged or bundled files, and Cejel rates source, not packaged files.`,
  },
  {
    kind: 'docs-distribution',
    pattern: /^0 source file\(s\) found among (\d+) tracked file\(s\); repo appears to be a docs\/distribution tree/,
    plain: (m) =>
      `No source file was found among ${m[1]} tracked files; the repository looks like documentation and media, and Cejel rates source, not documents.`,
  },
  {
    kind: 'readable-representation',
    pattern:
      /^Readable source representation covers ([\d.]+) of (\d+) authored source-shaped file\(s\) \(([\d.]+)%\); this is below the (\d+)% representation threshold\./,
    plain: (m) =>
      `Only ${m[1]} of ${m[2]} hand-written source-shaped files (${m[3]}%) could be read as ordinary text, below the ${m[4]}% Cejel needs; the rest look compressed, binary or otherwise unreadable.`,
  },
  {
    kind: 'semantic-auxiliary-only',
    pattern: /^(\d+) (?:redirect metadata|package metadata|localization or style metadata) file\(s\) provide no representative product implementation\./,
    plain: () =>
      'The only source-shaped files are translation, style, package-recipe or redirect files, with no product code to rate.',
  },
  {
    kind: 'semantic-auxiliary-dominant',
    pattern: /^(\d+) of (\d+) authored source-shaped file\(s\) are localization, style, package, or redirect auxiliary material\./,
    plain: (m) =>
      `${m[1]} of ${m[2]} hand-written source-shaped files are translation, style, package-recipe or redirect files, too little product code to rate.`,
  },
  {
    kind: 'unrecognised-ecosystem',
    pattern: /^Cejel does not yet read this repository's dominant source language\(s\) \(([^)]*)\) — /,
    plain: (m) => {
      const sample = m[1] ?? '';
      return `Most of the source is in a language Cejel does not read yet${sample && isPlainText(sample) ? ` (${sample})` : ''}, so it gives no score.`;
    },
  },
];

/** The kind of an insufficientSourceReason, or 'other' when no table entry matches. */
export function insufficientSourceKind(reason: string): PlainInsufficientSourceKind {
  return INSUFFICIENT_SOURCE_TABLE.find(({ pattern }) => pattern.test(reason))?.kind ?? 'other';
}

/** One plain sentence for an insufficientSourceReason; the fallback when its kind is not known. */
export function plainInsufficientSourceSentence(reason: string): string {
  for (const entry of INSUFFICIENT_SOURCE_TABLE) {
    const match = entry.pattern.exec(reason);
    if (match) return entry.plain(match);
  }
  return PLAIN_INSUFFICIENT_SOURCE_FALLBACK;
}

export { PLAIN_INSUFFICIENT_SOURCE_KINDS };

const SETTLING_SENTENCES: ReadonlyArray<{ criterionId: string; sentence: string; plain: string }> = [
  {
    criterionId: 'A2',
    sentence: WITAN_A2_TENANT_ISOLATION_UNSETTLED_DISCLOSURE,
    plain: "Whether one tenant's data is kept apart from another's outside the database cannot be told from the files; Cejel makes no finding on it.",
  },
  {
    criterionId: 'A3',
    sentence: WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE,
    plain: 'Whether this package has a build or type-check step outside the files Cejel read cannot be told from the files; Cejel makes no finding on it.',
  },
  {
    criterionId: 'A5',
    sentence: WITAN_A5_RECONCILIATION_UNSETTLED_DISCLOSURE,
    plain: "Whether the documentation's claims match the code cannot be told from the files alone; Cejel makes no finding on it.",
  },
];

const DISCLOSURE_PREFIXES: ReadonlyArray<{ prefix: string; kind: Exclude<PlainDisclosureKind, 'other'> }> = [
  { prefix: WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX, kind: 'placeholder-set-aside' },
  { prefix: WITAN_B3_UNSHOWN_CHECK_PREFIX, kind: 'unshown-check' },
  { prefix: WITAN_A2_HISTORY_APPLICABILITY_PREFIX, kind: 'history-applicability' },
  { prefix: WITAN_B2_UNCREDITED_CI_WORKFLOW_PREFIX, kind: 'uncredited-ci' },
  { prefix: WITAN_B3_UNCREDITED_CI_WORKFLOW_PREFIX, kind: 'uncredited-ci' },
  { prefix: WITAN_B3_PUBLISHING_CI_WORKFLOW_PREFIX, kind: 'publishing-ci' },
  { prefix: WITAN_A4_LOCKFILE_COVERAGE_NOT_COMPUTED_PREFIX, kind: 'lockfile-not-computed' },
  { prefix: WITAN_A4_LOCKFILE_REQUIREMENT_NOT_DETERMINED_PREFIX, kind: 'lockfile-requirement-not-determined' },
];

const DISCLOSURE_SENTENCES: Readonly<Record<Exclude<PlainDisclosureKind, 'other'>, string>> = {
  'placeholder-set-aside':
    'Cejel set aside some password- or key-like values as documentation examples rather than real secrets.',
  'unshown-check': 'Some workflows were counted as automated checks although Cejel did not see them run a check.',
  'history-applicability': 'Cejel decided this area does not apply after reading only part of the commit history.',
  'uncredited-ci': 'Some workflows were not counted because Cejel did not see them run a check.',
  'publishing-ci':
    'Some workflows that publish, release or deploy without a pull request trigger were not counted as automated checks.',
  'lockfile-not-computed':
    "Cejel did not score lockfile coverage: the repository's own CI expects a lockfile that is not committed.",
  'lockfile-requirement-not-determined':
    'Cejel could not tell whether this repository needs a lockfile, so it did not score lockfile coverage.',
};

/**
 * Plain wording for the absence findings that name the exact pattern set behind their zero result
 * (finding.derivation.patternSetId, repo-signals.ts). Each says what the detector's own summary
 * says, and names the evidence looked for. Any other finding is shown in its own words.
 */
const PLAIN_ABSENCE_FINDINGS: Readonly<Record<string, string>> = {
  'cejel.core-a1.test-integrity-surface.v1':
    'There is source code, but Cejel found no test file, test runner, CI test command or coverage settings in the files it checked.',
  'cejel.core-a1.concrete-test-files.v1':
    'A test runner is set up, but Cejel found no test file in the files it checked.',
  'cejel.core-a1.coverage-configuration.v3':
    'There are test files, but Cejel found no coverage settings in the files it checked.',
  'cejel.core-a1.coverage-configuration.v4':
    'There are test files, but Cejel found no coverage settings in the files it checked.',
  'cejel.core-a2.current-secret-shape.v1':
    'A .env file that is not a template is committed, though Cejel found no password- or key-like value in the files it scanned.',
  'cejel.core-a2.rls-policy.v1':
    'The data appears to be split by tenant, but Cejel found no row-level security policy in the files it checked.',
  'cejel.core-a3.ci-or-release-deploy.v1':
    'This looks like a deployable service, but Cejel found no CI workflow or release automation in the files it checked.',
  'cejel.core-a4.lockfile.v1':
    'There is a dependency manifest, but Cejel found no lockfile it recognises in the files it checked.',
  'cejel.core-a5.declared-claim-artifact-path.v1':
    'The repository says it keeps a record checking its claims at a path that is not among the files Cejel checked.',
  'cejel.core-a5.claim-reality-artifact.v1':
    'There are documents making claims and there is code, but Cejel found no record that checks those claims against the code.',
};

/** Every fixed sentence and area name this module can print, so a test can check each is plain. */
export function plainSummaryFixedSentences(): string[] {
  return [
    ...Object.values(PLAIN_AREA_NAMES),
    PLAIN_INSUFFICIENT_SOURCE_FALLBACK,
    PLAIN_HOLDS_LEAD,
    PLAIN_PROSPECTIVE_NOTICE,
    ...SETTLING_SENTENCES.map(({ plain }) => plain),
    ...Object.values(DISCLOSURE_SENTENCES),
    ...Object.values(PLAIN_ABSENCE_FINDINGS),
    PLAIN_NOT_COVERED,
    VERDICT_SCALE,
  ];
}

function disclosureKind(sentence: string): PlainDisclosureKind {
  return DISCLOSURE_PREFIXES.find(({ prefix }) => sentence.startsWith(prefix))?.kind ?? 'other';
}

// ---- limitations, reworded (goal_cejel_four_question_summary_v2_2026-11-03, item A) ---------------
//
// A scan or history limitation is never replaced by a generic sentence because its text holds an
// engine word. The limitations the engine writes with a fixed shape are reworded through
// LIMITATION_TABLE, each entry restating the producer's sentence (repo-signals.ts and
// history-depth.ts). Any other limitation is reworded word by word through PLAIN_VOCABULARY, which
// covers every word PLAIN_WORD_GUARD keeps off the page, so the result is always plain and always
// says what the limitation says.

const PLAIN_VOCABULARY: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcriteria\b/gi, 'areas'],
  [/\bcriterion\b/gi, 'area'],
  [/\brubrics\b/gi, 'sets of scoring rules'],
  [/\brubric\b/gi, 'scoring rules'],
  [/\bpinned\b/gi, 'fixed'],
  [/\bpinning\b/gi, 'fixing'],
  [/\bpins\b/gi, 'fixed versions'],
  [/\bpin\b/gi, 'fixed version'],
  [/\battestations\b/gi, 'signed records'],
  [/\battestation\b/gi, 'signed record'],
  [/\bcomposites\b/gi, 'overall scores'],
  [/\bcomposite\b/gi, 'overall score'],
  [/\bbands\b/gi, 'ranges'],
  [/\bband\b/gi, 'range'],
  [/\bdimensions\b/gi, 'areas'],
  [/\bdimension\b/gi, 'area'],
  [/\bsarif\b/gi, 'scanner report'],
  [/\bdigests\b/gi, 'fingerprints'],
  [/\bdigest\b/gi, 'fingerprint'],
  [/\bsafely\b/gi, 'without harm'],
  [/\bsafety\b/gi, 'protection'],
  [/\bsafe\b/gi, 'harmless'],
  [/\bsecurely\b/gi, 'with protection'],
  [/\bsecure\b/gi, 'protected'],
  [/\bcorrectly\b/gi, 'accurately'],
  [/\bcorrectness\b/gi, 'accuracy'],
  [/\bcorrect\b/gi, 'accurate'],
  [/\bcompletely\b/gi, 'fully'],
  [/\bcompleteness\b/gi, 'coverage'],
  [/\bcomplete\b/gi, 'full'],
  [/\bcompliant\b/gi, 'conforming'],
  [/\bcompliance\b/gi, 'conformance'],
];

function matchCase(original: string, replacement: string): string {
  const first = original.charAt(0);
  return first !== first.toLowerCase() ? `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}` : replacement;
}

/** An area id ("A3"), or a measurement id ("A3.observability_depth"), in plain words. */
function plainCriterionReference(id: string, measurement?: string): string {
  const area = PLAIN_AREA_NAMES[id] ?? 'another';
  return measurement === undefined
    ? `"${area}" area`
    : `"${measurement.replaceAll('_', ' ')}" (${area})`;
}

/** Engine text reworded word by word; the meaning is kept and the result is always plain. */
export function rewordInPlainWords(text: string): string {
  let result = text
    .replace(/\b(A[1-5]|B[1-6])\.([A-Za-z0-9_]+)\b/g, (_match, id: string, measurement: string) =>
      plainCriterionReference(id, measurement),
    )
    .replace(/\b(A[1-5]|B[1-6])\b/g, (_match, id: string) => plainCriterionReference(id));
  for (const [pattern, replacement] of PLAIN_VOCABULARY) {
    result = result.replace(pattern, (match) => matchCase(match, replacement));
  }
  return result;
}

const areas = (count: string): string => `${count} ${count === '1' ? 'area' : 'areas'}`;
const measurements = (count: string): string => `${count} ${count === '1' ? 'measurement' : 'measurements'}`;
const measurementList = (list: string): string => rewordInPlainWords(list);

/**
 * The limitations with a fixed shape, each reworded. `pattern` matches the producer's sentence
 * exactly (its counts and lists are captured); `plain` restates it.
 */
const LIMITATION_TABLE: ReadonlyArray<{
  readonly key: string;
  readonly pattern: RegExp;
  readonly plain: (match: RegExpExecArray) => string;
}> = [
  {
    key: 'content-unreadable',
    pattern:
      /^(\d+) (?:criterion|criteria) abstained because relevant repository content could not be read(?: and the affected signal could not be isolated)?\. Counts and errno classes are recorded in contentReadSummary; file paths are intentionally omitted\.$/,
    plain: (m) =>
      `${areas(m[1] ?? '')} gave no score because files ${m[1] === '1' ? 'it reads' : 'they read'} could not be read; the certificate below counts those files by cause and does not name them.`,
  },
  {
    key: 'content-declined',
    pattern:
      /^(\d+) (?:criterion|criteria) abstained because relevant repository content was declined under the repository content size limit or excluded from scanning by policy(?: — a disclosed coverage limit, not a read failure\. This does not affect the composite score\.|, and the affected signal could not be isolated\. This is a disclosed coverage limit, not a read failure, and does not affect the composite score\.)$/,
    plain: (m) =>
      `${areas(m[1] ?? '')} gave no score because files ${m[1] === '1' ? 'it reads' : 'they read'} were over Cejel's size limit or are left out of scanning by its rules; this is a stated limit, not a read failure, and it does not change the overall score.`,
  },
  {
    key: 'signal-unreadable',
    pattern:
      /^(\d+) signals? abstained because its own repository content could not be read, while other signals in the same criterion were unaffected: (.+)\.$/,
    plain: (m) =>
      `${measurements(m[1] ?? '')} gave no reading because a file ${m[1] === '1' ? 'it reads' : 'each reads'} could not be read; the other measurements in the same area were not affected: ${measurementList(m[2] ?? '')}.`,
  },
  {
    key: 'signal-large-file',
    pattern:
      /^(\d+) signals? declined a large implementation file that exceeded the repository content size limit, while other signals in the same criterion were unaffected: (.+)\. That file is undercounted, not scored as clean or absent — this is a disclosed coverage limit, not a read failure\.$/,
    plain: (m) =>
      `${measurements(m[1] ?? '')} skipped a source file over Cejel's size limit; the other measurements in the same area were not affected: ${measurementList(m[2] ?? '')}. That file is counted as not read, not as clean or absent; this is a stated limit, not a read failure.`,
  },
  {
    key: 'signal-other-declined',
    pattern:
      /^(\d+) signals? declined under an extension exclusion or a non-regular-file skip, while other signals in the same criterion were unaffected: (.+)\. This is a disclosed coverage limit, not a read failure\.$/,
    plain: (m) =>
      `${measurements(m[1] ?? '')} skipped a file of a type Cejel does not read, or one that is not a regular file; the other measurements in the same area were not affected: ${measurementList(m[2] ?? '')}. This is a stated limit, not a read failure.`,
  },
  {
    key: 'limitations-capped',
    pattern: /^(\d+) additional disclosed scan limitation\(s\) omitted at the 16-entry cap — see contentReadSummary for full counts\.$/,
    plain: (m) =>
      `${m[1]} more ${m[1] === '1' ? 'limit' : 'limits'} on what was read ${m[1] === '1' ? 'is' : 'are'} not listed, because the report keeps at most 16; the certificate below has the full counts.`,
  },
  {
    key: 'shallow-history',
    pattern: new RegExp(`^${escapeRegExp(SHALLOW_HISTORY_LIMITATION)}$`),
    plain: () =>
      'This is a shallow clone, so its commit history is cut short. Secrets and data isolation looks for credentials and .env files in earlier commits and saw only the commits present; on a full clone its result may differ. Pull request history leaves out its merge count when fewer commits are present than it reads, and is then rated on the CI workflows, pull request template and review records in the files.',
  },
  {
    key: 'shallow-history-no-verdict',
    pattern: new RegExp(`^${escapeRegExp(SHALLOW_HISTORY_V27_ABSTENTION)}$`),
    plain: () =>
      'This is a shallow clone, so its commit history is cut short, and under these scoring rules a shallow clone gets no overall score and no verdict; each area is still read and shown. Secrets and data isolation gives no score unless a confirmed critical secret finding stands, because its decision rests on scans of earlier commits. Pull request history leaves out its merge count when fewer commits are present than it reads, and is rated on the CI workflows it counts, the pull request template and review records in the files, or gives no score where none of those remains.',
  },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A scan or history limitation in plain words: its table entry, or its own words reworded. */
export function plainLimitation(limitation: string): string {
  for (const entry of LIMITATION_TABLE) {
    const match = entry.pattern.exec(limitation);
    if (match) return entry.plain(match);
  }
  return rewordInPlainWords(limitation);
}

/** The table entry a limitation matches, or undefined when it is reworded word by word. */
function limitationTableKey(limitation: string): string | undefined {
  return LIMITATION_TABLE.find((entry) => entry.pattern.test(limitation))?.key;
}

/** The limitation table's keys, so a test can pin them. */
export function plainLimitationTableKeys(): string[] {
  return LIMITATION_TABLE.map(({ key }) => key);
}

const SHALLOW_HISTORY_LIMITATIONS: readonly string[] = [SHALLOW_HISTORY_LIMITATION, SHALLOW_HISTORY_V27_ABSTENTION];

/** The area ids a limitation names, by id or by measurement id. */
function criteriaNamedIn(text: string): Set<string> {
  return new Set([...text.matchAll(/\b(A[1-5]|B[1-6])\b/g)].map((match) => match[1] ?? ''));
}

// #654 review, should-fix 2 and 3: an area that was not read says why in its own terms, and its
// check-next line follows that cause. The cause comes only from what the report ties to the area:
// the engine's abstention note on the criterion (repo-signals.ts, wholesaleCriterionAbstention, one
// fixed sentence per cause), or the kind of the scan limitation that names it. The report-wide
// contentReadSummary counts are used only to narrow a note that says "could not be read" to the one
// read-failure cause the report holds, never to add a cause the area does not carry.

/** Why files an area reads were not read, as the report ties it to that area. */
type FileGapCause =
  | 'unreadable'
  | 'lfs'
  | 'read-failure'
  | 'stated-limit'
  | 'size-limit'
  | 'excluded'
  | 'limit'
  | 'unstated';
const FILE_GAP_CAUSE_ORDER: readonly FileGapCause[] = [
  'unreadable',
  'lfs',
  'read-failure',
  'stated-limit',
  'size-limit',
  'excluded',
  'limit',
  'unstated',
];

interface ReadGap {
  readonly files: Set<FileGapCause>;
  history?: 'shallow' | 'other';
}

const NOTE_LFS_PREFIX =
  'Cejel abstained on this criterion because relevant files in this checkout are Git LFS pointers';
const NOTE_DECLINED_PREFIX =
  'Cejel abstained on this criterion because relevant repository content was declined under the repository content size limit or excluded from scanning by policy';
const NOTE_READ_FAILURE_PREFIX =
  'Cejel abstained on this criterion because one or more relevant repository files could not be read';

/**
 * The read-failure cause behind a "could not be read" statement: Git LFS pointers, or unreadable
 * files, when the report counts only that read-failure cause; otherwise the general statement.
 * A Git LFS pointer is tied to an area only under a rubric that attributes it (v27).
 */
function readFailureCause(report: WitanReport): 'unreadable' | 'lfs' | 'read-failure' {
  const byReason = report.contentReadSummary?.byReason;
  if (!byReason) return 'read-failure';
  const lfs = (byReason.lfsPointer ?? 0) > 0 && usesV27FalseAssuranceClosure(report.rubricVersion);
  const present = [byReason.unreadable > 0, byReason.deniedPath > 0, lfs].filter(Boolean).length;
  if (present !== 1) return 'read-failure';
  if (byReason.unreadable > 0) return 'unreadable';
  return lfs ? 'lfs' : 'read-failure';
}

/**
 * The cause an area's own wholesale abstention note states (contentReadSummary.affectedCriteria),
 * or undefined for any other note: a v23 per-measurement note, whose causes the scan limitation
 * naming the area's measurements carries, or a note no producer here writes.
 */
function abstentionNoteCause(report: WitanReport, criterion: WitanCriterionScore | undefined): FileGapCause | undefined {
  const notes = criterion?.notes ?? '';
  if (notes.startsWith(NOTE_LFS_PREFIX)) return 'lfs';
  if (notes.startsWith(NOTE_DECLINED_PREFIX)) return 'stated-limit';
  if (notes.startsWith(NOTE_READ_FAILURE_PREFIX)) return readFailureCause(report);
  return undefined;
}

/** The cause a scan limitation that names an area states, by its table entry. */
function limitationCause(report: WitanReport, limitation: string): FileGapCause {
  switch (limitationTableKey(limitation)) {
    case 'signal-unreadable':
      return readFailureCause(report);
    case 'signal-large-file':
      return 'size-limit';
    case 'signal-other-declined':
      return 'excluded';
    default:
      return 'limit';
  }
}

/**
 * The cause a scan limitation's check-next line follows (#654 review, should-fix 4). "N areas gave
 * no score because files they read could not be read" is narrowed by those areas' own notes: Git
 * LFS pointers when every one of them names Git LFS pointers, unreadable files when the report
 * counts only those.
 */
function scanLimitationKind(report: WitanReport, limitation: string): PlainScanLimitationKind {
  switch (limitationTableKey(limitation)) {
    case 'content-unreadable': {
      const causes = new Set(
        (report.contentReadSummary?.affectedCriteria ?? [])
          .map((id) => abstentionNoteCause(report, report.criteria.find((criterion) => criterion.id === id)))
          .filter((cause) => cause !== undefined && cause !== 'stated-limit'),
      );
      const [only] = [...causes];
      return causes.size === 1 && (only === 'lfs' || only === 'unreadable') ? only : 'read-failure';
    }
    case 'signal-unreadable':
      return readFailureCause(report);
    case 'content-declined':
    case 'signal-large-file':
    case 'signal-other-declined':
      return 'stated-limit';
    case 'limitations-capped':
      return 'capped';
    default:
      return 'other';
  }
}

/** Every area the report says it could not fully read, and why: affectedCriteria, or named by a limitation. */
function readGaps(report: WitanReport): Map<string, ReadGap> {
  const gaps = new Map<string, ReadGap>();
  const gapFor = (id: string): ReadGap => {
    const existing = gaps.get(id);
    if (existing) return existing;
    const created: ReadGap = { files: new Set<FileGapCause>() };
    gaps.set(id, created);
    return created;
  };
  for (const limitation of report.scanLimitations ?? []) {
    for (const id of criteriaNamedIn(limitation)) gapFor(id).files.add(limitationCause(report, limitation));
  }
  for (const id of report.contentReadSummary?.affectedCriteria ?? []) {
    const cause = abstentionNoteCause(report, report.criteria.find((criterion) => criterion.id === id));
    // With no wholesale note, the cause is the limitation that names the area, or, when none does,
    // stated without one: "were not read", which is true of every cause.
    if (cause !== undefined) gapFor(id).files.add(cause);
    else if (!gaps.has(id)) gapFor(id).files.add('unstated');
  }
  for (const limitation of report.historyLimitations ?? []) {
    const shallow = SHALLOW_HISTORY_LIMITATIONS.includes(limitation);
    for (const id of criteriaNamedIn(limitation)) {
      const gap = gapFor(id);
      if (shallow) gap.history = 'shallow';
      else if (gap.history === undefined) gap.history = 'other';
    }
  }
  return gaps;
}

const FILE_GAP_CLAUSES: Readonly<Record<FileGapCause, string>> = {
  unreadable: 'some files this area reads could not be read',
  lfs: 'some files this area reads are Git LFS pointers, so their content is not in this checkout',
  'read-failure': 'some files this area reads could not be read (the certificate below counts them by cause)',
  'stated-limit':
    "some files this area reads were over Cejel's size limit or are left out of scanning by its rules, a stated limit rather than a read failure",
  'size-limit': "some source files this area reads were over Cejel's size limit, a stated limit rather than a read failure",
  excluded:
    'some files this area reads are of a type Cejel does not read or are not regular files, a stated limit rather than a read failure',
  limit: 'a limit on reading, listed under Reading the repository, applies to it',
  unstated: 'some files this area reads were not read (the certificate below counts them by cause)',
};

function readGapClauses(gap: ReadGap): string[] {
  const clauses = FILE_GAP_CAUSE_ORDER.filter((cause) => gap.files.has(cause)).map((cause) => FILE_GAP_CLAUSES[cause]);
  if (gap.history === 'shallow') {
    clauses.push('this is a shallow clone, so only part of the commit history it reads is present');
  } else if (gap.history === 'other') {
    clauses.push('only part of the commit history it reads could be read');
  }
  return clauses;
}

/** The advice a file cause takes (PLAIN_READ_GAP_FILE_ADVICE): the three stated limits share one. */
function fileGapAdvice(cause: FileGapCause): PlainReadGapFileAdvice {
  if (cause === 'size-limit' || cause === 'excluded') return 'stated-limit';
  // A cause the report does not state takes the advice that covers every cause.
  return cause === 'unstated' ? 'mixed' : cause;
}

/** The not-read table qualifier: the file advice, the history advice, or both (next-checks.ts). */
function readGapQualifier(gap: ReadGap): string {
  const advice = new Set([...gap.files].map(fileGapAdvice));
  const files = advice.size === 0 ? undefined : advice.size === 1 ? [...advice][0] : 'mixed';
  if (files !== undefined) return gap.history === 'shallow' ? `${files}-and-history` : files;
  return gap.history === 'shallow' ? 'history' : 'history-other';
}

// ---- helpers ---------------------------------------------------------------------------------------

const SEVERITY_RANK: Record<WitanFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function formatLocation(evidence: WitanEvidencePointer): string | undefined {
  if (evidence.path !== undefined && evidence.path !== '.') {
    return evidence.line ? `${evidence.path}:${evidence.line}` : evidence.path;
  }
  return evidence.url;
}

function normalizedMetricValue(metric: WitanCriterionMetric): number {
  if (metric.max === undefined) return 1;
  return Math.min(metric.value / metric.max, 1);
}

function byShortfall(left: WitanCriterionMetric, right: WitanCriterionMetric): number {
  const difference = normalizedMetricValue(left) - normalizedMetricValue(right);
  if (difference !== 0) return difference;
  if (left.weight !== right.weight) return right.weight - left.weight;
  return left.name.localeCompare(right.name);
}

/** The two measurements with the largest shortfall, as renderFindingSummary ranks them. */
function weakestMeasurementLabels(criterion: WitanCriterionScore): string[] {
  return criterion.metrics
    .filter((metric) => metric.max !== undefined && normalizedMetricValue(metric) < 1)
    .sort(byShortfall)
    .slice(0, 2)
    .map((metric) => formatCertificateMetricLabel(metric))
    .filter(isPlainText);
}

/** The strongest measurement in words ("Label, value"), when its words are plain. */
function strongestMeasurement(criterion: WitanCriterionScore): string | undefined {
  const [strongest] = criterion.metrics
    .filter((metric) => metric.max !== undefined)
    .sort((left, right) => byShortfall(right, left));
  if (strongest === undefined) return undefined;
  const text = `${formatCertificateMetricLabel(strongest)}, ${formatCertificateMetricValue(criterion, strongest)}`;
  return isPlainText(text) ? text : undefined;
}

// ---- the four lists ----------------------------------------------------------------------------------

interface PendingCheck {
  readonly item: PlainItem;
  readonly kind: NextCheckKind;
  readonly qualifier?: string;
  readonly section: string;
}

const SECTION_FINDINGS = 'Critical and warning findings';
const SECTION_AREA = "this area's card";
const SECTION_NOT_ESTABLISHED = 'What was not established';

function buildVerdictLine(report: WitanReport): string {
  if (report.verdict === 'insufficient_source') {
    return `No overall result (${renderWitanAbstentionLabel(report)}): Cejel gives no score and no verdict for this scan.`;
  }
  const label = SCORED_VERDICT_LABELS[report.verdict];
  const score = report.overallScore.toFixed(1);
  if (report.verdictCap) {
    return `Overall result: ${label}, lowered from ${SCORED_VERDICT_LABELS[report.verdictCap.uncappedVerdict]} because one area could not read the commit history of this shallow clone; the score is ${score} out of 4 ${VERDICT_SCALE}.`;
  }
  return `Overall result: ${label}, ${score} out of 4 ${VERDICT_SCALE}.`;
}

function buildAreasLine(areas: PlainSummary['areas']): string {
  const notApplicable =
    areas.notApplicable > 0 ? ` (${areas.notApplicable} ${plural(areas.notApplicable, 'does', 'do')} not apply here)` : '';
  return `Cejel measured ${areas.measured} of the ${areas.total} areas it looks at${notApplicable}.`;
}

function hasWrongFinding(criterion: WitanCriterionScore): boolean {
  return criterion.findings.some((finding) => finding.severity === 'critical' || finding.severity === 'warning');
}

const PLAIN_STATUS_LABELS: Readonly<Record<string, string>> = {
  verified: 'Verified',
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
  unverified: 'Unverified',
  insufficient_data: 'no score',
  not_applicable: 'does not apply',
};

function plainStatusLabel(status: string): string {
  return PLAIN_STATUS_LABELS[status] ?? 'a label this page does not describe';
}

function hasExaminedEvidence(criterion: WitanCriterionScore): boolean {
  return criterion.metrics.length > 0 || criterion.evidence.length > 0;
}

function buildHolds(report: WitanReport): PlainItem[] {
  if (report.verdict === 'insufficient_source') return [];
  return report.criteria
    .filter(
      (criterion) => (criterion.status === 'verified' || criterion.status === 'info') && hasExaminedEvidence(criterion),
    )
    .map((criterion) => {
      // v2 item D: the list is chosen by label, as before, and each line states the area's score.
      // The #635 version said "top level" for every Verified area, including B3 at 1.0 of 4. No
      // threshold is added: what the report labels Verified or Info is listed with its number, and
      // only the maximum is called the top score. holdsLead says the label and score can differ.
      const score = `at ${criterion.score.toFixed(1)} out of 4${criterion.score === 4 ? ', the top score' : ''}`;
      const lead =
        criterion.status === 'verified'
          ? `Rated Verified, ${score}.`
          : `Partly holds: rated Info, one label below Verified, ${score}.`;
      const strongest = strongestMeasurement(criterion);
      return {
        id: `holds/criterion/${criterion.id}`,
        area: plainAreaName(criterion),
        text: strongest ? `${lead} Strongest measurement: ${strongest}.` : lead,
        source: { kind: 'criterion', criterionId: criterion.id },
        anchor: plainCriterionAnchor(criterion.id),
      };
    });
}

export const PLAIN_HOLDS_LEAD =
  "Each area's label and its score out of 4 are set separately, so a Verified area can have a low score; each area's card in the certificate below compares the two.";

function scoreOf(report: WitanReport, item: PlainItem): number {
  const id = item.source.kind === 'criterion' ? item.source.criterionId : undefined;
  return report.criteria.find((criterion) => criterion.id === id)?.score ?? 0;
}

/**
 * v2 item C: the one sentence an empty What holds list prints, chosen by whether the scan has an
 * overall result and which labels Holds would list. Holds lists measured areas labelled Verified
 * or Info, so each sentence is true of exactly that case.
 */
function buildHoldsNote(report: WitanReport): string {
  const listedCount = (status: WitanCriterionScore['status']): number =>
    report.criteria.filter((criterion) => criterion.status === status && hasExaminedEvidence(criterion)).length;
  const verified = listedCount('verified');
  const info = listedCount('info');
  const labels = [verified > 0 ? 'Verified' : undefined, info > 0 ? 'Info' : undefined].filter(
    (label): label is string => label !== undefined,
  );
  const rated = verified + info;
  if (report.verdict !== 'insufficient_source') {
    return 'Nothing is listed here because Cejel rated no measured area Verified or Info.';
  }
  if (labels.length === 0) {
    return 'Nothing is listed here because Cejel gave no overall result for this scan, and it rated no measured area Verified or Info.';
  }
  return `Nothing is listed here because Cejel gave no overall result for this scan, although it rated ${rated === 1 ? 'one area' : `${rated} areas`} ${joinOr(labels)}; each area's own reading is in the certificate below.`;
}

interface WrongCandidate {
  readonly item: PlainWrongItem;
  readonly check: PendingCheck;
}

function buildWrong(report: WitanReport): WrongCandidate[] {
  const candidates: WrongCandidate[] = [];
  for (const criterion of report.criteria) {
    const area = plainAreaName(criterion);
    let hasOwnFinding = false;
    criterion.findings.forEach((finding, findingIndex) => {
      if (finding.severity !== 'critical' && finding.severity !== 'warning') return;
      hasOwnFinding = true;
      const metricMatch = METRIC_DERIVED_FINDING_PATTERN.exec(finding.summary);
      const metricDerived = metricMatch !== null;
      let text: string;
      if (metricMatch) {
        // v2 item F: worded from the finding's own score and level, not "scored low", which
        // overstated a warning at 3.1 of 4; "no single finding" is dropped where this area lists
        // another finding of its own on this page.
        const weakest = weakestMeasurementLabels(criterion);
        const level = metricMatch[2] === 'critical' ? 'critical' : 'a warning';
        const otherListed = criterion.findings.some(
          (other, otherIndex) =>
            otherIndex !== findingIndex &&
            (other.severity === 'critical' || other.severity === 'warning') &&
            !METRIC_DERIVED_FINDING_PATTERN.test(other.summary),
        );
        text = `Its measurements together give ${metricMatch[1]} out of 4, which Cejel counts as ${level}${otherListed ? '' : '; no single finding of its own caused this'}.${weakest.length > 0 ? ` Weakest: ${joinAnd(weakest)}.` : ''}`;
      } else {
        const known = finding.derivation ? PLAIN_ABSENCE_FINDINGS[finding.derivation.patternSetId] : undefined;
        text =
          known ??
          (isPlainText(finding.summary) ? finding.summary : 'Cejel found a problem here; the certificate below describes it.');
      }
      const location = metricDerived ? undefined : formatLocation(finding.evidence);
      const item: PlainWrongItem = {
        id: `wrong/finding/${criterion.id}/${findingIndex}`,
        area,
        text,
        ...(location !== undefined ? { location } : {}),
        level: finding.severity,
        source: { kind: 'finding', criterionId: criterion.id, findingIndex },
        anchor: plainFindingAnchor(criterion.id, findingIndex),
      };
      candidates.push({
        item,
        check: {
          item,
          kind: metricDerived ? 'finding-overall' : 'finding',
          qualifier: criterion.id,
          section: SECTION_FINDINGS,
        },
      });
    });
    if (!hasOwnFinding && (criterion.status === 'critical' || criterion.status === 'warning')) {
      const item: PlainWrongItem = {
        id: `wrong/criterion/${criterion.id}`,
        area,
        // #654 review, should-fix 5: worded from the score with or without an overall result; each
        // area's card in the certificate prints the same number either way.
        text: `Scored ${criterion.score.toFixed(1)} out of 4, with no single finding of its own.`,
        level: criterion.status,
        source: { kind: 'criterion', criterionId: criterion.id },
        anchor: plainCriterionAnchor(criterion.id),
      };
      candidates.push({ item, check: { item, kind: 'low-score', qualifier: criterion.id, section: SECTION_AREA } });
    }
  }
  // Array.prototype.sort is stable: within a level, report order is kept.
  return candidates.sort((a, b) => SEVERITY_RANK[a.item.level] - SEVERITY_RANK[b.item.level]);
}

function withheldReasonLabel(reason: WitanWithheldPath['reason']): string {
  switch (reason) {
    case 'too_large':
      return 'too large';
    case 'non_regular_file':
      return 'not a regular file';
    case 'unreadable':
      return 'unreadable';
    case 'denied_path':
      return 'a denied path';
    case 'excluded_by_extension':
      return 'a file type Cejel does not read';
    case 'lfs_pointer':
      return 'a Git LFS pointer';
  }
}

function buildNotKnown(report: WitanReport): PendingCheck[] {
  const pending: PendingCheck[] = [];
  const add = (item: PlainItem, kind: NextCheckKind, section: string, qualifier?: string): void => {
    pending.push({ item, kind, section, ...(qualifier !== undefined ? { qualifier } : {}) });
  };
  const notEstablished = buildRelyingPartySummary(report).notEstablished;

  // 1. The overall result itself.
  if (report.verdict === 'insufficient_source') {
    const label = renderWitanAbstentionLabel(report);
    const reason = report.insufficientSourceReason;
    add(
      {
        id: 'not-known/verdict',
        area: 'Overall result',
        text: `${label}: ${plainInsufficientSourceSentence(reason)}`,
        source: { kind: 'verdict' },
        anchor: PLAIN_ANCHOR_VERDICT,
      },
      'abstention',
      'the summary panel',
      insufficientSourceKind(reason),
    );
  } else if (report.verdictCap) {
    add(
      {
        id: 'not-known/verdict',
        area: 'Overall result',
        text: 'The overall result was lowered because one area could not read the commit history of this shallow clone.',
        source: { kind: 'verdict' },
        anchor: PLAIN_ANCHOR_VERDICT,
      },
      'verdict-capped',
      'the summary panel',
    );
  }

  // 2. Every criterion that was not examined, recorded nothing to examine, or could not be fully
  // read. An area the report says it could not read (contentReadSummary.affectedCriteria, or named
  // by a scan or history limitation) is "not read", never "found nothing to measure".
  const gaps = readGaps(report);
  for (const criterion of report.criteria) {
    const base = {
      id: `not-known/criterion/${criterion.id}`,
      area: plainAreaName(criterion),
      source: { kind: 'criterion', criterionId: criterion.id } as const,
      anchor: plainCriterionAnchor(criterion.id),
    };
    const causes = gaps.get(criterion.id);
    const clauses = causes ? readGapClauses(causes) : [];
    const notRead = causes !== undefined && clauses.length > 0;
    switch (criterion.status) {
      case 'not_applicable':
        add(
          {
            ...base,
            text: notRead
              ? `Not examined: Cejel decided this area does not apply to this repository, although ${joinAnd(clauses)}.`
              : 'Not examined: Cejel decided this area does not apply to this repository.',
          },
          notRead ? 'not-read' : 'not-applicable',
          SECTION_AREA,
          notRead ? readGapQualifier(causes) : criterion.id,
        );
        break;
      case 'insufficient_data':
        // v2 item F: an area with no score that still lists a problem under What is wrong says
        // only that its score was not given, so the two lists do not contradict each other.
        if (hasWrongFinding(criterion)) {
          const listed = 'the problem it found is listed under What is wrong';
          add(
            {
              ...base,
              text: notRead
                ? `Not read: Cejel gave this area no score because ${joinAnd(clauses)}; ${listed}.`
                : `Score not given: Cejel gave this area no score; ${listed}.`,
            },
            notRead ? 'not-read' : 'score-not-given',
            SECTION_AREA,
            notRead ? readGapQualifier(causes) : undefined,
          );
        } else if (notRead) {
          add(
            { ...base, text: `Not read: Cejel gave this area no score because ${joinAnd(clauses)}.` },
            'not-read',
            SECTION_AREA,
            readGapQualifier(causes),
          );
        } else {
          add({ ...base, text: 'Not measured: Cejel recorded no measurement for this area.' }, 'not-measured', SECTION_AREA, criterion.id);
        }
        break;
      case 'unverified':
        add({ ...base, text: 'No evidence was supplied for this area, so it counts as zero.' }, 'no-evidence', SECTION_AREA, criterion.id);
        break;
      case 'verified':
      case 'info':
        if (!hasExaminedEvidence(criterion)) {
          add(
            { ...base, text: 'No measurement or evidence was recorded for this area, so it is not listed as holding.' },
            'no-measurement',
            SECTION_AREA,
            criterion.id,
          );
        }
        break;
      case 'warning':
      case 'critical':
        break;
      default:
        add(
          { ...base, text: 'Cejel recorded a result of a kind this page does not describe.', location: String(criterion.status) },
          'unrecognised-status',
          SECTION_AREA,
        );
    }
    // v2 item F: a label moved by imported evidence (nativeStatus differs from status) is explained.
    if (criterion.nativeStatus !== undefined && criterion.nativeStatus !== criterion.status) {
      add(
        {
          ...base,
          id: `not-known/imported-status/${criterion.id}`,
          text: `Imported evidence moved this area's label from ${plainStatusLabel(criterion.nativeStatus)} to ${plainStatusLabel(criterion.status)}: findings from another tool, given to Cejel, set it, not Cejel's own reading.`,
        },
        'imported-status',
        SECTION_AREA,
      );
    }
    // An area that was rated although part of what it reads was not read says so.
    if (notRead && criterion.status !== 'not_applicable' && criterion.status !== 'insufficient_data') {
      add(
        {
          ...base,
          id: `not-known/not-read/${criterion.id}`,
          text: `Partly not read: ${joinAnd(clauses)}; its result rests only on what was read.`,
        },
        'not-read',
        SECTION_AREA,
        readGapQualifier(causes),
      );
    }
  }

  // 3. Gaps the certificate's "What was not established" names outside the criteria list.
  const a1 = report.criteria.find((criterion) => criterion.id === 'A1');
  const coverageMetric = a1?.metrics.find((metric) => metric.name === 'coverage_percent');
  if (a1 && coverageMetric && isCoverageNotMeasured(a1, coverageMetric)) {
    add(
      {
        id: 'not-known/not-established/coverage',
        area: plainAreaName(a1),
        text: 'No test coverage report or coverage threshold was found, so how much of the code the tests reach is not known (Cejel does not run tests).',
        source: { kind: 'criterion', criterionId: a1.id },
        anchor: plainCriterionAnchor(a1.id),
      },
      'coverage-not-measured',
      SECTION_AREA,
    );
  }
  if (a1 && coverageMetric && isCoveragePercentageUnpublished(a1, coverageMetric)) {
    add(
      {
        id: 'not-known/not-established/coverage',
        area: plainAreaName(a1),
        text: 'Coverage settings were found, but no published coverage figure above 0, so how much of the code the tests reach is not known (Cejel does not run tests).',
        source: { kind: 'criterion', criterionId: a1.id },
        anchor: plainCriterionAnchor(a1.id),
      },
      'coverage-unpublished',
      SECTION_AREA,
    );
  }
  if (!report.repo.headSha && report.criteria.some((criterion) => criterion.metrics.some((metric) => metric.name === 'pr_merge_ratio'))) {
    add(
      {
        id: 'not-known/not-established/git-history',
        area: 'Pull request history',
        text: 'Git history was not available, so Cejel could not look for pull request references in recent commits.',
        source: { kind: 'not-established' },
        anchor: PLAIN_ANCHOR_NOT_ESTABLISHED,
      },
      'git-history-unavailable',
      SECTION_NOT_ESTABLISHED,
    );
  }

  // 4. Every scan limitation and history limitation, as itself when its words are plain.
  (report.scanLimitations ?? []).forEach((limitation, limitationIndex) => {
    add(
      {
        id: `not-known/scan-limitation/${limitationIndex}`,
        area: 'Reading the repository',
        text: plainLimitation(limitation),
        source: { kind: 'scan-limitation', limitationIndex },
        anchor: plainScanLimitationAnchor(limitationIndex),
      },
      'scan-limitation',
      'Scan limitations',
      scanLimitationKind(report, limitation),
    );
  });
  (report.historyLimitations ?? []).forEach((limitation, limitationIndex) => {
    add(
      {
        id: `not-known/history-limitation/${limitationIndex}`,
        area: 'Commit history',
        text: plainLimitation(limitation),
        source: { kind: 'history-limitation', limitationIndex },
        anchor: plainHistoryLimitationAnchor(limitationIndex),
      },
      'history-limitation',
      'History limitations',
    );
  });

  // 5. Content Cejel did not read.
  const reads = report.contentReadSummary;
  if (reads) {
    const actionable = [
      ['unreadable', reads.byReason.unreadable],
      ['too large', reads.byReason.tooLarge],
      ['a denied path', reads.byReason.deniedPath],
      ['not a regular file', reads.byReason.nonRegularFile],
    ] as const;
    const skipped = actionable.reduce((sum, [, count]) => sum + count, 0);
    if (skipped > 0) {
      add(
        {
          id: 'not-known/content-reads/skipped',
          area: 'Files not read',
          text: `Cejel did not read ${skipped} ${plural(skipped, 'file or entry', 'files or entries')} (${joinOr(actionable.filter(([, count]) => count > 0).map(([label]) => label))}).`,
          source: { kind: 'content-reads' },
          anchor: PLAIN_ANCHOR_CONTENT_READS,
        },
        'skipped-content',
        'Skipped content reads',
      );
    }
    const lfs = reads.byReason.lfsPointer ?? 0;
    if (lfs > 0) {
      add(
        {
          id: 'not-known/content-reads/lfs',
          area: 'Files not read',
          text: `${lfs} ${plural(lfs, 'file is a Git LFS pointer', 'files are Git LFS pointers')}, so ${plural(lfs, 'its', 'their')} real content was not read.`,
          source: { kind: 'content-reads' },
          anchor: PLAIN_ANCHOR_CONTENT_READS,
        },
        'lfs-pointers',
        'Skipped content reads',
      );
    }
    const excluded = reads.byReason.excludedByExtension;
    if (excluded > 0) {
      add(
        {
          id: 'not-known/content-reads/excluded',
          area: 'Files not read',
          text: `Cejel did not read ${excluded} ${plural(excluded, 'file', 'files')} because it does not read ${plural(excluded, 'that file type', 'those file types')}; this is a fixed limit of the tool.`,
          source: { kind: 'content-reads' },
          anchor: PLAIN_ANCHOR_CONTENT_READS,
        },
        'excluded-file-types',
        'Skipped content reads',
      );
    }
  }
  // The certificate counts every withheld file; so does this line, and it names how many of them a
  // check would have read when that is fewer. Withheld files no check would read are not a gap.
  const withheldPaths = report.withheldPaths ?? [];
  const intersecting = withheldPaths.filter((entry) => entry.signalsAdmitting.length > 0).length;
  if (intersecting > 0) {
    const total = withheldPaths.length;
    const reasons = [...new Set(withheldPaths.map((entry) => withheldReasonLabel(entry.reason)))].sort();
    const read =
      intersecting === total ? plural(total, 'it', 'them') : `${intersecting} of them`;
    add(
      {
        id: 'not-known/not-established/withheld',
        area: 'Files not read',
        text: `${total} ${plural(total, 'file was', 'files were')} held back (${joinOr(reasons)}), and checks Cejel runs would have read ${read}; the certificate below says what those checks did instead.`,
        source: { kind: 'not-established' },
        anchor: PLAIN_ANCHOR_NOT_ESTABLISHED,
      },
      'withheld-content',
      SECTION_NOT_ESTABLISHED,
    );
  }

  // 6. What each criterion says it could not settle, and every disclosure it carries.
  for (const criterion of report.criteria) {
    const area = plainAreaName(criterion);
    for (const settling of SETTLING_SENTENCES) {
      if (
        settling.criterionId === criterion.id &&
        criterion.status !== 'not_applicable' &&
        criterion.notes?.includes(settling.sentence) === true
      ) {
        add(
          {
            id: `not-known/note/${criterion.id}`,
            area,
            text: settling.plain,
            source: { kind: 'criterion-note', criterionId: criterion.id },
            anchor: PLAIN_ANCHOR_NOT_ESTABLISHED,
          },
          'settling',
          SECTION_NOT_ESTABLISHED,
          criterion.id,
        );
      }
    }
    (criterion.disclosures ?? []).forEach((sentence, disclosureIndex) => {
      const kind = disclosureKind(sentence);
      const shown = notEstablished.includes(sentence);
      add(
        {
          id: `not-known/disclosure/${criterion.id}/${disclosureIndex}`,
          area,
          text:
            kind !== 'other'
              ? DISCLOSURE_SENTENCES[kind]
              : isPlainText(sentence)
                ? sentence
                : 'Cejel recorded one more limit on what it checked in this area.',
          source: { kind: 'disclosure', criterionId: criterion.id, disclosureIndex },
          anchor: shown ? PLAIN_ANCHOR_NOT_ESTABLISHED : plainCriterionAnchor(criterion.id),
        },
        'disclosure',
        shown ? SECTION_NOT_ESTABLISHED : SECTION_AREA,
        kind,
      );
    });
  }

  return pending;
}

function toCheckNext(pending: PendingCheck): PlainCheckNextItem {
  const resolved = resolveNextCheck(pending.kind, pending.qualifier, pending.section);
  return {
    id: `check/${pending.item.id}`,
    for: pending.item.id,
    area: pending.item.area,
    key: resolved.key,
    text: resolved.text,
    fromTable: resolved.fromTable,
    anchor: pending.item.anchor,
  };
}

/** The four lists, from the report alone. Same report, same bytes. */
export function buildPlainSummary(report: WitanReport): PlainSummary {
  const coverage = computeMeasuredCoverage(report);
  const areas = {
    measured: coverage.overall.measured,
    total: coverage.overall.total,
    notApplicable: report.criteria.filter((criterion) => criterion.status === 'not_applicable').length,
  };
  const holds = buildHolds(report);
  const wrong = buildWrong(report);
  const notKnown = buildNotKnown(report);
  const findingItems = wrong.filter(({ item }) => item.source.kind === 'finding').length;
  const otherWrong = wrong.length - findingItems;
  const otherLevels = [
    ...new Set(wrong.filter(({ item }) => item.source.kind !== 'finding').map(({ item }) => item.level)),
  ]
    .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])
    .map((level) => (level === 'critical' ? 'Critical' : 'Warning'));
  return {
    ...(isProspectiveRubricVersion(report.rubricVersion) ? { prospectiveNotice: PLAIN_PROSPECTIVE_NOTICE } : {}),
    verdictLine: buildVerdictLine(report),
    notCovered: PLAIN_NOT_COVERED,
    areas,
    areasLine: buildAreasLine(areas),
    holds,
    ...(holds.length === 0 ? { holdsNote: buildHoldsNote(report) } : {}),
    ...(holds.some((item) => scoreOf(report, item) < 4) ? { holdsLead: PLAIN_HOLDS_LEAD } : {}),
    wrong: wrong.map(({ item }) => item),
    ...(otherWrong > 0
      ? {
          wrongNote: `${findingItems} of these ${plural(findingItems, 'is a finding', 'are findings')} listed under Critical and warning findings below; the other ${otherWrong} ${plural(otherWrong, 'is an area', 'are areas')} labelled ${joinOr(otherLevels)}, with no single finding of ${plural(otherWrong, 'its', 'their')} own.`,
        }
      : {}),
    notKnown: notKnown.map(({ item }) => item),
    checkNext: [...wrong.map(({ check }) => check), ...notKnown].map(toCheckNext),
  };
}
