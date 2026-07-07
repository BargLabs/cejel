import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveProductIdentity } from '../product-identity.js';

describe('deriveProductIdentity', () => {
  it('reads and slugifies the package.json name', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-'));
    writeFileSync(join(repoPath, 'package.json'), JSON.stringify({ name: '@acme/My Cool App' }));

    expect(deriveProductIdentity(repoPath)).toEqual({
      productSlug: 'my-cool-app',
      productDisplayName: '@acme/My Cool App',
    });
  });

  it('falls back to the directory name when there is no package.json', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-plain-repo-'));
    const identity = deriveProductIdentity(repoPath);
    expect(identity.productSlug).toMatch(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
    expect(identity.productDisplayName.length).toBeGreaterThan(0);
  });

  it('falls back gracefully for malformed package.json', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-bad-json-'));
    writeFileSync(join(repoPath, 'package.json'), '{not valid json');
    const identity = deriveProductIdentity(repoPath);
    expect(identity.productSlug).toMatch(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
  });

  it('pads single-character slugs to satisfy the minimum-length rubric constraint', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-short-'));
    writeFileSync(join(repoPath, 'package.json'), JSON.stringify({ name: 'x' }));
    expect(deriveProductIdentity(repoPath).productSlug).toBe('x-repo');
  });

  it('falls back to a safe default slug when the name sanitizes to nothing', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-empty-'));
    writeFileSync(join(repoPath, 'package.json'), JSON.stringify({ name: '@@@' }));
    expect(deriveProductIdentity(repoPath).productSlug).toBe('repo');
  });

  it('handles a nested subdirectory repo path', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-nested-'));
    const nested = join(repoPath, 'sub', 'dir');
    mkdirSync(nested, { recursive: true });
    const identity = deriveProductIdentity(nested);
    expect(identity.productSlug).toMatch(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
  });
});
