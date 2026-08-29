import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V16, WITAN_RUBRIC_VERSION_V22 } from '../rubric-version.js';
import { WitanFindingSchema, WitanReportSchema, type WitanFinding } from '../schemas.js';

const GENERATED_AT = '2026-08-29T00:00:00.000Z';

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'witan-derivation-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Cejel Test'], { cwd: repoPath });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repoPath });
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(repoPath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repoPath });
  return repoPath;
}

function score(repoPath: string) {
  const report = scoreRepoWithPublicCejel({
    repoPath,
    productSlug: 'derivation-fixture',
    productDisplayName: 'Derivation fixture',
    generatedAt: GENERATED_AT,
    rubricVersion: WITAN_RUBRIC_VERSION_V22,
  });
  return WitanReportSchema.parse(JSON.parse(JSON.stringify(report)));
}

function nativeFindings(report: ReturnType<typeof score>): WitanFinding[] {
  if (report.verdict === 'insufficient_source') return [];
  return report.criteria.flatMap((criterion) => criterion.findings);
}

function findingForPatternSet(
  findings: readonly WitanFinding[],
  patternSetId: string,
): WitanFinding {
  const finding = findings.find(
    (candidate) => candidate.derivation?.patternSetId === patternSetId,
  );
  if (!finding) throw new Error(`missing derivation for ${patternSetId}`);
  return finding;
}

function expectPathFreeInventoryDerivation(finding: WitanFinding, inventoryCount: number): void {
  expect(finding.derivation).toMatchObject({
    kind: 'inventory-scan',
    inventoryScope: 'tracked-scan-eligible',
    inventoryCount,
    matchCount: 0,
  });
  expect(Object.keys(finding.derivation ?? {}).sort()).toEqual([
    'inventoryCount',
    'inventoryScope',
    'kind',
    'matchCount',
    'patternCount',
    'patternSetId',
  ]);
  expect(JSON.stringify(finding.derivation)).not.toMatch(/path/i);
}

