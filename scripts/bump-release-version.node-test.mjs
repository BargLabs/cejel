import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bumpReleaseVersion,
  componentPinProblems,
  MANUAL_FOLLOW_UPS,
  newestFinalRelease,
  PRERELEASE_FILES,
} from './bump-release-version.mjs';
import {
  disagreeingFields,
  PLUGIN_MANIFEST_PATH,
  PLUGIN_MCP_CONFIG_PATH,
  releaseVersionFields,
} from './claude-plugin-versions.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const FILES = ['package.json', 'server.json', 'published-versions.json', 'Dockerfile', PLUGIN_MANIFEST_PATH, PLUGIN_MCP_CONFIG_PATH];
// What a release candidate's bump also writes, so its release commit needs no hand edit.
const RC_FILES = ['CHANGELOG.md', 'ci/gitlab/cejel.gitlab-ci.yml', 'docs/gitlab-ci.md'];

// A copy of the real release-identity files, so the test fails if their shape drifts from the
// patterns the bump script expects.
function copyOfRepo() {
  const root = mkdtempSync(join(tmpdir(), 'cejel-bump-'));
  for (const path of [...FILES, ...RC_FILES, 'README.md']) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(REPO, path), join(root, path));
  }
  return root;
}

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const readJson = (root, path) => JSON.parse(read(root, path));

test('moves every release-identity field, the plugin manifest and the plugin MCP pin together', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  const result = bumpReleaseVersion({ root, to: '9.9.9' });
  assert.equal(result.from, from);

  const fields = releaseVersionFields({
    packageManifest: readJson(root, 'package.json'),
    pluginManifest: readJson(root, PLUGIN_MANIFEST_PATH),
    mcpConfig: readJson(root, PLUGIN_MCP_CONFIG_PATH),
  });
  assert.deepEqual(disagreeingFields(fields, '9.9.9'), []);
  assert.equal(readJson(root, 'server.json').version, '9.9.9');
  assert.equal(readJson(root, 'server.json').packages[0].identifier, 'ghcr.io/barglabs/cejel:9.9.9');
  assert.deepEqual(readJson(root, 'published-versions.json'), { mcpRegistry: '9.9.9', oci: '9.9.9' });
  assert.match(read(root, 'Dockerfile'), /\nARG VERSION=9\.9\.9\n/);
  for (const path of FILES) assert.ok(!read(root, path).includes(`${from}`), `${path} still names ${from}`);
});

test('changes nothing but the version strings', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  bumpReleaseVersion({ root, to: '9.9.9' });
  for (const path of FILES) {
    assert.equal(read(root, path).replaceAll('9.9.9', from), read(REPO, path), path);
  }
});

test('refuses and writes nothing when any field is missing or already moved', () => {
  const root = copyOfRepo();
  const mcpPath = join(root, PLUGIN_MCP_CONFIG_PATH);
  writeFileSync(mcpPath, read(root, PLUGIN_MCP_CONFIG_PATH).replace(/@cejel\/cejel@[^"]+"/, '@cejel/cejel@0.0.1"'));
  const before = FILES.map((path) => read(root, path));
  assert.throws(() => bumpReleaseVersion({ root, to: '9.9.9' }), /nothing was written[\s\S]*\.mcp\.json/);
  assert.deepEqual(FILES.map((path) => read(root, path)), before);
});

test('refuses a non-semver target and a no-op move', () => {
  const root = copyOfRepo();
  assert.throws(() => bumpReleaseVersion({ root, to: 'v9.9.9' }), /MAJOR\.MINOR\.PATCH/);
  assert.throws(() => bumpReleaseVersion({ root, to: readJson(root, 'package.json').version }), /already at/);
});

test('a release candidate moves every field the same way, and the final version moves them on from it', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  for (const to of ['9.9.9-rc.1', '9.9.9']) {
    bumpReleaseVersion({ root, to });
    const fields = releaseVersionFields({
      packageManifest: readJson(root, 'package.json'),
      pluginManifest: readJson(root, PLUGIN_MANIFEST_PATH),
      mcpConfig: readJson(root, PLUGIN_MCP_CONFIG_PATH),
    });
    assert.deepEqual(disagreeingFields(fields, to), [], to);
    assert.equal(readJson(root, 'server.json').version, to);
    assert.equal(readJson(root, 'server.json').packages[0].identifier, `ghcr.io/barglabs/cejel:${to}`);
    assert.deepEqual(readJson(root, 'published-versions.json'), { mcpRegistry: to, oci: to });
    assert.ok(read(root, 'Dockerfile').includes(`\nARG VERSION=${to}\n`), `Dockerfile at ${to}`);
    for (const path of FILES) assert.equal(read(root, path).replaceAll(to, from), read(REPO, path), `${path} at ${to}`);
  }
});

