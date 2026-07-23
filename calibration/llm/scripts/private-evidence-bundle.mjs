#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUNDLE_KEY_ENV = 'CEJEL_LLM_CALIBRATION_BUNDLE_KEY';
export const BUNDLE_FORMAT = 'cejel-llm-private-evidence-bundle-v1';
export const BUNDLE_AAD = Buffer.from(`${BUNDLE_FORMAT}\nAES-256-GCM\n`, 'utf8');
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const MAX_ENVELOPE_BYTES = 96 * 1024 * 1024;

export const REQUIRED_INPUTS = Object.freeze([
  ['detector-freeze', 'detector-freeze.json'],
  ['golden-correction-ledger', 'golden-correction-ledger.json'],
  ['golden-manifest', 'golden-manifest.json'],
  ['golden-execution-evidence', 'golden-execution-evidence.json'],
  ['opportunity-manifest', 'opportunity-manifest.json'],
]);

const REQUIRED_NAMES = new Set(REQUIRED_INPUTS.map(([, name]) => name));
const ENVELOPE_KEYS = [
  'auth_tag_base64',
  'cipher',
  'ciphertext_base64',
  'format',
  'iv_base64',
];
const DOCUMENT_KEYS = ['files', 'format'];
const FILE_KEYS = ['content_base64', 'name', 'sha256'];

function fail(message) {
  throw new Error(`Private evidence bundle error: ${message}`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is malformed`);
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has an unsupported schema`);
  }
}

