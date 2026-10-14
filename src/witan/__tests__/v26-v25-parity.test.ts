import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  WitanCriterionMetric,
  WitanCriterionScore,
  WitanInputSignal,
  WitanReport,
} from '../schemas.js';

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

// V26 IS V25 EXCEPT ITEM 6 — measured, not declared. v26 is declared as v25's complete closure
// plus one change of its own, item 6 (docs/calibration/v26/ruling-item-6.md and its amendment 1):
// A5's no-reconciliation finding and A2's tenant-without-RLS finding fire only on the evidence that
// settles them, and otherwise abstain with a disclosure sentence in the criterion's notes; and,
// with no Cejel-format artifact present and none named, A5 is scored without
// reconciliation_artifact_depth. So, on every behaviour-corpus specimen, with and without ingested
// signals:
//   1. every criterion other than A2 and A5 is byte-identical to v25;
//   2. A2 keeps v25's metrics and positive evidence exactly, and differs only in findings, score,
//      status and notes; A5 keeps v25's positive evidence exactly, and its metrics differ only by
//      the omission of reconciliation_artifact_depth (amendment 1);
//   3. A5 differs exactly where v25 carries its no-reconciliation finding, since no specimen
//      declares a claim-reconciliation artifact; A2 differs only in notes, since no specimen holds
//      both row-level security and an uncovered tenant table, or the v25 gap;
//   4. every report-level field other than `rubricVersion`, `rubricBehaviourFingerprint`, the
//      criteria, and the composite scores A5's score feeds is identical, and those composites move
//      only where A5's score moved.
// A reference count (v26-declared-scope.test.ts) cannot see an allowlist that omits V26; scoring
// both rubrics can.

const SCAN_GENERATED_AT = '2026-09-15T00:00:00.000Z';

/** The criteria item 6 is declared to change. */
const ITEM_6_CRITERIA: readonly string[] = ['A2', 'A5'];
/** What item 6 may change within each of those criteria. Evidence is in neither list. */
const ITEM_6_FIELDS: Readonly<Record<string, readonly string[]>> = {
  A2: ['findings', 'notes', 'score', 'status'],
  // Amendment 1 omits one A5 metric, which also moves the other two's applied weight shares and,
  // when ingested signals adjust the score, the metric-only `nativeScore` beside it.
  A5: ['findings', 'metrics', 'nativeScore', 'notes', 'score', 'status'],
};
/** Report-level composites that average A5's score in. */
const A5_COMPOSITES: readonly string[] = ['codeTrustScore', 'overallScore', 'categoryScores'];

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

function reportLevel(report: WitanReport): string {
  const {
    rubricVersion: _rubricVersion,
    rubricBehaviourFingerprint: _fingerprint,
    criteria: _criteria,
    ...rest
  } = report as WitanReport & { rubricBehaviourFingerprint?: string };
  const level = rest as Record<string, unknown>;
  for (const composite of A5_COMPOSITES) delete level[composite];
  // An ingested signal on A5 records A5's score before and after its adjustment.
  if (Array.isArray(level.consumedSignals)) {
    level.consumedSignals = (level.consumedSignals as Record<string, unknown>[]).map((signal) =>
      signal.dimension === 'A5' ? { ...signal, nativeScore: undefined, adjustedScore: undefined } : signal,
    );
  }
  return JSON.stringify(level, null, 2);
}

function composites(report: WitanReport): string {
  const level = report as unknown as Record<string, unknown>;
  const a5Signals = Array.isArray(level.consumedSignals)
    ? (level.consumedSignals as Record<string, unknown>[])
        .filter((signal) => signal.dimension === 'A5')
        .map((signal) => [signal.nativeScore, signal.adjustedScore])
    : [];
  return JSON.stringify([...A5_COMPOSITES.map((composite) => level[composite] ?? null), a5Signals]);
}

const withoutWeightShares = (metrics: readonly WitanCriterionMetric[]) =>
  metrics.map(({ appliedWeightShare: _share, ...rest }) => rest);

function criterionById(report: WitanReport, id: string): WitanCriterionScore | undefined {
  return (report.criteria as readonly WitanCriterionScore[]).find((criterion) => criterion.id === id);
}

function divergentFields(scored: Scored, id: string): string[] {
  const v25 = (criterionById(scored.v25, id) ?? {}) as Record<string, unknown>;
  const v26 = (criterionById(scored.v26, id) ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(v25), ...Object.keys(v26)])]
    .filter((key) => JSON.stringify(v25[key]) !== JSON.stringify(v26[key]))
    .sort();
}

