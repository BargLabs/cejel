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
 * The same disclosure under witan-rubric-v27-prospective-2026-10-19, which does not score history
 * it did not read (#442). The sentence states what that rubric did instead.
 */
export const SHALLOW_HISTORY_V27_ABSTENTION =
  'This repository is a shallow clone (git rev-parse --is-shallow-repository reports true), so its ' +
  'commit history is truncated. A2 (credentials and .env files in earlier commits) and B2 (pull-request ' +
  'merge ratio over recent commits) read history. Under this rubric A2 abstains unless a confirmed ' +
  'critical secret finding stands, and B2 abstains when fewer commits are visible than it reads; each ' +
  'abstention counts as 0 in the composite, as any evidence Cejel expected to read and could not does. ' +
  'Re-scan a full clone (for actions/checkout, set fetch-depth: 0).';

/** True when `repoPath` is a shallow clone. False when it is complete or not a git repository. */
export function isShallowRepository(repoPath: string): boolean {
  const result = execGit(['rev-parse', '--is-shallow-repository'], { cwd: repoPath });
  return result.ok && result.stdout.trim() === 'true';
}

/**
 * Disclosures about the commit history the scan read. Declared, never scored: this does not enter
 * scanLimitations, so it moves no score, abstention, badge or --min-score outcome (operator ruling
 * 2026-10-08, issue #428). Undefined when the history is complete or there is no git repository.
 * `v27Abstains` selects the v27 sentence; the abstention itself happens in the A2 and B2
 * collectors, not here.
 */
export function detectHistoryLimitations(repoPath: string, v27Abstains = false): string[] | undefined {
  if (!isShallowRepository(repoPath)) return undefined;
  return [v27Abstains ? SHALLOW_HISTORY_V27_ABSTENTION : SHALLOW_HISTORY_LIMITATION];
}
