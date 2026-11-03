import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FIRST_PAGE_BANNED_WORDS,
  extractFirstPage,
  firstPageReadableText,
} from './plain-first-page-helpers.js';
import {
  PLAIN_INSUFFICIENT_SOURCE_FALLBACK,
  PLAIN_INSUFFICIENT_SOURCE_KINDS,
  type PlainSummary,
  buildPlainSummary,
  insufficientSourceKind,
  plainInsufficientSourceSentence,
} from '../plain-summary.js';
import { buildWitanCliSummary } from '../summary.js';
import { renderTerminalCertificate } from '../terminal.js';
import { WITAN_NO_MEASUREMENT_REASON } from '../witan/abstention.js';
import {
  WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON,
  WITAN_V27_SHALLOW_HISTORY_REASON,
} from '../witan/history-depth.js';
import { renderWitanHtmlReport } from '../witan/html.js';
import { scoreRepoWithPublicCejel } from '../witan/public-scan.js';
import { buildWitanInputFromRepo } from '../witan/repo-signals.js';
import { createWitanReport } from '../witan/scoring.js';
import {
  WITAN_RUBRIC_VERSION_V16,
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
} from '../witan/rubric-version.js';
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

// goal_cejel_four_question_summary_v2_2026-11-03. The review of #635 found five sentences on the
// plain first page that the report does not support. Each describe block below is one of them,
// built from a fixture the review named or from a reason the engine emits. Every block failed on
// prep/635-v2-base (cb31d35a7 with origin/main merged in), before the fix.

const GENERATED_AT = '2026-11-03T00:00:00.000Z';

