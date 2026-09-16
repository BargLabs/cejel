import { rmSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ReportScoringSurface } from '../behaviour-fingerprint.js';

import {
  WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS,
  deriveBehaviourFingerprint,
  projectScoringSurface,
  rubricBehaviourFingerprint,
} from '../behaviour-fingerprint.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';
import { BEHAVIOUR_FIXTURES, fixtureHeadSha, materialiseFixture } from './behaviour-corpus.js';

// SCORING BEHAVIOUR IS MEASURED HERE, NOT DECLARED BY A VERSION STRING.
//
// leaderboard/RUBRIC_CHANGELOG.md's preamble names its enforcement: a guard that fails the build
// if WITAN_RUBRIC_VERSION changes without a matching entry. That guard keys on an identifier the
// author controls, so it cannot see a change made BENEATH an unchanged identifier — which is
// what 0.4.9 did, five times, under witan-rubric-v17-2026-07-24.
//
// v17-scoring-surface-golden.test.ts is the narrow answer to that: four fixtures, each the exact
// shape one 0.4.9 change moved, pinned under v17. This file is the general one. It scores a
// published synthetic corpus under EVERY selectable rubric and pins a digest per rubric. It does
// not need anyone to have anticipated the change.
//
// The failure message is the deliverable. It has to say which rubric moved, which criteria moved,
// which fixtures moved, and what the only two acceptable resolutions are — because the failure
// mode this guard exists to prevent is somebody re-pinning a number to get green.

const GENERATED_AT = '2026-09-16T00:00:00.000Z';

const RESOLUTION = [
  'RESOLVING THIS — there are exactly two acceptable paths, and "re-pin the number" is not one of them:',
  '  (1) Scoring changed. Add an entry to leaderboard/RUBRIC_CHANGELOG.md carrying the full',
  '      before/after delta across the published corpus, then update the pin in',
  '      src/witan/behaviour-fingerprint.ts. The new digest must appear verbatim in that entry:',
  '      rubric-behaviour-fingerprint-record.test.ts fails if it does not.',
  '  (2) Scoring did NOT change and the corpus or the projection did (a fixture was edited, a',
  '      metric was renamed, a field was added to the projection). Say so in the changelog entry,',
  '      in those words, alongside the new digest. An unexplained re-pin is the defect this',
  '      guard exists to refuse.',
].join('\n');

const dirs = new Map<string, string>();
/** rubric -> [fixtureName, projection][] */
const surfacesByRubric = new Map<string, Array<readonly [string, ReportScoringSurface]>>();

// Every fixture is materialised once and scored once per rubric here, so no test in this file
// depends on another having run first. Ten fixtures under seven rubrics is seventy scans and
// runs in a few seconds — small enough for every PR, which is the only place it is any use.
beforeAll(() => {
  for (const fixture of BEHAVIOUR_FIXTURES) {
    dirs.set(fixture.name, materialiseFixture(fixture));
  }
  for (const rubric of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    const surfaces: Array<readonly [string, ReportScoringSurface]> = [];
    for (const fixture of BEHAVIOUR_FIXTURES) {
      const report = scoreRepoWithPublicCejel({
        repoPath: dirs.get(fixture.name) as string,
        productSlug: fixture.name,
        productDisplayName: fixture.name,
        generatedAt: GENERATED_AT,
        rubricVersion: rubric,
        ingestPatterns: [],
        autoDiscoverIngest: false,
      });
      surfaces.push([fixture.name, projectScoringSurface(report)]);
    }
    surfacesByRubric.set(rubric, surfaces);
  }
});

afterAll(() => {
  for (const dir of dirs.values()) rmSync(dir, { recursive: true, force: true });
});

describe('the behaviour corpus is reproducible before any score is read', () => {
  for (const fixture of BEHAVIOUR_FIXTURES) {
    it(`${fixture.name} materialises to its pinned commit`, () => {
      expect(
        fixtureHeadSha(dirs.get(fixture.name) as string),
        `${fixture.name}: the fixture repository did not reproduce on this machine. Nothing below ` +
          'this point is interpretable as a scoring result — fix the fixture or the environment, ' +
          'do not re-pin a fingerprint.',
      ).toBe(fixture.headSha);
    });
  }
});

