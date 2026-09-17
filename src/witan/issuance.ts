// Issuance v1 — a Barg Labs countersignature over a reproduced certificate.
//
// Two rules shape this module:
//
//   1. It never reads, holds, or derives private key material, and it never signs. Signing is
//      `ssh-keygen -Y sign -n cejel-issuance -U`, performed by the operator through ssh-agent
//      against a key that lives on a hardware token and exists as no file anywhere.
//   2. Verification is pure `node:crypto`. It spawns nothing and opens no socket, so the offline
//      boundary guard (src/__tests__/offline-boundary-guard.ts) stays exactly as strict as it is
//      for the scan path. The same property means `cejel verify` works on a disconnected machine
//      with no OpenSSH installed.
//
// A signature this module cannot verify is reported as unverified, never as valid. A signed
// certificate that cannot be checked is worse than an unsigned one.

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

import {
  WITAN_ISSUANCE_FORMAT_VERSION,
  WITAN_ISSUANCE_PREDICATE_TYPE,
  WITAN_ISSUANCE_PRINCIPAL,
  WITAN_ISSUANCE_SIGNATURE_NAMESPACE,
  WITAN_ISSUANCE_STATEMENT_TYPE,
  WITAN_ISSUER_NAME,
  type WitanIssuanceStatement,
  WitanIssuanceStatementSchema,
  type WitanReport,
} from './schemas.js';

/**
 * The limitations block, carried verbatim on every issuance. It is deliberately in the same
 * register as the self-generated attestation's: what is attested is reproduction of a
 * measurement at a pinned revision, and nothing else.
 */
export const WITAN_ISSUANCE_LIMITATIONS = [
  'Barg Labs Inc. attests only that it re-ran the named @cejel/cejel version at the named source revision and obtained byte-identical report.json content. It does not attest that the measurement itself is correct.',
  'This is not a statement about the safety, security, correctness, or fitness for purpose of the software, and it carries no warranty or guarantee of any kind.',
  'Nothing outside the pinned source tree was examined. Evidence absent from that tree was neither seen nor found to be absent.',
  'Reproduction is not coverage. Cejel measures observable repository signals; a criterion it cannot measure is reported as unmeasured rather than scored, and this statement does not convert that into a pass.',
] as const;

/** Key types this build can verify. Anything else is reported as unsupported, never as valid. */
export const WITAN_ISSUANCE_SUPPORTED_KEY_TYPES = ['ssh-ed25519'] as const;

const SSHSIG_MAGIC = 'SSHSIG';
const SSHSIG_VERSION = 1;
const SSHSIG_BEGIN = '-----BEGIN SSH SIGNATURE-----';
const SSHSIG_END = '-----END SSH SIGNATURE-----';
const SSHSIG_MAX_ARMORED_BYTES = 64 * 1024;
const SSHSIG_HASH_ALGORITHMS = new Set(['sha256', 'sha512']);
// SubjectPublicKeyInfo header for a raw 32-byte Ed25519 public key (RFC 8410).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

