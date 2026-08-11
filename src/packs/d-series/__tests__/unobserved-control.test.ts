import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { detectUnobservedControls } from '../unobserved-control.js';

interface AcceptanceCase {
  readonly id: string;
  readonly mechanism: 'exit-status-discarded' | 'report-independent-of-operation';
  readonly defectPath: string;
  readonly repairedPath: string;
  readonly ambiguousPath?: string;
  readonly beyondGraphPath?: string;
  readonly oracle: string;
}

interface AcceptanceManifest {
  readonly cases: readonly AcceptanceCase[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ACCEPTANCE_ROOT = 'calibration/d-series/d6/acceptance';
const manifest = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ACCEPTANCE_ROOT, 'manifest.json'), 'utf8'),
) as AcceptanceManifest;

function detectSource(path: string, source: string) {
  const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d6-source-'));
  writeFileSync(resolve(repo, path), source);
  return detectUnobservedControls(repo, [path]);
}

describe('D6 unobserved control', () => {
  it.each(manifest.cases)('cites the exact defect path for $id', (testCase) => {
    expect(detectUnobservedControls(REPO_ROOT, [testCase.defectPath])).toEqual([
      expect.objectContaining({
        ruleId: 'D6',
        mechanism: testCase.mechanism,
        evidence: expect.objectContaining({ path: testCase.defectPath }),
      }),
    ]);
  });

  it.each(manifest.cases)('does not flag the paired repair for $id', (testCase) => {
    expect(detectUnobservedControls(REPO_ROOT, [testCase.repairedPath])).toEqual([]);
  });

  it('abstains on the explicitly advisory cleanup status', () => {
    const testCase = manifest.cases.find((item) => item.ambiguousPath);
    expect(testCase?.ambiguousPath).toBeDefined();
    expect(detectUnobservedControls(REPO_ROOT, [testCase?.ambiguousPath as string])).toEqual([]);
  });

  it('abstains beyond a runtime-keyed control registry', () => {
    const testCase = manifest.cases.find((item) => item.beyondGraphPath);
    expect(testCase?.beyondGraphPath).toBeDefined();
    expect(detectUnobservedControls(REPO_ROOT, [testCase?.beyondGraphPath as string])).toEqual([]);
  });

  it('recognizes the exact semicolon neutralization form without expanding beyond D6.a', () => {
    expect(detectSource('temporary.sh', 'verify_release; true\necho "release verified"\n')).toEqual([
      expect.objectContaining({ mechanism: 'exit-status-discarded' }),
    ]);
  });

  it('recognizes an exact ignored return only when no errexit policy can change control flow', () => {
    expect(detectSource('temporary.sh', 'verify_release\necho "release verified"\n')).toEqual([
      expect.objectContaining({ mechanism: 'exit-status-discarded' }),
    ]);
    expect(
      detectSource('temporary.sh', 'set -e\nverify_release\necho "release verified"\n'),
    ).toEqual([]);
    expect(
      detectSource('temporary.sh', 'set -o errexit\nverify_release\necho "release verified"\n'),
    ).toEqual([]);
  });

  it('abstains on a command substitution assigned to a variable', () => {
    expect(
      detectSource(
        'temporary.sh',
        'out="$(RUN_GOAL_STREAM_TEST_AGENT_MODE=interrupt run_goal_stream_tests)" || true\n',
      ),
    ).toEqual([]);
  });

  it('abstains when errexit makes a success report depend on the operation', () => {
    expect(
      detectSource(
        'temporary.sh',
        'set -e\nremove_thing --force stale-artifact\necho "removed stale-artifact"\nreturn 0\n',
      ),
    ).toEqual([]);
  });

  it('never includes author identity in a finding artifact', () => {
    const [finding] = detectSource('temporary.sh', 'verify_release || true\n');
    expect(finding).toBeDefined();
    expect(JSON.stringify(finding)).not.toMatch(/author|email|handle/i);
  });
});
