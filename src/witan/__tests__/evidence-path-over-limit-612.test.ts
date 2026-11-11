import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { runWitanFreeCli } from '../../index.js';
import { buildPlainSummary } from '../../plain-summary.js';
import { WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE } from '../abstention.js';
import { renderWitanBadgeEndpoint } from '../badge.js';
import { buildRelyingPartySummary } from '../certificate-presentation.js';
import {
  OVER_LIMIT_ANCHOR,
  overLimitCitationDisclosure,
  overLimitCitationNote,
  overLimitWithheldPathsDisclosure,
  overLimitWithheldPathsNote,
  statesUnlistedWithheldPaths,
} from '../path-limits.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { type WitanReport, WitanReportSchema } from '../schemas.js';
import { createWitanReport } from '../scoring.js';

import { HERMETIC_GIT_ENV } from './fixtures/behaviour-corpus.js';

// #612: a repository path longer than the report schema's 700-character `path` limit, cited as
// evidence, made WitanReportSchema.parse() throw, and the scan wrote no report under any rubric.
// The fix drops the pointer, states the drop on the criterion, and leaves every score, status and
// verdict as the scorer computed them. These repositories are synthetic and built at test time.

const GENERATED_AT = '2026-11-10T00:00:00.000Z';
const TEST_FILE_NAME = 'test_deep_path.py';
const SHORT_TEST_PATH = `tests/${TEST_FILE_NAME}`;
const created: string[] = [];

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** A relative directory of exactly `length` characters under `root`. */
function deepDir(root: string, length: number): string {
  let path = root;
  // Directories of a separator plus at most 99 characters, well under any file system's name limit.
  // A gap of 1 cannot be filled (a directory needs a separator and a character), so never leave one.
  for (let remaining = length - path.length; remaining > 0; ) {
    const take = remaining <= 100 ? remaining : remaining === 101 ? 99 : 100;
    path += `/${'d'.repeat(take - 1)}`;
    remaining -= take;
  }
  if (path.length !== length) throw new Error(`built a ${path.length}-character directory, wanted ${length}`);
  return path;
}

/** A relative path of exactly `length` characters ending in the test file, under tests/. */
function deepTestPath(length: number): string {
  return `${deepDir('tests', length - TEST_FILE_NAME.length - 1)}/${TEST_FILE_NAME}`;
}

