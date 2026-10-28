import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import { SHALLOW_HISTORY_V27_ABSTENTION } from '../history-depth.js';

// THE NO-RISE PROPERTY (#531), shared by the curated and the generated v27 tests.
//
// v17 and v27 score the same repository. Every movement from v17 to v27 must remove an assurance:
// a criterion may lose score, become more severe, or abstain as a read failure; a composite may
// fall. Nothing may rise. This is the definition the 0.6.8 public confirmation applies to the
// board (docs/experiments/public-delta-0-6-8-2026-10-21/norise.mjs: a composite or criterion score
// that is null or absent under v17 and scored under v27 is a rise), made stricter where #531 asks:
//
//   - a status may not move toward assurance, and a criterion v17 left unscored (not applicable or
//     insufficient_data) may not be scored, or change unscored state, under v27;
//   - (a) every insufficient_data that v27 introduces must be a read-failure abstention, scored 0
//     and kept in its category's denominator (ADR-0001: an abstention can never raise a
//     composite). A read failure is one of READ_FAILURE_CLASSES below: #560's failed-history
//     abstention of A2 (by its note prefix), or a content-read abstention: listed in contentReadSummary.affectedCriteria AND carrying the
//     read-failure note (Git LFS pointers, or content that could not be read), with a read-failure
//     reason counted in byReason. affectedCriteria alone is not evidence: it also lists criteria
//     whose only skips were self-imposed (too_large, excluded_by_extension), which leave the
//     composite. The denominator is checked arithmetically against the reported composite, not
//     inferred from a label. For criteria insufficient_data under both rubrics the arithmetic is
//     lenient: they are counted as the fewest v17's composite is consistent with;
//   - (b) a composite scored under v17 and null under v27 is a move to report, and fails, as does
//     the reverse (which norise.mjs already counts as a rise).
//
// FULL CLONES AND SHALLOW CLONES (v27 freeze change F1, operator decision 2026-10-28). Everything
// above holds, unchanged and enforced, on a full clone. On a shallow clone v27's history criteria,
// A2 and B2, follow the operator's 26/27 Oct rule (a shallow clone must not lower the history
// score: B2 withholds only its merge ratio, or abstains out of the composite where no PR-trace
// file evidence remains; A2's shallow-only abstention is left out of the composite rather than
// counted as 0). They are compared with the same commit's full clone under v27
// (checkShallowHistoryAgainstFullClone), not with v17 on the truncated input. Every other criterion
// is compared with v17 on the same input exactly as above, and so is every composite, against v17's
// composites recomputed with v27's A2 and B2 in place of v17's (withV27HistoryCriteria): a composite
// may differ from v17's through the history criteria, by that rule, and through nothing else
// without falling. Until F1 the shallow-clone abstentions of A2 and B2 were a read-failure class
// held at 0 and compared with v17 like any other.
//
// lostFindings, beside it, requires every v17 finding to survive under v27 at the same or a higher
// severity, with the removals v27 makes by rule enumerated there.

export const NO_RISE_COMPOSITES = ['overallScore', 'codeTrustScore', 'processTrustScore'] as const;

const SEVERITY: Readonly<Record<string, number>> = { verified: 0, info: 1, warning: 2, critical: 3 };
const UNSCORED: ReadonlySet<string> = new Set(['not_applicable', 'insufficient_data']);
const CATEGORY_COMPOSITE = { code_trust: 'codeTrustScore', process_trust: 'processTrustScore' } as const;

const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** norise.mjs's rise: after is scored where before was not, or scored higher. */
export function rises(before: unknown, after: unknown): boolean {
  if (!isScore(after)) return false;
  if (!isScore(before)) return true;
  return after > before;
}

export type IntroducedAbstentionKind = (typeof READ_FAILURE_CLASSES)[number]['kind'];

export interface IntroducedAbstention {
  readonly id: string;
  readonly kind: IntroducedAbstentionKind | 'unrecognised';
  /**
   * 'kept': the reported composite is reproduced with the criterion in the denominator at 0, and
   * not without it. 'indistinguishable': both arithmetics give the reported composite (for
   * example, every other criterion in the category scores 0, or rounding hides one more zero), so
   * the composite cannot have risen on its account and only the classification is checked.
   * 'not-kept' is a problem. 'unchecked': a composite is null under v17 or v27.
   */
  readonly denominator: 'kept' | 'indistinguishable' | 'not-kept' | 'unchecked';
}

