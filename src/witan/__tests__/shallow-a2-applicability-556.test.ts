import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE } from '../abstention.js';
import { buildRelyingPartySummary } from '../certificate-presentation.js';
import { SHALLOW_HISTORY_LIMITATION, SHALLOW_HISTORY_V27_ABSTENTION } from '../history-depth.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  ISSUE_556_SHAPE,
  SHALLOW_A2_DEPTHS,
  SHALLOW_A2_SHAPES,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
  shallowA2ShapeName,
  type ShallowA2Depth,
  type ShallowA2Shape,
} from './fixtures/shallow-a2-shapes.js';

// #556: on a shallow clone, A2's not-applicable gate rests on two history reads (the .env path
// scan and the history secret scan) that saw only the commits present. A repository whose only A2
// surface is a secret-bearing .env committed and later deleted became not applicable there, so A2
// left the composite and the critical finding the full clone reports disappeared: the score rose.
//
// Operator direction (2026-10-22): under witan-rubric-v27-prospective-2026-10-19, A2 abstains there
// as a read failure kept in the composite at 0. Every other rubric keeps its calibrated scoring
// (v17 is the public default) and carries a presentation-only disclosure instead.
//
// Constructed fixtures only (fixtures/shallow-a2-shapes.ts). Runtime, measured locally: about 18 s
// for the whole file (13 tests), most of it building 12 origins of 15-17 commits and 36 clones.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const BEFORE_V27 = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);
const SHALLOW_DEPTHS = SHALLOW_A2_DEPTHS.filter((depth) => depth !== 'full');
const COMPOSITES = ['overallScore', 'codeTrustScore', 'processTrustScore'] as const;
const SHALLOW_A2_NOTE_PREFIX = 'A2 abstained: this repository is a shallow clone';
const canDenyReadAccess = platform() !== 'win32' && process.getuid?.() !== 0;

// Scoring surfaces (sha256 of JSON.stringify(projectWitanScoringSurface(report))) captured from
// main 71ea38993's scanner, the 0.6.8 release content, before this change: every shape and depth
// under v17, and the issue's shape under v18-v26. No rubric before v27 may move.
const SURFACE_PINS = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/shallow-a2-surface-pins.json', import.meta.url)), 'utf8'),
) as Record<string, string>;

const clones = new Map<string, string>();
const reports = new Map<string, WitanReport>();
const key = (shape: ShallowA2Shape, depth: ShallowA2Depth) => `${shallowA2ShapeName(shape)}@${depth}`;

beforeAll(() => {
  for (const shape of SHALLOW_A2_SHAPES) {
    const origin = buildShallowA2Origin(shape);
    for (const depth of SHALLOW_A2_DEPTHS) clones.set(key(shape, depth), cloneShallowA2Origin(origin, depth));
  }
}, 180_000);

afterAll(() => {
  removeShallowA2Fixtures();
});

function scoreAt(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'shallow-a2-fixture',
    productDisplayName: 'Shallow A2 fixture',
    generatedAt: '2026-10-22T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function report(shape: ShallowA2Shape, depth: ShallowA2Depth, rubricVersion: string): WitanReport {
  const cacheKey = `${key(shape, depth)}@${rubricVersion}`;
  const cached = reports.get(cacheKey);
  if (cached) return cached;
  const repo = clones.get(key(shape, depth));
  if (!repo) throw new Error(`no clone for ${key(shape, depth)}`);
  const scored = scoreAt(repo, rubricVersion);
  reports.set(cacheKey, scored);
  return scored;
}

function a2(scored: WitanReport): WitanCriterionScore {
  const found = scored.criteria.find(({ id }) => id === 'A2');
  if (!found) throw new Error('no A2');
  return found;
}

function surface(scored: WitanReport): string {
  return createHash('sha256').update(JSON.stringify(projectWitanScoringSurface(scored))).digest('hex');
}

const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** norise.mjs's rise: `after` scored where `before` was not, or scored higher. */
function rises(before: unknown, after: unknown): boolean {
  if (!isScore(after)) return false;
  if (!isScore(before)) return true;
  return after > before;
}

/**
 * code_trust as scoring.ts's averageScore computes it from the reported criteria, with A2 in the
 * denominator at 0 and without it. Only A2 is insufficient_data in this category on these
 * fixtures, which the caller asserts.
 */
function codeTrustWithAndWithoutA2(scored: WitanReport): { kept: number; dropped: number } {
  const counted = scored.criteria.filter(
    ({ category, status }) =>
      category === 'code_trust' && status !== 'not_applicable' && status !== 'insufficient_data',
  );
  const total = counted.reduce((sum, { score }) => sum + score, 0);
  const round = (value: number) => Math.round(value * 10) / 10;
  return { kept: round(total / (counted.length + 1)), dropped: round(total / counted.length) };
}

