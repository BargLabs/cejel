import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { bumpReleaseVersion } from './bump-release-version.mjs';
import {
  disagreeingFields,
  PLUGIN_MANIFEST_PATH,
  PLUGIN_MCP_CONFIG_PATH,
  releaseVersionFields,
} from './claude-plugin-versions.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const FILES = ['package.json', 'server.json', 'published-versions.json', 'Dockerfile', PLUGIN_MANIFEST_PATH, PLUGIN_MCP_CONFIG_PATH];

// A copy of the real release-identity files, so the test fails if their shape drifts from the
// patterns the bump script expects.
function copyOfRepo() {
  const root = mkdtempSync(join(tmpdir(), 'cejel-bump-'));
  for (const path of FILES) {
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
