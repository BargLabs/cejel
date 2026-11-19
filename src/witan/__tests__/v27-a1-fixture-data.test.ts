import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { serializeWitanReport } from '../attestation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { CARD_REPOSITORY, FIXTURE_DATA_FIXTURES } from './fixtures/v27-a1-fixture-data-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// v27 A1 (goal_cejel_v27_a1_fixture_data_not_cited_as_test_2026-11-19; refs #518). Citation only:
// - item A: a fixture data file (under fixtures/ or __fixtures__/, or named *.fixture.* or
//   *.fixtures.*) with no test in it is not cited as "Detected test file" under v27; it keeps its
//   citation, labelled as test support scaffolding;
// - item B: under v27 each file a v27 rule rates hollow is cited before the detected test files.
// The pins were captured from main 6b4392627 before any code change: every v17 to v26 report
// whole, and under v27 the report without A1's evidence and A1's evidence without labels, sorted.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);

const PINS_PATH = new URL('./fixtures/v27-a1-fixture-data-main-pins.json', import.meta.url);
const CAPTURE = process.env.V27_A1_FIXTURE_DATA_PINS;

const DETECTED = 'Detected test file';
const SCAFFOLDING = 'Test support scaffolding (fixture data with no test in it), not a test file';
const CONFTEST_HOLLOW = 'Rated hollow under this rubric: runs no test (conftest)';

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = FIXTURE_DATA_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'a1-fixture-data-fixture',
    productDisplayName: 'A1 fixture data fixture',
    generatedAt: '2026-11-19T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function a1(name: string, rubricVersion: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === 'A1');
  if (!found) throw new Error(`${name}@${rubricVersion} has no A1`);
  return found;
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const labelOf = (score: WitanCriterionScore, path: string): string[] =>
  score.evidence.filter((pointer) => pointer.path === path).map((pointer) => pointer.label);

/**
 * The v27 report with A1's evidence, and the pointer each A1 finding cites, removed, serialized:
 * every score, status, metric, note and finding's severity and summary stays in it.
 */
function withoutA1Evidence(name: string): string {
  const scored = report(name, V27);
  return serializeWitanReport({
    ...scored,
    criteria: scored.criteria.map((entry) =>
      entry.id === 'A1'
        ? {
            ...entry,
            evidence: [],
            findings: entry.findings.map((finding) => ({ ...finding, evidence: { kind: 'test_run', label: 'removed', path: 'removed' } })),
          }
        : entry,
    ),
  });
}

/** A1's v27 evidence pointers without their labels, in a fixed order. */
function a1EvidenceWithoutLabels(name: string): string {
  return JSON.stringify(
    a1(name, V27)
      .evidence.map(({ label: _label, ...rest }) => JSON.stringify(rest))
      .sort(),
  );
}

describe('item A — under v27 a fixture data file with no test in it is not cited as a detected test file', () => {
  it('the card repository: v17 does not cite auth.fixtures.ts (the ninth file, past the cap); v27 cites it as scaffolding, not as a test file', () => {
    expect(labelOf(a1(CARD_REPOSITORY, V17), 'tests/fixtures/auth.fixtures.ts')).toEqual([]);
    expect(labelOf(a1(CARD_REPOSITORY, V27), 'tests/fixtures/auth.fixtures.ts')).toEqual([SCAFFOLDING]);
  });

  it.each([
    ['a1-fixture-data-named-fixture-outside-fixtures-dir', 'tests/helpers/users.fixture.py'],
    ['a1-fixture-data-dunder-fixtures-dir', 'tests/__fixtures__/users.py'],
    ['a1-fixture-data-only-test-shaped-file', 'tests/fixtures/auth.fixtures.ts'],
  ])('%s: %s is cited as scaffolding under v27, never as a detected test file', (name, path) => {
    expect(labelOf(a1(name, V27), path)).toEqual([SCAFFOLDING]);
  });

  it('where v17 cites a fixture data file, it still calls it a detected test file (v17 is unchanged)', () => {
    expect(labelOf(a1('a1-fixture-data-dunder-fixtures-dir', V17), 'tests/__fixtures__/users.py')).toEqual([DETECTED]);
  });

  it('the no-coverage finding cites a detected test file under v27 where one is cited, and the fixture data file where it is the only one', () => {
    const coverageFinding = (name: string, rubricVersion: string) =>
      a1(name, rubricVersion).findings.find(({ summary }) => summary.includes('no coverage configuration'));
    expect(coverageFinding('a1-fixture-data-dunder-fixtures-dir', V17)?.evidence).toMatchObject({
      path: 'tests/__fixtures__/users.py',
      label: DETECTED,
    });
    expect(coverageFinding('a1-fixture-data-dunder-fixtures-dir', V27)?.evidence).toMatchObject({
      path: 'tests/test_alpha.py',
      label: DETECTED,
    });
    expect(coverageFinding('a1-fixture-data-only-test-shaped-file', V27)?.evidence).toMatchObject({
      path: 'tests/fixtures/auth.fixtures.ts',
      label: SCAFFOLDING,
    });
  });

  it('control: a file under tests/fixtures/ that holds a test stays a detected test file', () => {
    expect(labelOf(a1('a1-fixture-data-control-test-in-fixtures-dir', V27), 'tests/fixtures/test_loader.py')).toEqual([DETECTED]);
  });

  it('control: with no slot freed, the fixture data file is cited under no rubric', () => {
    for (const rubricVersion of [V17, V27]) {
      expect(labelOf(a1('a1-fixture-data-control-no-conftest', rubricVersion), 'tests/fixtures/auth.fixtures.ts')).toEqual([]);
    }
  });

  it('every pointer v27 labels scaffolding is a fixture data path', () => {
    for (const { name } of FIXTURE_DATA_FIXTURES) {
      for (const pointer of a1(name, V27).evidence.filter(({ label }) => label === SCAFFOLDING)) {
        expect(pointer.path ?? '').toMatch(/(^|\/)(?:fixtures|__fixtures__)\/|(^|\/)[^/]+\.fixtures?\.[^/]+$/);
      }
    }
  });
});

