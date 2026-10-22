import { execFileSync } from 'node:child_process';
import { closeSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const GIT_EXEC_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
export const GIT_EXEC_TIMEOUT_MS = 30_000;

// The largest measured inventory in the 24-repository release corpus is Biome at
// 2,144,483 bytes / 26,244 entries. 8 MiB leaves 6,244,125 bytes (3.91x) of headroom while
// keeping each hostile Git response bounded. Exceeding it is a surfaced scan limitation.
export const HARDENED_GIT_ARGUMENTS = [
  '--no-pager',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.pager=',
  '-c',
  'core.editor=false',
  '-c',
  'core.sshCommand=false',
  '-c',
  'diff.external=false',
  '-c',
  'credential.helper=',
  '-c',
  'log.showSignature=false',
  '-c',
  'gpg.program=false',
  '-c',
  'gpg.openpgp.program=false',
  '-c',
  'gpg.x509.program=false',
  '-c',
  'gpg.ssh.program=false',
  '-c',
  'core.quotePath=false',
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.ext.allow=never',
  '-c',
  'protocol.file.allow=never',
  '-c',
  'protocol.git.allow=never',
  '-c',
  'protocol.http.allow=never',
  '-c',
  'protocol.https.allow=never',
  '-c',
  'protocol.ssh.allow=never',
] as const;

export const HARDENED_GIT_READ_ONLY_SUBCOMMANDS = [
  'check-ignore',
  'diff-tree',
  'log',
  'ls-files',
  'rev-list',
  'rev-parse',
  'show',
] as const;

export type GitExecFailureReason =
  | 'git_absent'
  | 'not_a_repo'
  | 'buffer_exceeded'
  | 'timeout'
  | 'exec_failed';

export type GitExecResult =
  | { readonly ok: true; readonly stdout: string }
  | {
      readonly ok: false;
      readonly reason: GitExecFailureReason;
      readonly exitCode?: number;
    };

export interface GitExecOptions {
  readonly cwd: string;
  readonly input?: string;
  readonly maxBufferBytes?: number;
}

// Set only while withGitDiscoveryConfinedTo runs; undefined for every ordinary scan.
let discoveryCeiling: string | undefined;

/**
 * Runs `scan` with Git repository discovery confined to `root`. Every execGit call made while
 * it runs carries GIT_CEILING_DIRECTORIES set to the parent of `root`, so Git may find a
 * repository in `root` itself but never in a directory that contains it.
 *
 * For uploaded snapshots only. A CLI scan of a checkout's subdirectory must still find the
 * enclosing repository, so ordinary scans never call this. The ceiling is scoped here rather
 * than passed per call because the scan path reaches execGit through collectors that take only
 * a repository path; `scan` must therefore be synchronous, as runCejelScan is.
 */
export function withGitDiscoveryConfinedTo<T>(root: string, scan: () => T): T {
  const previous = discoveryCeiling;
  discoveryCeiling = dirname(realpathSync(root));
  try {
    const result = scan();
    if (typeof (result as { then?: unknown } | null)?.then === 'function') {
      throw new Error('Git discovery confinement requires a synchronous scan.');
    }
    return result;
  } finally {
    discoveryCeiling = previous;
  }
}

// The most of a `.git` file read to find its `gitdir:` line. git writes that line first.
const GIT_FILE_PREFIX_BYTES = 4096;

/** The error code of a failed filesystem call, if any. */
function fsErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
}

/** A filesystem error that proves the entry is not there (as opposed to unreadable). */
const isDefinitelyAbsent = (error: unknown) => fsErrorCode(error) === 'ENOENT' || fsErrorCode(error) === 'ENOTDIR';

/**
 * True when `path` looks like git metadata, not merely a name (#560 review, G2):
 * - any symbolic link named `.git`, even one whose target is gone (a copied checkout whose link
 *   no longer resolves), so the unopenable and unavailable causes apply to it;
 * - a directory, unless it is readable and definitely holds no `HEAD`: a `.git` directory Cejel
 *   cannot look into (EACCES or any other error) counts, so an unreadable repository is never
 *   mistaken for a stray directory (#560 review round 8, H1);
 * - a regular file whose first 4 KiB hold a line starting `gitdir:` (the file a worktree or
 *   submodule uses), or one Cejel cannot read.
 * A stray empty `.git` directory, or any other `.git` file, does not count. A filesystem check
 * only; it runs no git.
 */
