#!/usr/bin/env node
/**
 * Refuse an SBOM that describes nothing, or describes it without the fields that make it checkable.
 *
 *   node scripts/sbom/check-sbom-inventory.mjs <sbom.json> [--binary <path>] [--require <pkg>]...
 *
 * Refusals (hardened after the review of #404, which fed 13 hand-built SBOMs through the first
 * version and saw it pass empty checksums, duplicates, stripped versions and a root-only SBOM):
 *   - the document names no root (no DESCRIBES relationship and no documentDescribes);
 *   - no npm package other than the root;
 *   - an npm package without a versionInfo, a purl that pins that version, or at least one
 *     checksum;
 *   - any checksum that is not lower/upper hex of its algorithm's length, or is all zeros;
 *   - a duplicated SPDXID, or the same npm name@version listed twice;
 *   - a required package missing;
 *   - with --binary, no file entry carrying that binary's real SHA-256.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX_LENGTH = { SHA1: 40, SHA224: 56, SHA256: 64, SHA384: 96, SHA512: 128, MD5: 32 };

function purlOf(pkg) {
  return (pkg.externalRefs ?? []).find((ref) => ref.referenceType === 'purl')?.referenceLocator;
}

/** `pkg:npm/%40scope/name@1.2.3?q#sub` -> { name: '@scope/name', version: '1.2.3' }; qualifiers and subpath ignored. */
function parseNpmPurl(purl) {
  const core = String(purl).split('#')[0].split('?')[0].slice('pkg:npm/'.length);
  const at = core.lastIndexOf('@');
  if (at <= 0) return undefined;
  try {
    return { name: decodeURIComponent(core.slice(0, at)), version: decodeURIComponent(core.slice(at + 1)) };
  } catch {
    return undefined;
  }
}

function checksumProblem(checksum) {
  const algorithm = String(checksum.algorithm ?? '').toUpperCase();
  const value = String(checksum.checksumValue ?? '');
  const length = HEX_LENGTH[algorithm];
  if (length === undefined) return `uses an unrecognised checksum algorithm ${JSON.stringify(checksum.algorithm)}`;
  if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value)) {
    return `carries a malformed ${algorithm} checksum (${value.length} chars; expected ${length} hex)`;
  }
  if (/^0+$/.test(value)) return `carries an all-zero ${algorithm} checksum: nothing was hashed`;
  return undefined;
}

export function checkSbom(sbom, { binarySha256, require = [] } = {}) {
  const problems = [];
  const packages = sbom.packages ?? [];
  const files = sbom.files ?? [];
  const describedIds = new Set(
    (sbom.relationships ?? [])
      .filter((r) => r.relationshipType === 'DESCRIBES')
      .map((r) => r.relatedSpdxElement),
  );
  for (const id of sbom.documentDescribes ?? []) describedIds.add(id);
  const knownIds = new Set([...packages, ...files].map((x) => x.SPDXID));
  if (![...describedIds].some((id) => knownIds.has(id))) {
    problems.push('does not say which of its packages or files it describes (no DESCRIBES to a listed element): no root.');
  }

  const seenIds = new Set();
  for (const holder of [...packages, ...files]) {
    if (!holder.SPDXID) problems.push(`${holder.name ?? holder.fileName ?? 'an element'} has no SPDXID.`);
    else if (seenIds.has(holder.SPDXID)) problems.push(`lists SPDXID ${holder.SPDXID} more than once.`);
    seenIds.add(holder.SPDXID);
  }
  // A described (root) package skips the per-package checks below, so only one npm root is allowed:
  // otherwise marking a bare package as described would smuggle it past them (review of #404).
  const npmRoots = packages.filter((pkg) => describedIds.has(pkg.SPDXID) && purlOf(pkg)?.startsWith('pkg:npm/'));
  if (npmRoots.length > 1) problems.push(`describes ${npmRoots.length} npm packages as roots; exactly one root is expected.`);

  const npmPackages = packages.filter(
    (pkg) => !describedIds.has(pkg.SPDXID) && purlOf(pkg)?.startsWith('pkg:npm/'),
  );
  if (npmPackages.length === 0) {
    problems.push(
      `lists no npm package other than the root (${packages.length} package(s) total): the inventory is empty.`,
    );
  }
  const seenNpm = new Set();
  for (const pkg of npmPackages) {
    const label = pkg.SPDXID ?? pkg.name;
    const version = typeof pkg.versionInfo === 'string' ? pkg.versionInfo : '';
    if (!version || /^(NOASSERTION|NONE)$/i.test(version)) problems.push(`${label} has no real versionInfo (${JSON.stringify(pkg.versionInfo)}).`);
    else {
      const purl = parseNpmPurl(purlOf(pkg));
      if (!purl || purl.name !== pkg.name || purl.version !== version) {
        problems.push(`${label} purl ${purlOf(pkg)} does not name ${pkg.name}@${version}.`);
      }
    }
    if ((pkg.checksums ?? []).length === 0) problems.push(`${label} carries no checksum.`);
    const key = `${pkg.name}@${version}`;
    if (seenNpm.has(key)) problems.push(`lists ${key} more than once.`);
    seenNpm.add(key);
  }
  for (const wanted of require) {
    if (!npmPackages.some((pkg) => pkg.name === wanted && pkg.versionInfo)) {
      problems.push(`required bundled package ${wanted} is not listed with a version.`);
    }
  }

  for (const holder of [...packages, ...files]) {
    for (const checksum of holder.checksums ?? []) {
      const problem = checksumProblem(checksum);
      if (problem) problems.push(`${holder.SPDXID ?? holder.name} ${problem}.`);
    }
  }

  if (binarySha256) {
    const hasBinary = files.some((file) =>
      (file.checksums ?? []).some(
        (c) => String(c.algorithm).toUpperCase() === 'SHA256' && String(c.checksumValue).toLowerCase() === binarySha256,
      ),
    );
    if (!hasBinary) problems.push(`no file entry carries the binary's SHA-256 ${binarySha256}.`);
  }
  return problems;
}

/** Parse argv; a flag without a value is an error, never silently ignored (review of #404). */
export function parseArgs(args) {
  let sbomPath;
  let binary;
  const require = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--binary' || arg === '--require') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`check-sbom-inventory: ${arg} needs a value`);
      i += 1;
      if (arg === '--binary') binary = value;
      else require.push(value);
    } else if (arg.startsWith('--')) throw new Error(`check-sbom-inventory: unknown option ${arg}`);
    else if (!sbomPath) sbomPath = arg;
    else throw new Error(`check-sbom-inventory: unexpected argument ${arg}`);
  }
  if (!sbomPath) throw new Error('usage: check-sbom-inventory.mjs <sbom.json> [--binary <path>] [--require <pkg>]...');
  return { sbomPath, binary, require };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const { sbomPath, binary, require } = parsed;
  const sbom = JSON.parse(readFileSync(resolve(sbomPath), 'utf8'));
  const binarySha256 = binary ? createHash('sha256').update(readFileSync(resolve(binary))).digest('hex') : undefined;
  const problems = checkSbom(sbom, { binarySha256, require });
  if (problems.length > 0) {
    process.stderr.write(`SBOM REFUSED ${sbomPath}:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`SBOM ok ${sbomPath}: ${sbom.packages.length} package(s)\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
