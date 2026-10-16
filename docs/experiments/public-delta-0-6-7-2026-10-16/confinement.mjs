// confinement.mjs <plan> <scratch>: E3 of the 0.6.7 public delta. For the item8-v26 pair, reads the
// local raw reports and checks that every difference is confined to A3's findings and notes, of
// the kinds E3 names. Prints public row names, booleans and the fixed finding propositions only;
// never evidence, paths or notes text. Written with the preregistration, before any run.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BUILD = 'A deployable service package manifest declares neither a build nor a typecheck script.';
export const FOLLOWERS = [
  'A runtime Dockerfile declares no active HEALTHCHECK instruction.',
  'A production HTTP entrypoint handles requests directly but declares no health or readiness route.',
];
export const DISCLOSURE =
  'Whether this package has a build or type-check step outside the files read cannot be settled from static evidence; Cejel makes no finding on it.';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const summaries = c => (c?.findings ?? []).map(f => `${f.severity}|${f.summary}`);
const minus = (a, b) => { const rest = [...b]; return a.filter(x => { const i = rest.indexOf(x); if (i < 0) return true; rest.splice(i, 1); return false; }); };

// Returns { identical, problems[] , kinds[] } for one row. kinds name what changed, from a fixed set.
export function confine(before, after) {
  const problems = [], kinds = [];
  if (same(before, after)) return { identical: true, problems, kinds };
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) if (k !== 'criteria' && !same(before[k], after[k])) problems.push(`top-level ${k} changed`);
  const ids = new Set([...before.criteria, ...after.criteria].map(c => c.id));
  for (const id of ids) {
    const b = before.criteria.find(c => c.id === id), a = after.criteria.find(c => c.id === id);
    if (same(b, a)) continue;
    if (id !== 'A3' || !b || !a) { problems.push(`criterion ${id} changed`); continue; }
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (k === 'findings' || k === 'notes') continue;
      if (!same(b[k], a[k])) problems.push(`A3 ${k} changed`);
    }
    const bs = summaries(b), as = summaries(a);
    const gone = minus(bs, as), added = minus(as, bs);
    const lostBuild = gone.includes(`info|${BUILD}`);
    for (const g of gone) if (g !== `info|${BUILD}`) problems.push('A3 finding gone outside E3');
    if (lostBuild) kinds.push('build-finding-gone');
    for (const n of added) {
      if (n === `info|${BUILD}`) { problems.push('A3 gained the build finding'); continue; }
      if (!FOLLOWERS.some(f => n === `info|${f}`)) { problems.push('A3 finding added outside E3'); continue; }
      if (!lostBuild) { problems.push('A3 follower finding added without the build finding going'); continue; }
      kinds.push(n.includes('HEALTHCHECK') ? 'healthcheck-finding-added' : 'health-route-finding-added');
    }
    // Same summaries in a different order, or the same set with changed evidence: report it.
    if (gone.length === 0 && added.length === 0 && !same(b.findings, a.findings)) problems.push('A3 findings changed beyond summaries');
    if (!same(b.notes, a.notes)) {
      const hadBuild = bs.includes(`info|${BUILD}`);
      if (a.notes !== DISCLOSURE) problems.push('A3 notes changed to something other than the disclosure');
      else if (b.notes !== undefined) problems.push('A3 notes replaced existing notes');
      else if (lostBuild) kinds.push('disclosure-added-where-build-finding-went');
      else if (!hadBuild) kinds.push('disclosure-added-where-no-build-finding-before');
      else problems.push('A3 disclosure added while the build finding stayed');
    }
  }
  return { identical: false, problems, kinds };
}

export function main(planPath, scratch) {
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const pair = plan.pairs.find(p => p.name === 'item8-v26');
  if (!pair) throw Error('no item8-v26 pair in plan');
  const paired = JSON.parse(readFileSync(join(scratch, 'paired-result.json'), 'utf8'));
  const rows = paired.pairs[pair.name].rows;
  let differing = 0, failing = 0;
  for (const row of rows) {
    if (row.error) { console.log(`${row.name}: error row`); failing += 1; continue; }
    const read = run => JSON.parse(readFileSync(join(scratch, 'out', run, `${row.name}.json`), 'utf8'));
    const r = confine(read(pair.before), read(pair.after));
    if (r.identical) continue;
    differing += 1;
    if (r.problems.length) failing += 1;
    console.log(`${row.name}: ${r.problems.length ? 'OUTSIDE E3' : 'within E3'}; ${[...r.kinds, ...r.problems].join('; ')}`);
  }
  console.log(`item8-v26: ${rows.length} rows, ${differing} differ, ${failing} outside E3`);
  if (failing) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main(process.argv[2], process.argv[3]);
