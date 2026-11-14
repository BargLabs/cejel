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
import { INVESTIGATION_FIXTURES } from './fixtures/b3-publishing-gates-fixtures.js';
import {
  DISCLOSED,
  MANY_BUILDKITE_FILES,
  NOT_DISCLOSED,
  UNREAD_CI_CONFIG_FIXTURES,
} from './fixtures/b3-unread-ci-config-fixtures.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// v27 B3, unread CI configuration disclosure (2026-11-13; refs #517; operator ruling of 13 Nov on
// item C of the B3 publishing-rule PR: disclose only). Where v27's publishing rule takes
// `default_branch_ci_depth` to 0 (v17 counts more than 0 on the same commit), B3's note names each CI
// configuration outside `isCiWorkflow`'s list (`.travis.yml`, `.drone.yml`,
// `bitbucket-pipelines.yml`, anything under `.buildkite/`, `appveyor.yml`), matched by path alone,
// as "a CI configuration Cejel does not read". Note text only: no score, status, finding, composite
// or verdict moves. The pins were captured from main de9f86f59 before any code change: v17 to v26
// whole reports; under v27, the whole report where no sentence is added, and where one is, the
// report without B3's note and B3's note with the sentence cut from its end.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);

const PINS_PATH = new URL('./fixtures/b3-unread-ci-config-main-pins.json', import.meta.url);
const CAPTURE = process.env.B3_UNREAD_CI_CONFIG_PINS;

const ALL_FIXTURES = [...INVESTIGATION_FIXTURES, ...UNREAD_CI_CONFIG_FIXTURES];
const PUSH_CI = 'investigate-travis-scripts-push-ci-ungated-deploy';
const PR_CI = 'investigate-travis-scripts-pr-ci-ungated-deploy';
const DISCLOSED_NAMES: ReadonlySet<string> = new Set([PUSH_CI, ...DISCLOSED.map(({ name }) => name)]);

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = ALL_FIXTURES.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'unread-ci-config-fixture',
    productDisplayName: 'Unread CI configuration fixture',
    generatedAt: '2026-11-13T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(name: string, rubricVersion: string, id: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

const metricValue = (score: WitanCriterionScore, name: string): number | undefined =>
  score.metrics.find((entry) => entry.name === name)?.value;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PHRASE = 'a CI configuration Cejel does not read';
// The metric's own words: default_branch_ci_depth counts CI workflows that target pull requests or
// the default branch.
const LEAD = 'With the publishing workflows not counted, no workflow B3 counts targets pull requests or the default branch;';
const TAIL = 'pull requests or the default branch is not known.';

/** The sentence as B3's note ends with it: the lead, the names, then what is and is not read. */
const sentence = (names: string, count: number): string =>
  `${LEAD} ${names} ${count === 1 ? `is ${PHRASE}` : `are each ${PHRASE}`}, matched by path alone with ${count === 1 ? 'its' : 'their'} contents not read, so whether ${count === 1 ? 'it checks' : 'they check'} ${TAIL}`;

/** B3's v27 note with the sentence, and the space before it, cut from its end. */
function noteBeforeSentence(name: string): string {
  const notes = criterion(name, V27, 'B3').notes ?? '';
  const at = notes.indexOf(` ${LEAD}`);
  return at === -1 ? notes : notes.slice(0, at);
}

/** The v27 report with B3's note removed, serialized. */
function withoutB3Note(name: string): string {
  const scored = report(name, V27);
  return serializeWitanReport({
    ...scored,
    criteria: scored.criteria.map((entry) => (entry.id === 'B3' ? { ...entry, notes: undefined } : entry)),
  });
}

