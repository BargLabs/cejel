import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import {
  computeWitanRubricBehaviourComponents,
  digestWitanRubricBehaviourComponents,
  projectWitanScoringSurface,
  rubricBehaviourFingerprint,
  WITAN_RUBRIC_BEHAVIOUR_FINGERPRINT_PATTERN,
  WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS,
  type WitanRubricBehaviourComponents,
  type WitanScoringSurfaceEntry,
} from '../rubric-fingerprint.js';
import {
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import { WITAN_RUBRIC } from '../rubric.js';
import { BEHAVIOUR_CORPUS, BEHAVIOUR_CORPUS_HEAD_SHAS, buildBehaviourFixture, fixtureHeadSha } from './fixtures/behaviour-corpus.js';

// THE BEHAVIOUR FINGERPRINT GUARD — detect a scoring change directly, not from a version string.
//
// `leaderboard/RUBRIC_CHANGELOG.md` states the rule: every change to how Cejel scores a repository
// is recorded there with a full before/after delta across the published corpus, and a release
// shipping without an entry "is a bug, not a release". Its named enforcement fails the build when
// `WITAN_RUBRIC_VERSION` changes without a matching entry. That control is keyed on an identifier
// the tool's author controls, so it cannot see a behaviour change made UNDER an unchanged
// identifier — which is exactly what happened in 0.4.9, five times, under the calibrated public
// default. It did not fire, correctly by its own definition, and nothing else noticed.
//
// This guard measures instead. It scores a fixed committed corpus of synthetic repositories under
// every selectable rubric and compares the scoring-relevant output against committed pins. It
// does not consult, trust, or read `rubricVersion` in deciding whether anything moved.
//
// WHEN THIS FAILS. The failure names the rubric and the criteria. There are exactly two
// legitimate resolutions and both are writing, not re-running:
//
//   1. Scoring really changed. Add an entry to `leaderboard/RUBRIC_CHANGELOG.md` carrying the
//      full before/after delta across the PUBLISHED corpus (`leaderboard/corpus.json`) — not this
//      fixture corpus, which is a detector, not a calibration record — and re-pin below.
//   2. Scoring did not change and the fixture corpus moved for another reason (a fixture edit, a
//      git version that writes a different tree). Say so in the changelog entry, in those words,
//      with the reason, and re-pin.
//
// There is deliberately NO script that regenerates these pins. A guard that can be silenced by
// rerunning something is theatre, and this one exists precisely because its predecessor never
// fired. The re-pin is a hand edit, and `cites every pinned fingerprint` below requires the new
// digest to appear in RUBRIC_CHANGELOG.md, so the record cannot stay silent about the repair.

const PINS_PATH = fileURLToPath(
  new URL('./fixtures/behaviour-fingerprint-pins.json', import.meta.url),
);
const CHANGELOG_PATH = fileURLToPath(new URL('../../../leaderboard/RUBRIC_CHANGELOG.md', import.meta.url));

/** Pinned, so a fixture's B4 freshness year is a property of the corpus and not of the calendar. */
const SCAN_GENERATED_AT = '2026-09-15T00:00:00.000Z';

/**
 * Criteria no repository scan can reach, named rather than left as an implicit hole.
 *
 * B1 (dispatch trace) and B5 (verified learning trace) lost their collectors in
 * witan-rubric-v3-2026-07-13: they were reachable only from the source monorepo's own file paths
 * and could never be reproduced by a stranger running `cejel .` on the same repository. No public
 * scan has emitted a signal for either since. They are not a corpus gap that more fixtures would
 * close — no fixture CAN reach them — and the assertion below fails if that ever stops being
 * true, so the gap can neither widen nor close in silence.
 */
const STRUCTURALLY_UNREACHABLE_CRITERIA = ['B1', 'B5'] as const;

const PINNED_COMPONENTS = JSON.parse(readFileSync(PINS_PATH, 'utf8')) as Record<
  string,
  WitanRubricBehaviourComponents
>;

const measured = new Map<string, { entries: WitanScoringSurfaceEntry[]; components: WitanRubricBehaviourComponents }>();

beforeAll(() => {
  const dirs = new Map<string, string>();
  for (const fixture of BEHAVIOUR_CORPUS) {
    const dir = buildBehaviourFixture(fixture);
    expect(
      fixtureHeadSha(dir),
      `${fixture.name}: the fixture does not reproduce on this machine, so nothing measured from ` +
        'it is interpretable. This is a corpus-reproducibility failure, not a scoring change.',
    ).toBe(BEHAVIOUR_CORPUS_HEAD_SHAS[fixture.name]);
    dirs.set(fixture.name, dir);
  }
  for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    const entries = BEHAVIOUR_CORPUS.map((fixture) => ({
      name: fixture.name,
      surface: projectWitanScoringSurface(
        scoreRepoWithPublicCejel({
          repoPath: dirs.get(fixture.name) as string,
          productSlug: fixture.name,
          productDisplayName: fixture.name,
          generatedAt: SCAN_GENERATED_AT,
          rubricVersion,
          ingestPatterns: [],
          autoDiscoverIngest: false,
        }),
      ),
    }));
    measured.set(rubricVersion, {
      entries,
      components: computeWitanRubricBehaviourComponents(entries),
    });
  }
}, 600_000);

