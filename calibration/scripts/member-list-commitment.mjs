#!/usr/bin/env node
// Commit-then-reveal for calibration-frame MEMBERSHIP (not results — see
// calibration/llm/scripts/pre-result-commitment.mjs for that sibling scheme).
//
// At freeze time, a frame publishes only the SHA-256 digest of its canonicalized member
// list (see docs/calibration/hash-conventions.md for the rfc8785-sha256-v1 convention this
// reuses). At retirement, the frame publishes the member list itself next to that digest
// (see docs/calibration/free-core-v50/holdout-reveal-2026-08-18.md for the worked example).
// This module is track-agnostic: it operates on sha256Canonical() from the existing
// calibration/llm freeze machinery rather than reimplementing it, per
// docs/calibration/hash-conventions.md's "use the actual functions" rule.
//
// STATUS: not yet wired into any GitHub Actions workflow. It was deliberately NOT added to
// .github/workflows/llm-calibration.yml — that workflow's manifest shape (`repositories`,
// its own `hash_contract`/`manifest_sha256` fields) belongs to the calibration/llm track,
// which is intentionally public by design (see the leak-audit report, 2026-08-18) and
// already carries an equivalent self-commitment; retrofitting a differently-shaped check
// there would either no-op or break it. This module exists for the free-core-vNN track
// (v22 forward per the goal this was built from), which has no freeze/execution CI
// workflow yet (`docs/calibration/next-default-v22-2026-08-13-cycle-5/` is still empty) —
// wire this module's assertMemberListCommitmentPublished() into that workflow's freeze
// step, mirroring commitment_git_commit/commitment_github_comment_id, once it exists.

import { sha256Canonical } from '../llm/scripts/freeze-cohorts.mjs';

const HASH_CONTRACT =
  'rfc8785-sha256-v1; entry excludes entry_sha256; manifest excludes manifest_sha256';

/**
 * Matches the shape published in docs/calibration/free-core-v50/holdout-reveal-2026-08-18.md
 * (the precedent this module generalizes) — {schemaVersion, benchmarkId, hashContract,
 * memberCount, members}, manifest_sha256 always excluded from what gets hashed.
 * @param {{fullName: string, revision: string}[]} members
 * @param {string} benchmarkId
 * @returns {{schemaVersion: number, benchmarkId: string, hashContract: string, memberCount: number, members: {fullName: string, revision: string}[]}}
 */
export function buildCanonicalMemberList(members, benchmarkId) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new TypeError('member list must be a non-empty array');
  }
  if (typeof benchmarkId !== 'string' || !benchmarkId) {
    throw new TypeError('benchmarkId is required (identifies which frame this commits to)');
  }
  const seen = new Set();
  for (const entry of members) {
    if (!entry || typeof entry.fullName !== 'string' || !entry.fullName) {
      throw new TypeError(`member entry missing fullName: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.revision !== 'string' || !/^[0-9a-f]{40}$/.test(entry.revision)) {
      throw new TypeError(`member entry missing a 40-hex revision: ${entry.fullName}`);
    }
    if (seen.has(entry.fullName)) {
      throw new TypeError(`duplicate member fullName: ${entry.fullName}`);
    }
    seen.add(entry.fullName);
  }
  // Plain code-unit order, not localeCompare — see docs/calibration/hash-conventions.md
  // ("Array order is part of the commitment, and locale-dependent sorts break it").
  const ordered = [...members]
    .map((entry) => ({ fullName: entry.fullName, revision: entry.revision }))
    .sort((a, b) => (a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0));
  return {
    schemaVersion: 1,
    benchmarkId,
    hashContract: HASH_CONTRACT,
    memberCount: ordered.length,
    members: ordered,
  };
}

/**
 * The digest a frame publishes at freeze time, and that a retirement-reveal must match.
 * @param {{fullName: string, revision: string}[]} members
 * @param {string} benchmarkId
 * @returns {string} hex SHA-256, per docs/calibration/hash-conventions.md
 */
export function memberListCommitmentSha256(members, benchmarkId) {
  return sha256Canonical(buildCanonicalMemberList(members, benchmarkId));
}

/**
 * Fail-closed check for a freeze step: throws unless a member-list commitment has been
 * published (a digest, plus a GitHub comment anchoring it — mirroring the
 * pre_result_commitment / commitment_git_commit / commitment_github_comment_id pattern in
 * .github/workflows/llm-calibration.yml) and that digest matches the members being frozen.
 *
 * @param {{fullName: string, revision: string}[]} members
 * @param {string} benchmarkId
 * @param {{commitmentSha256: string, githubCommentId: string}} commitment
 */
export function assertMemberListCommitmentPublished(members, benchmarkId, commitment) {
  if (!commitment || !commitment.commitmentSha256) {
    throw new Error(
      'Freeze refused: no member_list_commitment_sha256 was supplied. Publish the digest ' +
        '(see docs/calibration/hash-conventions.md) before freezing this frame — a frame ' +
        'cannot go live without a committed, verifiable membership digest.',
    );
  }
  if (!commitment.githubCommentId) {
    throw new Error(
      'Freeze refused: no member_list_commitment_github_comment_id was supplied. The ' +
        'digest must be anchored via an immutable public GitHub comment (mirroring the ' +
        'existing pre-result-commitment pattern), not just a git-committed file, so its ' +
        'publication timestamp does not rest solely on a forgeable local git author-date.',
    );
  }
  const actual = memberListCommitmentSha256(members, benchmarkId);
  if (actual !== commitment.commitmentSha256) {
    throw new Error(
      `Freeze refused: member_list_commitment_sha256 mismatch. Declared ` +
        `${commitment.commitmentSha256}, computed ${actual} from the supplied member list. ` +
        'The published commitment does not match the frame actually being frozen.',
    );
  }
}

async function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--manifest') args.manifest = argv[++i];
    else if (flag === '--commitment-sha256') args.commitmentSha256 = argv[++i];
    else if (flag === '--github-comment-id') args.githubCommentId = argv[++i];
    else throw new Error(`unrecognized argument: ${flag}`);
  }
  if (!args.manifest) throw new Error('--manifest is required');
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
  const members = manifest.members || manifest.selected;
  if (!members) throw new Error('manifest has neither "members" nor "selected"');
  const benchmarkId = manifest.benchmarkId;
  if (!benchmarkId) throw new Error('manifest is missing "benchmarkId"');
  assertMemberListCommitmentPublished(members, benchmarkId, {
    commitmentSha256: args.commitmentSha256,
    githubCommentId: args.githubCommentId,
  });
  console.log(JSON.stringify({ status: 'commitment-verified', memberCount: members.length }));
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
