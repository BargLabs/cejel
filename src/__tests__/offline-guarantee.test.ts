import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Static regression guard for the "fully offline / no network calls" constraint
// (goal_witan_free_cli_badge_2026-07-05): production source gets exactly one local-process
// chokepoint, and no production file may import a network primitive. This cannot prove that an
// arbitrary executable is network-inert; the release-time network-denied smoke test exercises
// that stronger runtime property. It does make new subprocess and direct-network escape hatches
// fail closed in CI without requiring this list to anticipate each future call site.
const SUBPROCESS_PATTERNS = [
  /['"]node:child_process['"]/,
  /\bexecFileSync\s*\(/,
  /\bexecSync\s*\(/,
  /\bspawnSync\s*\(/,
  /\bspawn\s*\(/,
  /(?<!\.)\bexec\s*\(/,
];

const NETWORK_PATTERNS = [
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

const FORBIDDEN_PATTERNS = [...SUBPROCESS_PATTERNS, ...NETWORK_PATTERNS];

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name === '__tests__') return [];
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('witan CLI offline guarantee', () => {
  it('allows subprocess access only through src/witan/git-exec.ts', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = collectSourceFiles(srcDir);
    const allowedSubprocessFile = join(srcDir, 'witan', 'git-exec.ts');
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (file === allowedSubprocessFile && SUBPROCESS_PATTERNS.includes(pattern)) continue;
        expect(contents, `${file} matched forbidden offline primitive ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }

    const childProcessImports = files.filter((file) =>
      /['"]node:child_process['"]/.test(readFileSync(file, 'utf8')),
    );
    expect(childProcessImports).toEqual([allowedSubprocessFile]);
  });

  it('keeps the subprocess chokepoint free of direct network primitives', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const allowedSubprocessFile = join(srcDir, 'witan', 'git-exec.ts');
    const contents = readFileSync(allowedSubprocessFile, 'utf8');
    for (const pattern of NETWORK_PATTERNS) {
      expect(
        contents,
        `${allowedSubprocessFile} matched forbidden offline primitive ${pattern}`,
      ).not.toMatch(pattern);
    }
  });
});
