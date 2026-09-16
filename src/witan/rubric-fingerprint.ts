import { createHash } from 'node:crypto';

import type { WitanReport } from './schemas.js';

import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V18,
  WITAN_RUBRIC_VERSION_V19,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
} from './rubric-version.js';

// RUBRIC BEHAVIOUR FINGERPRINT — behaviour measured, not declared.
//
// `rubricVersion` is a name the author controls. It says which rubric the author BELIEVES ran;
// it cannot say how that rubric behaved. On 2026-09-15 five changes altered scoring under
// `witan-rubric-v17-2026-07-24` — the calibrated public default — with the identifier unchanged,
// and the control that exists to catch a silent re-score is keyed on the identifier, so it was
// correct to stay quiet. Two certificates could carry the same rubric name, be produced at the
// same revision by different tool versions, and disagree, with nothing in either artifact saying
// why.
//
// The fingerprint closes that. It is the sha256 of the scoring-relevant output of a fixed,
// committed corpus of synthetic repositories (src/witan/__tests__/fixtures/behaviour-corpus.ts)
// scored under one rubric. It moves if, and only if, that rubric's scoring behaviour moves on a
// shape the corpus contains. It is a BEHAVIOURAL identity, orthogonal to the rubric's NAME:
// the pair (rubricVersion, rubricBehaviourFingerprint) is what a holder of two certificates can
// actually compare.
//
// What it is NOT: a coverage claim. A fingerprint that matches says no corpus-visible scoring
// behaviour changed. It cannot say that scoring did not change on a shape the corpus does not
// contain — see the corpus file for which criteria are measured and which are not reachable at
// all through a repository scan. Recall gaps are a known and priced-in limitation here exactly
// as they are everywhere else in this tool; a false assertion is not.

/** Per-criterion scoring surface: what the criterion scored and why, with prose excluded. */
export interface WitanScoringSurfaceCriterion {
  readonly id: string;
  readonly status: string;
  readonly score: number;
  /** Present only when an ingested signal adjusted the native score. */
  readonly nativeScore: number | null;
  /** Finding counts by severity. Finding WORDING is deliberately excluded — see digest notes. */
  readonly findings: { readonly critical: number; readonly warning: number; readonly info: number };
  /** `[name, value]` pairs, name-sorted. Metric labels, units and presentation are excluded. */
  readonly metrics: readonly (readonly [string, number])[];
}

/** The scoring-relevant projection of one report. Everything per-invocation is excluded. */
export interface WitanScoringSurface {
  readonly verdict: string;
  readonly archetype: string | null;
  readonly overallScore: number | null;
  readonly codeTrustScore: number | null;
  readonly processTrustScore: number | null;
  readonly categoryScores: Readonly<Record<string, number>> | null;
  readonly insufficientSourceReason: string | null;
  readonly contentReadSummary: unknown;
  readonly criteria: readonly WitanScoringSurfaceCriterion[];
}

/**
 * Project a report down to what the rubric decided, and nothing else.
 *
 * INCLUDED — criterion scores, criterion statuses (which is where `insufficientData` surfaces:
 * `scoreCriterion` maps an abstaining signal to status `insufficient_data`), the report-level
 * abstention reason, `contentReadSummary` (the reason side of an abstention, and an input to the
 * composite denominator), metric values, per-severity finding counts, the archetype, and every
 * composite score.
 *
 * EXCLUDED, deliberately:
 *   - everything per-invocation: `productSlug`, `productDisplayName`, `repo` (path, url, headSha),
 *     `generatedAt`, `toolVersion`, and the fingerprint field itself. These differ between two
 *     honest runs of the same scanner and would make the digest useless.
 *   - `rubricVersion` itself. Putting the identifier inside the digest would let a rename move a
 *     number that is supposed to mean "behaviour moved", which is the whole defect this exists to
 *     answer. The consequence is deliberate: two rubrics that behave identically on this corpus
 *     get identical fingerprints, and that equality is a true statement about them.
 *   - prose: finding summaries, metric labels/units/descriptions, evidence labels, criterion
 *     titles and notes, `scanLimitations`. A wording improvement is not a scoring change, and a
 *     guard that fires on copy edits is a guard people learn to re-pin without reading. A finding
 *     APPEARING or DISAPPEARING still moves the severity counts, so the detector change is caught
 *     while the sentence it produces stays editable.
 *   - evidence pointers. Their paths are fixture-relative and their content hashes restate file
 *     content the fixture already pins.
 */
