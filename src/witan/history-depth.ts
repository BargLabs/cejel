import { execGit } from './git-exec.js';

/**
 * Criteria whose evidence comes from commit history rather than the checked-out tree:
 * A2 scans earlier commits for credentials and committed .env files, and B2's pr_merge_ratio reads
 * the most recent commits. A shallow clone hands both a truncated history.
 */
export const HISTORY_READING_CRITERIA = ['A2', 'B2'] as const;

export const SHALLOW_HISTORY_LIMITATION =
  'This repository is a shallow clone (git rev-parse --is-shallow-repository reports true), so its ' +
  'commit history is truncated. A2 (credentials and .env files in earlier commits) and B2 (pull-request ' +
  'merge ratio over recent commits) read history and saw only the commits present; on a full clone ' +
  'their results may differ. Scores are computed exactly as for any other scan. Re-scan a full clone ' +
  '(for actions/checkout, set fetch-depth: 0).';

/**
 * Disclosures about the commit history the scan read. Declared, never scored: this does not enter
 * scanLimitations, so it moves no score, abstention, badge or --min-score outcome (operator ruling
 * 2026-10-08, issue #428). Undefined when the history is complete or there is no git repository.
 */
export function detectHistoryLimitations(repoPath: string): string[] | undefined {
  const result = execGit(['rev-parse', '--is-shallow-repository'], { cwd: repoPath });
  if (!result.ok || result.stdout.trim() !== 'true') return undefined;
  return [SHALLOW_HISTORY_LIMITATION];
}
