import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { HERMETIC_GIT_ENV } from './behaviour-corpus.js';

// DISCLOSURE-GAP FIXTURES: A2 placeholder set-aside and gitignore citation, B2 trigger labels,
// B3 counted workflows not shown to run a check.
//
// Each shape was reproduced on a constructed demo repository scanned by 0.6.7 under v17. These
// are minimal synthetic repositories written from scratch, materialised and committed at test
// time like the behaviour corpus (behaviour-corpus.ts explains why fixtures are not tracked
// files). Fixtures come in control/change pairs that differ only in the planted condition, plus
// corners that pin what the disclosure must NOT say.
//
// Secret-shaped values are assembled from segments so none appears as one contiguous literal in
// this file (calibration-fixtures.ts gives the reasons). The AWS pair is the one AWS documents as
// an example; the "unmarked" pair is synthetic and carries no placeholder marker.

const AWS_DOC_ACCESS_KEY_ID = ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('');
const AWS_DOC_SECRET_ACCESS_KEY = ['wJalrXUtnFEMI', 'K7MDENG', 'bPxRfiCYEXAMPLEKEY'].join('/');
const UNMARKED_ACCESS_KEY_ID = ['AKIA', 'Q3ZT7VWX', 'L4MN2PRS'].join('');
const UNMARKED_SECRET_ACCESS_KEY = ['Hq8vR2mZ', 'pL5xW9tK', 'c3NbF7yJ', 'd1GsA6uE', 'r4ToY0iM'].join('');

export interface DisclosureGapFixture {
  readonly name: string;
  readonly purpose: string;
  readonly files: Readonly<Record<string, string>>;
  /** Branches created at HEAD besides `main`. */
  readonly extraBranches?: readonly string[];
  /** Check out HEAD detached, as a CI runner does. */
  readonly detached?: boolean;
}

const GITIGNORE_ENV = '.env\nnode_modules\n';

