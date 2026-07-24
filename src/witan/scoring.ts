import {
  WITAN_RUBRIC_VERSION_V1,
  WITAN_RUBRIC_VERSION_V2,
  WITAN_RUBRIC_VERSION_V3,
  WITAN_RUBRIC_VERSION_V4,
  WITAN_RUBRIC_VERSION_V5,
  WITAN_RUBRIC_VERSION_V6,
  WITAN_RUBRIC_VERSION_V7,
  WITAN_RUBRIC_VERSION_V8,
  WITAN_TRADING_RUBRIC_VERSION_V0,
  type WitanConsumedSignalSummary,
  type WitanCriterionId,
  type WitanCriterionMetric,
  type WitanCriterionScore,
  type WitanCriterionSignal,
  type WitanCriterionStatus,
  type WitanEvidencePointer,
  type WitanFinding,
  type WitanInputSignal,
  type WitanReport,
  type WitanReportInputPayload,
  WitanReportInputSchema,
  WitanReportSchema,
  witanVerdictForScore,
} from './schemas.js';

import {
  WITAN_RUBRIC_VERSION_V9,
  WITAN_RUBRIC_VERSION_V10,
  WITAN_RUBRIC_VERSION_V11,
  WITAN_RUBRIC_VERSION_V12,
  WITAN_RUBRIC_VERSION_V13,
  WITAN_RUBRIC_VERSION_V14,
  WITAN_RUBRIC_VERSION_V15,
} from './rubric-version.js';
import { WITAN_RUBRIC, type WitanRubricCriterion } from './rubric.js';

// ---- Signal bounding cap (documented for operator review) --------------------
//
// MAX_SIGNAL_ADJUSTMENT is the hard ceiling on how much external signals can
// lower any single dimension score.
//
// Cap math (per dimension D):
//   For each WitanInputSignal S targeting D with weight w:
//     severityScore   = min(criticalCount×0.20 + warningCount×0.10 + infoCount×0.02, 1.0)
//     signalAdj       = w × severityScore × MAX_SIGNAL_ADJUSTMENT
//   totalRawAdj = Σ signalAdj over all S targeting D
//   totalAdj    = min(totalRawAdj, MAX_SIGNAL_ADJUSTMENT)        ← hard cap
//   adjustedScore = max(0, roundScore(nativeScore − totalAdj))
//
// Guarantee (native core dominates):
//   • totalAdj ≤ 0.8 always, regardless of how many findings or signals exist.
//   • A "verified" native score (≥ 3.5) → adjusted ≥ 3.5 − 0.8 = 2.7 ("info").
//     Signals alone cannot change a verified dimension to "warning" or "critical".
//   • With NO signals: totalAdj = 0, output is byte-identical to the no-signal path.
//
const MAX_SIGNAL_ADJUSTMENT = 0.8;

