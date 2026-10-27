import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

// The fixtures of ci-claims-followups.test.ts (#520, #517), in a module of their own so the same
// fixtures can be scored by an earlier Cejel: ci-claims-main-v27.json pins main's v27 scores for
// every one of them, and the test compares this branch's v27 with that pin as well as with v17.
//
// Fixtures are synthetic, written here from the idiom each issue names; no public repository is
// cloned.

const PY_PROJECT = [
  '[project]',
  'name = "signer"',
  'version = "1.0.0"',
  'dependencies = []',
  '',
  '[dependency-groups]',
  'tests = ["pytest"]',
  '',
  '[tool.pytest.ini_options]',
  'testpaths = ["tests"]',
  '',
].join('\n');

export const PY_SOURCES: Readonly<Record<string, string>> = {
  'README.md': '# signer\n\nSign and verify values.\n',
  LICENSE: 'MIT\n',
  'pyproject.toml': PY_PROJECT,
  'src/signer/__init__.py':
    'import hmac\n\n\ndef sign(key, value):\n    return hmac.new(key, value, "sha256").hexdigest()\n\n\ndef verify(key, value, mac):\n    return hmac.compare_digest(sign(key, value), mac)\n',
  'tests/test_signer.py':
    'from signer import sign, verify\n\n\ndef test_roundtrip():\n    assert verify(b"k", b"v", sign(b"k", b"v"))\n\n\ndef test_tamper():\n    assert not verify(b"k", b"w", sign(b"k", b"v"))\n',
};

export const PY_PROJECT_WITH_TOX = `${PY_PROJECT}[tool.tox]\nenv_list = ["py3"]\n\n[tool.tox.env_run_base]\nrunner = "uv-venv-lock-runner"\ndependency_groups = ["tests"]\ncommands = [["pytest"]]\n`;

const UV_LOCK =
  'version = 1\nrequires-python = ">=3.9"\n\n[[package]]\nname = "signer"\nversion = "1.0.0"\nsource = { editable = "." }\n';

const PR_AND_MAIN = 'on:\n  pull_request:\n  push:\n    branches: [main]\n';
const PUSH_MAIN = 'on:\n  push:\n    branches: [main]\n';

function fixture(name: string, issue: '#517' | '#520', purpose: string, ...commits: Record<string, string | null>[]): FalseAssuranceFixture {
  return { name, issue, purpose, commits };
}

// ---- #520 fixtures ----------------------------------------------------------------------------

// Line 12 is the first step after checkout and setup.
export const testsWorkflow = (steps: string, runsOn = 'ubuntu-latest'): string =>
  `name: Tests\n${PR_AND_MAIN}jobs:\n  tests:\n    runs-on: ${runsOn}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n${steps}`;

// The same job on a matrix of hosted runners; line 15 is the first step after checkout and setup.
const matrixTestsWorkflow = (steps: string): string =>
  `name: Tests\n${PR_AND_MAIN}jobs:\n  tests:\n    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest]\n    runs-on: \${{ matrix.os }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n${steps}`;

const SYNC_THEN_RUN = '      - run: uv sync --locked\n      - run: uv run pytest\n';

const HASHED_REQUIREMENTS =
  'pytest==8.3.3 \\\n    --hash=sha256:70b98107bd648308a7952b06e6ca9a50bc660be218d53c257cc1fc94fda10181\n';

// A local composite action, as GitHub reads it from `uses: ./.github/actions/<name>`.
const compositeAction = (steps: string): string =>
  `name: Prepare\ndescription: Prepare the environment\nruns:\n  using: composite\n  steps:\n${steps}`;

