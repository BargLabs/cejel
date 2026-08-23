#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OPERATOR_HOME = os.homedir();
const sources = [
  ['codex-archived', path.join(OPERATOR_HOME, '.codex', 'archived_sessions')],
  ['codex-active', path.join(OPERATOR_HOME, '.codex', 'sessions')],
  ['claude-code', path.join(OPERATOR_HOME, '.claude', 'projects')],
  ['alfred-trace', path.join(OPERATOR_HOME, '.alfred', 'trace', 'archive')],
  ['cowork-archive', path.join(OPERATOR_HOME, '.alfred', 'trace', 'cowork-archive')],
  ['cowork-live', path.join(OPERATOR_HOME, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions')],
  ['cowork-partial-141248', path.join(OPERATOR_HOME, 'Library', 'Application Support', 'Claude.partial.20260611-141248', 'local-agent-mode-sessions')],
  ['cowork-partial-142030', path.join(OPERATOR_HOME, 'Library', 'Application Support', 'Claude.partial.20260611-142030', 'local-agent-mode-sessions')],
];

function list(root) {
  if (!fs.existsSync(root)) return [];
  try {
    return execFileSync('rg', ['--files', '-uu', root, '-g', '*.jsonl'], {
      encoding: 'utf8', maxBuffer: 1024 * 1024 * 100,
    }).trim().split('\n').filter(Boolean).sort();
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

function sha256(file) {
  const digest = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024 * 4);
  try {
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      digest.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return digest.digest('hex');
}

const outputPath = process.argv[2] ?? '/tmp/session-trace-source-manifest.json';
const entries = [];
for (const [source, root] of sources) {
  for (const file of list(root)) {
    const before = fs.statSync(file);
    const fileSha256 = sha256(file);
    const after = fs.statSync(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) continue;
    entries.push({
      source,
      relativePath: path.relative(root, file),
      bytes: after.size,
      mtimeMs: Math.trunc(after.mtimeMs),
      sha256: fileSha256,
    });
  }
}
entries.sort((a, b) => `${a.source}/${a.relativePath}`.localeCompare(`${b.source}/${b.relativePath}`));
const canonical = `${entries.map((entry) => `${entry.source}\t${entry.relativePath}\t${entry.bytes}\t${entry.mtimeMs}\t${entry.sha256}`).join('\n')}\n`;
const rootSha256 = crypto.createHash('sha256').update(canonical).digest('hex');
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceRoots: Object.fromEntries(sources),
  rootSha256,
  entries,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
const bySource = {};
for (const entry of entries) {
  const bucket = bySource[entry.source] ??= { files: 0, bytes: 0, contentHashes: new Set() };
  bucket.files++;
  bucket.bytes += entry.bytes;
  bucket.contentHashes.add(entry.sha256);
}
for (const bucket of Object.values(bySource)) {
  bucket.uniqueContentHashes = bucket.contentHashes.size;
  delete bucket.contentHashes;
}
console.log(JSON.stringify({ rootSha256, files: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), bySource }, null, 2));