test('refuses a prerelease that is not -rc.N with N >= 1, and a leading v, writing nothing', () => {
  const root = copyOfRepo();
  const before = FILES.map((path) => read(root, path));
  for (const to of ['9.9.9-rc', '9.9.9-rc.0', '9.9.9-beta.1', 'v9.9.9-rc.1']) {
    assert.throws(() => bumpReleaseVersion({ root, to }), /MAJOR\.MINOR\.PATCH or MAJOR\.MINOR\.PATCH-rc\.N/, to);
  }
  assert.deepEqual(FILES.map((path) => read(root, path)), before);
});

// A release candidate's commit may hold only what the bump writes (check-prerelease-commit in
// scripts/release-version.mjs), so every edit its gates need is the bump's, or none is needed.
test('a release candidate also moves the CHANGELOG heading and the GitLab include, so its commit needs no hand edit', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  const result = bumpReleaseVersion({ root, to: '9.9.9-rc.1' });
  assert.deepEqual(PRERELEASE_FILES, RC_FILES);
  assert.deepEqual(result.files, [...FILES, ...RC_FILES]);
  assert.equal(
    read(root, 'CHANGELOG.md'),
    read(REPO, 'CHANGELOG.md').replace('\n## [Unreleased]\n', '\n## [Unreleased]\n\n## [9.9.9-rc.1]\n'),
  );
  const gitlab = read(root, 'ci/gitlab/cejel.gitlab-ci.yml');
  assert.ok(gitlab.includes('CEJEL_VERSION: "9.9.9-rc.1"') && gitlab.includes('/cejel/v9.9.9-rc.1/ci/gitlab/'), gitlab);
  for (const path of ['ci/gitlab/cejel.gitlab-ci.yml', 'docs/gitlab-ci.md']) {
    assert.equal(read(root, path).replaceAll('9.9.9-rc.1', from), read(REPO, path), path);
  }
  assert.equal(read(root, 'README.md'), read(REPO, 'README.md'), 'a release candidate publishes no image, so README.md stays');
});

test('a final version still leaves the CHANGELOG, the GitLab include and the README release statements to the reviewed manual follow-ups', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  assert.deepEqual(bumpReleaseVersion({ root, to: '9.9.9' }).files, [...FILES, ...COMPONENT_FILES]);
  for (const path of ['CHANGELOG.md', 'ci/gitlab/cejel.gitlab-ci.yml']) assert.equal(read(root, path), read(REPO, path), path);
  // Only the component mentions moved: putting 9.9.9 back gives the original bytes.
  for (const path of COMPONENT_FILES) assert.equal(read(root, path).replaceAll('9.9.9', from), read(REPO, path), path);
  assert.ok(read(root, 'docs/gitlab-ci.md').includes(`/BargLabs/cejel/v${from}/ci/gitlab/`), 'the include tag stays manual');
  assert.ok(read(root, 'README.md').includes(`ghcr.io/barglabs/cejel:${from}`), 'the README image pin stays manual');
});

// ------------------------------------------------ the GitLab CI/CD Catalog component's version
// The component's version, its `version` input default and the `spec:` default follow the final
// npm release. The Catalog only carries final releases, so a release candidate leaves them alone.
const COMPONENT_FILES = ['docs/gitlab-ci.md', 'README.md'];

