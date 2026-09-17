import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseIssuerRevocations,
  verifyRevocationsAppendOnly,
} from '../witan/issuance.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVOCATIONS_PATH = join(REPO_ROOT, 'docs', 'security', 'issuer-revocations');

// The pinned baseline. `docs/security/issuer-revocations` is append-only: a withdrawal that could
// be quietly reversed is not a withdrawal, so every line below — the header included, since it
// carries the reading instructions — must still be present, unchanged, and in the same order.
//
// APPENDING a revocation is allowed and does not require touching this constant. EDITING or
// REMOVING one of the lines below fails this test, and the fix is to put the line back, not to
// update the constant. The constant is extended only when the header itself is deliberately
// rewritten, which is a review decision about the reading instructions, not a revocation.
const PINNED_BASELINE = `# Withdrawn Cejel issuances. One line per withdrawal:
#
#   <report-sha256> <YYYY-MM-DD> <one sentence saying why>
#
# The digest is the sha256 of the exact report.json bytes the withdrawn issuance countersigned —
# the same value \`cejel verify\` prints and the same value the issuance carries as its report.json
# subject. \`cejel verify\` reports a listed digest as REVOKED and exits nonzero.
#
# APPEND-ONLY. A line here is never removed, edited, or reordered: a withdrawal that could be
# quietly reversed is not a withdrawal. Correcting a mistaken entry means appending a second line
# that says so, not deleting the first. This is enforced by
# src/__tests__/issuance-revocations-append-only.test.ts, which pins the exact bytes below.
#
# This file is EMPTY of entries, and it ships empty on purpose. The absence of revocations is a
# statement a reader can check, not an omission they have to infer. It ships in the npm package and
# in every release tarball, so the check needs no network call.
#
# ---- entries below this line ----
`;

describe('docs/security/issuer-revocations is append-only', () => {
  const shipped = readFileSync(REVOCATIONS_PATH, 'utf8');

  it('still contains every line of the pinned baseline, in order', () => {
    const verification = verifyRevocationsAppendOnly(PINNED_BASELINE, shipped);
    expect(verification.errors).toEqual([]);
    expect(verification.valid).toBe(true);
  });

  it('parses cleanly, so a malformed entry cannot read as zero revocations', () => {
    expect(() => parseIssuerRevocations(shipped)).not.toThrow();
  });

  // The empty file ships on purpose: absence of revocations is a statement, not an omission.
  it('ships with no entries, and says so', () => {
    expect(parseIssuerRevocations(shipped)).toEqual([]);
    expect(shipped).toContain('ships empty on purpose');
  });

  // The guard is exercised against the REAL shipped bytes, not only synthetic strings, so a
  // vacuous pass is not possible while the entry list is empty.
  it('fails when a line is removed from the shipped file', () => {
    const lines = shipped.split('\n').filter((line) => line.trim().length > 0);
    for (let index = 0; index < lines.length; index += 1) {
      const mutated = lines.filter((_, position) => position !== index).join('\n');
      const verification = verifyRevocationsAppendOnly(shipped, mutated);
      expect(verification.valid).toBe(false);
      expect(verification.errors.join(' ')).toContain('append-only');
    }
  });

  it('fails when a line of the shipped file is edited in place', () => {
    const mutated = shipped.replace('APPEND-ONLY.', 'Advisory only.');
    expect(mutated).not.toBe(shipped);
    expect(verifyRevocationsAppendOnly(shipped, mutated).valid).toBe(false);
  });

  it('accepts a future appended withdrawal', () => {
    const appended = `${shipped}${'a'.repeat(64)} 2026-10-01 The reviewed tree was not the pinned revision.\n`;
    expect(verifyRevocationsAppendOnly(shipped, appended).valid).toBe(true);
    expect(parseIssuerRevocations(appended)).toHaveLength(1);
  });
});
