import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  WITAN_A2_HISTORY_APPLICABILITY_PREFIX,
  WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX,
} from '../abstention.js';
import { buildRelyingPartySummary } from '../certificate-presentation.js';
import { SHALLOW_HISTORY_LIMITATION, SHALLOW_HISTORY_V27_ABSTENTION } from '../history-depth.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  a2HistoryApplicabilityDisclosure,
  probeA2EnvPathHistoryRead,
  v27A2FailedHistoryNote,
} from '../repo-signals.js';
import { projectWitanScoringSurface } from '../rubric-fingerprint.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import type { WitanCriterionScore, WitanReport } from '../schemas.js';
import {
  A2_HISTORY_CLONES,
  ISSUE_556_SHAPE,
  SHALLOW_A2_SYNTHETIC_SECRET_LINE,
  buildA2HistoryOrigin,
  SHALLOW_A2_SHAPES,
  buildShallowA2Origin,
  cloneShallowA2Origin,
  removeShallowA2Fixtures,
  shallowA2ShapeName,
  type A2HistoryClone,
  type ShallowA2Shape,
} from './fixtures/shallow-a2-shapes.js';

// #556: A2's not-applicable gate rests on two history reads (the .env path scan and the history
// secret scan). On a shallow clone they saw only the commits present; on a partial clone, or when a
// git read fails, they did not complete and Cejel treated the failure as nothing found. A
// repository whose only A2 surface is a secret-bearing .env committed and later deleted became not
// applicable (shallow, treeless) or scored a warning instead of critical (blobless, a failed blob
// read), so the score rose above the complete clone's.
//
// Under witan-rubric-v27-prospective-2026-10-19, A2 abstains whenever its history evidence is
// incomplete (shallow, or any of its history reads failed), on the not-applicable path and the
// scoring path alike, as a read failure kept in the composite at 0, unless a confirmed critical
// finding stands. Every other rubric keeps its calibrated scoring (v17 is the public default) and,
// where A2 is not applicable on such a decision, carries a presentation-only disclosure.
//
// Constructed fixtures only (fixtures/shallow-a2-shapes.ts): 12 shapes x 6 clones (full, depth 1,
// depth 12, blobless, treeless, and a complete-looking clone with history blobs missing). Runtime,
// measured locally: about 35 s alone for the whole file, most of it building 12 origins of 15-17
// commits and 72 clones.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const BEFORE_V27 = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);
const SHALLOW: readonly A2HistoryClone[] = [1, 12];
const FAILED_READS: readonly A2HistoryClone[] = ['blobless', 'treeless', 'missing-blobs'];
const INCOMPLETE = A2_HISTORY_CLONES.filter((clone) => clone !== 'full');
const COMPOSITES = ['overallScore', 'codeTrustScore', 'processTrustScore'] as const;
const SHALLOW_A2_NOTE_PREFIX = 'A2 abstained: this repository is a shallow clone';
const FAILED_A2_NOTE_PREFIX = WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX;
const HISTORY_READ_FAILURE = 'Cejel continued with reduced Git history evidence.';
const canDenyReadAccess = platform() !== 'win32' && process.getuid?.() !== 0;

// The two sentences the fixtures produce, written out so a wording change is a visible edit here.
const SHALLOW_DISCLOSURE =
  "A2's applicability was decided from an incomplete read of the commit history: this clone is " +
  "shallow, so Cejel's scans of earlier commits read only the commits it holds. Marking A2 not " +
  "applicable rests in part on Cejel's scans of earlier commits for .env files and credential-shaped " +
  'values, so a complete read of the history may make A2 applicable and give it a score. Re-scan a ' +
  'full clone (for actions/checkout, set fetch-depth: 0).';
