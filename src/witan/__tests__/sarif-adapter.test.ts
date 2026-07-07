import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo, createWitanReport, renderWitanMarkdownReport } from '../index.js';
import { parseIngestFile } from '../ingest.js';
import { parseSarifFile, parseSarifJson } from '../sarif-adapter.js';
import CODEX_EGBERT_FIXTURE from './fixtures/codex-egbert.sarif.json';
import SEMGREP_EGBERT_FIXTURE from './fixtures/semgrep-egbert.sarif.json';

// ---- Fixtures ---------------------------------------------------------------

const SARIF_INJECTION: unknown = {
  version: '2.1.0',
  runs: [
    {
      tool: { driver: { name: 'codex-security', version: '1.0.0' } },
      results: [
        {
          ruleId: 'sql-injection',
          level: 'error',
          message: { text: 'User input passed directly to SQL query.' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'src/db.ts' },
                region: { startLine: 42 },
              },
            },
          ],
        },
        {
          ruleId: 'sql-injection',
          level: 'error',
          message: { text: 'User input passed directly to SQL query.' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'src/db.ts' },
                region: { startLine: 42 },
              },
            },
          ],
        },
        {
          ruleId: 'hardcoded-secret',
          level: 'error',
          message: { text: 'Hardcoded API key detected.' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: 'src/config.ts' },
                region: { startLine: 10 },
              },
            },
          ],
        },
      ],
    },
  ],
};

const SARIF_MIXED: unknown = {
  version: '2.1.0',
  runs: [
    {
      tool: { driver: { name: 'mixed-scanner' } },
      results: [
        { ruleId: 'cve-2024-1234', level: 'error', message: { text: 'Critical CVE.' } },
        { ruleId: 'xss-reflected', level: 'warning', message: { text: 'Reflected XSS.' } },
        { ruleId: 'insecure-tls', level: 'warning', message: { text: 'TLS 1.0 in use.' } },
        { ruleId: 'style/unused-var', level: 'none', message: { text: 'Unused variable.' } },
      ],
    },
  ],
};

const SARIF_EMPTY_RESULTS: unknown = {
  version: '2.1.0',
  runs: [{ tool: { driver: { name: 'clean-scanner' } }, results: [] }],
};

// ---- parseSarifJson ---------------------------------------------------------

