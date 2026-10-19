import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderTerminalCertificate } from '../../terminal.js';
import { buildWitanCliSummary } from '../../summary.js';
import { renderWitanHtmlReport } from '../html.js';
import { inheritedFindingNote, inheritedFindingNoteRuleIds } from '../input-binding-presentation.js';
import { renderWitanMarkdownReport } from '../markdown.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { parseScorecardJson } from '../scorecard-adapter.js';

// Imported findings are evidence from another tool, never independent corroboration of a native
// finding. These tests pin the three aggregation behaviours docs/input-binding.md and the PR
// that added this file report on, and the presentation that keeps each one from being misread:
//   (a) Scorecard SAST is folded into A2 (secrets / data-layer), which it does not measure;
//   (b) a small imported adjustment can move a criterion's status;
//   (c) Scorecard Dependency-Update-Tool and Security-Policy restate files Cejel reads natively.
// None of them changes a score here. Each note states a fact checked below.

function repo(files: Record<string, string>): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'cejel-inherited-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'inherited@example.invalid']);
  git(['config', 'user.name', 'Cejel Inherited']);
  git(['config', 'commit.gpgsign', 'false']);
  for (const [relative, contents] of Object.entries(files)) {
    const path = join(repoPath, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }
  git(['add', '.']);
  git(['commit', '--quiet', '--no-gpg-sign', '-m', 'fixture']);
  return repoPath;
}

const BASE_FILES = {
  'package.json': JSON.stringify({
    name: 'inherited',
    scripts: { build: 'tsc', test: 'vitest run' },
    devDependencies: { vitest: '^2.0.0' },
  }),
  'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
  'src/index.ts': 'export const answer = 42;\n',
  'src/index.test.ts': "it('answers', () => expect(42).toBe(42));\n",
  '.github/workflows/ci.yml':
    'on: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm test\n',
};

function writeInput(body: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), 'cejel-inherited-input-'));
  const path = join(directory, 'input.json');
  writeFileSync(path, JSON.stringify(body), 'utf8');
  return path;
}

function score(repoPath: string, ingest: readonly string[]) {
  return scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'inherited',
    productDisplayName: 'Inherited',
    generatedAt: '2026-10-19T00:00:00.000Z',
    ingestPatterns: ingest,
  });
}

