import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import {
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V23,
  WITAN_SELECTABLE_RUBRIC_VERSIONS,
} from '../rubric-version.js';

// goal_cejel_v26_coverage_config_recognition_2026-10-14: A1's "no coverage configuration was
// detected" finding asserts an absence. Each idiom below is a coverage configuration the tool's own
// documentation defines, which the detector did not read before this change. Every idiom carries a
// positive fixture (recognized under every selectable rubric, v17 included) and at least one
// near-miss (disabled, commented out, or wrongly named) under which the absence still fires.
// Recognition fix: no rubric identifier moves. Fixtures are synthetic.

function makeRepo(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'witan-coverage-config-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: dir });
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(dir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
    execFileSync('git', ['add', relativePath], { cwd: dir });
  }
  return dir;
}

function a1Signal(dir: string, rubricVersion: string) {
  const input = buildWitanInputFromRepo({
    productSlug: 'synthetic-coverage-config',
    productDisplayName: 'Synthetic coverage configuration',
    repoPath: dir,
    generatedAt: '2026-10-14T00:00:00.000Z',
    rubricVersion,
  });
  return (input.signals ?? []).find((signal) => signal.criterionId === 'A1');
}

function coverageAbsence(dir: string, rubricVersion: string) {
  return a1Signal(dir, rubricVersion)?.findings?.find((finding) =>
    /no coverage configuration/i.test(finding.summary),
  );
}

function coverageEvidencePaths(dir: string, rubricVersion: string): string[] {
  return (a1Signal(dir, rubricVersion)?.positiveEvidence ?? [])
    .filter((evidence) => evidence.kind === 'coverage' && evidence.path !== undefined)
    .map((evidence) => evidence.path as string);
}

function workflow(...commands: string[]): string {
  return [
    'name: test',
    'on: [push]',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...commands.map((command) => `      - run: ${command}`),
    '',
  ].join('\n');
}

/** Recognized under every selectable rubric, with `path` cited as coverage evidence. */
function expectRecognized(files: Readonly<Record<string, string>>, path: string): void {
  const dir = makeRepo(files);
  for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    expect(coverageAbsence(dir, rubricVersion), `${rubricVersion}: absence still fired`).toBeUndefined();
    expect(coverageEvidencePaths(dir, rubricVersion), rubricVersion).toContain(path);
  }
}

/** The absence still fires under every selectable rubric, and nothing is cited as coverage. */
function expectAbsence(files: Readonly<Record<string, string>>): void {
  const dir = makeRepo(files);
  for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
    expect(coverageAbsence(dir, rubricVersion), `${rubricVersion}: absence did not fire`).toBeDefined();
    expect(coverageEvidencePaths(dir, rubricVersion), rubricVersion).toEqual([]);
  }
}

const JS_TEST = "import { expect, it } from 'vitest';\nit('works', () => expect(1).toBe(1));\n";

function jsBase(scripts: Readonly<Record<string, string>> = { test: 'vitest run' }, extra: object = {}) {
  return {
    'package.json': JSON.stringify({
      name: 'synthetic-js',
      version: '1.0.0',
      scripts,
      devDependencies: { vitest: '2.1.9', jest: '30.0.0' },
      ...extra,
    }),
    'src/value.ts': 'export const value = 1;\n',
    'test/value.test.ts': JS_TEST,
  };
}

const PY_BASE = {
  'src/value.py': 'value = 1\n',
  'tests/test_value.py': 'def test_value():\n    assert 1 == 1\n',
};
const RUBY_BASE = {
  'lib/value.rb': 'VALUE = 1\n',
  'spec/value_spec.rb': "RSpec.describe 'value' do\n  it { expect(1).to eq(1) }\nend\n",
  '.github/workflows/test.yml': workflow('bundle exec rspec'),
};
const PHP_BASE = {
  'src/Value.php': '<?php\nfinal class Value {}\n',
  'tests/ValueTest.php': '<?php\nfinal class ValueTest extends TestCase { public function testValue(): void { $this->assertTrue(true); } }\n',
};
const JVM_BASE = {
  'src/main/java/Value.java': 'public class Value {}\n',
  'src/test/java/ValueTest.java': 'class ValueTest { @Test void works() { assertEquals(1, 1); } }\n',
};
const RUST_BASE = {
  'Cargo.toml': '[package]\nname = "synthetic"\nversion = "0.1.0"\nedition = "2021"\n',
  'src/lib.rs': 'pub fn value() -> i32 { 1 }\n',
  'tests/value_test.rs': '#[test]\nfn works() { assert_eq!(synthetic::value(), 1); }\n',
};
const GO_BASE = {
  'go.mod': 'module example.invalid/synthetic\n\ngo 1.22\n',
  'value.go': 'package synthetic\n\nfunc Value() int { return 1 }\n',
  'value_test.go':
    'package synthetic\n\nimport "testing"\n\nfunc TestValue(t *testing.T) {\n\tif Value() != 1 {\n\t\tt.Fatal("value")\n\t}\n}\n',
};
const DOTNET_BASE = {
  'src/Value.cs': 'namespace Synthetic; public static class Value { public static int One => 1; }\n',
  'tests/ValueTests.cs': 'public class ValueTests { [Fact] public void Works() => Assert.Equal(1, 1); }\n',
};

