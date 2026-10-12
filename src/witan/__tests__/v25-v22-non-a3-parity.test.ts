import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanInputSignal, WitanReport } from '../schemas.js';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V22, WITAN_RUBRIC_VERSION_V25 } from '../rubric-version.js';
import { WITAN_RUBRIC } from '../rubric.js';
import { createWitanReport } from '../scoring.js';
import {
  BEHAVIOUR_CORPUS,
  BEHAVIOUR_CORPUS_HEAD_SHAS,
  buildBehaviourFixture,
  fixtureHeadSha,
} from './fixtures/behaviour-corpus.js';

// V25 IS V22 OUTSIDE A3 — measured, not declared. Same guard v24-v22-non-a2-parity.test.ts installs
// for v24, for the same reason: v24's declaration was true in repo-signals.ts while four
// scoring.ts allowlists silently sent it down a different path (cejel #378). A reference count
// cannot see that; scoring both rubrics can.
//
// v25 is declared as v22 with one mechanism: A3's scored "health or readiness signal" component
// also credits a route declared inline in an application file. So two things must hold:
//   1. every criterion other than A3 is byte-identical to v22 on every fixture, with and without
//      ingested signals;
//   2. A3 itself differs from v22 ONLY on the fixtures that actually hold an inline health route.
//      A v25 that moved A3 anywhere else would be a second mechanism the declaration does not name.

const SCAN_GENERATED_AT = '2026-09-15T00:00:00.000Z';

/** The one criterion v25 is declared to change. */
const V25_CHANGED_CRITERIA: readonly string[] = ['A3'];

/** The corpus fixtures that declare a health route inline in an application file. */
const FIXTURES_WITH_INLINE_HEALTH_ROUTE: readonly string[] = [
  'complete-node-service',
  'inline-health-route-and-prettier-handler',
];

const SYNTHETIC_INPUT_SIGNALS: readonly WitanInputSignal[] = WITAN_RUBRIC.map(({ id }) => ({
  source: 'sarif:parity-fixture',
  provenance: 'operator_supplied',
  dimension: id,
  weight: 1,
  findings: Array.from({ length: 5 }, (_, index) => ({
    ruleId: `parity-${index}`,
    severity: 'critical' as const,
    message: 'synthetic finding for the v22/v25 parity guard',
  })),
}));

interface Scored {
  readonly v22: WitanReport;
  readonly v25: WitanReport;
}

const corpusScan = new Map<string, Scored>();
const withIngestedSignals = new Map<string, Scored>();

beforeAll(() => {
  for (const fixture of BEHAVIOUR_CORPUS) {
    const dir = buildBehaviourFixture(fixture);
    expect(
      fixtureHeadSha(dir),
      `${fixture.name}: the fixture does not reproduce on this machine; nothing measured from it ` +
        'is interpretable.',
    ).toBe(BEHAVIOUR_CORPUS_HEAD_SHAS[fixture.name]);
    const inputFor = (rubricVersion: string) =>
      buildWitanInputFromRepo({
        productSlug: fixture.name,
        productDisplayName: fixture.name,
        repoPath: dir,
        generatedAt: SCAN_GENERATED_AT,
        rubricVersion,
      });
    const v22Input = inputFor(WITAN_RUBRIC_VERSION_V22);
    const v25Input = inputFor(WITAN_RUBRIC_VERSION_V25);
    corpusScan.set(fixture.name, {
      v22: createWitanReport(v22Input),
      v25: createWitanReport(v25Input),
    });
    withIngestedSignals.set(fixture.name, {
      v22: createWitanReport(v22Input, SYNTHETIC_INPUT_SIGNALS),
      v25: createWitanReport(v25Input, SYNTHETIC_INPUT_SIGNALS),
    });
  }
}, 600_000);

function criteriaById(report: WitanReport, keep: (id: string) => boolean): Record<string, string> {
  const byId: Record<string, string> = {};
  for (const criterion of report.criteria as readonly WitanCriterionScore[]) {
    if (keep(criterion.id)) byId[criterion.id] = JSON.stringify(criterion);
  }
  return byId;
}

function divergent(scored: Scored, keep: (id: string) => boolean): string[] {
  const v22 = criteriaById(scored.v22, keep);
  const v25 = criteriaById(scored.v25, keep);
  const ids = [...new Set([...Object.keys(v22), ...Object.keys(v25)])].sort();
  return ids.filter((id) => v22[id] !== v25[id]);
}

describe('v25 scores identically to v22 on every criterion except A3', () => {
  it('covers the whole behaviour corpus', () => {
    expect(corpusScan.size).toBe(BEHAVIOUR_CORPUS.length);
    expect(withIngestedSignals.size).toBe(BEHAVIOUR_CORPUS.length);
  });

  for (const [pass, results] of [
    ['corpus scan', corpusScan],
    ['corpus scan with ingested signals', withIngestedSignals],
  ] as const) {
    for (const fixture of BEHAVIOUR_CORPUS) {
      it(`${pass}: ${fixture.name}`, () => {
        const scored = results.get(fixture.name) as Scored;
        expect(scored.v22.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V22);
        expect(scored.v25.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V25);
        expect(
          divergent(scored, (id) => !V25_CHANGED_CRITERIA.includes(id)),
          `${fixture.name}: v25 diverges from v22 outside A3. v25 is declared as v22 with only ` +
            "A3's inline health-route credit added, so every rubric-version allowlist that names " +
            'WITAN_RUBRIC_VERSION_V22 must also name WITAN_RUBRIC_VERSION_V25 (scoring.ts and ' +
            'repo-signals.ts), unless the v25 declaration in rubric-version.ts is rewritten in ' +
            'the same change.',
        ).toEqual([]);
      });
    }
  }
});

describe('v25 moves A3 only where an inline health route exists', () => {
  for (const fixture of BEHAVIOUR_CORPUS) {
    const expectMoved = FIXTURES_WITH_INLINE_HEALTH_ROUTE.includes(fixture.name);
    it(`${fixture.name}: A3 ${expectMoved ? 'moves' : 'is unchanged'}`, () => {
      const scored = corpusScan.get(fixture.name) as Scored;
      expect(
        divergent(scored, (id) => V25_CHANGED_CRITERIA.includes(id)),
        expectMoved
          ? `${fixture.name} holds an inline health route; v25 should credit it`
          : `${fixture.name} holds no inline health route; v25 must not move A3 here`,
      ).toEqual(expectMoved ? ['A3'] : []);
    });
  }
});