export function createWitanReport(
  input: WitanReportInputPayload,
  inputSignals?: readonly WitanInputSignal[],
  rubric: readonly WitanRubricCriterion[] = WITAN_RUBRIC,
): WitanReport {
  const parsedInput = WitanReportInputSchema.parse(input);
  const signalsByCriterion = mergeSignalsByCriterion(parsedInput.signals);
  const hasInputSignals = inputSignals != null && inputSignals.length > 0;

  // Group input signals by dimension for O(1) lookup.
  const inputSignalsByDimension = new Map<WitanCriterionId, WitanInputSignal[]>();
  if (hasInputSignals && inputSignals) {
    for (const signal of inputSignals) {
      const bucket = inputSignalsByDimension.get(signal.dimension) ?? [];
      bucket.push(signal);
      inputSignalsByDimension.set(signal.dimension, bucket);
    }
  }

  const consumedSignals: WitanConsumedSignalSummary[] = [];

  const criteria = rubric.map((rubricCriterion) => {
    const id = rubricCriterion.id;
    const signal = signalsByCriterion.get(id);
    const scored = scoreCriterion(signal, parsedInput.rubricVersion);

    // Apply bounded input-signal adjustment on top of native score.
    const dimensionSignals = inputSignalsByDimension.get(id);
    if (!dimensionSignals || dimensionSignals.length === 0) {
      return {
        id,
        title: rubricCriterion.title,
        category: rubricCriterion.category,
        score: scored.score,
        status: scored.status,
        evidence: scored.evidence,
        findings: scored.findings,
        metrics: scored.metrics,
        ...(signal?.notes ? { notes: signal.notes } : {}),
      } satisfies WitanCriterionScore;
    }

    const { adjustedScore, adjustment, summaries } = applySignalAdjustment(
      scored.score,
      id,
      dimensionSignals,
    );
    consumedSignals.push(...summaries);

    const finalScore = adjustment === 0 ? scored.score : adjustedScore;
    const finalStatus = statusAfterInputAdjustment(
      scored.status,
      scored.score,
      adjustment,
      parsedInput.rubricVersion,
    );

    return {
      id,
      title: rubricCriterion.title,
      category: rubricCriterion.category,
      score: finalScore,
      ...(adjustment !== 0 ? { nativeScore: scored.score } : {}),
      status: finalStatus,
      evidence: scored.evidence,
      findings: scored.findings,
      metrics: scored.metrics,
      ...(signal?.notes ? { notes: signal.notes } : {}),
    } satisfies WitanCriterionScore;
  });

  // Category buckets in rubric-declared order (dedup, first-seen). The default rubric
  // always yields exactly ['code_trust', 'process_trust'], so codeTrustScore/processTrustScore
  // below are computed identically to before for the default path.
  const categoryOrder: string[] = [];
  for (const rubricCriterion of rubric) {
    if (!categoryOrder.includes(rubricCriterion.category)) {
      categoryOrder.push(rubricCriterion.category);
    }
  }
  const categoryScoreMap: Record<string, number> = {};
  for (const category of categoryOrder) {
    categoryScoreMap[category] = averageScore(
      criteria.filter((criterion) => criterion.category === category),
    );
  }

  const firstCategory = categoryOrder[0];
  const secondCategory = categoryOrder[1] ?? firstCategory;
  const codeTrustScore =
    categoryScoreMap.code_trust ??
    (firstCategory ? categoryScoreMap[firstCategory] : undefined) ??
    0;
  const processTrustScore =
    categoryScoreMap.process_trust ??
    (secondCategory ? categoryScoreMap[secondCategory] : undefined) ??
    0;
  // overallScore is an unweighted mean of the category averages (currently code_trust and
  // process_trust for the default rubric), NOT a mean over all applicable criteria — this
  // is intentional (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3 M3): each
  // category is meant to carry equal weight in the headline score regardless of how many
  // criteria within it are applicable to a given repo archetype. The tradeoff: when one
  // category has only a single applicable criterion (e.g. a non-substrate repo where B1
  // and B5 are N/A, leaving B4 alone in process_trust), that lone criterion determines the
  // full 50% weight of process_trust. This is a deliberate category-parity choice, not an
  // oversight — see the criterion-count-weighted alternative considered and rejected in
  // lab_notes/_business/cejel_calibration_report_2026-07-06.md's "v2 hardening" section.
  const overallScore = roundScore(
    categoryOrder.reduce((sum, category) => sum + (categoryScoreMap[category] ?? 0), 0) /
      Math.max(categoryOrder.length, 1),
  );

  const abstained = parsedInput.insufficientSourceReason != null;

  return WitanReportSchema.parse({
    productSlug: parsedInput.productSlug,
    productDisplayName: parsedInput.productDisplayName,
    repo: parsedInput.repo,
    generatedAt: parsedInput.generatedAt,
    rubricVersion: parsedInput.rubricVersion,
    verdict: abstained ? 'insufficient_source' : witanVerdictForScore(overallScore),
    codeTrustScore: abstained ? null : codeTrustScore,
    processTrustScore: abstained ? null : processTrustScore,
    overallScore: abstained ? null : overallScore,
    criteria,
    ...(consumedSignals.length > 0 ? { consumedSignals } : {}),
    // Only surface the full per-category map for rubrics with more than two buckets —
    // the default two-category rubric is fully represented by codeTrustScore/processTrustScore.
    ...(!abstained && categoryOrder.length > 2 ? { categoryScores: categoryScoreMap } : {}),
    // Pass through repo-archetype metadata verbatim — createWitanReport does not compute or
    // alter it (see classifyRepoArchetype in repo-signals.ts); per-criterion scoring above is
    // unaffected by archetype, only presentation layers (badge/terminal/verdict) key off it.
    ...(parsedInput.archetype ? { archetype: parsedInput.archetype } : {}),
    ...(parsedInput.insufficientSourceReason
      ? { insufficientSourceReason: parsedInput.insufficientSourceReason }
      : {}),
  });
}

