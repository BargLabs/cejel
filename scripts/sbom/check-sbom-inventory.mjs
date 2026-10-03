#!/usr/bin/env node
/**
 * Refuse an SBOM that describes nothing.
 *
 *   node scripts/sbom/check-sbom-inventory.mjs <sbom.json> [--binary <path>] [--require <pkg>]...
 *
 * Refusals: no npm package other than the root; any all-zero checksum; a required package missing;
 * with --binary, no file entry carrying that binary's real SHA-256.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function purlOf(pkg) {
  return (pkg.externalRefs ?? []).find((ref) => ref.referenceType === 'purl')?.referenceLocator;
}

export function checkSbom(sbom, { binarySha256, require = [] } = {}) {
  const problems = [];
  const packages = sbom.packages ?? [];
  const describedIds = new Set(
    (sbom.relationships ?? [])
      .filter((r) => r.relationshipType === 'DESCRIBES')
      .map((r) => r.relatedSpdxElement),
  );
  for (const id of sbom.documentDescribes ?? []) describedIds.add(id);

  const npmPackages = packages.filter(
    (pkg) => !describedIds.has(pkg.SPDXID) && purlOf(pkg)?.startsWith('pkg:npm/'),
  );
  if (npmPackages.length === 0) {
    problems.push(
      `lists no npm package other than the root (${packages.length} package(s) total): the inventory is empty.`,
    );
  }
  for (const wanted of require) {
    if (!npmPackages.some((pkg) => pkg.name === wanted)) {
      problems.push(`required bundled package ${wanted} is not listed.`);
    }
  }

  const zeroChecksum = (c) => /^0+$/.test(String(c.checksumValue ?? ''));
  for (const holder of [...packages, ...(sbom.files ?? [])]) {
    for (const checksum of holder.checksums ?? []) {
      if (zeroChecksum(checksum)) {
        problems.push(
          `${holder.SPDXID ?? holder.name} carries an all-zero ${checksum.algorithm} checksum: nothing was hashed.`,
        );
      }
    }
  }

  if (binarySha256) {
    const hasBinary = (sbom.files ?? []).some((file) =>
      (file.checksums ?? []).some(
        (c) => c.algorithm === 'SHA256' && c.checksumValue.toLowerCase() === binarySha256,
      ),
    );
    if (!hasBinary) problems.push(`no file entry carries the binary's SHA-256 ${binarySha256}.`);
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  let sbomPath;
  let binary;
  const require = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--binary') binary = args[++i];
    else if (args[i] === '--require') require.push(args[++i]);
    else if (!sbomPath) sbomPath = args[i];
    else throw new Error(`check-sbom-inventory: unexpected argument ${args[i]}`);
  }
  if (!sbomPath) throw new Error('usage: check-sbom-inventory.mjs <sbom.json> [--binary <path>] [--require <pkg>]...');
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