export interface NoRiseResult {
  readonly problems: string[];
  readonly introducedAbstentions: IntroducedAbstention[];
  /** Criteria whose score fell, and composites that fell: what the generated tests count for liveness. */
  readonly fallenCriteria: string[];
  readonly fallenComposites: string[];
}

function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

/**
 * The numbers of insufficient_data criteria (each scored 0), from 0 to `most`, that the category
 * composite's denominator can hold and still give `reported`, as scoring.ts's averageScore computes
 * it: the rounded mean of the scored criteria and the kept abstentions. Only the count is
 * identifiable, since every abstention contributes the same 0.
 */
function keptCounts(scored: readonly WitanCriterionScore[], most: number, reported: number): number[] {
  const total = scored.reduce((sum, { score }) => sum + score, 0);
  const counts: number[] = [];
  for (let kept = 0; kept <= most; kept += 1) {
    const size = scored.length + kept;
    const average = size === 0 ? 0 : roundScore(total / size);
    if (Math.abs(average - reported) < 1e-9) counts.push(kept);
  }
  return counts;
}

// The notes buildWitanInputFromRepo's wholesale abstention writes for a read failure (repo-signals.ts,
// wholesaleCriterionAbstention). The self-imposed note ("... a disclosed coverage limit, not a read
// failure, and does not affect the composite score.") is deliberately absent.
export const READ_FAILURE_NOTES: readonly string[] = [
  'Cejel abstained on this criterion because relevant files in this checkout are Git LFS pointers, so their content was not read. Fetch the LFS content (git lfs pull) and re-scan.',
  'Cejel abstained on this criterion because one or more relevant repository files could not be read. Resolve the content-read limitations and re-scan.',
];

function contentReadFailure(report: WitanReport, criterion: WitanCriterionScore): boolean {
  const summary = report.contentReadSummary;
  if (!summary || !summary.affectedCriteria.includes(criterion.id)) return false;
  const readFailures = summary.byReason.unreadable + summary.byReason.deniedPath + (summary.byReason.lfsPointer ?? 0);
  return readFailures > 0 && READ_FAILURE_NOTES.includes(criterion.notes ?? '');
}

function failedHistoryAbstention(_report: WitanReport, criterion: WitanCriterionScore): boolean {
  return criterion.id === 'A2' && (criterion.notes ?? '').startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX);
}

/** The criteria that read commit history; on a shallow clone v27 compares them with the full clone (F1). */
export const HISTORY_CRITERIA: readonly string[] = ['A2', 'B2'];

/** A v27 report of a shallow clone: its display-only history sentence is v27's. */
export function isV27ShallowReport(report: WitanReport): boolean {
  return (report.historyLimitations ?? []).includes(SHALLOW_HISTORY_V27_ABSTENTION);
}

/**
 * A2 or B2 abstaining under v27 only because the clone is shallow (#442's notes). Since the v27
 * freeze change F1 it carries the 'shallow_history' reason and is left out of the composite, so it
 * is no longer a read-failure class: it is recognised here, for the full-clone comparison and for
 * lostFindings.
 */
export function shallowOnlyAbstention(report: WitanReport, criterion: WitanCriterionScore): boolean {
  return (
    HISTORY_CRITERIA.includes(criterion.id) &&
    criterion.status === 'insufficient_data' &&
    isV27ShallowReport(report) &&
    (criterion.notes ?? '').startsWith(`${criterion.id} abstained: this repository is a shallow clone`)
  );
}

/**
 * The read-failure abstentions v27 makes, each recognised from the report alone. An abstention v27
 * introduces must match one; anything else is self-imposed. Extend by adding a class here.
 *
 * failed-history (#560, #556): A2's abstention after an incomplete read of the commit history,
 * other than the shallow-only case (which keeps #442's notes and, since F1, leaves the composite:
 * shallowOnlyAbstention). Per the
 * comment on WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX in src/witan/abstention.ts, the source of
 * truth, it is recognised by that prefix, which only v27A2FailedHistoryNote writes, and not by any
 * one cause: several causes can appear together, and they differ in what else the report carries.
 * v27-no-rise-failed-history.test.ts derives the causes from A2HistoryIncompleteness and that
 * comment and checks each is recognised, from the note builder and from real scans.
 */
