import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { runWitanFreeCli } from '../../index.js';
import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { renderWitanBadgeEndpoint } from '../badge.js';
import {
  SHALLOW_HISTORY_FETCH_INSTRUCTION,
  SHALLOW_HISTORY_LIMITATION,
  SHALLOW_HISTORY_V27_ABSTENTION,
  WITAN_V27_SHALLOW_HISTORY_REASON,
  isWitanV27ShallowHistoryAbstention,
} from '../history-depth.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { witanVerdictForScore } from '../schemas.js';
import { DATA_LAYER_HISTORIES, buildDataLayerOrigin } from './fixtures/verdict-cap-data-layer.js';
import { buildShallowA2Origin, cloneShallowA2Origin, removeShallowA2Fixtures } from './fixtures/shallow-a2-shapes.js';
import {
  DEPTHS,
  EVIDENCE,
  HISTORIES,
  buildCacheLibraryOrigin,
  buildMatrixOrigin,
  cloneRepository,
  criterionOf,
  scanRepository,
} from './fixtures/shallow-history-matrix.js';

// Operator ruling of 1 Nov, replacing the v27 freeze change F1's composite treatment for v27. Under
// witan-rubric-v27-prospective-2026-10-19 a shallow clone gets no composite and no verdict: the
// report abstains (verdict insufficient_source, every headline score null) with the shallow-history
// reason, which tells the reader to fetch the full history and scan again. Each criterion's reading
// is still computed and shown. Nothing is asserted from a truncated history, and nothing is lowered
// because of how the runner fetched.
//
// This file held the F1 second pass's verdict-cap tests (the verdict capped at the band the
// composite reaches with A2 counted as 0). The ruling removes that cap, so those tests are rewritten
// here: where they pinned a capped verdict on a shallow v27 scan, they now pin the abstention; where
// they pinned that full clones and v17 carry no cap, they still do, and now also pin that both are
// unchanged by the ruling.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

interface Scan {
  readonly label: string;
  readonly rubric: string;
  readonly shallow: boolean;
  readonly report: WitanReport;
}

let scans: Scan[];
const find = (label: string, rubric: string) => scans.find((scan) => scan.label === label && scan.rubric === rubric)!.report;

beforeAll(() => {
  scans = [];
  const add = (label: string, origin: string, depths: readonly number[]) => {
    const fullPath = cloneRepository(origin);
    for (const rubric of [V17, V27]) scans.push({ label: `${label} full`, rubric, shallow: false, report: scanRepository(fullPath, rubric) });
    for (const depth of depths) {
      const path = cloneRepository(origin, depth);
      for (const rubric of [V17, V27]) {
        scans.push({ label: `${label} depth ${depth}`, rubric, shallow: true, report: scanRepository(path, rubric) });
      }
    }
  };
  for (const history of HISTORIES) {
    for (const evidence of EVIDENCE) add(`${history} ${evidence}`, buildMatrixOrigin(history, evidence), DEPTHS);
  }
  add('cache library', buildCacheLibraryOrigin(), [1]);
  for (const history of DATA_LAYER_HISTORIES) add(`data layer ${history}`, buildDataLayerOrigin(history), [1, 12]);
  // A2 scored critical on a secret in the checked-out tree: the one case where v27's A2 does not
  // abstain on a shallow clone.
  const inTree = buildShallowA2Origin({ secret: 'in-tree', dataLayer: false, cryptoSurface: false });
  for (const clone of ['full', 1] as const) {
    const path = cloneShallowA2Origin(inTree, clone);
    for (const rubric of [V17, V27]) {
      scans.push({
        label: `secret in tree ${clone === 'full' ? 'full' : 'depth 1'}`,
        rubric,
        shallow: clone !== 'full',
        report: scanRepository(path, rubric),
      });
    }
  }
}, 900_000);

afterAll(() => removeShallowA2Fixtures());

