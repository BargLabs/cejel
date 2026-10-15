import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { handleCejelHttpRequest } from '../http/server.js';
import { runCejelScan } from '../scan.js';

const TEST_IDENTITY = { packageName: '@cejel/cejel', version: '0.0.0-test' };
const OUTER_MARKER_FILE = 'outer-host-tracked-marker.txt';
const TEMPORARY_DIRECTORY_VARIABLES = ['TMPDIR', 'TMP', 'TEMP'] as const;

const temporaryDirectories: string[] = [];

function git(repoPath: string, argv: readonly string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...argv], {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
}

/** A synthetic "host" repository with one commit, standing in for a checkout on the server. */
function outerRepository(): { root: string; headSha: string } {
  const root = mkdtempSync(join(tmpdir(), 'cejel-outer-host-'));
  temporaryDirectories.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'Cejel Test']);
  git(root, ['config', 'user.email', 'cejel@example.invalid']);
  mkdirSync(join(root, 'sub', 'src'), { recursive: true });
  writeFileSync(join(root, OUTER_MARKER_FILE), 'outer host content\n');
  writeFileSync(join(root, 'sub', 'src', 'index.ts'), 'export const value = 42;\n');
  writeFileSync(join(root, 'package.json'), '{"name":"outer-host-fixture","version":"1.0.0"}\n');
  git(root, ['add', '--', OUTER_MARKER_FILE, 'package.json', 'sub/src/index.ts']);
  git(root, ['commit', '--quiet', '-m', 'outer host commit']);
  return { root, headSha: git(root, ['rev-parse', 'HEAD']) };
}

function scanRequest(
  files: readonly { path: string; content: string }[],
  format: 'summary' | 'json' = 'summary',
): Request {
  return new Request('https://cejel-mcp.vercel.app/api/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'scan', arguments: { files, format } },
    }),
  });
}

interface ScanEnvelope {
  status: 'success' | 'error';
  error?: string;
  report?: { repo?: { headSha?: string } };
}

async function scan(
  files: readonly { path: string; content: string }[],
  format: 'summary' | 'json' = 'summary',
): Promise<{ envelope: ScanEnvelope; text: string }> {
  const response = await handleCejelHttpRequest(scanRequest(files, format), TEST_IDENTITY);
  expect(response.status).toBe(200);
  const text = await response.text();
  const body = JSON.parse(text) as { result?: { structuredContent?: ScanEnvelope } };
  const envelope = body.result?.structuredContent;
  if (!envelope) throw new Error(`scan returned no structured content: ${text}`);
  return { envelope, text };
}

const SOURCE_FILE = { path: 'src/index.ts', content: 'export const value = 42;\n' };

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('HTTP uploads refuse Git control metadata', () => {
  it.each([
    ['a .git directory with HEAD', [{ path: '.git/HEAD', content: 'ref: refs/heads/main\n' }]],
    ['a .git file naming another gitdir', [{ path: '.git', content: 'gitdir: /elsewhere/.git\n' }]],
    ['a nested, differently cased .GIT segment', [{ path: 'sub/.GIT/config', content: '[core]\n' }]],
  ])('refuses %s', async (_label, gitFiles) => {
    const { envelope, text } = await scan([SOURCE_FILE, ...gitFiles]);

    expect(envelope.status).toBe('error');
    expect(envelope.error).toMatch(/\.git segment/);
    // The refusal names the rule; it does not echo the uploaded content.
    for (const file of gitFiles) expect(text).not.toContain(file.content.trim());
  });

  it('discloses nothing from a host repository that an uploaded .git file names', async () => {
    const outer = outerRepository();
    const { envelope, text } = await scan(
      [SOURCE_FILE, { path: '.git', content: `gitdir: ${join(outer.root, '.git')}\n` }],
      'json',
    );

    expect.soft(envelope.status).toBe('error');
    expect.soft(text).not.toContain(outer.headSha);
    expect.soft(text).not.toContain(OUTER_MARKER_FILE);
  });

  it('accepts ordinary files whose names merely start with .git', async () => {
    const { envelope } = await scan([
      SOURCE_FILE,
      { path: '.gitignore', content: 'node_modules/\n' },
      { path: '.github/workflows/x.yml', content: 'name: x\non: push\njobs: {}\n' },
    ]);

    expect(envelope.error).toBeUndefined();
    expect(envelope.status).toBe('success');
  });
});

describe('HTTP snapshot scans cannot discover a repository outside the snapshot', () => {
  it('reports no commit or tracked file from a repository enclosing the snapshot directory', async () => {
    const outer = outerRepository();
    const snapshotParent = join(outer.root, 'tmp');
    mkdirSync(snapshotParent);
    const previous = TEMPORARY_DIRECTORY_VARIABLES.map((key) => [key, process.env[key]] as const);
    for (const key of TEMPORARY_DIRECTORY_VARIABLES) process.env[key] = snapshotParent;
    let result: { envelope: ScanEnvelope; text: string };
    try {
      expect(tmpdir()).toBe(snapshotParent);
      result = await scan(
        [SOURCE_FILE, { path: 'package.json', content: '{"name":"upload","version":"1.0.0"}\n' }],
        'json',
      );
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(result.envelope.status).toBe('success');
    // Soft, so a run against unconfined discovery reports every leak, not only the first.
    expect.soft(result.envelope.report?.repo?.headSha).toBeUndefined();
    expect.soft(result.text).not.toContain(outer.headSha);
    expect.soft(result.text).not.toContain(OUTER_MARKER_FILE);
  });

  it('leaves CLI discovery of an enclosing repository unchanged for a subdirectory scan', async () => {
    const outer = outerRepository();
    const snapshotParent = join(outer.root, 'tmp');
    mkdirSync(snapshotParent);
    const previous = TEMPORARY_DIRECTORY_VARIABLES.map((key) => [key, process.env[key]] as const);
    for (const key of TEMPORARY_DIRECTORY_VARIABLES) process.env[key] = snapshotParent;
    try {
      // A confined HTTP scan first, so a confinement that outlived its request would show here.
      await scan([SOURCE_FILE]);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    const { report } = runCejelScan({ repoPath: join(outer.root, 'sub') });
    expect(report.repo.headSha).toBe(outer.headSha);
  });
});
