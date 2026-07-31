import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { detectSelfReferentialVerification } from '../self-referential-verification.js';

interface AcceptanceCase {
  readonly id: string;
  readonly defectPath: string;
  readonly subjectPath: string;
  readonly repairedPath: string;
  readonly repairedSubjectPath: string;
  readonly expectedImport: string;
}

interface AcceptanceManifest {
  readonly cases: readonly AcceptanceCase[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ACCEPTANCE_ROOT = 'calibration/d-series/d5/acceptance';
const manifest = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ACCEPTANCE_ROOT, 'manifest.json'), 'utf8'),
) as AcceptanceManifest;

describe('D5 self-referential verification', () => {
  it.each(manifest.cases)('cites the exact defect assertion path for $id', (testCase) => {
    expect(
      detectSelfReferentialVerification(REPO_ROOT, [
        testCase.defectPath,
        testCase.subjectPath,
      ]),
    ).toEqual([
      expect.objectContaining({
        ruleId: 'D5',
        expectedImport: testCase.expectedImport,
        evidence: expect.objectContaining({ path: testCase.defectPath }),
      }),
    ]);
  });

  it.each(manifest.cases)('does not flag the paired repair for $id', (testCase) => {
    expect(
      detectSelfReferentialVerification(REPO_ROOT, [
        testCase.repairedPath,
        testCase.repairedSubjectPath,
      ]),
    ).toEqual([]);
  });

  it('detects expect-style equality with a direct imported expected value', () => {
    const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d5-expect-'));
    writeFileSync(
      resolve(repo, 'subject.ts'),
      `export const expectedStatus = 'ready';
export function status() { return 'ready'; }
`,
    );
    writeFileSync(
      resolve(repo, 'subject.test.ts'),
      `import { expectedStatus, status } from './subject.js';
expect(status()).toEqual(expectedStatus);
`,
    );
    expect(
      detectSelfReferentialVerification(repo, ['subject.ts', 'subject.test.ts']),
    ).toEqual([
      expect.objectContaining({
        assertionKind: 'expect',
        expectedImport: 'expectedStatus',
        subjectPath: 'subject.ts',
      }),
    ]);
  });

  it.each([
    {
      name: 'literal expected value',
      expectedModule: '',
      expectedImport: '',
      expectedExpression: 'true',
      testPath: 'subject.test.ts',
    },
    {
      name: 'expected value from a different module',
      expectedModule: `export const EXPECTED_REVIEW = true;\n`,
      expectedImport: `import { EXPECTED_REVIEW } from './oracle.js';\n`,
      expectedExpression: 'EXPECTED_REVIEW',
      testPath: 'subject.test.ts',
    },
    {
      name: 'non-test source',
      expectedModule: '',
      expectedImport: '',
      expectedExpression: 'EXPECTED_REVIEW',
      testPath: 'consumer.ts',
    },
    {
      name: 'non-expectation import name',
      expectedModule: '',
      expectedImport: '',
      expectedExpression: 'REVIEW_REQUIRED',
      testPath: 'subject.test.ts',
    },
  ])('abstains for $name', (testCase) => {
    const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d5-abstain-'));
    writeFileSync(
      resolve(repo, 'subject.ts'),
      `export const EXPECTED_REVIEW = true;
export const REVIEW_REQUIRED = true;
export function reviewRequired() { return true; }
`,
    );
    writeFileSync(resolve(repo, 'oracle.ts'), testCase.expectedModule);
    const subjectImport = testCase.expectedModule
      ? `import { reviewRequired } from './subject.js';\n`
      : `import { EXPECTED_REVIEW, REVIEW_REQUIRED, reviewRequired } from './subject.js';\n`;
    writeFileSync(
      resolve(repo, testCase.testPath),
      `${testCase.expectedImport}${subjectImport}
assert.equal(reviewRequired(), ${testCase.expectedExpression});
`,
    );
    expect(
      detectSelfReferentialVerification(repo, [
        'subject.ts',
        'oracle.ts',
        testCase.testPath,
      ]),
    ).toEqual([]);
  });
});
