import type { WitanCriterionMetric, WitanCriterionScore, WitanReport } from './schemas.js';

export interface CertificateGlossaryEntry {
  key: string;
  term: string;
  definition: string;
  metricNames: readonly string[];
}

export interface RelyingPartySummary {
  examined: string;
  established: string;
  notEstablished: string;
  next: string;
}

// Presentation-only copy. Nothing in this file is added to WitanReport, so changing these words
// cannot change report.json, its digest, a rubric score, or a calibrated status.
export const CERTIFICATE_GLOSSARY: readonly CertificateGlossaryEntry[] = [
  {
    key: 'labels',
    term: 'labels / why the labels differ',
    definition:
      'Finding severity describes one issue, the dimension band summarizes the criterion evidence, and the numeric band comes from the weighted score; they matter because each answers a different acceptance question.',
    metricNames: [],
  },
  {
    key: 'capped',
    term: 'capped',
    definition:
      'Credit stops increasing after the stated maximum even when the raw count is higher; this matters because extra volume must not outweigh the rest of the rubric.',
    metricNames: [],
  },
  {
    key: 'test-to-source-file-ratio',
    term: 'test-to-source file ratio',
    definition:
      'The number of detected test files compared with detected source files; it matters because a larger implementation surface needs a correspondingly visible test surface.',
    metricNames: ['test_to_source_ratio'],
  },
  {
    key: 'static-coverage',
    term: 'static coverage',
    definition:
      'A coverage percentage read from an existing report or configured threshold; it matters because Cejel never runs the subject\'s tests, so an absent report is not a measured zero.',
    metricNames: ['coverage_percent'],
  },
  {
    key: 'verification-script',
    term: 'verification script',
    definition: 'the checks that run automatically: tests, linting, type-checking, build',
    metricNames: ['verification_script_ratio'],
  },
  {
    key: 'non-hollow',
    term: 'non-hollow',
    definition: 'test files that actually assert something rather than being empty or skipped',
    metricNames: ['non_hollow_test_share'],
  },
  {
    key: 'secrets',
    term: 'secrets',
    definition: 'credentials like API keys and tokens',
    metricNames: ['secret_cleanliness'],
  },
  {
    key: 'environment-handling-depth',
    term: 'environment handling depth',
    definition:
      'The visible controls for keeping environment-specific configuration and credentials out of source; it matters because unsafe configuration handling can expose production access.',
    metricNames: ['env_handling_depth'],
  },
  {
    key: 'rls-policy-count',
    term: 'RLS policy count',
    definition:
      'The number of detected database row-level security policies; it matters because those policies can enforce which rows each tenant or user may reach.',
    metricNames: ['rls_policy_count'],
  },
  {
    key: 'tenant-scoped-schema-ratio',
    term: 'tenant-scoped schema ratio',
    definition:
      'The share of relevant database tables with a visible tenant boundary; it matters because missing tenant scope can allow one customer\'s data to mix with another\'s.',
    metricNames: ['tenant_scope_ratio'],
  },
  {
    key: 'crypto-comparison-hygiene',
    term: 'crypto comparison hygiene',
    definition:
      'Whether sensitive signatures or authentication codes use timing-safe comparison patterns; it matters because ordinary comparisons can leak information through timing.',
    metricNames: ['crypto_comparison_hygiene'],
  },
  {
    key: 'primitive-coverage',
    term: 'primitive coverage',
    definition:
      'How many expected building-block controls are visibly present, such as health checks or pull-request records; it matters because each missing primitive leaves part of the acceptance story unsupported.',
    metricNames: ['prod_readiness_primitives', 'pr_trace_primitives'],
  },
  {
    key: 'workflow-depth',
    term: 'workflow depth',
    definition:
      'How many relevant automated workflow stages Cejel can see rather than how many workflow files exist; it matters because a deeper workflow checks more of the path to a release.',
    metricNames: ['prod_workflow_depth'],
  },
  {
    key: 'observability-depth',
    term: 'observability depth',
    definition:
      'The visible health, logging, and error-reporting controls; it matters because operators need evidence that failures can be detected and investigated.',
    metricNames: ['observability_depth'],
  },
  {
    key: 'rollback-and-migration-safety-depth',
    term: 'rollback and migration-safety depth',
    definition:
      'The visible procedures and checks for reversing a release or changing stored data safely; it matters because recovery and data changes are high-risk parts of accepting software.',
    metricNames: ['rollback_safety_depth'],
  },
  {
    key: 'dependency-automation-ratio',
    term: 'dependency automation ratio',
    definition:
      'The share of expected automated dependency-update and audit controls that are present; it matters because stale or vulnerable packages otherwise depend on manual discovery.',
    metricNames: ['dependency_automation_ratio'],
  },
  {
    key: 'pinned-dependency-ratio',
    term: 'pinned dependency ratio',
    definition:
      'The share of application dependencies fixed to exact versions; it matters because exact inputs make deployed builds more reproducible.',
    metricNames: ['pinned_dependency_ratio'],
  },
  {
    key: 'lockfile-coverage',
    term: 'lockfile coverage',
    definition:
      'Whether the package manifests are backed by committed lockfiles; it matters because lockfiles record the exact dependency versions selected for a build.',
    metricNames: ['lockfile_coverage'],
  },
  {
    key: 'declared-version-range-ratio',
    term: 'declared version range ratio',
    definition:
      'The share of library dependencies with an explicit compatible version range; it matters because unconstrained dependencies can change without a deliberate source change.',
    metricNames: ['declared_version_range_ratio'],
  },
  {
    key: 'dependency-count-sanity',
    term: 'dependency count sanity',
    definition:
      'A bounded check for an unusually long list of direct dependencies in a library; it matters because every direct dependency adds maintenance and supply-chain exposure.',
    metricNames: ['dependency_count_sanity'],
  },
  {
    key: 'claim-match-rate',
    term: 'claim match rate',
    definition:
      'The share of documented product claims that match visible repository evidence; it matters because an acceptance claim should be checkable against the delivered revision.',
    metricNames: ['claim_match_rate'],
  },
  {
    key: 'claim-source-depth',
    term: 'claim source depth',
    definition:
      'How much concrete, checkable claim material is present; it matters because vague or missing claims give a relying party nothing specific to verify.',
    metricNames: ['claim_source_depth'],
  },
  {
    key: 'reconciliation-artifact-depth',
    term: 'reconciliation artifact depth',
    definition:
      'The visible records connecting stated claims to evidence; it matters because a relying party needs to trace what was promised to what was inspected.',
    metricNames: ['reconciliation_artifact_depth'],
  },
  {
    key: 'recent-pr-merge-ratio',
    term: 'recent PR merge ratio',
    definition:
      'The share of recent visible commits associated with merged pull requests; it matters because review history helps a relying party inspect how changes reached the revision.',
    metricNames: ['pr_merge_ratio'],
  },
  {
    key: 'ci-verification-depth',
    term: 'CI verification depth',
    definition:
      'The number of test, lint, type-check, and build categories Cejel sees running in continuous integration; it matters because automated gates make checks repeatable for each change.',
    metricNames: ['ci_script_depth'],
  },
  {
    key: 'pr-gate-ci-workflow-count',
    term: 'PR-gate CI workflow count',
    definition:
      'The number of workflows that visibly run on pull requests or the default branch; it matters because checks that never gate changes cannot support the acceptance decision.',
    metricNames: ['default_branch_ci_depth'],
  },
  {
    key: 'audit-artifact-depth',
    term: 'audit artifact depth',
    definition:
      'How many durable audit records such as changelogs, incident notes, or security records are present; it matters because past operational decisions should remain inspectable.',
    metricNames: ['audit_artifact_depth'],
  },
  {
    key: 'audit-freshness-depth',
    term: 'audit freshness depth',
    definition:
      'How recently the visible audit records were maintained; it matters because stale records may not describe the revision being accepted.',
    metricNames: ['audit_freshness_depth'],
  },
  {
    key: 'un-overridable-kill-switch',
    term: 'un-overridable kill-switch',
    definition:
      'A stop control that ordinary automation cannot bypass; it matters because operators need a dependable way to halt privileged behavior.',
    metricNames: ['kill_switch_fail_safe_present'],
  },
  {
    key: 'human-gate-documented',
    term: 'human gate documented',
    definition:
      'A written requirement for a person to approve sensitive operations; it matters because high-impact actions should not rely only on unattended automation.',
    metricNames: ['human_gate_documented'],
  },
  {
    key: 'fail-closed-privilege-check',
    term: 'fail-closed privilege check',
    definition:
      'A permission check that refuses the operation when it cannot reach a confident allow decision; it matters because errors must not silently grant elevated access.',
    metricNames: ['fail_closed_privilege_check'],
  },
  {
    key: 'privilege-escalation-cleanliness',
    term: 'privilege-escalation cleanliness',
    definition:
      'The absence of detected patterns that unsafely widen permissions; it matters because unnecessary elevation increases the impact of a mistake or compromise.',
    metricNames: ['privilege_escalation_cleanliness'],
  },
  {
    key: 'protected-path-review-gate',
    term: 'protected-path review gate',
    definition:
      'A rule requiring review before sensitive files or directories can change; it matters because critical controls deserve an explicit second check.',
    metricNames: ['protected_path_review_gate'],
  },
] as const;

