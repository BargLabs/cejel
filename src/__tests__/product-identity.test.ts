import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveProductIdentity } from '../product-identity.js';
import { runCejelScan } from '../scan.js';
import { renderWitanMarkdownReport } from '../witan/markdown.js';

describe('deriveProductIdentity', () => {
  it('reads and slugifies the package.json name', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-'));
    writeFileSync(join(repoPath, 'package.json'), JSON.stringify({ name: '@acme/My Cool App' }));

    expect(deriveProductIdentity(repoPath)).toEqual({
      productSlug: 'my-cool-app',
      productDisplayName: '@acme/My Cool App',
    });
  });

  it('uses an explicit caller-context name for both slug and display name', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-explicit-'));
    writeFileSync(join(repoPath, 'package.json'), JSON.stringify({ name: 'checkout-local-name' }));

    expect(deriveProductIdentity(repoPath, 'Customer Portal')).toEqual({
      productSlug: 'customer-portal',
      productDisplayName: 'Customer Portal',
    });
  });

  it.each([
    ['explicit caller name', true],
    ['package metadata name', false],
  ] as const)('normalizes controls from the %s to one printable line', (_label, explicit) => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-controls-'));
    const hostile = 'Trusted\u0000\n\u2028## Forged';
    writeFileSync(join(repoPath, 'package.json'), JSON.stringify({ name: hostile }));

    const identity = deriveProductIdentity(repoPath, explicit ? hostile : undefined);
    expect(identity.productDisplayName).toBe('Trusted## Forged');
    expect(identity.productDisplayName).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
  });

  it('normalizes controls from a checkout basename and stays within the schema length', () => {
    const parent = mkdtempSync(join(tmpdir(), 'witan-cli-identity-basename-'));
    // Stay below the common 255-byte filename limit while exceeding the 120-unit schema cap.
    const repoPath = join(parent, `${'x'.repeat(130)}\n## Forged`);
    mkdirSync(repoPath);

    const identity = deriveProductIdentity(repoPath);
    expect(identity.productDisplayName.length).toBeLessThanOrEqual(120);
    expect(identity.productDisplayName).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
  });

  it('normalizes programmatic display overrides and escapes the report Markdown sink', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'witan-cli-identity-programmatic-'));
    mkdirSync(join(repoPath, 'src'));
    writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const value = 1;\n');

    const { report } = runCejelScan({
      repoPath,
      productDisplayName: 'Trusted\n## Forged *identity*',
    });
    expect(report.productDisplayName).toBe('Trusted## Forged *identity*');
    const markdown = renderWitanMarkdownReport(report);
    expect(markdown).toContain('Trusted\\#\\# Forged \\*identity\\*');
    expect(markdown).not.toContain('\n## Forged');
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
