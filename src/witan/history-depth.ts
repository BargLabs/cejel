import { closeSync, lstatSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { WitanReport } from './schemas.js';

import {
  type GitExecFailureReason,
  describeGitFailure,
  execGit,
  findVisibleGitMetadata,
  isExpectedGitAbsence,
} from './git-exec.js';
import { WITAN_RUBRIC_VERSION_V27 } from './rubric-version.js';

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
 * What a scan's history abstention says about the composite. `v27Wording` is the v27 gate's answer
 * for the rubric that ran (usesV27FalseAssuranceClosure in repo-signals.ts, the one place a rubric is
 * compared with v27; this module cannot import it without a cycle, so callers pass it). Under v27 the
 * 1 Nov reasons say the composite "could fall below" the full clone's, the case that ruling was
 * about, and their bytes are unchanged. Under every other rubric (operator ruling of 2 Nov) a
 * truncated history can also raise it: A2 on a depth-1 clone cannot see a secret committed and later
 * deleted.
 */
function truncatedHistoryConsequence(v27Wording: boolean): string {
  return v27Wording ? 'could fall below' : 'could be higher or lower than';
}

/**
 * Operator ruling of 1 Nov, replacing the v27 freeze change F1's composite treatment for v27: under
 * witan-rubric-v27-prospective-2026-10-19 a shallow clone gets no composite and no verdict. Operator
 * ruling of 2 Nov: the same under every rubric, the calibrated default v17 included. This is the
 * report's insufficientSourceReason for that abstention under `rubricVersion`, and its exact text is
 * the stable discriminator (isWitanShallowHistoryAbstention), as WITAN_NO_MEASUREMENT_REASON is for
 * its own abstention: no report field is added. Each criterion's reading is still computed and
 * shown. F1 left A2's shallow-only abstention out of the composite and capped the verdict; taking A2
 * out of an average moves the average toward the other criteria, so the composite could fall below
 * the same commit's full-clone composite, which the operator's 26 Oct rule forbids.
 */
export function shallowHistoryAbstentionReason(rubricVersion: string, v27Wording: boolean): string {
  return (
    `Under ${rubricVersion} Cejel gives no composite score and no verdict for a ` +
    'shallow clone (reason: shallow_history). A2 and B2 read commit history, and a composite over a ' +
    `truncated history ${truncatedHistoryConsequence(v27Wording)} the same commit's composite over its full history. Each ` +
    "criterion's reading is still shown. " +
    SHALLOW_HISTORY_FETCH_INSTRUCTION
  );
}

/** v27's shallow-clone reason, byte for byte as on 1 Nov. */
export const WITAN_V27_SHALLOW_HISTORY_REASON = shallowHistoryAbstentionReason(WITAN_RUBRIC_VERSION_V27, true);

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
 * to prevent, so v27 withholds the composite and the verdict here too, and since the operator's
 * ruling of 2 Nov every rubric does. Its exact text under `rubricVersion` is the discriminator
 * (isWitanHistoryDepthUnknownAbstention), as for the shallow-clone reason.
 */
export function historyDepthUnknownAbstentionReason(rubricVersion: string, v27Wording: boolean): string {
  return (
    `Under ${rubricVersion} Cejel gives no composite score and no verdict when ` +
    'it cannot tell whether the checkout is a shallow clone (reason: history_depth_unknown). A .git ' +
    'entry is present, but git could not report the history depth and the repository files did not ' +
    `show it. A2 and B2 read commit history, and a composite over a truncated history ${truncatedHistoryConsequence(v27Wording)} ` +
    "the same commit's composite over its full history. Each criterion's reading is still " +
    'shown. ' +
    HISTORY_DEPTH_UNKNOWN_INSTRUCTION
  );
}

/** v27's unknown-depth reason, byte for byte as on 1 Nov. */
export const WITAN_V27_HISTORY_DEPTH_UNKNOWN_REASON = historyDepthUnknownAbstentionReason(WITAN_RUBRIC_VERSION_V27, true);

/**
 * The instruction a scan of a directory with no git history carries (operator ruling of 2 Nov).
 */
export const NO_GIT_HISTORY_INSTRUCTION =
  'The scan read a directory that is not a git repository: scan a git clone with full history (for ' +
  'example fetch-depth: 0 in actions/checkout); an uploaded snapshot or archive carries no history.';

/**
 * Operator ruling of 2 Nov, every rubric (v27 included): a scanned directory that is not a git
 * repository (readHistoryDepth's 'not_a_repository': git cannot open it and no `.git` entry is
 * visible) gets no composite and no verdict. Until then it was scored as if its history had been
 * read and found clean: A2 said history secret scanning covered all reachable history, and no
 * limitation said otherwise. That covers every HTTP and remote-MCP upload, every tarball and every
 * archive export of a commit. Its exact text under `rubricVersion` is the discriminator
 * (isWitanNoGitHistoryAbstention).
 */
export function noGitHistoryAbstentionReason(rubricVersion: string): string {
  return (
    `Under ${rubricVersion} Cejel gives no composite score and no verdict for a ` +
    'directory that is not a git repository (reason: no_git_history). A2 reads commit history for ' +
    'credentials and .env files committed and later deleted, and none was read here, so a composite ' +
    "could be higher than the same commit's composite over its full history. Each criterion's " +
    'reading is still shown. ' +
    NO_GIT_HISTORY_INSTRUCTION
  );
}

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
 * Operator ruling of 2 Nov: every rubric now abstains on a shallow clone, so every rubric writes
 * this sentence ("Under this rubric" names whichever ran); the name keeps its v27 origin.
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

/**
 * True when `reason` is `reasonFor`'s text for `rubricVersion` in either wording. The text names the
 * rubric that ran, so this recognises only that rubric's own reason; the wording (v27's 1 Nov text or
 * every other rubric's) is the gate's to choose and the producer's to apply, not this reader's.
 */
function isReasonFor(
  reason: string | undefined,
  rubricVersion: string,
  reasonFor: (rubricVersion: string, v27Wording: boolean) => string,
): boolean {
  return reason === reasonFor(rubricVersion, true) || reason === reasonFor(rubricVersion, false);
}

/** A report that abstained because the scanned checkout is a shallow clone (any rubric). */
export function isWitanShallowHistoryAbstention(report: WitanReport): boolean {
  return (
    report.verdict === 'insufficient_source' &&
    isReasonFor(report.insufficientSourceReason, report.rubricVersion, shallowHistoryAbstentionReason)
  );
}

/** A report that abstained because the depth of the scanned checkout's history could not be read. */
export function isWitanHistoryDepthUnknownAbstention(report: WitanReport): boolean {
  return (
    report.verdict === 'insufficient_source' &&
    isReasonFor(report.insufficientSourceReason, report.rubricVersion, historyDepthUnknownAbstentionReason)
  );
}

/** A report that abstained because the scanned directory is not a git repository (any rubric). */
export function isWitanNoGitHistoryAbstention(report: WitanReport): boolean {
  return (
    report.verdict === 'insufficient_source' &&
    report.insufficientSourceReason === noGitHistoryAbstentionReason(report.rubricVersion)
  );
}

/**
 * @deprecated The 1 Nov names, from when only v27 abstained on history. The predicates above
 * recognise the same v27 reports, byte for byte, and every other rubric's too; these aliases remain
 * for the tests written against the 1 Nov ruling.
 */
export const isWitanV27ShallowHistoryAbstention = isWitanShallowHistoryAbstention;
/** @deprecated See isWitanV27ShallowHistoryAbstention. */
export const isWitanV27HistoryDepthUnknownAbstention = isWitanHistoryDepthUnknownAbstention;

/**
 * True when `repoPath` is a shallow clone. False when it is complete, not a git repository, or
 * when git cannot answer. Every rubric's collectors and the display-only disclosure use this;
 * v27's report-level abstention uses readHistoryDepth, which does not read an unanswered question
 * as "complete".
 */
export function isShallowRepository(repoPath: string): boolean {
  return readShallowAnswer(repoPath).shallow;
}

/**
 * #574 item 3: isShallowRepository's answer, and, where git failed for a reason other than an
 * expected absence (a timeout, an output limit, a failed run), that reason. `shallow` is false then,
 * as before, so every rubric that reads it scores exactly as before; the caller states the failed
 * read (shallowCheckFailureLimitation), and v27 abstains where the answer decides a score.
 */
export interface ShallowAnswer {
  readonly shallow: boolean;
  readonly failure?: GitExecFailureReason;
}

export function readShallowAnswer(repoPath: string): ShallowAnswer {
  const result = execGit(['rev-parse', '--is-shallow-repository'], { cwd: repoPath });
  if (result.ok) return { shallow: result.stdout.trim() === 'true' };
  return isExpectedGitAbsence(result) ? { shallow: false } : { shallow: false, failure: result.reason };
}

/** The scan limitation for a failed shallow-clone check (#574 item 3). One sentence per reason. */
export function shallowCheckFailureLimitation(reason: GitExecFailureReason): string {
  return `${describeGitFailure(reason, 'shallow-clone check')} Cejel could not tell from git whether this clone is shallow.`;
}

/**
 * The scan limitation for a failed history-depth check (#574 item 3). The depth is then read from
 * the `shallow` file in the common git directory, the file git itself reads to answer
 * `--is-shallow-repository` (historyDepthFromFiles), so the evidence is the same. The one
 * difference is a `shallow` file Cejel can see and git cannot open: git reads that as complete, the
 * files read it as shallow, the cautious side.
 */
export function historyDepthFailureLimitation(reason: GitExecFailureReason): string {
  return `${describeGitFailure(reason, 'history-depth check')} Cejel read the history depth from the repository's own shallow file, which is the file git reads to answer.`;
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
  return readHistoryDepthAnswer(repoPath).depth;
}

/**
 * #574 item 3: readHistoryDepth's answer, and, where git failed for a reason other than an expected
 * absence, that reason, so the caller can state it (historyDepthFailureLimitation). The depth is
 * the same either way.
 */
export function readHistoryDepthAnswer(repoPath: string): {
  readonly depth: HistoryDepth;
  readonly failure?: GitExecFailureReason;
} {
  const result = execGit(['rev-parse', '--is-shallow-repository'], { cwd: repoPath });
  if (result.ok) {
    const answer = result.stdout.trim();
    if (answer === 'true') return { depth: 'shallow' };
    if (answer === 'false') return { depth: 'complete' };
    // Any other answer (a git too old to know the option echoes it back) settles nothing.
  }
  const failure = !result.ok && !isExpectedGitAbsence(result) ? { failure: result.reason } : {};
  const entry = findVisibleGitMetadata(repoPath);
  if (entry === undefined) return { depth: result.ok ? 'unknown' : 'not_a_repository', ...failure };
  return { depth: historyDepthFromFiles(entry), ...failure };
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
 * The history depths whose history Cejel could not read: a shallow clone, a depth that could not be
 * read, and a directory with no git history at all. Undefined for 'complete'.
 */
export type UnreadHistoryDepth = Exclude<HistoryDepth, 'complete'>;

export function unreadHistoryDepth(depth: HistoryDepth): UnreadHistoryDepth | undefined {
  return depth === 'complete' ? undefined : depth;
}

/**
 * The report-level abstention reason a history depth calls for under `rubricVersion` (operator
 * rulings of 1 Nov for v27 and 2 Nov for every rubric): the shallow-history reason for a shallow
 * clone, the unknown-depth reason where the depth could not be read, the no-git reason for a
 * directory that is not a repository, and none for a complete clone. `v27Wording` is the v27 gate's
 * answer for `rubricVersion` (truncatedHistoryConsequence).
 */
export function historyDepthAbstentionReason(
  depth: HistoryDepth,
  rubricVersion: string,
  v27Wording: boolean,
): string | undefined {
  if (depth === 'shallow') return shallowHistoryAbstentionReason(rubricVersion, v27Wording);
  if (depth === 'unknown') return historyDepthUnknownAbstentionReason(rubricVersion, v27Wording);
  if (depth === 'not_a_repository') return noGitHistoryAbstentionReason(rubricVersion);
  return undefined;
}

/**
 * Disclosures about the commit history the scan read. Declared, never scored: this does not enter
 * scanLimitations, so it moves no score, abstention, badge or --min-score outcome (operator ruling
 * 2026-10-08, issue #428). Undefined when the history is complete or there is no git repository.
 * Since the operator's ruling of 2 Nov every rubric abstains on a shallow clone, so every rubric
 * writes SHALLOW_HISTORY_V27_ABSTENTION; SHALLOW_HISTORY_LIMITATION, which said A2 was scored as
 * before, is no longer written by any scan. The abstentions themselves (A2's, and B2's withheld
 * ratio) happen in the collectors, not here.
 */
export function detectHistoryLimitations(repoPath: string): string[] | undefined {
  return detectHistoryLimitationsAnswer(repoPath).historyLimitations;
}

/**
 * #574 item 3: detectHistoryLimitations, and the scan limitation for a failed shallow-clone check.
 * The disclosure says git reported the clone shallow, so it is written only where git answered; the
 * report-level abstention, which reads the shallow file where git cannot answer (readHistoryDepth),
 * is unchanged.
 */
export function detectHistoryLimitationsAnswer(repoPath: string): {
  readonly historyLimitations?: string[];
  readonly scanLimitation?: string;
} {
  const answer = readShallowAnswer(repoPath);
  if (answer.failure !== undefined) return { scanLimitation: shallowCheckFailureLimitation(answer.failure) };
  return answer.shallow ? { historyLimitations: [SHALLOW_HISTORY_V27_ABSTENTION] } : {};
}
