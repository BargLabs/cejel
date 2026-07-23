import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUNDLE_KEY_ENV,
  MAX_FILE_BYTES,
  REQUIRED_INPUTS,
  buildPrivateEvidenceDocument,
  decryptPrivateEvidence,
  encryptPrivateEvidence,
  openPrivateEvidenceEnvelope,
  sealPrivateEvidenceDocument,
} from './private-evidence-bundle.mjs';

const SCRIPT = fileURLToPath(new URL('./private-evidence-bundle.mjs', import.meta.url));
const REPOSITORY_ROOT = resolve(dirname(SCRIPT), '../../..');
const WORKFLOW = join(REPOSITORY_ROOT, '.github/workflows/llm-calibration.yml');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cejel-private-bundle-test-'));
  const input = join(root, 'input');
  mkdirSync(input);
  const paths = new Map();
  for (const [flag, name] of REQUIRED_INPUTS) {
    const path = join(input, name);
    writeFileSync(path, `${JSON.stringify({ schema_version: 'synthetic-v1', name })}\n`);
    paths.set(flag, path);
  }
  const key = randomBytes(32);
  const env = { [BUNDLE_KEY_ENV]: key.toString('base64') };
  return { root, paths, key, env };
}

function encryptedFixture() {
  const context = fixture();
  const bundle = join(context.root, 'private-evidence.cejel');
  encryptPrivateEvidence(context.paths, bundle, context.env);
  return { ...context, bundle };
}

test('round trips exactly the five required named JSON inputs with private output modes', () => {
  const { root, paths, env, bundle } = encryptedFixture();
  const output = join(root, 'decrypted');
  decryptPrivateEvidence(bundle, output, env);
  assert.equal(statSync(bundle).mode & 0o777, 0o600);
  assert.equal(statSync(output).mode & 0o777, 0o700);
  for (const [flag, name] of REQUIRED_INPUTS) {
    assert.deepEqual(readFileSync(join(output, name)), readFileSync(paths.get(flag)));
    assert.equal(statSync(join(output, name)).mode & 0o777, 0o600);
  }
});

test('rejects a wrong key and authenticated-envelope tampering', () => {
  const { bundle, key } = encryptedFixture();
  const bytes = readFileSync(bundle);
  assert.throws(
    () => openPrivateEvidenceEnvelope(bytes, randomBytes(32)),
    /authentication failed/,
  );
  const envelope = JSON.parse(bytes);
  const ciphertext = Buffer.from(envelope.ciphertext_base64, 'base64');
  ciphertext[0] ^= 1;
  envelope.ciphertext_base64 = ciphertext.toString('base64');
  assert.throws(
    () => openPrivateEvidenceEnvelope(Buffer.from(JSON.stringify(envelope)), key),
    /authentication failed/,
  );
});

test('rejects traversal, duplicate, unknown, and out-of-order decrypted names', () => {
  const { paths, key } = fixture();
  const base = buildPrivateEvidenceDocument(paths);
  for (const mutate of [
    (document) => { document.files[0].name = '../detector-freeze.json'; },
    (document) => { document.files[1].name = document.files[0].name; },
    (document) => { document.files[0].name = 'other.json'; },
    (document) => { [document.files[0], document.files[1]] = [document.files[1], document.files[0]]; },
  ]) {
    const document = structuredClone(base);
    mutate(document);
    assert.throws(() => sealPrivateEvidenceDocument(document, key), /file name/);
  }
});

test('rejects malformed schemas, non-object JSON, and non-canonical keys', () => {
  const { paths, key } = fixture();
  const badJson = paths.get('golden-manifest');
  writeFileSync(badJson, '[]\n');
  assert.throws(() => buildPrivateEvidenceDocument(paths), /JSON object/);

  const { paths: validPaths } = fixture();
  const document = buildPrivateEvidenceDocument(validPaths);
  const envelope = sealPrivateEvidenceDocument(document, key, Buffer.alloc(12, 7));
  assert.throws(
    () => openPrivateEvidenceEnvelope(
      Buffer.from(JSON.stringify({ ...envelope, unexpected: true })),
      key,
    ),
    /unsupported schema/,
  );
});

