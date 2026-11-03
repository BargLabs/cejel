import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { RUN_FIXTURES, type RunFixture } from './fixtures/v27-a1-run-fixtures.js';
import { checkNoRise } from './v27-no-rise.js';

// goal_cejel_v27_a1_pytest_runs_and_config_2026-11-02 (#633, #643). Under witan-rubric-v27 the
// reader reads a pytest run as pytest would, or names it as not read and applies no removal rule
// to a file it could collect (items A and B); it searches for the configuration file as pytest
// does, and says once where a run could read one above the repository's root (item C); and each
// setting clause carries an evidence pointer to its line (item E).

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
    generatedAt: '2026-11-03T00:00:00.000Z',
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
const NOT_APPLIED = /not applied: |not read: /i;

function expectCaught(fixture: RunFixture): void {
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
  expect(share(v27), fixture.name).toBe((share(v17) ?? 0) - fixture.removed.length);
  expect(notes, fixture.name).not.toMatch(NOT_APPLIED);
}

function expectWithheldAndSaid(fixture: RunFixture): void {
  const v17 = a1(fixture, V17);
  const v27 = a1(fixture, V27);
  expect(v27.score, fixture.name).toBe(v17.score);
  expect(v27.status, fixture.name).toBe(v17.status);
  expect(v27.metrics.map(({ name, value, max }) => [name, value, max]), fixture.name).toEqual(
    v17.metrics.map(({ name, value, max }) => [name, value, max]),
  );
  expect(v27.findings.filter(({ summary }) => RULE_FINDING.test(summary)), fixture.name).toEqual([]);
  expect(v27.evidence.filter(({ label }) => label.startsWith('Rated hollow')), fixture.name).toEqual([]);
  const notes = v27.notes ?? '';
  for (const clause of fixture.withheld) expect(notes.toLowerCase(), fixture.name).toContain(clause.toLowerCase());
  expect(v17.notes ?? '', fixture.name).not.toMatch(NOT_APPLIED);
}

function expectPointers(fixture: RunFixture): void {
  const v27 = a1(fixture, V27);
  for (const [path, line, label] of fixture.pointers ?? []) {
    expect(
      v27.evidence.some((pointer) => pointer.path === path && pointer.line === line && pointer.label.startsWith(label)),
      `${fixture.name}: ${path}:${line} cited as ${label}; cited ${JSON.stringify(v27.evidence.map(({ path: p, line: l, label: t }) => [p, l, t]))}`,
    ).toBe(true);
  }
}

for (const item of ['A', 'B', 'C', 'E', 'F', 'G'] as const) {
  describe(`item ${item}`, () => {
    for (const fixture of RUN_FIXTURES.filter((entry) => entry.item === item)) {
      if (fixture.withheld.length === 0) {
        it(`still caught: ${fixture.name} — ${fixture.purpose}`, () => expectCaught(fixture));
      } else {
        it(`withheld and said: ${fixture.name} — ${fixture.purpose}`, () => expectWithheldAndSaid(fixture));
      }
      if (fixture.pointers !== undefined) {
        it(`evidence pointers: ${fixture.name}`, () => expectPointers(fixture));
      }
      if (fixture.sentence !== undefined) {
        it(`says once: ${fixture.name}`, () => {
          const notes = a1(fixture, V27).notes ?? '';
          expect(notes.split(fixture.sentence ?? '').length - 1, fixture.name).toBe(1);
          expect(notes.length).toBeLessThanOrEqual(1000);
        });
      }
    }
  });
}

describe('item E — setting pointers count past eight with the other pointers', () => {
  it('nine setting clauses: eight carry pointers, and the note says the ninth carries none', () => {
    const files: Record<string, string | null> = {};
    const steps: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      const directory = `suite_${index}`;
      files[`${directory}/test_skipped.py`] =
        'import pytest\n\n\n@pytest.mark.skip(reason="flaky")\ndef test_one():\n    assert 1 == 1\n';
      files[`${directory}/pytest.ini`] = '[pytest]\naddopts = -p no:skipping\n';
      steps.push(`      - run: pytest ${directory}`);
    }
    const base = RUN_FIXTURES.find(({ name }) => name === 'a1run-pointer-pyproject-setting') as RunFixture;
    const fixture: RunFixture = {
      ...base,
      name: 'a1run-pointer-count',
      commits: [
        {
          ...(base.commits[0] ?? {}),
          'pyproject.toml': null,
          'tests/test_cache.py': null,
          '.github/workflows/ci.yml': [
            'name: ci',
            'on:',
            '  push:',
            'jobs:',
            '  test:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            ...steps,
            '',
          ].join('\n'),
          ...files,
        },
      ],
    };
    const v27 = a1(fixture, V27);
    const notes = v27.notes ?? '';
    expect(notes.length).toBeLessThanOrEqual(1000);
    expect(v27.evidence.filter(({ label }) => label.startsWith('pytest setting in force')).length).toBe(8);
    expect(notes).toMatch(/the 1 named after the first 8 carries no evidence pointer/);
  });
});

describe('no rise — v27 never scores any of these fixtures above v17', () => {
  for (const fixture of RUN_FIXTURES) {
    it(fixture.name, () => {
      expect(checkNoRise(scan(fixture, V17), scan(fixture, V27)).problems).toEqual([]);
    });
  }
});
