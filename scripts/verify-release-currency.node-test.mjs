import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATALOG_PENDING_HOURS,
  CATALOG_SURFACE,
  createLiveReaders,
  latestReleaseVersion,
  LEADERBOARD_URL,
  MCP_REGISTRY_TIMEOUT_MS,
  parseLeaderboardRecord,
  renderedCurrentVersion,
  ReleaseCurrencyError,
  verifyReleaseCurrency,
} from './verify-release-currency.mjs';
import { mcpPinnedVersion, releaseVersionFields } from './claude-plugin-versions.mjs';

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
  'cejel.dev homepage',
  'cejel.dev for-engineers',
  'changelog',
  'published-versions.json',
  'leaderboard',
  'Claude plugin',
];

function pluginFields({ packageVersion = version, pluginVersion = version, pin = version } = {}) {
  return releaseVersionFields({
    packageManifest: { version: packageVersion },
    pluginManifest: { version: pluginVersion },
    mcpConfig: { mcpServers: { cejel: { command: 'npx', args: ['-y', `@cejel/cejel@${pin}`, 'mcp'] } } },
  });
}

const goodHomepageHtml = `
<div class="cmd"><span class="dollar">$</span>npx @cejel/cejel@${version} .</div>
<p class="sub">Also: <code>pnpm dlx @cejel/cejel@${version} .</code> &middot; <code>bunx @cejel/cejel@${version} .</code></p>
`;

const goodForEngineersHtml = `
<p class="pill">Current &middot; v${version}</p>
<p>npm, Docker / OCI, the Official MCP Registry, and the GitHub Action now point to the current release.</p>
`;

// Captured 2026-09-02 from the live homepage after cejel-site#62 (the buyer-first refresh) moved
// the "Current · v<version>" claim to /for-engineers/ and left only pinned invocation strings on
// the homepage. The word "current" no longer appears anywhere on this page.
const realCurrentHomepageExcerpt = `
<meta property="og:description" content="npx @cejel/cejel@0.4.5 . — no install, no signup, fully offline.">
<span><span class="dollar">$</span>npx @cejel/cejel@0.4.5 .</span>
<p class="sub">Also: <code>pnpm dlx @cejel/cejel@0.4.5 .</code> &middot; <code>bunx @cejel/cejel@0.4.5 .</code></p>
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
  '# Cejel OSS trust leaderboard\n\n' +
  `- Cejel version: @cejel/cejel@${version} (published, npx)\n` +
  'Every score is produced through the same sealed public-scoring entry point used by ' +
  `\`pnpm dlx @cejel/cejel@${version} .\`.\n`;

test('the leaderboard source is the deployed public Markdown surface', () => {
  assert.equal(LEADERBOARD_URL, 'https://cejel.dev/leaderboard/leaderboard.md');
});

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
    'cejel.dev homepage': async () => ({
      invocationVersions: [version, version, version],
      html: goodHomepageHtml,
    }),
    'cejel.dev for-engineers': async () => ({ currentVersion: version, html: goodForEngineersHtml }),
    changelog: async () => ({ versions: [version, '1.2.1'], html: goodChangelogHtml }),
    'published-versions.json': async () => ({ mcpRegistry: version, oci: version }),
    leaderboard: async () => ({ declaredVersion: version, pinVersion: null, markdown: goodLeaderboardMarkdown }),
    'Claude plugin': async () => ({ tag: `v${version}`, fields: pluginFields() }),
    'GitLab CI/CD Catalog': async () => ({ newest: version, createdAt: '2026-11-10T12:30:00Z', npmPublishedAt: null }),
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

test('the leaderboard parser reads the current header and ignores conflicting history', () => {
  const markdown =
    '# Cejel OSS trust leaderboard\n\n' +
    `- Cejel version: @cejel/cejel@${version} (published, npx)\n\n` +
    '## History\n\n' +
    'Scorer source version: @cejel/cejel@1.2.1\n';
  assert.deepEqual(parseLeaderboardRecord(markdown), {
    declaredVersion: version,
    pinVersion: null,
  });
});