export function serializeWitanIssuance(statement: WitanIssuanceStatement): string {
  return JSON.stringify(statement, null, 2);
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// Statement construction
// ---------------------------------------------------------------------------

export interface CreateWitanIssuanceOptions {
  /** SHA-256 of the exact report.json bytes the vendor produced. */
  reportSha256: string;
  /** SHA-256 of the exact attestation.json bytes the vendor produced. */
  attestationSha256: string;
  /** OpenSSH fingerprint of the issuer signing key, as printed by `ssh-keygen -lf`. */
  issuerKeyFingerprint: string;
  /** The @cejel/cejel version the issuer re-ran. */
  toolVersion: string;
  /** UTC timestamp for this issuance. */
  issuedAt: string;
  /** Opaque issuer-chosen identifier. Never a counterparty name. */
  engagementRef: string;
}

/**
 * Builds the issuance statement for a report the issuer has ALREADY reproduced byte for byte.
 * The caller performs the reproduction; this function only records it, and there is no code path
 * that records a failed reproduction (see WitanIssuanceStatementSchema.reportByteIdentical).
 */
export function createWitanIssuanceStatement(
  report: WitanReport,
  options: CreateWitanIssuanceOptions,
): WitanIssuanceStatement {
  const sourceRevision = report.repo.headSha;
  if (!sourceRevision) {
    throw new Error(
      'Cejel: report.json records no repository revision (repo.headSha), so an issuance could not name what was reproduced.',
    );
  }

  return WitanIssuanceStatementSchema.parse({
    _type: WITAN_ISSUANCE_STATEMENT_TYPE,
    subject: [
      {
        name: `${report.productSlug}/report.json`,
        artifact: 'report.json',
        digest: { sha256: options.reportSha256 },
      },
      {
        name: `${report.productSlug}/attestation.json`,
        artifact: 'attestation.json',
        digest: { sha256: options.attestationSha256 },
      },
    ],
    predicateType: WITAN_ISSUANCE_PREDICATE_TYPE,
    predicate: {
      issuanceFormatVersion: WITAN_ISSUANCE_FORMAT_VERSION,
      issuer: { name: WITAN_ISSUER_NAME, keyFingerprint: options.issuerKeyFingerprint },
      reproduction: {
        sourceRevision,
        toolPackage: '@cejel/cejel',
        toolVersion: options.toolVersion,
        rubricVersion: report.rubricVersion,
        ...(report.rubricBehaviourFingerprint
          ? { rubricBehaviourFingerprint: report.rubricBehaviourFingerprint }
          : {}),
        reportByteIdentical: true,
      },
      issuedAt: options.issuedAt,
      engagementRef: options.engagementRef,
      limitations: [...WITAN_ISSUANCE_LIMITATIONS],
    },
  });
}

// ---------------------------------------------------------------------------
// Binding verification
// ---------------------------------------------------------------------------

export interface WitanIssuanceBindingVerification {
  valid: boolean;
  errors: string[];
}

export interface VerifyWitanIssuanceBindingOptions {
  /** SHA-256 of the exact report.json bytes supplied by the relying party. */
  reportSha256: string;
  /** SHA-256 of the exact attestation.json bytes supplied by the relying party. */
  attestationSha256: string;
  /** Product slug read from the supplied report.json. */
  productSlug: string;
}

export function verifyWitanIssuanceBinding(
  statement: unknown,
  options: VerifyWitanIssuanceBindingOptions,
): WitanIssuanceBindingVerification {
  const parsed = WitanIssuanceStatementSchema.safeParse(statement);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    };
  }

  const errors: string[] = [];
  const reportSubject = parsed.data.subject.find((entry) => entry.artifact === 'report.json');
  const attestationSubject = parsed.data.subject.find(
    (entry) => entry.artifact === 'attestation.json',
  );

  if (!reportSubject) {
    errors.push('issuance names no report.json subject');
  } else {
    if (reportSubject.digest.sha256 !== options.reportSha256) {
      errors.push('issuance report.json subject digest does not match the supplied report.json');
    }
    if (reportSubject.name !== `${options.productSlug}/report.json`) {
      errors.push('issuance report.json subject name does not match the report repository identity');
    }
  }

  if (!attestationSubject) {
    errors.push('issuance names no attestation.json subject');
  } else {
    if (attestationSubject.digest.sha256 !== options.attestationSha256) {
      errors.push(
        'issuance attestation.json subject digest does not match the supplied attestation.json',
      );
    }
    if (attestationSubject.name !== `${options.productSlug}/attestation.json`) {
      errors.push(
        'issuance attestation.json subject name does not match the report repository identity',
      );
    }
  }

  // Redundant with the schema literal, and deliberately so: this is the assertion the whole
  // artifact exists to carry, and it is checked where a reader looks for it.
  if (parsed.data.predicate.reproduction.reportByteIdentical !== true) {
    errors.push('issuance does not assert reportByteIdentical: true');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// allowed-signers parsing
// ---------------------------------------------------------------------------

export interface AllowedSignerEntry {
  /** Principals on this line, in order. */
  principals: string[];
  keyType: string;
  /** base64 of the SSH public-key blob, exactly as written in the file. */
  keyBase64: string;
  /** Namespaces this line is restricted to, or undefined when unrestricted. */
  namespaces?: string[];
  /** Raw option text this parser did not interpret. A line carrying one is never trusted. */
  uninterpretedOptions?: string;
}

const KEY_TYPE_PATTERN = /^(?:ssh-[a-z0-9]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9-]+@openssh\.com|[a-z0-9-]+@openssh\.com)$/;