function git(dir: string, args: readonly string[]): void {
  execFileSync('git', [...args], { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' });
}

const CI_WORKFLOW = [
  'name: ci',
  'on: [push, pull_request]',
  'jobs:',
  '  test:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - run: pip install pytest',
  '      - run: pytest',
  '',
].join('\n');

const TEST_FILE = 'from deep_path_fixture.arith import add\n\n\ndef test_add():\n    assert add(1, 2) == 3\n';

function buildRepo(testPath: string, extra: Record<string, string> = {}): string {
  return buildRepoFrom({
    'README.md': '# Deep path fixture\n\nA synthetic package with one test file.\n',
    'pyproject.toml': '[project]\nname = "deep-path-fixture"\nversion = "0.1.0"\n',
    'src/deep_path_fixture/__init__.py': '',
    'src/deep_path_fixture/arith.py': 'def add(left, right):\n    return left + right\n',
    [testPath]: TEST_FILE,
    ...extra,
  });
}

function buildRepoFrom(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-612-'));
  created.push(dir);
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(dir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', 'initial commit']);
  return dir;
}

function score(repoPath: string, rubricVersion: string): WitanReport {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'deep-path-fixture',
    productDisplayName: 'Deep path fixture',
    generatedAt: GENERATED_AT,
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
}

function citedPaths(report: WitanReport): string[] {
  return report.criteria.flatMap((criterion) => [
    ...criterion.evidence.flatMap(({ path }) => (path ? [path] : [])),
    ...criterion.findings.flatMap(({ evidence }) => (evidence.path ? [evidence.path] : [])),
  ]);
}

/** Every criterion's score and status, the composite and the verdict: what a dropped citation must not move. */
function outcome(report: WitanReport) {
  return {
    verdict: report.verdict,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    criteria: report.criteria.map(({ id, score, status, metrics }) => ({ id, score, status, metrics })),
    scanLimitations: report.scanLimitations,
  };
}

/**
 * Each criterion's evidence without the pointers naming `path`, and its findings without their
 * anchors: everything a report cites except where it points. A finding anchored on the test file
 * stays, re-anchored, so its severity and summary are compared.
 */
function withoutCitationsOf(report: WitanReport, path: string): unknown {
  return report.criteria.map((criterion) => ({
    id: criterion.id,
    evidence: criterion.evidence.filter((pointer) => pointer.path !== path),
    findings: criterion.findings.map(({ severity, summary }) => ({ severity, summary })),
  }));
}

const OVER_LIMIT_DISCLOSURE =
  /^Cejel did not cite 1 repository path here because it is longer than the report's 700-character path limit\./;
const ANY_OVER_LIMIT_DISCLOSURE = /^Cejel did not cite \d+ repository paths? here because/;

describe.each([
  ['v17', WITAN_RUBRIC_VERSION_V17],
  ['v27', WITAN_RUBRIC_VERSION_V27],
])('#612 under %s: an evidence path over 700 characters', (_label, rubricVersion) => {
  const longPath = deepTestPath(701);
  const shortReport = score(buildRepo(SHORT_TEST_PATH), rubricVersion);
  let longReport: WitanReport | undefined;
  let longError: unknown;
  try {
    longReport = score(buildRepo(longPath), rubricVersion);
  } catch (error) {
    longError = error;
  }

  it('is cited as evidence when the path is short, so the long path reaches a pointer', () => {
    expect(citedPaths(shortReport)).toContain(SHORT_TEST_PATH);
  });

  it('still writes a report that verifies', () => {
    expect(longError).toBeUndefined();
    expect(longReport).toBeDefined();
    expect(() => WitanReportSchema.parse(longReport)).not.toThrow();
  });

  it('cites no path over the limit and never a shortened one', () => {
    const paths = citedPaths(longReport as WitanReport);
    expect(paths.every((path) => path.length <= 700)).toBe(true);
    expect(paths.some((path) => path.startsWith('tests/ddd'))).toBe(false);
    expect(JSON.stringify(longReport)).not.toContain('\\u0000');
  });

  it('states the drop once on each criterion that lost a pointer, with a count and the reason', () => {
    const shortCiting = (shortReport.criteria ?? [])
      .filter((criterion) =>
        [...criterion.evidence.map((p) => p.path), ...criterion.findings.map((f) => f.evidence.path)].includes(
          SHORT_TEST_PATH,
        ),
      )
      .map(({ id }) => id);
    expect(shortCiting.length).toBeGreaterThan(0);
    for (const criterion of (longReport as WitanReport).criteria) {
      const stated = (criterion.disclosures ?? []).filter((sentence) => OVER_LIMIT_DISCLOSURE.test(sentence));
      expect(stated.length, criterion.id).toBe(shortCiting.includes(criterion.id) ? 1 : 0);
    }
  });

  it('moves no score, status, metric or verdict, against the same repository with the file at a short path', () => {
    expect(outcome(longReport as WitanReport)).toEqual(outcome(shortReport));
  });

  it('differs from the short-path repository only in the cited test file', () => {
    expect(withoutCitationsOf(longReport as WitanReport, longPath)).toEqual(
      withoutCitationsOf(shortReport, SHORT_TEST_PATH),
    );
  });
});

describe.each([
  ['v17', WITAN_RUBRIC_VERSION_V17],
  ['v27', WITAN_RUBRIC_VERSION_V27],
])('#612 pin under %s: a path of exactly 700 characters', (_label, rubricVersion) => {
  const exactPath = deepTestPath(700);
  const report = score(buildRepo(exactPath), rubricVersion);

  it('is cited as today, with no drop stated', () => {
    expect(citedPaths(report)).toContain(exactPath);
    for (const criterion of report.criteria) {
      expect((criterion.disclosures ?? []).some((sentence) => ANY_OVER_LIMIT_DISCLOSURE.test(sentence))).toBe(false);
    }
  });
});

/** The plain first page's "What is wrong", as a reader sees it. */
function whatIsWrong(report: WitanReport) {
  const plain = buildPlainSummary(report);
  return {
    note: plain.wrongNote,
    items: plain.wrong.map(({ area, text, level, location }) => ({ area, text, level, location })),
  };
}

// Review of #697, item B: with CI present, the test file is cited by a pointer and by the info
// finding "Test suite files are present…". The criterion states one path, not two items.
describe.each([
  ['v17', WITAN_RUBRIC_VERSION_V17],
  ['v27', WITAN_RUBRIC_VERSION_V27],
])('#697 item B under %s: one long test path, cited twice, with CI present', (_label, rubricVersion) => {
  const ci = { '.github/workflows/ci.yml': CI_WORKFLOW };
  const longPath = deepTestPath(701);
  const shortReport = score(buildRepo(SHORT_TEST_PATH, ci), rubricVersion);
  const longReport = score(buildRepo(longPath, ci), rubricVersion);
  const a1Short = shortReport.criteria.find(({ id }) => id === 'A1');
  const a1Long = longReport.criteria.find(({ id }) => id === 'A1');

  it('cites the short test file by more than one pointer or finding, so the count can double', () => {
    const citing = [
      ...(a1Short?.evidence ?? []).filter(({ path }) => path === SHORT_TEST_PATH),
      ...(a1Short?.findings ?? []).filter(({ evidence }) => evidence.path === SHORT_TEST_PATH),
    ];
    expect(citing.length).toBeGreaterThan(1);
  });

  it('states one dropped path on A1, and none elsewhere', () => {
    expect(a1Long?.disclosures?.filter((sentence) => ANY_OVER_LIMIT_DISCLOSURE.test(sentence))).toEqual([
      overLimitCitationDisclosure(1),
    ]);
    for (const criterion of longReport.criteria.filter(({ id }) => id !== 'A1')) {
      expect((criterion.disclosures ?? []).some((sentence) => ANY_OVER_LIMIT_DISCLOSURE.test(sentence))).toBe(false);
    }
  });

  it('keeps every finding, on severity and summary, and moves no outcome', () => {
    expect(withoutCitationsOf(longReport, longPath)).toEqual(withoutCitationsOf(shortReport, SHORT_TEST_PATH));
    expect(outcome(longReport)).toEqual(outcome(shortReport));
  });
});

// Review of #697, item A: the review's fixture. Eight modules under a 750-character directory, no
// tests and no CI. A1's critical absence finding is anchored on the first source module, so its
// only citation is a path over the limit. It must stay, with its severity and summary.
describe.each([
  ['v17', WITAN_RUBRIC_VERSION_V17],
  ['v27', WITAN_RUBRIC_VERSION_V27],
])('#697 item A under %s: a finding whose only citation is over the limit', (_label, rubricVersion) => {
  const modules = (dir: string): Record<string, string> => ({
    'README.md': '# Deep module fixture\n\nA synthetic package with no tests.\n',
    'pyproject.toml': '[project]\nname = "deep-module-fixture"\nversion = "0.1.0"\n',
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        `${dir}/mod${index}.py`,
        `def value_${index}(number):\n    return number + ${index}\n`,
      ]),
    ),
  });
  const longDir = deepDir('src', 750);
  const shortReport = score(buildRepoFrom(modules('src/pkg')), rubricVersion);
  const longReport = score(buildRepoFrom(modules(longDir)), rubricVersion);
  const a1Short = shortReport.criteria.find(({ id }) => id === 'A1');
  const a1Long = longReport.criteria.find(({ id }) => id === 'A1');

  it('is critical with a finding of its own in the short-path copy', () => {
    expect(a1Short?.status).toBe('critical');
    expect(a1Short?.findings.some(({ severity }) => severity === 'critical')).toBe(true);
  });

  it('keeps the critical finding, its severity and summary, on a stated anchor that is not a path', () => {
    expect(a1Long?.findings.map(({ severity, summary }) => ({ severity, summary }))).toEqual(
      a1Short?.findings.map(({ severity, summary }) => ({ severity, summary })),
    );
    expect(a1Long?.findings.map(({ evidence }) => evidence)).toEqual(
      a1Short?.findings.map(() => OVER_LIMIT_ANCHOR),
    );
    expect(a1Long?.disclosures?.filter((sentence) => ANY_OVER_LIMIT_DISCLOSURE.test(sentence))).toEqual([
      overLimitCitationDisclosure(1),
    ]);
  });

  it("gives the same What is wrong, apart from the location, which the long copy cannot name", () => {
    const short = whatIsWrong(shortReport);
    const long = whatIsWrong(longReport);
    expect(short.items.length).toBeGreaterThan(0);
    expect(long.note).toEqual(short.note);
    expect(long.items.map(({ location: _location, ...rest }) => rest)).toEqual(
      short.items.map(({ location: _location, ...rest }) => rest),
    );
    expect(long.items.every(({ location }) => location === undefined || location.length <= 700)).toBe(true);
    expect(JSON.stringify(long)).not.toContain('No single finding of its own');
  });

  it('moves no outcome', () => {
    expect(outcome(longReport)).toEqual(outcome(shortReport));
  });
});