const GLOSSARY_BY_METRIC = new Map(
  CERTIFICATE_GLOSSARY.flatMap((entry) =>
    entry.metricNames.map((metricName) => [metricName, entry] as const),
  ),
);

export function glossaryEntryForMetric(metric: WitanCriterionMetric): CertificateGlossaryEntry {
  return (
    GLOSSARY_BY_METRIC.get(metric.name) ?? {
      key: `metric-${metric.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`,
      term: metric.label,
      definition: metric.description
        ? `${metric.description} It matters because this measurement contributes to the criterion score.`
        : 'A measured input to this criterion; it matters because it contributes to the criterion score.',
      metricNames: [metric.name],
    }
  );
}

export function glossaryEntriesForReport(report: WitanReport): readonly CertificateGlossaryEntry[] {
  const entries = new Map(CERTIFICATE_GLOSSARY.map((entry) => [entry.key, entry] as const));
  for (const metric of report.criteria.flatMap((criterion) => criterion.metrics)) {
    const entry = glossaryEntryForMetric(metric);
    entries.set(entry.key, entry);
  }
  return [...entries.values()];
}

export function isCoverageNotMeasured(
  criterion: WitanCriterionScore,
  metric: WitanCriterionMetric,
): boolean {
  if (metric.name !== 'coverage_percent' || metric.value !== 0) return false;
  return ![
    ...criterion.evidence,
    ...criterion.findings.map((finding) => finding.evidence),
  ].some((evidence) => evidence.kind === 'coverage');
}