test('a historical scorer declaration cannot substitute for the current leaderboard header', () => {
  assert.throws(
    () => parseLeaderboardRecord('## History\n\nScorer source version: @cejel/cejel@1.2.1\n'),
    /does not declare a current "Cejel version" header line/,
  );
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
    markdown: `- Cejel version: @cejel/cejel@${version} (published, npx)\nRun it with \`npx @cejel/cejel .\`.\n`,
  });
  const result = await rejectedRun(readers);
  showFixture('leaderboard bare invocation fixture', result);
  assert.match(result.failure.message, /leaderboard/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] leaderboard:') &&
    line.includes('unpinned invocation on line 2') &&
    line.includes('npx @cejel/cejel .')));
});

test('a bare npx invocation inside leaderboard history does not fire', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({
    declaredVersion: version,
    pinVersion: null,
    markdown:
      goodLeaderboardMarkdown +
      '\n## History\n\nA withdrawn run used `npx @cejel/cejel .` and is retained verbatim.\n',
  });
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line) });
  assert.ok(lines.some((line) => line.startsWith('[PASS] leaderboard:')));
});

test('a current bare invocation after leaderboard history still fails', async () => {
  const readers = goodReaders();
  readers.leaderboard = async () => ({
    declaredVersion: version,
    pinVersion: null,
    markdown:
      `- Cejel version: @cejel/cejel@${version} (published, npx)\n\n` +
      '## History\n\nA withdrawn run used `npx @cejel/cejel .`.\n\n' +
      '## How to read this board\n\nRun current scans with `npx @cejel/cejel .`.\n',
  });
  const result = await rejectedRun(readers);
  assert.match(result.failure.message, /leaderboard/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] leaderboard:') &&
    line.includes('Run current scans with `npx @cejel/cejel .`')));
});

test('the pre-re-point "Current" marker pattern cannot find a match on the current live homepage', () => {
  // Regression guard: proves the re-point was needed. This is a real excerpt of cejel.dev's
  // homepage (captured 2026-09-02, after cejel-site#62 moved the "Current · v<version>" claim to
  // /for-engineers/). Checking the homepage for this pattern — what the code did before the
  // re-point — silently returns <missing> forever on real content, because the word "current"
  // isn't on the homepage anymore. That is what broke release-currency verification for
  // cejel.dev, not a live-site regression.
  assert.equal(renderedCurrentVersion(realCurrentHomepageExcerpt), null);
});

test('cejel.dev homepage with correctly pinned invocation strings passes', async () => {
  const lines = [];
  await verifyReleaseCurrency({ version, readers: goodReaders(), write: (line) => lines.push(line) });
  assert.ok(lines.some((line) =>
    line.startsWith(`[PASS] cejel.dev homepage: observed=pinned invocation versions=${version},${version},${version}`)));
});

test('a stale pinned invocation on the cejel.dev homepage fails and names the observed versions', async () => {
  const readers = goodReaders();
  readers['cejel.dev homepage'] = async () => ({
    invocationVersions: [version, '1.2.2'],
    html: goodHomepageHtml,
  });
  const result = await rejectedRun(readers);
  showFixture('stale homepage invocation fixture', result);
  assert.match(result.failure.message, /cejel\.dev homepage/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] cejel.dev homepage:') &&
    line.includes(`homepage pinned invocation versions (${version},1.2.2) do not all equal ${version}`)));
});

test('a bare npx hero command on the cejel.dev homepage fails and names the line', async () => {
  const readers = goodReaders();
  readers['cejel.dev homepage'] = async () => ({
    invocationVersions: [version],
    html: `<div class="cmd"><span class="dollar">$</span>npx @cejel/cejel@${version} .</div>\n<div class="cmd"><span class="dollar">$</span>npx @cejel/cejel .</div>\n`,
  });
  const result = await rejectedRun(readers);
  showFixture('bare hero command fixture', result);
  assert.match(result.failure.message, /cejel\.dev homepage/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] cejel.dev homepage:') &&
    line.includes('unpinned hero/example invocation on line 2') &&
    line.includes('npx @cejel/cejel .')));
});

