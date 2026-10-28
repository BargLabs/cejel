import { beforeAll, describe, expect, it } from 'vitest';

import type { WitanReport, WitanScoredVerdict } from '../schemas.js';

import { buildWitanCliSummary } from '../../summary.js';
import { renderTerminalCertificate } from '../../terminal.js';
import { WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX } from '../abstention.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { witanVerdictForScore } from '../schemas.js';
import { DATA_LAYER_HISTORIES, type DataLayerHistory, buildDataLayerOrigin } from './fixtures/verdict-cap-data-layer.js';
import {
  DEPTHS,
  EVIDENCE,
  HISTORIES,
  buildCacheLibraryOrigin,
  buildMatrixOrigin,
  cloneRepository,
  compositeWithoutUnscored,
  criterionOf,
  scanRepository,
} from './fixtures/shallow-history-matrix.js';

// v27 freeze change F1, item B of its second pass. Operator decision of 28 Oct, option C: on a
// shallow clone under v27, where A2 abstains with reason shallow_history, the composite stays as
// F1 computes it (A2 left out), but the verdict band is capped at the band the composite would
// reach with that abstention counted as 0. The cap never raises a band; a full clone, or a report
// whose A2 did not abstain for the clone's depth, is unchanged. The report says the cap applied in
// `verdictCap`, and the certificate says so in one sentence beside the verdict.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const BAND_RANK: Readonly<Record<WitanScoredVerdict, number>> = { unverified: 0, at_risk: 1, conditional: 2, verified: 3 };

interface Scan {
  readonly label: string;
  readonly rubric: string;
  readonly shallow: boolean;
  readonly full: WitanReport;
  readonly report: WitanReport;
}

const round = (score: number) => Math.round(score * 10) / 10;

/** The composite with A2 counted as 0 and every other criterion as the report's own composite has it. */
function compositeWithA2AsZero(report: WitanReport): number {
  const category = (name: 'code_trust' | 'process_trust') => {
    const included = report.criteria.filter(
      (entry) =>
        entry.category === name &&
        (entry.id === 'A2' || (entry.status !== 'not_applicable' && entry.status !== 'insufficient_data')),
    );
    return included.length === 0 ? 0 : round(included.reduce((sum, entry) => sum + (entry.id === 'A2' ? 0 : entry.score), 0) / included.length);
  };
  return round((category('code_trust') + category('process_trust')) / 2);
}

function scored(report: WitanReport) {
  if (report.verdict === 'insufficient_source') throw new Error('abstained');
  return report;
}

let scans: Scan[];
const dataLayer = new Map<DataLayerHistory, { full: WitanReport; depth1: WitanReport; depth12: WitanReport }>();

beforeAll(() => {
  scans = [];
  const add = (label: string, origin: string, depths: readonly number[]) => {
    const fullPath = cloneRepository(origin);
    for (const rubric of [V17, V27]) {
      const full = scanRepository(fullPath, rubric);
      scans.push({ label: `${label} full`, rubric, shallow: false, full, report: full });
    }
    for (const depth of depths) {
      const path = cloneRepository(origin, depth);
      for (const rubric of [V17, V27]) {
        const full = scans.find((scan) => scan.label === `${label} full` && scan.rubric === rubric)!.report;
        scans.push({ label: `${label} depth ${depth}`, rubric, shallow: true, full, report: scanRepository(path, rubric) });
      }
    }
  };
  for (const history of HISTORIES) {
    for (const evidence of EVIDENCE) add(`${history} ${evidence}`, buildMatrixOrigin(history, evidence), DEPTHS);
  }
  add('cache library', buildCacheLibraryOrigin(), [1]);
  for (const history of DATA_LAYER_HISTORIES) {
    add(`data layer ${history}`, buildDataLayerOrigin(history), [1, 12]);
    const find = (suffix: string) => scans.find((scan) => scan.label === `data layer ${history} ${suffix}` && scan.rubric === V27)!.report;
    dataLayer.set(history, { full: find('full'), depth1: find('depth 1'), depth12: find('depth 12') });
  }
}, 900_000);

// On these fixtures every history read succeeds, so A2's only abstention on a shallow clone is the
// shallow-only one (reason shallow_history); a failed read would carry the failed-history prefix.
const a2ShallowAbstention = (report: WitanReport) => {
  const a2 = criterionOf(report, 'A2');
  return a2.status === 'insufficient_data' && !(a2.notes ?? '').startsWith(WITAN_V27_A2_FAILED_HISTORY_NOTE_PREFIX);
};

