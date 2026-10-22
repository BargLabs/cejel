import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GIT_EXEC_MAX_BUFFER_BYTES,
  GIT_EXEC_TIMEOUT_MS,
  HARDENED_GIT_ARGUMENTS,
  HARDENED_GIT_READ_ONLY_SUBCOMMANDS,
  describeGitFailure,
  execGit,
  withGitDiscoveryConfinedTo,
} from '../git-exec.js';

const execFileSyncMock = vi.hoisted(() => vi.fn());
const require = createRequire(import.meta.url);
const calibrationPolicy = require('../../../calibration/llm/scripts/no-egress-policy.cjs') as {
  HARDENED_GIT_ARGUMENTS: readonly string[];
  ALLOWED_GIT_SUBCOMMANDS: readonly string[];
};

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
}));

const ORIGINAL_ENVIRONMENT = { ...process.env };

describe('git subprocess chokepoint', () => {
  it('stays byte-aligned with the calibration no-egress local-Git exception', () => {
    expect(calibrationPolicy.HARDENED_GIT_ARGUMENTS).toEqual(HARDENED_GIT_ARGUMENTS);
    expect(calibrationPolicy.ALLOWED_GIT_SUBCOMMANDS).toEqual(
      HARDENED_GIT_READ_ONLY_SUBCOMMANDS,
    );
  });

  beforeEach(() => {
    execFileSyncMock.mockReset();
    process.env = { ...ORIGINAL_ENVIRONMENT };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENVIRONMENT };
  });

  it('passes fixed argv, explicit resource ceilings, and a hardened environment', () => {
    process.env.PATH = '/safe/bin';
    process.env.HOME = '/safe/home';
    process.env.TZ = 'UTC';
    process.env.LANG = 'fr_FR.UTF-8';
    process.env.LC_ALL = 'fr_FR.UTF-8';
    process.env.HTTP_PROXY = 'http://attacker.invalid';
    process.env.https_proxy = 'http://attacker.invalid';
    process.env.ALL_PROXY = 'socks5://attacker.invalid';
    process.env.NO_PROXY = '*';
    process.env.GIT_CONFIG_PARAMETERS = "'protocol.ext.allow=always'";
    process.env.GIT_CONFIG_COUNT = '1';
    process.env.GIT_CONFIG_KEY_0 = 'core.fsmonitor';
    process.env.GIT_CONFIG_VALUE_0 = '/tmp/attacker-controlled-hook';
    process.env.GIT_CONFIG_GLOBAL = '/tmp/global-config-with-safe-directory';
    process.env.GIT_ALLOW_PROTOCOL = 'file:ssh:https';
    process.env.GIT_PROTOCOL_FROM_USER = '1';
    process.env.GIT_EXEC_PATH = '/tmp/attacker-git-core';
    process.env.GIT_TEMPLATE_DIR = '/tmp/attacker-template';
    process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = '/tmp/attacker-objects';
    process.env.GIT_INDEX_FILE = '/tmp/attacker-index';
    process.env.GIT_OBJECT_DIRECTORY = '/tmp/attacker-object-directory';
    process.env.GIT_DIR = '/tmp/attacker-git-dir';
    process.env.GIT_WORK_TREE = '/tmp/attacker-work-tree';
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
    expect(options?.env).toEqual({
      PATH: '/safe/bin',
      HOME: '/safe/home',
      TZ: 'UTC',
      LC_ALL: 'C',
      LANG: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'true',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_PAGER: 'cat',
      PAGER: 'cat',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: '/repo',
    });
  });

  it('sets a discovery ceiling only while a confined scan runs', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'cejel-ceiling-')));
    const snapshot = join(parent, 'snapshot');
    mkdirSync(snapshot);
    process.env.GIT_CEILING_DIRECTORIES = '/ambient/ceiling';
    execFileSyncMock.mockReturnValue('');
    const environmentOfCall = (index: number): NodeJS.ProcessEnv | undefined =>
      (execFileSyncMock.mock.calls[index]?.[2] as { env?: NodeJS.ProcessEnv } | undefined)?.env;

    try {
      execGit(['rev-parse', 'HEAD'], { cwd: snapshot });
      withGitDiscoveryConfinedTo(snapshot, () => execGit(['rev-parse', 'HEAD'], { cwd: snapshot }));
      expect(() =>
        withGitDiscoveryConfinedTo(snapshot, () => {
          throw new Error('scan failed');
        }),
      ).toThrow('scan failed');
      execGit(['rev-parse', 'HEAD'], { cwd: snapshot });
      expect(() => withGitDiscoveryConfinedTo(snapshot, async () => undefined)).toThrow(
        /synchronous scan/,
      );
      execGit(['rev-parse', 'HEAD'], { cwd: snapshot });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }

    expect(environmentOfCall(0)).not.toHaveProperty('GIT_CEILING_DIRECTORIES');
    expect(environmentOfCall(1)?.GIT_CEILING_DIRECTORIES).toBe(parent);
    expect(environmentOfCall(2)).not.toHaveProperty('GIT_CEILING_DIRECTORIES');
    expect(environmentOfCall(3)).not.toHaveProperty('GIT_CEILING_DIRECTORIES');
  });

  it('allows a smaller per-operation output ceiling', () => {
    execFileSyncMock.mockReturnValue('blob');

    expect(
      execGit(['show', 'HEAD:small.txt'], { cwd: '/repo', maxBufferBytes: 512_000 }),
    ).toEqual({ ok: true, stdout: 'blob' });
    expect(execFileSyncMock.mock.calls[0]?.[2]).toMatchObject({ maxBuffer: 512_000 });
    expect(describeGitFailure('buffer_exceeded', 'historical blob read', 512_000)).toBe(
      'Cejel: local git historical blob read exceeded the 500 KiB output limit.',
    );
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

  // #560: Node's error message repeats the command line, which carries repository paths. Only the
  // error code, the signal and git's own diagnostic lines may decide the class.
  it('never classifies from the command line or from a quoted repository path', () => {
    const failWith = (message: string, stderr: string) => {
      execFileSyncMock.mockImplementationOnce(() => {
        throw Object.assign(new Error(message), { status: 128, stderr });
      });
      return execGit(['show', 'abc123:secrets/x.txt'], { cwd: '/repo' });
    };
    const missingObject = 'fatal: unable to read 0123456789abcdef0123456789abcdef01234567\n';
    for (const name of [
      'not a git repository.txt',
      'timeout.txt',
      'timed out.txt',
      'maxBuffer.txt',
      'ENOBUFS.txt',
      'ETIMEDOUT.txt',
    ]) {
      expect(
        failWith(`Command failed: git show abc123:secrets/${name}\n${missingObject}`, missingObject),
        name,
      ).toEqual({ ok: false, reason: 'exec_failed', exitCode: 128 });
    }
    // A repository path quoted inside one of git's own diagnostics cannot match either.
    expect(
      failWith('fatal', "fatal: path 'secrets/not a git repository' does not exist in 'abc123'\n"),
    ).toEqual({ ok: false, reason: 'exec_failed', exitCode: 128 });
    expect(failWith('fatal', "fatal: invalid object name 'x: not inside a work tree'.\n")).toEqual({
      ok: false,
      reason: 'exec_failed',
      exitCode: 128,
    });
    // git's own no-repository and no-revision diagnostics still classify as before.
    for (const stderr of [
      'fatal: not a git repository (or any of the parent directories): .git\n',
      "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n",
      "fatal: your current branch 'main' does not have any commits yet\n",
      'fatal: Needed a single revision\n',
      'fatal: not in a git directory\n',
    ]) {
      expect(failWith('fatal', stderr), stderr).toEqual({
        ok: false,
        reason: 'not_a_repo',
        exitCode: 128,
      });
    }
    // A timeout and an output limit are known by their codes and signal only.
    execFileSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT', signal: 'SIGTERM' });
    });
    expect(execGit(['log'], { cwd: '/repo' })).toEqual({ ok: false, reason: 'timeout' });
    execFileSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('spawnSync git ENOBUFS'), { code: 'ENOBUFS', signal: 'SIGTERM' });
    });
    expect(execGit(['log'], { cwd: '/repo' })).toEqual({ ok: false, reason: 'buffer_exceeded' });
    // A SIGTERM Cejel did not send (no ETIMEDOUT) is a failed read, not Cejel's timeout.
    execFileSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('Command failed: git log'), { signal: 'SIGTERM', status: null });
    });
    expect(execGit(['log'], { cwd: '/repo' })).toEqual({ ok: false, reason: 'exec_failed' });
  });
});
