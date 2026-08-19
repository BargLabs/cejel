import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMemberListCommitmentPublished,
  buildCanonicalMemberList,
  memberListCommitmentSha256,
} from './member-list-commitment.mjs';

const members = [
  { fullName: 'zeta/one', revision: 'a'.repeat(40) },
  { fullName: 'alpha/two', revision: 'b'.repeat(40) },
];

test('buildCanonicalMemberList sorts by fullName using plain code-unit order', () => {
  const canonical = buildCanonicalMemberList(members, 'frame-x');
  assert.deepEqual(
    canonical.members.map((m) => m.fullName),
    ['alpha/two', 'zeta/one'],
  );
  assert.equal(canonical.memberCount, 2);
  assert.equal(canonical.benchmarkId, 'frame-x');
});

test('buildCanonicalMemberList rejects malformed entries', () => {
  assert.throws(() => buildCanonicalMemberList([], 'frame-x'), /non-empty array/);
  assert.throws(() => buildCanonicalMemberList(members, ''), /benchmarkId is required/);
  assert.throws(
    () => buildCanonicalMemberList([{ fullName: 'a/b', revision: 'not-hex' }], 'frame-x'),
    /40-hex revision/,
  );
  assert.throws(
    () => buildCanonicalMemberList([{ revision: 'a'.repeat(40) }], 'frame-x'),
    /missing fullName/,
  );
  const dup = [
    { fullName: 'a/b', revision: 'a'.repeat(40) },
    { fullName: 'a/b', revision: 'b'.repeat(40) },
  ];
  assert.throws(() => buildCanonicalMemberList(dup, 'frame-x'), /duplicate member fullName/);
});

test('memberListCommitmentSha256 is deterministic and order-independent on input', () => {
  const shuffled = [members[1], members[0]];
  assert.equal(
    memberListCommitmentSha256(members, 'frame-x'),
    memberListCommitmentSha256(shuffled, 'frame-x'),
  );
  assert.notEqual(
    memberListCommitmentSha256(members, 'frame-x'),
    memberListCommitmentSha256(members, 'frame-y'),
  );
});

test('assertMemberListCommitmentPublished refuses a missing digest', () => {
  assert.throws(
    () => assertMemberListCommitmentPublished(members, 'frame-x', {}),
    /no member_list_commitment_sha256 was supplied/,
  );
});

test('assertMemberListCommitmentPublished refuses a missing GitHub comment anchor', () => {
  const digest = memberListCommitmentSha256(members, 'frame-x');
  assert.throws(
    () =>
      assertMemberListCommitmentPublished(members, 'frame-x', { commitmentSha256: digest }),
    /no member_list_commitment_github_comment_id was supplied/,
  );
});

test('assertMemberListCommitmentPublished refuses a digest that does not match', () => {
  assert.throws(
    () =>
      assertMemberListCommitmentPublished(members, 'frame-x', {
        commitmentSha256: 'f'.repeat(64),
        githubCommentId: 'https://github.com/x/y/issues/1#issuecomment-1',
      }),
    /member_list_commitment_sha256 mismatch/,
  );
});

test('assertMemberListCommitmentPublished passes for a matching, anchored digest', () => {
  const digest = memberListCommitmentSha256(members, 'frame-x');
  assert.doesNotThrow(() =>
    assertMemberListCommitmentPublished(members, 'frame-x', {
      commitmentSha256: digest,
      githubCommentId: 'https://github.com/x/y/issues/1#issuecomment-1',
    }),
  );
});

test('digest is a lowercase 64-hex SHA-256, matching the shape published for v17', () => {
  // Not a regression anchor against the real v17 digest — this file must not embed real
  // member data (that's what docs/calibration/free-core-v50/holdout-reveal-2026-08-18.md
  // is for). This only checks the output shape matches what was actually published there.
  const digest = memberListCommitmentSha256(
    [{ fullName: 'synthetic/fixture-entry', revision: 'c'.repeat(40) }],
    'synthetic-frame',
  );
  assert.match(digest, /^[0-9a-f]{64}$/);
});
