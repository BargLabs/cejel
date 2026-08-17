import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const V22_CALIBRATION_RUBRIC = 'witan-rubric-v22-prospective-2026-08-10';
export const V22_CALIBRATION_MANIFEST = 'v22-calibration-manifest.json';
export const V22_CALIBRATION_RECEIPT = 'v22-calibration-receipt.json';
export const V22_CALIBRATION_ARTIFACTS = Object.freeze([
  'report.json',
  'summary.json',
  'attestation.json',
  'certificate.html',
  'badge.json',
  'badge.svg',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requiredRegularFile(outputDirectory, name) {
  const path = join(outputDirectory, name);
  if (!existsSync(path)) throw new Error(`v22 calibration required artifact missing: ${name}`);
  if (!lstatSync(path).isFile()) throw new Error(`v22 calibration artifact is not a regular file: ${name}`);
  return { name, bytes: readFileSync(path) };
}

function readJson(outputDirectory, name) {
  const { bytes } = requiredRegularFile(outputDirectory, name);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(
      `v22 calibration artifact is not valid JSON: ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertV22Selection(report, attestation) {
  if (report?.rubricVersion !== V22_CALIBRATION_RUBRIC) {
    throw new Error('v22 calibration report does not identify the explicit v22 rubric');
  }
  if (attestation?.predicate?.rubricVersion !== V22_CALIBRATION_RUBRIC) {
    throw new Error('v22 calibration attestation does not identify the explicit v22 rubric');
  }
}

function manifestPayload(outputDirectory) {
  const report = readJson(outputDirectory, 'report.json');
  const attestation = readJson(outputDirectory, 'attestation.json');
  assertV22Selection(report, attestation);
  return {
    schema_version: '1.0.0',
    driver: 'cejel-v22-public-calibration',
    rubric_version: V22_CALIBRATION_RUBRIC,
    artifacts: Object.fromEntries(
      V22_CALIBRATION_ARTIFACTS.map((name) => {
        const { bytes } = requiredRegularFile(outputDirectory, name);
        return [name, { sha256: sha256(bytes), bytes: bytes.length }];
      }),
    ),
  };
}

export function writeV22CalibrationManifest(outputDirectory) {
  const output = resolve(outputDirectory);
  const manifest = manifestPayload(output);
  const path = join(output, V22_CALIBRATION_MANIFEST);
  if (existsSync(path)) throw new Error('v22 calibration manifest already exists; refusing to replace it');
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { path, manifest };
}

export async function verifyV22CalibrationArtifacts(outputDirectory) {
  const output = resolve(outputDirectory);
  const manifestBytes = requiredRegularFile(output, V22_CALIBRATION_MANIFEST).bytes;
  const manifest = readJson(output, V22_CALIBRATION_MANIFEST);
  if (manifest?.schema_version !== '1.0.0' || manifest?.driver !== 'cejel-v22-public-calibration') {
    throw new Error('v22 calibration manifest has an unexpected schema or driver');
  }
  if (manifest?.rubric_version !== V22_CALIBRATION_RUBRIC) {
    throw new Error('v22 calibration manifest does not identify the explicit v22 rubric');
  }

  const expected = manifestPayload(output);
  if (JSON.stringify(manifest.artifacts) !== JSON.stringify(expected.artifacts)) {
    throw new Error('v22 calibration manifest artifact closure does not match emitted artifact bytes');
  }

  const detectorRoot = resolve(new URL('../../..', import.meta.url).pathname);
  const { WitanReportSchema, verifyWitanAttestationBinding } = await import(
    pathToFileURL(join(detectorRoot, 'dist/index.js')).href,
  );
  const report = readJson(output, 'report.json');
  const attestation = readJson(output, 'attestation.json');
  const parsedReport = WitanReportSchema.safeParse(report);
  if (!parsedReport.success) throw new Error('v22 calibration report fails the Cejel report schema');
  const binding = verifyWitanAttestationBinding(attestation, parsedReport.data, {
    reportSha256: sha256(requiredRegularFile(output, 'report.json').bytes),
  });
  if (!binding.valid) {
    throw new Error(`v22 calibration report/attestation binding failed: ${binding.errors.join('; ')}`);
  }

  const receipt = {
    schema_version: '1.0.0',
    verifier: 'cejel-v22-public-calibration-artifact-verifier',
    rubric_version: V22_CALIBRATION_RUBRIC,
    manifest: { path: V22_CALIBRATION_MANIFEST, sha256: sha256(manifestBytes) },
    report_attestation_binding: 'verified',
    artifact_closure: expected.artifacts,
  };
  const receiptPath = join(output, V22_CALIBRATION_RECEIPT);
  if (existsSync(receiptPath)) throw new Error('v22 calibration receipt already exists; refusing to replace it');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return { path: receiptPath, receipt };
}

function usage() {
  return `usage: ${basename(process.argv[1] ?? 'verify-v22-public-calibration-artifacts.mjs')} <output-directory>`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [output] = process.argv.slice(2);
  if (!output || process.argv.length !== 3) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 64;
  } else {
    verifyV22CalibrationArtifacts(output)
      .then(({ path }) => process.stdout.write(`v22 calibration receipt verified: ${path}\n`))
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      });
  }
}