test('cejel.dev for-engineers with a correctly rendered "Current" marker passes', async () => {
  const lines = [];
  await verifyReleaseCurrency({ version, readers: goodReaders(), write: (line) => lines.push(line) });
  assert.ok(lines.some((line) =>
    line.startsWith(`[PASS] cejel.dev for-engineers: observed=rendered current version=${version}`)));
});

test('a bare npx hero command on cejel.dev for-engineers fails and names the line', async () => {
  const readers = goodReaders();
  readers['cejel.dev for-engineers'] = async () => ({
    currentVersion: version,
    html: `<p class="pill">Current &middot; v${version}</p>\n<div class="cmd"><span class="dollar">$</span>npx @cejel/cejel .</div>\n`,
  });
  const result = await rejectedRun(readers);
  showFixture('bare for-engineers command fixture', result);
  assert.match(result.failure.message, /cejel\.dev for-engineers/);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] cejel.dev for-engineers:') &&
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

// Claude plugin: package.json, the plugin manifest and the plugin's npx pin move together.
for (const [field, override, observed] of [
  ['the plugin manifest', { pluginVersion: '1.2.2' }, 'plugins/cejel/.claude-plugin/plugin.json version=1.2.2'],
  ['the MCP pin', { pin: '1.2.2' }, 'plugins/cejel/.mcp.json @cejel/cejel pin=1.2.2'],
  ['package.json', { packageVersion: '1.2.2' }, 'package.json version=1.2.2'],
]) {
  test(`the Claude plugin surface fails when ${field} at the tag disagrees`, async () => {
    const readers = goodReaders();
    readers['Claude plugin'] = async () => ({ tag: `v${version}`, fields: pluginFields(override) });
    const result = await rejectedRun(readers);
    assert.match(result.failure.message, /Claude plugin/);
    assert.ok(result.lines.some((line) =>
      line.startsWith('[FAIL] Claude plugin:') && line.includes(observed) && line.includes(`disagreeing: ${observed}`)));
  });
}

test('the Claude plugin surface fails when the plugin files are absent at the tag', async () => {
  const readers = goodReaders();
  readers['Claude plugin'] = async () => { throw new Error('Claude plugin plugins/cejel/.mcp.json@v1.2.3 query failed: HTTP 404'); };
  const result = await rejectedRun(readers);
  assert.ok(result.lines.some((line) =>
    line.startsWith('[FAIL] Claude plugin: observed=<unreachable>') && line.includes('HTTP 404')));
});

test('only `npx -y @cejel/cejel@<version> mcp` reads as a pin; anything else fails', () => {
  const config = (server) => ({ mcpServers: { cejel: server } });
  assert.equal(mcpPinnedVersion(config({ command: 'npx', args: ['-y', '@cejel/cejel@1.2.3', 'mcp'] })), '1.2.3');
  assert.equal(mcpPinnedVersion(config({ command: 'npx', args: ['-y', '@cejel/cejel', 'mcp'] })), null);
  assert.equal(mcpPinnedVersion(config({ command: 'npx', args: ['-y', '@cejel/cejel@latest-x', 'cejel-mcp'] })), null);
  assert.equal(mcpPinnedVersion(config({ command: 'npx', args: ['-y', '--package=@cejel/cejel@1.2.3', 'cejel-mcp'] })), null);
  assert.equal(mcpPinnedVersion(config({ command: 'npx', args: ['@cejel/cejel@1.2.3', 'mcp'] })), null);
  assert.equal(mcpPinnedVersion(config({ command: 'node', args: ['-y', '@cejel/cejel@1.2.3', 'mcp'] })), null);
  assert.equal(mcpPinnedVersion({}), null);
});

// MCP Registry read: a slow or briefly failing registry is retried once; a wrong answer is not.
function mcpResponse(servedVersion) {
  const body = JSON.stringify({
    server: {
      name: 'io.github.BargLabs/cejel',
      version: servedVersion,
      packages: [{ registryType: 'oci', identifier: `ghcr.io/barglabs/cejel@${digest}` }],
    },
  });
  return { ok: true, status: 200, statusText: 'OK', text: async () => body };
}

function mcpRun(steps) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'timeout') {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      throw error;
    }
    if (typeof step === 'number') return { ok: false, status: step, statusText: 'Server Error', text: async () => '' };
    return mcpResponse(step);
  };
  const readers = goodReaders();
  readers['MCP Registry'] = createLiveReaders({ fetchImpl, retryDelayMs: 0 })['MCP Registry'];
  return { calls, readers };
}

