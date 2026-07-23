import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalize,
  hashManifest,
  hashRepositoryEntry,
  resolveRepository,
  validateReviewers,
} from './freeze-cohorts.mjs';

test('canonicalize sorts object keys recursively without sorting arrays', () => {
  assert.equal(
    canonicalize({ z: 1, a: { d: true, b: ['z', 'a'] } }),
    '{"a":{"b":["z","a"],"d":true},"z":1}',
  );
});

test('entry hash excludes only entry_sha256', () => {
  const entry = { repository_id: 'owner/repo', commit_sha: 'a'.repeat(40) };
  const hash = hashRepositoryEntry(entry);
  assert.equal(hash.length, 64);
  assert.equal(hashRepositoryEntry({ ...entry, entry_sha256: 'f'.repeat(64) }), hash);
  assert.notEqual(hashRepositoryEntry({ ...entry, commit_sha: 'b'.repeat(40) }), hash);
});

test('manifest hash excludes its hash and attestation', () => {
  const manifest = { cohort: 'golden', repositories: [] };
  const hash = hashManifest(manifest);
  assert.equal(hashManifest({
    ...manifest,
    manifest_sha256: 'f'.repeat(64),
    attestation: { method: 'internal_witness', reference: 'internal-witness:test' },
  }), hash);
});

test('freeze supports explicit human or independent AI dual review without conflating them', () => {
  assert.throws(() => validateReviewers(['Alice Smith', 'Bob Jones'], 'human', {}), /confirm-human-reviewers/);
  assert.throws(() => validateReviewers(['Alice Smith'], 'human', { confirmedHuman: true }), /exactly two/);
  assert.throws(() => validateReviewers(['Alice Smith', 'alice smith'], 'human', { confirmedHuman: true }), /distinct/);
  assert.throws(() => validateReviewers(['Codex Agent', 'Alice Smith'], 'human', { confirmedHuman: true }), /cannot be recorded/);
  assert.deepEqual(
    validateReviewers([' Alice Smith ', 'Bob Jones'], 'human', { confirmedHuman: true }),
    ['Alice Smith', 'Bob Jones'],
  );
  assert.throws(
    () => validateReviewers(['codex-review-a:test', 'codex-review-b:test'], 'independent-ai', {}),
    /confirm-independent-reviews/,
  );
  assert.throws(
    () => validateReviewers(['Alice Smith', 'codex-review-b:test'], 'independent-ai', { confirmedIndependent: true }),
    /explicitly identified/,
  );
  assert.deepEqual(
    validateReviewers(
      ['codex-review-a:test', 'codex-review-b:test'],
      'independent-ai',
      { confirmedIndependent: true },
    ),
    ['codex-review-a:test', 'codex-review-b:test'],
  );
});

test('repository resolution uses GitHub metadata, git branch commit, and commit tree', async () => {
  const commands = [];
  const runner = async (command, args) => {
    commands.push([command, args]);
    if (command === 'git') return `${'a'.repeat(40)}\trefs/heads/main`;
    if (args[1] === 'repos/owner/repo') {
      return JSON.stringify({
        full_name: 'owner/repo',
        default_branch: 'main',
        fork: false,
        archived: false,
        size: 1024,
        license: { spdx_id: 'MIT' },
      });
    }
    return JSON.stringify({ tree: { sha: 'b'.repeat(40) } });
  };
  const result = await resolveRepository({
    repository_id: 'owner/repo',
    url: 'https://github.com/owner/repo',
    primary_language: 'python',
    primary_surface: 'rag',
    provider_surface: 'openai',
    inclusion_reason: 'A sufficiently specific preregistered reason.',
  }, runner);
  assert.equal(result.commit_sha, 'a'.repeat(40));
  assert.equal(result.git_tree_sha, 'b'.repeat(40));
  assert.equal(result.license_spdx, 'MIT');
  assert.equal(result.entry_sha256.length, 64);
  assert.deepEqual(commands.map(([command]) => command), ['gh', 'git', 'gh']);
});

test('repository resolution rejects archived and oversized candidates before Git access', async () => {
  const candidate = {
    repository_id: 'owner/repo',
    url: 'https://github.com/owner/repo',
    primary_language: 'python',
    primary_surface: 'rag',
    provider_surface: 'openai',
    inclusion_reason: 'A sufficiently specific preregistered reason.',
  };
  await assert.rejects(
    () => resolveRepository(candidate, async () => JSON.stringify({
      full_name: 'owner/repo', default_branch: 'main', fork: false, archived: true, size: 10,
    })),
    /archived/,
  );
  await assert.rejects(
    () => resolveRepository(candidate, async () => JSON.stringify({
      full_name: 'owner/repo', default_branch: 'main', fork: false, archived: false, size: 5 * 1024 * 1024,
    })),
    /4 GiB/,
  );
});