export const READ_FAILURE_CLASSES = [
  { kind: 'content-read', recognises: contentReadFailure },
  { kind: 'failed-history', recognises: failedHistoryAbstention },
] as const satisfies readonly {
  kind: string;
  recognises: (report: WitanReport, criterion: WitanCriterionScore) => boolean;
}[];

/**
 * The no-rise property between v17 (`before`) and v27 (`after`) on the same input. On a shallow
 * clone (isV27ShallowReport) it also needs `fullClone`, v27's report of the same commit's full
 * clone: A2 and B2 are then compared with it (checkShallowHistoryAgainstFullClone), and everything
 * else with v17 as on a full clone, against withV27HistoryCriteria(before, after).
 */
export function checkNoRise(before: WitanReport, after: WitanReport, fullClone?: WitanReport): NoRiseResult {
  if (!isV27ShallowReport(after)) return checkNoRiseAgainst(before, after);
  if (!fullClone) {
    return {
      problems: ["v27's report is of a shallow clone and no full clone of the same commit was given"],
      introducedAbstentions: [],
      fallenCriteria: [],
      fallenComposites: [],
    };
  }
  const result = checkNoRiseAgainst(withV27HistoryCriteria(before, after), after);
  return { ...result, problems: [...result.problems, ...checkShallowHistoryAgainstFullClone(fullClone, after)] };
}

/**
 * v17's report with v27's A2 and B2 in place of its own, and each composite recomputed as
 * scoring.ts's averageScore does: v17's own read-failure abstentions held at 0, as many as v17's
 * composite shows (the fewest consistent with it, as in checkNoRiseAgainst); v27's history criteria
 * scored, held at 0 where they abstain as a recognised read failure (READ_FAILURE_CLASSES), and left
 * out where they abstain only because the clone is shallow or have nothing to read, as scoring.ts
 * leaves them out. Unchanged where v17 abstained wholesale, or where v17's own composite
 * is not reproduced by that arithmetic (checkNoRiseAgainst then reports it).
 */
export function withV27HistoryCriteria(before: WitanReport, after: WitanReport): WitanReport {
  const criteria = before.criteria.map(
    (criterion) =>
      (HISTORY_CRITERIA.includes(criterion.id) && after.criteria.find(({ id }) => id === criterion.id)) || criterion,
  );
  if (before.insufficientSourceReason != null) return { ...before, criteria };
  const composites: Partial<Record<(typeof CATEGORY_COMPOSITE)[keyof typeof CATEGORY_COMPOSITE], number>> = {};
  for (const [category, key] of Object.entries(CATEGORY_COMPOSITE)) {
    const reported = before[key];
    if (!isScore(reported)) return { ...before, criteria };
    const v17 = before.criteria.filter((criterion) => criterion.category === category);
    const held = keptCounts(
      v17.filter(({ status }) => !UNSCORED.has(status)),
      v17.filter(({ status }) => status === 'insufficient_data').length,
      reported,
    );
    if (held.length === 0) return { ...before, criteria };
    const otherAbstentions = v17.filter(({ id, status }) => status === 'insufficient_data' && !HISTORY_CRITERIA.includes(id));
    const mixed = criteria.filter((criterion) => criterion.category === category);
    const scored = mixed.filter(({ status }) => !UNSCORED.has(status));
    const historyHeld = mixed.filter(
      (criterion) =>
        HISTORY_CRITERIA.includes(criterion.id) &&
        criterion.status === 'insufficient_data' &&
        READ_FAILURE_CLASSES.some(({ recognises }) => recognises(after, criterion)),
    );
    const size = scored.length + Math.min(held[0]!, otherAbstentions.length) + historyHeld.length;
    composites[key] = size === 0 ? 0 : roundScore(scored.reduce((sum, { score }) => sum + score, 0) / size);
  }
  const { codeTrustScore = 0, processTrustScore = 0 } = composites;
  return {
    ...before,
    criteria,
    codeTrustScore,
    processTrustScore,
    overallScore: roundScore((codeTrustScore + processTrustScore) / 2),
  };
}

