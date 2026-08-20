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

// Every metric emitted by the repository detector must be registered here before it can compile.
// The glossary guard below then requires a reader-facing definition for every registered name.
// Labels are presentation-only: report values, maxima, weights, and rubric behavior do not read
// this registry.
export const CERTIFICATE_METRIC_REGISTRY = {
  test_to_source_ratio: { displayLabel: 'Test-to-source file ratio' },
  coverage_percent: { displayLabel: 'Static coverage percentage' },
  verification_script_ratio: { displayLabel: 'Verification script ratio' },
  non_hollow_test_share: { displayLabel: 'Non-hollow test share' },
  secret_cleanliness: { displayLabel: 'Secret cleanliness' },
  env_handling_depth: { displayLabel: 'Environment handling depth' },
  rls_policy_count: { displayLabel: 'RLS policy count' },
  tenant_scope_ratio: { displayLabel: 'Tenant-scoped schema ratio' },
  crypto_comparison_hygiene: { displayLabel: 'Crypto comparison hygiene' },
  prod_readiness_primitives: { displayLabel: 'Production-readiness basic checks' },
  prod_workflow_depth: {
    displayLabel: 'Production workflow depth (automated build/test/release pipeline)',
  },
  observability_depth: { displayLabel: 'Observability depth' },
  rollback_safety_depth: { displayLabel: 'Rollback and migration-safety depth' },
  dependency_automation_ratio: { displayLabel: 'Dependency automation ratio' },
  pinned_dependency_ratio: { displayLabel: 'Pinned dependency ratio' },
  lockfile_coverage: { displayLabel: 'Lockfile coverage' },
  declared_version_range_ratio: { displayLabel: 'Declared version range ratio' },
  dependency_count_sanity: { displayLabel: 'Dependency count sanity' },
  claim_match_rate: { displayLabel: 'Claim match rate' },
  claim_source_depth: { displayLabel: 'Claim source depth' },
  reconciliation_artifact_depth: { displayLabel: 'Reconciliation artifact depth' },
  pr_trace_primitives: { displayLabel: 'PR trace basic checks' },
  pr_merge_ratio: { displayLabel: 'Recent commits with recognizable PR references' },
  ci_script_depth: { displayLabel: 'CI verification depth' },
  default_branch_ci_depth: {
    displayLabel: 'PR-gate CI workflow count (automated build/test pipeline)',
  },
  audit_artifact_depth: { displayLabel: 'Audit artifact depth' },
  audit_freshness_depth: { displayLabel: 'Audit freshness depth' },
  kill_switch_fail_safe_present: { displayLabel: 'Un-overridable kill-switch present' },
  human_gate_documented: { displayLabel: 'Human gate documented' },
  fail_closed_privilege_check: { displayLabel: 'Fail-closed privilege check present' },
  privilege_escalation_cleanliness: { displayLabel: 'Privilege-escalation cleanliness' },
  protected_path_review_gate: { displayLabel: 'Protected-path review gate' },
} as const;

export type CertificateMetricName = keyof typeof CERTIFICATE_METRIC_REGISTRY;

