#!/usr/bin/env -S pnpm exec tsx
// Regenerates docs/defect-class-census.md from src/census/defect-class-census.ts.
//
// Usage:
//   pnpm exec tsx scripts/derive-defect-class-census.ts            # write docs/defect-class-census.md
//   pnpm exec tsx scripts/derive-defect-class-census.ts --check    # exit nonzero if committed file is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderCensus } from '../src/census/defect-class-census.ts';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUTPUT_PATH = resolve(REPO_ROOT, 'docs', 'defect-class-census.md');
const CONSTRAINTS_PATH = resolve(REPO_ROOT, 'docs', 'standing-constraints.md');

function readConstraintsVersionLine(): string {
  const text = readFileSync(CONSTRAINTS_PATH, 'utf8');
  const match = text.match(/^\*\*CONSTRAINTS-VERSION:.*\*\*$/m);
  if (!match) throw new Error('constraints_version_line_not_found');
  return match[0];
}

const checkOnly = process.argv.includes('--check');
const generated = renderCensus({ constraintsVersionLine: readConstraintsVersionLine() });

if (checkOnly) {
  let committed: string;
  try {
    committed = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    console.error(`missing: ${OUTPUT_PATH} does not exist — run without --check to write it`);
    process.exit(1);
  }
  if (committed !== generated) {
    console.error(
      `stale: ${OUTPUT_PATH} does not match a fresh derivation — run ` +
        `'pnpm exec tsx scripts/derive-defect-class-census.ts' and commit the result`,
    );
    process.exit(1);
  }
  console.log('defect-class-census: committed file matches fresh derivation');
} else {
  writeFileSync(OUTPUT_PATH, generated, 'utf8');
  console.log(`wrote ${OUTPUT_PATH}`);
}
