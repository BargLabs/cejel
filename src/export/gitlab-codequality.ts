import { createHash } from 'node:crypto';

import { METRIC_DERIVED_FINDING_PATTERN } from '../witan/finding-presentation.js';
import type { WitanFinding, WitanReport } from '../witan/schemas.js';

export type GitLabCodeQualitySeverity = 'info' | 'minor' | 'major' | 'critical' | 'blocker';

export interface GitLabCodeQualityEntry {
  description: string;
  check_name: string;
  fingerprint: string;
  location: { path: string; lines: { begin: number } };
  severity: GitLabCodeQualitySeverity;
}

export interface GitLabCodeQualityExport {
  entries: GitLabCodeQualityEntry[];
  /** Native findings with no file, or a file but no measured line: never given a fabricated one. */
  excludedUnlocated: number;
  /** Ingested third-party findings are not exported; they are counted so the omission is visible. */
  excludedIngested: number;
  /** Set only for an abstained report: why the array is empty. */
  abstainedReason?: string;
}

/**
 * Fixed mapping, documented in docs/gitlab-ci.md. It is a table, never inferred per run.
 * Cejel has no `minor` or `blocker` tier, so those two GitLab values are never emitted.
 */
export const GITLAB_CODEQUALITY_SEVERITY: Readonly<
  Record<WitanFinding['severity'], GitLabCodeQualitySeverity>
> = {
  critical: 'critical',
  warning: 'major',
  info: 'info',
};

/** Repository-relative, forward-slash, no leading `./`. Undefined when the path cannot be one. */
export function normalizeRepoRelativePath(raw: string): string | undefined {
  let path = raw.replaceAll('\\', '/');
  while (path.startsWith('./')) path = path.slice(2);
  if (path.length === 0 || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return undefined;
  if (path.split('/').some((segment) => segment === '..' || segment === '')) return undefined;
  return path;
}

const METRIC_DERIVED_IDENTITY = 'metric-derived';
const NUMBER_PLACEHOLDER = '<n>';
/** An integer or a decimal; each side of a fraction such as `3/10` or `1.4/4.0` is one. */
const NUMBER_PATTERN = /\d+(?:\.\d+)?/g;

/**
 * What stays the same for one finding across runs (#700). A metric-derived summary carries the
 * score and the band, so its identity is fixed; any other summary has every number replaced by
 * one placeholder, so a count or a ratio that moves does not make the finding read as new.
 */
export function findingIdentity(summary: string): string {
  if (METRIC_DERIVED_FINDING_PATTERN.test(summary)) return METRIC_DERIVED_IDENTITY;
  return summary.replace(NUMBER_PATTERN, NUMBER_PLACEHOLDER);
}

function fingerprint(
  rule: string,
  path: string,
  line: number,
  identity: string,
  ordinal: number,
): string {
  return createHash('sha256')
    .update(JSON.stringify([rule, path, line, identity, ordinal]))
    .digest('hex');
}

/** Pure: a Cejel report in, GitLab Code Quality entries out. No I/O, no clock, no randomness. */
export function exportGitLabCodeQuality(report: WitanReport): GitLabCodeQualityExport {
  const ingestedCount = (report.consumedSignals ?? []).reduce(
    (total, signal) => total + signal.findings.length,
    0,
  );
  if (report.verdict === 'insufficient_source') {
    return {
      entries: [],
      excludedUnlocated: 0,
      excludedIngested: ingestedCount,
      abstainedReason: report.insufficientSourceReason,
    };
  }

  const entries: GitLabCodeQualityEntry[] = [];
  let excludedUnlocated = 0;
  // An identical summary at the same criterion, path and line is one finding and is exported once.
  const seen = new Set<string>();
  // Distinct summaries already exported per identity group, so each gets its own ordinal.
  const groupSizes = new Map<string, number>();
  for (const criterion of report.criteria) {
    for (const finding of criterion.findings) {
      const path =
        finding.evidence.path === undefined
          ? undefined
          : normalizeRepoRelativePath(finding.evidence.path);
      const line = finding.evidence.line;
      if (path === undefined || line == null) {
        excludedUnlocated += 1;
        continue;
      }
      // GitLab keys merge-request diffs on the fingerprint, so a duplicate would be collapsed.
      const exact = JSON.stringify([criterion.id, path, line, finding.summary]);
      if (seen.has(exact)) continue;
      seen.add(exact);
      // Two different summaries can share one identity at one place (they differ only in
      // numbers). Both are exported: the ordinal, in report order, keeps their fingerprints
      // distinct, and the first one's fingerprint does not depend on whether a second exists.
      const identity = findingIdentity(finding.summary);
      const group = JSON.stringify([criterion.id, path, line, identity]);
      const ordinal = groupSizes.get(group) ?? 0;
      groupSizes.set(group, ordinal + 1);
      const print = fingerprint(criterion.id, path, line, identity, ordinal);
      entries.push({
        description: finding.summary,
        check_name: criterion.id,
        fingerprint: print,
        location: { path, lines: { begin: line } },
        severity: GITLAB_CODEQUALITY_SEVERITY[finding.severity],
      });
    }
  }
  return { entries, excludedUnlocated, excludedIngested: ingestedCount };
}

/** The one stderr footer the CLI prints, kept here so the wording is tested with the export. */
export function renderGitLabCodeQualityFooter(result: GitLabCodeQualityExport): string {
  if (result.abstainedReason !== undefined) {
    return `Cejel: abstained report (insufficient_source): exported 0 entries. ${result.abstainedReason}\n`;
  }
  return (
    `Cejel: exported ${result.entries.length} located finding(s); ` +
    `${result.excludedUnlocated} without a file and line excluded; ` +
    `${result.excludedIngested} ingested third-party finding(s) not exported.\n`
  );
}