function applySignalAdjustment(
  nativeScore: number,
  dimension: WitanCriterionId,
  signals: readonly WitanInputSignal[],
): { adjustedScore: number; adjustment: number; summaries: WitanConsumedSignalSummary[] } {
  const summaries: WitanConsumedSignalSummary[] = [];
  let totalRawAdj = 0;

  for (const signal of signals) {
    const criticalCount = signal.findings.filter((f) => f.severity === 'critical').length;
    const warningCount = signal.findings.filter((f) => f.severity === 'warning').length;
    const infoCount = signal.findings.filter((f) => f.severity === 'info').length;
    const severityScore = Math.min(
      criticalCount * 0.2 + warningCount * 0.1 + infoCount * 0.02,
      1.0,
    );
    const signalAdj = signal.weight * severityScore * MAX_SIGNAL_ADJUSTMENT;
    totalRawAdj += signalAdj;

    summaries.push({
      source: signal.source,
      dimension,
      findingCount: signal.findings.length,
      severityBreakdown: { critical: criticalCount, warning: warningCount, info: infoCount },
      nativeScore,
      scoreAdjustment: -roundScore(Math.min(signalAdj, MAX_SIGNAL_ADJUSTMENT)),
      adjustedScore: roundScore(
        Math.max(0, nativeScore - Math.min(signalAdj, MAX_SIGNAL_ADJUSTMENT)),
      ),
      findings: [...signal.findings],
    });
  }

  const totalAdj = Math.min(totalRawAdj, MAX_SIGNAL_ADJUSTMENT);
  const adjustedScore = roundScore(Math.max(0, nativeScore - totalAdj));

  // Update each summary's adjustedScore to reflect the capped total (not per-signal).
  for (const summary of summaries) {
    summary.adjustedScore = adjustedScore;
    summary.scoreAdjustment = -roundScore(totalAdj);
  }

  return { adjustedScore, adjustment: roundScore(totalAdj), summaries };
}

function statusForScore(score: number): WitanCriterionStatus {
  if (score >= 3.5) return 'verified';
  if (score >= 2.5) return 'info';
  if (score >= 1.5) return 'warning';
  if (score > 0) return 'critical';
  return 'critical';
}

function statusAfterInputAdjustment(
  nativeStatus: WitanCriterionStatus,
  nativeScore: number,
  adjustment: number,
  rubricVersion: string,
): WitanCriterionStatus {
  if (adjustment === 0) return nativeStatus;
  if (
    rubricVersion !== WITAN_RUBRIC_VERSION_V8 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V9 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V10 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V11 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V12 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V13 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V14 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V15
  ) {
    return statusForScore(roundScore(Math.max(0, nativeScore - adjustment)));
  }

  const statusFloor: Partial<Record<WitanCriterionStatus, number>> = {
    verified: 3.5,
    info: 2.5,
    warning: 1.5,
    critical: 0,
  };
  const severity: Partial<Record<WitanCriterionStatus, number>> = {
    verified: 0,
    info: 1,
    warning: 2,
    critical: 3,
  };
  const floor = statusFloor[nativeStatus];
  const nativeSeverity = severity[nativeStatus];
  if (floor === undefined || nativeSeverity === undefined) return nativeStatus;

  const adjustedSemanticStatus = statusForScore(
    roundScore(Math.max(0, Math.max(nativeScore, floor) - adjustment)),
  );
  return (severity[adjustedSemanticStatus] ?? nativeSeverity) > nativeSeverity
    ? adjustedSemanticStatus
    : nativeStatus;
}

function mergeSignalsByCriterion(
  signals: readonly WitanCriterionSignal[],
): Map<WitanCriterionSignal['criterionId'], WitanCriterionSignal> {
  const merged = new Map<WitanCriterionSignal['criterionId'], WitanCriterionSignal>();

  for (const signal of signals) {
    const existing = merged.get(signal.criterionId);
    if (!existing) {
      merged.set(signal.criterionId, signal);
      continue;
    }

    merged.set(signal.criterionId, {
      criterionId: signal.criterionId,
      positiveEvidence: [...existing.positiveEvidence, ...signal.positiveEvidence],
      findings: [...existing.findings, ...signal.findings],
      metrics: [...(existing.metrics ?? []), ...(signal.metrics ?? [])],
      notes: signal.notes ?? existing.notes,
      // N/A wins on merge: if either signal is N/A, the criterion is N/A.
      ...(existing.notApplicable === true || signal.notApplicable === true
        ? { notApplicable: true as const }
        : {}),
    });
  }

  return merged;
}