const metricOf = (criterion: WitanCriterionScore, name: string) => criterion.metrics.find((metric) => metric.name === name);

/** A metric's normalized value, as scoreMetrics reads it. */
function normalized(criterion: WitanCriterionScore, name: string): number | undefined {
  const found = metricOf(criterion, name);
  if (!found) return undefined;
  return found.max ? Math.min(found.value / found.max, 1) : Math.min(found.value, 1);
}

/**
 * The 26/27 Oct rule for v27's history criteria on a shallow clone (F1), against v27's report of
 * the same commit's full clone:
 *
 *   - B2: as on the full clone where the full clone does not score it, or where the shallow clone
 *     shows the whole window (it then reads the ratio). Otherwise the ratio is withheld: B2 is scored
 *     on pr_trace_primitives alone, with the full clone's value, under #604's note, and is below the
 *     full clone only where the full clone's ratio is better than its file evidence, above only
 *     where it is worse; or, where the full clone's file evidence is 0, B2 abstains only because the
 *     clone is shallow.
 *   - A2: never not applicable. It abstains only because the clone is shallow (left out of the
 *     composite), or as a read failure, or as the full clone does; or it is scored critical, as the
 *     full clone is, on a confirmed critical finding.
 */
export function checkShallowHistoryAgainstFullClone(full: WitanReport, shallow: WitanReport): string[] {
  const problems: string[] = [];
  const find = (report: WitanReport, id: string) => report.criteria.find((criterion) => criterion.id === id);
  const fullB2 = find(full, 'B2');
  const shallowB2 = find(shallow, 'B2');
  if (!fullB2 || !shallowB2) {
    problems.push('B2 is missing from the full or the shallow clone');
  } else if (UNSCORED.has(fullB2.status) || metricOf(shallowB2, 'pr_merge_ratio')) {
    if (shallowB2.status !== fullB2.status || shallowB2.score !== fullB2.score) {
      problems.push(`B2 is ${shallowB2.status} ${shallowB2.score} on the shallow clone and ${fullB2.status} ${fullB2.score} on the full clone`);
    }
  } else if (shallowB2.status === 'insufficient_data') {
    if (!shallowOnlyAbstention(shallow, shallowB2)) problems.push('B2 abstains on the shallow clone, but not only because it is shallow');
    if (metricOf(fullB2, 'pr_trace_primitives')?.value !== 0) {
      problems.push('B2 abstains on the shallow clone where the full clone has PR-trace file evidence to score');
    }
  } else {
    const names = shallowB2.metrics.map(({ name }) => name);
    if (names.join() !== 'pr_trace_primitives') problems.push(`B2 is scored on ${names.join(', ')} with the ratio withheld`);
    const own = metricOf(shallowB2, 'pr_trace_primitives');
    const theirs = metricOf(fullB2, 'pr_trace_primitives');
    if (own?.value !== theirs?.value || own?.max !== theirs?.max) problems.push("B2's pr_trace_primitives differs from the full clone's");
    if (!(shallowB2.notes ?? '').startsWith('B2 abstained from the pull-request merge ratio only: ')) {
      problems.push("B2's note does not say the ratio was withheld");
    }
    const ratio = normalized(fullB2, 'pr_merge_ratio') ?? 0;
    const primitives = normalized(fullB2, 'pr_trace_primitives') ?? 0;
    if (shallowB2.score < fullB2.score && !(ratio > primitives)) {
      problems.push(`B2 ${fullB2.score} -> ${shallowB2.score} below the full clone, whose ratio ${ratio} is not better than its file evidence ${primitives}`);
    }
    if (shallowB2.score > fullB2.score && !(ratio < primitives)) {
      problems.push(`B2 ${fullB2.score} -> ${shallowB2.score} above the full clone, whose ratio ${ratio} is not worse than its file evidence ${primitives}`);
    }
  }
  const fullA2 = find(full, 'A2');
  const shallowA2 = find(shallow, 'A2');
  if (!fullA2 || !shallowA2) {
    problems.push('A2 is missing from the full or the shallow clone');
  } else if (shallowA2.status === 'not_applicable') {
    problems.push('A2 is not applicable on a shallow clone');
  } else if (shallowA2.status === 'insufficient_data') {
    const recognised =
      shallowOnlyAbstention(shallow, shallowA2) ||
      READ_FAILURE_CLASSES.some(({ recognises }) => recognises(shallow, shallowA2)) ||
      (fullA2.status === 'insufficient_data' && fullA2.notes === shallowA2.notes);
    if (!recognised) problems.push(`A2 abstains on the shallow clone without a recognised reason: ${shallowA2.notes ?? ''}`);
  } else if (shallowA2.status !== 'critical' || fullA2.status !== 'critical') {
    problems.push(`A2 is scored ${shallowA2.status} on the shallow clone (full clone: ${fullA2.status}); only a confirmed critical finding keeps it scored`);
  }
  return problems;
}

