import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCejelScan } from '../../scan.js';
import { createWitanAttestation, verifyWitanAttestationBinding } from '../attestation.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';

const GENERATED_AT = '2026-07-30T00:00:00.000Z';

function makeFixtureRepo(tool: string): { repoPath: string; ingestPath: string } {
  const repoPath = mkdtempSync(join(tmpdir(), 'witan-provenance-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Cejel Test'], { cwd: repoPath });

  writeFixtureFile(
    repoPath,
    'package.json',
    JSON.stringify({
      name: 'provenance-fixture',
      scripts: { build: 'tsc', test: 'vitest run' },
      dependencies: { zod: '^4.0.0' },
    }),
  );
  writeFixtureFile(repoPath, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  writeFixtureFile(repoPath, 'src/index.ts', 'export const answer = 42;\n');
  writeFixtureFile(repoPath, 'src/index.test.ts', "it('answers', () => expect(42).toBe(42));\n");
  const ingestPath = writeFixtureFile(
    repoPath,
    '.cejel/inputs/evil.json',
    JSON.stringify({
      tool,
      signals: [
        {
          dimension: 'A2',
          weight: 1,
          findings: [
            {
              ruleId: 'fabricated-scanner-run',
              severity: 'critical',
              message: 'Repository claims an external scanner ran.',
            },
          ],
        },
      ],
    }),
  );
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repoPath });
  return { repoPath, ingestPath };
}

function writeFixtureFile(repoPath: string, relativePath: string, contents: string): string {
  const fullPath = join(repoPath, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, contents, 'utf8');
  return fullPath;
}

function scoreFixture(
  repoPath: string,
  options: { ingestPatterns?: readonly string[]; autoDiscoverIngest?: boolean } = {},
) {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'provenance-fixture',
    productDisplayName: 'Provenance Fixture',
    generatedAt: GENERATED_AT,
    ...options,
  });
}

describe('ingest provenance integrity', () => {
  it('public scans ignore repository-authored inputs by default and require explicit opt-in', () => {
    const { repoPath } = makeFixtureRepo('Fabricated CodeQL');

    const defaultReport = scoreFixture(repoPath);
    const optedInReport = scoreFixture(repoPath, { autoDiscoverIngest: true });

    expect(defaultReport.consumedSignals).toBeUndefined();
    expect(optedInReport.consumedSignals).toHaveLength(1);
    expect(optedInReport.consumedSignals?.[0]).toMatchObject({
      source: 'Fabricated CodeQL',
      provenance: 'auto_discovered',
    });
  });

  it('retains local CLI auto-discovery because the operator controls the scanned repository', () => {
    const { repoPath } = makeFixtureRepo('Local Semgrep');

    const { report } = runCejelScan({ repoPath });

    expect(report.consumedSignals?.[0]).toMatchObject({
      source: 'Local Semgrep',
      provenance: 'auto_discovered',
    });
  });

  it('marks hostile auto-discovered labels unverified in JSON, HTML, markdown, and attestation', () => {
    const hostileTool = `Hostile\u0000\n<script>forge()</script>**trusted** ${'Very Long Scanner '.repeat(12)}`;
    const { repoPath } = makeFixtureRepo(hostileTool);

    const report = scoreFixture(repoPath, { autoDiscoverIngest: true });
    const consumed = report.consumedSignals?.[0];
    expect(consumed?.provenance).toBe('auto_discovered');
    expect(consumed?.source.length).toBeLessThanOrEqual(120);
    expect(consumed?.source).not.toMatch(/[\p{Cc}\p{Cf}]/u);

    const html = renderWitanHtmlReport(report);
    expect(html).toContain('self-declared by the scanned repository — not verified');
    expect(html).not.toContain('<script>forge()</script>');
    expect(html).toContain('&lt;script&gt;forge()&lt;/script&gt;');

    const markdown = renderWitanMarkdownReport(report);
    expect(markdown).toContain('self-declared by the scanned repository — not verified');
    expect(markdown).toContain('| auto_discovered |');
    expect(markdown).not.toContain('<script>forge()</script>');
    expect(markdown).toContain('\\<script\\>forge()\\</script\\>');

    const attestation = createWitanAttestation(report, {
      toolVersion: 'test',
      generatedAt: '2026-07-06T00:00:00.000Z',
    });
    expect(attestation.predicate.externalSignalProvenance).toEqual([
      { source: consumed?.source, provenance: 'auto_discovered' },
    ]);
    expect(verifyWitanAttestationBinding(attestation, report)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('keeps explicit --ingest operator-supplied and scoring identical across provenance classes', () => {
    const { repoPath, ingestPath } = makeFixtureRepo('Operator CodeQL');

    const operatorReport = scoreFixture(repoPath, { ingestPatterns: [ingestPath] });
    const discoveredReport = scoreFixture(repoPath, { autoDiscoverIngest: true });
    const operatorSignal = operatorReport.consumedSignals?.[0];
    const discoveredSignal = discoveredReport.consumedSignals?.[0];

    expect(operatorSignal).toMatchObject({
      source: 'Operator CodeQL',
      provenance: 'operator_supplied',
    });
    expect(renderWitanHtmlReport(operatorReport)).toContain('Operator CodeQL (operator-supplied)');
    expect(renderWitanMarkdownReport(operatorReport)).toContain(
      'Operator CodeQL (operator-supplied)',
    );

    expect(discoveredReport.criteria).toEqual(operatorReport.criteria);
    expect(discoveredSignal?.scoreAdjustment).toBe(operatorSignal?.scoreAdjustment);
    expect(Math.abs(operatorSignal?.scoreAdjustment ?? 0)).toBeLessThanOrEqual(0.8);
    expect(operatorSignal?.adjustedScore).toBeGreaterThanOrEqual(
      (operatorSignal?.nativeScore ?? 0) - 0.8,
    );
    if ((operatorSignal?.nativeScore ?? 0) >= 3.5) {
      expect(operatorSignal?.adjustedScore).toBeGreaterThanOrEqual(2.7);
    }
  });

  it('is deterministic for identical provenance inputs', () => {
    const { repoPath } = makeFixtureRepo('Deterministic Scanner');

    expect(JSON.stringify(scoreFixture(repoPath, { autoDiscoverIngest: true }))).toBe(
      JSON.stringify(scoreFixture(repoPath, { autoDiscoverIngest: true })),
    );
  });
});