describe('inventory-scan derivation contract', () => {
  const evidence = {
    kind: 'artifact' as const,
    label: 'Fixture',
    path: 'src/index.ts',
  };

  it('requires an explicit scope and rejects path-bearing extensions', () => {
    expect(
      WitanFindingSchema.safeParse({
        severity: 'warning',
        summary: 'Missing scope.',
        evidence,
        derivation: {
          kind: 'inventory-scan',
          inventoryCount: 1,
          patternSetId: 'fixture.v1',
          patternCount: 1,
          matchCount: 0,
        },
      }).success,
    ).toBe(false);
    expect(
      WitanFindingSchema.safeParse({
        severity: 'warning',
        summary: 'Path-bearing extension.',
        evidence,
        derivation: {
          kind: 'inventory-scan',
          inventoryScope: 'tracked-scan-eligible',
          inventoryCount: 1,
          patternSetId: 'fixture.v1',
          patternCount: 1,
          matchCount: 0,
          matchedPaths: [],
        },
      }).success,
    ).toBe(false);
  });

  it('emits derivations for every authorized inventory-absence branch', () => {
    const repoPath = makeRepo({
      '.env': 'FEATURE_FLAG_MODE=beta\nLOG_LEVEL=debug\n',
      'README.md': '# Derivation fixture\n',
      'migrations/001-create-jobs.sql':
        'CREATE TABLE jobs (id bigint primary key, tenant_id uuid not null);\n',
      'package.json': JSON.stringify({
        name: 'derivation-fixture',
        scripts: { start: 'node src/server.js', test: 'jest' },
        dependencies: { express: '^5.0.0' },
        devDependencies: { jest: '^30.0.0' },
      }),
      'src/server.js':
        "import * as http from 'node:http';\nhttp.createServer((_req, res) => res.end('ok')).listen(3000);\n",
      'test/server.test.ts': "import { expect, test } from 'vitest';\ntest('ok', () => expect(1).toBe(1));\n",
    });
    const findings = nativeFindings(score(repoPath));
    const expectedPatternSets = new Map([
      ['cejel.core-a1.coverage-configuration.v1', 10],
      ['cejel.core-a2.current-secret-shape.v1', 3],
      ['cejel.core-a2.rls-policy.v1', 3],
      ['cejel.core-a3.ci-or-release-deploy.v1', 12],
      ['cejel.core-a5.claim-reality-artifact.v1', 3],
    ]);

    for (const [patternSetId, patternCount] of expectedPatternSets) {
      const finding = findingForPatternSet(findings, patternSetId);
      expectPathFreeInventoryDerivation(finding, 6);
      expect(finding.derivation?.patternCount).toBe(patternCount);
    }
  });

  it('emits the lockfile absence derivation without asserting install reproducibility', () => {
    const repoPath = makeRepo({
      'Procfile': 'web: node src/server.js\n',
      'package.json': JSON.stringify({
        name: 'application-without-lockfile',
        dependencies: { express: '^5.0.0' },
      }),
    });
    const finding = findingForPatternSet(
      nativeFindings(score(repoPath)),
      'cejel.core-a4.lockfile.v1',
    );
    expectPathFreeInventoryDerivation(finding, 2);
    expect(finding.derivation?.patternCount).toBe(11);
    expect(finding.summary).not.toMatch(/non-reproducible|reproducibility/i);
  });

  it('emits the concrete-test absence derivation when a runner is configured', () => {
    const repoPath = makeRepo({
      'package.json': JSON.stringify({
        name: 'runner-without-tests',
        scripts: { test: 'jest' },
        devDependencies: { jest: '^30.0.0' },
      }),
      'src/index.ts': 'export const answer = 42;\n',
    });
    const finding = findingForPatternSet(
      nativeFindings(score(repoPath)),
      'cejel.core-a1.concrete-test-files.v1',
    );
    expectPathFreeInventoryDerivation(finding, 2);
    expect(finding.derivation?.patternCount).toBe(16);
  });

  it('names the authenticated zero scope as scan-eligible, never complete', () => {
    const repoPath = makeRepo({
      'src/index.ts': 'export const answer = 42;\n',
    });
    const finding = findingForPatternSet(
      nativeFindings(score(repoPath)),
      'cejel.core-a1.test-integrity-surface.v1',
    );
    expectPathFreeInventoryDerivation(finding, 1);
    expect(finding.summary).toContain('tracked scan-eligible inventory');
    expect(finding.summary).not.toContain('complete tracked inventory');
  });

  it('keeps historical templates unchanged when their reports do not carry derivations', () => {
    const repoPath = makeRepo({
      'package.json': JSON.stringify({
        name: 'historical-runner-without-tests',
        scripts: { test: 'jest' },
        devDependencies: { jest: '^30.0.0' },
      }),
      'src/index.ts': 'export const answer = 42;\n',
    });
    const input = buildWitanInputFromRepo({
      repoPath,
      productSlug: 'derivation-fixture',
      productDisplayName: 'Derivation fixture',
      generatedAt: GENERATED_AT,
      rubricVersion: WITAN_RUBRIC_VERSION_V16,
    });
    const finding = (input.signals ?? [])
      .flatMap((signal) => signal.findings ?? [])
      .find(
        (candidate) =>
          candidate.summary ===
          'A test runner is configured, but no concrete test files were detected.',
      );

    expect(finding).toBeDefined();
    expect(finding?.derivation).toBeUndefined();
  });

  it('does not attach the new tracked-scan-eligible contract to a directory fallback', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-derivation-directory-'));
    mkdirSync(join(repoPath, 'src'), { recursive: true });
    writeFileSync(join(repoPath, 'src/index.ts'), 'export const answer = 42;\n', 'utf8');

    const finding = nativeFindings(score(repoPath)).find((candidate) =>
      candidate.summary.startsWith('Reviewable source is present'),
    );

    expect(finding?.summary).toContain('complete tracked inventory');
    expect(finding?.summary).not.toContain('tracked scan-eligible inventory');
    expect(finding?.derivation).toBeUndefined();
  });
});