// Review of #697, item C: a withheld path over the limit is a note, not a scan limitation, so the
// badge and the --min-score gate are those of the short-path copy. The withheld file is a module
// over the 512,000-byte read limit at a 720-character path.
describe('#697 item C: a withheld path over the limit, through the CLI', () => {
  const big = `def big():\n    return ${JSON.stringify('x'.repeat(520_000))}\n`;
  const longWithheld = `${deepDir('src', 720 - '/blob.py'.length)}/blob.py`;
  const run = async (withheldPath: string) => {
    // Enough readable modules that one withheld module leaves source representation above 80%.
    const readable = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        `src/deep_path_fixture/mod${index}.py`,
        `def value_${index}(number):\n    return number + ${index}\n`,
      ]),
    );
    const repo = buildRepo(SHORT_TEST_PATH, {
      '.github/workflows/ci.yml': CI_WORKFLOW,
      ...readable,
      [withheldPath]: big,
    });
    const out = mkdtempSync(join(tmpdir(), 'cejel-612-out-'));
    created.push(out);
    const written: string[] = [];
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      const exitCode = await runWitanFreeCli(['scan', repo, '--out', out, '--quiet', '--min-score', '0.1']);
      const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as WitanReport;
      const badge = JSON.parse(readFileSync(join(out, 'badge.json'), 'utf8')) as { message: string };
      return { exitCode, report, badge: badge.message, stderr: written.join('') };
    } finally {
      stderr.mockRestore();
    }
  };

  it('builds a 720-character withheld path', () => {
    expect(longWithheld.length).toBe(720);
  });

  it('gives the badge text and --min-score 0.1 exit code of the short-path copy, with no scan limitation', async () => {
    const short = await run('src/blob.py');
    const long = await run(longWithheld);
    expect(short.report.withheldPaths?.map(({ path }) => path)).toContain('src/blob.py');
    expect(long.report.withheldPaths?.some(({ path }) => path.length > 700)).toBe(false);
    expect(long.badge).toBe(short.badge);
    expect(long.badge).not.toBe('unrated: limited evidence');
    expect(long.exitCode).toBe(short.exitCode);
    expect(short.stderr).toBe('');
    expect(short.badge).toMatch(/^\d\.\d\/4\.0 /);
    expect(long.exitCode).toBe(0);
    expect(long.report.scanLimitations).toEqual(short.report.scanLimitations);
    expect(outcome(long.report)).toEqual(outcome(short.report));
    const stated = long.report.criteria.flatMap(({ disclosures }) =>
      (disclosures ?? []).filter((sentence) => sentence.includes('not listed in withheldPaths')),
    );
    expect(stated).toHaveLength(1);
    expect(stated[0]).toMatch(/^1 withheld repository path is not listed in withheldPaths because/);
    expect(buildRelyingPartySummary(long.report).notEstablished).not.toContain('No content was withheld');
  });
});

