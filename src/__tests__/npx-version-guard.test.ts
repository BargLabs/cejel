import { readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { runWitanFreeCli } from '../index.js';
import { npxVersionMismatchWarning, type NpxVersionContext } from '../npx-version-guard.js';

// The environments below mirror what npm 11.19.0 handed a `cejel` bin on 2026-10-12, recorded by
// a preloaded env probe while running npx inside a 0.6.3 checkout of this repository (#436).
const CHECKOUT = join('/', 'work', 'cejel');
const CHECKOUT_BIN = join(CHECKOUT, 'node_modules', '.bin');
const NPX_CACHE_BIN = join('/', 'home', 'u', '.npm', '_npx', 'c4d3a1d6b4395db6', 'node_modules', '.bin');
const STALE_PATH_CEJEL = join('/', 'opt', 'homebrew', 'lib', 'node_modules', '@cejel', 'cejel', 'dist', 'index.js');
const USER_PATH = [join('/', 'opt', 'homebrew', 'bin'), join('/', 'usr', 'bin')];

function pathOf(...entries: string[]): string {
  return [...entries, ...USER_PATH].join(delimiter);
}

function npxEnv(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    npm_lifecycle_event: 'npx',
    npm_lifecycle_script: "'cejel'",
    npm_command: 'exec',
    npm_package_name: '@cejel/cejel',
    npm_package_version: '0.6.3',
    npm_package_json: join(CHECKOUT, 'package.json'),
    npm_config_local_prefix: CHECKOUT,
    PATH: pathOf(CHECKOUT_BIN, join('/', 'work', 'node_modules', '.bin')),
    ...overrides,
  };
}

function context(
  env: Record<string, string | undefined>,
  runningVersion: string,
  runningPath = STALE_PATH_CEJEL,
): NpxVersionContext {
  return { env, cwd: CHECKOUT, packageName: '@cejel/cejel', runningVersion, runningPath };
}

describe('npxVersionMismatchWarning', () => {
  it('warns when npx resolved a pinned spec to the checkout and a different cejel ran from PATH', () => {
    // `npx @cejel/cejel@0.6.3 --version` in the 0.6.3 checkout; the cejel on PATH was 0.4.8.
    const warning = npxVersionMismatchWarning(context(npxEnv({}), '0.4.8'));
    expect(warning).toBeDefined();
    expect(warning).toContain('0.6.3');
    expect(warning).toContain('0.4.8');
    expect(warning).toContain(STALE_PATH_CEJEL);
    expect(warning).toContain(CHECKOUT);
    expect(warning).toContain('#436');
    expect(warning).not.toContain('\n');
  });

  it('is silent when the version that runs is the version npx resolved to', () => {
    expect(npxVersionMismatchWarning(context(npxEnv({}), '0.6.3'))).toBeUndefined();
  });

  it('warns on an exact -p/--package pin that differs from the running version', () => {
    // `npx -p @cejel/cejel@0.6.3 cejel --version` in the checkout: npm exports the spec.
    const env = npxEnv({ npm_config_package: '@cejel/cejel@0.6.3' });
    const warning = npxVersionMismatchWarning(context(env, '0.4.8'));
    expect(warning).toContain('@cejel/cejel@0.6.3');
    expect(warning).toContain('0.4.8');
    expect(warning).toContain(STALE_PATH_CEJEL);
  });

  it('is silent when an exact -p/--package pin matches, wherever the run started', () => {
    const env = {
      npm_lifecycle_event: 'npx',
      npm_config_package: 'typescript@5.5.0\n\n@cejel/cejel@0.6.2',
      PATH: pathOf(NPX_CACHE_BIN),
    };
    expect(npxVersionMismatchWarning(context(env, '0.6.2'))).toBeUndefined();
  });

  describe('is silent when the requested version is unknown', () => {
    it('outside npx', () => {
      const env = npxEnv({ npm_lifecycle_event: 'test' });
      expect(npxVersionMismatchWarning(context(env, '0.4.8'))).toBeUndefined();
      expect(npxVersionMismatchWarning(context({}, '0.4.8'))).toBeUndefined();
    });

    it('when npx installed the package: the checkout version is not the request', () => {
      // `npx @cejel/cejel@0.6.2 --version` in the 0.6.3 checkout ran 0.6.2 from the npx cache.
      // npm_package_version still says 0.6.3; it describes the checkout, not the request.
      const env = npxEnv({ PATH: pathOf(NPX_CACHE_BIN, CHECKOUT_BIN) });
      const cached = join(NPX_CACHE_BIN, '..', '@cejel', 'cejel', 'dist', 'index.js');
      expect(npxVersionMismatchWarning(context(env, '0.6.2', cached))).toBeUndefined();
    });

    it('when npx chose a global install that satisfied the request', () => {
      const globalBin = join('/', 'opt', 'homebrew', 'bin');
      const env = npxEnv({ PATH: pathOf(globalBin, CHECKOUT_BIN) });
      expect(npxVersionMismatchWarning(context(env, '0.6.2'))).toBeUndefined();
    });

    it('when the working directory is some other project', () => {
      const env = npxEnv({ npm_package_name: 'customer-app', npm_package_version: '1.0.0' });
      expect(npxVersionMismatchWarning(context(env, '0.6.3'))).toBeUndefined();
    });

    it('when the -p spec is a range or tag, not an exact version, and npx installed it', () => {
      const env = npxEnv({
        npm_config_package: '@cejel/cejel@latest',
        PATH: pathOf(NPX_CACHE_BIN, CHECKOUT_BIN),
      });
      expect(npxVersionMismatchWarning(context(env, '0.6.2'))).toBeUndefined();
    });

    it('when there is no PATH to read', () => {
      const env = npxEnv({ PATH: undefined });
      expect(npxVersionMismatchWarning(context(env, '0.4.8'))).toBeUndefined();
    });
  });

  it('reads the Windows spelling of PATH', () => {
    const env = npxEnv({ PATH: undefined, Path: pathOf(CHECKOUT_BIN) });
    expect(npxVersionMismatchWarning(context(env, '0.4.8'))).toContain('0.4.8');
  });
});

describe('runWitanFreeCli npx version warning', () => {
  const ownVersion = (
    JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version: string;
    }
  ).version;

  it('writes one stderr line and leaves the exit code and stdout unchanged', async () => {
    vi.stubEnv('npm_lifecycle_event', 'npx');
    vi.stubEnv('npm_config_package', '');
    vi.stubEnv('npm_package_name', '@cejel/cejel');
    vi.stubEnv('npm_package_version', '0.0.1-requested');
    vi.stubEnv('npm_config_local_prefix', process.cwd());
    vi.stubEnv('PATH', [join(process.cwd(), 'node_modules', '.bin'), ...USER_PATH].join(delimiter));
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['--version'])).toBe(0);
      const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(stderr.split('\n').filter(Boolean)).toHaveLength(1);
      expect(stderr).toContain('0.0.1-requested');
      expect(stderr).toContain(`cejel ${ownVersion} from `);
      expect(stdoutSpy.mock.calls.map((call) => String(call[0])).join('')).toBe(`${ownVersion}\n`);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('writes nothing to stderr outside npx', async () => {
    vi.stubEnv('npm_lifecycle_event', 'test');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runWitanFreeCli(['--version'])).toBe(0);
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
