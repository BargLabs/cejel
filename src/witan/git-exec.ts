import { execFileSync } from 'node:child_process';

export const GIT_EXEC_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
export const GIT_EXEC_TIMEOUT_MS = 30_000;

// At roughly 40 bytes per tracked path (including the newline), 64 MiB carries about
// 1.67 million paths. The explicit ceiling is large enough for substantial monorepos while
// remaining bounded; exceeding it is a surfaced scan limitation, never a silent fallback.
const HARDENED_GIT_ARGUMENTS = [
  '-c',
  'core.fsmonitor=false',
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

const SCRUBBED_ENVIRONMENT_KEYS = new Set([
  'ALL_PROXY',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_PROXY_COMMAND',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
]);

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
}

function hardenedGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    const normalizedKey = key.toUpperCase();
    if (
      SCRUBBED_ENVIRONMENT_KEYS.has(normalizedKey) ||
      /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(normalizedKey)
    ) {
      continue;
    }
    environment[key] = value;
  }

  return {
    ...environment,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
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
 * Repository-controlled executable behavior is neutralized narrowly with core.fsmonitor=false,
 * every transport protocol is denied, system config and prompts are disabled, and proxy/config
 * injection environment variables are removed.
 */
export function execGit(argv: readonly string[], options: GitExecOptions): GitExecResult {
  try {
    const stdout = execFileSync('git', [...HARDENED_GIT_ARGUMENTS, ...argv], {
      cwd: options.cwd,
      encoding: 'utf8',
      env: hardenedGitEnvironment(),
      input: options.input,
      maxBuffer: GIT_EXEC_MAX_BUFFER_BYTES,
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

export function describeGitFailure(reason: GitExecFailureReason, operation: string): string {
  if (reason === 'buffer_exceeded') {
    return `Cejel: local git ${operation} exceeded the 64 MiB output limit.`;
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
