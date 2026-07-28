import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  assertCanonicalRepositoryReference,
  isolatedGitEnvironment,
  withIsolatedGitEnvironment,
  withHttpsOnlyGitTransport,
} from './git-transport-policy.mjs';

const execFile = promisify(execFileCallback);

test('canonical repository reference accepts the exact GitHub HTTPS identity', () => {
  assert.equal(
    assertCanonicalRepositoryReference({
      repository_id: 'owner/repo',
      url: 'https://github.com/owner/repo',
    }),
    'https://github.com/owner/repo',
  );
});

test('Git transport arguments deny every protocol except HTTPS and disable credential helpers', () => {
  assert.deepEqual(
    withHttpsOnlyGitTransport(['ls-remote', 'https://github.com/owner/repo']),
    [
      '-c',
      'protocol.allow=never',
      '-c',
      'protocol.https.allow=always',
      '-c',
      'credential.helper=',
      '-c',
      'core.askPass=/usr/bin/false',
      'ls-remote',
      'https://github.com/owner/repo',
    ],
  );
});

test('Git transport environment removes injected helpers and non-process configuration', () => {
  const environment = isolatedGitEnvironment({
    PATH: '/usr/bin',
    HOME: '/tmp/ambient-home',
    NETRC: '/tmp/ambient-netrc',
    GIT_ALLOW_PROTOCOL: 'ext:file:ssh:https',
    GIT_ASKPASS: '/tmp/askpass',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '/tmp/helper',
    GIT_CONFIG_PARAMETERS: "'protocol.ext.allow=always'",
    GIT_CONFIG_SYSTEM: '/tmp/system-config',
    GIT_EXEC_PATH: '/tmp/git-exec',
    GIT_PROXY_COMMAND: '/tmp/proxy',
    GIT_SSH: '/tmp/ssh',
    GIT_SSH_COMMAND: '/tmp/ssh-command',
    SSH_ASKPASS: '/tmp/ssh-askpass',
    SSH_AUTH_SOCK: '/tmp/agent',
  }, '/tmp/isolated-home');

  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.HOME, '/tmp/isolated-home');
  assert.equal(environment.NETRC, undefined);
  assert.equal(environment.GIT_ALLOW_PROTOCOL, 'https');
  assert.equal(environment.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(environment.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(environment.GIT_CONFIG_SYSTEM, '/dev/null');
  assert.equal(environment.GIT_LFS_SKIP_SMUDGE, '1');
  assert.equal(environment.GIT_TERMINAL_PROMPT, '0');
  assert.equal(environment.GCM_INTERACTIVE, 'Never');
  assert.equal(environment.GIT_ASKPASS, '/usr/bin/false');
  assert.equal(environment.GIT_PROXY_COMMAND, '/usr/bin/false');
  assert.equal(environment.GIT_SSH_COMMAND, '/usr/bin/false');
  assert.equal(environment.SSH_ASKPASS, '/usr/bin/false');
  for (const key of [
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
    'GIT_CONFIG_PARAMETERS',
    'GIT_EXEC_PATH',
    'GIT_SSH',
    'SSH_AUTH_SOCK',
  ]) {
    assert.equal(environment[key], undefined);
  }
});

test('Git transport environment uses and removes a fresh per-invocation home', async () => {
  let isolatedHome;
  await withIsolatedGitEnvironment(process.env, async (environment) => {
    isolatedHome = environment.HOME;
    assert.equal(existsSync(isolatedHome), true);
  });
  assert.equal(existsSync(isolatedHome), false);
});

test('the real Git process refuses file transport under the shared HTTPS-only policy', async () => {
  await assert.rejects(
    () => withIsolatedGitEnvironment(
      process.env,
      (environment) => execFile(
        'git',
        withHttpsOnlyGitTransport(['ls-remote', 'file:///tmp/x']),
        { env: environment },
      ),
    ),
    /transport 'file' not allowed/,
  );
});
