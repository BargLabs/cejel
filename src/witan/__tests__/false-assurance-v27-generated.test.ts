import { describe, expect, it } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import {
  DIMENSION_VALUES,
  buildNoRiseShape,
  generateNoRiseShapes,
  pairsOf,
  shapeName,
  validPairs,
} from './fixtures/v27-norise-shapes.js';
import { type IntroducedAbstention, checkNoRise, lostCriticalFindings } from './v27-no-rise.js';

// #531: v27's no-rise property over generated repository shapes, not only the curated fixtures.
// fixtures/v27-norise-shapes.ts says what is generated and how; v27-no-rise.ts says what is
// checked. Each shape is scored under v17 and v27 at the same commit, and the pair must show no
// composite, criterion score or status rising, nothing scored under v27 that v17 left unscored,
// no scored composite becoming null, and every abstention v27 introduces a read failure kept in the
// denominator at 0. A shape's test name is its full coordinates, so a failure reproduces from it.

const SHAPES = generateNoRiseShapes();

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

// What the shapes made v27 do, gathered as they run, so the last test can show the property was
// exercised rather than vacuously true.
const seen = {
  fallen: new Map<string, number>(),
  abstentions: [] as (IntroducedAbstention & { shape: string })[],
  shallowShapes: 0,
  compositesFallen: 0,
};

describe('generated shapes: the generator', () => {
  it('generates every core combination and covers every valid pair of values', () => {
    const covered = new Set(SHAPES.flatMap(pairsOf));
    expect([...validPairs()].filter((pair) => !covered.has(pair))).toEqual([]);
    for (const [dimension, values] of Object.entries(DIMENSION_VALUES)) {
      for (const value of values) {
        expect(SHAPES.some((shape) => (shape as unknown as Record<string, string>)[dimension] === value), `${dimension}=${value}`).toBe(true);
      }
    }
    expect(new Set(SHAPES.map(shapeName)).size).toBe(SHAPES.length);
  });

  it('is deterministic', () => {
    expect(generateNoRiseShapes().map(shapeName)).toEqual(SHAPES.map(shapeName));
  });
});

describe('generated shapes: no score, status or composite rises from v17 to v27', () => {
  for (const shape of SHAPES) {
    const name = shapeName(shape);
    it(name, () => {
      const { repoPath, cleanup } = buildNoRiseShape(shape);
      try {
        const before = score(repoPath, WITAN_RUBRIC_VERSION_V17);
        const after = score(repoPath, WITAN_RUBRIC_VERSION_V27);
        const result = checkNoRise(before, after);
        expect(result.problems, name).toEqual([]);
        expect(lostCriticalFindings(before, after), name).toEqual([]);
        if (shape.history === 'shallow') {
          seen.shallowShapes += 1;
          // The shape is live: v27 abstains on B2 wherever v17 scored it, and on A2 unless a
          // confirmed critical finding stands or A2 is not applicable.
          for (const id of ['A2', 'B2']) {
            const v17 = before.criteria.find((criterion) => criterion.id === id)!;
            const v27 = after.criteria.find((criterion) => criterion.id === id)!;
            if (v17.status === 'not_applicable' || v17.status === 'insufficient_data' || v17.status === 'critical') continue;
            expect(v27.status, `${id} ${name}`).toBe('insufficient_data');
          }
        }
        for (const id of result.fallenCriteria) seen.fallen.set(id, (seen.fallen.get(id) ?? 0) + 1);
        seen.compositesFallen += result.fallenComposites.length;
        seen.abstentions.push(...result.introducedAbstentions.map((abstention) => ({ ...abstention, shape: name })));
      } finally {
        cleanup();
      }
    });
  }

  it('the shapes exercised the moves v27 makes, so the property was not vacuous', () => {
    const kept = (kind: IntroducedAbstention['kind'], id: string): number =>
      seen.abstentions.filter((a) => a.kind === kind && a.id === id && a.denominator === 'kept').length;
    expect(seen.shallowShapes).toBeGreaterThan(0);
    // Shallow-clone abstentions whose denominator the composite arithmetic actually discriminates.
    expect(kept('shallow-history', 'A2')).toBeGreaterThan(0);
    expect(kept('shallow-history', 'B2')).toBeGreaterThan(0);
    // Git LFS pointer abstentions, likewise.
    expect(seen.abstentions.filter((a) => a.kind === 'content-read' && a.denominator === 'kept').length).toBeGreaterThan(0);
    // A hollow suite (A1) and a publish-only workflow (B3) lose credit somewhere.
    expect(seen.fallen.get('A1') ?? 0).toBeGreaterThan(0);
    expect(seen.fallen.get('B3') ?? 0).toBeGreaterThan(0);
    expect(seen.compositesFallen).toBeGreaterThan(0);
    expect(seen.abstentions.filter((a) => a.denominator === 'not-kept' || a.denominator === 'unchecked')).toEqual([]);
  });
});