// Reader-facing copy. Detector-produced component names are carried as optional presentation
// metadata in WitanReport so a persisted certificate can still name what was present and missing.
// None of this copy participates in metric values, weights, scores, or calibrated statuses.
export const CERTIFICATE_GLOSSARY: readonly CertificateGlossaryEntry[] = [
  {
    key: 'labels',
    term: 'labels / why the labels differ',
    definition:
      'Three labels can appear on one line because they answer three different questions. Finding severity describes how serious one issue is. The dimension band summarizes the criterion evidence. The numeric band comes from the weighted score.',
    metricNames: [],
  },
  {
    key: 'capped',
    term: 'capped',
    definition:
      'Credit stops increasing after the maximum defined by the scoring rubric, even when the raw count is higher. Caps are fixed per rubric version because they are part of what was calibrated. Extra volume therefore cannot outweigh the rest of the rubric.',
    metricNames: [],
  },
  {
    key: 'test-to-source-file-ratio',
    term: 'Test-to-source file ratio',
    definition:
      'The number of detected test files compared with detected source files. A larger implementation surface needs a correspondingly visible test surface.',
    metricNames: ['test_to_source_ratio'],
  },
  {
    key: 'static-coverage',
    term: 'Static coverage percentage',
    definition:
      'A percentage read from a coverage report or threshold that the repository itself publishes. Cejel does not run the repository\'s tests. The scoring rubric defines how much credit the published percentage receives.',
    metricNames: ['coverage_percent'],
  },
  {
    key: 'verification-script',
    term: 'Verification script ratio',
    definition:
      'A capped scoring input that adds one for each detected test, coverage, lint, or type-check command and one for each detected test-runner configuration file. The raw count is capped at four for scoring. Build is not measured by this metric.',
    metricNames: ['verification_script_ratio'],
  },
  {
    key: 'non-hollow',
    term: 'Non-hollow test share',
    definition: 'test files that actually assert something rather than being empty or skipped',
    metricNames: ['non_hollow_test_share'],
  },
  {
    key: 'secrets',
    term: 'Secret cleanliness',
    definition:
      'A binary result. Clean means the static repository-tree and reachable-history scan produced no critical secret finding. It is not a count of files containing secrets.',
    metricNames: ['secret_cleanliness'],
  },
  {
    key: 'environment-handling-depth',
    term: 'Environment handling depth',
    definition:
      'A count of three named practices: an environment template file, a .gitignore rule for environment files, and environment reads in implementation code in a supported language.',
    metricNames: ['env_handling_depth'],
  },
  {
    key: 'rls-policy-count',
    term: 'RLS policy count',
    definition:
      'A selected-rubric static count of row-level-security markers. The calibrated detector counts CREATE POLICY, ENABLE ROW LEVEL SECURITY, and FORCE ROW LEVEL SECURITY matches. Prospective native-RLS detection counts repository-native CREATE POLICY definitions.',
    metricNames: ['rls_policy_count'],
  },
  {
    key: 'tenant-scoped-schema-ratio',
    term: 'Tenant-scoped schema ratio',
    definition:
      'The share of detected data-layer or migration files carrying the selected rubric\'s tenant-scope marker. Prospective native-RLS detection instead uses repository-native scoped storage files. It is a file-level static proxy, not a table-by-table proof.',
    metricNames: ['tenant_scope_ratio'],
  },
  {
    key: 'crypto-comparison-hygiene',
    term: 'Crypto comparison hygiene',
    definition:
      'A conditional binary result shown only when production code exposes a signing, HMAC, or secret-comparison surface. Clean means no detected plain-equality secret comparison or non-canonical JSON signing pattern. Detected constant-time comparison and canonical serialization are positive evidence, but the metric does not require both when only one relevant surface exists.',
    metricNames: ['crypto_comparison_hygiene'],
  },
  {
    key: 'production-readiness-basic-checks',
    term: 'Production-readiness basic checks',
    definition:
      'A count of six named checks: a build or type-check command, a CI workflow, deployment configuration, an environment template, a health or readiness signal, and an error boundary.',
    metricNames: ['prod_readiness_primitives'],
  },
  {
    key: 'pr-trace-basic-checks',
    term: 'PR trace basic checks',
    definition:
      'A capped scoring input that counts detected CI workflow files, a pull-request template, and a review-gate record such as CODEOWNERS or branch-protection documentation. The raw count is capped at two for scoring.',
    metricNames: ['pr_trace_primitives'],
  },
  {
    key: 'workflow-depth',
    term: 'Production workflow depth (automated build/test/release pipeline)',
    definition:
      'The number of detected CI workflow files plus deployment-configuration files, capped at six for scoring. It counts files, not team policies or distinct pipeline stages.',
    metricNames: ['prod_workflow_depth'],
  },
  {
    key: 'observability-depth',
    term: 'Observability depth',
    definition:
      'The number of implementation files containing a recognized logging, metrics, tracing, or error-reporting marker, capped at four for scoring.',
    metricNames: ['observability_depth'],
  },
  {
    key: 'rollback-and-migration-safety-depth',
    term: 'Rollback and migration-safety depth',
    definition:
      'The number of files under recognized documentation, migration, or script paths containing a rollback, reversal, undo, or migration-safety marker, capped at four for scoring.',
    metricNames: ['rollback_safety_depth'],
  },
  {
    key: 'dependency-automation-ratio',
    term: 'Dependency automation ratio',
    definition:
      'The share of expected automated dependency-update and audit controls that are present. Stale or vulnerable packages otherwise depend on manual discovery.',
    metricNames: ['dependency_automation_ratio'],
  },
  {
    key: 'pinned-dependency-ratio',
    term: 'Pinned dependency ratio',
    definition:
      'The share of application dependencies fixed to exact versions. Exact inputs make deployed builds more reproducible.',
    metricNames: ['pinned_dependency_ratio'],
  },
  {
    key: 'lockfile-coverage',
    term: 'Lockfile coverage',
    definition:
      'A binary check for at least one detected lockfile in the scanned package or its covering monorepo root. It does not compare each manifest with a separate lockfile.',
    metricNames: ['lockfile_coverage'],
  },
  {
    key: 'declared-version-range-ratio',
    term: 'Declared version range ratio',
    definition:
      'For a library or CLI, the share of detected dependency specifications carrying any explicit constraint, including an exact version or a compatible range. Bare names, *, latest, and x do not count.',
    metricNames: ['declared_version_range_ratio'],
  },
  {
    key: 'dependency-count-sanity',
    term: 'Dependency count sanity',
    definition:
      'A low-weight library/CLI metric with full credit through 120 detected dependency specifications across manifests, then linearly declining to zero over the next 240.',
    metricNames: ['dependency_count_sanity'],
  },
  {
    key: 'claim-match-rate',
    term: 'Claim match rate',
    definition:
      'A bounded static proxy: detected implementation-file count divided by that count plus detected headline claim-source document count. It does not semantically decide whether individual prose claims are true.',
    metricNames: ['claim_match_rate'],
  },
  {
    key: 'claim-source-depth',
    term: 'Claim source depth',
    definition:
      'The number of detected README or headline claim-source documents, capped at four for scoring. It measures visible document depth, not the truth or specificity of their prose.',
    metricNames: ['claim_source_depth'],
  },
  {
    key: 'reconciliation-artifact-depth',
    term: 'Reconciliation artifact depth',
    definition:
      'The number of detected dedicated claim-reality reconciliation artifacts, capped at three for scoring.',
    metricNames: ['reconciliation_artifact_depth'],
  },
  {
    key: 'recent-pr-merge-ratio',
    term: 'Recent commits with recognizable PR references',
    definition:
      'Among up to 12 recent local commit subjects, the share containing “merge pull request”, “pull request”, or a #number reference. A zero means no recognizable reference was found, not that Cejel detected a merge without a PR. When history is empty or unavailable, scoring conservatively uses a denominator of one.',
    metricNames: ['pr_merge_ratio'],
  },
  {
    key: 'ci-verification-depth',
    term: 'CI verification depth',
    definition:
      'A capped scoring input that adds package-script and CI-command detections separately for test, lint, type-check, and build. The same category can therefore contribute once as a package script and once in CI. The raw count is capped at four for scoring.',
    metricNames: ['ci_script_depth'],
  },
  {
    key: 'pr-gate-ci-workflow-count',
    term: 'PR-gate CI workflow count (automated build/test pipeline)',
    definition:
      'The number of detected CI workflow files configured for pull requests or the main or master branch, including a covering monorepo-root workflow, capped at four for scoring.',
    metricNames: ['default_branch_ci_depth'],
  },
  {
    key: 'audit-artifact-depth',
    term: 'Audit artifact depth',
    definition:
      'The number of files whose paths match recognized changelog, audit, incident, status, runbook, provenance, release-note, or security-policy forms, capped at three for scoring.',
    metricNames: ['audit_artifact_depth'],
  },
  {
    key: 'audit-freshness-depth',
    term: 'Audit freshness depth',
    definition:
      'The share of detected audit-artifact files containing recent, latest, or current, or the applicable reference year. The calibrated rubric uses the scan year. Prospective v19 uses the scanned HEAD committer year when available. This is a text-marker proxy, not a file-history age check.',
    metricNames: ['audit_freshness_depth'],
  },
  {
    key: 'un-overridable-kill-switch',
    term: 'Un-overridable kill-switch present',
    definition:
      'A positive-only binary check for a named governance or safety toggle whose falsy state immediately returns or throws before lower-priority configuration can proceed. The metric is omitted when no such pattern is detected.',
    metricNames: ['kill_switch_fail_safe_present'],
  },
  {
    key: 'human-gate-documented',
    term: 'Human gate documented',
    definition:
      'A binary check for documentation saying privileged or credentialed operations are human-executed or human-gated and never agent-run. It is scored only when a privileged-operation-shaped surface exists.',
    metricNames: ['human_gate_documented'],
  },
  {
    key: 'fail-closed-privilege-check',
    term: 'Fail-closed privilege check present',
    definition:
      'A binary check for implementation code that checks role membership and fails closed before setting or elevating a role. It is scored only when a privileged-operation-shaped surface exists.',
    metricNames: ['fail_closed_privilege_check'],
  },
  {
    key: 'privilege-escalation-cleanliness',
    term: 'Privilege-escalation cleanliness',
    definition:
      'A binary result. Clean means the selected rubric detected no ungated production privilege-escalation pattern. The calibrated detector checks executed role-membership grants and SUPERUSER escalation. Prospective v21 also checks authored administrative SQL and direct database-driver literals for administrative role grants and schema-wide table grants. Tests and fixtures are excluded from the metric.',
    metricNames: ['privilege_escalation_cleanliness'],
  },
  {
    key: 'protected-path-review-gate',
    term: 'Protected-path review gate',
    definition:
      'A binary check for a CODEOWNERS file or documentation of required review or branch protection. This is the repository-visible proxy for human review of sensitive-path changes.',
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
      term: formatCertificateMetricLabel(metric),
      definition: metric.description
        ? `${metric.description} This measurement contributes to the criterion score.`
        : 'A measured input to this criterion. This measurement contributes to the criterion score.',
      metricNames: [metric.name],
    }
  );
}