describe('the corpus covers what it claims to cover', () => {
  it('pins exactly the selectable rubrics — a new rubric cannot ship unmeasured', () => {
    expect(Object.keys(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS).sort()).toEqual(
      [...WITAN_SELECTABLE_RUBRIC_VERSIONS].sort(),
    );
    expect(
      Object.keys(PINNED_COMPONENTS).sort(),
      'the component pins and the published fingerprints must cover the same rubrics',
    ).toEqual([...WITAN_SELECTABLE_RUBRIC_VERSIONS].sort());
  });

  it('measures every criterion a repository scan can reach, and names the ones it cannot', () => {
    const { entries } = measured.get(WITAN_LAST_CALIBRATED_RUBRIC_VERSION) as {
      entries: WitanScoringSurfaceEntry[];
    };
    const unmeasurable = WITAN_RUBRIC.map(({ id }) => id).filter((id) =>
      entries.every(({ surface }) => {
        const criterion = surface.criteria.find((candidate) => candidate.id === id);
        return (
          criterion === undefined ||
          criterion.status === 'not_applicable' ||
          criterion.status === 'insufficient_data'
        );
      }),
    );
    expect(
      unmeasurable,
      'a criterion no fixture scores is a criterion this guard cannot see a change in. Either ' +
        'add a fixture that reaches it, or — if a repository scan structurally cannot reach it — ' +
        'add it to STRUCTURALLY_UNREACHABLE_CRITERIA with the reason.',
    ).toEqual([...STRUCTURALLY_UNREACHABLE_CRITERIA]);
  });

  it('distinguishes every selectable rubric from every other', () => {
    const byFingerprint = new Map<string, string[]>();
    for (const [rubricVersion, { components }] of measured) {
      const digest = digestWitanRubricBehaviourComponents(components);
      byFingerprint.set(digest, [...(byFingerprint.get(digest) ?? []), rubricVersion]);
    }
    const collisions = [...byFingerprint.values()].filter((group) => group.length > 1);
    expect(
      collisions,
      'two rubrics score this corpus identically, so the corpus cannot tell a change in one from ' +
        'a change in the other. Either extend the corpus to reach what separates them, or record ' +
        'in leaderboard/RUBRIC_CHANGELOG.md that they are behaviourally identical.',
    ).toEqual([]);
  });
});

describe('scoring behaviour has not moved under an unchanged rubric identifier', () => {
  for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    it(`${rubricVersion}: criterion-level behaviour matches its pins`, () => {
      const { components } = measured.get(rubricVersion) as {
        components: WitanRubricBehaviourComponents;
      };
      const pinned = PINNED_COMPONENTS[rubricVersion] as WitanRubricBehaviourComponents;
      const movedCriteria = Object.keys(components.criteria).filter(
        (id) => components.criteria[id] !== pinned.criteria[id],
      );
      const movedFixtures = Object.keys(components.reports).filter(
        (name) => components.reports[name] !== pinned.reports[name],
      );
      expect(
        { criteria: movedCriteria, fixtures: movedFixtures },
        resolutionMessage(rubricVersion, movedCriteria, movedFixtures),
      ).toEqual({ criteria: [], fixtures: [] });
    });
  }

  for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    it(`${rubricVersion}: the published fingerprint is the digest of those pins`, () => {
      const pinned = PINNED_COMPONENTS[rubricVersion] as WitanRubricBehaviourComponents;
      expect(
        digestWitanRubricBehaviourComponents(pinned),
        `${rubricVersion}: the fingerprint in src/witan/rubric-fingerprint.ts is not the digest ` +
          'of the component pins beside it. One was re-pinned and the other was not; the ' +
          'certificates this build emits would carry a number nothing measured.',
      ).toBe(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[rubricVersion]);
    });
  }
});

