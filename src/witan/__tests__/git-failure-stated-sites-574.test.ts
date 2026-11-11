import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { GitExecFailureReason } from '../git-exec.js';
import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import type { WitanReport } from '../schemas.js';
import { buildA2HistoryOrigin, cloneShallowA2Origin, removeShallowA2Fixtures } from './fixtures/shallow-a2-shapes.js';

// #574 item 3: pins for the call sites the record (git-call-sites-574.test.ts) classes as stated
// that no earlier test pinned. Each fails one git read through the execGit mock, as #560's tests do,
// and checks that the failure is named: in a scan limitation, or in the error that stops the scan.
// The history reads are pinned by #560's, #567's and #586's tests; the git-directory check by
// a2-history-round5-560.test.ts; the B4 committer-date read by rubric-calibration-v2.test.ts.
const injected = vi.hoisted(() => ({
  fail: null as null | ((argv: readonly string[]) => GitExecFailureReason | null),
}));
vi.mock('../git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-exec.js')>();
  return {
    ...actual,
    execGit: (argv: readonly string[], options: Parameters<typeof actual.execGit>[1]) => {
      const reason = injected.fail?.(argv) ?? null;
      return reason ? { ok: false as const, reason } : actual.execGit(argv, options);
    },
  };
});

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;
const is = (...head: string[]) => (argv: readonly string[]) => head.every((word, index) => argv[index] === word);

let repo = '';

beforeAll(() => {
  const origin = buildA2HistoryOrigin('stated-sites', [
    {
      write: {
        'package.json': '{"name":"stated","version":"1.0.0"}\n',
        'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
        '.gitignore': 'ignored/\n',
        '.github/workflows/ci.yml':
          'name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n',
        'pkg/package.json': '{"name":"pkg","version":"1.0.0"}\n',
        'pkg/src/a.js': 'export const a = 1;\n',
      },
    },
  ]);
  repo = cloneShallowA2Origin(origin, 'full');
  mkdirSync(join(repo, 'ignored'));
  writeFileSync(join(repo, 'ignored', 'b.js'), 'export const b = 2;\n');
}, 120_000);

afterEach(() => {
  injected.fail = null;
});

afterAll(() => {
  injected.fail = null;
  removeShallowA2Fixtures();
});

function scan(repoPath: string, rubricVersion: string, fail: (argv: readonly string[]) => GitExecFailureReason | null): WitanReport {
  injected.fail = fail;
  try {
    return scoreRepoWithPublicCejel({
      repoPath,
      productSlug: 'stated-sites',
      productDisplayName: 'Stated sites',
      generatedAt: '2026-11-11T00:00:00.000Z',
      rubricVersion,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });
  } finally {
    injected.fail = null;
  }
}

describe('#574 item 3: the stated sites name their failed read', () => {
  it('readGitTrackedFileOutput: a timed-out ls-files or work-tree check states the directory walk', () => {
    for (const rubricVersion of [V17, V27]) {
      for (const fail of [is('ls-files'), is('rev-parse', '--is-inside-work-tree')]) {
        const report = scan(repo, rubricVersion, (argv) => (fail(argv) ? 'timeout' : null));
        expect(report.scanLimitations ?? [], rubricVersion).toContain(
          'Tracked-file inventory was unavailable because execution exceeded the explicit 30 second timeout. Cejel used a bounded directory walk with different exclusion semantics; re-scan after the local Git failure is resolved to compare the certificate.',
        );
      }
    }
  });

  it('resolveMonorepoContext: a failed repository-root discovery for a sub-package scan is stated', () => {
    const report = scan(join(repo, 'pkg'), V17, (argv) => (is('rev-parse', '--show-toplevel')(argv) ? 'exec_failed' : null));
    expect(report.scanLimitations ?? []).toContain(
      'Cejel: local git repository-root discovery failed. Cejel continued without monorepo root-level shared configuration.',
    );
  });

  it('readGitHead and readRecentCommits: a failed read stops the scan with the read named', () => {
    expect(() => scan(repo, V17, (argv) => (is('rev-parse', 'HEAD')(argv) ? 'timeout' : null))).toThrow(
      'Cejel: local git HEAD resolution exceeded the 30 second timeout.',
    );
    expect(() =>
      scan(repo, V17, (argv) => (argv[0] === 'log' && argv.includes('--max-count=12') ? 'buffer_exceeded' : null)),
    ).toThrow('Cejel: local git recent history scan exceeded the 8 MiB output limit.');
  });

  it('explainIgnoredScanTarget: a failed ignore-rule check on an empty inventory stops the scan with the read named', () => {
    expect(() => scan(join(repo, 'ignored'), V17, (argv) => (is('check-ignore')(argv) ? 'timeout' : null))).toThrow(
      'Cejel: local git ignore-rule check exceeded the 30 second timeout.',
    );
  });
});
