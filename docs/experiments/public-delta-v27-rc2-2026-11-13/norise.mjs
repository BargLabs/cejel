// norise.mjs <plan> <scratch>: E2 of the 0.6.8 public confirmation. For the v27-shadow pair (v17 and
// v27 at the same candidate commit), reads paired-result.json only, never raw reports, and checks
// that no composite and no criterion score is higher under v27 than under v17. A composite or a
// criterion that is null or absent under v17 and scored under v27 is a rise. A value that becomes
// null under v27 is not. Also counts, without forecasting them, the rows where A2 or B2 are
// insufficient_data under v27. Prints public row names, criterion ids and counts only. Written
// with the preregistration, before any run.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMPOSITES = ['overall', 'code', 'process'];
const isScore = value => typeof value === 'number' && Number.isFinite(value);

/** A rise from before to after: after scored where before was not, or scored higher. */
export function rises(before, after) {
  if (!isScore(after)) return false;
  if (!isScore(before)) return true;
  return after > before;
}

// Returns { problems[], abstained[] } for one paired-result row (before = v17, after = v27).
export function checkRow(row) {
  const problems = [], abstained = [];
  if (row.error) return { problems: ['error row'], abstained };
  for (const key of COMPOSITES) {
    if (rises(row.before?.[key], row.after?.[key])) problems.push(`${key} rose`);
  }
  for (const moved of row.movedCriteria ?? []) {
    if (rises(moved.before?.score, moved.after?.score)) problems.push(`criterion ${moved.id} rose`);
    if ((moved.id === 'A2' || moved.id === 'B2') && moved.after?.status === 'insufficient_data') abstained.push(moved.id);
  }
  return { problems, abstained };
}

export function main(planPath, scratch) {
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const pair = plan.pairs.find(p => p.name === 'v27-shadow');
  if (!pair) throw Error('no v27-shadow pair in plan');
  const paired = JSON.parse(readFileSync(join(scratch, 'paired-result.json'), 'utf8'));
  const rows = paired.pairs[pair.name].rows;
  let failing = 0;
  const abstentions = { A2: 0, B2: 0 };
  for (const row of rows) {
    const r = checkRow(row);
    for (const id of r.abstained) abstentions[id] += 1;
    if (r.problems.length) {
      failing += 1;
      console.log(`${row.name}: RISE; ${r.problems.join('; ')}`);
    }
  }
  console.log(`v27-shadow: ${rows.length} rows, ${failing} with a rise; insufficient_data under v27: A2 ${abstentions.A2}, B2 ${abstentions.B2}`);
  if (failing) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main(process.argv[2], process.argv[3]);