export const FIXTURES_520: readonly FalseAssuranceFixture[] = [
  fixture('uv-sync-then-run-with-lockfile', '#520', 'Control: `uv sync --locked`, then `uv run pytest`, with uv.lock committed.', {
    ...PY_SOURCES,
    'uv.lock': UV_LOCK,
    '.github/workflows/tests.yaml': testsWorkflow(SYNC_THEN_RUN),
  }),
  fixture(
    'uv-sync-then-run-lockfile-deleted',
    '#520',
    'Change: uv.lock deleted while CI runs `uv sync --locked` and then `uv run pytest` (the standard uv shape).',
    { ...PY_SOURCES, 'uv.lock': UV_LOCK, '.github/workflows/tests.yaml': testsWorkflow(SYNC_THEN_RUN) },
    { 'uv.lock': null },
  ),
  fixture('uv-sync-frozen-then-run-lockfile-deleted', '#520', 'Change: the same shape with `--frozen`.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: uv sync --frozen\n      - run: uv run pytest\n'),
  }),
  fixture('uv-sync-then-run-one-step', '#520', 'Change: both commands on their own lines in one step.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: |\n          uv sync --locked\n          uv run pytest\n'),
  }),
  fixture('uv-run-before-sync', '#520', 'Corner: `uv run` comes first and may write uv.lock before the locked sync.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: uv run pytest\n      - run: uv sync --locked\n'),
  }),
  fixture('uv-run-in-another-job', '#520', 'Corner: another job runs `uv run`; jobs are not ordered against each other, so nothing is claimed.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': `${testsWorkflow(SYNC_THEN_RUN.replace('      - run: uv run pytest\n', ''))}  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: uv run ruff check\n`,
  }),
  fixture('uv-sync-in-and-list', '#520', 'Corner: `uv sync --locked && echo` does not stop the step under bash -e, so the next line runs.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: |\n          uv sync --locked && echo synced\n          uv run pytest\n'),
  }),
  fixture('uv-sync-piped', '#520', 'Corner: a pipeline takes its last command\'s status, so the failing sync does not stop the job.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: uv sync --locked | tee sync.log\n      - run: uv run pytest\n'),
  }),
  // A step whose `run:` is one command fails when that command fails, in every shell GitHub
  // provides: bash and sh run with -e, pwsh and powershell end with the last exit code, and cmd
  // returns the last command's status. So the later step never runs, whatever the runner.
  fixture('uv-sync-then-run-windows', '#520', 'Change: the separate-step shape on a Windows runner, whose default shell is pwsh.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow(SYNC_THEN_RUN, 'windows-latest'),
  }),
  fixture('uv-sync-then-run-matrix-os', '#520', 'Change: the separate-step shape on `runs-on: ${{ matrix.os }}` over ubuntu and macos.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': matrixTestsWorkflow(SYNC_THEN_RUN),
  }),
  fixture('uv-sync-then-run-shell-bash', '#520', 'Change: the separate-step shape with `shell: bash` on each step.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: uv sync --locked\n        shell: bash\n      - run: uv run pytest\n        shell: bash\n'),
  }),
  fixture(
    'uv-sync-then-run-one-step-windows',
    '#520',
    'Corner: both commands in one step under pwsh, which runs the next line after a failing native command.',
    { ...PY_SOURCES, '.github/workflows/tests.yaml': testsWorkflow('      - run: |\n          uv sync --locked\n          uv run pytest\n', 'windows-latest') },
  ),
  fixture('pip-require-hashes-file-deleted', '#520', 'Change: CI installs with `--require-hashes` from a requirements file that is not committed.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: pip install --require-hashes -r requirements/ci.txt\n      - run: pytest\n'),
  }),
  fixture('pip-require-hashes-file-committed', '#520', 'Control: the hash-pinned requirements file is committed.', {
    ...PY_SOURCES,
    'requirements/ci.txt': HASHED_REQUIREMENTS,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: pip install --require-hashes -r requirements/ci.txt\n      - run: pytest\n'),
  }),
  fixture('pip-without-require-hashes', '#520', 'Corner: a plain `pip install -r` is not a lockfile requirement.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: pip install -r requirements/ci.txt\n      - run: pytest\n'),
  }),
  fixture('pip-require-hashes-compiled-first', '#520', 'Corner: CI writes the requirements file before installing from it.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow(
      '      - run: uv pip compile --generate-hashes pyproject.toml -o requirements/ci.txt\n      - run: pip install --require-hashes -r requirements/ci.txt\n',
    ),
  }),
  // An earlier `uses:` step. Line 12 is that step, line 13 the requiring step.
  fixture(
    'action-before-sync-then-run',
    '#520',
    'Not determined: a third-party action Cejel does not read runs before `uv sync --locked`, then `uv run pytest`.',
    { ...PY_SOURCES, '.github/workflows/tests.yaml': testsWorkflow(`      - uses: octo-org/prepare-python@v1\n${SYNC_THEN_RUN}`) },
  ),
  fixture('action-before-sync-only', '#520', 'Not determined: the same action before `uv sync --locked` alone.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow('      - uses: octo-org/prepare-python@v1\n      - run: uv sync --locked\n'),
  }),
  fixture('local-composite-writes-lockfile', '#520', 'Corner: a local composite action runs `uv lock` before the locked sync, so it may write uv.lock.', {
    ...PY_SOURCES,
    '.github/actions/prepare/action.yml': compositeAction('    - run: uv lock\n      shell: bash\n'),
    '.github/workflows/tests.yaml': testsWorkflow(`      - uses: ./.github/actions/prepare\n${SYNC_THEN_RUN}`),
  }),
  fixture('local-composite-without-writer', '#520', 'Change: a local composite action that writes nothing runs before the shape, and is read as if inline.', {
    ...PY_SOURCES,
    '.github/actions/prepare/action.yml': compositeAction('    - run: echo ready\n      shell: bash\n'),
    '.github/workflows/tests.yaml': testsWorkflow(`      - uses: ./.github/actions/prepare\n${SYNC_THEN_RUN}`),
  }),
  fixture('local-composite-using-action', '#520', 'Not determined: the local composite action itself uses an action Cejel does not read.', {
    ...PY_SOURCES,
    '.github/actions/prepare/action.yml': compositeAction('    - uses: octo-org/prepare-python@v1\n'),
    '.github/workflows/tests.yaml': testsWorkflow(`      - uses: ./.github/actions/prepare\n${SYNC_THEN_RUN}`),
  }),
  fixture('local-javascript-action', '#520', 'Not determined: the local action runs JavaScript, which Cejel does not read.', {
    ...PY_SOURCES,
    '.github/actions/prepare/action.yml': 'name: Prepare\nruns:\n  using: node20\n  main: index.js\n',
    '.github/actions/prepare/index.js': "require('child_process').execSync('uv lock');\n",
    '.github/workflows/tests.yaml': testsWorkflow(`      - uses: ./.github/actions/prepare\n${SYNC_THEN_RUN}`),
  }),
  fixture('action-in-another-job', '#520', 'Control: an action in another job runs in another workspace, so the requirement stands.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': `${testsWorkflow(SYNC_THEN_RUN)}  docs:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: octo-org/prepare-python@v1\n`,
  }),
  fixture('tox-action-before-tox', '#520', 'Not determined: the #597 tox shape with an action Cejel does not read in the CI job that runs tox.', {
    ...PY_SOURCES,
    'pyproject.toml': PY_PROJECT_WITH_TOX,
    '.github/workflows/tests.yaml': testsWorkflow('      - uses: octo-org/prepare-python@v1\n      - run: uvx --with tox-uv tox run\n'),
  }),
];

