import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { runWitanFreeCli } from '../index.js';
import { writeOutputFileNoFollow } from '../output-files.js';

// A scanned checkout is untrusted input. It can commit `.cejel/report.json`, or `.cejel` itself,
// as a symlink to any file the user can write; a scan that follows the link overwrites that file
// with the report. Every case here plants a real symlink and checks the file it points at.

const SCAN_OUTPUTS = [
  'report.json',
  'attestation.json',
  'certificate.html',
  'badge.json',
  'badge.svg',
  'summary.json',
] as const;

const OUTSIDE_CONTENTS = 'outside the checkout; must survive the scan\n';

const temporaryDirectories: string[] = [];

function scratch(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function git(repoPath: string, argv: readonly string[]): void {
  execFileSync('git', argv, { cwd: repoPath, encoding: 'utf8' });
}

/** A committed checkout; `plant` adds the hostile entries before the commit. */
function checkout(plant: (repoPath: string) => void): string {
  const repoPath = scratch('cejel-symlink-checkout-');
  git(repoPath, ['init', '--quiet']);
  git(repoPath, ['config', 'user.name', 'Cejel Test']);
  git(repoPath, ['config', 'user.email', 'cejel@example.invalid']);
  git(repoPath, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const value = 42;\n');
  writeFileSync(
    join(repoPath, 'package.json'),
    '{"name":"symlink-fixture","version":"1.0.0"}\n',
  );
  plant(repoPath);
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '--quiet', '--no-gpg-sign', '-m', 'fixture']);
  return repoPath;
}

