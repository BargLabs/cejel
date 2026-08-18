import type {
  WitanConsumedSignalSummary,
  WitanCriterionCategory,
  WitanCriterionScore,
  WitanCriterionStatus,
  WitanEvidencePointer,
  WitanFinding,
  WitanIngestProvenance,
  WitanReport,
  WitanReportVerdict,
} from './schemas.js';
import { witanVerdictForScore } from './schemas.js';

import { renderWitanAbstentionLabel } from './abstention.js';
import {
  type MeasuredCoverage,
  computeMeasuredCoverage,
  formatCoverageCounts,
} from './coverage.js';
import {
  EXTERNAL_FINDINGS_DISPLAY_LIMIT,
  type WitanExternalFinding,
  collectExternalFindings,
  formatExternalSourceLabel,
} from './external-findings.js';
import { renderFindingSummary } from './finding-presentation.js';
import {
  buildRelyingPartySummary,
  CERTIFICATE_GLOSSARY,
  formatCertificateMetricLabel,
  formatCertificateMetricValue,
  glossaryEntriesForReport,
  glossaryEntryForMetric,
  type CertificateGlossaryEntry,
  type RelyingPartySummary,
} from './certificate-presentation.js';
import { PROSPECTIVE_RUBRIC_NOTICE, isProspectiveRubricVersion } from './rubric-version.js';

export interface WitanHtmlReportOptions {
  /** Version of the Cejel CLI/server that produced this certificate. */
  cliVersion?: string;
  /** UTC timestamp for the scan invocation, displayed without entering report.json. */
  generatedAt?: string;
}

