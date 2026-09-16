import { createHash } from 'node:crypto';

import type { WitanCriterionScore, WitanReport } from './schemas.js';

/**
 * RUBRIC BEHAVIOUR FINGERPRINT — a measured identity for how a rubric scores, as opposed to
 * `rubricVersion`, which is a name the author controls.
 *
 * `leaderboard/RUBRIC_CHANGELOG.md` enforces its rule with a guard keyed on
 * `WITAN_RUBRIC_VERSION`. That guard cannot, by construction, see a change made BENEATH an
 * unchanged identifier — which is exactly what happened in 0.4.9, where five changes moved
 * scores under `witan-rubric-v17-2026-07-24` with the identifier untouched. This module is the
 * detector that does not depend on the author having renamed anything: a published synthetic
 * corpus (`__tests__/behaviour-corpus.ts`) is scored under every selectable rubric and reduced
 * to a digest. If the digest moves, scoring moved.
 *
 * WHAT THE DIGEST COVERS: per criterion — id, status (which is where `insufficient_data` and
 * `not_applicable` are expressed), score, `nativeScore` when an external signal adjusted it, and
 * every metric's name, value, max and weight. Per report — verdict, the composite
 * (`overallScore`), both category scores, `categoryScores` when present,
 * `insufficientSourceReason` (the report-level abstention reason), and the content-read skip
 * counts by reason with the criteria they affected (which is where a criterion-level
 * insufficient-data REASON is machine-readable).
 *
 * WHAT IT DELIBERATELY EXCLUDES, and why: everything per-invocation — `productSlug`,
 * `productDisplayName`, `repo` (path and headSha), `generatedAt`, `toolVersion`, and this
 * module's own `rubricBehaviourFingerprint` field, which would otherwise be circular. Also
 * excluded: evidence pointers and findings, because both carry repository PATHS and content
 * hashes, and a fingerprint that moves when a path changes is a fingerprint nobody will keep
 * pinned; `contentReadSummary.unreadableByErrno`, which is a property of the machine running
 * the scan, not of the rubric; and prose `notes`/`scanLimitations`, which are wording.
 *
 * The consequence of those exclusions is a stated limitation, not an oversight: a change that
 * alters only findings or evidence — v20's path-anchored A3 absence findings, for instance —
 * does not move this digest unless it also moves a score, a status or a metric.
 */

export interface WitanBehaviourFingerprintPin {
  /** sha256 over the whole corpus projection under this rubric. This is the emitted value. */
  readonly digest: string;
  /** sha256 prefix per criterion, aggregated across every fixture. Names WHAT moved. */
  readonly byCriterion: Readonly<Record<string, string>>;
  /** sha256 prefix per fixture, aggregated across every criterion. Names WHERE it moved. */
  readonly byFixture: Readonly<Record<string, string>>;
}

/** Length of the sub-digests above. Long enough to be unambiguous, short enough to read. */
export const WITAN_BEHAVIOUR_SUBDIGEST_LENGTH = 16;

interface MetricProjection {
  readonly name: string;
  readonly value: number;
  readonly max: number | null;
  readonly weight: number;
}

export interface CriterionScoringSurface {
  readonly id: string;
  readonly status: string;
  readonly score: number;
  readonly nativeScore: number | null;
  readonly metrics: readonly MetricProjection[];
}

export interface ReportScoringSurface {
  readonly verdict: string;
  readonly overallScore: number | null;
  readonly codeTrustScore: number | null;
  readonly processTrustScore: number | null;
  readonly categoryScores: Readonly<Record<string, number>> | null;
  readonly insufficientSourceReason: string | null;
  readonly contentReadSkips: {
    readonly skipped: number;
    readonly byReason: Readonly<Record<string, number>>;
    readonly affectedCriteria: readonly string[];
  } | null;
  readonly criteria: readonly CriterionScoringSurface[];
}

function projectCriterion(criterion: WitanCriterionScore): CriterionScoringSurface {
  return {
    id: criterion.id,
    status: criterion.status,
    score: criterion.score,
    nativeScore: criterion.nativeScore ?? null,
    metrics: [...criterion.metrics]
      .map((metric) => ({
        name: metric.name,
        value: metric.value,
        max: metric.max ?? null,
        weight: metric.weight,
      }))
      // Metric emission order is presentation, not scoring. Sorting keeps a pure reordering
      // from reading as a behaviour change.
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
  };
}

