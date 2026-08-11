import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareHistoricalReport,
  deriveDisposition,
  differingPointers,
  normalizeHistoricalReport,
  validateAuditEvents,
  validateBindings,
  validateProbe,
} from './v1-9-v3-cross-policy-audit.mjs';

const wrapper = fileURLToPath(new URL('./v1-9-v3-cross-policy-wrapper.sh', import.meta.url));
const probe = fileURLToPath(new URL('./no-egress-probe.mjs', import.meta.url));
const bindingsPath = fileURLToPath(new URL(
  '../../../docs/experiments/llm-v1-9-v3-cross-policy-audit-2026-08-10/bindings.json',
  import.meta.url,
));

function sampleReport(overrides = {}) {
  return {
    schemaVersion: 'cejel-free-llm-artifact-v1',
    generatedAt: '2026-07-25T00:00:00.000Z',
    repo: { path: '/old/checkout', headSha: 'a'.repeat(40) },
    baseReportSha256: 'b'.repeat(64),
    inputSourceSha256: 'c'.repeat(64),
    lineage: { toolVersion: '0.1.8' },
    result: { findings: [], ruleResults: [] },
    assurance: { status: 'unsigned' },
    claimBoundary: 'bounded',
    ...overrides,
  };
}

test('bindings are exact for the frozen runtime and declared v3 surface', () => {
  const bindings = JSON.parse(readFileSync(bindingsPath, 'utf8'));
  assert.equal(validateBindings(bindings), bindings);
  assert.throws(
    () => validateBindings({ ...bindings, runtime: { ...bindings.runtime, node: 'v0.0.0' } }),
    /bindings are invalid/,
  );
});

test('normalization deletes only the three preregistered run-environment fields', () => {
  const report = sampleReport();
  assert.deepEqual(normalizeHistoricalReport(report), {
    schemaVersion: report.schemaVersion,
    repo: { headSha: report.repo.headSha },
    inputSourceSha256: report.inputSourceSha256,
    lineage: report.lineage,
    result: report.result,
    assurance: report.assurance,
    claimBoundary: report.claimBoundary,
  });
  const incomplete = { ...report };
  delete incomplete.baseReportSha256;
  assert.throws(
    () => normalizeHistoricalReport(incomplete),
    /lacks a preregistered/,
  );
});

test('comparison ignores only time, checkout path, and derived base-report digest', () => {
  const expected = sampleReport();
  const environmentOnly = sampleReport({
    generatedAt: '2026-08-10T00:00:00.000Z',
    repo: { path: '/new/checkout', headSha: expected.repo.headSha },
    baseReportSha256: 'd'.repeat(64),
  });
  assert.equal(compareHistoricalReport(expected, environmentOnly).normalized_match, true);
  const changed = structuredClone(environmentOnly);
  changed.result.findings.push({ ruleId: 'LLM-PRV-001' });
  const comparison = compareHistoricalReport(expected, changed);
  assert.equal(comparison.normalized_match, false);
  assert.deepEqual(comparison.differing_json_pointers, ['/result/findings/0']);
});

test('JSON pointer differences are deterministic and escaped', () => {
  assert.deepEqual(
    differingPointers({ 'a/b': 1, x: [1, 2] }, { 'a/b': 2, x: [1] }),
    ['/a~1b', '/x/1'],
  );
});

test('disposition remains bounded by match, denied events, and instrument state', () => {
  const rows = Array.from({ length: 24 }, (_, index) => ({
    repository_id: `owner/repo-${index}`,
    normalized_match: true,
    audit: { denied_surfaces: [] },
  }));
  assert.equal(deriveDisposition(rows), 'MATCH_NO_DENIED_SURFACE_ATTEMPTS');
  rows[0].audit.denied_surfaces.push('globalThis.fetch');
  assert.equal(deriveDisposition(rows), 'MATCH_WITH_DENIED_SURFACE_ATTEMPTS');
  rows[0].normalized_match = false;
  assert.equal(deriveDisposition(rows), 'DIFFERENCE');
  assert.equal(deriveDisposition(rows, 'broken audit'), 'INSTRUMENT_FAILURE');
});

test('audit-event validation accepts only bounded metadata', () => {
  const valid = Buffer.from([
    JSON.stringify({ kind: 'adapter_loaded' }),
    JSON.stringify({ kind: 'historical_git_translated', subcommand: 'rev-parse' }),
    JSON.stringify({ kind: 'denied_surface', surface: 'globalThis.fetch' }),
    '',
  ].join('\n'));
  assert.deepEqual(validateAuditEvents(valid), {
    event_count: 3,
    adapter_loaded: true,
    historical_git_calls: 1,
    historical_git_subcommands: ['rev-parse'],
    denied_surfaces: ['globalThis.fetch'],
  });
  assert.throws(
    () => validateAuditEvents(Buffer.from(`${JSON.stringify({ kind: 'adapter_loaded', path: '/secret' })}\n`)),
    /invalid event/,
  );
});