// Rubric versions whose criteria carry weighted metrics as the primary signal (rather than
// only positive-evidence/findings counts) — see the metric-scoring fallthrough below. v2
// (goal_cejel_generalize_homefield_rule_and_rescore_protocol_2026-07-12) changed A1's
// scheduled-workflow sub-signal detection, not the scoring algorithm, so it stays on the
// same metric-based path as v1. v3 (goal_cejel_board_must_be_reproducible_2026-07-12) removed
// four home-field evidence collectors' reachability, again not the scoring algorithm, so it
// stays on the same metric-based path too. v4 changes only repository evidence discovery's
// symlink boundary, not the scoring algorithm, and therefore uses the same metric path. v5
// bounds history evidence to HEAD ancestry and likewise does not change the metric formula. v6
// broadens concrete JavaScript test-file discovery to AVA's test.js/test-*.js convention. v7
// changes evidence/applicability/archetype discovery but retains the metric formula.
function usesMetricScoring(rubricVersion: string): boolean {
  return (
    rubricVersion === WITAN_RUBRIC_VERSION_V1 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V2 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V3 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V4 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V5 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V6 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V7 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V8 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_TRADING_RUBRIC_VERSION_V0
  );
}

// Status for a criterion the scorer has NO measurable signal for (no evidence, no findings,
// no depth metrics — nothing to read). For the repo-scan rubrics this is a MEASUREMENT GAP,
// not a measured zero: it maps to 'insufficient_data' and averageScore excludes it from the
// composite (like not_applicable), so a repo the scorer cannot get e.g. PR-outcome data for
// is scored on its measurable signals instead of tanked by an unmeasured 0.0
// (goal_cejel_b2_insufficient_data_not_zero_2026-07-10). The trading rubric is the deliberate
// exception: its evidence is CALLER-supplied (trading-product integrations target the locked
// criterion ids directly), so an unsupplied dimension there is a fail-closed trust failure on
// a money surface — it stays a punitive 0.0-unverified that IS averaged in.
function unmeasuredStatus(rubricVersion: string): WitanCriterionStatus {
  return rubricVersion === WITAN_TRADING_RUBRIC_VERSION_V0 ? 'unverified' : 'insufficient_data';
}

function scoreCriterion(
  signal: WitanCriterionSignal | undefined,
  rubricVersion: string,
): {
  score: number;
  status: WitanCriterionStatus;
  evidence: WitanEvidencePointer[];
  findings: WitanFinding[];
  metrics: WitanCriterionMetric[];
} {
  if (!signal) {
    return {
      score: 0,
      status: unmeasuredStatus(rubricVersion),
      evidence: [],
      findings: [],
      metrics: [],
    };
  }

  if (signal.notApplicable === true) {
    return {
      score: 0,
      status: 'not_applicable',
      evidence: [],
      findings: [],
      metrics: [],
    };
  }

  const evidence = signal.positiveEvidence;
  const findings = signal.findings;
  const metrics = signal.metrics ?? [];
  const evidenceCount = evidence.length + findings.length;

  if (evidenceCount === 0) {
    // FIX 2: In v1 rubric, metrics ARE the primary signal. If the collector emitted metrics
    // (meaning it determined the repo has a ratable surface and ran the full scan), fall
    // through to metric scoring rather than short-circuiting to a 0.0 no-data status. This
    // ensures a ratable-surface repo that produced no positive evidence scores at its honest
    // metric floor (~2.8 via secret_cleanliness) rather than 0.0.
    // Reserve the unmeasured status only for "no metrics, could not analyze".
    if (!usesMetricScoring(rubricVersion) || metrics.length === 0) {
      return {
        score: 0,
        status: unmeasuredStatus(rubricVersion),
        evidence,
        findings,
        metrics,
      };
    }
    // Fall through to metric scoring below.
  }

  if (usesMetricScoring(rubricVersion)) {
    const measuredMetrics =
      metrics.length > 0 ? metrics : fallbackMetricsForEvidence(evidence, findings);
    const score = capScoreForFindings(scoreMetrics(measuredMetrics), findings);
    const status = statusForScoreAndFindings(
      signal.criterionId,
      score,
      findings,
      measuredMetrics,
      rubricVersion,
    );
    return {
      score,
      status,
      evidence,
      findings: ensureFindingsExplainStatus(
        signal.criterionId,
        score,
        status,
        findings,
        evidence,
        rubricVersion,
      ),
      metrics: measuredMetrics,
    };
  }

  if (findings.some((finding) => finding.severity === 'critical')) {
    return {
      score: 1,
      status: 'critical',
      evidence,
      findings,
      metrics,
    };
  }

  if (findings.some((finding) => finding.severity === 'warning')) {
    return {
      score: 2,
      status: 'warning',
      evidence,
      findings,
      metrics,
    };
  }

  if (findings.some((finding) => finding.severity === 'info')) {
    return {
      score: 3,
      status: 'info',
      evidence,
      findings,
      metrics,
    };
  }

  return {
    score: 4,
    status: 'verified',
    evidence,
    findings,
    metrics,
  };
}

