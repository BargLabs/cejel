import type { WitanReport } from '../schemas.js';

// Every way v28 can score above v27 on one repository: the composite or either trust score rises;
// the composite exists where v27 abstained; a criterion's score rises; or a criterion v27 kept out
// of the composite as not applicable is scored under v28, which changes which criteria the
// composite averages (the exit PENDING_cejel_no_rise_checks_every_exit_from_the_composite names).
// Shared by v28-a1-readings.test.ts and v28-a3-a2-readings.test.ts.
export function v28Rises(v27: WitanReport, v28: WitanReport): string[] {
  const moved: string[] = [];
  const above = (a: number | null | undefined, b: number | null | undefined) =>
    typeof a === 'number' && typeof b === 'number' && a > b;
  if (above(v28.overallScore, v27.overallScore)) moved.push('overallScore');
  if (above(v28.codeTrustScore, v27.codeTrustScore)) moved.push('codeTrustScore');
  if (above(v28.processTrustScore, v27.processTrustScore)) moved.push('processTrustScore');
  if (v28.overallScore !== null && v27.overallScore === null) moved.push('overallScore (v27 abstained)');
  for (const criterion of v28.criteria) {
    const before = v27.criteria.find(({ id }) => id === criterion.id);
    if (above(criterion.score, before?.score)) moved.push(criterion.id);
    if (before?.status === 'not_applicable' && criterion.status !== 'not_applicable') {
      moved.push(`${criterion.id} (v27 not applicable)`);
    }
  }
  return moved;
}

const HEALTHCHECK_SUMMARY = 'A runtime Dockerfile declares no active HEALTHCHECK instruction.';
const HEALTH_ROUTE_SUMMARY =
  'A production HTTP entrypoint handles requests directly but declares no health or readiness route.';
const PEM_SUMMARY = /PEM-formatted private key/i;
const COVERING_LABEL = /^Runtime Dockerfile healthcheck/;

/**
 * Which of the second v28 card's items (21 Nov) a v28 report shows reaching the repository: item A
 * where A3 carries the healthcheck finding or cites a covering source, item B where A3 carries the
 * health-route finding, item C where A2 carries a PEM private-key finding. Item D adds nothing to a
 * report: under v28 the build/typecheck finding never fires, as under v27.
 */
export function v28A3A2ItemsReaching(v28: WitanReport): ('A' | 'B' | 'C')[] {
  const items: ('A' | 'B' | 'C')[] = [];
  const a3 = v28.criteria.find(({ id }) => id === 'A3');
  const a2 = v28.criteria.find(({ id }) => id === 'A2');
  if (
    a3?.findings.some(({ summary }) => summary === HEALTHCHECK_SUMMARY) ||
    a3?.evidence.some(({ label }) => COVERING_LABEL.test(label))
  ) {
    items.push('A');
  }
  if (a3?.findings.some(({ summary }) => summary === HEALTH_ROUTE_SUMMARY)) items.push('B');
  if (a2?.findings.some(({ summary }) => PEM_SUMMARY.test(summary))) items.push('C');
  return items;
}