test('MCP Registry: one timeout, then a correct answer, passes and reports both attempts', async () => {
  const { calls, readers } = mcpRun(['timeout', version]);
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line) });
  assert.equal(calls.length, 2);
  assert.ok(lines.some((line) =>
    line.includes('[PASS] MCP Registry:') && line.includes('attempts=2; last=timeout')));
});

test('MCP Registry: HTTP 503, then a correct answer, passes', async () => {
  const { calls, readers } = mcpRun([503, version]);
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line) });
  assert.equal(calls.length, 2);
  assert.ok(lines.some((line) => line.includes('[PASS] MCP Registry:') && line.includes('attempts=2; last=HTTP 503')));
});

test('MCP Registry: two timeouts fail and name both attempts', async () => {
  const { calls, readers } = mcpRun(['timeout', 'timeout']);
  const result = await rejectedRun(readers);
  assert.equal(calls.length, 2);
  assert.ok(result.lines.some((line) =>
    line.includes('[FAIL] MCP Registry:') && line.includes('attempts=2; last=timeout') && line.includes('45 seconds')));
});

test('MCP Registry: a wrong version fails on the first read without a retry', async () => {
  const { calls, readers } = mcpRun(['9.9.9', version]);
  const result = await rejectedRun(readers);
  assert.equal(calls.length, 1);
  assert.ok(result.lines.some((line) => line.includes('[FAIL] MCP Registry:') && line.includes('version=9.9.9')));
});

test('MCP Registry: the timeout is the named 45 second constant', () => {
  assert.equal(MCP_REGISTRY_TIMEOUT_MS, 45_000);
});

test('the release it verifies by default is the newest final release: prereleases and drafts are ignored', async () => {
  const releases = [
    { tag_name: 'v0.7.0-rc.2', draft: false, prerelease: true },
    { tag_name: 'v0.7.0-rc.1', draft: false, prerelease: false },
    { tag_name: 'v0.7.0', draft: true, prerelease: false },
    { tag_name: 'v0.6.10', draft: false, prerelease: false },
    { tag_name: 'v0.6.9', draft: false, prerelease: true },
    { tag_name: 'v0.6.8', draft: false, prerelease: false },
  ];
  assert.equal(await latestReleaseVersion({ readReleases: async () => releases }), '0.6.10');
  assert.equal(await latestReleaseVersion({ readReleases: async () => releases.slice(3).reverse() }), '0.6.10');
});

test('with no final release to pick, the default refuses rather than verifying a prerelease', async () => {
  const releases = [
    { tag_name: 'v0.7.0-rc.1', draft: false, prerelease: true },
    { tag_name: 'v0.7.0', draft: true, prerelease: false },
  ];
  await assert.rejects(latestReleaseVersion({ readReleases: async () => releases }), /no published final release/);
});

// ------------------------------------------------------------ the GitLab CI/CD Catalog
// The Catalog is read after the counted surfaces and reported on its own [CATALOG ...] lines.
// scripts/release.sh counts [PASS] and [FAIL] lines against CURRENCY_SURFACES (the SURFACES list),
// and the Catalog is tagged by a job on gitlab.com, not by the release driver, so it is not one of
// them: a Catalog line never carries [PASS] or [FAIL], and the run still fails when it lags.
const HOUR = 60 * 60 * 1000;
const npmPublishedAt = '2026-11-10T12:00:00.000Z';
const hoursAfterPublish = (hours) => () => Date.parse(npmPublishedAt) + hours * HOUR;

function catalogReaders(catalog) {
  const calls = [];
  const readers = goodReaders();
  readers[CATALOG_SURFACE] = async (requested) => {
    calls.push(requested);
    if (catalog instanceof Error) throw catalog;
    return catalog;
  };
  return { calls, readers };
}

const catalogLine = (lines) => lines.find((line) => line.includes(`${CATALOG_SURFACE}:`));

