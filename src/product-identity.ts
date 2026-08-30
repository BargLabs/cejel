import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { MAX_REPOSITORY_CONTENT_BYTES } from './filesystem-limits.js';
import { sanitizePresentationLine } from './presentation-safety.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const FALLBACK_SLUG = 'repo';
const FALLBACK_DISPLAY_NAME = 'Repository';

export interface ProductIdentity {
  productSlug: string;
  productDisplayName: string;
}

/**
 * Product identity is caller context, not scored repository evidence. An explicit name makes
 * reports portable across checkout directory names; the zero-config compatibility path reads the
 * repo's package.json name, then falls back to the directory name.
 */
export function deriveProductIdentity(repoPath: string, productName?: string): ProductIdentity {
  const packageJsonPath = join(repoPath, 'package.json');
  const raw = productName ?? readPackageName(packageJsonPath) ?? basename(repoPath);
  const displayName = sanitizePresentationLine(raw, {
    fallback: FALLBACK_DISPLAY_NAME,
    maxLength: 120,
  });
  return {
    productSlug: slugify(raw),
    productDisplayName: displayName,
  };
}

function readPackageName(packageJsonPath: string): string | undefined {
  if (!existsSync(packageJsonPath)) return undefined;
  try {
    const stat = lstatSync(packageJsonPath);
    if (!stat.isFile() || stat.size > MAX_REPOSITORY_CONTENT_BYTES) return undefined;
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