const FAILED_READ_DISCLOSURE =
  "A2's applicability was decided from an incomplete read of the commit history: Cejel could not " +
  'read part of the commit history (the scan limitations name each failed read). Marking A2 not ' +
  "applicable rests in part on Cejel's scans of earlier commits for .env files and credential-shaped " +
  'values, so a complete read of the history may make A2 applicable and give it a score. Re-scan a ' +
  'full, unfiltered clone (for actions/checkout, set fetch-depth: 0 and no filter).';

// Scoring surfaces (sha256 of JSON.stringify(projectWitanScoringSurface(report))) captured from
// main 71ea38993's scanner, before this change: every shape and clone
// under v17, and the issue's shape under v18-v26. No rubric before v27 may move.
const SURFACE_PINS = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/shallow-a2-surface-pins.json', import.meta.url)), 'utf8'),
) as Record<string, string>;

const clones = new Map<string, string>();
const reports = new Map<string, WitanReport>();
const key = (shape: ShallowA2Shape, clone: A2HistoryClone) => `${shallowA2ShapeName(shape)}@${clone}`;

beforeAll(() => {
  for (const shape of SHALLOW_A2_SHAPES) {
    const origin = buildShallowA2Origin(shape);
    for (const clone of A2_HISTORY_CLONES) clones.set(key(shape, clone), cloneShallowA2Origin(origin, clone));
  }
}, 300_000);

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

