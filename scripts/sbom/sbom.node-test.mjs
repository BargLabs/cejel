import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkSbom, parseArgs } from './check-sbom-inventory.mjs';
import {
  buildSbom,
  inventoryFromMetafile,
  packageFromInputPath,
  parseLockfilePackages,
} from './generate-bundle-sbom.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const LOCKFILE = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      zod:
        specifier: ^3.23.0
        version: 3.25.76

packages:

  '@scope/pkg@1.0.0':
    resolution: {integrity: sha512-AAAA}

  '@scope/pkg@2.0.0':
    resolution: {integrity: sha512-BBBB}

  zod@3.25.76:
    resolution: {integrity: sha512-CCCC}

snapshots:

  zod@3.25.76: {}
`;

test('every v0.6.0 SBOM fixture is refused', () => {
  for (const name of ['v0.6.0-linux-x86_64.spdx.json', 'v0.6.0-windows-x86_64.spdx.json']) {
    const problems = checkSbom(fixture(name), { require: ['zod'] });
    assert.ok(problems.length > 0, `${name} must be refused`);
    assert.ok(problems.some((p) => /no npm package other than the root/.test(p)) || /Windows/.test(name));
    assert.ok(problems.some((p) => /all-zero SHA1/.test(p)), `${name}: zero checksum must be named`);
  }
});

test('an SBOM produced by the generator passes', () => {
  const sbom = fixture('step1-sea-linux-sample.spdx.json');
  assert.deepEqual(checkSbom(sbom, { require: ['zod'] }), []);
  assert.ok(sbom.files[0].checksums.some((c) => c.algorithm === 'SHA256' && /^[0-9a-f]{64}$/.test(c.checksumValue)));
  assert.ok(sbom.relationships.some((r) => r.relationshipType === 'CONTAINS' && r.spdxElementId === 'SPDXRef-File-binary'));
});

test('the check refuses a generated SBOM once its inventory or hash is emptied', () => {
  const emptied = fixture('step1-sea-linux-sample.spdx.json');
  emptied.packages = emptied.packages.filter((p) => p.SPDXID === 'SPDXRef-Package-cejel');
  assert.ok(checkSbom(emptied).some((p) => /no npm package/.test(p)));

  const zeroed = fixture('step1-sea-linux-sample.spdx.json');
  zeroed.files[0].checksums[1].checksumValue = '0'.repeat(64);
  assert.ok(checkSbom(zeroed).some((p) => /all-zero SHA256/.test(p)));

  assert.ok(checkSbom(fixture('step1-sea-linux-sample.spdx.json'), { require: ['@modelcontextprotocol/sdk'] }).length > 0);
  assert.ok(checkSbom(fixture('step1-sea-linux-sample.spdx.json'), { binarySha256: 'f'.repeat(64) }).length > 0);
});

test('the CLI exits non-zero on a v0.6.0 fixture and zero on a generated one', () => {
  const script = join(HERE, 'check-sbom-inventory.mjs');
  const bad = spawnSync('node', [script, join(HERE, 'fixtures', 'v0.6.0-linux-x86_64.spdx.json')]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr.toString(), /SBOM REFUSED/);
  execFileSync('node', [script, join(HERE, 'fixtures', 'step1-sea-linux-sample.spdx.json'), '--require', 'zod']);
});

test('input paths map to packages, including pnpm scoped layouts', () => {
  assert.deepEqual(packageFromInputPath('node_modules/.pnpm/@scope+pkg@2.0.0_peer@1/node_modules/@scope/pkg/dist/x.js'), {
    name: '@scope/pkg',
    pnpmDir: '@scope+pkg@2.0.0_peer@1',
    manifestDir: 'node_modules/.pnpm/@scope+pkg@2.0.0_peer@1/node_modules/@scope/pkg',
  });
  assert.equal(packageFromInputPath('src/index.ts'), undefined);
});

test('versions come from the lockfile; ambiguity and absence are errors', () => {
  const lock = parseLockfilePackages(LOCKFILE);
  const inventory = inventoryFromMetafile(
    {
      inputs: {
        'src/a.ts': {},
        'node_modules/.pnpm/zod@3.25.76/node_modules/zod/index.js': {},
        'node_modules/.pnpm/@scope+pkg@2.0.0_x@1/node_modules/@scope/pkg/i.js': {},
      },
    },
    lock,
  );
  assert.deepEqual(inventory.map((e) => `${e.name}@${e.version}`), ['@scope/pkg@2.0.0', 'zod@3.25.76']);
  assert.throws(() => inventoryFromMetafile({ inputs: { 'node_modules/@scope/pkg/i.js': {} } }, lock), /unambiguous/);
  assert.throws(() => inventoryFromMetafile({ inputs: { 'node_modules/nope/i.js': {} } }, lock), /unambiguous/);
});

test('buildSbom records a real SHA-256 for the binary and CONTAINS relationships', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sbom-'));
  const binary = join(dir, 'cejel-test');
  writeFileSync(binary, 'not zero');
  const sbom = buildSbom({
    rootPackage: { name: '@cejel/cejel', version: '9.9.9', license: 'AGPL-3.0-only' },
    inventory: [{ name: 'zod', version: '3.25.76', integrity: 'sha512-O4v9tTzA+d1BsLuuKLe0QAdumr7v9ovCAcv6TL9prtf8ZCBSz7K+og5AwACLgBuvTbVoPpUoJpTJgh4kqsRY/A==' }],
    binary,
    nodeVersion: 'v22.1.0',
    created: '2026-10-03T00:00:00Z',
    root: dir,
  });
  assert.deepEqual(checkSbom(sbom, { require: ['zod'] }), []);
  assert.ok(sbom.packages.some((p) => p.name === 'Node.js' && p.versionInfo === '22.1.0'));
  assert.equal(sbom.relationships.filter((r) => r.relationshipType === 'CONTAINS').length, 3);
});

// Review of #404: the first checker passed these hand-built SBOMs. Each must now be refused, and
// the well-formed baseline must still pass, so a refusal is the check working, not a broken fixture.
const GOOD_INTEGRITY = 'sha512-O4v9tTzA+d1BsLuuKLe0QAdumr7v9ovCAcv6TL9prtf8ZCBSz7K+og5AwACLgBuvTbVoPpUoJpTJgh4kqsRY/A==';
function goodSbom(root = mkdtempSync(join(tmpdir(), 'sbom-good-'))) {
  return buildSbom({
    rootPackage: { name: '@cejel/cejel', version: '9.9.9', license: 'AGPL-3.0-only' },
    inventory: [
      { name: 'zod', version: '3.25.76', integrity: GOOD_INTEGRITY },
      { name: '@modelcontextprotocol/sdk', version: '1.0.0', integrity: GOOD_INTEGRITY },
    ],
    created: '2026-10-03T00:00:00Z',
    root,
  });
}
const REQUIRE = { require: ['zod', '@modelcontextprotocol/sdk'] };
const zodOf = (sbom) => sbom.packages.find((p) => p.name === 'zod');

test('hardened checker: the well-formed baseline passes', () => {
  assert.deepEqual(checkSbom(goodSbom(), REQUIRE), []);
});

test('hardened checker: refuses each SBOM the first version passed', () => {
  const cases = {
    'empty checksum': (s) => { zodOf(s).checksums[0].checksumValue = ''; },
    'non-hex checksum': (s) => { zodOf(s).checksums[0].checksumValue = 'z'.repeat(128); },
    'truncated checksum': (s) => { zodOf(s).checksums[0].checksumValue = 'ab'.repeat(8); },
    'all-zero checksum': (s) => { zodOf(s).checksums[0].checksumValue = '0'.repeat(128); },
    'checksums removed': (s) => { zodOf(s).checksums = []; },
    'versionInfo removed': (s) => { delete zodOf(s).versionInfo; },
    'duplicate SPDXID': (s) => { s.packages.push({ ...zodOf(s) }); },
    'duplicate name@version under a new SPDXID': (s) => { s.packages.push({ ...zodOf(s), SPDXID: 'SPDXRef-Package-zod-copy' }); },
    'no DESCRIBES': (s) => { s.relationships = s.relationships.filter((r) => r.relationshipType !== 'DESCRIBES'); delete s.documentDescribes; },
    'DESCRIBES points at nothing listed': (s) => {
      for (const r of s.relationships) if (r.relationshipType === 'DESCRIBES') r.relatedSpdxElement = 'SPDXRef-Nowhere';
      delete s.documentDescribes;
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const sbom = goodSbom();
    mutate(sbom);
    assert.notDeepEqual(checkSbom(sbom, REQUIRE), [], `${name} must be refused`);
  }
});

test('hardened checker: root-only SBOM is refused with or without --require', () => {
  const sbom = goodSbom();
  const rootIds = new Set(sbom.relationships.filter((r) => r.relationshipType === 'DESCRIBES').map((r) => r.relatedSpdxElement));
  sbom.packages = sbom.packages.filter((p) => rootIds.has(p.SPDXID));
  assert.notDeepEqual(checkSbom(sbom), []);
  sbom.relationships = [];
  assert.notDeepEqual(checkSbom(sbom), []);
});

test('hardened checker: a flag without a value is an error, not a skipped check', () => {
  assert.throws(() => parseArgs(['x.json', '--binary']), /--binary needs a value/);
  assert.throws(() => parseArgs(['x.json', '--require']), /--require needs a value/);
  assert.throws(() => parseArgs(['x.json', '--binary', '--require', 'zod']), /--binary needs a value/);
  assert.throws(() => parseArgs(['x.json', '--bogus']), /unknown option/);
  assert.deepEqual(parseArgs(['x.json', '--require', 'zod']), { sbomPath: 'x.json', binary: undefined, require: ['zod'] });
});

test('licence comes from the bundled copy in the pnpm store, and only when its version matches', () => {
  const root = mkdtempSync(join(tmpdir(), 'sbom-lic-'));
  const dir = join(root, 'node_modules/.pnpm/ajv@8.17.1/node_modules/ajv');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'ajv', version: '8.17.1', license: 'MIT' }));
  const build = (version) =>
    buildSbom({
      rootPackage: { name: '@cejel/cejel', version: '9.9.9', license: 'AGPL-3.0-only' },
      inventory: [{ name: 'ajv', version, integrity: GOOD_INTEGRITY, manifestDir: 'node_modules/.pnpm/ajv@8.17.1/node_modules/ajv' }],
      created: '2026-10-03T00:00:00Z',
      root,
    }).packages.find((p) => p.name === 'ajv').licenseDeclared;
  assert.equal(build('8.17.1'), 'MIT');
  assert.equal(build('9.0.0'), 'NOASSERTION');
});
