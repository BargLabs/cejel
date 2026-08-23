#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);

const REPOSITORY = 'BargLabs/cejel';
const PACKAGE_NAME = '@cejel/cejel';
const IMAGE_NAME = 'ghcr.io/barglabs/cejel';
const MCP_SERVER_NAME = 'io.github.BargLabs/cejel';
const HOMEBREW_FORMULA_REPOSITORY = 'BargLabs/homebrew-tap';
const BOARD_PATH = 'leaderboard/leaderboard.md';
export const LEADERBOARD_URL = `https://cejel.dev/${BOARD_PATH}`;
const SURFACES = [
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

const SEMVER_PATTERN =
  '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)' +
  '(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?' +
  '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?';
const SEMVER = new RegExp(`^${SEMVER_PATTERN}$`);
const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const BOARD_CURRENT_VERSION_LINE = new RegExp(
  `^- Cejel version: @cejel/cejel@(${SEMVER_PATTERN})(?:\\s|$)`,
  'm',
);
const BOARD_PIN_LINE = new RegExp(
  `Scorer version pin: @cejel/cejel@(${SEMVER_PATTERN}) [-—] reason: .+; declared \\d{4}-\\d{2}-\\d{2}`,
);

// Mirrors src/__tests__/bare-npx-invocation-guard.test.ts, which scans this repository's own
// docs/README/issue-template copy. That guard cannot see cejel.dev, so the same pattern is
// re-applied here against the published surfaces a first-time reviewer actually reads and copies
// commands from.
const RUNNER_PREFIXES = ['npx', 'pnpm dlx', 'bunx'];
const BARE_INVOCATION_PATTERN = new RegExp(
  `\\b(?:${RUNNER_PREFIXES.join('|')})\\s+@cejel/cejel(?!@)\\b`,
);

// A changelog entry heading, HTML (`<h2 id="...">v0.4.1</h2>`) or Markdown (`## v0.4.1`).
const CHANGELOG_HEADING_PATTERN = new RegExp(
  `(?:<h[1-6][^>]*>\\s*|^#{1,6}\\s+)v?(${SEMVER_PATTERN})\\b`,
  'gim',
);

function findBareInvocation(text) {
  const lines = String(text ?? '').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (BARE_INVOCATION_PATTERN.test(lines[index])) {
      return { line: index + 1, snippet: lines[index].trim().slice(0, 200) };
    }
  }
  return null;
}

function assertNoBareInvocation(surface, text, { property = 'invocation' } = {}) {
  const found = findBareInvocation(text);
  if (found) {
    throw new Error(
      `unpinned ${property} on line ${found.line}: "${found.snippet}" — every public npx/pnpm ` +
        'dlx/bunx @cejel/cejel invocation must pin a version so it cannot silently resolve stale',
    );
  }
}

