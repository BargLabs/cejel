import type { FalseAssuranceFixture } from './false-assurance-fixtures.js';

// v27 A1, fixture data not cited as a test file (goal_cejel_v27_a1_fixture_data_not_cited_as_test,
// 2026-11-19; refs #518). Under v27 a conftest.py is not cited as a test file, which frees a slot
// under A1's eight-file test-file cap. These fixtures put a fixture data file (mock data, no test
// in it) in that slot, and pin what v27 cites for it and in what order. Synthetic repositories only.

const PY_PROJECT: Readonly<Record<string, string>> = {
  'pyproject.toml':
    '[project]\nname = "authlib"\nversion = "1.0.0"\ndependencies = []\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
  'README.md': '# authlib\n\nA small sign-in library.\n',
  LICENSE: 'MIT\n',
  'src/authlib/__init__.py':
    'def sign_in(users, name):\n    return name in users\n\n\ndef sign_out(sessions, name):\n    sessions.discard(name)\n    return name\n',
  'src/authlib/roles.py': 'def is_admin(user):\n    return user.get("role") == "admin"\n',
  '.github/workflows/ci.yml':
    'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pip install pytest\n      - run: pytest\n',
};

/** A pytest test module with one live assertion. */
const pyTest = (name: string): string =>
  `from authlib import sign_in\n\n\ndef test_${name}():\n    assert sign_in({"${name}"}, "${name}")\n`;

/** A conftest.py that only defines fixtures; one checks its own setup, so v17 reads it as asserting. */
const CONFTEST =
  'import pytest\n\n\n@pytest.fixture\ndef users():\n    found = {"ada", "lin"}\n    assert found\n    return found\n\n\n@pytest.fixture\ndef sessions():\n    return set()\n';

/** Mock data and no test: an exported object. */
const AUTH_FIXTURES_TS =
  "export const authFixtures = {\n  admin: { id: 'u1', name: 'Ada', role: 'admin' },\n  member: { id: 'u2', name: 'Lin', role: 'member' },\n};\n";

/** A Python fixture data module, no test in it. */
const USERS_FIXTURE_PY = 'USERS = [\n    {"id": "u1", "name": "Ada", "role": "admin"},\n    {"id": "u2", "name": "Lin", "role": "member"},\n]\n';

/**
 * Seven test files sort before `tests/conftest.py` and `tests/fixtures/`, two after: under v17 the
 * first eight are the seven and the conftest.py, so the fixture data file is the ninth and past the
 * cap; under v27 the conftest.py is not cited and the fixture data file is the eighth.
 */
const NINE_TESTS: Readonly<Record<string, string>> = Object.fromEntries([
  ...['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'].map((name) => [`tests/api/test_${name}.py`, pyTest(name)]),
  ...['hotel', 'india'].map((name) => [`tests/unit/test_${name}.py`, pyTest(name)]),
]);

const fixture = (name: string, purpose: string, files: Readonly<Record<string, string>>): FalseAssuranceFixture => ({
  name,
  issue: '#518',
  purpose,
  commits: [{ ...PY_PROJECT, ...files }],
});

/** The card's repository: nine tests, a fixtures-only conftest.py, and tests/fixtures/auth.fixtures.ts. */
export const CARD_REPOSITORY = 'a1-fixture-data-nine-tests-conftest-auth-fixtures';

export const FIXTURE_DATA_FIXTURES: readonly FalseAssuranceFixture[] = [
  fixture(
    CARD_REPOSITORY,
    'Under v27 the conftest.py leaves the test-file citations and tests/fixtures/auth.fixtures.ts takes the eighth slot; it holds mock data and no test.',
    { ...NINE_TESTS, 'tests/conftest.py': CONFTEST, 'tests/fixtures/auth.fixtures.ts': AUTH_FIXTURES_TS },
  ),
  fixture(
    'a1-fixture-data-named-fixture-outside-fixtures-dir',
    'A file named *.fixture.* outside any fixtures directory, with no test in it, takes the freed slot.',
    { ...NINE_TESTS, 'tests/conftest.py': CONFTEST, 'tests/helpers/users.fixture.py': USERS_FIXTURE_PY },
  ),
  fixture(
    'a1-fixture-data-dunder-fixtures-dir',
    'A file under __fixtures__/ with no test in it, beside a few tests: cited within the cap under every rubric.',
    {
      'tests/test_alpha.py': pyTest('alpha'),
      'tests/conftest.py': CONFTEST,
      'tests/__fixtures__/users.py': USERS_FIXTURE_PY,
    },
  ),
  fixture(
    'a1-fixture-data-only-test-shaped-file',
    'The fixture data file is the only test-shaped file: A1 keeps a citation for it, and its findings, under v27.',
    { 'tests/fixtures/auth.fixtures.ts': AUTH_FIXTURES_TS },
  ),
  fixture(
    'a1-fixture-data-control-test-in-fixtures-dir',
    'Control: a file under tests/fixtures/ that holds a test stays a detected test file.',
    { ...NINE_TESTS, 'tests/conftest.py': CONFTEST, 'tests/fixtures/test_loader.py': pyTest('loader') },
  ),
  fixture(
    'a1-fixture-data-control-no-conftest',
    'Control: no conftest.py and eight tests sort before tests/fixtures/, so no slot is freed; the fixture data file is past the cap under every rubric.',
    { ...NINE_TESTS, 'tests/api/test_hotel.py': pyTest('hotel_api'), 'tests/fixtures/auth.fixtures.ts': AUTH_FIXTURES_TS },
  ),
  {
    name: 'a1-fixture-data-under-dunder-tests',
    issue: '#518',
    purpose:
      'Item C: fixture data under src/__tests__/__fixtures__/, which every rubric reads as name-shaped and so rates hollow in the share.',
    commits: [
      {
        'package.json': `${JSON.stringify({ name: 'userlist', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`,
        'src/index.ts': "export const count = (items: readonly unknown[]): number => items.length;\n",
        'src/__tests__/users.test.ts':
          "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { users } from './__fixtures__/users.js';\n\ntest('users', () => {\n  assert.equal(users.length, 2);\n});\n",
        'src/__tests__/__fixtures__/users.ts': "export const users = [\n  { id: 'u1', name: 'Ada' },\n  { id: 'u2', name: 'Lin' },\n];\n",
        'README.md': '# userlist\n',
        LICENSE: 'MIT\n',
      },
    ],
  },
  fixture(
    'a1-fixture-data-ten-conftests',
    'Ten rated-hollow conftest.py files and nine tests: under v27 the first eight rated-hollow citations come first, and the note counts the rest.',
    {
      ...NINE_TESTS,
      ...Object.fromEntries(
        Array.from({ length: 10 }, (_unused, index) => [`tests/pkg${String(index).padStart(2, '0')}/conftest.py`, CONFTEST]),
      ),
    },
  ),
];
