#!/usr/bin/env node

/**
 * Out-of-process loopback TLS server used only by git-transport-policy.node-test.mjs canaries.
 * It never runs in the same process as the Git subprocess it observes: an in-process HTTPS
 * server sharing an event loop with a blocking Git invocation can deadlock and yield a vacuous
 * zero-request pass, which would make the ambient-credential and rewrite canaries meaningless.
 *
 * Modes (argv[3]):
 *   advertise       - answers every request with a minimal valid empty-refs smart-HTTP
 *                      upload-pack advertisement, so `git ls-remote` succeeds.
 *   basic-challenge - answers every request with 401 + WWW-Authenticate: Basic, to observe
 *                      whether the client ever attaches an Authorization header.
 *
 * Every received request is reported on stdout as one JSON line so the parent test can assert
 * on both request count and header contents without racing the server's internal state.
 */

import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';

const [, , certPath, keyPath, mode] = process.argv;
if (!certPath || !keyPath || !['advertise', 'basic-challenge'].includes(mode)) {
  process.stderr.write('usage: git-transport-policy-canary-server.mjs <cert> <key> <advertise|basic-challenge>\n');
  process.exit(2);
}

function pktLine(text) {
  const body = Buffer.from(text, 'utf8');
  const length = body.length + 4;
  return Buffer.concat([Buffer.from(length.toString(16).padStart(4, '0'), 'ascii'), body]);
}
const FLUSH_PKT = Buffer.from('0000', 'ascii');
const EMPTY_REFS_ADVERTISEMENT = Buffer.concat([
  pktLine('# service=git-upload-pack\n'),
  FLUSH_PKT,
  pktLine(`${'0'.repeat(40)} capabilities^{}\0no-progress\n`),
  FLUSH_PKT,
]);

const server = createServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, (request, response) => {
  process.stdout.write(`${JSON.stringify({
    type: 'request',
    method: request.method,
    url: request.url,
    authHeader: request.headers.authorization || null,
  })}\n`);
  if (mode === 'basic-challenge') {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="cejel-git-transport-canary"' });
    response.end('unauthorized\n');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/x-git-upload-pack-advertisement' });
  response.end(EMPTY_REFS_ADVERTISEMENT);
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({ type: 'ready', port: server.address().port })}\n`);
});

process.on('SIGTERM', () => process.exit(0));
