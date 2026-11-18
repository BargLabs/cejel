import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkRepository,
  checkRequirements,
  checkWorkflow,
  configIgnores,
  inlineIgnores,
  zizmorInputs,
} from './check-workflow-lint-gate.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every ignore in the repository, inline and in .github/zizmor.yml. Adding or removing an ignore
// changes this number, so the change shows up in a test a reviewer reads.
const EXPECTED_IGNORE_COUNT = 36;

const HASH = 'a'.repeat(64);
const REQUIREMENTS = `zizmor==1.32.0 --hash=sha256:${HASH}\n`;

const WORKFLOW = `name: Workflow lint

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  workflow-lint:
    name: workflow-lint
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          persist-credentials: false
      - name: Run the gate's own tests before trusting it
        run: node --test scripts/check-workflow-lint-gate.node-test.mjs
      - name: Install zizmor
        run: |
          python3 -m venv "$RUNNER_TEMP/zizmor-venv"
          "$RUNNER_TEMP/zizmor-venv/bin/pip" install --require-hashes --only-binary :all: -r .github/zizmor-requirements.txt
      - name: Lint every workflow and Action definition with zizmor
        run: '"$RUNNER_TEMP/zizmor-venv/bin/zizmor" --offline --collect=all --config .github/zizmor.yml .'
`;

const CONFIG = `rules:
  dangerous-triggers:
    ignore:
      - other.yml:3 # the trigger is needed for the reason given in its header
`;

const OTHER = `name: other
on:
  pull_request_target: # zizmor: ignore[dangerous-triggers] judged from the base branch on purpose
jobs: {}
`;

function fixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-lint-gate-'));
  const all = {
    '.github/zizmor-requirements.txt': REQUIREMENTS,
    '.github/workflows/workflow-lint.yml': WORKFLOW,
    '.github/zizmor.yml': CONFIG,
    '.github/workflows/other.yml': OTHER,
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function problemsOf(files) {
  const root = fixture(files);
  try {
    return checkRepository(root).problems;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function assertRefused(files, pattern) {
  const problems = problemsOf(files);
  assert.ok(
    problems.some((problem) => pattern.test(problem)),
    `expected a problem matching ${pattern}, got:\n${problems.join('\n') || '(none)'}`,
  );
}

test('the fixture repository passes, with one inline and one configuration ignore', () => {
  const root = fixture();
  try {
    const result = checkRepository(root);
    assert.deepEqual(result.problems, []);
    assert.equal(result.ignores.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- the pin -------------------------------------------------------------------------------------

test('refuses a missing requirements file', () => {
  assertRefused({ '.github/zizmor-requirements.txt': null }, /zizmor-requirements\.txt.*missing/);
});

test('refuses a requirement without a hash', () => {
  assert.notDeepEqual(checkRequirements('zizmor==1.32.0\n'), []);
  assertRefused({ '.github/zizmor-requirements.txt': 'zizmor==1.32.0\n' }, /sha256/);
});

test('refuses a requirement that is not pinned with ==', () => {
  assertRefused({ '.github/zizmor-requirements.txt': `zizmor>=1.32.0 --hash=sha256:${HASH}\n` }, /zizmor==/);
});

test('refuses two hashes on the requirement', () => {
  assertRefused(
    { '.github/zizmor-requirements.txt': `zizmor==1.32.0 --hash=sha256:${HASH} --hash=sha256:${'b'.repeat(64)}\n` },
    /exactly one sha256/,
  );
});

test('refuses a second requirement', () => {
  assertRefused(
    { '.github/zizmor-requirements.txt': `${REQUIREMENTS}rich==13.0.0 --hash=sha256:${HASH}\n` },
    /exactly one requirement/,
  );
});

test('refuses a short hash', () => {
  assertRefused({ '.github/zizmor-requirements.txt': 'zizmor==1.32.0 --hash=sha256:abc\n' }, /sha256/);
});

// --- the workflow --------------------------------------------------------------------------------

test('refuses a missing workflow', () => {
  assertRefused({ '.github/workflows/workflow-lint.yml': null }, /workflow-lint\.yml.*missing/);
});

test('refuses a zizmor run without --offline', () => {
  assert.notDeepEqual(checkWorkflow(WORKFLOW.replace(' --offline', '')), []);
  assertRefused({ '.github/workflows/workflow-lint.yml': WORKFLOW.replace(' --offline', '') }, /--offline/);
});

test('refuses continue-on-error on the zizmor step or the job', () => {
  const stepLevel = WORKFLOW.replace(
    '      - name: Lint every workflow',
    '      - continue-on-error: true\n        name: Lint every workflow',
  );
  assertRefused({ '.github/workflows/workflow-lint.yml': stepLevel }, /continue-on-error/);
  const jobLevel = WORKFLOW.replace('    runs-on: ubuntu-24.04', '    continue-on-error: true\n    runs-on: ubuntu-24.04');
  assertRefused({ '.github/workflows/workflow-lint.yml': jobLevel }, /continue-on-error/);
});

test('refuses || true, || : and set +e', () => {
  for (const softener of [' || true', ' || :', ' || exit 0']) {
    const text = WORKFLOW.replace("--config .github/zizmor.yml .'", `--config .github/zizmor.yml .${softener}'`);
    assertRefused({ '.github/workflows/workflow-lint.yml': text }, /swallows|exit status/);
  }
  const setE = WORKFLOW.replace(
    "        run: '\"$RUNNER_TEMP/zizmor-venv/bin/zizmor\"",
    "        run: 'set +e; \"$RUNNER_TEMP/zizmor-venv/bin/zizmor\"",
  );
  assertRefused({ '.github/workflows/workflow-lint.yml': setE }, /set \+e/);
});

test('refuses the exit-code flag and every severity or confidence filter', () => {
  for (const flag of ['--no-exit-codes', '--min-severity=high', '--min-severity high', '--min-confidence=high']) {
    const text = WORKFLOW.replace('--offline', `--offline ${flag}`);
    assertRefused({ '.github/workflows/workflow-lint.yml': text }, /exit-code|severity|confidence/);
  }
  const viaEnv = WORKFLOW.replace(
    '      - name: Lint every workflow and Action definition with zizmor\n',
    '      - name: Lint every workflow and Action definition with zizmor\n        env:\n          ZIZMOR_MIN_SEVERITY: high\n',
  );
  assertRefused({ '.github/workflows/workflow-lint.yml': viaEnv }, /severity/);
});

test('refuses a flag on a continuation line of the zizmor command', () => {
  const continued = WORKFLOW.replace(
    "        run: '\"$RUNNER_TEMP/zizmor-venv/bin/zizmor\" --offline --collect=all --config .github/zizmor.yml .'\n",
    '        run: |\n          "$RUNNER_TEMP/zizmor-venv/bin/zizmor" --offline --collect=all \\\n            --no-exit-codes --config .github/zizmor.yml .\n',
  );
  assert.notEqual(continued, WORKFLOW);
  assertRefused({ '.github/workflows/workflow-lint.yml': continued }, /exit-code/);
});

test('refuses a workflow with no zizmor run, or with two', () => {
  const none = WORKFLOW.replace(/ {6}- name: Lint every workflow[\s\S]*$/, '');
  assertRefused({ '.github/workflows/workflow-lint.yml': none }, /exactly one zizmor/);
  const two = `${WORKFLOW}      - run: '"$RUNNER_TEMP/zizmor-venv/bin/zizmor" --offline .github/workflows'\n`;
  assertRefused({ '.github/workflows/workflow-lint.yml': two }, /exactly one zizmor/);
});

test('reads the inputs of a zizmor command, skipping flags and their values', () => {
  assert.deepEqual(zizmorInputs('"$RUNNER_TEMP/zizmor-venv/bin/zizmor" --offline --config .github/zizmor.yml .\''), ['.']);
  assert.deepEqual(zizmorInputs('zizmor --offline -c .github/zizmor.yml --format=github . .github/workflows'), [
    '.',
    '.github/workflows',
  ]);
  assert.deepEqual(zizmorInputs('zizmor --offline --persona pedantic action.yml; echo done'), ['action.yml']);
  assert.deepEqual(zizmorInputs('zizmor --offline . > out.txt'), ['.']);
});

test('refuses a zizmor command that lints anything other than the repository root', () => {
  const lint = "--config .github/zizmor.yml .'";
  for (const narrowed of [
    "--config .github/zizmor.yml .github/workflows'",
    "--config .github/zizmor.yml action.yml'",
    "--config .github/zizmor.yml ./'",
    "--config .github/zizmor.yml . .github/workflows'",
    "--config .github/zizmor.yml'",
    "--config .github/zizmor.yml --some-new-flag .github/workflows .'",
  ]) {
    assertRefused({ '.github/workflows/workflow-lint.yml': WORKFLOW.replace(lint, narrowed) }, /repository root/);
  }
});

test('refuses a zizmor command without --collect=all, or with another --collect', () => {
  const without = WORKFLOW.replace(' --collect=all', '');
  assertRefused({ '.github/workflows/workflow-lint.yml': without }, /--collect=all/);
  for (const collect of ['--collect=workflows', '--collect workflows', '--collect=default', '--collect=all,actions']) {
    const text = WORKFLOW.replace('--collect=all', collect);
    assertRefused({ '.github/workflows/workflow-lint.yml': text }, /--collect=all/);
  }
  const twice = WORKFLOW.replace('--collect=all', '--collect=all --collect=workflows');
  assertRefused({ '.github/workflows/workflow-lint.yml': twice }, /--collect=all/);
});

test('refuses a checkout that moves, narrows or replaces the tree zizmor lints', () => {
  const checkout = '        with:\n          persist-credentials: false\n';
  for (const input of [
    'path: repo',
    'sparse-checkout: .github',
    'sparse-checkout-cone-mode: false',
    'ref: main',
    'repository: someone/else',
  ]) {
    const text = WORKFLOW.replace(checkout, `${checkout}          ${input}\n`);
    assertRefused({ '.github/workflows/workflow-lint.yml': text }, new RegExp(`checkout sets ${input.split(':')[0]}:`));
  }
  const multiline = WORKFLOW.replace(checkout, `${checkout}          sparse-checkout: |\n            .github\n            action.yml\n`);
  assertRefused({ '.github/workflows/workflow-lint.yml': multiline }, /checkout sets sparse-checkout:/);
  const flow = WORKFLOW.replace(checkout, '        with: { persist-credentials: false, path: repo }\n');
  assertRefused({ '.github/workflows/workflow-lint.yml': flow }, /must be a block/);
  const nameFirst = WORKFLOW.replace(
    '      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n',
    '      - name: Check out\n        with:\n          path: repo\n        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n',
  ).replace(checkout, '');
  assertRefused({ '.github/workflows/workflow-lint.yml': nameFirst }, /checkout sets path:/);
});

test('refuses a workflow with no checkout, or with two', () => {
  const none = WORKFLOW.replace(/ {6}- uses: actions\/checkout@\S+ # v4\n {8}with:\n {10}persist-credentials: false\n/, '');
  assert.notEqual(none, WORKFLOW);
  assertRefused({ '.github/workflows/workflow-lint.yml': none }, /exactly one actions\/checkout step; found 0/);
  const two = WORKFLOW.replace(
    "      - name: Run the gate's own tests",
    "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n      - name: Run the gate's own tests",
  );
  assertRefused({ '.github/workflows/workflow-lint.yml': two }, /exactly one actions\/checkout step; found 2/);
});

test('refuses a working-directory and a change of directory', () => {
  const stepDir = WORKFLOW.replace(
    '      - name: Lint every workflow and Action definition with zizmor\n',
    '      - name: Lint every workflow and Action definition with zizmor\n        working-directory: .github/workflows\n',
  );
  assertRefused({ '.github/workflows/workflow-lint.yml': stepDir }, /working-directory/);
  const defaultsDir = WORKFLOW.replace(
    'permissions:\n',
    'defaults:\n  run:\n    working-directory: .github/workflows\npermissions:\n',
  );
  assertRefused({ '.github/workflows/workflow-lint.yml': defaultsDir }, /working-directory/);
  for (const move of ['cd .github/workflows && ', 'pushd .github; ']) {
    const text = WORKFLOW.replace(
      "        run: '\"$RUNNER_TEMP/zizmor-venv/bin/zizmor\"",
      `        run: '${move}"$RUNNER_TEMP/zizmor-venv/bin/zizmor"`,
    );
    assertRefused({ '.github/workflows/workflow-lint.yml': text }, /changes directory/);
  }
});

test('refuses a paths: or paths-ignore: filter', () => {
  for (const key of ['paths', 'paths-ignore']) {
    const text = WORKFLOW.replace('    branches: [main]\n  push:', `    branches: [main]\n    ${key}: ['.github/**']\n  push:`);
    assertRefused({ '.github/workflows/workflow-lint.yml': text }, /paths/);
  }
});

test('refuses a workflow without the pull_request trigger', () => {
  const text = WORKFLOW.replace('  pull_request:\n    branches: [main]\n', '');
  assertRefused({ '.github/workflows/workflow-lint.yml': text }, /pull_request/);
});

test('refuses an install that is not hash-checked from the requirements file', () => {
  const text = WORKFLOW.replace('--require-hashes --only-binary :all: -r .github/zizmor-requirements.txt', 'zizmor==1.32.0');
  assertRefused({ '.github/workflows/workflow-lint.yml': text }, /require-hashes/);
});

test("refuses a zizmor run before the gate's own test", () => {
  const moved = WORKFLOW.replace(
    "      - name: Run the gate's own tests before trusting it\n        run: node --test scripts/check-workflow-lint-gate.node-test.mjs\n",
    '',
  ).concat("      - name: Run the gate's own tests after the fact\n        run: node --test scripts/check-workflow-lint-gate.node-test.mjs\n");
  assertRefused({ '.github/workflows/workflow-lint.yml': moved }, /own node test/);
});

test('a comment naming the refused flags does not trip the workflow check', () => {
  const commented = WORKFLOW.replace(
    'permissions:\n',
    '# The zizmor step carries no --no-exit-codes, no --min-severity and no continue-on-error.\npermissions:\n',
  );
  assert.deepEqual(checkWorkflow(commented), []);
});

// --- the ignores ---------------------------------------------------------------------------------

test('refuses an inline ignore without a reason', () => {
  const text = OTHER.replace(' judged from the base branch on purpose', '');
  assert.notDeepEqual(inlineIgnores('other.yml', text).problems, []);
  assertRefused({ '.github/workflows/other.yml': text }, /other\.yml:3.*reason/);
});

test('refuses an inline ignore whose reason is one or two words', () => {
  assertRefused({ '.github/workflows/other.yml': OTHER.replace('judged from the base branch on purpose', 'deliberate') }, /reason/);
  assertRefused({ '.github/workflows/other.yml': OTHER.replace('judged from the base branch on purpose', '- see header') }, /reason/);
});

test('refuses an inline ignore appended to another comment, which zizmor does not read', () => {
  const text = OTHER.replace('pull_request_target: # zizmor:', 'pull_request_target: # v4 # zizmor:');
  assertRefused({ '.github/workflows/other.yml': text }, /start of its comment/);
});

test('refuses an inline ignore naming more than one rule', () => {
  const text = OTHER.replace('ignore[dangerous-triggers]', 'ignore[dangerous-triggers,artipacked]');
  assertRefused({ '.github/workflows/other.yml': text }, /one rule/);
});

test('reads inline ignores in Action definitions too', () => {
  const action = 'name: a\nruns:\n  using: composite\n  steps:\n    - uses: ./ # zizmor: ignore[self-repository]\n';
  assertRefused({ 'action/action.yml': action }, /action\/action\.yml:5.*reason/);
});

test('refuses a configuration ignore without a reason', () => {
  const text = CONFIG.replace(' # the trigger is needed for the reason given in its header', '');
  assert.notDeepEqual(configIgnores(text).problems, []);
  assertRefused({ '.github/zizmor.yml': text }, /zizmor\.yml:4.*reason/);
});

test('refuses a whole-file configuration ignore', () => {
  assertRefused({ '.github/zizmor.yml': CONFIG.replace('other.yml:3', 'other.yml') }, /whole file/);
});

test('refuses a configuration ignore that names no linted file or a line past its end', () => {
  assertRefused({ '.github/zizmor.yml': CONFIG.replace('other.yml:3', 'gone.yml:3') }, /gone\.yml.*no file/);
  assertRefused({ '.github/zizmor.yml': CONFIG.replace('other.yml:3', 'other.yml:300') }, /past the end/);
});

test('refuses a disabled rule, a rule configuration and a flow-style ignore list', () => {
  assertRefused({ '.github/zizmor.yml': 'rules:\n  artipacked:\n    disable: true\n' }, /disable/);
  assertRefused(
    { '.github/zizmor.yml': 'rules:\n  unpinned-uses:\n    config:\n      policies:\n        "*": any\n' },
    /config/,
  );
  assertRefused({ '.github/zizmor.yml': 'rules:\n  artipacked:\n    ignore: [other.yml:3]\n' }, /flow/);
  assertRefused({ '.github/zizmor.yml': `${CONFIG}extra: 1\n` }, /extra/);
});

test('a missing configuration file is not a problem', () => {
  const root = fixture({ '.github/zizmor.yml': null });
  try {
    const result = checkRepository(root);
    assert.deepEqual(result.problems, []);
    assert.equal(result.ignores.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- this repository -----------------------------------------------------------------------------

test('this repository passes the gate, with the pinned number of ignores', () => {
  const result = checkRepository(REPO);
  assert.deepEqual(result.problems, []);
  assert.equal(
    result.ignores.length,
    EXPECTED_IGNORE_COUNT,
    `ignores now:\n${result.ignores.map((i) => `${i.where} ${i.rule}: ${i.reason}`).join('\n')}`,
  );
});
