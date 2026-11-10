import { it } from 'vitest';

// Temporary driver for the review-of-698 measurement (not committed).
it('measure 698', async () => {
  const harness = await import('../../../.worktrees/measure-698/harness.ts');
  await harness.done;
}, 7_200_000);
