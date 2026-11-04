import { formatExternalSourceLine } from './witan/index.js';
import { EXTERNAL_FINDINGS_DISPLAY_LIMIT } from './witan/external-findings.js';
import {
  describeInputBindingRecord,
  describeScannedSubject,
  importedAdjustmentSentence,
  inheritedFindingNote,
  inputBindingHeadline,
} from './witan/input-binding-presentation.js';
import type { WitanReport } from './witan/index.js';
import {
  type WitanAbstentionLabel,
  isWitanAbstentionLabel,
  renderWitanAbstentionHeadline,
  witanHistoryAbstentionInstruction,
} from './witan/abstention.js';
import { stripTerminalControls } from './presentation-safety.js';
import {
  buildRelyingPartySummary,
  buildVerdictExplanation,
  CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE,
  CERTIFICATE_GLOSSARY,
  formatCertificateMetricAppliedWeightPercent,
  formatCertificateMetricLabel,
  formatCertificateMetricValue,
  formatDimensionsMeasuredSentence,
  formatVerdictCapSentence,
  formatLowConfidenceSentence,
  glossaryEntryForRubric,
} from './witan/certificate-presentation.js';
import { PROSPECTIVE_RUBRIC_NOTICE, isProspectiveRubricVersion } from './witan/rubric-version.js';

import type { WitanCliSummary } from './summary.js';
import { type PlainSummary, buildPlainSummary } from './plain-summary.js';
import { formatCoverageSummary, type MeasuredCoverage } from './witan/coverage.js';

