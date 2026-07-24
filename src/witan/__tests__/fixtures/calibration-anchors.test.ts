import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../../repo-signals.js';
import { buildPlantedBadRepo, buildPlantedCleanRepo } from './calibration-fixtures.js';

// Golden calibration anchors — goal_cejel_calibration_findings_precision_2026-07-06.
// These lock the A2 secret-posture outcome for the two anchor archetypes described in
// lab_notes/_business/cejel_calibration_report_2026-07-06.md so calibration can't drift.

function makeTmpGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cejel-calibration-unit-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'cejel-calibration@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Cejel Calibration Fixture'], { cwd: dir });
  return dir;
}

function writeTrackedFile(dir: string, relativePath: string, contents: string): void {
  const fullPath = join(dir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${contents}\n`, 'utf8');
  execFileSync('git', ['add', relativePath], { cwd: dir });
}

function commitAll(dir: string, message: string): void {
  execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'ignore' });
}

function a2SignalFor(repoPath: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'calibration-fixture',
    productDisplayName: 'Calibration Fixture',
    repoPath,
    generatedAt: '2026-07-06T00:00:00.000Z',
  });
  return (input.signals ?? []).find((s) => s.criterionId === 'A2') ?? null;
}

describe('Cejel calibration anchors — A2 secret-posture regression fixtures', () => {
  it('planted-bad: real committed secret in tracked .env fires A2 critical', () => {
    const a2 = a2SignalFor(buildPlantedBadRepo());
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(true);
  });

  it('planted-clean: .env.example template + gitignore + tests never fires A2 critical', () => {
    const a2 = a2SignalFor(buildPlantedCleanRepo());
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(false);
  });
});

describe('Template-vs-real-secret distinction (unit)', () => {
  it('(a) a real high-entropy value anywhere in history is still critical, even under a template path', () => {
    // Mirrors the existing "flags real secrets that lived in env templates before
    // placeholders replaced them" case in witan-report.test.ts: the path alone never
    // launders a genuine leaked value — content is what decides.
    const dir = makeTmpGitRepo();
    const realValue = [
      'sk-ant-api03',
      'N9qL8wEr7tYu6iOp5aSd4fGh3jKl2zXc1vBn0mQr9sTv8uWx7yZa6bCd5eFg4hIj',
    ].join('-');
    writeTrackedFile(dir, '.env.example', `ANTHROPIC_API_KEY=${realValue}`);
    commitAll(dir, 'accidental real value in template');
    writeTrackedFile(dir, '.env.example', 'ANTHROPIC_API_KEY=CHANGE_THIS_VALUE');
    commitAll(dir, 'redact to placeholder');

    const a2 = a2SignalFor(dir);
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(true);
  });

  it('(b) a committed non-template .env with no confirmed secret value is informational, not a claim-bearing finding', () => {
    const dir = makeTmpGitRepo();
    writeTrackedFile(dir, '.env', 'FEATURE_FLAG_MODE=beta\nLOG_LEVEL=debug');
    commitAll(dir, 'add env file with no secret-shaped values');

    const a2 = a2SignalFor(dir);
    expect(a2).not.toBeNull();
    expect((a2?.findings ?? []).some((f) => f.severity === 'critical')).toBe(false);
    expect(
      (a2?.findings ?? []).some(
        (f) =>
          f.severity === 'info' &&
          f.summary ===
            'A non-template .env file is committed in the current repository tree; no secret-shaped value was detected.',
      ),
    ).toBe(true);
  });

  it('(c) all-caps snake_case placeholders in .env.example are never a finding, only positive hygiene evidence', () => {
    // These specific values are >=40 chars (clearing SECRET_VALUE_PATTERN's generic
    // secret-shape threshold) and contain none of the pre-existing placeholder marker
    // words (your/example/sample/placeholder/dummy/changeme/replace/redacted) — this is
    // the site-machine-shaped false positive: a long, realistic-length ALL-CAPS template
    // value with no obvious "this is a placeholder" keyword.
    const dir = makeTmpGitRepo();
    writeTrackedFile(
      dir,
      '.env.example',
      [
        'ANTHROPIC_API_KEY=INSERT_SECRET_VALUE_BEFORE_RUNNING_THIS_APPLICATION',
        'STRIPE_SECRET_KEY=SET_THIS_TO_THE_LIVE_KEY_FOUND_IN_THE_STRIPE_DASHBOARD',
      ].join('\n'),
    );
    commitAll(dir, 'add env template with all-caps snake_case placeholders');

    const a2 = a2SignalFor(dir);
    expect(a2).not.toBeNull();
    expect(a2?.findings ?? []).toHaveLength(0);
    expect((a2?.positiveEvidence ?? []).some((e) => e.path === '.env.example')).toBe(true);
  });
});