describe("#556: the issue's shape (a secret-bearing .env committed, deleted, then 14 more commits; no other A2 surface)", () => {
  const shape = ISSUE_556_SHAPE;

  it('the full clone reports the critical history finding under v17 and v27', () => {
    for (const rubricVersion of [V17, V27]) {
      const full = a2(report(shape, 'full', rubricVersion));
      expect(full.status, rubricVersion).toBe('critical');
      expect(full.findings.map(({ summary }) => summary), rubricVersion).toContain(
        'Secret-shaped value appears in recent git history.',
      );
    }
  });

  it('v17 still scores the shallow clone higher than the full clone (the calibrated behaviour this disclosure qualifies)', () => {
    for (const depth of SHALLOW_DEPTHS) {
      expect(a2(report(shape, depth, V17)).status).toBe('not_applicable');
      expect(report(shape, depth, V17).overallScore as number).toBeGreaterThan(
        report(shape, 'full', V17).overallScore as number,
      );
    }
  });

  it('every rubric before v27 keeps the scoring surface 0.6.8 produced, and A2 carries the disclosure', () => {
    for (const depth of SHALLOW_A2_DEPTHS) {
      for (const rubricVersion of BEFORE_V27) {
        const scored = report(shape, depth, rubricVersion);
        const pin = SURFACE_PINS[`${key(shape, depth)}@${rubricVersion}`];
        expect(pin, `${depth} ${rubricVersion}`).toMatch(/^[0-9a-f]{64}$/);
        expect(surface(scored), `${depth} ${rubricVersion}`).toBe(pin);
        expect(a2(scored).disclosures, `${depth} ${rubricVersion}`).toEqual(
          depth === 'full' ? undefined : [WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE],
        );
      }
    }
  });

  it('v17: the certificate lists the disclosure under "What was not established"; the full clone does not', () => {
    for (const depth of SHALLOW_DEPTHS) {
      const scored = report(shape, depth, V17);
      expect(scored.historyLimitations).toEqual([SHALLOW_HISTORY_LIMITATION]);
      expect(buildRelyingPartySummary(scored).notEstablished).toContain(
        WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE,
      );
      expect(renderWitanMarkdownReport(scored)).toContain(WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE);
    }
    expect(buildRelyingPartySummary(report(shape, 'full', V17)).notEstablished).not.toContain(
      "A2's applicability",
    );
  });

  it('the disclosure states what was and was not read, in the collector\'s own words, and claims no absence', () => {
    expect(WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE).toContain('read only the commits this clone holds');
    expect(WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE).toContain('fetch-depth: 0');
    expect(WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE).not.toMatch(/\bno secret|\bclean\b|\bnot present\b/i);
    expect(WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE.length).toBeLessThanOrEqual(1000);
  });

  it('v27: A2 abstains on the shallow clone as a read failure kept in the composite at 0', () => {
    for (const depth of SHALLOW_DEPTHS) {
      const scored = report(shape, depth, V27);
      const criterion = a2(scored);
      expect(criterion.status).toBe('insufficient_data');
      expect(criterion.score).toBe(0);
      expect(criterion.notes ?? '').toMatch(new RegExp(`^${SHALLOW_A2_NOTE_PREFIX}`));
      expect(criterion.notes ?? '').toContain('would otherwise have been marked not applicable');
      expect(criterion.disclosures).toBeUndefined();
      expect(scored.historyLimitations).toEqual([SHALLOW_HISTORY_V27_ABSTENTION]);
      expect(buildRelyingPartySummary(scored).notEstablished).not.toContain("A2's applicability");
      // Kept in the denominator: code_trust is reproduced with A2 at 0 and not without it.
      expect(
        scored.criteria.filter(({ category, status }) => category === 'code_trust' && status === 'insufficient_data')
          .map(({ id }) => id),
      ).toEqual(['A2']);
      const { kept, dropped } = codeTrustWithAndWithoutA2(scored);
      expect(kept).not.toBe(dropped);
      expect(scored.codeTrustScore).toBe(kept);
    }
  });

  it('v27: the shallow composites and A2 score do not exceed the full clone\'s', () => {
    const full = report(shape, 'full', V27);
    for (const depth of SHALLOW_DEPTHS) {
      const shallow = report(shape, depth, V27);
      for (const composite of COMPOSITES) {
        expect(rises(full[composite], shallow[composite]), `${depth} ${composite}`).toBe(false);
      }
      expect(a2(shallow).score).toBeLessThanOrEqual(a2(full).score);
      expect(shallow.overallScore as number).toBeLessThan(full.overallScore as number);
    }
  });

  it('v27 against v17 on the same shallow clone: A2 moves from not applicable to an abstention and no composite rises', () => {
    for (const depth of SHALLOW_DEPTHS) {
      const before = report(shape, depth, V17);
      const after = report(shape, depth, V27);
      expect(a2(before).status).toBe('not_applicable');
      expect(a2(after).status).toBe('insufficient_data');
      expect(a2(after).score).toBeLessThanOrEqual(a2(before).score);
      for (const composite of COMPOSITES) {
        expect(rises(before[composite], after[composite]), `${depth} ${composite}`).toBe(false);
      }
      expect(after.codeTrustScore as number).toBeLessThan(before.codeTrustScore as number);
    }
  });
});

