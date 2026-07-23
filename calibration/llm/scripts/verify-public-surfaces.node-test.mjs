import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyPublicSurfaces } from './verify-public-surfaces.mjs';

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

test('authenticates repository snapshots and fetches every live external surface', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-public-surface-'));
  writeFileSync(join(root, 'README.md'), 'Narrow static source checks only.');
  const policy = {
    repository_paths: ['README.md'],
    external_surfaces: [{ url: 'https://example.test/cejel' }],
  };
  const result = await verifyPublicSurfaces(
    policy,
    [{ path: 'README.md', content_sha256: sha('Narrow static source checks only.') }],
    {
      repositoryRoot: root,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'Observable signals only.' }),
    },
  );
  assert.equal(result.external_surfaces[0].content_sha256, sha('Observable signals only.'));
});

test('rejects substituted snapshots and prohibited claims on a live URL', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cejel-public-surface-'));
  writeFileSync(join(root, 'README.md'), 'Actual content');
  await assert.rejects(
    verifyPublicSurfaces(
      { repository_paths: ['README.md'], external_surfaces: [] },
      [{ path: 'README.md', content_sha256: sha('Substituted content') }],
      { repositoryRoot: root },
    ),
    /differs from its safe pre-result snapshot/,
  );
  await assert.rejects(
    verifyPublicSurfaces(
      { repository_paths: [], external_surfaces: [{ url: 'https://example.test/cejel' }] },
      [],
      {
        repositoryRoot: root,
        fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'Detects hallucinations.' }),
      },
    ),
    /live public surface contains prohibited claim/,
  );
});
