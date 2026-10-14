import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
export const sha = value => createHash('sha256').update(value).digest('hex');
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
export const PLAN_SCHEMA = 'cejel-public-delta-v2';
// Report fields that carry the score. A pair may not declare one presentation-only: that would
// let a plan hide a scoring move behind a declaration.
export const SCORING_FIELDS = ['criteria','overallScore','codeTrustScore','processTrustScore','verdict'];
const HEX40 = /^[0-9a-f]{40}$/, NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/, CRITERION = /^[A-Z][0-9]+$/;
export function publicEntries(bytes, plan) {
  if (sha(bytes) !== plan.corpusSha256) throw Error('corpus digest mismatch');
  const entries = JSON.parse(bytes).entries.filter(e => e.visibility === 'public');
  if (entries.length !== plan.publicRows) throw Error('public row count mismatch');
  if (new Set(entries.map(e => e.name)).size !== entries.length) throw Error('duplicate public row');
  for (const e of entries) if (!/^[a-z0-9-]+$/.test(e.name) || !/^[0-9a-f]{40}$/.test(e.commit)) throw Error('invalid public binding');
  return entries;
}
// Exit status 1 from `git config --get-regexp` means no key matched; anything else is a real error.
const configured = (cwd, pattern) => { try { return git(cwd, 'config', '--get-regexp', pattern); } catch (error) { if (error.status === 1) return ''; throw error; } };
export function verifyTarget(root, entry) {
  const path = resolve(root, entry.name);
  if (git(path, 'rev-parse','HEAD') !== entry.commit) throw Error(`pin mismatch: ${entry.name}`);
  if (git(path, 'status','--porcelain') !== '') throw Error(`dirty target: ${entry.name}`);
  if (git(path, 'rev-parse','--is-shallow-repository') !== 'false') throw Error(`shallow target: ${entry.name}`);
  // Full history with no blob filter: a partial clone is complete-looking but not complete.
  if (configured(path, '^(remote\\..*\\.(partialclonefilter|promisor)|extensions\\.partialclone)$') !== '') throw Error(`filtered target: ${entry.name}`);
  return { name: entry.name, commit: entry.commit, commitCount: Number(git(path,'rev-list','--count','HEAD')) };
}
const exactKeys = (object, allowed, what, name) => { for (const k of Object.keys(object)) if (!allowed.includes(k)) throw Error(`unknown ${what} field: ${name}.${k}`); };
const idList = list => Array.isArray(list) && list.every(x => CRITERION.test(x)) && new Set(list).size === list.length;
export function validatePlan(plan) {
  if (plan?.schema !== PLAN_SCHEMA) throw Error('unknown plan schema');
  if (!/^[0-9a-f]{64}$/.test(plan.corpusSha256 ?? '')) throw Error('invalid corpus digest');
  if (!Number.isInteger(plan.publicRows) || plan.publicRows < 1) throw Error('invalid public row count');
  if (typeof plan.generatedAt !== 'string' || Number.isNaN(Date.parse(plan.generatedAt)) || new Date(plan.generatedAt).toISOString() !== plan.generatedAt) throw Error('generatedAt must be a fixed ISO instant');
  if (!plan.expected || typeof plan.expected !== 'object' || Array.isArray(plan.expected)) throw Error('plan expected values must be an object');
  if (!Array.isArray(plan.runs) || plan.runs.length === 0) throw Error('plan declares no runs');
  const runs = new Set(), bindings = new Set();
  for (const run of plan.runs) {
    if (!NAME.test(run?.name ?? '')) throw Error('invalid run name');
    exactKeys(run, ['name','commit','rubric'], 'run', run.name);
    if (runs.has(run.name)) throw Error(`duplicate run name: ${run.name}`);
    runs.add(run.name);
    if (typeof run.commit !== 'string' || !HEX40.test(run.commit)) throw Error(`run commit is not 40-hex: ${run.name}`);
    if (typeof run.rubric !== 'string' || !/^witan-rubric-[a-z0-9-]+$/.test(run.rubric)) throw Error(`invalid run rubric: ${run.name}`);
    // Two names for one (commit, rubric) would score the same thing twice: once per run.
    if (bindings.has(`${run.commit} ${run.rubric}`)) throw Error(`run repeats another run's commit and rubric: ${run.name}`);
    bindings.add(`${run.commit} ${run.rubric}`);
  }
  if (!Array.isArray(plan.pairs) || plan.pairs.length === 0) throw Error('plan declares no pairs');
  const pairs = new Set();
  for (const pair of plan.pairs) {
    if (!NAME.test(pair?.name ?? '')) throw Error('invalid pair name');
    exactKeys(pair, ['name','before','after','allowedCriteria','presentationOnly'], 'pair', pair.name);
    if (pairs.has(pair.name)) throw Error(`duplicate pair name: ${pair.name}`);
    pairs.add(pair.name);
    for (const side of ['before','after']) if (!runs.has(pair[side])) throw Error(`pair names an undeclared run: ${pair.name}.${side}=${pair[side]}`);
    if (pair.before === pair.after) throw Error(`pair compares a run with itself: ${pair.name}`);
    if (!idList(pair.allowedCriteria)) throw Error(`pair allowedCriteria must list criterion ids: ${pair.name}`);
    if (!Array.isArray(pair.presentationOnly) || !pair.presentationOnly.every(f => typeof f === 'string' && NAME.test(f)) || new Set(pair.presentationOnly).size !== pair.presentationOnly.length) throw Error(`pair presentationOnly must be an array: ${pair.name}`);
    for (const field of pair.presentationOnly) if (SCORING_FIELDS.includes(field)) throw Error(`presentationOnly names a scoring field: ${pair.name}.${field}`);
  }
  return plan;
}
export function loadPlan(path) {
  return validatePlan(JSON.parse(readFileSync(path,'utf8')));
}
export function planRun(plan, name) {
  const run = plan.runs.find(r => r.name === name);
  if (!run) throw Error(`undeclared run: ${name}`);
  return run;
}
// The selectable list is read from the run's own checked-out scanner source, never restated here.
export async function selectableRubrics(source) {
  let list;
  try {
    const { tsImport } = await import('tsx/esm/api');
    list = (await tsImport(pathToFileURL(resolve(source, 'src/witan/rubric-version.ts')).href, import.meta.url)).WITAN_SELECTABLE_RUBRIC_VERSIONS;
  } catch (cause) { throw Error('no selectable rubric list at run commit', { cause }); }
  if (!Array.isArray(list) || !list.every(v => typeof v === 'string')) throw Error('no selectable rubric list at run commit');
  return [...list];
}
// Clean source at the run's commit first, so the list read below is the commit's own.
export async function verifyRunSource(source, run) {
  if (git(source,'rev-parse','HEAD') !== run.commit) throw Error('source run mismatch');
  if (git(source,'status','--porcelain','--untracked-files=no')) throw Error('dirty source');
  const selectable = await selectableRubrics(source);
  if (!selectable.includes(run.rubric)) throw Error(`rubric not selectable at run commit: ${run.name} ${run.rubric}`);
  return selectable;
}
// The preregistration commit is an ancestor of the protocol checkout and holds these plan bytes.
export function verifyPreregistration(planPath, preregCommit) {
  if (typeof preregCommit !== 'string' || !HEX40.test(preregCommit)) throw Error('preregistration commit is not 40-hex');
  const file = realpathSync(resolve(planPath)), top = realpathSync(git(dirname(file), 'rev-parse', '--show-toplevel'));
  try { git(top, 'merge-base', '--is-ancestor', preregCommit, 'HEAD'); } catch { throw Error('preregistration commit is not an ancestor of the protocol checkout'); }
  let committed;
  try { committed = execFileSync('git', ['show', `${preregCommit}:${relative(top, file).split(sep).join('/')}`], { cwd: top, stdio: ['ignore','pipe','pipe'] }); } catch { throw Error('plan differs from the preregistered plan'); }
  if (sha(committed) !== sha(readFileSync(file))) throw Error('plan differs from the preregistered plan');
  return top;
}
// Raw reports stay local: never write them inside a checkout that could commit them.
export function assertScratchOutside(scratch, roots) {
  const s = realpathSync(scratch);
  for (const root of roots) { const r = realpathSync(root); if (s === r || s.startsWith(r + sep)) throw Error('scratch root is inside a checkout; raw reports stay local'); }
}
export function claimRunOutput(scratch, name) {
  const out = join(scratch, 'out', name);
  if (existsSync(out)) throw Error('run output already exists; never overwrite a run');
  mkdirSync(out, { recursive: true });
  return out;
}
export function scanOptions(plan, run, checkouts, entry, toolVersion) {
  return { repoPath: join(checkouts, entry.name), productSlug: entry.name, productDisplayName: entry.name, generatedAt: plan.generatedAt, rubricVersion: run.rubric, toolVersion, ingestPatterns: [], autoDiscoverIngest: false };
}
