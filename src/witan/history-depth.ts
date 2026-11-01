import { closeSync, lstatSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { WitanReport } from './schemas.js';

import { execGit, findVisibleGitMetadata } from './git-exec.js';

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
 * The one plain instruction a v27 scan of a shallow clone carries, in its abstention reason (so in
 * report.json, the CLI output and the certificate) and in its history disclosure.
 */
export const SHALLOW_HISTORY_FETCH_INSTRUCTION =
  'The scan read a shallow clone: run git fetch --unshallow (or check out with full history, for ' +
  'example fetch-depth: 0 in actions/checkout), then scan again.';

/**
 * Operator ruling of 1 Nov, replacing the v27 freeze change F1's composite treatment for v27: under
 * witan-rubric-v27-prospective-2026-10-19 a shallow clone gets no composite and no verdict. This is
 * the report's insufficientSourceReason for that abstention, and its exact text is the stable
 * discriminator (isWitanV27ShallowHistoryAbstention), as WITAN_NO_MEASUREMENT_REASON is for its own
 * abstention: no report field is added. Each criterion's reading is still computed and shown. F1
 * left A2's shallow-only abstention out of the composite and capped the verdict; taking A2 out of
 * an average moves the average toward the other criteria, so the composite could fall below the
 * same commit's full-clone composite, which the operator's 26 Oct rule forbids.
 */
export const WITAN_V27_SHALLOW_HISTORY_REASON =
  'Under witan-rubric-v27-prospective-2026-10-19 Cejel gives no composite score and no verdict for a ' +
  'shallow clone (reason: shallow_history). A2 and B2 read commit history, and a composite over a ' +
  "truncated history could fall below the same commit's composite over its full history. Each " +
  "criterion's reading is still shown. " +
  SHALLOW_HISTORY_FETCH_INSTRUCTION;

/**
 * The instruction a v27 scan carries when it could not tell whether the checkout is a shallow
 * clone (WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON).
 */
export const HISTORY_DEPTH_UNKNOWN_INSTRUCTION =
  'Cejel could not read the history depth: make sure git is installed and can open this repository ' +
  '(git rev-parse --is-shallow-repository prints true or false), run git fetch --unshallow if it ' +
  'prints true, then scan again.';

/**
 * The same ruling where the depth itself could not be read: a `.git` entry is visible, but git
 * could not report the depth (git missing from PATH, or unable to open the repository) and the
 * repository's files did not settle it either (readHistoryDepth). Reading that as a complete
 * clone would score what may be a shallow clone, the case WITAN_V27_SHALLOW_HISTORY_REASON exists
 * to prevent, so v27 withholds the composite and the verdict here too. Its exact text is the
 * discriminator (isWitanV27HistoryDepthUnknownAbstention), as for the shallow-clone reason.
 */
export const WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON =
  'Under witan-rubric-v27-prospective-2026-10-19 Cejel gives no composite score and no verdict when ' +
  'it cannot tell whether the checkout is a shallow clone (reason: history_depth_unknown). A .git ' +
  'entry is present, but git could not report the history depth and the repository files did not ' +
  'show it. A2 and B2 read commit history, and a composite over a truncated history could fall ' +
  "below the same commit's composite over its full history. Each criterion's reading is still " +
  'shown. ' +
  HISTORY_DEPTH_UNKNOWN_INSTRUCTION;

/**
 * The same disclosure under witan-rubric-v27-prospective-2026-10-19, which does not score history
 * it did not read (#442). The sentence states what that rubric did instead. #556: A2's
 * not-applicable decision also rests on its history scans, so on a shallow clone A2 abstains there
 * too; the sentence no longer says a not-applicable criterion stays not applicable. B2 has no
 * not-applicable result: with no tree evidence it is unmeasured, whatever the history.
 * v27 freeze change F1 (operator decision 2026-10-28): B2 withholds only its ratio, as under every
 * other rubric, or abstains where no credited PR-trace file remains. Operator ruling of 1 Nov: the
 * scan gives no composite and no verdict (WITAN_V27_SHALLOW_HISTORY_REASON), so this sentence no
 * longer says how an abstention enters the composite; until then it said A2's shallow-only
 * abstention was left out of the composite and a failed-read one counted as 0.
 */
export const SHALLOW_HISTORY_V27_ABSTENTION =
  'This repository is a shallow clone (git rev-parse --is-shallow-repository reports true), so its ' +
  'commit history is truncated. A2 (credentials and .env files in earlier commits) and B2 (pull-request ' +
  'merge ratio over recent commits) read history. Under this rubric a shallow clone gets no composite ' +
  'score and no verdict; each criterion is still read and shown. A2 abstains unless a confirmed ' +
  'critical secret finding stands, including where it would otherwise be marked not applicable, ' +
  'because that decision also rests on its scans of earlier commits. B2, where it would be scored, ' +
  'leaves that ratio out when fewer commits are visible than it reads and is scored on the CI ' +
  'workflows it credits, pull-request template and review-gate record in the checked-out files, or ' +
  'abstains where none of those remains. ' +
  SHALLOW_HISTORY_FETCH_INSTRUCTION;

/** A v27 report that abstained because the scanned checkout is a shallow clone. */
export function isWitanV27ShallowHistoryAbstention(report: WitanReport): boolean {
  return report.verdict === 'insufficient_source' && report.insufficientSourceReason === WITAN_V27_SHALLOW_HISTORY_REASON;
}

/** A v27 report that abstained because the depth of the scanned checkout's history could not be read. */
export function isWitanV27HistoryDepthUnknownAbstention(report: WitanReport): boolean {
  return (
    report.verdict === 'insufficient_source' && report.insufficientSourceReason === WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON
  );
}

/**
 * True when `repoPath` is a shallow clone. False when it is complete, not a git repository, or
 * when git cannot answer. Every rubric's collectors and the display-only disclosure use this;
 * v27's report-level abstention uses readHistoryDepth, which does not read an unanswered question
 * as "complete".
 */
export function isShallowRepository(repoPath: string): boolean {
  const result = execGit(['rev-parse', '--is-shallow-repository'], { cwd: repoPath });
  return result.ok && result.stdout.trim() === 'true';
}

/**
 * What the scan knows about the depth of `repoPath`'s history:
 * - 'shallow' or 'complete': git said so, or, where git could not answer, the repository's files
 *   did (historyDepthFromFiles);
 * - 'not_a_repository': git could not answer and no `.git` entry is visible from `repoPath`
 *   (hasVisibleGitMetadata), so there is no history to have a depth;
 * - 'unknown': a `.git` entry is visible, but neither git nor the files settle the depth.
 */
export type HistoryDepth = 'shallow' | 'complete' | 'not_a_repository' | 'unknown';

export function readHistoryDepth(repoPath: string): HistoryDepth {
  const result = execGit(['rev-parse', '--is-shallow-repository'], { cwd: repoPath });
  if (result.ok) {
    const answer = result.stdout.trim();
    if (answer === 'true') return 'shallow';
    if (answer === 'false') return 'complete';
    // Any other answer (a git too old to know the option echoes it back) settles nothing.
  }
  const entry = findVisibleGitMetadata(repoPath);
  if (entry === undefined) return result.ok ? 'unknown' : 'not_a_repository';
  return historyDepthFromFiles(entry);
}

/** A filesystem error that proves the entry is not there (as opposed to unreadable). */
function isDefinitelyAbsent(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

// The most of a `.git` file read to find its `gitdir:` line, and of a `commondir` file.
const GIT_POINTER_FILE_BYTES = 4096;

function readPointerFile(path: string): string {
  const descriptor = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(GIT_POINTER_FILE_BYTES);
    const length = readSync(descriptor, buffer, 0, GIT_POINTER_FILE_BYTES, 0);
    return buffer.subarray(0, length).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

/** The git directory a `.git` entry names, or undefined when it cannot be located. */
function gitDirectoryOf(entry: string): string | undefined {
  try {
    const target = statSync(entry);
    if (target.isDirectory()) return realpathSync(entry);
    if (!target.isFile()) return undefined;
    const line = /^gitdir: *(.+?) *$/m.exec(readPointerFile(entry));
    if (!line?.[1]) return undefined;
    const gitDir = resolve(dirname(entry), line[1]);
    return statSync(gitDir).isDirectory() ? realpathSync(gitDir) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The depth of the history behind a visible `.git` entry, read from files, for when git cannot
 * answer (git missing from PATH, or unable to open the repository). git records a shallow clone's
 * boundary commits in a `shallow` file in its common git directory: the git directory itself, or,
 * for a linked worktree, the directory its `commondir` file names. A git directory that holds HEAD
 * and no `shallow` file is a complete clone; anything Cejel cannot read, or cannot locate, is
 * 'unknown', never 'complete'.
 */
function historyDepthFromFiles(entry: string): HistoryDepth {
  const gitDir = gitDirectoryOf(entry);
  if (gitDir === undefined) return 'unknown';
  let commonDir = gitDir;
  try {
    const pointer = readPointerFile(join(gitDir, 'commondir')).trim();
    if (pointer === '') return 'unknown';
    commonDir = resolve(gitDir, pointer);
  } catch (error: unknown) {
    if (!isDefinitelyAbsent(error)) return 'unknown';
  }
  try {
    lstatSync(join(gitDir, 'HEAD'));
  } catch {
    return 'unknown';
  }
  try {
    lstatSync(join(commonDir, 'shallow'));
    return 'shallow';
  } catch (error: unknown) {
    if (!isDefinitelyAbsent(error)) return 'unknown';
  }
  // The common directory must itself be readable for the shallow file's absence to mean anything.
  try {
    readdirSync(commonDir);
    return 'complete';
  } catch {
    return 'unknown';
  }
}

/**
 * Under witan-rubric-v27-prospective-2026-10-19, the report-level abstention reason the history
 * depth calls for: WITAN_V27_SHALLOW_HISTORY_REASON for a shallow clone,
 * WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON where the depth could not be read, and none for a complete
 * clone or a directory that is not a repository.
 */
export function v27HistoryDepthAbstentionReason(repoPath: string): string | undefined {
  const depth = readHistoryDepth(repoPath);
  if (depth === 'shallow') return WITAN_V27_SHALLOW_HISTORY_REASON;
  if (depth === 'unknown') return WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON;
  return undefined;
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
