import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runWitanFreeCli } from '../index.js';
import {
  CONFORMANCE_SUBJECT_REPOSITORY,
  conformanceDocument,
  makeConformanceRepo,
} from '../witan/__tests__/fixtures/input-binding-conformance.js';

// CLI regression tests for the post-merge review passes of #525. Each failed on the merge commit.

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

function genericWithRuleIds(ruleIds: readonly string[]): string {
  return JSON.stringify({
    version: '1.0',
    tool: 'example-scanner',
    signals: [
      {
        dimension: 'A2',
        weight: 0.5,
        findings: ruleIds.map((ruleId) => ({ ruleId, severity: 'warning', message: `rule ${ruleId}` })),
      },
    ],
  });
}

const PROTOTYPE_RULE_IDS = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'];

describe('an ingested ruleId naming an Object.prototype member', () => {
  it.each(PROTOTYPE_RULE_IDS)('scans to exit 0 and writes certificates for ruleId %s', async (ruleId) => {
    const repo = makeConformanceRepo();
    const input = join(mkdtempSync(join(tmpdir(), 'cejel-proto-in-')), 'input.json');
    writeFileSync(input, genericWithRuleIds([ruleId]), 'utf8');
    const out = mkdtempSync(join(tmpdir(), 'cejel-proto-out-'));
    const result = await captureCli([repo.repoPath, '--out', out, '--ingest', input]);
    expect(result.exitCode).toBe(0);
    for (const file of ['report.json', 'attestation.json', 'certificate.html', 'summary.json']) {
      expect(existsSync(join(out, file))).toBe(true);
    }
    expect(readFileSync(join(out, 'certificate.html'), 'utf8')).toContain(`rule ${ruleId}`);
  });

  it('a repository cannot break its own scan by committing .cejel/inputs/a.json', async () => {
    const repo = makeConformanceRepo();
    mkdirSync(join(repo.repoPath, '.cejel', 'inputs'), { recursive: true });
    writeFileSync(join(repo.repoPath, '.cejel', 'inputs', 'a.json'), genericWithRuleIds(PROTOTYPE_RULE_IDS), 'utf8');
    const out = mkdtempSync(join(tmpdir(), 'cejel-proto-out-'));
    const result = await captureCli([repo.repoPath, '--out', out]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(out, 'certificate.html'))).toBe(true);
  });
});

describe('credentials in an un-normalizable repository identity', () => {
  it('reach none of report.json, certificate.html, summary.json or the terminal', async () => {
    const secret = 'glpat-S3CR3TT0KEN0123456789';
    const repo = makeConformanceRepo();
    const input = join(mkdtempSync(join(tmpdir(), 'cejel-cred-in-')), 'scan.sarif');
    writeFileSync(
      input,
      JSON.stringify({
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'ExampleSAST' } },
            versionControlProvenance: [
              { repositoryUri: `https://gitlab-ci-token:${secret}@10.20.30.40/g/r.git`, revisionId: repo.head },
            ],
            results: [],
          },
        ],
      }),
      'utf8',
    );
    const out = mkdtempSync(join(tmpdir(), 'cejel-cred-out-'));
    const result = await captureCli([repo.repoPath, '--out', out, '--ingest', input]);
    expect(result.exitCode).toBe(0);
    for (const file of ['report.json', 'certificate.html', 'summary.json', 'attestation.json']) {
      expect(readFileSync(join(out, file), 'utf8')).not.toContain(secret);
    }
    expect(result.stdout + result.stderr).not.toContain(secret);
    expect(readFileSync(join(out, 'certificate.html'), 'utf8')).toContain('repository withheld');
  });
});