function checkNoRiseAgainst(before: WitanReport, after: WitanReport): NoRiseResult {
  const problems: string[] = [];
  const fallenCriteria: string[] = [];
  const fallenComposites: string[] = [];
  const introduced = new Map<string, { kind: IntroducedAbstention['kind']; denominator: IntroducedAbstention['denominator'] }>();

  // Composites: a rise, or (b) a scored composite that becomes null.
  for (const key of NO_RISE_COMPOSITES) {
    if (rises(before[key], after[key])) problems.push(`${key} rose: ${String(before[key])} -> ${String(after[key])}`);
    else if (isScore(before[key]) && !isScore(after[key])) {
      problems.push(`${key} was scored under v17 (${String(before[key])}) and is null under v27`);
    } else if (isScore(before[key]) && isScore(after[key]) && after[key] < before[key]) fallenComposites.push(key);
  }

  const beforeIds = before.criteria.map(({ id }) => id);
  for (const extra of after.criteria.filter(({ id }) => !beforeIds.includes(id))) {
    problems.push(`${extra.id} is present under v27 and absent under v17`);
  }

  for (const v17 of before.criteria) {
    const v27 = after.criteria.find(({ id }) => id === v17.id);
    if (!v27) {
      problems.push(`${v17.id} is absent under v27`);
      continue;
    }
    if (rises(v17.score, v27.score)) problems.push(`${v17.id} score rose: ${v17.score} -> ${v27.score}`);
    else if (v27.score < v17.score) fallenCriteria.push(v17.id);

    if (v27.status === 'insufficient_data' && v17.status !== 'insufficient_data') {
      // (a) an abstention v27 introduced.
      const recognised = READ_FAILURE_CLASSES.find(({ recognises }) => recognises(after, v27));
      if (!recognised) {
        problems.push(
          `${v27.id} abstains under v27 (was ${v17.status}) without a recognised read failure (${READ_FAILURE_CLASSES.map(({ kind }) => kind).join(', ')})`,
        );
      }
      if (v27.score !== 0) problems.push(`${v27.id} abstains under v27 with score ${v27.score}, not 0`);
      if ((v27.notes ?? '').includes('does not affect the composite score')) {
        problems.push(`${v27.id} abstains under v27 as a self-imposed coverage limit excluded from the composite`);
      }
      introduced.set(v27.id, { kind: recognised?.kind ?? 'unrecognised', denominator: 'unchecked' });
      continue;
    }
    if (UNSCORED.has(v17.status)) {
      if (v27.status !== v17.status) {
        problems.push(`${v17.id} is ${v27.status} under v27 where v17 left it ${v17.status}`);
      }
      continue;
    }
    const was = SEVERITY[v17.status];
    const now = SEVERITY[v27.status];
    if (was === undefined || now === undefined) {
      problems.push(`${v17.id} moved ${v17.status} -> ${v27.status}, outside the ordered statuses`);
    } else if (now < was) {
      problems.push(`${v17.id} status rose: ${v17.status} -> ${v27.status}`);
    }
  }

  // (a), arithmetically: every abstention v27 introduced keeps the full denominator at 0. The
  // composite only identifies how many abstentions its denominator holds, so the criteria that
  // were insufficient_data under both rubrics are counted as v17's composite shows them held (the
  // fewest consistent with it, the lenient reading). The v27 composite must then hold all the
  // introduced abstentions on top of those. Skipped when v27's composites are null, which is a
  // problem above unless v17's are null too.
  if (after.insufficientSourceReason == null && before.insufficientSourceReason == null) {
    for (const [category, key] of Object.entries(CATEGORY_COMPOSITE)) {
      const reportedBefore = before[key];
      const reportedAfter = after[key];
      if (!isScore(reportedBefore) || !isScore(reportedAfter)) continue;
      const v17 = before.criteria.filter((criterion) => criterion.category === category);
      const v27 = after.criteria.filter((criterion) => criterion.category === category);
      const mine = v27.filter(({ id }) => introduced.has(id));
      if (mine.length === 0) continue;
      const v17Abstained = v17.filter(({ status }) => status === 'insufficient_data');
      const v17Held = keptCounts(
        v17.filter(({ status }) => !UNSCORED.has(status)),
        v17Abstained.length,
        reportedBefore,
      );
      if (v17Held.length === 0) {
        problems.push(`${key}: v17's ${reportedBefore} is not reproduced by the composite arithmetic this check models`);
        continue;
      }
      const earlier = v27.filter(({ id, status }) => status === 'insufficient_data' && !introduced.has(id));
      const required = mine.length + Math.min(v17Held[0]!, earlier.length);
      const v27Held = keptCounts(
        v27.filter(({ status }) => !UNSCORED.has(status)),
        mine.length + earlier.length,
        reportedAfter,
      );
      const ids = mine.map(({ id }) => id).join(', ');
      let denominator: IntroducedAbstention['denominator'];
      if (!v27Held.some((count) => count >= required)) {
        problems.push(
          `${key} ${reportedAfter} is not reproduced with ${ids} kept in the denominator at 0 (it holds ${v27Held.join(' or ') || 'no consistent number of'} abstentions; at least ${required} required): an abstention left the composite`,
        );
        denominator = 'not-kept';
      } else {
        denominator = v27Held.every((count) => count >= required) ? 'kept' : 'indistinguishable';
      }
      for (const { id } of mine) introduced.get(id)!.denominator = denominator;
    }
  }

  return {
    problems,
    introducedAbstentions: [...introduced].map(([id, value]) => ({ id, ...value })),
    fallenCriteria,
    fallenComposites,
  };
}

