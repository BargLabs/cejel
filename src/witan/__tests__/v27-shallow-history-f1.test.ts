import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import {
  DEPTHS,
  EVIDENCE,
  type Evidence,
  HISTORIES,
  type History,
  WINDOW,
  buildMatrixOrigin,
  cloneRepository,
  compositeWithoutUnscored,
  criterionOf,
  git,
  normalizedMetric,
  scanRepository,
} from './fixtures/shallow-history-matrix.js';

// v27 freeze change F1 (operator decision 2026-10-28): on a shallow clone v27 follows the rule the
// operator set on 26 Oct and revised on 27 Oct for every other rubric — a shallow clone must not
// lower the history score. #604 applied it to v17-v26 and left v27 abstaining on A2 and B2 as read
// failures held at 0 in the composite.
//
//   A. B2 under v27 behaves exactly as #604 made it behave under v17: it keeps its file evidence
//      (pr_trace_primitives), withholds only pr_merge_ratio with #604's note, and abstains out of
//      the composite (reason shallow_history) only when no PR-trace file evidence remains.
//
// Every shallow row is compared with the same repository's full clone under v27, never only with
// main or with v17 on the truncated input (fixtures/shallow-history-matrix.ts).

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

interface Row {
  readonly history: History;
  readonly evidence: Evidence;
  readonly depth: number;
  readonly rubric: string;
  readonly full: WitanReport;
  readonly shallow: WitanReport;
}

let rows: Row[];

beforeAll(() => {
  rows = [];
  for (const history of HISTORIES) {
    for (const evidence of EVIDENCE) {
      const origin = buildMatrixOrigin(history, evidence);
      const fullPath = cloneRepository(origin);
      expect(git(fullPath, ['rev-parse', '--is-shallow-repository'])).toBe('false');
      const full = new Map([V17, V27].map((rubric) => [rubric, scanRepository(fullPath, rubric)]));
      for (const depth of DEPTHS) {
        const shallowPath = cloneRepository(origin, depth);
        expect(git(shallowPath, ['rev-parse', '--is-shallow-repository'])).toBe('true');
        expect(Number(git(shallowPath, ['rev-list', '--count', 'HEAD']))).toBe(depth);
        for (const rubric of [V17, V27]) {
          rows.push({ history, evidence, depth, rubric, full: full.get(rubric)!, shallow: scanRepository(shallowPath, rubric) });
        }
      }
    }
  }
}, 600_000);

const label = (row: Row) => `${row.history} ${row.evidence} depth ${row.depth}`;
const underWindow = (row: Row) => row.depth < WINDOW;
// Evidence v27 credits: a CI workflow that runs a check, with or without a pull-request template.
const creditedUnderV27 = (row: Row) => row.evidence === 'ci-and-template' || row.evidence === 'ci-only';
const compare = (shallow: number, full: number) => (shallow < full ? 'below' : shallow > full ? 'above' : 'equal');

