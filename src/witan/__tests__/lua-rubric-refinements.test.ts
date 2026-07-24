import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { createWitanReport } from '../scoring.js';

// Rubric refinements surfaced by reading a well-built MIT governance library (Lua
// governance-sdk, see docs/orchestration/goal_cejel_rubric_refinement_from_lua_2026-07-06.md):
// cejel mis-scored several honest-engineering signals as gaps. Each item below is locked by a
// positive fixture (the good pattern is credited/un-penalized) and a negative/regression
// fixture (the prior behavior is preserved when the good pattern is absent).

function makeTmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-lua-rubric-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = join(dir, rel);
  mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
  execFileSync('git', ['add', rel], { cwd: dir });
}

function signalFor(dir: string, id: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'test',
    productDisplayName: 'Test',
    repoPath: dir,
    generatedAt: '2026-07-06T00:00:00.000Z',
  });
  return (input.signals ?? []).find((s) => s.criterionId === id) ?? null;
}

// ─── 1. A4 — optional peer deps are not runtime attack surface ─────────────

describe('A4 — optional peer deps (peerDependenciesMeta.optional) are excluded from the dependency-spec denominator', () => {
  it('a package with only optional peer deps + one pinned real dep scores full ratio credit', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'zero-runtime-dep-library',
        version: '1.0.0',
        dependencies: { zod: '3.23.8' },
        peerDependencies: { vitest: '^1.0.0', mocha: '^10.0.0' },
        peerDependenciesMeta: {
          vitest: { optional: true },
          mocha: { optional: true },
        },
      }),
    );
    writeFile(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');

    const a4 = signalFor(dir, 'A4');
    expect(a4).not.toBeNull();
    // This fixture is a library (no deploy surface), so A4 scores on library norms and the
    // spec set surfaces as declared_version_range_ratio; the denominator-exclusion intent is
    // unchanged. Before the fix: 3 specs in the denominator (zod + 2 optional peer ranges).
    // After: the two optional peers are excluded entirely -> 1 spec, full credit.
    const rangeRatio = a4?.metrics?.find((m) => m.name === 'declared_version_range_ratio');
    expect(rangeRatio?.value).toBe(1);
    expect(rangeRatio?.max).toBe(1);
  });

  it('regression: a non-optional peer dep (no peerDependenciesMeta) still counts toward the denominator', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'required-peer-library',
        version: '1.0.0',
        dependencies: { zod: '3.23.8' },
        peerDependencies: { react: '^18.0.0' },
      }),
    );
    writeFile(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');

    const a4 = signalFor(dir, 'A4');
    // Library-norm metric (see above): react ^18.0.0 is a required peer and stays in the
    // denominator (2 specs); both specs carry a declared constraint.
    const rangeRatio = a4?.metrics?.find((m) => m.name === 'declared_version_range_ratio');
    expect(rangeRatio?.value).toBe(2);
    expect(rangeRatio?.max).toBe(2);
  });
});

// ─── 2. A5 — documented negative space is honest scoping, not a missing-claim gap ──

describe('A5 — a documented limitations/threat-model section downgrades the missing-artifact finding to info', () => {
  it('a README with an explicit Limitations section is credited and the finding is info, not warning', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'README.md',
      [
        '# Governance SDK',
        '',
        'A library for tamper-evident audit chains.',
        '',
        '## Limitations',
        '',
        'This library does not protect against a compromised signing key, and it does not cover',
        'transport-layer confidentiality — pair it with TLS.',
      ].join('\n'),
    );
    writeFile(dir, 'src/index.ts', 'export function chain(): void {}\n');

    const a5 = signalFor(dir, 'A5');
    expect(a5).not.toBeNull();
    expect(a5?.findings?.length).toBe(1);
    expect(a5?.findings?.[0]?.severity).toBe('info');
    expect(
      a5?.positiveEvidence?.some((e) => /limitations|threat model|not cover/i.test(e.label)),
    ).toBe(true);
  });

  it('regression: a README with no negative-space section keeps the warning finding', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'README.md',
      ['# Ordinary Library', '', 'A library that does things.'].join('\n'),
    );
    writeFile(dir, 'src/index.ts', 'export function doThing(): void {}\n');

    const a5 = signalFor(dir, 'A5');
    expect(a5?.findings?.length).toBe(1);
    expect(a5?.findings?.[0]?.severity).toBe('warning');
  });
});

