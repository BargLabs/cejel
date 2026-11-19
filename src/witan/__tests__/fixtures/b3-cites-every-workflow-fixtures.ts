import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

// v27 B3 cites every workflow it read (goal_cejel_v27_b3_cites_every_workflow_read, 2026-11-19;
// refs #600). Synthetic repositories only.
//
// Item A: under v27 B3's evidence cites every workflow it read, each counted one at the line that
// earned its credit with what it earned, each one not counted with why; past the citation limit the
// credited ones come first and the read-count label says how many were not cited. Item B: a
// counted-looking workflow that runs no check (a stale-issue closer, a labeller, a pull-request
// commenter) beside pull-request CI that runs tests. Item C: pull-request CI that runs tests and lint
// beside a publishing workflow v27 discounts. Items B and C change no code.

const PY_PROJECT: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "citelib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# citelib\n\nA small library.\n',
  LICENSE: 'MIT\n',
  'src/citelib/__init__.py': 'def double(value):\n    return value * 2\n',
  'tests/test_double.py': 'from citelib import double\n\n\ndef test_double():\n    assert double(2) == 4\n',
};

/** Pull-request CI that runs tests: name, on, pull_request, jobs, test, runs-on, steps, checkout, install, pytest. */
export const PR_CI_TEST = 'name: ci\non:\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n';

/** Pull-request CI that runs tests and lint; `pull_request:` is line 3. */
export const PR_CI_TEST_LINT =
  'name: ci\non:\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest ruff\n      - run: ruff check .\n      - run: pytest\n';

/** A scheduled stale-issue closer; `on:` is line 2. */
export const STALE_CLOSER =
  "name: stale\non:\n  schedule:\n    - cron: '30 1 * * *'\npermissions:\n  issues: write\n  pull-requests: write\njobs:\n  stale:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/stale@v9\n        with:\n          days-before-stale: 60\n";

/** A labeller on pull_request_target, the trigger its action documents. */
const LABELLER_TARGET =
  'name: labeler\non:\n  pull_request_target:\npermissions:\n  contents: read\n  pull-requests: write\njobs:\n  label:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/labeler@v5\n';

/** The same labeller on pull_request. */
const LABELLER_PULL_REQUEST = LABELLER_TARGET.replace('pull_request_target:', 'pull_request:');

/** A workflow that only comments on pull requests, through actions/github-script. */
const PR_COMMENTER_SCRIPT =
  "name: welcome\non:\n  pull_request:\n    types: [opened]\npermissions:\n  pull-requests: write\njobs:\n  comment:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/github-script@v7\n        with:\n          script: |\n            github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body: 'Thanks!' })\n";

/** A workflow that only comments on pull requests, through the gh CLI. */
const PR_COMMENTER_GH =
  'name: welcome\non:\n  pull_request:\n    types: [opened]\npermissions:\n  pull-requests: write\njobs:\n  comment:\n    runs-on: ubuntu-latest\n    steps:\n      - run: gh pr comment "$PR" --body "Thanks!"\n        env:\n          GH_TOKEN: ${{ github.token }}\n          PR: ${{ github.event.pull_request.html_url }}\n';

/** A docs deploy on push to main with no environment; `uses: actions/deploy-pages@v4` is line 18. */
export const DOCS_DEPLOY =
  'name: docs\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    permissions:\n      pages: write\n      id-token: write\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install mkdocs\n      - run: mkdocs build --site-dir site\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: site\n      - uses: actions/deploy-pages@v4\n';
export const DOCS_DEPLOY_LINE = 18;

/** A release on a pushed tag; `uses: softprops/action-gh-release@v2` is line 12. */
export const TAG_RELEASE =
  "name: release\non:\n  push:\n    tags: ['v*']\njobs:\n  release:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@v4\n      - uses: softprops/action-gh-release@v2\n";
export const TAG_RELEASE_LINE = 12;

/** semantic-release on push to `branch`, no environment; `testFirst` runs pytest before it. */
const SEMANTIC_RELEASE = (testFirst: boolean, branch = 'release'): string =>
  `name: release\non:\n  push:\n    branches: [${branch}]\njobs:\n  release:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n${testFirst ? '      - run: pip install pytest\n      - run: pytest\n' : ''}      - run: npx semantic-release\n`;

const fixture = (name: string, purpose: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: '#600',
  purpose,
  commits: [{ ...PY_PROJECT, ...files }],
});

