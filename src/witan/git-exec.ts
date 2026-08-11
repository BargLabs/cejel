import { execFileSync } from 'node:child_process';

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

function hardenedGitEnvironment(): NodeJS.ProcessEnv {
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
  };
}

function errorField(error: unknown, key: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>)[key];
}

function errorText(error: unknown): string {
  const stderr = errorField(error, 'stderr');
  const stderrText =
    typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString('utf8') : '';
  const message = error instanceof Error ? error.message : '';
  return `${stderrText}\n${message}`;
}

function classifyGitFailure(error: unknown): GitExecFailureReason {
  const code = errorField(error, 'code');
  const signal = errorField(error, 'signal');
  const text = errorText(error);

  if (code === 'ENOENT') return 'git_absent';
  if (code === 'ENOBUFS' || /maxBuffer|ENOBUFS/i.test(text)) return 'buffer_exceeded';
  if (code === 'ETIMEDOUT' || signal === 'SIGTERM' || /timed?\s*out|ETIMEDOUT/i.test(text)) {
    return 'timeout';
  }
  if (
    /not a git repository|not inside a work tree|not in a git directory|unknown revision.*HEAD|ambiguous argument ['"]?HEAD|does not have any commits yet|needed a single revision/i.test(
      text,
    )
  ) {
    return 'not_a_repo';
  }
  return 'exec_failed';
}

/**
 * Execute the local Git binary through Cejel's only production subprocess boundary.
 *
 * The caller supplies argv, never a shell command. Global Git config remains readable on
 * purpose: cross-uid Docker/CI mounts depend on user-configured safe.directory entries.
 * The child receives only PATH/HOME/TZ plus fixed hardening variables, so ambient GIT_*,
 * proxy, alternate-object, work-tree, and config-injection variables cannot cross the boundary.
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
    const stdout = execFileSync('git', [...HARDENED_GIT_ARGUMENTS, ...argv], {
      cwd: options.cwd,
      encoding: 'utf8',
      env: hardenedGitEnvironment(),
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