const NODE_APP: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    {
      name: 'slots',
      version: '1.0.0',
      scripts: { test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit', build: 'tsc' },
      devDependencies: { vitest: '^2.0.0', eslint: '^9.0.0', typescript: '^5.0.0' },
    },
    null,
    2,
  )}\n`,
  'README.md': '# slots\n\nA small booking service.\n',
  'src/index.ts':
    'export function slot(n: number): number {\n  return process.env.DATABASE_HOST ? n : 0;\n}\n',
  'src/index.test.ts':
    "import { expect, test } from 'vitest';\nimport { slot } from './index';\n\ntest('slot', () => {\n  expect(slot(1)).toBe(1);\n});\n",
};

const TEST_WORKFLOW =
  'name: test\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm test\n';
const PRINT_ONLY_WORKFLOW =
  'name: e2e\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\njobs:\n  e2e:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "e2e skipped"\n';
const DISPATCH_ONLY_WORKFLOW =
  'name: release\non:\n  workflow_dispatch:\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm run build\n';
const MASTER_ONLY_WORKFLOW =
  'name: security\non:\n  push:\n    branches: [master]\n  pull_request:\n    branches:\n      - master\njobs:\n  audit:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm audit --prod\n';

function envFile(accessKeyId: string, secretAccessKey: string): string {
  return `AWS_ACCESS_KEY_ID=${accessKeyId}\nAWS_SECRET_ACCESS_KEY=${secretAccessKey}\nDATABASE_HOST=localhost\n`;
}

export const DISCLOSURE_GAP_FIXTURES: readonly DisclosureGapFixture[] = [
  // ---- A2 ---------------------------------------------------------------------------------
  {
    name: 'a2-doc-example-pair-in-committed-env-file',
    purpose:
      'The AWS documentation pair in a committed config/dev.env beside a .gitignore .env rule: set aside as placeholders (unchanged), now named; the gitignore citation names the committed file.',
    files: {
      ...NODE_APP,
      '.gitignore': GITIGNORE_ENV,
      'config/dev.env': envFile(AWS_DOC_ACCESS_KEY_ID, AWS_DOC_SECRET_ACCESS_KEY),
    },
  },
  {
    name: 'a2-control-non-credential-placeholders',
    purpose:
      'Control: the same committed env file holding placeholders that are not credential-shaped (your-api-key). Nothing credential-shaped is set aside, so nothing is named; the citation still names the committed file.',
    files: {
      ...NODE_APP,
      '.gitignore': GITIGNORE_ENV,
      'config/dev.env':
        'AWS_ACCESS_KEY_ID=your-access-key-id\nAWS_SECRET_ACCESS_KEY=your-secret-access-key\nDATABASE_HOST=localhost\n',
    },
  },
  {
    name: 'a2-control-template-only',
    purpose:
      'Control: a .gitignore .env rule and only a .env.example template. The citation keeps ".env files are gitignored".',
    files: {
      ...NODE_APP,
      '.gitignore': GITIGNORE_ENV,
      '.env.example': 'AWS_ACCESS_KEY_ID=\nAWS_SECRET_ACCESS_KEY=\n',
    },
  },
  {
    name: 'a2-unmarked-pair-in-committed-env-file',
    purpose:
      'Corner: the same file with an AKIA-shaped id and a high-entropy secret carrying no placeholder marker. Detection is unchanged (critical); nothing is described as set aside.',
    files: {
      ...NODE_APP,
      '.gitignore': GITIGNORE_ENV,
      'config/dev.env': envFile(UNMARKED_ACCESS_KEY_ID, UNMARKED_SECRET_ACCESS_KEY),
    },
  },
  {
    name: 'a2-doc-example-id-in-source',
    purpose:
      'The documentation access key id assigned in a source file: set aside and named by path.',
    files: {
      ...NODE_APP,
      '.gitignore': GITIGNORE_ENV,
      'src/creds.ts': `export const awsAccessKey = '${AWS_DOC_ACCESS_KEY_ID}';\n`,
    },
  },
  {
    name: 'a2-not-applicable-with-set-aside',
    purpose:
      'A2 not applicable (no .env surface, no data layer), with a documentation key id in a source file: the not-applicable reason also names what was set aside.',
    files: {
      'README.md': '# tool\n',
      'tool.py': `aws_access_key = "${AWS_DOC_ACCESS_KEY_ID}"\n\n\ndef run():\n    return aws_access_key\n`,
    },
  },
  // ---- B2 and B3 --------------------------------------------------------------------------
  {
    name: 'b2b3-planted-workflows',
    purpose:
      'Five workflows: test (PR), e2e (PR, echo only), release (manual dispatch only), security (push and PR to master; the checkout is on main and holds no master). B2 labels release by its trigger; B3 names e2e and security.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': TEST_WORKFLOW,
      '.github/workflows/e2e.yml': PRINT_ONLY_WORKFLOW,
      '.github/workflows/release.yml': DISPATCH_ONLY_WORKFLOW,
      '.github/workflows/security.yml': MASTER_ONLY_WORKFLOW,
    },
  },
  {
    name: 'b2b3-control-pr-workflows',
    purpose:
      'Control: the same repository where every workflow runs a check on pull requests to main. No label or note changes.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': TEST_WORKFLOW,
      '.github/workflows/lint.yml': TEST_WORKFLOW.replace('name: test', 'name: lint').replace(
        'pnpm test',
        'pnpm exec eslint .',
      ),
    },
  },
  {
    name: 'b3-master-target-with-master-branch',
    purpose:
      'Corner: the master-only workflow in a checkout that also holds a master branch. Not named.',
    files: { ...NODE_APP, '.github/workflows/security.yml': MASTER_ONLY_WORKFLOW },
    extraBranches: ['master'],
  },
  {
    name: 'b3-master-target-detached',
    purpose:
      'Corner: the master-only workflow in a detached checkout, as on a CI runner. The checkout branch is unknown, so nothing is claimed.',
    files: { ...NODE_APP, '.github/workflows/security.yml': MASTER_ONLY_WORKFLOW },
    detached: true,
  },
  {
    name: 'b3-echo-with-action',
    purpose:
      'Corner: an echo step beside a third-party action. The action runs code the file does not show, so the workflow is not described as print-only.',
    files: {
      ...NODE_APP,
      '.github/workflows/e2e.yml': PRINT_ONLY_WORKFLOW.replace(
        '      - run: echo "e2e skipped"\n',
        '      - uses: cypress-io/github-action@v6\n      - run: echo "done"\n',
      ),
    },
  },
  {
    name: 'b3-echo-with-substitution',
    purpose:
      'Corner: an echo whose argument runs a command substitution. Not claimed as print-only.',
    files: {
      ...NODE_APP,
      '.github/workflows/e2e.yml': PRINT_ONLY_WORKFLOW.replace(
        'echo "e2e skipped"',
        'echo "$(pnpm test)"',
      ),
    },
  },
  {
    name: 'b2-gitlab-ci',
    purpose: 'A GitLab CI file: cited without a pull-request claim, since its trigger is not read.',
    files: {
      ...NODE_APP,
      '.gitlab-ci.yml': 'test:\n  image: node:22\n  script:\n    - pnpm test\n',
    },
  },
];

export function disclosureGapFixture(name: string): DisclosureGapFixture {
  const found = DISCLOSURE_GAP_FIXTURES.find((fixture) => fixture.name === name);
  if (!found) throw new Error(`unknown disclosure-gap fixture: ${name}`);
  return found;
}

/** Materialise a fixture into a fresh temp directory with one hermetic commit. */
export function buildDisclosureGapFixture(fixture: DisclosureGapFixture): string {
  const dir = mkdtempSync(join(tmpdir(), `cejel-disclosure-gap-${fixture.name}-`));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  for (const [relativePath, contents] of Object.entries(fixture.files)) {
    const fullPath = join(dir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', 'initial commit']);
  for (const branch of fixture.extraBranches ?? []) git(dir, ['branch', branch]);
  if (fixture.detached) git(dir, ['checkout', '--quiet', '--detach']);
  return dir;
}

function git(dir: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: dir, env: HERMETIC_GIT_ENV, encoding: 'utf8' });
}
