import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const sha = value => createHash('sha256').update(value).digest('hex');
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
export function publicEntries(bytes, plan) {
  if (sha(bytes) !== plan.corpusSha256) throw Error('corpus digest mismatch');
  const entries = JSON.parse(bytes).entries.filter(e => e.visibility === 'public');
  if (entries.length !== plan.publicRows) throw Error('public row count mismatch');
  if (new Set(entries.map(e => e.name)).size !== entries.length) throw Error('duplicate public row');
  for (const e of entries) if (!/^[a-z0-9-]+$/.test(e.name) || !/^[0-9a-f]{40}$/.test(e.commit)) throw Error('invalid public binding');
  return entries;
}
export function verifyTarget(root, entry) {
  const path = resolve(root, entry.name);
  if (git(path, 'rev-parse','HEAD') !== entry.commit) throw Error(`pin mismatch: ${entry.name}`);
  if (git(path, 'status','--porcelain') !== '') throw Error(`dirty target: ${entry.name}`);
  if (git(path, 'rev-parse','--is-shallow-repository') !== 'false') throw Error(`shallow target: ${entry.name}`);
  return { name: entry.name, commit: entry.commit, commitCount: Number(git(path,'rev-list','--count','HEAD')) };
}
export function loadPlan(path) {
  const plan=JSON.parse(readFileSync(path,'utf8'));
  if(plan.schema!=='cejel-three-arm-public-delta-v1' || plan.publicRows!==23 || plan.rubricVersion!=='witan-rubric-v17-2026-07-24') throw Error('invalid plan');
  if(Object.keys(plan.arms).join(',')!=='before459,after459,fixes' || !Object.values(plan.arms).every(v=>/^[0-9a-f]{40}$/.test(v)))throw Error('invalid arms');
  return plan;
}
