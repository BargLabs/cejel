import type { WitanCriterionScore, WitanReport } from '../witan/schemas.js';

/**
 * A GitLab metrics report (`artifacts:reports:metrics`): one `<name> <value>` per line. A merge
 * request compares it with the target branch's baseline and lists the metrics that were added,
 * removed or changed. Documented in docs/gitlab-ci.md.
 */
export interface GitLabMetricsExport {
  /** `<name> <value>` lines, in a fixed order: overall, process trust, code trust, criteria. */
  lines: string[];
  /** Names of values Cejel did not measure, so no line was written for them. */
  leftOut: string[];
  /** Set only for an abstained report: why the file is empty. */
  abstainedReason?: string;
}

/** Statuses the scorer leaves out of the composite: the criterion was not measured. */
const UNMEASURED_STATUSES: ReadonlySet<WitanCriterionScore['status']> = new Set([
  'insufficient_data',
  'not_applicable',
]);

/**
 * The terminal certificate's rounding (`formatScore` in src/terminal.ts): one decimal, so a
 * difference below that precision never reads as a change.
 */
export function formatGitLabMetricScore(score: number): string {
  return score.toFixed(1);
}

/** `A4` becomes `a4`; a trading-rubric id such as `risk-governance` becomes `risk_governance`. */
export function gitLabCriterionMetricName(id: string): string {
  return `cejel_criterion_${id.toLowerCase().replaceAll('-', '_')}_score`;
}

function isMeasured(criterion: Pick<WitanCriterionScore, 'status'>): boolean {
  return !UNMEASURED_STATUSES.has(criterion.status);
}

/**
 * Pure: a Cejel report in, GitLab metric lines out. No I/O, no clock, no randomness.
 *
 * A value Cejel did not measure gets no line, never a 0 or other stand-in: an unrated criterion
 * (insufficient_data, not_applicable), a null score, a trust score whose category has no measured
 * criterion (the scorer averages such a category to 0), and the overall score when no criterion
 * was measured at all. A trust line is written only under the category it names, so a rubric
 * without code_trust or process_trust criteria writes neither.
 */
export function exportGitLabMetrics(report: WitanReport): GitLabMetricsExport {
  if (report.verdict === 'insufficient_source') {
    return { lines: [], leftOut: [], abstainedReason: report.insufficientSourceReason };
  }

  const lines: string[] = [];
  const leftOut: string[] = [];
  const add = (name: string, score: number | null, measured: boolean) => {
    if (score === null || !measured) {
      leftOut.push(name);
      return;
    }
    lines.push(`${name} ${formatGitLabMetricScore(score)}`);
  };

  const criteria: readonly WitanCriterionScore[] = report.criteria;
  add('cejel_overall_score', report.overallScore, criteria.some(isMeasured));
  const trust: Array<[string, number | null, WitanCriterionScore['category']]> = [
    ['cejel_process_trust_score', report.processTrustScore, 'process_trust'],
    ['cejel_code_trust_score', report.codeTrustScore, 'code_trust'],
  ];
  for (const [name, score, category] of trust) {
    const inCategory = criteria.filter((criterion) => criterion.category === category);
    // A rubric with no criterion in this category has no such score to measure or leave out.
    if (inCategory.length === 0) continue;
    add(name, score, inCategory.some(isMeasured));
  }
  for (const criterion of criteria) {
    add(gitLabCriterionMetricName(criterion.id), criterion.score, isMeasured(criterion));
  }
  return { lines, leftOut };
}

/** The file body: one line per metric, newline-terminated; empty when there is no metric. */
export function renderGitLabMetricsFile(result: GitLabMetricsExport): string {
  return result.lines.length === 0 ? '' : `${result.lines.join('\n')}\n`;
}

/** The one stderr footer the CLI prints, kept here so the wording is tested with the export. */
export function renderGitLabMetricsFooter(result: GitLabMetricsExport): string {
  if (result.abstainedReason !== undefined) {
    return `Cejel: abstained report (insufficient_source): wrote 0 metrics. ${result.abstainedReason}\n`;
  }
  const named = result.leftOut.length === 0 ? '' : ` (${result.leftOut.join(', ')})`;
  return (
    `Cejel: wrote ${result.lines.length} metric(s); ` +
    `${result.leftOut.length} value(s) left out because Cejel did not measure them${named}.\n`
  );
}
