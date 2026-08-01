#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { namedTestsFromOutput } from './session-trace-extract.mjs';

const REPOSITORIES = {
  'BargLabs/cejel': { path: '/Users/bargs/projects/cejel', tip: '97564ad17ddde4c64d213f78c98d316c01b0c12a' },
  'BargStudio/egbert': { path: '/Users/bargs/projects/egbert', tip: 'b8346c235a9607c0efff31af6bb44a25ee4d16bb' },
  'houman44/site-machine': { path: '/Users/bargs/projects/site-machine', tip: '1e4106f131f9af27a9a314a0dbb2ecc35c09b441' },
  'BargLabs/alfred': { path: '/Users/bargs/projects/alfred', tip: '76a631be63cf1be2cd4d9c6b303626a7124864c4' },
  'houman44/edwin': { path: '/Users/bargs/projects/edwin', tip: '8a9e006d1bae6653f253608ddc11eb93570fc5a1' },
  'BargStudio/therasyn': { path: '/Users/bargs/projects/therasyn', tip: '39f228590c2b2ecb47ddb420709d15c9271ad65a' },
  'houman44/knut': { path: '/Users/bargs/projects/knut', tip: '4609f13c43f8b772db2aee7020bd9dad8ffeca16' },
  'BargLabs/edwy': { path: '/Users/bargs/projects/edwy', tip: '99c1139ba187d7181ff9923edd782f66cc599aec' },
  'BargLabs/wilfrid': { path: '/Users/bargs/projects/wilfrid', tip: 'da0a474d361dd472c92e59c07b63b6139c390e42' },
  'houman44/barglabs-site': { path: '/Users/bargs/projects/barglabs-site', tip: '1e164da9400b0c7b8f073f2df5bafad3af48d643' },
  'BargLabs/cejel-site': { path: '/Users/bargs/projects/cejel-site', tip: '5ed796e3dc9926ae69e0b2b018026c099d211a2e' },
};

const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)|\.(?:test|spec)\.[^/]+$/i;
const RUNNABLE_TEST = /\.(?:py|ts|tsx|js|jsx|mjs|cjs)$/i;
const SOURCE_PATH = /\.(?:py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|rb|php|cs|c|cc|cpp|h|hpp|sh|bash|zsh|sql|ya?ml|json|toml)$/i;
const NON_SOURCE_PATH = /(?:^|\/)(?:docs?|notes?|fixtures?|snapshots?|node_modules|dist|build|coverage)(?:\/|$)|\.(?:md|mdx|txt|png|jpe?g|gif|svg|pdf|lock)$/i;
const scratch = '/tmp/session-trace-work';

function isSource(file) {
  return SOURCE_PATH.test(file) && !TEST_PATH.test(file) && !NON_SOURCE_PATH.test(file);
}

function isTest(file) {
  return TEST_PATH.test(file) && RUNNABLE_TEST.test(file);
}