test('rejects invalid UTF-8 even when replacement decoding would produce valid JSON', () => {
  const { paths } = fixture();
  writeFileSync(
    paths.get('detector-freeze'),
    Buffer.concat([
      Buffer.from('{"value":"', 'utf8'),
      Buffer.from([0xff]),
      Buffer.from('"}\n', 'utf8'),
    ]),
  );
  assert.throws(() => buildPrivateEvidenceDocument(paths), /not valid UTF-8 JSON/);
});

test('enforces per-file size limits before encryption', () => {
  const { paths } = fixture();
  writeFileSync(paths.get('opportunity-manifest'), Buffer.alloc(MAX_FILE_BYTES + 1, 0x20));
  assert.throws(() => buildPrivateEvidenceDocument(paths), /size limit/);
});

test('rejects symlink input files and symlink encrypted bundles', () => {
  const first = fixture();
  const target = first.paths.get('detector-freeze');
  const link = join(first.root, 'linked-input.json');
  symlinkSync(target, link);
  first.paths.set('detector-freeze', link);
  assert.throws(() => buildPrivateEvidenceDocument(first.paths), /symbolic links/);

  const second = encryptedFixture();
  const bundleLink = join(second.root, 'linked-bundle.cejel');
  symlinkSync(second.bundle, bundleLink);
  assert.throws(
    () => decryptPrivateEvidence(bundleLink, join(second.root, 'output'), second.env),
    /symbolic links/,
  );
});

test('uses exclusive outputs and never overwrites a bundle or decrypted directory', () => {
  const { root, paths, env } = fixture();
  const bundle = join(root, 'bundle.cejel');
  writeFileSync(bundle, 'sentinel');
  assert.throws(() => encryptPrivateEvidence(paths, bundle, env), /already exists/);
  assert.equal(readFileSync(bundle, 'utf8'), 'sentinel');

  const encrypted = encryptedFixture();
  const output = join(encrypted.root, 'output');
  mkdirSync(output);
  writeFileSync(join(output, 'sentinel'), 'keep');
  assert.throws(() => decryptPrivateEvidence(encrypted.bundle, output, encrypted.env), /already exists/);
  assert.equal(readFileSync(join(output, 'sentinel'), 'utf8'), 'keep');
});

test('CLI errors and output never disclose the bundle key', () => {
  const { root, bundle } = encryptedFixture();
  const secret = randomBytes(32).toString('base64');
  const result = spawnSync(
    process.execPath,
    [SCRIPT, 'decrypt', '--input', bundle, '--output-dir', join(root, 'wrong-key-output')],
    {
      encoding: 'utf8',
      env: { ...process.env, [BUNDLE_KEY_ENV]: secret },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /authentication failed/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
});

test('workflow rejects missing untouched transport before checkout and decrypts only into runner.temp', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const preflight = workflow.indexOf('Validate private transport selection before checkout');
  const checkout = workflow.indexOf('actions/checkout@');
  const decrypt = workflow.indexOf('Decrypt untouched private evidence bundle');
  assert.ok(preflight >= 0 && preflight < checkout);
  assert.ok(decrypt > checkout);
  assert.match(workflow, /CEJEL_LLM_CALIBRATION_BUNDLE_KEY: \$\{\{ secrets\.CEJEL_LLM_CALIBRATION_BUNDLE_KEY \}\}/);
  assert.match(workflow, /PRIVATE_EVIDENCE_BUNDLE: \$\{\{ inputs\.private_evidence_bundle \}\}/);
  assert.match(workflow, /node calibration\/llm\/scripts\/private-evidence-bundle\.mjs decrypt/);
  assert.match(workflow, /--output-dir "\$RUNNER_TEMP\/llm-private-evidence"/);
  assert.doesNotMatch(workflow, /inputs\.(detector_freeze|golden_correction_ledger|golden_manifest|golden_execution_evidence|opportunity_manifest)\s*\}\}/);
  assert.match(workflow, /--detector-freeze "\$RUNNER_TEMP\/llm-private-evidence\/detector-freeze\.json"/);
  assert.match(workflow, /--opportunity-manifest "\$RUNNER_TEMP\/llm-private-evidence\/opportunity-manifest\.json"/);
});
