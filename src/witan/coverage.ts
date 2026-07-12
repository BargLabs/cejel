/**
 * Measured-coverage / confidence indicator for witan reports
 * (goal_cejel_leaderboard_coverage_confidence_2026-07-10).
 *
 * A score reflects only its MEASURED dimensions: a criterion whose status is
 * 'not_applicable' or 'insufficient_data' produced no real score and is
 * excluded from the composite (scoring.ts / computeComparativeScores). That is
 * the fair treatment — but it means a high score can rest on very few signals
 * (cejel process trust 4.0 rests on B3 alone; B1/B4/B5/B6 are N/A and B2 is
 * insufficient-data). This module makes that thinness visible: how many
 * dimensions were actually measured, per category and overall, plus a
 * low-confidence flag when a score rests on fewer than half of its dimensions.
 *
 * DISPLAY-ONLY by design: nothing here feeds back into scores or ranking.
 * Whether the ranking should band or discount low-confidence scores is a
 * separate deliberate calibration decision (flagged as a follow-on in the
 * goal), not something to change silently alongside a display fix.
 */

import type { WitanCriterionScore, WitanReport } from './schemas.js';

export interface CoverageCounts {
  measured: number;
  total: number;
}

export interface CategoryCoverage extends CoverageCounts {
  /** Report category id, e.g. 'code_trust'. */
  category: string;
}

export interface MeasuredCoverage {
  /** Per category present in the report, in the report's encounter order. */
  byCategory: CategoryCoverage[];
  /** All criteria in the report, regardless of category. */
  overall: CoverageCounts;
  /**
   * True when any category (or the overall set) had fewer than
   * LOW_CONFIDENCE_COVERAGE_THRESHOLD of its dimensions measured — the score
   * rests on few signals and is less certain than the same score measured
   * across many.
   */
  lowConfidence: boolean;
}

/**
 * A category whose measured share is strictly below this is low-confidence.
 * Calibrated on the committed 2026-07-10 board: typical external repos measure
 * 3 of 6 process dimensions (exactly half — not flagged); cejel measures 1 of 6
 * (flagged). Chosen for display honesty, not scoring — see module header.
 */
export const LOW_CONFIDENCE_COVERAGE_THRESHOLD = 0.5;

/**
 * A criterion is MEASURED only when the scorer produced a real score for it.
 * 'not_applicable' and 'insufficient_data' are unmeasured; 'unverified' counts
 * as measured because it IS averaged into the composite as a fail-closed zero
 * (see the status enum notes in packages/shared/src/schemas/witan.ts).
 */
export function isMeasuredCriterionStatus(status: WitanCriterionScore['status']): boolean {
  return status !== 'not_applicable' && status !== 'insufficient_data';
}

export function computeMeasuredCoverage(report: WitanReport): MeasuredCoverage {
  const byCategory: CategoryCoverage[] = [];
  const overall: CoverageCounts = { measured: 0, total: 0 };

  for (const criterion of report.criteria) {
    let bucket = byCategory.find((entry) => entry.category === criterion.category);
    if (!bucket) {
      bucket = { category: criterion.category, measured: 0, total: 0 };
      byCategory.push(bucket);
    }
    bucket.total += 1;
    overall.total += 1;
    if (isMeasuredCriterionStatus(criterion.status)) {
      bucket.measured += 1;
      overall.measured += 1;
    }
  }

  const lowConfidence = [...byCategory, overall].some(
    (counts) =>
      counts.total > 0 && counts.measured / counts.total < LOW_CONFIDENCE_COVERAGE_THRESHOLD,
  );

  return { byCategory, overall, lowConfidence };
}

/** 'code_trust' → 'code' — the compact label used in the board's Coverage cell. */
function shortCategoryLabel(category: string): string {
  return category.replace(/_trust$/, '').replaceAll('_', ' ');
}

/** 'code_trust' → 'code trust' — the full label used in report prose. */
export function categoryLabel(category: string): string {
  return category.replaceAll('_', ' ');
}

/** The plain per-category counts, e.g. "code 4/5 · process 1/6" (no flag). */
export function formatCoverageCounts(coverage: MeasuredCoverage): string {
  return coverage.byCategory
    .map((entry) => `${shortCategoryLabel(entry.category)} ${entry.measured}/${entry.total}`)
    .join(' · ');
}

/**
 * The board's markdown Coverage cell: the counts, with the low-confidence
 * marker appended when flagged. Shared VERBATIM by the board renderer
 * (leaderboard.ts) and the freshness guard (leaderboard-freshness.ts) so a
 * committed cell that drifts from its committed report goes RED.
 */
export function formatCoverageCellMarkdown(coverage: MeasuredCoverage): string {
  const cell = formatCoverageCounts(coverage);
  return coverage.lowConfidence ? `${cell} · **low confidence**` : cell;
}

/**
 * The report's Summary Scores coverage line body, e.g.
 * "code trust 4/5, process trust 1/6, overall 5/11".
 */
export function formatCoverageSummary(coverage: MeasuredCoverage): string {
  const parts = coverage.byCategory.map(
    (entry) => `${categoryLabel(entry.category)} ${entry.measured}/${entry.total}`,
  );
  parts.push(`overall ${coverage.overall.measured}/${coverage.overall.total}`);
  return parts.join(', ');
}
