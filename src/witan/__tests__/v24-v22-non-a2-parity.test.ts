import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanInputSignal, WitanReport } from '../schemas.js';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V22, WITAN_RUBRIC_VERSION_V24 } from '../rubric-version.js';
import { WITAN_RUBRIC } from '../rubric.js';
import { createWitanReport } from '../scoring.js';
import {
  BEHAVIOUR_CORPUS,
  BEHAVIOUR_CORPUS_HEAD_SHAS,
  buildBehaviourFixture,
  fixtureHeadSha,
} from './fixtures/behaviour-corpus.js';

// V24 IS V22 OUTSIDE A2 — measured, not declared.
//
// The v24 preregistration (ef253a8) defines witan-rubric-v24-prospective-2026-09-15 as v22
// exactly, with only A2's current-tree classification changed. v24-declared-scope.test.ts guards
// that declaration in repo-signals.ts by counting WITAN_RUBRIC_VERSION_V24 references there. It
// could not see scoring.ts, where four rubric-version allowlists (usesV17DetectorClosure, the
// signal-adjustment status gate, usesMetricScoring and the synthesized-finding gate) ended at V23.
// v24 fell through every one of them to the legacy non-metric scoring path and differed from v22
// on nine criteria; the behaviour-fingerprint pins merged in #361 recorded that as v24's identity,
// because identity pins record whatever ran (cejel #378, edfc12f).
//
// This guard asks the question the declaration makes: scored under v22 and under v24, is every
// criterion other than A2 byte-identical on every behaviour-corpus fixture? It does not count
// references in any file, so a v22 allowlist anywhere in the scoring path that omits V24 fails it
// wherever the corpus reaches that allowlist.
//
// Two passes. The corpus scan alone ingests no external signals, so it never reaches the
// signal-adjustment status gate (statusAfterInputAdjustment returns early on a zero adjustment).
// The second pass re-scores the same repository inputs with one fixed synthetic ingested signal
// per criterion, so that gate is exercised on every fixture too.

const SCAN_GENERATED_AT = '2026-09-15T00:00:00.000Z';

/** The one criterion v24 is declared to change. */
const V24_CHANGED_CRITERIA: readonly string[] = ['A2'];

/**
 * A fixed synthetic ingested signal on every criterion: heavy enough to reach the maximum
 * adjustment, so the adjusted status depends on which status rule the rubric applies.
 */
const SYNTHETIC_INPUT_SIGNALS: readonly WitanInputSignal[] = WITAN_RUBRIC.map(({ id }) => ({
  source: 'sarif:parity-fixture',
  provenance: 'operator_supplied',
  dimension: id,
  weight: 1,
  findings: Array.from({ length: 5 }, (_, index) => ({
    ruleId: `parity-${index}`,
    severity: 'critical' as const,
    message: 'synthetic finding for the v22/v24 parity guard',
  })),
}));

interface Scored {
  readonly v22: WitanReport;
  readonly v24: WitanReport;
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
    const v24Input = inputFor(WITAN_RUBRIC_VERSION_V24);
    corpusScan.set(fixture.name, {
      v22: createWitanReport(v22Input),
      v24: createWitanReport(v24Input),
    });
    withIngestedSignals.set(fixture.name, {
      v22: createWitanReport(v22Input, SYNTHETIC_INPUT_SIGNALS),
      v24: createWitanReport(v24Input, SYNTHETIC_INPUT_SIGNALS),
    });
  }
}, 600_000);

function criteriaOutsideV24Scope(report: WitanReport): Record<string, string> {
  const byId: Record<string, string> = {};
  for (const criterion of report.criteria as readonly WitanCriterionScore[]) {
    if (V24_CHANGED_CRITERIA.includes(criterion.id)) continue;
    byId[criterion.id] = JSON.stringify(criterion);
  }
  return byId;
}

function divergentCriteria(scored: Scored): string[] {
  const v22 = criteriaOutsideV24Scope(scored.v22);
  const v24 = criteriaOutsideV24Scope(scored.v24);
  const ids = [...new Set([...Object.keys(v22), ...Object.keys(v24)])].sort();
  return ids.filter((id) => v22[id] !== v24[id]);
}

describe('v24 scores identically to v22 on every criterion except A2', () => {
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
        expect(scored.v24.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V24);
        expect(
          divergentCriteria(scored),
          `${fixture.name}: v24 diverges from v22 outside A2. v24 is declared as v22 with only ` +
            "A2's current-tree classification changed, so every rubric-version allowlist that " +
            'names WITAN_RUBRIC_VERSION_V22 must also name WITAN_RUBRIC_VERSION_V24 (scoring.ts ' +
            'and repo-signals.ts), unless the v24 declaration in rubric-version.ts is rewritten ' +
            'in the same change.',
        ).toEqual([]);
      });
    }
  }
});
