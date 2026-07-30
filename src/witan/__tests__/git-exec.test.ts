import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GIT_EXEC_MAX_BUFFER_BYTES,
  GIT_EXEC_TIMEOUT_MS,
  execGit,
} from '../git-exec.js';

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
}));

const ORIGINAL_ENVIRONMENT = { ...process.env };

describe('git subprocess chokepoint', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    process.env = { ...ORIGINAL_ENVIRONMENT };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENVIRONMENT };
  });

  it('passes fixed argv, explicit resource ceilings, and a hardened environment', () => {
    process.env.HTTP_PROXY = 'http://attacker.invalid';
    process.env.https_proxy = 'http://attacker.invalid';
    process.env.ALL_PROXY = 'socks5://attacker.invalid';
    process.env.NO_PROXY = '*';
    process.env.GIT_CONFIG_PARAMETERS = "'protocol.ext.allow=always'";
    process.env.GIT_CONFIG_COUNT = '1';
    process.env.GIT_CONFIG_KEY_0 = 'core.fsmonitor';
    process.env.GIT_CONFIG_VALUE_0 = '/tmp/attacker-controlled-hook';
    process.env.GIT_CONFIG_GLOBAL = '/tmp/global-config-with-safe-directory';
    execFileSyncMock.mockReturnValue('tracked.ts\n');

    expect(execGit(['ls-files', '--cached'], { cwd: '/repo' })).toEqual({
      ok: true,
      stdout: 'tracked.ts\n',
    });
    expect(execGit(['show', 'HEAD:tracked.ts'], { cwd: '/repo', input: 'ignored' })).toEqual({
      ok: true,
      stdout: 'tracked.ts\n',
    });

    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    const [file, argv, rawOptions] = execFileSyncMock.mock.calls[0] ?? [];
    const options = rawOptions as
      | {
          env?: NodeJS.ProcessEnv;
          maxBuffer?: number;
          timeout?: number;
          encoding?: string;
          stdio?: readonly string[];
        }
      | undefined;
    expect(file).toBe('git');
    expect(argv).toEqual([
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
      'ls-files',
      '--cached',
    ]);
    expect(options).toMatchObject({
      encoding: 'utf8',
      maxBuffer: GIT_EXEC_MAX_BUFFER_BYTES,
      timeout: GIT_EXEC_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const invocation of execFileSyncMock.mock.calls) {
      expect(invocation[2]).toMatchObject({
        maxBuffer: GIT_EXEC_MAX_BUFFER_BYTES,
        timeout: GIT_EXEC_TIMEOUT_MS,
      });
    }
    expect(options?.env).toMatchObject({
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_PAGER: 'cat',
      PAGER: 'cat',
      GIT_CONFIG_GLOBAL: '/tmp/global-config-with-safe-directory',
    });
    expect(options?.env?.HTTP_PROXY).toBeUndefined();
    expect(options?.env?.https_proxy).toBeUndefined();
    expect(options?.env?.ALL_PROXY).toBeUndefined();
    expect(options?.env?.NO_PROXY).toBeUndefined();
    expect(options?.env?.GIT_CONFIG_PARAMETERS).toBeUndefined();
    expect(options?.env?.GIT_CONFIG_COUNT).toBeUndefined();
    expect(options?.env?.GIT_CONFIG_KEY_0).toBeUndefined();
    expect(options?.env?.GIT_CONFIG_VALUE_0).toBeUndefined();
  });

  it.each([
    ['ENOENT', 'git_absent'],
    ['ENOBUFS', 'buffer_exceeded'],
    ['ETIMEDOUT', 'timeout'],
  ] as const)('classifies %s without collapsing it to generic failure', (code, reason) => {
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error(code), { code });
    });

    expect(execGit(['status'], { cwd: '/repo' })).toEqual({ ok: false, reason });
  });

  it('distinguishes a non-repository from a failed git invocation', () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('fatal'), {
        status: 128,
        stderr: 'fatal: not a git repository (or any parent up to mount point)',
      });
    });
    execFileSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('fatal'), {
        status: 128,
        stderr: 'fatal: detected dubious ownership in repository',
      });
    });

    expect(execGit(['rev-parse', 'HEAD'], { cwd: '/repo' })).toEqual({
      ok: false,
      reason: 'not_a_repo',
      exitCode: 128,
    });
    expect(execGit(['rev-parse', 'HEAD'], { cwd: '/repo' })).toEqual({
      ok: false,
      reason: 'exec_failed',
      exitCode: 128,
    });
  });
});