// ─── 3. A1/B3 — a lean built-in test toolchain is a positive signal, not a coverage-tool ding ──

describe('A1 — a lean built-in test toolchain (node:test) with no heavy test dependency is not dinged for missing coverage config', () => {
  it('node --test + node:test import + no jest/mocha produces no "no coverage configuration" finding', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'lean-toolchain-library',
        version: '1.0.0',
        scripts: { test: 'node --test' },
        devDependencies: { typescript: '5.9.3' },
      }),
    );
    writeFile(dir, 'src/index.ts', 'export function add(a: number, b: number) { return a + b; }\n');
    writeFile(
      dir,
      'src/index.test.ts',
      [
        "import { test } from 'node:test';",
        "import assert from 'node:assert';",
        "import { add } from './index.js';",
        "test('adds', () => { assert.equal(add(1, 2), 3); });",
      ].join('\n'),
    );

    const a1 = signalFor(dir, 'A1');
    expect(a1).not.toBeNull();
    expect(a1?.findings?.some((f) => /no coverage configuration/i.test(f.summary))).toBe(false);
    expect(a1?.positiveEvidence?.some((e) => /lean built-in test toolchain/i.test(e.label))).toBe(
      true,
    );
  });

  it('regression: node --test alongside a heavy test dependency (jest) still gets the coverage ding', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'mixed-toolchain-library',
        version: '1.0.0',
        scripts: { test: 'node --test' },
        devDependencies: { jest: '29.7.0' },
      }),
    );
    writeFile(dir, 'src/index.ts', 'export function add(a: number, b: number) { return a + b; }\n');
    writeFile(dir, 'src/index.test.ts', "test('adds', () => { expect(1 + 2).toBe(3); });\n");

    const a1 = signalFor(dir, 'A1');
    expect(a1?.findings?.some((f) => /no coverage configuration/i.test(f.summary))).toBe(true);
  });

  it('regression: an ordinary vitest project with no node:test usage still gets the coverage ding', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'vitest-library',
        version: '1.0.0',
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '1.6.0' },
      }),
    );
    writeFile(dir, 'src/index.ts', 'export function add(a: number, b: number) { return a + b; }\n');
    writeFile(
      dir,
      'src/index.test.ts',
      "import { expect, it } from 'vitest';\nit('adds', () => { expect(1 + 2).toBe(3); });\n",
    );

    const a1 = signalFor(dir, 'A1');
    expect(a1?.findings?.some((f) => /no coverage configuration/i.test(f.summary))).toBe(true);
  });

  it.each([
    {
      label: 'nyc script',
      scripts: { test: 'nyc mocha' },
      devDependencies: { mocha: '10.8.2', nyc: '17.1.0' },
      config: undefined,
    },
    {
      label: 'c8 package.json config',
      scripts: { test: 'mocha' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
      config: { c8: { all: true } },
    },
    {
      label: 'istanbul script',
      scripts: { test: 'istanbul cover node_modules/mocha/bin/_mocha' },
      devDependencies: { mocha: '10.8.2', istanbul: '0.4.5' },
      config: undefined,
    },
    {
      label: 'cross-env wrapped c8 script',
      scripts: { test: 'cross-env NODE_ENV=test c8 node --test' },
      devDependencies: { c8: '10.1.3', 'cross-env': '7.0.3' },
      config: undefined,
    },
    {
      label: 'env wrapped nyc script with options',
      scripts: { test: 'env -i -u DEBUG NODE_ENV=test npm exec --yes -- nyc mocha' },
      devDependencies: { mocha: '10.8.2', nyc: '17.1.0' },
      config: undefined,
    },
    {
      label: 'cross-env-shell quoted c8 pipeline',
      scripts: {
        test: 'cross-env-shell NODE_ENV=test "c8 node --test && echo covered | tee coverage.log"',
      },
      devDependencies: { c8: '10.1.3', 'cross-env': '7.0.3' },
      config: undefined,
    },
    {
      label: 'env split-string with pnpm dlx',
      scripts: { test: 'env -S "NODE_ENV=test pnpm dlx c8 node --test"' },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'env split-string with an explicit shell command',
      scripts: { test: `env -S "sh -c 'echo setup && c8 node --test'"` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'env split-string with an unquoted one-word shell command',
      scripts: { test: 'env -S "sh -c c8"' },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'direct unquoted one-word shell command',
      scripts: { test: 'sh -c c8' },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'login shell with an escaped-quote command string',
      scripts: { test: String.raw`bash -lc "echo \"setup\" && c8 node --test"` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'separate login and command option tokens',
      scripts: { test: `bash -l -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'bash pipefail option before the command string',
      scripts: { test: `bash -o pipefail -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'bash shopt option before the command string',
      scripts: { test: `bash -O extglob -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'bash long option before the command string',
      scripts: { test: `bash --noprofile -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'bash login long option before the command string',
      scripts: { test: `bash --login -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'POSIX sh set-option before the command string',
      scripts: { test: `sh -o errexit -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'dash set-option before the command string',
      scripts: { test: `dash -o errexit -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'compact Bash option with a trailing set-option operand',
      scripts: { test: `bash -eo pipefail -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh login option before the command string',
      scripts: { test: `zsh -l -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'dash stdin option before the command string',
      scripts: { test: `dash -s -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'POSIX sh monitor option before the command string',
      scripts: { test: `sh -m -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'dash interactive option before the command string',
      scripts: { test: `dash -i -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'dash login option before the command string',
      scripts: { test: `dash -l -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'POSIX sh interactive option before the command string',
      scripts: { test: `sh -i -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh interactive option before the command string',
      scripts: { test: `zsh -i -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh privileged option before the command string',
      scripts: { test: `zsh -p -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh stdin option before the command string',
      scripts: { test: `zsh -s -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh uppercase named option before the command string',
      scripts: { test: `zsh -o ERREXIT -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh inverted uppercase named option before the command string',
      scripts: { test: `zsh -o NO_ERREXIT -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh plus-inverted uppercase named option before the command string',
      scripts: { test: `zsh +o NO_ERREXIT -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh named interactive invocation option before the command string',
      scripts: { test: `zsh -o INTERACTIVE -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh inverted named interactive invocation option before the command string',
      scripts: { test: `zsh +o NO_INTERACTIVE -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh named login invocation option before the command string',
      scripts: { test: `zsh -o LOGIN -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh named privileged invocation option before the command string',
      scripts: { test: `zsh -o PRIVILEGED -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh named shinstdin invocation option before the command string',
      scripts: { test: `zsh -o SHIN_STDIN -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh named stdin invocation option before the command string',
      scripts: { test: `zsh -o STDIN -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh canonical exec option before the command string',
      scripts: { test: `zsh -o EXEC -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh canonical exec option reverses noexec',
      scripts: { test: `zsh -o NO_EXEC -o EXEC -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh disabling noexec reverses disabled exec',
      scripts: { test: `zsh +o EXEC +o NO_EXEC -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long exec option before the command string',
      scripts: { test: `zsh --exec -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long inverted option before the command string',
      scripts: { test: `zsh --no-errexit -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long stdin option before the command string',
      scripts: { test: `zsh --stdin -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long shinstdin option before the command string',
      scripts: { test: `zsh --shinstdin -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long interactive option before the command string',
      scripts: { test: `zsh --interactive -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long login option before the command string',
      scripts: { test: `zsh --login -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long privileged option before the command string',
      scripts: { test: `zsh --privileged -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh long inverted invocation option before the command string',
      scripts: { test: `zsh --nointeractive -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh plus-long inverted option before the command string',
      scripts: { test: `zsh +-no-errexit -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh plus-long noexec option restores execution',
      scripts: { test: `zsh +-no-exec -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'zsh underscored noexec option is reversible',
      scripts: { test: `zsh -o NO_EXEC +o NO_EXEC -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'Bash noexec disabled before the command string',
      scripts: { test: `bash -n +n -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'Bash named noexec disabled before the command string',
      scripts: { test: `bash -o noexec +o noexec -c 'c8 node --test'` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'double-quoted literal hash before a real command',
      scripts: { test: String.raw`sh -c "echo \# && c8 node --test"` },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'double-quoted line continuation before a real command',
      scripts: {
        test: String.raw`sh -c "echo setup \
&& c8 node --test"`,
      },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'single-quoted backslash before a real coverage command',
      scripts: { test: "echo 'foo\\' && c8 node --test" },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'background boundary before a real coverage command',
      scripts: { test: 'echo setup & yarn exec c8 node --test' },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'real coverage command after a comment newline',
      scripts: { test: 'echo disabled # c8 is commented out\nc8 node --test' },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'grouped command with the command builtin',
      scripts: { test: '(command -- c8 node --test)' },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
    {
      label: 'timed coverage command',
      scripts: { test: 'time -p c8 node --test' },
      devDependencies: { c8: '10.1.3' },
      config: undefined,
    },
  ])('recognizes package.json coverage tooling: $label', ({ scripts, devDependencies, config }) => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'package-coverage-library',
        version: '1.0.0',
        scripts,
        devDependencies,
        ...config,
      }),
    );
    writeFile(dir, 'src/index.ts', 'export const value = 1;\n');
    writeFile(dir, 'test/index.test.ts', "it('works', () => { expect(1).toBe(1); });\n");

    const a1 = signalFor(dir, 'A1');
    expect(
      a1?.findings?.some((finding) => /no coverage configuration/i.test(finding.summary)),
    ).toBe(false);
    expect(
      a1?.positiveEvidence?.some(
        (evidence) =>
          evidence.kind === 'coverage' &&
          evidence.path === 'package.json' &&
          evidence.label === 'Coverage configuration',
      ),
    ).toBe(true);
  });

  it.each([
    {
      label: 'unused c8 dependency',
      scripts: { test: 'mocha' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'non-command c8 mention',
      scripts: { test: 'mocha', note: 'echo "hello | c8 node --test"' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'quoted nyc mention after a pipeline character',
      scripts: { test: 'mocha', note: 'printf "message | nyc mocha"' },
      devDependencies: { mocha: '10.8.2', nyc: '17.1.0' },
    },
    {
      label: 'whole-command quoted executable name',
      scripts: { test: 'mocha', note: '"echo setup && c8 node --test"' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'coverage command after an unquoted comment marker',
      scripts: { test: 'mocha', note: 'echo disabled # && c8 node --test' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'builtin cannot execute an external coverage tool',
      scripts: { test: 'mocha', note: 'builtin c8 node --test' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'unclosed shell group',
      scripts: { test: 'mocha', note: '(c8 node --test' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'env split-string inert coverage argument',
      scripts: { test: 'mocha', note: 'env -S "echo disabled && c8 node --test"' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'shell positional argument is not a command',
      scripts: { test: 'mocha', note: 'sh -c echo c8' },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'bash arithmetic evaluation is not a subshell command',
      scripts: { test: 'mocha', note: `bash -c '(( c8 ))'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'double-quoted escaped semicolon is not a command boundary',
      scripts: { test: 'mocha', note: String.raw`sh -c "echo setup \; c8 node --test"` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'invalid Bash short option',
      scripts: { test: 'mocha', note: `bash -Q -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'invalid Bash set-option operand',
      scripts: {
        test: 'mocha',
        note: `bash -o definitely_not_a_shell_option -c 'c8 node --test'`,
      },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash-only long option passed to sh',
      scripts: { test: 'mocha', note: `sh --noprofile -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash-only shopt option passed to dash',
      scripts: { test: 'mocha', note: `dash -O extglob -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash noexec before the command string',
      scripts: { test: 'mocha', note: `bash -n -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'compact Bash noexec before the command string',
      scripts: { test: 'mocha', note: `bash -nc 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash named noexec before the command string',
      scripts: { test: 'mocha', note: `bash -o noexec -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'POSIX sh noexec before the command string',
      scripts: { test: 'mocha', note: `sh -n -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'dash noexec before the command string',
      scripts: { test: 'mocha', note: `dash -n -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash debug-strings mode implies noexec',
      scripts: { test: 'mocha', note: `bash -D -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash debug-strings mode survives disabling noexec',
      scripts: { test: 'mocha', note: `bash -D +n -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash plus-D mode is also dump-only',
      scripts: { test: 'mocha', note: `bash +D -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash plus-D mode survives disabling noexec',
      scripts: { test: 'mocha', note: `bash +D +n -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash debug-strings mode is not reversed by plus-D',
      scripts: { test: 'mocha', note: `bash -D +D -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'Bash debug-strings mode survives disabling named noexec',
      scripts: { test: 'mocha', note: `bash -D +o noexec -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'version-dependent dash privileged option',
      scripts: { test: 'mocha', note: `dash -p -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'zsh underscored noexec remains enabled',
      scripts: { test: 'mocha', note: `zsh -o NO_EXEC -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'zsh canonical exec option remains disabled',
      scripts: { test: 'mocha', note: `zsh +o EXEC -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'zsh long noexec option remains enabled',
      scripts: { test: 'mocha', note: `zsh --noexec -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'zsh plus-long exec option remains disabled',
      scripts: { test: 'mocha', note: `zsh +-exec -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'zsh double-inverted named option fails closed',
      scripts: { test: 'mocha', note: `zsh -o NO_NO_ERREXIT -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'zsh double-inverted named invocation option fails closed',
      scripts: { test: 'mocha', note: `zsh -o NO_NO_INTERACTIVE -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'uppercase Bash named option',
      scripts: { test: 'mocha', note: `bash -o ERREXIT -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'uppercase dash named option',
      scripts: { test: 'mocha', note: `dash -o ERREXIT -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'uppercase POSIX sh named option',
      scripts: { test: 'mocha', note: `sh -o ERREXIT -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
    {
      label: 'uppercase ksh named option fails closed',
      scripts: { test: 'mocha', note: `ksh -o ERREXIT -c 'c8 node --test'` },
      devDependencies: { mocha: '10.8.2', c8: '10.1.3' },
    },
  ])('does not invent coverage configuration from $label', ({ scripts, devDependencies }) => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'package-without-coverage',
        version: '1.0.0',
        scripts,
        devDependencies,
      }),
    );
    writeFile(dir, 'src/index.ts', 'export const value = 1;\n');
    writeFile(dir, 'test/index.test.ts', "it('works', () => { expect(1).toBe(1); });\n");

    const a1 = signalFor(dir, 'A1');
    expect(
      a1?.findings?.some((finding) => /no coverage configuration/i.test(finding.summary)),
    ).toBe(true);
    expect(
      a1?.positiveEvidence?.some(
        (evidence) =>
          evidence.kind === 'coverage' &&
          evidence.path === 'package.json' &&
          evidence.label === 'Coverage configuration',
      ),
    ).toBe(false);
  });
});

// ─── 4. A2 — bounded crypto-comparison hygiene nudge ────────────────────────

describe('A2 — crypto comparison hygiene is credited/flagged only when a signing/HMAC surface exists', () => {
  it('constant-time compare + canonical serialization before signing scores full credit', () => {
    const dir = makeTmpRepo();
    writeFile(dir, '.env.example', 'API_KEY=INSERT_KEY_HERE\n');
    writeFile(dir, '.gitignore', '.env\n');
    writeFile(
      dir,
      'src/hmac.ts',
      [
        "import { createHmac, timingSafeEqual } from 'node:crypto';",
        "import stableStringify from 'safe-stable-stringify';",
        '',
        'export function sign(payload: unknown, key: string): Buffer {',
        '  const canonical = stableStringify(payload);',
        "  return createHmac('sha256', key).update(canonical ?? '').digest();",
        '}',
        '',
        'export function verify(computedHmac: Buffer, expectedHmac: Buffer): boolean {',
        '  return timingSafeEqual(computedHmac, expectedHmac);',
        '}',
      ].join('\n'),
    );

    const a2 = signalFor(dir, 'A2');
    expect(a2).not.toBeNull();
    const hygiene = a2?.metrics?.find((m) => m.name === 'crypto_comparison_hygiene');
    expect(hygiene?.value).toBe(1);
    expect(
      a2?.positiveEvidence?.some((e) => /constant-time secret\/hmac comparison/i.test(e.label)),
    ).toBe(true);
    expect(
      a2?.positiveEvidence?.some((e) => /canonical serialization before signing/i.test(e.label)),
    ).toBe(true);
  });

  it('a plain === on an HMAC and signing over unsorted JSON are flagged as (never critical) warnings', () => {
    const dir = makeTmpRepo();
    writeFile(dir, '.env.example', 'API_KEY=INSERT_KEY_HERE\n');
    writeFile(dir, '.gitignore', '.env\n');
    writeFile(
      dir,
      'src/hmac.ts',
      [
        "import { createHmac } from 'node:crypto';",
        '',
        'export function sign(payload: unknown, key: string): string {',
        "  return createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex');",
        '}',
        '',
        'export function verify(computedSignature: string, providedSignature: string): boolean {',
        '  if (computedSignature === providedSignature) return true;',
        '  return false;',
        '}',
      ].join('\n'),
    );

    const a2 = signalFor(dir, 'A2');
    const hygiene = a2?.metrics?.find((m) => m.name === 'crypto_comparison_hygiene');
    expect(hygiene?.value).toBe(0);
    expect(a2?.findings?.every((f) => f.severity !== 'critical')).toBe(true);
    const timingFinding = a2?.findings?.find((f) =>
      /non-constant-time secret comparison|timing side-channel/i.test(f.summary),
    );
    expect(timingFinding).toBeDefined();
    // Guard 2 (real positions, never a fabricated one): the insecure compare is the 8th line
    // of src/hmac.ts above — the evidence must carry that REAL line, not a hardcoded 1.
    expect(timingFinding?.evidence.line).toBe(8);
    expect(a2?.findings?.some((f) => /unsorted json|canonical key ordering/i.test(f.summary))).toBe(
      true,
    );
  });

  it('regression: a repo with no signing/HMAC surface never receives the crypto-hygiene metric', () => {
    const dir = makeTmpRepo();
    writeFile(dir, '.env.example', 'API_KEY=INSERT_KEY_HERE\n');
    writeFile(dir, '.gitignore', '.env\n');
    writeFile(dir, 'src/index.ts', 'export function add(a: number, b: number) { return a + b; }\n');

    const a2 = signalFor(dir, 'A2');
    expect(a2?.metrics?.some((m) => m.name === 'crypto_comparison_hygiene')).toBe(false);
  });

  // ── goal_cejel_a2_one_notion_of_production_code_2026-07-13 ──────────────────────────────
  // cejel pointed at its OWN public repo on launch night and flagged
  // src/witan/__tests__/lua-rubric-refinements.test.ts — the fixture file directly above this
  // one, whose string-literal example code exists solely to test the crypto-hygiene rule — as a
  // live "timing side-channel" in the shipped product, at line 1 (a fabricated position: it
  // never found a comparison, it found a file). Root cause: the timing sub-rule was the only
  // content-scan detector in this file with NO awareness of the shared test/fixture path
  // classifier that every sibling rule (secret-shaped scan, GRANT scan) already used.

  it('Guard 1 (load-bearing) + Guard 5 — a test/fixture file containing the exact false-positive shape never fires the A2 timing WARNING', () => {
    const dir = makeTmpRepo();
    // No genuine production signing/HMAC surface anywhere in this repo — matches cejel's own
    // public repo, whose only "crypto" text lives inside this exact test fixture.
    writeFile(
      dir,
      'src/__tests__/lua-rubric-refinements.test.ts',
      [
        "import { createHmac, timingSafeEqual } from 'node:crypto';",
        '',
        '// Fixture: string literals of example code, not real code.',
        'const goodFixture = [',
        '  "import { createHmac, timingSafeEqual } from \'node:crypto\';",',
        "  'export function verify(computedHmac: Buffer, expectedHmac: Buffer): boolean {',",
        "  '  return timingSafeEqual(computedHmac, expectedHmac);',",
        "  '}',",
        "].join('\\n');",
        'const badFixture = [',
        "  'export function verify(computedSignature: string, providedSignature: string): boolean {',",
        "  '  if (computedSignature === providedSignature) return true;',",
        "  '  return false;',",
        "  '}',",
        "].join('\\n');",
      ].join('\n'),
    );

    const a2 = signalFor(dir, 'A2');
    expect(
      a2?.findings?.some((f) => f.severity === 'warning' && /timing side-channel/i.test(f.summary)),
    ).toBe(false);
    // Downgrade, never silence: still visible, just not as a live production warning, and it
    // does not fabricate a position either.
    const infoFinding = a2?.findings?.find((f) => /timing side-channel/i.test(f.summary));
    if (infoFinding) {
      expect(infoFinding.severity).toBe('info');
      expect(infoFinding.evidence.path).toContain('__tests__');
    }
    // No genuine crypto surface exists in production code, so the metric itself is absent —
    // "the overall score changes accordingly", not just the one finding.
    expect(a2?.metrics?.some((m) => m.name === 'crypto_comparison_hygiene')).toBe(false);
  });

  it('Guard 2 — a genuine production timing bug still fires at warning, with its real line', () => {
    const dir = makeTmpRepo();
    writeFile(dir, '.env.example', 'API_KEY=INSERT_KEY_HERE\n');
    writeFile(dir, '.gitignore', '.env\n');
    writeFile(
      dir,
      'src/verify.ts',
      [
        "import { createHmac } from 'node:crypto';",
        '',
        'export function sign(payload: string, key: string): string {',
        "  return createHmac('sha256', key).update(payload).digest('hex');",
        '}',
        '',
        'export function verify(computedHmac: string, expectedHmac: string): boolean {',
        '  return computedHmac === expectedHmac;',
        '}',
      ].join('\n'),
    );

    const a2 = signalFor(dir, 'A2');
    const finding = a2?.findings?.find((f) => /timing side-channel/i.test(f.summary));
    expect(finding?.severity).toBe('warning');
    expect(finding?.evidence.path).toBe('src/verify.ts');
    expect(finding?.evidence.line).toBe(8);
  });

  it('regression — a numeric bounds check (index/length/offset) never fires the timing rule, however secret-shaped the identifier looks', () => {
    const dir = makeTmpRepo();
    writeFile(dir, '.env.example', 'API_KEY=INSERT_KEY_HERE\n');
    writeFile(dir, '.gitignore', '.env\n');
    writeFile(
      dir,
      'src/parse-signature.ts',
      [
        "import { createHmac } from 'node:crypto';",
        '',
        'export function sign(payload: string, key: string): string {',
        "  return createHmac('sha256', key).update(payload).digest('hex');",
        '}',
        '',
        'export function findSignatureBoundary(token: string, dotIndex: number): boolean {',
        '  return dotIndex === token.length - 1;',
        '}',
        '',
        'export function isFullSignatureLength(signatureLength: number): boolean {',
        '  return signatureLength === 64;',
        '}',
      ].join('\n'),
    );

    const a2 = signalFor(dir, 'A2');
    expect(a2?.findings?.some((f) => /timing side-channel/i.test(f.summary))).toBe(false);
  });
});

describe('Guard 3/4 — one shared production-source classifier; no fabricated positions', () => {
  const repoSignalsSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../repo-signals.ts'),
    'utf8',
  );

  it('Guard 3 — the crypto-hygiene detector calls the shared classifier for both findings it can produce', () => {
    const start = repoSignalsSource.indexOf('function collectCryptoHygieneEvidence');
    const end = repoSignalsSource.indexOf('\nfunction ', start + 1);
    expect(start).toBeGreaterThan(-1);
    const body = repoSignalsSource.slice(start, end === -1 ? undefined : end);
    const classifierCalls = body.match(/isTestOrFixturePath\(/g) ?? [];
    expect(classifierCalls.length).toBe(2);
  });

  it('Guard 4 — the crypto-hygiene findings never use the generic evidenceForRelative (which fabricates line:1); they use evidenceForRelativeAtLine', () => {
    const start = repoSignalsSource.indexOf('function collectCryptoHygieneEvidence');
    const end = repoSignalsSource.indexOf('\nfunction ', start + 1);
    const body = repoSignalsSource.slice(start, end === -1 ? undefined : end);
    // Every findings.push(...) block in this function (as opposed to positive-evidence pushes,
    // which are not "a finding" and are unaffected by this guard) must anchor its evidence via
    // evidenceForRelativeAtLine's explicit real-line-or-null, never the generic
    // evidenceForRelative (whose default is firstMeaningfulLine — the fabrication this goal
    // fixed).
    const findingBlocks = body.split('findings.push({').slice(1);
    expect(findingBlocks.length).toBe(2);
    for (const block of findingBlocks) {
      const evidenceSection = block.slice(0, block.indexOf('});'));
      expect(evidenceSection.includes('evidenceForRelativeAtLine(')).toBe(true);
      expect(/evidence:\s*evidenceForRelative\(/.test(evidenceSection)).toBe(false);
    }
  });
});

// ─── 5. B6 — un-overridable kill-switch / fail-safe ordering ───────────────

describe('B6 — an un-overridable kill-switch / fail-safe governance toggle is a bounded, positive-only signal', () => {
  it('a fail-closed guard on a named safety toggle is credited', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'src/privileged-actions.ts',
      [
        'export function runPrivilegedAction(studio: { safety_toggle: boolean }, action: () => void): void {',
        '  if (!studio.safety_toggle) {',
        "    throw new Error('Privileged actions are disabled for this studio.');",
        '  }',
        '  action();',
        '}',
      ].join('\n'),
    );

    const b6 = signalFor(dir, 'B6');
    expect(b6).not.toBeNull();
    const killSwitch = b6?.metrics?.find((m) => m.name === 'kill_switch_fail_safe_present');
    expect(killSwitch?.value).toBe(1);
    expect(
      b6?.positiveEvidence?.some((e) => /kill-switch|fail-safe governance toggle/i.test(e.label)),
    ).toBe(true);
  });

  it('regression: a named toggle with no fail-closed guard clause is not credited', () => {
    const dir = makeTmpRepo();
    writeFile(
      dir,
      'src/tactical-actions.ts',
      [
        'export const tacticalActionsEnabled = true;',
        '',
        'export function runTacticalAction(action: () => void): void {',
        '  action();',
        '}',
      ].join('\n'),
    );
    // Give B6 a real privileged-op surface so it does not short-circuit to not_applicable,
    // isolating the assertion to whether the kill-switch metric itself is (correctly) absent.
    writeFile(
      dir,
      'docs/RUNBOOK.md',
      'Privileged operations are human-executed, never agent-run.\n',
    );

    const b6 = signalFor(dir, 'B6');
    expect(b6?.metrics?.some((m) => m.name === 'kill_switch_fail_safe_present')).toBe(false);
  });

  it('regression: a repo with no privileged-op surface and no kill switch stays not_applicable', () => {
    const dir = makeTmpRepo();
    writeFile(dir, 'src/index.ts', 'export function add(a: number, b: number) { return a + b; }\n');

    const report = createWitanReport(
      buildWitanInputFromRepo({
        productSlug: 'no-b6-surface',
        productDisplayName: 'No B6 Surface',
        repoPath: dir,
        generatedAt: '2026-07-06T00:00:00.000Z',
      }),
    );
    const b6 = report.criteria.find((c) => c.id === 'B6');
    expect(b6?.status).toBe('not_applicable');
  });
});
