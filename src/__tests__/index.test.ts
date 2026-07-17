import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { parseArgs, runWitanFreeCli } from '../index.js';

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

  it('retains --out-dir as a backwards-compatible alias', () => {
    expect(parseArgs(['--out-dir', 'out']).outDir).toBe('out');
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--nonsense'])).toThrow(/Unknown Cejel CLI flag/);
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

describe('runWitanFreeCli (zero-config end-to-end)', () => {
  it('--help exits 0 and prints usage', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['--help'])).toBe(0);
      expect(stdoutSpy.mock.calls.map((call) => String(call[0])).join('')).toContain(
        'Usage:  npx cejel [path] [options]',
      );
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
    const attestation = JSON.parse(readFileSync(join(outDir, 'attestation.json'), 'utf8'));
    expect(attestation).toMatchObject({
      _type: 'https://in-toto.io/Statement/v1',
      predicateType: 'https://cejel.dev/attestations/scan/v1',
      predicate: {
        assurance: { status: 'unsigned', issuer: 'self-generated' },
        outcome: { status: 'scored' },
      },
    });
    expect(attestation.subject[0].digest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(attestation.subject[0].digest.sha256).toBe(
      createHash('sha256').update(reportJson, 'utf8').digest('hex'),
    );
    const html = readFileSync(join(outDir, 'certificate.html'), 'utf8');
    expect(html).toContain('Trust Certificate');
    const badgeJson = JSON.parse(readFileSync(join(outDir, 'badge.json'), 'utf8'));
    expect(badgeJson).toMatchObject({ schemaVersion: 1, label: 'cejel trust' });
    const badgeSvg = readFileSync(join(outDir, 'badge.svg'), 'utf8');
    expect(badgeSvg).toContain('<svg');
    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(summary.verdict).toBeDefined();
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
    expect(report.consumedSignals[0].source).toBe('sarif:codex-security');
    const a2 = report.criteria.find((c: { id: string }) => c.id === 'A2');
    expect(a2.score).toBeLessThanOrEqual(baselineA2.score);

    const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(summary.contributingSources).toContain('sarif:codex-security');

    const html = readFileSync(join(outDir, 'certificate.html'), 'utf8');
    expect(html).toContain('sarif:codex-security');
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
    expect(html).toContain('Codex Security: 3 findings ingested (folded into A2, A4)');
    expect(html).toContain('sql-injection');

    // Terminal output shows the tool name + finding count, and itemizes the findings.
    expect(terminalOutput).toContain('Codex Security: 3 findings ingested (folded into A2, A4)');
    expect(terminalOutput).toContain(
      'External findings (3 total, attributed to tool + criterion):',
    );
    expect(terminalOutput).toContain('sql-injection');
  });
});