export function renderMinScoreAbstentionFailure(
  summary: WitanCliSummary,
  minScore: number,
): string {
  if (!isWitanAbstentionLabel(summary.verdict)) {
    throw new Error('A minimum-score abstention message requires an abstained Cejel summary.');
  }
  // A history abstention (v27): the source is there, so the message must not say it is missing,
  // and under --quiet this is the only line the run prints, so it carries the instruction.
  const instruction = witanHistoryAbstentionInstruction(summary.verdict);
  if (instruction !== undefined) {
    return `Cejel: cannot evaluate the required minimum ${minScore.toFixed(1)}/4.0 because the scan is ${summary.verdict.toLowerCase()}, with no composite score and no verdict. ${instruction}\n`;
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

export function renderMinScoreCoverageFailure(
  coverage: MeasuredCoverage,
  minScore: number,
): string {
  if (!coverage.lowConfidence) {
    throw new Error('A minimum-score coverage message requires low measurement coverage.');
  }
  return `Cejel: cannot evaluate the required minimum ${minScore.toFixed(1)}/4.0 because fewer than half of the applicable dimensions were measured in at least one score (${formatCoverageSummary(coverage)}). Resolve the reported evidence gaps and re-scan.\n`;
}

// Defined in the leaf presentation-safety module so the scan path (src/witan) can use the same
// function without importing the terminal renderer; re-exported here for existing callers.
export { stripTerminalControls } from './presentation-safety.js';

/** Concise, human-readable terminal certificate for `npx @cejel/cejel .` — the full report lives
 * in the written HTML/JSON files; this is the at-a-glance summary. */
export function renderTerminalCertificate(summary: WitanCliSummary, report?: WitanReport): string {
  const abstained = isWitanAbstentionLabel(summary.verdict);
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
        `Cejel Trust Certificate — ${stripTerminalControls(summary.productDisplayName)}`,
        '',
        renderWitanAbstentionHeadline(summary.verdict as WitanAbstentionLabel),
        `  ${summary.insufficientSourceReason === undefined ? 'No ratable source or measurable evidence was found.' : stripTerminalControls(summary.insufficientSourceReason)}`,
        '',
      ]
    : [
        `Cejel Trust Certificate — ${stripTerminalControls(summary.productDisplayName)}`,
        '',
        `Overall: ${formatScore(summary.overallScore)}/4.0 (${summary.verdict})`,
        ...(report && formatVerdictCapSentence(report) ? [`  ${formatVerdictCapSentence(report)}`] : []),
        `  Code trust:    ${formatScore(summary.codeTrustScore)}/4.0`,
        `  Process trust: ${formatScore(summary.processTrustScore)}/4.0`,
        ...(report ? [`  ${formatDimensionsMeasuredSentence(report)}`] : []),
        ...(report && formatLowConfidenceSentence(report)
          ? [`  ${formatLowConfidenceSentence(report)}`]
          : []),
        '',
      ];

  // Below the headline, not on the first line under the title: a first-time reader should meet
  // the result before this note about where the name came from.
  lines.splice(lines.length - 1, 0, `About the name: ${CALLER_CONTEXT_PRODUCT_IDENTITY_NOTICE}`);

  if (report) {
    const relyingPartySummary = buildRelyingPartySummary(report);
    lines.splice(
      2,
      0,
      `Scope: ${relyingPartySummary.scope}`,
      `What was examined: ${stripTerminalControls(relyingPartySummary.examined)}`,
      `What was established: ${relyingPartySummary.established}`,
      `What was not established: ${stripTerminalControls(relyingPartySummary.notEstablished)}`,
      `What to do next: ${relyingPartySummary.next}`,
      '',
    );
  }

  // goal_cejel_four_question_summary_2026-11-02, item D: the four lists, right after the verdict,
  // at most three items each; certificate.html has the rest.
  if (report) lines.push(...renderPlainSummaryLines(buildPlainSummary(report), summary, abstained));

  if (summary.scanLimitations.length > 0) {
    lines.push(
      'LIMITED EVIDENCE — the score and verdict are qualified by scan limitations:',
      ...summary.scanLimitations.map((limitation) => `  - ${stripTerminalControls(limitation)}`),
      '',
    );
  }

  if (summary.historyLimitations?.length) {
    lines.push(
      abstained
        ? 'HISTORY LIMITATION — some criteria read truncated history:'
        : 'HISTORY LIMITATION — scored as usual, but some criteria read truncated history:',
      ...summary.historyLimitations.map((limitation) => `  - ${stripTerminalControls(limitation)}`),
      '',
    );
  }

  if (summary.contentReadSummary && summary.contentReadSummary.skipped > 0) {
    const reads = summary.contentReadSummary;
    const errnoCounts = Object.entries(reads.unreadableByErrno)
      .map(([errno, count]) => `${errno}: ${count}`)
      .join(', ');
    lines.push(
      `Skipped content entries: ${reads.skipped} (unreadable: ${reads.byReason.unreadable}${errnoCounts ? ` [${errnoCounts}]` : ''}; too large: ${reads.byReason.tooLarge}; excluded by extension: ${reads.byReason.excludedByExtension}; denied path: ${reads.byReason.deniedPath}; non-regular file: ${reads.byReason.nonRegularFile}${reads.byReason.lfsPointer ? `; Git LFS pointer: ${reads.byReason.lfsPointer}` : ''}).`,
    );
    if (reads.affectedCriteria.length > 0) {
      lines.push(
        `Criteria abstaining as insufficient_data: ${reads.affectedCriteria.join(', ')}.`,
      );
    }
    lines.push('');
  }

  if (summary.contributingSources.length > 0) {
    lines.push(
      `Incorporates findings from: ${summary.contributingSources.map(stripTerminalControls).join(', ')}`,
    );
    for (const source of summary.externalSources) {
      lines.push(`  ${stripTerminalControls(formatExternalSourceLine(source))}`);
    }
    lines.push('');
  }

  // Binding status of each ingested document. Read from report.json because summary.json's shape
  // is unchanged; absent when nothing was ingested, so a no-ingest summary prints as before.
  if (report?.inputBinding) {
    lines.push(stripTerminalControls(inputBindingHeadline(report.inputBinding)));
    lines.push(`  ${stripTerminalControls(describeScannedSubject(report.inputBinding))}`);
    for (const input of report.inputBinding.inputs.slice(0, EXTERNAL_FINDINGS_DISPLAY_LIMIT)) {
      lines.push(`  ${stripTerminalControls(describeInputBindingRecord(input))}`);
    }
    const remaining = report.inputBinding.inputs.length - EXTERNAL_FINDINGS_DISPLAY_LIMIT;
    if (remaining > 0) lines.push(`  ...and ${remaining} more — see report.json inputBinding.`);
    for (const criterion of report.criteria) {
      const sentence = importedAdjustmentSentence(criterion);
      if (sentence) lines.push(`  ${criterion.id}: ${sentence}`);
    }
    lines.push('');
  }

  const measurements = report?.criteria.flatMap((criterion) =>
    criterion.metrics.map((metric) => ({
      criterionId: criterion.id,
      label: formatCertificateMetricLabel(metric),
      value: formatCertificateMetricValue(criterion, metric),
      weightPercent: formatCertificateMetricAppliedWeightPercent(criterion, metric),
    })),
  );
  if (!abstained && (measurements?.length ?? 0) > 0) {
    lines.push('Measurements:');
    for (const measurement of measurements ?? []) {
      lines.push(
        `  ${measurement.criterionId} — ${measurement.label}: ${stripTerminalControls(measurement.value)} (weight ${measurement.weightPercent}% of ${measurement.criterionId})`,
      );
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
        `  [finding severity: ${finding.severity}] ${finding.criterionId} [dimension band: ${finding.dimensionBand}]: ${stripTerminalControls(finding.displaySummary ?? finding.summary)}`,
      );
    }
    const remaining = summary.findingCount - summary.topFindings.length;
    if (remaining > 0) {
      lines.push(`  ...and ${remaining} more — see the written report for the full list.`);
    }
  }
  const verdictExplanation = !abstained && report ? buildVerdictExplanation(report) : undefined;
  if (verdictExplanation) lines.push(verdictExplanation);

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
        `  [${finding.severity}] ${stripTerminalControls(finding.label)} → ${finding.dimension}: ${stripTerminalControls(finding.ruleId)} — ${stripTerminalControls(finding.message)}${
          finding.location ? ` (${stripTerminalControls(finding.location)})` : ''
        }`,
      );
      const note = inheritedFindingNote(finding.ruleId);
      if (note) lines.push(`    Note: ${note}`);
    }
    const remaining = summary.externalFindingCount - summary.topExternalFindings.length;
    if (remaining > 0) {
      lines.push(`  ...and ${remaining} more — see report.json for the full list.`);
    }
  }
  lines.push('', 'Plain-language glossary:');
  for (const entry of CERTIFICATE_GLOSSARY.map((curated) => glossaryEntryForRubric(curated, report?.rubricVersion))) {
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

const PLAIN_TERMINAL_ITEM_LIMIT = 3;

function renderPlainSummaryLines(
  plain: PlainSummary,
  summary: WitanCliSummary,
  abstained: boolean,
): string[] {
  const section = (
    heading: string,
    leads: readonly (string | undefined)[],
    items: readonly string[],
    empty: string,
  ): string[] => {
    const shown = items.slice(0, PLAIN_TERMINAL_ITEM_LIMIT);
    const remaining = items.length - shown.length;
    return [
      `${heading} (${items.length}):`,
      ...leads.filter((lead): lead is string => lead !== undefined).map((lead) => `  ${lead}`),
      ...(items.length === 0 ? [`  ${empty}`] : shown.map((item) => `  - ${stripTerminalControls(item)}`)),
      ...(remaining > 0 ? [`  ...and ${remaining} more in certificate.html.`] : []),
    ];
  };
  const itemLine = (item: { area: string; text: string; location?: string }): string =>
    `${item.area} — ${item.text}${item.location !== undefined ? ` (${item.location})` : ''}`;
  // "Top findings" below counts every finding, informational ones too; the Wrong list counts only
  // critical and warning findings, so the difference is named rather than left to look like a mismatch.
  const wrongFindings = plain.wrong.filter((item) => item.source.kind === 'finding').length;
  const otherFindings = summary.findingCount - wrongFindings;
  const topFindingsNote =
    !abstained && otherFindings > 0
      ? `Top findings below counts ${summary.findingCount} finding${summary.findingCount === 1 ? '' : 's'} in all, including ${otherFindings} informational finding${otherFindings === 1 ? '' : 's'} not listed here.`
      : undefined;
  return [
    'In plain words (the full lists, with links to the evidence, are in certificate.html):',
    ...(plain.prospectiveNotice !== undefined ? [`  ${plain.prospectiveNotice}`] : []),
    ...section('What holds', [plain.areasLine, plain.holdsLead], plain.holds.map(itemLine), plain.holdsNote ?? ''),
    ...section(
      'What is wrong',
      [plain.wrongNote, topFindingsNote],
      plain.wrong.map((item) => `${item.level === 'critical' ? 'Critical' : 'Warning'}: ${itemLine(item)}`),
      'Cejel recorded no critical or warning-level problem in what it checked.',
    ),
    ...section('What is not known', [], plain.notKnown.map(itemLine), 'Cejel listed no gap here; anything it did not measure is still not established.'),
    ...section(
      'What to check next',
      [],
      plain.checkNext.map((check) => `${check.area} — ${check.text}`),
      'Nothing to check from these lists.',
    ),
    plain.notCovered,
    '',
  ];
}

function formatScore(score: number | null): string {
  if (score === null) throw new Error('A scored Cejel summary must carry numeric scores.');
  return score.toFixed(1);
}
