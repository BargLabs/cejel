import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { scanEmptyFailureConflation } from '../dist/packs/d-series/index.js';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || !value) throw new Error(`invalid_argument:${key ?? ''}`);
  args.set(key, value);
}

const checkoutRoot = resolve(args.get('--checkout-root') ?? '/tmp/cejel-d4-pinned-public');
const resultPath = resolve(args.get('--json') ?? '/tmp/cejel-d4-precision-gate.json');
const corpus = JSON.parse(readFileSync(join(repoRoot, 'leaderboard/corpus.json'), 'utf8'));
const publicEntries = corpus.entries.filter((entry) => entry.visibility === 'public');
if (publicEntries.length !== 23) {
  throw new Error(`d4_precision_denominator_mismatch:${publicEntries.length}`);
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashTree(path) {
  const hash = createHash('sha256');
  const visit = (current, relativePath) => {
    for (const name of readdirSync(current).sort()) {
      const absolute = join(current, name);
      const relative = relativePath ? `${relativePath}/${name}` : name;
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        visit(absolute, relative);
      } else if (stat.isFile()) {
        hash.update(relative);
        hash.update('\0');
        hash.update(readFileSync(absolute));
        hash.update('\0');
      }
    }
  };
  visit(path, '');
  return hash.digest('hex');
}

function git(gitArgs, cwd) {
  return execFileSync('git', gitArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function prepareCheckout(entry) {
  const target = join(checkoutRoot, entry.name);
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
    git(['init', '--quiet'], target);
    git(['remote', 'add', 'origin', entry.url], target);
    git(['fetch', '--quiet', '--depth=1', 'origin', entry.commit], target);
    git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], target);
  }
  const actual = git(['rev-parse', 'HEAD'], target).trim();
  if (actual !== entry.commit) {
    throw new Error(`d4_precision_pin_mismatch:${entry.name}:${actual}:${entry.commit}`);
  }
  return target;
}

mkdirSync(checkoutRoot, { recursive: true });
const boardHashBefore = hashTree(join(repoRoot, 'leaderboard'));
const detectorPath = join(repoRoot, 'src/packs/d-series/empty-failure-conflation.ts');
const detectorSourceSha256 = hashBytes(readFileSync(detectorPath));
const repositories = [];
for (const entry of publicEntries) {
  const checkout = prepareCheckout(entry);
  const findings = scanEmptyFailureConflation(checkout);
  repositories.push({
    name: entry.name,
    url: entry.url,
    pinnedRevision: entry.commit,
    findings,
  });
  process.stdout.write(`${entry.name} ${entry.commit} findings=${findings.length}\n`);
}
const boardHashAfter = hashTree(join(repoRoot, 'leaderboard'));
const findingCount = repositories.reduce(
  (total, repository) => total + repository.findings.length,
  0,
);
const result = {
  schemaVersion: 'cejel-d4-precision-gate-v1',
  ruleId: 'D4',
  detectorCommit: git(['rev-parse', 'HEAD'], repoRoot).trim(),
  detectorPath: 'src/packs/d-series/empty-failure-conflation.ts',
  detectorSourceSha256,
  cohortPath: 'leaderboard/corpus.json',
  publicRepositoryDenominator: publicEntries.length,
  findingCount,
  result: findingCount === 0 && boardHashBefore === boardHashAfter ? 'pass' : 'fail',
  boardArtifacts: {
    sha256Before: boardHashBefore,
    sha256After: boardHashAfter,
    unchanged: boardHashBefore === boardHashAfter,
  },
  repositories,
};
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(
  `result=${result.result} findings=${findingCount}/23 output=${basename(resultPath)}\n`,
);
if (result.result !== 'pass') process.exitCode = 1;
