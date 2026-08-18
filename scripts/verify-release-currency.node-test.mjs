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
  'changelog',
  'published-versions.json',
  'leaderboard',
];

const goodCejelDevHtml = `
<div class="cmd"><span class="dollar">$</span>pnpm dlx @cejel/cejel@${version} .</div>
<p class="sub">Also: <code>bunx @cejel/cejel@${version} .</code></p>
<p class="pill">Current &middot; v${version}</p>
`;

const goodChangelogHtml = `
<h1>What's new in Cejel</h1>
<p>Install or update any time with <code>npx @cejel/cejel@latest .</code></p>
<h2 id="v123-title">v${version}</h2>
<p>Nothing else changed.</p>
<h2 id="v121-title">v1.2.1</h2>
<p>Ship this with <code>npx @cejel/cejel .</code> against the old release.</p>
`;

const goodLeaderboardMarkdown =
  `Scorer source version: @cejel/cejel@${version}\n` +
  'Every score is produced through the same sealed public-scoring entry point used by ' +
  `\`pnpm dlx @cejel/cejel@${version} .\`.\n`;

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
    'cejel.dev': async () => ({ currentVersion: version, html: goodCejelDevHtml }),
    changelog: async () => ({ versions: [version, '1.2.1'], html: goodChangelogHtml }),
    'published-versions.json': async () => ({ mcpRegistry: version, oci: version }),
    leaderboard: async () => ({ declaredVersion: version, pinVersion: null, markdown: goodLeaderboardMarkdown }),
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
  readers.leaderboard = async () => ({ declaredVersion: '1.2.1', pinVersion: null, markdown: goodLeaderboardMarkdown });
  const result = await rejectedRun(readers);
  showFixture('stale leaderboard fixture', result);
  assert.match(result.failure.message, /leaderboard/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] leaderboard:') &&
    line.includes('declared=1.2.1') &&
    line.includes(`leaderboard declares scorer version 1.2.1 but the release being verified is ${version}`)));
});

test('a leaderboard pinned to a stale version without a committed pin declaration still fails', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({ declaredVersion: '1.2.1', pinVersion: '1.0.0', markdown: goodLeaderboardMarkdown });
  const result = await rejectedRun(readers);
  showFixture('mismatched pin fixture', result);
  assert.match(result.failure.message, /leaderboard/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] leaderboard:') && line.includes('does not match the declared scorer version either')));
});

test('a leaderboard with an explicit, committed pin declaration passes despite a stale scorer version', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({ declaredVersion: '1.2.1', pinVersion: '1.2.1', markdown: goodLeaderboardMarkdown });
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line) });
  showFixture('committed pin fixture', { lines });
  assert.ok(lines.some((line) => line.startsWith('[PASS] leaderboard: observed=declared=1.2.1; pin=1.2.1')));
});

test('a leaderboard carrying a bare npx invocation fails and names the line', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({
    declaredVersion: version,
    pinVersion: null,
    markdown: `Scorer source version: @cejel/cejel@${version}\nRun it with \`npx @cejel/cejel .\`.\n`,
  });
  const result = await rejectedRun(readers);
  showFixture('leaderboard bare invocation fixture', result);
  assert.match(result.failure.message, /leaderboard/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] leaderboard:') &&
    line.includes('unpinned invocation on line 2') &&
    line.includes('npx @cejel/cejel .')));
});

test('cejel.dev with a correctly pinned hero command passes', async () => {
  const lines = [];
  await verifyReleaseCurrency({ version, readers: goodReaders(), write: (line) => lines.push(line) });
  assert.ok(lines.some((line) => line.startsWith(`[PASS] cejel.dev: observed=rendered current version=${version}`)));
});

test('a bare npx hero command on cejel.dev fails and names the line', async () => {
  const readers = goodReaders();
  readers['cejel.dev'] = async () => ({
    currentVersion: version,
    html: `<p class="pill">Current &middot; v${version}</p>\n<div class="cmd"><span class="dollar">$</span>npx @cejel/cejel .</div>\n`,
  });
  const result = await rejectedRun(readers);
  showFixture('bare hero command fixture', result);
  assert.match(result.failure.message, /cejel\.dev/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] cejel.dev:') &&
    line.includes('unpinned hero/example invocation on line 2') &&
    line.includes('npx @cejel/cejel .')));
});

test('a changelog naming the current release with no bare invocation in its lede passes', async () => {
  const lines = [];
  await verifyReleaseCurrency({ version, readers: goodReaders(), write: (line) => lines.push(line) });
  showFixture('consistent changelog fixture', { lines });
  assert.ok(lines.some((line) =>
    line.startsWith(`[PASS] changelog: observed=newest named release=${version}`)));
});

test('a bare npx invocation inside a historical changelog entry does not fire', async () => {
  // goodChangelogHtml already carries `npx @cejel/cejel .` inside the old v1.2.1 entry, below
  // the first version heading — the fully-consistent run above passing proves it is exempt.
  const readers = goodReaders();
  readers.changelog = async () => ({ versions: [version, '1.2.1'], html: goodChangelogHtml });
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line) });
  assert.ok(lines.some((line) => line.startsWith('[PASS] changelog:')));
});

test('a bare npx invocation in the changelog lede fails and names the line', async () => {
  const readers = goodReaders();
  readers.changelog = async () => ({
    versions: [version],
    html: `<h1>What's new</h1>\n<p>Install or update any time with <code>npx @cejel/cejel .</code></p>\n<h2>v${version}</h2>\n`,
  });
  const result = await rejectedRun(readers);
  showFixture('changelog lede bare invocation fixture', result);
  assert.match(result.failure.message, /changelog/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] changelog:') &&
    line.includes('unpinned install/update invocation on line 2') &&
    line.includes('npx @cejel/cejel .')));
});

test('a changelog whose newest named release is behind the release being verified fails with both versions', async () => {
  const readers = goodReaders();
  readers.changelog = async () => ({
    versions: ['1.2.2', '1.2.1'],
    html: '<h1>What\'s new</h1>\n<p>Install or update any time with <code>npx @cejel/cejel@latest .</code></p>\n<h2>v1.2.2</h2>\n<h2>v1.2.1</h2>\n',
  });
  const result = await rejectedRun(readers);
  showFixture('stale changelog fixture', result);
  assert.match(result.failure.message, /changelog/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] changelog:') &&
    line.includes('observed=newest named release=1.2.2') &&
    line.includes(`changelog's newest named release is 1.2.2 but the release being verified is ${version}`)));
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
