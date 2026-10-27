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

/**
 * The exact text of shard file n (1-based), false-assurance-v27-generated-<n>.test.ts. The shard
 * guard (false-assurance-v27-shards.test.ts) requires each file to equal it byte for byte, so a
 * comment, an expression, a skip or a condition in a shard file fails instead of dropping shapes.
 */
export function noRiseShardFileText(n: number): string {
  return [
    "import { describeGeneratedNoRiseShard } from './v27-no-rise-generated-suite.js';",
    '',
    `// #531: shard ${n} of the generated v27 no-rise shapes; see v27-no-rise-generated-suite.ts.`,
    `describeGeneratedNoRiseShard(${n - 1});`,
    '',
  ].join('\n');
}

const ALL_SHAPES = generateNoRiseShapes();

/** A failure message: the shape, then the first five problems in full, one per line. */
function record(name: string, problems: readonly string[]): string {
  return [name, ...problems.slice(0, 5), ...(problems.length > 5 ? [`… and ${problems.length - 5} more`] : [])].join('\n');
}

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

    it('holds every workflow shape and line ending readable on full history (each shard checks B2 and B3 were scored there)', () => {
      for (const workflow of DIMENSION_VALUES.workflow.filter((value) => value !== 'none')) {
        for (const lineEndings of DIMENSION_VALUES.lineEndings) {
          expect(
            ALL_SHAPES.some((shape) => shape.workflow === workflow && shape.lineEndings === lineEndings && shape.history === 'full' && shape.lfs !== 'workflow'),
            `${workflow} ${lineEndings}`,
          ).toBe(true);
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
    // Workflow x line-ending combinations held by a full-history shape whose workflows are read
    // (not LFS pointers), and those among them where v27 scored both B2 and B3.
    readableWorkflows: new Set<string>(),
    workflowsScored: new Set<string>(),
    shallowShapes: 0,
    // Depth-1 shapes where v17's B2 carries #442's shallow-clone abstention (B2 had evidence).
    shallowB2BothRubrics: 0,
    compositesFallen: 0,
    // The names of the shape tests whose bodies ran, checked after the describe against an
    // independent recomputation of the shard, so a filter or skip cannot drop shapes silently.
    ran: [] as string[],
  };

  describe(`generated shapes, shard ${index + 1} of ${NO_RISE_SHARDS}: no score, status, composite or finding rises or is lost from v17 to v27`, () => {
    for (const shape of shapes) {
      const name = shapeName(shape);
      it(name, () => {
        seen.ran.push(name);
        const { repoPath, cleanup } = buildNoRiseShape(shape);
        try {
          const before = score(repoPath, WITAN_RUBRIC_VERSION_V17);
          const after = score(repoPath, WITAN_RUBRIC_VERSION_V27);
          const result = checkNoRise(before, after);
          // Each failure message carries the first findings in full (criterion, summary, both
          // pointers), so a failure that does not reproduce still leaves a record (#574).
          expect(result.problems, record(name, result.problems)).toEqual([]);
          const lost = lostFindings(before, after);
          expect(lost, record(name, lost)).toEqual([]);
          const lostCritical = lostCriticalFindings(before, after);
          expect(lostCritical, record(name, lostCritical)).toEqual([]);
          if (shape.history === 'shallow') {
            seen.shallowShapes += 1;
            // #442 (operator decision 2026-10-26): B2 abstains on a depth-1 clone under v17 too, out
            // of the composite there and at 0 under v27, so it is not an abstention v27 introduces.
            const b2 = (report: WitanReport) => report.criteria.find((criterion) => criterion.id === 'B2')!;
            expect(b2(before).status, `B2 ${name}`).toBe('insufficient_data');
            expect(b2(after).status, `B2 ${name}`).toBe('insufficient_data');
            if ((b2(before).notes ?? '').startsWith('B2 abstained: this repository is a shallow clone')) {
              seen.shallowB2BothRubrics += 1;
            }
            // The shape is live: v27 abstains on A2 wherever v17 scored it below critical (a
            // confirmed critical finding keeps A2 scored).
            for (const id of ['A2']) {
              const v17 = before.criteria.find((criterion) => criterion.id === id)!;
              const v27 = after.criteria.find((criterion) => criterion.id === id)!;
              if (v17.status === 'not_applicable' || v17.status === 'insufficient_data') continue;
              if (id === 'A2' && v17.status === 'critical') continue;
              expect(v27.status, `${id} ${name}`).toBe('insufficient_data');
            }
          }
          if (shape.history === 'full' && shape.workflow !== 'none' && shape.lfs !== 'workflow') {
            const key = `${shape.workflow}|${shape.lineEndings}`;
            seen.readableWorkflows.add(key);
            const scored = (id: string): boolean => {
              const status = after.criteria.find((criterion) => criterion.id === id)!.status;
              return status !== 'insufficient_data' && status !== 'not_applicable';
            };
            if (scored('B2') && scored('B3')) seen.workflowsScored.add(key);
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
      // Every workflow shape and line ending held readable on full history had B2 and B3 scored at
      // least once, so a CRLF or other workflow shape v27 cannot parse does not pass vacuously.
      expect([...seen.readableWorkflows].filter((key) => !seen.workflowsScored.has(key))).toEqual([]);
      // Every kind of abstention seen on every criterion is, somewhere, one the composite arithmetic
      // shows held in the denominator.
      const pairs = [...new Set(seen.abstentions.map((a) => `${a.kind} ${a.id}`))];
      expect(pairs.filter((pair) => !seen.abstentions.some((a) => `${a.kind} ${a.id}` === pair && a.denominator === 'kept'))).toEqual([]);
      for (const pair of ['shallow-history A2', 'content-read A1', 'content-read B2', 'content-read B3']) {
        expect(pairs, pair).toContain(pair);
      }
      expect(seen.shallowShapes).toBeGreaterThan(0);
      expect(seen.shallowB2BothRubrics).toBeGreaterThan(0);
      // A hollow suite (A1) and a publish-only workflow (B3) lose credit somewhere.
      expect(seen.fallen.get('A1') ?? 0).toBeGreaterThan(0);
      expect(seen.fallen.get('B3') ?? 0).toBeGreaterThan(0);
      expect(seen.compositesFallen).toBeGreaterThan(0);
      expect(seen.abstentions.filter((a) => a.denominator === 'not-kept' || a.denominator === 'unchecked')).toEqual([]);
    });
  });

  // Outside the describe, so skipping or filtering it, or any shape in it, leaves this to fail: the
  // shapes that ran must be exactly the shard, recomputed here from the generator.
  it(`shard ${index + 1} of ${NO_RISE_SHARDS}: every shape the shard holds ran, and nothing else`, () => {
    const expected = noRiseShard(generateNoRiseShapes(), index, NO_RISE_SHARDS).map(shapeName);
    expect(expected.length).toBeGreaterThan(0);
    expect([...seen.ran].sort()).toEqual([...expected].sort());
  });
}
