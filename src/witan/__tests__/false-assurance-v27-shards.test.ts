import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { NO_RISE_SHARDS } from './v27-no-rise-generated-suite.js';

// The generated shapes run as NO_RISE_SHARDS files. A missing file, a duplicated index, or a shard
// count raised without its file would drop shapes silently and stay green, so this guard, which
// lives outside those files, reads them (#558 review).
describe('the generated no-rise shards are all present', () => {
  it(`exactly ${NO_RISE_SHARDS} files, file n registering shard index n - 1 once`, () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(directory).filter((file) => /^false-assurance-v27-generated-.*\.test\.ts$/.test(file)).sort();
    expect(files).toEqual(
      Array.from({ length: NO_RISE_SHARDS }, (_, index) => `false-assurance-v27-generated-${index + 1}.test.ts`).sort(),
    );
    const registered = files.map((file) => {
      const calls = [...readFileSync(join(directory, file), 'utf8').matchAll(/describeGeneratedNoRiseShard\((\d+)\)/g)];
      expect(calls.length, file).toBe(1);
      expect(Number(calls[0]![1]), file).toBe(Number(/-(\d+)\.test\.ts$/.exec(file)![1]) - 1);
      return Number(calls[0]![1]);
    });
    expect(registered.sort((a, b) => a - b)).toEqual(Array.from({ length: NO_RISE_SHARDS }, (_, index) => index));
  });
});