function fallbackMetricsForEvidence(
  evidence: readonly WitanEvidencePointer[],
  findings: readonly WitanFinding[],
): WitanCriterionMetric[] {
  return [
    {
      name: 'evidence_depth',
      label: 'Evidence depth',
      value: Math.min(evidence.length + findings.length + 1, 4),
      max: 4,
      weight: 1,
      unit: 'signals',
      description:
        'Conservative v1 fallback for externally supplied evidence that has not provided criterion-specific depth metrics.',
    },
  ];
}

function scoreMetrics(metrics: readonly WitanCriterionMetric[]): number {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const metric of metrics) {
    const normalized = metric.max
      ? Math.min(metric.value / metric.max, 1)
      : Math.min(metric.value, 1);
    weightedTotal += normalized * metric.weight;
    totalWeight += metric.weight;
  }

  if (totalWeight === 0) return 0;
  return roundScore((weightedTotal / totalWeight) * 4);
}

function capScoreForFindings(score: number, findings: readonly WitanFinding[]): number {
  if (findings.some((finding) => finding.severity === 'critical')) return 1.4;
  if (findings.some((finding) => finding.severity === 'warning')) return Math.min(score, 2.4);
  if (findings.some((finding) => finding.severity === 'info')) return Math.min(score, 3.4);
  return score;
}

function statusForScoreAndFindings(
  criterionId: WitanCriterionId,
  score: number,
  findings: readonly WitanFinding[],
  metrics: readonly WitanCriterionMetric[],
  rubricVersion: string,
): WitanCriterionStatus {
  if (findings.some((finding) => finding.severity === 'critical')) return 'critical';
  if (
    rubricVersion === WITAN_RUBRIC_VERSION_V8 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15
  ) {
    const calibrated =
      rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V15
        ? calibratedCriterionStateV11(criterionId, metrics)
        : rubricVersion === WITAN_RUBRIC_VERSION_V9 || rubricVersion === WITAN_RUBRIC_VERSION_V10
          ? calibratedCriterionStateV9(criterionId, metrics)
          : calibratedCriterionStateV8(criterionId, metrics);
    if (calibrated && calibrated !== 'verified') return calibrated;
    if (calibrated === 'verified' && !findings.some((finding) => finding.severity === 'warning')) {
      return 'verified';
    }
  }
  if (findings.some((finding) => finding.severity === 'warning')) return 'warning';
  if (score >= 3.5 && findings.length === 0) return 'verified';
  if (score >= 2.5) return 'info';
  if (score >= 1.5) return 'warning';
  return 'critical';
}

