import type {
  WitanConsumedSignalSummary,
  WitanCriterionId,
  WitanInputSignalFinding,
} from './schemas.js';

// Cap on how many itemized external findings a presentation surface (terminal, summary.json,
// certificate.html) shows before collapsing to "...and N more". report.json is unaffected — it
// always carries every ingested finding via WitanReport.consumedSignals[].findings.
export const EXTERNAL_FINDINGS_DISPLAY_LIMIT = 10;

const SEVERITY_RANK: Record<WitanInputSignalFinding['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export interface WitanExternalSourceSummary {
  source: string;
  label: string;
  findingCount: number;
  dimensions: WitanCriterionId[];
}

export interface WitanExternalFinding {
  source: string;
  label: string;
  dimension: WitanCriterionId;
  severity: WitanInputSignalFinding['severity'];
  ruleId: string;
  message: string;
  location?: string;
}

// 'sarif:<driver-name>' -> '<driver-name>' for display; other source kinds (e.g. 'scorecard')
// pass through unchanged.
export function formatExternalSourceLabel(source: string): string {
  return source.startsWith('sarif:') ? source.slice('sarif:'.length) : source;
}

// One entry per distinct ingested source: the total finding count across every dimension it
// contributed to, and which dimensions it was folded into.
export function summarizeExternalSources(
  consumedSignals: readonly WitanConsumedSignalSummary[],
): WitanExternalSourceSummary[] {
  const bySource = new Map<string, { findingCount: number; dimensions: Set<WitanCriterionId> }>();

  for (const signal of consumedSignals) {
    const entry = bySource.get(signal.source) ?? { findingCount: 0, dimensions: new Set() };
    entry.findingCount += signal.findingCount;
    entry.dimensions.add(signal.dimension);
    bySource.set(signal.source, entry);
  }

  return Array.from(bySource.entries())
    .map(([source, { findingCount, dimensions }]) => ({
      source,
      label: formatExternalSourceLabel(source),
      findingCount,
      dimensions: Array.from(dimensions).sort(),
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}

export function formatExternalSourceLine(summary: WitanExternalSourceSummary): string {
  const noun = summary.findingCount === 1 ? 'finding' : 'findings';
  return `${summary.label}: ${summary.findingCount} ${noun} ingested (folded into ${summary.dimensions.join(', ')})`;
}

// Every ingested finding, attributed to its source tool and the criterion it was folded into,
// sorted critical-first. consumedSignals is already unique per (source, dimension), so
// flattening it here shows each ingested finding exactly once — no double-counting.
export function collectExternalFindings(
  consumedSignals: readonly WitanConsumedSignalSummary[],
): WitanExternalFinding[] {
  const findings: WitanExternalFinding[] = [];

  for (const signal of consumedSignals) {
    for (const finding of signal.findings) {
      findings.push({
        source: signal.source,
        label: formatExternalSourceLabel(signal.source),
        dimension: signal.dimension,
        severity: finding.severity,
        ruleId: finding.ruleId,
        message: finding.message,
        ...(finding.location ? { location: finding.location } : {}),
      });
    }
  }

  return findings.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const bySource = a.source.localeCompare(b.source);
    if (bySource !== 0) return bySource;
    return a.ruleId.localeCompare(b.ruleId);
  });
}