/** Runs the CLI from inside the checkout, as a user would, so the default `.cejel` applies. */
async function runInside(repoPath: string, args: readonly string[]): Promise<number> {
  const previous = process.cwd();
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.chdir(repoPath);
  try {
    return await runWitanFreeCli(args);
  } finally {
    process.chdir(previous);
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}

describe('scan output refuses a symlink planted in the scanned checkout', () => {
  it('refuses when the committed .cejel/report.json is a symlink to a file outside the checkout', async () => {
    const outside = scratch('cejel-symlink-outside-');
    const victim = join(outside, 'victim.txt');
    writeFileSync(victim, OUTSIDE_CONTENTS);
    const repoPath = checkout((repo) => {
      mkdirSync(join(repo, '.cejel'));
      symlinkSync(victim, join(repo, '.cejel', 'report.json'));
    });

    await expect(runInside(repoPath, ['scan', '--quiet'])).rejects.toThrow(
      /refusing to write scan output: .*\.cejel[/\\]report\.json is a symbolic link/,
    );

    expect(readFileSync(victim, 'utf8')).toBe(OUTSIDE_CONTENTS);
    expect(lstatSync(join(repoPath, '.cejel', 'report.json')).isSymbolicLink()).toBe(true);
    // Refused before the first write, not part-way through.
    expect(readdirSync(join(repoPath, '.cejel'))).toEqual(['report.json']);
  });

  it('refuses when the committed .cejel directory is a symlink to a directory outside the checkout', async () => {
    const outside = scratch('cejel-symlink-outside-dir-');
    const repoPath = checkout((repo) => {
      symlinkSync(outside, join(repo, '.cejel'));
    });

    await expect(runInside(repoPath, ['scan', '--quiet'])).rejects.toThrow(
      /refusing to write scan output: output directory .*\.cejel is a symbolic link/,
    );

    expect(readdirSync(outside)).toEqual([]);
  });

  // Ingest auto-discovery already refuses a symlinked <scanned path>/.cejel, which masks the case
  // above whenever the scanned path is the working directory. Scanning a subdirectory from the
  // checkout root separates the two: the output `.cejel` is the root's, which ingest never reads.
  it('refuses a symlinked .cejel at the checkout root when scanning a subdirectory of it', async () => {
    const outside = scratch('cejel-symlink-outside-subdir-');
    const repoPath = checkout((repo) => {
      mkdirSync(join(repo, 'packages', 'app'), { recursive: true });
      writeFileSync(join(repo, 'packages', 'app', 'index.ts'), 'export const app = 1;\n');
      symlinkSync(outside, join(repo, '.cejel'));
    });

    await expect(runInside(repoPath, ['scan', 'packages/app', '--quiet'])).rejects.toThrow(
      /refusing to write scan output: output directory \.cejel is a symbolic link/,
    );

    expect(readdirSync(outside)).toEqual([]);
  });

  it('refuses a dangling symlink at .cejel/summary.json rather than creating its target', async () => {
    const outside = scratch('cejel-symlink-dangling-');
    const target = join(outside, 'created-by-scan.json');
    const repoPath = checkout((repo) => {
      mkdirSync(join(repo, '.cejel'));
      symlinkSync(target, join(repo, '.cejel', 'summary.json'));
    });

    await expect(runInside(repoPath, ['scan', '--quiet'])).rejects.toThrow(
      /refusing to write scan output: .*\.cejel[/\\]summary\.json is a symbolic link/,
    );

    expect(existsSync(target)).toBe(false);
    expect(readdirSync(outside)).toEqual([]);
    // summary.json is the last file written; a refusal there must still leave nothing behind.
    expect(readdirSync(join(repoPath, '.cejel'))).toEqual(['summary.json']);
  });

  // lstat follows a symlink when the path ends in `/` or `/.`; an explicit --out in either form
  // must be refused like the bare name. Scanning a subdirectory keeps ingest's own .cejel check
  // out of the way, as in the case above.
  it.each(['.cejel/', '.cejel/.'])(
    'refuses a symlinked .cejel named with --out %s (trailing separator or dot)',
    async (outArg) => {
      const outside = scratch('cejel-symlink-trailing-');
      const repoPath = checkout((repo) => {
        mkdirSync(join(repo, 'packages', 'app'), { recursive: true });
        writeFileSync(join(repo, 'packages', 'app', 'index.ts'), 'export const app = 1;\n');
        symlinkSync(outside, join(repo, '.cejel'));
      });

      const refused = /refusing to write scan output: output directory \.cejel[/\\]\.? is a symbolic link/;
      await expect(
        runInside(repoPath, ['scan', 'packages/app', '--out', outArg, '--quiet']),
      ).rejects.toThrow(refused);

      expect(readdirSync(outside)).toEqual([]);
    },
  );

  it('applies the same rule to a directory named explicitly with --out', async () => {
    const outside = scratch('cejel-symlink-explicit-out-');
    const linkParent = scratch('cejel-symlink-explicit-link-');
    const outDir = join(linkParent, 'out');
    symlinkSync(outside, outDir);
    const repoPath = checkout(() => {});

    await expect(runInside(repoPath, ['scan', '--out', outDir, '--quiet'])).rejects.toThrow(
      /output directory .* is a symbolic link/,
    );
    expect(readdirSync(outside)).toEqual([]);
  });

  it('still overwrites ordinary files left in .cejel by an earlier scan', async () => {
    const repoPath = checkout(() => {});
    const outDir = join(repoPath, '.cejel');
    expect(await runInside(repoPath, ['scan', '--quiet'])).toBe(0);
    const first = new Map(
      SCAN_OUTPUTS.map((name) => [name, readFileSync(join(outDir, name), 'utf8')] as const),
    );
    writeFileSync(join(outDir, 'report.json'), 'stale\n');

    expect(await runInside(repoPath, ['scan', '--quiet'])).toBe(0);
    for (const name of SCAN_OUTPUTS) {
      if (name === 'attestation.json' || name === 'certificate.html') continue; // carry generatedAt
      expect(readFileSync(join(outDir, name), 'utf8')).toBe(first.get(name));
    }
  });
});

// The lstat checks catch every link present before the write; this is the layer underneath them,
// for a link planted between the check and the open. Windows has no O_NOFOLLOW.
describe.skipIf(process.platform === 'win32')('writeOutputFileNoFollow', () => {
  it('refuses at open time to follow a symlink, without consulting lstat first', () => {
    const outside = scratch('cejel-symlink-nofollow-outside-');
    const victim = join(outside, 'victim.txt');
    writeFileSync(victim, OUTSIDE_CONTENTS);
    const outDir = scratch('cejel-symlink-nofollow-out-');
    const link = join(outDir, 'report.json');
    symlinkSync(victim, link);

    expect(() => writeOutputFileNoFollow(link, 'report\n', 'scan output')).toThrow(
      /refusing to write scan output: .*report\.json is a symbolic link \(the open was refused/,
    );
    expect(readFileSync(victim, 'utf8')).toBe(OUTSIDE_CONTENTS);
  });
});

describe('export output refuses a symlink planted in the working directory', () => {
  it('refuses when gl-code-quality-report.json is a symlink to a file outside the checkout', async () => {
    const repoPath = checkout(() => {});
    const outDir = scratch('cejel-symlink-export-scan-');
    expect(await runInside(repoPath, ['scan', '--out', outDir, '--quiet'])).toBe(0);

    const outside = scratch('cejel-symlink-export-outside-');
    const victim = join(outside, 'victim.txt');
    writeFileSync(victim, OUTSIDE_CONTENTS);
    symlinkSync(victim, join(repoPath, 'gl-code-quality-report.json'));

    await expect(
      runInside(repoPath, ['export', 'gitlab-codequality', join(outDir, 'report.json')]),
    ).rejects.toThrow(
      /refusing to write export output: .*gl-code-quality-report\.json is a symbolic link/,
    );
    expect(readFileSync(victim, 'utf8')).toBe(OUTSIDE_CONTENTS);
  });
});

describe('issue output refuses a symlink in the output directory', () => {
  it('refuses when issuance.json beside the report is a symlink to a file outside it', async () => {
    const repoPath = checkout(() => {});
    const outDir = scratch('cejel-symlink-issue-out-');
    expect(await runInside(repoPath, ['scan', '--out', outDir, '--quiet'])).toBe(0);

    const keyDir = scratch('cejel-symlink-issue-key-');
    const keyPath = join(keyDir, 'issuer');
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', keyPath]);

    const outside = scratch('cejel-symlink-issue-outside-');
    const victim = join(outside, 'victim.txt');
    writeFileSync(victim, OUTSIDE_CONTENTS);
    symlinkSync(victim, join(outDir, 'issuance.json'));

    await expect(
      runInside(repoPath, [
        'issue',
        repoPath,
        '--report',
        join(outDir, 'report.json'),
        '--attestation',
        join(outDir, 'attestation.json'),
        '--key',
        `${keyPath}.pub`,
        '--engagement-ref',
        'ER-SYMLINK-0001',
      ]),
    ).rejects.toThrow(/refusing to write issuance output: .*issuance\.json is a symbolic link/);
    expect(readFileSync(victim, 'utf8')).toBe(OUTSIDE_CONTENTS);
  });
});