test('the Catalog surface is named, and the counted surfaces stay the 14 release.sh requires', () => {
  assert.equal(CATALOG_SURFACE, 'GitLab CI/CD Catalog');
  assert.equal(CATALOG_PENDING_HOURS, 3);
  assert.ok(!surfaces.includes(CATALOG_SURFACE));
});

test('Catalog: equal to the release passes', async () => {
  const { calls, readers } = catalogReaders({ newest: version, createdAt: '2026-11-10T12:30:00Z', npmPublishedAt: null });
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line), now: hoursAfterPublish(1) });
  assert.deepEqual(calls, [version]);
  assert.match(catalogLine(lines), /^\[CATALOG PASS\] GitLab CI\/CD Catalog: observed=newest=1\.2\.3/);
});

test('Catalog: behind, 1 hour after the npm publish, is pending and does not fail', async () => {
  const { readers } = catalogReaders({ newest: '1.2.2', createdAt: '2026-11-01T00:00:00Z', npmPublishedAt });
  const lines = [];
  await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line), now: hoursAfterPublish(1) });
  const line = catalogLine(lines);
  assert.match(line, /^\[CATALOG PENDING\] GitLab CI\/CD Catalog:/);
  assert.ok(line.includes('1.2.2') && line.includes(`npm has had ${version} since ${npmPublishedAt}`), line);
  assert.ok(line.includes('fails at 3 hours'), line);
});

test('Catalog: behind, 4 hours after the npm publish, fails with both versions and since when', async () => {
  const { readers } = catalogReaders({ newest: '1.2.2', createdAt: '2026-11-01T00:00:00Z', npmPublishedAt });
  const lines = [];
  let failure;
  try {
    await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line), now: hoursAfterPublish(4) });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof ReleaseCurrencyError);
  assert.match(failure.message, /GitLab CI\/CD Catalog/);
  const line = catalogLine(lines);
  assert.match(line, /^\[CATALOG FAIL\] GitLab CI\/CD Catalog:/);
  assert.ok(line.includes("the Catalog's newest version is 1.2.2 (created 2026-11-01T00:00:00Z)"), line);
  assert.ok(line.includes(`npm has had ${version} since ${npmPublishedAt}`) && line.includes('3 hours'), line);
});

test('Catalog: an unreadable Catalog fails with the reason, never a pass', async () => {
  const { readers } = catalogReaders(new Error('GitLab CI/CD Catalog query failed: HTTP 503 Service Unavailable'));
  const lines = [];
  await assert.rejects(
    verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line), now: hoursAfterPublish(0) }),
    (error) => error instanceof ReleaseCurrencyError && /GitLab CI\/CD Catalog/.test(error.message),
  );
  assert.match(catalogLine(lines), /^\[CATALOG FAIL\] GitLab CI\/CD Catalog: observed=<unreachable>; reason=.*HTTP 503/);
});

test('Catalog: a Catalog ahead of the release under check fails rather than passing', async () => {
  const { readers } = catalogReaders({ newest: '1.2.4', createdAt: '2026-11-10T12:30:00Z', npmPublishedAt: null });
  await assert.rejects(
    verifyReleaseCurrency({ version, readers, write: () => {}, now: hoursAfterPublish(1) }),
    ReleaseCurrencyError,
  );
});

test('Catalog: a release candidate is not checked against the Catalog', async () => {
  const candidate = '1.2.4-rc.1';
  const { calls, readers } = catalogReaders({ newest: version, createdAt: '2026-11-10T12:30:00Z', npmPublishedAt: null });
  const lines = [];
  await assert.rejects(verifyReleaseCurrency({ version: candidate, readers, write: (line) => lines.push(line) }));
  assert.deepEqual(calls, []);
  assert.match(catalogLine(lines), /^\[CATALOG NOT CHECKED\] GitLab CI\/CD Catalog: .*release candidate/);
});

