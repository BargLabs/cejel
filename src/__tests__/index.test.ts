import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  USAGE,
  parseArgs,
  parseCliInvocation,
  runWitanFreeCli,
  runWitanV22CalibrationCli,
} from '../index.js';
import {
  PROSPECTIVE_RUBRIC_NOTICE,
  WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
  WITAN_RUBRIC_VERSION_V22,
} from '../witan/rubric-version.js';

// Committed fixture (not a machine-specific temp file) — lives in the vendored witan-core test
// fixtures since the SARIF adapter tests there also read it. See
// src/witan/__tests__/external-findings.test.ts for the parser-level lock; this is
// the CLI-level lock that the itemized findings actually reach the written files + terminal.
const CODEX_SECURITY_FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'witan',
  '__tests__',
  'fixtures',
  'codex-security-sample.sarif',
);

function writeFixtureFile(repoPath: string, relativePath: string, contents: string): void {
  const fullPath = join(repoPath, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${contents}\n`);
}

describe('content-read failures', () => {
  it('counts skipped entries and makes every affected criterion abstain', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'cejel-content-read-'));
    const outDir = mkdtempSync(join(tmpdir(), 'cejel-content-read-output-'));
    writeFixtureFile(
      repoPath,
      'package.json',
      JSON.stringify({ name: 'content-read-fixture', version: '1.0.0' }),
    );
    writeFixtureFile(repoPath, 'src/app.ts', "export const app = process.env.API_TOKEN ?? 'unset';");
    const unreadablePath = join(repoPath, 'src', 'unsafe.test.ts');
    writeFixtureFile(repoPath, 'src/unsafe.test.ts', "it('runs', () => expect(true).toBe(true));");
    chmodSync(unreadablePath, 0o000);
    execFileSync('mkfifo', [join(repoPath, 'src', 'input.fifo')]);
    symlinkSync('/dev/null', join(repoPath, 'src', 'device-link'));
    writeFileSync(join(repoPath, 'asset.bin'), Buffer.from([0, 1, 2, 3]));
    writeFileSync(join(repoPath, 'src', 'oversized.ts'), Buffer.alloc(512_001));
    writeFixtureFile(repoPath, 'node_modules/ignored.ts', 'export const ignored = true;');

    let exitCode: number;
    try {
      exitCode = await runWitanFreeCli([repoPath, '--out-dir', outDir, '--quiet']);
    } finally {
      chmodSync(unreadablePath, 0o600);
    }
    expect(exitCode).toBe(0);

    const summaryText = readFileSync(join(outDir, 'summary.json'), 'utf8');
    const summary = JSON.parse(summaryText) as {
      contentReadSummary: {
        skipped: number;
        byReason: Record<string, number>;
        unreadableByErrno: Record<string, number>;
        affectedCriteria: string[];
      };
    };
    expect(summary.contentReadSummary).toEqual({
      skipped: 6,
      byReason: {
        unreadable: 1,
        tooLarge: 1,
        excludedByExtension: 1,
        deniedPath: 1,
        nonRegularFile: 2,
      },
      unreadableByErrno: { EACCES: 1 },
      affectedCriteria: expect.arrayContaining(['A1']),
    });
    expect(summaryText).not.toContain('unsafe.test.ts');

    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')) as {
      criteria: { id: string; status: string }[];
    };
    expect(report.criteria.find((criterion) => criterion.id === 'A1')?.status).toBe(
      'insufficient_data',
    );
    expect(readFileSync(join(outDir, 'certificate.html'), 'utf8')).not.toContain(
      'unsafe.test.ts',
    );
  });
});

describe('witan CLI arg parsing', () => {
  it('defaults to the current directory, .cejel out-dir, no threshold', () => {
    const options = parseArgs([]);
    expect(options).toMatchObject({ outDir: '.cejel', quiet: false });
    expect(options.minScore).toBeUndefined();
  });

  it('parses a positional repo path, --out, and --min-score', () => {
    const options = parseArgs(['/repo', '--out', 'out', '--min-score', '2.5']);
    expect(options).toMatchObject({ repoPath: '/repo', outDir: 'out', minScore: 2.5 });
  });

  it('parses and trims a certificate display-name override', () => {
    expect(parseArgs(['/repo', '--name', '  Customer Portal  ']).productDisplayName).toBe(
      'Customer Portal',
    );
    for (const unsafeName of [
      '   ',
      'Trusted\nOverall: 4.0 (Verified)',
      'Trusted\rCritical: none',
      'Trusted\u001b[2J',
      'Trusted\u2028Overall: 4.0',
    ]) {
      expect(() => parseArgs(['--name', unsafeName])).toThrow(
        /--name must be a single printable line containing between 1 and 120 characters/,
      );
    }
  });

  it('retains --out-dir as a backwards-compatible alias', () => {
    expect(parseArgs(['--out-dir', 'out']).outDir).toBe('out');
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--nonsense'])).toThrow(/Unknown Cejel CLI flag/);
  });

  it('rejects every extra positional argument and prints the member', () => {
    expect(() => parseArgs(['/repo', 'ignored-path'])).toThrow(
      /Unexpected positional argument: ignored-path/,
    );
  });

  it('accepts an explicit scan command without changing the scan options', () => {
    expect(parseCliInvocation(['scan', '/repo', '--quiet'])).toEqual({
      command: 'scan',
      options: parseArgs(['/repo', '--quiet']),
    });
  });

  it('keeps the reserved Free LLM interface unavailable until its release gate reaches GO', () => {
    expect(() => parseCliInvocation(['scan', '.', '--pack', 'llm'])).toThrow(
      /Unknown Cejel CLI flag: --pack/,
    );
    expect(() => parseCliInvocation(['scan', '.', '--rubric', WITAN_RUBRIC_VERSION_V22])).toThrow(
      /Unknown Cejel CLI flag: --rubric/,
    );
    expect(() => parseCliInvocation(['llm', 'scan', '.'])).toThrow(
      /Unexpected positional argument: scan/,
    );
  });

  it('requires exactly a report and attestation for verify', () => {
    expect(() => parseCliInvocation(['verify'])).toThrow(
      /verify <report\.json> <attestation\.json>/,
    );
    expect(() =>
      parseCliInvocation(['verify', 'report.json', 'attestation.json', 'extra']),
    ).toThrow(/verify <report\.json> <attestation\.json>/);
  });

  it('--help and -h set showHelp', () => {
    expect(parseArgs(['--help']).showHelp).toBe(true);
    expect(parseArgs(['-h']).showHelp).toBe(true);
  });

  it('--version and -v set showVersion', () => {
    expect(parseArgs(['--version']).showVersion).toBe(true);
    expect(parseArgs(['-v']).showVersion).toBe(true);
  });

  it('-h is never treated as a repo path', () => {
    // Shipped 0.1.1 did exactly this: "Cejel: path not found: ./-h".
    expect(parseArgs(['-h']).repoPath).toBe(resolve('.'));
    expect(parseArgs(['-h']).repoPath).not.toBe(resolve('-h'));
  });

  it('collects repeated --ingest flags in order', () => {
    const options = parseArgs(['--ingest', 'a.sarif', '--ingest', 'b.json']);
    expect(options.ingestPatterns).toEqual(['a.sarif', 'b.json']);
  });

  it('defaults ingestPatterns to an empty array', () => {
    expect(parseArgs([]).ingestPatterns).toEqual([]);
  });

  it('rejects --min-score values outside the 0-4 range', () => {
    expect(() => parseArgs(['--min-score', '-5'])).toThrow(/--min-score must be between 0 and 4/);
    expect(() => parseArgs(['--min-score', '999'])).toThrow(/--min-score must be between 0 and 4/);
    expect(() => parseArgs(['--min-score', 'Infinity'])).toThrow(
      /--min-score must be between 0 and 4/,
    );
    expect(() => parseArgs(['--min-score', 'not-a-number'])).toThrow(
      /--min-score must be between 0 and 4/,
    );
  });

  it('accepts boundary --min-score values 0 and 4', () => {
    expect(parseArgs(['--min-score', '0']).minScore).toBe(0);
    expect(parseArgs(['--min-score', '4']).minScore).toBe(4);
  });
});

describe('witan CLI output inventory', () => {
  it('reports every file written by a scan', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'cejel-output-inventory-'));
    const outDir = mkdtempSync(join(tmpdir(), 'cejel-output-inventory-out-'));
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'output-inventory' }));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      expect(await runWitanFreeCli(['scan', repoPath, '--out', outDir])).toBe(0);
      const rendered = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
      for (const artifact of [
        'report.json',
        'summary.json',
        'attestation.json',
        'certificate.html',
        'badge.json',
        'badge.svg',
      ]) {
        expect(rendered).toContain(`${outDir}/${artifact}`);
      }
    } finally {
      stdout.mockRestore();
    }
  });
});

describe('runWitanFreeCli (zero-config end-to-end)', () => {
  it('--help exits 0 and prints usage', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['--help'])).toBe(0);
      const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('npx @cejel/cejel [path] [options]');
      expect(output).toContain('npx @cejel/cejel scan [path] [options]');
      expect(output).toContain('npx @cejel/cejel verify <report.json> <attestation.json>');
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('--version exits 0 and prints the package version', async () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['--version'])).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(`${manifest.version}\n`);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('scores a repo with no flags and writes report/attestation/certificate/badge/summary files', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'sample-app', scripts: {} }));

    const exitCode = await runWitanFreeCli([repoPath, '--out-dir', outDir, '--quiet']);

    expect(exitCode).toBe(0);
    const reportJson = readFileSync(join(outDir, 'report.json'), 'utf8');
    const report = JSON.parse(reportJson);
    expect(report.productSlug).toBe('sample-app');
    expect(report).not.toHaveProperty('generatedAt');
    const attestation = JSON.parse(readFileSync(join(outDir, 'attestation.json'), 'utf8'));
    expect(attestation).toMatchObject({
      _type: 'https://in-toto.io/Statement/v1',
      predicateType: 'https://cejel.dev/attestations/scan/v1',
      predicate: {
        assurance: { status: 'unsigned', issuer: 'self-generated' },
        outcome: { status: 'scored' },
      },
    });
    expect(attestation.predicate.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(attestation.subject[0].digest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(attestation.subject[0].digest.sha256).toBe(
      createHash('sha256').update(reportJson, 'utf8').digest('hex'),
    );
    const html = readFileSync(join(outDir, 'certificate.html'), 'utf8');
    expect(html).toContain('Trust Certificate');
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(html).toContain(`<dt>CLI</dt><dd>Cejel ${manifest.version}</dd>`);
    expect(html).toContain(`<dt>Rubric</dt><dd>${report.rubricVersion}</dd>`);
    const badgeJson = JSON.parse(readFileSync(join(outDir, 'badge.json'), 'utf8'));
    expect(badgeJson).toMatchObject({ schemaVersion: 1, label: 'cejel trust' });
    const badgeSvg = readFileSync(join(outDir, 'badge.svg'), 'utf8');
    expect(badgeSvg).toContain('<svg');
    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(summary.verdict).toBeDefined();
    expect(summary).not.toHaveProperty('generatedAt');
  });

  it('writes byte-identical report and summary artifacts for two scans of the same input', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-deterministic-'));
    const outDir = join(repoPath, '.cejel');
    writeFixtureFile(repoPath, 'src/index.ts', 'export const value = 42;');
    execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
    execFileSync('git', ['add', 'src/index.ts'], { cwd: repoPath });

    expect(await runWitanFreeCli(['scan', repoPath, '--out', outDir, '--quiet'])).toBe(0);
    const firstArtifacts = new Map(
      ['report.json', 'summary.json', 'attestation.json'].map((artifact) => [
        artifact,
        readFileSync(join(outDir, artifact), 'utf8'),
      ]),
    );
    expect(await runWitanFreeCli(['scan', repoPath, '--out', outDir, '--quiet'])).toBe(0);

    for (const artifact of ['report.json', 'summary.json']) {
      expect(firstArtifacts.get(artifact)).toBe(readFileSync(join(outDir, artifact), 'utf8'));
    }

    const firstAttestation = JSON.parse(firstArtifacts.get('attestation.json') ?? '');
    const secondAttestation = JSON.parse(readFileSync(join(outDir, 'attestation.json'), 'utf8'));
    expect(firstAttestation.subject[0].digest.sha256).toBe(secondAttestation.subject[0].digest.sha256);
    expect(firstAttestation.predicate.report.sha256).toBe(secondAttestation.predicate.report.sha256);
  });

  it('writes byte-identical report artifacts for identical checkouts at different paths', async () => {
    const seed = mkdtempSync(join(tmpdir(), 'witan-free-cli-cross-path-seed-'));
    writeFixtureFile(
      seed,
      'package.json',
      JSON.stringify({ name: 'cross-path-determinism-fixture', version: '1.0.0' }),
    );
    writeFixtureFile(seed, 'src/index.ts', 'export const value = 42;');
    writeFixtureFile(seed, 'src/index.test.ts', "it('is stable', () => expect(42).toBe(42));");
    execFileSync('git', ['init', '--quiet'], { cwd: seed });
    execFileSync('git', ['add', '.'], { cwd: seed });

    const firstRepo = join(mkdtempSync(join(tmpdir(), 'witan-free-cli-cross-path-a-')), 'repo');
    const secondRepo = join(mkdtempSync(join(tmpdir(), 'witan-free-cli-cross-path-b-')), 'repo');
    cpSync(seed, firstRepo, { recursive: true });
    cpSync(seed, secondRepo, { recursive: true });
    const firstOut = mkdtempSync(join(tmpdir(), 'witan-free-cli-cross-path-output-a-'));
    const secondOut = mkdtempSync(join(tmpdir(), 'witan-free-cli-cross-path-output-b-'));

    expect(await runWitanFreeCli(['scan', firstRepo, '--out', firstOut, '--quiet'])).toBe(0);
    expect(await runWitanFreeCli(['scan', secondRepo, '--out', secondOut, '--quiet'])).toBe(0);

    const firstReportJson = readFileSync(join(firstOut, 'report.json'), 'utf8');
    const secondReportJson = readFileSync(join(secondOut, 'report.json'), 'utf8');
    const firstReport = JSON.parse(firstReportJson) as { repo: { path?: string } };
    const secondReport = JSON.parse(secondReportJson) as { repo: { path?: string } };
    const withoutPath = ({ path: _path, ...repo }: { path?: string }) => repo;

    expect({ ...firstReport, repo: withoutPath(firstReport.repo) }).toEqual({
      ...secondReport,
      repo: withoutPath(secondReport.repo),
    });
    expect(firstReport.repo).not.toHaveProperty('path');
    expect(secondReport.repo).not.toHaveProperty('path');
    expect(firstReportJson).toBe(secondReportJson);
    // Normalized report with certificate explanation metadata, deleting only repo.path. This
    // locks every score, verdict, criterion, metric explanation, finding, evidence hash, and
    // remaining byte of the report.
    expect(createHash('sha256').update(firstReportJson).digest('hex')).toBe(
      'e5ca23ceb458ff289d822ec5d9ec3de46979661dd6287cdd5a1eccc4b4b5a835',
    );
  });

  it('uses --name on every written certificate surface without changing the repo slug', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-name-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(
      repoPath,
      'package.json',
      JSON.stringify({ name: 'stale-template-name', scripts: {} }),
    );

    expect(
      await runWitanFreeCli([repoPath, '--name', 'Customer Portal', '--out', outDir, '--quiet']),
    ).toBe(0);

    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')) as {
      productSlug: string;
      productDisplayName: string;
    };
    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8')) as {
      productDisplayName: string;
    };
    expect(report).toMatchObject({
      productSlug: 'stale-template-name',
      productDisplayName: 'Customer Portal',
    });
    expect(summary.productDisplayName).toBe('Customer Portal');
    expect(readFileSync(join(outDir, 'certificate.html'), 'utf8')).toContain('Customer Portal');
  });

  it('scores through the explicit scan command', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-explicit-scan-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'src/index.ts', 'export const value = 42;');

    expect(await runWitanFreeCli(['scan', repoPath, '--out', outDir, '--quiet'])).toBe(0);
    expect(readFileSync(join(outDir, 'report.json'), 'utf8')).toContain('"productSlug"');
  });

  it('verifies an emitted report/attestation binding and states the assurance boundary', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-verify-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'src/index.ts', 'export const value = 42;');
    await runWitanFreeCli(['scan', repoPath, '--out', outDir, '--quiet']);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(
        await runWitanFreeCli([
          'verify',
          join(outDir, 'report.json'),
          join(outDir, 'attestation.json'),
        ]),
      ).toBe(0);
      const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('report/attestation binding verified');
      expect(output).toContain('signature and signer identity were not verified');
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('rejects a report carrying the removed generatedAt field', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-verify-tampered-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'src/index.ts', 'export const value = 42;');
    await runWitanFreeCli(['scan', repoPath, '--out', outDir, '--quiet']);

    const reportPath = join(outDir, 'report.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
    report.generatedAt = '2026-01-01T00:00:00.000Z';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['verify', reportPath, join(outDir, 'attestation.json')])).toBe(
        1,
      );
      const output = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('report validation failed');
      expect(output).toContain("Unrecognized key(s) in object: 'generatedAt'");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('fails verification when report JSON is reformatted without changing its values', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-verify-reformatted-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'src/index.ts', 'export const value = 42;');
    await runWitanFreeCli(['scan', repoPath, '--out', outDir, '--quiet']);

    const reportPath = join(outDir, 'report.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as unknown;
    writeFileSync(reportPath, JSON.stringify(report));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['verify', reportPath, join(outDir, 'attestation.json')])).toBe(
        1,
      );
      const output = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('subject digest does not match report.json');
      expect(output).toContain('predicate report digest does not match report.json');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('exits 1 when overallScore is below --min-score', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-threshold-'));
    const outDir = join(repoPath, '.witan');

    const exitCode = await runWitanFreeCli([
      repoPath,
      '--out-dir',
      outDir,
      '--min-score',
      '4.0',
      '--quiet',
    ]);

    expect(exitCode).toBe(1);
  });

  it('exits 0 when --min-score is easily satisfied', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-threshold-pass-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'src/index.ts', 'export const value = 42;');

    const exitCode = await runWitanFreeCli([
      repoPath,
      '--out-dir',
      outDir,
      '--min-score',
      '0',
      '--quiet',
    ]);

    expect(exitCode).toBe(0);
  });

  it('refuses --min-score when the result carries a scan limitation', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-free-cli-limited-threshold-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'src/index.ts', 'export const value = 42;');
    execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
    writeFileSync(join(repoPath, '.git', 'index'), 'not a valid git index');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      expect(
        await runWitanFreeCli([
          repoPath,
          '--out-dir',
          outDir,
          '--min-score',
          '0',
          '--quiet',
        ]),
      ).toBe(1);
      expect(stderrSpy.mock.calls.map((call) => String(call[0])).join('')).toContain(
        'cannot evaluate the required minimum 0.0/4.0 because the scan has limited evidence',
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe('v22 calibration-only entrypoint', () => {
  it('pins v22 while the public CLI continues to emit the calibrated v17 default', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'cejel-v22-calibration-driver-'));
    const publicOut = mkdtempSync(join(tmpdir(), 'cejel-v22-calibration-public-out-'));
    const calibrationOut = mkdtempSync(join(tmpdir(), 'cejel-v22-calibration-driver-out-'));
    writeFixtureFile(
      repoPath,
      'package.json',
      JSON.stringify({ name: 'v22-calibration-driver-fixture', scripts: { start: 'node server.js' } }),
    );
    writeFixtureFile(
      repoPath,
      'server.js',
      "import { createServer } from 'node:http'; createServer(() => {}).listen(3000);",
    );

    expect(await runWitanFreeCli(['scan', repoPath, '--out', publicOut, '--quiet'])).toBe(0);
    expect(
      await runWitanV22CalibrationCli(['scan', repoPath, '--out', calibrationOut, '--quiet']),
    ).toBe(0);

    const publicReport = JSON.parse(readFileSync(join(publicOut, 'report.json'), 'utf8')) as {
      rubricVersion: string;
    };
    const calibrationReport = JSON.parse(
      readFileSync(join(calibrationOut, 'report.json'), 'utf8'),
    ) as { rubricVersion: string };
    const publicAttestation = JSON.parse(
      readFileSync(join(publicOut, 'attestation.json'), 'utf8'),
    ) as { predicate: { rubricVersion: string } };
    expect(publicReport.rubricVersion).toBe(WITAN_LAST_CALIBRATED_RUBRIC_VERSION);
    expect(publicReport.rubricVersion).not.toBe(WITAN_RUBRIC_VERSION_V22);
    expect(publicAttestation.predicate.rubricVersion).toBe(WITAN_LAST_CALIBRATED_RUBRIC_VERSION);
    expect(calibrationReport.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V22);
  });
});

// --rubric-pin (Unreleased; added after 0.4.4): the first PUBLIC, CLI-flag opt-in into a
// prospective rubric. Previously
// the only way to reach v18-v22 was a committed evaluation driver like
// runWitanV22CalibrationCli above, which parses no CLI args a stranger controls. This makes the
// "unpinned run cannot reach a prospective rubric" guarantee load-bearing for the first time —
// a bug in the flag's wiring could now leak a prospective rubric into an ordinary public scan.
describe('--rubric-pin explicit opt-in', () => {
  it('is documented in --help usage', () => {
    expect(USAGE).toContain('--rubric-pin');
  });

  it('is unset by default, and an unpinned scan stays on the calibrated rubric with no prospective banner anywhere', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-default-'));
    const outDir = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-default-out-'));
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'rubric-pin-default-fixture' }));
    writeFixtureFile(repoPath, 'README.md', '# rubric-pin-default-fixture\n');

    expect(parseArgs([repoPath]).rubricPin).toBeUndefined();

    expect(await runWitanFreeCli(['scan', repoPath, '--out', outDir])).toBe(0);
    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')) as {
      rubricVersion: string;
    };
    expect(report.rubricVersion).toBe(WITAN_LAST_CALIBRATED_RUBRIC_VERSION);

    // The CLI writes no standalone Markdown report file (that surface is
    // renderWitanMarkdownReport, covered directly in certificate-presentation.test.ts); check
    // the CLI's own written surfaces instead — the HTML certificate and the JSON summary.
    const certificateHtml = readFileSync(join(outDir, 'certificate.html'), 'utf8');
    const machineSummary = readFileSync(join(outDir, 'summary.json'), 'utf8');
    expect(certificateHtml).not.toContain('PROSPECTIVE');
    expect(machineSummary).not.toContain('PROSPECTIVE');
  });

  it('fails closed on an unrecognized --rubric-pin value, before any scan runs', () => {
    expect(() =>
      parseCliInvocation(['scan', '.', '--rubric-pin', 'not-a-real-rubric']),
    ).toThrow(/unrecognized rubric version: "not-a-real-rubric"/);
  });

  it('requires a value', () => {
    expect(() => parseCliInvocation(['scan', '.', '--rubric-pin'])).toThrow(
      'Missing value for --rubric-pin',
    );
  });

  it('accepts an explicit pin to the calibrated version itself, with no prospective banner', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-calibrated-'));
    const outDir = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-calibrated-out-'));
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'rubric-pin-v17-fixture' }));

    expect(
      await runWitanFreeCli([
        'scan',
        repoPath,
        '--out',
        outDir,
        '--rubric-pin',
        WITAN_LAST_CALIBRATED_RUBRIC_VERSION,
      ]),
    ).toBe(0);
    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')) as {
      rubricVersion: string;
    };
    expect(report.rubricVersion).toBe(WITAN_LAST_CALIBRATED_RUBRIC_VERSION);
    expect(readFileSync(join(outDir, 'certificate.html'), 'utf8')).not.toContain('PROSPECTIVE');
  });

  it('reaches a prospective rubric only when explicitly pinned, and labels every human-facing surface', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-prospective-'));
    const outDir = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-prospective-out-'));
    writeFixtureFile(
      repoPath,
      'package.json',
      JSON.stringify({ name: 'rubric-pin-prospective-fixture', scripts: { start: 'node server.js' } }),
    );
    writeFixtureFile(
      repoPath,
      'server.js',
      "import { createServer } from 'node:http'; createServer(() => {}).listen(3000);",
    );

    expect(
      await runWitanFreeCli([
        'scan',
        repoPath,
        '--out',
        outDir,
        '--rubric-pin',
        WITAN_RUBRIC_VERSION_V22,
      ]),
    ).toBe(0);

    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')) as {
      rubricVersion: string;
    };
    const attestation = JSON.parse(readFileSync(join(outDir, 'attestation.json'), 'utf8')) as {
      predicate: { rubricVersion: string };
    };
    expect(report.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V22);
    expect(attestation.predicate.rubricVersion).toBe(WITAN_RUBRIC_VERSION_V22);

    // Machine-readable artifacts carry the pin via the pre-existing rubricVersion field only —
    // no new field, so the default (calibrated) path's schema shape never changes.
    expect(Object.keys(report)).not.toContain('rubricCalibrationStatus');

    // Human-facing surfaces state the prospective/uncalibrated status explicitly. (The CLI
    // writes no standalone Markdown file — renderWitanMarkdownReport is covered directly in
    // certificate-presentation.test.ts.)
    const certificateHtml = readFileSync(join(outDir, 'certificate.html'), 'utf8');
    const machineSummary = readFileSync(join(outDir, 'summary.json'), 'utf8');
    expect(certificateHtml).toContain(PROSPECTIVE_RUBRIC_NOTICE);
    expect(certificateHtml).toContain(WITAN_RUBRIC_VERSION_V22);
    // summary.json is the machine-readable CLI summary, not a human-facing render surface —
    // the notice belongs on certificate.html and the terminal certificate only.
    expect(machineSummary).not.toContain(PROSPECTIVE_RUBRIC_NOTICE);
  });

  it('prints the prospective banner on the terminal certificate only when pinned to a prospective rubric', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-terminal-'));
    const outDir = mkdtempSync(join(tmpdir(), 'cejel-rubric-pin-terminal-out-'));
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'rubric-pin-terminal-fixture' }));
    writeFixtureFile(repoPath, 'README.md', '# rubric-pin-terminal-fixture\n');

    const stdoutWrites: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stdoutWrites.push(chunk.toString());
        return true;
      });
    try {
      expect(
        await runWitanFreeCli(['scan', repoPath, '--out', outDir, '--rubric-pin', WITAN_RUBRIC_VERSION_V22]),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
    const terminalOutput = stdoutWrites.join('');
    expect(terminalOutput).toContain(PROSPECTIVE_RUBRIC_NOTICE);
    expect(terminalOutput).toContain(`Rubric: ${WITAN_RUBRIC_VERSION_V22}`);
  });
});

describe('runWitanFreeCli (--ingest scanner aggregation)', () => {
  const SARIF_FIXTURE = {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'codex-security' } },
        results: [
          {
            ruleId: 'sql-injection',
            level: 'error',
            message: { text: 'SQL injection found.' },
            locations: [{ physicalLocation: { artifactLocation: { uri: 'src/db.ts' } } }],
          },
        ],
      },
    ],
  };

  const SCORECARD_FIXTURE = {
    repo: { name: 'github.com/acme/widget' },
    score: 4,
    checks: [{ name: 'Branch-Protection', score: 0, reason: 'branch protection not enabled' }],
  };

  it('folds an explicit --ingest SARIF file into the score and shows provenance', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-ingest-cli-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'sample-app' }));
    const sarifPath = join(repoPath, 'munatrust.sarif');
    writeFileSync(sarifPath, JSON.stringify(SARIF_FIXTURE));

    const baselineOutDir = join(repoPath, '.baseline');
    await runWitanFreeCli([repoPath, '--out-dir', baselineOutDir, '--quiet']);
    const baselineReport = JSON.parse(readFileSync(join(baselineOutDir, 'report.json'), 'utf8'));
    const baselineA2 = baselineReport.criteria.find((c: { id: string }) => c.id === 'A2');

    const exitCode = await runWitanFreeCli([
      repoPath,
      '--out-dir',
      outDir,
      '--ingest',
      sarifPath,
      '--quiet',
    ]);
    expect(exitCode).toBe(0);

    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
    expect(report.consumedSignals).toBeDefined();
    expect(report.consumedSignals[0]).toMatchObject({
      source: 'sarif:codex-security',
      provenance: 'operator_supplied',
    });
    const a2 = report.criteria.find((c: { id: string }) => c.id === 'A2');
    expect(a2.score).toBeLessThanOrEqual(baselineA2.score);

    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(summary.contributingSources).toContain('sarif:codex-security');

    const html = readFileSync(join(outDir, 'certificate.html'), 'utf8');
    expect(html).toContain('codex-security (operator-supplied)');
  });

  it('folds multiple --ingest sources (SARIF + Scorecard) and lists both in provenance', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-ingest-cli-multi-'));
    const outDir = join(repoPath, '.witan');
    const sarifPath = join(repoPath, 'munatrust.sarif');
    const scorecardPath = join(repoPath, 'scorecard.json');
    writeFileSync(sarifPath, JSON.stringify(SARIF_FIXTURE));
    writeFileSync(scorecardPath, JSON.stringify(SCORECARD_FIXTURE));

    await runWitanFreeCli([
      repoPath,
      '--out-dir',
      outDir,
      '--ingest',
      sarifPath,
      '--ingest',
      scorecardPath,
      '--quiet',
    ]);

    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(summary.contributingSources.sort()).toEqual(['sarif:codex-security', 'scorecard']);
  });

  it('auto-discovers .cejel/inputs/*.sarif with no --ingest flag', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-ingest-autodiscover-'));
    const outDir = join(repoPath, '.witan');
    const inputsDir = join(repoPath, '.cejel', 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    writeFileSync(join(inputsDir, 'munatrust.sarif'), JSON.stringify(SARIF_FIXTURE));

    await runWitanFreeCli([repoPath, '--out-dir', outDir, '--quiet']);

    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(summary.contributingSources).toContain('sarif:codex-security');
  });

  it('does not double-count a file that is both explicitly ingested and auto-discovered', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-ingest-dedupe-'));
    const outDir = join(repoPath, '.witan');
    const inputsDir = join(repoPath, '.cejel', 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    const sarifPath = join(inputsDir, 'munatrust.sarif');
    writeFileSync(sarifPath, JSON.stringify(SARIF_FIXTURE));

    await runWitanFreeCli([repoPath, '--out-dir', outDir, '--ingest', sarifPath, '--quiet']);

    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
    expect(report.consumedSignals).toHaveLength(1);
  });

  it('no-ingest output is byte-identical to the pre-ingest baseline', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-ingest-nodiff-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'sample-app' }));

    await runWitanFreeCli([repoPath, '--out-dir', outDir, '--quiet']);
    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
    expect(report.consumedSignals).toBeUndefined();
  });

  it('itemizes ingested findings with per-source counts + attribution across every written surface', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-ingest-itemize-'));
    const outDir = join(repoPath, '.witan');
    writeFixtureFile(repoPath, 'package.json', JSON.stringify({ name: 'sample-app' }));

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    let exitCode: number;
    let terminalOutput: string;
    try {
      exitCode = await runWitanFreeCli([
        repoPath,
        '--out-dir',
        outDir,
        '--ingest',
        CODEX_SECURITY_FIXTURE_PATH,
      ]);
      terminalOutput = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    } finally {
      stdoutSpy.mockRestore();
    }
    expect(exitCode).toBe(0);

    // report.json carries the full itemized set, attributed to source + criterion.
    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
    const totalFindings = (report.consumedSignals ?? []).reduce(
      (sum: number, s: { findings: unknown[] }) => sum + s.findings.length,
      0,
    );
    expect(totalFindings).toBe(3);
    expect(report.consumedSignals[0].source).toBe('sarif:Codex Security');
    const ingestedRuleIds = report.consumedSignals
      .flatMap((s: { findings: { ruleId: string }[] }) => s.findings)
      .map((f: { ruleId: string }) => f.ruleId)
      .sort();
    expect(ingestedRuleIds).toEqual(['cve-2024-9999', 'hardcoded-secret', 'sql-injection']);

    // summary.json shows per-source counts + capped itemized external findings.
    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(summary.externalSources).toEqual([
      {
        source: 'sarif:Codex Security',
        label: 'Codex Security',
        findingCount: 3,
        dimensions: ['A2', 'A4'],
      },
    ]);
    expect(summary.externalFindingCount).toBe(3);
    expect(summary.topExternalFindings.map((f: { ruleId: string }) => f.ruleId).sort()).toEqual([
      'cve-2024-9999',
      'hardcoded-secret',
      'sql-injection',
    ]);

    // certificate.html has a clearly-labeled, distinct "External findings" section.
    const html = readFileSync(join(outDir, 'certificate.html'), 'utf8');
    expect(html).toContain('External findings');
    expect(html).toContain(
      'Codex Security (operator-supplied): 3 findings ingested (folded into A2, A4)',
    );
    expect(html).toContain('sql-injection');

    // Terminal output shows the tool name + finding count, and itemizes the findings.
    expect(terminalOutput).toContain('Codex Security: 3 findings ingested (folded into A2, A4)');
    expect(terminalOutput).toContain(
      'External findings (3 total, attributed to tool + criterion):',
    );
    expect(terminalOutput).toContain('sql-injection');
  });
});