function report(shape: ShallowA2Shape, clone: A2HistoryClone, rubricVersion: string): WitanReport {
  const cacheKey = `${key(shape, clone)}@${rubricVersion}`;
  const cached = reports.get(cacheKey);
  if (cached) return cached;
  const repo = clones.get(key(shape, clone));
  if (!repo) throw new Error(`no clone for ${key(shape, clone)}`);
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

const historyReadFailed = (scored: WitanReport) =>
  (scored.scanLimitations ?? []).some((limitation) => limitation.endsWith(HISTORY_READ_FAILURE));

describe("#556: the issue's shape (a secret-bearing .env committed, deleted, then 14 more commits; no other A2 surface)", () => {
  const shape = ISSUE_556_SHAPE;

  it('the complete clone reports the critical history finding under v17 and v27', () => {
    for (const rubricVersion of [V17, V27]) {
      const full = a2(report(shape, 'full', rubricVersion));
      expect(full.status, rubricVersion).toBe('critical');
      expect(full.findings.map(({ summary }) => summary), rubricVersion).toContain(
        'Secret-shaped value appears in recent git history.',
      );
    }
  });

  it('v17 still scores every incomplete clone higher than the complete clone (the calibrated behaviour)', () => {
    const expected: Record<string, string> = {
      '1': 'not_applicable',
      '12': 'not_applicable',
      blobless: 'warning',
      treeless: 'not_applicable',
      'missing-blobs': 'warning',
    };
    for (const clone of INCOMPLETE) {
      expect(a2(report(shape, clone, V17)).status, String(clone)).toBe(expected[String(clone)]);
      expect(report(shape, clone, V17).overallScore as number, String(clone)).toBeGreaterThan(
        report(shape, 'full', V17).overallScore as number,
      );
    }
    for (const clone of FAILED_READS) expect(historyReadFailed(report(shape, clone, V17)), String(clone)).toBe(true);
    for (const clone of [...SHALLOW, 'full' as const]) {
      expect(historyReadFailed(report(shape, clone, V17)), String(clone)).toBe(false);
    }
  });

  it('every rubric before v27 keeps the scoring surface main 71ea38993 produced; A2 discloses where it is not applicable on incomplete history', () => {
    for (const clone of A2_HISTORY_CLONES) {
      for (const rubricVersion of BEFORE_V27) {
        const scored = report(shape, clone, rubricVersion);
        const pin = SURFACE_PINS[`${key(shape, clone)}@${rubricVersion}`];
        expect(pin, `${clone} ${rubricVersion}`).toMatch(/^[0-9a-f]{64}$/);
        expect(surface(scored), `${clone} ${rubricVersion}`).toBe(pin);
        const expected =
          clone === 1 || clone === 12
            ? [SHALLOW_DISCLOSURE]
            : clone === 'treeless'
              ? [FAILED_READ_DISCLOSURE]
              : undefined;
        expect(a2(scored).disclosures, `${clone} ${rubricVersion}`).toEqual(expected);
      }
    }
  });

  it('v17: the certificate lists the disclosure under "What was not established"; the complete clone does not', () => {
    for (const [clone, sentence] of [
      [1, SHALLOW_DISCLOSURE],
      [12, SHALLOW_DISCLOSURE],
      ['treeless', FAILED_READ_DISCLOSURE],
    ] as const) {
      const scored = report(shape, clone, V17);
      if (clone !== 'treeless') expect(scored.historyLimitations).toEqual([SHALLOW_HISTORY_LIMITATION]);
      expect(buildRelyingPartySummary(scored).notEstablished, String(clone)).toContain(sentence);
      expect(renderWitanMarkdownReport(scored), String(clone)).toContain(sentence);
    }
    expect(buildRelyingPartySummary(report(shape, 'full', V17)).notEstablished).not.toContain(
      WITAN_A2_HISTORY_APPLICABILITY_PREFIX,
    );
  });

  it("the disclosure names only the causes Cejel detected, in Cejel's own words, and claims no absence", () => {
    const none = { shallow: false, limitHits: [] as string[], otherFailure: false };
    expect(a2HistoryApplicabilityDisclosure({ ...none, shallow: true })).toBe(SHALLOW_DISCLOSURE);
    expect(a2HistoryApplicabilityDisclosure({ ...none, otherFailure: true })).toBe(FAILED_READ_DISCLOSURE);
    // One of Cejel's own limits fires on a complete clone too: name it, and say a re-scan of the same
    // repository will not lift it, with no fetch-depth advice.
    const limit = a2HistoryApplicabilityDisclosure({ ...none, limitHits: ['8 MiB output limit'] });
    expect(limit).toContain("stopped at Cejel's own 8 MiB output limit");
    expect(limit).toContain('A re-scan of the same repository will not lift');
    expect(limit).not.toContain('fetch-depth');
    expect(limit).not.toContain('could not read part');
    for (const wouldBeNotApplicable of [true, false]) {
      const note = v27A2FailedHistoryNote({ ...none, limitHits: ['8 MiB output limit'] }, wouldBeNotApplicable);
      expect(note.startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX)).toBe(true);
      expect(note).toContain("Cejel's own 8 MiB output limit");
      expect(note).not.toContain('fetch-depth');
    }
    const all = a2HistoryApplicabilityDisclosure({
      shallow: true,
      limitHits: ['30-second timeout', '8 MiB output limit'],
      otherFailure: true,
    });
    expect(all).toContain('this clone is shallow');
    expect(all).toContain('30-second timeout and 8 MiB output limit');
    expect(all).toContain('Cejel could not read part of the commit history');
    expect(all).toContain('set fetch-depth: 0 and no filter');
    expect(all).toContain("will not lift Cejel's own limits");
    for (const sentence of [SHALLOW_DISCLOSURE, FAILED_READ_DISCLOSURE, limit, all]) {
      expect(sentence.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX)).toBe(true);
      expect(sentence).not.toMatch(/\bno secret|\bclean\b|\bnot present\b|\bpartial clone\b|\bfilter=/i);
      expect(sentence.length).toBeLessThanOrEqual(1000);
    }
  });

  it('v27: A2 abstains on every incomplete clone as a read failure kept in the composite at 0', () => {
    for (const clone of INCOMPLETE) {
      const scored = report(shape, clone, V27);
      const criterion = a2(scored);
      const name = String(clone);
      expect(criterion.status, name).toBe('insufficient_data');
      expect(criterion.score, name).toBe(0);
      expect(
        (criterion.notes ?? '').startsWith(FAILED_READS.includes(clone) ? FAILED_A2_NOTE_PREFIX : SHALLOW_A2_NOTE_PREFIX),
        `${name}: ${criterion.notes ?? ''}`,
      ).toBe(true);
      // The not-applicable path (shallow, treeless) says so; the scoring path (blobless, missing
      // blobs: the .env path is visible in history, its value is not) does not.
      expect((criterion.notes ?? '').includes('would otherwise have been marked not applicable'), name).toBe(
        clone === 1 || clone === 12 || clone === 'treeless',
      );
      expect(criterion.disclosures, name).toBeUndefined();
      expect(scored.historyLimitations, name).toEqual(
        clone === 1 || clone === 12 ? [SHALLOW_HISTORY_V27_ABSTENTION] : undefined,
      );
      expect(buildRelyingPartySummary(scored).notEstablished, name).not.toContain(
        WITAN_A2_HISTORY_APPLICABILITY_PREFIX,
      );
      // Kept in the denominator: code_trust is reproduced with A2 at 0 and not without it.
      expect(
        scored.criteria
          .filter(({ category, status }) => category === 'code_trust' && status === 'insufficient_data')
          .map(({ id }) => id),
        name,
      ).toEqual(['A2']);
      const { kept, dropped } = codeTrustWithAndWithoutA2(scored);
      expect(kept, name).not.toBe(dropped);
      expect(scored.codeTrustScore, name).toBe(kept);
    }
  });

  it("v27: no incomplete clone's composites or A2 score exceed the complete clone's", () => {
    const full = report(shape, 'full', V27);
    for (const clone of INCOMPLETE) {
      const incomplete = report(shape, clone, V27);
      for (const composite of COMPOSITES) {
        expect(rises(full[composite], incomplete[composite]), `${clone} ${composite}`).toBe(false);
      }
      expect(a2(incomplete).score, String(clone)).toBeLessThanOrEqual(a2(full).score);
      expect(incomplete.overallScore as number, String(clone)).toBeLessThan(full.overallScore as number);
    }
  });

  it('v27 against v17 on the same incomplete clone: A2 moves to an abstention and no composite rises', () => {
    for (const clone of INCOMPLETE) {
      const before = report(shape, clone, V17);
      const after = report(shape, clone, V27);
      expect(a2(after).status, String(clone)).toBe('insufficient_data');
      expect(a2(after).score, String(clone)).toBeLessThanOrEqual(a2(before).score);
      for (const composite of COMPOSITES) {
        expect(rises(before[composite], after[composite]), `${clone} ${composite}`).toBe(false);
      }
      expect(after.codeTrustScore as number, String(clone)).toBeLessThan(before.codeTrustScore as number);
    }
  });
});

