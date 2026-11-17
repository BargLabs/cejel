import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

// Vitest's default is one worker per core but one. On an 18-core machine that is 17 workers at
// about 2.3 GiB each, which exhausted memory and panicked the host on 2026-11-17. Six is the
// ceiling; `--maxWorkers` on the command line still overrides it. Vitest 2 sizes the pool's floor
// from minWorkers (default: cores but one), so it is set too or the pool refuses min > max.
const maxWorkers = Math.min(6, Math.max(1, availableParallelism() - 1));

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**',
      '**/.build/**',
      '**/.git/**',
      '**/.cache/**',
      '**/.idea/**',
      '**/coverage/**',
      'calibration/llm/fixtures/free-core-parity/**',
    ],
    maxWorkers,
    minWorkers: 1,
  },
});