test('Catalog: no Catalog line reads as a counted [PASS] or [FAIL] line', async () => {
  for (const [catalog, hours] of [
    [{ newest: version, createdAt: '2026-11-10T12:30:00Z', npmPublishedAt: null }, 1],
    [{ newest: '1.2.2', createdAt: '2026-11-01T00:00:00Z', npmPublishedAt }, 1],
    [{ newest: '1.2.2', createdAt: '2026-11-01T00:00:00Z', npmPublishedAt }, 4],
    [new Error('unreadable'), 0],
  ]) {
    const { readers } = catalogReaders(catalog);
    const lines = [];
    await verifyReleaseCurrency({ version, readers, write: (line) => lines.push(line), now: hoursAfterPublish(hours) })
      .catch(() => {});
    assert.equal(lines.filter((line) => line.includes('[PASS]') || line.includes('[FAIL]')).length, surfaces.length);
    assert.ok(!/\[(PASS|FAIL)\]/.test(catalogLine(lines)), catalogLine(lines));
  }
});

// The live reader, against recorded responses. The GraphQL body's shape and its values (0.6.10,
// created 2026-11-10T04:47:03Z) are the ones measured anonymously on 10 Nov 2026 and recorded in
// the goal card; the npm publish times are constructed for the test.
const RECORDED_CATALOG = JSON.stringify({
  data: { ciCatalogResource: { versions: { nodes: [{ name: '0.6.10', createdAt: '2026-11-10T04:47:03Z' }] } } },
});
const CONSTRUCTED_NPM = JSON.stringify({
  name: '@cejel/cejel',
  time: { '0.6.10': '2026-11-04T18:00:00.000Z', '0.6.11': '2026-11-10T12:00:00.000Z' },
});

function catalogFetch(catalogBody = RECORDED_CATALOG, npmBody = CONSTRUCTED_NPM) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const body = String(url).startsWith('https://gitlab.com/') ? catalogBody : npmBody;
    if (typeof body === 'number') return { ok: false, status: body, statusText: 'Error', text: async () => '' };
    return { ok: true, status: 200, statusText: 'OK', text: async () => body };
  };
  return { requests, read: createLiveReaders({ fetchImpl })[CATALOG_SURFACE] };
}

test('Catalog reader: reads the newest version anonymously, and the npm publish time only when behind', async () => {
  const equal = catalogFetch();
  assert.deepEqual(await equal.read('0.6.10'), { newest: '0.6.10', createdAt: '2026-11-10T04:47:03Z', npmPublishedAt: null });
  assert.equal(equal.requests.length, 1);
  const [request] = equal.requests;
  assert.equal(request.url, 'https://gitlab.com/api/graphql');
  assert.equal(request.options.method, 'POST');
  assert.match(JSON.parse(request.options.body).query, /ciCatalogResource\(fullPath: ?"barglabs\/cejel"\)/);
  const headerNames = Object.keys(request.options.headers ?? {}).map((name) => name.toLowerCase());
  assert.ok(!headerNames.some((name) => ['authorization', 'private-token', 'job-token'].includes(name)), headerNames.join(','));

  const behind = catalogFetch();
  assert.deepEqual(await behind.read('0.6.11'), {
    newest: '0.6.10',
    createdAt: '2026-11-10T04:47:03Z',
    npmPublishedAt: '2026-11-10T12:00:00.000Z',
  });
  assert.equal(behind.requests[1].url, 'https://registry.npmjs.org/@cejel%2fcejel');
  assert.equal(behind.requests[1].options.headers?.authorization, undefined);
});

test('Catalog reader: a GraphQL error, an empty Catalog, an HTTP failure or a missing npm time is unreadable', async () => {
  const cases = [
    [JSON.stringify({ errors: [{ message: 'boom' }] }), CONSTRUCTED_NPM, /boom/],
    [JSON.stringify({ data: { ciCatalogResource: null } }), CONSTRUCTED_NPM, /no published version/],
    [JSON.stringify({ data: { ciCatalogResource: { versions: { nodes: [] } } } }), CONSTRUCTED_NPM, /no published version/],
    [503, CONSTRUCTED_NPM, /HTTP 503/],
    [RECORDED_CATALOG, JSON.stringify({ time: {} }), /npm lists no publish time for @cejel\/cejel@0\.6\.11/],
  ];
  for (const [catalogBody, npmBody, reason] of cases) {
    await assert.rejects(catalogFetch(catalogBody, npmBody).read('0.6.11'), reason);
  }
});