function score(repoPath: string, rubricVersion: string): WitanReport {
  // v16 is not selectable on the command line; the engine still emits its reasons through the
  // same collector and scorer, which is the path taken here.
  if (rubricVersion === WITAN_RUBRIC_VERSION_V16) {
    return createWitanReport(
      buildWitanInputFromRepo({
        productSlug: 'plain-summary-v2',
        productDisplayName: 'Plain summary v2 fixture',
        repoPath,
        generatedAt: GENERATED_AT,
        rubricVersion,
      }),
    );
  }
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'plain-summary-v2',
    productDisplayName: 'Plain summary v2 fixture',
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

const html = (report: WitanReport): string =>
  renderWitanHtmlReport(report, { cliVersion: '0.0.0', generatedAt: GENERATED_AT });
const firstPageText = (report: WitanReport): string => firstPageReadableText(extractFirstPage(html(report)));
const terminal = (report: WitanReport): string => renderTerminalCertificate(buildWitanCliSummary(report), report);
const allPlainText = (plain: PlainSummary): string[] => [
  plain.verdictLine,
  ...(plain.prospectiveNotice !== undefined ? [plain.prospectiveNotice] : []),
  ...(plain.holdsNote !== undefined ? [plain.holdsNote] : []),
  ...[...plain.holds, ...plain.wrong, ...plain.notKnown].map((item) => item.text),
  ...plain.checkNext.map((check) => check.text),
];
const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

const reports = new Map<string, WitanReport>();
function fixtureReport(key: string): WitanReport {
  const found = reports.get(key);
  if (!found) throw new Error(`no report for ${key}`);
  return found;
}

beforeAll(() => {
  const unreadable = buildDisclosureGapFixture(disclosureGapFixture('b2b3-workflow-unreadable'));
  reports.set('v17/dg/b2b3-workflow-unreadable', score(unreadable, WITAN_RUBRIC_VERSION_V17));
  const tooLarge = buildFalseAssuranceFixture(falseAssuranceFixture('a4-uv-locked-lockfile-too-large'));
  reports.set('v17/fa/a4-uv-locked-lockfile-too-large', score(tooLarge, WITAN_RUBRIC_VERSION_V17));
  const shallowSecret = buildFalseAssuranceFixture(falseAssuranceFixture('history-shallow-clone-with-committed-secret'));
  reports.set('v27/fa/history-shallow-clone-with-committed-secret', score(shallowSecret, WITAN_RUBRIC_VERSION_V27));
  reports.set('v17/fa/history-shallow-clone-with-committed-secret', score(shallowSecret, WITAN_RUBRIC_VERSION_V17));
  const shallow = buildFalseAssuranceFixture(falseAssuranceFixture('history-shallow-clone'));
  reports.set('v17/fa/history-shallow-clone', score(shallow, WITAN_RUBRIC_VERSION_V17));
  reports.set('v27/fa/history-shallow-clone', score(shallow, WITAN_RUBRIC_VERSION_V27));
}, 300_000);

afterAll(() => removeDisclosureGapFixtures());

describe('blocker 1: an area that could not be read is "not read", never "found nothing to measure"', () => {
  it('dg/b2b3-workflow-unreadable under v17: each affected area says it was not read', () => {
    const report = fixtureReport('v17/dg/b2b3-workflow-unreadable');
    const affected = report.contentReadSummary?.affectedCriteria ?? [];
    expect(affected).toEqual(['A1', 'A2', 'A3', 'A4', 'B2', 'B3']);
    const plain = buildPlainSummary(report);
    for (const id of affected) {
      const item = plain.notKnown.find(
        (entry) => entry.source.kind === 'criterion' && entry.source.criterionId === id,
      );
      expect(item?.text, id).toMatch(/^Not read: /);
      expect(item?.text, id).toContain('could not be read');
    }
    for (const text of allPlainText(plain)) expect(text).not.toContain('found nothing here it could measure');
  });

  it("the scan limitation that explains the gap is reworded through the table, not replaced by a generic sentence", () => {
    const plain = buildPlainSummary(fixtureReport('v17/dg/b2b3-workflow-unreadable'));
    const limitation = plain.notKnown.find((item) => item.source.kind === 'scan-limitation');
    expect(limitation?.text).toBe(
      '6 areas gave no score because files they read could not be read; the certificate below counts those files by cause and does not name them.',
    );
  });

  it('an unknown limitation with engine words is reworded word by word, never replaced', () => {
    const base = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    const report = variant(base, (draft) => {
      draft.scanLimitations = ['The A3 composite could not use 2 criteria; the rubric band is unchanged.'];
    });
    const item = buildPlainSummary(report).notKnown.find((entry) => entry.source.kind === 'scan-limitation');
    expect(item?.text).toBe(
      'The "Production readiness" area overall score could not use 2 areas; the scoring rules range is unchanged.',
    );
  });
});

// ---- blocker 2 ------------------------------------------------------------------------------

function makeRepo(files: Readonly<Record<string, string | Buffer>>, options: { commit?: boolean } = {}): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-plain-v2-'));
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  execFileSync('git', ['add', '-A'], { cwd: repo });
  if (options.commit !== false) {
    execFileSync('git', ['commit', '--quiet', '--no-gpg-sign', '--allow-empty', '-m', 'initial'], { cwd: repo });
  }
  return repo;
}

const many = (count: number, path: (index: number) => string, contents: string): Record<string, string> =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [path(index), contents]));

const JS = 'export function value(input) {\n  return input + 1;\n}\n';

/**
 * Each kind the insufficient-source table knows, with a synthetic repository that makes the engine
 * emit it. The reason is read from the report the engine writes, never typed here, except where the
 * engine emits a fixed constant (the v27 history reasons and the bare no-measurement reason), which
 * is imported from the module that emits it.
 */