/** Item A: the four-workflow repository the card names. */
export const FOUR_WORKFLOWS = fixture(
  'cite-four-workflows',
  'Pull-request CI that runs tests and lint, a stale-issue closer, a docs deploy on push to main and a release on tag.',
  {
    '.github/workflows/ci.yml': PR_CI_TEST_LINT,
    '.github/workflows/stale.yml': STALE_CLOSER,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
    '.github/workflows/release.yml': TAG_RELEASE,
  },
);

// Item A, cap: twenty stale closers named before the one credited workflow, and a discounted release
// named first of all, so path order alone would cite the credited one last.
export const CAP_STALE_COUNT = 20;
export const CAP_FIXTURE = fixture(
  'cite-over-the-limit',
  'Twenty stale closers and a release on tag, all named before the one pull-request CI workflow.',
  {
    '.github/workflows/aa-release.yml': TAG_RELEASE,
    ...Object.fromEntries(
      Array.from({ length: CAP_STALE_COUNT }, (_, index) => [
        `.github/workflows/stale-${String(index + 1).padStart(2, '0')}.yml`,
        STALE_CLOSER,
      ]),
    ),
    '.github/workflows/zz-ci.yml': PR_CI_TEST_LINT,
  },
);

/** Item B: pull-request CI that runs tests, plus one workflow that runs no check. */
export const ITEM_B_FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture('b-pr-ci-only', 'Pull-request CI that runs tests, alone (the baseline).', { '.github/workflows/ci.yml': PR_CI_TEST }),
  fixture('b-stale-closer', 'Pull-request CI that runs tests and a scheduled stale-issue closer.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/stale.yml': STALE_CLOSER,
  }),
  fixture('b-labeller-pull-request-target', 'Pull-request CI that runs tests and a labeller on pull_request_target.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/labeler.yml': LABELLER_TARGET,
  }),
  fixture('b-labeller-pull-request', 'Pull-request CI that runs tests and a labeller on pull_request.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/labeler.yml': LABELLER_PULL_REQUEST,
  }),
  fixture('b-commenter-github-script', 'Pull-request CI that runs tests and a workflow that only comments, through github-script.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/welcome.yml': PR_COMMENTER_SCRIPT,
  }),
  fixture('b-commenter-gh-cli', 'Pull-request CI that runs tests and a workflow that only comments, through gh pr comment.', {
    '.github/workflows/ci.yml': PR_CI_TEST,
    '.github/workflows/welcome.yml': PR_COMMENTER_GH,
  }),
];

/** Item C: pull-request CI that runs tests and lint, plus one publishing workflow. */
export const ITEM_C_FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture('c-pr-ci-only', 'Pull-request CI that runs tests and lint, alone (the baseline).', {
    '.github/workflows/ci.yml': PR_CI_TEST_LINT,
  }),
  fixture('c-semantic-release', 'Pull-request CI and semantic-release on push to a release branch, no environment.', {
    '.github/workflows/ci.yml': PR_CI_TEST_LINT,
    '.github/workflows/release.yml': SEMANTIC_RELEASE(false),
  }),
  fixture('c-semantic-release-tests-first', 'The same, its job running the tests before the publish step.', {
    '.github/workflows/ci.yml': PR_CI_TEST_LINT,
    '.github/workflows/release.yml': SEMANTIC_RELEASE(true),
  }),
  // Beyond the card's three: semantic-release on push to the default branch, the shape where the
  // release workflow is one workflowTargetsDefaultBranch reads as targeting it.
  fixture('c-semantic-release-main', 'Pull-request CI and semantic-release on push to main, no environment.', {
    '.github/workflows/ci.yml': PR_CI_TEST_LINT,
    '.github/workflows/release.yml': SEMANTIC_RELEASE(false, 'main'),
  }),
  fixture('c-docs-deploy-main','Pull-request CI and a docs deploy on push to main, no environment.', {
    '.github/workflows/ci.yml': PR_CI_TEST_LINT,
    '.github/workflows/docs.yml': DOCS_DEPLOY,
  }),
];

export const CITE_EVERY_WORKFLOW_FIXTURES: readonly FalseAssuranceFixture[] = [
  FOUR_WORKFLOWS,
  CAP_FIXTURE,
  ...ITEM_B_FIXTURES,
  ...ITEM_C_FIXTURES,
];
