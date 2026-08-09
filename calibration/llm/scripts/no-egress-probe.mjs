#!/usr/bin/env node

import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process';
import { promises as dnsPromises } from 'node:dns';
import { connect } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { createSocket } from 'node:dgram';

const checks = [
  () => connect(443, 'example.com'),
  () => fetch('https://example.com'),
  () => spawn('curl', ['https://example.com']),
  () => connectTls(443, 'example.com'),
  () => createSocket('udp4'),
  () => execSync(''),
  () => execFileSync(process.execPath, ['--version']),
  () => spawnSync(process.execPath, ['--version']),
  () => dnsPromises.lookup(),
  () => dnsPromises.resolve(),
  () => dnsPromises.resolve4(),
  () => dnsPromises.resolve6(),
];
let denied = 0;
for (const check of checks) {
  try {
    await check();
  } catch (error) {
    if (String(error.message).includes('Cejel calibration no-egress policy denied')) denied += 1;
  }
}
if (denied !== checks.length) throw new Error(`no-egress probe denied ${denied}/${checks.length} paths`);
console.log(JSON.stringify({ policy: 'node-runtime-deny-hook-v2', denied, attempted: checks.length }));