describe('every base fixture fires the absence before any idiom is added', () => {
  it.each([
    ['JavaScript', jsBase()],
    ['Python', { ...PY_BASE, '.github/workflows/test.yml': workflow('pytest') }],
    ['Ruby', RUBY_BASE],
    ['PHP', { ...PHP_BASE, 'phpunit.xml': '<phpunit bootstrap="vendor/autoload.php"></phpunit>\n' }],
    ['Maven', { ...JVM_BASE, '.github/workflows/test.yml': workflow('mvn test') }],
    ['Rust', { ...RUST_BASE, '.github/workflows/test.yml': workflow('cargo test') }],
    ['Go', { ...GO_BASE, '.github/workflows/test.yml': workflow('go test ./...') }],
    ['.NET', { ...DOTNET_BASE, '.github/workflows/test.yml': workflow('dotnet test') }],
  ])('%s', (_label, files) => {
    expectAbsence(files);
  });
});

describe('item 1 — v23 command-flag coverage now applies under every rubric', () => {
  it('recognizes a reachable package-script coverage flag under v17', () => {
    expectRecognized(
      jsBase({ test: 'pnpm run test:coverage', 'test:coverage': 'vitest --coverage' }),
      'package.json',
    );
  });

  it('recognizes a coverage flag in a reachable Make recipe under v17', () => {
    expectRecognized({ ...PY_BASE, 'pytest.ini': '[pytest]\n', Makefile: 'test:\n\tpytest --cov=src\n' }, 'Makefile');
  });

  it('withholds the absence under v17 when flag ownership is unresolved, with the note', () => {
    const dir = makeRepo(jsBase({ test: 'custom-test-wrapper --coverage 88' }));
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      const a1 = a1Signal(dir, rubricVersion);
      expect(coverageAbsence(dir, rubricVersion), rubricVersion).toBeUndefined();
      expect(a1?.notes, rubricVersion).toContain(
        'Coverage command reachability or flag ownership was unresolved in package.json; the no-coverage absence claim was withheld.',
      );
    }
  });

  it('still fires the absence under v17 for an unreachable coverage script', () => {
    const dir = makeRepo(jsBase({ test: 'vitest run', 'cover:unit': 'vitest --coverage' }));
    expect(coverageAbsence(dir, WITAN_RUBRIC_VERSION_V17)).toBeDefined();
  });

  it('adds to v17 recognition rather than replacing it: a script named coverage still counts', () => {
    // v17's own rule (a `coverage` script is a coverage command) stays; v23 never had it.
    const dir = makeRepo(jsBase({ test: 'vitest run', coverage: 'nyc report' }));
    const component = (rubricVersion: string) =>
      a1Signal(dir, rubricVersion)
        ?.metrics?.find((metric) => metric.name === 'verification_script_ratio')
        ?.presentation?.components?.find((entry) => entry.label === 'coverage command')?.count;
    expect(component(WITAN_RUBRIC_VERSION_V17)).toBe(1);
    expect(component(WITAN_RUBRIC_VERSION_V23)).toBe(0);
  });

  it('does not extend v23 recipe-runner credit: a justfile-only test entry adds no v17 finding', () => {
    // A just `test:` recipe is a configured runner under v23 alone (a Makefile test target already
    // is one under every rubric). Extending it would create findings, not withdraw them, so it
    // stays v23-only.
    const dir = makeRepo({ ...PY_BASE, justfile: 'test:\n    pytest\n' });
    expect(coverageAbsence(dir, WITAN_RUBRIC_VERSION_V17)).toBeUndefined();
    expect(coverageAbsence(dir, WITAN_RUBRIC_VERSION_V23)).toBeDefined();
  });

  it('discloses the widened matcher family under a new pattern-set identity', () => {
    const dir = makeRepo(jsBase());
    expect(coverageAbsence(dir, WITAN_RUBRIC_VERSION_V17)?.derivation).toEqual(
      expect.objectContaining({ patternSetId: 'cejel.core-a1.coverage-configuration.v3', patternCount: 29 }),
    );
    expect(coverageAbsence(dir, WITAN_RUBRIC_VERSION_V23)?.derivation).toEqual(
      expect.objectContaining({ patternSetId: 'cejel.core-a1.coverage-configuration.v4', patternCount: 25 }),
    );
  });
});

