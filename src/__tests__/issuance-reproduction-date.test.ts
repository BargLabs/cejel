// goal_cejel_issue_reproduces_scan_year_2026-11-05 (audit C4, operator ruling of 5 Nov, option A).
//
// v17's B4 freshness check matches the scan's calendar year, so the same commit can score
// differently in a later year. `cejel issue` re-runs the scan and refuses unless report.json
// reproduces byte for byte; before this change its re-run used the issuer's clock, so an issuance
// across a year boundary always refused. The re-run now uses the attested scan date.
//
// Every clock here is fixed with vitest's fake Date. Nothing reads the real date.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { runWitanFreeCli } from '../index.js';
import { WitanIssuanceStatementSchema } from '../issuance/schemas.js';

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

afterEach(() => {
  vi.useRealTimers();
});

function useClock(iso: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

function git(repoPath: string, argv: readonly string[]): string {
  return execFileSync('git', argv, { cwd: repoPath, encoding: 'utf8' }).trim();
}

/**
 * A committed synthetic repository whose CHANGELOG names 2025 and no other freshness marker, so
 * v17's B4 reads it as fresh only when the reference year is 2025.
 */
function fixtureRepo(): string {
  const repoPath = scratch('cejel-issue-year-repo-');
  git(repoPath, ['init', '--quiet']);
  git(repoPath, ['config', 'user.name', 'Cejel Test']);
  git(repoPath, ['config', 'user.email', 'cejel@example.invalid']);
  git(repoPath, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const value = 42;\n');
  writeFileSync(join(repoPath, 'src', 'index.test.ts'), "it('works', () => {});\n");
  writeFileSync(
    join(repoPath, 'package.json'),
    '{"name":"issue-year-fixture","version":"1.0.0","scripts":{"test":"vitest run"}}\n',
  );
  writeFileSync(
    join(repoPath, 'CHANGELOG.md'),
    '# Changelog\n\n## 1.0.0 - 2025-06-01\n\n- First release of the fixture.\n',
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

async function scanAt(iso: string, repoPath = fixtureRepo()): Promise<Certificate> {
  useClock(iso);
  const outDir = scratch('cejel-issue-year-out-');
  expect(await runWitanFreeCli([repoPath, '--out', outDir, '--quiet'])).toBe(0);
  vi.useRealTimers();
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

function issueArgs(certificate: Certificate, key: TestKey, engagementRef: string): string[] {
  return [
    'issue',
    certificate.repoPath,
    '--report',
    certificate.reportPath,
    '--attestation',
    certificate.attestationPath,
    '--key',
    key.publicPath,
    '--engagement-ref',
    engagementRef,
    '--out',
    certificate.outDir,
  ];
}

async function issueAt(
  iso: string,
  certificate: Certificate,
  key: TestKey,
  engagementRef: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  useClock(iso);
  try {
    return await captureCli(issueArgs(certificate, key, engagementRef));
  } finally {
    vi.useRealTimers();
  }
}

/** Rewrites predicate.generatedAt in attestation.json; `undefined` deletes the member. */
function rewriteAttestationGeneratedAt(certificate: Certificate, value: string | undefined): void {
  const attestation = JSON.parse(readFileSync(certificate.attestationPath, 'utf8')) as {
    predicate: Record<string, unknown>;
  };
  if (value === undefined) delete attestation.predicate.generatedAt;
  else attestation.predicate.generatedAt = value;
  writeFileSync(certificate.attestationPath, JSON.stringify(attestation, null, 2));
}

function driftTree(repoPath: string): void {
  writeFileSync(join(repoPath, 'src', 'added.ts'), 'export const added = 1;\n');
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '--quiet', '--no-gpg-sign', '-m', 'drift']);
}

const TZ_LINE = /local time.*\bTZ\b/;

describe('cejel issue reproduces with the attested scan date', () => {
  it('reproduces a scan from the previous year byte for byte, which the issuer clock cannot', async () => {
    const certificate = await scanAt('2025-06-15T12:00:00.000Z');

    // Control: the same commit scanned under the issuer's year gives different bytes, so this
    // fixture exercises v17's scan-year B4 rather than passing trivially.
    const control = await scanAt('2026-02-01T12:00:00.000Z', certificate.repoPath);
    expect(control.reportSha256).not.toBe(certificate.reportSha256);

    const key = generateKey(scratch('cejel-issue-year-key-'), 'issuer');
    const result = await issueAt('2026-02-01T12:00:00.000Z', certificate, key, 'ER-2026-0101');

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`reproduced report.json byte for byte (sha256:${certificate.reportSha256})`);
    expect(sha256File(certificate.reportPath)).toBe(certificate.reportSha256);
    expect(sha256File(certificate.attestationPath)).toBe(certificate.attestationSha256);

    // Item C: the issuance records the date the reproduction used, under the reproduction block.
    const issuance = JSON.parse(readFileSync(join(certificate.outDir, 'issuance.json'), 'utf8')) as {
      predicate: {
        issuanceFormatVersion: string;
        reproduction: { generatedAt?: string };
        issuedAt: string;
      };
    };
    expect(issuance.predicate.reproduction.generatedAt).toBe('2025-06-15T12:00:00.000Z');
    expect(issuance.predicate.issuanceFormatVersion).toBe('1.1');
    expect(issuance.predicate.issuedAt).toBe('2026-02-01T12:00:00.000Z');
  });

  it('refuses an attestation with no predicate.generatedAt, naming the member', async () => {
    const certificate = await scanAt('2025-06-15T12:00:00.000Z');
    rewriteAttestationGeneratedAt(certificate, undefined);
    const key = generateKey(scratch('cejel-issue-year-key-missing-'), 'issuer');
    const result = await issueAt('2026-02-01T12:00:00.000Z', certificate, key, 'ER-2026-0102');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('refusing to issue');
    expect(result.stderr).toContain('predicate.generatedAt');
    expect(existsSync(join(certificate.outDir, 'issuance.json'))).toBe(false);
  });

  it('refuses an attestation whose predicate.generatedAt is not an ISO 8601 time, naming the member', async () => {
    const certificate = await scanAt('2025-06-15T12:00:00.000Z');
    rewriteAttestationGeneratedAt(certificate, '15 June 2025');
    const key = generateKey(scratch('cejel-issue-year-key-malformed-'), 'issuer');
    const result = await issueAt('2026-02-01T12:00:00.000Z', certificate, key, 'ER-2026-0103');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('refusing to issue');
    expect(result.stderr).toContain('predicate.generatedAt');
    expect(existsSync(join(certificate.outDir, 'issuance.json'))).toBe(false);
  });

  it('refuses an attestation whose predicate.generatedAt is later than the issuer clock', async () => {
    const certificate = await scanAt('2026-03-01T12:00:00.000Z');
    const key = generateKey(scratch('cejel-issue-year-key-future-'), 'issuer');
    const result = await issueAt('2026-02-01T12:00:00.000Z', certificate, key, 'ER-2026-0104');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('refusing to issue');
    expect(result.stderr).toContain('predicate.generatedAt');
    expect(result.stderr).toContain('later than this issuer');
    expect(existsSync(join(certificate.outDir, 'issuance.json'))).toBe(false);
  });

  it('adds the TZ line to a failed reproduction whose scan is within 24 hours of a new year in UTC', async () => {
    const certificate = await scanAt('2025-12-31T20:00:00.000Z');
    driftTree(certificate.repoPath);
    const key = generateKey(scratch('cejel-issue-year-key-tz-'), 'issuer');
    const result = await issueAt('2026-02-01T12:00:00.000Z', certificate, key, 'ER-2026-0105');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('did not reproduce byte for byte');
    expect(result.stderr).toMatch(TZ_LINE);
    expect(result.stderr).toContain('2025-12-31T20:00:00.000Z');
  });

  it('adds the TZ line just after a new year too', async () => {
    const certificate = await scanAt('2026-01-01T03:00:00.000Z');
    driftTree(certificate.repoPath);
    const key = generateKey(scratch('cejel-issue-year-key-tz-after-'), 'issuer');
    const result = await issueAt('2026-02-01T12:00:00.000Z', certificate, key, 'ER-2026-0106');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(TZ_LINE);
  });

  it('does not add the TZ line when the scan is outside that window', async () => {
    const certificate = await scanAt('2025-12-30T23:00:00.000Z');
    driftTree(certificate.repoPath);
    const key = generateKey(scratch('cejel-issue-year-key-no-tz-'), 'issuer');
    const result = await issueAt('2026-02-01T12:00:00.000Z', certificate, key, 'ER-2026-0107');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('did not reproduce byte for byte');
    expect(result.stderr).not.toMatch(TZ_LINE);
  });
});

describe('an issuance made before the reproduction date was recorded', () => {
  it('still parses under the issuance schema without reproduction.generatedAt', () => {
    const legacy = {
      _type: 'https://in-toto.io/Statement/v1',
      subject: [
        { name: 'fixture/report.json', artifact: 'report.json', digest: { sha256: 'a'.repeat(64) } },
        {
          name: 'fixture/attestation.json',
          artifact: 'attestation.json',
          digest: { sha256: 'b'.repeat(64) },
        },
      ],
      predicateType: 'https://cejel.dev/attestations/issuance/v1',
      predicate: {
        issuanceFormatVersion: '1.0',
        issuer: { name: 'Barg Labs Inc.', keyFingerprint: `SHA256:${'A'.repeat(43)}` },
        reproduction: {
          sourceRevision: 'abcdef1234567',
          toolPackage: '@cejel/cejel',
          toolVersion: '0.6.10',
          rubricVersion: 'witan-rubric-v17-2026-07-24',
          reportByteIdentical: true,
        },
        issuedAt: '2026-10-01T00:00:00.000Z',
        engagementRef: 'ER-2026-0001',
        limitations: ['x'],
      },
    };
    expect(WitanIssuanceStatementSchema.safeParse(legacy).success).toBe(true);
  });

  it('still verifies through cejel verify', async () => {
    const certificate = await scanAt('2025-06-15T12:00:00.000Z');
    const keyDir = scratch('cejel-issue-year-key-legacy-');
    const key = generateKey(keyDir, 'issuer');
    const issued = await issueAt('2025-06-16T12:00:00.000Z', certificate, key, 'ER-2026-0108');
    expect(issued.exitCode).toBe(0);

    // Rewrite the statement into the 1.0 shape this build's predecessor wrote: no
    // reproduction.generatedAt. Nothing else changes.
    const issuancePath = join(certificate.outDir, 'issuance.json');
    const statement = JSON.parse(readFileSync(issuancePath, 'utf8')) as {
      predicate: { issuanceFormatVersion: string; reproduction: Record<string, unknown> };
    };
    statement.predicate.issuanceFormatVersion = '1.0';
    delete statement.predicate.reproduction.generatedAt;
    writeFileSync(issuancePath, JSON.stringify(statement, null, 2));

    const signaturePath = sign(key, issuancePath);
    const signersPath = join(keyDir, 'issuer-signers');
    writeFileSync(signersPath, `issuance@barglabs.ai ${key.keyType} ${key.keyBase64} issuer\n`);
    const revocationsPath = join(keyDir, 'issuer-revocations');
    writeFileSync(revocationsPath, '# withdrawn issuances\n');

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
    expect(result.stdout).toContain('signature:  valid');
    expect(result.stdout).toContain('binding:    valid');
  });
});
