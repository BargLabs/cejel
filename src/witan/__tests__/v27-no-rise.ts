import type { WitanCriterionScore, WitanReport } from '../schemas.js';

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
//   - (a) every insufficient_data that v27 introduces must be a read-failure abstention: listed in
//     contentReadSummary.affectedCriteria or the v27 shallow-clone abstention of A2 or B2, scored
//     0, and kept in its category's denominator (ADR-0001: an abstention can never raise a
//     composite). The denominator is checked arithmetically against the reported composite, not
//     inferred from a label;
//   - (b) a composite scored under v17 and null under v27 is a move to report, and fails, as does
//     the reverse (which norise.mjs already counts as a rise).

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

export type IntroducedAbstentionKind = 'content-read' | 'shallow-history';

export interface IntroducedAbstention {
  readonly id: string;
  readonly kind: IntroducedAbstentionKind;
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

function shallowAbstention(report: WitanReport, criterion: WitanCriterionScore): boolean {
  return (
    (criterion.id === 'A2' || criterion.id === 'B2') &&
    (report.historyLimitations ?? []).includes(SHALLOW_HISTORY_V27_ABSTENTION) &&
    (criterion.notes ?? '').startsWith(`${criterion.id} abstained: this repository is a shallow clone`)
  );
}

export function checkNoRise(before: WitanReport, after: WitanReport): NoRiseResult {
  const problems: string[] = [];
  const fallenCriteria: string[] = [];
  const fallenComposites: string[] = [];
  const introduced = new Map<string, { kind: IntroducedAbstentionKind; denominator: IntroducedAbstention['denominator'] }>();

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
      const contentRead = (after.contentReadSummary?.affectedCriteria ?? []).includes(v27.id);
      const shallow = shallowAbstention(after, v27);
      if (!contentRead && !shallow) {
        problems.push(
          `${v27.id} abstains under v27 (was ${v17.status}) without a read failure: not in contentReadSummary.affectedCriteria and not the shallow-clone abstention`,
        );
      }
      if (v27.score !== 0) problems.push(`${v27.id} abstains under v27 with score ${v27.score}, not 0`);
      if ((v27.notes ?? '').includes('does not affect the composite score')) {
        problems.push(`${v27.id} abstains under v27 as a self-imposed coverage limit excluded from the composite`);
      }
      introduced.set(v27.id, { kind: shallow ? 'shallow-history' : 'content-read', denominator: 'unchecked' });
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

/**
 * v27 abstains; it does not hide. A collector's own critical finding under v17 is still present
 * under v27 (the curated test's preservation property, applied to any pair of reports).
 */
export function lostCriticalFindings(before: WitanReport, after: WitanReport): string[] {
  const lost: string[] = [];
  for (const v17 of before.criteria) {
    const own = v17.findings.filter(
      ({ severity, summary }) => severity === 'critical' && !summary.includes('metric-derived score'),
    );
    if (own.length === 0) continue;
    const v27 = after.criteria.find(({ id }) => id === v17.id);
    const kept = new Set(v27?.findings.map(({ summary }) => summary) ?? []);
    for (const { summary } of own) if (!kept.has(summary)) lost.push(`${v17.id}: ${summary}`);
  }
  return lost;
}
