import type { WitanReport } from './witan/index.js';

import {
  EXTERNAL_FINDINGS_DISPLAY_LIMIT,
  type WitanExternalFinding,
  type WitanExternalSourceSummary,
  collectExternalFindings,
  renderReportVerdict,
  summarizeExternalSources,
} from './witan/index.js';

type WitanFindingSeverity = WitanReport['criteria'][number]['findings'][number]['severity'];

export interface WitanCliFinding {
  criterionId: string;
  severity: WitanFindingSeverity;
  summary: string;
}

export interface WitanCliSummary {
  productSlug: string;
  productDisplayName: string;
  generatedAt: string;
  overallScore: number;
  codeTrustScore: number;
  processTrustScore: number;
  verdict: string;
  findingCount: number;
  topFindings: WitanCliFinding[];
  /** Distinct external-tool sources folded into the score, e.g. ["sarif:codex-security",
   * "scorecard"] — empty when no --ingest/auto-discovered signals contributed. */
  contributingSources: string[];
  /** Per-source ingested-finding counts and which criteria each source was folded into,
   * e.g. { source: 'sarif:Codex Security', label: 'Codex Security', findingCount: 54,
   * dimensions: ['A2', 'A4'] } — empty when no external signals contributed. */
  externalSources: WitanExternalSourceSummary[];
  /** Total ingested external findings across every source. report.json carries the full
   * itemized list (report.consumedSignals[].findings); topExternalFindings below is the
   * capped, presentation-ready slice of it. */
  externalFindingCount: number;
  /** Top ingested external findings by severity, capped at EXTERNAL_FINDINGS_DISPLAY_LIMIT,
   * attributed to their source tool and the cejel criterion they were folded into — kept
   * separate from topFindings, which are cejel's own repo-scan findings. */
  topExternalFindings: WitanExternalFinding[];
  /** Present only when the repo archetype has no ratable source (docs/binary-only/empty —
   * see classifyRepoArchetype). When set, the terminal certificate shows this explanation
   * instead of a confident numeric verdict. */
  insufficientSourceReason?: string;
}

const SEVERITY_RANK: Record<WitanFindingSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const TOP_FINDINGS_LIMIT = 5;

/** Machine- and terminal-friendly digest of a full WitanReport — the shape both the CLI's
 * terminal certificate and the GitHub Action's step summary render from. */
export function buildWitanCliSummary(report: WitanReport): WitanCliSummary {
  const allFindings: WitanCliFinding[] = report.criteria.flatMap((criterion) =>
    criterion.findings.map((finding) => ({
      criterionId: criterion.id,
      severity: finding.severity,
      summary: finding.summary,
    })),
  );
  const sorted = [...allFindings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const contributingSources = Array.from(
    new Set((report.consumedSignals ?? []).map((s) => s.source)),
  ).sort();
  const externalSources = summarizeExternalSources(report.consumedSignals ?? []);
  const allExternalFindings = collectExternalFindings(report.consumedSignals ?? []);

  return {
    productSlug: report.productSlug,
    productDisplayName: report.productDisplayName,
    generatedAt: report.generatedAt,
    overallScore: report.overallScore,
    codeTrustScore: report.codeTrustScore,
    processTrustScore: report.processTrustScore,
    verdict: renderReportVerdict(report),
    findingCount: allFindings.length,
    topFindings: sorted.slice(0, TOP_FINDINGS_LIMIT),
    contributingSources,
    externalSources,
    externalFindingCount: allExternalFindings.length,
    topExternalFindings: allExternalFindings.slice(0, EXTERNAL_FINDINGS_DISPLAY_LIMIT),
    ...(report.insufficientSourceReason
      ? { insufficientSourceReason: report.insufficientSourceReason }
      : {}),
  };
}
