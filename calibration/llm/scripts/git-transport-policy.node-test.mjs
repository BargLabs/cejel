import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  assertCanonicalRepositoryReference,
  isolatedGitEnvironment,
  withIsolatedGitEnvironment,
  withHttpsOnlyGitTransport,
} from './git-transport-policy.mjs';

const execFile = promisify(execFileCallback);
const CANARY_SERVER_PATH = new URL('./git-transport-policy-canary-server.mjs', import.meta.url).pathname;

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

for (const [name, url, expectedError] of [
  ['file transport', 'file:///tmp/x', /transport 'file' not allowed/],
  ['ext transport', 'ext::sh -c id', /transport 'ext' not allowed/],
  ['scp-like SSH transport', 'git@evil.example.com:owner/repo.git', /transport 'ssh' not allowed/],
  ['unknown custom scheme', 'fake://example/repo', /transport 'fake' not allowed/],
]) {
  test(`the real Git process refuses ${name} under the shared HTTPS-only policy`, async () => {
    await assert.rejects(
      () => withIsolatedGitEnvironment(
        process.env,
        (environment) => execFile(
          'git',
          withHttpsOnlyGitTransport(['ls-remote', url]),
          { env: environment },
        ),
      ),
      expectedError,
    );
  });
}

async function generateLoopbackCertificate(directory) {
  const certPath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  await execFile('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1',
  ]);
  return { certPath, keyPath };
}

function spawnCanaryServer(certPath, keyPath, mode) {
  const child = spawn(process.execPath, [CANARY_SERVER_PATH, certPath, keyPath, mode], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const requests = [];
  let resolvePort;
  const portPromise = new Promise((resolve) => { resolvePort = resolve; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === 'ready') resolvePort(message.port);
    if (message.type === 'request') requests.push(message);
  });
  return {
    requests,
    portPromise,
    close() {
      lines.close();
      child.kill('SIGTERM');
    },
  };
}

// Runs `run` against one loopback TLS server. The server is a separate OS process from this test
// process: sharing an event loop between an in-process HTTPS server and a blocking Git invocation
// can deadlock and silently yield zero observed requests, making the canary vacuously pass.
async function withCanaryServer(mode, run) {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-git-canary-'));
  try {
    const { certPath } = await generateLoopbackCertificate(directory);
    const keyPath = join(directory, 'key.pem');
    const server = spawnCanaryServer(certPath, keyPath, mode);
    try {
      const port = await server.portPromise;
      return await run({ port, certPath, requests: server.requests });
    } finally {
      server.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a real HTTPS clone/ls-remote through the hardened helper still succeeds against a legitimate endpoint', async () => {
  await withCanaryServer('advertise', async ({ port, certPath, requests }) => {
    await withIsolatedGitEnvironment(
      process.env,
      (environment) => execFile('git', withHttpsOnlyGitTransport([
        '-c', `http.sslCAInfo=${certPath}`,
        'ls-remote', `https://127.0.0.1:${port}/owner/repo.git`,
      ]), { env: environment }),
    );
    assert.ok(requests.length > 0, 'the legitimate endpoint must have observed the request');
    assert.equal(requests[0].authHeader, null);
  });
});

test('ambient .netrc credentials never reach a hostile HTTPS Basic-challenge endpoint through the hardened helper', async () => {
  await withCanaryServer('basic-challenge', async ({ port, certPath, requests }) => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'cejel-fake-home-'));
    try {
      writeFileSync(
        join(fakeHome, '.netrc'),
        'machine 127.0.0.1\nlogin canary-user\npassword canary-secret\n',
        { mode: 0o600 },
      );
      await assert.rejects(() => withIsolatedGitEnvironment(
        { ...process.env, HOME: fakeHome },
        (environment) => execFile('git', withHttpsOnlyGitTransport([
          '-c', `http.sslCAInfo=${certPath}`,
          'ls-remote', `https://127.0.0.1:${port}/owner/repo.git`,
        ]), { env: environment }),
      ));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
    assert.ok(
      requests.length > 0,
      'the loopback endpoint must have observed at least one request for this canary to be meaningful',
    );
    for (const request of requests) {
      assert.equal(request.authHeader, null);
    }
  });
});

