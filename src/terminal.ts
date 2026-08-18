import { formatExternalSourceLine } from './witan/index.js';
import type { WitanReport } from './witan/index.js';
import {
  buildRelyingPartySummary,
  CERTIFICATE_GLOSSARY,
  formatCertificateMetricLabel,
  formatCertificateMetricValue,
} from './witan/certificate-presentation.js';
import { PROSPECTIVE_RUBRIC_NOTICE, isProspectiveRubricVersion } from './witan/rubric-version.js';

import type { WitanCliSummary } from './summary.js';

export function renderMinScoreAbstentionFailure(
  summary: WitanCliSummary,
  minScore: number,
): string {
  if (summary.verdict !== 'Insufficient source' && summary.verdict !== 'Insufficient evidence') {
    throw new Error('A minimum-score abstention message requires an abstained Cejel summary.');
  }
  return `Cejel: cannot evaluate the required minimum ${minScore.toFixed(1)}/4.0 because this repository has ${summary.verdict.toLowerCase()}.\n`;
}

export function renderMinScoreLimitationFailure(
  summary: WitanCliSummary,
  minScore: number,
): string {
  if (summary.scanLimitations.length === 0) {
    throw new Error('A minimum-score limitation message requires a limited Cejel summary.');
  }
  return `Cejel: cannot evaluate the required minimum ${minScore.toFixed(1)}/4.0 because the scan has limited evidence (${summary.scanLimitations.length} limitation${summary.scanLimitations.length === 1 ? '' : 's'}). Resolve the reported limitations and re-scan.\n`;
}

/** Concise, human-readable terminal certificate for `npx @cejel/cejel .` — the full report lives
 * in the written HTML/JSON files; this is the at-a-glance summary. */
