import { describe, expect, it } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import {
  DIMENSION_VALUES,
  type NoRiseShape,
  buildNoRiseShape,
  coreKey,
  coreKeys,
  generateNoRiseShapes,
  noRiseShard,
  pairsOf,
  productRows,
  shapeName,
  validPairs,
} from './fixtures/v27-norise-shapes.js';
import { type IntroducedAbstention, checkNoRise, lostCriticalFindings, lostFindings } from './v27-no-rise.js';

// #531: v27's no-rise property over generated repository shapes, not only the curated fixtures.
// fixtures/v27-norise-shapes.ts says what is generated and how; v27-no-rise.ts says what is
// checked. Each shape is scored under v17 and v27 at the same commit, and the pair must show no
// composite, criterion score or status rising, nothing scored under v27 that v17 left unscored,
// no scored composite becoming null, every abstention v27 introduces a read failure kept in the
// denominator at 0, and no finding lost or made less severe. A shape's test name is its full
// coordinates, so a failure reproduces from it.
//
// The shapes are split into NO_RISE_SHARDS test files (false-assurance-v27-generated-<n>.test.ts)
// so vitest runs them in parallel. A shard holds whole test-directory x conftest x hook
// combinations, so the per-combination liveness checks below are local to it.

export const NO_RISE_SHARDS = 6;

const ALL_SHAPES = generateNoRiseShapes();

function score(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'v27-norise-shape',
    productDisplayName: 'v27 no-rise shape',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function describeGenerator(): void {
  describe('generated shapes: the generator', () => {
    it('covers the full test-directory x conftest x hook x LFS product that takes effect, and every pair that takes effect', () => {
      const present = new Set(ALL_SHAPES.map((shape) => [shape.testDirectory, shape.conftest, shape.hook, shape.lfs].join('|')));
      expect(productRows().map((row) => [row.testDirectory, row.conftest, row.hook, row.lfs].join('|')).filter((key) => !present.has(key))).toEqual([]);
      const covered = new Set(ALL_SHAPES.flatMap(pairsOf));
      expect([...validPairs()].filter((pair) => !covered.has(pair))).toEqual([]);
      expect([...covered].filter((pair) => !validPairs().has(pair))).toEqual([]);
      for (const [dimension, values] of Object.entries(DIMENSION_VALUES)) {
        for (const value of values) {
          expect(ALL_SHAPES.some((shape) => (shape as unknown as Record<string, string>)[dimension] === value), `${dimension}=${value}`).toBe(true);
        }
      }
      expect(new Set(ALL_SHAPES.map(shapeName)).size).toBe(ALL_SHAPES.length);
    });

    it('gives every test-directory x conftest x hook combination a full and a depth-1 shape with no LFS pointer', () => {
      for (const key of coreKeys()) {
        for (const history of ['full', 'shallow']) {
          expect(ALL_SHAPES.some((shape) => coreKey(shape) === key && shape.lfs === 'none' && shape.history === history), `${key} ${history}`).toBe(true);
        }
      }
    });

    it('is deterministic, and the shards partition it', () => {
      expect(generateNoRiseShapes().map(shapeName)).toEqual(ALL_SHAPES.map(shapeName));
      const sharded = Array.from({ length: NO_RISE_SHARDS }, (_, index) => noRiseShard(ALL_SHAPES, index, NO_RISE_SHARDS)).flat();
      expect(sharded.map(shapeName).sort()).toEqual(ALL_SHAPES.map(shapeName).sort());
    });
  });
}

/** Registers shard `index` (0-based) of the generated no-rise shapes. */
export function describeGeneratedNoRiseShard(index: number): void {
  if (index === 0) describeGenerator();
  const shapes: NoRiseShape[] = noRiseShard(ALL_SHAPES, index, NO_RISE_SHARDS);

  // What the shapes made v27 do, gathered as they run, so the last test can show the property was
  // exercised rather than vacuously true.
  const seen = {
    fallen: new Map<string, number>(),
    abstentions: [] as (IntroducedAbstention & { shape: string })[],
    a1ScoredUnderV27: new Set<string>(),
    shallowShapes: 0,
    compositesFallen: 0,
  };

  describe(`generated shapes, shard ${index + 1} of ${NO_RISE_SHARDS}: no score, status, composite or finding rises or is lost from v17 to v27`, () => {
    for (const shape of shapes) {
      const name = shapeName(shape);
      it(name, () => {
        const { repoPath, cleanup } = buildNoRiseShape(shape);
        try {
          const before = score(repoPath, WITAN_RUBRIC_VERSION_V17);
          const after = score(repoPath, WITAN_RUBRIC_VERSION_V27);
          const result = checkNoRise(before, after);
          expect(result.problems, name).toEqual([]);
          expect(lostFindings(before, after), name).toEqual([]);
          expect(lostCriticalFindings(before, after), name).toEqual([]);
          if (shape.history === 'shallow') {
            seen.shallowShapes += 1;
            // The shape is live: v27 abstains on B2 wherever v17 scored it, and on A2 wherever v17
            // scored it below critical (a confirmed critical finding keeps A2 scored).
            for (const id of ['A2', 'B2']) {
              const v17 = before.criteria.find((criterion) => criterion.id === id)!;
              const v27 = after.criteria.find((criterion) => criterion.id === id)!;
              if (v17.status === 'not_applicable' || v17.status === 'insufficient_data') continue;
              if (id === 'A2' && v17.status === 'critical') continue;
              expect(v27.status, `${id} ${name}`).toBe('insufficient_data');
            }
          }
          const a1 = after.criteria.find((criterion) => criterion.id === 'A1')!;
          if (a1.status !== 'insufficient_data' && a1.status !== 'not_applicable') seen.a1ScoredUnderV27.add(coreKey(shape));
          for (const id of result.fallenCriteria) seen.fallen.set(id, (seen.fallen.get(id) ?? 0) + 1);
          seen.compositesFallen += result.fallenComposites.length;
          seen.abstentions.push(...result.introducedAbstentions.map((abstention) => ({ ...abstention, shape: name })));
        } finally {
          cleanup();
        }
      });
    }

    it('the shapes exercised the moves v27 makes, so the property was not vacuous', () => {
      // A1 is scored under v27 for every test-directory x conftest x hook combination in the shard:
      // coverage measured on what the scorer read, not on the shapes' labels.
      const keys = [...new Set(shapes.map(coreKey))];
      expect(keys.filter((key) => !seen.a1ScoredUnderV27.has(key))).toEqual([]);
      // Every kind of abstention seen on every criterion is, somewhere, one the composite arithmetic
      // shows held in the denominator.
      const pairs = [...new Set(seen.abstentions.map((a) => `${a.kind} ${a.id}`))];
      expect(pairs.filter((pair) => !seen.abstentions.some((a) => `${a.kind} ${a.id}` === pair && a.denominator === 'kept'))).toEqual([]);
      for (const pair of ['shallow-history A2', 'shallow-history B2', 'content-read A1', 'content-read B2', 'content-read B3']) {
        expect(pairs, pair).toContain(pair);
      }
      expect(seen.shallowShapes).toBeGreaterThan(0);
      // A hollow suite (A1) and a publish-only workflow (B3) lose credit somewhere.
      expect(seen.fallen.get('A1') ?? 0).toBeGreaterThan(0);
      expect(seen.fallen.get('B3') ?? 0).toBeGreaterThan(0);
      expect(seen.compositesFallen).toBeGreaterThan(0);
      expect(seen.abstentions.filter((a) => a.denominator === 'not-kept' || a.denominator === 'unchecked')).toEqual([]);
    });
  });
}