function isGitMetadataEntry(path: string): boolean {
  let link;
  try {
    link = lstatSync(path);
  } catch (error: unknown) {
    return !isDefinitelyAbsent(error);
  }
  if (link.isSymbolicLink()) return true;
  if (link.isDirectory()) {
    try {
      lstatSync(join(path, 'HEAD'));
      return true;
    } catch (error: unknown) {
      return !isDefinitelyAbsent(error);
    }
  }
  if (!link.isFile()) return false;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    const buffer = Buffer.alloc(GIT_FILE_PREFIX_BYTES);
    const length = readSync(descriptor, buffer, 0, GIT_FILE_PREFIX_BYTES, 0);
    return /^gitdir:/m.test(buffer.subarray(0, length).toString('utf8'));
  } catch {
    return true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * True when a `.git` entry that looks like git metadata (isGitMetadataEntry) is visible from
 * `repoPath` within the same discovery bounds git would use: `repoPath` itself and each parent,
 * stopping below the confinement ceiling when one is set. A filesystem check only; it runs no
 * git. Used to tell "git is absent, or cannot open the repository, and this is one" apart from
 * "this is not one" (#560).
 */
export function hasVisibleGitMetadata(repoPath: string): boolean {
  let current: string;
  try {
    current = realpathSync(repoPath);
  } catch {
    return false;
  }
  for (;;) {
    if (discoveryCeiling !== undefined && current === discoveryCeiling) return false;
    if (isGitMetadataEntry(join(current, '.git'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function hardenedGitEnvironment(cwd: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'TZ'] as const) {
    const entry = Object.entries(process.env).find(
      ([candidate, value]) => candidate.toUpperCase() === key && value !== undefined,
    );
    if (entry?.[1] !== undefined) environment[key] = entry[1];
  }
  if (environment.HOME === undefined && process.env.USERPROFILE !== undefined) {
    environment.HOME = process.env.USERPROFILE;
  }

  return {
    ...environment,
    LC_ALL: 'C',
    LANG: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'true',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    // Docker bind mounts can present the checked-out tree under a different uid. Trust only
    // this exact, caller-supplied read-only working directory; ambient Git configuration is
    // still excluded below.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: cwd,
    ...(discoveryCeiling === undefined ? {} : { GIT_CEILING_DIRECTORIES: discoveryCeiling }),
  };
}

function errorField(error: unknown, key: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>)[key];
}

function stderrText(error: unknown): string {
  const stderr = errorField(error, 'stderr');
  return typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString('utf8') : '';
}

// git's own diagnostics that mean "there is no usable repository or revision here", each matched as
// git's literal message from the start of a stderr line. git prints some arguments unquoted (for
// example "fatal: bad object <commit>:<path>"), so no pattern may skip over text with ".*" to reach a
// phrase further along a line: a repository path containing the phrase would then match (#560). The
// paths Cejel passes to git never contain a line break (history paths with control characters are
// never read), and only git's first "fatal: " line is classified (isNoRepositoryDiagnostic), so a
// path cannot start a message of its own, and text after an anchored message start cannot change the
// outcome.
//
// git's messages for a missing or unusable repository (git 2.50 source, setup.c and others; checked
// against the strings in the installed binary), each printed after "fatal: " by die():
//   not a git repository (or any of the parent directories): %s
//   not a git repository (or any parent up to mount point %s)
//   not a git repository: %s          (GIT_DIR, or a `.git` file whose gitdir is missing)
//   not a git repository: '%s'
//   Not a git repository              (and "Not a git repository. Use --no-index ...", git diff)
//   not a git repository, but the field '%.*s' requires access to object data
//   not in a git directory
//   this operation must be run in a work tree
// All the "not a git repository" forms are recognised by their common start; the rest exactly.
const GIT_NO_REPOSITORY_DIAGNOSTICS: readonly RegExp[] = [
  /^fatal: not a git repository\b/i,
  /^fatal: not in a git directory$/,
  /^fatal: this operation must be run in a work tree$/,
  /^fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree\.$/,
  /^fatal: needed a single revision$/i,
];
// The unborn-branch message names the branch, which a repository can choose, so that one name is
// emptied before the exact match.
const GIT_UNBORN_BRANCH_DIAGNOSTIC = /^fatal: your current branch '' does not have any commits yet$/;

// Only git's first "fatal: " line is classified. git dies after printing it, so any later line is
// part of the same message, and a path git prints unquoted inside that message (which Cejel never
// passes when it holds a line break, but a caller could) cannot start a second "fatal: " line that
// is read as a message of its own. Earlier "warning: " or "error: " lines are not git's verdict.
function isNoRepositoryDiagnostic(stderr: string): boolean {
  const line = stderr
    .split('\n')
    .find((candidate) => candidate.startsWith('fatal: '))
    ?.trimEnd();
  if (line === undefined) return false;
  if (GIT_NO_REPOSITORY_DIAGNOSTICS.some((pattern) => pattern.test(line))) return true;
  const branchEmptied = line.replace(/^(fatal: your current branch )'[^'\n]*'/, "$1''");
  return GIT_UNBORN_BRANCH_DIAGNOSTIC.test(branchEmptied);
}

/**
 * Classifies a failed git invocation from what Node and git themselves reported: the spawn error
 * code and git's own diagnostic lines on stderr. Never from `error.message`:
 * Node repeats the whole command line there, the command line carries repository paths, and a
 * file named, say, `secrets/timeout.txt` or `not a git repository.txt` would otherwise choose the
 * class, turning a failed read into a "timeout", or into an expected absence that is never
 * reported (#560).
 */
export function classifyGitFailure(error: unknown): GitExecFailureReason {
  const code = errorField(error, 'code');

  if (code === 'ENOENT') return 'git_absent';
  // Node reports the output limit as ENOBUFS from execFileSync, and as
  // ERR_CHILD_PROCESS_STDIO_MAXBUFFER from its other child-process APIs.
  if (code === 'ENOBUFS' || code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'buffer_exceeded';
  // Node sets ETIMEDOUT when it kills the child for the timeout. A bare SIGTERM sent by anything
  // else is not Cejel's timeout, so it falls through to a failed read.
  if (code === 'ETIMEDOUT') return 'timeout';
  if (isNoRepositoryDiagnostic(stderrText(error))) return 'not_a_repo';
  return 'exec_failed';
}

/**
 * Execute the local Git binary through Cejel's only production subprocess boundary.
 *
 * The caller supplies argv, never a shell command. Global Git config remains readable on
 * The exact working directory is supplied as the sole `safe.directory` entry so cross-UID
 * Docker/CI mounts do not require ambient configuration. The child otherwise receives only
 * PATH/HOME/TZ plus fixed hardening variables, so ambient GIT_*, proxy, alternate-object,
 * work-tree, and config-injection variables cannot cross the boundary.
 *
 * Executable/file-valued config audit: commands reachable here can consult core.fsmonitor,
 * core.pager, core.editor, core.sshCommand, diff.external, credential.helper, log.showSignature,
 * and gpg.*.program; all are neutralized above. filter.* clean/smudge requires checkout/add
 * conversion, uploadpack.packObjectsHook requires upload-pack, and gpg.ssh.allowedSignersFile
 * requires signature verification; Cejel invokes none of those operations and also disables
 * signature display. Every transport protocol is denied and prompts/system config are disabled.
 */
export function execGit(argv: readonly string[], options: GitExecOptions): GitExecResult {
  try {
    const cwd = resolve(options.cwd);
    const stdout = execFileSync('git', [...HARDENED_GIT_ARGUMENTS, ...argv], {
      cwd,
      encoding: 'utf8',
      env: hardenedGitEnvironment(cwd),
      input: options.input,
      maxBuffer: options.maxBufferBytes ?? GIT_EXEC_MAX_BUFFER_BYTES,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: GIT_EXEC_TIMEOUT_MS,
    });
    return { ok: true, stdout };
  } catch (error: unknown) {
    const status = errorField(error, 'status');
    return {
      ok: false,
      reason: classifyGitFailure(error),
      ...(typeof status === 'number' ? { exitCode: status } : {}),
    };
  }
}

export function isExpectedGitAbsence(
  result: Exclude<GitExecResult, { readonly ok: true }>,
): boolean {
  return result.reason === 'git_absent' || result.reason === 'not_a_repo';
}

export function describeGitFailure(
  reason: GitExecFailureReason,
  operation: string,
  maxBufferBytes = GIT_EXEC_MAX_BUFFER_BYTES,
): string {
  if (reason === 'buffer_exceeded') {
    const outputLimit =
      maxBufferBytes % (1024 * 1024) === 0
        ? `${maxBufferBytes / (1024 * 1024)} MiB`
        : `${Math.ceil(maxBufferBytes / 1024)} KiB`;
    return `Cejel: local git ${operation} exceeded the ${outputLimit} output limit.`;
  }
  if (reason === 'timeout') {
    return `Cejel: local git ${operation} exceeded the 30 second timeout.`;
  }
  if (reason === 'git_absent') {
    return `Cejel: local git is unavailable while running ${operation}.`;
  }
  if (reason === 'not_a_repo') {
    return `Cejel: ${operation} requires a usable Git work tree.`;
  }
  return `Cejel: local git ${operation} failed.`;
}
