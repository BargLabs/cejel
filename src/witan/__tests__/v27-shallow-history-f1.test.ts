import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import {
  DEPTHS,
  EVIDENCE,
  type Evidence,
  HISTORIES,
  type History,
  WINDOW,
  buildCacheLibraryOrigin,
  buildMatrixOrigin,
  cloneRepository,
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
//   B. A2 under v27 keeps its abstention and its note on a shallow clone, but the abstention
//      carries reason shallow_history and leaves the composite instead of counting as 0. A2 is
//      unchanged on full clones, where a history read failed, and under every other rubric.
//
// The matrix exercises A2's scoring path (a .env template makes it applicable); the shape of the
// #114 regression run's depth-1 pair (a cachetools-like library with no .env surface) exercises
// the path where A2 would otherwise have been marked not applicable.
//
// Every shallow row is compared with the same repository's full clone under v27, never only with
// main or with v17 on the truncated input (fixtures/shallow-history-matrix.ts).
//
// Operator ruling of 1 Nov: under v27 a shallow clone gets no composite and no verdict
// (v27-shallow-verdict-cap.test.ts). F1's per-criterion readings below stand and are still shown;
// where this file checked that an abstention left the composite, it now checks that there is no
// composite, and A2's shallow-only abstention no longer carries the 'shallow_history' reason.

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
// The #114 depth-1 pair's shape: its full clone and its depth-1 clone.
let cacheLibrary: { full: string; shallow: string };

beforeAll(() => {
  const cacheOrigin = buildCacheLibraryOrigin();
  cacheLibrary = { full: cloneRepository(cacheOrigin), shallow: cloneRepository(cacheOrigin, 1) };
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

  it('v27, under the window, where no workflow is credited and no other PR-trace file exists: B2 abstains and keeps the uncredited-workflow disclosure, and the report has no composite', () => {
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
      expect(row.shallow.processTrustScore, label(row)).toBeNull();
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

// v27's A2 notes on a shallow clone, unchanged by F1 (repo-signals.ts V27_A2_SHALLOW_HISTORY_NOTE and
// V27_A2_SHALLOW_APPLICABILITY_NOTE).
const A2_SHALLOW_NOTE =
  'A2 abstained: this repository is a shallow clone, so the scan for credentials and .env files in ' +
  'earlier commits read only the commits present, and no confirmed critical finding stands on what ' +
  'was read. Re-scan a full clone (for actions/checkout, set fetch-depth: 0).';
const A2_SHALLOW_APPLICABILITY_NOTE =
  'A2 abstained: this repository is a shallow clone, and A2 would otherwise have been marked not ' +
  'applicable on a decision that rests in part on its scans of earlier commits for .env files and ' +
  'credential-shaped values, which read only the commits present. Re-scan a full clone (for ' +
  'actions/checkout, set fetch-depth: 0).';

function a2Signal(repoPath: string, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'shallow-history-f1',
    productDisplayName: 'Shallow history F1',
    repoPath,
    generatedAt: '2026-10-28T00:00:00.000Z',
    rubricVersion,
  });
  return (input.signals ?? []).find((signal) => signal.criterionId === 'A2');
}

describe('F1 B: on a shallow clone v27\'s A2 abstention keeps its note; the report has no composite', () => {
  it('v27, every shallow depth: A2 abstains with its note, and the report has no composite', () => {
    const subject = rows.filter((row) => row.rubric === V27);
    expect(subject.length).toBe(HISTORIES.length * EVIDENCE.length * DEPTHS.length);
    for (const row of subject) {
      const a2 = criterionOf(row.shallow, 'A2');
      expect(criterionOf(row.full, 'A2').status, label(row)).toBe('verified');
      expect(a2.status, label(row)).toBe('insufficient_data');
      expect(a2.score, label(row)).toBe(0);
      expect(a2.notes, label(row)).toBe(A2_SHALLOW_NOTE);
      expect(row.shallow.codeTrustScore, label(row)).toBeNull();
      expect(row.shallow.overallScore, label(row)).toBeNull();
    }
  });

  it('v27, the scoring path: the A2 signal abstains with its note and no longer carries reason shallow_history (ruling of 1 Nov)', () => {
    const shallow = cloneRepository(buildMatrixOrigin('mixed', 'ci-only'), 1);
    const signal = a2Signal(shallow, V27);
    expect(signal?.insufficientData).toBe(true);
    expect(signal?.insufficientDataReason).toBeUndefined();
    expect(signal?.notes).toBe(A2_SHALLOW_NOTE);
  });

  it('v27, the not-applicable path (#114 depth-1 pair shape): A2 abstains with its note, and the report has no composite', () => {
    expect(criterionOf(scanRepository(cacheLibrary.full, V27), 'A2').status).toBe('not_applicable');
    const report = scanRepository(cacheLibrary.shallow, V27);
    const a2 = criterionOf(report, 'A2');
    expect(a2.status).toBe('insufficient_data');
    expect(a2.notes).toBe(A2_SHALLOW_APPLICABILITY_NOTE);
    expect(report.codeTrustScore).toBeNull();
    expect(a2Signal(cacheLibrary.shallow, V27)?.insufficientDataReason).toBeUndefined();
  });

  it('v17 and full clones are untouched: v17 scores A2 on a shallow clone as on its full clone, and no full-clone A2 signal carries a reason', () => {
    for (const row of rows.filter((entry) => entry.rubric === V17)) {
      expect(criterionOf(row.shallow, 'A2'), label(row)).toEqual(criterionOf(row.full, 'A2'));
    }
    const full = cloneRepository(buildMatrixOrigin('mixed', 'ci-only'));
    for (const rubric of [V17, V27]) {
      expect(a2Signal(full, rubric)?.insufficientData, rubric).not.toBe(true);
      expect(a2Signal(full, rubric)?.insufficientDataReason, rubric).toBeUndefined();
      expect(a2Signal(cacheLibrary.full, rubric)?.insufficientDataReason, rubric).toBeUndefined();
    }
    expect(a2Signal(cacheLibrary.shallow, V17)?.insufficientDataReason).toBeUndefined();
  });
});

// D. Every shallow row against the same repository's full clone, under v17 and v27: B2, A2 and the
// overall, each labelled below, equal or above, with the reason. Below is allowed only where the
// full clone's score rests on history the shallow clone withholds; above only where the full
// clone's merge ratio is worse than its file evidence (#604's case).
const BAND = ['unverified', 'at_risk', 'conditional', 'verified'];

function reasons(row: Row): string[] {
  const out: string[] = [];
  const fullA2 = criterionOf(row.full, 'A2');
  const shallowA2 = criterionOf(row.shallow, 'A2');
  if (shallowA2.status === 'insufficient_data' && fullA2.status !== 'insufficient_data' && fullA2.status !== 'not_applicable') {
    out.push(`A2 left out (full ${fullA2.score} rests on its history scans)`);
  }
  const fullB2 = criterionOf(row.full, 'B2');
  const shallowB2 = criterionOf(row.shallow, 'B2');
  const ratio = normalizedMetric(fullB2, 'pr_merge_ratio');
  const primitives = normalizedMetric(fullB2, 'pr_trace_primitives');
  if (shallowB2.status === 'insufficient_data' && fullB2.status !== 'insufficient_data') {
    out.push(`B2 left out (full ${fullB2.score} rests on the ratio alone, file evidence ${primitives})`);
  } else if (ratio !== undefined && normalizedMetric(shallowB2, 'pr_merge_ratio') === undefined) {
    const relation = ratio < primitives! ? 'worse than' : ratio > primitives! ? 'better than' : 'equal to';
    out.push(`B2 ratio withheld (full ratio ${ratio} ${relation} file evidence ${primitives})`);
  }
  return out;
}

describe('F1 D: every shallow row against its full clone', () => {
  // Until the ruling of 1 Nov this compared each v27 shallow overall with its full clone's, and
  // allowed it below where the full clone rested on withheld history. A v27 shallow row now has no
  // overall to compare: it is an abstention, neither below nor above.
  it('v27: every shallow row abstains, with no overall to compare, where its full clone is scored', () => {
    for (const row of rows.filter((entry) => entry.rubric === V27)) {
      expect(row.shallow.verdict, label(row)).toBe('insufficient_source');
      expect(row.shallow.overallScore, label(row)).toBeNull();
      expect(row.full.overallScore, label(row)).not.toBeNull();
    }
  });

  it('writes the table to cejel-f1-matrix.md in the temporary directory', () => {
    const cell = (report: WitanReport) => {
      const a2 = criterionOf(report, 'A2');
      const b2 = criterionOf(report, 'B2');
      return `A2 ${a2.status} ${a2.score}; B2 ${b2.status} ${b2.score}; overall ${report.overallScore} ${report.verdict}`;
    };
    const lines = rows.map((row) => {
      const a2 = compare(criterionOf(row.shallow, 'A2').score, criterionOf(row.full, 'A2').score);
      const b2 = compare(criterionOf(row.shallow, 'B2').score, criterionOf(row.full, 'B2').score);
      const abstained = row.shallow.overallScore === null;
      const overall = abstained ? 'abstained' : compare(row.shallow.overallScore!, row.full.overallScore!);
      const band = abstained ? 'abstained' : compare(BAND.indexOf(row.shallow.verdict), BAND.indexOf(row.full.verdict));
      const rubric = row.rubric === V17 ? 'v17' : 'v27';
      return `| ${rubric} | ${row.history} | ${row.evidence} | ${row.depth} | ${cell(row.full)} | ${cell(row.shallow)} | ${a2} | ${b2} | ${overall} | ${band} | ${reasons(row).join('; ') || '-'} |`;
    });
    const pair = [V17, V27].map((rubric) => {
      const full = scanRepository(cacheLibrary.full, rubric);
      const shallow = scanRepository(cacheLibrary.shallow, rubric);
      const name = rubric === V17 ? 'v17' : 'v27';
      const overall = shallow.overallScore === null ? 'abstained' : compare(shallow.overallScore, full.overallScore!);
      return `| ${name} | #114 depth-1 pair shape | full: ${cell(full)} | depth 1: ${cell(shallow)} | overall ${overall} |`;
    });
    expect(lines.length).toBe(HISTORIES.length * EVIDENCE.length * DEPTHS.length * 2);
    const path = join(tmpdir(), 'cejel-f1-matrix.md');
    writeFileSync(path, `${[...lines, '', ...pair].join('\n')}\n`);
  });
});
