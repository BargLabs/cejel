import { formatExternalSourceLine } from './witan/index.js';

import type { WitanCliSummary } from './summary.js';

/** Concise, human-readable terminal certificate for `npx @cejel/cejel .` — the full report lives
 * in the written HTML/JSON files; this is the at-a-glance summary. */
export function renderTerminalCertificate(summary: WitanCliSummary): string {
  const lines: string[] = summary.insufficientSourceReason
    ? [
        `Cejel Trust Certificate — ${summary.productDisplayName}`,
        '',
        'Insufficient source to certify.',
        `  ${summary.insufficientSourceReason}`,
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

  if (summary.contributingSources.length > 0) {
    lines.push(`Incorporates findings from: ${summary.contributingSources.join(', ')}`);
    for (const source of summary.externalSources) {
      lines.push(`  ${formatExternalSourceLine(source)}`);
    }
    lines.push('');
  }

  // Insufficient-source repos never print per-criterion findings here: those carry their own
  // metric-derived "score is N.N/4.0" phrasing, which would look exactly like the confident
  // numeric judgment this archetype gate exists to avoid at the headline glance. The full
  // per-criterion detail (including any real signal like a missing lockfile or audit gap)
  // still lives in report.json/certificate.html for anyone who wants to dig in.
  if (summary.insufficientSourceReason) {
    lines.push('See report.json / certificate.html for the full per-criterion detail.');
  } else if (summary.topFindings.length === 0) {
    lines.push('No evidence-backed findings.');
  } else {
    lines.push(`Top findings (${summary.findingCount} total):`);
    for (const finding of summary.topFindings) {
      lines.push(`  [${finding.severity}] ${finding.criterionId}: ${finding.summary}`);
    }
    const remaining = summary.findingCount - summary.topFindings.length;
    if (remaining > 0) {
      lines.push(`  ...and ${remaining} more — see the written report for the full list.`);
    }
  }

  // Itemized external findings — kept in their own block, clearly separated from cejel's own
  // "Top findings" above, so the two attribution sources (cejel repo-scan vs. ingested scanner)
  // never blur together.
  if (!summary.insufficientSourceReason && summary.externalFindingCount > 0) {
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

  return `${lines.join('\n')}\n`;
}

function formatScore(score: number): string {
  return score.toFixed(1);
}
