#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { createSocket } from 'node:dgram';

const checks = [
  () => connect(443, 'example.com'),
  () => fetch('https://example.com'),
  () => spawn('curl', ['https://example.com']),
  () => connectTls(443, 'example.com'),
  () => createSocket('udp4'),
];
let denied = 0;
for (const check of checks) {
  try {
    check();
  } catch (error) {
    if (String(error.message).includes('Cejel calibration no-egress policy denied')) denied += 1;
  }
}
if (denied !== checks.length) throw new Error(`no-egress probe denied ${denied}/${checks.length} paths`);
console.log(JSON.stringify({ policy: 'node-runtime-deny-hook-v1', denied, attempted: checks.length }));