test('positive control: an unhardened Git process leaks the ambient .netrc Basic credential (proves the canary detects real leakage)', async () => {
  await withCanaryServer('basic-challenge', async ({ port, certPath, requests }) => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'cejel-fake-home-'));
    const expectedAuthHeader = `Basic ${Buffer.from('canary-user:canary-secret').toString('base64')}`;
    try {
      writeFileSync(
        join(fakeHome, '.netrc'),
        'machine 127.0.0.1\nlogin canary-user\npassword canary-secret\n',
        { mode: 0o600 },
      );
      await assert.rejects(() => execFile('git', [
        '-c', `http.sslCAInfo=${certPath}`,
        'ls-remote', `https://127.0.0.1:${port}/owner/repo.git`,
      ], { env: { ...process.env, HOME: fakeHome, GIT_TERMINAL_PROMPT: '0' } }));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
    assert.ok(requests.length > 0);
    assert.ok(
      requests.some((request) => request.authHeader === expectedAuthHeader),
      'expected the unhardened baseline to leak the ambient .netrc Basic credential; ' +
      'if it does not, this canary can no longer prove the hardened path is doing anything',
    );
  });
});

// Both loopback servers share one certificate (self-signed for 127.0.0.1, not bound to a port) so
// a single --sslCAInfo trust anchor covers whichever one the rewrite actually reaches.
async function withRewriteCanaryPair(run) {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-git-canary-pair-'));
  try {
    const { certPath, keyPath } = await generateLoopbackCertificate(directory);
    const target = spawnCanaryServer(certPath, keyPath, 'advertise');
    const attacker = spawnCanaryServer(certPath, keyPath, 'advertise');
    try {
      const [targetPort, attackerPort] = await Promise.all([target.portPromise, attacker.portPromise]);
      return await run({
        certPath,
        target: { port: targetPort, requests: target.requests },
        attacker: { port: attackerPort, requests: attacker.requests },
      });
    } finally {
      target.close();
      attacker.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a malicious ambient global Git config cannot rewrite the canonical HTTPS URL to a different remote', async () => {
  await withRewriteCanaryPair(async ({ certPath, target, attacker }) => {
    const maliciousHome = mkdtempSync(join(tmpdir(), 'cejel-malicious-gitconfig-'));
    const url = `https://127.0.0.1:${target.port}/owner/repo.git`;
    try {
      writeFileSync(join(maliciousHome, '.gitconfig'), [
        `[url "https://127.0.0.1:${attacker.port}/"]`,
        `\tinsteadOf = https://127.0.0.1:${target.port}/`,
        '',
      ].join('\n'));

      // Positive control: an unhardened Git process honors the ambient rewrite and reaches the
      // attacker's endpoint instead of the one the caller actually requested.
      await execFile('git', ['-c', `http.sslCAInfo=${certPath}`, 'ls-remote', url], {
        env: { ...process.env, HOME: maliciousHome },
      });
      assert.ok(
        attacker.requests.length > 0,
        'positive control: the unhardened baseline must reach the rewritten attacker endpoint, ' +
        'or this canary cannot prove the hardened path is doing anything',
      );

      // Hardened: GIT_CONFIG_GLOBAL/NOSYSTEM/SYSTEM isolation must ignore the ambient rewrite.
      await withIsolatedGitEnvironment(
        { ...process.env, HOME: maliciousHome },
        (environment) => execFile('git', withHttpsOnlyGitTransport([
          '-c', `http.sslCAInfo=${certPath}`,
          'ls-remote', url,
        ]), { env: environment }),
      );
    } finally {
      rmSync(maliciousHome, { recursive: true, force: true });
    }
    assert.equal(
      attacker.requests.length, 1,
      'the hardened invocation must not add any further attacker-observed requests',
    );
    assert.ok(target.requests.length > 0, 'the hardened invocation must reach the literal canonical endpoint instead');
  });
});
