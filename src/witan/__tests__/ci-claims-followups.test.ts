import { describe, expect, it } from 'vitest';

import type { WitanCriterionScore, WitanReport } from '../schemas.js';

import { scoreRepoWithPublicCejel } from '../public-scan.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_RUBRIC_VERSION_V27 } from '../rubric-version.js';
import { buildFalseAssuranceFixture, type FalseAssuranceFixture } from './fixtures/false-assurance-fixtures.js';
import { checkNoRise, lostFindings } from './v27-no-rise.js';

// Follow-ups to #597 for #520 and #517.
//
// #520: the lockfile-requirement reader decided "the lockfile may be generated" per workflow
// without regard to step order, so CI that runs `uv sync --locked` and then `uv run pytest`, with
// uv.lock deleted, still printed "a committed lockfile is credited but not required": the later
// `uv run` excused the earlier step, which fails first. A pip install with --require-hashes reads a
// hash-pinned requirements file, which is a lockfile requirement too. Under every rubric, a
// requirement CI states reports lockfile_coverage, as 0 or as not computed with a stated reason.
//
// #517: v27's publishing rule was evaded by an always-true job condition, a pull-request word in a
// comment, a matrix, list-form or non-Ubuntu runner, a default shell, or a reusable-workflow job.
// Each evasion below is #517's publishing workflow, moved onto every push to main with its gate
// removed, and must not raise B3 above the same repository without it.
//
// Fixtures are synthetic, written here from the idiom each issue names; no public repository is
// cloned.

const V17 = WITAN_RUBRIC_VERSION_V17;
const V27 = WITAN_RUBRIC_VERSION_V27;

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

const PY_SOURCES: Readonly<Record<string, string>> = {
  'README.md': '# signer\n\nSign and verify values.\n',
  LICENSE: 'MIT\n',
  'pyproject.toml': PY_PROJECT,
  'src/signer/__init__.py':
    'import hmac\n\n\ndef sign(key, value):\n    return hmac.new(key, value, "sha256").hexdigest()\n\n\ndef verify(key, value, mac):\n    return hmac.compare_digest(sign(key, value), mac)\n',
  'tests/test_signer.py':
    'from signer import sign, verify\n\n\ndef test_roundtrip():\n    assert verify(b"k", b"v", sign(b"k", b"v"))\n\n\ndef test_tamper():\n    assert not verify(b"k", b"w", sign(b"k", b"v"))\n',
};

const UV_LOCK =
  'version = 1\nrequires-python = ">=3.9"\n\n[[package]]\nname = "signer"\nversion = "1.0.0"\nsource = { editable = "." }\n';

const PR_AND_MAIN = 'on:\n  pull_request:\n  push:\n    branches: [main]\n';
const PUSH_MAIN = 'on:\n  push:\n    branches: [main]\n';

function fixture(name: string, issue: '#517' | '#520', purpose: string, ...commits: Record<string, string | null>[]): FalseAssuranceFixture {
  return { name, issue, purpose, commits };
}

// ---- #520 fixtures ----------------------------------------------------------------------------

// Line 12 is the first step after checkout and setup.
const testsWorkflow = (steps: string, runsOn = 'ubuntu-latest'): string =>
  `name: Tests\n${PR_AND_MAIN}jobs:\n  tests:\n    runs-on: ${runsOn}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: astral-sh/setup-uv@v5\n${steps}`;

const SYNC_THEN_RUN = '      - run: uv sync --locked\n      - run: uv run pytest\n';

const HASHED_REQUIREMENTS =
  'pytest==8.3.3 \\\n    --hash=sha256:70b98107bd648308a7952b06e6ca9a50bc660be218d53c257cc1fc94fda10181\n';