export function formatCertificateMetricValue(
  criterion: WitanCriterionScore,
  metric: WitanCriterionMetric,
): string {
  if (isCoverageNotMeasured(criterion, metric)) {
    return 'no coverage report found — not measured';
  }
  if (metric.name === 'test_to_source_ratio' && metric.max !== undefined) {
    const tests = formatMetricNumber(metric.value);
    const sources = formatMetricNumber(metric.max);
    const comparison = `${tests} test file${metric.value === 1 ? '' : 's'} / ${sources} source file${metric.max === 1 ? '' : 's'}`;
    return metric.value > metric.max ? `${comparison} (credit capped at parity)` : comparison;
  }
  const unit = metric.unit ? ` ${metric.unit}` : '';
  if (metric.max === undefined) return `${formatMetricNumber(metric.value)}${unit}`;
  if (metric.kind === 'saturating_count' && metric.value > metric.max) {
    return `${formatMetricNumber(metric.max)}${unit} (capped; ${formatMetricNumber(metric.value)} raw)`;
  }
  return `${formatMetricNumber(metric.value)}/${formatMetricNumber(metric.max)}${unit}`;
}

export function buildRelyingPartySummary(report: WitanReport): RelyingPartySummary {
  const applicable = report.criteria.filter((criterion) => criterion.status !== 'not_applicable');
  const measured = applicable.filter((criterion) => criterion.status !== 'insufficient_data');
  const findings = report.criteria.reduce((sum, criterion) => sum + criterion.findings.length, 0);
  const revision = report.repo.headSha
    ? ` at revision ${report.repo.headSha}`
    : ' from the repository snapshot named in this report; no Git revision was available';
  const a1 = report.criteria.find((criterion) => criterion.id === 'A1');
  const coverageMetric = a1?.metrics.find((metric) => metric.name === 'coverage_percent');
  const gaps: string[] = [];
  if (a1 && coverageMetric && isCoverageNotMeasured(a1, coverageMetric)) {
    gaps.push(
      'No coverage report or configured threshold was found, so static coverage was not measured; Cejel does not run the subject\'s tests.',
    );
  }
  const unmeasured = applicable.filter((criterion) => criterion.status === 'insufficient_data');
  if (unmeasured.length > 0) {
    gaps.push(`The report did not measure ${unmeasured.map((criterion) => criterion.id).join(', ')}.`);
  }
  const notApplicable = report.criteria.filter((criterion) => criterion.status === 'not_applicable');
  if (notApplicable.length > 0) {
    gaps.push(
      `${notApplicable.map((criterion) => criterion.id).join(', ')} ${notApplicable.length === 1 ? 'was' : 'were'} marked not applicable and therefore not examined.`,
    );
  }
  if ((report.scanLimitations?.length ?? 0) > 0) {
    const count = report.scanLimitations?.length ?? 0;
    gaps.push(`${count} scan limitation${count === 1 ? '' : 's'} qualifies the readable evidence.`);
  }
  if ((report.contentReadSummary?.skipped ?? 0) > 0) {
    const skipped = report.contentReadSummary?.skipped ?? 0;
    gaps.push(
      `${skipped} content entr${skipped === 1 ? 'y was' : 'ies were'} skipped for the reasons itemized in the certificate.`,
    );
  }
  gaps.push(
    'Anything absent from the measured evidence was not established: no measurement and no finding are not clearance.',
  );

  return {
    examined: `Cejel examined the repository evidence recorded for ${report.productDisplayName}${revision} under ${report.rubricVersion}.`,
    established: `The report established measured results for ${measured.length} of ${applicable.length} applicable rubric dimensions and recorded ${findings} evidence-backed finding${findings === 1 ? '' : 's'}.`,
    notEstablished: gaps.join(' '),
    next:
      'Review the cited evidence and open or unverified items, reproduce the scan at the reported revision when one is available, and obtain missing measurements or resolve limitations before deciding whether to accept the code.',
  };
}

function formatMetricNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