// ---- #517 fixtures ----------------------------------------------------------------------------

const PY_BASE: Readonly<Record<string, string>> = {
  ...PY_SOURCES,
  'uv.lock': UV_LOCK,
  '.github/workflows/tests.yaml': testsWorkflow('      - run: uv run --locked pytest\n'),
  '.github/workflows/pre-commit.yaml': `name: pre-commit\n${PR_AND_MAIN}jobs:\n  main:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n      - run: uv run --locked pre-commit run --all-files\n`,
};

const PUBLISH_STEPS =
  '    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n      - run: uv build\n      - uses: pypa/gh-action-pypi-publish@release/v1\n';

// The same build, published by a run-line command rather than the PyPI action.
const RUN_LINE_PUBLISH_STEPS =
  '    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n      - run: uv build\n      - run: uv publish\n';

// A job beside the publishing job whose matrix is read with fromJSON.
const FROMJSON_MATRIX_JOB =
  "  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        py: ${{ fromJSON('[\"3.12\"]') }}\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo ${{ matrix.py }}\n";

// #517's PyPI shape in one job: build, then publish through the PyPI action, on every push to main
// and with no environment.
function publishWorkflow(options: { on?: string; top?: string; job?: string; steps?: string } = {}): string {
  const { on = PUSH_MAIN, top = '', job = '    runs-on: ubuntu-latest\n', steps = PUBLISH_STEPS } = options;
  return `name: Publish\n${on}${top}jobs:\n  publish:\n${job}    permissions:\n      id-token: write\n${steps}`;
}