function splitRespectingQuotes(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;
  for (const character of line) {
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (!quoted && /\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }
  if (quoted) throw new Error('unterminated quoted field');
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/**
 * Parses an OpenSSH allowed-signers file. Only the fields this verifier acts on are interpreted;
 * anything else on a line is retained as `uninterpretedOptions` and makes the line untrusted,
 * because silently ignoring an option such as `cert-authority` would widen what verifies.
 */
export function parseAllowedSigners(text: string): AllowedSignerEntry[] {
  const entries: AllowedSignerEntry[] = [];
  const lines = text.split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    let tokens: string[];
    try {
      tokens = splitRespectingQuotes(line);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`allowed-signers line ${index + 1}: ${message}`);
    }
    const [principalsToken, ...rest] = tokens;
    if (!principalsToken) continue;
    const keyTypeIndex = rest.findIndex((token) => KEY_TYPE_PATTERN.test(token));
    if (keyTypeIndex === -1) {
      throw new Error(`allowed-signers line ${index + 1}: no recognised key type`);
    }
    const keyType = rest[keyTypeIndex];
    const keyBase64 = rest[keyTypeIndex + 1];
    if (!keyType || !keyBase64) {
      throw new Error(`allowed-signers line ${index + 1}: key type is not followed by a key`);
    }
    const optionText = rest.slice(0, keyTypeIndex).join(' ');
    const entry: AllowedSignerEntry = {
      principals: principalsToken
        .split(',')
        .map((principal) => principal.replace(/^"|"$/g, '').trim())
        .filter((principal) => principal.length > 0),
      keyType,
      keyBase64,
    };
    if (optionText.length > 0) {
      const namespacesMatch = /^namespaces="([^"]*)"$/.exec(optionText);
      if (namespacesMatch?.[1] !== undefined) {
        entry.namespaces = namespacesMatch[1]
          .split(',')
          .map((namespace) => namespace.trim())
          .filter((namespace) => namespace.length > 0);
      } else {
        entry.uninterpretedOptions = optionText;
      }
    }
    entries.push(entry);
  }
  return entries;
}

export function sshPublicKeyFingerprint(keyBlob: Buffer): string {
  return `SHA256:${createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '')}`;
}

// ---------------------------------------------------------------------------
// SSHSIG parsing and verification (PROTOCOL.sshsig)
// ---------------------------------------------------------------------------

class SshWireReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readBytes(length: number): Buffer {
    if (length < 0 || this.offset + length > this.buffer.length) {
      throw new Error('truncated SSH wire encoding');
    }
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readUint32(): number {
    return this.readBytes(4).readUInt32BE(0);
  }

  readString(): Buffer {
    return this.readBytes(this.readUint32());
  }

  get remaining(): number {
    return this.buffer.length - this.offset;
  }
}