const hasV25NoReconciliationFinding = (report: WitanReport): boolean =>
  (criterionById(report, 'A5')?.findings ?? []).some((finding) =>
    /no dedicated claim-reality report artifact/.test(finding.summary),
  );

describe('v26 scores identically to v25 on every behaviour-corpus specimen, except item 6', () => {
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
        const outsideItem6 = WITAN_RUBRIC.map(({ id }) => id).filter(
          (id) => !ITEM_6_CRITERIA.includes(id) && divergentFields(scored, id).length > 0,
        );
        expect(
          outsideItem6,
          `${fixture.name}: v26 diverges from v25 outside A2 and A5. v26 is declared as v25's ` +
            'complete closure plus item 6 alone, so every rubric-version allowlist that names ' +
            'WITAN_RUBRIC_VERSION_V25 must also name WITAN_RUBRIC_VERSION_V26 (scoring.ts and ' +
            'repo-signals.ts), unless the v26 declaration in rubric-version.ts is rewritten in ' +
            'the same change.',
        ).toEqual([]);
        for (const id of ITEM_6_CRITERIA) {
          expect(
            divergentFields(scored, id).filter((field) => !(ITEM_6_FIELDS[id] ?? []).includes(field)),
            `${fixture.name}: item 6 changed ${id} outside ${(ITEM_6_FIELDS[id] ?? []).join(', ')}. ` +
              'The ruling and its amendment leave every other metric and all positive evidence unchanged.',
          ).toEqual([]);
        }
        // Amendment 1: A5's metrics are v25's, less reconciliation_artifact_depth where it moved.
        const a5v25 = criterionById(scored.v25, 'A5')?.metrics ?? [];
        const a5v26 = criterionById(scored.v26, 'A5')?.metrics ?? [];
        const omitted = divergentFields(scored, 'A5').includes('metrics');
        expect(withoutWeightShares(a5v26)).toEqual(
          withoutWeightShares(a5v25).filter(
            (metric) => !omitted || metric.name !== 'reconciliation_artifact_depth',
          ),
        );
        expect(reportLevel(scored.v26)).toBe(reportLevel(scored.v25));
        if (composites(scored.v26) !== composites(scored.v25)) {
          expect(divergentFields(scored, 'A5')).toContain('score');
        }
      });
    }
  }

  for (const fixture of BEHAVIOUR_CORPUS) {
    const scored = () => publicScan.get(fixture.name) as Scored;
    it(`${fixture.name}: A5 moves exactly where v25 carries its no-reconciliation finding`, () => {
      const expectMoved = hasV25NoReconciliationFinding(scored().v25);
      expect(divergentFields(scored(), 'A5').length > 0).toBe(expectMoved);
      expect(hasV25NoReconciliationFinding(scored().v26)).toBe(false);
    });
    // Measured on this corpus with amendment 1 (goal_cejel_v26_item6_revision_2026-10-14): A5's
    // status matches v25's on every specimen. Without the amendment, 11 specimens went from
    // warning to critical. A status rule is not changed here; this pins what the corpus shows.
    it(`${fixture.name}: A5 status under v26 is v25's`, () => {
      expect(criterionById(scored().v26, 'A5')?.status).toBe(criterionById(scored().v25, 'A5')?.status);
    });
    it(`${fixture.name}: A2 moves at most in its notes`, () => {
      expect(divergentFields(scored(), 'A2').filter((field) => field !== 'notes')).toEqual([]);
    });
  }
});

describe("v26's behaviour fingerprint separates from v25's on A5 and the composites it feeds", () => {
  it('the component pins equal v25 except the A5 criterion digest and the reports whose composites A5 moved', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<
      string,
      WitanRubricBehaviourComponents
    >;
    const v25 = pins[WITAN_RUBRIC_VERSION_V25] as WitanRubricBehaviourComponents;
    const v26 = pins[WITAN_RUBRIC_VERSION_V26] as WitanRubricBehaviourComponents;
    const movedReports = Object.keys(v25.reports).filter((name) => v25.reports[name] !== v26.reports[name]);
    const compositesMoved = BEHAVIOUR_CORPUS.map(({ name }) => name).filter((name) => {
      const scored = publicScan.get(name) as Scored;
      return composites(scored.v26) !== composites(scored.v25);
    });
    expect(movedReports).toEqual(compositesMoved);
    const moved = Object.keys(v25.criteria).filter((id) => v25.criteria[id] !== v26.criteria[id]);
    expect(moved).toEqual(['A5']);
    expect(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[WITAN_RUBRIC_VERSION_V26]).not.toBe(
      WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[WITAN_RUBRIC_VERSION_V25],
    );
  });
});
