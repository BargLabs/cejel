#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  POLICY_ID,
  HARDENED_GIT_ARGUMENTS,
  SURFACE_DESCRIPTORS,
  SURFACE_IDS,
  SURFACE_SHA256,
} = require('./no-egress-policy.cjs');

const gitEnvironment = {};
for (const key of ['PATH', 'HOME', 'TZ']) {
  if (process.env[key] !== undefined) gitEnvironment[key] = process.env[key];
}
Object.assign(gitEnvironment, {
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
  GIT_CONFIG_VALUE_0: process.cwd(),
});
const localGitResult = execFileSync(
  'git',
  [...HARDENED_GIT_ARGUMENTS, 'rev-parse', '--is-inside-work-tree'],
  {
    encoding: 'utf8',
    env: gitEnvironment,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  },
).trim();
if (localGitResult !== 'true') throw new Error('hardened local Git positive control failed');

const hostNoEgress = process.env.CEJEL_CALIBRATION_HOST_NO_EGRESS === '1';
if (hostNoEgress) {
  if (process.platform !== 'linux') {
    throw new Error('host no-egress probe requires the Linux container runtime');
  }
  const routes = require('node:fs').readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1);
  if (routes.some((line) => line.split(/\s+/)[1] === '00000000')) {
    throw new Error('host no-egress probe found a default network route');
  }
}

let deniedGitVariants = 0;
for (const [args, env] of [
  [[...HARDENED_GIT_ARGUMENTS, 'status'], gitEnvironment],
  [[...HARDENED_GIT_ARGUMENTS, 'rev-parse', '-c', 'protocol.https.allow=always', 'HEAD'], gitEnvironment],
  [[...HARDENED_GIT_ARGUMENTS, 'rev-parse', 'HEAD'], { ...gitEnvironment, HTTPS_PROXY: 'http://127.0.0.1:9' }],
]) {
  try {
    execFileSync('git', args, { encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    if (String(error.message).includes('Cejel calibration no-egress policy denied child_process.execFileSync')) {
      deniedGitVariants += 1;
    }
  }
}
if (deniedGitVariants !== 3) throw new Error('hardened local Git negative controls failed');

let denied = 0;
const deniedSurfaceIds = [];
for (const descriptor of SURFACE_DESCRIPTORS) {
  try {
    await descriptor.target[descriptor.method]();
  } catch (error) {
    // node:dns promises and Resolver exports can be aliases of the node:dns objects. The hook
    // therefore reports the last canonical alias installed on that shared function; invoking
    // each import path still has to reach a denial.
    if (String(error.message).includes('Cejel calibration no-egress policy denied ')) {
      denied += 1;
      deniedSurfaceIds.push(descriptor.id);
    }
  }
}
if (denied !== SURFACE_DESCRIPTORS.length) {
  throw new Error(`no-egress probe denied ${denied}/${SURFACE_DESCRIPTORS.length} paths`);
}
console.log(JSON.stringify({
  policy: POLICY_ID,
  denied,
  attempted: SURFACE_DESCRIPTORS.length,
  surface_ids: deniedSurfaceIds,
  surface_sha256: SURFACE_SHA256,
  complete_for_declared_surface: JSON.stringify(deniedSurfaceIds) === JSON.stringify(SURFACE_IDS),
  ...(hostNoEgress ? {
    host_network_isolation: 'docker-network-none',
    host_default_route_absent: true,
    host_container_image: process.env.CEJEL_CALIBRATION_NO_EGRESS_IMAGE,
  } : {}),
  allowed_local_git: true,
  denied_git_variants: deniedGitVariants,
}));