export function formatCertificateMetricLabel(metric: WitanCriterionMetric): string {
  return (
    CERTIFICATE_METRIC_REGISTRY[metric.name as CertificateMetricName]?.displayLabel ?? metric.label
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

function labelAlreadyStatesUnit(label: string, unit: string | undefined): boolean {
  if (!unit) return false;
  const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s-])${escapedUnit}$`, 'i').test(label.trim());
}

const BINARY_METRIC_COPY: Readonly<
  Partial<Record<CertificateMetricName, { positive: string; negative: string }>>
> = {
  secret_cleanliness: {
    positive: 'clean — no critical secret findings detected',
    negative: 'not clean — one or more critical secret findings detected',
  },
  crypto_comparison_hygiene: {
    positive: 'clean — no insecure comparison or serialization pattern detected',
    negative: 'not clean — an insecure comparison or serialization pattern was detected',
  },
  lockfile_coverage: {
    positive: 'present — at least one covering lockfile detected',
    negative: 'missing — no covering lockfile detected',
  },
  kill_switch_fail_safe_present: {
    positive: 'present — a fail-closed safety toggle was detected',
    negative: 'missing — no fail-closed safety toggle detected',
  },
  human_gate_documented: {
    positive: 'present — privileged operations are documented as human-executed or gated',
    negative: 'missing — no human-gate documentation detected',
  },
  fail_closed_privilege_check: {
    positive: 'present — role membership is checked fail-closed before elevation',
    negative: 'missing — no fail-closed pre-elevation role check detected',
  },
  privilege_escalation_cleanliness: {
    positive: 'clean — no ungated production privilege-escalation pattern detected',
    negative: 'not clean — an ungated production privilege-escalation pattern was detected',
  },
  protected_path_review_gate: {
    positive: 'present — CODEOWNERS or a documented required-review policy was detected',
    negative: 'missing — no CODEOWNERS or documented required-review policy detected',
  },
};

const CONDITIONAL_METRIC_COPY: Readonly<Partial<Record<CertificateMetricName, string>>> = {
  crypto_comparison_hygiene: 'scored because a signing, HMAC, or secret-comparison surface was detected',
  rls_policy_count: 'scored because a multi-tenant data surface was detected',
  tenant_scope_ratio: 'scored because a multi-tenant data surface was detected',
  human_gate_documented: 'scored because a privileged-operation-shaped surface was detected',
  fail_closed_privilege_check: 'scored because a privileged-operation-shaped surface was detected',
  kill_switch_fail_safe_present:
    'shown because a fail-closed kill switch was detected; this positive-only metric is omitted when absent',
};

function appendMetricCondition(metric: WitanCriterionMetric, value: string): string {
  const condition =
    metric.presentation?.condition ??
    CONDITIONAL_METRIC_COPY[metric.name as CertificateMetricName];
  return condition ? `${value}; ${condition}` : value;
}

function formatEnumerableMetric(metric: WitanCriterionMetric): string | null {
  const components = metric.presentation?.components;
  if (!components || metric.max === undefined) return null;
  const present = components
    .filter((component) => component.count > 0)
    .map((component) =>
      component.count === 1 ? component.label : `${component.label} (${component.count} detected)`,
    );
  const missing = components
    .filter((component) => component.count === 0)
    .map((component) => component.label);
  const value =
    metric.kind === 'saturating_count' && metric.value > metric.max
      ? `${formatMetricNumber(metric.max)}/${formatMetricNumber(metric.max)} (capped; ${formatMetricNumber(metric.value)} raw)`
      : `${formatMetricNumber(metric.value)}/${formatMetricNumber(metric.max)}`;
  return `${value} — present: ${present.length > 0 ? present.join(', ') : 'none'}; missing: ${missing.length > 0 ? missing.join(', ') : 'none'}`;
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
    return appendMetricCondition(
      metric,
      metric.value > metric.max ? `${comparison} (credit capped at parity)` : comparison,
    );
  }
  const binaryCopy = BINARY_METRIC_COPY[metric.name as CertificateMetricName];
  if (binaryCopy && metric.max === 1 && (metric.value === 0 || metric.value === 1)) {
    return appendMetricCondition(metric, metric.value === 1 ? binaryCopy.positive : binaryCopy.negative);
  }
  if (metric.name === 'pr_merge_ratio' && metric.max !== undefined) {
    const value =
      metric.value === 0
        ? `none found in bounded recent commit subjects (scoring value 0/${formatMetricNumber(metric.max)})`
        : `${formatMetricNumber(metric.value)} of ${formatMetricNumber(metric.max)} recent commit subjects contain a recognizable PR reference`;
    return appendMetricCondition(metric, value);
  }
  const enumerable = formatEnumerableMetric(metric);
  if (enumerable) return appendMetricCondition(metric, enumerable);
  // A unit that repeats the trailing word of its own label reads as a typo once concatenated, so
  // suppress it. The basic-check metrics retain their reader-facing "checks" unit for legacy
  // reports that predate component-level presentation data.
  const displayUnit =
    metric.name === 'prod_readiness_primitives' || metric.name === 'pr_trace_primitives'
      ? 'checks'
      : labelAlreadyStatesUnit(formatCertificateMetricLabel(metric), metric.unit)
        ? undefined
        : metric.unit;
  const unit = displayUnit ? ` ${displayUnit}` : '';
  if (metric.max === undefined) {
    return appendMetricCondition(metric, `${formatMetricNumber(metric.value)}${unit}`);
  }
  if (metric.kind === 'saturating_count' && metric.value > metric.max) {
    return appendMetricCondition(
      metric,
      `${formatMetricNumber(metric.max)}${unit} (capped; ${formatMetricNumber(metric.value)} raw)`,
    );
  }
  return appendMetricCondition(
    metric,
    `${formatMetricNumber(metric.value)}/${formatMetricNumber(metric.max)}${unit}`,
  );
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
  if (
    !report.repo.headSha &&
    report.criteria.some((criterion) =>
      criterion.metrics.some((metric) => metric.name === 'pr_merge_ratio'),
    )
  ) {
    gaps.push(
      'Git history was unavailable, so the recent-commit PR-reference proxy found no commit subjects to inspect; its conservative scoring zero is not a detected merge outcome.',
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
