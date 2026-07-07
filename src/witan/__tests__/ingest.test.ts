import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverIngestInputs, expandIngestPattern, parseIngestFile } from '../ingest.js';

const SARIF_DOC = {
  version: '2.1.0',
  runs: [
    {
      tool: { driver: { name: 'codex-security' } },
      results: [
        {
          ruleId: 'sql-injection',
          level: 'error',
          message: { text: 'SQL injection.' },
          locations: [{ physicalLocation: { artifactLocation: { uri: 'src/db.ts' } } }],
        },
      ],
    },
  ],
};

const SCORECARD_DOC = {
  repo: { name: 'github.com/acme/widget' },
  score: 4,
  checks: [{ name: 'Branch-Protection', score: 0, reason: 'not enabled' }],
};

const GENERIC_DOC = {
  tool: 'munatrust',
  signals: [
    {
      dimension: 'A2',
      weight: 0.7,
      findings: [{ ruleId: 'hardcoded-secret', severity: 'critical', message: 'Secret found.' }],
    },
  ],
};

function writeJson(dir: string, name: string, contents: unknown): string {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(contents));
  return file;
}

describe('ingest — parseIngestFile auto-detection', () => {
  it('detects and parses SARIF by its runs array', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-'));
    const file = writeJson(dir, 'scan.sarif', SARIF_DOC);
    const signals = parseIngestFile(file);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe('sarif:codex-security');
  });

  it('detects and parses OpenSSF Scorecard JSON by its checks array', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-'));
    const file = writeJson(dir, 'scorecard.json', SCORECARD_DOC);
    const signals = parseIngestFile(file);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe('scorecard');
  });

  it('detects and parses the generic Cejel external-signal shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-'));
    const file = writeJson(dir, 'munatrust.json', GENERIC_DOC);
    const signals = parseIngestFile(file);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe('munatrust');
  });

  it('throws a clear error for an unrecognized JSON shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-'));
    const file = writeJson(dir, 'mystery.json', { hello: 'world' });
    expect(() => parseIngestFile(file)).toThrow(/unrecognized ingest file format/);
  });

  it('throws a clear error for invalid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-'));
    const file = join(dir, 'broken.json');
    writeFileSync(file, '{ not valid json');
    expect(() => parseIngestFile(file)).toThrow(/could not parse ingest file as JSON/);
  });
});

describe('ingest — silent-zero surfacing (a source that parses but maps nothing)', () => {
  const originalWrite = process.stderr.write.bind(process.stderr);
  let stderrCalls: string[];

  beforeEach(() => {
    stderrCalls = [];
    process.stderr.write = ((chunk: string) => {
      stderrCalls.push(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('warns on stderr when a SARIF source parses but 0 findings map to trust criteria', () => {
    const allNoneLevel = {
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'noisy-linter' } },
          results: [
            { ruleId: 'style/unused-var', level: 'none', message: { text: 'unused' } },
            { ruleId: 'style/formatting', level: 'none', message: { text: 'formatting' } },
          ],
        },
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-zero-'));
    const file = writeJson(dir, 'noisy.sarif', allNoneLevel);

    const signals = parseIngestFile(file);
    expect(signals).toEqual([]);
    expect(stderrCalls).toHaveLength(1);
    expect(stderrCalls[0]).toMatch(/2 findings from noisy-linter/);
    expect(stderrCalls[0]).toMatch(/0 mapped to trust criteria/);
  });

  it('does not warn when a SARIF source maps findings normally', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-'));
    const file = writeJson(dir, 'scan.sarif', SARIF_DOC);
    parseIngestFile(file);
    expect(stderrCalls).toHaveLength(0);
  });

  it('does not warn when a source legitimately has zero raw results', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-'));
    const file = writeJson(dir, 'empty.sarif', {
      version: '2.1.0',
      runs: [{ tool: { driver: { name: 'clean-scanner' } }, results: [] }],
    });
    parseIngestFile(file);
    expect(stderrCalls).toHaveLength(0);
  });
});

describe('ingest — expandIngestPattern', () => {
  it('returns a bare file path unchanged when it has no wildcard', () => {
    expect(expandIngestPattern('foo/bar.sarif')).toEqual(['foo/bar.sarif']);
  });

  it('expands a single-level glob against a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-glob-'));
    writeJson(dir, 'a.sarif', SARIF_DOC);
    writeJson(dir, 'b.sarif', SARIF_DOC);
    writeJson(dir, 'c.json', GENERIC_DOC);

    const matches = expandIngestPattern(join(dir, '*.sarif'));
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.endsWith('.sarif'))).toBe(true);
  });

  it('returns [] when a glob matches nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-glob-empty-'));
    expect(expandIngestPattern(join(dir, '*.sarif'))).toEqual([]);
  });

  it('returns [] when the directory does not exist', () => {
    expect(expandIngestPattern('/definitely/not/a/real/dir/*.sarif')).toEqual([]);
  });
});

