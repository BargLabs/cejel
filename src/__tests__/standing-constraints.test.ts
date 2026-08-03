import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * This pin proves only the bytes in this repository at this point in time. It does not
 * observe the Alfred repository. Cross-repository parity requires an explicit byte
 * comparison against the intended Alfred revision before this local pin is updated.
 */
const PINNED_SHA256 = 'ff25314980f2449616064d2e43e70edfc7f6012f2052b99eabfc5422c6c1ccf9';
const EXPECTED_VERSION = '**CONSTRAINTS-VERSION: 2026-08-01.2**';
const EXACT_LINK = '**[`docs/standing-constraints.md`](docs/standing-constraints.md)**';
const OBSERVABLE_HANDSHAKE =
  'This is an observable delivery handshake: omission flags non-delivery or non-compliance, ' +
  'but does not logically prove the whole file was unread.';
const LOCAL_PIN_BOUNDARY =
  'Each repository pins only its local file. This is a shared point-in-time parity record ' +
  'and local immutability guard; neither test proves current cross-repository byte equality.';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('standing constraints', () => {
  const repositoryRoot = join(__dirname, '..', '..');
  const docsDirectory = join(repositoryRoot, 'docs');
  const path = join(docsDirectory, 'standing-constraints.md');
  const raw = readFileSync(path);

  it('matches the local point-in-time byte pin', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(PINNED_SHA256);
  });

  it('carries the locally pinned constraints version', () => {
    expect(raw.toString('utf8')).toContain(EXPECTED_VERSION);
  });

  it('has exactly one canonical docs path, compared case-insensitively', () => {
    const candidates = readdirSync(docsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .filter((name) =>
        name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .startsWith('standingconstraints'),
      )
      .sort();

    expect(candidates).toEqual(['standing-constraints.md']);
  });

  it.each(['AGENTS.md', 'CLAUDE.md'])('%s names the exact link and evidence boundaries', (name) => {
    const entrypoint = readFileSync(join(repositoryRoot, name), 'utf8');
    const normalized = normalizeWhitespace(entrypoint);

    expect(entrypoint.split('\n')).toContain(EXACT_LINK);
    expect(normalized).toContain(OBSERVABLE_HANDSHAKE);
    expect(normalized).toContain(LOCAL_PIN_BOUNDARY);
  });
});
