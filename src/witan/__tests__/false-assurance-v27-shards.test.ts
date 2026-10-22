import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { NO_RISE_SHARDS, noRiseShardFileText } from './v27-no-rise-generated-suite.js';

// The generated shapes run as NO_RISE_SHARDS files. A missing file, a duplicated or disguised index,
// a skip, or a shard count raised without its file would drop shapes silently and stay green, so
// this guard, which lives outside those files, requires exactly NO_RISE_SHARDS of them, each equal
// byte for byte to noRiseShardFileText (#558 reviews).
describe('the generated no-rise shards are all present', () => {
  it(`exactly ${NO_RISE_SHARDS} files, each the exact shard template for its index`, () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(directory).filter((file) => /^false-assurance-v27-generated-.*\.test\.ts$/.test(file)).sort();
    const expected = Array.from({ length: NO_RISE_SHARDS }, (_, index) => `false-assurance-v27-generated-${index + 1}.test.ts`);
    expect(files).toEqual([...expected].sort());
    expected.forEach((file, index) => {
      expect(readFileSync(join(directory, file), 'utf8'), file).toBe(noRiseShardFileText(index + 1));
    });
  });
});