const CALLED_PYPI_WORKFLOW = `name: PyPI\non:\n  workflow_call:\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    permissions:\n      id-token: write\n${PUBLISH_STEPS}`;
const callerWorkflow = (target: string, on = PUSH_MAIN): string =>
  `name: Publish\n${on}jobs:\n  publish:\n    uses: ${target}\n    secrets: inherit\n`;

type Shape = readonly [name: string, purpose: string, files: Record<string, string>];

export const EVASIONS: readonly Shape[] = [
  [
    'job-if-ref-is-main',
    "Evasion: `if: github.ref == 'refs/heads/main'` on a workflow that runs only on pushes to main.",
    { '.github/workflows/publish.yaml': publishWorkflow({ job: "    if: github.ref == 'refs/heads/main'\n    runs-on: ubuntu-latest\n" }) },
  ],
  [
    'job-if-not-pull-request',
    "Evasion: `if: github.event_name != 'pull_request'` on a workflow no pull request triggers.",
    { '.github/workflows/publish.yaml': publishWorkflow({ job: "    if: ${{ github.event_name != 'pull_request' }}\n    runs-on: ubuntu-latest\n" }) },
  ],
  [
    'pull-request-in-comment',
    'Evasion: the word pull_request in a comment.',
    { '.github/workflows/publish.yaml': publishWorkflow({ on: 'on:\n  # never on pull_request: this needs the PyPI token\n  push:\n    branches: [main]\n' }) },
  ],
  [
    'matrix-runs-on',
    'Evasion: `runs-on` from a matrix.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    strategy:\n      matrix:\n        os: [ubuntu-latest]\n    runs-on: ${{ matrix.os }}\n' }) },
  ],
  [
    'windows-runner',
    'Evasion: a hosted Windows runner.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    runs-on: windows-latest\n' }) },
  ],
  [
    'list-form-runs-on',
    'Evasion: `runs-on` written as a list.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    runs-on: [ubuntu-latest]\n' }) },
  ],
  [
    'default-shell',
    'Evasion: a workflow-wide default shell.',
    { '.github/workflows/publish.yaml': publishWorkflow({ top: 'defaults:\n  run:\n    shell: bash\n' }) },
  ],
  [
    'reusable-workflow-job',
    'Evasion: the push workflow publishes through a job that calls a reusable workflow in this repository.',
    {
      '.github/workflows/publish.yaml': callerWorkflow('./.github/workflows/pypi.yaml'),
      '.github/workflows/pypi.yaml': CALLED_PYPI_WORKFLOW,
    },
  ],
  // Introduced by #598's whole-file matrix refusal: a fromJSON matrix in a job that does not
  // publish kept the publishing job counted.
  [
    'matrix-in-unrelated-job',
    "Evasion: an unrelated job in the publishing workflow reads its matrix with `fromJSON('[\"3.12\"]')`.",
    { '.github/workflows/publish.yaml': `${publishWorkflow()}${FROMJSON_MATRIX_JOB}` },
  ],
  [
    'job-if-success',
    'Evasion: `if: success()` on the job, which is the default.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    if: success()\n    runs-on: ubuntu-latest\n' }) },
  ],
  [
    'step-if-success-wrapped',
    'Evasion: `if: ${{ success() }}` on the publishing step.',
    {
      '.github/workflows/publish.yaml': publishWorkflow({
        steps: `${PUBLISH_STEPS}        if: \${{ success() }}\n`,
      }),
    },
  ],
  [
    'job-if-not-cancelled',
    'Evasion: `if: ${{ !cancelled() }}` on the job.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    if: ${{ !cancelled() }}\n    runs-on: ubuntu-latest\n' }) },
  ],
  [
    'job-if-always',
    'Evasion: `if: always()` on the job.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    if: always()\n    runs-on: ubuntu-latest\n' }) },
  ],
  [
    'job-if-event-name-upper-case',
    "Evasion: `if: github.event_name == 'PUSH'` on a workflow only a push triggers; GitHub compares strings ignoring case.",
    { '.github/workflows/publish.yaml': publishWorkflow({ job: "    if: github.event_name == 'PUSH'\n    runs-on: ubuntu-latest\n" }) },
  ],
  [
    'job-if-repository-fork-guard',
    "Evasion: a fork guard, `if: github.repository == 'octo-org/signer'`.",
    { '.github/workflows/publish.yaml': publishWorkflow({ job: "    if: github.repository == 'octo-org/signer'\n    runs-on: ubuntu-latest\n" }) },
  ],
  [
    'run-line-publish-list-runs-on',
    'Evasion: a run-line `uv publish` on `runs-on: [ubuntu-latest]`.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    runs-on: [ubuntu-latest]\n', steps: RUN_LINE_PUBLISH_STEPS }) },
  ],
  [
    'run-line-publish-default-shell-bash',
    'Evasion: a run-line `uv publish` under `defaults: run: shell: bash`.',
    { '.github/workflows/publish.yaml': publishWorkflow({ top: 'defaults:\n  run:\n    shell: bash\n', steps: RUN_LINE_PUBLISH_STEPS }) },
  ],
];

