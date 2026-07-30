import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const digest = createHash('sha256')
  .update(readFileSync(resolve('package.json')))
  .digest('hex');
