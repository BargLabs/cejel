#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const [digest] = process.argv.slice(2);
if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? '')) {
  throw new Error('Expected one OCI manifest digest in the form sha256:<64 lowercase hex characters>.');
}

const SERVER_PATH = new URL('../server.json', import.meta.url);
const serverManifest = JSON.parse(readFileSync(SERVER_PATH, 'utf8'));
const ociPackage = serverManifest.packages?.find((entry) => entry.registryType === 'oci');
if (!ociPackage) throw new Error('server.json must declare an OCI package.');

ociPackage.identifier = `ghcr.io/barglabs/cejel@${digest}`;
writeFileSync(SERVER_PATH, `${JSON.stringify(serverManifest, null, 2)}\n`);
process.stdout.write(`Prepared MCP Registry metadata with ${ociPackage.identifier}.\n`);
