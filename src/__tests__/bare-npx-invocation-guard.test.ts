import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = join(__dirname, '..', '..');

// `npx @cejel/cejel` with no version spec can silently resolve a stale cached package (see
// the 0.4.3 stale-version incident: a first-time reviewer got a plausible-looking certificate
// from a cached 0.2.2 build with no error). The same npm-resolution behavior bit a *different*
// tool later: the OpenClaw MCP install instructions ran a bare `openclaw`, and on Node 22.15.0
// npm's engines-aware resolution silently served a release that predated the documented
// `mcp add`/`mcp doctor` subcommands entirely, failing with a confusing `error: unknown
// option` instead of a version message. Neither incident is `@cejel/cejel`-specific — any
// npx/pnpm-dlx/bunx-resolved package in a public-facing instruction is exposed to it. This
// guard therefore checks every such package token, whichever tool it names, not just our own.
const RUNNER_PREFIXES = ['npx', 'pnpm dlx', 'bunx'] as const;
const RUNNER_ALTERNATION = RUNNER_PREFIXES.join('|');

// The package immediately named after a runner (optionally past -y/--yes flags), e.g. the
// `openclaw@latest` in `npx -y openclaw@latest mcp add ...`. A following token that itself
// starts with `-` is a flag, not a package name (most commonly `--package=`, handled below) --
// skip it here rather than misreading a flag as an unpinned package.
const DIRECT_INVOCATION_PATTERN = new RegExp(
  `\\b(?:${RUNNER_ALTERNATION})\\b((?:\\s+(?:-y|--yes))*)\\s+([^\\s'"]+)`,
  'g',
);

// npx's own `--package=<spec>` flag names a package independently of the runner's adjacent
// token -- including when that flag is itself assembled as an argument to a *different* CLI
// (e.g. OpenClaw's `--arg --package=@cejel/cejel@latest`, several tokens away from the `npx`
// it configures). Matching the flag directly, wherever it appears, catches that composed case
// without needing to parse the outer CLI's argument grammar.
const PACKAGE_FLAG_PATTERN = /--package=([^\s'",]+)/g;

function isPinnedSpec(spec: string): boolean {
  // Scoped package (`@scope/name`): the leading `@` is the scope marker, not a version pin --
  // only an `@` after it (`@scope/name@version`) counts.
  if (spec.startsWith('@')) return spec.slice(1).includes('@');
  return spec.includes('@');
}

function findUnpinnedInvocations(contents: string): string[] {
  const violations = new Set<string>();

  for (const match of contents.matchAll(DIRECT_INVOCATION_PATTERN)) {
    const spec = match[2];
    if (!spec || spec.startsWith('-')) continue; // a flag (e.g. --package=...), not a package name
    if (!isPinnedSpec(spec)) violations.add(match[0].trim());
  }

  for (const match of contents.matchAll(PACKAGE_FLAG_PATTERN)) {
    const spec = match[1];
    if (!spec) continue;
    if (!isPinnedSpec(spec)) violations.add(match[0]);
  }

  return [...violations].sort();
}

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
  describe('findUnpinnedInvocations', () => {
    it('flags a bare runner target with no version at all', () => {
      expect(findUnpinnedInvocations('npx openclaw mcp add cejel')).toEqual(['npx openclaw']);
    });

    it('flags an unpinned scoped package after -y/--yes', () => {
      expect(findUnpinnedInvocations('npx -y @smithery/cli mcp search cejel')).toEqual([
        'npx -y @smithery/cli',
      ]);
    });

    it('flags an unpinned --package= flag regardless of which tool assembled it', () => {
      expect(
        findUnpinnedInvocations(
          'openclaw mcp add cejel --command npx --arg -y --arg --package=@cejel/cejel --arg cejel-mcp',
        ),
      ).toEqual(['--package=@cejel/cejel']);
    });

    it('accepts a pinned direct invocation, a pinned scoped package, and a pinned --package= flag', () => {
      expect(findUnpinnedInvocations('npx @cejel/cejel@latest .')).toEqual([]);
      expect(findUnpinnedInvocations('npx -y @smithery/cli@latest mcp search cejel')).toEqual([]);
      expect(
        findUnpinnedInvocations(
          'npx -y openclaw@latest mcp add cejel --command npx --arg -y --arg --package=@cejel/cejel@latest --arg cejel-mcp',
        ),
      ).toEqual([]);
    });

    it('does not mistake a following flag for a package name', () => {
      expect(findUnpinnedInvocations('npx --yes --package=@cejel/cejel@latest cejel-mcp')).toEqual(
        [],
      );
    });
  });

  const files = scannedTextFiles();

  it('found at least one file to scan under every public surface', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [relative(REPOSITORY_ROOT, file).split(sep).join('/'), file]))(
    '%s has no unpinned npx/pnpm-dlx/bunx package invocation',
    (_repoPath, file) => {
      const contents = readFileSync(file, 'utf8');
      expect(findUnpinnedInvocations(contents)).toEqual([]);
    },
  );
});