describe('item 2 — documented configuration locations', () => {
  describe('Codecov dotfile forms', () => {
    it.each(['.codecov.yml', '.codecov.yaml'])('recognizes %s', (path) => {
      expectRecognized({ ...jsBase(), [path]: 'coverage:\n  status:\n    project: true\n' }, path);
    });
    it('near-miss: a wrongly named example file', () => {
      expectAbsence({ ...jsBase(), '.codecov.yml.example': 'coverage:\n  status:\n    project: true\n' });
    });
  });

  describe('nyc rc files', () => {
    it.each([
      ['.nycrc', '{ "check-coverage": true, "lines": 80 }\n'],
      ['.nycrc.json', '{ "check-coverage": true, "lines": 80 }\n'],
      ['.nycrc.yml', 'check-coverage: true\nlines: 80\n'],
      ['.nycrc.yaml', 'check-coverage: true\nlines: 80\n'],
    ])('recognizes %s', (path, contents) => {
      expectRecognized({ ...jsBase({ test: 'nyc mocha' }), [path]: contents }, path);
    });
    it('near-miss: a format nyc does not read (.nycrc.toml)', () => {
      expectAbsence({ ...jsBase(), '.nycrc.toml': 'check-coverage = true\n' });
    });
  });

  describe('c8 rc files', () => {
    it.each(['.c8rc', '.c8rc.json'])('recognizes %s', (path) => {
      expectRecognized({ ...jsBase(), [path]: '{ "check-coverage": true, "lines": 90 }\n' }, path);
    });
    it('near-miss: c8 has no YAML form (.c8rc.yml)', () => {
      expectAbsence({ ...jsBase(), '.c8rc.yml': 'check-coverage: true\n' });
    });
  });

  describe('coverage.py sections in setup.cfg and tox.ini', () => {
    const ci = { '.github/workflows/test.yml': workflow('pytest') };
    it.each([
      ['setup.cfg', '[metadata]\nname = synthetic\n\n[coverage:run]\nsource = src\nbranch = True\n'],
      ['tox.ini', '[tox]\nenvlist = py312\n\n[coverage:report]\nfail_under = 80\n'],
    ])('recognizes %s', (path, contents) => {
      expectRecognized({ ...PY_BASE, ...ci, [path]: contents }, path);
    });
    it('near-miss: an unprefixed [run] section, which only .coveragerc reads', () => {
      expectAbsence({ ...PY_BASE, ...ci, 'setup.cfg': '[metadata]\nname = synthetic\n\n[run]\nsource = src\n' });
    });
    it('near-miss: a commented-out section', () => {
      expectAbsence({ ...PY_BASE, ...ci, 'tox.ini': '[tox]\nenvlist = py312\n\n; [coverage:report]\n; fail_under = 80\n' });
    });
  });

  describe('Jest configuration under the package.json "jest" key', () => {
    it.each([
      ['collectCoverage: true', { collectCoverage: true }],
      ['coverageThreshold', { coverageThreshold: { global: { lines: 80 } } }],
      ['coverageProvider', { coverageProvider: 'v8' }],
    ])('recognizes %s', (_label, jest) => {
      expectRecognized(jsBase({ test: 'jest' }, { jest }), 'package.json');
    });
    it('near-miss: collectCoverage disabled', () => {
      expectAbsence(jsBase({ test: 'jest' }, { jest: { collectCoverage: false } }));
    });
    it('near-miss: the options under a key Jest does not read', () => {
      expectAbsence(jsBase({ test: 'jest' }, { jestConfig: { collectCoverage: true } }));
    });
  });

  describe('Vitest coverage inside vite.config', () => {
    const viteConfig = (test: string) =>
      `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  plugins: [],\n  test: ${test},\n});\n`;
    it.each(['vite.config.ts', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.js'])(
      'recognizes %s with test.coverage',
      (path) => {
        expectRecognized(
          { ...jsBase(), [path]: viteConfig("{ coverage: { provider: 'v8', reporter: ['text'] } }") },
          path,
        );
      },
    );
    it('recognizes vite.config when a sibling vitest.config merges it', () => {
      expectRecognized(
        {
          ...jsBase(),
          'vite.config.ts': viteConfig("{ coverage: { provider: 'v8' } }"),
          'vitest.config.ts':
            "import { defineConfig, mergeConfig } from 'vitest/config';\nimport viteConfig from './vite.config';\n\nexport default mergeConfig(viteConfig, defineConfig({ test: { environment: 'node' } }));\n",
        },
        'vite.config.ts',
      );
    });
    it('near-miss: coverage disabled with enabled: false', () => {
      expectAbsence({ ...jsBase(), 'vite.config.ts': viteConfig("{ coverage: { enabled: false, provider: 'v8' } }") });
    });
    it('near-miss: coverage: false', () => {
      expectAbsence({ ...jsBase(), 'vite.config.ts': viteConfig('{ coverage: false }') });
    });
    it('near-miss: coverage commented out', () => {
      expectAbsence({
        ...jsBase(),
        'vite.config.ts': viteConfig("{\n    environment: 'node',\n    // coverage: { provider: 'v8' },\n  }"),
      });
    });
    it('near-miss: coverage inside a multi-line block comment', () => {
      // The line-comment case above never reaches comment stripping: the property pattern already
      // refuses a line that starts with `//`. A block comment with `coverage:` on its own line does.
      expectAbsence({
        ...jsBase(),
        'vite.config.ts': viteConfig("{\n    environment: 'node',\n    /*\n    coverage: { provider: 'v8' },\n    */\n  }"),
      });
    });
    it('near-miss: a coverage key outside the test block', () => {
      expectAbsence({
        ...jsBase(),
        'vite.config.ts':
          "import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  build: { coverage: { provider: 'v8' } },\n  test: { environment: 'node' },\n});\n",
      });
    });
    it('near-miss: a sibling vitest.config that does not merge vite.config takes priority', () => {
      expectAbsence({
        ...jsBase(),
        'vite.config.ts': viteConfig("{ coverage: { provider: 'v8' } }"),
        'vitest.config.ts':
          "import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({ test: { environment: 'node' } });\n",
      });
    });
  });

  describe('SimpleCov .simplecov', () => {
    it('recognizes .simplecov', () => {
      expectRecognized(
        { ...RUBY_BASE, '.simplecov': "SimpleCov.start 'rails' do\n  add_filter '/spec/'\n  minimum_coverage 90\nend\n" },
        '.simplecov',
      );
    });
    it('near-miss: every line commented out', () => {
      expectAbsence({ ...RUBY_BASE, '.simplecov': "# SimpleCov.start 'rails' do\n#   add_filter '/spec/'\n# end\n" });
    });
  });

  describe('PHPUnit <coverage> element', () => {
    const phpunit = (body: string) =>
      `<?xml version="1.0" encoding="UTF-8"?>\n<phpunit bootstrap="vendor/autoload.php">\n  <testsuites>\n    <testsuite name="unit"><directory>tests</directory></testsuite>\n  </testsuites>\n${body}</phpunit>\n`;
    const coverage = '  <coverage>\n    <report>\n      <clover outputFile="clover.xml"/>\n    </report>\n  </coverage>\n';
    it.each(['phpunit.xml', 'phpunit.xml.dist'])('recognizes %s', (path) => {
      expectRecognized({ ...PHP_BASE, [path]: phpunit(coverage) }, path);
    });
    it('near-miss: the element inside an XML comment', () => {
      expectAbsence({ ...PHP_BASE, 'phpunit.xml': phpunit(`  <!--\n${coverage}  -->\n`) });
    });
    it('near-miss: a <source> element alone', () => {
      expectAbsence({
        ...PHP_BASE,
        'phpunit.xml': phpunit('  <source>\n    <include><directory>src</directory></include>\n  </source>\n'),
      });
    });
  });

  describe('JaCoCo applied as a Maven build plugin', () => {
    const ci = { '.github/workflows/test.yml': workflow('mvn test') };
    const jacoco = (extra = '') =>
      `      <plugin>\n        <groupId>org.jacoco</groupId>\n        <artifactId>jacoco-maven-plugin</artifactId>\n        <version>0.8.12</version>\n${extra}        <executions>\n          <execution><goals><goal>prepare-agent</goal></goals></execution>\n        </executions>\n      </plugin>\n`;
    const pom = (build: string, properties = '') =>
      `<project>\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>example</groupId>\n  <artifactId>synthetic</artifactId>\n  <version>1.0.0</version>\n${properties}  <build>\n${build}  </build>\n</project>\n`;
    it('recognizes jacoco-maven-plugin under <build><plugins>', () => {
      expectRecognized({ ...JVM_BASE, ...ci, 'pom.xml': pom(`    <plugins>\n${jacoco()}    </plugins>\n`) }, 'pom.xml');
    });
    it('near-miss: declared only in <pluginManagement>, which applies nothing by itself', () => {
      expectAbsence({
        ...JVM_BASE,
        ...ci,
        'pom.xml': pom(`    <pluginManagement>\n      <plugins>\n${jacoco()}      </plugins>\n    </pluginManagement>\n`),
      });
    });
    it('near-miss: the plugin inside an XML comment', () => {
      expectAbsence({ ...JVM_BASE, ...ci, 'pom.xml': pom(`    <plugins>\n<!--\n${jacoco()}-->\n    </plugins>\n`) });
    });
    it('near-miss: the plugin skipped with <skip>true</skip>', () => {
      expectAbsence({
        ...JVM_BASE,
        ...ci,
        'pom.xml': pom(`    <plugins>\n${jacoco('        <configuration><skip>true</skip></configuration>\n')}    </plugins>\n`),
      });
    });
    it('near-miss: the plugin skipped with the jacoco.skip property', () => {
      expectAbsence({
        ...JVM_BASE,
        ...ci,
        'pom.xml': pom(
          `    <plugins>\n${jacoco()}    </plugins>\n`,
          '  <properties>\n    <jacoco.skip>true</jacoco.skip>\n  </properties>\n',
        ),
      });
    });
  });

  describe('JaCoCo applied as a Gradle plugin', () => {
    const ci = { '.github/workflows/test.yml': workflow('gradle test') };
    it.each([
      ['build.gradle', "plugins {\n    id 'java'\n    id 'jacoco'\n}\n"],
      ['build.gradle.kts', 'plugins {\n    java\n    jacoco\n}\n'],
      ['build.gradle.kts', 'plugins {\n    java\n    id("jacoco")\n}\n'],
      ['build.gradle', "apply plugin: 'java'\napply plugin: 'jacoco'\n"],
    ])('recognizes %s: %j', (path, contents) => {
      expectRecognized({ ...JVM_BASE, ...ci, [path]: contents }, path);
    });
    it('near-miss: the plugin line commented out', () => {
      expectAbsence({ ...JVM_BASE, ...ci, 'build.gradle': "plugins {\n    id 'java'\n    // id 'jacoco'\n}\n" });
    });
    it('near-miss: the plugin inside a block comment', () => {
      expectAbsence({ ...JVM_BASE, ...ci, 'build.gradle.kts': 'plugins {\n    java\n    /* jacoco */\n}\n' });
    });
  });

  describe('cargo-tarpaulin configuration files', () => {
    const ci = { '.github/workflows/test.yml': workflow('cargo test') };
    it.each(['tarpaulin.toml', '.tarpaulin.toml'])('recognizes %s', (path) => {
      expectRecognized({ ...RUST_BASE, ...ci, [path]: '[report]\nout = ["Xml"]\n' }, path);
    });
    it('near-miss: a format tarpaulin does not read (.tarpaulin.yml)', () => {
      expectAbsence({ ...RUST_BASE, ...ci, '.tarpaulin.yml': 'out: Xml\n' });
    });
  });

  describe('dropped candidate: a coverlet package reference in a .csproj', () => {
    it('does not withdraw the absence — a reference alone collects nothing', () => {
      expectAbsence({
        ...DOTNET_BASE,
        '.github/workflows/test.yml': workflow('dotnet test'),
        'tests/Synthetic.Tests.csproj':
          '<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup>\n    <PackageReference Include="coverlet.collector" Version="6.0.2" />\n  </ItemGroup>\n</Project>\n',
      });
    });
  });
});

describe('item 3 — coverage flags on test commands in a CI workflow', () => {
  const CI = '.github/workflows/test.yml';

  it.each([
    ['pytest --cov', 'pytest --cov=src'],
    ['python -m pytest --cov', 'python -m pytest --cov=src --cov-report=xml'],
  ])('recognizes %s', (_label, command) => {
    expectRecognized({ ...PY_BASE, [CI]: workflow(command) }, CI);
  });
  it('near-miss: pytest --no-cov', () => {
    expectAbsence({ ...PY_BASE, [CI]: workflow('pytest --no-cov') });
  });
  it('near-miss: --cov handed to a different python module', () => {
    expectAbsence({ ...PY_BASE, [CI]: workflow('pytest', 'python -m codecov_uploader --cov=src') });
  });

  it.each([
    ['-cover', 'go test -cover ./...'],
    ['-coverprofile', 'go test -race -coverprofile=coverage.out ./...'],
    ['-covermode', 'go test -covermode atomic ./...'],
    ['-coverpkg', 'go test -coverpkg=./... ./...'],
    ['--coverprofile', 'go test --coverprofile coverage.out ./...'],
  ])('recognizes go test %s', (_label, command) => {
    expectRecognized({ ...GO_BASE, [CI]: workflow(command) }, CI);
  });
  it('near-miss: -cover=false', () => {
    expectAbsence({ ...GO_BASE, [CI]: workflow('go test -cover=false ./...') });
  });
  it('near-miss: a cover flag after -args belongs to the test binary, not go test', () => {
    expectAbsence({ ...GO_BASE, [CI]: workflow('go test ./... -args -coverprofile=coverage.out') });
  });
  it('near-miss: the coverage command commented out in the run block', () => {
    expectAbsence({
      ...GO_BASE,
      [CI]: 'jobs:\n  test:\n    steps:\n      - run: |\n          # go test -coverprofile=coverage.out ./...\n          go test ./...\n',
    });
  });
  it('near-miss: -cover on go vet', () => {
    expectAbsence({ ...GO_BASE, [CI]: workflow('go test ./...', 'go vet -cover ./...') });
  });

  it.each([
    ['--collect:"XPlat Code Coverage"', 'dotnet test --collect:"XPlat Code Coverage"'],
    ['--collect "Code Coverage"', 'dotnet test --collect "Code Coverage"'],
    ['/p:CollectCoverage=true', 'dotnet test /p:CollectCoverage=true'],
  ])('recognizes dotnet test %s', (_label, command) => {
    expectRecognized({ ...DOTNET_BASE, [CI]: workflow(command) }, CI);
  });
  it('near-miss: a data collector that is not coverage', () => {
    expectAbsence({ ...DOTNET_BASE, [CI]: workflow('dotnet test --collect:"blame"') });
  });
  it('near-miss: /p:CollectCoverage=false', () => {
    expectAbsence({ ...DOTNET_BASE, [CI]: workflow('dotnet test /p:CollectCoverage=false') });
  });
  it('near-miss: --collect after -- is a RunSettings argument, not a dotnet test option', () => {
    expectAbsence({ ...DOTNET_BASE, [CI]: workflow('dotnet test -- --collect:"XPlat Code Coverage"') });
  });
  it('near-miss: --collect on dotnet build', () => {
    expectAbsence({ ...DOTNET_BASE, [CI]: workflow('dotnet test', 'dotnet build --collect:"XPlat Code Coverage"') });
  });

  it.each([
    ['bare', 'cargo llvm-cov --workspace --lcov --output-path lcov.info'],
    ['nextest', 'cargo llvm-cov nextest --workspace'],
    ['--no-report', 'cargo llvm-cov --no-report'],
  ])('recognizes cargo llvm-cov (%s)', (_label, command) => {
    expectRecognized({ ...RUST_BASE, [CI]: workflow(command) }, CI);
  });
  it.each([
    ['report', 'cargo llvm-cov report --lcov'],
    ['--no-run', 'cargo llvm-cov --no-run --lcov'],
    ['clean', 'cargo llvm-cov clean --workspace'],
  ])('near-miss: cargo llvm-cov %s runs no tests', (_label, command) => {
    expectAbsence({ ...RUST_BASE, [CI]: workflow('cargo test', command) });
  });

  it('withholds the absence when a go cover flag value is environment-dependent', () => {
    const dir = makeRepo({ ...GO_BASE, [CI]: workflow('go test -cover=$WITH_COVERAGE ./...') });
    for (const rubricVersion of WITAN_SELECTABLE_RUBRIC_VERSIONS) {
      expect(coverageAbsence(dir, rubricVersion), rubricVersion).toBeUndefined();
      expect(a1Signal(dir, rubricVersion)?.notes, rubricVersion).toContain(
        'Coverage command reachability or flag ownership was unresolved',
      );
    }
  });
});
