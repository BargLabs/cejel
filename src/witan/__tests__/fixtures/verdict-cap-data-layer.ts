import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { git } from './shallow-history-matrix.js';

// v27 freeze change F1, second pass, item C: two data-layer repositories, synthetic, built for the
// verdict cap (operator decision 2026-10-28, option C). A tested, locked Node package with a
// migrations/ directory (a data layer A2 reads), a CI workflow on pull requests, a pull-request
// template, and a history of pull-request merges, so B2 reads the same on a full clone as on a
// shallow one. One has a clean history; in the other a
// secret-bearing .env was committed and then deleted, more than twelve commits before HEAD, so a
// depth-1 or depth-12 clone holds none of it. No file here is taken from any real repository.

export type DataLayerHistory = 'clean' | 'secret-deleted';
export const DATA_LAYER_HISTORIES: readonly DataLayerHistory[] = ['clean', 'secret-deleted'];

// A live-shaped Stripe secret key, assembled at run time so this file holds no credential-shaped
// literal. Synthetic: it authenticates nowhere.
const SYNTHETIC_STRIPE_KEY = ['sk', 'live', 'FIXTUREonly0000abcdEFGH1234ijklMNOP'].join('_');
// Commits after the deletion: more than 12, so a --depth 12 clone holds none of the .env commits.
const FILLER_COMMITS = 14;

// v27 credits it (it installs dependencies, so it is not print-only); it runs none of B3's command
// categories, which with a test script alone keeps process_trust at 2.5, so the clean repository
// sits in the conditional band and the one with the deleted secret in the at_risk band.
const CI_WORKFLOW =
  'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci\n      - run: echo build\n';

function write(root: string, path: string, contents: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

function commitAll(root: string, message: string): void {
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', message]);
}

export function buildDataLayerOrigin(history: DataLayerHistory): string {
  const origin = mkdtempSync(join(tmpdir(), `cejel-verdict-cap-${history}-`));
  git(origin, ['init', '--quiet']);
  write(
    origin,
    'package.json',
    `${JSON.stringify(
      {
        name: 'data-layer-fixture',
        version: '1.0.0',
        type: 'module',
        scripts: { test: 'node --test' },
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
        name: 'data-layer-fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'data-layer-fixture', version: '1.0.0' } },
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
  write(origin, 'migrations/001_init.sql', 'CREATE TABLE items (id integer primary key, name text);\n');
  write(origin, '.github/workflows/ci.yml', CI_WORKFLOW);
  write(origin, '.github/pull_request_template.md', '## Summary\n\n## Testing\n');
  write(origin, 'README.md', '# data-layer-fixture\n');
  commitAll(origin, 'initial');
  if (history === 'secret-deleted') {
    write(origin, '.env', `STRIPE_SECRET_KEY=${SYNTHETIC_STRIPE_KEY}\n`);
    commitAll(origin, 'add env');
    rmSync(join(origin, '.env'));
    commitAll(origin, 'remove env');
  }
  for (let index = 1; index <= FILLER_COMMITS; index += 1) {
    write(origin, 'README.md', `# data-layer-fixture\n\nrevision ${index}\n`);
    commitAll(origin, `Merge pull request #${index} from contributor/topic-${index}`);
  }
  return origin;
}
