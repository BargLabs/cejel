import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { overLimitCitationDisclosure, overLimitWithheldPathsLimitation } from '../path-limits.js';
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

/** A relative path of exactly `length` characters ending in the test file, under tests/. */
function deepTestPath(length: number): string {
  const tail = `/${TEST_FILE_NAME}`;
  let path = 'tests';
  // Directories of a separator plus at most 99 characters, well under any file system's name limit.
  // A gap of 1 cannot be filled (a directory needs a separator and a character), so never leave one.
  for (let remaining = length - path.length - tail.length; remaining > 0; ) {
    const take = remaining <= 100 ? remaining : remaining === 101 ? 99 : 100;
    path += `/${'d'.repeat(take - 1)}`;
    remaining -= take;
  }
  const full = `${path}${tail}`;
  if (full.length !== length) throw new Error(`built a ${full.length}-character path, wanted ${length}`);
  return full;
}

function git(dir: string, args: readonly string[]): void {
  execFileSync('git', [...args], { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' });
}

function buildRepo(testPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-612-'));
  created.push(dir);
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  const files: Record<string, string> = {
    'README.md': '# Deep path fixture\n\nA synthetic package with one test file.\n',
    'pyproject.toml': '[project]\nname = "deep-path-fixture"\nversion = "0.1.0"\n',
    'src/deep_path_fixture/__init__.py': '',
    'src/deep_path_fixture/arith.py': 'def add(left, right):\n    return left + right\n',
    [testPath]:
      'from deep_path_fixture.arith import add\n\n\ndef test_add():\n    assert add(1, 2) == 3\n',
  };
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
  /^Cejel did not cite 1 evidence item here because its repository path is longer than the report's 700-character path limit\./;

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
      expect((criterion.disclosures ?? []).some((sentence) => OVER_LIMIT_DISCLOSURE.test(sentence))).toBe(false);
    }
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

  it('keeps the status a dropped finding set, and the criterion keeps its other evidence', () => {
    const report = createWitanReport({
      ...base,
      signals: [
        {
          criterionId: 'A2',
          positiveEvidence: [pointer(SHORT)],
          findings: [{ severity: 'critical', summary: 'a planted finding', evidence: pointer(OVER) }],
        },
      ],
    });
    const a2 = report.criteria.find(({ id }) => id === 'A2');
    expect(a2?.status).toBe('critical');
    expect(a2?.evidence).toEqual([pointer(SHORT)]);
    expect(a2?.findings.some(({ summary }) => summary === 'a planted finding')).toBe(false);
    expect(a2?.disclosures).toEqual([overLimitCitationDisclosure(1)]);
  });

  it('leaves an over-limit withheld path out of withheldPaths and says so as a scan limitation', () => {
    const report = createWitanReport({
      ...base,
      withheldPaths: [
        { path: OVER, reason: 'too_large', signalsAdmitting: [], actedOn: false },
        { path: SHORT, reason: 'too_large', signalsAdmitting: [], actedOn: false },
      ],
    });
    expect(report.withheldPaths?.map(({ path }) => path)).toEqual([SHORT]);
    expect(report.scanLimitations).toEqual([overLimitWithheldPathsLimitation(1)]);
  });

  it('states the drop as a scan limitation naming the criterion when its four disclosures are used', () => {
    const disclosures = ['one.', 'two.', 'three.', 'four.'];
    const report = createWitanReport({
      ...base,
      signals: [{ criterionId: 'A3', positiveEvidence: [pointer(OVER), pointer(OVER)], disclosures }],
    });
    expect(report.criteria.find(({ id }) => id === 'A3')?.disclosures).toEqual(disclosures);
    expect(report.scanLimitations).toEqual([`A3: ${overLimitCitationDisclosure(2)}`]);
  });

  it('refuses to drop without saying so when the sixteen scan limitations are used', () => {
    const scanLimitations = Array.from({ length: 16 }, (_, index) => `limitation ${index}.`);
    expect(() =>
      createWitanReport({
        ...base,
        scanLimitations,
        withheldPaths: [{ path: OVER, reason: 'too_large', signalsAdmitting: [], actedOn: false }],
      }),
    ).toThrow(/refusing to drop them without saying so/);
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
