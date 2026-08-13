import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const registryPath = resolve(
  repositoryRoot,
  'docs/experiments/external-repository-exposure-registry-2026-08-10.json',
);

describe('external repository exposure registry', () => {
  it('is deterministic, normalized, unique, and conservatively includes known calibration repos', () => {
    execFileSync(
      process.execPath,
      [resolve(repositoryRoot, 'scripts/build-external-exposure-registry.mjs'), '--check'],
      { stdio: 'pipe' },
    );

    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      status: string;
      sources: Array<{ path: string; sha256: string; recordCount: number }>;
      identityCount: number;
      identities: string[];
    };
    expect(registry.status).toBe('conservative-prior-exposure-superset');
    expect(registry.sources).toHaveLength(6);
    expect(registry.identities).toContain('facebook/react');
    expect(registry.identities).toContain('django/django');
    expect(registry.identityCount).toBe(registry.identities.length);
    expect(new Set(registry.identities).size).toBe(registry.identities.length);
    expect(registry.identities).toEqual([...registry.identities].sort());
    expect(registry.identities.every((identity) => /^[^/]+\/[^/]+$/.test(identity))).toBe(true);
    expect(registry.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
    expect(registry.sources.every((source) => source.recordCount > 0)).toBe(true);
  });
});