function componentVersions(root) {
  const docs = read(root, 'docs/gitlab-ci.md');
  return {
    docsComponent: [...docs.matchAll(/gitlab\.com\/barglabs\/cejel\/cejel@([^\s`'")]+)/g)].map((match) => match[1]),
    readmeComponent: [...read(root, 'README.md').matchAll(/gitlab\.com\/barglabs\/cejel\/cejel@([^\s`'")]+)/g)].map((match) => match[1]),
    inputDefault: [...docs.matchAll(/^\| `version` \| `([^`]+)` \|/gm)].map((match) => match[1]),
    specDefault: [...docs.matchAll(/^ +default: '([^']+)'$/gm)].map((match) => match[1]),
  };
}

const everyComponentVersionIs = (version) => ({
  docsComponent: [version],
  readmeComponent: [version],
  inputDefault: [version],
  specDefault: [version],
});

// The next patch release after package.json's version: 0.6.11 -> 0.6.12 when this was written.
const nextPatch = (version) => version.replace(/\d+$/, (patch) => String(Number(patch) + 1));

test('a final version moves every component mention: both component lines, the input default and the spec default', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  assert.deepEqual(componentVersions(root), everyComponentVersionIs(from));
  bumpReleaseVersion({ root, to: nextPatch(from) });
  assert.deepEqual(componentVersions(root), everyComponentVersionIs(nextPatch(from)));
});

test('a release candidate moves no component mention, and the final after it moves them from the newest final release', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  const to = nextPatch(from);
  bumpReleaseVersion({ root, to: `${to}-rc.1` });
  assert.deepEqual(componentVersions(root), everyComponentVersionIs(from));
  assert.equal(read(root, 'README.md'), read(REPO, 'README.md'));
  bumpReleaseVersion({ root, to: `${to}-rc.2` });
  assert.deepEqual(componentVersions(root), everyComponentVersionIs(from));
  bumpReleaseVersion({ root, to });
  assert.deepEqual(componentVersions(root), everyComponentVersionIs(to));
});

test('a final version refuses and writes nothing when a component mention is not exactly once', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  writeFileSync(join(root, 'README.md'), read(root, 'README.md').replace(`cejel/cejel@${from}`, 'cejel/cejel@0.0.1'));
  const before = [...FILES, ...COMPONENT_FILES].map((path) => read(root, path));
  assert.throws(() => bumpReleaseVersion({ root, to: '9.9.9' }), /nothing was written[\s\S]*README\.md/);
  assert.deepEqual([...FILES, ...COMPONENT_FILES].map((path) => read(root, path)), before);
});

test('the manual follow-ups no longer list what the bump now moves', () => {
  const listed = MANUAL_FOLLOW_UPS.join('\n');
  assert.doesNotMatch(listed, /component/i);
  assert.doesNotMatch(listed, /default/);
});

// The pin: every component mention equals package.json's version for a final version, and the
// newest final release (the newest dated CHANGELOG heading) for a release candidate.
test('every component mention in this repository is pinned to the release', () => {
  assert.deepEqual(componentPinProblems(REPO), []);
});

test('the pin fails on a mention one version behind, naming the file, the line and both versions', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  bumpReleaseVersion({ root, to: '9.9.9' });
  const docs = read(root, 'docs/gitlab-ci.md');
  writeFileSync(join(root, 'docs/gitlab-ci.md'), docs.replace("default: '9.9.9'", `default: '${from}'`));
  const line = docs.split('\n').findIndex((text) => text.includes("default: '9.9.9'")) + 1;
  assert.deepEqual(componentPinProblems(root), [
    `docs/gitlab-ci.md:${line}: spec version default is ${from}, expected 9.9.9 (package.json's version)`,
  ]);
});

test('the pin fails when a mention is missing, rather than passing on nothing', () => {
  const root = copyOfRepo();
  writeFileSync(join(root, 'README.md'), read(root, 'README.md').replaceAll('gitlab.com/barglabs/cejel/cejel@', 'gitlab.com/barglabs/cejel@'));
  assert.deepEqual(componentPinProblems(root), ['README.md: no component version found (expected at least 1)']);
});

test('for a release candidate the pin expects the newest final release, not the candidate', () => {
  const root = copyOfRepo();
  const from = readJson(root, 'package.json').version;
  bumpReleaseVersion({ root, to: '9.9.9-rc.1' });
  assert.equal(newestFinalRelease(read(root, 'CHANGELOG.md')), from);
  assert.deepEqual(componentPinProblems(root), []);
  const readme = read(root, 'README.md');
  writeFileSync(join(root, 'README.md'), readme.replace(`cejel/cejel@${from}`, 'cejel/cejel@9.9.9-rc.1'));
  const line = readme.split('\n').findIndex((text) => text.includes(`cejel/cejel@${from}`)) + 1;
  assert.deepEqual(componentPinProblems(root), [
    `README.md:${line}: component version is 9.9.9-rc.1, expected ${from} (the newest final release in CHANGELOG.md; the Catalog carries no release candidate)`,
  ]);
});

test('a release candidate refuses and writes nothing when the CHANGELOG has no [Unreleased] heading', () => {
  const root = copyOfRepo();
  writeFileSync(join(root, 'CHANGELOG.md'), read(root, 'CHANGELOG.md').replace('## [Unreleased]', '## Unreleased'));
  const before = [...FILES, ...RC_FILES].map((path) => read(root, path));
  assert.throws(() => bumpReleaseVersion({ root, to: '9.9.9-rc.1' }), /nothing was written[\s\S]*CHANGELOG\.md/);
  assert.deepEqual([...FILES, ...RC_FILES].map((path) => read(root, path)), before);
});

const BUMP_CLI = fileURLToPath(new URL('./bump-release-version.mjs', import.meta.url));

test('the command line lists the manual follow-ups for a final version and none for a release candidate', () => {
  const rc = execFileSync(process.execPath, [BUMP_CLI, '9.9.9-rc.1', '--root', copyOfRepo()], { encoding: 'utf8' });
  assert.match(rc, /nothing to edit by hand/);
  assert.doesNotMatch(rc, /still manual/);
  const final = execFileSync(process.execPath, [BUMP_CLI, '9.9.9', '--root', copyOfRepo()], { encoding: 'utf8' });
  assert.match(final, /still manual, then run pnpm run validate:distribution/);
});

// validate:distribution, run from a copy of every tracked file (it reads files beside itself).
function copyOfTrackedTree() {
  const root = mkdtempSync(join(tmpdir(), 'cejel-validate-'));
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of tracked) {
    if (!existsSync(join(REPO, path))) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(REPO, path), join(root, path));
  }
  return root;
}

const validate = (root) => spawnSync(process.execPath, [join(root, 'scripts/validate-distribution-metadata.mjs')], { encoding: 'utf8' });

test('validate:distribution passes a release candidate whose README names the newest final image, and says what it relaxed', () => {
  const root = copyOfTrackedTree();
  bumpReleaseVersion({ root, to: '9.9.9-rc.1' });
  const result = validate(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /prerelease 9\.9\.9-rc\.1: relaxed README release OCI version, README OpenClaw release OCI version/);
});

test('validate:distribution refuses a release candidate whose README names the candidate image', () => {
  const root = copyOfTrackedTree();
  const from = readJson(root, 'package.json').version;
  bumpReleaseVersion({ root, to: '9.9.9-rc.1' });
  writeFileSync(join(root, 'README.md'), read(root, 'README.md').replace(`ghcr.io/barglabs/cejel:${from}`, 'ghcr.io/barglabs/cejel:9.9.9-rc.1'));
  const result = validate(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README names ghcr\.io\/barglabs\/cejel:9\.9\.9-rc\.1, an image a release candidate never publishes/);
});

test('validate:distribution still requires a final version README to name its own image', () => {
  const root = copyOfTrackedTree();
  bumpReleaseVersion({ root, to: '9.9.9' });
  const result = validate(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README release OCI version must include "ghcr\.io\/barglabs\/cejel:9\.9\.9"/);
});
