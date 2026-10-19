import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runWitanFreeCli } from '../index.js';
import {
  CONFORMANCE_SUBJECT_REPOSITORY,
  conformanceDocument,
  makeConformanceRepo,
} from '../witan/__tests__/fixtures/input-binding-conformance.js';

// The CLI half of docs/input-binding.md: a certificate built from ingested inputs reproduces byte
// for byte (scan twice; `cejel issue`), and its recorded digests let `cejel verify --input` detect
// an input swapped for another.

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

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function publicKey(): string {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-binding-key-'));
  const privatePath = join(directory, 'issuer');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'issuer@test.invalid', '-f', privatePath]);
  return `${privatePath}.pub`;
}

function inputs(head: string): { scorecard: string; sarif: string; swapped: string } {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-binding-cli-inputs-'));
  const scorecard = join(directory, 'scorecard.json');
  const sarif = join(directory, 'scan.sarif');
  const swapped = join(directory, 'swapped.json');
  writeFileSync(scorecard, conformanceDocument('scorecard', 'matching', head));
  writeFileSync(sarif, conformanceDocument('sarif', 'matching', head));
  // Same tool, same checks, same finding count: only the declared commit differs.
  writeFileSync(swapped, conformanceDocument('scorecard', 'wrong-commit', head));
  return { scorecard, sarif, swapped };
}

