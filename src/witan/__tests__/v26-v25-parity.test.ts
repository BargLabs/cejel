import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanInputSignal, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS,
  type WitanRubricBehaviourComponents,
} from '../rubric-fingerprint.js';
import { WITAN_RUBRIC_VERSION_V25, WITAN_RUBRIC_VERSION_V26 } from '../rubric-version.js';
import { WITAN_RUBRIC } from '../rubric.js';
import { createWitanReport } from '../scoring.js';
import {
  BEHAVIOUR_CORPUS,
  BEHAVIOUR_CORPUS_HEAD_SHAS,
  buildBehaviourFixture,
  fixtureHeadSha,
} from './fixtures/behaviour-corpus.js';

// V26 IS V25 — measured, not declared. v26 is the next calibration candidate, declared as v25's
// complete closure with no change of its own until its item cards land. Each item card is then
// measured against a v26 that equals v25, so this file is what makes "the delta is the item"
// true. A reference count (v26-declared-scope.test.ts) cannot see an allowlist that omits V26;
// scoring both rubrics can.
//
// The comparison is the WHOLE report, not a projection: every field except `rubricVersion`, the
// one field that is supposed to differ. The behaviour fingerprint field is compared too, and is
// equal, because the fingerprint excludes the rubric identifier by design (rubric-fingerprint.ts).
//
// When a v26 item card lands, it narrows this file to "v26 equals v25 except <the item>", the way
// v25-v22-non-a3-parity.test.ts narrows v25 against v22, in the same change as the declaration.

const SCAN_GENERATED_AT = '2026-09-15T00:00:00.000Z';

const PINS_PATH = fileURLToPath(
  new URL('./fixtures/behaviour-fingerprint-pins.json', import.meta.url),
);

const SYNTHETIC_INPUT_SIGNALS: readonly WitanInputSignal[] = WITAN_RUBRIC.map(({ id }) => ({
  source: 'sarif:parity-fixture',
  provenance: 'operator_supplied',
  dimension: id,
  weight: 1,
  findings: Array.from({ length: 5 }, (_, index) => ({
    ruleId: `parity-${index}`,
    severity: 'critical' as const,
    message: 'synthetic finding for the v25/v26 parity guard',
  })),
}));

interface Scored {
  readonly v25: WitanReport;
  readonly v26: WitanReport;
}

const publicScan = new Map<string, Scored>();
const withIngestedSignals = new Map<string, Scored>();

beforeAll(() => {
  for (const fixture of BEHAVIOUR_CORPUS) {
    const dir = buildBehaviourFixture(fixture);
    expect(
      fixtureHeadSha(dir),
      `${fixture.name}: the fixture does not reproduce on this machine; nothing measured from it ` +
        'is interpretable.',
    ).toBe(BEHAVIOUR_CORPUS_HEAD_SHAS[fixture.name]);
    const publicReport = (rubricVersion: string) =>
      scoreRepoWithPublicCejel({
        repoPath: dir,
        productSlug: fixture.name,
        productDisplayName: fixture.name,
        generatedAt: SCAN_GENERATED_AT,
        rubricVersion,
        ingestPatterns: [],
        autoDiscoverIngest: false,
      });
    publicScan.set(fixture.name, {
      v25: publicReport(WITAN_RUBRIC_VERSION_V25),
      v26: publicReport(WITAN_RUBRIC_VERSION_V26),
    });
    // Ingested signals reach the scoring.ts allowlists (signal adjustment, synthesized findings)
    // that a plain repository scan does not exercise.
    const signalledReport = (rubricVersion: string) =>
      createWitanReport(
        buildWitanInputFromRepo({
          productSlug: fixture.name,
          productDisplayName: fixture.name,
          repoPath: dir,
          generatedAt: SCAN_GENERATED_AT,
          rubricVersion,
        }),
        SYNTHETIC_INPUT_SIGNALS,
      );
    withIngestedSignals.set(fixture.name, {
      v25: signalledReport(WITAN_RUBRIC_VERSION_V25),
      v26: signalledReport(WITAN_RUBRIC_VERSION_V26),
    });
  }
}, 600_000);

function withoutRubricVersion(report: WitanReport): string {
  const { rubricVersion: _rubricVersion, ...rest } = report;
  return JSON.stringify(rest, null, 2);
}

describe('v26 scores identically to v25 on every behaviour-corpus specimen', () => {
  it('names the v26 identifier and covers the whole behaviour corpus', () => {
    expect(WITAN_RUBRIC_VERSION_V26).toBe('witan-rubric-v26-prospective-2026-10-14');
    expect(publicScan.size).toBe(BEHAVIOUR_CORPUS.length);
    expect(withIngestedSignals.size).toBe(BEHAVIOUR_CORPUS.length);
  });

  for (const [pass, results] of [
    ['public scan', publicScan],
    ['scan with ingested signals', withIngestedSignals],
  ] as const) {
    for (const fixture of BEHAVIOUR_CORPUS) {
      it(`${pass}: ${fixture.name}`, () => {
        const scored = results.get(fixture.name) as Scored;
        expect(scored.v25.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V25);
        expect(scored.v26.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V26);
        expect(
          withoutRubricVersion(scored.v26),
          `${fixture.name}: the v26 report differs from the v25 report outside rubricVersion. v26 ` +
            "is declared as v25's complete closure, so every rubric-version allowlist that names " +
            'WITAN_RUBRIC_VERSION_V25 must also name WITAN_RUBRIC_VERSION_V26 (scoring.ts and ' +
            'repo-signals.ts), unless the v26 declaration in rubric-version.ts is rewritten in ' +
            'the same change.',
        ).toBe(withoutRubricVersion(scored.v25));
      });
    }
  }
});

describe("v26's behaviour fingerprint is v25's", () => {
  it('the published fingerprint and the decomposed component pins are equal to v25', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<
      string,
      WitanRubricBehaviourComponents
    >;
    expect(pins[WITAN_RUBRIC_VERSION_V26]).toBeDefined();
    expect(pins[WITAN_RUBRIC_VERSION_V26]).toEqual(pins[WITAN_RUBRIC_VERSION_V25]);
    expect(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[WITAN_RUBRIC_VERSION_V26]).toBeDefined();
    expect(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[WITAN_RUBRIC_VERSION_V26]).toBe(
      WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[WITAN_RUBRIC_VERSION_V25],
    );
  });

  it('the report.json fingerprint field is equal on every specimen', () => {
    for (const fixture of BEHAVIOUR_CORPUS) {
      const scored = publicScan.get(fixture.name) as Scored;
      expect(scored.v26.rubricBehaviourFingerprint, `${fixture.name}: no v26 fingerprint`).toBeDefined();
      expect(scored.v26.rubricBehaviourFingerprint).toBe(scored.v25.rubricBehaviourFingerprint);
    }
  });
});
