import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hashManifest, hashRepositoryEntry } from './freeze-cohorts.mjs';
import {
  createDetectorFreezeRecord,
  validateDetectorFreezeRecord,
  validateGoldenCorrectionLedger,
} from './freeze-detector.mjs';
import {
  assertCohortRunAllowed,
  assertSeparatedRoots,
  buildScanInvocation,
  main as runCohortMain,
  runFrozenRepository,
  validateImmutableManifest,
} from './run-frozen-cohort.mjs';

const BUILD_SHA = 'b'.repeat(64);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);

function ledger() {
  return {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    status: 'frozen',
    detector_build_sha256: BUILD_SHA,
    golden_manifest_sha256: 'a'.repeat(64),
    frozen_at: '2026-07-22T20:00:00Z',
    frozen_before_untouched: true,
    reviewed_by: ['Alice Example', 'Bob Example'],
    open_corrections: 0,
    entries: [],
  };
}

function detectorFreeze() {
  const goldenLedger = validateGoldenCorrectionLedger(ledger(), BUILD_SHA);
  return createDetectorFreezeRecord({
    gitCommit: COMMIT_SHA,
    buildSha256: BUILD_SHA,
    artifactName: 'cejel',
    frozenAt: '2026-07-22T21:00:00Z',
    runtime: { name: 'node', version: 'v24.0.0', platform: 'linux', architecture: 'x64' },
    networkIsolation: {
      mode: 'test-no-egress',
      argvPrefix: ['/usr/local/bin/no-egress'],
      evidenceReference: 'internal-witness:test-isolation',
      confirmed: true,
    },
    ledger: goldenLedger,
    ledgerSha256: 'e'.repeat(64),
  });
}

function immutableManifest(cohort = 'untouched') {
  const withoutEntryHash = {
    repository_id: 'owner/repository',
    url: 'https://github.com/owner/repository',
    default_branch_observed: 'main',
    commit_sha: COMMIT_SHA,
    git_tree_sha: TREE_SHA,
    license_spdx: 'MIT',
    primary_language: 'typescript_javascript',
    primary_surface: 'agent_tools',
    provider_surface: 'openai',
    inclusion_reason: 'Synthetic unit-test repository entry only.',
    source_available_at_freeze: true,
  };
  const repository = {
    ...withoutEntryHash,
    entry_sha256: hashRepositoryEntry(withoutEntryHash),
  };
  const withoutManifestHash = {
    schema_version: '1.0.0',
    protocol_id: 'cejel-llm-calibration-v1',
    policy_id: 'llm-selection-v1',
    cohort,
    status: 'frozen',
    frozen_at: '2026-07-22T19:00:00Z',
    frozen_by: ['Alice Example', 'Bob Example'],
    detector_results_seen_before_freeze: false,
    hash_contract: 'rfc8785-sha256-v1; entry excludes entry_sha256; manifest excludes manifest_sha256 and attestation',
    repositories: [repository],
  };
  return {
    ...withoutManifestHash,
    manifest_sha256: hashManifest(withoutManifestHash),
    attestation: { method: 'internal_witness', reference: 'internal-witness:test' },
  };
}

test('detector freeze binds build, runtime, rules, support, isolation, and closed golden ledger', () => {
  const record = detectorFreeze();
  assert.equal(validateDetectorFreezeRecord(record), record);
  assert.equal(record.rule_ids.length, 8);
  assert.equal(record.support_matrix.python.status, 'narrow_fixture_backed_alpha');
  assert.equal(record.golden_correction_ledger.open_corrections, 0);
  assert.throws(
    () => validateDetectorFreezeRecord({ ...record, frozen_at: '2026-07-23T00:00:00Z' }),
    /SHA-256/,
  );
});

test('golden correction ledger must match the exact detector build and have no open corrections', () => {
  assert.throws(() => validateGoldenCorrectionLedger(ledger(), 'f'.repeat(64)), /not bound/);
  assert.throws(
    () => validateGoldenCorrectionLedger({ ...ledger(), open_corrections: 1 }, BUILD_SHA),
    /zero open/,
  );
});