// Unit cases on createWitanReport, each built so the property fails if the fix is removed or
// placed differently.
describe('#612 createWitanReport: an over-limit path is dropped after scoring and stated', () => {
  const OVER = `src/${'p'.repeat(697)}/x.ts`;
  const SHORT = 'src/x.ts';
  const base = {
    productSlug: 'deep-path-fixture',
    productDisplayName: 'Deep path fixture',
    repo: {},
    generatedAt: GENERATED_AT,
    rubricVersion: WITAN_RUBRIC_VERSION_V17,
  };
  const pointer = (path: string) => ({ kind: 'repository' as const, label: 'test file', path });

  it('builds paths of the intended lengths', () => {
    expect(OVER.length).toBe(706);
  });

  it('scores a criterion whose only evidence is the dropped pointer as if it were cited', () => {
    // Dropped before scoring, this criterion would hold no evidence and no metric and score as
    // insufficient_data; scoring reads how many pointers there are.
    const make = (path: string) =>
      createWitanReport({ ...base, signals: [{ criterionId: 'A3', positiveEvidence: [pointer(path)] }] });
    const over = make(OVER).criteria.find(({ id }) => id === 'A3');
    const short = make(SHORT).criteria.find(({ id }) => id === 'A3');
    expect(short?.status).not.toBe('insufficient_data');
    expect({ score: over?.score, status: over?.status, metrics: over?.metrics }).toEqual({
      score: short?.score,
      status: short?.status,
      metrics: short?.metrics,
    });
    expect(over?.evidence).toEqual([]);
    expect(over?.disclosures).toEqual([overLimitCitationDisclosure(1)]);
  });

  it('keeps a finding whose only citation is over the limit, with its severity, summary and place (#697 item A)', () => {
    const second = { severity: 'info' as const, summary: 'a second finding', evidence: pointer(SHORT) };
    const make = (path: string) =>
      createWitanReport({
        ...base,
        signals: [
          {
            criterionId: 'A2',
            positiveEvidence: [pointer(SHORT)],
            findings: [{ severity: 'critical', summary: 'a planted finding', evidence: pointer(path) }, second],
          },
        ],
      }).criteria.find(({ id }) => id === 'A2');
    const over = make(OVER);
    const short = make(SHORT);
    expect(over?.status).toBe('critical');
    expect({ score: over?.score, status: over?.status }).toEqual({ score: short?.score, status: short?.status });
    expect(over?.evidence).toEqual([pointer(SHORT)]);
    expect(over?.findings).toEqual([
      { severity: 'critical', summary: 'a planted finding', evidence: OVER_LIMIT_ANCHOR },
      second,
    ]);
    expect(OVER_LIMIT_ANCHOR.path).toBe('.');
    expect(OVER_LIMIT_ANCHOR.label).toMatch(/longer than the report's 700-character limit/);
    expect(over?.disclosures).toEqual([overLimitCitationDisclosure(1)]);
  });

  it('counts one path once, however many pointers and findings cite it (#697 item B)', () => {
    const report = createWitanReport({
      ...base,
      signals: [
        {
          criterionId: 'A2',
          positiveEvidence: [pointer(OVER), pointer(OVER)],
          findings: [{ severity: 'info', summary: 'cites it too', evidence: pointer(OVER) }],
        },
      ],
    });
    expect(report.criteria.find(({ id }) => id === 'A2')?.disclosures).toEqual([overLimitCitationDisclosure(1)]);
  });

  it('counts two paths as two (#697 item B)', () => {
    const OTHER = `src/${'q'.repeat(697)}/y.ts`;
    const report = createWitanReport({
      ...base,
      signals: [
        {
          criterionId: 'A2',
          positiveEvidence: [pointer(OVER), pointer(OTHER), pointer(OVER)],
          findings: [{ severity: 'info', summary: 'cites the second', evidence: pointer(OTHER) }],
        },
      ],
    });
    expect(report.criteria.find(({ id }) => id === 'A2')?.disclosures).toEqual([overLimitCitationDisclosure(2)]);
  });

  it('leaves an over-limit withheld path out of withheldPaths and states it on a criterion, not as a scan limitation (#697 item C)', () => {
    const report = createWitanReport({
      ...base,
      withheldPaths: [
        { path: OVER, reason: 'too_large', signalsAdmitting: ['A3.build_script'], actedOn: false },
        { path: SHORT, reason: 'too_large', signalsAdmitting: [], actedOn: false },
      ],
    });
    expect(report.withheldPaths?.map(({ path }) => path)).toEqual([SHORT]);
    expect(report.scanLimitations).toBeUndefined();
    expect(report.criteria.find(({ id }) => id === 'A3')?.disclosures).toEqual([
      overLimitWithheldPathsDisclosure(1, ['A3.build_script']),
    ]);
    expect(buildRelyingPartySummary(report).notEstablished).toContain('1 listed content entry was withheld');
  });

  it('states a withheld path no check would read on the first criterion, and never says nothing was withheld', () => {
    const report = createWitanReport({
      ...base,
      withheldPaths: [{ path: OVER, reason: 'too_large', signalsAdmitting: [], actedOn: false }],
    });
    expect(report.withheldPaths).toEqual([]);
    expect(report.scanLimitations).toBeUndefined();
    expect(report.criteria[0]?.disclosures).toEqual([overLimitWithheldPathsDisclosure(1, [])]);
    expect(buildRelyingPartySummary(report).notEstablished).not.toContain('No content was withheld');
  });

  it("states the drop in the criterion's notes, not as a scan limitation, when its four disclosures are used", () => {
    const disclosures = ['one.', 'two.', 'three.', 'four.'];
    const report = createWitanReport({
      ...base,
      signals: [
        { criterionId: 'A3', positiveEvidence: [pointer(OVER), pointer(OVER)], disclosures, notes: 'A note.' },
      ],
    });
    const a3 = report.criteria.find(({ id }) => id === 'A3');
    expect(a3?.disclosures).toEqual(disclosures);
    expect(a3?.notes).toBe(`A note. ${overLimitCitationDisclosure(1)}`);
    expect(report.scanLimitations).toBeUndefined();
  });

  // Operator ruling of 10 Nov (re-review of #706 at bca7e2b20): where four disclosures are used,
  // the statement goes in the notes whatever their length, shortened to a count and with the notes'
  // own tail cut where needed. It never becomes a scan limitation, so the badge and the gate are the
  // short-path copy's, and a scan whose sixteen scan limitations are used still writes its report.
  describe.each([10, 600, 720, 1000])('with four disclosures and %i characters of notes', (notesLength) => {
    const disclosures = ['one.', 'two.', 'three.', 'four.'];
    const notes = `${'n'.repeat(notesLength - 1)}.`;
    const SIXTEEN = Array.from({ length: 16 }, (_, index) => `limitation ${index}.`);
    const make = (path: string, scanLimitations: readonly string[], withheld = false) =>
      createWitanReport({
        ...base,
        scanLimitations: [...scanLimitations],
        signals: [{ criterionId: 'A3', positiveEvidence: [pointer(path), pointer(SHORT)], disclosures, notes }],
        ...(withheld
          ? { withheldPaths: [{ path, reason: 'too_large' as const, signalsAdmitting: ['A3.build_script'], actedOn: false }] }
          : {}),
      });

    it.each([
      ['no scan limitations', [] as string[]],
      ['all sixteen scan limitations used', SIXTEEN],
    ])('states the drop in the notes, with the badge and limitations of the short-path copy (%s)', (_label, scanLimitations) => {
      const short = make(SHORT, scanLimitations);
      const over = make(OVER, scanLimitations);
      expect(() => WitanReportSchema.parse(over)).not.toThrow();
      expect(over.scanLimitations).toEqual(short.scanLimitations);
      expect(over.scanLimitations?.length ?? 0).toBe(scanLimitations.length);
      expect(renderWitanBadgeEndpoint(over)).toEqual(renderWitanBadgeEndpoint(short));
      if (scanLimitations.length === 0) {
        expect(renderWitanBadgeEndpoint(over).message).not.toBe('unrated: limited evidence');
      }
      expect(outcome(over)).toEqual(outcome(short));
      const a3 = over.criteria.find(({ id }) => id === 'A3');
      expect(a3?.disclosures).toEqual(disclosures);
      expect(a3?.evidence).toEqual([pointer(SHORT)]);
      expect(a3?.notes?.length).toBeLessThanOrEqual(1000);
      const stated = a3?.notes?.endsWith(overLimitCitationDisclosure(1)) || a3?.notes?.endsWith(overLimitCitationNote(1));
      expect(stated).toBe(true);
      // The notes' head is kept: whole where the statement fits after them, else cut by the "..." rule.
      const kept = a3?.notes?.startsWith(notes) || a3?.notes?.startsWith(`${notes.slice(0, 700)}`);
      expect(kept).toBe(true);
      expect(a3?.notes?.includes('...') ?? false).toBe(notesLength + 1 + overLimitCitationNote(1).length > 1000);
    });

    it('states a dropped citation and a dropped withheld path on the same full criterion, with no scan limitation', () => {
      const short = make(SHORT, SIXTEEN, true);
      const over = make(OVER, SIXTEEN, true);
      expect(() => WitanReportSchema.parse(over)).not.toThrow();
      expect(over.scanLimitations).toEqual(short.scanLimitations);
      expect(renderWitanBadgeEndpoint(over)).toEqual(renderWitanBadgeEndpoint(short));
      expect(outcome(over)).toEqual(outcome(short));
      const a3 = over.criteria.find(({ id }) => id === 'A3');
      expect(a3?.notes?.length).toBeLessThanOrEqual(1000);
      const both = [
        `${overLimitCitationDisclosure(1)} ${overLimitWithheldPathsDisclosure(1, ['A3.build_script'])}`,
        `${overLimitCitationNote(1)} ${overLimitWithheldPathsNote(1)}`,
      ];
      expect(both.some((statements) => a3?.notes?.endsWith(statements))).toBe(true);
      expect(statesUnlistedWithheldPaths(over.criteria)).toBe(true);
    });
  });

  // Guard (operator ruling of 10 Nov): the cut keeps the notes' head, so a "cannot be settled"
  // sentence there survives it, and the certificate and the plain summary still read it.
  it('keeps a "cannot be settled" sentence that sits in the kept head of notes the cut shortens', () => {
    const disclosures = ['one.', 'two.', 'three.', 'four.'];
    // Full notes: the sentence first, then filler to the 1,000-character limit.
    const notes = `${WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE} ${'n'.repeat(998 - WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE.length)}.`;
    expect(notes.length).toBe(1000);
    const report = createWitanReport({
      ...base,
      signals: [{ criterionId: 'A3', positiveEvidence: [pointer(OVER), pointer(SHORT)], disclosures, notes }],
    });
    const a3 = report.criteria.find(({ id }) => id === 'A3');
    expect(a3?.status).not.toBe('not_applicable');
    expect(a3?.notes?.length).toBeLessThanOrEqual(1000);
    expect(a3?.notes?.endsWith(`... ${overLimitCitationNote(1)}`)).toBe(true);
    expect(a3?.notes?.startsWith(WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE)).toBe(true);
    expect(buildRelyingPartySummary(report).notEstablished).toContain(WITAN_A3_BUILD_STEP_UNSETTLED_DISCLOSURE);
    expect(JSON.stringify(buildPlainSummary(report))).toContain(
      'Whether this package has a build or type-check step outside the files Cejel read cannot be told from the files',
    );
  });

  it('keeps both count-only forms short enough that at least 700 characters of notes always stay', () => {
    const longest = `${overLimitCitationNote(999_999_999)} ${overLimitWithheldPathsNote(999_999_999)}`;
    expect(overLimitCitationNote(999_999_999).length).toBeLessThanOrEqual(92);
    expect(longest.length).toBeLessThan(300);
    expect(1000 - longest.length - 1).toBeGreaterThanOrEqual(700);
  });

  it('cites a 700-character path and states nothing', () => {
    const exact = `src/${'p'.repeat(691)}/x.ts`;
    expect(exact.length).toBe(700);
    const report = createWitanReport({
      ...base,
      signals: [{ criterionId: 'A3', positiveEvidence: [pointer(exact)] }],
      withheldPaths: [{ path: exact, reason: 'too_large', signalsAdmitting: [], actedOn: false }],
    });
    const a3 = report.criteria.find(({ id }) => id === 'A3');
    expect(a3?.evidence).toEqual([pointer(exact)]);
    expect(a3?.disclosures).toBeUndefined();
    expect(report.withheldPaths?.map(({ path }) => path)).toEqual([exact]);
    expect(report.scanLimitations).toBeUndefined();
  });
});
