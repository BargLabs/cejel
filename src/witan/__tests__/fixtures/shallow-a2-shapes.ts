import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// #556: constructed repositories for A2 on a clone whose history Cejel reads incompletely: shallow
// (depth 1 or 12), partial (blobless or treeless, whose missing objects Cejel's git boundary never
// fetches, so its history reads fail), or complete-looking with history blobs missing (a simulated
// history-read failure on a repository that is neither shallow nor partial). Synthetic only; no
// file here is taken from any real repository. Each origin is built with fixed author and
// committer identities and dates, so its commits, and every clone of it, are the same on every run.

/** Where a credential-shaped value sits: in the current tree, only in a deleted commit, or nowhere. */
export type ShallowA2Secret = 'in-tree' | 'deleted-in-history' | 'none';
/**
 * How the origin is checked out for the scan: a full clone, `git clone --depth N`, a partial clone
 * (`--filter=blob:none` or `--filter=tree:0`), or 'missing-blobs': a blobless clone whose partial
 * clone configuration is then removed, so git treats it as complete and a read of a historical
 * blob fails (Cejel's stand-in for any failed history read: a git error, timeout or output limit).
 */
export type A2HistoryClone = 'full' | 1 | 12 | 'blobless' | 'treeless' | 'missing-blobs';

export interface ShallowA2Shape {
  readonly secret: ShallowA2Secret;
  /** A migrations/ directory: a data layer, read from the tree. */
  readonly dataLayer: boolean;
  /** A production source file calling crypto.timingSafeEqual: a crypto-hygiene surface, read from the tree. */
  readonly cryptoSurface: boolean;
}

export const A2_HISTORY_CLONES: readonly A2HistoryClone[] = [
  'full',
  1,
  12,
  'blobless',
  'treeless',
  'missing-blobs',
];

/** Every combination, in a fixed order: 3 secret placements x data layer x crypto surface. */
export const SHALLOW_A2_SHAPES: readonly ShallowA2Shape[] = (['in-tree', 'deleted-in-history', 'none'] as const).flatMap(
  (secret) =>
    [false, true].flatMap((dataLayer) =>
      [false, true].map((cryptoSurface) => ({ secret, dataLayer, cryptoSurface })),
    ),
);

/** The issue's shape: a secret-bearing .env committed and deleted, and no other A2 surface. */
export const ISSUE_556_SHAPE: ShallowA2Shape = {
  secret: 'deleted-in-history',
  dataLayer: false,
  cryptoSurface: false,
};

export function shallowA2ShapeName(shape: ShallowA2Shape): string {
  return `secret-${shape.secret}${shape.dataLayer ? '+data' : ''}${shape.cryptoSurface ? '+crypto' : ''}`;
}

// A live-shaped Stripe secret key, assembled at run time so this file holds no credential-shaped
// literal. Synthetic: it authenticates nowhere.
const SYNTHETIC_STRIPE_KEY = ['sk', 'live', 'FIXTUREonly0000abcdEFGH1234ijklMNOP'].join('_');

// Commits after the deletion: more than 12, so a --depth 12 clone holds none of the .env commits.
const FILLER_COMMITS = 14;