const FINDING_SEVERITY: Readonly<Record<string, number>> = { info: 1, warning: 2, critical: 3 };

type Finding = WitanCriterionScore['findings'][number];

const CONFTEST_PATH = /(^|\/)conftest\.py$/;

/**
 * What a finding points at: kind, path, line, url and content hash, never the label (wording). A
 * collector's summary is generic ("Secret-shaped value appears committed ..."); the file it is about
 * is named only here, so a finding re-cited to another file is a different finding.
 */
export function evidenceIdentity(finding: Finding): string {
  return pointerIdentity(finding.evidence);
}

function pointerIdentity(pointer: Finding['evidence']): string {
  const { kind, path, line, url, contentHash } = pointer;
  return JSON.stringify([kind, path ?? null, line ?? null, url ?? null, contentHash ?? null]);
}

function sameFinding(a: Finding, b: Finding): boolean {
  return a.summary === b.summary && evidenceIdentity(a) === evidenceIdentity(b);
}

/**
 * v27 abstains; it does not hide. Every finding v17 reports is still reported under v27, on the
 * same criterion, with the same summary, the same evidence pointer (evidenceIdentity) and the same
 * or a higher severity. The removals v27 makes by rule, each because the finding stated more than
 * Cejel read:
 *
 *   - a metric-derived summary ("<id> metric-derived score is ...") restates the score, so it
 *     changes whenever the score falls; the score itself is checked by checkNoRise;
 *   - a criterion that abstains under v27 as a recognised read failure (READ_FAILURE_CLASSES,
 *     checked here, not assumed from checkNoRise), or only because the clone is shallow
 *     (shallowOnlyAbstention, F1), reports nothing it derived from the content it did not read. A critical finding is never removed this way: v27 keeps a collector's critical
 *     finding through an LFS abstention, and A2 does not abstain on a shallow clone while one
 *     stands;
 *   - A1's "Test suite files are present, ..." finding, where v27 measures a test_to_source_ratio of
 *     0: the only test-shaped files were conftest.py, which v27 does not count as tests (#518), so
 *     the finding's premise is false under v27.
 *
 * One re-citation is allowed, exactly: A1's info finding "Test suite files are present, ..." that
 * v17 anchors (kind test_run) to a conftest.py may be anchored by v27, still info, to the pointer
 * v17's own A1 evidence already holds for the first detected test file that is not a conftest.py:
 * the same kind, label, path, line and content hash, so v27 can only re-cite to a file v17 read and
 * cited, at the position and content v17 recorded. v27 does not cite conftest.py as test evidence
 * (#518). Nothing else may change its pointer; a critical finding never does (lostCriticalFindings).
 */
