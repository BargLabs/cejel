import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { removalFixture } from './fixtures/v27-a1-removal-fixtures.js';
import { WITHHOLD_FIXTURES, type WithholdFixture } from './fixtures/v27-a1-withhold-fixtures.js';
import { checkNoRise } from './v27-no-rise.js';

// goal_cejel_v27_a1_test_count_overmatch_v2_2026-11-02 (supersedes #621). Under witan-rubric-v27 a
// removal rule of A1 is withheld only on evidence that pytest would not do what the rule assumes:
// a hook's clear only where the same hook puts the collected items back (item A), a pytest setting
// only where it is in force (item B), and every withhold is said in A1's note (item C). Item D:
// --noconftest, a conftest.py pytest would not load, and python_files on a Makefile pytest line.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const reports = new Map<string, WitanReport>();
const repos = new Map<string, string>();

function scan(fixture: FalseAssuranceFixture, rubricVersion: string): WitanReport {
  const key = `${fixture.name}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(fixture.name);
  if (!repo) {
    repo = buildFalseAssuranceFixture(fixture);
    repos.set(fixture.name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'false-assurance-fixture',
    productDisplayName: 'False-assurance fixture',
    generatedAt: '2026-11-02T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function a1(fixture: FalseAssuranceFixture, rubricVersion: string): WitanCriterionScore {
  const found = scan(fixture, rubricVersion).criteria.find(({ id }) => id === 'A1');
  if (!found) throw new Error(`${fixture.name}@${rubricVersion} has no A1`);
  return found;
}

function share(score: WitanCriterionScore): number | undefined {
  return score.metrics.find(({ name }) => name === 'non_hollow_test_share')?.value;
}

const REMOVAL_LABEL = (rule: string) => `Rated hollow under this rubric: runs no test (${rule})`;
const REMOVAL_SENTENCE = /that v17 rates non-hollow (?:is|are) rated hollow here because (?:it runs|they run) no test/;
const RULE_FINDING = /^(?:A pytest collection hook|Every test in )/;
const NOT_APPLIED = /not applied: /i;

/** The fixture's caught files are rated hollow under v27, named with their rule, and no withhold is said. */
function expectCaught(fixture: WithholdFixture): void {
  const v17 = a1(fixture, V17);
  const v27 = a1(fixture, V27);
  const notes = v27.notes ?? '';
  expect(notes, fixture.name).toMatch(REMOVAL_SENTENCE);
  for (const [path, rule] of fixture.removed) {
    expect(notes, fixture.name).toContain(`${path} (${rule})`);
    expect(
      v27.evidence.some(({ path: cited, label }) => cited === path && label === REMOVAL_LABEL(rule)),
      `${fixture.name}: ${path} cited with ${rule}`,
    ).toBe(true);
  }
  expect(v27.evidence.filter(({ label }) => label.startsWith('Rated hollow')).length, fixture.name).toBe(
    fixture.removed.length,
  );
  expect(share(v27), fixture.name).toBe((share(v17) ?? 0) - fixture.removed.length);
  expect(notes, fixture.name).not.toMatch(NOT_APPLIED);
}

/** v27 reads the fixture as v17 does, and its note says which rule was not applied and why. */
function expectWithheldAndSaid(fixture: FalseAssuranceFixture, clauses: readonly string[]): void {
  const v17 = a1(fixture, V17);
  const v27 = a1(fixture, V27);
  expect(v27.score, fixture.name).toBe(v17.score);
  expect(v27.status, fixture.name).toBe(v17.status);
  expect(v27.metrics.map(({ name, value, max }) => [name, value, max]), fixture.name).toEqual(
    v17.metrics.map(({ name, value, max }) => [name, value, max]),
  );
  expect(v27.findings.filter(({ summary }) => RULE_FINDING.test(summary)), fixture.name).toEqual([]);
  expect(v27.evidence.filter(({ label }) => label.startsWith('Rated hollow')), fixture.name).toEqual([]);
  const notes = (v27.notes ?? '').toLowerCase();
  for (const clause of clauses) expect(notes, fixture.name).toContain(clause.toLowerCase());
  // v17 never says it: it has no such rule.
  expect(v17.notes ?? '', fixture.name).not.toMatch(NOT_APPLIED);
}

function runItem(item: WithholdFixture['item']): void {
  for (const fixture of WITHHOLD_FIXTURES.filter((entry) => entry.item === item)) {
    if (fixture.withheld.length === 0) {
      it(`still caught: ${fixture.name} — ${fixture.purpose}`, () => expectCaught(fixture));
    } else {
      it(`withheld and said: ${fixture.name} — ${fixture.purpose}`, () =>
        expectWithheldAndSaid(fixture, fixture.withheld));
    }
  }
}

describe('item A — a hook that empties items is withheld only where it puts the collected items back', () => {
  runItem('A');
});

describe('item B — a pytest setting withholds only where it is in force', () => {
  runItem('B');
});

describe('item D — the older wrong flags', () => {
  runItem('D');
});

describe('item C — every withhold is said in A1\'s note', () => {
  // #621's fixtures whose rule is withheld: each now says so.
  const REMOVAL_WITHHOLDS: readonly [name: string, clause: string][] = [
    ['a1rm-conftest-collected-by-python-files', 'conftest rule not applied: python_files set in pyproject.toml'],
    ['a1rm-py-python-functions-config', 'every-test-skipped rule not applied: python_functions set in pyproject.toml'],
    ['a1rm-pytest-skipping-plugin-disabled', 'every-test-skipped rule not applied: -p no:skipping set in pyproject.toml'],
    [
      'a1rm-hook-clear-then-helper-refill',
      'run-wide skip rule not applied: the hook in tests/conftest.py puts the collected items back',
    ],
  ];
  for (const [name, clause] of REMOVAL_WITHHOLDS) {
    it(`${name}: says "${clause}"`, () => {
      expectWithheldAndSaid(removalFixture(name), [clause]);
    });
  }

  it('every withheld fixture names a clause, and every caught one names a file', () => {
    for (const fixture of WITHHOLD_FIXTURES) {
      expect(fixture.withheld.length + fixture.removed.length, fixture.name).toBeGreaterThan(0);
      expect(fixture.withheld.length === 0 || fixture.removed.length === 0, fixture.name).toBe(true);
    }
  });

  it('the clauses are bounded: many withheld hooks beside many rated-hollow files fit the note', () => {
    const files: Record<string, string | null> = {};
    const directory = 'tests/regression/legacy-behaviour/a-long-directory-name-that-makes-each-clause-longer';
    for (let index = 0; index < 40; index += 1) {
      const scope = `${directory}/suite_${String(index).padStart(2, '0')}`;
      files[`${scope}/conftest.py`] = [
        'import pytest',
        '',
        '',
        'def pytest_collection_modifyitems(config, items):',
        '    saved = list(items)',
        '    items.clear()',
        '    items.extend(saved)',
        '',
      ].join('\n');
      files[`${scope}/test_suite.py`] = 'def test_one():\n    assert 1 == 1\n';
      files[`tests/skipped/test_skipped_${String(index).padStart(2, '0')}.py`] =
        'import pytest\n\n\n@pytest.mark.skip(reason="flaky")\ndef test_one():\n    assert 1 == 1\n';
    }
    const base = removalFixture('a1rm-py-every-test-skipped-control');
    const fixture: FalseAssuranceFixture = {
      ...base,
      name: 'a1wh-bound-many-withholds',
      commits: [{ ...(base.commits[0] ?? {}), ...files }],
    };
    const v27 = a1(fixture, V27);
    const notes = v27.notes ?? '';
    expect(notes.length).toBeLessThanOrEqual(1000);
    // The withhold sentence is there, names its first clause whole, and counts the rest.
    expect(notes).toContain(`Run-wide skip rule not applied: the hook in ${directory}/suite_00/conftest.py puts the collected items back`);
    expect(notes).toMatch(/; and \d+ more not listed\./);
    // The rated-hollow sentence is still there too.
    expect(notes).toMatch(REMOVAL_SENTENCE);
    expect(checkNoRise(scan(fixture, V17), scan(fixture, V27)).problems).toEqual([]);
  });
});

describe('no rise — v27 never scores any of these fixtures above v17', () => {
  for (const fixture of WITHHOLD_FIXTURES) {
    it(fixture.name, () => {
      expect(checkNoRise(scan(fixture, V17), scan(fixture, V27)).problems).toEqual([]);
    });
  }
});