export const CONTROLS_517: readonly Shape[] = [
  [
    'job-if-ref-is-main-any-branch',
    "Control: `if: github.ref == 'refs/heads/main'` on a workflow every branch push triggers is a gate.",
    { '.github/workflows/publish.yaml': publishWorkflow({ on: 'on:\n  push:\n', job: "    if: github.ref == 'refs/heads/main'\n    runs-on: ubuntu-latest\n" }) },
  ],
  [
    'job-if-dispatch-only',
    'Control: a condition true only for one of two triggers is a gate.',
    {
      '.github/workflows/publish.yaml': publishWorkflow({
        on: 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
        job: "    if: github.event_name == 'workflow_dispatch'\n    runs-on: ubuntu-latest\n",
      }),
    },
  ],
  [
    'job-if-ref-is-main-with-tags',
    'Control: a push trigger that also matches tags can run with a ref other than main.',
    {
      '.github/workflows/publish.yaml': publishWorkflow({
        on: "on:\n  push:\n    branches: [main]\n    tags: ['v*']\n",
        job: "    if: github.ref == 'refs/heads/main'\n    runs-on: ubuntu-latest\n",
      }),
    },
  ],
  [
    'windows-run-line-publish',
    'Control: on Windows, a publish read only from a `run:` line is not claimed.',
    {
      '.github/workflows/publish.yaml': publishWorkflow({
        job: '    runs-on: windows-latest\n',
        steps: '    steps:\n      - uses: actions/checkout@v4\n      - run: pip install build twine\n      - run: python -m build\n      - run: twine upload dist/*\n',
      }),
    },
  ],
  [
    'remote-reusable-workflow-job',
    'Control: a reusable workflow in another repository is not read.',
    { '.github/workflows/publish.yaml': callerWorkflow('octo-org/release/.github/workflows/pypi.yaml@v1') },
  ],
  [
    'reusable-workflow-guarded-inside',
    'Control: the called workflow publishes only when an input says so.',
    {
      '.github/workflows/publish.yaml': callerWorkflow('./.github/workflows/pypi.yaml'),
      '.github/workflows/pypi.yaml': CALLED_PYPI_WORKFLOW.replace('    runs-on: ubuntu-latest\n', '    if: inputs.publish\n    runs-on: ubuntu-latest\n'),
    },
  ],
  [
    'dynamic-matrix',
    'Control: a matrix read from an expression may be empty, so the job may not run.',
    {
      '.github/workflows/publish.yaml': publishWorkflow({
        job: '    strategy:\n      matrix:\n        os: ${{ fromJSON(vars.PUBLISH_OSES) }}\n    runs-on: ${{ matrix.os }}\n',
      }),
    },
  ],
  [
    'job-if-failure',
    'Control: `if: failure()` can be false, so it is a gate.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    if: failure()\n    runs-on: ubuntu-latest\n' }) },
  ],
  [
    'job-if-event-name-upper-case-two-triggers',
    "Control: `github.event_name == 'PUSH'` on a workflow a dispatch also triggers is a gate.",
    {
      '.github/workflows/publish.yaml': publishWorkflow({
        on: 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
        job: "    if: github.event_name == 'PUSH'\n    runs-on: ubuntu-latest\n",
      }),
    },
  ],
  [
    'job-if-repository-not-equal',
    "Control: `github.repository != 'octo-org/signer'` is false in the repository itself, so it is a gate.",
    { '.github/workflows/publish.yaml': publishWorkflow({ job: "    if: github.repository != 'octo-org/signer'\n    runs-on: ubuntu-latest\n" }) },
  ],
  [
    'run-line-publish-pwsh-shell',
    'Control: a run-line publish under `shell: pwsh` is not read as bash reads it, so it is not claimed.',
    { '.github/workflows/publish.yaml': publishWorkflow({ top: 'defaults:\n  run:\n    shell: pwsh\n', steps: RUN_LINE_PUBLISH_STEPS }) },
  ],
  [
    'run-line-publish-self-hosted-list',
    'Control: a run-line publish on `runs-on: [self-hosted, linux]` is not claimed.',
    { '.github/workflows/publish.yaml': publishWorkflow({ job: '    runs-on: [self-hosted, linux]\n', steps: RUN_LINE_PUBLISH_STEPS }) },
  ],
];