export function calibratedCriterionStateV8(
  criterionId: WitanCriterionId,
  metrics: readonly Pick<WitanCriterionMetric, 'name' | 'value'>[],
): WitanCriterionStatus | undefined {
  const values = new Map(metrics.map(({ name, value }) => [name, value]));
  if (values.size !== metrics.length) return undefined;
  const value = (name: string): number | undefined => values.get(name);
  const positive = (name: string): boolean => (value(name) ?? 0) > 0;

  if (criterionId === 'A1') {
    if (!values.has('non_hollow_test_share') || !values.has('verification_script_ratio')) {
      return undefined;
    }
    if (!positive('non_hollow_test_share')) return 'critical';
    return positive('verification_script_ratio') ? 'verified' : 'warning';
  }
  if (criterionId === 'A2') {
    if (!values.has('secret_cleanliness') || !values.has('env_handling_depth')) return undefined;
    if (!positive('secret_cleanliness')) return 'critical';
    return (value('env_handling_depth') ?? 0) >= 2 ? 'verified' : 'warning';
  }
  if (criterionId === 'A3') {
    if (!values.has('observability_depth') || !values.has('rollback_safety_depth')) {
      return undefined;
    }
    const coveredSurfaces =
      Number(positive('observability_depth')) + Number(positive('rollback_safety_depth'));
    return coveredSurfaces === 2 ? 'verified' : coveredSurfaces === 1 ? 'warning' : 'critical';
  }
  if (criterionId === 'A4') {
    if (
      !values.has('dependency_automation_ratio') ||
      (!values.has('declared_version_range_ratio') && !values.has('pinned_dependency_ratio'))
    ) {
      return undefined;
    }
    const dependencyCountSanity = value('dependency_count_sanity');
    if (dependencyCountSanity !== undefined) {
      if (dependencyCountSanity <= 0) return 'critical';
      if (dependencyCountSanity < 0.9) return 'warning';
    }
    const hasVersionControl =
      positive('declared_version_range_ratio') || positive('pinned_dependency_ratio');
    const hasLockfile = positive('lockfile_coverage');
    const hasAutomation = positive('dependency_automation_ratio');
    if (!hasVersionControl && !hasLockfile && !hasAutomation) return 'critical';
    return hasAutomation && (hasVersionControl || hasLockfile) ? 'verified' : 'warning';
  }
  if (criterionId === 'B2') {
    if (!values.has('pr_trace_primitives') || !values.has('pr_merge_ratio')) return undefined;
    return positive('pr_trace_primitives') && positive('pr_merge_ratio') ? 'verified' : 'warning';
  }
  if (criterionId === 'B3') {
    if (!values.has('ci_script_depth') || !values.has('default_branch_ci_depth')) return undefined;
    const coveredSurfaces =
      Number(positive('ci_script_depth')) + Number(positive('default_branch_ci_depth'));
    return coveredSurfaces === 2 ? 'verified' : coveredSurfaces === 1 ? 'warning' : 'critical';
  }
  if (criterionId === 'B4') {
    if (!values.has('audit_artifact_depth') || !values.has('audit_freshness_depth')) {
      return undefined;
    }
    if (!positive('audit_artifact_depth')) return 'critical';
    return positive('audit_freshness_depth') ? 'verified' : 'warning';
  }
  if (criterionId === 'B6') {
    if (!values.has('human_gate_documented') || !values.has('fail_closed_privilege_check')) {
      return undefined;
    }
    return positive('human_gate_documented') || positive('fail_closed_privilege_check')
      ? 'verified'
      : 'critical';
  }
  return undefined;
}