describe('the record cannot stay silent about a re-pin', () => {
  it('cites every pinned fingerprint in leaderboard/RUBRIC_CHANGELOG.md', () => {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
    const uncited = Object.entries(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS)
      .filter(([, fingerprint]) => !changelog.includes(fingerprint))
      .map(([rubricVersion]) => rubricVersion);
    expect(
      uncited,
      'every behaviour fingerprint this build emits must be written down in ' +
        'leaderboard/RUBRIC_CHANGELOG.md. This is what stops a re-pin from being a silent ' +
        'repair: changing a digest means writing an entry that contains the new digest, and a ' +
        "previous entry's text cannot be reused for it because it names the previous digest.",
    ).toEqual([]);
  });
});

describe('the fingerprint reaches the artifact, not only the build', () => {
  it('report.json carries the measured fingerprint for the rubric that actually ran', () => {
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const { components } = measured.get(rubricVersion) as {
        components: WitanRubricBehaviourComponents;
      };
      const fingerprint = rubricBehaviourFingerprint(rubricVersion);
      expect(fingerprint, `${rubricVersion} has no fingerprint`).toMatch(
        WITAN_RUBRIC_BEHAVIOUR_FINGERPRINT_PATTERN,
      );
      expect(
        fingerprint,
        `${rubricVersion}: the fingerprint report.json carries is not the one this corpus ` +
          'measures, so the certificate asserts a behaviour identity nothing observed.',
      ).toBe(digestWitanRubricBehaviourComponents(components));
    }
  });

  it('emits no fingerprint for a rubric this build has no measurement for', () => {
    expect(rubricBehaviourFingerprint('witan-rubric-v9-2026-07-22')).toBeUndefined();
    expect(rubricBehaviourFingerprint('witan-trading-rubric-v0-2026-07-01')).toBeUndefined();
    expect(rubricBehaviourFingerprint('not-a-rubric')).toBeUndefined();
  });
});

function resolutionMessage(
  rubricVersion: string,
  movedCriteria: readonly string[],
  movedFixtures: readonly string[],
): string {
  const calibrated = rubricVersion === WITAN_LAST_CALIBRATED_RUBRIC_VERSION;
  return [
    `SCORING BEHAVIOUR MOVED UNDER ${rubricVersion}${
      calibrated ? ' — THE CALIBRATED PUBLIC DEFAULT' : ' (prospective rubric)'
    }.`,
    movedCriteria.length > 0 ? `Criteria that moved: ${movedCriteria.join(', ')}.` : '',
    movedFixtures.length > 0
      ? `Fixtures whose verdict, composite score or abstention moved: ${movedFixtures.join(', ')}.`
      : '',
    'The rubric identifier did not have to change for this to happen, which is the whole point:',
    'nothing about the identifier is evidence here.',
    '',
    'Resolve it in ONE of exactly two ways, both of which are writing, not re-running:',
    ' (1) Scoring really changed. Add an entry to leaderboard/RUBRIC_CHANGELOG.md carrying the',
    '     full before/after delta across the PUBLISHED corpus (leaderboard/corpus.json) — score,',
    '     verdict and rank for every repository, or "no repository moved" stated explicitly —',
    '     then re-pin src/witan/__tests__/fixtures/behaviour-fingerprint-pins.json and the',
    '     matching fingerprint in src/witan/rubric-fingerprint.ts, and cite the new fingerprint',
    '     in that entry.',
    ' (2) Scoring did not change and this corpus moved for another reason (a fixture edit, a git',
    '     version that writes a different tree). State that reason in the changelog entry, in',
    '     those words, and re-pin.',
    '',
    'Do not re-pin without one of those. There is no regeneration script on purpose.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
