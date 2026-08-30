import type {
  WitanConsumedSignalSummary,
  WitanCriterionScore,
  WitanEvidencePointer,
  WitanFinding,
  WitanIngestProvenance,
  WitanReport,
} from './schemas.js';

import { escapeMarkdownInline } from '../presentation-safety.js';

import { isWitanNoMeasurementAbstention, renderWitanAbstentionLabel } from './abstention.js';
import { computeMeasuredCoverage, formatCoverageSummary } from './coverage.js';
import {
  EXTERNAL_FINDINGS_DISPLAY_LIMIT,
  type WitanExternalFinding,
  collectExternalFindings,
  formatExternalSourceLabel,
} from './external-findings.js';
import { renderFindingSummary } from './finding-presentation.js';
import {
  buildRelyingPartySummary,
  CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE,
  formatCertificateMetricLabel,
  formatCertificateMetricValue,
  glossaryEntriesForReport,
} from './certificate-presentation.js';
import { PROSPECTIVE_RUBRIC_NOTICE, isProspectiveRubricVersion } from './rubric-version.js';

export interface WitanMarkdownReportOptions {
  /** Version of the Cejel CLI/server that produced this certificate. */
  cliVersion?: string;
}

export function renderWitanMarkdownReport(
  report: WitanReport,
  options: WitanMarkdownReportOptions = {},
): string {
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
          `- Insufficient data: ${insufficientDataCriteria.map((c) => c.id).join(', ')} — no measurable signal for the scorer to read. Read-failure abstentions remain in the composite denominator with a conservative zero contribution so evidence loss cannot improve the score; other unmeasured criteria are excluded. Unmeasured, not inapplicable, and not a measured criterion zero.`,
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
  const externalSourceSummaries = summarizeSourcesByProvenance(report.consumedSignals ?? []);
  const contributingSources = externalSourceSummaries.map(renderSourceProvenanceLabel);
  const externalFindings = collectExternalFindings(report.consumedSignals ?? []);
  const noMeasurementAbstention = isWitanNoMeasurementAbstention(report);
  const relyingPartySummary = buildRelyingPartySummary(report);
  const summaryScoreLines =
    report.verdict === 'insufficient_source'
      ? [
          `- Headline scores: not issued (${noMeasurementAbstention ? 'insufficient evidence' : 'insufficient source'}).`,
          ...coverageLines,
          ...naSummaryLines,
          ...insufficientDataSummaryLines,
        ]
      : [
          `- Code trust: ${formatScore(report.codeTrustScore)}/4.0`,
          `- Process trust: ${formatScore(report.processTrustScore)}/4.0`,
          `- Overall: ${formatScore(report.overallScore)}/4.0`,
          ...coverageLines,
          ...naSummaryLines,
          ...insufficientDataSummaryLines,
        ];

  const lines = [
    `# Cejel Trust Report - ${escapeMarkdownInline(report.productDisplayName)}`,
    '',
    `- Product: ${report.productSlug}`,
    `- Product identity: ${CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE}`,
    `- CLI: ${options.cliVersion ? `Cejel ${options.cliVersion}` : 'Not recorded'}`,
    `- Rubric: ${report.rubricVersion}`,
    // Gated on the rubric actually being prospective — a calibrated (v17) report's Markdown
    // stays byte-identical to before --rubric-pin existed.
    ...(isProspectiveRubricVersion(report.rubricVersion)
      ? [`- **${PROSPECTIVE_RUBRIC_NOTICE}**`]
      : []),
    `- Repository: ${renderRepo(report.repo.path ?? report.repo.url ?? report.productSlug, report.repo.headSha)}`,
    ...(hasSignals
      ? [
          `- Incorporates findings from: ${contributingSources.join(', ')}`,
          ...externalSourceSummaries.map((s) => `  - ${formatSourceProvenanceLine(s)}`),
        ]
      : []),
    ...(report.verdict === 'insufficient_source'
      ? [
          `- Verdict: ${renderWitanAbstentionLabel(report)} to certify — ${report.insufficientSourceReason}`,
        ]
      : []),
    '',
    '## How to read this certificate',
    '',
    `- What was examined: ${relyingPartySummary.examined}`,
    `- What was established: ${relyingPartySummary.established}`,
    `- What was not established: ${relyingPartySummary.notEstablished}`,
    `- What to do next: ${relyingPartySummary.next}`,
    ...((report.scanLimitations?.length ?? 0) > 0
      ? [
          '',
          '## Scan limitations',
          '',
          ...(report.scanLimitations ?? []).map((limitation) => `- ${limitation}`),
        ]
      : []),
    ...(report.contentReadSummary && report.contentReadSummary.skipped > 0
      ? [
          '',
          '## Skipped content reads',
          '',
          `- Total skipped: ${report.contentReadSummary.skipped}`,
          `- Unreadable: ${report.contentReadSummary.byReason.unreadable}${formatErrnoCounts(report.contentReadSummary.unreadableByErrno)}`,
          `- Too large: ${report.contentReadSummary.byReason.tooLarge}`,
          `- Excluded by extension: ${report.contentReadSummary.byReason.excludedByExtension}`,
          `- Denied path: ${report.contentReadSummary.byReason.deniedPath}`,
          `- Non-regular file: ${report.contentReadSummary.byReason.nonRegularFile}`,
          `- Affected criteria: ${report.contentReadSummary.affectedCriteria.length > 0 ? `${report.contentReadSummary.affectedCriteria.join(', ')} (insufficient_data)` : 'none'}`,
          '',
          '_Counts only; skipped repository paths are intentionally omitted._',
        ]
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
    ...summaryScoreLines,
    ...(report.verdict === 'insufficient_source'
      ? [
          '',
          noMeasurementAbstention
            ? '_This repo has insufficient measurable evidence to certify. Per-criterion gaps below are not a headline score or verdict on the product._'
            : '_This repo has insufficient source to certify. Per-criterion measurements below describe only the surface Cejel could read; they are not a headline score or verdict on the product._',
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
    '## Plain-language glossary',
    '',
    ...glossaryEntriesForReport(report).map(
      (entry) => `- **${entry.term}** — ${entry.definition}`,
    ),
    '',
  ];

  return `${lines.join('\n')}`;
}

function formatErrnoCounts(counts: Readonly<Record<string, number>>): string {
  const members = Object.entries(counts).map(([errno, count]) => `${errno}: ${count}`);
  return members.length > 0 ? ` (${members.join(', ')})` : '';
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

interface ProvenanceSourceSummary {
  source: string;
  provenance: WitanIngestProvenance;
  findingCount: number;
  dimensions: string[];
}

function summarizeSourcesByProvenance(
  signals: readonly WitanConsumedSignalSummary[],
): ProvenanceSourceSummary[] {
  const grouped = new Map<
    string,
    {
      source: string;
      provenance: WitanIngestProvenance;
      findingCount: number;
      dimensions: Set<string>;
    }
  >();
  for (const signal of signals) {
    const provenance = signal.provenance ?? 'operator_supplied';
    const key = `${signal.source}\u0000${provenance}`;
    const summary = grouped.get(key) ?? {
      source: signal.source,
      provenance,
      findingCount: 0,
      dimensions: new Set<string>(),
    };
    summary.findingCount += signal.findingCount;
    summary.dimensions.add(signal.dimension);
    grouped.set(key, summary);
  }
  return Array.from(grouped.values())
    .map((summary) => ({ ...summary, dimensions: Array.from(summary.dimensions).sort() }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.provenance.localeCompare(b.provenance),
    );
}

function renderSourceProvenanceLabel(summary: ProvenanceSourceSummary): string {
  const label = escapeMarkdownInline(formatExternalSourceLabel(summary.source));
  return summary.provenance === 'auto_discovered'
    ? `"${label}" (self-declared by the scanned repository — not verified)`
    : `${label} (operator-supplied)`;
}

function formatSourceProvenanceLine(summary: ProvenanceSourceSummary): string {
  const noun = summary.findingCount === 1 ? 'finding' : 'findings';
  return `${renderSourceProvenanceLabel(summary)}: ${summary.findingCount} ${noun} ingested (folded into ${summary.dimensions.join(', ')})`;
}

function renderConsumedSignals(signals: readonly WitanConsumedSignalSummary[]): string[] {
  const lines: string[] = [
    '| Source | Provenance | Dimension | Findings | Critical | Warning | Info | Native score | Adjustment | Adjusted score |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const s of signals) {
    lines.push(
      [
        escapeMarkdownInline(s.source),
        s.provenance ?? 'operator_supplied',
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
      `- [${f.severity}] ${escapeMarkdownInline(f.label)} → ${f.dimension}: ${f.ruleId} — ${f.message}${
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
  return criterion.metrics.map((metric) => renderMetric(criterion, metric)).join('; ');
}

function renderMetric(
  criterion: WitanCriterionScore,
  metric: WitanCriterionScore['metrics'][number],
): string {
  return `${formatCertificateMetricLabel(metric)}: ${formatCertificateMetricValue(criterion, metric)}`;
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
  return `- ${criterion.id} finding severity ${finding.severity} (dimension band ${criterion.status}): ${renderFindingSummary(criterion, finding)} (${renderEvidence(finding.evidence)})`;
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
