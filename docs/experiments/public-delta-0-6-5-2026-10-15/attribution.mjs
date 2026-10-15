// attribution.mjs <plan> <scratch>: per-row facts for E2-E4 of the 0.6.5 public delta, read from
// the local raw reports. Prints row names, criterion ids, metric names, directions, finding counts
// and finding summaries (rule propositions) only. Never prints evidence, paths, labels or notes text.
// Written by the reviewer after the runs; reads, never writes.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [planPath, scratch] = process.argv.slice(2);
if (!planPath || !scratch) throw Error('usage: attribution.mjs <plan> <scratch>');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const paired = JSON.parse(readFileSync(join(scratch, 'paired-result.json'), 'utf8'));
const report = (run, name) => JSON.parse(readFileSync(join(scratch, 'out', run, `${name}.json`), 'utf8'));
const dir = (b, a) => (b === a ? '=' : b == null || a == null ? `${b}->${a}` : a > b ? 'up' : 'down');
const short = s => String(s ?? '').replace(/\s+/g, ' ').slice(0, 160);
const findingSet = c => (c?.findings ?? []).map(f => `${f.severity}: ${short(f.summary)}`);
const diffList = (b, a) => ({
  gone: b.filter(x => !a.includes(x)),
  new: a.filter(x => !b.includes(x)),
});
const NOTES = [
  ['A5-unsettled', "claims are reconciled against its implementation cannot be settled"],
  ['A2-unsettled', 'tenant isolation is enforced outside the database cannot be settled'],
];
const notesFlags = c => NOTES.filter(([, t]) => JSON.stringify(c?.notes ?? '').includes(t)).map(([k]) => k);
const declaresWorkspaces = name => {
  const root = join(scratch, 'checkouts', name);
  let pkg = false;
  try { const p = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); pkg = Boolean(p.workspaces); } catch {}
  return { packageJsonWorkspaces: pkg, pnpmWorkspaceYaml: existsSync(join(root, 'pnpm-workspace.yaml')) };
};
const changedKeys = (b, a) => [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])]
  .filter(k => JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k]));

for (const pair of plan.pairs) {
  const result = paired.pairs[pair.name];
  console.log(`\n=== ${pair.name}: ${pair.before} -> ${pair.after}`);
  for (const row of result.rows) {
    if (row.error) { console.log(`${row.name}: error row`); continue; }
    const b = report(pair.before, row.name), a = report(pair.after, row.name);
    const ids = [...new Set([...b.criteria, ...a.criteria].map(c => c.id))];
    const diffCriteria = ids.filter(id => JSON.stringify(b.criteria.find(c => c.id === id)) !== JSON.stringify(a.criteria.find(c => c.id === id)));
    if (!row.scoringChanged) {
      if (diffCriteria.length === 0) continue;
      const detail = diffCriteria.map(id => `${id}[${changedKeys(b.criteria.find(c => c.id === id), a.criteria.find(c => c.id === id)).join(',')}]`);
      console.log(`${row.name}: no scoring move; non-scored differences in ${detail.join(' ')}`);
      // Finding wording changes at unchanged severity counts: print the summaries that changed.
      for (const id of diffCriteria) {
        const f = diffList(findingSet(b.criteria.find(c => c.id === id)), findingSet(a.criteria.find(c => c.id === id)));
        for (const x of f.gone) console.log(`    ${id} finding gone: ${x}`);
        for (const x of f.new) console.log(`    ${id} finding new:  ${x}`);
      }
      continue;
    }
    console.log(`${row.name}: overall ${dir(b.overallScore, a.overallScore)}, code ${dir(b.codeTrustScore, a.codeTrustScore)}, process ${dir(b.processTrustScore, a.processTrustScore)}, verdict ${b.verdict}->${a.verdict}, placement ${row.before.placement}->${row.after.placement}`);
    if (pair.name === 'release-v17') console.log(`  workspaces: ${JSON.stringify(declaresWorkspaces(row.name))}`);
    for (const m of row.movedCriteria) {
      const bc = b.criteria.find(c => c.id === m.id), ac = a.criteria.find(c => c.id === m.id);
      // Union of both sides: a metric omitted on one side prints as `absent` (reviewer fix: the
      // first version iterated the after side only, so an omitted metric was invisible).
      const metrics = [...new Set([...(bc?.metrics ?? []), ...(ac?.metrics ?? [])].map(x => x.name))]
        .map(name => [name, bc?.metrics?.find(x => x.name === name)?.value ?? 'absent', ac?.metrics?.find(x => x.name === name)?.value ?? 'absent'])
        .filter(([, x, y]) => x !== y).map(([n, x, y]) => `${n} ${x}->${y}`);
      const f = diffList(findingSet(bc), findingSet(ac));
      console.log(`  ${m.id}: score ${dir(bc?.score, ac?.score)} (${bc?.score}->${ac?.score}), status ${bc?.status}->${ac?.status}; metrics: ${metrics.join('; ') || 'none'}`);
      for (const x of f.gone) console.log(`    finding gone: ${x}`);
      for (const x of f.new) console.log(`    finding new:  ${x}`);
      const nb = notesFlags(bc), na = notesFlags(ac);
      if (nb.length || na.length) console.log(`    disclosure notes: before [${nb}] after [${na}]`);
    }
  }
}

// E4 completeness, every row of both item-6 runs (not only moved rows): A5 status, whether the
// reconciliation metric is present, whether a reconciliation finding fires, the disclosure note;
// and A2 tenant findings. A row with an unchanged A5 finding would not show above as moved.
const item6 = plan.pairs.find(p => p.name === 'item6-v26');
if (item6) {
  console.log('\n=== item6-v26, every row: A5 (status, metric, reconciliation finding, note) and A2 tenant findings');
  const rec = c => (c?.findings ?? []).filter(f => /claim-reality|reconciliation/i.test(f.summary ?? '')).length;
  const ten = c => (c?.findings ?? []).filter(f => /row-level|tenant/i.test(f.summary ?? '')).length;
  const hasMetric = c => Boolean(c?.metrics?.some(m => m.name === 'reconciliation_artifact_depth'));
  for (const row of paired.pairs['item6-v26'].rows) {
    if (row.error) { console.log(`${row.name}: error row`); continue; }
    const side = run => { const r = report(run, row.name); return { a5: r.criteria.find(c => c.id === 'A5'), a2: r.criteria.find(c => c.id === 'A2') }; };
    const b = side(item6.before), a = side(item6.after);
    console.log(`${row.name}: A5 ${b.a5?.status}->${a.a5?.status}, metric ${hasMetric(b.a5)}->${hasMetric(a.a5)}, recFinding ${rec(b.a5)}->${rec(a.a5)}, note [${notesFlags(a.a5)}]; A2 tenant findings ${ten(b.a2)}->${ten(a.a2)}, note [${notesFlags(a.a2)}]`);
  }
}
