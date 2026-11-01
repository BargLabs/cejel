import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { REMOVAL_FIXTURES, removalFixture } from './fixtures/v27-a1-removal-fixtures.js';
import { checkNoRise } from './v27-no-rise.js';

// goal_cejel_v27_a1_test_count_overmatch_2026-11-01. Under witan-rubric-v27 A1 rates files hollow
// by three rules (conftest.py, a run-wide pytest skip, every test skipped). Item A: the note and
// the evidence name each file a rule moved, with the rule. Item B: where a rule's condition does
// not hold, v27 reads the file as v17 does. Item C: test_to_source_ratio does not move for a
// conftest.py. v17 is never changed; v27 never rises above it.

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
    generatedAt: '2026-11-01T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function a1(name: string, rubricVersion: string): WitanCriterionScore {
  const found = scan(removalFixture(name), rubricVersion).criteria.find(({ id }) => id === 'A1');
  if (!found) throw new Error(`${name}@${rubricVersion} has no A1`);
  return found;
}

function metric(score: WitanCriterionScore, name: string): { value: number; max: number } | undefined {
  const found = score.metrics.find((entry) => entry.name === name);
  return found ? { value: found.value, max: found.max } : undefined;
}

const REMOVAL_LABEL = (rule: string) => `Rated hollow under this rubric: runs no test (${rule})`;
const REMOVAL_SENTENCE = /that v17 rates non-hollow (?:is|are) rated hollow here because (?:it runs|they run) no test/;
const RULE_FINDING = /^(?:A pytest collection hook|Every test in )/;

/** v27's A1 reads the fixture exactly as v17's: same score, status and metrics, no v27 finding or note. */
function expectReadAsV17(name: string): void {
  const v17 = a1(name, V17);
  const v27 = a1(name, V27);
  expect(v27.score, name).toBe(v17.score);
  expect(v27.status, name).toBe(v17.status);
  expect(v27.metrics.map(({ name: metricName, value, max }) => [metricName, value, max]), name).toEqual(
    v17.metrics.map(({ name: metricName, value, max }) => [metricName, value, max]),
  );
  expect(v27.findings.filter(({ summary }) => RULE_FINDING.test(summary)), name).toEqual([]);
  expect(v27.notes ?? '', name).not.toMatch(REMOVAL_SENTENCE);
  expect(v27.evidence.filter(({ label }) => label.startsWith('Rated hollow')), name).toEqual([]);
}

describe('item A — v27 names every file a removal rule rates hollow, with its rule', () => {
  const named = REMOVAL_FIXTURES.filter(({ removed }) => removed.length > 0);

  it('the controls each have files to name', () => {
    expect(named.map(({ rule }) => rule).sort()).toEqual(
      expect.arrayContaining(['conftest', 'run-wide skip', 'every test skipped']),
    );
  });

  for (const fixture of named) {
    it(`${fixture.name}: the note and the evidence name ${fixture.removed.length} file(s) and the rule`, () => {
      const v17 = a1(fixture.name, V17);
      const v27 = a1(fixture.name, V27);
      const notes = v27.notes ?? '';
      expect(notes).toMatch(REMOVAL_SENTENCE);
      expect(notes).toContain(`${fixture.removed.length} file${fixture.removed.length === 1 ? '' : 's'} that v17 rates non-hollow`);
      for (const [path, rule] of fixture.removed) {
        expect(notes).toContain(`${path} (${rule})`);
        expect(
          v27.evidence.some(({ path: cited, label }) => cited === path && label === REMOVAL_LABEL(rule)),
          `${path} cited with ${rule}`,
        ).toBe(true);
      }
      expect(v27.evidence.filter(({ label }) => label.startsWith('Rated hollow')).length).toBe(fixture.removed.length);
      // The named files are exactly the ones the share moved.
      expect(metric(v27, 'non_hollow_test_share')?.value).toBe(
        (metric(v17, 'non_hollow_test_share')?.value ?? 0) - fixture.removed.length,
      );
      // v17 is unchanged: it names nothing.
      expect(v17.notes ?? '').not.toMatch(REMOVAL_SENTENCE);
      expect(v17.evidence.filter(({ label }) => label.startsWith('Rated hollow'))).toEqual([]);
    });
  }

  it('a list too long for the note is bounded by the length limit and says how many were not listed', () => {
    const depth = 'tests/integration/suites/regression/legacy-behaviour/very-long-directory-name-for-the-bound';
    const files: Record<string, string> = {};
    for (let index = 0; index < 60; index += 1) {
      files[`${depth}/test_module_${String(index).padStart(2, '0')}.py`] =
        'import pytest\n\n\n@pytest.mark.skip(reason="flaky")\ndef test_one():\n    assert 1 == 1\n';
    }
    const base = removalFixture('a1rm-py-every-test-skipped-control');
    const fixture: FalseAssuranceFixture = {
      ...base,
      name: 'a1rm-bound-many-removals',
      commits: [{ ...(base.commits[0] ?? {}), ...files }],
    };
    const v27 = scan(fixture, V27).criteria.find(({ id }) => id === 'A1');
    const notes = v27?.notes ?? '';
    expect(notes.length).toBeLessThanOrEqual(1000);
    expect(notes).toContain('61 files that v17 rates non-hollow are rated hollow here');
    const more = /, and (\d+) more not listed\.$/.exec(notes);
    expect(more).not.toBeNull();
    const listed = notes.match(/ \(every test skipped\)/g)?.length ?? 0;
    expect(listed).toBeGreaterThan(0);
    expect(listed + Number(more?.[1])).toBe(61);
    // Evidence is bounded as the test-file evidence is: eight.
    expect(v27?.evidence.filter(({ label }) => label.startsWith('Rated hollow')).length).toBe(8);
  });
});

