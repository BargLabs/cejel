import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Cejel's configured delivery path is in BargLabs/alfred, not this repository. Cejel currently
// has no local consumed or holding directory; adding one requires explicitly listing it here.
const CONFIGURED_LOCAL_LESSON_DIRECTORIES: string[] = [];

function isLessonShaped(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return (
    Array.isArray(parsed) &&
    parsed.some(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        'statement' in entry &&
        typeof entry.statement === 'string' &&
        'scope' in entry &&
        Array.isArray(entry.scope) &&
        'tags' in entry &&
        Array.isArray(entry.tags) &&
        'anchors' in entry &&
        Array.isArray(entry.anchors) &&
        'lastSeenAt' in entry &&
        typeof entry.lastSeenAt === 'string',
    )
  );
}

function firstCommitDate(repoRoot: string, file: string): string {
  const firstCommit = execFileSync(
    'git',
    ['log', '--follow', '--format=%cI', '--', file],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!firstCommit) {
    throw new Error(`maeve_lesson_first_commit_unresolved: file=${file}`);
  }
  return firstCommit.slice(0, 10);
}

describe('Maeve lesson delivery', () => {
  it('keeps full Git history available to the first-commit-date guard in CI', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('fetch-depth: 0');
  });

  it('has no tracked lesson-shaped JSON in an unconfigured local directory', () => {
    const repoRoot = resolve(process.cwd());
    const trackedJsonFiles = execFileSync('git', ['ls-files', '-z', '--', '*.json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter((file) => existsSync(resolve(repoRoot, file)));
    const undelivered = trackedJsonFiles
      .filter((file) => !CONFIGURED_LOCAL_LESSON_DIRECTORIES.includes(dirname(file)))
      .filter((file) => isLessonShaped(readFileSync(resolve(repoRoot, file), 'utf8')));
    const directories = [...new Set(undelivered.map((file) => dirname(file)))].sort();

    expect(
      directories,
      directories
        .map((directory) => {
          const members = undelivered.filter((file) => dirname(file) === directory);
          const oldest = members.map((file) => firstCommitDate(repoRoot, file)).sort()[0];
          return `maeve_lesson_directory_undelivered: product=cejel directory=${directory} fileCount=${members.length} oldest=${oldest}`;
        })
        .join('\n'),
    ).toEqual([]);
  });
});
