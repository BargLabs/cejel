import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

import { DOCS_DEPLOY, PR_CI_TEST } from './b3-cites-every-workflow-fixtures.js';

// v27 B2 and B3: housekeeping workflows earn no CI credit, and a discounted publishing workflow keeps
// its default-branch depth where pull-request CI tests and lints (2026-11-19; refs #600 #748).
// Synthetic repositories only. #748's fixtures (b3-cites-every-workflow-fixtures.ts) carry the
// shapes items A and B change; these are the refusals and the shapes items C and D add.

const PY_PROJECT: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "keeplib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# keeplib\n\nA small library.\n',
  LICENSE: 'MIT\n',
  'src/keeplib/__init__.py': 'def triple(value):\n    return value * 3\n',
  'tests/test_triple.py': 'from keeplib import triple\n\n\ndef test_triple():\n    assert triple(2) == 6\n',
};

/** A labeller on pull_request with a `with:` key outside the allowed set. */
const LABELLER_OTHER_KEY =
  'name: labeler\non:\n  pull_request:\npermissions:\n  contents: read\n  pull-requests: write\njobs:\n  label:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/labeler@v5\n        with:\n          experimental-hook: make check\n';

/** The labeller on pull_request, inputs left at their defaults. */
const LABELLER_PULL_REQUEST =
  'name: labeler\non:\n  pull_request:\npermissions:\n  contents: read\n  pull-requests: write\njobs:\n  label:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/labeler@v5\n';

/** A gh CLI pull-request comment whose output is piped into another command. */
const PR_COMMENTER_PIPED =
  'name: welcome\non:\n  pull_request:\n    types: [opened]\npermissions:\n  pull-requests: write\njobs:\n  comment:\n    runs-on: ubuntu-latest\n    steps:\n      - run: gh pr comment "$PR" --body "Thanks!" | tee comment.log\n        env:\n          GH_TOKEN: ${{ github.token }}\n          PR: ${{ github.event.pull_request.html_url }}\n';

/** A gh CLI pull-request edit that only adds a label. */
const PR_LABEL_GH =
  "name: triage\non:\n  pull_request:\npermissions:\n  pull-requests: write\njobs:\n  triage:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: gh pr edit ${{ github.event.pull_request.number }} --add-label 'needs review'\n        env:\n          GH_TOKEN: ${{ github.token }}\n";

/** Pull-request CI that runs lint only. */
const PR_CI_LINT =
  'name: lint\non:\n  pull_request:\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install ruff\n      - run: ruff check .\n';

/** Pull-request CI that runs tests, its lint step commented out. */
const PR_CI_TEST_LINT_COMMENTED =
  'name: ci\non:\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      # - run: ruff check .\n      - run: pytest\n';

/** Pull-request CI that runs pytest and the package's lint script through pnpm. */
const PR_CI_TEST_PNPM_LINT =
  'name: ci\non:\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pnpm install\n      - run: pnpm run lint\n      - run: pytest\n';

const packageJson = (scripts: Readonly<Record<string, string>>): string =>
  `${JSON.stringify({ name: 'keeplib-tools', private: true, scripts }, null, 2)}\n`;

const fixture = (name: string, purpose: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  // The fixture type lists the issues fixtures belong to; the rules changed here are #517's (refs #600).
  issue: '#517',
  purpose,
  commits: [{ ...PY_PROJECT, ...files }],
});

/** Item A, refusals: each keeps its credit under v27, equal to main. */
export const ITEM_A_REFUSAL_FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture('a-labeller-other-with-key', 'Pull-request CI that runs tests and a labeller given a with: key outside the allowed set.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/labeler.yml': LABELLER_OTHER_KEY,
  }),
  fixture('a-gh-comment-piped', 'Pull-request CI that runs tests and a gh pr comment line piped into another command.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/welcome.yml': PR_COMMENTER_PIPED,
  }),
];

/** Item A: a gh CLI pull-request edit that only adds a label earns no credit either. */
export const ITEM_A_LABEL_FIXTURE = fixture('a-gh-pr-edit-add-label', 'Pull-request CI that runs tests and a gh pr edit that only adds a label.', {
  '.github/workflows/ci.yml': PR_CI_TEST,
  '.github/workflows/triage.yml': PR_LABEL_GH,
});

/** Item B, refusals: v27 stays at default-branch depth 1, equal to main. */
export const ITEM_B_REFUSAL_FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture('b-test-no-lint-docs-deploy', 'Pull-request CI that runs tests but no lint, and a docs deploy on push to main.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
  }),
  fixture('b-test-and-lint-split-docs-deploy', 'Tests in one pull-request workflow, lint in another, and a docs deploy on push to main.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/lint.yml': PR_CI_LINT,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
  }),
  fixture('b-housekeeping-other-pr-docs-deploy', 'Pull-request CI that runs tests, a labeller as the only other pull-request workflow, and a docs deploy.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/labeler.yml': LABELLER_PULL_REQUEST,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
  }),
  fixture('b-lint-in-comment-docs-deploy', 'Pull-request CI that runs tests with its lint step commented out, and a docs deploy.', {
    '.github/workflows/ci.yml': PR_CI_TEST_LINT_COMMENTED,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
  }),
];

/** Item C: package-script lint, for item B's condition only. */
export const ITEM_C_FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture('c-pnpm-lint-script-docs-deploy', 'Pull-request CI running pytest and pnpm run lint, a root lint script, and a docs deploy.', {
    'package.json': packageJson({ lint: 'eslint .' }),
    '.github/workflows/ci.yml': PR_CI_TEST_PNPM_LINT,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
  }),
  fixture('c-pnpm-lint-no-script-docs-deploy', 'The same with no lint script in package.json.', {
    'package.json': packageJson({ format: 'prettier --check .' }),
    '.github/workflows/ci.yml': PR_CI_TEST_PNPM_LINT,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
  }),
];

/** Item D: a workflow file in a subfolder of .github/workflows. */
export const ITEM_D_FIXTURE = fixture('d-nested-workflow', 'Top-level pull-request CI and the same file in .github/workflows/sub/.', {
  '.github/workflows/ci.yml': PR_CI_TEST,
  '.github/workflows/sub/ci.yml': PR_CI_TEST,
});

export const HOUSEKEEPING_PUBLISHING_DEPTH_FIXTURES: readonly FalseAssuranceFixture[] = [
  ...ITEM_A_REFUSAL_FIXTURES,
  ITEM_A_LABEL_FIXTURE,
  ...ITEM_B_REFUSAL_FIXTURES,
  ...ITEM_C_FIXTURES,
  ITEM_D_FIXTURE,
];
