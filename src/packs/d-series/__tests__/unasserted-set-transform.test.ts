import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { detectUnassertedSetTransforms } from '../unasserted-set-transform.js';

interface AcceptanceCase {
  readonly id: string;
  readonly defectPath: string;
  readonly repairedPath: string;
  readonly sourceBinding: string;
  readonly outputBinding: string;
  readonly explanationBinding: string;
  readonly oracle: string;
}

interface AcceptanceManifest {
  readonly cases: readonly AcceptanceCase[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ACCEPTANCE_ROOT = 'calibration/d-series/d3/acceptance';
const manifest = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ACCEPTANCE_ROOT, 'manifest.json'), 'utf8'),
) as AcceptanceManifest;

function detectSource(source: string) {
  const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d3-source-'));
  writeFileSync(resolve(repo, 'subject.ts'), source);
  return detectUnassertedSetTransforms(repo, ['subject.ts']);
}

describe('D3 unasserted set transform', () => {
  it.each(manifest.cases)('cites the exact defect path for $id', (testCase) => {
    expect(detectUnassertedSetTransforms(REPO_ROOT, [testCase.defectPath])).toEqual([
      expect.objectContaining({
        ruleId: 'D3',
        sourceBinding: testCase.sourceBinding,
        outputBinding: testCase.outputBinding,
        explanationBinding: testCase.explanationBinding,
        evidence: expect.objectContaining({ path: testCase.defectPath }),
      }),
    ]);
  });

  it.each(manifest.cases)('does not flag the paired repair for $id', (testCase) => {
    expect(detectUnassertedSetTransforms(REPO_ROOT, [testCase.repairedPath])).toEqual([]);
  });

  it('abstains when the explanation ledger is populated by a complementary transform', () => {
    expect(
      detectSource(`export function publishRows(rows: Array<{ publishable: boolean }>) {
  const published = rows.filter((row) => row.publishable);
  const explained = rows.filter((row) => !row.publishable);
  return { ok: true, published, explained };
}`),
    ).toEqual([]);
  });

  it.each([
    'return { published, explained };',
    'return { ok: false, published, explained };',
    'return { ok: isComplete, published, explained };',
    'return { ok: true, output: published, explained };',
  ])('abstains without the exact surfaced success object: %s', (result) => {
    expect(
      detectSource(`declare const isComplete: boolean;
export function publishRows(rows: Array<{ publishable: boolean }>) {
  const published = rows.filter((row) => row.publishable);
  const explained: unknown[] = [];
  ${result}
}`),
    ).toEqual([]);
  });

  it('abstains when the filtered source is not a simple function parameter', () => {
    expect(
      detectSource(`const rows = [{ publishable: true }];
export function publishRows() {
  const published = rows.filter((row) => row.publishable);
  const explained: unknown[] = [];
  return { ok: true, published, explained };
}`),
    ).toEqual([]);
  });
});
