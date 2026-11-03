import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { runWitanFreeCli } from '../index.js';
import {
  DOES_NOT_COVER_TEXT,
  FIRST_PAGE_START,
  bannedWordsOnFirstPage,
  certificateWithoutFirstPage,
  extractFirstPage,
  firstPageReadableText,
  unresolvedFirstPageLinks,
} from './plain-first-page-helpers.js';
import { type PlainSummary, buildPlainSummary } from '../plain-summary.js';
import { buildWitanCliSummary } from '../summary.js';
import { renderTerminalCertificate } from '../terminal.js';
import { WITAN_B3_UNSHOWN_CHECK_PREFIX } from '../witan/abstention.js';
import { computeMeasuredCoverage } from '../witan/coverage.js';
import {
  WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON,
  WITAN_V27_SHALLOW_HISTORY_REASON,
} from '../witan/history-depth.js';
import { renderWitanHtmlReport } from '../witan/html.js';
import { NEXT_CHECK_FALLBACK_PREFIX, listNextCheckFallbackKeys } from '../witan/next-checks.js';
import { buildWitanInputFromRepo } from '../witan/repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../witan/rubric-version.js';
import { type WitanReport, WitanReportSchema } from '../witan/schemas.js';
import { createWitanReport } from '../witan/scoring.js';

// goal_cejel_four_question_summary_2026-11-02: a first-time reader could not tell what the result
// meant. buildPlainSummary reduces report.json to four lists (what holds, what is wrong, what is not
// known, what to check next); the certificate, the terminal and summary.json show them first.

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-plain-summary-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  execFileSync('git', ['commit', '--quiet', '-m', 'Merge pull request #1 from fixture/init'], { cwd: repo });
  return repo;
}

