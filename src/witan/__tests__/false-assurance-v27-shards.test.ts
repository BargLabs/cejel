import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createVitest } from 'vitest/node';

import { NO_RISE_SHARDS, noRiseShardFileText } from './v27-no-rise-generated-suite.js';

// The generated shapes run as NO_RISE_SHARDS files. A missing file, a duplicated or disguised index,
// a skip, or a shard count raised without its file would drop shapes silently and stay green, so
// this guard, which lives outside those files, checks them (#558 reviews).

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const shardFiles = Array.from({ length: NO_RISE_SHARDS }, (_, index) => `false-assurance-v27-generated-${index + 1}.test.ts`);

/** Source text with comments removed, so a rule cannot be met or broken by a comment alone. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the generated no-rise shards are all present and run', () => {
  it(`exactly ${NO_RISE_SHARDS} files, each the exact shard template for its index`, () => {
    const files = readdirSync(directory).filter((file) => /^false-assurance-v27-generated-.*\.test\.ts$/.test(file)).sort();
    expect(files).toEqual([...shardFiles].sort());
    shardFiles.forEach((file, index) => {
      expect(readFileSync(join(directory, file), 'utf8'), file).toBe(noRiseShardFileText(index + 1));
    });
  });

  it('the shard suite registers every shape with a plain describe and it: no skip, only, todo, condition or early return', () => {
    const suite = code(readFileSync(join(directory, 'v27-no-rise-generated-suite.ts'), 'utf8'));
    expect(suite.match(/\.\s*(skip|only|todo|skipIf|runIf|fails|concurrent)\b|\b(skipIf|runIf)\s*\(/g) ?? []).toEqual([]);
    // describe and it are vitest's own, imported once and never renamed, rebound or indexed.
    expect(suite).toContain("import { describe, expect, it } from 'vitest';\n");
    expect(suite.match(/\bfrom 'vitest'/g) ?? []).toHaveLength(1);
    expect(suite.match(/\b(const|let|var|function|class)\s+(describe|it|test)\b|\bas\s+(describe|it|test)\b|\b(describe|it|test)\s*\[/g) ?? []).toEqual([]);
    const start = suite.indexOf('export function describeGeneratedNoRiseShard(index: number): void {');
    const call = suite.indexOf('\n  describe(`generated shapes, shard ${index + 1} of ${NO_RISE_SHARDS}:', start);
    expect(start).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(start);
    const preamble = suite.slice(start, call);
    expect(preamble.match(/\breturn\b|\bthrow\b/g) ?? []).toEqual([]);
    // The only statements before the describe: describing the generator in shard 0, choosing the
    // shard's shapes, and the liveness record.
    expect(preamble.match(/\bif\s*\(/g) ?? []).toEqual(['if (']);
    expect(preamble).toContain('if (index === 0) describeGenerator();');
    expect(preamble).toContain('\n  const shapes: NoRiseShape[] = noRiseShard(ALL_SHAPES, index, NO_RISE_SHARDS);\n');
    // Each shape's test is a plain it(name, ...).
    expect(suite).toContain('\n      it(name, () => {');
  });

  it('vitest.config.ts includes every shard file and excludes none (asked of vitest itself)', async () => {
    const vitest = await createVitest('test', { watch: false, root, config: join(root, 'vitest.config.ts') });
    try {
      const collected = new Set((await vitest.getTestFilepaths()).map((path) => resolve(path)));
      for (const file of [...shardFiles, 'false-assurance-v27-shards.test.ts']) {
        expect(collected.has(join(directory, file)), file).toBe(true);
      }
    } finally {
      await vitest.close();
    }
  }, 60_000);
});