describe('parseSarifJson', () => {
  it('returns empty array for null / non-object input', () => {
    expect(parseSarifJson(null)).toEqual([]);
    expect(parseSarifJson(42)).toEqual([]);
    expect(parseSarifJson([])).toEqual([]);
    expect(parseSarifJson(undefined)).toEqual([]);
  });

  it('returns empty array for SARIF with no results', () => {
    expect(parseSarifJson(SARIF_EMPTY_RESULTS)).toEqual([]);
  });

  it('maps SQL injection findings to A2 with high weight', () => {
    const signals = parseSarifJson(SARIF_INJECTION);
    const a2Signals = signals.filter((s) => s.dimension === 'A2');
    expect(a2Signals.length).toBeGreaterThan(0);
    const maxWeight = Math.max(...a2Signals.map((s) => s.weight));
    expect(maxWeight).toBeGreaterThanOrEqual(0.8);
  });

  it('deduplicates identical findings (same ruleId + severity + location)', () => {
    const signals = parseSarifJson(SARIF_INJECTION);
    // sql-injection appears twice with identical ruleId/severity/location — deduplicated to 1
    const a2Signals = signals.filter(
      (s) => s.dimension === 'A2' && s.source === 'sarif:codex-security',
    );
    expect(a2Signals.length).toBe(1);
    const sqlFindings = (a2Signals[0]?.findings ?? []).filter((f) => f.ruleId === 'sql-injection');
    expect(sqlFindings.length).toBe(1);
  });

  it('sets source as sarif:<driver.name>', () => {
    const signals = parseSarifJson(SARIF_INJECTION);
    expect(signals.every((s) => s.source.startsWith('sarif:'))).toBe(true);
    expect(signals.some((s) => s.source === 'sarif:codex-security')).toBe(true);
  });

  it('maps CVE findings to A4 (dependency hygiene)', () => {
    const signals = parseSarifJson(SARIF_MIXED);
    const a4Signals = signals.filter((s) => s.dimension === 'A4');
    expect(a4Signals.length).toBeGreaterThan(0);
    expect((a4Signals[0]?.findings ?? []).some((f) => f.ruleId === 'cve-2024-1234')).toBe(true);
  });

  it('maps TLS findings to A3 (production readiness)', () => {
    const signals = parseSarifJson(SARIF_MIXED);
    const a3Signals = signals.filter((s) => s.dimension === 'A3');
    expect(a3Signals.length).toBeGreaterThan(0);
  });

  it('maps XSS findings to A2', () => {
    const signals = parseSarifJson(SARIF_MIXED);
    const a2Signals = signals.filter((s) => s.dimension === 'A2');
    const xssFindings = a2Signals
      .flatMap((s) => s.findings)
      .filter((f) => f.ruleId === 'xss-reflected');
    expect(xssFindings.length).toBeGreaterThan(0);
  });

  it('drops "none" level findings entirely', () => {
    const signals = parseSarifJson(SARIF_MIXED);
    const allFindings = signals.flatMap((s) => s.findings);
    expect(allFindings.every((f) => f.ruleId !== 'style/unused-var')).toBe(true);
  });

  it('maps SARIF levels to Witan severities correctly', () => {
    const sarif: unknown = {
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'test-tool' } },
          results: [
            { ruleId: 'r1', level: 'error', message: { text: 'e' } },
            { ruleId: 'r2', level: 'warning', message: { text: 'w' } },
            { ruleId: 'r3', level: 'note', message: { text: 'n' } },
          ],
        },
      ],
    };
    const signals = parseSarifJson(sarif);
    const allFindings = signals.flatMap((s) => s.findings);
    expect(allFindings.find((f) => f.ruleId === 'r1')?.severity).toBe('critical');
    expect(allFindings.find((f) => f.ruleId === 'r2')?.severity).toBe('warning');
    expect(allFindings.find((f) => f.ruleId === 'r3')?.severity).toBe('info');
  });

  it('groups findings from the same run into buckets by (source, dimension)', () => {
    const signals = parseSarifJson(SARIF_INJECTION);
    // sql-injection + hardcoded-secret both map to A2 → one bucket for A2
    const a2Bucket = signals.find(
      (s) => s.source === 'sarif:codex-security' && s.dimension === 'A2',
    );
    expect(a2Bucket).toBeDefined();
    // Both sql-injection and hardcoded-secret findings in one bucket
    expect((a2Bucket?.findings ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic: same input → same output', () => {
    const first = parseSarifJson(SARIF_INJECTION);
    const second = parseSarifJson(SARIF_INJECTION);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

// ---- Rule-default severity (Semgrep shape vs Codex shape) -------------------
// Regression coverage for the live bug (2026-07-06): Semgrep SARIF carries no per-result
// `level` — severity lives on the rule's `defaultConfiguration.level`. Fixtures are trimmed
// slices of real `cejel --ingest` runs against egbert.

describe('parseSarifJson — rule-default severity (Semgrep vs Codex shape)', () => {
  it('ingests Semgrep-shape findings via rule defaultConfiguration.level, not per-result level', () => {
    const signals = parseSarifJson(SEMGREP_EGBERT_FIXTURE);
    const allFindings = signals.flatMap((s) => s.findings);
    // 3 results in the fixture; none carry a per-result `level` — all 3 must still ingest.
    expect(allFindings.length).toBe(3);
    expect(signals.every((s) => s.source === 'sarif:Semgrep OSS')).toBe(true);

    const curlEval = allFindings.find((f) => f.ruleId === 'bash.curl.security.curl-eval.curl-eval');
    expect(curlEval?.severity).toBe('critical'); // rule defaultConfiguration.level: 'error'
    const envSecret = allFindings.find(
      (f) =>
        f.ruleId === 'yaml.github-actions.security.gha-workflow-env-secret.gha-workflow-env-secret',
    );
    expect(envSecret?.severity).toBe('warning'); // rule defaultConfiguration.level: 'warning'
  });

  it('still ingests Codex-shape findings via per-result level (no regression)', () => {
    const signals = parseSarifJson(CODEX_EGBERT_FIXTURE);
    const allFindings = signals.flatMap((s) => s.findings);
    expect(allFindings.length).toBe(2);
    expect(signals.every((s) => s.source === 'sarif:Codex Security')).toBe(true);

    const sessionFinding = allFindings.find((f) => f.ruleId === 'session-invalidation.ops-session');
    expect(sessionFinding?.severity).toBe('warning'); // per-result level: 'warning'
    const ssrfFinding = allFindings.find((f) => f.ruleId === 'ssrf.web-push');
    expect(ssrfFinding?.severity).toBe('critical'); // per-result level: 'error'
  });

  it('a rule with no defaultConfiguration.level and no per-result level falls back to warning (SARIF default)', () => {
    const sarif: unknown = {
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'no-default-scanner', rules: [{ id: 'unleveled-rule' }] } },
          results: [{ ruleId: 'unleveled-rule', message: { text: 'no level anywhere' } }],
        },
      ],
    };
    const signals = parseSarifJson(sarif);
    const finding = signals.flatMap((s) => s.findings).find((f) => f.ruleId === 'unleveled-rule');
    expect(finding?.severity).toBe('warning');
  });
});