test('untouched execution requires both a valid detector freeze and explicit post-freeze confirmation', () => {
  const record = detectorFreeze();
  assert.throws(() => assertCohortRunAllowed('untouched', null, true), /detector-freeze/);
  assert.throws(() => assertCohortRunAllowed('untouched', record, false), /confirm-untouched/);
  assert.doesNotThrow(() => assertCohortRunAllowed('untouched', record, true));
  assert.doesNotThrow(() => assertCohortRunAllowed('golden', null, false));
});

test('runner CLI refuses untouched before any clone when detector freeze is absent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-llm-refusal-test-'));
  const manifestPath = join(root, 'untouched-manifest.json');
  const cejelPath = join(root, 'cejel');
  writeFileSync(manifestPath, `${JSON.stringify(immutableManifest())}\n`, 'utf8');
  writeFileSync(cejelPath, '# synthetic local build\n', 'utf8');
  const commands = [];

  await assert.rejects(
    () => runCohortMain([
      '--manifest', manifestPath,
      '--cejel', cejelPath,
      '--work-root', join(root, 'work'),
      '--output-root', join(root, 'output'),
    ], async (command, args) => {
      commands.push([command, args]);
      return '';
    }),
    /detector-freeze/,
  );
  assert.deepEqual(commands, []);
});

test('immutable manifest validation rejects mutable or tampered repository identities', () => {
  const manifest = immutableManifest();
  assert.equal(validateImmutableManifest(manifest), manifest);
  assert.throws(
    () => validateImmutableManifest({ ...manifest, repositories: [{ ...manifest.repositories[0], commit_sha: 'main' }] }),
    /manifest SHA-256|immutable/,
  );
});

test('scan invocation preserves argv boundaries and output roots cannot contain source roots', () => {
  assert.deepEqual(
    buildScanInvocation(['/usr/bin/no-egress', '--'], '/opt/cejel', '/work/repo', '/results/repo'),
    {
      command: '/usr/bin/no-egress',
      args: ['--', '/opt/cejel', 'scan', '/work/repo', '--out', '/results/repo', '--pack', 'llm', '--quiet'],
    },
  );
  assert.throws(() => assertSeparatedRoots('/tmp/work', '/tmp/work/results'), /separate/);
  assert.doesNotThrow(() => assertSeparatedRoots('/tmp/work-a', '/tmp/results-b'));
});

test('repository runner checks out and verifies only manifest commit/tree before isolated scan', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-llm-runner-test-'));
  const workRoot = join(root, 'work');
  const outputRoot = join(root, 'output');
  const commands = [];
  const commandRunner = async (command, args) => {
    commands.push([command, args]);
    if (command === 'git' && args[0] === 'clone') {
      mkdirSync(args.at(-1), { recursive: true });
      return '';
    }
    if (command === 'git' && args.at(-1) === 'HEAD') return COMMIT_SHA;
    if (command === 'git' && args.at(-1) === 'HEAD^{tree}') return TREE_SHA;
    if (command === '/usr/bin/no-egress') {
      const outputIndex = args.indexOf('--out');
      mkdirSync(args[outputIndex + 1], { recursive: true });
    }
    return '';
  };
  const repository = immutableManifest().repositories[0];
  const result = await runFrozenRepository({
    cohort: 'untouched',
    repository,
    cejel: '/opt/cejel',
    workRoot,
    outputRoot,
    isolationPrefix: ['/usr/bin/no-egress', '--'],
    networkIsolationMode: 'test-no-egress',
    detectorBuildSha256: BUILD_SHA,
    detectorFreezeSha256: detectorFreeze().record_sha256,
  }, commandRunner);

  assert.equal(result.receipt.commit_sha, COMMIT_SHA);
  assert.equal(result.receipt.git_tree_sha, TREE_SHA);
  assert.equal(result.receipt.output_outside_source, true);
  assert.deepEqual(commands[0], [
    'git',
    ['clone', '--no-checkout', 'https://github.com/owner/repository', result.source],
  ]);
  assert.ok(commands.some(([command, args]) => command === 'git' && args.includes('--detach') && args.includes(COMMIT_SHA)));
  assert.ok(commands.some(([command]) => command === '/usr/bin/no-egress'));
});
