import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isDeniedArchivePath, runCensus, walkMetadata } from './session-archive-census.mjs';

test('excludes Claude CLI cache paths without reading their files', (t) => {
  const realShape = path.join(
    os.homedir(),
    'Library/Caches/claude-cli-nodejs/session/outputs/mcp-logs-plugin-sales-gmail/log.jsonl',
  );
  assert.equal(isDeniedArchivePath(realShape), true);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'session-census-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const deniedRoot = path.join(fixture, 'Library/Caches/claude-cli-nodejs');
  const deniedFile = path.join(deniedRoot, 'session/outputs/mcp-logs-plugin-sales-gmail/log.jsonl');
  const allowedFile = path.join(fixture, 'archive/session.jsonl');
  fs.mkdirSync(path.dirname(deniedFile), { recursive: true });
  fs.mkdirSync(path.dirname(allowedFile), { recursive: true });
  fs.writeFileSync(deniedFile, 'must not be read');
  fs.writeFileSync(allowedFile, '{}\n');

  assert.equal(isDeniedArchivePath(deniedFile, [deniedRoot]), true);
  const summary = walkMetadata(fixture, { deniedRoots: [deniedRoot] });
  assert.equal(summary.files, 1);
  assert.equal(summary.jsonlFiles, 1);
  assert.equal(summary.deniedSubtreesSkipped, 1);
});

test('keeps the first 18 post-snapshot IDs in a durable boundary ledger', () => {
  const ledger = JSON.parse(
    fs.readFileSync(
      new URL('../docs/experiments/session-archive-census-post-snapshot-ids-2026-08-01.json', import.meta.url),
      'utf8',
    ),
  );
  const cutoff = new Date(ledger.frozenSnapshotCutoff);
  assert.equal(ledger.count, 18);
  assert.equal(new Set(ledger.sessions.map(({ id }) => id)).size, 18);
  assert.equal(ledger.sessions.every(({ birthtime }) => new Date(birthtime) > cutoff), true);
});

test('emits the frozen population separately from later activity', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'session-census-output-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const output = runCensus(path.join(fixture, 'census.json'), { log: false });
  assert.equal(output.frozenSnapshot.provisionalTranscriptIds, 3_542);
  assert.equal(output.frozenSnapshot.observedVisibleIdsTotal, 3_542);
  assert.equal(output.sources.some(({ stableSessionIdsAfterFrozenSnapshot }) => stableSessionIdsAfterFrozenSnapshot > 0), true);
});
