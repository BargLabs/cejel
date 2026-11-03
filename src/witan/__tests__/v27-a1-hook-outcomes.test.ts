import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { ALLOWLIST_FIXTURES, type AllowlistFixture } from './fixtures/v27-a1-allowlist-fixtures.js';
import { HOOK_OUTCOME_FIXTURES, notedPath, type HookOutcomeFixture } from './fixtures/v27-a1-hook-outcome-fixtures.js';
import { checkNoRise } from './v27-no-rise.js';

type OutcomeFixture = HookOutcomeFixture | AllowlistFixture;

// goal_cejel_v27_a1_restore_proof_and_hookwrapper_2026-11-02 (#631, #632, #634). Under
// witan-rubric-v27 every pytest_collection_modifyitems hook that touches `items` reaches one of
// three outcomes: it deselects everything (the rule applies), it puts the items back (the rule is
// withheld and said), or it is not read (the rule makes no claim, and the hook is named).

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

const reports = new Map<string, WitanReport>();
const repos = new Map<string, string>();

function scan(fixture: OutcomeFixture, rubricVersion: string): WitanReport {
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

function a1(fixture: OutcomeFixture, rubricVersion: string): WitanCriterionScore {
  const found = scan(fixture, rubricVersion).criteria.find(({ id }) => id === 'A1');
  if (!found) throw new Error(`${fixture.name}@${rubricVersion} has no A1`);
  return found;
}

const share = (score: WitanCriterionScore) => score.metrics.find(({ name }) => name === 'non_hollow_test_share')?.value;
const REMOVAL_SENTENCE = /that v17 rates non-hollow (?:is|are) rated hollow here because (?:it runs|they run) no test/;
const RULE_FINDING = /^(?:A pytest collection hook|Every test in )/;
const NOT_APPLIED = /not applied: /i;
const NOT_READ = /hook not read: /i;
/** The rule as A1's note writes it: the path it names in the note's form. */
const notedRule = (rule: string) => rule.replace(/^(run-wide skip: (?:hook|pytestmark) in )(.*)$/, (_, lead: string, path: string) => `${lead}${notedPath(path)}`);

function expectDeselects(fixture: OutcomeFixture): void {
  const v17 = a1(fixture, V17);
  const v27 = a1(fixture, V27);
  const notes = v27.notes ?? '';
  const removed = fixture.removed ?? [];
  expect(notes, fixture.name).toMatch(REMOVAL_SENTENCE);
  for (const [path, rule] of removed) {
    expect(notes, fixture.name).toContain(`${notedPath(path)} (${notedRule(rule)})`);
  }
  for (const [path, rule] of removed.slice(0, 8)) {
    expect(
      v27.evidence.some(({ path: cited, label }) => cited === path && label === `Rated hollow under this rubric: runs no test (${rule})`),
      `${fixture.name}: ${path} cited`,
    ).toBe(true);
  }
  expect(share(v27), fixture.name).toBe((share(v17) ?? 0) - removed.length);
  const alsoSaid = 'alsoSaid' in fixture ? fixture.alsoSaid : undefined;
  if (alsoSaid !== undefined) {
    // Another hook, or a run, withholds the rule for some file, and the note says so.
    expect(notes.toLowerCase(), fixture.name).toContain(alsoSaid.toLowerCase());
  } else {
    expect(notes, fixture.name).not.toMatch(NOT_APPLIED);
  }
  expect(notes, fixture.name).not.toMatch(NOT_READ);
}

function expectReadAsV17(fixture: OutcomeFixture): void {
  const v17 = a1(fixture, V17);
  const v27 = a1(fixture, V27);
  expect(v27.score, fixture.name).toBe(v17.score);
  expect(v27.status, fixture.name).toBe(v17.status);
  expect(v27.metrics.map(({ name, value, max }) => [name, value, max]), fixture.name).toEqual(
    v17.metrics.map(({ name, value, max }) => [name, value, max]),
  );
  expect(v27.findings.filter(({ summary }) => RULE_FINDING.test(summary)), fixture.name).toEqual([]);
  expect(v27.evidence.filter(({ label }) => label.startsWith('Rated hollow')), fixture.name).toEqual([]);
  expect(v17.notes ?? '', fixture.name).not.toMatch(NOT_APPLIED);
  expect(v17.notes ?? '', fixture.name).not.toMatch(NOT_READ);
}

function expectOutcome(fixture: OutcomeFixture): void {
  const v27 = a1(fixture, V27);
  const notes = v27.notes ?? '';
  expect(notes.length, fixture.name).toBeLessThanOrEqual(1000);
  if (fixture.outcome === 'deselects') {
    expectDeselects(fixture);
    return;
  }
  expectReadAsV17(fixture);
  if (fixture.outcome === 'untouched') {
    expect(notes, fixture.name).not.toMatch(NOT_APPLIED);
    expect(notes, fixture.name).not.toMatch(NOT_READ);
    return;
  }
  const clause = fixture.clause ?? '';
  if (typeof clause === 'string') expect(notes.toLowerCase(), fixture.name).toContain(clause.toLowerCase());
  else expect(notes, fixture.name).toMatch(clause);
  if (fixture.outcome === 'restores') {
    expect(notes, fixture.name).not.toMatch(NOT_READ);
    // The hook is cited at its def, so its path is exact (item E).
    expect(v27.evidence.some(({ label }) => label === 'pytest collection hook whose clear is not applied'), fixture.name).toBe(true);
    return;
  }
  // Not read: the hook is cited at its def, with the reason, so its path is exact.
  expect(v27.evidence.some(({ label }) => label.startsWith('pytest collection hook not read')), fixture.name).toBe(true);
  expect(notes, fixture.name).not.toContain('puts the collected items back');
}

for (const item of ['A', 'B', 'C', 'D', 'E'] as const) {
  describe(`item ${item}`, () => {
    for (const fixture of HOOK_OUTCOME_FIXTURES.filter((entry) => entry.item === item)) {
      it(`${fixture.outcome}: ${fixture.name} — ${fixture.purpose}`, () => expectOutcome(fixture));
    }
  });
}

// goal_cejel_v27_a1_restore_proof_v2_2026-11-02 (supersedes #638): outcome 2 is an allowlist over
// the whole hook body, read as tokenised logical statements; nothing else reaches it.
for (const item of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const) {
  describe(`allowlist round, item ${item}`, () => {
    for (const fixture of ALLOWLIST_FIXTURES.filter((entry) => entry.item === item)) {
      it(`${fixture.outcome}: ${fixture.name} — ${fixture.purpose}`, () => expectOutcome(fixture));
    }
  });
}

describe('item E — evidence pointers', () => {
  it('a note that lists more rated files than carry evidence pointers says how many carry none', () => {
    const fixture = HOOK_OUTCOME_FIXTURES.find(({ name }) => name === 'a1ho-e-many-rated-files') as HookOutcomeFixture;
    const v27 = a1(fixture, V27);
    expect(v27.evidence.filter(({ label }) => label.startsWith('Rated hollow')).length).toBe(8);
    expect(v27.notes ?? '').toContain('the 3 listed after the first 8 carry no evidence pointer');
  });
});

describe('no rise — v27 never scores any of these fixtures above v17', () => {
  for (const fixture of [...HOOK_OUTCOME_FIXTURES, ...ALLOWLIST_FIXTURES]) {
    it(fixture.name, () => {
      expect(checkNoRise(scan(fixture, V17), scan(fixture, V27)).problems).toEqual([]);
    });
  }
});