export function projectWitanScoringSurface(report: WitanReport): WitanScoringSurface {
  return {
    verdict: report.verdict,
    archetype: report.archetype ?? null,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    categoryScores: report.verdict === 'insufficient_source' ? null : report.categoryScores ?? null,
    insufficientSourceReason:
      report.verdict === 'insufficient_source' ? report.insufficientSourceReason : null,
    contentReadSummary: report.contentReadSummary
      ? {
          skipped: report.contentReadSummary.skipped,
          byReason: report.contentReadSummary.byReason,
          unreadableByErrno: sortRecord(report.contentReadSummary.unreadableByErrno),
          affectedCriteria: [...report.contentReadSummary.affectedCriteria].sort(),
        }
      : null,
    criteria: report.criteria.map((criterion) => ({
      id: criterion.id,
      status: criterion.status,
      score: criterion.score,
      nativeScore: criterion.nativeScore ?? null,
      findings: {
        critical: criterion.findings.filter((finding) => finding.severity === 'critical').length,
        warning: criterion.findings.filter((finding) => finding.severity === 'warning').length,
        info: criterion.findings.filter((finding) => finding.severity === 'info').length,
      },
      metrics: (criterion.metrics ?? [])
        .map((metric) => [metric.name, metric.value] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    })),
  };
}

/** One fixture's projection, paired with the fixture that produced it. */
export interface WitanScoringSurfaceEntry {
  readonly name: string;
  readonly surface: WitanScoringSurface;
}

/**
 * A rubric's behaviour, decomposed far enough to say WHAT moved.
 *
 * A single opaque digest can only report that something changed, and "the fingerprint moved"
 * sends a reader to diff the whole scanner. These components localise it before the digest is
 * taken: one digest per criterion across the whole corpus, and one per fixture for the
 * report-level outcome (verdict, composite scores, abstention and its reason). The published
 * fingerprint is the digest OF these components, so there is exactly one pinned source of truth
 * and the diagnostic can never drift away from the number certificates carry.
 */
export interface WitanRubricBehaviourComponents {
  /** criterionId -> sha256 over that criterion's surface across the corpus, in corpus order. */
  readonly criteria: Readonly<Record<string, string>>;
  /** fixture name -> sha256 over that fixture's report-level outcome. */
  readonly reports: Readonly<Record<string, string>>;
}

/**
 * Decompose a corpus scored under ONE rubric. Per rubric, never aggregate: a single combined
 * digest across rubrics would hide a change that moves a prospective rubric and leaves the
 * calibrated default alone, or the reverse, and the calibrated default moving is the serious case.
 *
 * The input must be the COMPLETE corpus in corpus order. A digest over a subset is a different
 * number that looks like the same kind of number.
 */
export function computeWitanRubricBehaviourComponents(
  entries: readonly WitanScoringSurfaceEntry[],
): WitanRubricBehaviourComponents {
  const criterionIds: string[] = [];
  for (const entry of entries) {
    for (const criterion of entry.surface.criteria) {
      if (!criterionIds.includes(criterion.id)) criterionIds.push(criterion.id);
    }
  }
  const criteria: Record<string, string> = {};
  for (const criterionId of criterionIds) {
    criteria[criterionId] = sha256(
      JSON.stringify(
        entries.map((entry) => entry.surface.criteria.find(({ id }) => id === criterionId) ?? null),
      ),
    );
  }
  const reports: Record<string, string> = {};
  for (const entry of entries) {
    reports[entry.name] = sha256(
      JSON.stringify({
        verdict: entry.surface.verdict,
        archetype: entry.surface.archetype,
        overallScore: entry.surface.overallScore,
        codeTrustScore: entry.surface.codeTrustScore,
        processTrustScore: entry.surface.processTrustScore,
        categoryScores: entry.surface.categoryScores,
        insufficientSourceReason: entry.surface.insufficientSourceReason,
        contentReadSummary: entry.surface.contentReadSummary,
      }),
    );
  }
  return { criteria, reports };
}

/** The published fingerprint: the digest of a rubric's decomposed behaviour. */
export function digestWitanRubricBehaviourComponents(
  components: WitanRubricBehaviourComponents,
): string {
  return `sha256:${sha256(JSON.stringify(components))}`;
}

export const WITAN_RUBRIC_BEHAVIOUR_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * The committed fingerprints, one per selectable rubric.
 *
 * These are MEASURED values, re-derived from the corpus on every CI run by
 * `src/witan/__tests__/rubric-behaviour-fingerprint.test.ts`. They are constants here because
 * recomputing one costs eleven git repositories and eleven scans — far past what a per-scan CLI
 * invocation can spend — not because anybody's word is being taken for them. If a value here
 * stops matching the corpus, the build fails and names the rubric and the criteria that moved.
 *
 * There is deliberately NO regeneration script. Changing a value below means hand-editing it and
 * citing the new digest in `leaderboard/RUBRIC_CHANGELOG.md`, which the same guard checks. A
 * guard that can be silenced by rerunning a script is theatre.
 */
export const WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS: Readonly<Record<string, string>> = Object.freeze({
  [WITAN_RUBRIC_VERSION_V17]:
    'sha256:ff0f01abe8c12daa60375d0e18c1aca4a1135a55ab2a80b15f4c037bfc18b4b1',
  [WITAN_RUBRIC_VERSION_V18]:
    'sha256:abc35df0fdc0749aa941f47b295059d06c96dd9800af7f79cfef2bc8dae917da',
  [WITAN_RUBRIC_VERSION_V19]:
    'sha256:f670fa2cc44beef066fa38767bd587e1a16fb28b03bc904756daaea5a6465e96',
  [WITAN_RUBRIC_VERSION_V20]:
    'sha256:9276ce2ce865c2d50c52882ee45bbf1df5fe3c8b6038858b4a147f7a4cedfa98',
  [WITAN_RUBRIC_VERSION_V21]:
    'sha256:d86411a7fe108bba4d2b8fe7ff9d4f7f69a60f11ca0c5c3fef8e88f66a9af53a',
  [WITAN_RUBRIC_VERSION_V22]:
    'sha256:1bb57dd98d29b43b170f3a4f1c8b3b379b433a2aa9df0821ab9d5115f48cfb2f',
  [WITAN_RUBRIC_VERSION_V23]:
    'sha256:b558c0aa4b2f85b734bed2e077298fd55851a1086234d678f10a71cf913ec3cf',
});

/**
 * The behaviour fingerprint for a rubric, or undefined when there is none.
 *
 * Undefined is the honest answer for a rubric this build has no measurement for — every
 * historical rubric (v0-v16, kept load-bearing for regression fixtures but never offered as a
 * live selection) and the caller-supplied trading rubric. Never fabricate one: a report carrying
 * a fingerprint that no guard measures is the exact failure this field exists to make
 * impossible.
 */
export function rubricBehaviourFingerprint(rubricVersion: string): string | undefined {
  return WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS[rubricVersion];
}

function sortRecord(record: Readonly<Record<string, number>>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key] as number;
  return sorted;
}
