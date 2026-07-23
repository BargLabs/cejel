import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalize } from './freeze-cohorts.mjs';
import { findProhibitedPublicClaims } from './public-claims.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function verifyPublicSurfaces(
  policy,
  publicDocumentInventory,
  { repositoryRoot, fetchImpl = globalThis.fetch } = {},
) {
  if (!repositoryRoot || !policy || !Array.isArray(publicDocumentInventory)) {
    throw new Error('public-surface verification requires policy, inventory, and repository root');
  }
  const inventory = new Map(publicDocumentInventory.map((item) => [item.path, item.content_sha256]));
  const repositoryPaths = [];
  for (const path of policy.repository_paths || []) {
    const bytes = readFileSync(resolve(repositoryRoot, path));
    const digest = sha256(bytes);
    if (inventory.get(path) !== digest || findProhibitedPublicClaims(bytes.toString('utf8')).length > 0) {
      throw new Error(`${path}: committed public surface differs from its safe pre-result snapshot`);
    }
    repositoryPaths.push({ path, content_sha256: digest });
  }
  const externalSurfaces = [];
  for (const surface of policy.external_surfaces || []) {
    const response = await fetchImpl(surface.url, {
      redirect: 'follow',
      headers: { Accept: 'text/html, application/json;q=0.9, text/plain;q=0.8', 'User-Agent': 'Cejel-Calibration/1.0' },
    });
    if (!response.ok) throw new Error(`${surface.url}: public surface fetch failed with HTTP ${response.status}`);
    const content = await response.text();
    const prohibited = findProhibitedPublicClaims(content);
    if (prohibited.length > 0) {
      throw new Error(`${surface.url}: live public surface contains prohibited claim ${prohibited[0].claim_class}`);
    }
    externalSurfaces.push({ url: surface.url, content_sha256: sha256(Buffer.from(content, 'utf8')) });
  }
  return {
    policy_document_sha256: sha256(Buffer.from(canonicalize(policy), 'utf8')),
    repository_paths: repositoryPaths,
    external_surfaces: externalSurfaces,
  };
}
