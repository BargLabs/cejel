import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runCejelScan } from '../../scan.js';
import { execGit } from '../git-exec.js';

const temporaryDirectories: string[] = [];

function git(repoPath: string, argv: readonly string[], input?: string): string {
  return execFileSync('git', argv, {
    cwd: repoPath,
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
  }).trim();
}

function fixtureRepo(prefix: string): string {
  const repoPath = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(repoPath);
  git(repoPath, ['init', '--quiet']);
  git(repoPath, ['config', 'user.name', 'Cejel Test']);
  git(repoPath, ['config', 'user.email', 'cejel@example.invalid']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const value = 42;\n');
  writeFileSync(
    join(repoPath, 'package.json'),
    '{"name":"git-hardening-fixture","version":"1.0.0"}\n',
  );
  return repoPath;
}

function markerProgram(repoPath: string, markerPath: string): string {
  if (process.platform === 'win32') {
    const programPath = join(repoPath, 'gpg-marker.cmd');
    writeFileSync(programPath, `@echo off\r\ntype nul > "${markerPath}"\r\nexit /b 1\r\n`);
    return programPath;
  }
  const programPath = join(repoPath, 'gpg-marker.mjs');
  writeFileSync(
    programPath,
    `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(markerPath)}, 'executed\\n');\nprocess.exit(1);\n`,
  );
  chmodSync(programPath, 0o755);
  return programPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Git configuration hardening integration', () => {
  it('does not let ambient GIT_ALLOW_PROTOCOL override the transport denylist', () => {
    const repoPath = fixtureRepo('cejel-allow-protocol-');
    const remotePath = mkdtempSync(join(tmpdir(), 'cejel-file-remote-'));
    temporaryDirectories.push(remotePath);
    git(remotePath, ['init', '--bare', '--quiet']);
    const previous = process.env.GIT_ALLOW_PROTOCOL;
    process.env.GIT_ALLOW_PROTOCOL = 'file';
    try {
      expect(execGit(['ls-remote', `file://${remotePath}`], { cwd: repoPath }).ok).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_ALLOW_PROTOCOL;
      } else {
        process.env.GIT_ALLOW_PROTOCOL = previous;
      }
    }
  });

  it('classifies a plain directory correctly under a non-English parent locale', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cejel-locale-classification-'));
    temporaryDirectories.push(directory);
    const previousLang = process.env.LANG;
    const previousLcAll = process.env.LC_ALL;
    process.env.LANG = 'fr_FR.UTF-8';
    process.env.LC_ALL = 'fr_FR.UTF-8';
    try {
      expect(execGit(['rev-parse', 'HEAD'], { cwd: directory })).toMatchObject({
        ok: false,
        reason: 'not_a_repo',
      });
    } finally {
      if (previousLang === undefined) delete process.env.LANG;
      else process.env.LANG = previousLang;
      if (previousLcAll === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = previousLcAll;
    }
  });

  it('never executes a repository-configured signature verifier', () => {
    const repoPath = fixtureRepo('cejel-signature-hardening-');
    git(repoPath, ['add', '.']);
    const tree = git(repoPath, ['write-tree']);
    const identity = 'Cejel Test <cejel@example.invalid> 1785384000 +0000';
    const rawCommit = [
      `tree ${tree}`,
      `author ${identity}`,
      `committer ${identity}`,
      'gpgsig -----BEGIN PGP SIGNATURE-----',
      ' fake-signature-data',
      ' -----END PGP SIGNATURE-----',
      '',
      'signed fixture',
      '',
    ].join('\n');
    const commit = git(repoPath, ['hash-object', '-t', 'commit', '-w', '--stdin'], rawCommit);
    git(repoPath, ['update-ref', 'HEAD', commit]);

    const markerPath = join(repoPath, 'signature-verifier-executed');
    const programPath = markerProgram(repoPath, markerPath);
    git(repoPath, ['config', 'log.showSignature', 'true']);
    git(repoPath, ['config', 'gpg.program', programPath]);

    expect(() => runCejelScan({ repoPath })).not.toThrow();
    expect(existsSync(markerPath)).toBe(false);
  });

  it('continues with a declared limitation for a newline-bearing credential history path', () => {
    const repoPath = fixtureRepo('cejel-newline-history-');
    const credentialPath = join(repoPath, 'secret\narchive.txt');
    writeFileSync(credentialPath, 'api_key = "sk-fixture-not-a-real-secret"\n');
    git(repoPath, ['add', '.']);
    git(repoPath, ['commit', '--quiet', '-m', 'add credential-shaped path']);
    rmSync(credentialPath);
    git(repoPath, ['add', '-A']);
    git(repoPath, ['commit', '--quiet', '-m', 'remove credential-shaped path']);

    const { report } = runCejelScan({ repoPath });

    expect(report.scanLimitations).toEqual([
      expect.stringContaining('control characters'),
    ]);
  });
});
