import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { detectDeclaredButUnreadConfig } from '../declared-but-unread-config.js';

interface AcceptanceCase {
  readonly id: string;
  readonly kind: 'config' | 'schema' | 'frontmatter';
  readonly defectPath: string;
  readonly repairedPath: string;
  readonly key: string;
  readonly oracle: string;
}

interface AcceptanceManifest {
  readonly cases: readonly AcceptanceCase[];
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ACCEPTANCE_ROOT = 'calibration/d-series/d1/acceptance';
const manifest = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ACCEPTANCE_ROOT, 'manifest.json'), 'utf8'),
) as AcceptanceManifest;

function sourceFilesFor(testCase: AcceptanceCase, repaired: boolean): string[] {
  const selectedPath = repaired ? testCase.repairedPath : testCase.defectPath;
  if (testCase.kind !== 'frontmatter') return [selectedPath];
  return [
    selectedPath,
    `${ACCEPTANCE_ROOT}/frontmatter/consumer.${repaired ? 'negative' : 'positive'}.fixture.mjs`,
  ];
}

describe('D1 declared-but-unread config', () => {
  it.each(manifest.cases)('cites the exact $kind defect path for $id', (testCase) => {
    expect(detectDeclaredButUnreadConfig(REPO_ROOT, sourceFilesFor(testCase, false))).toEqual([
      expect.objectContaining({
        ruleId: 'D1',
        declarationKind: testCase.kind,
        key: testCase.key,
        evidence: expect.objectContaining({ path: testCase.defectPath }),
      }),
    ]);
  });

  it.each(manifest.cases)('does not flag the paired $kind repair for $id', (testCase) => {
    expect(detectDeclaredButUnreadConfig(REPO_ROOT, sourceFilesFor(testCase, true))).toEqual([]);
  });

  it('follows an imported config symbol through the resolved module graph', () => {
    const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d1-module-graph-'));
    writeFileSync(
      resolve(repo, 'release-config.ts'),
      `export const releaseConfig = {
  minimumApprovals: 0,
  requireNamedApprover: true,
};
`,
    );
    writeFileSync(
      resolve(repo, 'consumer.ts'),
      `import { releaseConfig } from './release-config.js';
export const threshold = releaseConfig.minimumApprovals;
`,
    );

    expect(
      detectDeclaredButUnreadConfig(repo, ['release-config.ts', 'consumer.ts']),
    ).toEqual([
      expect.objectContaining({
        key: 'requireNamedApprover',
        evidence: expect.objectContaining({ path: 'release-config.ts' }),
      }),
    ]);
  });

  it.each([
    'consume(releaseConfig);',
    'const copy = { ...releaseConfig };',
    'const key = "minimumApprovals"; releaseConfig[key];',
    'const { minimumApprovals } = releaseConfig;',
  ])('abstains when the config may be read dynamically: %s', (dynamicRead) => {
    const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d1-dynamic-read-'));
    writeFileSync(
      resolve(repo, 'release-config.ts'),
      `declare function consume(value: unknown): void;
export const releaseConfig = {
  minimumApprovals: 0,
  requireNamedApprover: true,
};
releaseConfig.minimumApprovals;
${dynamicRead}
`,
    );
    expect(detectDeclaredButUnreadConfig(repo, ['release-config.ts'])).toEqual([]);
  });

  it('does not turn descriptive or non-boolean declarations into D1 findings', () => {
    const repo = mkdtempSync(resolve(tmpdir(), 'cejel-d1-descriptive-'));
    writeFileSync(
      resolve(repo, 'release-config.ts'),
      `export const releaseConfig = {
  minimumApprovals: 0,
  description: 'named approval is recommended',
  requireNamedApprover: 'operator decides',
};
releaseConfig.minimumApprovals;
`,
    );
    expect(detectDeclaredButUnreadConfig(repo, ['release-config.ts'])).toEqual([]);
  });
});
