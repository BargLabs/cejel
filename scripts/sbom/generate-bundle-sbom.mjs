#!/usr/bin/env node
/**
 * Generate an SPDX 2.3 SBOM from what the bundler actually bundled.
 *
 * Scanners cannot see inside a bundled artefact (syft on a Node SEA blob, BuildKit on an image
 * whose package.json has no dependencies), so the inventory is taken from the esbuild metafile:
 * every input under node_modules/ is mapped to a package name, and the exact version is read from
 * pnpm-lock.yaml. A bundled input whose package/version is not in the lockfile is a hard error.
 *
 *   node scripts/sbom/generate-bundle-sbom.mjs --metafile <name|path> --out <file>
 *        [--binary <path> --node-version <vX.Y.Z>] [--lockfile pnpm-lock.yaml]
 *        [--package-json package.json]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `node_modules/.pnpm/@scope+name@1.2.3_peer@4/node_modules/@scope/name/x.js` -> name + pnpm dir. */
export function packageFromInputPath(inputPath) {
  const normalized = inputPath.replaceAll('\\', '/');
  const marker = 'node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) return undefined;
  const parts = normalized.slice(index + marker.length).split('/');
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  const pnpmMatch = normalized.match(/node_modules\/\.pnpm\/([^/]+)\/node_modules\//);
  // The directory holding the bundled copy's own package.json, e.g.
  // node_modules/.pnpm/ajv@8.17.1/node_modules/ajv: its licence is the one that shipped.
  const manifestDir = `${normalized.slice(0, index + marker.length)}${name}`;
  return { name, pnpmDir: pnpmMatch ? pnpmMatch[1] : undefined, manifestDir };
}

/** Parse the `packages:` section of a pnpm v9 lockfile: name -> [{version, integrity}]. */
export function parseLockfilePackages(lockfileText) {
  const packages = new Map();
  const lines = lockfileText.split('\n');
  let inPackages = false;
  let current;
  for (const line of lines) {
    if (/^\S/.test(line)) {
      inPackages = line.startsWith('packages:');
      current = undefined;
      continue;
    }
    if (!inPackages) continue;
    const key = line.match(/^ {2}'?((?:@[^/@']+\/)?[^@'\s][^@']*)@([^':\s]+)'?:\s*$/);
    if (key) {
      current = { name: key[1], version: key[2], integrity: undefined };
      if (!packages.has(current.name)) packages.set(current.name, []);
      packages.get(current.name).push(current);
      continue;
    }
    const integrity = current && line.match(/resolution: \{integrity: (sha\d+-[A-Za-z0-9+/=]+)/);
    if (integrity) current.integrity = integrity[1];
  }
  return packages;
}

export function inventoryFromMetafile(metafile, lockfilePackages) {
  const found = new Map();
  for (const inputPath of Object.keys(metafile.inputs ?? {})) {
    const pkg = packageFromInputPath(inputPath);
    if (!pkg) continue;
    const candidates = lockfilePackages.get(pkg.name) ?? [];
    const dirPrefix = `${pkg.name.replace('/', '+')}@`;
    const dirMatches = (c) =>
      pkg.pnpmDir === `${dirPrefix}${c.version}` || pkg.pnpmDir.startsWith(`${dirPrefix}${c.version}_`);
    let entry;
    // A pnpm path names its version; a lone lockfile candidate must agree with it (review of #404).
    if (pkg.pnpmDir) entry = candidates.find(dirMatches);
    else if (candidates.length === 1) entry = candidates[0];
    if (!entry) {
      throw new Error(
        `bundled input ${inputPath} maps to ${pkg.name}, which has no unambiguous version in the lockfile; refusing to guess.`,
      );
    }
    const key = `${entry.name}@${entry.version}`;
    if (!found.has(key)) found.set(key, { ...entry, manifestDir: pkg.manifestDir });
  }
  return [...found.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

function spdxId(prefix, text) {
  return `SPDXRef-${prefix}-${text.replace(/[^A-Za-z0-9.-]/g, '-')}`;
}

function sriToSpdxChecksum(integrity) {
  const match = integrity?.match(/^(sha\d+)-(.+)$/);
  if (!match) return [];
  const algorithm = match[1].toUpperCase();
  if (!['SHA1', 'SHA256', 'SHA384', 'SHA512'].includes(algorithm)) return [];
  return [{ algorithm, checksumValue: Buffer.from(match[2], 'base64').toString('hex') }];
}

// The licence of the copy that was bundled: read from the manifest beside the bundled files (the
// pnpm store path from the metafile), then the hoisted copy, and only when its version matches.
// Reading only <root>/node_modules/<name> gave NOASSERTION for every package pnpm does not hoist
// (6 of 10 bundled packages; review of #404) and could read a different version.
function installedLicense(entry, root) {
  const dirs = [entry.manifestDir, join('node_modules', entry.name)].filter(Boolean);
  for (const dir of dirs) {
    const manifest = join(root, dir, 'package.json');
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
    if (parsed.version !== entry.version) continue;
    const license = parsed.license;
    return typeof license === 'string' && license.length > 0 ? license : 'NOASSERTION';
  }
  return 'NOASSERTION';
}

export function buildSbom({ rootPackage, inventory, binary, nodeVersion, created, root = REPO_ROOT }) {
  const rootId = 'SPDXRef-Package-cejel';
  const packages = [
    {
      SPDXID: rootId,
      name: rootPackage.name,
      versionInfo: rootPackage.version,
      downloadLocation: `https://registry.npmjs.org/${rootPackage.name}/-/${basename(rootPackage.name)}-${rootPackage.version}.tgz`,
      filesAnalyzed: false,
      licenseConcluded: rootPackage.license,
      licenseDeclared: rootPackage.license,
      copyrightText: 'NOASSERTION',
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: `pkg:npm/${rootPackage.name.replace('@', '%40')}@${rootPackage.version}`,
        },
      ],
    },
  ];
  const bundledIds = [];
  for (const entry of inventory) {
    const id = spdxId('Package', `${entry.name}-${entry.version}`);
    bundledIds.push(id);
    const license = installedLicense(entry, root);
    packages.push({
      SPDXID: id,
      name: entry.name,
      versionInfo: entry.version,
      downloadLocation: `https://registry.npmjs.org/${entry.name}/-/${basename(entry.name)}-${entry.version}.tgz`,
      filesAnalyzed: false,
      checksums: sriToSpdxChecksum(entry.integrity),
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: license,
      copyrightText: 'NOASSERTION',
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: `pkg:npm/${entry.name.replace('@', '%40')}@${entry.version}`,
        },
      ],
    });
  }
  if (nodeVersion) {
    const id = 'SPDXRef-Package-nodejs-runtime';
    bundledIds.push(id);
    packages.push({
      SPDXID: id,
      name: 'Node.js',
      versionInfo: nodeVersion.replace(/^v/, ''),
      downloadLocation: 'https://nodejs.org/dist/',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'MIT',
      copyrightText: 'NOASSERTION',
      comment: 'Node.js runtime embedded in the single-executable binary.',
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: `pkg:generic/node@${nodeVersion.replace(/^v/, '')}`,
        },
      ],
    });
  }

  const relationships = [
    { spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: rootId },
  ];
  const files = [];
  if (binary) {
    const bytes = readFileSync(binary);
    const fileId = 'SPDXRef-File-binary';
    files.push({
      SPDXID: fileId,
      fileName: `./${basename(binary)}`,
      checksums: [
        { algorithm: 'SHA1', checksumValue: createHash('sha1').update(bytes).digest('hex') },
        { algorithm: 'SHA256', checksumValue: createHash('sha256').update(bytes).digest('hex') },
      ],
      licenseConcluded: 'NOASSERTION',
      copyrightText: 'NOASSERTION',
    });
    relationships.push({ spdxElementId: rootId, relationshipType: 'CONTAINS', relatedSpdxElement: fileId });
    for (const id of bundledIds) {
      relationships.push({ spdxElementId: fileId, relationshipType: 'CONTAINS', relatedSpdxElement: id });
    }
  } else {
    for (const id of bundledIds) {
      relationships.push({ spdxElementId: rootId, relationshipType: 'CONTAINS', relatedSpdxElement: id });
    }
  }

  const digest = createHash('sha256')
    .update(JSON.stringify({ packages, files }))
    .digest('hex');
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${rootPackage.name}@${rootPackage.version}${binary ? `:${basename(binary)}` : ''}`,
    documentNamespace: `https://cejel.dev/spdx/${rootPackage.version}/${digest}`,
    creationInfo: {
      created,
      creators: ['Tool: cejel-generate-bundle-sbom'],
      comment:
        'Inventory of packages bundled into the artefact, taken from the bundler metafile and exact versions from pnpm-lock.yaml. Not a scan of the artefact.',
    },
    packages,
    ...(files.length > 0 ? { files } : {}),
    relationships,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`generate-bundle-sbom: ${flag} requires a value.`);
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.metafile || !options.out) {
    throw new Error('usage: generate-bundle-sbom.mjs --metafile <name|path> --out <file> [--binary <path> --node-version <v>]');
  }
  if (Boolean(options.binary) !== Boolean(options['node-version'])) {
    throw new Error('--binary and --node-version go together: a binary SBOM names the runtime it embeds.');
  }
  const metafilePath = options.metafile.includes('/') || options.metafile.endsWith('.json')
    ? resolve(options.metafile)
    : join(REPO_ROOT, '.build', 'metafiles', `${options.metafile}.json`);
  const metafile = JSON.parse(readFileSync(metafilePath, 'utf8'));
  const lockfile = parseLockfilePackages(readFileSync(resolve(options.lockfile ?? join(REPO_ROOT, 'pnpm-lock.yaml')), 'utf8'));
  const manifest = JSON.parse(readFileSync(resolve(options['package-json'] ?? join(REPO_ROOT, 'package.json')), 'utf8'));
  const inventory = inventoryFromMetafile(metafile, lockfile);
  if (inventory.length === 0) {
    throw new Error(`metafile ${metafilePath} bundles no node_modules package; refusing to write an empty inventory.`);
  }
  const epoch = process.env.SOURCE_DATE_EPOCH;
  const created = (epoch ? new Date(Number(epoch) * 1000) : new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  const sbom = buildSbom({
    rootPackage: { name: manifest.name, version: manifest.version, license: manifest.license ?? 'NOASSERTION' },
    inventory,
    binary: options.binary ? resolve(options.binary) : undefined,
    nodeVersion: options['node-version'],
    created,
  });
  writeFileSync(resolve(options.out), `${JSON.stringify(sbom, null, 2)}\n`);
  process.stdout.write(`${options.out}: ${inventory.length} bundled packages${options.binary ? ' + Node.js runtime + binary file' : ''}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
