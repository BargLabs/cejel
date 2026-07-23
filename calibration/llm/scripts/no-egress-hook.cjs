'use strict';

const deny = (surface) => {
  throw new Error(`Cejel calibration no-egress policy denied ${surface}`);
};

const net = require('node:net');
net.connect = () => deny('net.connect');
net.createConnection = () => deny('net.createConnection');
net.Socket.prototype.connect = () => deny('net.Socket.connect');

for (const name of ['node:http', 'node:https', 'node:http2']) {
  const module = require(name);
  if (module.request) module.request = () => deny(`${name}.request`);
  if (module.get) module.get = () => deny(`${name}.get`);
  if (module.connect) module.connect = () => deny(`${name}.connect`);
}

const dns = require('node:dns');
for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  dns[method] = () => deny(`dns.${method}`);
}

const tls = require('node:tls');
tls.connect = () => deny('tls.connect');

const dgram = require('node:dgram');
dgram.createSocket = () => deny('dgram.createSocket');

const childProcess = require('node:child_process');
for (const method of ['exec', 'execFile', 'fork', 'spawn']) {
  childProcess[method] = () => deny(`child_process.${method}`);
}

globalThis.fetch = () => deny('fetch');
