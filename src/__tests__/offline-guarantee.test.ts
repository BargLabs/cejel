import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Static regression guard for the "fully offline / no network calls" constraint
// (goal_witan_free_cli_badge_2026-07-05): the free CLI must never import a network
// primitive. This can't catch every possible workaround, but it catches the obvious
// ones cheaply, the same way the on-prem air-gap CI smoke test greps cert.html for
// external URLs instead of only trusting a design doc.
const FORBIDDEN_PATTERNS = [
  /\bfetch\s*\(/,
  /require\(['"]node:https?['"]\)/,
  /from ['"]node:https?['"]/,
  /\bXMLHttpRequest\b/,
  /\bnet\.connect\b/,
];

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
  it('contains no network-call primitives in its source', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = collectSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(contents, `${file} matched forbidden network pattern ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });
});
