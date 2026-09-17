import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { isPlaceholderSecretValue } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';

const FIXTURE_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'template-credential-regression',
);

function makeFixtureRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'cejel-template-credential-regression-'));
  cpSync(FIXTURE_DIRECTORY, repoPath, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: repoPath });
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '--quiet', '-m', 'synthetic template fixture'], { cwd: repoPath });
  return repoPath;
}

function reportFor(repoPath: string) {
  return scoreRepoWithPublicCejel({
    productSlug: 'synthetic-template-credential-regression',
    productDisplayName: 'Synthetic template credential regression',
    repoPath,
    generatedAt: '2026-09-17T00:00:00.000Z',
    rubricVersion: WITAN_RUBRIC_VERSION_V23,
  });
}

function a2Findings(repoPath: string) {
  return reportFor(repoPath).criteria.find((criterion) => criterion.id === 'A2')?.findings ?? [];
}

function templateContents(): string {
  return readFileSync(join(FIXTURE_DIRECTORY, '.env.example'), 'utf8');
}

// These tests deliberately use Vitest's expected-failure mode. On the frozen implementation,
// template paths are skipped before A2 reads their content, so each inner assertion fails while
// the suite remains green. Once Phase B permits the source fix, the inner assertions pass and
// Vitest reports these tests as an unexpected pass; that fail-loud transition requires replacing
// `.fails` with ordinary tests instead of silently accepting a changed contract.
describe('A2 template credential regression — fixtures now, implementation later', () => {
  it('reproduces the measured current behavior without exposing fabricated values in report JSON', () => {
    const repoPath = makeFixtureRepo();
    try {
      const report = reportFor(repoPath);
      const a2 = report.criteria.find((criterion) => criterion.id === 'A2');
      const reportJson = JSON.stringify(report);

      expect(a2?.score).toBe(3.2);
      expect(a2?.findings).toHaveLength(1);
      expect(a2?.findings[0]?.severity).toBe('info');
      expect(a2?.findings[0]?.summary).toContain('tracked non-template .env file');
      expect(reportJson).not.toContain(templateContents());
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it.fails('will find a PEM-delimited private key in .env.example', () => {
    const repoPath = makeFixtureRepo();
    try {
      const findings = a2Findings(repoPath);
      expect(
        findings.some(
          (finding) =>
            finding.severity === 'critical' &&
            finding.evidence.path === '.env.example' &&
            finding.evidence.line != null &&
            finding.evidence.line < 5,
        ),
      ).toBe(true);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it.fails('will find a populated high-entropy token in a template-suffixed path', () => {
    const repoPath = makeFixtureRepo();
    try {
      const findings = a2Findings(repoPath);
      expect(
        findings.some(
          (finding) => finding.severity === 'critical' && finding.evidence.path === '.env.example',
        ),
      ).toBe(true);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('keeps genuine placeholder values silent inside the same template path', () => {
    const repoPath = makeFixtureRepo();
    try {
      writeFileSync(
        join(repoPath, '.env.example'),
        ['API_KEY=your-key-here', 'TOKEN=<TOKEN>', 'PASSWORD=changeme', 'SECRET=xxx'].join('\n'),
        'utf8',
      );
      const findings = a2Findings(repoPath);
      expect(
        findings.some(
          (finding) => finding.severity === 'critical' && finding.evidence.path === '.env.example',
        ),
      ).toBe(false);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('mutation check: placeholder classification rejects the populated control while retaining every existing placeholder form', () => {
    expect(isPlaceholderSecretValue('your-key-here')).toBe(true);
    expect(isPlaceholderSecretValue('<TOKEN>')).toBe(true);
    expect(isPlaceholderSecretValue('changeme')).toBe(true);
    expect(isPlaceholderSecretValue('xxx')).toBe(true);
    expect(isPlaceholderSecretValue('tok_fixture_7Nq2Vx9Lm4Rt8Kp6Yw3Hd5Cs1Za7Bu0Ef')).toBe(false);
  });
});