export function renderTerminalCertificate(summary: WitanCliSummary, report?: WitanReport): string {
  const abstained =
    summary.verdict === 'Insufficient source' || summary.verdict === 'Insufficient evidence';
  if (
    !abstained &&
    (summary.overallScore === null ||
      summary.codeTrustScore === null ||
      summary.processTrustScore === null)
  ) {
    throw new Error('A scored Cejel summary must carry numeric headline scores.');
  }

  const lines: string[] = abstained
    ? [
        `Cejel Trust Certificate — ${summary.productDisplayName}`,
        '',
        `${summary.verdict} to certify.`,
        `  ${summary.insufficientSourceReason ?? 'No ratable source or measurable evidence was found.'}`,
        '',
      ]
    : [
        `Cejel Trust Certificate — ${summary.productDisplayName}`,
        '',
        `Overall: ${formatScore(summary.overallScore)}/4.0 (${summary.verdict})`,
        `  Code trust:    ${formatScore(summary.codeTrustScore)}/4.0`,
        `  Process trust: ${formatScore(summary.processTrustScore)}/4.0`,
        '',
      ];

  if (report) {
    const relyingPartySummary = buildRelyingPartySummary(report);
    lines.splice(
      2,
      0,
      `What was examined: ${relyingPartySummary.examined}`,
      `What was established: ${relyingPartySummary.established}`,
      `What was not established: ${relyingPartySummary.notEstablished}`,
      `What to do next: ${relyingPartySummary.next}`,
      '',
    );
  }

  if (summary.scanLimitations.length > 0) {
    lines.push(
      'LIMITED EVIDENCE — the score and verdict are qualified by scan limitations:',
      ...summary.scanLimitations.map((limitation) => `  - ${limitation}`),
      '',
    );
  }

  if (summary.contentReadSummary && summary.contentReadSummary.skipped > 0) {
    const reads = summary.contentReadSummary;
    const errnoCounts = Object.entries(reads.unreadableByErrno)
      .map(([errno, count]) => `${errno}: ${count}`)
      .join(', ');
    lines.push(
      `Skipped content entries: ${reads.skipped} (unreadable: ${reads.byReason.unreadable}${errnoCounts ? ` [${errnoCounts}]` : ''}; too large: ${reads.byReason.tooLarge}; excluded by extension: ${reads.byReason.excludedByExtension}; denied path: ${reads.byReason.deniedPath}; non-regular file: ${reads.byReason.nonRegularFile}).`,
    );
    if (reads.affectedCriteria.length > 0) {
      lines.push(
        `Criteria abstaining as insufficient_data: ${reads.affectedCriteria.join(', ')}.`,
      );
    }
    lines.push('');
  }

  if (summary.contributingSources.length > 0) {
    lines.push(`Incorporates findings from: ${summary.contributingSources.join(', ')}`);
    for (const source of summary.externalSources) {
      lines.push(`  ${formatExternalSourceLine(source)}`);
    }
    lines.push('');
  }

  const measurements = report?.criteria.flatMap((criterion) =>
    criterion.metrics.map((metric) => ({
      criterionId: criterion.id,
      label: formatCertificateMetricLabel(metric),
      value: formatCertificateMetricValue(criterion, metric),
    })),
  );
  if (!abstained && (measurements?.length ?? 0) > 0) {
    lines.push('Measurements:');
    for (const measurement of measurements ?? []) {
      lines.push(`  ${measurement.criterionId} — ${measurement.label}: ${measurement.value}`);
    }
    lines.push('');
  }

  // Insufficient-source repos never print per-criterion findings here: those carry their own
  // metric-derived "score is N.N/4.0" phrasing, which would look exactly like the confident
  // numeric judgment this archetype gate exists to avoid at the headline glance. The full
  // per-criterion detail (including any real signal like a missing lockfile or audit gap)
  // still lives in report.json/certificate.html for anyone who wants to dig in.
  if (abstained) {
    lines.push('See report.json / certificate.html for the full per-criterion detail.');
  } else if (summary.topFindings.length === 0) {
    lines.push('No evidence-backed findings.');
  } else {
    lines.push(
      `Top findings (${summary.findingCount} total; labels distinguish finding severity from dimension band):`,
    );
    for (const finding of summary.topFindings) {
      lines.push(
        `  [finding severity: ${finding.severity}] ${finding.criterionId} [dimension band: ${finding.dimensionBand}]: ${finding.displaySummary ?? finding.summary}`,
      );
    }
    const remaining = summary.findingCount - summary.topFindings.length;
    if (remaining > 0) {
      lines.push(`  ...and ${remaining} more — see the written report for the full list.`);
    }
  }

  // Itemized external findings — kept in their own block, clearly separated from cejel's own
  // "Top findings" above, so the two attribution sources (cejel repo-scan vs. ingested scanner)
  // never blur together.
  if (!abstained && summary.externalFindingCount > 0) {
    lines.push(
      '',
      `External findings (${summary.externalFindingCount} total, attributed to tool + criterion):`,
    );
    for (const finding of summary.topExternalFindings) {
      lines.push(
        `  [${finding.severity}] ${finding.label} → ${finding.dimension}: ${finding.ruleId} — ${finding.message}${
          finding.location ? ` (${finding.location})` : ''
        }`,
      );
    }
    const remaining = summary.externalFindingCount - summary.topExternalFindings.length;
    if (remaining > 0) {
      lines.push(`  ...and ${remaining} more — see report.json for the full list.`);
    }
  }
  lines.push('', 'Plain-language glossary:');
  for (const entry of CERTIFICATE_GLOSSARY) {
    lines.push(`  ${entry.term} — ${entry.definition}`);
  }

  // Prepended last, unshifted onto the finished body rather than spliced in partway through —
  // every earlier splice/push above targets indices/relative positions computed from the
  // original (no-banner) shape, so inserting this any earlier would shift them. Gated on the
  // rubric actually being prospective so an ordinary, unpinned scan's terminal output stays
  // byte-identical to before this existed; this banner only exists because --rubric-pin
  // (src/index.ts) made a prospective run reachable from the public CLI.
  if (report && isProspectiveRubricVersion(report.rubricVersion)) {
    lines.unshift(`Rubric: ${report.rubricVersion}`, PROSPECTIVE_RUBRIC_NOTICE, '');
  }

  return `${lines.join('\n')}\n`;
}

function formatScore(score: number | null): string {
  if (score === null) throw new Error('A scored Cejel summary must carry numeric scores.');
  return score.toFixed(1);
}
