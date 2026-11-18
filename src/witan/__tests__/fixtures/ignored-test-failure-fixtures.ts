import type { DisclosureGapFixture } from './disclosure-gap-fixtures.js';

// IGNORED-TEST-FAILURE FIXTURES: B3 counted workflows in which a failing test command is ignored.
//
// Minimal synthetic repositories, built and committed at test time by buildDisclosureGapFixture
// (disclosure-gap-fixtures.ts). Each planted shape has a control that differs only in the planted
// condition, plus corners the disclosure must NOT name: a workflow B3 does not count, a later line
// that can still fail the step, a Windows runner (whose default shell is PowerShell), quoted text,
// and a continue-on-error whose value is not the literal `true`.

const NODE_APP: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    {
      name: 'slots',
      version: '1.0.0',
      scripts: { test: 'vitest run', lint: 'eslint .', build: 'tsc' },
      devDependencies: { vitest: '^2.0.0', eslint: '^9.0.0', typescript: '^5.0.0' },
    },
    null,
    2,
  )}\n`,
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'README.md': '# slots\n\nA small booking service.\n',
  'src/index.ts': 'export function slot(n: number): number {\n  return n + 1;\n}\n',
  'src/index.test.ts':
    "import { expect, test } from 'vitest';\nimport { slot } from './index';\n\ntest('slot', () => {\n  expect(slot(1)).toBe(2);\n});\n",
};

const TRIGGERS = 'on:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n';

/** A workflow with one job, `test`, whose steps are given as lines under `steps:`. */
function workflow(name: string, steps: string, options: { jobKeys?: string; on?: string; runsOn?: string } = {}): string {
  return `name: ${name}\n${options.on ?? TRIGGERS}jobs:\n  test:\n    runs-on: ${options.runsOn ?? 'ubuntu-latest'}\n${options.jobKeys ?? ''}    steps:\n      - uses: actions/checkout@v4\n${steps}`;
}

const CHECKOUT_AND_TEST = '      - run: pnpm test\n';

export const IGNORED_TEST_FAILURE_FIXTURES: readonly DisclosureGapFixture[] = [
  {
    name: 'itf-step-continue-on-error',
    purpose: 'The test step carries continue-on-error: true. Named, at the test command line.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - name: unit tests\n        continue-on-error: true\n        run: pnpm test\n'),
    },
  },
  {
    name: 'itf-job-continue-on-error',
    purpose: 'The job that runs the tests carries continue-on-error: true. Named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', CHECKOUT_AND_TEST, { jobKeys: '    continue-on-error: true\n' }),
    },
  },
  {
    name: 'itf-or-true',
    purpose: 'The test command ends in || true. Named.',
    files: { ...NODE_APP, '.github/workflows/test.yml': workflow('test', '      - run: pnpm test || true\n') },
  },
  {
    name: 'itf-or-exit-0-in-block',
    purpose: 'In a run block, the test command ends in || exit 0 and nothing after it can fail the step. Named.',
    files: {
      ...NODE_APP,
      '.github/workflows/ci.yml': workflow('ci', '      - run: |\n          pnpm install\n          pnpm test || exit 0\n'),
    },
  },
  {
    name: 'itf-two-workflows',
    purpose: 'Two counted workflows, each ignoring a failing test command its own way, and a third that does not. Both named, in file order.',
    files: {
      ...NODE_APP,
      '.github/workflows/a-unit.yml': workflow('unit', '      - run: pnpm test || true\n'),
      '.github/workflows/b-e2e.yml': workflow('e2e', '      - continue-on-error: true\n        run: pnpm test\n'),
      '.github/workflows/c-lint.yml': workflow('lint', '      - run: pnpm test\n      - run: pnpm run lint || true\n'),
    },
  },
  // ---- controls -------------------------------------------------------------------------------
  {
    name: 'itf-control-plain',
    purpose: 'Control: the test command fails the step. Nothing named.',
    files: { ...NODE_APP, '.github/workflows/test.yml': workflow('test', CHECKOUT_AND_TEST) },
  },
  {
    name: 'itf-control-continue-on-error-false',
    purpose: 'Control: continue-on-error: false. Nothing named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - continue-on-error: false\n        run: pnpm test\n'),
    },
  },
  {
    name: 'itf-control-continue-on-error-expression',
    purpose: 'Control: continue-on-error set by an expression, which may be false. Nothing named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - continue-on-error: ${{ github.event_name == \'push\' }}\n        run: pnpm test\n'),
    },
  },
  {
    name: 'itf-control-or-true-on-lint',
    purpose: 'Control: || true follows a lint command, not the test command. Nothing named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - run: pnpm test\n      - run: pnpm run lint || true\n'),
    },
  },
  {
    name: 'itf-control-or-exit-1',
    purpose: 'Control: the fallback after the test command exits 1. Nothing named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - run: pnpm test || (echo "tests failed"; exit 1)\n'),
    },
  },
  {
    name: 'itf-control-later-line-can-fail',
    purpose: 'Control: a later line in the same step can still fail it. Nothing named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - run: |\n          pnpm test || true\n          test -f junit.xml || exit 1\n'),
    },
  },
  {
    name: 'itf-control-not-counted',
    purpose: 'Control: the same continue-on-error test step in a workflow run only by hand, which B3 does not count. Nothing named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', CHECKOUT_AND_TEST),
      '.github/workflows/manual.yml': workflow('manual', '      - continue-on-error: true\n        run: pnpm test\n', {
        on: 'on:\n  workflow_dispatch:\n',
      }),
    },
  },
  {
    name: 'itf-control-windows-runner',
    purpose: 'Control: || true on a Windows runner, whose default shell is PowerShell. Not named for || true.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - run: pnpm test || true\n', { runsOn: 'windows-latest' }),
    },
  },
  {
    name: 'itf-control-quoted',
    purpose: 'Control: the shape appears only inside quoted text. Nothing named.',
    files: {
      ...NODE_APP,
      '.github/workflows/test.yml': workflow('test', '      - run: pnpm test\n      - run: echo "run pnpm test || true locally"\n'),
    },
  },
];

export function ignoredTestFailureFixture(name: string): DisclosureGapFixture {
  const found = IGNORED_TEST_FAILURE_FIXTURES.find((fixture) => fixture.name === name);
  if (!found) throw new Error(`unknown ignored-test-failure fixture: ${name}`);
  return found;
}