// What each #517 fixture is compared with: the same repository without the publishing workflow. A
// reusable-workflow fixture's baseline keeps the called workflow, which only `workflow_call` runs.
export const baselineFor = (files: Record<string, string>): string =>
  '.github/workflows/pypi.yaml' in files ? 'baseline-with-called-workflow' : 'baseline';

export const FIXTURES_517: readonly FalseAssuranceFixture[] = [
  fixture('baseline', '#517', 'Baseline: tests and pre-commit on pull requests and main, no publishing workflow.', { ...PY_BASE }),
  fixture('baseline-with-called-workflow', '#517', 'Baseline: the same, plus a reusable publishing workflow nothing calls.', {
    ...PY_BASE,
    '.github/workflows/pypi.yaml': CALLED_PYPI_WORKFLOW,
  }),
  ...[...EVASIONS, ...CONTROLS_517].map(([name, purpose, files]) => fixture(name, '#517', purpose, { ...PY_BASE, ...files })),
];

export const TOX_LOCK_RUNNER_FIXTURE: FalseAssuranceFixture = fixture(
  'tox-lock-runner-lockfile-deleted-followup',
  '#520',
  'The #597 tox shape with no uv.lock.',
  {
    ...PY_SOURCES,
    'pyproject.toml': PY_PROJECT_WITH_TOX,
    '.github/workflows/tests.yaml': testsWorkflow('      - run: uvx --with tox-uv tox run\n'),
  },
);

export const CI_CLAIMS_FIXTURES: readonly FalseAssuranceFixture[] = [...FIXTURES_520, ...FIXTURES_517, TOX_LOCK_RUNNER_FIXTURE];
