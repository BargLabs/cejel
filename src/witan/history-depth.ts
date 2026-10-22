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
 * it did not read (#442). The sentence states what that rubric did instead. #556: A2's
 * not-applicable decision also rests on its history scans, so on a shallow clone A2 abstains there
 * too; the sentence no longer says a not-applicable criterion stays not applicable. B2 has no
 * not-applicable result: with no tree evidence it is unmeasured, whatever the history. The composite
 * sentence is exact: a wholesale content-read abstention whose every skip was self-imposed
 * (too_large, excluded_by_extension, non_regular_file) replaces the shallow one and is excluded.
 */
export const SHALLOW_HISTORY_V27_ABSTENTION =
  'This repository is a shallow clone (git rev-parse --is-shallow-repository reports true), so its ' +
  'commit history is truncated. A2 (credentials and .env files in earlier commits) and B2 (pull-request ' +
  'merge ratio over recent commits) read history. Under this rubric A2 abstains unless a confirmed ' +
  'critical secret finding stands, including where it would otherwise be marked not applicable, ' +
  'because that decision also rests on its scans of earlier commits. B2, where it would be scored, ' +
  'abstains when fewer commits are visible than it reads. Each of these shallow-clone abstentions ' +
  'counts as 0 in the composite, as a read failure does. A criterion that abstains instead only ' +
  "because Cejel declined files under its own size, type or file-kind limits is left out of the " +
  'composite, and the scan limitations say so. ' +
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
