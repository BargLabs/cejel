import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEADERBOARD_URL,
  parseLeaderboardRecord,
  renderedCurrentVersion,
  ReleaseCurrencyError,
  verifyReleaseCurrency,
} from './verify-release-currency.mjs';

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
];

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
