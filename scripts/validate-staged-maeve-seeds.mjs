#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOLDING = 'docs/orchestration/maeve-unanchored-lessons/';

export function validateSelection(entries, validateMaeveStagedSeedBatch) {
  if (entries.length === 0) throw new Error('maeve_staging_zero_examined: no selected seed files');
  let examinedSeeds = 0;
  for (const { path, contents } of entries) {
    const seeds = validateMaeveStagedSeedBatch(JSON.parse(contents), {
      expectedRepository: 'BargLabs/cejel', filePath: path,
    });
    examinedSeeds += seeds.length;
  }
  if (examinedSeeds === 0) throw new Error('maeve_staging_zero_examined: no seed records');
  return { examinedFiles: entries.length, examinedSeeds, invalidSeeds: 0 };
}

export function selectEntries(root, mode) {
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const args = mode === 'staged'
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z', '--', HOLDING]
    : ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', HOLDING];
  return git(args).split('\0').filter(path => path.endsWith('.json')).map(path => ({
    path, contents: git(['show', `${mode === 'staged' ? ':' : 'HEAD:'}${path}`]),
  }));
}

export async function main(argv = process.argv.slice(2)) {
  let mode = 'staged';
  let alfredRoot = process.env.ALFRED_REPO_ROOT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode' && ['staged', 'tree'].includes(argv[i + 1])) mode = argv[++i];
    else if (arg === '--alfred-root' && argv[i + 1]) alfredRoot = argv[++i];
    else throw new Error(`maeve_staging_argument_invalid: ${arg}`);
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const entries = selectEntries(root, mode);
  if (entries.length === 0) throw new Error('maeve_staging_zero_examined: no selected seed files');
  const modulePath = join(resolve(alfredRoot ?? join(root, '..', 'alfred')),
    'packages/api/src/services/maeve-staged-seed-validation.ts');
  let validator;
  try {
    validator = (await import(pathToFileURL(modulePath).href)).validateMaeveStagedSeedBatch;
    if (typeof validator !== 'function') throw new Error('missing export');
  } catch {
    throw new Error('maeve_staging_validator_unavailable: set ALFRED_REPO_ROOT to an installed Alfred checkout; run with node --import tsx');
  }
  const result = validateSelection(entries, validator);
  console.log(JSON.stringify({ status: 'maeve_staging_validated', mode, ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
