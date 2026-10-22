import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// #556: constructed repositories for A2's applicability on a shallow clone. Synthetic only; no
// file here is taken from any real repository. Each origin is built with fixed author and
// committer identities and dates, so its commits, and every clone of it, are the same on every run.

/** Where a credential-shaped value sits: in the current tree, only in a deleted commit, or nowhere. */
export type ShallowA2Secret = 'in-tree' | 'deleted-in-history' | 'none';
/** How the origin is checked out for the scan: a full clone or `git clone --depth N`. */
export type ShallowA2Depth = 'full' | 1 | 12;

export interface ShallowA2Shape {
  readonly secret: ShallowA2Secret;
  /** A migrations/ directory: a data layer, read from the tree. */
  readonly dataLayer: boolean;
  /** A production source file calling crypto.timingSafeEqual: a crypto-hygiene surface, read from the tree. */
  readonly cryptoSurface: boolean;
}

export const SHALLOW_A2_DEPTHS: readonly ShallowA2Depth[] = ['full', 1, 12];

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

/** Clones `origin` over the file transport, full or at the given depth, and returns the clone. */
export function cloneShallowA2Origin(origin: string, depth: ShallowA2Depth): string {
  const target = join(dirname(origin), `clone-${depth}`);
  const depthArgs = depth === 'full' ? [] : ['--depth', String(depth)];
  git(dirname(origin), 'clone', '--quiet', ...depthArgs, `file://${origin}`, target);
  const shallow = git(target, 'rev-parse', '--is-shallow-repository');
  if (shallow !== (depth === 'full' ? 'false' : 'true')) {
    throw new Error(`clone at depth ${depth} reports is-shallow-repository ${shallow}`);
  }
  return target;
}

export function removeShallowA2Fixtures(): void {
  for (const root of createdRoots.splice(0)) rmSync(root, { recursive: true, force: true });
}
