import type { WitanCriterionMetric, WitanCriterionScore, WitanFinding } from './schemas.js';
import {
  formatCertificateMetricLabel,
  formatCertificateMetricValue,
} from './certificate-presentation.js';

const METRIC_DERIVED_FINDING_PATTERN =
  /^[A-Z]\d+ metric-derived score is (\d+\.\d)\/4\.0, in the (critical|warning) band — no single finding drove this; it reflects the combined metric weighting below\.$/;

const REMEDIATION_BY_METRIC: Readonly<Record<string, string>> = {
  test_to_source_ratio: 'add concrete regression tests for the implementation surface',
  coverage_percent: 'configure coverage and publish a measured threshold or report',
  verification_script_ratio: 'add explicit test, lint, and typecheck verification commands',
  non_hollow_test_share: 'replace skipped or placeholder tests with live assertions',
  env_handling_depth: 'document and enforce safe environment-secret handling',
  secret_cleanliness: 'remove committed secrets and rotate any exposed credentials',
  tenant_scope_ratio: 'apply tenant scoping consistently across data access',
  rls_policy_count: 'add database row-level security policies where the data model requires them',
  crypto_comparison_hygiene: 'use constant-time comparison for signature or MAC checks',
  prod_readiness_primitives: 'add the missing deployment-readiness controls',
  observability_depth: 'add health checks, structured logging, and error boundaries',
  rollback_safety_depth: 'document and test rollback or recovery procedures',
  pinned_dependency_ratio: 'pin application dependencies that determine the deployed artifact',
  lockfile_coverage: 'commit the package-manager lockfile used by CI and deployment',
  dependency_automation_ratio: 'enable automated dependency updates and an audit command',
  declared_version_range_ratio: 'declare an explicit compatible version for every dependency',
  dependency_count_sanity: 'review and reduce unnecessary direct dependencies',
  claim_match_rate: 'align documented product claims with observable repository evidence',
  claim_source_depth: 'document concrete, checkable product claims',
  reconciliation_artifact_depth: 'publish a claim-to-evidence reconciliation record',
  pr_merge_ratio: 'preserve merged pull-request history in the scanned clone',
  pr_trace_primitives: 'add pull-request templates and outcome-trace records',
  ci_script_depth: 'run the repository verification commands in CI',
  default_branch_ci_depth: 'run CI on the default branch and pull requests',
  prod_workflow_depth: 'add a production or release verification workflow',
  audit_artifact_depth: 'publish changelog, incident, security, or audit records',
  audit_freshness_depth: 'keep the audit trail current',
  human_gate_documented: 'document which privileged operations require human approval',
  protected_path_review_gate: 'require review for changes to protected paths',
  fail_closed_privilege_check: 'make privileged-operation checks fail closed',
  kill_switch_fail_safe_present: 'add a fail-safe kill switch for privileged automation',
  privilege_escalation_cleanliness: 'remove unsafe privilege-escalation patterns',
};

/**
 * Turns the scorer's stable synthetic finding into actionable presentation copy without changing
 * report.json, attestation bindings, rubric scores, or frozen calibration finding identities.
 */
export function renderFindingSummary(
  criterion: WitanCriterionScore,
  finding: WitanFinding,
): string {
  const match = METRIC_DERIVED_FINDING_PATTERN.exec(finding.summary);
  if (!match) return finding.summary;

  const score = match[1] ?? criterion.score.toFixed(1);
  const band = match[2] ?? criterion.status;
  const drivers = selectLowestDrivers(criterion.metrics);
  if (drivers.length === 0) {
    return `${criterion.id} dimension band is ${band} at ${score}/4.0. To improve this dimension, add stronger measurable evidence for ${criterion.title.toLowerCase()}.`;
  }

  const measurements = drivers.map((metric) => formatMetricMember(criterion, metric)).join('; ');
  const actions = Array.from(
    new Set(
      drivers.map(
        (metric) =>
          REMEDIATION_BY_METRIC[metric.name] ??
          `raise the measured ${formatCertificateMetricLabel(metric).toLowerCase()}`,
      ),
    ),
  ).join('; ');
  return `${criterion.id} dimension band is ${band} at ${score}/4.0. Lowest contributing measurements: ${measurements}. To improve: ${actions}.`;
}

function selectLowestDrivers(metrics: readonly WitanCriterionMetric[]): WitanCriterionMetric[] {
  return [...metrics]
    .filter((metric) => metric.max !== undefined)
    .sort((left, right) => {
      const leftRatio = normalizedMetricValue(left);
      const rightRatio = normalizedMetricValue(right);
      if (leftRatio !== rightRatio) return leftRatio - rightRatio;
      if (left.weight !== right.weight) return right.weight - left.weight;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 2);
}

function normalizedMetricValue(metric: WitanCriterionMetric): number {
  if (metric.max === undefined) return 1;
  return Math.min(metric.value / metric.max, 1);
}

function formatMetricMember(
  criterion: WitanCriterionScore,
  metric: WitanCriterionMetric,
): string {
  return `${formatCertificateMetricLabel(metric)} ${formatCertificateMetricValue(criterion, metric)}`;
}
