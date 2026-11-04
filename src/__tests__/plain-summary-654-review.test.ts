import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildPlainSummary, type PlainSummary } from '../plain-summary.js';
import { scoreRepoWithPublicCejel } from '../witan/public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../witan/rubric-version.js';
import { type WitanReport, WitanReportSchema } from '../witan/schemas.js';
import {
  buildDisclosureGapFixture,
  disclosureGapFixture,
  removeDisclosureGapFixtures,
} from '../witan/__tests__/fixtures/disclosure-gap-fixtures.js';
import {
  buildFalseAssuranceFixture,
  falseAssuranceFixture,
} from '../witan/__tests__/fixtures/false-assurance-fixtures.js';

// The #654 review (at 284170e24). Each describe block below is one finding, built from the fixture
// the review named or from a hand-built report where the review used one. Every block failed at
// 284170e24 merged with origin/main 733a464d3, before its fix.

const GENERATED_AT = '2026-11-03T00:00:00.000Z';

function score(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'plain-summary-654',
    productDisplayName: 'Plain summary review fixture',
    generatedAt: GENERATED_AT,
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function variant(report: WitanReport, edit: (draft: WitanReport) => void): WitanReport {
  const draft = structuredClone(report);
  edit(draft);
  return WitanReportSchema.parse(draft);
}

const reports = new Map<string, WitanReport>();
function fixtureReport(key: string): WitanReport {
  const found = reports.get(key);
  if (!found) throw new Error(`no report for ${key}`);
  return found;
}

beforeAll(() => {
  const lfs = buildDisclosureGapFixture(disclosureGapFixture('b2b3-workflow-lfs-pointer'));
  reports.set('v27/dg/b2b3-workflow-lfs-pointer', score(lfs, WITAN_RUBRIC_VERSION_V27));
  const unreadable = buildDisclosureGapFixture(disclosureGapFixture('b2b3-workflow-unreadable'));
  reports.set('v17/dg/b2b3-workflow-unreadable', score(unreadable, WITAN_RUBRIC_VERSION_V17));
  const a1Lfs = buildFalseAssuranceFixture(falseAssuranceFixture('a1-js-suite-as-lfs-pointers'));
  reports.set('v27/fa/a1-js-suite-as-lfs-pointers', score(a1Lfs, WITAN_RUBRIC_VERSION_V27));
  const shallowSecret = buildFalseAssuranceFixture(falseAssuranceFixture('history-shallow-clone-with-committed-secret'));
  reports.set('v27/fa/history-shallow-clone-with-committed-secret', score(shallowSecret, WITAN_RUBRIC_VERSION_V27));
  const tooLarge = buildFalseAssuranceFixture(falseAssuranceFixture('a4-uv-locked-lockfile-too-large'));
  reports.set('v17/fa/a4-uv-locked-lockfile-too-large', score(tooLarge, WITAN_RUBRIC_VERSION_V17));
}, 300_000);

afterAll(() => removeDisclosureGapFixtures());

const LFS_PULL_LINE = 'Run git lfs pull so the real file contents are present, then scan again.';
/** The engine's wholesale abstention note for a criterion whose files were declined (repo-signals.ts). */
const DECLINED_NOTE =
  'Cejel abstained on this criterion because relevant repository content was declined under the repository content size limit or excluded from scanning by policy. This is a disclosed coverage limit, not a read failure, and does not affect the composite score.';
const DECLINED_LIMITATION =
  '6 criteria abstained because relevant repository content was declined under the repository content size limit or excluded from scanning by policy — a disclosed coverage limit, not a read failure. This does not affect the composite score.';
const LARGE_FILE_LIMITATION =
  '1 signal declined a large implementation file that exceeded the repository content size limit, while other signals in the same criterion were unaffected: A1.coverage_percent. That file is undercounted, not scored as clean or absent — this is a disclosed coverage limit, not a read failure.';

function areaItem(plain: PlainSummary, id: string) {
  return plain.notKnown.find(
    (entry) => entry.id === `not-known/criterion/${id}` || entry.id === `not-known/not-read/${id}`,
  );
}

function checkFor(plain: PlainSummary, itemId: string | undefined) {
  return plain.checkNext.find((entry) => entry.for === itemId);
}

/** v17/dg/b2b3-workflow-unreadable with its one unreadable file turned into a file over the size limit. */
function declinedReport(): WitanReport {
  return variant(fixtureReport('v17/dg/b2b3-workflow-unreadable'), (draft) => {
    if (draft.contentReadSummary) {
      draft.contentReadSummary.byReason.unreadable = 0;
      draft.contentReadSummary.byReason.tooLarge = 1;
      draft.contentReadSummary.unreadableByErrno = {};
    }
    for (const criterion of draft.criteria) {
      if (draft.contentReadSummary?.affectedCriteria.includes(criterion.id)) criterion.notes = DECLINED_NOTE;
    }
    draft.scanLimitations = [DECLINED_LIMITATION];
  });
}

describe('should-fix 2: an area not read follows its own cause in What to check next', () => {
  it('v27/dg/b2b3-workflow-lfs-pointer: each area not read because of a Git LFS pointer gets the git lfs pull line', () => {
    const report = fixtureReport('v27/dg/b2b3-workflow-lfs-pointer');
    const affected = report.contentReadSummary?.affectedCriteria ?? [];
    expect(affected).toEqual(['A1', 'A2', 'A3', 'A4', 'B2', 'B3']);
    const plain = buildPlainSummary(report);
    for (const id of affected) {
      const item = areaItem(plain, id);
      expect(item?.text, id).toMatch(/^Not read: /);
      const check = checkFor(plain, item?.id);
      expect(check?.text, id).toBe(LFS_PULL_LINE);
      expect(check?.text, id).not.toMatch(/readable/i);
    }
    // The same line the page gives under Files not read.
    expect(plain.checkNext.find((entry) => entry.key === 'lfs-pointers')?.text).toBe(LFS_PULL_LINE);
  });

  it('an area whose files were over the size limit is not called unreadable, and is not told to make them readable', () => {
    const plain = buildPlainSummary(declinedReport());
    for (const id of ['A1', 'A2', 'A3', 'A4', 'B2', 'B3']) {
      const item = areaItem(plain, id);
      expect(item?.text, id).toMatch(/^Not read: /);
      expect(item?.text, id).not.toContain('could not be read');
      expect(item?.text, id).toContain("size limit");
      const check = checkFor(plain, item?.id);
      expect(check?.text, id).not.toMatch(/readable/i);
      expect(check?.text, id).not.toMatch(/^Make /);
    }
  });

  it('an area named by a size-limit signal limitation is not told to make files readable', () => {
    const report = variant(fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large'), (draft) => {
      draft.scanLimitations = [LARGE_FILE_LIMITATION];
    });
    const plain = buildPlainSummary(report);
    const item = areaItem(plain, 'A1');
    expect(item?.text).toMatch(/^Partly not read: /);
    expect(item?.text).toContain('size limit');
    expect(item?.text).not.toContain('could not be read');
    const check = checkFor(plain, item?.id);
    expect(check?.text).not.toMatch(/readable/i);
  });

  it('an area that really could not be read is still told to make the files readable', () => {
    const plain = buildPlainSummary(fixtureReport('v17/dg/b2b3-workflow-unreadable'));
    const item = areaItem(plain, 'B3');
    expect(item?.text).toBe('Not read: Cejel gave this area no score because some files this area reads could not be read.');
    expect(checkFor(plain, item?.id)?.text).toMatch(/readable/);
  });
});