function compareSemver(a, b) {
  const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
  const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

function changelogVersions(html) {
  return [...html.matchAll(CHANGELOG_HEADING_PATTERN)].map((match) => match[1]);
}

function newestSemver(versions) {
  return versions.reduce((best, candidate) => (compareSemver(candidate, best) > 0 ? candidate : best));
}

// Content up to the first version-numbered heading is the evergreen "install or update"
// lede: a live instruction a reader follows right now, so it is checked like a hero command.
// Content from the first heading onward is dated release-note entries — a historical record of
// what a past (or the current) release announced, which may legitimately narrate an old command
// without that narration being a live "run this" instruction. Those are exempt.
function changelogLede(html) {
  CHANGELOG_HEADING_PATTERN.lastIndex = 0;
  const match = CHANGELOG_HEADING_PATTERN.exec(html);
  CHANGELOG_HEADING_PATTERN.lastIndex = 0;
  return match ? html.slice(0, match.index) : html;
}

function leaderboardCurrentSection(markdown) {
  const historyHeading = /^## History\s*$/m.exec(markdown);
  return historyHeading ? markdown.slice(0, historyHeading.index) : markdown;
}

function leaderboardWithoutHistory(markdown) {
  const historyHeading = /^## History\s*$/m.exec(markdown);
  if (!historyHeading) return markdown;
  const afterHeading = historyHeading.index + historyHeading[0].length;
  const nextCurrentHeading = /^## (?!History\s*$).+$/m.exec(markdown.slice(afterHeading));
  return nextCurrentHeading
    ? `${markdown.slice(0, historyHeading.index)}${markdown.slice(afterHeading + nextCurrentHeading.index)}`
    : markdown.slice(0, historyHeading.index);
}

export function parseLeaderboardRecord(markdown) {
  const currentSection = leaderboardCurrentSection(String(markdown ?? ''));
  const declared = BOARD_CURRENT_VERSION_LINE.exec(currentSection);
  if (!declared) {
    throw new Error(`${BOARD_PATH} does not declare a current "Cejel version" header line`);
  }
  const pin = BOARD_PIN_LINE.exec(currentSection);
  return { declaredVersion: declared[1], pinVersion: pin?.[1] ?? null };
}

// Shared by every surface that can declare a scorer or CLI version in prose (currently only the
// leaderboard). A declared version must either equal the release under verification, or carry an
// explicit, committed pin naming a reason — silence is always a failure, never an inferred pin.
function assertDeclaredVersion(surface, property, declared, pin, version) {
  if (declared === version) return;
  if (pin !== null && pin === declared) return;
  throw new Error(
    `${surface} declares ${property} ${declared} but the release being verified is ${version}` +
      (pin
        ? `; the committed pin names ${pin}, which does not match the declared ${property} either`
        : `; no committed pin declaration names this as deliberate`),
  );
}

export class ReleaseCurrencyError extends Error {
  constructor(message, results = []) {
    super(message);
    this.name = 'ReleaseCurrencyError';
    this.results = results;
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function commandFailure(error) {
  const detail = String(error?.stderr || error?.stdout || error?.message || error).trim();
  return detail || 'command failed without an error message';
}

async function commandJson(command, args, label) {
  try {
    const { stdout } = await execFile(command, args, {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    });
    return parseJson(stdout, label);
  } catch (error) {
    throw new Error(`${label} query failed: ${commandFailure(error)}`);
  }
}

async function ghApi(path, label) {
  return commandJson('gh', ['api', path], label);
}

async function fetchTimed(url, label, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    const detail = error?.name === 'AbortError' ? 'request timed out after 20 seconds' : error.message;
    throw new Error(`${label} query failed: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchChecked(url, label, options = {}) {
  const response = await fetchTimed(url, label, options);
  if (!response.ok) {
    throw new Error(`${label} query failed: HTTP ${response.status} ${response.statusText}`);
  }
  return response;
}

async function fetchJson(url, label, options) {
  const response = await fetchChecked(url, label, options);
  const body = await response.text();
  return parseJson(body, label);
}

function bearerChallenge(value) {
  if (!value?.startsWith('Bearer ')) return null;
  const fields = {};
  for (const match of value.slice(7).matchAll(/([a-z]+)="([^"]*)"/gi)) {
    fields[match[1].toLowerCase()] = match[2];
  }
  return fields.realm ? fields : null;
}

async function readOciManifest(version) {
  const url = `https://ghcr.io/v2/barglabs/cejel/manifests/${encodeURIComponent(version)}`;
  const accept = [
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
  ].join(', ');
  const initial = await fetchTimed(url, 'OCI', { headers: { accept } });
  let response = initial;

  if (initial.status === 401) {
    const challenge = bearerChallenge(initial.headers.get('www-authenticate'));
    if (!challenge) throw new Error('OCI query failed: registry returned an invalid auth challenge');
    const tokenUrl = new URL(challenge.realm);
    if (challenge.service) tokenUrl.searchParams.set('service', challenge.service);
    tokenUrl.searchParams.set('scope', challenge.scope || 'repository:barglabs/cejel:pull');
    const tokenResponse = await fetchChecked(tokenUrl, 'OCI token');
    const tokenBody = parseJson(await tokenResponse.text(), 'OCI token');
    const token = tokenBody.token || tokenBody.access_token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('OCI query failed: registry token response did not contain a token');
    }
    response = await fetchTimed(url, 'OCI', {
      headers: { accept, authorization: `Bearer ${token}` },
    });
  }

  if (!response.ok) {
    throw new Error(`OCI query failed: HTTP ${response.status} ${response.statusText}`);
  }
  await response.arrayBuffer();
  const digest = response.headers.get('docker-content-digest');
  if (!DIGEST.test(digest || '')) {
    throw new Error(`OCI query failed: Docker-Content-Digest is missing or malformed: ${digest}`);
  }
  return { digest, mediaType: response.headers.get('content-type') || '<missing>' };
}

async function resolveRemoteTag(tag) {
  let object = (await ghApi(
    `repos/${REPOSITORY}/git/ref/tags/${encodeURIComponent(tag)}`,
    `git tag ${tag}`,
  )).object;
  for (let depth = 0; depth < 8 && object?.type === 'tag'; depth += 1) {
    object = (await ghApi(`repos/${REPOSITORY}/git/tags/${object.sha}`, `git tag ${tag}`)).object;
  }
  if (object?.type !== 'commit' || !COMMIT.test(object.sha || '')) {
    throw new Error(`tag ${tag} did not resolve to a commit`);
  }
  return object.sha;
}

function formulaVersions(formula) {
  return [...new Set(
    [...formula.matchAll(new RegExp(`/releases/download/v(${SEMVER_PATTERN})/`, 'g'))]
      .map((match) => match[1]),
  )].sort();
}

function renderedCurrentVersion(html) {
  const marker = new RegExp(`Current[\\s\\S]{0,80}?v(${SEMVER_PATTERN})`, 'i').exec(html);
  const sentence = new RegExp(`v(${SEMVER_PATTERN})\\s+is current`, 'i').exec(html);
  return marker?.[1] || sentence?.[1] || null;
}

function mcpOciIdentifier(server) {
  const packages = Array.isArray(server?.packages)
    ? server.packages.filter((entry) => entry?.registryType === 'oci')
    : [];
  return packages.length === 1 ? packages[0].identifier : null;
}

export function createLiveReaders() {
  return {
    async npm(version) {
      const exact = await commandJson(
        'npm', ['view', `${PACKAGE_NAME}@${version}`, 'version', '--json'], 'npm exact version',
      );
      const latest = await commandJson(
        'npm', ['view', PACKAGE_NAME, 'dist-tags.latest', '--json'], 'npm latest tag',
      );
      return { version: exact, latest };
    },

    async 'npm attestation'(version) {
      const encoded = encodeURIComponent(PACKAGE_NAME);
      const response = await fetchJson(
        `https://registry.npmjs.org/-/npm/v1/attestations/${encoded}@${encodeURIComponent(version)}`,
        'npm attestation',
      );
      const attestations = Array.isArray(response?.attestations) ? response.attestations : [];
      return {
        count: attestations.length,
        predicateTypes: [...new Set(attestations.map((entry) => entry?.predicateType).filter(Boolean))],
      };
    },

    async 'GitHub release'(version) {
      const tag = `v${version}`;
      const release = await ghApi(
        `repos/${REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`,
        'GitHub release',
      );
      const assets = Array.isArray(release?.assets) ? release.assets.map((asset) => asset?.name) : [];
      return { tag: release?.tag_name, draft: release?.draft, assets };
    },

    async 'git tag'(version) {
      return { tag: `v${version}`, commit: await resolveRemoteTag(`v${version}`) };
    },

    async OCI(version) {
      return readOciManifest(version);
    },

    async 'GitHub Action'(version) {
      const immutableTag = `v${version}`;
      const [immutableCommit, floatingCommit, rootManifest, directoryManifest] = await Promise.all([
        resolveRemoteTag(immutableTag),
        resolveRemoteTag('v1'),
        ghApi(
          `repos/${REPOSITORY}/contents/action.yml?ref=${encodeURIComponent(immutableTag)}`,
          `GitHub Action @${immutableTag}`,
        ),
        ghApi(
          `repos/${REPOSITORY}/contents/action/action.yml?ref=v1`,
          'GitHub Action action@v1',
        ),
      ]);
      return {
        immutableTag,
        immutableCommit,
        immutableManifest: rootManifest?.path,
        floatingTag: 'v1',
        floatingCommit,
        floatingManifest: directoryManifest?.path,
      };
    },

    async 'Homebrew tap'() {
      const record = await ghApi(
        `repos/${HOMEBREW_FORMULA_REPOSITORY}/contents/Formula/cejel.rb`,
        'Homebrew tap',
      );
      if (record?.encoding !== 'base64' || typeof record?.content !== 'string') {
        throw new Error('formula response did not contain base64 content');
      }
      return { versions: formulaVersions(Buffer.from(record.content, 'base64').toString('utf8')) };
    },

    async 'MCP Registry'(version) {
      const response = await fetchJson(
        `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(MCP_SERVER_NAME)}/versions/${encodeURIComponent(version)}`,
        'MCP Registry',
      );
      return {
        name: response?.server?.name,
        version: response?.server?.version,
        ociIdentifier: mcpOciIdentifier(response?.server),
      };
    },

    async 'cejel.dev'() {
      const response = await fetchChecked('https://cejel.dev', 'cejel.dev');
      const html = await response.text();
      return { currentVersion: renderedCurrentVersion(html), html };
    },

    async changelog() {
      const response = await fetchChecked('https://cejel.dev/changelog/', 'changelog');
      const html = await response.text();
      return { versions: changelogVersions(html), html };
    },

    async 'published-versions.json'() {
      const record = await ghApi(
        `repos/${REPOSITORY}/contents/published-versions.json?ref=main`,
        'published-versions.json',
      );
      if (record?.encoding !== 'base64' || typeof record?.content !== 'string') {
        throw new Error('GitHub response did not contain base64 content');
      }
      return parseJson(Buffer.from(record.content, 'base64').toString('utf8'), 'published-versions.json');
    },

    async leaderboard() {
      const response = await fetchChecked(LEADERBOARD_URL, 'leaderboard');
      const markdown = await response.text();
      return { ...parseLeaderboardRecord(markdown), markdown };
    },
  };
}

function observedValue(surface, value) {
  switch (surface) {
    case 'npm': return `version=${value.version}; dist-tags.latest=${value.latest}`;
    case 'npm attestation': return `attestations=${value.count}; predicates=${value.predicateTypes.join(',') || '<none>'}`;
    case 'GitHub release': {
      const provenance = value.assets.filter((name) => name?.includes('provenance'));
      return `tag=${value.tag}; draft=${value.draft}; provenance=${provenance.join(',') || '<missing>'}`;
    }
    case 'git tag': return `${value.tag} -> ${value.commit}`;
    case 'OCI': return `${IMAGE_NAME}; digest=${value.digest}; mediaType=${value.mediaType}`;
    case 'GitHub Action': return `@${value.immutableTag} -> ${value.immutableCommit} (${value.immutableManifest}); action@${value.floatingTag} -> ${value.floatingCommit} (${value.floatingManifest})`;
    case 'Homebrew tap': return `Formula/cejel.rb versions=${value.versions.join(',') || '<none>'}`;
    case 'MCP Registry': return `name=${value.name}; version=${value.version}; OCI=${value.ociIdentifier}`;
    case 'cejel.dev': return `rendered current version=${value.currentVersion || '<missing>'}`;
    case 'changelog':
      return `newest named release=${value.versions.length ? newestSemver(value.versions) : '<none>'}; versions=${value.versions.join(',') || '<none>'}`;
    case 'published-versions.json': return JSON.stringify(value);
    case 'leaderboard': return `declared=${value.declaredVersion}; pin=${value.pinVersion ?? '<none>'}`;
    default: return JSON.stringify(value);
  }
}

function assertSurface(surface, value, version, releaseCommit, observations) {
  const expectedTag = `v${version}`;
  switch (surface) {
    case 'npm':
      if (value.version !== version || value.latest !== version) {
        throw new Error(`expected version and dist-tags.latest to equal ${version}`);
      }
      break;
    case 'npm attestation':
      if (!Number.isInteger(value.count) || value.count < 1) {
        throw new Error(`attestation endpoint for ${PACKAGE_NAME}@${version} returned no attestations`);
      }
      break;
    case 'GitHub release':
      if (value.tag !== expectedTag) throw new Error(`expected release tag ${expectedTag}`);
      if (value.draft !== false) throw new Error('release is missing or still a draft');
      if (!value.assets.includes(`cejel-${expectedTag}-provenance.sigstore.json`)) {
        throw new Error(`release is missing cejel-${expectedTag}-provenance.sigstore.json`);
      }
      break;
    case 'git tag':
      if (!releaseCommit) throw new Error('release commit could not be determined');
      if (value.tag !== expectedTag || value.commit !== releaseCommit) {
        throw new Error(`expected ${expectedTag} to resolve to ${releaseCommit}`);
      }
      break;
    case 'OCI':
      if (!DIGEST.test(value.digest || '')) throw new Error('versioned image digest is missing or malformed');
      break;
    case 'GitHub Action':
      if (!releaseCommit) throw new Error('release commit could not be determined');
      if (value.immutableTag !== expectedTag || value.immutableCommit !== releaseCommit || value.immutableManifest !== 'action.yml') {
        throw new Error(`@${expectedTag} does not expose action.yml at ${releaseCommit}`);
      }
      if (value.floatingTag !== 'v1' || value.floatingCommit !== releaseCommit || value.floatingManifest !== 'action/action.yml') {
        throw new Error(`action@v1 does not expose action/action.yml at ${releaseCommit}`);
      }
      break;
    case 'Homebrew tap':
      if (value.versions.length !== 1 || value.versions[0] !== version) {
        throw new Error(`expected every formula release URL to identify ${version}`);
      }
      break;
    case 'MCP Registry': {
      if (value.name !== MCP_SERVER_NAME || value.version !== version) {
        throw new Error(`expected ${MCP_SERVER_NAME} version ${version}`);
      }
      const ociDigest = observations.OCI?.value?.digest;
      if (!DIGEST.test(ociDigest || '')) {
        throw new Error('cannot compare the Registry digest because the OCI digest was not observed');
      }
      const expectedIdentifier = `${IMAGE_NAME}@${ociDigest}`;
      if (value.ociIdentifier !== expectedIdentifier) {
        throw new Error(`Registry OCI digest does not equal the observed OCI digest ${ociDigest}`);
      }
      break;
    }
    case 'cejel.dev':
      if (value.currentVersion !== version) throw new Error(`rendered current marker does not name ${version}`);
      assertNoBareInvocation('cejel.dev', value.html, { property: 'hero/example invocation' });
      break;
    case 'changelog': {
      assertNoBareInvocation('changelog', changelogLede(value.html), { property: 'install/update invocation' });
      if (value.versions.length === 0) {
        throw new Error('https://cejel.dev/changelog/ does not name any release version');
      }
      const newest = newestSemver(value.versions);
      if (newest !== version) {
        throw new Error(
          `changelog's newest named release is ${newest} but the release being verified is ${version}`,
        );
      }
      break;
    }
    case 'published-versions.json':
      if (value?.mcpRegistry !== version || value?.oci !== version) {
        throw new Error(`expected the published MCP Registry and OCI record to agree with independently observed version ${version}`);
      }
      break;
    case 'leaderboard':
      assertDeclaredVersion('leaderboard', 'scorer version', value.declaredVersion, value.pinVersion, version);
      assertNoBareInvocation('leaderboard', leaderboardWithoutHistory(value.markdown), {
        property: 'invocation',
      });
      break;
    default:
      throw new Error(`unknown surface ${surface}`);
  }
}

export async function verifyReleaseCurrency({
  version,
  commit,
  readers = createLiveReaders(),
  write = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  if (!SEMVER.test(version || '')) throw new Error(`--version must be a semver; got ${version}`);
  const normalizedCommit = commit?.toLowerCase();
  if (normalizedCommit && !COMMIT.test(normalizedCommit)) {
    throw new Error(`--commit must be a full 40-character commit SHA; got ${commit}`);
  }

  const settled = await Promise.all(SURFACES.map(async (surface) => {
    try {
      if (typeof readers[surface] !== 'function') throw new Error('surface reader is missing');
      return [surface, { value: await readers[surface](version) }];
    } catch (error) {
      return [surface, { error: error.message || String(error) }];
    }
  }));
  const observations = Object.fromEntries(settled);
  const releaseCommit = normalizedCommit || observations['git tag']?.value?.commit;

  const results = SURFACES.map((surface) => {
    const observation = observations[surface];
    if (observation.error) {
      return { surface, ok: false, observed: '<unreachable>', reason: observation.error };
    }
    const observed = observedValue(surface, observation.value);
    try {
      assertSurface(surface, observation.value, version, releaseCommit, observations);
      return { surface, ok: true, observed };
    } catch (error) {
      return { surface, ok: false, observed, reason: error.message };
    }
  });

  for (const result of results) {
    write(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.surface}: observed=${result.observed}${result.reason ? `; reason=${result.reason}` : ''}`);
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new ReleaseCurrencyError(
      `Release currency verification failed for ${failures.map((result) => result.surface).join(', ')}.`,
      results,
    );
  }
  write(`Release ${version} is current on all ${SURFACES.length} surfaces at commit ${releaseCommit}.`);
  return { version, commit: releaseCommit, results };
}

export async function latestReleaseVersion() {
  const release = await ghApi(`repos/${REPOSITORY}/releases/latest`, 'GitHub release');
  const match = /^v(.+)$/.exec(release?.tag_name || '');
  if (release?.draft !== false || !match || !SEMVER.test(match[1])) {
    throw new Error(`latest GitHub release returned an invalid tag or draft state: ${release?.tag_name}`);
  }
  return match[1];
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--version' || argument === '--commit') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node scripts/verify-release-currency.mjs [--version <semver>] [--commit <full-sha>]\n');
    return;
  }
  const version = options.version || await latestReleaseVersion();
  process.stdout.write(`Verifying release currency for ${version}${options.commit ? ` at ${options.commit}` : ' (release commit read from the remote tag)'}...\n`);
  await verifyReleaseCurrency({ version, commit: options.commit });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