describe('F1 A: on a shallow clone v27\'s B2 keeps its file evidence and withholds only the ratio', () => {
  it('v27, under the window, with credited PR-trace files: B2 is scored on pr_trace_primitives alone, with the full clone\'s file evidence', () => {
    const subject = rows.filter((row) => row.rubric === V27 && underWindow(row) && creditedUnderV27(row));
    expect(subject.length).toBe(HISTORIES.length * 2 * 3);
    for (const row of subject) {
      const full = criterionOf(row.full, 'B2');
      const shallow = criterionOf(row.shallow, 'B2');
      expect(shallow.status, label(row)).not.toBe('insufficient_data');
      expect(shallow.metrics.map(({ name }) => name), label(row)).toEqual(['pr_trace_primitives']);
      expect(full.metrics.map(({ name }) => name), label(row)).toEqual(['pr_trace_primitives', 'pr_merge_ratio']);
      const { appliedWeightShare: _shallowShare, ...shallowPrimitives } = shallow.metrics[0]!;
      const { appliedWeightShare: _fullShare, ...fullPrimitives } = full.metrics[0]!;
      expect(shallowPrimitives, label(row)).toEqual(fullPrimitives);
      expect(shallow.evidence, label(row)).toEqual(full.evidence);
      expect(shallow.notes ?? '', label(row)).toMatch(
        /^B2 abstained from the pull-request merge ratio only: this repository is a shallow clone with fewer than 12 commits visible, so the pull-request merge ratio cannot be read over its window\./,
      );
    }
  });

  it('v27 reuses #604\'s path: where v27 credits every workflow, its B2 on a shallow clone is v17\'s, byte for byte', () => {
    for (const row of rows.filter((entry) => entry.rubric === V27 && creditedUnderV27(entry))) {
      const v17 = rows.find(
        (entry) => entry.rubric === V17 && entry.history === row.history && entry.evidence === row.evidence && entry.depth === row.depth,
      )!;
      expect(criterionOf(row.shallow, 'B2'), label(row)).toEqual(criterionOf(v17.shallow, 'B2'));
    }
  });

  it('v27, under the window, where no workflow is credited and no other PR-trace file exists: B2 abstains out of the composite and keeps the uncredited-workflow disclosure', () => {
    const subject = rows.filter((row) => row.rubric === V27 && underWindow(row) && row.evidence === 'print-only-ci');
    expect(subject.length).toBe(HISTORIES.length * 3);
    for (const row of subject) {
      const full = criterionOf(row.full, 'B2');
      const shallow = criterionOf(row.shallow, 'B2');
      // The full clone scores B2 on its ratio alone: v27 credits the print-only workflow nothing.
      expect(full.metrics.find(({ name }) => name === 'pr_trace_primitives')?.value, label(row)).toBe(0);
      expect(full.disclosures ?? [], label(row)).toHaveLength(1);
      expect(shallow.status, label(row)).toBe('insufficient_data');
      expect(shallow.notes ?? '', label(row)).toMatch(
        /^B2 abstained: this repository is a shallow clone with fewer than 12 commits visible, so the pull-request merge ratio cannot be read over its window\. B2 is left out of the composite rather than scored on the commits present\./,
      );
      expect(shallow.disclosures, label(row)).toEqual(full.disclosures);
      expect(row.shallow.processTrustScore, label(row)).toBe(compositeWithoutUnscored(row.shallow, 'process_trust'));
    }
  });

  it('v27, under the window: B2 is below the full clone only where the full clone\'s ratio is better than its file evidence, above only where it is worse', () => {
    for (const row of rows.filter((entry) => entry.rubric === V27 && underWindow(entry) && entry.evidence !== 'none')) {
      const full = criterionOf(row.full, 'B2');
      const shallow = criterionOf(row.shallow, 'B2');
      const ratio = normalizedMetric(full, 'pr_merge_ratio')!;
      const primitives = normalizedMetric(full, 'pr_trace_primitives')!;
      if (shallow.status === 'insufficient_data') {
        // Left out of the composite: the full clone's B2 rested on the withheld ratio alone.
        expect(primitives, label(row)).toBe(0);
        continue;
      }
      const direction = compare(shallow.score, full.score);
      if (direction === 'below') expect(ratio, label(row)).toBeGreaterThan(primitives);
      if (direction === 'above') expect(ratio, label(row)).toBeLessThan(primitives);
      if (ratio === primitives) expect(direction, label(row)).toBe('equal');
    }
  });

  it('v27, at the window and without PR-trace files: B2 matches the full clone', () => {
    for (const row of rows.filter((entry) => entry.rubric === V27 && (!underWindow(entry) || entry.evidence === 'none'))) {
      expect(criterionOf(row.shallow, 'B2'), label(row)).toEqual(criterionOf(row.full, 'B2'));
    }
  });
});