describe('should-fix 3: the not-read sentence lists only the causes the report ties to that area', () => {
  it('v27/fa/a1-js-suite-as-lfs-pointers: Tests names Git LFS pointers, not file types Cejel does not read', () => {
    const report = fixtureReport('v27/fa/a1-js-suite-as-lfs-pointers');
    // The report-wide counts hold both causes; only one of them is A1's.
    expect(report.contentReadSummary?.byReason.excludedByExtension).toBeGreaterThan(0);
    expect(report.contentReadSummary?.byReason.lfsPointer).toBeGreaterThan(0);
    const item = areaItem(buildPlainSummary(report), 'A1');
    expect(item?.text).toMatch(/^Not read: /);
    expect(item?.text).toContain('Git LFS pointers');
    expect(item?.text).not.toContain('of a type Cejel does not read');
  });

  it('a report-wide denied path or size-limit count is not listed for an area the engine says could not be read', () => {
    const report = variant(fixtureReport('v17/dg/b2b3-workflow-unreadable'), (draft) => {
      if (draft.contentReadSummary) {
        draft.contentReadSummary.byReason.deniedPath = 2;
        draft.contentReadSummary.byReason.tooLarge = 1;
        draft.contentReadSummary.skipped = 4;
      }
    });
    const item = areaItem(buildPlainSummary(report), 'B3');
    expect(item?.text).not.toContain('denied path');
    expect(item?.text).not.toContain('size limit');
    expect(item?.text).not.toContain('over the size');
  });
});

