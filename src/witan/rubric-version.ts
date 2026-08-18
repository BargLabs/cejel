// The Quant evidence-contract v1 freeze byte-pins the shared generic schema barrel, so the
// v9 named constant cannot be added to that barrel without invalidating an unrelated frozen
// commercial artifact. Keep the historical identifier local to the free-core implementation;
// unlike the mutable WITAN_RUBRIC_VERSION alias, this remains stable when v10 becomes current.
export const WITAN_RUBRIC_VERSION_V9 = 'witan-rubric-v9-2026-07-22';

// V10 remains explicit as a historical/prospective identifier; the mutable public default is
// promoted independently only after an authenticated untouched holdout clears every gate.
export const WITAN_RUBRIC_VERSION_V10 = 'witan-rubric-v10-2026-07-23';

// Prospective free-core v39 rubric. The public default was unchanged until an authenticated
// untouched holdout cleared every preregistered gate.
export const WITAN_RUBRIC_VERSION_V11 = 'witan-rubric-v11-2026-07-23';

// Prospective free-core v41 rubric. V12 inherits v11 detector/scoring behavior and adds only
// failure-derived review-control integrity changes.
export const WITAN_RUBRIC_VERSION_V12 = 'witan-rubric-v12-2026-07-23';

// Prospective free-core v43 rubric. V13 inherits v12 finding and criterion behavior, then adds
// only the failure-derived source-representativeness closure.
export const WITAN_RUBRIC_VERSION_V13 = 'witan-rubric-v13-2026-07-23';

// Prospective free-core v45 rubric. V14 inherits v13 detector/scoring behavior and adds only
// the failure-derived semantic/path-role source-representativeness closure.
export const WITAN_RUBRIC_VERSION_V14 = 'witan-rubric-v14-2026-07-23';

// Prospective free-core v47 rubric. V15 inherits v14 criterion and abstention behavior, then
// adds only the failure-derived finding-precision and control-evidence integrity closure.
export const WITAN_RUBRIC_VERSION_V15 = 'witan-rubric-v15-2026-07-24';

// Prospective free-core v48 rubric. V16 inherits the complete v15 detector and classifier
// closure, then adds only the failure-derived zero-measurement abstention.
export const WITAN_RUBRIC_VERSION_V16 = 'witan-rubric-v16-2026-07-24';

// Free-core v50 rubric. V17 inherits the complete v16 detector/scoring closure, then adds only
// the failure-derived reviewable-source proof, authenticated A1 absence measurement, and
// narrowly bounded post-signal structural rescue. It is the public default after the v50
// untouched holdout cleared every preregistered gate.
export const WITAN_RUBRIC_VERSION_V17 = 'witan-rubric-v17-2026-07-24';

// Prospective free-core v51 rubric. V18 inherits the complete, holdout-calibrated v17
// detector/scoring closure and changes only D7 multi-tenancy evidence: positive isolation
// credit is derived from each repository's own CREATE POLICY USING/WITH CHECK clauses.
// The shared/public default remains v17 until a fresh authenticated untouched holdout clears
// every gate; callers must opt in explicitly.
export const WITAN_RUBRIC_VERSION_V18 = 'witan-rubric-v18-prospective-2026-07-25';

// Prospective B4 determinism correction. V19 inherits v18 and changes only audit-freshness
// year selection: the scanned HEAD commit's committer year replaces scan wall clock. It remains
// explicit-only until a separately preregistered authenticated untouched holdout permits default
// promotion.
export const WITAN_RUBRIC_VERSION_V19 = 'witan-rubric-v19-prospective-2026-08-09';

// Prospective A3 explicit-gap closure. V20 inherits v19 detector/scoring behavior and adds
// only narrowly worded, path-anchored findings for directly observable production-readiness
// omissions. The public default remains v17; callers must opt in explicitly.
export const WITAN_RUBRIC_VERSION_V20 = 'witan-rubric-v20-prospective-2026-08-10';

