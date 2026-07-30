import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_SUBPROCESS_FILE,
  collectScoringSourceFiles,
  findOfflineBoundaryViolations,
} from './offline-boundary-guard.js';

describe('witan CLI offline guarantee', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const fixtureRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'offline-boundary',
  );
  const legacySourcePatterns = [
    /['"]node:child_process['"]/,
    /\bexecFileSync\s*\(/,
    /\bexecSync\s*\(/,
    /\bspawnSync\s*\(/,
    /\bspawn\s*\(/,
    /(?<!\.)\bexec\s*\(/,
    /\bfetch\s*\(/,
    /['"]node:https?['"]/,
    /['"]node:net['"]/,
    /['"]node:http2['"]/,
    /['"]node:dgram['"]/,
    /['"]node:tls['"]/,
    /['"]undici['"]/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\bnet\.connect\b/,
  ];

  it('covers every first-party scoring root and deliberately excludes test sources', () => {
    const files = collectScoringSourceFiles(repoRoot).map((file) =>
      file.slice(repoRoot.length + 1).replaceAll('\\', '/'),
    );
    expect(files).toContain('src/index.ts');
    expect(files).toContain('src/mcp/index.ts');
    expect(files).toContain('api/mcp.ts');
    expect(files).not.toContain('src/__tests__/offline-guarantee.test.ts');
    expect(files.some((file) => file.includes('/__tests__/'))).toBe(false);
    expect(files.some((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))).toBe(false);
  });

  it('finds no structural offline-boundary violations in scoring source', () => {
    const files = collectScoringSourceFiles(repoRoot);
    expect(findOfflineBoundaryViolations(repoRoot, files)).toEqual([]);
  });

  it.each([
    ['bare built-in imports and re-exports', 'bare-builtins.fixture.ts', 'network_module'],
    ['network-capable built-in subpaths', 'network-subpath.fixture.ts', 'network_module'],
    ['aliased global fetch', 'aliased-fetch.fixture.ts', 'outbound_global'],
    ['computed dynamic imports', 'computed-import.fixture.ts', 'opaque_module_loader'],
    ['createRequire loaders', 'create-require.fixture.ts', 'opaque_module_loader'],
    ['process.getBuiltinModule loaders', 'get-builtin-module.fixture.ts', 'opaque_module_loader'],
    ['aliased require loaders', 'require-alias.fixture.ts', 'opaque_module_loader'],
    ['subprocess imports outside the chokepoint', 'subprocess.fixture.ts', 'subprocess_module'],
    [
      'an existing package HTTP client',
      'external-client.fixture.ts',
      'unapproved_external_module',
    ],
    ['global-object aliases', 'global-object-alias.fixture.ts', 'outbound_global'],
    ['computed loader members', 'computed-loader-member.fixture.ts', 'opaque_module_loader'],
    [
      'network modules behind an excluded transitive path',
      'transitive-entry.fixture.ts',
      'network_module',
    ],
    [
      'unapproved code-execution and subprocess built-ins',
      'unapproved-builtins.fixture.ts',
      'unapproved_builtin_module',
    ],
    [
      'unresolved relative runtime loaders',
      'unresolved-relative-loader.fixture.cjs',
      'opaque_module_loader',
    ],
  ])('rejects %s', (_label, fixture, expectedKind) => {
    const violations = findOfflineBoundaryViolations(repoRoot, [join(fixtureRoot, fixture)]);
    expect(violations.map((violation) => violation.kind)).toContain(expectedKind);
  });

  it('rejects both globalThis and Node global aliases', () => {
    const violations = findOfflineBoundaryViolations(repoRoot, [
      join(fixtureRoot, 'global-object-alias.fixture.ts'),
    ]);
    expect(violations.map((violation) => violation.detail)).toEqual(
      expect.arrayContaining([
        'global object globalThis escapes direct capability analysis',
        'global object global escapes direct capability analysis',
      ]),
    );
  });

  it('rejects both computed process and module loader members', () => {
    const violations = findOfflineBoundaryViolations(repoRoot, [
      join(fixtureRoot, 'computed-loader-member.fixture.ts'),
    ]);
    expect(violations.map((violation) => violation.detail)).toEqual(
      expect.arrayContaining([
        'process[...] uses a computed module-loader capability lookup',
        'module[...] uses a computed module-loader capability lookup',
      ]),
    );
  });

  it('rejects every unapproved built-in in the code-execution fixture', () => {
    const violations = findOfflineBoundaryViolations(repoRoot, [
      join(fixtureRoot, 'unapproved-builtins.fixture.ts'),
    ]);
    expect(violations.map((violation) => violation.detail)).toEqual(
      expect.arrayContaining([
        'import reaches unapproved built-in module "node:cluster"',
        'import reaches unapproved built-in module "node:vm"',
      ]),
    );
  });

  it('rejects an unresolved relative loader outside the scanned graph', () => {
    const violations = findOfflineBoundaryViolations(repoRoot, [
      join(fixtureRoot, 'unresolved-relative-loader.fixture.cjs'),
    ]);
    expect(violations.map((violation) => violation.detail)).toContain(
      'require reaches relative module "./generated.cjs" outside the scanned first-party graph',
    );
  });

  it.each([
    'bare-builtins.fixture.ts',
    'aliased-fetch.fixture.ts',
    'computed-import.fixture.ts',
    'create-require.fixture.ts',
    'get-builtin-module.fixture.ts',
    'network-subpath.fixture.ts',
    'require-alias.fixture.ts',
    'subprocess.fixture.ts',
    'external-client.fixture.ts',
    'global-object-alias.fixture.ts',
    'computed-loader-member.fixture.ts',
    'transitive-entry.fixture.ts',
    'unapproved-builtins.fixture.ts',
    'unresolved-relative-loader.fixture.cjs',
  ])('%s demonstrates a bypass of the legacy source-text guard', (fixture) => {
    const contents = readFileSync(join(fixtureRoot, fixture), 'utf8');
    expect(legacySourcePatterns.some((pattern) => pattern.test(contents))).toBe(false);
  });

  it('ignores comments, strings, and locally bound names that only resemble network primitives', () => {
    const fixture = join(fixtureRoot, 'safe-local-bindings.fixture.ts');
    expect(findOfflineBoundaryViolations(repoRoot, [fixture])).toEqual([]);
  });

  it('ignores network-capability names and imports that TypeScript erases', () => {
    const fixture = join(fixtureRoot, 'type-only-capabilities.fixture.ts');
    expect(findOfflineBoundaryViolations(repoRoot, [fixture])).toEqual([]);
  });

  it('still rejects a runtime capability when its type assertion is erased', () => {
    const fixture = join(fixtureRoot, 'runtime-type-assertion.fixture.ts');
    expect(findOfflineBoundaryViolations(repoRoot, [fixture])).toEqual([
      expect.objectContaining({
        kind: 'outbound_global',
        detail: 'global fetch exposes an outbound network primitive',
      }),
    ]);
  });

  it('preserves explicitly approved built-ins', () => {
    const fixture = join(fixtureRoot, 'allowed-builtins.fixture.ts');
    expect(findOfflineBoundaryViolations(repoRoot, [fixture])).toEqual([]);
  });

  it('preserves relative imports that resolve into the scanned first-party graph', () => {
    const fixture = join(fixtureRoot, 'safe-relative-entry.fixture.ts');
    expect(findOfflineBoundaryViolations(repoRoot, [fixture])).toEqual([]);
  });

  it('preserves relative require calls that resolve into the scanned first-party graph', () => {
    const fixture = join(fixtureRoot, 'safe-relative-loader.fixture.cjs');
    expect(findOfflineBoundaryViolations(repoRoot, [fixture])).toEqual([]);
  });

  it('preserves the exact hardened Git subprocess import and no broader child-process access', () => {
    const allowedSubprocessFile = join(repoRoot, ALLOWED_SUBPROCESS_FILE);
    const contents = readFileSync(allowedSubprocessFile, 'utf8');
    expect(contents).toContain("import { execFileSync } from 'node:child_process';");
    expect(findOfflineBoundaryViolations(repoRoot, [allowedSubprocessFile])).toEqual([]);
  });
});