export function renderWitanHtmlReport(
  report: WitanReport,
  options: WitanHtmlReportOptions = {},
): string {
  const codeCriteria = criteriaByCategory(report, 'code_trust');
  const processCriteria = criteriaByCategory(report, 'process_trust');
  const verifiedEvidence = report.criteria.flatMap((criterion) =>
    criterion.status === 'verified'
      ? criterion.evidence.map((evidence) => renderEvidenceListItem(criterion, evidence))
      : [],
  );
  const openItems = report.criteria.flatMap(renderOpenItems);
  const externalSourceSummaries = summarizeSourcesByProvenance(report.consumedSignals ?? []);
  const contributingSources = externalSourceSummaries.map(renderSourceProvenanceLabel);
  const externalFindings = collectExternalFindings(report.consumedSignals ?? []);
  const coverage = computeMeasuredCoverage(report);
  const gitHistoryUnavailable = !report.repo.headSha;
  const relyingPartySummary = buildRelyingPartySummary(report);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cejel Trust Certificate - ${escapeHtml(report.productDisplayName)}</title>
  <style>${CERTIFICATE_CSS}</style>
</head>
<body>
  <main class="certificate">
    <header class="hero">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">C</span>
        <span class="brand-name">Cejel</span>
      </div>
      <div class="hero-grid">
        <section>
          <p class="eyebrow">Trust Certificate</p>
          <h1>${escapeHtml(report.productDisplayName)}</h1>
          <dl class="meta">
            ${options.generatedAt ? `<div><dt>Date</dt><dd>${escapeHtml(formatDate(options.generatedAt))}</dd></div>` : ''}
            <div><dt>Run</dt><dd>${escapeHtml(renderRepo(report))}</dd></div>
            <div><dt>CLI</dt><dd>${escapeHtml(options.cliVersion ? `Cejel ${options.cliVersion}` : 'Not recorded')}</dd></div>
            <div><dt>Rubric</dt><dd>${escapeHtml(report.rubricVersion)}</dd></div>
            ${
              // Gated on the rubric actually being prospective — a calibrated (v17) certificate's
              // HTML stays byte-identical to before --rubric-pin existed.
              isProspectiveRubricVersion(report.rubricVersion)
                ? `<div><dt>Calibration</dt><dd class="prospective-rubric-notice">${escapeHtml(PROSPECTIVE_RUBRIC_NOTICE)}</dd></div>`
                : ''
            }
            ${
              contributingSources.length > 0
                ? `<div><dt>Sources</dt><dd>Incorporates findings from: ${escapeHtml(contributingSources.join(', '))}<ul class="source-counts">${externalSourceSummaries
                    .map((s) => `<li>${escapeHtml(formatSourceProvenanceLine(s))}</li>`)
                    .join('')}</ul></dd></div>`
                : ''
            }
          </dl>
        </section>
        <aside class="score-panel" aria-label="Summary trust score">
          <div class="score-badge">Summary</div>
          ${
            report.verdict === 'insufficient_source'
              ? `<div class="verdict">${escapeHtml(renderWitanAbstentionLabel(report))}</div>
          <p class="insufficient-note">${escapeHtml(report.insufficientSourceReason)}</p>`
              : `<div class="score">${formatScore(report.overallScore)}</div>
          <div class="score-unit">/ 4.0 overall</div>
          <div class="verdict">${escapeHtml(renderVerdict(report.overallScore))}</div>
          <div class="subscores">
            <span>Code ${renderCategoryScore(report.codeTrustScore, coverage, 'code_trust')}</span>
            <span>Process ${renderCategoryScore(report.processTrustScore, coverage, 'process_trust')}</span>
          </div>
          <div class="coverage-note">${escapeHtml(formatCoverageCounts(coverage))} measured${coverage.lowConfidence ? ' · low confidence' : ''}</div>`
          }
        </aside>
      </div>
    </header>

    ${renderRelyingPartySummary(relyingPartySummary)}

    ${
      (report.scanLimitations?.length ?? 0) > 0
        ? `<section class="scan-limitations-section evidence-section" aria-label="Scan limitations">
      <h2>Scan limitations</h2>
      <ul>${(report.scanLimitations ?? [])
        .map(
          (limitation) =>
            `<li class="scan-warning"><strong>Scan limitation</strong><span>${escapeHtml(limitation)}</span></li>`,
        )
        .join('')}</ul>
    </section>`
        : ''
    }

    ${renderContentReadSummary(report)}

    <section class="trust-grid" aria-label="Rubric criteria">
      ${renderCriterionColumn('Code trust', codeCriteria, gitHistoryUnavailable)}
      ${renderCriterionColumn('Process trust', processCriteria, gitHistoryUnavailable)}
    </section>

    <section class="evidence-grid" aria-label="Evidence and gaps">
      <article class="evidence-section">
        <h2>Verified evidence</h2>
        <ul>${verifiedEvidence.length > 0 ? verifiedEvidence.join('') : '<li>No verified evidence supplied.</li>'}</ul>
      </article>
      <article class="evidence-section">
        <h2>Open / unverified</h2>
        <ul>${openItems.length > 0 ? openItems.join('') : '<li>No open or unverified criteria supplied.</li>'}</ul>
      </article>
    </section>

    ${
      externalFindings.length > 0
        ? `<section class="external-findings-section" aria-label="External findings">
      <article class="evidence-section">
        <h2>External findings</h2>
        <p class="external-note">Findings surfaced by ingested external scanners, attributed to the tool and the cejel criterion they were folded into — distinct from cejel's own findings above.</p>
        <ul>${renderExternalFindingItems(externalFindings).join('')}</ul>
      </article>
    </section>`
        : ''
    }

    ${renderGlossary(glossaryEntriesForReport(report))}
  </main>
</body>
</html>
`;
}

function renderRelyingPartySummary(summary: RelyingPartySummary): string {
  return `<section class="relying-party-summary" aria-labelledby="relying-party-heading">
      <h2 id="relying-party-heading">How to read this certificate</h2>
      <dl>
        <div><dt>What was examined</dt><dd>${escapeHtml(summary.examined)}</dd></div>
        <div><dt>What was established</dt><dd>${escapeHtml(summary.established)}</dd></div>
        <div><dt>What was not established</dt><dd>${escapeHtml(summary.notEstablished)}</dd></div>
        <div><dt>What to do next</dt><dd>${escapeHtml(summary.next)}</dd></div>
      </dl>
    </section>`;
}

function renderGlossary(entries: readonly CertificateGlossaryEntry[]): string {
  return `<section class="glossary" aria-labelledby="glossary-heading">
      <h2 id="glossary-heading">Plain-language glossary</h2>
      <dl>${entries
        .map(
          (entry) =>
            `<div><dt id="glossary-${escapeAttribute(entry.key)}">${escapeHtml(entry.term)}</dt><dd>${escapeHtml(entry.definition)}</dd></div>`,
        )
        .join('')}</dl>
    </section>`;
}

function renderContentReadSummary(report: WitanReport): string {
  const summary = report.contentReadSummary;
  if (!summary || summary.skipped === 0) return '';
  const errnoCounts = Object.entries(summary.unreadableByErrno)
    .map(([errno, count]) => `${errno}: ${count}`)
    .join(', ');
  const affected =
    summary.affectedCriteria.length > 0
      ? `<p>Affected criteria abstained as <code>insufficient_data</code>: ${escapeHtml(summary.affectedCriteria.join(', '))}.</p>`
      : '';
  return `<section class="scan-limitations-section evidence-section" aria-label="Skipped content reads">
      <h2>Skipped content reads</h2>
      <p>${summary.skipped} content entr${summary.skipped === 1 ? 'y was' : 'ies were'} skipped. Counts only; repository paths are intentionally omitted.</p>
      <ul>
        <li>Unreadable: ${summary.byReason.unreadable}${errnoCounts ? ` (${escapeHtml(errnoCounts)})` : ''}</li>
        <li>Too large: ${summary.byReason.tooLarge}</li>
        <li>Excluded by extension: ${summary.byReason.excludedByExtension}</li>
        <li>Denied path: ${summary.byReason.deniedPath}</li>
        <li>Non-regular file: ${summary.byReason.nonRegularFile}</li>
      </ul>
      ${affected}
    </section>`;
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
  const label = formatExternalSourceLabel(summary.source);
  return summary.provenance === 'auto_discovered'
    ? `"${label}" (self-declared by the scanned repository — not verified)`
    : `${label} (operator-supplied)`;
}

function formatSourceProvenanceLine(summary: ProvenanceSourceSummary): string {
  const noun = summary.findingCount === 1 ? 'finding' : 'findings';
  return `${renderSourceProvenanceLabel(summary)}: ${summary.findingCount} ${noun} ingested (folded into ${summary.dimensions.join(', ')})`;
}

function renderExternalFindingItems(findings: readonly WitanExternalFinding[]): string[] {
  const shown = findings.slice(0, EXTERNAL_FINDINGS_DISPLAY_LIMIT);
  const items = shown.map(
    (f) =>
      `<li><strong>${escapeHtml(f.label)} → ${escapeHtml(f.dimension)}</strong><span>${escapeHtml(f.severity)}: ${escapeHtml(f.ruleId)} — ${escapeHtml(f.message)}${
        f.location ? ` (${escapeHtml(f.location)})` : ''
      }</span></li>`,
  );
  const remaining = findings.length - shown.length;
  if (remaining > 0) {
    items.push(`<li><em>...and ${remaining} more — see report.json for the full list.</em></li>`);
  }
  return items;
}

function criteriaByCategory(
  report: WitanReport,
  category: WitanCriterionCategory,
): WitanCriterionScore[] {
  return report.criteria.filter((criterion) => criterion.category === category);
}

// A dimension the repository's archetype was never evaluated on (e.g. the two
// Alfred-substrate-only dimensions on external code) is not rendered as a scored
// section — that would imply the repo was assessed on it and found wanting. It is
// grouped separately, named, with its reason stated. This is presentation-only:
// applicability is read straight off the existing status field (scoring.ts), not
// a second detection path. 'insufficient_data' (a measurement gap, not
// inapplicability) stays in the normal scored list, unchanged — see
// goal_cejel_cert_applicable_dims_and_link_integrity_2026-07-12.
function renderCriterionColumn(
  title: string,
  criteria: readonly WitanCriterionScore[],
  gitHistoryUnavailable: boolean,
): string {
  const applicable = criteria.filter((criterion) => criterion.status !== 'not_applicable');
  const notApplicable = criteria.filter((criterion) => criterion.status === 'not_applicable');
  const notApplicableGroup =
    notApplicable.length > 0 ? `\n        ${renderNotApplicableGroup(notApplicable)}` : '';
  return `<section class="criteria-column">
        <h2>${escapeHtml(title)}</h2>
        <div class="criteria-list">
          ${applicable.map((criterion) => renderCriterionCard(criterion, gitHistoryUnavailable)).join('')}
        </div>${notApplicableGroup}
      </section>`;
}

function renderNotApplicableGroup(criteria: readonly WitanCriterionScore[]): string {
  return `<div class="na-group">
          <h3 class="na-heading">Not applicable to this repository</h3>
          <ul class="na-list">
            ${criteria.map(renderNotApplicableItem).join('')}
          </ul>
        </div>`;
}

function renderNotApplicableItem(criterion: WitanCriterionScore): string {
  const reason = criterion.notes ?? 'Not applicable to this repository.';
  return `<li><span class="na-id">${escapeHtml(criterion.id)}</span> ${escapeHtml(criterion.title)} — <span class="na-reason">${escapeHtml(reason)}</span></li>`;
}

function renderCriterionCard(
  criterion: WitanCriterionScore,
  gitHistoryUnavailable: boolean,
): string {
  const evidence = [
    ...criterion.evidence.map(renderEvidencePointer),
    ...criterion.findings.map((finding) => renderFindingEvidence(criterion, finding)),
  ];
  const metrics = criterion.metrics.map((metric) => renderMetric(criterion, metric));
  const statusReconciliation = renderStatusReconciliation(criterion);
  const historyWarning =
    gitHistoryUnavailable && criterion.metrics.some((metric) => metric.name === 'pr_merge_ratio')
      ? `<p class="scan-warning"><strong>Scan limitation:</strong> Git history was unavailable (for example, this may be a source tarball), so the recent PR merge ratio is not a measured repository outcome and its displayed zero may undercount ${escapeHtml(criterion.id)}. Re-scan a full Git clone for this signal.</p>`
      : '';

  return `<article class="criterion">
            <div class="criterion-top">
              <div>
                <div class="criterion-id">${escapeHtml(criterion.id)}</div>
                <h3>${escapeHtml(criterion.title)}</h3>
              </div>
              ${renderStatusChip(criterion.id, criterion.status)}
            </div>
            <div class="criterion-score">${criterion.status === 'not_applicable' ? 'N/A' : criterion.status === 'insufficient_data' ? 'No data' : formatScore(criterion.score)}</div>
            ${statusReconciliation}
            ${historyWarning}
            <ul class="criterion-metrics">
              ${metrics.length > 0 ? metrics.map((item) => `<li>${item}</li>`).join('') : '<li>No measured depth metrics supplied.</li>'}
            </ul>
            <ul class="criterion-evidence">
              ${evidence.length > 0 ? evidence.map((item) => `<li>${item}</li>`).join('') : '<li>No concrete evidence supplied.</li>'}
            </ul>
          </article>`;
}

function renderStatusReconciliation(criterion: WitanCriterionScore): string {
  if (
    criterion.status === 'not_applicable' ||
    criterion.status === 'insufficient_data' ||
    criterion.status === 'unverified'
  ) {
    return '';
  }
  const numericBand = scoreBandForPresentation(criterion.score);
  if (numericBand === criterion.status) return '';
  const entry = CERTIFICATE_GLOSSARY.find((candidate) => candidate.key === 'labels');
  const help = entry
    ? `<span class="term-help" tabindex="0" aria-describedby="tooltip-${criterion.id}-labels"><strong>Why the labels differ:</strong><span class="term-tooltip" id="tooltip-${criterion.id}-labels" role="tooltip">${escapeHtml(entry.definition)}</span></span>`
    : '<strong>Why the labels differ:</strong>';
  return `<p class="status-explanation">${help} the ${escapeHtml(criterion.status)} dimension band is calibrated from criterion evidence thresholds and findings, independently of the ${formatScore(criterion.score)}/4.0 weighted score (which falls in the ${numericBand} numeric band).</p>`;
}

function scoreBandForPresentation(score: number): Extract<
  WitanCriterionStatus,
  'verified' | 'info' | 'warning' | 'critical'
> {
  if (score >= 3.5) return 'verified';
  if (score >= 2.5) return 'info';
  if (score >= 1.5) return 'warning';
  return 'critical';
}

function renderMetric(
  criterion: WitanCriterionScore,
  metric: WitanCriterionScore['metrics'][number],
): string {
  const entry = glossaryEntryForMetric(metric);
  const tooltipId = `tooltip-${criterion.id}-${entry.key}`;
  const formatted = formatCertificateMetricValue(criterion, metric);
  const cappedEntry = formatted.includes('capped')
    ? CERTIFICATE_GLOSSARY.find((candidate) => candidate.key === 'capped')
    : undefined;
  const label = `<span class="term-help" tabindex="0" aria-describedby="${escapeAttribute(tooltipId)}"><strong>${escapeHtml(formatCertificateMetricLabel(metric))}</strong><span class="term-tooltip" id="${escapeAttribute(tooltipId)}" role="tooltip">${escapeHtml(entry.definition)}</span></span>`;
  if (!cappedEntry) return `${label}<span>${escapeHtml(formatted)}</span>`;
  const cappedTooltipId = `${tooltipId}-capped`;
  return `${label}<span class="term-help metric-value" tabindex="0" aria-describedby="${escapeAttribute(cappedTooltipId)}">${escapeHtml(formatted)}<span class="term-tooltip" id="${escapeAttribute(cappedTooltipId)}" role="tooltip">${escapeHtml(cappedEntry.definition)}</span></span>`;
}

function renderCategoryScore(
  score: number | null,
  coverage: MeasuredCoverage,
  category: WitanCriterionCategory,
): string {
  const categoryCoverage = coverage.byCategory.find((entry) => entry.category === category);
  return (categoryCoverage !== undefined && categoryCoverage.measured === 0) || score === null
    ? 'not measured'
    : formatScore(score);
}

function renderStatusChip(criterionId: string, status: WitanCriterionStatus): string {
  const entry = CERTIFICATE_GLOSSARY.find((candidate) => candidate.key === 'labels');
  const tooltipId = `tooltip-${criterionId}-status-labels`;
  return `<span class="status term-help" data-status="${status}" tabindex="0" aria-describedby="${tooltipId}">dimension band: ${status}${entry ? `<span class="term-tooltip" id="${tooltipId}" role="tooltip">${escapeHtml(entry.definition)}</span>` : ''}</span>`;
}

function renderEvidenceListItem(
  criterion: WitanCriterionScore,
  evidence: WitanEvidencePointer,
): string {
  return `<li><strong>${escapeHtml(criterion.id)} - ${escapeHtml(criterion.title)}</strong><span>${renderEvidencePointer(evidence)}</span></li>`;
}

function renderOpenItems(criterion: WitanCriterionScore): string[] {
  const findingItems = criterion.findings.map(
    (finding) =>
      `<li><strong>${escapeHtml(criterion.id)} - ${escapeHtml(criterion.title)}</strong><span>finding severity ${escapeHtml(finding.severity)}: ${escapeHtml(renderFindingSummary(criterion, finding))} (${renderEvidencePointer(finding.evidence)})</span></li>`,
  );

  if (
    (criterion.status === 'unverified' || criterion.status === 'insufficient_data') &&
    criterion.evidence.length === 0 &&
    criterion.findings.length === 0
  ) {
    const message =
      criterion.status === 'insufficient_data'
        ? 'Insufficient data — no measurable signal; excluded from composite (unmeasured, not inapplicable).'
        : 'No concrete evidence supplied.';
    return [
      `<li><strong>${escapeHtml(criterion.id)} - ${escapeHtml(criterion.title)}</strong><span>${escapeHtml(message)}</span></li>`,
    ];
  }

  if (criterion.status === 'verified') return [];

  return findingItems;
}

function renderFindingEvidence(criterion: WitanCriterionScore, finding: WitanFinding): string {
  return `finding severity ${escapeHtml(finding.severity)}: ${escapeHtml(renderFindingSummary(criterion, finding))} (${renderEvidencePointer(finding.evidence)})`;
}

function renderEvidencePointer(evidence: WitanEvidencePointer): string {
  const target = evidence.url ?? renderPathEvidenceTarget(evidence);
  const label = escapeHtml(evidence.label);

  if (evidence.url) {
    return `<a href="${escapeAttribute(evidence.url)}">${label}</a>`;
  }

  return [label, target ? `<code>${escapeHtml(target)}</code>` : undefined]
    .filter(Boolean)
    .join(' ');
}

function renderPathEvidenceTarget(evidence: WitanEvidencePointer): string {
  const pathTarget = evidence.path
    ? `${evidence.path}${evidence.line ? `:${evidence.line}` : ''}`
    : undefined;
  const hashTarget = evidence.contentHash
    ? `sha256:${evidence.contentHash.slice(0, 12)}`
    : undefined;
  return [pathTarget, hashTarget].filter(Boolean).join(' · ');
}

function renderRepo(report: WitanReport): string {
  const repo = report.repo.path ?? report.repo.url ?? report.productSlug;
  return report.repo.headSha ? `${repo} @ ${report.repo.headSha}` : repo;
}

export function renderVerdict(score: number): string {
  return renderMachineVerdict(witanVerdictForScore(score));
}

// Headline verdict for a full report — distinct from renderVerdict(score) because a repo with
// an insufficient-source archetype must never present a confident numeric-derived verdict (see
// goal_cejel_repo_archetype_detection_2026-07-06, goal_cejel_language_calibration_2026-07-12).
// Every presentation surface (badge, terminal certificate, HTML certificate) should call this
// instead of renderVerdict(report.overallScore) directly.
export function renderReportVerdict(report: WitanReport): string {
  if (report.verdict === 'insufficient_source') {
    return renderWitanAbstentionLabel(report);
  }
  return renderMachineVerdict(report.verdict);
}

function renderMachineVerdict(verdict: WitanReportVerdict): string {
  switch (verdict) {
    case 'verified':
      return 'Verified';
    case 'conditional':
      return 'Conditional';
    case 'at_risk':
      return 'At risk';
    case 'unverified':
      return 'Unverified';
    case 'insufficient_source':
      return 'Insufficient source';
  }
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const CERTIFICATE_CSS = `
:root {
  color-scheme: dark;
  --steel: #16212a;
  --surface: #1d2b35;
  --surface-2: #273946;
  --line: rgba(238, 244, 247, .13);
  --line-strong: rgba(238, 244, 247, .22);
  --text: #eef4f7;
  --muted: #b7c5cc;
  --faint: #8799a4;
  --teal: #2fc8a6;
  --teal-weak: rgba(47, 200, 166, .14);
  --periwinkle: #93a6da;
  --periwinkle-weak: rgba(147, 166, 218, .16);
  --warn: #e7bf72;
  --warn-weak: rgba(231, 191, 114, .16);
  --danger: #f09a8f;
  --danger-weak: rgba(240, 154, 143, .14);
  --quiet: rgba(238, 244, 247, .08);
  --serif: "Instrument Serif", Georgia, "Times New Roman", serif;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--steel);
  color: var(--text);
  font-family: var(--sans);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.certificate { max-width: 1120px; margin: 0 auto; padding: 44px 32px 64px; }
.hero { border-bottom: 1px solid var(--line); padding-bottom: 38px; }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 44px; }
.brand-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px;
  background: var(--teal); color: #06231d; font-family: var(--serif); font-size: 24px;
}
.brand-name { font-family: var(--serif); font-size: 24px; }
.hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 36px; align-items: end; }
.eyebrow {
  margin: 0 0 14px; color: var(--teal); font-family: var(--mono);
  font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
}
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: 24px; font-family: var(--serif); font-size: 64px; line-height: 1; font-weight: 400; letter-spacing: 0; }
.meta { display: grid; gap: 10px; margin: 0; max-width: 780px; }
.meta div { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 16px; }
dt { color: var(--faint); font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
dd { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
.score-panel { border: 1px solid var(--line-strong); border-radius: 8px; padding: 24px; background: var(--surface); }
.score-badge {
  display: inline-flex; margin-bottom: 14px; border: 1px solid rgba(147, 166, 218, .38);
  border-radius: 999px; padding: 5px 10px; color: var(--periwinkle);
  background: var(--periwinkle-weak); font-family: var(--mono); font-size: 12px;
}
.score { display: inline; font-family: var(--mono); font-size: 56px; line-height: 1; color: var(--teal); }
.score-unit { display: inline; margin-left: 6px; color: var(--faint); font-family: var(--mono); }
.verdict { margin-top: 12px; font-family: var(--serif); font-size: 30px; color: var(--periwinkle); }
.insufficient-note { margin-top: 10px; color: var(--muted); font-size: 13px; line-height: 1.5; }
.subscores { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; color: var(--muted); font-family: var(--mono); font-size: 12px; }
.coverage-note { margin-top: 8px; color: var(--faint); font-family: var(--mono); font-size: 11px; }
.source-counts { margin: 8px 0 0; padding-left: 18px; font-family: var(--mono); font-size: 12px; color: var(--muted); }
.relying-party-summary, .glossary { margin-top: 28px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); padding: 22px; }
.relying-party-summary dl { display: grid; gap: 14px; margin: 0; }
.relying-party-summary dl div { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 18px; }
.relying-party-summary dt, .glossary dt { color: var(--text); }
.glossary dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 22px; margin: 0; }
.glossary dl div { border-top: 1px solid var(--line); padding-top: 10px; }
.glossary dd { margin-top: 4px; font-size: 13px; }
.trust-grid, .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 28px; }
.scan-limitations-section { margin-top: 28px; border-color: rgba(231, 191, 114, .44); }
.scan-limitations-section .scan-warning { list-style: none; margin-left: -18px; }
.external-findings-section { margin-top: 18px; }
.external-note { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
.criteria-column, .evidence-section { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); padding: 22px; }
h2 { font-family: var(--serif); font-size: 30px; font-weight: 400; letter-spacing: 0; margin-bottom: 18px; }
.criteria-list { display: grid; gap: 12px; }
.na-group { margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--line-strong); }
.na-heading { font-family: var(--sans); font-size: 12px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; color: var(--faint); margin: 0 0 10px; }
.na-list { display: grid; gap: 8px; font-size: 13px; }
.na-list li { margin: 0; color: var(--muted); }
.na-id { color: var(--faint); font-family: var(--mono); font-size: 11px; margin-right: 6px; }
.na-reason { color: var(--muted); }
.criterion { border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: var(--surface-2); }
.criterion-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
.criterion-id { color: var(--periwinkle); font-family: var(--mono); font-size: 12px; margin-bottom: 4px; }
h3 { font-size: 15px; line-height: 1.35; font-weight: 600; margin-bottom: 0; }
.criterion-score { margin-top: 12px; color: var(--text); font-family: var(--mono); font-size: 24px; }
.status-explanation, .scan-warning {
  margin: 10px 0 0; border-left: 3px solid var(--periwinkle); padding: 8px 10px;
  background: var(--periwinkle-weak); color: var(--muted); font-size: 12px; line-height: 1.5;
}
.scan-warning { border-left-color: var(--warn); background: var(--warn-weak); }
.status-explanation strong, .scan-warning strong { color: var(--text); }
.criterion-metrics { display: grid; gap: 7px; margin-top: 10px; padding: 0; list-style: none; font-size: 12px; }
.criterion-metrics li { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(238, 244, 247, .08); padding-bottom: 6px; }
.criterion-metrics strong { color: var(--text); font-weight: 650; }
.criterion-metrics span { white-space: nowrap; color: var(--muted); }
.term-help { position: relative; cursor: help; outline: none; }
.term-help:focus-visible { box-shadow: 0 0 0 2px var(--periwinkle); border-radius: 3px; }
.term-tooltip {
  position: absolute; z-index: 100; left: 0; bottom: calc(100% + 8px); width: min(320px, 75vw);
  visibility: hidden; opacity: 0; pointer-events: none; white-space: normal;
  overflow-wrap: anywhere;
  border: 1px solid var(--line-strong); border-radius: 6px; padding: 9px 11px;
  background: #101b2a; color: var(--text); font-family: var(--sans); font-size: 12px;
  font-weight: 400; line-height: 1.45; text-transform: none; letter-spacing: normal;
  box-shadow: 0 10px 28px rgba(0, 0, 0, .55);
  transition: opacity .12s ease;
}
.term-help:hover > .term-tooltip, .term-help:focus-within > .term-tooltip { visibility: visible; opacity: 1; }
.metric-value .term-tooltip { left: auto; right: 0; }
.status { flex: none; border-radius: 999px; padding: 4px 9px; font-family: var(--mono); font-size: 11px; border: 1px solid var(--line-strong); }
.status[data-status="verified"] { color: var(--teal); background: var(--teal-weak); border-color: rgba(47, 200, 166, .42); }
.status[data-status="info"] { color: var(--periwinkle); background: var(--periwinkle-weak); border-color: rgba(147, 166, 218, .4); }
.status[data-status="warning"] { color: var(--warn); background: var(--warn-weak); border-color: rgba(231, 191, 114, .44); }
.status[data-status="critical"] { color: var(--danger); background: var(--danger-weak); border-color: rgba(240, 154, 143, .46); }
.status[data-status="unverified"] { color: var(--muted); background: var(--quiet); }
.status[data-status="insufficient_data"] { color: var(--muted); background: var(--quiet); border-style: dashed; }
ul { margin: 0; padding-left: 18px; }
li { margin: 8px 0; color: var(--muted); }
.criterion-evidence { margin-top: 12px; font-size: 13px; }
.evidence-section li strong { display: block; color: var(--text); font-size: 14px; }
.evidence-section li span { display: block; margin-top: 2px; font-size: 13px; }
code { color: var(--periwinkle); font-family: var(--mono); font-size: .92em; overflow-wrap: anywhere; }
a { color: var(--teal); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 840px) {
  .certificate { padding: 28px 18px 48px; }
  .hero-grid, .trust-grid, .evidence-grid { grid-template-columns: 1fr; }
  .relying-party-summary dl div, .glossary dl { grid-template-columns: 1fr; }
  h1 { font-size: 46px; }
}
`;