describe('rubric behaviour fingerprints — a digest per rubric, moved only with a public record', () => {
  it('pins exactly the selectable rubrics, no more and no fewer', () => {
    expect(
      Object.keys(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS).sort(),
      'every rubric a caller can select must carry a pinned fingerprint: an unpinned selectable ' +
        'rubric emits no fingerprint on report.json and is invisible to this guard',
    ).toEqual([...WITAN_SELECTABLE_RUBRIC_VERSIONS].sort());
  });

  for (const rubric of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    it(`${rubric}: the corpus scores to its pinned fingerprint`, () => {
      const surfaces = surfacesByRubric.get(rubric) as Array<
        readonly [string, ReportScoringSurface]
      >;
      const observed = deriveBehaviourFingerprint(surfaces);
      const pinned = WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[rubric] as (typeof observed) | undefined;
      expect(pinned, `${rubric} has no pinned fingerprint`).toBeDefined();
      if (!pinned) return;

      const movedCriteria = Object.keys(observed.byCriterion).filter(
        (id) => observed.byCriterion[id] !== pinned.byCriterion[id],
      );
      const movedFixtures = Object.keys(observed.byFixture).filter(
        (name) => observed.byFixture[name] !== pinned.byFixture[name],
      );
      const detail = [
        '',
        `SCORING BEHAVIOUR MOVED UNDER AN UNCHANGED RUBRIC IDENTIFIER: ${rubric}.`,
        rubric === WITAN_SELECTABLE_RUBRIC_VERSIONS[0]
          ? '  This is the CALIBRATED PUBLIC DEFAULT. Two certificates naming this rubric, produced ' +
            'at the same revision by a tool from either side of this change, now disagree.'
          : '  This is a prospective rubric. It still scores repositories through --rubric-pin.',
        `  Criteria that moved: ${movedCriteria.length > 0 ? movedCriteria.join(', ') : '(none — the change is in report-level composite/verdict/abstention output)'}`,
        `  Fixtures that moved: ${movedFixtures.length > 0 ? movedFixtures.join(', ') : '(none individually — fixture ORDER or corpus membership changed)'}`,
        ...movedFixtures.map((name) => {
          const fixture = BEHAVIOUR_FIXTURES.find((candidate) => candidate.name === name);
          return `    - ${name}: ${fixture?.intent ?? ''}`;
        }),
        `  Pinned digest:   ${pinned.digest}`,
        `  Observed digest: ${observed.digest}`,
        '',
        RESOLUTION,
        '',
      ].join('\n');

      expect(observed.digest, detail).toBe(pinned.digest);
      // Reached only when the whole-corpus digest matches: then every sub-digest must too, or the
      // pin file is internally inconsistent with itself.
      expect(observed.byCriterion, `${rubric}: per-criterion sub-digests disagree with the pin`).toEqual(
        pinned.byCriterion,
      );
      expect(observed.byFixture, `${rubric}: per-fixture sub-digests disagree with the pin`).toEqual(
        pinned.byFixture,
      );
    });
  }

  it('keeps every rubric separately visible — no two selectable rubrics share a digest', () => {
    const digests = [...WITAN_SELECTABLE_RUBRIC_VERSIONS].map((rubric) => [
      rubric,
      rubricBehaviourFingerprint(rubric),
    ]);
    expect(
      new Set(digests.map(([, digest]) => digest)).size,
      'two rubrics scoring the corpus identically means the corpus cannot distinguish them, and a ' +
        'change to one would be indistinguishable from a change to the other. Add a fixture that ' +
        `exercises what separates them. Digests: ${JSON.stringify(digests)}`,
    ).toBe(WITAN_SELECTABLE_RUBRIC_VERSIONS.length);
  });
});

describe('corpus criterion coverage is stated, not assumed', () => {
  // The gap this names is real and permanent, not an omission: repository scans return B1 and B5
  // as not_applicable unconditionally (buildNotApplicableSignal in repo-signals.ts — dispatch
  // trace and learning trace are process dimensions no repository tree carries). No fixture can
  // move them, and their presence in the digest records only that they stayed N/A. Every other
  // criterion is reached with a measured result by at least one fixture; this asserts it rather
  // than leaving it to the corpus comment.
  const STRUCTURALLY_UNREACHABLE = ['B1', 'B5'];

  it('reaches every criterion a repository scan can measure, and names the two it cannot', () => {
    const measured = new Set<string>();
    const seen = new Set<string>();
    for (const surfaces of surfacesByRubric.values()) {
      for (const [, surface] of surfaces) {
        for (const criterion of surface.criteria) {
          seen.add(criterion.id);
          if (criterion.status !== 'not_applicable') measured.add(criterion.id);
        }
      }
    }
    expect(surfacesByRubric.size, 'coverage is derived from the scored surfaces above').toBe(
      WITAN_SELECTABLE_RUBRIC_VERSIONS.length,
    );
    const unmeasured = [...seen].filter((id) => !measured.has(id)).sort();
    expect(
      unmeasured,
      'a criterion no fixture reaches with a measured result is silently uncovered: a scoring ' +
        'change there would not move any digest. Add a fixture, or add the criterion to ' +
        'STRUCTURALLY_UNREACHABLE with the reason it cannot be reached.',
    ).toEqual(STRUCTURALLY_UNREACHABLE);
  });
});
