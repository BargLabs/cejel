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
// v26 item 8 (docs/calibration/v26/ruling-item-8.md, operator-signed): the same mechanism for A3's
// "declares neither a build nor a typecheck script" finding when a place a step could be was not read.
export const WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE =
  'Whether this package has a build or type-check step outside the files read cannot be settled from static evidence; Cejel makes no finding on it.';
// Every rubric, presentation only: A2 names credential-shaped values it read and set aside as
// documentation placeholders (placeholderSetAsideDisclosure in repo-signals.ts). The sentence is
// the last one in A2's notes and starts with this prefix; the certificate lifts it from there into
// "What was not established". It names paths and counts, never a value.
export const WITAN_A2_PLACEHOLDER_SET_ASIDE_PREFIX = 'Cejel read and set aside ';
// Every rubric, presentation only: B3 names workflows its PR-gate count includes that Cejel did not
// see run a check (b3UnshownCheckDisclosure in repo-signals.ts). Last in B3's notes, lifted from
// this prefix into "What was not established". The count itself is unchanged.
export const WITAN_B3_UNSHOWN_CHECK_PREFIX = 'B3 counted workflows Cejel did not see run a check: ';

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