export function calibratedCriterionStateV9(
  criterionId: WitanCriterionId,
  metrics: readonly Pick<WitanCriterionMetric, 'name' | 'value'>[],
): WitanCriterionStatus | undefined {
  const values = new Map(metrics.map(({ name, value }) => [name, value]));
  if (values.size !== metrics.length) return undefined;
  const value = (name: string): number | undefined => values.get(name);
  const positive = (name: string): boolean => (value(name) ?? 0) > 0;

  if (criterionId === 'A1') {
    if (!values.has('non_hollow_test_share') || !values.has('verification_script_ratio')) {
      return undefined;
    }
    const nonHollowTests = value('non_hollow_test_share') ?? 0;
    if (nonHollowTests === 0) return 'critical';
    return positive('verification_script_ratio') && nonHollowTests >= 3 ? 'verified' : 'warning';
  }
  if (criterionId === 'A2') {
    if (!values.has('secret_cleanliness') || !values.has('env_handling_depth')) return undefined;
    if (!positive('secret_cleanliness')) return 'critical';
    return (value('env_handling_depth') ?? 0) >= 2 ? 'verified' : 'warning';
  }
  if (criterionId === 'A3') {
    if (
      !values.has('prod_readiness_primitives') ||
      !values.has('prod_workflow_depth') ||
      !values.has('observability_depth') ||
      !values.has('rollback_safety_depth')
    ) {
      return undefined;
    }
    const observability = value('observability_depth') ?? 0;
    const rollback = value('rollback_safety_depth') ?? 0;
    if (observability > 0 && rollback > 0) {
      return (value('prod_readiness_primitives') ?? 0) >= 4 && observability >= 2 && rollback >= 2
        ? 'verified'
        : 'warning';
    }
    if (observability > 0 || rollback > 0) return 'warning';
    return (value('prod_readiness_primitives') ?? 0) >= 2 &&
      (value('prod_workflow_depth') ?? 0) >= 8
      ? 'warning'
      : 'critical';
  }
  if (criterionId === 'A4') {
    if (
      !values.has('dependency_automation_ratio') ||
      (!values.has('declared_version_range_ratio') && !values.has('pinned_dependency_ratio'))
    ) {
      return undefined;
    }
    const dependencyCountSanity = value('dependency_count_sanity');
    if (dependencyCountSanity !== undefined) {
      if (dependencyCountSanity <= 0.25) return 'critical';
      if (dependencyCountSanity < 0.5) return 'warning';
    }
    const hasVersionControl =
      positive('declared_version_range_ratio') || positive('pinned_dependency_ratio');
    const hasLockfile = positive('lockfile_coverage');
    const hasAutomation = positive('dependency_automation_ratio');
    if (!hasVersionControl && !hasLockfile && !hasAutomation) return 'warning';
    return hasAutomation && (hasVersionControl || hasLockfile) ? 'verified' : 'warning';
  }
  if (criterionId === 'B2') {
    if (!values.has('pr_trace_primitives') || !values.has('pr_merge_ratio')) return undefined;
    const primitives = value('pr_trace_primitives') ?? 0;
    const mergedOutcomes = value('pr_merge_ratio') ?? 0;
    if (mergedOutcomes === 0) return primitives <= 2 ? 'critical' : 'warning';
    return mergedOutcomes >= 4 ? 'verified' : 'warning';
  }
  if (criterionId === 'B3') {
    if (!values.has('ci_script_depth') || !values.has('default_branch_ci_depth')) return undefined;
    const scriptDepth = value('ci_script_depth') ?? 0;
    const branchDepth = value('default_branch_ci_depth') ?? 0;
    if (scriptDepth === 0 && branchDepth === 0) return 'critical';
    return scriptDepth >= 2 && branchDepth > 0 ? 'verified' : 'warning';
  }
  if (criterionId === 'B4') {
    if (!values.has('audit_artifact_depth') || !values.has('audit_freshness_depth')) {
      return undefined;
    }
    const artifacts = value('audit_artifact_depth') ?? 0;
    const freshness = value('audit_freshness_depth') ?? 0;
    if (artifacts === 0) return 'critical';
    return artifacts >= 2 || freshness >= 2 ? 'verified' : 'warning';
  }
  if (criterionId === 'B6') {
    const humanGate = value('human_gate_documented') ?? 0;
    const failClosed = value('fail_closed_privilege_check') ?? 0;
    if (humanGate > 0 || failClosed > 0) return 'verified';
    if (positive('privilege_escalation_cleanliness') || positive('protected_path_review_gate')) {
      return 'warning';
    }
    if (
      values.has('human_gate_documented') ||
      values.has('fail_closed_privilege_check') ||
      values.has('privilege_escalation_cleanliness') ||
      values.has('protected_path_review_gate')
    ) {
      return 'critical';
    }
  }
  return undefined;
}