describe('ingest — discoverIngestInputs', () => {
  it('finds .sarif and .json files under .cejel/inputs', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-discover-'));
    const inputsDir = join(repoPath, '.cejel', 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    writeJson(inputsDir, 'munatrust.sarif', SARIF_DOC);
    writeJson(inputsDir, 'scorecard.json', SCORECARD_DOC);
    writeFileSync(join(inputsDir, 'notes.txt'), 'ignored');

    const found = discoverIngestInputs(repoPath);
    expect(found).toHaveLength(2);
    expect(found.every((f) => /\.(sarif|json)$/.test(f))).toBe(true);
  });

  it('returns [] when .cejel/inputs does not exist', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-discover-none-'));
    expect(discoverIngestInputs(repoPath)).toEqual([]);
  });
});

// Regression coverage for the live crash (2026-07-06, goal_cejel_scan_robustness_ingest_and_bom):
// scoring egbert with a real Semgrep SARIF threw a Zod error — "consumedSignals[1].findings[191]
// .message — String must contain at most 500 character(s)" — because one finding's message
// exceeded WitanInputSignalFindingSchema's cap and the whole certificate failed to validate.
describe('ingest — clamps over-long finding fields instead of failing downstream validation', () => {
  it('truncates a >500-char SARIF finding message to the schema max, with an ellipsis', () => {
    const longMessage = 'x'.repeat(600);
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-long-'));
    const file = writeJson(dir, 'scan.sarif', {
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'semgrep' } },
          results: [
            {
              ruleId: 'some-rule',
              level: 'warning',
              message: { text: longMessage },
            },
          ],
        },
      ],
    });

    const signals = parseIngestFile(file);
    const finding = signals.flatMap((s) => s.findings)[0];
    expect(finding).toBeDefined();
    expect(finding?.message.length).toBeLessThanOrEqual(500);
    expect(finding?.message.endsWith('...')).toBe(true);
  });

  it('truncates an over-long ruleId and location the same way', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-long-fields-'));
    const file = writeJson(dir, 'munatrust.json', {
      tool: 'munatrust',
      signals: [
        {
          dimension: 'A2',
          weight: 0.7,
          findings: [
            {
              ruleId: 'r'.repeat(250),
              severity: 'critical',
              message: 'short message',
              location: `${'src/'.repeat(200)}file.ts:1`,
            },
          ],
        },
      ],
    });

    const signals = parseIngestFile(file);
    const finding = signals.flatMap((s) => s.findings)[0];
    expect(finding).toBeDefined();
    expect(finding?.ruleId.length).toBeLessThanOrEqual(200);
    expect(finding?.location?.length ?? 0).toBeLessThanOrEqual(700);
  });

  it('leaves short fields untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-short-'));
    const file = writeJson(dir, 'munatrust.json', GENERIC_DOC);
    const signals = parseIngestFile(file);
    expect(signals[0]?.findings[0]?.message).toBe('Secret found.');
  });
});

// Regression coverage for the live crash (2026-07-06): a BOM-prefixed ingest file (e.g. a
// SARIF report saved on Windows) must parse like any other JSON, not fail with
// "could not parse ingest file as JSON".
describe('ingest — strips a UTF-8 BOM before parsing', () => {
  it('parses a BOM-prefixed SARIF file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-ingest-bom-'));
    const file = join(dir, 'scan.sarif');
    writeFileSync(file, `﻿${JSON.stringify(SARIF_DOC)}`, 'utf8');

    const signals = parseIngestFile(file);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe('sarif:codex-security');
  });
});
