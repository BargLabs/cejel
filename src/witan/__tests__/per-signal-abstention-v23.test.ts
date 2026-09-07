import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { platform } from 'node:process';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
} from '../rubric-version.js';

// chmod-based unreadable-file fixtures do not deny access when the test runs as root (root
// bypasses the permission bits this fixture relies on) or on Windows (no POSIX permission bits).
const canDenyReadAccess = platform !== 'win32' && process.getuid?.() !== 0;

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-per-signal-abstention-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: dir });
  return dir;
}

function writeFile(dir: string, relativePath: string, contents: string): void {
  const path = join(dir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  execFileSync('git', ['add', relativePath], { cwd: dir });
}

/**
 * A repo with one criterion (A1) whose 'coverage_percent' signal depends on a file that is
 * git-tracked (so it passes inventory) but unreadable at scan time — while its
 * 'test_to_source_ratio' signal depends only on readable files.
 */
function buildA1MixedReadabilityRepo(): string {
  const dir = makeTmpRepo();
  writeFile(
    dir,
    'package.json',
    JSON.stringify({
      name: 'per-signal-abstention-fixture',
      scripts: { test: 'vitest run' },
    }),
  );
  writeFile(dir, 'src/index.ts', 'export const implementation = true;\n');
  writeFile(
    dir,
    'src/index.test.ts',
    "import { expect, it } from 'vitest';\nit('is implemented', () => expect(1).toBe(1));\n",
  );
  // Coverage-config-shaped filename (recognised by findCoverageConfigFiles) that is tracked but
  // whose content becomes unreadable below — this is the only input to the 'coverage_percent'
  // signal in this fixture.
  writeFile(dir, 'coverage.json', JSON.stringify({ total: { lines: { pct: 92 } } }));
  chmodSync(join(dir, 'coverage.json'), 0o000);
  return dir;
}

function a1SignalAt(dir: string, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'per-signal-abstention-fixture',
    productDisplayName: 'Per-signal abstention fixture',
    repoPath: dir,
    generatedAt: '2026-09-06T00:00:00.000Z',
    rubricVersion,
  });
  return {
    input,
    a1: (input.signals ?? []).find((signal) => signal.criterionId === 'A1'),
  };
}

describe.skipIf(!canDenyReadAccess)('v23 per-signal abstention', () => {
  it('RED (pre-fix behavior, asserted against v22): an unreadable coverage file wipes ALL of A1, including the readable test-ratio signal', () => {
    const dir = buildA1MixedReadabilityRepo();
    const { input, a1 } = a1SignalAt(dir, WITAN_RUBRIC_VERSION_V22);

    expect(input.contentReadSummary?.affectedCriteria).toContain('A1');
    // This is the defect this goal fixes: v22 (and v17) discard the ENTIRE criterion, including
    // the test_to_source_ratio metric that was computed purely from readable files.
    expect(a1).toMatchObject({ insufficientData: true, metrics: [], findings: [], positiveEvidence: [] });
    expect(a1?.metrics?.find((metric) => metric.name === 'test_to_source_ratio')).toBeUndefined();
  });

  it('GREEN (v23): the unreadable-coverage signal abstains alone; the readable test-ratio signal survives', () => {
    const dir = buildA1MixedReadabilityRepo();
    const { input, a1 } = a1SignalAt(dir, WITAN_RUBRIC_VERSION_V23);

    expect(input.contentReadSummary?.affectedCriteria).toContain('A1');
    // The criterion as a whole is NOT wiped: it is not insufficientData, and the metric computed
    // from readable files (test_to_source_ratio) survives with its real, non-zero value.
    expect(a1?.insufficientData).toBeUndefined();
    const testRatio = a1?.metrics?.find((metric) => metric.name === 'test_to_source_ratio');
    expect(testRatio).toBeDefined();
    expect(testRatio?.value).toBeGreaterThan(0);
    // The affected signal (coverage_percent) is dropped from metrics rather than silently
    // scored as 0 — it is genuinely unmeasured, not measured-and-zero.
    expect(a1?.metrics?.find((metric) => metric.name === 'coverage_percent')).toBeUndefined();
    // The abstention is recorded in prose, naming the specific signal, not just the criterion.
    expect(a1?.notes).toContain('coverage_percent');
    expect(input.scanLimitations?.some((line) => /signal/i.test(line) && /coverage_percent/.test(line))).toBe(
      true,
    );
  });

  it('v17 and v22 remain unchanged: the whole criterion still abstains wholesale on the same fixture', () => {
    const dirV17 = buildA1MixedReadabilityRepo();
    const dirV22 = buildA1MixedReadabilityRepo();
    const { a1: a1V17 } = a1SignalAt(dirV17, WITAN_RUBRIC_VERSION_V17);
    const { a1: a1V22 } = a1SignalAt(dirV22, WITAN_RUBRIC_VERSION_V22);

    for (const a1 of [a1V17, a1V22]) {
      expect(a1).toMatchObject({
        insufficientData: true,
        metrics: [],
        findings: [],
        positiveEvidence: [],
      });
    }
  });

  it('a criterion with no signal-scoped skip still abstains wholesale under v23 (conservative fallback)', () => {
    // A4 (dependency evidence) is not instrumented with withContentReadSignal by this goal, so
    // an unreadable file relevant to it must still abstain the whole criterion under v23 —
    // exactly like it always has.
    const dir = makeTmpRepo();
    writeFile(dir, 'package.json', JSON.stringify({ name: 'unattributed-fixture' }));
    writeFile(dir, 'src/index.ts', 'export const implementation = true;\n');
    writeFile(dir, 'package-lock.json', 'x'.repeat(512_001));

    const { input } = a1SignalAt(dir, WITAN_RUBRIC_VERSION_V23);
    const a4 = (input.signals ?? []).find((signal) => signal.criterionId === 'A4');

    expect(input.contentReadSummary?.affectedCriteria).toContain('A4');
    expect(a4).toMatchObject({ insufficientData: true, metrics: [], findings: [], positiveEvidence: [] });
  });
});