describe('item B — where a removal rule\'s condition does not hold, v27 reads the file as v17 does', () => {
  // Each of these over-matched before this change (goal_cejel_v27_a1_test_count_overmatch_2026-11-01).
  const OVER_MATCHED: readonly [name: string, why: string][] = [
    ['a1rm-conftest-collected-by-python-files', 'python_files names conftest.py, so pytest collects its tests'],
    ['a1rm-hook-loops-over-module-list', 'the hook takes no items parameter, so its loop is not over the collected items'],
    ['a1rm-hook-clear-then-helper-refill', 'a helper given items after the clear may put them back'],
    ['a1rm-pytestmark-parametrize-one-param-skipped', 'the skip marks one parameter, inside a parametrize mark'],
    ['a1rm-pytestmark-list-parametrize-one-param-skipped', 'the same, inside a list'],
    ['a1rm-py-python-functions-config', 'python_functions collects tests the reader does not see'],
    ['a1rm-pytest-skipping-plugin-disabled', "-p no:skipping disables pytest's skip marks"],
  ];
  for (const [name, why] of OVER_MATCHED) {
    it(`over-match fixed: ${name} (${why})`, () => {
      expectReadAsV17(name);
    });
  }

  // Each of these v27 already read correctly before this change; they stay as regression tests.
  const ALREADY_HANDLED: readonly string[] = [
    'a1rm-conftest-name-test-prefix',
    'a1rm-conftest-name-test-suffix',
    'a1rm-conftest-directory',
    'a1rm-hook-marker-filter',
    'a1rm-hook-deselect-filter',
    'a1rm-hook-name-filter',
    'a1rm-hook-platform-conditional',
    'a1rm-hook-environment-conditional',
    'a1rm-hook-option-early-return',
    'a1rm-hook-option-short-circuit',
    'a1rm-hook-skipif-platform',
    'a1rm-hook-conditional-fixture',
    'a1rm-pytestmark-list-conditional-skip',
    'a1rm-pytestmark-list-with-skipif',
    'a1rm-pytestmark-skipif-nonliteral',
    'a1rm-pytestmark-inside-class',
    'a1rm-pytestmark-parametrize-ids-skip',
    'a1rm-py-one-skipped-among-several',
    'a1rm-py-parametrize-ids-skip',
    'a1rm-py-python-classes-config',
    'a1rm-js-describe-skip-beside-live-suite',
    'a1rm-js-it-skip-beside-local-helper',
    'a1rm-js-it-skip-beside-imported-helper',
    'a1rm-js-each-ids-skip',
    'a1rm-js-every-test-skipped-control',
    'a1rm-conftest-only-change',
  ];
  for (const name of ALREADY_HANDLED) {
    it(`regression: ${name}`, () => {
      expectReadAsV17(name);
    });
  }

  it('every fixture with nothing to name is listed above', () => {
    const listed = new Set([...OVER_MATCHED.map(([name]) => name), ...ALREADY_HANDLED]);
    expect(REMOVAL_FIXTURES.filter(({ removed }) => removed.length === 0).map(({ name }) => name).sort()).toEqual(
      [...listed].sort(),
    );
  });
});

describe('item C — test_to_source_ratio does not move for a conftest.py', () => {
  it('a conftest.py beside a live suite: the ratio is v17\'s', () => {
    for (const name of ['a1rm-conftest-only-change', 'a1rm-conftest-asserting-helper', 'a1rm-conftest-nonroot-defines-tests']) {
      expect(metric(a1(name, V27), 'test_to_source_ratio'), name).toEqual(metric(a1(name, V17), 'test_to_source_ratio'));
    }
  });

  it('the asserting conftest.py still leaves the non-hollow share, named, and A1 does not rise above v17', () => {
    const v17 = a1('a1rm-conftest-asserting-helper', V17);
    const v27 = a1('a1rm-conftest-asserting-helper', V27);
    expect(metric(v27, 'non_hollow_test_share')).toEqual({
      value: (metric(v17, 'non_hollow_test_share')?.value ?? 0) - 1,
      max: metric(v17, 'non_hollow_test_share')?.max,
    });
    expect(v27.score).toBeLessThanOrEqual(v17.score);
  });
});

describe('no rise — v27 never scores any of these fixtures above v17', () => {
  for (const fixture of REMOVAL_FIXTURES) {
    it(fixture.name, () => {
      expect(checkNoRise(scan(fixture, V17), scan(fixture, V27)).problems).toEqual([]);
    });
  }
});