describe('F1 v2 B: a shallow v27 verdict is capped where A2 could not be read', () => {
  it('the data-layer repository with a deleted secret no longer rises a band above its full clone', () => {
    const { full, depth1, depth12 } = dataLayer.get('secret-deleted')!;
    expect(full.verdict).toBe('at_risk');
    for (const shallow of [depth1, depth12]) {
      const report = scored(shallow);
      expect(witanVerdictForScore(report.overallScore)).toBe('conditional');
      expect(report.verdict).toBe('at_risk');
      expect(report.verdictCap).toEqual({
        criterionId: 'A2',
        reason: 'shallow_history',
        uncappedVerdict: 'conditional',
        scoreWithAbstentionAsZero: compositeWithA2AsZero(report),
      });
    }
  });

  it('the clean data-layer repository now sits a band below its full clone: the stated cost of option C', () => {
    const { full, depth1 } = dataLayer.get('clean')!;
    expect(full.verdict).toBe('conditional');
    expect(depth1.verdict).toBe('at_risk');
    expect(scored(depth1).verdictCap?.uncappedVerdict).toBe('conditional');
  });

  it('every shallow v27 scan whose A2 abstained for the clone\'s depth: the composite is F1\'s, the verdict is the lower of the two bands, and verdictCap is present exactly when it lowered the band', () => {
    const subject = scans.filter((scan) => scan.rubric === V27 && scan.shallow && a2ShallowAbstention(scan.report));
    expect(subject.length).toBeGreaterThan(40);
    for (const scan of subject) {
      const report = scored(scan.report);
      expect(report.codeTrustScore, scan.label).toBe(compositeWithoutUnscored(report, 'code_trust'));
      const uncapped = witanVerdictForScore(report.overallScore);
      const capped = witanVerdictForScore(compositeWithA2AsZero(report));
      const expected = BAND_RANK[capped] < BAND_RANK[uncapped] ? capped : uncapped;
      expect(report.verdict, scan.label).toBe(expected);
      expect(BAND_RANK[report.verdict], scan.label).toBeLessThanOrEqual(BAND_RANK[uncapped]);
      if (expected === uncapped) {
        expect(report.verdictCap, scan.label).toBeUndefined();
      } else {
        expect(report.verdictCap, scan.label).toEqual({
          criterionId: 'A2',
          reason: 'shallow_history',
          uncappedVerdict: uncapped,
          scoreWithAbstentionAsZero: compositeWithA2AsZero(report),
        });
      }
    }
    expect(subject.some((scan) => scored(scan.report).verdictCap !== undefined)).toBe(true);
  });

  it('full clones, every v17 scan, and v27 scans whose A2 did not abstain for the depth carry no cap', () => {
    for (const scan of scans.filter((entry) => entry.rubric === V17 || !entry.shallow || !a2ShallowAbstention(entry.report))) {
      const report = scored(scan.report);
      expect(report.verdictCap, `${scan.rubric} ${scan.label}`).toBeUndefined();
      expect(report.verdict, `${scan.rubric} ${scan.label}`).toBe(witanVerdictForScore(report.overallScore));
    }
  });

  it('the certificate says so in one sentence beside the verdict, naming A2 and the shallow clone and pointing to a full clone', () => {
    const report = dataLayer.get('secret-deleted')!.depth1;
    const sentence =
      'Verdict capped at At risk (Conditional from the overall score alone): A2 could not read the commit history of this shallow clone and is left out of the overall score, which counting A2 as 0 would be ' +
      `${scored(report).verdictCap?.scoreWithAbstentionAsZero.toFixed(1)}; re-scan a full clone (for actions/checkout, set fetch-depth: 0).`;
    const terminal = renderTerminalCertificate(buildWitanCliSummary(report), report);
    expect(terminal).toContain(`Overall: ${scored(report).overallScore.toFixed(1)}/4.0 (At risk)\n  ${sentence}\n`);
    expect(renderWitanMarkdownReport(report)).toContain(`- Overall: ${scored(report).overallScore.toFixed(1)}/4.0\n- ${sentence}\n`);
    const html = renderWitanHtmlReport(report);
    expect(html).toContain('<div class="verdict">At risk</div>');
    expect(html).toContain(sentence);
    // The band explanation would say the verdict comes from the overall score's band; it does not here.
    expect(terminal).not.toMatch(/verdict comes from the overall score/);
  });
});
