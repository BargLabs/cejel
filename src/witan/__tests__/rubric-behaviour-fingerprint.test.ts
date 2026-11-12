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
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V18,
  WITAN_RUBRIC_VERSION_V19,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_RUBRIC_VERSION_V24,
  WITAN_RUBRIC_VERSION_V25,
  WITAN_RUBRIC_VERSION_V26,
  WITAN_RUBRIC_VERSION_V27,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';
import { WITAN_RUBRIC } from '../rubric.js';
import {
  BEHAVIOUR_CORPUS,
  BEHAVIOUR_CORPUS_ADDED_BY_622,
  BEHAVIOUR_CORPUS_HEAD_SHAS,
  buildBehaviourFixture,
  fixtureHeadSha,
} from './fixtures/behaviour-corpus.js';

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

/**
 * Rubrics declared to score this corpus identically, by design, named rather than tolerated.
 *
 * Empty. v25 and v26 were declared identical until v26's first item change landed; v26 item 6
 * (A5 and A2 tenant findings fire on settling evidence only) separated them on the corpus's A5
 * component, so the declaration was removed in that change. The collision check below demands the
 * measured collisions equal this list EXACTLY, so a declaration cannot outlive its truth.
 */
const DECLARED_BEHAVIOURALLY_IDENTICAL: readonly (readonly string[])[] = [];

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

  it('distinguishes every selectable rubric from every other, except where declared identical', () => {
    const byFingerprint = new Map<string, string[]>();
    for (const [rubricVersion, { components }] of measured) {
      const digest = digestWitanRubricBehaviourComponents(components);
      byFingerprint.set(digest, [...(byFingerprint.get(digest) ?? []), rubricVersion]);
    }
    const collisions = [...byFingerprint.values()]
      .filter((group) => group.length > 1)
      .map((group) => [...group].sort())
      .sort((a, b) => a.join().localeCompare(b.join()));
    expect(
      collisions,
      'the rubrics that score this corpus identically must be exactly the declared groups in ' +
        'DECLARED_BEHAVIOURALLY_IDENTICAL. An undeclared collision means the corpus cannot tell a ' +
        'change in one from a change in the other: extend the corpus to reach what separates ' +
        'them, or declare the group here and record in leaderboard/RUBRIC_CHANGELOG.md that ' +
        'they are behaviourally identical. A declared group that no longer collides has ' +
        'diverged: remove the declaration in the same change.',
    ).toEqual(
      DECLARED_BEHAVIOURALLY_IDENTICAL.map((group) => [...group].sort()).sort((a, b) =>
        a.join().localeCompare(b.join()),
      ),
    );
  });

  it('records every declared behaviourally identical group in leaderboard/RUBRIC_CHANGELOG.md', () => {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
    for (const group of DECLARED_BEHAVIOURALLY_IDENTICAL) {
      const statement = `${group.map((rubricVersion) => `\`${rubricVersion}\``).join(' and ')} are behaviourally identical`;
      expect(changelog, `RUBRIC_CHANGELOG.md does not state: ${statement}`).toContain(statement);
    }
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

// #622's corpus extension moved every fingerprint, and the claim is that it moved them by its added
// specimens alone: no rubric's behaviour changed. Measured, not claimed: scored without the added
// specimens, the corpus reproduces under every rubric the fingerprint main carried before the
// extension (main 773a265c6), so every earlier specimen's projected surface is unchanged under every
// rubric, and the added specimens are the only difference. These are the old values, kept for this
// proof; nothing emits them. A later change that moves an earlier specimen's surface fails here as
// well as above: that change retires this block in its RUBRIC_CHANGELOG entry, because the proof
// belongs to the extension and the extension's pins are the ones it replaced.
const FINGERPRINTS_BEFORE_THE_622_EXTENSION: Readonly<Record<string, string>> = {
  [WITAN_RUBRIC_VERSION_V17]: 'sha256:5cd48f8c642300ae8736a09d4a24ce3a4f8885f6e099b5f27f99d950e0c944b4',
  [WITAN_RUBRIC_VERSION_V18]: 'sha256:4a5d17c84e265ec20cf54216d2e794dec1d299d859c69ac8ef1ab317fc479e2f',
  [WITAN_RUBRIC_VERSION_V19]: 'sha256:73dc0282a9ea2a481db8e86a9a5dc227a8b108356c358de029901f2dc38cef79',
  [WITAN_RUBRIC_VERSION_V20]: 'sha256:b5f4254a6056ff792d79a2d85892cdf05484eabded85ba13251a2c8fd5ac6336',
  [WITAN_RUBRIC_VERSION_V21]: 'sha256:f599d06354adb45af018639594cb6f44e7cb40445b84a0dcdd4438b8d7d069d0',
  [WITAN_RUBRIC_VERSION_V22]: 'sha256:34fb6ac5d1f6faf0912aa4d00924837eeee543614d7971247d005312b89928e1',
  [WITAN_RUBRIC_VERSION_V23]: 'sha256:ce24235861ce0f0dc4dafd22059a78d31f348e5c741e4056475867c29cc8b814',
  [WITAN_RUBRIC_VERSION_V24]: 'sha256:b221907d60d209cd3d57437892ae3dd873f4fa221ad8743954a30c8575d4e77c',
  [WITAN_RUBRIC_VERSION_V25]: 'sha256:0f2638a5088f95a610a0e12012442f1067af3e985b955f96ec71853d549693b9',
  [WITAN_RUBRIC_VERSION_V26]: 'sha256:4530317d56fc73eb89287e344ad626e2b9a96908ef12eb9e9c13b839bd599dae',
  [WITAN_RUBRIC_VERSION_V27]: 'sha256:dfe4e7e9ba37666f60b1ebcee4eb44917110798e9038c81eef079718db9ee7b1',
};

describe('#622: the corpus extension moved every fingerprint by its added specimens alone', () => {
  it('the added specimens come after every earlier one', () => {
    const names = BEHAVIOUR_CORPUS.map(({ name }) => name);
    expect(names.slice(names.length - BEHAVIOUR_CORPUS_ADDED_BY_622.length)).toEqual([...BEHAVIOUR_CORPUS_ADDED_BY_622]);
  });

  it('names a pre-extension fingerprint for exactly the selectable rubrics', () => {
    expect(Object.keys(FINGERPRINTS_BEFORE_THE_622_EXTENSION).sort()).toEqual(
      [...WITAN_SELECTABLE_RUBRIC_VERSIONS].sort(),
    );
  });

  for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    it(`${rubricVersion}: without the added specimens the corpus reproduces the pre-extension fingerprint, and with them it does not`, () => {
      const { entries, components } = measured.get(rubricVersion) as {
        entries: WitanScoringSurfaceEntry[];
        components: WitanRubricBehaviourComponents;
      };
      const earlier = entries.filter(({ name }) => !BEHAVIOUR_CORPUS_ADDED_BY_622.includes(name));
      expect(earlier).toHaveLength(entries.length - BEHAVIOUR_CORPUS_ADDED_BY_622.length);
      expect(
        digestWitanRubricBehaviourComponents(computeWitanRubricBehaviourComponents(earlier)),
        `${rubricVersion}: a specimen that was in the corpus before #622 no longer scores as it did, ` +
          'so the re-pin is not explained by the added specimens alone',
      ).toBe(FINGERPRINTS_BEFORE_THE_622_EXTENSION[rubricVersion]);
      expect(digestWitanRubricBehaviourComponents(components)).not.toBe(
        FINGERPRINTS_BEFORE_THE_622_EXTENSION[rubricVersion],
      );
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