describe('item B — under v27 a file a v27 rule rates hollow is cited before the detected test files', () => {
  it('the card repository: the conftest.py\'s rated-hollow citation comes first', () => {
    const evidence = a1(CARD_REPOSITORY, V27).evidence;
    const hollow = evidence.findIndex(({ path, label }) => path === 'tests/conftest.py' && label === CONFTEST_HOLLOW);
    const firstDetected = evidence.findIndex(({ label }) => label === DETECTED);
    expect(hollow).toBe(0);
    expect(firstDetected).toBeGreaterThan(hollow);
  });

  it('ten rated-hollow conftest.py files: the first eight are cited first, and the note counts all ten', () => {
    const score = a1('a1-fixture-data-ten-conftests', V27);
    const firstEight = score.evidence.slice(0, 8);
    expect(firstEight.map(({ label }) => label)).toEqual(Array.from({ length: 8 }, () => CONFTEST_HOLLOW));
    expect(firstEight.map(({ path }) => path)).toEqual(
      Array.from({ length: 8 }, (_unused, index) => `tests/pkg${String(index).padStart(2, '0')}/conftest.py`),
    );
    expect(score.evidence.filter(({ label }) => label === CONFTEST_HOLLOW)).toHaveLength(8);
    expect(score.notes ?? '').toContain('10 files that v17 rates non-hollow are rated hollow here because they run no test');
  });

  it('under v17 no file is rated hollow, and the detected test files come first', () => {
    const evidence = a1(CARD_REPOSITORY, V17).evidence;
    expect(evidence[0]?.label).toBe(DETECTED);
    expect(evidence.some(({ label }) => label.startsWith('Rated hollow'))).toBe(false);
  });
});

describe('no rise — v27 never above v17 on any fixture here', () => {
  it('checkNoRise and lostFindings find nothing', () => {
    for (const { name } of FIXTURE_DATA_FIXTURES) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });
});

describe('byte identity — every rubric but v27 equals main; under v27 only A1\'s labels and order move', () => {
  const allPins = (): Record<string, string> => {
    const pins: Record<string, string> = {};
    for (const { name } of FIXTURE_DATA_FIXTURES) {
      for (const rubricVersion of OTHER_RUBRICS) {
        pins[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
      }
      pins[`${V27}/${name}#without-a1-evidence`] = sha256(withoutA1Evidence(name));
      pins[`${V27}/${name}#a1-evidence-without-labels`] = sha256(a1EvidenceWithoutLabels(name));
    }
    return pins;
  };

  it.runIf(CAPTURE !== undefined)('writes the pins', () => {
    writeFileSync(CAPTURE ?? '', `${JSON.stringify(allPins(), null, 2)}\n`);
  });

  it.runIf(CAPTURE === undefined)('matches main on every fixture', () => {
    const pins = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<string, string>;
    const measured = allPins();
    expect(Object.keys(measured).sort()).toEqual(Object.keys(pins).sort());
    for (const [key, value] of Object.entries(pins)) expect(measured[key], key).toBe(value);
  });
});