describe('inherited evidence is attributed, not presented as corroboration', () => {
  it('every noted check maps to the criterion its note names', () => {
    const signals = parseScorecardJson({
      checks: [
        { name: 'SAST', score: 0 },
        { name: 'Dependency-Update-Tool', score: 0 },
        { name: 'Security-Policy', score: 0 },
      ],
    });
    const dimensionOf = (ruleId: string) =>
      signals.find((signal) => signal.findings.some((finding) => finding.ruleId === ruleId))?.dimension;
    expect(dimensionOf('scorecard:SAST')).toBe('A2');
    expect(dimensionOf('scorecard:Dependency-Update-Tool')).toBe('A4');
    expect(dimensionOf('scorecard:Security-Policy')).toBe('B4');
    expect(inheritedFindingNoteRuleIds()).toEqual([
      'scorecard:Dependency-Update-Tool',
      'scorecard:SAST',
      'scorecard:Security-Policy',
    ]);
    expect(inheritedFindingNote('scorecard:SAST')).toContain('folds it into A2');
  });

  it('(c) Dependency-Update-Tool restates the file A4 dependency_automation_ratio already reads', () => {
    const automation = (files: Record<string, string>) =>
      score(repo(files), [])
        .criteria.find((criterion) => criterion.id === 'A4')
        ?.metrics.find((metric) => metric.name === 'dependency_automation_ratio');
    const without = automation(BASE_FILES);
    const withDependabot = automation({
      ...BASE_FILES,
      '.github/dependabot.yml': 'version: 2\nupdates: []\n',
    });
    expect(without).toBeDefined();
    expect(withDependabot?.value).toBeGreaterThan(without?.value ?? 0);

    // With no update tool, both the native metric and the imported check count the same absence.
    const repoPath = repo(BASE_FILES);
    const native = score(repoPath, []).criteria.find((criterion) => criterion.id === 'A4');
    const imported = score(repoPath, [
      writeInput({
        repo: { name: 'github.com/example/inherited' },
        checks: [{ name: 'Dependency-Update-Tool', score: 0, reason: 'no update tool detected' }],
      }),
    ]);
    const a4 = imported.criteria.find((criterion) => criterion.id === 'A4');
    expect(a4?.nativeScore).toBe(native?.score);
    expect(a4?.score).toBeLessThan(native?.score ?? 0);
    const html = renderWitanHtmlReport(imported);
    expect(html).toContain('Not independent corroboration; for the same absence this adjusts A4 a second time.');
  });

  it('(c) Security-Policy restates the SECURITY.md B4 audit_artifact_depth counts natively', () => {
    const depth = (files: Record<string, string>) =>
      score(repo(files), [])
        .criteria.find((criterion) => criterion.id === 'B4')
        ?.metrics.find((metric) => metric.name === 'audit_artifact_depth')?.value;
    const changelog = { ...BASE_FILES, 'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n- First release.\n' };
    expect(depth(changelog)).toBeDefined();
    expect(depth({ ...changelog, 'SECURITY.md': '# Security\nReport issues privately.\n' })).toBe(
      (depth(changelog) ?? 0) + 1,
    );
  });

  it('(b) a status moved by imported evidence is recorded and stated as not native', () => {
    const repoPath = repo(BASE_FILES);
    const native = score(repoPath, []);
    const report = score(repoPath, [
      writeInput({
        version: '1.0',
        tool: 'example-ci-audit',
        signals: [
          {
            dimension: 'B3',
            weight: 1,
            findings: [{ ruleId: 'ci-warning', severity: 'warning', message: 'One CI warning.' }],
          },
        ],
      }),
    ]);
    const nativeB3 = native.criteria.find((criterion) => criterion.id === 'B3');
    const b3 = report.criteria.find((criterion) => criterion.id === 'B3');
    expect(b3?.nativeScore).toBe(nativeB3?.score);
    expect(b3?.nativeStatus).toBe(nativeB3?.status);
    // The arithmetic is unchanged by this PR: a 0.1 adjustment from one imported warning moves a
    // criterion whose native score sits at or below its status floor (see statusAfterInputAdjustment).
    expect(Math.round(((b3?.nativeScore ?? 0) - (b3?.score ?? 0)) * 10) / 10).toBe(0.1);
    expect(b3?.status).not.toBe(b3?.nativeStatus);

    const surfaces = [
      renderWitanHtmlReport(report),
      renderWitanMarkdownReport(report),
      renderTerminalCertificate(buildWitanCliSummary(report), report),
    ];
    for (const surface of surfaces) {
      expect(surface).toContain('Imported evidence moved this status');
      expect(surface).toContain(`evidence gave ${b3?.nativeStatus} at`);
      expect(surface).toContain('The move is not a native Cejel finding.');
    }
  });

  it('(a) the SAST note travels with the finding on every surface', () => {
    const report = score(repo(BASE_FILES), [
      writeInput({ checks: [{ name: 'SAST', score: 0, reason: 'SAST tool is not run on all commits' }] }),
    ]);
    const note = inheritedFindingNote('scorecard:SAST') ?? '';
    expect(renderWitanHtmlReport(report)).toContain(note);
    expect(renderWitanMarkdownReport(report)).toContain(note);
    expect(renderTerminalCertificate(buildWitanCliSummary(report), report)).toContain(note);
  });

  it('a report without ingest carries neither nativeStatus nor any of these notes', () => {
    const report = score(repo(BASE_FILES), []);
    expect(report.criteria.some((criterion) => 'nativeStatus' in criterion)).toBe(false);
    const html = renderWitanHtmlReport(report);
    for (const ruleId of inheritedFindingNoteRuleIds()) {
      expect(html).not.toContain(inheritedFindingNote(ruleId) ?? '<none>');
    }
    expect(html).not.toContain('Ingested inputs');
  });
});
