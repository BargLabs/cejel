import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { WITAN_REPORT_FORMAT_VERSION } from '../witan/schemas.js';

// goal_cejel_detector_false_assertions_0_4_9_2026-09-14, finding 4: docs/format-stability.md
// stated `predicate.reportFormatVersion` was "currently `1.0`" while schemas.ts had moved
// WITAN_REPORT_FORMAT_VERSION to '1.1' (emitted by attestation.ts) — the very page an external
// gate binds to understated what the tool actually emits. The doc still restates the version
// as prose (a generated/interpolated fragment was judged not worth the build-step complexity
// for one line), so this guard is the predictable-second-drift preventer: it fails the moment
// the doc's stated value and the code constant disagree again.
describe('format-stability.md report-format version stays in sync with the code constant', () => {
  it('states the current WITAN_REPORT_FORMAT_VERSION for predicate.reportFormatVersion', () => {
    const doc = readFileSync(new URL('../../docs/format-stability.md', import.meta.url), 'utf8');
    const line = doc
      .split('\n')
      .find((l) => l.includes('predicate.reportFormatVersion'));
    expect(line, 'docs/format-stability.md must document predicate.reportFormatVersion').toBeDefined();
    expect(line).toContain(`currently \`${WITAN_REPORT_FORMAT_VERSION}\``);
  });
});