describe('a scan never writes a report its own verify rejects', () => {
  it('an out-of-range observation time leaves the report verifiable', async () => {
    const repo = makeConformanceRepo();
    const input = join(mkdtempSync(join(tmpdir(), 'cejel-date-in-')), 'scan.sarif');
    writeFileSync(
      input,
      JSON.stringify({
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'ExampleSAST' } },
            versionControlProvenance: [{ repositoryUri: `https://${CONFORMANCE_SUBJECT_REPOSITORY}`, revisionId: repo.head }],
            invocations: [{ executionSuccessful: true, startTimeUtc: '9999-12-31T23:00:00-02:00' }],
            results: [],
          },
        ],
      }),
      'utf8',
    );
    const out = mkdtempSync(join(tmpdir(), 'cejel-date-out-'));
    expect((await captureCli([repo.repoPath, '--out', out, '--quiet', '--ingest', input])).exitCode).toBe(0);
    const verified = await captureCli(['verify', join(out, 'report.json'), join(out, 'attestation.json')]);
    expect(verified.stderr).toBe('');
    expect(verified.exitCode).toBe(0);
  });

  it.each([
    ['year 10000', '253402300800'],
    ['outside the Date range', '99999999999999'],
  ])('a HEAD committer time in %s neither crashes the scan nor breaks verify', async (_label, seconds) => {
    const repo = makeConformanceRepo();
    const git = (args: string[], input?: string) =>
      execFileSync('git', args, { cwd: repo.repoPath, encoding: 'utf8', ...(input ? { input } : {}) }).trim();
    const tree = git(['write-tree']);
    const commit = git(
      ['hash-object', '-t', 'commit', '-w', '--stdin'],
      `tree ${tree}\nauthor t <t@t.invalid> 1700000000 +0000\ncommitter t <t@t.invalid> ${seconds} +0000\n\nfixture\n`,
    );
    git(['update-ref', 'HEAD', commit]);
    const input = join(mkdtempSync(join(tmpdir(), 'cejel-ct-in-')), 'scorecard.json');
    writeFileSync(input, conformanceDocument('scorecard', 'matching', commit), 'utf8');
    const out = mkdtempSync(join(tmpdir(), 'cejel-ct-out-'));
    expect((await captureCli([repo.repoPath, '--out', out, '--quiet', '--ingest', input])).exitCode).toBe(0);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.inputBinding.scannedSubject.commitTime).toBeUndefined();
    expect(report.inputBinding.inputs[0].checks.freshness).toBe('unverifiable');
    const verified = await captureCli(['verify', join(out, 'report.json'), join(out, 'attestation.json')]);
    expect(verified.exitCode).toBe(0);
  });
});

describe('verify --input reads files with the ingest path checks', () => {
  async function scanned(): Promise<{ out: string; input: string }> {
    const repo = makeConformanceRepo();
    const input = join(mkdtempSync(join(tmpdir(), 'cejel-vin-in-')), 'scorecard.json');
    writeFileSync(input, conformanceDocument('scorecard', 'matching', repo.head), 'utf8');
    const out = mkdtempSync(join(tmpdir(), 'cejel-vin-out-'));
    expect((await captureCli([repo.repoPath, '--out', out, '--quiet', '--ingest', input])).exitCode).toBe(0);
    return { out, input };
  }

  it('refuses a symlink, even to a recorded input', async () => {
    const { out, input } = await scanned();
    const link = join(mkdtempSync(join(tmpdir(), 'cejel-vin-link-')), 'link.json');
    symlinkSync(input, link);
    const result = await captureCli(['verify', join(out, 'report.json'), join(out, 'attestation.json'), '--input', link]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/refusing symlinked ingest file/);
  });

  it('refuses a file over the ingest byte budget without reading it', async () => {
    const { out } = await scanned();
    const large = join(mkdtempSync(join(tmpdir(), 'cejel-vin-large-')), 'large.json');
    writeFileSync(large, Buffer.alloc(8 * 1024 * 1024 + 1, 0x20));
    const result = await captureCli(['verify', join(out, 'report.json'), join(out, 'attestation.json'), '--input', large]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/byte budget/);
  });

  it.skipIf(process.platform === 'win32')('refuses a FIFO instead of blocking on it', async () => {
    const { out } = await scanned();
    const fifo = join(mkdtempSync(join(tmpdir(), 'cejel-vin-fifo-')), 'pipe.json');
    execFileSync('mkfifo', [fifo]);
    const result = await captureCli(['verify', join(out, 'report.json'), join(out, 'attestation.json'), '--input', fifo]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/refusing non-regular ingest file/);
  });

  it('a missing --input is a reported failure, not a crash', async () => {
    const { out } = await scanned();
    const result = await captureCli([
      'verify', join(out, 'report.json'), join(out, 'attestation.json'), '--input', join(tmpdir(), 'cejel-no-such-input.json'),
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/input digests not verified/);
  });

  it('still verifies the recorded input', async () => {
    const { out, input } = await scanned();
    const result = await captureCli(['verify', join(out, 'report.json'), join(out, 'attestation.json'), '--input', input]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 ingested input digest verified against report.json.');
  });
});
