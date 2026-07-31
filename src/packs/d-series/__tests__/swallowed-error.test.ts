import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { detectSwallowedErrors } from '../swallowed-error.js';

interface AcceptanceCase {
  readonly id: string;
  readonly defectPath: string;
  readonly repairedPath: string;
  readonly binding: string;
  readonly messageProperty: 'message';
  readonly oracle: string;
}

interface AcceptanceManifest {
  readonly cases: readonly AcceptanceCase[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ACCEPTANCE_ROOT = 'calibration/d-series/d2/acceptance';
const manifest = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ACCEPTANCE_ROOT, 'manifest.json'), 'utf8'),
) as AcceptanceManifest;

function detectSource(source: string) {
  const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d2-source-'));
  writeFileSync(resolve(repo, 'subject.ts'), source);
  return detectSwallowedErrors(repo, ['subject.ts']);
}

describe('D2 swallowed error', () => {
  it.each(manifest.cases)('cites the exact defect path for $id', (testCase) => {
    expect(detectSwallowedErrors(REPO_ROOT, [testCase.defectPath])).toEqual([
      expect.objectContaining({
        ruleId: 'D2',
        binding: testCase.binding,
        evidence: expect.objectContaining({ path: testCase.defectPath }),
      }),
    ]);
  });

  it.each(manifest.cases)('does not flag the paired repair for $id', (testCase) => {
    expect(detectSwallowedErrors(REPO_ROOT, [testCase.repairedPath])).toEqual([]);
  });

  it.each([
    'throw error;',
    "console.error('Release publication failed.', error); return { ok: false, message: 'Release publication failed.' };",
    "return { ok: false, message: `Release publication failed: ${error instanceof Error ? error.message : String(error)}` };",
  ])('abstains when the bound error is recovered: %s', (recovery) => {
    const source = `export async function publishRelease(sendRequest: () => Promise<void>) {
  try {
    await sendRequest();
    return { ok: true, message: 'Release published.' };
  } catch (error) {
    ${recovery}
  }
}
`;
    expect(detectSource(source)).toEqual([]);
  });

  it.each([
    "return { ok: false, code: 'release_failed' };",
    "return { message: 'Release publication failed.' };",
    "return { ok: false, message: getFailureMessage() };",
  ])('abstains without an exact static surfaced failure result: %s', (result) => {
    const source = `declare function getFailureMessage(): string;
export async function publishRelease(sendRequest: () => Promise<void>) {
  try {
    await sendRequest();
    return { ok: true, message: 'Release published.' };
  } catch (error) {
    ${result}
  }
}
`;
    expect(detectSource(source)).toEqual([]);
  });
});
