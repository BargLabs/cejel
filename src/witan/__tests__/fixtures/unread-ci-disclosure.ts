// SYNTHETIC repositories for the unread-CI disclosure tests
// (goal_cejel_v26_unread_ci_disclosure_2026-10-14). Authored here; nothing is derived from a real
// repository. Materialised at test time with makeReadsDisclosureRepo, so no nested .github tree is
// tracked in this repository.

const SERVICE_ENTRYPOINT: Readonly<Record<string, string>> = {
  'vercel.json': '{}\n',
  'src/main.js':
    "import http from 'node:http';\n" +
    'http.createServer((request, response) => response.end(request.method)).listen(5300);\n',
};

const ROOT_SCRIPTS = '{"scripts":{"start":"node src/main.js","build":"tsc"}}\n';

const TRIGGERS = 'on:\n  pull_request:\n  push:\n    branches: [main]\n';

function stepsWorkflow(name: string, steps: readonly string[]): string {
  return `name: ${name}\n${TRIGGERS}jobs:\n  job:\n    runs-on: ubuntu-latest\n    steps:\n${steps.map((step) => `      - ${step}\n`).join('')}`;
}

function callerWorkflow(name: string, uses: string): string {
  return `name: ${name}\n${TRIGGERS}jobs:\n  shared:\n    uses: ${uses}\n`;
}

const COMPOSITE_ACTION =
  'name: setup-and-test\nruns:\n  using: composite\n  steps:\n    - run: pnpm test\n      shell: bash\n';

/** U1: one workflow whose only job is a reusable workflow in another repository. */
export const U1_CROSS_REPO_REUSABLE: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': callerWorkflow('ci', 'org/other/.github/workflows/ci.yml@v1'),
};

/** U2: a step runs a local composite action whose directory holds action.yml. */
export const U2_COMPOSITE_ACTION_YML: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': stepsWorkflow('ci', [
    'uses: actions/checkout@v4',
    'uses: ./.github/actions/setup-and-test',
  ]),
  '.github/actions/setup-and-test/action.yml': COMPOSITE_ACTION,
};

/** U2b: the same, with action.yaml, a quoted value, a trailing slash and a trailing comment. */
export const U2B_COMPOSITE_ACTION_YAML: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': stepsWorkflow('ci', [
    'uses: actions/checkout@v4',
    'uses: "./.github/actions/setup-and-test/" # shared setup',
  ]),
  '.github/actions/setup-and-test/action.yaml': COMPOSITE_ACTION,
};

/** U3: a step names a local directory that holds no action.yml or action.yaml. */
export const U3_LOCAL_DIRECTORY_WITHOUT_ACTION: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': stepsWorkflow('ci', [
    'uses: actions/checkout@v4',
    'uses: ./.github/actions/x',
  ]),
  '.github/actions/x/index.js': 'console.log("not an action without action.yml");\n',
};

/** U4: a local reusable workflow, which Cejel already reads as one of the repository's workflows. */
export const U4_LOCAL_REUSABLE: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': callerWorkflow('ci', './.github/workflows/reusable.yml'),
  '.github/workflows/reusable.yml':
    'name: reusable\non:\n  workflow_call:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm test\n',
};

/** U5: one workflow using only a marketplace action. */
export const U5_MARKETPLACE_ACTION_ONLY: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': stepsWorkflow('ci', ['uses: actions/checkout@v4', 'run: pnpm build']),
};

/** U5b: two workflows using only marketplace actions, so the #467 count renders and nothing is added. */
export const U5B_TWO_WORKFLOWS_MARKETPLACE_ONLY: Readonly<Record<string, string>> = {
  ...U5_MARKETPLACE_ACTION_ONLY,
  '.github/workflows/lint.yml': stepsWorkflow('lint', [
    'uses: actions/checkout@v4',
    'uses: actions/setup-node@v4',
    'run: pnpm build',
  ]),
};

/** U6: one of each delegated kind across two workflows, plus a commented-out delegation. */
export const U6_ONE_OF_EACH: Readonly<Record<string, string>> = {
  'package.json': ROOT_SCRIPTS,
  ...SERVICE_ENTRYPOINT,
  '.github/workflows/ci.yml': stepsWorkflow('ci', [
    'uses: actions/checkout@v4',
    'uses: ./.github/actions/setup-and-test',
    '# uses: ./.github/actions/setup-and-test',
  ]),
  '.github/workflows/release.yml': callerWorkflow('release', 'org/other/.github/workflows/release.yml@v2'),
  '.github/actions/setup-and-test/action.yml': COMPOSITE_ACTION,
};

export const UNREAD_CI_DISCLOSURE_FIXTURES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  'u1-cross-repo-reusable': U1_CROSS_REPO_REUSABLE,
  'u2-composite-action-yml': U2_COMPOSITE_ACTION_YML,
  'u2b-composite-action-yaml': U2B_COMPOSITE_ACTION_YAML,
  'u3-local-directory-without-action': U3_LOCAL_DIRECTORY_WITHOUT_ACTION,
  'u4-local-reusable': U4_LOCAL_REUSABLE,
  'u5-marketplace-action-only': U5_MARKETPLACE_ACTION_ONLY,
  'u5b-two-workflows-marketplace-only': U5B_TWO_WORKFLOWS_MARKETPLACE_ONLY,
  'u6-one-of-each': U6_ONE_OF_EACH,
};