const FIXTURES_520: readonly FalseAssuranceFixture[] = [
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
  fixture('uv-sync-then-run-windows', '#520', 'Corner: on a Windows runner the shell is not bash, so a failing command need not stop the job.', {
    ...PY_SOURCES,
    '.github/workflows/tests.yaml': testsWorkflow(SYNC_THEN_RUN, 'windows-latest'),
  }),
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

// #517's PyPI shape in one job: build, then publish through the PyPI action, on every push to main
// and with no environment.
function publishWorkflow(options: { on?: string; top?: string; job?: string; steps?: string } = {}): string {
  const { on = PUSH_MAIN, top = '', job = '    runs-on: ubuntu-latest\n', steps = PUBLISH_STEPS } = options;
  return `name: Publish\n${on}${top}jobs:\n  publish:\n${job}    permissions:\n      id-token: write\n${steps}`;
}

const CALLED_PYPI_WORKFLOW = `name: PyPI\non:\n  workflow_call:\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    permissions:\n      id-token: write\n${PUBLISH_STEPS}`;
const callerWorkflow = (target: string, on = PUSH_MAIN): string =>
  `name: Publish\n${on}jobs:\n  publish:\n    uses: ${target}\n    secrets: inherit\n`;

const EVASIONS: readonly (readonly [name: string, purpose: string, files: Record<string, string>])[] = [
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
];

const CONTROLS_517: readonly (readonly [name: string, purpose: string, files: Record<string, string>])[] = [
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
];

// What each #517 fixture is compared with: the same repository without the publishing workflow. A
// reusable-workflow fixture's baseline keeps the called workflow, which only `workflow_call` runs.
const baselineFor = (files: Record<string, string>): string =>
  '.github/workflows/pypi.yaml' in files ? 'baseline-with-called-workflow' : 'baseline';

const FIXTURES_517: readonly FalseAssuranceFixture[] = [
  fixture('baseline', '#517', 'Baseline: tests and pre-commit on pull requests and main, no publishing workflow.', { ...PY_BASE }),
  fixture('baseline-with-called-workflow', '#517', 'Baseline: the same, plus a reusable publishing workflow nothing calls.', {
    ...PY_BASE,
    '.github/workflows/pypi.yaml': CALLED_PYPI_WORKFLOW,
  }),
  ...[...EVASIONS, ...CONTROLS_517].map(([name, purpose, files]) => fixture(name, '#517', purpose, { ...PY_BASE, ...files })),
];

const ALL = [...FIXTURES_520, ...FIXTURES_517];

const repos = new Map<string, string>();
const reports = new Map<string, WitanReport>();

function report(name: string, rubricVersion: string): WitanReport {
  const key = `${name}@${rubricVersion}`;
  const cached = reports.get(key);
  if (cached) return cached;
  let repo = repos.get(name);
  if (!repo) {
    const found = ALL.find((entry) => entry.name === name);
    if (!found) throw new Error(`unknown fixture ${name}`);
    repo = buildFalseAssuranceFixture(found);
    repos.set(name, repo);
  }
  const scored = scoreRepoWithPublicCejel({
    repoPath: repo,
    productSlug: 'ci-claims-fixture',
    productDisplayName: 'CI claims fixture',
    generatedAt: '2026-10-27T00:00:00.000Z',
    rubricVersion,
    ingestPatterns: [],
    autoDiscoverIngest: false,
  });
  reports.set(key, scored);
  return scored;
}

function criterion(name: string, rubricVersion: string, id: string): WitanCriterionScore {
  const found = report(name, rubricVersion).criteria.find((entry) => entry.id === id);
  if (!found) throw new Error(`${name}@${rubricVersion} has no ${id}`);
  return found;
}

function metricValue(score: WitanCriterionScore, name: string): number | undefined {
  return score.metrics.find((metric) => metric.name === name)?.value;
}

const NOT_REQUIRED = 'a committed lockfile is credited but not required';

describe('#520 — a requiring step stands when it comes before every step that could write the lockfile', () => {
  const claimed = [
    ['uv-sync-then-run-lockfile-deleted', 'uv sync --locked', 'uv.lock', 12],
    ['uv-sync-frozen-then-run-lockfile-deleted', 'uv sync --frozen', 'uv.lock', 12],
    ['uv-sync-then-run-one-step', 'uv sync --locked', 'uv.lock', 13],
    ['pip-require-hashes-file-deleted', 'pip install --require-hashes', 'requirements/ci.txt', 12],
  ] as const;

  it('every rubric: the note names the requiring line instead of saying a lockfile is not required', () => {
    for (const [name, command, lockfile, line] of claimed) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain(NOT_REQUIRED);
        expect(a4.notes, `${name}@${rubricVersion}`).toContain(
          `An unconditional step in this repository's CI runs \`${command}\` (.github/workflows/tests.yaml line ${line}), which exits with an error without ${lockfile}, and the scanned inventory holds none.`,
        );
        expect(a4.evidence[0]?.path, `${name}@${rubricVersion}`).toBe('.github/workflows/tests.yaml');
        expect(a4.evidence[0]?.line, `${name}@${rubricVersion}`).toBe(line);
      }
    }
  });

  it('v27: lockfile_coverage is 0 and a warning finding cites the requiring line', () => {
    for (const [name, command, lockfile, line] of claimed) {
      const a4 = criterion(name, V27, 'A4');
      expect(metricValue(a4, 'lockfile_coverage'), name).toBe(0);
      const finding = a4.findings.find(({ summary }) => summary.startsWith("This repository's CI requires a lockfile"));
      expect(finding?.summary, name).toBe(
        `This repository's CI requires a lockfile that is not committed: an unconditional step runs \`${command}\`, which exits with an error without ${lockfile}, and the scanned inventory holds none.`,
      );
      expect(finding?.severity, name).toBe('warning');
      expect(finding?.evidence.line, name).toBe(line);
    }
  });

  it('v17: lockfile_coverage is reported as not computed, with the reason, never by omission', () => {
    for (const [name, , lockfile, line] of claimed) {
      const a4 = criterion(name, V17, 'A4');
      expect(metricValue(a4, 'lockfile_coverage'), name).toBeUndefined();
      expect(a4.disclosures, name).toContain(
        `A4 did not compute lockfile coverage under this rubric, which scores a library's lockfile only when one is committed: this repository's own CI requires ${lockfile} (.github/workflows/tests.yaml line ${line}), and the scanned inventory holds none.`,
      );
    }
  });

  it('nothing is claimed when the lockfile is committed, may be written first, or a failing step need not stop the job', () => {
    for (const name of [
      'uv-sync-then-run-with-lockfile',
      'uv-run-before-sync',
      'uv-run-in-another-job',
      'uv-sync-in-and-list',
      'uv-sync-piped',
      'uv-sync-then-run-windows',
      'pip-require-hashes-file-committed',
      'pip-without-require-hashes',
      'pip-require-hashes-compiled-first',
    ]) {
      for (const rubricVersion of [V17, V27]) {
        const a4 = criterion(name, rubricVersion, 'A4');
        expect(a4.notes ?? '', `${name}@${rubricVersion}`).not.toContain("this repository's CI runs");
        expect(metricValue(a4, 'lockfile_coverage'), `${name}@${rubricVersion}`).not.toBe(0);
        expect(a4.disclosures ?? [], `${name}@${rubricVersion}`).not.toContainEqual(expect.stringContaining('lockfile coverage'));
      }
    }
  });
});