const REASON_REPOS: ReadonlyArray<{ kind: string; rubric: string; build: () => string }> = [
  { kind: 'empty', rubric: WITAN_RUBRIC_VERSION_V17, build: () => makeRepo({}) },
  {
    kind: 'ignored-target',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () => {
      const root = makeRepo({ '.gitignore': 'generated-site/\n', 'README.md': '# Root\n' });
      mkdirSync(join(root, 'generated-site'), { recursive: true });
      writeFileSync(join(root, 'generated-site', 'index.js'), JS);
      return join(root, 'generated-site');
    },
  },
  {
    kind: 'generated-only',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () => makeRepo({ ...many(10, (i) => `dist/chunk${i}.js`, JS), 'README.md': '# Built\n' }),
  },
  {
    kind: 'independent-catalog',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () => makeRepo({ ...many(14, (i) => `exercises/ex${i}/solution.js`, JS), 'README.md': '# Exercises\n' }),
  },
  // v17 scores these four kinds when its reviewable-source check passes and a check measured
  // something (isV17RescuableAbstention); the earlier rubrics still emit them, so they are built
  // under v16.
  {
    kind: 'docs-source-role',
    rubric: WITAN_RUBRIC_VERSION_V16,
    build: () =>
      makeRepo({
        'docs/guide.md': '# Guide\n',
        'docs/intro.md': '# Intro\n',
        'test/docs.test.js': "import { it } from 'vitest';\nit('builds', () => {});\n",
      }),
  },
  {
    kind: 'artifact-dominance',
    rubric: WITAN_RUBRIC_VERSION_V16,
    build: () => makeRepo({ 'scripts/build.js': JS, ...many(12, (i) => `images/picture${i}.png`, 'png') }),
  },
  {
    kind: 'binary-distribution',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () => makeRepo({ 'README.md': '# Tool\n', 'release/tool.jar': 'jar' }),
  },
  {
    kind: 'docs-distribution',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () => makeRepo({ 'README.md': '# Only docs\n', 'docs/more.md': '# More\n' }),
  },
  {
    kind: 'readable-representation',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () =>
      makeRepo({
        'src/app.js': JS,
        'src/packed.js': Buffer.from([0, 1, 2, 3, 0, 0, 255, 254, 0, 7, 0, 0, 0, 9, 0, 0]),
        'README.md': '# Mixed\n',
      }),
  },
  {
    kind: 'semantic-auxiliary-only',
    rubric: WITAN_RUBRIC_VERSION_V16,
    build: () => makeRepo({ ...many(3, (i) => `styles/theme${i}.scss`, '.a { color: red; }\n'), 'README.md': '# Styles\n' }),
  },
  {
    kind: 'semantic-auxiliary-dominant',
    rubric: WITAN_RUBRIC_VERSION_V16,
    build: () =>
      makeRepo({
        ...many(22, (i) => `locales/lang${i}.js`, 'export default { hello: "hi" };\n'),
        'src/app.js': JS,
        'README.md': '# Locales\n',
      }),
  },
  {
    kind: 'no-measurement-source-coverage',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () => makeRepo({ ...many(6, (i) => `cobol/prog${i}.cbl`, '       IDENTIFICATION DIVISION.\n'), 'README.md': '# Mainframe\n' }),
  },
  {
    kind: 'unrecognised-ecosystem',
    rubric: WITAN_RUBRIC_VERSION_V17,
    build: () => makeRepo({ ...many(6, (i) => `src/mod${i}.qzx`, 'module main\n  print 1\n'), 'README.md': '# Other language\n' }),
  },
];