function sshString(value: Buffer | string): Buffer {
  const payload = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export interface ParsedSshSignature {
  publicKeyBlob: Buffer;
  keyType: string;
  namespace: string;
  hashAlgorithm: string;
  signatureBlob: Buffer;
}

export function parseSshSignature(armored: string): ParsedSshSignature {
  if (armored.length > SSHSIG_MAX_ARMORED_BYTES) {
    throw new Error('signature file is implausibly large for an SSH signature');
  }
  const lines = armored.split('\n').map((line) => line.replace(/\r$/, '').trim());
  const begin = lines.indexOf(SSHSIG_BEGIN);
  const end = lines.indexOf(SSHSIG_END);
  if (begin === -1 || end === -1 || end <= begin) {
    throw new Error('not an armored SSH signature (missing BEGIN/END SSH SIGNATURE lines)');
  }
  const body = lines.slice(begin + 1, end).join('');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) {
    throw new Error('armored SSH signature body is not base64');
  }
  const blob = Buffer.from(body, 'base64');

  const reader = new SshWireReader(blob);
  const magic = reader.readBytes(SSHSIG_MAGIC.length).toString('utf8');
  if (magic !== SSHSIG_MAGIC) throw new Error('signature is missing the SSHSIG preamble');
  const version = reader.readUint32();
  if (version !== SSHSIG_VERSION) {
    throw new Error(`unsupported SSHSIG version ${version}`);
  }
  const publicKeyBlob = reader.readString();
  const namespace = reader.readString().toString('utf8');
  const reserved = reader.readString();
  if (reserved.length !== 0) throw new Error('SSHSIG reserved field is not empty');
  const hashAlgorithm = reader.readString().toString('utf8');
  const signatureBlob = reader.readString();
  if (reader.remaining !== 0) throw new Error('trailing bytes after the SSHSIG structure');

  const keyType = new SshWireReader(publicKeyBlob).readString().toString('utf8');

  return { publicKeyBlob, keyType, namespace, hashAlgorithm, signatureBlob };
}

function ed25519PublicKeyFromBlob(publicKeyBlob: Buffer): ReturnType<typeof createPublicKey> {
  const reader = new SshWireReader(publicKeyBlob);
  const keyType = reader.readString().toString('utf8');
  if (keyType !== 'ssh-ed25519') throw new Error(`expected ssh-ed25519, found ${keyType}`);
  const rawKey = reader.readString();
  if (rawKey.length !== ED25519_PUBLIC_KEY_BYTES) {
    throw new Error('ssh-ed25519 public key is not 32 bytes');
  }
  if (reader.remaining !== 0) throw new Error('trailing bytes after the ssh-ed25519 public key');
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
    format: 'der',
    type: 'spki',
  });
}

function sshsigSignedData(
  namespace: string,
  hashAlgorithm: string,
  messageHash: Buffer,
): Buffer {
  return Buffer.concat([
    Buffer.from(SSHSIG_MAGIC, 'utf8'),
    sshString(namespace),
    sshString(''),
    sshString(hashAlgorithm),
    sshString(messageHash),
  ]);
}

// ---------------------------------------------------------------------------
// The verification verdict
// ---------------------------------------------------------------------------

export type WitanIssuanceSignatureVerdict =
  | { status: 'valid'; principal: string; keyType: string; fingerprint: string }
  /** Cryptographically sound, but the key is not in the published allowed-signers file. */
  | { status: 'unlisted_key'; keyType: string; fingerprint: string }
  /** The signature does not verify, is malformed, or carries the wrong namespace. */
  | { status: 'invalid'; reason: string }
  /** This build cannot verify this key type. Never reported as valid. */
  | { status: 'unsupported'; reason: string };

export interface VerifyWitanIssuanceSignatureOptions {
  /** Exact bytes of issuance.json, as they were signed. */
  message: Buffer;
  /** Contents of issuance.json.sig. */
  armoredSignature: string;
  /** Contents of docs/security/issuer-signers. */
  allowedSignersText: string;
  /** Principal the signature must be listed under. Defaults to issuance@barglabs.ai. */
  principal?: string;
  /** Signature namespace. Defaults to cejel-issuance. */
  namespace?: string;
}