describe('item A — under v27, where the publishing rule takes the default-branch count to 0, B3 names the CI configurations Cejel does not read', () => {
  it('the item C push-CI fixture names .travis.yml at the end of B3\'s note, the count 1 under v17 and 0 under v27', () => {
    expect(metricValue(criterion(PUSH_CI, V17, 'B3'), 'default_branch_ci_depth')).toBe(1);
    expect(metricValue(criterion(PUSH_CI, V27, 'B3'), 'default_branch_ci_depth')).toBe(0);
    expect(criterion(PUSH_CI, V27, 'B3').notes ?? '').toMatch(new RegExp(` ${escaped(sentence('.travis.yml', 1))}$`));
  });

  it('every listed kind is named, in path order', () => {
    expect(criterion('unread-ci-five-kinds-push-ci-ungated-deploy', V27, 'B3').notes ?? '').toContain(
      sentence('.buildkite/pipeline.yml, .drone.yml, .travis.yml, appveyor.yml and bitbucket-pipelines.yml', 5),
    );
  });

  it('where the deploy is the only workflow, .travis.yml is named', () => {
    expect(criterion('unread-ci-travis-deploy-only', V27, 'B3').notes ?? '').toContain(sentence('.travis.yml', 1));
  });

  it('more files than the note has room for: names in path order, then a count for the rest, within the note limit', () => {
    const notes = criterion('unread-ci-many-buildkite-push-ci-ungated-deploy', V27, 'B3').notes ?? '';
    expect(notes.length).toBeLessThanOrEqual(1000);
    const match = new RegExp(`${escaped(LEAD)} (.+) and (\\d+) more are each ${escaped(PHRASE)}`).exec(notes);
    expect(match, notes).not.toBeNull();
    const named = (match?.[1] ?? '').split(', ');
    expect(named.length).toBeGreaterThan(0);
    expect(named).toEqual(MANY_BUILDKITE_FILES.slice(0, named.length));
    expect(named.length + Number(match?.[2])).toBe(MANY_BUILDKITE_FILES.length);
  });

  it.each([...DISCLOSED_NAMES])('%s: the sentence ends B3\'s v27 note and appears nowhere else; v17 names nothing', (name) => {
    const v27B3 = criterion(name, V27, 'B3');
    expect(v27B3.notes ?? '').toContain(PHRASE);
    expect((v27B3.notes ?? '').endsWith(TAIL)).toBe(true);
    expect(criterion(name, V17, 'B3').notes ?? '').not.toContain(PHRASE);
    expect(withoutB3Note(name)).not.toContain(PHRASE);
  });
});

describe('item A controls — the note gains nothing', () => {
  it('the item C pull-request-CI fixture (count 2 to 1) names nothing', () => {
    expect(metricValue(criterion(PR_CI, V17, 'B3'), 'default_branch_ci_depth')).toBe(2);
    expect(metricValue(criterion(PR_CI, V27, 'B3'), 'default_branch_ci_depth')).toBe(1);
    expect(criterion(PR_CI, V27, 'B3').notes ?? '').not.toContain(PHRASE);
  });

  it('a counted default-branch workflow beside .travis.yml leaves the count above 0', () => {
    expect(metricValue(criterion('unread-ci-travis-push-main-ci-ungated-deploy', V27, 'B3'), 'default_branch_ci_depth')).toBe(1);
    expect(metricValue(criterion('unread-ci-travis-push-main-ci-no-deploy', V27, 'B3'), 'default_branch_ci_depth')).toBe(1);
  });

  it.each(NOT_DISCLOSED.map(({ name }) => name))('%s: names nothing under any rubric', (name) => {
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      expect(JSON.stringify(report(name, rubricVersion)), `${name}@${rubricVersion}`).not.toContain(PHRASE);
    }
  });
});

describe('no rise — v27 never above v17 on any fixture here', () => {
  it('checkNoRise and lostFindings find nothing', () => {
    for (const { name } of ALL_FIXTURES) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });
});

describe('byte identity — every rubric but v27 equals main; under v27 the appended sentence is the only change', () => {
  const allPins = (): Record<string, string> => {
    const pins: Record<string, string> = {};
    for (const { name } of ALL_FIXTURES) {
      for (const rubricVersion of OTHER_RUBRICS) {
        pins[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
      }
      if (DISCLOSED_NAMES.has(name)) {
        pins[`${V27}/${name}#without-b3-note`] = sha256(withoutB3Note(name));
        pins[`${V27}/${name}#b3-note-before-sentence`] = sha256(noteBeforeSentence(name));
      } else {
        pins[`${V27}/${name}`] = sha256(serializeWitanReport(report(name, V27)));
      }
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
