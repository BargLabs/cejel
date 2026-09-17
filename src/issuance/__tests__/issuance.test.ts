import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  WITAN_ISSUANCE_LIMITATIONS,
  createWitanIssuanceStatement,
  findIssuerRevocation,
  parseAllowedSigners,
  parseIssuerPublicKey,
  parseIssuerRevocations,
  parseSshSignature,
  serializeWitanIssuance,
  sshPublicKeyFingerprint,
  verifyRevocationsAppendOnly,
  verifyWitanIssuanceBinding,
  verifyWitanIssuanceSignature,
} from '../issuance.js';
import { WitanReportSchema, type WitanReport } from '../../witan/schemas.js';

const temporaryDirectories: string[] = [];

function scratch(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface TestKey {
  privatePath: string;
  publicPath: string;
  keyType: string;
  keyBase64: string;
}

/** Test keys are generated inside the test run and never committed. */
function generateKey(directory: string, name: string, type = 'ed25519'): TestKey {
  const privatePath = join(directory, name);
  execFileSync('ssh-keygen', [
    '-q',
    '-t',
    type,
    ...(type === 'rsa' ? ['-b', '2048'] : []),
    '-N',
    '',
    '-C',
    `${name}@test.invalid`,
    '-f',
    privatePath,
  ]);
  const publicPath = `${privatePath}.pub`;
  const [keyType, keyBase64] = readFileSync(publicPath, 'utf8').trim().split(/\s+/);
  if (!keyType || !keyBase64) throw new Error('ssh-keygen produced an unreadable public key');
  return { privatePath, publicPath, keyType, keyBase64 };
}

function signWithOpenSsh(key: TestKey, namespace: string, payloadPath: string): string {
  execFileSync('ssh-keygen', ['-Y', 'sign', '-q', '-n', namespace, '-f', key.privatePath, payloadPath]);
  return readFileSync(`${payloadPath}.sig`, 'utf8');
}

function signersLine(key: TestKey, principal = 'issuance@barglabs.ai', options = ''): string {
  return `${principal} ${options ? `${options} ` : ''}${key.keyType} ${key.keyBase64}\n`;
}

const MESSAGE = '{\n  "issuance": "fixture"\n}';

function writeMessage(directory: string, name = 'issuance.json'): string {
  const path = join(directory, name);
  writeFileSync(path, MESSAGE, 'utf8');
  return path;
}

function sampleReport(overrides: Partial<WitanReport> = {}): WitanReport {
  return WitanReportSchema.parse({
    productSlug: 'sample-product',
    productDisplayName: 'Sample Product',
    repo: { url: 'https://example.invalid/sample', headSha: 'a'.repeat(40) },
    rubricVersion: 'witan-rubric-v17-2026-07-24',
    verdict: 'conditional',
    codeTrustScore: 3,
    processTrustScore: 2.5,
    overallScore: 2.75,
    criteria: [
      {
        id: 'A1',
        title: 'Tests',
        category: 'code_trust',
        score: 3,
        status: 'verified',
        evidence: [{ kind: 'repository', label: 'repo', path: 'package.json' }],
        findings: [],
        metrics: [],
      },
    ],
    ...overrides,
  }) as WitanReport;
}

describe('SSHSIG verification against real OpenSSH signatures', () => {
  it('accepts a signature made by a listed key under the cejel-issuance namespace', () => {
    const directory = scratch('cejel-issuance-valid-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-issuance', payloadPath);

    const verdict = verifyWitanIssuanceSignature({
      message: readFileSync(payloadPath),
      armoredSignature,
      allowedSignersText: signersLine(key),
    });

    expect(verdict.status).toBe('valid');
    if (verdict.status !== 'valid') throw new Error('unreachable');
    expect(verdict.principal).toBe('issuance@barglabs.ai');
    expect(verdict.keyType).toBe('ssh-ed25519');
    expect(verdict.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it('agrees with `ssh-keygen -Y verify`, the documented no-Cejel path', () => {
    const directory = scratch('cejel-issuance-openssh-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-issuance', payloadPath);
    const signersPath = join(directory, 'issuer-signers');
    writeFileSync(signersPath, signersLine(key), 'utf8');

    // The exact command docs/issuance.md hands a relying party.
    const opensshOutput = execFileSync(
      'ssh-keygen',
      [
        '-Y',
        'verify',
        '-f',
        signersPath,
        '-I',
        'issuance@barglabs.ai',
        '-n',
        'cejel-issuance',
        '-s',
        `${payloadPath}.sig`,
      ],
      { input: readFileSync(payloadPath), encoding: 'utf8' },
    );
    expect(opensshOutput).toContain('Good "cejel-issuance" signature');

    expect(
      verifyWitanIssuanceSignature({
        message: readFileSync(payloadPath),
        armoredSignature,
        allowedSignersText: signersLine(key),
      }).status,
    ).toBe('valid');

    // ... and both reject the same tampered bytes.
    const tampered = Buffer.from(`${MESSAGE} `, 'utf8');
    expect(() =>
      execFileSync(
        'ssh-keygen',
        [
          '-Y',
          'verify',
          '-f',
          signersPath,
          '-I',
          'issuance@barglabs.ai',
          '-n',
          'cejel-issuance',
          '-s',
          `${payloadPath}.sig`,
        ],
        { input: tampered, stdio: 'pipe' },
      ),
    ).toThrow();
    expect(
      verifyWitanIssuanceSignature({
        message: tampered,
        armoredSignature,
        allowedSignersText: signersLine(key),
      }).status,
    ).toBe('invalid');
  });

  it('reports a key that is not in the signers file as an unlisted key, never as valid', () => {
    const directory = scratch('cejel-issuance-unlisted-');
    const listed = generateKey(directory, 'listed');
    const stranger = generateKey(directory, 'stranger');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(stranger, 'cejel-issuance', payloadPath);

    const verdict = verifyWitanIssuanceSignature({
      message: readFileSync(payloadPath),
      armoredSignature,
      allowedSignersText: signersLine(listed),
    });

    expect(verdict.status).toBe('unlisted_key');
    if (verdict.status !== 'unlisted_key') throw new Error('unreachable');
    expect(verdict.fingerprint).toBe(
      sshPublicKeyFingerprint(Buffer.from(stranger.keyBase64, 'base64')),
    );
  });

  it('fails closed on an empty signers file rather than reading it as "anybody may sign"', () => {
    const directory = scratch('cejel-issuance-empty-signers-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-issuance', payloadPath);

    expect(
      verifyWitanIssuanceSignature({
        message: readFileSync(payloadPath),
        armoredSignature,
        allowedSignersText: '# no key is listed here\n',
      }).status,
    ).toBe('unlisted_key');
  });

  it('refuses a signature made under another namespace', () => {
    const directory = scratch('cejel-issuance-namespace-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-calibration', payloadPath);

    const verdict = verifyWitanIssuanceSignature({
      message: readFileSync(payloadPath),
      armoredSignature,
      allowedSignersText: signersLine(key),
    });
    expect(verdict.status).toBe('invalid');
    if (verdict.status !== 'invalid') throw new Error('unreachable');
    expect(verdict.reason).toContain('cejel-calibration');
  });

  it('does not trust a signers line whose namespaces option excludes cejel-issuance', () => {
    const directory = scratch('cejel-issuance-ns-option-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-issuance', payloadPath);

    expect(
      verifyWitanIssuanceSignature({
        message: readFileSync(payloadPath),
        armoredSignature,
        allowedSignersText: signersLine(key, 'issuance@barglabs.ai', 'namespaces="git"'),
      }).status,
    ).toBe('unlisted_key');
  });

  it('does not trust a signers line carrying an option it did not interpret', () => {
    const directory = scratch('cejel-issuance-opaque-option-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-issuance', payloadPath);

    expect(
      verifyWitanIssuanceSignature({
        message: readFileSync(payloadPath),
        armoredSignature,
        allowedSignersText: signersLine(key, 'issuance@barglabs.ai', 'cert-authority'),
      }).status,
    ).toBe('unlisted_key');
  });

  it('refuses a signature listed under a different principal', () => {
    const directory = scratch('cejel-issuance-principal-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-issuance', payloadPath);

    expect(
      verifyWitanIssuanceSignature({
        message: readFileSync(payloadPath),
        armoredSignature,
        allowedSignersText: signersLine(key, 'calibration@barglabs.ai'),
      }).status,
    ).toBe('unlisted_key');
  });

  it('reports a key type it cannot verify as unsupported, never as valid', () => {
    const directory = scratch('cejel-issuance-rsa-');
    const key = generateKey(directory, 'issuer-rsa', 'rsa');
    const payloadPath = writeMessage(directory);
    const armoredSignature = signWithOpenSsh(key, 'cejel-issuance', payloadPath);

    const verdict = verifyWitanIssuanceSignature({
      message: readFileSync(payloadPath),
      armoredSignature,
      allowedSignersText: signersLine(key),
    });
    expect(verdict.status).toBe('unsupported');
    if (verdict.status !== 'unsupported') throw new Error('unreachable');
    expect(verdict.reason).toContain('ssh-ed25519');
  });

  it('rejects a malformed or truncated signature file without throwing', () => {
    for (const armoredSignature of [
      '',
      'not a signature at all',
      '-----BEGIN SSH SIGNATURE-----\nnot base64 ***\n-----END SSH SIGNATURE-----\n',
      '-----BEGIN SSH SIGNATURE-----\nAAAA\n-----END SSH SIGNATURE-----\n',
    ]) {
      expect(
        verifyWitanIssuanceSignature({
          message: Buffer.from(MESSAGE, 'utf8'),
          armoredSignature,
          allowedSignersText: 'issuance@barglabs.ai ssh-ed25519 AAAA\n',
        }).status,
      ).toBe('invalid');
    }
  });

  it('parses the SSHSIG envelope OpenSSH produced', () => {
    const directory = scratch('cejel-issuance-parse-');
    const key = generateKey(directory, 'issuer');
    const payloadPath = writeMessage(directory);
    const parsed = parseSshSignature(signWithOpenSsh(key, 'cejel-issuance', payloadPath));

    expect(parsed.keyType).toBe('ssh-ed25519');
    expect(parsed.namespace).toBe('cejel-issuance');
    expect(parsed.hashAlgorithm).toBe('sha512');
    expect(parsed.publicKeyBlob.toString('base64')).toBe(key.keyBase64);
  });

  it('computes the same fingerprint OpenSSH prints', () => {
    const directory = scratch('cejel-issuance-fingerprint-');
    const key = generateKey(directory, 'issuer');
    const printed = execFileSync('ssh-keygen', ['-lf', key.publicPath], { encoding: 'utf8' });
    const fingerprint = sshPublicKeyFingerprint(Buffer.from(key.keyBase64, 'base64'));
    expect(printed).toContain(fingerprint);
  });
});

describe('allowed-signers parsing', () => {
  it('reads principals, key type, key and a namespaces option', () => {
    const entries = parseAllowedSigners(
      [
        '# a comment',
        '',
        'issuance@barglabs.ai,backup@barglabs.ai namespaces="cejel-issuance" ssh-ed25519 AAAAC3Nz',
      ].join('\n'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.principals).toEqual(['issuance@barglabs.ai', 'backup@barglabs.ai']);
    expect(entries[0]?.keyType).toBe('ssh-ed25519');
    expect(entries[0]?.keyBase64).toBe('AAAAC3Nz');
    expect(entries[0]?.namespaces).toEqual(['cejel-issuance']);
  });

  it('retains an option it did not interpret instead of ignoring it', () => {
    const entries = parseAllowedSigners('issuance@barglabs.ai cert-authority ssh-ed25519 AAAA\n');
    expect(entries[0]?.uninterpretedOptions).toBe('cert-authority');
  });

  it('throws on a line with no recognisable key type', () => {
    expect(() => parseAllowedSigners('issuance@barglabs.ai not-a-key-type AAAA\n')).toThrow(
      /no recognised key type/,
    );
  });
});

describe('issuer public key argument', () => {
  it('refuses a private key file and says why', () => {
    const directory = scratch('cejel-issuance-privkey-');
    const key = generateKey(directory, 'issuer');
    expect(() => parseIssuerPublicKey(readFileSync(key.privatePath, 'utf8'))).toThrow(
      /PRIVATE key material/,
    );
  });

  it('accepts a public key and reports its fingerprint', () => {
    const directory = scratch('cejel-issuance-pubkey-');
    const key = generateKey(directory, 'issuer');
    const parsed = parseIssuerPublicKey(readFileSync(key.publicPath, 'utf8'));
    expect(parsed.keyType).toBe('ssh-ed25519');
    expect(parsed.fingerprint).toBe(
      sshPublicKeyFingerprint(Buffer.from(key.keyBase64, 'base64')),
    );
  });

  it('refuses a file that is not an OpenSSH public key', () => {
    expect(() => parseIssuerPublicKey('hello\n')).toThrow(/not an OpenSSH public key/);
  });
});

describe('issuance statement', () => {
  it('records the reproduction and carries the limitations block verbatim', () => {
    const statement = createWitanIssuanceStatement(sampleReport(), {
      reportSha256: 'a'.repeat(64),
      attestationSha256: 'b'.repeat(64),
      issuerKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
      toolVersion: '0.4.10',
      issuedAt: '2026-09-17T00:00:00.000Z',
      engagementRef: 'ER-0001',
    });

    expect(statement.predicate.reproduction.reportByteIdentical).toBe(true);
    expect(statement.predicate.reproduction.sourceRevision).toBe('a'.repeat(40));
    expect(statement.predicate.issuer.name).toBe('Barg Labs Inc.');
    expect(statement.predicate.limitations).toEqual([...WITAN_ISSUANCE_LIMITATIONS]);
    expect(statement.subject.map((entry) => entry.artifact)).toEqual([
      'report.json',
      'attestation.json',
    ]);
    expect(serializeWitanIssuance(statement)).toContain('"reportByteIdentical": true');
  });

  it('refuses to name a reproduction when the report pins no revision', () => {
    const report = sampleReport({ repo: { url: 'https://example.invalid/sample' } });
    expect(() =>
      createWitanIssuanceStatement(report, {
        reportSha256: 'a'.repeat(64),
        attestationSha256: 'b'.repeat(64),
        issuerKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
        toolVersion: '0.4.10',
        issuedAt: '2026-09-17T00:00:00.000Z',
        engagementRef: 'ER-0001',
      }),
    ).toThrow(/records no repository revision/);
  });

  it('has no representation for a failed reproduction', () => {
    const statement = createWitanIssuanceStatement(sampleReport(), {
      reportSha256: 'a'.repeat(64),
      attestationSha256: 'b'.repeat(64),
      issuerKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
      toolVersion: '0.4.10',
      issuedAt: '2026-09-17T00:00:00.000Z',
      engagementRef: 'ER-0001',
    });
    const falsified = JSON.parse(serializeWitanIssuance(statement)) as {
      predicate: { reproduction: { reportByteIdentical: boolean } };
    };
    falsified.predicate.reproduction.reportByteIdentical = false;

    const binding = verifyWitanIssuanceBinding(falsified, {
      reportSha256: 'a'.repeat(64),
      attestationSha256: 'b'.repeat(64),
      productSlug: 'sample-product',
    });
    expect(binding.valid).toBe(false);
  });

  it('rejects a binding whose subjects name other bytes', () => {
    const statement = createWitanIssuanceStatement(sampleReport(), {
      reportSha256: 'a'.repeat(64),
      attestationSha256: 'b'.repeat(64),
      issuerKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
      toolVersion: '0.4.10',
      issuedAt: '2026-09-17T00:00:00.000Z',
      engagementRef: 'ER-0001',
    });

    const binding = verifyWitanIssuanceBinding(statement, {
      reportSha256: 'c'.repeat(64),
      attestationSha256: 'b'.repeat(64),
      productSlug: 'sample-product',
    });
    expect(binding.valid).toBe(false);
    expect(binding.errors.join(' ')).toContain('report.json subject digest');
  });
});

describe('issuer revocations', () => {
  const entryDigest = 'f'.repeat(64);

  it('parses an entry and finds it by report digest', () => {
    const revocations = parseIssuerRevocations(
      `# header\n${entryDigest} 2026-09-20 The scan was run against a tree that was not the pinned revision.\n`,
    );
    expect(revocations).toHaveLength(1);
    expect(findIssuerRevocation(revocations, entryDigest)?.date).toBe('2026-09-20');
    expect(findIssuerRevocation(revocations, 'a'.repeat(64))).toBeUndefined();
  });

  it('throws on a malformed line rather than silently reading zero revocations', () => {
    expect(() => parseIssuerRevocations('not-a-digest 2026-09-20 reason\n')).toThrow(
      /is not "<report-sha256> <YYYY-MM-DD> <reason>"/,
    );
    expect(() => parseIssuerRevocations(`${entryDigest} 2026-09-20\n`)).toThrow();
  });

  it('accepts an append and refuses a removal, an edit, or a reorder', () => {
    const baseline = `# header\n${entryDigest} 2026-09-20 First withdrawal.\n`;
    const second = `${'e'.repeat(64)} 2026-09-21 Second withdrawal.\n`;

    expect(verifyRevocationsAppendOnly(baseline, `${baseline}${second}`).valid).toBe(true);

    const removed = verifyRevocationsAppendOnly(baseline, '# header\n');
    expect(removed.valid).toBe(false);
    expect(removed.errors.join(' ')).toContain('append-only');

    const edited = verifyRevocationsAppendOnly(
      baseline,
      `# header\n${entryDigest} 2026-09-20 First withdrawal, actually fine.\n`,
    );
    expect(edited.valid).toBe(false);

    const reordered = verifyRevocationsAppendOnly(
      `${baseline}${second}`,
      `# header\n${second}${entryDigest} 2026-09-20 First withdrawal.\n`,
    );
    expect(reordered.valid).toBe(false);
  });
});
