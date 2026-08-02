import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * docs/standing-constraints.md is a byte-identical copy of the same file in the alfred
 * repository. A cross-repo test cannot read the sibling copy, so each repo pins the hash
 * instead: editing the constraints requires updating this pin AND the one in alfred, which
 * is what forces the copy to travel.
 *
 * If this fails, do not just update the hash. Copy the file to the other repo and update
 * both pins, then bump CONSTRAINTS-VERSION.
 */
const PINNED_SHA256 = '217b75b8e3aa065ab7031ef4aaa041d2473fe9312633828299d5b345f38c3dd5';

describe('standing constraints', () => {
  const path = join(__dirname, '..', '..', 'docs', 'standing-constraints.md');
  const raw = readFileSync(path);

  it('matches the pinned hash shared with the alfred copy', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(PINNED_SHA256);
  });

  it('carries a CONSTRAINTS-VERSION line for agents to echo', () => {
    expect(raw.toString('utf8')).toMatch(/\*\*CONSTRAINTS-VERSION: \d{4}-\d{2}-\d{2}\.\d+\*\*/);
  });
});