describe('v27 on a shallow clone: no composite, no verdict, and how to fetch the history', () => {
  it('every shallow v27 scan abstains with the shallow-history reason, whatever A2 and B2 read', () => {
    const subject = scans.filter((scan) => scan.rubric === V27 && scan.shallow);
    expect(subject.length).toBe(HISTORIES.length * EVIDENCE.length * DEPTHS.length + 1 + DATA_LAYER_HISTORIES.length * 2 + 1);
    for (const scan of subject) {
      const report = scan.report;
      expect(report.verdict, scan.label).toBe('insufficient_source');
      expect(report.overallScore, scan.label).toBeNull();
      expect(report.codeTrustScore, scan.label).toBeNull();
      expect(report.processTrustScore, scan.label).toBeNull();
      expect(report.insufficientSourceReason, scan.label).toBe(WITAN_V27_SHALLOW_HISTORY_REASON);
      expect(isWitanV27ShallowHistoryAbstention(report), scan.label).toBe(true);
      expect((report as { verdictCap?: unknown }).verdictCap, scan.label).toBeUndefined();
      expect(report.historyLimitations, scan.label).toEqual([SHALLOW_HISTORY_V27_ABSTENTION]);
    }
    // "Whatever A2 and B2 read": the subject covers A2 abstaining and A2 scored critical, and B2
    // scored with its ratio, scored with the ratio withheld, abstaining, and not applicable or
    // unmeasured.
    const statuses = (id: string) => new Set(subject.map((scan) => criterionOf(scan.report, id).status));
    expect(statuses('A2')).toContain('insufficient_data');
    expect(statuses('A2')).toContain('critical');
    expect(statuses('B2')).toContain('insufficient_data');
    const b2 = subject.map((scan) => criterionOf(scan.report, 'B2'));
    expect(b2.some((entry) => entry.metrics.some(({ name }) => name === 'pr_merge_ratio'))).toBe(true);
    expect(b2.some((entry) => entry.status !== 'insufficient_data' && !entry.metrics.some(({ name }) => name === 'pr_merge_ratio'))).toBe(true);
  });

  it('the reason names shallow_history and carries the one plain instruction', () => {
    expect(SHALLOW_HISTORY_FETCH_INSTRUCTION).toBe(
      'The scan read a shallow clone: run git fetch --unshallow (or check out with full history, for example fetch-depth: 0 in actions/checkout), then scan again.',
    );
    expect(WITAN_V27_SHALLOW_HISTORY_REASON).toContain('shallow_history');
    expect(WITAN_V27_SHALLOW_HISTORY_REASON).toContain('no composite score and no verdict');
    expect(WITAN_V27_SHALLOW_HISTORY_REASON.endsWith(SHALLOW_HISTORY_FETCH_INSTRUCTION)).toBe(true);
    expect(WITAN_V27_SHALLOW_HISTORY_REASON.length).toBeLessThanOrEqual(2000);
    expect(SHALLOW_HISTORY_V27_ABSTENTION).toContain(SHALLOW_HISTORY_FETCH_INSTRUCTION);
    expect(SHALLOW_HISTORY_V27_ABSTENTION.length).toBeLessThanOrEqual(1000);
  });

  it('each criterion is still read and shown: at least one is measured, and A2 keeps its per-criterion shallow note', () => {
    for (const scan of scans.filter((entry) => entry.rubric === V27 && entry.shallow)) {
      const report = scan.report;
      expect(report.criteria.length, scan.label).toBeGreaterThanOrEqual(11);
      expect(report.criteria.some(({ status }) => status !== 'not_applicable' && status !== 'insufficient_data'), scan.label).toBe(true);
      const a2 = criterionOf(report, 'A2');
      if (a2.status === 'insufficient_data') {
        // A2's and B2's per-criterion shallow notes are kept as they were.
        expect(a2.notes ?? '', scan.label).toMatch(/^A2 abstained: this repository is a shallow clone/);
      }
    }
  });

  it('the report, the CLI output and the certificate each carry the instruction', () => {
    const report = find('data layer secret-deleted depth 1', V27);
    const terminal = renderTerminalCertificate(buildWitanCliSummary(report), report);
    expect(terminal).toContain(`Unrated: shallow clone — no composite score and no verdict.\n  ${WITAN_V27_SHALLOW_HISTORY_REASON}\n`);
    expect(terminal).not.toMatch(/insufficient source/i);
    expect(terminal).not.toMatch(/Overall: /);
    const markdown = renderWitanMarkdownReport(report);
    expect(markdown).toContain(`- Verdict: Unrated: shallow clone — ${WITAN_V27_SHALLOW_HISTORY_REASON}`);
    expect(markdown).not.toMatch(/Verdict capped/);
    const html = renderWitanHtmlReport(report);
    expect(html).toContain(SHALLOW_HISTORY_FETCH_INSTRUCTION);
    expect(html).not.toContain('verdict-cap');
    expect(renderWitanBadgeEndpoint(report).message).toBe('unrated: shallow clone');
  });

  it('the exit status follows the abstained-verdict convention: 0 without --min-score, 1 with it', async () => {
    const shallow = cloneRepository(buildMatrixOrigin('mixed', 'ci-only'), 1);
    const out = (name: string) => join(mkdtempSync(join(tmpdir(), 'cejel-v27-shallow-cli-')), name);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['scan', shallow, '--out', out('plain'), '--quiet', '--rubric-pin', V27])).toBe(0);
      expect(
        await runWitanFreeCli(['scan', shallow, '--out', out('gated'), '--quiet', '--rubric-pin', V27, '--min-score', '0']),
      ).toBe(1);
      expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(SHALLOW_HISTORY_FETCH_INSTRUCTION);
      // v17 on the same clone keeps its verdict and passes a zero threshold.
      expect(await runWitanFreeCli(['scan', shallow, '--out', out('v17'), '--quiet', '--min-score', '0'])).toBe(0);
    } finally {
      stderr.mockRestore();
    }
  }, 120_000);
});

describe('unchanged by the ruling: v17 on a shallow clone, and v27 on a full clone', () => {
  it('every v17 scan, shallow or full, is scored as before: the verdict is its composite\'s band, with no cap', () => {
    for (const scan of scans.filter((entry) => entry.rubric === V17)) {
      const report = scan.report;
      if (report.verdict === 'insufficient_source') throw new Error(`${scan.label}: v17 abstained`);
      expect(report.verdict, scan.label).toBe(witanVerdictForScore(report.overallScore));
      expect(report.verdictCap, scan.label).toBeUndefined();
      expect(report.historyLimitations, scan.label).toEqual(scan.shallow ? [SHALLOW_HISTORY_LIMITATION] : undefined);
    }
  });

  it('every v27 full clone is scored as before: the verdict is its composite\'s band, with no cap and no history limitation', () => {
    for (const scan of scans.filter((entry) => entry.rubric === V27 && !entry.shallow)) {
      const report = scan.report;
      if (report.verdict === 'insufficient_source') throw new Error(`${scan.label}: v27 abstained on a full clone`);
      expect(report.verdict, scan.label).toBe(witanVerdictForScore(report.overallScore));
      expect(report.verdictCap, scan.label).toBeUndefined();
      expect(report.historyLimitations, scan.label).toBeUndefined();
    }
    // The verdicts the F1 cap tests pinned on these full clones.
    expect(find('data layer secret-deleted full', V27).verdict).toBe('at_risk');
    expect(find('data layer clean full', V27).verdict).toBe('conditional');
  });
});
