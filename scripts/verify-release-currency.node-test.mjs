import assert from 'node:assert/strict';
import test from 'node:test';

import { ReleaseCurrencyError, verifyReleaseCurrency } from './verify-release-currency.mjs';

const version = '1.2.3';
const commit = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const surfaces = [
  'npm',
  'npm attestation',
  'GitHub release',
  'git tag',
  'OCI',
  'GitHub Action',
  'Homebrew tap',
  'MCP Registry',
  'cejel.dev',
  'published-versions.json',
  'leaderboard',
];

function goodReaders() {
  return {
    npm: async () => ({ version, latest: version }),
    'npm attestation': async () => ({ count: 2, predicateTypes: ['https://slsa.dev/provenance/v1'] }),
    'GitHub release': async () => ({
      tag: `v${version}`,
      draft: false,
      assets: [`cejel-v${version}-provenance.sigstore.json`],
    }),
    'git tag': async () => ({ tag: `v${version}`, commit }),
    OCI: async () => ({ digest, mediaType: 'application/vnd.oci.image.index.v1+json' }),
    'GitHub Action': async () => ({
      immutableTag: `v${version}`,
      immutableCommit: commit,
      immutableManifest: 'action.yml',
      floatingTag: 'v1',
      floatingCommit: commit,
      floatingManifest: 'action/action.yml',
    }),
    'Homebrew tap': async () => ({ versions: [version] }),
    'MCP Registry': async () => ({
      name: 'io.github.BargLabs/cejel',
      version,
      ociIdentifier: `ghcr.io/barglabs/cejel@${digest}`,
    }),
    'cejel.dev': async () => ({ currentVersion: version }),
    'published-versions.json': async () => ({ mcpRegistry: version, oci: version }),
    leaderboard: async () => ({ declaredVersion: version, pinVersion: null }),
  };
}

async function rejectedRun(readers) {
  const lines = [];
  let failure;
  try {
    await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line) });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof ReleaseCurrencyError);
  return { failure, lines };
}

function showFixture(name, result) {
  if (process.env.SHOW_FIXTURE_OUTPUT === '1') {
    process.stdout.write(`\n--- ${name} ---\n${result.lines.join('\n')}\nresult=FAIL\n`);
  }
}

test('a surface one version behind fails and names the surface', async () => {
  const readers = goodReaders();
  readers.npm = async () => ({ version, latest: '1.2.2' });
  const result = await rejectedRun(readers);
  showFixture('stale surface fixture', result);
  assert.match(result.failure.message, /npm/);
  assert.ok(result.lines.some((line) => line.includes('[FAIL] npm:') && line.includes('latest=1.2.2')));
});

test('an unreachable surface fails and names the surface and reason', async () => {
  const readers = goodReaders();
  readers['Homebrew tap'] = async () => { throw new Error('connection timed out'); };
  const result = await rejectedRun(readers);
  showFixture('unreachable surface fixture', result);
  assert.match(result.failure.message, /Homebrew tap/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] Homebrew tap: observed=<unreachable>') && line.includes('connection timed out')));
});

test('matching versions still fail when the MCP and observed OCI digests differ', async () => {
  const readers = goodReaders();
  readers['MCP Registry'] = async () => ({
    name: 'io.github.BargLabs/cejel',
    version,
    ociIdentifier: `ghcr.io/barglabs/cejel@sha256:${'c'.repeat(64)}`,
  });
  const result = await rejectedRun(readers);
  showFixture('MCP digest mismatch fixture', result);
  assert.match(result.failure.message, /MCP Registry/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] MCP Registry:') && line.includes('does not equal the observed OCI digest')));
});

test('a leaderboard declaring a stale scorer version fails and names both versions', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({ declaredVersion: '1.2.1', pinVersion: null });
  const result = await rejectedRun(readers);
  showFixture('stale leaderboard fixture', result);
  assert.match(result.failure.message, /leaderboard/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] leaderboard:') &&
    line.includes('declared=1.2.1') &&
    line.includes(`board declares scorer version 1.2.1 but the release being verified is ${version}`)));
});

test('a leaderboard pinned to a stale version without a committed pin declaration still fails', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({ declaredVersion: '1.2.1', pinVersion: '1.0.0' });
  const result = await rejectedRun(readers);
  showFixture('mismatched pin fixture', result);
  assert.match(result.failure.message, /leaderboard/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] leaderboard:') && line.includes('does not match the declared version either')));
});

test('a leaderboard with an explicit, committed pin declaration passes despite a stale scorer version', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({ declaredVersion: '1.2.1', pinVersion: '1.2.1' });
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line) });
  showFixture('committed pin fixture', { lines });
  assert.ok(lines.some((line) => line.startsWith('[PASS] leaderboard: observed=declared=1.2.1; pin=1.2.1')));
});

test('a fully consistent release passes and prints every surface and observed value', async () => {
  const lines = [];
  const result = await verifyReleaseCurrency({ version, readers: goodReaders(), write: (line) => lines.push(line) });
  if (process.env.SHOW_FIXTURE_OUTPUT === '1') {
    process.stdout.write(`\n--- consistent fixture ---\n${lines.join('\n')}\nresult=PASS\n`);
  }
  assert.equal(result.commit, commit);
  for (const surface of surfaces) {
    assert.ok(lines.some((line) => line.startsWith(`[PASS] ${surface}: observed=`)), surface);
  }
});
