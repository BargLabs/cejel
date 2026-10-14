import type { WitanReport } from './schemas.js';

// The report schema is byte-pinned by an unrelated commercial evidence contract, so v48 cannot
// add a second machine verdict beside `insufficient_source`. This exact reason is the stable
// discriminator presentation layers use to distinguish a real source tree with zero measurable
// free-core criteria from a structural source absence.
export const WITAN_NO_MEASUREMENT_REASON =
  'No free-core rubric criterion produced a measurable signal. Cejel abstains rather than publish a numeric zero for an entirely unmeasured repository.';

// Stable identity for v17's failure-derived measured A1 absence. The scorer uses this exact
// proposition to keep the new authenticated zero at 0.0 without changing any other v16
// critical-finding score behavior.
export const WITAN_AUTHENTICATED_A1_ABSENCE_SUMMARY =
  'Reviewable source is present, but the tracked scan-eligible inventory matched no concrete test file, configured test runner, CI test command, or coverage configuration.';
export const WITAN_DIRECTORY_WALK_AUTHENTICATED_A1_ABSENCE_SUMMARY =
  'Reviewable source is present, but the bounded directory walk matched no concrete test file, configured test runner, CI test command, or coverage configuration.';
export const WITAN_LEGACY_AUTHENTICATED_A1_ABSENCE_SUMMARY =
  'Reviewable source is present, but the complete tracked inventory contains no concrete test file, configured test runner, CI test command, or coverage configuration.';

// v26 item 6 (docs/calibration/v26/ruling-item-6.md, operator-signed): when A5's no-reconciliation
// finding or A2's tenant-without-RLS finding abstains because the repository's own bytes do not
// settle it, the collector writes the exact sentence the ruling fixes into that criterion's
// `notes`, and the certificate's "What was not established" section carries it. No new report.json
// field: the sentence travels in the criterion `notes` every report already has.
export const WITAN_A5_RECONCILIATION_UNSETTLED_DISCLOSURE =
  "Whether this repository's claims are reconciled against its implementation cannot be settled from static evidence; Cejel makes no finding on it.";
export const WITAN_A2_TENANT_ISOLATION_UNSETTLED_DISCLOSURE =
  'Whether tenant isolation is enforced outside the database cannot be settled from static evidence; Cejel makes no finding on it.';

export function isWitanNoMeasurementAbstention(report: WitanReport): boolean {
  return (
    report.verdict === 'insufficient_source' &&
    report.insufficientSourceReason.startsWith(WITAN_NO_MEASUREMENT_REASON) &&
    report.criteria.every(
      ({ status }) => status === 'not_applicable' || status === 'insufficient_data',
    )
  );
}

export function renderWitanAbstentionLabel(report: WitanReport): string {
  return isWitanNoMeasurementAbstention(report) ? 'Insufficient evidence' : 'Insufficient source';
}