export function calibratedCriterionStateV11(
  criterionId: WitanCriterionId,
  metrics: readonly Pick<WitanCriterionMetric, 'name' | 'value'>[],
): WitanCriterionStatus | undefined {
  const values = new Map(metrics.map(({ name, value }) => [name, value]));
  if (values.size !== metrics.length) return undefined;
  const value = (name: string): number | undefined => values.get(name);
  const positive = (name: string): boolean => (value(name) ?? 0) > 0;

  if (criterionId === 'A1') {
    if (!values.has('non_hollow_test_share') || !values.has('verification_script_ratio')) {
      return undefined;
    }
    if (!positive('non_hollow_test_share')) return 'critical';
    return positive('verification_script_ratio') ? 'verified' : 'warning';
  }
  if (criterionId === 'A2') {
    if (!values.has('secret_cleanliness') || !values.has('env_handling_depth')) return undefined;
    if (!positive('secret_cleanliness')) return 'critical';
    return positive('env_handling_depth') ? 'verified' : 'warning';
  }
  if (criterionId === 'A3') {
    if (
      !values.has('prod_readiness_primitives') ||
      !values.has('prod_workflow_depth') ||
      !values.has('observability_depth') ||
      !values.has('rollback_safety_depth')
    ) {
      return undefined;
    }
    const primitives = value('prod_readiness_primitives') ?? 0;
    const workflow = value('prod_workflow_depth') ?? 0;
    const observability = value('observability_depth') ?? 0;
    const rollback = value('rollback_safety_depth') ?? 0;
    if (observability > 0 && rollback > 0) return primitives >= 3 ? 'verified' : 'warning';
    return primitives > 0 && workflow > 0 ? 'warning' : 'critical';
  }
  if (criterionId === 'A4') {
    if (
      !values.has('dependency_automation_ratio') ||
      (!values.has('declared_version_range_ratio') && !values.has('pinned_dependency_ratio'))
    ) {
      return undefined;
    }
    const hasVersionControl =
      positive('declared_version_range_ratio') || positive('pinned_dependency_ratio');
    const hasLockfile = positive('lockfile_coverage');
    const hasAutomation = positive('dependency_automation_ratio');
    if (!hasVersionControl && !hasLockfile && !hasAutomation) return 'critical';
    return hasAutomation && (hasVersionControl || hasLockfile) ? 'verified' : 'warning';
  }
  if (criterionId === 'B2') {
    if (!values.has('pr_trace_primitives') || !values.has('pr_merge_ratio')) return undefined;
    if (!positive('pr_trace_primitives')) return 'critical';
    return positive('pr_merge_ratio') ? 'verified' : 'warning';
  }
  if (criterionId === 'B3') {
    if (!values.has('ci_script_depth') || !values.has('default_branch_ci_depth')) return undefined;
    const covered =
      Number(positive('ci_script_depth')) + Number(positive('default_branch_ci_depth'));
    return covered === 2 ? 'verified' : covered === 1 ? 'warning' : 'critical';
  }
  if (criterionId === 'B4') {
    if (!values.has('audit_artifact_depth') || !values.has('audit_freshness_depth')) {
      return undefined;
    }
    if (!positive('audit_artifact_depth')) return 'critical';
    return positive('audit_freshness_depth') ? 'verified' : 'warning';
  }
  if (criterionId === 'B6') {
    const humanGate = positive('human_gate_documented');
    const failClosed = positive('fail_closed_privilege_check');
    const cleanAndReviewed =
      positive('privilege_escalation_cleanliness') && positive('protected_path_review_gate');
    if (humanGate || failClosed || cleanAndReviewed) return 'verified';
    if (positive('privilege_escalation_cleanliness') || positive('protected_path_review_gate')) {
      return 'warning';
    }
    if (
      values.has('human_gate_documented') ||
      values.has('fail_closed_privilege_check') ||
      values.has('privilege_escalation_cleanliness') ||
      values.has('protected_path_review_gate')
    ) {
      return 'critical';
    }
  }
  return undefined;
}

// A critical/warning status derived purely from a low metric score (rather than from an
// explicit collector finding) must never render as an unexplained red/yellow chip — that
// reads as alarming and undermines trust in the tool itself. When statusForScoreAndFindings
// falls back to the score thresholds with an empty findings list, synthesize the missing
// explanation rather than shipping a bare severity with nothing behind it.
function ensureFindingsExplainStatus(
  criterionId: WitanCriterionId,
  score: number,
  status: WitanCriterionStatus,
  findings: readonly WitanFinding[],
  evidence: readonly WitanEvidencePointer[],
  rubricVersion: string,
): WitanFinding[] {
  if (
    rubricVersion !== WITAN_RUBRIC_VERSION_V8 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V9 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V10 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V11 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V12 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V13 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V14 &&
    rubricVersion !== WITAN_RUBRIC_VERSION_V15 &&
    findings.length > 0
  ) {
    return [...findings];
  }
  if (status !== 'critical' && status !== 'warning') return [...findings];
  if (
    findings.some(
      ({ severity }) => severity === 'critical' || (status === 'warning' && severity === 'warning'),
    )
  ) {
    return [...findings];
  }

  const anchor: WitanEvidencePointer = evidence[0] ?? {
    kind: 'repository',
    label: `${criterionId} metric-derived score`,
    path: '.',
  };
  return [
    ...findings,
    {
      severity: status,
      summary: `${criterionId} metric-derived score is ${score.toFixed(1)}/4.0, in the ${status} band — no single finding drove this; it reflects the combined metric weighting below.`,
      evidence: anchor,
    },
  ];
}

function averageScore(criteria: readonly WitanCriterionScore[]): number {
  // 'insufficient_data' (a measurement gap — nothing to read) is excluded from the composite
  // exactly like 'not_applicable'. 'unverified' stays INCLUDED at 0: it is the deliberate
  // fail-closed zero for the caller-supplied trading rubric, and the legacy value carried by
  // pre-2026-07-10 committed reports — see unmeasuredStatus above.
  const applicable = criteria.filter(
    (criterion) =>
      criterion.status !== 'not_applicable' && criterion.status !== 'insufficient_data',
  );
  if (applicable.length === 0) return 0;
  const total = applicable.reduce((sum, criterion) => sum + criterion.score, 0);
  return roundScore(total / applicable.length);
}

function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}
