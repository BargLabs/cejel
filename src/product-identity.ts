import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const FALLBACK_SLUG = 'repo';
const FALLBACK_DISPLAY_NAME = 'Repository';

export interface ProductIdentity {
  productSlug: string;
  productDisplayName: string;
}

/** Zero-config identity: read the repo's package.json name, else fall back to the directory name. */
export function deriveProductIdentity(repoPath: string): ProductIdentity {
  const packageJsonPath = join(repoPath, 'package.json');
  const raw = readPackageName(packageJsonPath) ?? basename(repoPath);
  const displayName = raw.trim().length > 0 ? raw.trim() : FALLBACK_DISPLAY_NAME;
  return {
    productSlug: slugify(raw),
    productDisplayName: displayName,
  };
}

function readPackageName(packageJsonPath: string): string | undefined {
  if (!existsSync(packageJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
      const name = (parsed as { name: unknown }).name;
      if (typeof name === 'string' && name.trim().length > 0) return name;
    }
  } catch {
    // Malformed package.json — fall back to the directory name.
  }
  return undefined;
}

function slugify(raw: string): string {
  const withoutScope = raw.replace(/^@[^/]+\//, '');
  const cleaned = withoutScope
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (SLUG_PATTERN.test(cleaned)) return cleaned;
  if (cleaned.length === 1) return `${cleaned}-${FALLBACK_SLUG}`;
  return FALLBACK_SLUG;
}