export function verifyWitanIssuanceSignature(
  options: VerifyWitanIssuanceSignatureOptions,
): WitanIssuanceSignatureVerdict {
  const expectedNamespace = options.namespace ?? WITAN_ISSUANCE_SIGNATURE_NAMESPACE;
  const expectedPrincipal = options.principal ?? WITAN_ISSUANCE_PRINCIPAL;

  let parsed: ParsedSshSignature;
  try {
    parsed = parseSshSignature(options.armoredSignature);
  } catch (error: unknown) {
    return { status: 'invalid', reason: error instanceof Error ? error.message : String(error) };
  }

  if (parsed.namespace !== expectedNamespace) {
    return {
      status: 'invalid',
      reason: `signature namespace is ${JSON.stringify(parsed.namespace)}, expected ${JSON.stringify(expectedNamespace)}`,
    };
  }
  if (!SSHSIG_HASH_ALGORITHMS.has(parsed.hashAlgorithm)) {
    return {
      status: 'unsupported',
      reason: `signature hash algorithm ${JSON.stringify(parsed.hashAlgorithm)} is not one this build verifies`,
    };
  }
  if (!(WITAN_ISSUANCE_SUPPORTED_KEY_TYPES as readonly string[]).includes(parsed.keyType)) {
    return {
      status: 'unsupported',
      reason: `key type ${JSON.stringify(parsed.keyType)} is not one this build verifies (supported: ${WITAN_ISSUANCE_SUPPORTED_KEY_TYPES.join(', ')}); verify with OpenSSH instead — see docs/issuance.md`,
    };
  }

  const fingerprint = sshPublicKeyFingerprint(parsed.publicKeyBlob);

  let signatureVerified: boolean;
  try {
    const publicKey = ed25519PublicKeyFromBlob(parsed.publicKeyBlob);
    const signatureReader = new SshWireReader(parsed.signatureBlob);
    const signatureType = signatureReader.readString().toString('utf8');
    if (signatureType !== parsed.keyType) {
      return {
        status: 'invalid',
        reason: `inner signature type ${JSON.stringify(signatureType)} does not match the signing key type ${JSON.stringify(parsed.keyType)}`,
      };
    }
    const rawSignature = signatureReader.readString();
    if (rawSignature.length !== ED25519_SIGNATURE_BYTES) {
      return { status: 'invalid', reason: 'ssh-ed25519 signature is not 64 bytes' };
    }
    if (signatureReader.remaining !== 0) {
      return { status: 'invalid', reason: 'trailing bytes after the ssh-ed25519 signature' };
    }
    const messageHash = createHash(parsed.hashAlgorithm).update(options.message).digest();
    const signedData = sshsigSignedData(parsed.namespace, parsed.hashAlgorithm, messageHash);
    signatureVerified = cryptoVerify(null, signedData, publicKey, rawSignature);
  } catch (error: unknown) {
    return { status: 'invalid', reason: error instanceof Error ? error.message : String(error) };
  }

  if (!signatureVerified) {
    return { status: 'invalid', reason: 'the signature does not verify over these issuance bytes' };
  }

  let signers: AllowedSignerEntry[];
  try {
    signers = parseAllowedSigners(options.allowedSignersText);
  } catch (error: unknown) {
    return { status: 'invalid', reason: error instanceof Error ? error.message : String(error) };
  }
  // Fail closed, exactly as the calibration-signature gate does: an empty or key-less signers
  // file must never read the same as "anybody may sign".
  if (signers.length === 0) {
    return { status: 'unlisted_key', keyType: parsed.keyType, fingerprint };
  }

  const signedKeyBase64 = parsed.publicKeyBlob.toString('base64');
  const listed = signers.some(
    (entry) =>
      entry.uninterpretedOptions === undefined &&
      entry.keyType === parsed.keyType &&
      normalizeBase64(entry.keyBase64) === signedKeyBase64 &&
      entry.principals.includes(expectedPrincipal) &&
      (entry.namespaces === undefined || entry.namespaces.includes(expectedNamespace)),
  );
  if (!listed) {
    return { status: 'unlisted_key', keyType: parsed.keyType, fingerprint };
  }

  return { status: 'valid', principal: expectedPrincipal, keyType: parsed.keyType, fingerprint };
}

function normalizeBase64(value: string): string {
  return Buffer.from(value, 'base64').toString('base64');
}

// ---------------------------------------------------------------------------
// Revocations
// ---------------------------------------------------------------------------

