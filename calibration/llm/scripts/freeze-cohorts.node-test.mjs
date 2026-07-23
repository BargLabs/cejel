import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalize,
  hashManifest,
  hashRepositoryEntry,
  resolveRepository,
  validateHumanReviewers,
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

test('freeze requires two distinct explicitly confirmed human reviewers', () => {
  assert.throws(() => validateHumanReviewers(['Alice Smith', 'Bob Jones'], false), /confirm-human-reviewers/);
  assert.throws(() => validateHumanReviewers(['Alice Smith'], true), /exactly two/);
  assert.throws(() => validateHumanReviewers(['Alice Smith', 'alice smith'], true), /distinct/);
  assert.throws(() => validateHumanReviewers(['Codex Agent', 'Alice Smith'], true), /cannot be recorded/);
  assert.deepEqual(
    validateHumanReviewers([' Alice Smith ', 'Bob Jones'], true),
    ['Alice Smith', 'Bob Jones'],
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
