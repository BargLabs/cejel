import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS } from '../behaviour-fingerprint.js';

// A GUARD THAT CAN BE SILENCED BY EDITING ONE LINE IS NOT A GUARD.
//
// rubric-behaviour-fingerprint.test.ts fails when a rubric's digest moves. Its failure message
// says the resolution is a RUBRIC_CHANGELOG.md entry. Nothing in that file makes anyone write
// one: the cheapest way to green is to paste the observed digest over the pinned one and move on.
// That is precisely how the 0.4.9 miss happened — not through malice, through the path of least
// resistance being open.
//
// This closes it. Every pinned digest must appear verbatim in leaderboard/RUBRIC_CHANGELOG.md.
// The digest is not guessable in advance, so writing it into the changelog can only happen AFTER
// the new value exists, which means the person re-pinning has the changelog open. Whether the
// prose they write there is honest is not mechanically checkable and this does not pretend to
// check it; what is checkable — and now enforced — is that the public record names the exact
// behaviour identity the tool is shipping.
describe('every pinned rubric behaviour fingerprint is recorded in the public changelog', () => {
  const changelog = readFileSync(
    new URL('../../../leaderboard/RUBRIC_CHANGELOG.md', import.meta.url),
    'utf8',
  );

  for (const [rubric, pin] of Object.entries(WITAN_RUBRIC_BEHAVIOUR_FINGERPRINTS)) {
    it(`${rubric}: its digest appears verbatim in leaderboard/RUBRIC_CHANGELOG.md`, () => {
      expect(
        changelog.includes(pin.digest),
        [
          '',
          `The pinned behaviour fingerprint for ${rubric} is not in leaderboard/RUBRIC_CHANGELOG.md.`,
          `  Digest: ${pin.digest}`,
          '',
          'A fingerprint may not move without a public record of why it moved. Add the entry —',
          'either the scoring delta across the published corpus, or an explicit statement that the',
          'corpus or projection changed and scoring did not — and put this digest in it. Do not',
          'delete this test, and do not paste the digest into the changelog without the entry: the',
          'changelog is the artifact whose whole purpose is that a score never changes silently.',
          '',
        ].join('\n'),
      ).toBe(true);
    });
  }
});
