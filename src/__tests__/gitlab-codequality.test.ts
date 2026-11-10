import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  GITLAB_CODEQUALITY_SEVERITY,
  exportGitLabCodeQuality,
  normalizeRepoRelativePath,
  renderGitLabCodeQualityFooter,
} from '../export/gitlab-codequality.js';
import { parseCliInvocation, runWitanFreeCli } from '../index.js';
import type { WitanReport } from '../witan/schemas.js';

const temporaryDirectories: string[] = [];
afterAll(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function finding(
  severity: 'critical' | 'warning' | 'info',
  summary: string,
  evidence: { path?: string; line?: number | null },
) {
  return {
    severity,
    summary,
    evidence: { kind: 'repository', label: 'fixture', ...evidence },
  };
}

// Only the fields the export reads. The cast is deliberate: the export is a pure function of
// criteria[].findings, consumedSignals[].findings, verdict and insufficientSourceReason.
function fixtureReport(): WitanReport {
  return {
    verdict: 'conditional',
    criteria: [
      {
        id: 'secrets-hygiene',
        findings: [
          finding('critical', 'Credential-shaped literal in source.', {
            path: './src/config.ts',
            line: 12,
          }),
          finding('warning', 'Env template lacks a placeholder note.', {
            path: '.env.example',
            line: 3,
          }),
        ],
      },
      {
        id: 'test-discipline',
        findings: [
          finding('info', 'Skipped test.', { path: 'src\\a.test.ts', line: 40 }),
          finding('warning', 'No test directory found.', { path: 'src', line: null }),
          finding('warning', 'Repository has no CI config.', {}),
        ],
      },
    ],
    consumedSignals: [
      {
        source: 'sarif:other-tool',
        findings: [{ ruleId: 'X1', severity: 'info', message: 'm', location: 'a.ts:1' }],
      },
    ],
  } as unknown as WitanReport;
}

describe('exportGitLabCodeQuality', () => {
  it('emits located findings with exact fields', () => {
    const { entries } = exportGitLabCodeQuality(fixtureReport());
    expect(entries).toHaveLength(3);
    const first = entries[0];
    expect(first).toEqual({
      description: 'Credential-shaped literal in source.',
      check_name: 'secrets-hygiene',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      location: { path: 'src/config.ts', lines: { begin: 12 } },
      severity: 'critical',
    });
    expect(Object.keys(first ?? {}).sort()).toEqual([
      'check_name',
      'description',
      'fingerprint',
      'location',
      'severity',
    ]);
    expect(entries[1]).toMatchObject({
      check_name: 'secrets-hygiene',
      location: { path: '.env.example', lines: { begin: 3 } },
      severity: 'major',
    });
    expect(entries[2]).toMatchObject({
      check_name: 'test-discipline',
      location: { path: 'src/a.test.ts', lines: { begin: 40 } },
      severity: 'info',
    });
    expect(new Set(entries.map((entry) => entry.fingerprint)).size).toBe(3);
  });

  it('excludes findings without a file or a measured line, and counts them', () => {
    const result = exportGitLabCodeQuality(fixtureReport());
    expect(result.excludedUnlocated).toBe(2);
    expect(result.excludedIngested).toBe(1);
    expect(renderGitLabCodeQualityFooter(result)).toBe(
      'Cejel: exported 3 located finding(s); 2 without a file and line excluded; ' +
        '1 ingested third-party finding(s) not exported.\n',
    );
  });

  it('exports an empty array with a reason for an abstained report', () => {
    const result = exportGitLabCodeQuality({
      verdict: 'insufficient_source',
      insufficientSourceReason: 'docs-only repository',
      criteria: [{ id: 'secrets-hygiene', findings: [finding('info', 'x', { path: 'a', line: 1 })] }],
    } as unknown as WitanReport);
    expect(result.entries).toEqual([]);
    expect(renderGitLabCodeQualityFooter(result)).toContain('docs-only repository');
    expect(renderGitLabCodeQualityFooter(result)).toContain('insufficient_source');
  });

  it('gives the same fingerprints on two runs and a different one when the line moves', () => {
    const a = exportGitLabCodeQuality(fixtureReport()).entries.map((e) => e.fingerprint);
    const b = exportGitLabCodeQuality(fixtureReport()).entries.map((e) => e.fingerprint);
    expect(a).toEqual(b);
    const moved = fixtureReport();
    const moving = moved.criteria[0]?.findings[0];
    if (moving) moving.evidence.line = 13;
    expect(exportGitLabCodeQuality(moved).entries[0]?.fingerprint).not.toBe(a[0]);
  });

  it('uses the fixed severity table', () => {
    expect(GITLAB_CODEQUALITY_SEVERITY).toEqual({
      critical: 'critical',
      warning: 'major',
      info: 'info',
    });
  });

  it('normalises paths to repository-relative and refuses ones that cannot be', () => {
    expect(normalizeRepoRelativePath('./a/b.ts')).toBe('a/b.ts');
    expect(normalizeRepoRelativePath('././a.ts')).toBe('a.ts');
    expect(normalizeRepoRelativePath('a\\b.ts')).toBe('a/b.ts');
    expect(normalizeRepoRelativePath('/etc/passwd')).toBeUndefined();
    expect(normalizeRepoRelativePath('C:/x.ts')).toBeUndefined();
    expect(normalizeRepoRelativePath('../x.ts')).toBeUndefined();
    expect(normalizeRepoRelativePath('a/../x.ts')).toBeUndefined();
    expect(normalizeRepoRelativePath('')).toBeUndefined();
  });
});

// #700: the fingerprint is the identity of a finding, so a measured value that moves between
// runs (a score, a band, a count) must not change it, and a narrower key must not drop a finding.
describe('exportGitLabCodeQuality fingerprint identity (#700)', () => {
  function metricSummary(id: string, score: string, band: 'critical' | 'warning'): string {
    return (
      `${id} metric-derived score is ${score}/4.0, in the ${band} band — no single finding ` +
      'drove this; it reflects the combined metric weighting below.'
    );
  }

  function reportOf(
    criteria: Array<{ id: string; findings: ReturnType<typeof finding>[] }>,
  ): WitanReport {
    return { verdict: 'conditional', criteria } as unknown as WitanReport;
  }

  function fingerprints(report: WitanReport): string[] {
    return exportGitLabCodeQuality(report).entries.map((entry) => entry.fingerprint);
  }

  it('keeps the fingerprint when a metric-derived score and its band move (MR !1 shape)', () => {
    const before = reportOf([
      {
        id: 'A4',
        findings: [finding('critical', metricSummary('A4', '0.5', 'critical'), { path: 'package.json', line: 1 })],
      },
      {
        id: 'B3',
        findings: [finding('warning', metricSummary('B3', '0.9', 'warning'), { path: 'package.json', line: 1 })],
      },
    ]);
    const after = reportOf([
      {
        id: 'A4',
        findings: [finding('warning', metricSummary('A4', '1.4', 'warning'), { path: 'package.json', line: 1 })],
      },
      {
        id: 'B3',
        findings: [finding('warning', metricSummary('B3', '1.4', 'warning'), { path: 'package.json', line: 1 })],
      },
    ]);
    expect(fingerprints(before)).toHaveLength(2);
    expect(fingerprints(after)).toEqual(fingerprints(before));
    const afterEntries = exportGitLabCodeQuality(after).entries;
    expect(afterEntries[0]?.description).toBe(metricSummary('A4', '1.4', 'warning'));
    expect(afterEntries[0]?.severity).toBe('major');
  });

  it('keeps the fingerprint of a non-metric finding whose summary differs only in a number', () => {
    const at = { path: 'src/a.test.ts', line: 7 };
    const count = (n: string) =>
      reportOf([{ id: 'test-discipline', findings: [finding('warning', `${n} skipped tests in this file.`, at)] }]);
    expect(fingerprints(count('3'))).toEqual(fingerprints(count('12')));
    const ratio = (r: string) =>
      reportOf([{ id: 'test-discipline', findings: [finding('warning', `Assertion ratio is ${r} here.`, at)] }]);
    expect(fingerprints(ratio('3/10'))).toEqual(fingerprints(ratio('1.4/4.0')));
    const result = exportGitLabCodeQuality(count('12'));
    expect(result.entries[0]?.description).toBe('12 skipped tests in this file.');
  });

  it('gives different fingerprints to findings at the same place whose summaries differ in words', () => {
    const at = { path: 'src/a.ts', line: 3 };
    const report = reportOf([
      {
        id: 'secrets-hygiene',
        findings: [
          finding('warning', 'Credential-shaped literal in source.', at),
          finding('warning', 'Token-shaped literal in source.', at),
        ],
      },
    ]);
    const prints = fingerprints(report);
    expect(prints).toHaveLength(2);
    expect(new Set(prints).size).toBe(2);
  });

  it('exports both findings at the same place whose summaries differ only in numbers', () => {
    const at = { path: 'src/a.ts', line: 3 };
    const build = () =>
      reportOf([
        {
          id: 'test-discipline',
          findings: [
            finding('warning', '3 skipped tests in this file.', at),
            finding('warning', '5 skipped tests in this file.', at),
            finding('warning', '3 skipped tests in this file.', at),
          ],
        },
      ]);
    const first = exportGitLabCodeQuality(build());
    expect(first.entries.map((entry) => entry.description)).toEqual([
      '3 skipped tests in this file.',
      '5 skipped tests in this file.',
    ]);
    expect(new Set(first.entries.map((entry) => entry.fingerprint)).size).toBe(2);
    expect(fingerprints(build())).toEqual(first.entries.map((entry) => entry.fingerprint));
  });

  it('exports one entry per distinct criterion, path, line and summary, as before', () => {
    const at = { path: 'src/a.ts', line: 3 };
    const report = reportOf([
      {
        id: 'A4',
        findings: [
          finding('critical', metricSummary('A4', '0.5', 'critical'), at),
          finding('critical', metricSummary('A4', '0.7', 'critical'), at),
          finding('critical', metricSummary('A4', '0.5', 'critical'), at),
          finding('info', 'Ratio 1/2 here.', at),
          finding('info', 'Ratio 2/3 here.', at),
          finding('info', 'Ratio 1/2 here.', { path: 'src/a.ts', line: 4 }),
        ],
      },
      { id: 'B3', findings: [finding('info', 'Ratio 1/2 here.', at)] },
    ]);
    const distinct = new Set(
      report.criteria.flatMap((criterion) =>
        criterion.findings.map((f) =>
          JSON.stringify([criterion.id, f.evidence.path, f.evidence.line, f.summary]),
        ),
      ),
    );
    const prints = fingerprints(report);
    expect(prints).toHaveLength(distinct.size);
    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe('cejel export gitlab-codequality', () => {
  it('parses the command', () => {
    const invocation = parseCliInvocation(['export', 'gitlab-codequality', 'r.json', '-o', 'o.json']);
    expect(invocation).toMatchObject({ command: 'export', format: 'gitlab-codequality' });
    expect(() => parseCliInvocation(['export', 'sarif', 'r.json'])).toThrow(/Usage/);
    expect(() => parseCliInvocation(['export', 'gitlab-codequality'])).toThrow(/Usage/);
    expect(() => parseCliInvocation(['export', 'gitlab-codequality', 'r.json', '--x'])).toThrow(
      /Unknown/,
    );
  });

  it('exports a real scan end to end', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cejel-glcq-'));
    temporaryDirectories.push(directory);
    const repo = join(directory, 'repo');
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'index.ts'), 'export const value = 42;\n');
    writeFileSync(join(repo, 'package.json'), '{"name":"glcq","version":"1.0.0"}\n');
    execFileSync('git', ['init', '--quiet'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '--quiet', '-m', 'x'],
      { cwd: repo },
    );
    const out = join(directory, 'out');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['scan', repo, '--out', out, '--quiet'])).toBe(0);
      const target = join(directory, 'gl.json');
      expect(
        await runWitanFreeCli(['export', 'gitlab-codequality', join(out, 'report.json'), '-o', target]),
      ).toBe(0);
      const parsed = JSON.parse(readFileSync(target, 'utf8')) as Array<{
        location: { path: string; lines: { begin: number } };
        severity: string;
      }>;
      expect(Array.isArray(parsed)).toBe(true);
      for (const entry of parsed) {
        expect(entry.location.path.startsWith('./')).toBe(false);
        expect(entry.location.lines.begin).toBeGreaterThan(0);
        expect(['info', 'minor', 'major', 'critical', 'blocker']).toContain(entry.severity);
      }
      expect(stderr.mock.calls.map((call) => String(call[0])).join('')).toMatch(/^Cejel: (exported|abstained)/m);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });
});

