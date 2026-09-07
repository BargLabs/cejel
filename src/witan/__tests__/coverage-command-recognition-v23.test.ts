import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V22,
  WITAN_RUBRIC_VERSION_V23,
} from '../rubric-version.js';
import { WITAN_RUBRIC_VERSION } from '../schemas.js';

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-coverage-command-v23-'));
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

function writeTypeScriptTest(dir: string): void {
  writeFile(dir, 'src/value.ts', 'export const value = 1;\n');
  writeFile(
    dir,
    'test/value.test.ts',
    "import { expect, it } from 'vitest';\nit('works', () => expect(1).toBe(1));\n",
  );
}

function a1Signal(dir: string, rubricVersion = WITAN_RUBRIC_VERSION_V23) {
  const input = buildWitanInputFromRepo({
    productSlug: 'synthetic-coverage-command',
    productDisplayName: 'Synthetic coverage command',
    repoPath: dir,
    generatedAt: '2026-09-06T00:00:00.000Z',
    rubricVersion,
  });
  return (input.signals ?? []).find((signal) => signal.criterionId === 'A1');
}

function hasCoverageAbsence(dir: string): boolean {
  return Boolean(
    a1Signal(dir)?.findings?.some((finding) =>
      /no coverage configuration/i.test(finding.summary),
    ),
  );
}

function coverageEvidencePaths(dir: string): string[] {
  return (a1Signal(dir)?.positiveEvidence ?? [])
    .filter((evidence) => evidence.kind === 'coverage' && evidence.path !== undefined)
    .map((evidence) => evidence.path as string);
}

function writeVitestPackage(
  dir: string,
  scripts: Readonly<Record<string, string>>,
  extraDevDependencies: Readonly<Record<string, string>> = {},
): void {
  writeFile(
    dir,
    'package.json',
    JSON.stringify({
      name: 'synthetic-coverage-fixture',
      version: '1.0.0',
      scripts,
      devDependencies: { vitest: '2.1.9', ...extraDevDependencies },
    }),
  );
  writeTypeScriptTest(dir);
}