const GIT_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', '-c', 'protocol.file.allow=always', ...args],
    { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function write(root: string, path: string, contents: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

function commitAll(root: string, message: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', message);
}

const createdRoots: string[] = [];

/** Builds the origin repository for one shape and returns its path. */
export function buildShallowA2Origin(shape: ShallowA2Shape): string {
  const parent = mkdtempSync(join(tmpdir(), `cejel-shallow-a2-${shallowA2ShapeName(shape)}-`));
  createdRoots.push(parent);
  const origin = join(parent, 'origin');
  mkdirSync(origin);
  git(origin, 'init', '--quiet');
  // Lets a partial clone over the file transport request a filter.
  git(origin, 'config', 'uploadpack.allowFilter', 'true');
  // A small, tested, locked package: its other code_trust criteria score above A2's critical 1.4, so
  // on the issue's shape A2 leaving the composite raises the v17 score, as in the reported repro.
  write(
    origin,
    'package.json',
    `${JSON.stringify(
      {
        name: 'shallow-a2-fixture',
        version: '1.0.0',
        type: 'module',
        scripts: { test: 'node --test', build: 'tsc -p .', lint: 'eslint .' },
        devDependencies: { typescript: '5.4.0', eslint: '9.0.0' },
      },
      null,
      2,
    )}\n`,
  );
  write(
    origin,
    'package-lock.json',
    `${JSON.stringify(
      {
        name: 'shallow-a2-fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'shallow-a2-fixture', version: '1.0.0' } },
      },
      null,
      2,
    )}\n`,
  );
  for (const unit of ['a', 'b', 'c', 'd']) {
    write(origin, `src/${unit}.js`, `export function ${unit}(value) {\n  return value;\n}\n`);
    write(
      origin,
      `test/${unit}.test.js`,
      `import test from 'node:test';\nimport assert from 'node:assert';\nimport { ${unit} } from '../src/${unit}.js';\ntest('${unit}', () => assert.equal(${unit}(1), 1));\n`,
    );
  }
  write(origin, 'README.md', '# shallow-a2-fixture\n');
  if (shape.dataLayer) {
    write(origin, 'migrations/001_init.sql', 'CREATE TABLE items (id integer primary key, name text);\n');
  }
  if (shape.cryptoSurface) {
    write(
      origin,
      'src/verify.js',
      "import crypto from 'node:crypto';\nexport function verify(expected, actual) {\n  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));\n}\n",
    );
  }
  commitAll(origin, 'initial');
  if (shape.secret !== 'none') {
    write(origin, '.env', `STRIPE_SECRET_KEY=${SYNTHETIC_STRIPE_KEY}\n`);
    commitAll(origin, 'add env');
  }
  if (shape.secret === 'deleted-in-history') {
    rmSync(join(origin, '.env'));
    commitAll(origin, 'remove env');
  }
  for (let index = 1; index <= FILLER_COMMITS; index += 1) {
    write(origin, 'README.md', `# shallow-a2-fixture\n\nrevision ${index}\n`);
    commitAll(origin, `revision ${index}`);
  }
  return origin;
}

/** Clones `origin` over the file transport, full, at a depth or partial, and returns the clone. */
export function cloneShallowA2Origin(origin: string, clone: A2HistoryClone): string {
  const target = join(dirname(origin), `clone-${clone}`);
  const args =
    clone === 'full'
      ? []
      : clone === 'blobless' || clone === 'missing-blobs'
        ? ['--filter=blob:none']
        : clone === 'treeless'
          ? ['--filter=tree:0']
          : ['--depth', String(clone)];
  git(dirname(origin), 'clone', '--quiet', ...args, `file://${origin}`, target);
  if (clone === 'missing-blobs') {
    for (const key of ['remote.origin.promisor', 'remote.origin.partialclonefilter', 'extensions.partialclone']) {
      // `git config --get` with a default never fails; unset only what this git version wrote.
      if (git(target, 'config', '--default', '', '--get', key) !== '') git(target, 'config', '--unset-all', key);
    }
  }
  const shallow = git(target, 'rev-parse', '--is-shallow-repository');
  if (shallow !== (typeof clone === 'number' ? 'true' : 'false')) {
    throw new Error(`clone ${clone} reports is-shallow-repository ${shallow}`);
  }
  const promisor = git(target, 'config', '--default', '', '--get', 'remote.origin.promisor');
  if (promisor !== (clone === 'blobless' || clone === 'treeless' ? 'true' : '')) {
    throw new Error(`clone ${clone} reports remote.origin.promisor ${promisor}`);
  }
  return target;
}

/**
 * A minimal origin built from explicit commits, for the read-failure corners: each step writes the
 * given files (path to contents) and removes the given paths, then commits. Returns the origin.
 */
export function buildA2HistoryOrigin(
  name: string,
  steps: ReadonlyArray<{ readonly write?: Readonly<Record<string, string>>; readonly remove?: readonly string[] }>,
): string {
  const parent = mkdtempSync(join(tmpdir(), `cejel-a2-history-${name}-`));
  createdRoots.push(parent);
  const origin = join(parent, 'origin');
  mkdirSync(origin);
  git(origin, 'init', '--quiet');
  git(origin, 'config', 'uploadpack.allowFilter', 'true');
  steps.forEach((step, index) => {
    for (const [path, contents] of Object.entries(step.write ?? {})) write(origin, path, contents);
    for (const path of step.remove ?? []) rmSync(join(origin, path));
    commitAll(origin, `step ${index + 1}`);
  });
  return origin;
}

/** The synthetic Stripe-shaped key, for corners built with buildA2HistoryOrigin. */
export const SHALLOW_A2_SYNTHETIC_SECRET_LINE = `STRIPE_SECRET_KEY=${SYNTHETIC_STRIPE_KEY}\n`;

export function removeShallowA2Fixtures(): void {
  for (const root of createdRoots.splice(0)) rmSync(root, { recursive: true, force: true });
}