describe('input binding through the CLI', () => {
  it('scans reproduce byte for byte, whatever the input order or directory', async () => {
    const repo = makeConformanceRepo();
    const files = inputs(repo.head);
    const relocated = mkdtempSync(join(tmpdir(), 'cejel-binding-relocated-'));
    copyFileSync(files.scorecard, join(relocated, 'renamed-scorecard.json'));
    copyFileSync(files.sarif, join(relocated, 'renamed.sarif'));

    const first = mkdtempSync(join(tmpdir(), 'cejel-binding-out-'));
    const second = mkdtempSync(join(tmpdir(), 'cejel-binding-out-'));
    const common = ['--quiet', '--product-name', 'binding-cli', '--subject-repository', CONFORMANCE_SUBJECT_REPOSITORY];
    expect(
      (await captureCli([repo.repoPath, '--out', first, ...common, '--ingest', files.scorecard, '--ingest', files.sarif])).exitCode,
    ).toBe(0);
    expect(
      (
        await captureCli([
          repo.repoPath,
          '--out',
          second,
          ...common,
          '--ingest',
          join(relocated, 'renamed.sarif'),
          '--ingest',
          join(relocated, 'renamed-scorecard.json'),
        ])
      ).exitCode,
    ).toBe(0);
    expect(readFileSync(join(second, 'report.json'), 'utf8')).toBe(
      readFileSync(join(first, 'report.json'), 'utf8'),
    );
    const report = JSON.parse(readFileSync(join(first, 'report.json'), 'utf8'));
    expect(report.inputBinding.inputs.map((input: { sha256: string }) => input.sha256).sort()).toEqual(
      [sha256File(files.scorecard), sha256File(files.sarif)].sort(),
    );
    const attestation = JSON.parse(readFileSync(join(first, 'attestation.json'), 'utf8'));
    expect(attestation.predicate.reportFormatVersion).toBe('1.6');
  });

  it('verify --input accepts the recorded inputs and detects a swapped one', async () => {
    const repo = makeConformanceRepo();
    const files = inputs(repo.head);
    const out = mkdtempSync(join(tmpdir(), 'cejel-binding-out-'));
    await captureCli([repo.repoPath, '--out', out, '--quiet', '--ingest', files.scorecard, '--ingest', files.sarif]);
    const report = join(out, 'report.json');
    const attestation = join(out, 'attestation.json');

    const good = await captureCli(['verify', report, attestation, '--input', files.sarif, '--input', files.scorecard]);
    expect(good.exitCode).toBe(0);
    expect(good.stdout).toContain('2 ingested input digests verified against report.json.');

    const swapped = await captureCli(['verify', report, attestation, '--input', files.swapped, '--input', files.sarif]);
    expect(swapped.exitCode).toBe(1);
    expect(swapped.stdout).toContain(`${files.swapped} (sha256:${sha256File(files.swapped)}) is not an input report.json records`);
    expect(swapped.stdout).toContain(`records input sha256:${sha256File(files.scorecard)}`);
  });

  it('issue reproduces an ingesting certificate, and refuses when an input was swapped', async () => {
    const repo = makeConformanceRepo();
    const files = inputs(repo.head);
    const key = publicKey();
    for (const strict of [false, true]) {
      const out = mkdtempSync(join(tmpdir(), 'cejel-binding-out-'));
      const scan = await captureCli([
        repo.repoPath,
        '--out',
        out,
        '--quiet',
        '--subject-repository',
        CONFORMANCE_SUBJECT_REPOSITORY,
        ...(strict ? ['--strict-ingest'] : []),
        '--ingest',
        files.scorecard,
      ]);
      expect(scan.exitCode).toBe(0);
      const report = join(out, 'report.json');
      const attestation = join(out, 'attestation.json');
      expect(JSON.parse(readFileSync(report, 'utf8')).inputBinding.policy).toBe(strict ? 'strict' : 'record-only');
      const before = sha256File(report);

      const issued = await captureCli([
        'issue', repo.repoPath, '--report', report, '--attestation', attestation, '--key', key,
        '--engagement-ref', 'ER-BINDING-1', '--ingest', files.scorecard,
      ]);
      expect(issued.stderr).toBe('');
      expect(issued.exitCode).toBe(0);
      expect(existsSync(join(out, 'issuance.json'))).toBe(true);
      expect(sha256File(report)).toBe(before);

      // A swapped input changes the recorded digest, so the bytes cannot reproduce. Under the
      // strict policy the reproduction refuses the mismatched input before it even scores.
      const refusedOut = mkdtempSync(join(tmpdir(), 'cejel-binding-out-'));
      const swappedIssue = [
        'issue', repo.repoPath, '--report', report, '--attestation', attestation, '--key', key,
        '--engagement-ref', 'ER-BINDING-2', '--out', refusedOut, '--ingest', files.swapped,
      ];
      if (strict) {
        await expect(captureCli(swappedIssue)).rejects.toThrow(/--strict-ingest refused/);
      } else {
        const refused = await captureCli(swappedIssue);
        expect(refused.exitCode).toBe(1);
        expect(refused.stderr).toContain('report.json did not reproduce byte for byte');
      }
      expect(existsSync(join(refusedOut, 'issuance.json'))).toBe(false);
    }
  });

  it('--strict-ingest refuses a mismatched input before writing anything', async () => {
    const repo = makeConformanceRepo();
    const files = inputs(repo.head);
    const out = join(mkdtempSync(join(tmpdir(), 'cejel-binding-out-')), 'certificate');
    await expect(
      runWitanFreeCli([repo.repoPath, '--out', out, '--quiet', '--strict-ingest', '--ingest', files.swapped]),
    ).rejects.toThrow(/--strict-ingest refused 1 ingest input; no certificate was written\.[\s\S]*mismatched-commit/);
    expect(existsSync(join(out, 'report.json'))).toBe(false);
  });

  it('the certificate shows each input and its binding status', async () => {
    const repo = makeConformanceRepo();
    const files = inputs(repo.head);
    const out = mkdtempSync(join(tmpdir(), 'cejel-binding-out-'));
    const result = await captureCli([repo.repoPath, '--out', out, '--ingest', files.swapped]);
    expect(result.exitCode).toBe(0);
    const html = readFileSync(join(out, 'certificate.html'), 'utf8');
    expect(html).toContain('Ingested inputs');
    expect(html).toContain('mismatched-commit: scorecard v5.6.0');
    expect(html).toContain(`sha256:${sha256File(files.swapped)}`);
    expect(result.stdout).toContain('1 ingested input: 1 mismatched-commit (record only: binding status did not affect any score).');
  });
});