describe('#556: not-applicable decisions that do not rest on truncated history are unchanged', () => {
  const none: ShallowA2Shape = { secret: 'none', dataLayer: false, cryptoSurface: false };

  it('a full clone with no A2 surface stays not applicable under v27, with no disclosure', () => {
    for (const rubricVersion of [V17, V27]) {
      const criterion = a2(report(none, 'full', rubricVersion));
      expect(criterion.status, rubricVersion).toBe('not_applicable');
      expect(criterion.disclosures, rubricVersion).toBeUndefined();
    }
  });

  it('a directory that is not a git repository stays not applicable under v27, with no disclosure', () => {
    const plain = mkdtempSync(join(tmpdir(), 'cejel-shallow-a2-plain-'));
    try {
      cpSync(clones.get(key(none, 'full')) as string, plain, {
        recursive: true,
        filter: (source) => !source.split(/[\\/]/).includes('.git'),
      });
      for (const rubricVersion of [V17, V27]) {
        const scored = scoreAt(plain, rubricVersion);
        expect(a2(scored).status, rubricVersion).toBe('not_applicable');
        expect(a2(scored).disclosures, rubricVersion).toBeUndefined();
        expect(scored.historyLimitations, rubricVersion).toBeUndefined();
      }
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it.skipIf(!canDenyReadAccess)(
    'a content-read abstention replaces the not-applicable result and drops the applicability sentence with it',
    () => {
      const shallow = cloneShallowA2Origin(buildShallowA2Origin(none), 1);
      const file = join(shallow, 'src/a.js');
      chmodSync(file, 0o000);
      try {
        const criterion = a2(scoreAt(shallow, V17));
        expect(criterion.status).toBe('insufficient_data');
        expect(criterion.disclosures ?? []).not.toContain(WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE);
      } finally {
        chmodSync(file, 0o644);
      }
    },
  );
});

// The property (operator direction 2026-10-22, item 3): under v27, for every generated A2 shape and
// depth, the shallow clone's composites and A2 score never exceed the full clone's. 12 shapes
// (secret in the tree / deleted in history / none; data layer yes/no; crypto surface yes/no) x
// depths 1 and 12, against the full clone. Deterministic: fixed commits, no randomness.
describe('#556 property: under v27 a shallow clone never scores above its full clone', () => {
  it('holds for every shape and depth, and A2 is never not applicable on a shallow clone', () => {
    const problems: string[] = [];
    let lowered = 0;
    for (const shape of SHALLOW_A2_SHAPES) {
      const full = report(shape, 'full', V27);
      for (const depth of SHALLOW_DEPTHS) {
        const shallow = report(shape, depth, V27);
        const name = `${shallowA2ShapeName(shape)} depth ${depth}`;
        for (const composite of COMPOSITES) {
          if (rises(full[composite], shallow[composite])) {
            problems.push(`${name}: ${composite} ${String(full[composite])} -> ${String(shallow[composite])}`);
          }
        }
        if (a2(shallow).score > a2(full).score) problems.push(`${name}: A2 ${a2(full).score} -> ${a2(shallow).score}`);
        if (a2(shallow).status === 'not_applicable') problems.push(`${name}: A2 not applicable on a shallow clone`);
        if ((shallow.overallScore ?? 0) < (full.overallScore ?? 0)) lowered += 1;
      }
    }
    expect(problems).toEqual([]);
    // Liveness: the property is not vacuous. Every shape without a current-tree secret abstains A2 on
    // its shallow clones (4 + 4 shapes x 2 depths); the in-tree secret stands as critical.
    expect(lowered).toBe(16);
  }, 120_000);

  it('every rubric before v27 is unchanged on every shape (v17 pinned), and discloses exactly where A2 is not applicable on a shallow clone', () => {
    const problems: string[] = [];
    for (const shape of SHALLOW_A2_SHAPES) {
      for (const depth of SHALLOW_A2_DEPTHS) {
        const scored = report(shape, depth, V17);
        const name = `${shallowA2ShapeName(shape)} depth ${depth}`;
        if (surface(scored) !== SURFACE_PINS[`${key(shape, depth)}@${V17}`]) problems.push(`${name}: v17 surface moved`);
        const expectDisclosure = depth !== 'full' && a2(scored).status === 'not_applicable';
        const disclosed = (a2(scored).disclosures ?? []).includes(WITAN_A2_SHALLOW_APPLICABILITY_DISCLOSURE);
        if (disclosed !== expectDisclosure) problems.push(`${name}: disclosure ${disclosed}, expected ${expectDisclosure}`);
      }
    }
    expect(problems).toEqual([]);
    expect(Object.keys(SURFACE_PINS)).toHaveLength(SHALLOW_A2_SHAPES.length * SHALLOW_A2_DEPTHS.length + 9 * 3);
  }, 120_000);
});
