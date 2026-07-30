import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { listCejelLlmPackFiles } from '../../packs/llm/files.js';
import { runCejelScan } from '../../scan.js';
import { renderWitanHtmlReport } from '../html.js';
import { renderWitanMarkdownReport } from '../markdown.js';

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
}));

const temporaryDirectories: string[] = [];

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cejel-inventory-fallback-'));
  temporaryDirectories.push(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'inventory-fallback-fixture',
        version: '1.0.0',
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(root, 'README.md'), '# Inventory fallback fixture\n');
  writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 42;\n');
  writeFileSync(join(root, 'src', 'index.test.ts'), 'it("works", () => {});\n');
  writeFileSync(
    join(root, '.github', 'workflows', 'ci.yml'),
    'on: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n',
  );
  return root;
}

function commandArguments(rawArguments: readonly string[] | undefined): readonly string[] {
  if (!rawArguments) return [];
  let index = 0;
  while (rawArguments[index] === '-c') index += 2;
  return rawArguments.slice(index);
}

function mockInventoryBufferFailure(repoPath: string): void {
  execFileSyncMock.mockImplementation((_file, rawArguments) => {
    const argv = commandArguments(rawArguments);
    if (argv[0] === 'ls-files') {
      throw Object.assign(new Error('stdout maxBuffer length exceeded'), { code: 'ENOBUFS' });
    }
    if (argv[0] === 'rev-parse' && argv[1] === '--is-inside-work-tree') return 'true\n';
    if (argv[0] === 'rev-parse' && argv[1] === '--show-toplevel') return `${repoPath}\n`;
    if (argv[0] === 'rev-parse' && argv[1] === 'HEAD') {
      return '0123456789abcdef0123456789abcdef01234567\n';
    }
    return '';
  });
}

afterEach(() => {
  execFileSyncMock.mockReset();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('tracked-file inventory fallback', () => {
  it('declares an oversized git inventory in JSON, HTML, and markdown', () => {
    const repoPath = fixtureRepo();
    mockInventoryBufferFailure(repoPath);

    const { report } = runCejelScan({ repoPath });

    expect(report.scanLimitations).toEqual([
      expect.stringContaining('output exceeded the explicit 64 MiB limit'),
    ]);
    expect(JSON.stringify(report)).toContain('bounded directory walk');
    expect(renderWitanMarkdownReport(report)).toContain('## Scan limitations');
    expect(renderWitanMarkdownReport(report)).toContain('bounded directory walk');
    expect(renderWitanHtmlReport(report)).toContain('Scan limitations');
    expect(renderWitanHtmlReport(report)).toContain('bounded directory walk');
  });

  it('makes an oversized LLM-pack inventory a hard failure instead of a silent downgrade', () => {
    const repoPath = fixtureRepo();
    mockInventoryBufferFailure(repoPath);

    expect(() => listCejelLlmPackFiles(repoPath)).toThrow(
      'local git tracked-file inventory exceeded the 64 MiB output limit',
    );
  });

  it.each(['git_absent', 'not_a_repo'] as const)(
    'keeps %s as a normal directory-walk certificate',
    (condition) => {
      const repoPath = fixtureRepo();
      execFileSyncMock.mockImplementation(() => {
        if (condition === 'git_absent') {
          throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
        }
        throw Object.assign(new Error('fatal'), {
          status: 128,
          stderr: 'fatal: not a git repository (or any parent up to mount point)',
        });
      });

      const { report } = runCejelScan({ repoPath });

      expect(report.scanLimitations).toBeUndefined();
      expect(report.criteria.length).toBeGreaterThan(0);
      expect(report.overallScore).not.toBeNull();
      expect(report.repo.headSha).toBeUndefined();
    },
  );
});