describe('#556: decisions whose history reads all completed over complete history are unchanged', () => {
  const none: ShallowA2Shape = { secret: 'none', dataLayer: false, cryptoSurface: false };

  it('a complete clone with no A2 surface stays not applicable under v27, with no disclosure', () => {
    for (const rubricVersion of [V17, V27]) {
      const criterion = a2(report(none, 'full', rubricVersion));
      expect(criterion.status, rubricVersion).toBe('not_applicable');
      expect(criterion.disclosures, rubricVersion).toBeUndefined();
    }
  });

  it('a blobless clone whose history holds no credential-shaped path reads no blob, so its reads complete and A2 stays not applicable', () => {
    for (const clone of ['blobless', 'missing-blobs'] as const) {
      for (const rubricVersion of [V17, V27]) {
        const scored = report(none, clone, rubricVersion);
        expect(historyReadFailed(scored), `${clone} ${rubricVersion}`).toBe(false);
        expect(a2(scored).status, `${clone} ${rubricVersion}`).toBe('not_applicable');
        expect(a2(scored).disclosures, `${clone} ${rubricVersion}`).toBeUndefined();
      }
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

  it('a secret in the tree stands as critical on every clone under v27', () => {
    const inTree: ShallowA2Shape = { secret: 'in-tree', dataLayer: false, cryptoSurface: false };
    const full = a2(report(inTree, 'full', V27));
    for (const clone of A2_HISTORY_CLONES) {
      const criterion = a2(report(inTree, clone, V27));
      expect([criterion.status, criterion.score], String(clone)).toEqual([full.status, full.score]);
      // The critical findings it stands on are the complete clone's; a complete clone may add a
      // history finding of its own (an info), which a shallow or treeless clone cannot see.
      expect(
        criterion.findings.filter(({ severity }) => severity === 'critical').map(({ summary }) => summary),
        String(clone),
      ).toEqual(full.findings.filter(({ severity }) => severity === 'critical').map(({ summary }) => summary));
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
        expect((criterion.disclosures ?? []).some((text) => text.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX))).toBe(
          false,
        );
      } finally {
        chmodSync(file, 0o644);
      }
    },
  );
});

describe('#556: which history-read outcomes count as a failed read', () => {
  const base = { 'package.json': '{"name":"corner","version":"1.0.0"}\n', 'src/a.js': 'export const a = 1;\n' };

  it('a failure of the .env-path history read on its own counts as a failed read', () => {
    // A treeless clone: `git log --name-only` needs trees it does not hold and may not fetch.
    const treeless = cloneShallowA2Origin(buildShallowA2Origin(ISSUE_556_SHAPE), 'treeless');
    const probe = probeA2EnvPathHistoryRead(treeless);
    expect(probe.found).toBe(false);
    expect(probe.otherFailure).toBe(true);
    expect(probe.limitHits).toEqual([]);
    expect(probe.limitations).toEqual([
      'Cejel: local git environment-file history scan failed. Cejel continued with reduced Git history evidence.',
    ]);
  });

  it('a path skipped for control characters is not a failed read: A2 stays not applicable on a complete clone', () => {
    const repo = cloneShallowA2Origin(
      buildA2HistoryOrigin('control-character', [{ write: { ...base, 'notes\tfile.txt': 'x\n' } }, { write: { 'README.md': '# c\n' } }]),
      'full',
    );
    const probe = probeA2EnvPathHistoryRead(repo);
    expect(probe.limitations).toHaveLength(1);
    expect(probe.limitations[0]).toContain('control characters');
    expect([probe.limitHits, probe.otherFailure]).toEqual([[], false]);
    for (const rubricVersion of [V17, V27]) {
      const scored = scoreAt(repo, rubricVersion);
      expect(scored.scanLimitations ?? [], rubricVersion).toEqual(probe.limitations);
      expect(a2(scored).status, rubricVersion).toBe('not_applicable');
      expect(a2(scored).disclosures, rubricVersion).toBeUndefined();
    }
  });

  it("a read that stops at one of Cejel's own limits on a complete clone abstains under v27, naming the limit, with no fetch-depth advice", () => {
    // A deleted .env larger than the 500 KiB historical blob read limit, on a complete clone.
    const repo = cloneShallowA2Origin(
      buildA2HistoryOrigin('oversized-env', [
        { write: base },
        { write: { '.env': `${SHALLOW_A2_SYNTHETIC_SECRET_LINE}# ${'x'.repeat(600_000)}\n` } },
        { remove: ['.env'] },
        { write: { 'README.md': '# c\n' } },
      ]),
      'full',
    );
    const v17 = scoreAt(repo, V17);
    const v27 = scoreAt(repo, V27);
    const limitation =
      'Cejel: local git historical blob read exceeded the 500 KiB output limit. Cejel continued with reduced Git history evidence.';
    expect(v17.scanLimitations).toEqual([limitation]);
    expect(a2(v17).status).toBe('warning');
    expect(a2(v27).status).toBe('insufficient_data');
    expect(a2(v27).score).toBe(0);
    expect(a2(v27).notes ?? '').toContain("stopped at Cejel's own 500 KiB output limit");
    expect(a2(v27).notes ?? '').toContain('A re-scan of the same repository will not lift');
    expect(a2(v27).notes ?? '').not.toContain('fetch-depth');
    expect(v27.overallScore as number).toBeLessThan(v17.overallScore as number);
  });
});

// The property (#556, #560): under v27, for every generated A2 shape, a clone whose history Cejel
// read incompletely (truncated or failed) never scores above the complete clone, on the composites or
// A2. 12 shapes (secret in the tree / deleted in history / none; data layer yes/no; crypto surface
// yes/no) x 5 incomplete clones against the full clone. Deterministic: fixed commits, no randomness.
describe('#556 property: under v27 a truncated or failed history read never scores above the complete clone', () => {
  it('holds for every shape and clone, and A2 is never not applicable on incomplete history', () => {
    const problems: string[] = [];
    const lowered: string[] = [];
    for (const shape of SHALLOW_A2_SHAPES) {
      const full = report(shape, 'full', V27);
      for (const clone of INCOMPLETE) {
        const incomplete = report(shape, clone, V27);
        const name = `${shallowA2ShapeName(shape)} ${clone}`;
        for (const composite of COMPOSITES) {
          if (rises(full[composite], incomplete[composite])) {
            problems.push(`${name}: ${composite} ${String(full[composite])} -> ${String(incomplete[composite])}`);
          }
        }
        if (a2(incomplete).score > a2(full).score) problems.push(`${name}: A2 ${a2(full).score} -> ${a2(incomplete).score}`);
        const truncatedOrFailed = clone === 1 || clone === 12 || historyReadFailed(incomplete);
        if (truncatedOrFailed && a2(incomplete).status === 'not_applicable') {
          problems.push(`${name}: A2 not applicable on incomplete history`);
        }
        if ((incomplete.overallScore ?? 0) < (full.overallScore ?? 0)) lowered.push(name);
      }
    }
    expect(problems).toEqual([]);
    // Liveness: the property is not vacuous. Lowered: every shape without a secret in the tree on
    // its shallow and treeless clones (8 x 3), and the 4 deleted-secret shapes on their blobless and
    // missing-blob clones (4 x 2). The in-tree secret stands as critical; a blobless clone whose
    // history holds no credential path reads every object it needs.
    expect(lowered).toHaveLength(32);
  }, 180_000);

  it('every rubric before v27 is unchanged on every shape (v17 pinned), and discloses exactly where A2 is not applicable on incomplete history', () => {
    const problems: string[] = [];
    for (const shape of SHALLOW_A2_SHAPES) {
      for (const clone of A2_HISTORY_CLONES) {
        const scored = report(shape, clone, V17);
        const name = `${shallowA2ShapeName(shape)} ${clone}`;
        if (surface(scored) !== SURFACE_PINS[`${key(shape, clone)}@${V17}`]) problems.push(`${name}: v17 surface moved`);
        const truncatedOrFailed = clone === 1 || clone === 12 || historyReadFailed(scored);
        const expectDisclosure = truncatedOrFailed && a2(scored).status === 'not_applicable';
        const disclosed = (a2(scored).disclosures ?? []).some((text) =>
          text.startsWith(WITAN_A2_HISTORY_APPLICABILITY_PREFIX),
        );
        if (disclosed !== expectDisclosure) problems.push(`${name}: disclosure ${disclosed}, expected ${expectDisclosure}`);
      }
    }
    expect(problems).toEqual([]);
    expect(Object.keys(SURFACE_PINS)).toHaveLength(
      SHALLOW_A2_SHAPES.length * A2_HISTORY_CLONES.length + (BEFORE_V27.length - 1) * A2_HISTORY_CLONES.length,
    );
  }, 180_000);
});
