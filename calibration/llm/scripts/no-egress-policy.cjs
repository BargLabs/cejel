'use strict';

const { createHash } = require('node:crypto');

const POLICY_ID = 'node-runtime-deny-hook-v3';

// This prefix must remain byte-for-byte aligned with src/witan/git-exec.ts. The runtime hook
// permits only Cejel's hardened, read-only local Git boundary; every other child process is
// denied. A source-level parity test locks the two declarations together.
const HARDENED_GIT_ARGUMENTS = Object.freeze([
  '--no-pager',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.pager=',
  '-c', 'core.editor=false',
  '-c', 'core.sshCommand=false',
  '-c', 'diff.external=false',
  '-c', 'credential.helper=',
  '-c', 'log.showSignature=false',
  '-c', 'gpg.program=false',
  '-c', 'gpg.openpgp.program=false',
  '-c', 'gpg.x509.program=false',
  '-c', 'gpg.ssh.program=false',
  '-c', 'core.quotePath=false',
  '-c', 'protocol.allow=never',
  '-c', 'protocol.ext.allow=never',
  '-c', 'protocol.file.allow=never',
  '-c', 'protocol.git.allow=never',
  '-c', 'protocol.http.allow=never',
  '-c', 'protocol.https.allow=never',
  '-c', 'protocol.ssh.allow=never',
]);

const ALLOWED_GIT_SUBCOMMANDS = Object.freeze([
  'check-ignore',
  'diff-tree',
  'log',
  'ls-files',
  'rev-list',
  'rev-parse',
  'show',
]);

const REQUIRED_GIT_ENVIRONMENT = Object.freeze({
  LANG: 'C',
  LC_ALL: 'C',
  GIT_ASKPASS: 'true',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  PAGER: 'cat',
});
const OPTIONAL_GIT_ENVIRONMENT_KEYS = new Set(['HOME', 'PATH', 'TZ']);

function callableNames(target, pattern) {
  return Object.getOwnPropertyNames(target)
    .filter((name) => name !== 'constructor' && pattern.test(name) && typeof target[name] === 'function')
    .sort();
}

function moduleDescriptors(moduleName, target, names) {
  return names.map((method) => ({ id: `${moduleName}.${method}`, target, method }));
}

function buildSurfaceDescriptors() {
  const net = require('node:net');
  const http = require('node:http');
  const https = require('node:https');
  const http2 = require('node:http2');
  const tls = require('node:tls');
  const dgram = require('node:dgram');
  const childProcess = require('node:child_process');
  const cluster = require('node:cluster');
  const workerThreads = require('node:worker_threads');
  const dns = require('node:dns');
  const dnsPromises = require('node:dns/promises');
  const dnsPattern = /^(?:lookup|resolve|reverse)/;

  const descriptors = [
    ...moduleDescriptors('net', net, ['connect', 'createConnection']),
    ...moduleDescriptors('net.Socket.prototype', net.Socket.prototype, ['connect']),
    ...moduleDescriptors('http', http, ['get', 'request']),
    ...moduleDescriptors('https', https, ['get', 'request']),
    ...moduleDescriptors('http2', http2, ['connect']),
    ...moduleDescriptors('tls', tls, ['connect']),
    ...moduleDescriptors('dgram', dgram, ['createSocket']),
    ...moduleDescriptors('child_process', childProcess, [
      'exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync',
    ]),
    ...moduleDescriptors('cluster', cluster, ['fork']),
    ...moduleDescriptors('worker_threads', workerThreads, ['Worker']),
    ...moduleDescriptors('dns', dns, callableNames(dns, dnsPattern)),
    ...moduleDescriptors('dns.promises', dns.promises, callableNames(dns.promises, dnsPattern)),
    ...moduleDescriptors('node:dns/promises', dnsPromises, callableNames(dnsPromises, dnsPattern)),
    ...moduleDescriptors(
      'dns.Resolver.prototype',
      dns.Resolver.prototype,
      callableNames(dns.Resolver.prototype, /^(?:resolve|reverse)/),
    ),
    ...moduleDescriptors(
      'node:dns/promises.Resolver.prototype',
      dnsPromises.Resolver.prototype,
      callableNames(dnsPromises.Resolver.prototype, /^(?:resolve|reverse)/),
    ),
  ];
  for (const globalName of ['fetch', 'WebSocket', 'EventSource']) {
    if (typeof globalThis[globalName] === 'function') {
      descriptors.push({ id: `globalThis.${globalName}`, target: globalThis, method: globalName });
    }
  }
  return descriptors.sort((left, right) => left.id.localeCompare(right.id));
}

const SURFACE_DESCRIPTORS = Object.freeze(buildSurfaceDescriptors());
const SURFACE_IDS = Object.freeze(SURFACE_DESCRIPTORS.map(({ id }) => id));
const SURFACE_SHA256 = createHash('sha256').update(JSON.stringify(SURFACE_IDS)).digest('hex');

function hasExactPrefix(actual, expected) {
  return actual.length >= expected.length && expected.every((value, index) => actual[index] === value);
}

function isAllowedGitExecFileSyncCall(file, args, options) {
  if (file !== 'git' || !Array.isArray(args) || !hasExactPrefix(args, HARDENED_GIT_ARGUMENTS)) {
    return false;
  }
  const gitArgs = args.slice(HARDENED_GIT_ARGUMENTS.length);
  if (!ALLOWED_GIT_SUBCOMMANDS.includes(gitArgs[0])) return false;
  if (gitArgs.some((argument) => argument === '-c' || argument.startsWith('--config-env'))) {
    return false;
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
  const environment = options.env;
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) return false;
  for (const [key, value] of Object.entries(REQUIRED_GIT_ENVIRONMENT)) {
    if (environment[key] !== value) return false;
  }
  const allowedKeys = new Set([
    ...Object.keys(REQUIRED_GIT_ENVIRONMENT),
    ...OPTIONAL_GIT_ENVIRONMENT_KEYS,
  ]);
  return Object.keys(environment).every((key) => allowedKeys.has(key));
}

module.exports = {
  ALLOWED_GIT_SUBCOMMANDS,
  HARDENED_GIT_ARGUMENTS,
  POLICY_ID,
  SURFACE_DESCRIPTORS,
  SURFACE_IDS,
  SURFACE_SHA256,
  isAllowedGitExecFileSyncCall,
};
