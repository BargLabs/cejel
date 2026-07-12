import type {
  WitanConsumedSignalSummary,
  WitanCriterionScore,
  WitanEvidencePointer,
  WitanFinding,
  WitanReport,
} from './schemas.js';

import { computeMeasuredCoverage, formatCoverageSummary } from './coverage.js';
import {
  EXTERNAL_FINDINGS_DISPLAY_LIMIT,
  type WitanExternalFinding,
  collectExternalFindings,
  formatExternalSourceLine,
  summarizeExternalSources,
} from './external-findings.js';

export function renderWitanMarkdownReport(report: WitanReport): string {
  const notApplicableCriteria = report.criteria.filter((c) => c.status === 'not_applicable');
  const naSummaryLines =
    notApplicableCriteria.length > 0
      ? [
          `- Not applicable: ${notApplicableCriteria.map((c) => c.id).join(', ')} — substrate-specific criteria excluded from composite (N/A for external code).`,
        ]
      : [];
  // Insufficient-data is surfaced DISTINCTLY from not-applicable: it means the scorer had no
  // measurable signal to read (a measurement gap), not that the criterion does not apply.
  const insufficientDataCriteria = report.criteria.filter((c) => c.status === 'insufficient_data');
  const insufficientDataSummaryLines =
    insufficientDataCriteria.length > 0
      ? [
          `- Insufficient data: ${insufficientDataCriteria.map((c) => c.id).join(', ')} — no measurable signal for the scorer to read; excluded from composite. Unmeasured, not inapplicable, and not a measured zero.`,
        ]
      : [];

  // Measured-coverage indicator (coverage.ts): a score reflects only measured
  // dimensions, and a reader must be able to see how many that is. Display-only.
  const coverage = computeMeasuredCoverage(report);
  const coverageLines = [
    `- Measured coverage: ${formatCoverageSummary(coverage)} dimensions measured — a dimension counts as measured only when it produced a real score; not-applicable and insufficient-data dimensions are unmeasured. A score reflects only its measured dimensions, and unmeasured is not good — it is unknown.`,
    ...(coverage.lowConfidence
      ? [
          '- Low confidence: fewer than half of the dimensions behind at least one score above were measured. Low coverage — scored on few signals, less certain than the same score measured across more dimensions.',
        ]
      : []),
  ];

  const hasSignals = (report.consumedSignals?.length ?? 0) > 0;
  const contributingSources = renderContributingSources(report.consumedSignals ?? []);
  const externalSourceSummaries = summarizeExternalSources(report.consumedSignals ?? []);
  const externalFindings = collectExternalFindings(report.consumedSignals ?? []);

  const lines = [
    `# Cejel Trust Report - ${report.productDisplayName}`,
    '',
    `- Product: ${report.productSlug}`,
    `- Rubric: ${report.rubricVersion}`,
    `- Generated: ${report.generatedAt}`,
    `- Repository: ${renderRepo(report.repo.path ?? report.repo.url ?? 'unknown', report.repo.headSha)}`,
    ...(hasSignals
      ? [
          `- Incorporates findings from: ${contributingSources.join(', ')}`,
          ...externalSourceSummaries.map((s) => `  - ${formatExternalSourceLine(s)}`),
        ]
      : []),
    ...(report.insufficientSourceReason
      ? [`- Verdict: Insufficient source to certify — ${report.insufficientSourceReason}`]
      : []),
    '',
    '## Criterion Profile',
    '',
    ...(hasSignals
      ? [
          '| ID | Criterion | Category | Score | Native | Status | Measurement signals |',
          '|---|---|---|---:|---:|---|---|',
          ...report.criteria.map((c) => renderCriterionRow(c, true)),
        ]
      : [
          '| ID | Criterion | Category | Score | Status | Measurement signals |',
          '|---|---|---|---:|---|---|',
          ...report.criteria.map((c) => renderCriterionRow(c, false)),
        ]),
    '',
    '## Summary Scores',
    '',
    `- Code trust: ${formatScore(report.codeTrustScore)}/4.0`,
    `- Process trust: ${formatScore(report.processTrustScore)}/4.0`,
    `- Overall: ${formatScore(report.overallScore)}/4.0`,
    ...coverageLines,
    ...naSummaryLines,
    ...insufficientDataSummaryLines,
    ...(report.insufficientSourceReason
      ? [
          '',
          '_This repo has insufficient source to certify — the scores above are not a confident' +
            ' judgment of the product, only of the criteria that had any surface to measure. See' +
            ' the Verdict line above for why._',
        ]
      : []),
    '',
    '## Evidence',
    '',
    ...report.criteria.flatMap(renderCriterionEvidence),
    '',
    '## Findings',
    '',
    ...renderFindings(report.criteria),
    '',
    ...(hasSignals
      ? [
          '## Consumed signals',
          '',
          ...renderConsumedSignals(report.consumedSignals ?? []),
          '',
          '## External findings',
          '',
          '_Findings surfaced by ingested external scanners, attributed to the tool and the' +
            " cejel criterion they were folded into — distinct from cejel's own findings in the" +
            ' Findings section above._',
          '',
          ...renderExternalFindings(externalFindings),
          '',
        ]
      : []),
  ];

  return `${lines.join('\n')}`;
}