describe('#520 — v17 reports lockfile_coverage as not computed for #597 requirements too', () => {
  it('a tox lock runner with no uv.lock is disclosed under v17', () => {
    const tox = buildFalseAssuranceFixture(
      fixture('tox-lock-runner-lockfile-deleted-followup', '#520', 'The #597 tox shape with no uv.lock.', {
        ...PY_SOURCES,
        'pyproject.toml': `${PY_PROJECT}[tool.tox]\nenv_list = ["py3"]\n\n[tool.tox.env_run_base]\nrunner = "uv-venv-lock-runner"\ndependency_groups = ["tests"]\ncommands = [["pytest"]]\n`,
        '.github/workflows/tests.yaml': testsWorkflow('      - run: uvx --with tox-uv tox run\n'),
      }),
    );
    const scored = scoreRepoWithPublicCejel({
      repoPath: tox,
      productSlug: 'ci-claims-fixture',
      productDisplayName: 'CI claims fixture',
      generatedAt: '2026-10-27T00:00:00.000Z',
      rubricVersion: V17,
      ingestPatterns: [],
      autoDiscoverIngest: false,
    });
    const a4 = scored.criteria.find(({ id }) => id === 'A4');
    expect(a4?.disclosures).toContain(
      "A4 did not compute lockfile coverage under this rubric, which scores a library's lockfile only when one is committed: this repository's tox configuration requires uv.lock (pyproject.toml line 15), and the scanned inventory holds none.",
    );
  });
});

describe('#517 — removing the gate does not raise v27 B3, whichever evasion is used', () => {
  const publishingSentence = (file: string) =>
    `1 workflow that publishes, releases or deploys with no pull-request trigger (an unconditional step runs a publish, release or deploy command or action) is not counted as CI verification, whatever else it runs: ${file}.`;

  for (const [name, , files] of EVASIONS) {
    it(`v27: ${name}`, () => {
      const baseline = criterion(baselineFor(files), V27, 'B3');
      const after = criterion(name, V27, 'B3');
      expect(after.notes, name).toBe(publishingSentence('.github/workflows/publish.yaml'));
      expect(after.score, name).toBe(baseline.score);
      expect(metricValue(after, 'default_branch_ci_depth'), name).toBe(metricValue(baseline, 'default_branch_ci_depth'));
      expect(metricValue(after, 'ci_script_depth'), name).toBe(metricValue(baseline, 'ci_script_depth'));
    });
  }

  it('v17 is unchanged: each evasion still raises B3 above its baseline, as the issue reports', () => {
    for (const [name, , files] of EVASIONS) {
      expect(criterion(name, V17, 'B3').score, name).toBeGreaterThan(criterion(baselineFor(files), V17, 'B3').score);
    }
  });

  it('v27 keeps counting a condition that can be false, a run-line publish off bash, a remote or guarded reusable workflow, and a dynamic matrix', () => {
    for (const [name] of CONTROLS_517) {
      expect(criterion(name, V27, 'B3'), name).toEqual(criterion(name, V17, 'B3'));
    }
  });

  it('B2 is not changed by this rule', () => {
    for (const [name] of [...EVASIONS, ...CONTROLS_517]) {
      expect(criterion(name, V27, 'B2'), name).toEqual(criterion(name, V17, 'B2'));
    }
  });
});

describe('no rise against v17 on these fixtures', () => {
  it('no score, status or composite rises, and no v17 finding is lost', () => {
    for (const { name } of ALL) {
      const before = report(name, V17);
      const after = report(name, V27);
      expect(checkNoRise(before, after).problems, name).toEqual([]);
      expect(lostFindings(before, after), name).toEqual([]);
    }
  });
});