export interface IssuerRevocation {
  reportSha256: string;
  date: string;
  reason: string;
}

const REVOCATION_LINE_PATTERN = /^([a-f0-9]{64})\s+(\d{4}-\d{2}-\d{2})\s+(\S.*)$/;

export function parseIssuerRevocations(text: string): IssuerRevocation[] {
  const revocations: IssuerRevocation[] = [];
  for (const [index, rawLine] of text.split('\n').entries()) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const match = REVOCATION_LINE_PATTERN.exec(line);
    if (!match?.[1] || !match[2] || !match[3]) {
      throw new Error(
        `issuer-revocations line ${index + 1} is not "<report-sha256> <YYYY-MM-DD> <reason>"`,
      );
    }
    revocations.push({ reportSha256: match[1], date: match[2], reason: match[3].trim() });
  }
  return revocations;
}

export function findIssuerRevocation(
  revocations: readonly IssuerRevocation[],
  reportSha256: string,
): IssuerRevocation | undefined {
  return revocations.find((revocation) => revocation.reportSha256 === reportSha256);
}

export interface AppendOnlyVerification {
  valid: boolean;
  errors: string[];
}

/**
 * The revocations file is append-only: a withdrawn issuance may never be quietly un-withdrawn.
 * Every line of the baseline — comments included, since the header carries the reading
 * instructions — must still be present, unchanged, and in the same order.
 */
export function verifyRevocationsAppendOnly(
  baselineText: string,
  currentText: string,
): AppendOnlyVerification {
  const baseline = significantLines(baselineText);
  const current = significantLines(currentText);
  const errors: string[] = [];

  if (current.length < baseline.length) {
    errors.push(
      `issuer-revocations lost ${baseline.length - current.length} line(s); the file is append-only`,
    );
  }
  for (const [index, baselineLine] of baseline.entries()) {
    const currentLine = current[index];
    if (currentLine === undefined) continue;
    if (currentLine !== baselineLine) {
      errors.push(
        `issuer-revocations line ${index + 1} changed from ${JSON.stringify(baselineLine)} to ${JSON.stringify(currentLine)}; the file is append-only`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

function significantLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, '').trimEnd())
    .filter((line) => line.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Issuer key argument
// ---------------------------------------------------------------------------

export interface IssuerPublicKey {
  keyType: string;
  keyBase64: string;
  fingerprint: string;
}

const PRIVATE_KEY_MARKER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

/**
 * Reads the issuer's PUBLIC key from `--key`. A private key file is refused outright: the issuer
 * key is generated on a hardware token and exists as no file, and cejel never handles private key
 * material. Signing goes through ssh-agent, via `ssh-keygen -Y sign -U`.
 */
export function parseIssuerPublicKey(contents: string): IssuerPublicKey {
  if (PRIVATE_KEY_MARKER.test(contents)) {
    throw new Error(
      'Cejel: --key names a file containing PRIVATE key material. Cejel never reads a private key and never signs: the issuer key is generated on a hardware token, exists as no file, and signs through ssh-agent. Pass the PUBLIC key (the .pub file) instead.',
    );
  }
  const line = contents
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.startsWith('#'));
  if (!line) throw new Error('Cejel: --key file contains no public key line.');
  const tokens = line.split(/\s+/);
  const [keyType, keyBase64] = tokens;
  if (!keyType || !keyBase64 || !KEY_TYPE_PATTERN.test(keyType)) {
    throw new Error(
      'Cejel: --key file is not an OpenSSH public key ("<keytype> <base64> [comment]").',
    );
  }
  let blob: Buffer;
  try {
    blob = Buffer.from(keyBase64, 'base64');
    const declaredType = new SshWireReader(blob).readString().toString('utf8');
    if (declaredType !== keyType) {
      throw new Error(`key blob declares ${declaredType} but the line says ${keyType}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cejel: --key file does not hold a decodable OpenSSH public key: ${message}`);
  }
  return { keyType, keyBase64, fingerprint: sshPublicKeyFingerprint(blob) };
}
