import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  exportGitLabMetrics,
  formatGitLabMetricScore,
  renderGitLabMetricsFile,
  renderGitLabMetricsFooter,
} from '../export/gitlab-metrics.js';
import { USAGE, parseCliInvocation, runWitanFreeCli } from '../index.js';
import type { WitanReport } from '../witan/schemas.js';

const temporaryDirectories: string[] = [];
afterAll(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

type Status =
  | 'verified'
  | 'info'
  | 'warning'
  | 'critical'
  | 'unverified'
  | 'insufficient_data'
  | 'not_applicable';

function criterion(
  id: string,
  category: string,
  status: Status,
  score: number,
): { id: string; category: string; status: Status; score: number; findings: [] } {
  return { id, category, status, score, findings: [] };
}

// Only the fields the export reads. The cast is deliberate: the export is a pure function of
// verdict, the three headline scores, insufficientSourceReason and criteria[].{id, category,
// status, score}.
function fixtureReport(
  overrides: Partial<{
    overallScore: number | null;
    codeTrustScore: number | null;
    processTrustScore: number | null;
    criteria: ReturnType<typeof criterion>[];
  }> = {},
): WitanReport {
  return {
    verdict: 'at_risk',
    overallScore: 1.7,
    codeTrustScore: 1.3,
    processTrustScore: 2.1,
    criteria: [
      criterion('A1', 'code_trust', 'warning', 1.04),
      criterion('A4', 'code_trust', 'critical', 0.5),
      criterion('A5', 'code_trust', 'not_applicable', 0),
      criterion('B2', 'process_trust', 'insufficient_data', 0),
      criterion('B3', 'process_trust', 'verified', 2.96),
      criterion('B4', 'process_trust', 'unverified', 0),
    ],
    ...overrides,
  } as unknown as WitanReport;
}

describe('exportGitLabMetrics', () => {
  it('writes exact lines, in a fixed order, with the terminal rounding', () => {
    const result = exportGitLabMetrics(fixtureReport());
    expect(renderGitLabMetricsFile(result)).toBe(
      [
        'cejel_overall_score 1.7',
        'cejel_process_trust_score 2.1',
        'cejel_code_trust_score 1.3',
        'cejel_criterion_a1_score 1.0',
        'cejel_criterion_a4_score 0.5',
        'cejel_criterion_b3_score 3.0',
        'cejel_criterion_b4_score 0.0',
        '',
      ].join('\n'),
    );
  });

  it('formats a score the way the terminal certificate does', () => {
    for (const score of [0, 0.05, 0.25, 1.04, 1.25, 1.45, 2.15, 2.96, 3.95, 4]) {
      expect(formatGitLabMetricScore(score)).toBe(score.toFixed(1));
    }
  });

  it('gives identical files for scores that differ only below the printed precision', () => {
    const before = fixtureReport({
      overallScore: 1.71,
      codeTrustScore: 1.26,
      processTrustScore: 2.14,
      criteria: [
        criterion('A1', 'code_trust', 'warning', 1.01),
        criterion('B3', 'process_trust', 'verified', 2.96),
      ],
    });
    const after = fixtureReport({
      overallScore: 1.74,
      codeTrustScore: 1.34,
      processTrustScore: 2.06,
      criteria: [
        criterion('A1', 'code_trust', 'warning', 1.04),
        criterion('B3', 'process_trust', 'verified', 3.04),
      ],
    });
    expect(renderGitLabMetricsFile(exportGitLabMetrics(after))).toBe(
      renderGitLabMetricsFile(exportGitLabMetrics(before)),
    );
  });

  it('writes a changed line when a score moves at the printed precision', () => {
    const before = renderGitLabMetricsFile(exportGitLabMetrics(fixtureReport()));
    const after = renderGitLabMetricsFile(exportGitLabMetrics(fixtureReport({ overallScore: 1.4 })));
    expect(after).not.toBe(before);
    expect(after).toContain('cejel_overall_score 1.4\n');
  });

  it('writes no line for an unrated criterion, and counts it as left out', () => {
    const result = exportGitLabMetrics(fixtureReport());
    const file = renderGitLabMetricsFile(result);
    expect(file).not.toContain('cejel_criterion_a5_score');
    expect(file).not.toContain('cejel_criterion_b2_score');
    expect(result.leftOut).toEqual(['cejel_criterion_a5_score', 'cejel_criterion_b2_score']);
    expect(renderGitLabMetricsFooter(result)).toBe(
      'Cejel: wrote 7 metric(s); 2 value(s) left out because Cejel did not measure them ' +
        '(cejel_criterion_a5_score, cejel_criterion_b2_score).\n',
    );
  });

  it('writes no line for a null trust score', () => {
    const result = exportGitLabMetrics(fixtureReport({ processTrustScore: null }));
    expect(renderGitLabMetricsFile(result)).not.toContain('cejel_process_trust_score');
    expect(result.leftOut).toContain('cejel_process_trust_score');
  });

  it('writes no trust line for a category in which no criterion was measured', () => {
    // The scorer averages an all-abstained category to 0. That 0 is arithmetic, not a measurement.
    const result = exportGitLabMetrics(
      fixtureReport({
        processTrustScore: 0,
        overallScore: 0.7,
        criteria: [
          criterion('A1', 'code_trust', 'warning', 1.3),
          criterion('B2', 'process_trust', 'insufficient_data', 0),
          criterion('B5', 'process_trust', 'not_applicable', 0),
        ],
      }),
    );
    const file = renderGitLabMetricsFile(result);
    expect(file).not.toContain('cejel_process_trust_score');
    expect(file).not.toMatch(/ 0(\.0)?$/m);
    expect(result.leftOut).toEqual([
      'cejel_process_trust_score',
      'cejel_criterion_b2_score',
      'cejel_criterion_b5_score',
    ]);
  });

  it('writes no overall line when no criterion was measured at all', () => {
    const result = exportGitLabMetrics(
      fixtureReport({
        overallScore: 0,
        codeTrustScore: 0,
        processTrustScore: 0,
        criteria: [
          criterion('A1', 'code_trust', 'insufficient_data', 0),
          criterion('B3', 'process_trust', 'not_applicable', 0),
        ],
      }),
    );
    expect(renderGitLabMetricsFile(result)).toBe('');
    expect(result.leftOut).toEqual([
      'cejel_overall_score',
      'cejel_process_trust_score',
      'cejel_code_trust_score',
      'cejel_criterion_a1_score',
      'cejel_criterion_b3_score',
    ]);
  });

  it('writes no trust line for a category the rubric does not have', () => {
    // A trading-rubric report carries codeTrustScore and processTrustScore as its first two
    // categories. Neither is code or process trust, so neither is written under those names.
    const result = exportGitLabMetrics(
      fixtureReport({
        overallScore: 2,
        codeTrustScore: 2,
        processTrustScore: 2,
        criteria: [
          criterion('validation-integrity', 'validation_trust', 'verified', 2),
          criterion('risk-governance', 'governance_trust', 'warning', 2),
        ],
      }),
    );
    expect(renderGitLabMetricsFile(result)).toBe(
      [
        'cejel_overall_score 2.0',
        'cejel_criterion_validation_integrity_score 2.0',
        'cejel_criterion_risk_governance_score 2.0',
        '',
      ].join('\n'),
    );
    expect(result.leftOut).toEqual([]);
  });

  it('writes an empty file for an abstained report, and the footer says why', () => {
    const result = exportGitLabMetrics({
      verdict: 'insufficient_source',
      overallScore: null,
      codeTrustScore: null,
      processTrustScore: null,
      insufficientSourceReason: 'docs-only repository',
      criteria: [criterion('A1', 'code_trust', 'warning', 1)],
    } as unknown as WitanReport);
    expect(result.lines).toEqual([]);
    expect(renderGitLabMetricsFile(result)).toBe('');
    const footer = renderGitLabMetricsFooter(result);
    expect(footer).toContain('insufficient_source');
    expect(footer).toContain('docs-only repository');
    expect(footer).toContain('wrote 0 metrics');
  });

  it('is pure: the same report gives the same file twice', () => {
    expect(renderGitLabMetricsFile(exportGitLabMetrics(fixtureReport()))).toBe(
      renderGitLabMetricsFile(exportGitLabMetrics(fixtureReport())),
    );
  });
});

describe('cejel export gitlab-metrics', () => {
  it('parses the command, defaults the output to metrics.txt, and still refuses unknown formats', () => {
    expect(parseCliInvocation(['export', 'gitlab-metrics', 'r.json'])).toMatchObject({
      command: 'export',
      format: 'gitlab-metrics',
      outPath: expect.stringMatching(/metrics\.txt$/),
    });
    expect(
      parseCliInvocation(['export', 'gitlab-metrics', 'r.json', '-o', 'm.txt']),
    ).toMatchObject({ format: 'gitlab-metrics', outPath: expect.stringMatching(/m\.txt$/) });
    expect(parseCliInvocation(['export', 'gitlab-codequality', 'r.json'])).toMatchObject({
      format: 'gitlab-codequality',
      outPath: expect.stringMatching(/gl-code-quality-report\.json$/),
    });
    expect(() => parseCliInvocation(['export', 'sarif', 'r.json'])).toThrow(/Usage/);
    expect(() => parseCliInvocation(['export', 'gitlab-metrics'])).toThrow(/Usage/);
    expect(() => parseCliInvocation(['export', 'gitlab-metrics', 'r.json', '--x'])).toThrow(
      /Unknown/,
    );
  });

  it('names both formats in the usage text', () => {
    let message = '';
    try {
      parseCliInvocation(['export', 'sarif', 'r.json']);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('export gitlab-codequality <report.json>');
    expect(message).toContain('export gitlab-metrics <report.json> [-o metrics.txt]');
    expect(USAGE).toContain('export gitlab-codequality <report.json>');
    expect(USAGE).toContain('export gitlab-metrics <report.json> [-o metrics.txt]');
  });

  it('refuses an invalid report and writes no file', async () => {
    const directory = temporaryDirectory('cejel-glm-invalid-');
    const reportPath = join(directory, 'report.json');
    writeFileSync(reportPath, '{"verdict":"verified","overallScore":9}\n');
    const target = join(directory, 'metrics.txt');
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['export', 'gitlab-metrics', reportPath, '-o', target])).toBe(1);
      expect(stderr.mock.calls.map((call) => String(call[0])).join('')).toContain(
        'report validation failed',
      );
      expect(existsSync(target)).toBe(false);
    } finally {
      stderr.mockRestore();
    }
  });

  it('exports a real scan end to end, with the same values the terminal prints', async () => {
    const directory = temporaryDirectory('cejel-glm-');
    const repo = join(directory, 'repo');
    mkdirSync(join(repo, 'src'), { recursive: true });
    mkdirSync(join(repo, 'test'), { recursive: true });
    writeFileSync(
      join(repo, 'src', 'index.ts'),
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    );
    writeFileSync(
      join(repo, 'test', 'index.test.ts'),
      "import { add } from '../src/index';\n\nif (add(1, 2) !== 3) throw new Error('add');\n",
    );
    writeFileSync(
      join(repo, 'package.json'),
      '{"name":"glm","version":"1.0.0","scripts":{"test":"node test/index.test.ts"}}\n',
    );
    writeFileSync(join(repo, 'README.md'), '# glm\n\nAdds two numbers.\n');
    execFileSync('git', ['init', '--quiet'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'x'],
      { cwd: repo },
    );
    const out = join(directory, 'out');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['scan', repo, '--out', out])).toBe(0);
      const terminal = stdout.mock.calls.map((call) => String(call[0])).join('');
      const target = join(directory, 'metrics.txt');
      stderr.mockClear();
      expect(
        await runWitanFreeCli(['export', 'gitlab-metrics', join(out, 'report.json'), '-o', target]),
      ).toBe(0);
      const file = readFileSync(target, 'utf8');
      const footer = stderr.mock.calls.map((call) => String(call[0])).join('');
      const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as {
        verdict: string;
      };
      // This fixture must score: an abstained scan would leave the comparison below empty.
      expect(report.verdict).not.toBe('insufficient_source');
      expect(footer).toMatch(/^Cejel: wrote \d+ metric\(s\); \d+ value\(s\) left out/);
      for (const line of file.trimEnd().split('\n')) {
        expect(line).toMatch(/^cejel_[a-z0-9_]+_score \d\.\d$/);
      }
      const value = (name: string) => new RegExp(`^${name} (\\d\\.\\d)$`, 'm').exec(file)?.[1];
      expect(value('cejel_overall_score')).toBe(/Overall: (\d\.\d)\/4\.0/.exec(terminal)?.[1]);
      expect(value('cejel_code_trust_score')).toBe(/Code trust: +(\d\.\d)\/4\.0/.exec(terminal)?.[1]);
      expect(value('cejel_process_trust_score')).toBe(
        /Process trust: +(\d\.\d)\/4\.0/.exec(terminal)?.[1],
      );
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });
});

