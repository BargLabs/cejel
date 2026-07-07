import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  collectExternalFindings,
  formatExternalSourceLine,
  summarizeExternalSources,
} from '../external-findings.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { parseSarifFile } from '../sarif-adapter.js';
import { createWitanReport } from '../scoring.js';

// Committed fixture (not a machine-specific temp file) — a small, deterministic SARIF scan
// with a known finding set: 2 findings on A2 (sql-injection, hardcoded-secret, both critical)
// and 1 finding on A4 (cve-2024-9999, warning) from a tool named "Codex Security".
const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'codex-security-sample.sarif',
);

const REPO_INPUT = {
  productSlug: 'sample-app',
  productDisplayName: 'Sample App',
  repo: { path: '/tmp/sample-app' },
  generatedAt: '2026-07-06T00:00:00.000Z',
  rubricVersion: 'witan-rubric-v1-2026-06-24',
};

describe('ingest itemization: fixture SARIF surfaces per-source counts + attributed findings', () => {
  it('parses the fixture into exactly the known finding set', () => {
    const signals = parseSarifFile(FIXTURE_PATH);
    const allFindings = signals.flatMap((s) => s.findings);
    expect(allFindings).toHaveLength(3);
    expect(signals.map((s) => s.dimension).sort()).toEqual(['A2', 'A4']);
  });

  it('createWitanReport carries every ingested finding, attributed to source + criterion', () => {
    const signals = parseSarifFile(FIXTURE_PATH);
    const report = createWitanReport(REPO_INPUT, signals);

    expect(report.consumedSignals).toBeDefined();
    const consumedSignals = report.consumedSignals ?? [];
    const totalFindings = consumedSignals.reduce((sum, s) => sum + s.findings.length, 0);
    expect(totalFindings).toBe(3);
    expect(consumedSignals.every((s) => s.source === 'sarif:Codex Security')).toBe(true);

    const sourceSummaries = summarizeExternalSources(consumedSignals);
    expect(sourceSummaries).toEqual([
      {
        source: 'sarif:Codex Security',
        label: 'Codex Security',
        findingCount: 3,
        dimensions: ['A2', 'A4'],
      },
    ]);
    const codexSummary = sourceSummaries[0];
    if (!codexSummary) throw new Error('expected one source summary');
    expect(formatExternalSourceLine(codexSummary)).toBe(
      'Codex Security: 3 findings ingested (folded into A2, A4)',
    );

    const externalFindings = collectExternalFindings(consumedSignals);
    expect(externalFindings.map((f) => f.ruleId).sort()).toEqual([
      'cve-2024-9999',
      'hardcoded-secret',
      'sql-injection',
    ]);
    expect(externalFindings.every((f) => f.label === 'Codex Security')).toBe(true);
    expect(externalFindings.find((f) => f.ruleId === 'sql-injection')?.dimension).toBe('A2');
    expect(externalFindings.find((f) => f.ruleId === 'cve-2024-9999')?.dimension).toBe('A4');
    // Deterministic: same input -> same output.
    expect(externalFindings).toEqual(collectExternalFindings(consumedSignals));
  });

  it('the markdown report itemizes external findings in a section distinct from own findings', () => {
    const signals = parseSarifFile(FIXTURE_PATH);
    const report = createWitanReport(REPO_INPUT, signals);
    const markdown = renderWitanMarkdownReport(report);

    expect(markdown).toContain('- Codex Security: 3 findings ingested (folded into A2, A4)');
    expect(markdown).toContain('## External findings');
    expect(markdown).toContain('sql-injection — User input passed directly to SQL query.');
    expect(markdown).toContain('hardcoded-secret — Hardcoded API key detected in source.');
    expect(markdown).toContain('cve-2024-9999 — Dependency has a known critical CVE.');
    // External findings section comes after cejel's own Findings section.
    expect(markdown.indexOf('## Findings')).toBeLessThan(markdown.indexOf('## External findings'));
  });

  it('the HTML certificate has a clearly-labeled External findings section', () => {
    const signals = parseSarifFile(FIXTURE_PATH);
    const report = createWitanReport(REPO_INPUT, signals);
    const html = renderWitanHtmlReport(report);

    expect(html).toContain('External findings');
    expect(html).toContain('Codex Security: 3 findings ingested (folded into A2, A4)');
    expect(html).toContain('sql-injection');
    expect(html).toContain('hardcoded-secret');
    expect(html).toContain('cve-2024-9999');
  });

  it('is deterministic end to end: same fixture -> byte-identical report JSON', () => {
    const signalsA = parseSarifFile(FIXTURE_PATH);
    const signalsB = parseSarifFile(FIXTURE_PATH);
    const reportA = createWitanReport(REPO_INPUT, signalsA);
    const reportB = createWitanReport(REPO_INPUT, signalsB);
    expect(JSON.stringify(reportA)).toBe(JSON.stringify(reportB));
  });
});