describe('A1 v23 command-flag coverage recognition', () => {
  it('keeps v17 as the public default and leaves v22 coverage recognition unchanged', () => {
    expect(WITAN_RUBRIC_VERSION).toBe(WITAN_RUBRIC_VERSION_V17);
    const dir = makeTmpRepo();
    writeVitestPackage(dir, {
      test: 'pnpm run test:coverage',
      'test:coverage': 'vitest --coverage',
    });

    const v22 = a1Signal(dir, WITAN_RUBRIC_VERSION_V22);
    expect(v22?.findings?.some((finding) => /no coverage configuration/i.test(finding.summary))).toBe(
      true,
    );
    expect(v22?.findings?.find((finding) => /no coverage configuration/i.test(finding.summary)))
      .toEqual(
        expect.objectContaining({
          derivation: expect.objectContaining({
            patternSetId: 'cejel.core-a1.coverage-configuration.v1',
            patternCount: 10,
          }),
        }),
      );
    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toContain('package.json');
  });

  it('recognizes a reachable test-family wrapper with an enabled numeric coverage threshold', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'synthetic-node-wrapper',
        version: '1.0.0',
        scripts: {
          test: 'pnpm run /^test:/',
          'test:unit': 'pnpm bnt',
          'test:coverage':
            "pnpm bnt --coverage 91 --coverage-exclude 'test/support/**'",
        },
        devDependencies: { 'better-node-test': '0.8.4' },
      }),
    );
    writeFile(dir, 'src/value.ts', 'export const value = 1;\n');
    writeFile(
      dir,
      'test/value.test.ts',
      [
        "import assert from 'node:assert';",
        "import { test } from 'node:test';",
        "test('works', () => assert.equal(1, 1));",
      ].join('\n'),
    );
    writeFile(
      dir,
      '.github/workflows/test.yml',
      'jobs:\n  test:\n    steps:\n      - run: pnpm test\n',
    );

    const a1 = a1Signal(dir);
    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toContain('package.json');
    expect(
      a1?.metrics
        ?.find((metric) => metric.name === 'verification_script_ratio')
        ?.presentation?.components?.find((component) => component.label === 'coverage command')
        ?.count,
    ).toBe(1);
  });

  it('does not recognize the same coverage script when no test or CI entry point reaches it', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, {
      test: 'vitest run',
      'test:coverage': 'pnpm bnt --coverage 91',
    });

    expect(hasCoverageAbsence(dir)).toBe(true);
    expect(coverageEvidencePaths(dir)).not.toContain('package.json');
  });

  it.each([
    ['--no-coverage', 'vitest --no-coverage'],
    ['--coverage=false', 'vitest --coverage=false'],
    ['--coverage false', 'vitest --coverage false'],
  ])('keeps the absence finding for disabled command coverage: %s', (_label, command) => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: command });

    expect(hasCoverageAbsence(dir)).toBe(true);
    expect(coverageEvidencePaths(dir)).toEqual([]);
  });

  it('keeps the absence finding for coverage: false in runner configuration', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' });
    writeFile(
      dir,
      'vitest.config.ts',
      "export default { test: { coverage: false } };\n",
    );

    expect(hasCoverageAbsence(dir)).toBe(true);
    expect(coverageEvidencePaths(dir)).toEqual([]);
  });

  it('ignores an enabled flag inside a shell comment', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' });
    writeFile(
      dir,
      '.github/workflows/test.yml',
      ['jobs:', '  test:', '    steps:', '      - run: |', '          # vitest --coverage', '          pnpm test'].join(
        '\n',
      ),
    );

    expect(hasCoverageAbsence(dir)).toBe(true);
  });

  it('ignores an enabled property inside a JavaScript comment', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' });
    writeFile(
      dir,
      'vitest.config.ts',
      '// coverage: true\nexport default { test: { environment: "node" } };\n',
    );

    expect(hasCoverageAbsence(dir)).toBe(true);
  });

  it('ignores an enabled flag inside a Markdown fence', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' });
    writeFile(dir, 'README.md', '# Example\n\n```sh\nvitest --coverage\n```\n');

    expect(hasCoverageAbsence(dir)).toBe(true);
  });

  it('does not treat report-upload steps as collection', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' });
    writeFile(
      dir,
      '.github/workflows/test.yml',
      [
        'jobs:',
        '  test:',
        '    steps:',
        '      - run: pnpm test',
        '      - uses: codecov/codecov-action@v5',
        '      - run: bash <(curl -s https://uploader.invalid/codecov)',
      ].join('\n'),
    );

    expect(hasCoverageAbsence(dir)).toBe(true);
  });

  it('does not assign an unrelated tool\'s coverage flag to the test runner', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run && docs-map --coverage' });

    expect(hasCoverageAbsence(dir)).toBe(true);
  });

  it('does not infer coverage from a runner config or coverage-capable dependency alone', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' }, { '@vitest/coverage-v8': '2.1.9' });
    writeFile(
      dir,
      'vitest.config.ts',
      "export default { test: { environment: 'node' } };\n",
    );

    expect(hasCoverageAbsence(dir)).toBe(true);
  });

  it('keeps the established finding for a genuine no-coverage repository', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' });

    expect(hasCoverageAbsence(dir)).toBe(true);
  });

  it.each([
    ['Vitest', 'pnpm exec vitest --coverage'],
    ['Jest', 'npx jest --collect-coverage'],
    ['Node test runner', 'node --test --experimental-test-coverage'],
    ['Deno', 'deno test --coverage'],
  ])('recognizes a justified %s coverage flag in a CI run step', (_runner, command) => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest run' });
    writeFile(
      dir,
      '.github/workflows/test.yml',
      `jobs:\n  test:\n    steps:\n      - run: ${command}\n`,
    );

    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toContain('.github/workflows/test.yml');
  });

  it('recognizes a coverage-capable runner flag in a reachable Make recipe', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/value.py', 'value = 1\n');
    writeFile(dir, 'tests/test_value.py', 'def test_value():\n    assert 1 == 1\n');
    writeFile(dir, 'Makefile', 'test:\n\tpytest --cov=src\n');

    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toContain('Makefile');
  });

  it('recognizes a coverage-capable runner flag in a reachable just recipe', () => {
    const dir = makeTmpRepo();
    writeTypeScriptTest(dir);
    writeFile(dir, 'justfile', 'test:\n    bun test --coverage\n');

    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toContain('justfile');
  });

  it('recognizes collection inside a tracked shell wrapper reached by the test entry point', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/value.py', 'value = 1\n');
    writeFile(dir, 'tests/test_value.py', 'def test_value():\n    assert 1 == 1\n');
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'synthetic-shell-wrapper',
        version: '1.0.0',
        scripts: { test: 'sh scripts/run-tests.sh' },
      }),
    );
    writeFile(dir, 'scripts/run-tests.sh', '#!/bin/sh\npytest --cov=src\n');
    writeFile(
      dir,
      '.github/workflows/test.yml',
      'jobs:\n  test:\n    steps:\n      - run: pnpm test\n',
    );

    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toContain('package.json');
  });

  it('withholds the absence claim and records a note when flag ownership is unresolved', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'synthetic-unresolved-wrapper',
        version: '1.0.0',
        scripts: { test: 'custom-test-wrapper --coverage 88' },
      }),
    );
    writeTypeScriptTest(dir);
    writeFile(
      dir,
      '.github/workflows/test.yml',
      'jobs:\n  test:\n    steps:\n      - run: pnpm test\n',
    );

    const a1 = a1Signal(dir);
    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toEqual([]);
    expect(a1?.notes).toContain('Coverage command reachability or flag ownership was unresolved');
    expect(a1?.notes).toContain('package.json');
  });

  it('withholds the absence claim when a dynamic CI script reference leaves reachability unresolved', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, {
      test: 'vitest run',
      'test:coverage': 'vitest --coverage',
    });
    writeFile(
      dir,
      '.github/workflows/test.yml',
      'jobs:\n  test:\n    steps:\n      - run: pnpm run "$TEST_SCRIPT"\n',
    );

    const a1 = a1Signal(dir);
    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toEqual([]);
    expect(a1?.notes).toContain('Coverage command reachability or flag ownership was unresolved');
    expect(a1?.notes).toContain('package.json');
  });

  it('withholds the absence claim when coverage negation is environment-dependent', () => {
    const dir = makeTmpRepo();
    writeVitestPackage(dir, { test: 'vitest --coverage=$COVERAGE_ENABLED' });

    const a1 = a1Signal(dir);
    expect(hasCoverageAbsence(dir)).toBe(false);
    expect(coverageEvidencePaths(dir)).toEqual([]);
    expect(a1?.notes).toContain('Coverage command reachability or flag ownership was unresolved');
  });
});
