import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
if (!root) throw new Error('usage: assert-complete-retained-run.mjs <run-directory>');
const run = JSON.parse(readFileSync(resolve(root, 'raw-index.json'), 'utf8'));
if (run.total !== 200 || run.completed !== 200 || run.failure !== null || run.rows?.length !== 200) {
  throw new Error(`PARTIAL-DO-NOT-USE completed=${run.completed} total=${run.total}`);
}
