import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { detectEmptyFailureConflation } from '../empty-failure-conflation.js';

interface AcceptanceCase {
  readonly id: string;
  readonly defectPath: string;
  readonly repairedPath: string;
  readonly callee: string;
  readonly resultBinding: string;
  readonly collectionBinding: string;
  readonly oracle: string;
}

interface AcceptanceManifest {
  readonly cases: readonly AcceptanceCase[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ACCEPTANCE_ROOT = 'calibration/d-series/d4/acceptance';
const manifest = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ACCEPTANCE_ROOT, 'manifest.json'), 'utf8'),
) as AcceptanceManifest;

function detectSource(source: string) {
  const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d4-source-'));
  writeFileSync(resolve(repo, 'subject.ts'), source);
  return detectEmptyFailureConflation(repo, ['subject.ts']);
}

const EXACT_CALLEE = `function readQueue(directory: string) {
  if (directory === 'unparseable') return { ok: false, error: 'bad queue' };
  if (directory === 'empty') return { ok: true, entries: [] };
  return { ok: true, entries: ['goal-1'] };
}`;

describe('D4 empty/failure conflation', () => {
  it.each(manifest.cases)('cites the exact defect path for $id', (testCase) => {
    expect(detectEmptyFailureConflation(REPO_ROOT, [testCase.defectPath])).toEqual([
      expect.objectContaining({
        ruleId: 'D4',
        callee: testCase.callee,
        resultBinding: testCase.resultBinding,
        collection: testCase.collectionBinding,
        evidence: expect.objectContaining({ path: testCase.defectPath }),
      }),
    ]);
  });

  it.each(manifest.cases)('does not flag the paired repair for $id', (testCase) => {
    expect(detectEmptyFailureConflation(REPO_ROOT, [testCase.repairedPath])).toEqual([]);
  });

  it('resolves an imported first-party callee', () => {
    const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d4-import-'));
    writeFileSync(resolve(repo, 'queue.ts'), `export ${EXACT_CALLEE}`);
    writeFileSync(
      resolve(repo, 'caller.ts'),
      `import { readQueue } from './queue.js';
export function collectQueue(directory: string) {
  const result = readQueue(directory);
  const entries = result.ok ? result.entries : [];
  return { ok: true, entries };
}`,
    );
    expect(detectEmptyFailureConflation(repo, ['caller.ts', 'queue.ts'])).toEqual([
      expect.objectContaining({
        callee: 'readQueue',
        evidence: expect.objectContaining({ path: 'caller.ts' }),
      }),
    ]);
  });

  it.each([
    {
      name: 'callee has no failure return',
      callee: `function readQueue(directory: string) {
  if (directory === 'empty') return { ok: true, entries: [] };
  return { ok: true, entries: ['goal-1'] };
}`,
    },
    {
      name: 'callee has no successful empty return',
      callee: `function readQueue(directory: string) {
  if (directory === 'unparseable') return { ok: false, error: 'bad queue' };
  return { ok: true, entries: ['goal-1'] };
}`,
    },
    {
      name: 'callee has no successful populated return',
      callee: `function readQueue(directory: string) {
  if (directory === 'unparseable') return { ok: false, error: 'bad queue' };
  return { ok: true, entries: [] };
}`,
    },
  ])('abstains when $name', ({ callee }) => {
    expect(
      detectSource(`${callee}
export function collectQueue(directory: string) {
  const result = readQueue(directory);
  const entries = result.ok ? result.entries : [];
  return { ok: true, entries };
}`),
    ).toEqual([]);
  });

  it.each([
    `if (!result.ok) return result;
  return { ok: true, entries: result.entries };`,
    `const entries = result.ok ? result.entries : [];
  console.log(entries.length);
  return { ok: true, entries };`,
    `const entries = result.ok ? result.entries : [];
  return { ok: result.ok, entries };`,
    `const entries = result.ok ? result.entries : ['fallback'];
  return { ok: true, entries };`,
  ])('abstains outside the exact three-statement caller: %s', (callerBody) => {
    expect(
      detectSource(`${EXACT_CALLEE}
export function collectQueue(directory: string) {
  const result = readQueue(directory);
  ${callerBody}
}`),
    ).toEqual([]);
  });
});