function renderCriterionRow(criterion: WitanCriterionScore, showNative: boolean): string {
  const scoreDisplay =
    criterion.status === 'not_applicable'
      ? 'N/A'
      : criterion.status === 'insufficient_data'
        ? 'no data'
        : formatScore(criterion.score);
  const nativeDisplay =
    criterion.status === 'not_applicable'
      ? 'N/A'
      : criterion.nativeScore != null
        ? formatScore(criterion.nativeScore)
        : scoreDisplay;
  const cols = [
    criterion.id,
    criterion.title,
    criterion.category === 'code_trust' ? 'Code trust' : 'Process trust',
    scoreDisplay,
    ...(showNative ? [nativeDisplay] : []),
    criterion.status,
    renderCriterionMetrics(criterion),
  ];
  return cols.join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

function renderContributingSources(signals: readonly WitanConsumedSignalSummary[]): string[] {
  return Array.from(new Set(signals.map((s) => s.source))).sort();
}

function renderConsumedSignals(signals: readonly WitanConsumedSignalSummary[]): string[] {
  const lines: string[] = [
    '| Source | Dimension | Findings | Critical | Warning | Info | Native score | Adjustment | Adjusted score |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const s of signals) {
    lines.push(
      [
        s.source,
        s.dimension,
        s.findingCount,
        s.severityBreakdown.critical,
        s.severityBreakdown.warning,
        s.severityBreakdown.info,
        formatScore(s.nativeScore),
        formatScore(Math.abs(s.scoreAdjustment)),
        formatScore(s.adjustedScore),
      ]
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }
  return lines;
}

function renderExternalFindings(findings: readonly WitanExternalFinding[]): string[] {
  if (findings.length === 0) return ['- No external findings ingested.'];

  const shown = findings.slice(0, EXTERNAL_FINDINGS_DISPLAY_LIMIT);
  const lines = shown.map(
    (f) =>
      `- [${f.severity}] ${f.label} → ${f.dimension}: ${f.ruleId} — ${f.message}${
        f.location ? ` (${f.location})` : ''
      }`,
  );
  const remaining = findings.length - shown.length;
  if (remaining > 0) {
    lines.push(`- ...and ${remaining} more — see report.json for the full list.`);
  }
  return lines;
}

function renderCriterionMetrics(criterion: WitanCriterionScore): string {
  if (criterion.status === 'not_applicable') return 'N/A';
  if (criterion.status === 'insufficient_data') {
    return 'Insufficient data — no measurable signal for this criterion';
  }
  if (criterion.metrics.length === 0) return 'No measured depth metrics supplied';
  return criterion.metrics.map(renderMetric).join('; ');
}

function renderMetric(metric: WitanCriterionScore['metrics'][number]): string {
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const valueStr = formatMetricValue(metric.value);
  if (!metric.max) return `${metric.label}: ${valueStr}${unit}`;
  // Saturating-count metrics: value legitimately exceeds max (more-is-better, capped for scoring).
  // Display as "N (cap M)" so the output never implies a bare fraction numerator > denominator.
  if (metric.kind === 'saturating_count') {
    return `${metric.label}: ${valueStr}${unit} (cap ${formatMetricValue(metric.max)})`;
  }
  return `${metric.label}: ${valueStr}/${formatMetricValue(metric.max)}${unit}`;
}

function renderCriterionEvidence(criterion: WitanCriterionScore): string[] {
  if (criterion.status === 'not_applicable') {
    return [`- ${criterion.id}: N/A — ${criterion.notes ?? 'not applicable to this repo'}`];
  }

  if (criterion.status === 'insufficient_data') {
    return [
      `- ${criterion.id}: Insufficient data — no measurable signal supplied or collected; excluded from composite (unmeasured, not inapplicable).`,
    ];
  }

  if (criterion.evidence.length === 0 && criterion.findings.length === 0) {
    return [`- ${criterion.id}: No concrete evidence supplied.`];
  }

  return [
    ...criterion.evidence.map((evidence) => `- ${criterion.id}: ${renderEvidence(evidence)}`),
    ...criterion.findings.map(
      (finding) => `- ${criterion.id}: ${renderEvidence(finding.evidence)} (${finding.severity})`,
    ),
  ];
}

function renderFindings(criteria: readonly WitanCriterionScore[]): string[] {
  const findings = criteria.flatMap((criterion) =>
    criterion.findings.map((finding) => renderFinding(criterion, finding)),
  );

  return findings.length > 0 ? findings : ['- No evidence-backed findings supplied.'];
}

function renderFinding(criterion: WitanCriterionScore, finding: WitanFinding): string {
  return `- ${criterion.id} ${finding.severity}: ${finding.summary} (${renderEvidence(
    finding.evidence,
  )})`;
}

function renderEvidence(evidence: WitanEvidencePointer): string {
  const target = evidence.url ?? evidence.path ?? evidence.contentHash;
  if (!target) return evidence.label;
  if (evidence.url) return `[${evidence.label}](${target})`;
  return `${evidence.label} (${renderPathEvidenceTarget(evidence)})`;
}

function renderPathEvidenceTarget(evidence: WitanEvidencePointer): string {
  const pathTarget = evidence.path
    ? `${evidence.path}${evidence.line ? `:${evidence.line}` : ''}`
    : undefined;
  const hashTarget = evidence.contentHash
    ? `sha256:${evidence.contentHash.slice(0, 12)}`
    : undefined;
  return [pathTarget, hashTarget].filter(Boolean).join(', ');
}

function renderRepo(repo: string, headSha: string | undefined): string {
  return headSha ? `${repo} @ ${headSha}` : repo;
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
