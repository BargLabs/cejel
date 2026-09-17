import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { runWitanFreeCli } from '../index.js';

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

function git(repoPath: string, argv: readonly string[]): string {
  return execFileSync('git', argv, { cwd: repoPath, encoding: 'utf8' }).trim();
}

/** A small, committed repository so report.json carries a real repo.headSha to pin. */
function fixtureRepo(): string {
  const repoPath = scratch('cejel-issuance-repo-');
  git(repoPath, ['init', '--quiet']);
  git(repoPath, ['config', 'user.name', 'Cejel Test']);
  git(repoPath, ['config', 'user.email', 'cejel@example.invalid']);
  git(repoPath, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const value = 42;\n');
  writeFileSync(join(repoPath, 'src', 'index.test.ts'), "it('works', () => {});\n");
  writeFileSync(
    join(repoPath, 'package.json'),
    '{"name":"issuance-fixture","version":"1.0.0","scripts":{"test":"vitest run"}}\n',
  );
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '--quiet', '--no-gpg-sign', '-m', 'fixture']);
  return repoPath;
}

interface TestKey {
  privatePath: string;
  publicPath: string;
  keyType: string;
  keyBase64: string;
}

/** Generated per run inside the test. No key is ever committed. */
function generateKey(directory: string, name: string): TestKey {
  const privatePath = join(directory, name);
  execFileSync('ssh-keygen', [
    '-q',
    '-t',
    'ed25519',
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

function sign(key: TestKey, payloadPath: string): string {
  execFileSync('ssh-keygen', [
    '-Y',
    'sign',
    '-q',
    '-n',
    'cejel-issuance',
    '-f',
    key.privatePath,
    payloadPath,
  ]);
  return `${payloadPath}.sig`;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function captureCli(args: readonly string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const exitCode = await runWitanFreeCli(args);
    return {
      exitCode,
      stdout: stdoutSpy.mock.calls.map((call) => String(call[0])).join(''),
      stderr: stderrSpy.mock.calls.map((call) => String(call[0])).join(''),
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}

interface Certificate {
  repoPath: string;
  outDir: string;
  reportPath: string;
  attestationPath: string;
  reportSha256: string;
  attestationSha256: string;
}

async function scanFixture(): Promise<Certificate> {
  const repoPath = fixtureRepo();
  const outDir = scratch('cejel-issuance-out-');
  expect(await runWitanFreeCli([repoPath, '--out', outDir, '--quiet'])).toBe(0);
  const reportPath = join(outDir, 'report.json');
  const attestationPath = join(outDir, 'attestation.json');
  return {
    repoPath,
    outDir,
    reportPath,
    attestationPath,
    reportSha256: sha256File(reportPath),
    attestationSha256: sha256File(attestationPath),
  };
}

const SIGNERS_PRINCIPAL = 'issuance@barglabs.ai';

function writeSigners(directory: string, key: TestKey, principal = SIGNERS_PRINCIPAL): string {
  const path = join(directory, 'issuer-signers');
  writeFileSync(path, `${principal} ${key.keyType} ${key.keyBase64} issuer\n`, 'utf8');
  return path;
}

function writeRevocations(directory: string, lines: readonly string[] = []): string {
  const path = join(directory, 'issuer-revocations');
  writeFileSync(path, `# withdrawn issuances\n${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');
  return path;
}

describe('cejel issue', () => {
  it('writes an issuance without touching report.json or attestation.json', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-key-');
    const key = generateKey(keyDir, 'issuer');

    const result = await captureCli([
      'issue',
      certificate.repoPath,
      '--report',
      certificate.reportPath,
      '--attestation',
      certificate.attestationPath,
      '--key',
      key.publicPath,
      '--engagement-ref',
      'ER-2026-0001',
    ]);

    expect(result.exitCode).toBe(0);
    const issuancePath = join(certificate.outDir, 'issuance.json');
    expect(existsSync(issuancePath)).toBe(true);

    // The vendor's artifacts are byte-identical before and after issuance.
    expect(sha256File(certificate.reportPath)).toBe(certificate.reportSha256);
    expect(sha256File(certificate.attestationPath)).toBe(certificate.attestationSha256);

    const issuance = JSON.parse(readFileSync(issuancePath, 'utf8')) as {
      subject: Array<{ artifact: string; digest: { sha256: string } }>;
      predicate: {
        issuer: { name: string; keyFingerprint: string };
        reproduction: { reportByteIdentical: boolean; sourceRevision: string };
        engagementRef: string;
      };
    };
    expect(issuance.predicate.issuer.name).toBe('Barg Labs Inc.');
    expect(issuance.predicate.reproduction.reportByteIdentical).toBe(true);
    expect(issuance.predicate.engagementRef).toBe('ER-2026-0001');
    expect(
      issuance.subject.find((entry) => entry.artifact === 'report.json')?.digest.sha256,
    ).toBe(certificate.reportSha256);
    expect(
      issuance.subject.find((entry) => entry.artifact === 'attestation.json')?.digest.sha256,
    ).toBe(certificate.attestationSha256);

    // cejel prints the signing command; it never runs it and never reads a private key.
    expect(result.stdout).toContain('ssh-keygen -Y sign -n cejel-issuance');
    expect(result.stdout).toContain('-U');
  });

  it('refuses when the re-run does not reproduce report.json byte for byte', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-key-mismatch-');
    const key = generateKey(keyDir, 'issuer');

    // The tree moves after the certificate was produced.
    writeFileSync(join(certificate.repoPath, 'src', 'added.ts'), 'export const added = 1;\n');
    git(certificate.repoPath, ['add', '.']);
    git(certificate.repoPath, ['commit', '--quiet', '--no-gpg-sign', '-m', 'drift']);

    const result = await captureCli([
      'issue',
      certificate.repoPath,
      '--report',
      certificate.reportPath,
      '--attestation',
      certificate.attestationPath,
      '--key',
      key.publicPath,
      '--engagement-ref',
      'ER-2026-0002',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('refusing to issue');
    expect(result.stderr).toContain(`sha256:${certificate.reportSha256}`);
    // Both digests are printed, so the reader can see exactly what diverged.
    expect(result.stderr.match(/sha256:[a-f0-9]{64}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(certificate.outDir, 'issuance.json'))).toBe(false);
  });

  it('refuses a private key file path', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-key-private-');
    const key = generateKey(keyDir, 'issuer');

    await expect(
      captureCli([
        'issue',
        certificate.repoPath,
        '--report',
        certificate.reportPath,
        '--attestation',
        certificate.attestationPath,
        '--key',
        key.privatePath,
        '--engagement-ref',
        'ER-2026-0003',
      ]),
    ).rejects.toThrow(/PRIVATE key material/);
    expect(existsSync(join(certificate.outDir, 'issuance.json'))).toBe(false);
  });

  it('requires every mandatory argument rather than issuing a partial statement', async () => {
    await expect(captureCli(['issue', '.'])).rejects.toThrow(
      /--report, --attestation, --key, --engagement-ref/,
    );
  });
});

describe('cejel verify with an issuance pair', () => {
  it('reports signature, binding and revocation in three lines', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-verify-key-');
    const key = generateKey(keyDir, 'issuer');
    expect(
      (
        await captureCli([
          'issue',
          certificate.repoPath,
          '--report',
          certificate.reportPath,
          '--attestation',
          certificate.attestationPath,
          '--key',
          key.publicPath,
          '--engagement-ref',
          'ER-2026-0004',
        ])
      ).exitCode,
    ).toBe(0);

    const issuancePath = join(certificate.outDir, 'issuance.json');
    const signaturePath = sign(key, issuancePath);
    const signersPath = writeSigners(keyDir, key);
    const revocationsPath = writeRevocations(keyDir);

    const result = await captureCli([
      'verify',
      certificate.reportPath,
      certificate.attestationPath,
      issuancePath,
      signaturePath,
      '--signers',
      signersPath,
      '--revocations',
      revocationsPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('signature:  valid — signed by issuance@barglabs.ai');
    expect(result.stdout).toContain('binding:    valid');
    expect(result.stdout).toContain('revocation: not revoked');
  });

  it('rejects a tampered issuance.json', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-tamper-key-');
    const key = generateKey(keyDir, 'issuer');
    await captureCli([
      'issue',
      certificate.repoPath,
      '--report',
      certificate.reportPath,
      '--attestation',
      certificate.attestationPath,
      '--key',
      key.publicPath,
      '--engagement-ref',
      'ER-2026-0005',
    ]);

    const issuancePath = join(certificate.outDir, 'issuance.json');
    const signaturePath = sign(key, issuancePath);
    const tampered = JSON.parse(readFileSync(issuancePath, 'utf8')) as {
      predicate: { engagementRef: string };
    };
    tampered.predicate.engagementRef = 'ER-2026-9999';
    writeFileSync(issuancePath, JSON.stringify(tampered, null, 2), 'utf8');

    const result = await captureCli([
      'verify',
      certificate.reportPath,
      certificate.attestationPath,
      issuancePath,
      signaturePath,
      '--signers',
      writeSigners(keyDir, key),
      '--revocations',
      writeRevocations(keyDir),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('signature:  INVALID');
  });

  it('reports a signature from a key outside issuer-signers as an unlisted key', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-unlisted-key-');
    const listed = generateKey(keyDir, 'listed');
    const stranger = generateKey(keyDir, 'stranger');
    await captureCli([
      'issue',
      certificate.repoPath,
      '--report',
      certificate.reportPath,
      '--attestation',
      certificate.attestationPath,
      '--key',
      listed.publicPath,
      '--engagement-ref',
      'ER-2026-0006',
    ]);

    const issuancePath = join(certificate.outDir, 'issuance.json');
    const signaturePath = sign(stranger, issuancePath);

    const result = await captureCli([
      'verify',
      certificate.reportPath,
      certificate.attestationPath,
      issuancePath,
      signaturePath,
      '--signers',
      writeSigners(keyDir, listed),
      '--revocations',
      writeRevocations(keyDir),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('signature:  SIGNED BY AN UNLISTED KEY');
    expect(result.stdout).not.toContain('signature:  valid');
  });

  it('reports a revoked report digest as revoked', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-revoked-key-');
    const key = generateKey(keyDir, 'issuer');
    await captureCli([
      'issue',
      certificate.repoPath,
      '--report',
      certificate.reportPath,
      '--attestation',
      certificate.attestationPath,
      '--key',
      key.publicPath,
      '--engagement-ref',
      'ER-2026-0007',
    ]);

    const issuancePath = join(certificate.outDir, 'issuance.json');
    const signaturePath = sign(key, issuancePath);

    const result = await captureCli([
      'verify',
      certificate.reportPath,
      certificate.attestationPath,
      issuancePath,
      signaturePath,
      '--signers',
      writeSigners(keyDir, key),
      '--revocations',
      writeRevocations(keyDir, [
        `${certificate.reportSha256} 2026-09-20 The pinned revision was not the tree that was reviewed.`,
      ]),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('revocation: REVOKED — withdrawn 2026-09-20');
  });

  it('verifies against the published files that ship with the package', async () => {
    const certificate = await scanFixture();
    const keyDir = scratch('cejel-issuance-published-');
    const key = generateKey(keyDir, 'issuer');
    await captureCli([
      'issue',
      certificate.repoPath,
      '--report',
      certificate.reportPath,
      '--attestation',
      certificate.attestationPath,
      '--key',
      key.publicPath,
      '--engagement-ref',
      'ER-2026-0008',
    ]);
    const issuancePath = join(certificate.outDir, 'issuance.json');
    const signaturePath = sign(key, issuancePath);

    // No --signers/--revocations: the shipped docs/security files are resolved beside the build.
    // issuer-signers lists no key yet, so this must fail closed rather than pass.
    const result = await captureCli([
      'verify',
      certificate.reportPath,
      certificate.attestationPath,
      issuancePath,
      signaturePath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('signature:  SIGNED BY AN UNLISTED KEY');
    expect(result.stdout).toContain('binding:    valid');
    expect(result.stdout).toContain('revocation: not revoked');
  });

  it('keeps the two-artifact binding check unchanged when no issuance is supplied', async () => {
    const certificate = await scanFixture();
    const result = await captureCli([
      'verify',
      certificate.reportPath,
      certificate.attestationPath,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cejel: report/attestation binding verified.');
    expect(result.stdout).toContain('Cejel: signature and signer identity were not verified.');
  });

  it('refuses a truncated issuance pair instead of skipping the signature check', async () => {
    const certificate = await scanFixture();
    await expect(
      captureCli([
        'verify',
        certificate.reportPath,
        certificate.attestationPath,
        join(certificate.outDir, 'issuance.json'),
      ]),
    ).rejects.toThrow(/Usage/);
  });
});