const FILES: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({
    name: 'plain-summary-fixture',
    dependencies: { accepts: '^2.0.0' },
    devDependencies: { vitest: '2.1.9', typescript: '5.9.3' },
    scripts: { test: 'vitest run', typecheck: 'tsc --noEmit', build: 'tsc' },
  })}\n`,
  'package-lock.json': '{"name":"plain-summary-fixture","lockfileVersion":3,"packages":{}}\n',
  'README.md': '# Plain summary fixture\n\nThis service schedules things and reports on them.\n',
  'src/app.ts': 'export function app(): number { return 1; }\n',
  'src/router.ts': 'export function route(path: string): string { return path; }\n',
  'test/app.test.ts':
    "import { expect, it } from 'vitest';\nimport { app } from '../src/app';\nit('returns one', () => { expect(app()).toBe(1); });\n",
  '.github/workflows/ci.yml':
    'name: ci\non:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test\n',
};

let repoPath: string;
let base: WitanReport;

function scan(rubricVersion: string = WITAN_RUBRIC_VERSION_V17): WitanReport {
  return createWitanReport(
    buildWitanInputFromRepo({
      productSlug: 'plain-summary-fixture',
      productDisplayName: 'Plain summary fixture',
      repoPath,
      generatedAt: '2026-11-02T00:00:00.000Z',
      rubricVersion,
    }),
  );
}

/** A copy of `report` with `edit` applied, re-validated so every case is a report Cejel accepts. */
function variant(report: WitanReport, edit: (draft: WitanReport) => void): WitanReport {
  const draft = structuredClone(report);
  edit(draft);
  return WitanReportSchema.parse(draft);
}

function abstained(report: WitanReport, reason: string, rubricVersion = report.rubricVersion): WitanReport {
  return variant(report, (draft) => {
    const loose = draft as unknown as Record<string, unknown>;
    loose.verdict = 'insufficient_source';
    loose.overallScore = null;
    loose.codeTrustScore = null;
    loose.processTrustScore = null;
    loose.insufficientSourceReason = reason;
    loose.rubricVersion = rubricVersion;
    delete loose.verdictCap;
    delete loose.categoryScores;
  });
}

const criterionIds = (items: PlainSummary['holds']): string[] =>
  items.flatMap((item) => ('criterionId' in item.source ? [item.source.criterionId] : []));

beforeAll(() => {
  repoPath = makeRepo(FILES);
  base = scan();
}, 120_000);

describe('buildPlainSummary — what holds is only what was examined and passed', () => {
  it('a criterion that was not examined lands in Not known, never in Holds', () => {
    const scored = base.criteria.find((criterion) => criterion.status === 'verified');
    expect(scored, 'the fixture must have a verified criterion to strip').toBeDefined();
    const id = scored?.id ?? '';
    expect(criterionIds(buildPlainSummary(base).holds)).toContain(id);

    const cases: Array<[string, (criterion: WitanReport['criteria'][number]) => void]> = [
      ['not applicable', (criterion) => { criterion.status = 'not_applicable'; criterion.score = 0; }],
      ['insufficient data', (criterion) => { criterion.status = 'insufficient_data'; criterion.score = 0; }],
      ['unverified', (criterion) => { criterion.status = 'unverified'; criterion.score = 0; }],
      [
        'verified with no measurement and no evidence',
        (criterion) => { criterion.metrics = []; criterion.evidence = []; criterion.findings = []; },
      ],
    ];
    for (const [name, edit] of cases) {
      const report = variant(base, (draft) => {
        const criterion = draft.criteria.find((entry) => entry.id === id);
        if (criterion) edit(criterion);
      });
      const plain = buildPlainSummary(report);
      expect(criterionIds(plain.holds), name).not.toContain(id);
      expect(criterionIds(plain.notKnown), name).toContain(id);
    }
  });

  it('a scan that gave no overall result lists nothing as holding, and says why', () => {
    const plain = buildPlainSummary(abstained(base, 'Repository contains only documentation files.'));
    expect(plain.holds).toEqual([]);
    expect(plain.holdsNote).toMatch(/no overall result/i);
  });
});

describe('buildPlainSummary — what is not known carries everything the report could not establish', () => {
  it('every disclosure, scan limitation and history limitation appears in Not known', () => {
    const [first, second] = base.criteria;
    const report = variant(base, (draft) => {
      const [a, b] = draft.criteria;
      if (a) a.disclosures = [`${WITAN_B3_UNSHOWN_CHECK_PREFIX}.github/workflows/echo.yml.`, 'A sentence of a kind no table knows.'];
      if (b) b.disclosures = ['Another unrecognised disclosure.'];
      draft.scanLimitations = ['Git history was read with reduced evidence.', 'A second limitation.'];
      draft.historyLimitations = ['This scan read a shallow clone.'];
    });
    const plain = buildPlainSummary(report);
    const sources = plain.notKnown.map((item) => item.source);
    expect(sources).toContainEqual(expect.objectContaining({ kind: 'disclosure', criterionId: first?.id, disclosureIndex: 0 }));
    expect(sources).toContainEqual(expect.objectContaining({ kind: 'disclosure', criterionId: first?.id, disclosureIndex: 1 }));
    expect(sources).toContainEqual(expect.objectContaining({ kind: 'disclosure', criterionId: second?.id, disclosureIndex: 0 }));
    expect(sources).toContainEqual({ kind: 'scan-limitation', limitationIndex: 0 });
    expect(sources).toContainEqual({ kind: 'scan-limitation', limitationIndex: 1 });
    expect(sources).toContainEqual({ kind: 'history-limitation', limitationIndex: 0 });
  });

  it('abstention labels, including the v27 "Unrated" labels, and the reason appear in Not known', () => {
    const v27 = scan(WITAN_RUBRIC_VERSION_V27);
    const cases: Array<[WitanReport, string]> = [
      [abstained(base, 'Repository contains only documentation files.'), 'Insufficient source'],
      [abstained(v27, WITAN_V27_SHALLOW_HISTORY_REASON), 'Unrated: shallow clone'],
      [abstained(v27, WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON), 'Unrated: history depth unknown'],
    ];
    for (const [report, label] of cases) {
      const plain = buildPlainSummary(report);
      const verdictItems = plain.notKnown.filter((item) => item.source.kind === 'verdict');
      expect(verdictItems, label).toHaveLength(1);
      expect(verdictItems[0]?.text, label).toContain(label);
      expect(plain.verdictLine, label).toContain(label);
    }
    const docsOnly = buildPlainSummary(abstained(base, 'Repository contains only documentation files.'));
    expect(docsOnly.notKnown.find((item) => item.source.kind === 'verdict')?.text).toContain(
      'Repository contains only documentation files.',
    );
  });
});

describe('buildPlainSummary — what is wrong', () => {
  it('lists critical findings before warnings, and an unrecognised finding kind as itself', () => {
    const [first, second] = base.criteria;
    const report = variant(base, (draft) => {
      const [a, b] = draft.criteria;
      a?.findings.push({
        severity: 'warning',
        summary: 'A brand-new kind of problem was seen in the scheduler.',
        evidence: { kind: 'repository', label: 'scheduler', path: 'src/router.ts', line: 1 },
      });
      b?.findings.push({
        severity: 'critical',
        summary: 'A committed credential was found in the configuration.',
        evidence: { kind: 'secret_scan', label: 'credential', path: 'config/settings.json' },
      });
    });
    const plain = buildPlainSummary(report);
    const levels = plain.wrong.map((item) => item.level);
    expect(levels.indexOf('warning')).toBeGreaterThan(levels.lastIndexOf('critical'));
    const unknown = plain.wrong.find((item) => item.text.includes('A brand-new kind of problem was seen in the scheduler.'));
    expect(unknown, 'an unrecognised finding kind must be listed as itself, not dropped').toBeDefined();
    expect(unknown?.location).toBe('src/router.ts:1');
    expect(unknown?.source).toEqual({ kind: 'finding', criterionId: first?.id, findingIndex: (first?.findings.length ?? 0) });
    expect(plain.wrong[0]?.source).toMatchObject({ kind: 'finding', criterionId: second?.id });
  });
});

describe('buildPlainSummary — what to check next', () => {
  it('every Wrong and Not known item has exactly one Check next line, from the table or the fallback', () => {
    const report = variant(base, (draft) => {
      const [a] = draft.criteria;
      if (a) a.disclosures = ['A sentence of a kind no table knows.'];
      draft.scanLimitations = ['A limitation.'];
    });
    for (const candidate of [base, report, abstained(base, 'Repository contains only documentation files.')]) {
      const plain = buildPlainSummary(candidate);
      const ids = [...plain.wrong, ...plain.notKnown].map((item) => item.id);
      expect(plain.checkNext.map((check) => check.for)).toEqual(ids);
      for (const check of plain.checkNext) {
        expect(check.text.length).toBeGreaterThan(0);
        if (!check.fromTable) expect(check.text.startsWith(NEXT_CHECK_FALLBACK_PREFIX), check.key).toBe(true);
      }
    }
    const unknownDisclosure = buildPlainSummary(report).checkNext.find((check) => check.key === 'disclosure:other');
    expect(unknownDisclosure?.fromTable).toBe(false);
  });

  it('reports the table keys that fall back to "see the certificate"', () => {
    // The hand-back lists these. A key added to the table leaves this list; a new kind with no
    // entry joins it. Either way the change is visible here.
    expect(listNextCheckFallbackKeys()).toEqual([
      'disclosure:other',
      'finding:audit-completeness',
      'finding:calibration',
      'finding:claim-reality',
      'finding:data-confidence',
      'finding:execution-integrity',
      'finding:promotion-governance',
      'finding:real-outcome-evidence',
      'finding:risk-governance',
      'finding:validation-integrity',
      'unrecognised-status',
    ]);
  });
});

describe('the first page of certificate.html', () => {
  const html = (report: WitanReport) =>
    renderWitanHtmlReport(report, { cliVersion: '0.0.0', generatedAt: '2026-11-02T00:00:00.000Z' });
  const rich = () =>
    variant(base, (draft) => {
      const [a, b, c] = draft.criteria;
      if (a) a.disclosures = [`${WITAN_B3_UNSHOWN_CHECK_PREFIX}.github/workflows/echo.yml.`, 'A2 rubric band dimension text no table knows.'];
      b?.findings.push({
        severity: 'critical',
        summary: 'B3 composite digest finding text with engine words in it.',
        evidence: { kind: 'repository', label: 'rubric.ts', path: 'src/rubric.ts', line: 3 },
      });
      c?.findings.push({
        severity: 'warning',
        summary: 'A plain finding about the router.',
        evidence: { kind: 'repository', label: 'router', path: 'src/router.ts' },
      });
      draft.scanLimitations = ['The A1 attestation pin could not be read.'];
      draft.historyLimitations = ['This scan read a shallow clone; A2 and B2 read truncated history.'];
    });

  it('sits above everything that was there before, and links every item to its source below', () => {
    for (const report of [base, rich(), abstained(base, 'Repository contains only documentation files.')]) {
      const page = html(report);
      expect(page.indexOf(FIRST_PAGE_START)).toBeLessThan(page.indexOf('<header class="hero">'));
      expect(page.indexOf(FIRST_PAGE_START)).toBeGreaterThan(page.indexOf('<main class="certificate">'));
      expect(unresolvedFirstPageLinks(page)).toEqual([]);
      const plain = buildPlainSummary(report);
      const links = [...extractFirstPage(page).matchAll(/href="#([^"]+)"/g)].length;
      expect(links).toBeGreaterThanOrEqual(plain.holds.length + plain.wrong.length + plain.notKnown.length);
    }
  });

  it('uses none of the banned words, even when the report text does, and states what it does not cover', () => {
    const v27 = scan(WITAN_RUBRIC_VERSION_V27);
    for (const report of [
      base,
      rich(),
      v27,
      abstained(v27, WITAN_V27_SHALLOW_HISTORY_REASON),
      abstained(v27, WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON),
      abstained(base, 'Repository contains only documentation files.'),
    ]) {
      const page = html(report);
      expect(bannedWordsOnFirstPage(page), report.rubricVersion).toEqual([]);
      expect(firstPageReadableText(extractFirstPage(page))).toContain(DOES_NOT_COVER_TEXT);
    }
  });

  it("counts on the first page match the certificate's counts for the same population, or name the difference", () => {
    for (const report of [base, rich()]) {
      const page = html(report);
      const first = extractFirstPage(page);
      const findingsSection = page.slice(
        page.indexOf('<section class="findings-first-summary"'),
        page.indexOf('</section>', page.indexOf('<section class="findings-first-summary"')),
      );
      const certificateCount = (findingsSection.match(/<li[ >]/g) ?? []).length;
      const wrongHeading = /What is wrong <span class="plain-count">\((\d+)\)<\/span>/.exec(first);
      expect(Number(wrongHeading?.[1])).toBe(buildPlainSummary(report).wrong.length);
      expect(Number(wrongHeading?.[1])).toBe(certificateCount);

      const coverage = computeMeasuredCoverage(report);
      expect(firstPageReadableText(first)).toContain(
        `Cejel measured ${coverage.overall.measured} of the ${coverage.overall.total} areas it looks at`,
      );
    }

    // A criterion scored in a low range with no critical or warning finding of its own is listed as
    // wrong, so the first page names how its count differs from the certificate's findings list.
    const lowWithoutFinding = variant(base, (draft) => {
      const target = draft.criteria.find((criterion) => criterion.status === 'verified');
      if (target) { target.status = 'warning'; target.findings = target.findings.filter((f) => f.severity === 'info'); }
    });
    const first = firstPageReadableText(extractFirstPage(html(lowWithoutFinding)));
    const plain = buildPlainSummary(lowWithoutFinding);
    const findingItems = plain.wrong.filter((item) => item.source.kind === 'finding').length;
    expect(plain.wrong.length).toBeGreaterThan(findingItems);
    expect(first).toContain(
      `${findingItems} of these ${findingItems === 1 ? 'is a finding' : 'are findings'} listed under Critical and warning findings below`,
    );
  });

  it('leaves the existing certificate content unchanged below it, apart from the anchor ids it links to', () => {
    const page = html(base);
    const without = certificateWithoutFirstPage(page);
    expect(without).not.toContain('cejel:first-page');
    expect(without).not.toContain('cejel-src-');
    expect(without.indexOf('<main class="certificate">\n    <header class="hero">')).toBeGreaterThan(-1);
  });
});

describe('determinism and counts', () => {
  it('the same report gives byte-identical certificate.html, terminal text and plain summary', () => {
    const render = () => ({
      html: renderWitanHtmlReport(base, { cliVersion: '0.0.0', generatedAt: '2026-11-02T00:00:00.000Z' }),
      terminal: renderTerminalCertificate(buildWitanCliSummary(base), base),
      plain: JSON.stringify(buildPlainSummary(base), null, 2),
    });
    expect(render()).toEqual(render());
  });

  it("the measured-areas count is the certificate's own count", () => {
    const plain = buildPlainSummary(base);
    const coverage = computeMeasuredCoverage(base);
    expect(plain.areas).toEqual({
      measured: coverage.overall.measured,
      total: coverage.overall.total,
      notApplicable: base.criteria.filter((criterion) => criterion.status === 'not_applicable').length,
    });
  });
});

describe('terminal and summary.json', () => {
  it('prints the four headings after the verdict, at most three items each, and points to certificate.html', () => {
    const terminal = renderTerminalCertificate(buildWitanCliSummary(base), base);
    const verdictAt = terminal.indexOf('Overall: ');
    const headings = ['What holds', 'What is wrong', 'What is not known', 'What to check next'].map((heading) =>
      terminal.indexOf(`\n${heading} (`),
    );
    for (const index of headings) expect(index).toBeGreaterThan(verdictAt);
    expect([...headings].sort((a, b) => a - b)).toEqual(headings);
    const block = terminal.slice(headings[0], terminal.indexOf('\n\n', headings[3]));
    for (const section of block.split(/\n(?=What )/)) {
      expect(section.split('\n').filter((line) => line.startsWith('  - ')).length).toBeLessThanOrEqual(3);
    }
    expect(terminal).toContain('certificate.html');
  });

  it('summary.json carries the four lists under plainSummary, equal to buildPlainSummary(report.json)', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'cejel-plain-summary-out-'));
    expect(await runWitanFreeCli([repoPath, '--out', outDir, '--quiet'])).toBe(0);
    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8')) as Record<string, unknown>;
    const report = WitanReportSchema.parse(JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')));
    expect(summary.plainSummary).toEqual(JSON.parse(JSON.stringify(buildPlainSummary(report))));
    const { plainSummary: _plain, ...rest } = summary;
    expect(rest).toEqual(JSON.parse(JSON.stringify(buildWitanCliSummary(report))));
  });
});
