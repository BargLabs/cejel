'use strict';

// Experiment-only compatibility adapter for the final v1.9 detector. The v1.9
// executable used a small set of read-only local Git commands without the v3
// hardening prefix. This adapter is loaded *after* no-egress-hook.cjs. It accepts
// only those historical argv shapes, rewrites them through v3's exact hardened
// local-Git boundary, and leaves every other child-process call denied.

const { appendFileSync, realpathSync } = require('node:fs');
const { isAbsolute, relative, sep } = require('node:path');
const childProcess = require('node:child_process');
const {
  HARDENED_GIT_ARGUMENTS,
  SURFACE_DESCRIPTORS,
  isAllowedGitExecFileSyncCall,
} = require('./no-egress-policy.cjs');

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

const auditLog = process.env.CEJEL_NO_EGRESS_AUDIT_LOG || null;
const scanRoot = process.env.CEJEL_HISTORICAL_SCAN_ROOT || null;
const deniedExecFileSync = childProcess.execFileSync;

function audit(event) {
  if (!auditLog) return;
  appendFileSync(auditLog, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function isWithin(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function exactArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function safeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && value.indexOf('\0') === -1 &&
    !isAbsolute(value) && !value.split(/[\\/]/).includes('..');
}

function isCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

function historicalGitSubcommand(args, options) {
  if (!Array.isArray(args) || !options || typeof options !== 'object' || Array.isArray(options)) {
    return null;
  }
  const allowedOptionKeys = new Set(['cwd', 'encoding', 'input', 'maxBuffer', 'stdio']);
  if (Object.keys(options).some((key) => !allowedOptionKeys.has(key))) return null;
  if (options.encoding !== 'utf8') return null;
  const ignoresInput = exactArray(options.stdio, ['ignore', 'pipe', 'ignore']);
  const pipesInput = exactArray(options.stdio, ['pipe', 'pipe', 'ignore']);
  if (!ignoresInput && !pipesInput) return null;
  if (!scanRoot || typeof options.cwd !== 'string') return null;

  let root;
  let cwd;
  try {
    root = realpathSync(scanRoot);
    cwd = realpathSync(options.cwd);
  } catch {
    return null;
  }
  if (cwd !== root || !isWithin(root, cwd)) return null;

  const noInput = options.input === undefined;
  const noBufferOverride = options.maxBuffer === undefined;
  const [subcommand, ...rest] = args;
  if (subcommand === 'rev-parse' && ignoresInput && noInput && noBufferOverride && (
    exactArray(rest, ['--is-inside-work-tree']) ||
    exactArray(rest, ['--show-toplevel']) ||
    exactArray(rest, ['HEAD'])
  )) return subcommand;
  if (subcommand === 'ls-files' && ignoresInput && noInput && noBufferOverride && exactArray(rest, ['--cached'])) {
    return subcommand;
  }
  if (subcommand === 'rev-list' && ignoresInput && noInput && noBufferOverride && exactArray(rest, ['HEAD'])) {
    return subcommand;
  }
  if (
    subcommand === 'diff-tree' &&
    pipesInput &&
    exactArray(rest, [
      '--stdin', '--root', '--name-only', '-r', '--diff-filter=AM', '--pretty=format:commit:%H',
    ]) &&
    typeof options.input === 'string' &&
    options.input.split(/\r?\n/).filter(Boolean).every(isCommit) &&
    noBufferOverride
  ) return subcommand;
  if (subcommand === 'show' && ignoresInput && rest.length === 1 && noInput && options.maxBuffer === 512_000) {
    const separator = rest[0].indexOf(':');
    if (separator === 40 && isCommit(rest[0].slice(0, separator)) && safeRelativePath(rest[0].slice(separator + 1))) {
      return subcommand;
    }
  }
  if (subcommand === 'log' && ignoresInput && noInput) {
    if (noBufferOverride && exactArray(rest, ['HEAD', '--diff-filter=D', '--name-status', '--format=commit:%H'])) {
      return subcommand;
    }
    if (noBufferOverride && exactArray(rest, ['--max-count=12', '--format=%H%x00%s'])) {
      return subcommand;
    }
    if (options.maxBuffer === 512_000 && exactArray(rest, ['HEAD', '--diff-filter=AM', '--name-only', '--format='])) {
      return subcommand;
    }
    if (
      noBufferOverride && rest.length === 5 &&
      exactArray(rest.slice(0, 4), ['HEAD', '--diff-filter=AM', '--format=%H', '--']) &&
      safeRelativePath(rest[4])
    ) return subcommand;
  }
  return null;
}

function hardenedEnvironment() {
  const environment = {};
  for (const key of ['HOME', 'PATH', 'TZ']) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  Object.assign(environment, REQUIRED_GIT_ENVIRONMENT);
  Object.assign(environment, {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: process.cwd(),
  });
  return environment;
}

childProcess.execFileSync = function adaptedExecFileSync(file, args, options) {
  if (isAllowedGitExecFileSyncCall(file, args, options)) {
    return Reflect.apply(deniedExecFileSync, this, [file, args, options]);
  }
  const subcommand = file === 'git' ? historicalGitSubcommand(args, options) : null;
  if (!subcommand) {
    audit({ kind: 'denied_surface', surface: 'child_process.execFileSync' });
    return Reflect.apply(deniedExecFileSync, this, [file, args, options]);
  }
  audit({ kind: 'historical_git_translated', subcommand });
  const hardenedOptions = {
    ...options,
    env: hardenedEnvironment(),
    timeout: 30_000,
  };
  return Reflect.apply(deniedExecFileSync, this, [
    'git',
    [...HARDENED_GIT_ARGUMENTS, ...args],
    hardenedOptions,
  ]);
};

const wrappedFunctions = new WeakSet();
for (const descriptor of SURFACE_DESCRIPTORS) {
  if (descriptor.id === 'child_process.execFileSync') continue;
  const denied = descriptor.target[descriptor.method];
  if (typeof denied !== 'function' || wrappedFunctions.has(denied)) continue;
  const audited = function auditedDeniedSurface(...args) {
    audit({ kind: 'denied_surface', surface: descriptor.id });
    return Reflect.apply(denied, this, args);
  };
  wrappedFunctions.add(audited);
  descriptor.target[descriptor.method] = audited;
}

audit({ kind: 'adapter_loaded' });