test('experiment wrapper preserves the exact v3 probe contract', () => {
  const result = spawnSync('sh', [wrapper, probe], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotThrow(() => validateProbe(JSON.parse(result.stdout)));
});

test('historical read-only Git is translated while unknown process and DNS paths stay denied', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-v19-v3-adapter-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'synthetic@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Synthetic'], { cwd: root });
  writeFileSync(join(root, 'tracked.txt'), 'synthetic\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'synthetic'], { cwd: root });
  const script = join(root, 'exercise.cjs');
  const audit = join(root, 'audit.jsonl');
  writeFileSync(script, String.raw`
    const cp = require('node:child_process');
    const dns = require('node:dns');
    const cwd = process.env.CEJEL_HISTORICAL_SCAN_ROOT;
    const ignored = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    const head = cp.execFileSync('git', ['rev-parse', 'HEAD'], ignored).trim();
    cp.execFileSync('git', ['rev-parse', '--is-inside-work-tree'], ignored);
    cp.execFileSync('git', ['rev-parse', '--show-toplevel'], ignored);
    cp.execFileSync('git', ['ls-files', '--cached'], ignored);
    const commits = cp.execFileSync('git', ['rev-list', 'HEAD'], ignored);
    cp.execFileSync('git', ['diff-tree', '--stdin', '--root', '--name-only', '-r', '--diff-filter=AM', '--pretty=format:commit:%H'], { ...ignored, input: commits, stdio: ['pipe', 'pipe', 'ignore'] });
    cp.execFileSync('git', ['show', head + ':tracked.txt'], { ...ignored, maxBuffer: 512000 });
    cp.execFileSync('git', ['log', 'HEAD', '--diff-filter=D', '--name-status', '--format=commit:%H'], ignored);
    cp.execFileSync('git', ['log', '--max-count=12', '--format=%H%x00%s'], ignored);
    cp.execFileSync('git', ['log', 'HEAD', '--diff-filter=AM', '--name-only', '--format='], { ...ignored, maxBuffer: 512000 });
    cp.execFileSync('git', ['log', 'HEAD', '--diff-filter=AM', '--format=%H', '--', 'tracked.txt'], ignored);
    let processDenied = false;
    try { cp.execFileSync('git', ['status'], ignored); } catch (error) { processDenied = /no-egress policy denied/.test(error.message); }
    let dnsDenied = false;
    try { new dns.Resolver().resolve4('example.com', () => {}); } catch (error) { dnsDenied = /no-egress policy denied/.test(error.message); }
    if (!processDenied || !dnsDenied) process.exit(9);
  `);
  const environment = {
    ...process.env,
    CEJEL_HISTORICAL_SCAN_ROOT: root,
    CEJEL_NO_EGRESS_AUDIT_LOG: audit,
  };
  delete environment.NODE_OPTIONS;
  const result = spawnSync('sh', [wrapper, process.execPath, script], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const events = validateAuditEvents(readFileSync(audit));
  assert.equal(events.historical_git_calls, 11);
  assert.deepEqual(events.historical_git_subcommands, [
    'diff-tree', 'log', 'ls-files', 'rev-list', 'rev-parse', 'show',
  ]);
  assert.ok(events.denied_surfaces.includes('child_process.execFileSync'));
  assert.ok(events.denied_surfaces.some((surface) => surface.includes('Resolver.prototype.resolve4')));
});

test('historical Git translation refuses a different scan root', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-v19-v3-root-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const actual = join(root, 'actual');
  const declared = join(root, 'declared');
  mkdirSync(actual);
  mkdirSync(declared);
  execFileSync('git', ['init', '--quiet'], { cwd: actual });
  const script = join(root, 'wrong-root.cjs');
  const audit = join(root, 'audit.jsonl');
  writeFileSync(script, `
    const { execFileSync } = require('node:child_process');
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: ${JSON.stringify(actual)}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
      });
      process.exit(9);
    } catch (error) {
      if (!/no-egress policy denied/.test(error.message)) process.exit(8);
    }
  `);
  const environment = {
    ...process.env,
    CEJEL_HISTORICAL_SCAN_ROOT: declared,
    CEJEL_NO_EGRESS_AUDIT_LOG: audit,
  };
  delete environment.NODE_OPTIONS;
  const result = spawnSync('sh', [wrapper, process.execPath, script], { env: environment, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(validateAuditEvents(readFileSync(audit)).denied_surfaces, [
    'child_process.execFileSync',
  ]);
});
