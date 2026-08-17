import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = join(__dirname, '..', '..');
const DOCS_DIRECTORY = join(REPOSITORY_ROOT, 'docs');
const CONSTRAINTS_PATH = join(DOCS_DIRECTORY, 'standing-constraints.md');
const ENTRYPOINTS = ['AGENTS.md', 'CLAUDE.md'] as const;
const PINNED_SHA256 = 'b7dea9f8971af80de061369e988f94b5cd50962bdf4399dab3e6bc1b2dc31717';
const EXPECTED_VERSION = '**CONSTRAINTS-VERSION: 2026-08-01.4**';
const CONSTRAINTS_LINK = '[`docs/standing-constraints.md`](docs/standing-constraints.md)';
const HANDSHAKE_INSTRUCTION =
  '**Echo the exact `CONSTRAINTS-VERSION` line from that file in every report.** This is an observable delivery handshake: omission flags non-delivery or non-compliance, but does not logically prove the whole file was unread.';
const LOCAL_PIN_BOUNDARY =
  'Each repository pins only its local file. This is a shared point-in-time parity record and local immutability guard; neither test proves current cross-repository byte equality.';
const EXPLICIT_PARITY_CHECK =
  'Cross-repo parity must be checked explicitly on every change: compare both files, copy the canonical bytes, bump `CONSTRAINTS-VERSION`, and update both local pins.';
const LOCAL_PIN_INSTRUCTION =
  'The current local SHA-256 pin is `b7dea9f8971af80de061369e988f94b5cd50962bdf4399dab3e6bc1b2dc31717`.';
const HISTORICAL_REVERIFY_INSTRUCTION =
  'Historical counts and open-item labels must be mechanically reverified against current repository state before action.';

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').trim();
}

describe('standing constraints', () => {
  const raw = readFileSync(CONSTRAINTS_PATH);

  it('matches the local point-in-time byte pin', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(PINNED_SHA256);
  });

  it('carries the exact locally pinned constraints version', () => {
    const constraints = raw.toString('utf8');

    expect(constraints).toContain(EXPECTED_VERSION);
    expect(constraints).toContain('## Open at the close of this session — historical snapshot');
    expect(normalized(CONSTRAINTS_PATH)).toContain(HISTORICAL_REVERIFY_INSTRUCTION);
    expect(constraints).not.toContain('A test asserts byte-equality');
    expect(constraints).not.toContain('or CI fails');
  });

  it('has exactly one canonical docs path, compared case-insensitively', () => {
    const variants = readdirSync(DOCS_DIRECTORY)
      .filter((file) => {
        const normalizedName = file.toLowerCase().replaceAll('_', '-');
        return /^standing-constraints(?:-\d{4}-\d{2}-\d{2})?\.md$/.test(normalizedName);
      })
      .sort();

    expect(variants).toEqual(['standing-constraints.md']);
  });

  it.each(ENTRYPOINTS)('%s links the canonical file and carries the evidence boundaries', (file) => {
    const entrypoint = normalized(join(REPOSITORY_ROOT, file));

    expect(entrypoint).toContain(CONSTRAINTS_LINK);
    expect(entrypoint).toContain(HANDSHAKE_INSTRUCTION);
    expect(entrypoint).toContain(LOCAL_PIN_BOUNDARY);
    expect(entrypoint).toContain(LOCAL_PIN_INSTRUCTION);
    expect(entrypoint).toContain(EXPLICIT_PARITY_CHECK);
    expect(entrypoint).toContain(
      'historical snapshot written at the close of the 2026-08-01 session',
    );
    expect(entrypoint).toContain(HISTORICAL_REVERIFY_INSTRUCTION);
  });
});