describe('blocker 2: every insufficient-source reason the engine emits gets its own true sentence', () => {
  const emitted = new Map<string, string>();

  beforeAll(() => {
    for (const { kind, rubric, build } of REASON_REPOS) {
      const report = score(build(), rubric);
      emitted.set(
        report.verdict === 'insufficient_source' ? kind : `${kind} (scored ${report.verdict}, no reason)`,
        report.verdict === 'insufficient_source' ? report.insufficientSourceReason : '',
      );
    }
  }, 300_000);

  it('the table lists every producer of insufficientSourceReason in the engine', () => {
    // The producers, read from the source. A new producer changes a count here and must be given a
    // table entry (or be seen to fall back) before this passes.
    const repoSignals = readFileSync(new URL('../witan/repo-signals.ts', import.meta.url), 'utf8');
    expect(repoSignals.match(/^\s*insufficientSourceReason:\s*$|^\s*insufficientSourceReason: [`'"]/gm)?.length).toBe(11);
    expect(repoSignals.match(/excluded by this repository's Git ignore rules/g)?.length).toBe(1);
    const publicScan = readFileSync(new URL('../witan/public-scan.ts', import.meta.url), 'utf8');
    expect(publicScan.match(/insufficientSourceReason: /g)?.length).toBe(1);
    const scoring = readFileSync(new URL('../witan/scoring.ts', import.meta.url), 'utf8');
    expect(scoring.match(/WITAN_NO_MEASUREMENT_REASON/g)?.length).toBe(2);
    expect([...PLAIN_INSUFFICIENT_SOURCE_KINDS].sort()).toEqual(
      [
        'artifact-dominance',
        'binary-distribution',
        'docs-distribution',
        'docs-source-role',
        'empty',
        'generated-only',
        'history-depth-unknown',
        'ignored-target',
        'independent-catalog',
        'no-measurement',
        'no-measurement-source-coverage',
        'readable-representation',
        'semantic-auxiliary-dominant',
        'semantic-auxiliary-only',
        'shallow-history',
        'unrecognised-ecosystem',
      ].sort(),
    );
  });

  it('each reason the engine emitted maps to its kind, and the page shows that kind\'s sentence', () => {
    expect([...emitted.keys()].sort()).toEqual(REASON_REPOS.map(({ kind }) => kind).sort());
    const constants: Array<[string, string]> = [
      ['no-measurement', WITAN_NO_MEASUREMENT_REASON],
      ['shallow-history', WITAN_V27_SHALLOW_HISTORY_REASON],
      ['history-depth-unknown', WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON],
    ];
    const base = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    for (const [kind, reason] of [...emitted, ...constants]) {
      expect(insufficientSourceKind(reason), reason).toBe(kind);
      const sentence = plainInsufficientSourceSentence(reason);
      expect(sentence).not.toBe(PLAIN_INSUFFICIENT_SOURCE_FALLBACK);
      expect(FIRST_PAGE_BANNED_WORDS.filter((pattern) => pattern.test(sentence)), sentence).toEqual([]);
      const abstained = variant(base, (draft) => {
        const loose = draft as unknown as Record<string, unknown>;
        loose.verdict = 'insufficient_source';
        loose.overallScore = null;
        loose.codeTrustScore = null;
        loose.processTrustScore = null;
        loose.insufficientSourceReason = reason;
        if (kind === 'shallow-history' || kind === 'history-depth-unknown') loose.rubricVersion = WITAN_RUBRIC_VERSION_V27;
      });
      const verdictItem = buildPlainSummary(abstained).notKnown.find((item) => item.source.kind === 'verdict');
      expect(verdictItem?.text, kind).toContain(sentence);
      expect(verdictItem?.text, kind).not.toContain('Cejel found no source code here that it can rate');
    }
  });

  it('the read-coverage abstention says how much was read, from the reason itself', () => {
    const reason = emitted.get('readable-representation') ?? '';
    expect(reason).toContain('covers 1 of 2 authored source-shaped file(s)');
    expect(plainInsufficientSourceSentence(reason)).toContain('1 of 2');
  });

  it('a reason with no table entry is shown as the fixed fallback, pointing at the certificate', () => {
    expect(insufficientSourceKind('A caller-supplied reason no table knows.')).toBe('other');
    expect(plainInsufficientSourceSentence('A caller-supplied reason no table knows.')).toBe(
      PLAIN_INSUFFICIENT_SOURCE_FALLBACK,
    );
    expect(PLAIN_INSUFFICIENT_SOURCE_FALLBACK).toBe('Cejel could not rate the source here; see the certificate below.');
  });
});

describe('blocker 3: an empty What holds prints exactly one sentence, true for its case', () => {
  it('v27/fa/history-shallow-clone-with-committed-secret: no overall result, some areas verified', () => {
    const report = fixtureReport('v27/fa/history-shallow-clone-with-committed-secret');
    expect(report.verdict).toBe('insufficient_source');
    expect(report.criteria.some((criterion) => criterion.status === 'verified')).toBe(true);
    const plain = buildPlainSummary(report);
    expect(plain.holds).toEqual([]);
    expect(plain.holdsNote).toBe(
      'Nothing is listed here because Cejel gave no overall result for this scan, although it rated some areas Verified; each area\'s own reading is in the certificate below.',
    );
    for (const text of [firstPageText(report), terminal(report)]) {
      expect(text).not.toContain('Nothing Cejel measured scored well enough');
      expect(countOf(text, plain.holdsNote ?? '')).toBe(1);
    }
  });

  it('each combination of (overall result, any area verified) gets one sentence that is true for it', () => {
    const scored = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    const noneVerified = (report: WitanReport) =>
      variant(report, (draft) => {
        for (const criterion of draft.criteria) {
          if (criterion.status === 'verified' || criterion.status === 'info') criterion.status = 'warning';
        }
      });
    const abstain = (report: WitanReport) =>
      variant(report, (draft) => {
        const loose = draft as unknown as Record<string, unknown>;
        loose.verdict = 'insufficient_source';
        loose.overallScore = null;
        loose.codeTrustScore = null;
        loose.processTrustScore = null;
        loose.insufficientSourceReason = WITAN_NO_MEASUREMENT_REASON;
      });
    const scoredNone = buildPlainSummary(noneVerified(scored));
    expect(scoredNone.holds).toEqual([]);
    expect(scoredNone.holdsNote).toBe('Nothing is listed here because Cejel rated no measured area Verified or Info.');
    const abstainedNone = buildPlainSummary(abstain(noneVerified(scored)));
    expect(abstainedNone.holdsNote).toBe(
      'Nothing is listed here because Cejel gave no overall result for this scan, and it rated no measured area Verified or Info.',
    );
    expect(buildPlainSummary(scored).holdsNote).toBeUndefined();
    for (const report of [noneVerified(scored), abstain(noneVerified(scored))]) {
      const note = buildPlainSummary(report).holdsNote ?? '';
      expect(countOf(firstPageText(report), note)).toBe(1);
      expect(countOf(terminal(report), note)).toBe(1);
    }
  });
});

describe('blocker 4: a Holds item states its score and never says "top level" below the maximum', () => {
  it('fa/a4-uv-locked-lockfile-too-large under v17: B3 at 1.0 of 4 says so', () => {
    const report = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    const b3 = report.criteria.find((criterion) => criterion.id === 'B3');
    expect(b3?.status).toBe('verified');
    expect(b3?.score).toBe(1);
    const plain = buildPlainSummary(report);
    const item = plain.holds.find((entry) => entry.source.kind === 'criterion' && entry.source.criterionId === 'B3');
    expect(item?.text).toMatch(/^Rated Verified, at 1\.0 out of 4\./);
    for (const key of reports.keys()) {
      const holds = buildPlainSummary(fixtureReport(key)).holds;
      for (const entry of holds) {
        const criterion = fixtureReport(key).criteria.find(
          (candidate) => entry.source.kind === 'criterion' && candidate.id === entry.source.criterionId,
        );
        expect(entry.text, key).toContain(`at ${criterion?.score.toFixed(1)} out of 4`);
        expect(entry.text, key).not.toContain('top level');
        if (criterion?.score !== 4) expect(entry.text, key).not.toMatch(/\btop\b/);
      }
    }
  });

  it('only the maximum score is called the top score', () => {
    const report = fixtureReport('v17/fa/history-shallow-clone');
    const a2 = buildPlainSummary(report).holds.find(
      (entry) => entry.source.kind === 'criterion' && entry.source.criterionId === 'A2',
    );
    expect(a2?.text).toMatch(/^Rated Verified, at 4\.0 out of 4, the top score\./);
  });
});

describe("blocker 5: a prospective (v27) result carries the hero's uncalibrated notice on the first page", () => {
  it('the HTML, the terminal and plainSummary carry it above the verdict line under v27, and not under v17', () => {
    const v27 = fixtureReport('v27/fa/history-shallow-clone');
    const plain = buildPlainSummary(v27);
    expect(plain.prospectiveNotice).toBe(
      'Prospective, not calibrated: this result uses a trial version of the scoring rules that has not been calibrated, so its score, verdict and findings carry no precision or recall claim (no claim about how often they are right or what they miss) and cannot be compared with a result under the default rules.',
    );
    const page = firstPageText(v27);
    expect(page.indexOf(plain.prospectiveNotice ?? '')).toBeGreaterThan(-1);
    expect(page.indexOf(plain.prospectiveNotice ?? '')).toBeLessThan(page.indexOf(plain.verdictLine));
    const text = terminal(v27);
    const plainBlock = text.indexOf('In plain words');
    expect(text.indexOf(plain.prospectiveNotice ?? '', plainBlock)).toBeGreaterThan(plainBlock);
    expect(FIRST_PAGE_BANNED_WORDS.filter((pattern) => pattern.test(plain.prospectiveNotice ?? ''))).toEqual([]);

    const v17 = fixtureReport('v17/fa/history-shallow-clone');
    expect(buildPlainSummary(v17).prospectiveNotice).toBeUndefined();
    expect(firstPageText(v17)).not.toContain('Prospective, not calibrated');
  });
});

describe('should-fix items', () => {
  it('an area with a finding and no score is in Wrong for the finding, and Not known says only that the score was not given', () => {
    const base = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    const report = variant(base, (draft) => {
      const a1 = draft.criteria.find((criterion) => criterion.id === 'A1');
      if (a1) {
        a1.status = 'insufficient_data';
        a1.score = 0;
        a1.findings.push({
          severity: 'critical',
          summary: 'A test file asserts nothing.',
          evidence: { kind: 'repository', label: 'test', path: 'tests/test_lib.py', line: 1 },
        });
      }
    });
    const plain = buildPlainSummary(report);
    expect(plain.wrong.some((item) => item.source.kind === 'finding' && item.source.criterionId === 'A1')).toBe(true);
    const notKnown = plain.notKnown.find((item) => item.source.kind === 'criterion' && item.source.criterionId === 'A1');
    expect(notKnown?.text).toBe(
      "Score not given: Cejel gave this area no score; the problem it found is listed under What is wrong.",
    );
  });

  it('a shallow clone that leaves an area unread sends the reader to fetch the full history', () => {
    const base = fixtureReport('v17/fa/history-shallow-clone');
    const report = variant(base, (draft) => {
      const b2 = draft.criteria.find((criterion) => criterion.id === 'B2');
      if (b2) {
        b2.status = 'insufficient_data';
        b2.score = 0;
        b2.findings = [];
      }
    });
    const plain = buildPlainSummary(report);
    const item = plain.notKnown.find((entry) => entry.source.kind === 'criterion' && entry.source.criterionId === 'B2');
    expect(item?.text).toMatch(/^Not read: /);
    expect(item?.text).toContain('shallow clone');
    const check = plain.checkNext.find((entry) => entry.for === item?.id);
    expect(check?.key).toBe('not-read:history');
    expect(check?.text).toContain('git fetch --unshallow');
    expect(check?.text).not.toContain('readable');
  });

  it('the verdict reason is worded from the score, and "no single" is dropped where the area lists a finding', () => {
    const base = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    const report = variant(base, (draft) => {
      const b2 = draft.criteria.find((criterion) => criterion.id === 'B2');
      if (b2) {
        b2.score = 3.1;
        b2.findings = [
          {
            severity: 'warning',
            summary:
              'B2 metric-derived score is 3.1/4.0, in the warning band — no single finding drove this; it reflects the combined metric weighting below.',
            evidence: { kind: 'repository', label: 'B2', path: '.' },
          },
        ];
      }
      const a4 = draft.criteria.find((criterion) => criterion.id === 'A4');
      a4?.findings.push({
        severity: 'warning',
        summary: 'A dependency is declared with no version.',
        evidence: { kind: 'repository', label: 'pyproject', path: 'pyproject.toml', line: 3 },
      });
    });
    const plain = buildPlainSummary(report);
    const b2 = plain.wrong.find((item) => item.source.kind === 'finding' && item.source.criterionId === 'B2');
    expect(b2?.text).toMatch(/^Its measurements together give 3\.1 out of 4, which Cejel counts as a warning; no single finding of its own caused this\./);
    expect(b2?.text).not.toContain('scored low');
    const a4 = plain.wrong.filter((item) => item.source.kind === 'finding' && item.source.criterionId === 'A4');
    expect(a4.length).toBe(2);
    for (const item of a4) expect(item.text).not.toMatch(/no single/i);
  });

  it('a status moved by imported evidence is explained in one sentence', () => {
    const base = fixtureReport('v17/fa/a4-uv-locked-lockfile-too-large');
    const report = variant(base, (draft) => {
      const b3 = draft.criteria.find((criterion) => criterion.id === 'B3');
      if (b3) {
        b3.nativeStatus = 'verified';
        b3.nativeScore = 1;
        b3.status = 'warning';
      }
    });
    const plain = buildPlainSummary(report);
    const item = plain.notKnown.find((entry) => entry.id === 'not-known/imported-status/B3');
    expect(item?.text).toBe(
      "Imported evidence moved this area's label from Verified to Warning: findings from another tool, given to Cejel, set it, not Cejel's own reading.",
    );
  });
});
