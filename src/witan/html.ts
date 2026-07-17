import type {
  WitanConsumedSignalSummary,
  WitanCriterionCategory,
  WitanCriterionScore,
  WitanCriterionStatus,
  WitanEvidencePointer,
  WitanFinding,
  WitanReport,
} from './schemas.js';

import {
  EXTERNAL_FINDINGS_DISPLAY_LIMIT,
  type WitanExternalFinding,
  collectExternalFindings,
  formatExternalSourceLine,
  summarizeExternalSources,
} from './external-findings.js';

export function renderWitanHtmlReport(report: WitanReport): string {
  const codeCriteria = criteriaByCategory(report, 'code_trust');
  const processCriteria = criteriaByCategory(report, 'process_trust');
  const verifiedEvidence = report.criteria.flatMap((criterion) =>
    criterion.status === 'verified'
      ? criterion.evidence.map((evidence) => renderEvidenceListItem(criterion, evidence))
      : [],
  );
  const openItems = report.criteria.flatMap(renderOpenItems);
  const contributingSources = renderContributingSources(report.consumedSignals ?? []);
  const externalSourceSummaries = summarizeExternalSources(report.consumedSignals ?? []);
  const externalFindings = collectExternalFindings(report.consumedSignals ?? []);

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
            <div><dt>Date</dt><dd>${escapeHtml(formatDate(report.generatedAt))}</dd></div>
            <div><dt>Run</dt><dd>${escapeHtml(renderRepo(report))}</dd></div>
            <div><dt>Rubric</dt><dd>${escapeHtml(report.rubricVersion)}</dd></div>
            ${
              contributingSources.length > 0
                ? `<div><dt>Sources</dt><dd>Incorporates findings from: ${escapeHtml(contributingSources.join(', '))}<ul class="source-counts">${externalSourceSummaries
                    .map((s) => `<li>${escapeHtml(formatExternalSourceLine(s))}</li>`)
                    .join('')}</ul></dd></div>`
                : ''
            }
          </dl>
        </section>
        <aside class="score-panel" aria-label="Summary trust score">
          <div class="score-badge">Summary</div>
          ${
            report.insufficientSourceReason
              ? `<div class="verdict">Insufficient source</div>
          <p class="insufficient-note">${escapeHtml(report.insufficientSourceReason)}</p>`
              : `<div class="score">${formatScore(report.overallScore)}</div>
          <div class="score-unit">/ 4.0 overall</div>
          <div class="verdict">${escapeHtml(renderVerdict(report.overallScore))}</div>
          <div class="subscores">
            <span>Code ${formatScore(report.codeTrustScore)}</span>
            <span>Process ${formatScore(report.processTrustScore)}</span>
          </div>`
          }
        </aside>
      </div>
    </header>

    <section class="trust-grid" aria-label="Rubric criteria">
      ${renderCriterionColumn('Code trust', codeCriteria)}
      ${renderCriterionColumn('Process trust', processCriteria)}
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
  </main>
</body>
</html>
`;
}

function renderContributingSources(signals: readonly WitanConsumedSignalSummary[]): string[] {
  return Array.from(new Set(signals.map((s) => s.source))).sort();
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
function renderCriterionColumn(title: string, criteria: readonly WitanCriterionScore[]): string {
  const applicable = criteria.filter((criterion) => criterion.status !== 'not_applicable');
  const notApplicable = criteria.filter((criterion) => criterion.status === 'not_applicable');
  return `<section class="criteria-column">
        <h2>${escapeHtml(title)}</h2>
        <div class="criteria-list">
          ${applicable.map(renderCriterionCard).join('')}
        </div>
        ${notApplicable.length > 0 ? renderNotApplicableGroup(notApplicable) : ''}
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

function renderCriterionCard(criterion: WitanCriterionScore): string {
  const evidence = [
    ...criterion.evidence.map(renderEvidencePointer),
    ...criterion.findings.map((finding) => renderFindingEvidence(finding)),
  ];
  const metrics = criterion.metrics.map(renderMetric);

  return `<article class="criterion">
            <div class="criterion-top">
              <div>
                <div class="criterion-id">${escapeHtml(criterion.id)}</div>
                <h3>${escapeHtml(criterion.title)}</h3>
              </div>
              ${renderStatusChip(criterion.status)}
            </div>
            <div class="criterion-score">${criterion.status === 'not_applicable' ? 'N/A' : criterion.status === 'insufficient_data' ? 'No data' : formatScore(criterion.score)}</div>
            <ul class="criterion-metrics">
              ${metrics.length > 0 ? metrics.map((item) => `<li>${item}</li>`).join('') : '<li>No measured depth metrics supplied.</li>'}
            </ul>
            <ul class="criterion-evidence">
              ${evidence.length > 0 ? evidence.map((item) => `<li>${item}</li>`).join('') : '<li>No concrete evidence supplied.</li>'}
            </ul>
          </article>`;
}

function renderMetric(metric: WitanCriterionScore['metrics'][number]): string {
  const max = metric.max ? `/${formatMetricValue(metric.max)}` : '';
  const unit = metric.unit ? ` ${escapeHtml(metric.unit)}` : '';
  return `<strong>${escapeHtml(metric.label)}</strong><span>${formatMetricValue(metric.value)}${max}${unit}</span>`;
}

function renderStatusChip(status: WitanCriterionStatus): string {
  return `<span class="status" data-status="${status}">${status}</span>`;
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
      `<li><strong>${escapeHtml(criterion.id)} - ${escapeHtml(criterion.title)}</strong><span>${escapeHtml(finding.severity)}: ${escapeHtml(finding.summary)} (${renderEvidencePointer(finding.evidence)})</span></li>`,
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

function renderFindingEvidence(finding: WitanFinding): string {
  return `${escapeHtml(finding.severity)}: ${escapeHtml(finding.summary)} (${renderEvidencePointer(
    finding.evidence,
  )})`;
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
  const repo = report.repo.path ?? report.repo.url ?? 'unknown';
  return report.repo.headSha ? `${repo} @ ${report.repo.headSha}` : repo;
}

export function renderVerdict(score: number): string {
  if (score >= 3.5) return 'Verified';
  if (score >= 2.5) return 'Conditional';
  if (score >= 1.5) return 'At risk';
  return 'Unverified';
}

// Headline verdict for a full report — distinct from renderVerdict(score) because a repo with
// an insufficient-source archetype ('docs_only' | 'binary_only' | 'unrecognised_ecosystem' |
// 'empty') must never present a confident numeric-derived verdict (see
// goal_cejel_repo_archetype_detection_2026-07-06, goal_cejel_language_calibration_2026-07-12).
// Every presentation surface (badge, terminal certificate, HTML certificate) should call this
// instead of renderVerdict(report.overallScore) directly.
export function renderReportVerdict(report: WitanReport): string {
  if (report.insufficientSourceReason) return 'Insufficient source';
  return renderVerdict(report.overallScore);
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
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
.source-counts { margin: 8px 0 0; padding-left: 18px; font-family: var(--mono); font-size: 12px; color: var(--muted); }
.trust-grid, .evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 28px; }
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
.criterion-metrics { display: grid; gap: 7px; margin-top: 10px; padding: 0; list-style: none; font-size: 12px; }
.criterion-metrics li { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgba(238, 244, 247, .08); padding-bottom: 6px; }
.criterion-metrics strong { color: var(--text); font-weight: 650; }
.criterion-metrics span { white-space: nowrap; color: var(--muted); }
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
  h1 { font-size: 46px; }
}
`;
