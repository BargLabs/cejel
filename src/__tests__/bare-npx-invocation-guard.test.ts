import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = join(__dirname, '..', '..');

// `npx @cejel/cejel` with no version spec can silently resolve a stale cached package
// (see the 0.4.3 stale-version incident: a first-time reviewer got a plausible-looking
// certificate from a cached 0.2.2 build with no error). Every public-facing invocation
// must pin `@latest` or an explicit version so npx cannot resolve silently.
const RUNNER_PREFIXES = ['npx', 'pnpm dlx', 'bunx'] as const;
const BARE_INVOCATION_PATTERN = new RegExp(
  `\\b(?:${RUNNER_PREFIXES.join('|')})\\s+@cejel/cejel(?!@)\\b`,
);

const SCANNED_EXTENSIONS = new Set(['.md', '.mdx', '.html', '.yml', '.yaml', '.txt']);

// Public documentation and site-copy surfaces: anything a first-time user could read and
// copy a command from. Source comments and CLI usage-syntax text (which never carries a
// version placeholder, e.g. `npx @cejel/cejel [path] [options]`) are intentionally excluded.
const SCANNED_ROOTS = ['README.md', 'docs', 'leaderboard', join('.github', 'ISSUE_TEMPLATE')];

function collectFiles(path: string): string[] {
  const stats = statSync(path);
  if (stats.isFile()) return [path];
  if (!stats.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function scannedTextFiles(): string[] {
  return SCANNED_ROOTS.flatMap((root) => collectFiles(join(REPOSITORY_ROOT, root)))
    .filter((file) => SCANNED_EXTENSIONS.has(`.${file.split('.').pop()}`))
    .sort();
}

describe('bare npx invocation guard', () => {
  const files = scannedTextFiles();

  it('found at least one file to scan under every public surface', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [relative(REPOSITORY_ROOT, file).split(sep).join('/'), file]))(
    '%s has no bare npx/pnpm-dlx/bunx @cejel/cejel invocation',
    (_repoPath, file) => {
      const contents = readFileSync(file, 'utf8');
      const match = contents.match(BARE_INVOCATION_PATTERN);
      expect(match).toBeNull();
    },
  );
});