function redact(text) {
  return String(text ?? '')
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [REDACTED]')
    .replace(/(?:token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '[REDACTED]');
}

function ensureLink(target, link) {
  if (!fs.existsSync(target) || fs.existsSync(link)) return;
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(target, link, 'dir');
}

function linkDependencies(repoPath, clone) {
  const result = execFileSync('find', [repoPath, '-maxdepth', '5', '-type', 'd', '(', '-name', 'node_modules', '-o', '-name', '.venv', ')', '-prune', '-print'], { encoding: 'utf8' });
  for (const target of result.split('\n').filter(Boolean)) ensureLink(target, path.join(clone, path.relative(repoPath, target)));
}

function nearestPackageRoot(repoPath, testFile) {
  let current = path.dirname(path.join(repoPath, testFile));
  while (current.startsWith(repoPath)) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return repoPath;
}

function mapSessionTests(candidate, changedTests) {
  const matched = changedTests.filter((changed) => candidate.namedTests.some((test) => {
    const named = test.file.replace(/^\.\//, '');
    return changed === named || changed.endsWith(`/${named}`) || named.endsWith(`/${changed}`) || path.basename(changed) === path.basename(named);
  }));
  return matched.length ? matched : changedTests;
}

function makeGroups(candidate, clone, selectedTests) {
  const repo = REPOSITORIES[candidate.repo];
  const groups = new Map();
  for (const testFile of selectedTests) {
    let kind, cwd, executable;
    if (testFile.endsWith('.py')) {
      if ((candidate.repo === 'BargStudio/egbert' || candidate.repo === 'houman44/edwin') && testFile.startsWith('egbert_core/')) {
        cwd = path.join(clone, 'egbert_core');
        executable = path.join(repo.path, 'egbert_core/.venv/bin/pytest');
      } else if (candidate.repo === 'BargStudio/therasyn' && testFile.startsWith('apps/api-backend/')) {
        cwd = path.join(clone, 'apps/api-backend');
        executable = path.join(repo.path, '.venv/bin/pytest');
      } else {
        cwd = clone;
        executable = 'pytest';
      }
      kind = 'pytest';
    } else {
      cwd = nearestPackageRoot(clone, testFile);
      let packageJson = {};
      try { packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch {}
      if (/\/(?:e2e)\//.test(`/${testFile}`) || packageJson.scripts?.e2e?.includes('playwright')) kind = 'playwright';
      else if ((packageJson.scripts?.test ?? '').includes('jest')) kind = 'jest';
      else kind = 'vitest';
      executable = path.join(cwd, 'node_modules/.bin', kind);
      if (!fs.existsSync(executable)) executable = path.join(clone, 'node_modules/.bin', kind);
    }
    const key = `${kind}:${cwd}`;
    const group = groups.get(key) ?? { kind, cwd, executable, files: [] };
    group.files.push(path.relative(cwd, path.join(clone, testFile)));
    groups.set(key, group);
  }
  return [...groups.values()];
}

function runGroup(group) {
  const args = group.kind === 'pytest' ? ['-p', 'no:rerunfailures', '-q', ...group.files]
    : group.kind === 'playwright' ? ['test', ...group.files, '--workers=1']
    : group.kind === 'jest' ? [...group.files, '--runInBand']
    : ['run', ...group.files, '--pool=forks', '--fileParallelism=false', '--cache=false'];
  const start = Date.now();
  const result = spawnSync(group.executable, args, {
    cwd: group.cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 32,
    env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const output = redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return {
    runner: group.kind,
    files: group.files,
    exitCode: result.status,
    timedOut: result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT',
    durationMs: Date.now() - start,
    namedFailures: namedTestsFromOutput(output),
  };
}

function patchFor(candidate, sourceFiles) {
  const repo = REPOSITORIES[candidate.repo];
  return execFileSync('git', ['-C', repo.path, 'diff', '--binary', candidate.parentSha, candidate.fixSha, '--', ...sourceFiles], { maxBuffer: 1024 * 1024 * 256 });
}

function restore(clone) {
  execFileSync('git', ['-C', clone, 'restore', '--source=HEAD', '--staged', '--worktree', '--', '.'], { stdio: 'ignore' });
}

function main() {
  const inputPath = process.argv[2] ?? '/tmp/session-trace-resolved.json';
  const outputPath = process.argv[3] ?? '/tmp/session-trace-oracle.json';
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
  const clones = new Map();
  const results = [];
  for (let index = 0; index < input.candidates.length; index++) {
    const candidate = input.candidates[index];
    const repo = REPOSITORIES[candidate.repo];
    process.stderr.write(`oracle ${index + 1}/${input.candidates.length} ${candidate.repo}@${candidate.fixSha.slice(0, 8)}\n`);
    let clone = clones.get(candidate.repo);
    if (!clone) {
      clone = path.join(scratch, candidate.repo.replaceAll('/', '__'));
      if (!fs.existsSync(path.join(clone, '.git'))) execFileSync('git', ['clone', '--shared', '--no-checkout', repo.path, clone], { stdio: 'ignore' });
      execFileSync('git', ['-C', clone, 'checkout', '--detach', '--force', repo.tip], { stdio: 'ignore' });
      linkDependencies(repo.path, clone);
      clones.set(candidate.repo, clone);
    }
    restore(clone);
    const sourceFiles = candidate.files.filter(isSource);
    const changedTests = candidate.files.filter(isTest);
    const presentTests = changedTests.filter((file) => fs.existsSync(path.join(clone, file)));
    const selectedTests = mapSessionTests(candidate, presentTests);
    if (!sourceFiles.length || !selectedTests.length) {
      results.push({ ...candidate, sourceFiles, changedTests, selectedTests, directApplies: false, threeWayApplies: false, condition3: false, condition4: false, condition4AfterRestore: false, exclusion: 'no runnable changed test or source file at frozen tip' });
      continue;
    }
    const patch = patchFor(candidate, sourceFiles);
    const direct = spawnSync('git', ['-C', clone, 'apply', '--reverse', '--check', '-'], { input: patch, maxBuffer: 1024 * 1024 * 64 });
    const threeWay = direct.status === 0 ? null : spawnSync('git', ['-C', clone, 'apply', '--reverse', '--3way', '--check', '-'], { input: patch, maxBuffer: 1024 * 1024 * 64 });
    const directApplies = direct.status === 0;
    const threeWayApplies = threeWay?.status === 0;
    if (!directApplies && !threeWayApplies) {
      results.push({ ...candidate, sourceFiles, changedTests, selectedTests, patchBytes: patch.length, directApplies, threeWayApplies, condition3: false, condition4: false, condition4AfterRestore: false, exclusion: 'source reverse patch does not apply at frozen tip' });
      continue;
    }
    const groups = makeGroups(candidate, clone, selectedTests);
    const clean = groups.map(runGroup);
    const condition4 = clean.length > 0 && clean.every((run) => run.exitCode === 0 && !run.timedOut);
    if (!condition4) {
      results.push({ ...candidate, sourceFiles, changedTests, selectedTests, patchBytes: patch.length, directApplies, threeWayApplies, clean, seeded: [], restored: [], condition3: false, condition4: false, condition4AfterRestore: false, exclusion: 'selected changed tests are not green at frozen fixed tip' });
      continue;
    }
    const apply = spawnSync('git', ['-C', clone, 'apply', '--reverse', ...(directApplies ? [] : ['--3way']), '-'], { input: patch, maxBuffer: 1024 * 1024 * 64 });
    const seeded = apply.status === 0 ? groups.map(runGroup) : [];
    const condition3 = apply.status === 0 && seeded.some((run) => run.exitCode !== 0 && !run.timedOut && run.namedFailures.length > 0);
    restore(clone);
    const restored = condition3 ? groups.map(runGroup) : [];
    const condition4AfterRestore = restored.length > 0 && restored.every((run) => run.exitCode === 0 && !run.timedOut);
    results.push({
      ...candidate,
      sourceFiles,
      changedTests,
      selectedTests,
      patchBytes: patch.length,
      directApplies,
      threeWayApplies,
      clean,
      seeded,
      restored,
      condition3,
      condition4,
      condition4AfterRestore,
      exclusion: condition3 ? (condition4AfterRestore ? null : 'tests did not return green after restoring fixed source') : 'source reversal did not produce a named failing changed test',
    });
    restore(clone);
  }
  const output = { schemaVersion: 1, generatedAt: new Date().toISOString(), candidates: results };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    candidates: results.length,
    patchApplicable: results.filter((row) => row.directApplies || row.threeWayApplies).length,
    cleanGreen: results.filter((row) => row.condition4).length,
    namedRedAfterReverse: results.filter((row) => row.condition3).length,
    restoredGreen: results.filter((row) => row.condition4AfterRestore).length,
    both: results.filter((row) => row.condition3 && row.condition4AfterRestore).length,
    exclusions: Object.entries(results.reduce((counts, row) => {
      if (row.exclusion) counts[row.exclusion] = (counts[row.exclusion] ?? 0) + 1;
      return counts;
    }, {})).map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
  }, null, 2));
}

main();
