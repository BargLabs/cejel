import { execGit } from './git-exec.js';

/**
 * Criteria whose evidence comes from commit history rather than the checked-out tree:
 * A2 scans earlier commits for credentials and committed .env files, and B2's pr_merge_ratio reads
 * the most recent commits. A shallow clone hands both a truncated history.
 */
export const HISTORY_READING_CRITERIA = ['A2', 'B2'] as const;

/**
 * The disclosure under every rubric but v27. #442 (operator decision 2026-10-26: a shallow clone must
 * not lower the history score; revised 2026-10-27): B2, where it would be scored, withholds its
 * pull-request merge ratio when fewer commits are visible than its window reads and is scored on
 * the checked-out files alone. A2 is scored as before: on a truncated history its reads can only
 * miss evidence, never add it, so its score there is never lower than on a full clone. The sentence
 * no longer says scores are computed exactly as for any other scan.
 */
export const SHALLOW_HISTORY_LIMITATION =
  'This repository is a shallow clone (git rev-parse --is-shallow-repository reports true), so its ' +
  'commit history is truncated. A2 (credentials and .env files in earlier commits) read history and ' +
  'saw only the commits present; on a full clone its result may differ. B2 (pull-request merge ratio ' +
  'over recent commits), where it would be scored, leaves that ratio out when fewer commits are ' +
  'visible than it reads, and is scored on the CI workflows, pull-request template and review-gate ' +
  'record in the checked-out files. Re-scan a full clone (for actions/checkout, set fetch-depth: 0).';

/**
 * The same disclosure under witan-rubric-v27-prospective-2026-10-19, which does not score history
 * it did not read (#442). The sentence states what that rubric did instead. #556: A2's
 * not-applicable decision also rests on its history scans, so on a shallow clone A2 abstains there
 * too; the sentence no longer says a not-applicable criterion stays not applicable. B2 has no
 * not-applicable result: with no tree evidence it is unmeasured, whatever the history.
 * v27 freeze change F1 (operator decision 2026-10-28, the operator's 26/27 Oct rule: a shallow clone
 * must not lower the history score): B2 withholds only its ratio, as under every other rubric, and
 * abstains out of the composite only where no credited PR-trace file remains; A2's shallow-only
 * abstention carries the 'shallow_history' reason and leaves the composite. A2's abstention after a
 * failed history read (#556, #560) is still a read failure at 0, with its own note. Until F1 this
 * sentence said each shallow-clone abstention counts as 0, with the self-imposed content-read
 * exception; neither applies to a shallow-only abstention now.
 */
export const SHALLOW_HISTORY_V27_ABSTENTION =
  'This repository is a shallow clone (git rev-parse --is-shallow-repository reports true), so its ' +
  'commit history is truncated. A2 (credentials and .env files in earlier commits) and B2 (pull-request ' +
  'merge ratio over recent commits) read history. Under this rubric A2 abstains unless a confirmed ' +
  'critical secret finding stands, including where it would otherwise be marked not applicable, ' +
  'because that decision also rests on its scans of earlier commits. Where A2 abstains only because ' +
  'the clone is shallow, it is left out of the composite rather than counted as 0; if a history read ' +
  'also failed, as its note then says, it counts as 0. B2, where it would be ' +
  'scored, leaves that ratio out when fewer commits are visible than it reads and is scored on the ' +
  'CI workflows it credits, pull-request template and review-gate record in the checked-out files, ' +
  'or abstains out of the composite where none of those remains. ' +
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
 * `v27Abstains` selects the v27 sentence; the abstentions themselves (v27's A2 and B2) and #442's
 * withheld B2 ratio under every other rubric happen in the collectors, not here.
 */
export function detectHistoryLimitations(repoPath: string, v27Abstains = false): string[] | undefined {
  if (!isShallowRepository(repoPath)) return undefined;
  return [v27Abstains ? SHALLOW_HISTORY_V27_ABSTENTION : SHALLOW_HISTORY_LIMITATION];
}