describe('ci/gitlab/cejel.gitlab-ci.yml', () => {
  // No YAML parser is a dependency of this package, and adding one is out of scope. These are
  // structural assertions over the text, not a parse; docs/gitlab-ci.md says so.
  const text = readFileSync(new URL('../../ci/gitlab/cejel.gitlab-ci.yml', import.meta.url), 'utf8');
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };

  it('has no tabs and declares the job, the code quality report and the .cejel artifact', () => {
    expect(text).not.toContain('\t');
    expect(text).toMatch(/^cejel:$/m);
    expect(text).toMatch(/^ {4}reports:\n {6}codequality: gl-code-quality-report\.json$/m);
    expect(text).toMatch(/^ {4}paths:\n {6}- \.cejel\/$/m);
    expect(text).toMatch(/^ {4}when: always$/m);
    expect(text).toMatch(/^ {4}CEJEL_MIN_SCORE: ""$/m);
  });

  it('pins the package version to this release and keeps the include tag in step', () => {
    expect(text).toContain(`CEJEL_VERSION: "${manifest.version}"`);
    expect(text).toContain(`/cejel/v${manifest.version}/ci/gitlab/`);
  });

  it('fetches full history on the cejel job, not shallow (#456)', () => {
    // GitLab clones shallow by default, which truncates the history A2 and B2 read. The value
    // must sit in the job's own variables block, so an include consumer gets it unedited and
    // the including pipeline's other jobs keep their depth.
    const jobVariables = /^ {2}variables:\n((?: {4}.*\n)+)/m.exec(text)?.[1] ?? '';
    expect(jobVariables).toMatch(/^ {4}GIT_DEPTH: "0"$/m);
    expect(text.match(/^ *GIT_DEPTH:/gm)).toHaveLength(1);
    expect(text).not.toMatch(/^variables:/m);
  });

  it('makes no network call beyond the pinned npx fetch', () => {
    const commands = text.split('\n').filter((line) => !line.trimStart().startsWith('#'));
    expect(commands.join('\n')).not.toMatch(/\b(curl|wget|git clone|http:\/\/)/);
    expect(commands.join('\n')).not.toMatch(/@latest/);
  });
});