export function lostFindings(before: WitanReport, after: WitanReport): string[] {
  const lost: string[] = [];
  for (const v17 of before.criteria) {
    const v27 = after.criteria.find(({ id }) => id === v17.id);
    const abstainedAsReadFailure =
      v27 !== undefined &&
      v27.status === 'insufficient_data' &&
      v17.status !== 'insufficient_data' &&
      (READ_FAILURE_CLASSES.some(({ recognises }) => recognises(after, v27)) || shallowOnlyAbstention(after, v27));
    for (const finding of v17.findings) {
      if (finding.summary.includes('metric-derived score')) continue;
      if (abstainedAsReadFailure && finding.severity !== 'critical') continue;
      if (
        v17.id === 'A1' &&
        finding.summary.startsWith('Test suite files are present') &&
        v27?.metrics.find(({ name }) => name === 'test_to_source_ratio')?.value === 0
      ) {
        continue;
      }
      const pinned = v17.evidence.find(
        (pointer) =>
          pointer.kind === 'test_run' && pointer.label === 'Detected test file' && !CONFTEST_PATH.test(pointer.path ?? ''),
      );
      const reCitedFromConftest = (candidate: Finding): boolean =>
        v17.id === 'A1' &&
        finding.summary.startsWith('Test suite files are present') &&
        finding.severity === 'info' &&
        finding.evidence.kind === 'test_run' &&
        CONFTEST_PATH.test(finding.evidence.path ?? '') &&
        pinned !== undefined &&
        candidate.summary === finding.summary &&
        candidate.severity === 'info' &&
        candidate.evidence.label === pinned.label &&
        evidenceIdentity(candidate) === pointerIdentity(pinned);
      const kept = v27?.findings.some(
        (candidate) =>
          (sameFinding(candidate, finding) || reCitedFromConftest(candidate)) &&
          (FINDING_SEVERITY[candidate.severity] ?? 0) >= (FINDING_SEVERITY[finding.severity] ?? 99),
      );
      if (!kept) {
        const v27Same = (v27?.findings ?? []).filter(({ summary }) => summary === finding.summary);
        lost.push(
          `${v17.id}: ${finding.severity} "${finding.summary}" at ${evidenceIdentity(finding)} is absent, less severe or re-cited under v27 (v27 has: ${
            v27Same.map((candidate) => `${candidate.severity} at ${evidenceIdentity(candidate)}`).join('; ') || 'no finding with this summary'
          })`,
        );
      }
    }
  }
  return lost;
}

/** The critical findings v17 reports that v27 does not report as critical with the same summary and evidence. */
export function lostCriticalFindings(before: WitanReport, after: WitanReport): string[] {
  const lost: string[] = [];
  for (const v17 of before.criteria) {
    const own = v17.findings.filter(
      ({ severity, summary }) => severity === 'critical' && !summary.includes('metric-derived score'),
    );
    if (own.length === 0) continue;
    const v27 = after.criteria.find(({ id }) => id === v17.id);
    const critical = v27?.findings.filter(({ severity }) => severity === 'critical') ?? [];
    for (const finding of own) {
      if (!critical.some((candidate) => sameFinding(candidate, finding))) {
        const v27Same = (v27?.findings ?? []).filter(({ summary }) => summary === finding.summary);
        lost.push(
          `${v17.id}: critical "${finding.summary}" at ${evidenceIdentity(finding)} (v27 has: ${
            v27Same.map((candidate) => `${candidate.severity} at ${evidenceIdentity(candidate)}`).join('; ') || 'no finding with this summary'
          })`,
        );
      }
    }
  }
  return lost;
}
