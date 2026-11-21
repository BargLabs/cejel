import { expect } from 'vitest';

import { serializeWitanReport } from '../attestation.js';
import { WITAN_RUBRIC_VERSION_V27, WITAN_RUBRIC_VERSION_V28 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';

// Item F of the second v28 card (goal_cejel_v28_a3_health_readings_and_a2_pem_2026-11-20). Ten tests
// compare every rubric but v27 and v28 with report pins captured from main before v28 existed, and
// left v28 out. Each now asserts, through this helper, that v28's report equals v27's on each of its
// fixtures, the report's rubric identifier aside, except on a fixture a v28 item reaches, which the
// test lists by name with the item (card 1's A1 items B to D, or card 2's items A to C). A fixture
// that differs and is not listed, or that is listed and does not differ, fails the test.

/** A v28 report serialized with its rubric identifier written as v27's. */
export function v28ReportAsV27(report: WitanReport): string {
  return serializeWitanReport(report).split(WITAN_RUBRIC_VERSION_V28).join(WITAN_RUBRIC_VERSION_V27);
}

export function expectV28EqualsV27(
  names: readonly string[],
  report: (name: string, rubricVersion: string) => WitanReport,
  reachedBy: Readonly<Record<string, string>>,
): void {
  const differing = names.filter(
    (name) =>
      v28ReportAsV27(report(name, WITAN_RUBRIC_VERSION_V28)) !==
      serializeWitanReport(report(name, WITAN_RUBRIC_VERSION_V27)),
  );
  expect(
    differing,
    'fixtures on which v28 differs from v27; each must be listed with the v28 item that reaches it',
  ).toEqual(names.filter((name) => reachedBy[name] !== undefined));
}