function decodeBase64(value, label, expectedBytes = null) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    fail(`${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) fail(`${label} is not canonical base64`);
  if (expectedBytes !== null && decoded.length !== expectedBytes) fail(`${label} has an invalid size`);
  return decoded;
}

export function readBundleKey(env = process.env) {
  const encoded = env[BUNDLE_KEY_ENV];
  if (!encoded) fail(`${BUNDLE_KEY_ENV} is required`);
  return decodeBase64(encoded, BUNDLE_KEY_ENV, 32);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertExistingPathIsNotSymlink(path) {
  if (!existsSync(path)) fail('path does not exist');
  if (lstatSync(path).isSymbolicLink()) fail('symbolic links are not allowed');
}

function readRegularFile(path, maxBytes, label) {
  if (!isAbsolute(path)) fail(`${label} path must be absolute`);
  assertExistingPathIsNotSymlink(path);
  const stat = lstatSync(path);
  if (!stat.isFile()) fail(`${label} must be a regular file`);
  if (stat.size > maxBytes) fail(`${label} exceeds the size limit`);
  return readFileSync(path);
}

function validateJsonObject(bytes, label) {
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`${label} is not valid UTF-8 JSON`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    fail(`${label} must contain a JSON object`);
  }
}

export function buildPrivateEvidenceDocument(pathsByFlag) {
  const files = [];
  let totalBytes = 0;
  for (const [flag, name] of REQUIRED_INPUTS) {
    const path = pathsByFlag.get(flag);
    if (!path) fail(`missing required input --${flag}`);
    const bytes = readRegularFile(path, MAX_FILE_BYTES, name);
    validateJsonObject(bytes, name);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) fail('input files exceed the total size limit');
    files.push({
      name,
      sha256: sha256(bytes),
      content_base64: bytes.toString('base64'),
    });
  }
  if (pathsByFlag.size !== REQUIRED_INPUTS.length) fail('duplicate or unsupported input name');
  return { format: BUNDLE_FORMAT, files };
}

export function sealPrivateEvidenceDocument(document, key, iv = randomBytes(12)) {
  validatePrivateEvidenceDocument(document);
  if (!Buffer.isBuffer(key) || key.length !== 32) fail('encryption key has an invalid size');
  if (!Buffer.isBuffer(iv) || iv.length !== 12) fail('encryption nonce has an invalid size');
  const plaintext = Buffer.from(`${JSON.stringify(document)}\n`, 'utf8');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(BUNDLE_AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    format: BUNDLE_FORMAT,
    cipher: 'AES-256-GCM',
    iv_base64: iv.toString('base64'),
    ciphertext_base64: ciphertext.toString('base64'),
    auth_tag_base64: cipher.getAuthTag().toString('base64'),
  };
}

export function validatePrivateEvidenceDocument(document) {
  exactKeys(document, DOCUMENT_KEYS, 'decrypted document');
  if (document.format !== BUNDLE_FORMAT || !Array.isArray(document.files)) {
    fail('decrypted document has an unsupported format');
  }
  if (document.files.length !== REQUIRED_INPUTS.length) {
    fail('decrypted document does not contain the required files');
  }
  const seen = new Set();
  let totalBytes = 0;
  for (const [index, file] of document.files.entries()) {
    exactKeys(file, FILE_KEYS, 'decrypted file entry');
    const expectedName = REQUIRED_INPUTS[index][1];
    if (file.name !== expectedName || !REQUIRED_NAMES.has(file.name) || seen.has(file.name)) {
      fail('decrypted document has an invalid, duplicate, or out-of-order file name');
    }
    seen.add(file.name);
    if (!/^[a-f0-9]{64}$/.test(file.sha256 || '')) fail('decrypted file digest is malformed');
    const bytes = decodeBase64(file.content_base64, 'decrypted file content');
    if (bytes.length > MAX_FILE_BYTES) fail('decrypted file exceeds the size limit');
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) fail('decrypted files exceed the total size limit');
    if (sha256(bytes) !== file.sha256) fail('decrypted file digest does not match');
    validateJsonObject(bytes, file.name);
  }
  return document;
}

export function openPrivateEvidenceEnvelope(envelopeBytes, key) {
  if (!Buffer.isBuffer(envelopeBytes) || envelopeBytes.length > MAX_ENVELOPE_BYTES) {
    fail('encrypted envelope exceeds the size limit');
  }
  let envelope;
  try {
    envelope = JSON.parse(envelopeBytes.toString('utf8'));
  } catch {
    fail('encrypted envelope is not valid JSON');
  }
  exactKeys(envelope, ENVELOPE_KEYS, 'encrypted envelope');
  if (envelope.format !== BUNDLE_FORMAT || envelope.cipher !== 'AES-256-GCM') {
    fail('encrypted envelope has an unsupported format');
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) fail('decryption key has an invalid size');
  const iv = decodeBase64(envelope.iv_base64, 'encryption nonce', 12);
  const authTag = decodeBase64(envelope.auth_tag_base64, 'authentication tag', 16);
  const ciphertext = decodeBase64(envelope.ciphertext_base64, 'ciphertext');
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(BUNDLE_AAD);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail('authentication failed');
  }
  let document;
  try {
    document = JSON.parse(plaintext.toString('utf8'));
  } catch {
    fail('decrypted document is not valid JSON');
  }
  return validatePrivateEvidenceDocument(document);
}

function writeExclusiveAtomic(path, bytes, mode = 0o600) {
  if (!isAbsolute(path)) fail('output path must be absolute');
  assertExistingPathIsNotSymlink(dirname(path));
  if (existsSync(path)) fail('output already exists');
  const temporaryDirectory = mkdtempSync(join(dirname(path), `.${basename(path)}.tmp-`));
  const temporaryPath = join(temporaryDirectory, 'payload');
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporaryPath, path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function encryptPrivateEvidence(pathsByFlag, outputPath, env = process.env) {
  const key = readBundleKey(env);
  const document = buildPrivateEvidenceDocument(pathsByFlag);
  const envelope = sealPrivateEvidenceDocument(document, key);
  writeExclusiveAtomic(outputPath, Buffer.from(`${JSON.stringify(envelope)}\n`, 'utf8'));
}

export function decryptPrivateEvidence(inputPath, outputDirectory, env = process.env) {
  const key = readBundleKey(env);
  const envelopeBytes = readRegularFile(inputPath, MAX_ENVELOPE_BYTES, 'encrypted bundle');
  if (!isAbsolute(outputDirectory)) fail('output directory must be absolute');
  assertExistingPathIsNotSymlink(dirname(outputDirectory));
  if (existsSync(outputDirectory)) fail('output directory already exists');
  const document = openPrivateEvidenceEnvelope(envelopeBytes, key);
  mkdirSync(outputDirectory, { mode: 0o700 });
  try {
    for (const file of document.files) {
      const bytes = decodeBase64(file.content_base64, 'decrypted file content');
      const outputPath = join(outputDirectory, file.name);
      const descriptor = openSync(
        outputPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      try {
        writeFileSync(descriptor, bytes);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    }
  } catch (error) {
    rmSync(outputDirectory, { recursive: true, force: true });
    throw error;
  }
}

function parseCli(argv) {
  const [command, ...args] = argv;
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option?.startsWith('--') || value === undefined) fail('invalid command arguments');
    const name = option.slice(2);
    if (options.has(name)) fail('duplicate command option');
    options.set(name, value);
  }
  return { command, options };
}

function cli(argv) {
  const { command, options } = parseCli(argv);
  if (command === 'encrypt') {
    const output = options.get('output');
    const inputs = new Map(REQUIRED_INPUTS.map(([flag]) => [flag, options.get(flag)]));
    if (!output || [...inputs.values()].some((value) => !value)) fail('encrypt inputs are incomplete');
    if (options.size !== REQUIRED_INPUTS.length + 1) fail('encrypt has unsupported options');
    encryptPrivateEvidence(inputs, output);
    process.stdout.write('Encrypted private evidence bundle created.\n');
    return;
  }
  if (command === 'decrypt') {
    const input = options.get('input');
    const outputDirectory = options.get('output-dir');
    if (!input || !outputDirectory || options.size !== 2) fail('decrypt inputs are incomplete');
    decryptPrivateEvidence(input, outputDirectory);
    process.stdout.write('Private evidence bundle decrypted.\n');
    return;
  }
  fail('command must be encrypt or decrypt');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Private evidence bundle error'}\n`);
    process.exitCode = 1;
  }
}