describe('ci/gitlab/cejel.gitlab-ci.yml metrics report', () => {
  // Structural assertions over the text, as in gitlab-codequality.test.ts, plus one run of the
  // job's script under the shell options GitLab's runner uses, with `npx` replaced by a stub.
  const text = readFileSync(new URL('../../ci/gitlab/cejel.gitlab-ci.yml', import.meta.url), 'utf8');

  it('declares the metrics report beside the code quality report', () => {
    expect(text).toMatch(
      /^ {4}reports:\n {6}codequality: gl-code-quality-report\.json\n {6}metrics: metrics\.txt$/m,
    );
  });

  it('runs the metrics export after the code quality export', () => {
    const codequality = text.indexOf('export gitlab-codequality .cejel/report.json');
    const metrics = text.indexOf('export gitlab-metrics .cejel/report.json -o metrics.txt');
    expect(codequality).toBeGreaterThan(-1);
    expect(metrics).toBeGreaterThan(codequality);
  });

  function jobScript(): string {
    const block = /^ {4}- \|\n((?: {6}.*\n|\n)+)/m.exec(text)?.[1];
    if (block === undefined) throw new Error('No script block in the template.');
    return block
      .split('\n')
      .map((line) => line.slice(6))
      .join('\n');
  }

  function runJob(scanStatus: number, metricsStatus: number) {
    const directory = temporaryDirectory('cejel-glm-job-');
    const bin = join(directory, 'bin');
    const work = join(directory, 'work');
    mkdirSync(bin);
    mkdirSync(work);
    const stub = join(bin, 'npx');
    writeFileSync(
      stub,
      [
        '#!/bin/sh',
        'case "$*" in',
        `  *" scan "*) mkdir -p .cejel && echo '{}' > .cejel/report.json; exit ${scanStatus} ;;`,
        `  *"export gitlab-codequality"*) echo '[]' > gl-code-quality-report.json; exit 0 ;;`,
        `  *"export gitlab-metrics"*) echo 'stub: metrics export failed' >&2; exit ${metricsStatus} ;;`,
        'esac',
        'exit 99',
        '',
      ].join('\n'),
    );
    chmodSync(stub, 0o755);
    const result = spawnSync('bash', ['-eo', 'pipefail', '-c', jobScript()], {
      cwd: work,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        CEJEL_VERSION: '0.0.0-test',
        CEJEL_MIN_SCORE: '',
      },
      encoding: 'utf8',
    });
    return { result, work };
  }

  it.skipIf(process.platform === 'win32')(
    "keeps the scan's exit status, and the code quality report, when the metrics export fails",
    () => {
      const failedGate = runJob(2, 1);
      expect(failedGate.result.status).toBe(2);
      expect(existsSync(join(failedGate.work, 'gl-code-quality-report.json'))).toBe(true);
      expect(failedGate.result.stderr).toContain('metrics export failed');

      const passedGate = runJob(0, 1);
      expect(passedGate.result.status).toBe(0);
      expect(existsSync(join(passedGate.work, 'gl-code-quality-report.json'))).toBe(true);

      const allPassed = runJob(0, 0);
      expect(allPassed.result.status).toBe(0);
    },
  );
});
