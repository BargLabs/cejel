import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { WitanReport } from '../schemas.js';

import { serializeWitanReport } from '../attestation.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V27, WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';
import { buildFalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { ALLOWLIST_FIXTURES } from './fixtures/v27-a1-allowlist-fixtures.js';

// goal_cejel_v27_a1_builtin_copy_withhold_2026-11-17 (#664, operator ruling of 17 Nov, option B).
// v27 never credits a copy of pytest's collected items made through a builtin (`list(items)`,
// `tuple(items)`, a strict helper restoring from `list(src)` or `tuple(src)`): a module from outside
// the repository can replace the builtin, and Cejel does not read it. The hook is named as not read,
// as main already named it where a tracked file could reach builtins; the rule makes no claim on it.
//
// The pins in fixtures/v27-a1-builtin-copy-main-pins.json were captured from main's scoring code
// (4689031ce) with this change's fixtures, before any code change. They hold, for every item G
// fixture: every rubric but v27's report hash; v27's scoring surface (the withhold moves no score,
// status or finding count); and, for each copy that calls no builtin, v27's report hash.

const V27 = WITAN_RUBRIC_VERSION_V27;
const OTHER_RUBRICS = WITAN_SELECTABLE_RUBRIC_VERSIONS.filter((version) => version !== V27);

const PINS_PATH = new URL('./fixtures/v27-a1-builtin-copy-main-pins.json', import.meta.url);
const CAPTURE = process.env.V27_A1_BUILTIN_COPY_PINS;

const FIXTURES = ALLOWLIST_FIXTURES.filter(({ item }) => item === 'G');
const NAMES = FIXTURES.map(({ name }) => name);
/** The copies that call no builtin (`items[:]`, `items.copy()`, `[*items]`): v27 reads them as main does. */
const NO_BUILTIN_CONTROLS = [
  'a1al-g-control-slice-copy-beside-builtins',
  'a1al-g-control-star-copy-beside-builtins',
  'a1al-g-control-method-copy-beside-builtins',
];

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${rubricVersion}/${name}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const fixture = FIXTURES.find((entry) => entry.name === name);
    if (!fixture) throw new Error(`unknown item G fixture: ${name}`);
    repo = buildFalseAssuranceFixture(fixture);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'builtin-copy-fixture',
    productDisplayName: 'Builtin copy fixture',
    generatedAt: '2026-11-19T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** What the withhold must not move: every criterion's score, status and finding count, and the composite. */
function scoringSurface(scored: WitanReport): string {
  return JSON.stringify({
    composite: scored.codeTrustScore ?? null,
    verdict: scored.verdict ?? null,
    criteria: scored.criteria.map(({ id, score, status, findings }) => [id, score, status, findings.length]),
  });
}

describe('#664: the item G fixtures against main', () => {
  it('names the three copy forms that call no builtin among the item G fixtures', () => {
    for (const name of NO_BUILTIN_CONTROLS) expect(NAMES, name).toContain(name);
  });

  it.runIf(CAPTURE !== undefined)('writes the pins', () => {
    const pins: Record<string, string> = {};
    for (const name of NAMES) {
      for (const rubricVersion of OTHER_RUBRICS) pins[`${rubricVersion}/${name}`] = sha256(serializeWitanReport(report(name, rubricVersion)));
      pins[`v27-scoring-surface/${name}`] = scoringSurface(report(name, V27));
    }
    for (const name of NO_BUILTIN_CONTROLS) pins[`${V27}/${name}`] = sha256(serializeWitanReport(report(name, V27)));
    writeFileSync(CAPTURE ?? '', `${JSON.stringify(pins, null, 2)}\n`);
  });

  describe.runIf(CAPTURE === undefined)('checks', () => {
    const pins = (): Record<string, string> => JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<string, string>;

    it('pins every rubric but v27 and v27\'s scoring surface on every fixture, and v27 whole on the three controls', () => {
      expect(Object.keys(pins())).toHaveLength(NAMES.length * (OTHER_RUBRICS.length + 1) + NO_BUILTIN_CONTROLS.length);
    });

    it('v17 to v26: every report is byte-identical to main', () => {
      const pinned = pins();
      for (const name of NAMES) {
        for (const rubricVersion of OTHER_RUBRICS) {
          const key = `${rubricVersion}/${name}`;
          expect(sha256(serializeWitanReport(report(name, rubricVersion))), key).toBe(pinned[key]);
        }
      }
    });

    it('v27: items[:], items.copy() and [*items] are byte-identical to main', () => {
      const pinned = pins();
      for (const name of NO_BUILTIN_CONTROLS) {
        expect(sha256(serializeWitanReport(report(name, V27))), name).toBe(pinned[`${V27}/${name}`]);
      }
    });

    it('v27: no score, status, finding count, composite or verdict moves from main on any fixture', () => {
      const pinned = pins();
      for (const name of NAMES) expect(scoringSurface(report(name, V27)), name).toBe(pinned[`v27-scoring-surface/${name}`]);
    });
  });
});

describe('#664: a copy through a builtin is never credited under v27', () => {
  const CLAUSE = 'copies the collected items through a builtin, which v27 does not credit';
  const a1Notes = (name: string) => report(name, V27).criteria.find(({ id }) => id === 'A1')?.notes ?? '';

  it.each([
    ['a1al-g-control-list-copy-no-builtins-named', 'saved = list(items)'],
    ['a1al-g-tuple-copy-no-builtins-named', 'saved = tuple(items)'],
    ['a1al-g-helper-list-src-no-builtins-named', 'refill(items, saved)'],
  ])('%s: no tracked file reaches builtins, and the hook is named at `%s`, with no file', (name, statement) => {
    const notes = a1Notes(name);
    expect(notes).toContain(`ook not read: \`${statement}\` in tests/conftest.py ${CLAUSE}`);
    expect(notes).not.toContain('puts the collected items back');
    expect(notes).not.toMatch(/may replace|could not be listed/);
    const cited = report(name, V27).criteria.find(({ id }) => id === 'A1')?.evidence ?? [];
    expect(cited.some(({ path, label }) => path === 'tests/conftest.py' && label === `pytest collection hook not read (${statement})`)).toBe(true);
  });

  it('a fixture where a tracked file reaches builtins names the hook the same way, and names no file', () => {
    const notes = a1Notes('a1al-g-imported-module-patches-builtins-list');
    expect(notes).toContain(`ook not read: \`saved = list(items)\` in tests/conftest.py ${CLAUSE}`);
    expect(notes).not.toContain('tests/helpers.py');
  });
});