describe('should-fix 4: the scan-limitation line follows the limitation\'s own cause', () => {
  const limitationCheck = (report: WitanReport, index = 0) =>
    buildPlainSummary(report).checkNext.find((entry) => entry.for === `not-known/scan-limitation/${index}`);

  it('v27/dg/b2b3-workflow-lfs-pointer: a limitation caused by Git LFS pointers gets the git lfs pull line', () => {
    const report = fixtureReport('v27/dg/b2b3-workflow-lfs-pointer');
    expect(report.scanLimitations?.length).toBe(1);
    const check = limitationCheck(report);
    expect(check?.text).toBe(LFS_PULL_LINE);
  });

  it('the size-limit limitations, whose own text says they are not read failures, are never told to make files readable', () => {
    for (const report of [
      declinedReport(),
      variant(fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large'), (draft) => {
        draft.scanLimitations = [LARGE_FILE_LIMITATION];
      }),
    ]) {
      const check = limitationCheck(report);
      expect(check?.text).not.toMatch(/readable/i);
      expect(check?.text).not.toMatch(/^Fix /);
    }
  });

  it('a limitation caused by unreadable files still says to make them readable', () => {
    expect(limitationCheck(fixtureReport('v17/dg/b2b3-workflow-unreadable'))?.text).toMatch(/readable/);
  });

  it('a limitation no table entry knows gets no example that may point the wrong way', () => {
    const report = variant(fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large'), (draft) => {
      draft.scanLimitations = ['The history scan stopped at its output limit.'];
    });
    expect(limitationCheck(report)?.text).not.toContain('making the files readable');
  });
});

describe('should-fix 5: a Wrong area with no finding of its own is worded from its score, never "scored low"', () => {
  it('a hand-built abstained report where imported evidence moves B3 to Warning', () => {
    const base = fixtureReport('v27/fa/history-shallow-clone-with-committed-secret');
    expect(base.verdict).toBe('insufficient_source');
    const report = variant(base, (draft) => {
      const b3 = draft.criteria.find((criterion) => criterion.id === 'B3');
      if (b3) {
        b3.nativeStatus = b3.status;
        b3.nativeScore = b3.score;
        b3.status = 'warning';
        b3.score = 2.2;
        b3.findings = [];
      }
    });
    const plain = buildPlainSummary(report);
    const b3 = plain.wrong.find((item) => item.id === 'wrong/criterion/B3');
    expect(b3?.text).toBe('Scored 2.2 out of 4, with no single finding of its own.');
    expect(plain.wrongNote).toBeDefined();
    for (const text of [...plain.wrong.map((item) => item.text), plain.wrongNote ?? '']) {
      expect(text).not.toMatch(/scored low/i);
    }
  });
});

describe('nits', () => {
  const listedStatuses = (report: WitanReport) =>
    report.criteria.filter(
      (criterion) =>
        (criterion.status === 'verified' || criterion.status === 'info') &&
        (criterion.metrics.length > 0 || criterion.evidence.length > 0),
    );

  it('the empty-Holds sentence counts the areas it names: one area Verified is not "some areas"', () => {
    const base = fixtureReport('v27/fa/history-shallow-clone-with-committed-secret');
    const [keep, second] = listedStatuses(base);
    expect(keep).toBeDefined();
    expect(second).toBeDefined();
    const one = variant(base, (draft) => {
      for (const criterion of draft.criteria) {
        if ((criterion.status === 'verified' || criterion.status === 'info') && criterion.id !== keep?.id) {
          criterion.status = 'warning';
        }
        if (criterion.id === keep?.id) criterion.status = 'verified';
      }
    });
    expect(buildPlainSummary(one).holdsNote).toBe(
      "Nothing is listed here because Cejel gave no overall result for this scan, although it rated one area Verified; each area's own reading is in the certificate below.",
    );
    const two = variant(one, (draft) => {
      const other = draft.criteria.find((criterion) => criterion.id === second?.id);
      if (other) other.status = 'info';
    });
    expect(buildPlainSummary(two).holdsNote).toBe(
      "Nothing is listed here because Cejel gave no overall result for this scan, although it rated 2 areas Verified or Info; each area's own reading is in the certificate below.",
    );
  });

  it('"1 area gave no score because files it reads", not "files they read"', () => {
    const plain = buildPlainSummary(fixtureReport('v27/fa/a1-js-suite-as-lfs-pointers'));
    const limitation = plain.notKnown.find((item) => item.source.kind === 'scan-limitation');
    expect(limitation?.text).toBe(
      '1 area gave no score because files it reads could not be read; the certificate below counts those files by cause and does not name them.',
    );
    const declined = buildPlainSummary(
      variant(declinedReport(), (draft) => {
        draft.scanLimitations = [DECLINED_LIMITATION.replace('6 criteria', '1 criterion')];
      }),
    ).notKnown.find((item) => item.source.kind === 'scan-limitation');
    expect(declined?.text).toMatch(/^1 area gave no score because files it reads were over/);
  });

  it('an Info area under What holds carries the "Partly holds" hedge', () => {
    const base = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    const [target] = listedStatuses(base);
    const report = variant(base, (draft) => {
      const criterion = draft.criteria.find((entry) => entry.id === target?.id);
      if (criterion) criterion.status = 'info';
    });
    const item = buildPlainSummary(report).holds.find((entry) => entry.id === `holds/criterion/${target?.id}`);
    expect(item?.text).toMatch(/^Partly holds: rated Info, one label below Verified, at \d\.\d out of 4/);
  });
});