// ---- parseSarifFile ---------------------------------------------------------

describe('parseSarifFile', () => {
  it('reads a SARIF file and parses it correctly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'witan-sarif-'));
    const sarifPath = join(dir, 'results.sarif');
    writeFileSync(sarifPath, JSON.stringify(SARIF_INJECTION), 'utf8');

    const signals = parseSarifFile(sarifPath);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.source === 'sarif:codex-security')).toBe(true);
  });
});

function writeFixture(repoPath: string, rel: string, content: string): void {
  const full = join(repoPath, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

// ---- Integration: scoring with SARIF signals --------------------------------

describe('scoring integration: SARIF signals augment native score', () => {
  it('adjusts dimension score downward with critical SARIF findings', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-sarif-score-'));
    writeFixture(
      repoPath,
      'package.json',
      JSON.stringify({ scripts: { test: 'vitest run' }, dependencies: { zod: '^3.0.0' } }),
    );
    writeFixture(repoPath, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    writeFixture(repoPath, 'src/a.test.ts', "it('ok', () => expect(1).toBe(1));\n");

    const input = buildWitanInputFromRepo({
      repoPath,
      productSlug: 'test-app',
      productDisplayName: 'Test App',
      generatedAt: '2026-06-29T00:00:00.000Z',
      rubricVersion: 'witan-rubric-v1-2026-06-24',
    });

    const nativeReport = createWitanReport(input);
    const nativeA2 = nativeReport.criteria.find((c) => c.id === 'A2');
    expect(nativeA2).toBeDefined();

    const sarifSignals = [
      {
        source: 'sarif:codex-security',
        dimension: 'A2' as const,
        weight: 0.9,
        findings: [
          {
            ruleId: 'sql-injection',
            severity: 'critical' as const,
            message: 'SQL injection found',
          },
          {
            ruleId: 'hardcoded-secret',
            severity: 'critical' as const,
            message: 'Hardcoded secret',
          },
        ],
      },
    ];

    const augmentedReport = createWitanReport(input, sarifSignals);
    const augmentedA2 = augmentedReport.criteria.find((c) => c.id === 'A2');
    expect(augmentedA2).toBeDefined();

    expect(augmentedA2?.score).toBeLessThanOrEqual(nativeA2?.score ?? 0);
    expect(augmentedA2?.nativeScore).toBe(nativeA2?.score);
    expect(augmentedReport.consumedSignals).toBeDefined();
    expect((augmentedReport.consumedSignals ?? []).length).toBeGreaterThan(0);
    expect(augmentedReport.consumedSignals?.[0]?.source).toBe('sarif:codex-security');
  });

  it('no-signal output is byte-identical: report with no signals matches baseline', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-sarif-nodiff-'));
    writeFixture(
      repoPath,
      'package.json',
      JSON.stringify({
        scripts: { test: 'vitest run', build: 'tsc' },
        dependencies: { zod: '^3.0.0' },
      }),
    );
    writeFixture(repoPath, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    writeFixture(repoPath, 'src/a.test.ts', "it('ok', () => expect(1).toBe(1));\n");

    const input = buildWitanInputFromRepo({
      repoPath,
      productSlug: 'test-app',
      productDisplayName: 'Test App',
      generatedAt: '2026-06-29T00:00:00.000Z',
      rubricVersion: 'witan-rubric-v1-2026-06-24',
    });

    const baseline = renderWitanMarkdownReport(createWitanReport(input));
    const withUndefined = renderWitanMarkdownReport(createWitanReport(input, undefined));
    const withEmpty = renderWitanMarkdownReport(createWitanReport(input, []));

    expect(withUndefined).toBe(baseline);
    expect(withEmpty).toBe(baseline);

    const baselineJson = JSON.stringify(createWitanReport(input), null, 2);
    const withUndefinedJson = JSON.stringify(createWitanReport(input, undefined), null, 2);
    expect(withUndefinedJson).toBe(baselineJson);
  });

  it('cap test: 1000 critical findings cannot lower a dimension below (nativeScore - MAX_ADJUSTMENT)', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-sarif-cap-'));
    writeFixture(
      repoPath,
      'package.json',
      JSON.stringify({ scripts: { test: 'vitest run' }, dependencies: { zod: '^3.0.0' } }),
    );
    writeFixture(repoPath, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    writeFixture(repoPath, 'src/a.test.ts', "it('ok', () => expect(1).toBe(1));\n");

    const input = buildWitanInputFromRepo({
      repoPath,
      productSlug: 'test-app',
      productDisplayName: 'Test App',
      generatedAt: '2026-06-29T00:00:00.000Z',
    });

    const nativeReport = createWitanReport(input);
    const nativeA2 = nativeReport.criteria.find((c) => c.id === 'A2');
    expect(nativeA2).toBeDefined();

    // 1000 critical findings, max weight
    const manyFindings = Array.from({ length: 1000 }, (_, i) => ({
      ruleId: `rule-${i}`,
      severity: 'critical' as const,
      message: `Critical finding ${i}`,
    }));
    const massiveSignal = [
      {
        source: 'sarif:flood-scanner',
        dimension: 'A2' as const,
        weight: 1.0,
        findings: manyFindings,
      },
    ];

    const cappedReport = createWitanReport(input, massiveSignal);
    const cappedA2 = cappedReport.criteria.find((c) => c.id === 'A2');
    expect(cappedA2).toBeDefined();

    // Max adjustment is 0.8; adjusted score ≥ nativeScore - 0.8
    const MAX_ADJUSTMENT = 0.8;
    const nativeScore = nativeA2?.score ?? 0;
    expect(cappedA2?.score ?? 0).toBeGreaterThanOrEqual(nativeScore - MAX_ADJUSTMENT - 0.05);
    // A verified native score (≥ 3.5) must remain at ≥ 2.7 after max adjustment
    if (nativeScore >= 3.5) {
      expect(cappedA2?.score ?? 0).toBeGreaterThanOrEqual(2.7 - 0.05);
    }
    // consumedSignals must be present and show the capped adjustment
    expect(cappedReport.consumedSignals).toBeDefined();
  });

  // Regression coverage for the live crash (2026-07-06, goal_cejel_scan_robustness_ingest_and_bom):
  // `cejel --ingest <sarif>` on egbert threw "consumedSignals[1].findings[191].message —
  // String must contain at most 500 character(s)" and failed the ENTIRE certificate over one
  // over-long Semgrep finding. End-to-end: --ingest file → createWitanReport must never throw.
  it('an ingested SARIF finding with a >500-char message does not crash report generation', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-sarif-longmsg-'));
    writeFixture(
      repoPath,
      'package.json',
      JSON.stringify({ scripts: { test: 'vitest run' }, dependencies: { zod: '^3.0.0' } }),
    );
    writeFixture(repoPath, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    writeFixture(repoPath, 'src/a.test.ts', "it('ok', () => expect(1).toBe(1));\n");

    const input = buildWitanInputFromRepo({
      repoPath,
      productSlug: 'test-app',
      productDisplayName: 'Test App',
      generatedAt: '2026-06-29T00:00:00.000Z',
      rubricVersion: 'witan-rubric-v1-2026-06-24',
    });

    const ingestDir = mkdtempSync(join(tmpdir(), 'witan-sarif-longmsg-ingest-'));
    const sarifPath = join(ingestDir, 'semgrep.sarif');
    writeFileSync(
      sarifPath,
      JSON.stringify({
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: 'Semgrep OSS' } },
            results: [
              {
                ruleId: 'bash.curl.security.curl-eval.curl-eval',
                level: 'error',
                message: { text: 'y'.repeat(800) },
                locations: [{ physicalLocation: { artifactLocation: { uri: 'scripts/x.sh' } } }],
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const inputSignals = parseIngestFile(sarifPath);
    expect(() => createWitanReport(input, inputSignals)).not.toThrow();

    const report = createWitanReport(input, inputSignals);
    const finding = (report.consumedSignals ?? []).flatMap((s) => s.findings)[0];
    expect(finding).toBeDefined();
    expect(finding?.message.length).toBeLessThanOrEqual(500);
  });
});
