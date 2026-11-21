// goal_cejel_v28_declaration_and_a1_readings_2026-11-20: synthetic repositories for v28's A1
// readings (items B, C and D). Every fixture is synthetic; none is modelled on a named repository.

export interface V28A1Fixture {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
}

const pkg = (scripts: Record<string, string>, extra: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ name: 'synthetic', version: '1.0.0', private: true, scripts, ...extra }, null, 2)}\n`;

const workflow = (...commands: string[]): string =>
  [
    'name: test',
    'on: [push, pull_request]',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...commands.map((command) => `      - run: ${command}`),
    '',
  ].join('\n');

const JS_SOURCE = { 'src/index.js': 'export function add(a, b) {\n  return a + b;\n}\n' };
const JS_TEST = {
  'src/index.test.js': "import { add } from './index.js';\n\ntest('adds', () => {\n  expect(add(1, 2)).toBe(3);\n});\n",
};
const PY_SOURCE = { 'src/app/__init__.py': '', 'src/app/core.py': 'def add(a, b):\n    return a + b\n' };
const PY_TEST = { 'tests/test_core.py': 'from app.core import add\n\n\ndef test_add():\n    assert add(1, 2) == 3\n' };
const PYPROJECT_PYTEST =
  '[project]\nname = "synthetic"\nversion = "1.0.0"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n';

const DOTNET_SOURCE = {
  'src/Synthetic/Synthetic.csproj': '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n',
  'src/Synthetic/Calc.cs': 'namespace Synthetic;\n\npublic static class Calc\n{\n    public static int Add(int a, int b) => a + b;\n}\n',
  'tests/Synthetic.Tests/CalcTests.cs':
    'using Xunit;\n\nnamespace Synthetic.Tests;\n\npublic class CalcTests\n{\n    [Fact]\n    public void Adds() => Assert.Equal(3, Synthetic.Calc.Add(1, 2));\n}\n',
};
const dotnetTestProject = (...extraReferences: string[]): string =>
  [
    '<Project Sdk="Microsoft.NET.Sdk">',
    '  <PropertyGroup>',
    '    <TargetFramework>net8.0</TargetFramework>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />',
    '    <PackageReference Include="xunit" Version="2.6.0" />',
    ...extraReferences,
    '  </ItemGroup>',
    '</Project>',
    '',
  ].join('\n');

const FLUTTER_PUBSPEC =
  'name: synthetic\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\n\ndependencies:\n  flutter:\n    sdk: flutter\n\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n';
const FLUTTER_SOURCE = {
  'lib/main.dart': 'int add(int a, int b) => a + b;\n',
  'test/widget_test.dart':
    "import 'package:flutter_test/flutter_test.dart';\nimport 'package:synthetic/main.dart';\n\nvoid main() {\n  test('adds', () {\n    expect(add(1, 2), 3);\n  });\n}\n",
};

const REACT_PACKAGE = pkg(
  { start: 'react-scripts start', build: 'react-scripts build', test: 'react-scripts test' },
  { dependencies: { react: '18.2.0', 'react-scripts': '5.0.1' } },
);
const REACT_SOURCE = { 'src/App.js': 'export default function App() {\n  return null;\n}\n' };
const REACT_TEST = {
  'src/App.test.js': "import App from './App';\n\ntest('renders nothing', () => {\n  expect(App()).toBe(null);\n});\n",
};

const NODE_TEST_FILE =
  "import test from 'node:test';\nimport assert from 'node:assert';\n\ntest('version', () => {\n  assert.equal(1, 1);\n});\n";

/** Item B: coverage switched on by a flag, a config block or a plug-in. */
export const V28_ITEM_B_FIXTURES: readonly V28A1Fixture[] = [
  {
    name: 'v28b-script-coverage-flag',
    files: { 'package.json': pkg({ test: 'vitest run --coverage' }, { devDependencies: { vitest: '1.6.0' } }), ...JS_SOURCE, ...JS_TEST },
  },
  {
    name: 'v28b-unreached-script-coverage-flag',
    files: {
      'package.json': pkg({ test: 'vitest run', 'test:coverage': 'vitest run --coverage' }, { devDependencies: { vitest: '1.6.0' } }),
      ...JS_SOURCE,
      ...JS_TEST,
    },
  },
  {
    name: 'v28b-vitest-coverage-block',
    files: {
      'package.json': pkg({ test: 'vitest run' }, { devDependencies: { vitest: '1.6.0' } }),
      'vitest.config.ts':
        "import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({\n  test: {\n    coverage: {\n      provider: 'v8',\n    },\n  },\n});\n",
      ...JS_SOURCE,
      ...JS_TEST,
    },
  },
  {
    name: 'v28b-jest-collect-coverage',
    files: {
      'package.json': pkg({ test: 'jest' }, { devDependencies: { jest: '29.7.0' } }),
      'jest.config.js': 'module.exports = {\n  collectCoverage: true,\n};\n',
      ...JS_SOURCE,
      ...JS_TEST,
    },
  },
  {
    name: 'v28b-jest-json-collect-coverage',
    files: {
      'package.json': pkg({ test: 'jest' }, { devDependencies: { jest: '29.7.0' } }),
      'jest.config.json': '{\n  "collectCoverage": true\n}\n',
      ...JS_SOURCE,
      ...JS_TEST,
    },
  },
  {
    name: 'v28b-pytest-cov-in-ci',
    files: {
      'pyproject.toml': PYPROJECT_PYTEST,
      '.github/workflows/test.yml': workflow('pip install pytest pytest-cov', 'pytest --cov=app'),
      ...PY_SOURCE,
      ...PY_TEST,
    },
  },
  {
    name: 'v28b-pytest-cov-in-tox-commands',
    files: {
      'pyproject.toml': PYPROJECT_PYTEST,
      'tox.ini': '[tox]\nenvlist = py\n\n[testenv]\ndeps =\n    pytest\ncommands = pytest --cov=app\n',
      ...PY_SOURCE,
      ...PY_TEST,
    },
  },
  {
    name: 'v28b-pytest-cov-in-addopts',
    files: {
      'pyproject.toml':
        '[project]\nname = "synthetic"\nversion = "1.0.0"\n\n[tool.pytest.ini_options]\naddopts = "--cov=app"\ntestpaths = ["tests"]\n',
      ...PY_SOURCE,
      ...PY_TEST,
    },
  },
  {
    name: 'v28b-pytest-cov-plugin-in-pyproject',
    files: {
      'pyproject.toml':
        '[project]\nname = "synthetic"\nversion = "1.0.0"\n\n[project.optional-dependencies]\ntest = [\n  "pytest",\n  "pytest-cov>=5",\n]\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
      ...PY_SOURCE,
      ...PY_TEST,
    },
  },
  {
    name: 'v28b-pytest-cov-plugin-in-requirements',
    files: {
      'pyproject.toml': PYPROJECT_PYTEST,
      'requirements-dev.txt': 'pytest==8.2.0\npytest-cov==5.0.0\n',
      ...PY_SOURCE,
      ...PY_TEST,
    },
  },
  {
    name: 'v28b-dotnet-xplat-collect-in-ci',
    files: {
      ...DOTNET_SOURCE,
      'tests/Synthetic.Tests/Synthetic.Tests.csproj': dotnetTestProject(),
      '.github/workflows/test.yml': workflow('dotnet test --collect:"XPlat Code Coverage"'),
    },
  },
  {
    name: 'v28b-flutter-test-coverage-in-ci',
    files: { 'pubspec.yaml': FLUTTER_PUBSPEC, ...FLUTTER_SOURCE, '.github/workflows/test.yml': workflow('flutter test --coverage') },
  },
];

/** Item B's negatives: no source the reading may count, so the no-coverage finding still fires. */
export const V28_ITEM_B_NEGATIVE_FIXTURES: readonly V28A1Fixture[] = [
  {
    name: 'v28b-neg-coverage-flag-only-in-readme',
    files: {
      'package.json': pkg({ test: 'vitest run' }, { devDependencies: { vitest: '1.6.0' } }),
      'README.md': '# Synthetic\n\nRun `vitest run --coverage` to collect coverage.\n',
      'docs/testing.md': 'Run `pytest --cov` or `vitest --coverage`; add pytest-cov to your environment.\n',
      ...JS_SOURCE,
      ...JS_TEST,
    },
  },
  {
    name: 'v28b-neg-pytest-cov-plugin-without-pytest-runner',
    files: {
      'package.json': pkg({ test: 'vitest run' }, { devDependencies: { vitest: '1.6.0' } }),
      'requirements-dev.txt': 'pytest-cov==5.0.0\n',
      ...JS_SOURCE,
      ...JS_TEST,
    },
  },
  {
    name: 'v28b-neg-coverage-flag-on-another-runner',
    files: {
      'pyproject.toml': PYPROJECT_PYTEST,
      'package.json': pkg({ lint: 'eslint --coverage .' }),
      ...PY_SOURCE,
      ...PY_TEST,
    },
  },
];

/** Item C: a lean runner beside a non-lean one, and a lean runner alone. */
export const V28_ITEM_C_FIXTURES: readonly V28A1Fixture[] = [
  {
    name: 'v28c-node-test-sdk-beside-pytest-suite',
    files: {
      'pyproject.toml': PYPROJECT_PYTEST,
      'sdk/js/package.json': pkg({ test: 'node --test' }),
      'sdk/js/index.mjs': 'export const version = 1;\n',
      'sdk/js/index.test.mjs': NODE_TEST_FILE,
      '.github/workflows/test.yml': workflow('pytest'),
      ...PY_SOURCE,
      ...PY_TEST,
    },
  },
  {
    name: 'v28c-node-test-only',
    files: {
      'package.json': pkg({ test: 'node --test' }),
      ...JS_SOURCE,
      'src/index.test.js':
        "import test from 'node:test';\nimport assert from 'node:assert';\nimport { add } from './index.js';\n\ntest('adds', () => {\n  assert.equal(add(1, 2), 3);\n});\n",
    },
  },
];

/** Item D: runners main does not recognise. */
export const V28_ITEM_D_FIXTURES: readonly V28A1Fixture[] = [
  { name: 'v28d-dotnet-test-project', files: { ...DOTNET_SOURCE, 'tests/Synthetic.Tests/Synthetic.Tests.csproj': dotnetTestProject() } },
  { name: 'v28d-flutter-test-project', files: { 'pubspec.yaml': FLUTTER_PUBSPEC, ...FLUTTER_SOURCE } },
  { name: 'v28d-react-scripts-test-project', files: { 'package.json': REACT_PACKAGE, ...REACT_SOURCE, ...REACT_TEST } },
  { name: 'v28d-react-scripts-no-test-files', files: { 'package.json': REACT_PACKAGE, ...REACT_SOURCE } },
  {
    name: 'v28d-dotnet-coverlet-collector',
    files: {
      ...DOTNET_SOURCE,
      'tests/Synthetic.Tests/Synthetic.Tests.csproj': dotnetTestProject('    <PackageReference Include="coverlet.collector" Version="6.0.0" />'),
    },
  },
];

/** Shapes no v28 reading applies to, beside the behaviour corpus: v28 must score them as v27 does. */
export const V28_NO_READING_FIXTURES: readonly V28A1Fixture[] = [
  { name: 'v28n-jest-without-coverage', files: { 'package.json': pkg({ test: 'jest' }, { devDependencies: { jest: '29.7.0' } }), ...JS_SOURCE, ...JS_TEST } },
  { name: 'v28n-pytest-without-coverage', files: { 'pyproject.toml': PYPROJECT_PYTEST, ...PY_SOURCE, ...PY_TEST } },
  { name: 'v28n-source-only', files: { ...JS_SOURCE } },
  {
    name: 'v28n-csproj-without-test-packages',
    files: { 'src/Synthetic/Synthetic.csproj': DOTNET_SOURCE['src/Synthetic/Synthetic.csproj'], 'src/Synthetic/Calc.cs': DOTNET_SOURCE['src/Synthetic/Calc.cs'] },
  },
  {
    name: 'v28n-pubspec-without-flutter-test',
    files: { 'pubspec.yaml': 'name: synthetic\ndependencies:\n  flutter:\n    sdk: flutter\n', 'lib/main.dart': 'int add(int a, int b) => a + b;\n' },
  },
];

export const V28_A1_FIXTURES: readonly V28A1Fixture[] = [
  ...V28_ITEM_B_FIXTURES,
  ...V28_ITEM_B_NEGATIVE_FIXTURES,
  ...V28_ITEM_C_FIXTURES,
  ...V28_ITEM_D_FIXTURES,
  ...V28_NO_READING_FIXTURES,
];