/** Reduce a report to the scoring-relevant surface documented at the top of this file. */
export function projectScoringSurface(report: WitanReport): ReportScoringSurface {
  const summary = report.contentReadSummary;
  return {
    verdict: report.verdict,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    categoryScores: report.categoryScores ?? null,
    insufficientSourceReason: report.insufficientSourceReason ?? null,
    contentReadSkips: summary
      ? {
          skipped: summary.skipped,
          byReason: { ...summary.byReason },
          affectedCriteria: [...summary.affectedCriteria].sort(),
        }
      : null,
    // Criterion order is rubric-declared and load-bearing; it is not sorted here.
    criteria: report.criteria.map(projectCriterion),
  };
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Derive the full pin for one rubric from the corpus, in fixture order.
 *
 * `surfaces` is `[fixtureName, projection]` pairs. Fixture order is the caller's; it is part of
 * the digest, so reordering the corpus is itself a change that has to be recorded.
 */
export function deriveBehaviourFingerprint(
  surfaces: ReadonlyArray<readonly [string, ReportScoringSurface]>,
): WitanBehaviourFingerprintPin {
  const byCriterion: Record<string, string> = {};
  const byFixture: Record<string, string> = {};

  const criterionIds: string[] = [];
  for (const [, surface] of surfaces) {
    for (const criterion of surface.criteria) {
      if (!criterionIds.includes(criterion.id)) criterionIds.push(criterion.id);
    }
  }
  for (const id of criterionIds) {
    byCriterion[id] = sha256(
      surfaces.map(([name, surface]) => [
        name,
        surface.criteria.find((criterion) => criterion.id === id) ?? null,
      ]),
    ).slice(0, WITAN_BEHAVIOUR_SUBDIGEST_LENGTH);
  }
  for (const [name, surface] of surfaces) {
    byFixture[name] = sha256(surface).slice(0, WITAN_BEHAVIOUR_SUBDIGEST_LENGTH);
  }

  return { digest: sha256(surfaces), byCriterion, byFixture };
}

/**
 * PINNED FINGERPRINTS — one per selectable rubric, kept per rubric and never aggregated.
 *
 * Per rubric, not combined, deliberately: a single corpus-wide digest would let a change that
 * moves `v23` and leaves `v17` alone read the same as a change that moves `v17` and leaves `v23`
 * alone. The `v17` line is the calibrated public default and is the serious case; it has to stay
 * separately visible.
 *
 * THESE VALUES ARE HAND-MAINTAINED AND THERE IS NO SCRIPT THAT REWRITES THEM. The guard asserts
 * with `toEqual` against these literals, so `vitest -u` cannot silence it, and a second guard
 * requires every `digest` below to appear verbatim in `leaderboard/RUBRIC_CHANGELOG.md`. Moving
 * a line here without writing the reason into the public changelog fails the build.
 */
export const WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS: Readonly<
  Record<string, WitanBehaviourFingerprintPin>
> = Object.freeze({
  'witan-rubric-v17-2026-07-24': {
    digest: '2ad7a1e686ebde69a4f723f5bde12acaa37aadb0c8d1871656dece87ea953928',
    byCriterion: {
      A1: 'f858211d48fd11b5',
      A2: 'ff4b931b1bd4e3f5',
      A3: 'a5dff52004ef5840',
      A4: '79ce8c7911d0efe1',
      A5: '4636dad74ecff91e',
      B1: 'a21945f1c7cd7f1d',
      B2: 'cdef779269578ee8',
      B3: '3409cb3c8f00e24f',
      B4: 'c49286377c560ea2',
      B5: '546cc59cc8eeabf7',
      B6: '1c56426deb8b3cbe',
    },
    byFixture: {
      'a-instrumented-service': 'a62721060aac408e',
      'b-sparse-repo': 'c6207b6b586e10db',
      'c-secret-hazard-store': '12ffb62e2fa80ad2',
      'd-overclaiming-readme': '6f5ebfadb2894144',
      'e-python-service': '097c589238880a03',
      'f-privileged-migrations': 'b75472f00002eddf',
      'g-withheld-oversized-evidence': '52938aa0036c4b9c',
      'h-direct-http-entrypoint': 'c6207b6b586e10db',
      'i-package-start-gateway': 'ba1dc23ab3eabc4d',
      'j-pem-signing-library': '36e86c207c6806ee',
    },
  },
  'witan-rubric-v18-prospective-2026-07-25': {
    digest: 'c532d137dde032ec1cd21b2aa91b557760c30b0eb815dce1bc5c35525b2fe08f',
    byCriterion: {
      A1: 'f858211d48fd11b5',
      A2: '8f183230f9083bfd',
      A3: 'a5dff52004ef5840',
      A4: '79ce8c7911d0efe1',
      A5: '4636dad74ecff91e',
      B1: 'a21945f1c7cd7f1d',
      B2: 'cdef779269578ee8',
      B3: '3409cb3c8f00e24f',
      B4: 'c49286377c560ea2',
      B5: '546cc59cc8eeabf7',
      B6: '1c56426deb8b3cbe',
    },
    byFixture: {
      'a-instrumented-service': '7d666c7f4c8fd635',
      'b-sparse-repo': 'c6207b6b586e10db',
      'c-secret-hazard-store': 'e3bc73fdc48eed2c',
      'd-overclaiming-readme': '6f5ebfadb2894144',
      'e-python-service': '097c589238880a03',
      'f-privileged-migrations': 'b75472f00002eddf',
      'g-withheld-oversized-evidence': '52938aa0036c4b9c',
      'h-direct-http-entrypoint': 'c6207b6b586e10db',
      'i-package-start-gateway': 'ba1dc23ab3eabc4d',
      'j-pem-signing-library': '36e86c207c6806ee',
    },
  },
  'witan-rubric-v19-prospective-2026-08-09': {
    digest: 'b945f98247e52366f53f512ada5daddfaf8eb92f31f159a64a4489b0e90ba322',
    byCriterion: {
      A1: 'f858211d48fd11b5',
      A2: '8f183230f9083bfd',
      A3: 'a5dff52004ef5840',
      A4: '79ce8c7911d0efe1',
      A5: '4636dad74ecff91e',
      B1: 'a21945f1c7cd7f1d',
      B2: 'cdef779269578ee8',
      B3: '3409cb3c8f00e24f',
      B4: '982971ecd07156a1',
      B5: '546cc59cc8eeabf7',
      B6: '1c56426deb8b3cbe',
    },
    byFixture: {
      'a-instrumented-service': '7d666c7f4c8fd635',
      'b-sparse-repo': 'c6207b6b586e10db',
      'c-secret-hazard-store': 'e3bc73fdc48eed2c',
      'd-overclaiming-readme': '6f5ebfadb2894144',
      'e-python-service': '53d01ba5653e2e0d',
      'f-privileged-migrations': '46be7af1e1a3cacf',
      'g-withheld-oversized-evidence': '52938aa0036c4b9c',
      'h-direct-http-entrypoint': 'c6207b6b586e10db',
      'i-package-start-gateway': 'ba1dc23ab3eabc4d',
      'j-pem-signing-library': '36e86c207c6806ee',
    },
  },
  'witan-rubric-v20-prospective-2026-08-10': {
    digest: '9c28c5d2c191128e2eab17d297d11c8112ac4420651ed3aea233dee2eea1d010',
    byCriterion: {
      A1: 'f858211d48fd11b5',
      A2: '8f183230f9083bfd',
      A3: '8735a79552723570',
      A4: '79ce8c7911d0efe1',
      A5: '4636dad74ecff91e',
      B1: 'a21945f1c7cd7f1d',
      B2: 'cdef779269578ee8',
      B3: '3409cb3c8f00e24f',
      B4: '982971ecd07156a1',
      B5: '546cc59cc8eeabf7',
      B6: '1c56426deb8b3cbe',
    },
    byFixture: {
      'a-instrumented-service': '7d666c7f4c8fd635',
      'b-sparse-repo': 'c6207b6b586e10db',
      'c-secret-hazard-store': 'e3bc73fdc48eed2c',
      'd-overclaiming-readme': '6f5ebfadb2894144',
      'e-python-service': '53d01ba5653e2e0d',
      'f-privileged-migrations': '46be7af1e1a3cacf',
      'g-withheld-oversized-evidence': '52938aa0036c4b9c',
      'h-direct-http-entrypoint': '09aa1e86e135b836',
      'i-package-start-gateway': 'ba1dc23ab3eabc4d',
      'j-pem-signing-library': '36e86c207c6806ee',
    },
  },
  'witan-rubric-v21-prospective-2026-08-10': {
    digest: '99ecf663de92baa94276b024972c570acb84cb0e93d66b5dba57abe251e2cda6',
    byCriterion: {
      A1: 'f858211d48fd11b5',
      A2: '8f183230f9083bfd',
      A3: '8735a79552723570',
      A4: '79ce8c7911d0efe1',
      A5: '4636dad74ecff91e',
      B1: 'a21945f1c7cd7f1d',
      B2: 'cdef779269578ee8',
      B3: '3409cb3c8f00e24f',
      B4: '982971ecd07156a1',
      B5: '546cc59cc8eeabf7',
      B6: '814271fc915739c9',
    },
    byFixture: {
      'a-instrumented-service': '7d666c7f4c8fd635',
      'b-sparse-repo': 'c6207b6b586e10db',
      'c-secret-hazard-store': 'e3bc73fdc48eed2c',
      'd-overclaiming-readme': '6f5ebfadb2894144',
      'e-python-service': '53d01ba5653e2e0d',
      'f-privileged-migrations': '26586adb8cb61412',
      'g-withheld-oversized-evidence': '52938aa0036c4b9c',
      'h-direct-http-entrypoint': '09aa1e86e135b836',
      'i-package-start-gateway': 'ba1dc23ab3eabc4d',
      'j-pem-signing-library': '36e86c207c6806ee',
    },
  },
  'witan-rubric-v22-prospective-2026-08-10': {
    digest: 'fe859dcaabdf84489a79f8fdda039b8c0695e31e5aae11c18e6ce34eb6103402',
    byCriterion: {
      A1: 'f858211d48fd11b5',
      A2: '8f183230f9083bfd',
      A3: '2f8c19e9f001fe3f',
      A4: '79ce8c7911d0efe1',
      A5: '4636dad74ecff91e',
      B1: 'a21945f1c7cd7f1d',
      B2: 'cdef779269578ee8',
      B3: '3409cb3c8f00e24f',
      B4: '982971ecd07156a1',
      B5: '546cc59cc8eeabf7',
      B6: '814271fc915739c9',
    },
    byFixture: {
      'a-instrumented-service': '7d666c7f4c8fd635',
      'b-sparse-repo': 'c6207b6b586e10db',
      'c-secret-hazard-store': 'e3bc73fdc48eed2c',
      'd-overclaiming-readme': '6f5ebfadb2894144',
      'e-python-service': '53d01ba5653e2e0d',
      'f-privileged-migrations': '26586adb8cb61412',
      'g-withheld-oversized-evidence': '52938aa0036c4b9c',
      'h-direct-http-entrypoint': '09aa1e86e135b836',
      'i-package-start-gateway': '768c1028dd8b4914',
      'j-pem-signing-library': '36e86c207c6806ee',
    },
  },
  'witan-rubric-v23-prospective-2026-09-06': {
    digest: '306eb4b4e33f3d2e0c6fa7a7516fb47f8c394fadfb322dd5f433983bfb6c19c2',
    byCriterion: {
      A1: '7a667d1f40071c12',
      A2: 'a09a28c416bdbc00',
      A3: '2f8c19e9f001fe3f',
      A4: '79ce8c7911d0efe1',
      A5: '3c4d8330a62ab2b9',
      B1: 'a21945f1c7cd7f1d',
      B2: 'cdef779269578ee8',
      B3: '3409cb3c8f00e24f',
      B4: '982971ecd07156a1',
      B5: '546cc59cc8eeabf7',
      B6: '814271fc915739c9',
    },
    byFixture: {
      'a-instrumented-service': '7d666c7f4c8fd635',
      'b-sparse-repo': 'c6207b6b586e10db',
      'c-secret-hazard-store': 'e3bc73fdc48eed2c',
      'd-overclaiming-readme': '6f5ebfadb2894144',
      'e-python-service': '615be0dfa75e30b4',
      'f-privileged-migrations': '26586adb8cb61412',
      'g-withheld-oversized-evidence': '003217704babc64a',
      'h-direct-http-entrypoint': '09aa1e86e135b836',
      'i-package-start-gateway': '768c1028dd8b4914',
      'j-pem-signing-library': '5e61533375367510',
    },
  },
});

/**
 * The fingerprint for a rubric, or `undefined` when none is pinned.
 *
 * Abstains rather than guesses: an unpinned rubric gets no field on `report.json` at all, which
 * is the honest output. A fabricated fingerprint would be a false assertion about how the
 * rubric behaves — the category of defect this product exists to refuse.
 */
export function rubricBehaviourFingerprint(rubricVersion: string): string | undefined {
  return WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[rubricVersion]?.digest;
}
