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
  type WitanAbstentionLabel,
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
import { METRIC_DERIVED_FINDING_PATTERN } from './witan/finding-presentation.js';
import {
  type NextCheckKind,
  type PlainDisclosureKind,
  resolveNextCheck,
} from './witan/next-checks.js';
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
  /** The verdict and score in words, one sentence. */
  readonly verdictLine: string;
  /** What the result does not cover, one sentence. */
  readonly notCovered: string;
  /** The certificate's own counts: criteria measured, criteria in the report, and how many do not apply. */
  readonly areas: { readonly measured: number; readonly total: number; readonly notApplicable: number };
  readonly areasLine: string;
  readonly holds: readonly PlainItem[];
  /** Present when nothing is listed as holding for a stated reason. */
  readonly holdsNote?: string;
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

export const PLAIN_NOT_COVERED =
  "What this result does not cover: Cejel read the repository's files and history and did not run the code or its tests, so this result does not show that the code works as intended or that it has no vulnerabilities.";

const ABSTENTION_SENTENCES: Readonly<Record<WitanAbstentionLabel, string>> = {
  'Insufficient source': 'Cejel found no source code here that it can rate, so it gives no score and no verdict.',
  'Insufficient evidence': 'nothing Cejel checks produced a measurement, so it gives no score and no verdict.',
  'Unrated: shallow clone':
    'Cejel read a shallow clone (only part of the commit history), so it gives no score and no verdict.',
  'Unrated: history depth unknown':
    'Cejel could not tell how much of the commit history it read, so it gives no score and no verdict.',
};

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
    ...Object.values(ABSTENTION_SENTENCES),
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
      // No score here: the status this list reads is calibrated apart from the weighted score, so a
      // Verified area can carry a lower number, and showing both would need the certificate's
      // explanation of why the labels differ. The certificate below shows the number.
      const lead =
        criterion.status === 'verified'
          ? 'Holds: Cejel rates this area at its top level.'
          : 'Partly holds: Cejel rates this area one level below the top.';
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

interface WrongCandidate {
  readonly item: PlainWrongItem;
  readonly check: PendingCheck;
}

function buildWrong(report: WitanReport): WrongCandidate[] {
  const abstained = report.verdict === 'insufficient_source';
  const candidates: WrongCandidate[] = [];
  for (const criterion of report.criteria) {
    const area = plainAreaName(criterion);
    let hasOwnFinding = false;
    criterion.findings.forEach((finding, findingIndex) => {
      if (finding.severity !== 'critical' && finding.severity !== 'warning') return;
      hasOwnFinding = true;
      const metricDerived = METRIC_DERIVED_FINDING_PATTERN.test(finding.summary);
      let text: string;
      if (metricDerived) {
        const weakest = weakestMeasurementLabels(criterion);
        text = `Its measurements taken together scored low; no single problem caused this.${weakest.length > 0 ? ` Weakest: ${joinAnd(weakest)}.` : ''}`;
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
        text: abstained
          ? 'Scored low, with no single finding of its own.'
          : `Scored ${criterion.score.toFixed(1)} out of 4, with no single finding of its own.`,
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
    const reasonText = isPlainText(reason) ? ` The reason Cejel gives: ${reason}` : '';
    add(
      {
        id: 'not-known/verdict',
        area: 'Overall result',
        text: `${label}: ${ABSTENTION_SENTENCES[label]}${reasonText}`,
        source: { kind: 'verdict' },
        anchor: PLAIN_ANCHOR_VERDICT,
      },
      'abstention',
      'the summary panel',
      label,
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

  // 2. Every criterion that was not examined or recorded nothing to examine.
  for (const criterion of report.criteria) {
    const base = {
      id: `not-known/criterion/${criterion.id}`,
      area: plainAreaName(criterion),
      source: { kind: 'criterion', criterionId: criterion.id } as const,
      anchor: plainCriterionAnchor(criterion.id),
    };
    switch (criterion.status) {
      case 'not_applicable':
        add({ ...base, text: 'Not examined: Cejel decided this area does not apply to this repository.' }, 'not-applicable', SECTION_AREA, criterion.id);
        break;
      case 'insufficient_data':
        add({ ...base, text: 'Not measured: Cejel found nothing here it could measure.' }, 'not-measured', SECTION_AREA, criterion.id);
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
        text: isPlainText(limitation)
          ? limitation
          : 'Cejel could read only part of the evidence; the limit is described in the certificate below.',
        source: { kind: 'scan-limitation', limitationIndex },
        anchor: plainScanLimitationAnchor(limitationIndex),
      },
      'scan-limitation',
      'Scan limitations',
    );
  });
  (report.historyLimitations ?? []).forEach((limitation, limitationIndex) => {
    add(
      {
        id: `not-known/history-limitation/${limitationIndex}`,
        area: 'Commit history',
        text: isPlainText(limitation)
          ? limitation
          : 'Cejel read only part of the commit history; the certificate below says what this affects.',
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
  return {
    verdictLine: buildVerdictLine(report),
    notCovered: PLAIN_NOT_COVERED,
    areas,
    areasLine: buildAreasLine(areas),
    holds,
    ...(report.verdict === 'insufficient_source'
      ? { holdsNote: 'Nothing is listed here because Cejel gave no overall result for this scan.' }
      : {}),
    wrong: wrong.map(({ item }) => item),
    ...(otherWrong > 0
      ? {
          wrongNote: `${findingItems} of these ${plural(findingItems, 'is a finding', 'are findings')} listed under Critical and warning findings below; the other ${otherWrong} ${plural(otherWrong, 'is an area', 'are areas')} that scored low with no single finding of ${plural(otherWrong, 'its', 'their')} own.`,
        }
      : {}),
    notKnown: notKnown.map(({ item }) => item),
    checkNext: [...wrong.map(({ check }) => check), ...notKnown].map(toCheckNext),
  };
}