// Prospective B6 executed-escalation closure. V21 inherits v20 and adds only bounded
// recognition of administrative SQL contained in authored migration files or executed by
// direct database-driver string literals. The public default remains v17.
export const WITAN_RUBRIC_VERSION_V21 = 'witan-rubric-v21-prospective-2026-08-10';

// Prospective A3 package-start entrypoint closure. V22 inherits v21 and adds only bounded
// recognition of direct Node HTTP entrypoints whose authored file is named by a simple root
// package start command. The public default remains v17.
export const WITAN_RUBRIC_VERSION_V22 = 'witan-rubric-v22-prospective-2026-08-10';

// Calibration-claim policy. The shared/public default is deliberately decoupled from rubric
// iteration: prospective rubrics are available only by explicit opt-in — a committed evaluation
// harness, or (since 0.4.4) the public `cejel scan --rubric-pin <version>` flag (src/index.ts) —
// and inherit no precision, recall, false-positive-rate, or other calibration claim from v17.
// Promotion to public default requires a fresh authenticated untouched holdout and a separately
// recorded default decision; `--rubric-pin` does not itself constitute that decision.
export const WITAN_LAST_CALIBRATED_RUBRIC_VERSION = WITAN_RUBRIC_VERSION_V17;
export const WITAN_PROSPECTIVE_RUBRIC_VERSIONS = Object.freeze([
  WITAN_RUBRIC_VERSION_V18,
  WITAN_RUBRIC_VERSION_V19,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
  WITAN_RUBRIC_VERSION_V22,
] as const);

// The complete set of rubric identifiers a caller may explicitly select: the calibrated default
// plus every wired prospective rubric. This is deliberately narrower than "every rubric version
// this package has ever implemented" (v0-v16 remain load-bearing for historical fixtures and
// regression tests, but are not offered as a live selection) — it is the same "callers must opt
// in explicitly" set every V18-V22 constant above documents.
export const WITAN_SELECTABLE_RUBRIC_VERSIONS = Object.freeze([
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  ...WITAN_PROSPECTIVE_RUBRIC_VERSIONS,
] as const);

/**
 * Fail closed on an explicitly supplied rubric selector that isn't wired. Passing an unwired or
 * misspelled rubric string must not silently fall through to whatever default `createWitanReport`
 * happens to apply to an unrecognized version string — that produces a certificate whose
 * `rubricVersion` field states a rubric that did not actually run. Absence is not covered here:
 * an absent selector legitimately takes the default, checked by the caller before invoking this.
 */
export function assertSelectableRubricVersion(rubricVersion: string): void {
  if ((WITAN_SELECTABLE_RUBRIC_VERSIONS as readonly string[]).includes(rubricVersion)) return;
  throw new Error(
    `Cejel: unrecognized rubric version: "${rubricVersion}". Accepted values: ${WITAN_SELECTABLE_RUBRIC_VERSIONS.join(', ')}.`,
  );
}

/** True for any rubric that has not cleared the calibration gate (currently v18-v22). */
export function isProspectiveRubricVersion(rubricVersion: string): boolean {
  return (WITAN_PROSPECTIVE_RUBRIC_VERSIONS as readonly string[]).includes(rubricVersion);
}

/**
 * Human-facing warning for a prospective-rubric certificate — terminal, HTML, and Markdown
 * renderers only. Deliberately never attached to report.json/attestation.json/summary.json/
 * badge.json: adding a field to those schemas would change their shape for every scan, including
 * the calibrated default, which is exactly the default-path behavior change `--rubric-pin` must
 * never cause. Those artifacts already name the exact rubric that ran via the existing
 * `rubricVersion` field; any downstream consumer can call `isProspectiveRubricVersion` on it.
 */
export const PROSPECTIVE_RUBRIC_NOTICE =
  'PROSPECTIVE / UNCALIBRATED RUBRIC — this rubric has not cleared a calibration gate. Scores, verdicts, and findings produced under it carry no precision/recall claim and are not comparable to a calibrated certificate.';
