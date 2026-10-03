import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildWitanInputFromRepo,
  findConcreteTestFiles,
  findConfiguredTestRunnerFiles,
} from '../repo-signals.js';

// Regression guard for the test conventions repo-signals.ts claims to recognise outside
// JS/TS and Python: Go, Rust, Ruby, PHP, Java (Maven and Gradle) and .NET. Each fixture is a
// minimal repository; each test asserts the three things A1 credits — a concrete test file,
// a CI workflow whose test command is recognised, and (where the source has an idiom for the
// language) a non-hollow test file. Tests only: a miss is recorded as an expected failure
// (it.fails) tied to a filed later: issue, never fixed in src/witan/ (B10 freeze).

interface Ecosystem {
  readonly name: string;
  readonly testFile: string;
  /** A second test file outside the ecosystem's test directory: only its filename convention applies. */
  readonly nameOnlyTestFile?: string;
  readonly files: Readonly<Record<string, string>>;
  /** False when the source has no assertion idiom for this language. */
  readonly assertionIdiom: boolean;
}

const ci = (command: string): string =>
  `name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: ${command}\n`;

const JAVA_MAIN =
  'package example;\n\npublic class Calc { public static int add(int a, int b) { return a + b; } }\n';
const JAVA_TEST =
  'package example;\n\nimport static org.junit.Assert.assertEquals;\nimport org.junit.Test;\n\npublic class CalcTest {\n    @Test\n    public void adds() {\n        assertEquals(3, Calc.add(1, 2));\n    }\n}\n';

const RUBY_SPEC =
  "require_relative '../lib/calc'\n\nRSpec.describe 'add' do\n  it 'sums' do\n    expect(add(1, 2)).to eq(3)\n  end\nend\n";
const PHP_TEST =
  '<?php\nuse PHPUnit\\Framework\\TestCase;\n\nfinal class CalcTest extends TestCase {\n    public function testAdd(): void {\n        $this->assertSame(3, add(1, 2));\n    }\n}\n';

const ECOSYSTEMS: readonly Ecosystem[] = [
  {
    name: 'Go',
    testFile: 'calc/calc_test.go',
    assertionIdiom: true,
    files: {
      'go.mod': 'module example.com/calc\n\ngo 1.22\n',
      'calc/calc.go': 'package calc\n\nfunc Add(a, b int) int { return a + b }\n',
      'calc/calc_test.go':
        'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tif Add(1, 2) != 3 {\n\t\tt.Errorf("bad sum")\n\t}\n}\n',
      '.github/workflows/ci.yml': ci('go test ./...'),
    },
  },
  {
    name: 'Rust',
    testFile: 'src/calc_test.rs',
    assertionIdiom: true,
    files: {
      'Cargo.toml': '[package]\nname = "calc"\nversion = "0.1.0"\nedition = "2021"\n',
      'src/lib.rs': 'pub fn add(a: i32, b: i32) -> i32 { a + b }\n',
      'src/calc_test.rs': '#[test]\nfn adds() {\n    assert!(crate::add(1, 2) == 3);\n}\n',
      '.github/workflows/ci.yml': ci('cargo test'),
    },
  },
  {
    name: 'Ruby',
    testFile: 'spec/calc_spec.rb',
    nameOnlyTestFile: 'lib/calc_spec.rb',
    assertionIdiom: true,
    files: {
      Gemfile: "source 'https://rubygems.org'\ngem 'rspec'\n",
      'lib/calc.rb': 'def add(a, b)\n  a + b\nend\n',
      'spec/calc_spec.rb': RUBY_SPEC,
      // Outside spec/: only the _spec.rb name convention can recognise this one.
      'lib/calc_spec.rb': RUBY_SPEC,
      '.github/workflows/ci.yml': ci('bundle exec rspec'),
    },
  },
  {
    name: 'PHP',
    testFile: 'tests/CalcTest.php',
    nameOnlyTestFile: 'src/calc_test.php',
    assertionIdiom: true,
    files: {
      'composer.json': '{"name":"example/calc","require-dev":{"phpunit/phpunit":"^10"}}\n',
      'phpunit.xml':
        '<phpunit><testsuites><testsuite name="a"><directory>tests</directory></testsuite></testsuites></phpunit>\n',
      'src/Calc.php': '<?php\nfunction add($a, $b) { return $a + $b; }\n',
      'tests/CalcTest.php': PHP_TEST,
      // Outside tests/: only the _test.php name convention can recognise this one.
      'src/calc_test.php': PHP_TEST,
      '.github/workflows/ci.yml': ci('vendor/bin/phpunit'),
    },
  },
  {
    name: 'Java (Maven)',
    testFile: 'src/test/java/example/CalcTest.java',
    nameOnlyTestFile: 'src/CalcTest.java',
    assertionIdiom: true,
    files: {
      'pom.xml':
        '<project><modelVersion>4.0.0</modelVersion><groupId>example</groupId><artifactId>calc</artifactId><version>1</version></project>\n',
      'src/main/java/example/Calc.java': JAVA_MAIN,
      'src/test/java/example/CalcTest.java': JAVA_TEST,
      'src/CalcTest.java': JAVA_TEST,
      '.github/workflows/ci.yml': ci('mvn test'),
    },
  },
  {
    name: 'Java (Gradle)',
    testFile: 'src/test/java/example/CalcTest.java',
    nameOnlyTestFile: 'src/CalcTest.java',
    assertionIdiom: true,
    files: {
      'build.gradle': "plugins { id 'java' }\n",
      'src/main/java/example/Calc.java': JAVA_MAIN,
      'src/test/java/example/CalcTest.java': JAVA_TEST,
      'src/CalcTest.java': JAVA_TEST,
      '.github/workflows/ci.yml': ci('gradle test'),
    },
  },
  {
    name: '.NET',
    testFile: 'Calc.Tests/CalcTests.cs',
    // repo-signals.ts has no xUnit/NUnit assertion idiom (Assert.Equal is not matched).
    assertionIdiom: false,
    files: {
      'Calc/Calc.csproj':
        '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n',
      'Calc/Calc.cs':
        'namespace Calc;\npublic static class Calculator { public static int Add(int a, int b) => a + b; }\n',
      'Calc.Tests/Calc.Tests.csproj':
        '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="xunit" Version="2.9.0" /></ItemGroup></Project>\n',
      'Calc.Tests/CalcTests.cs':
        'using Xunit;\nnamespace Calc.Tests;\npublic class CalcTests {\n    [Fact]\n    public void Adds() { Assert.Equal(3, Calc.Calculator.Add(1, 2)); }\n}\n',
      '.github/workflows/ci.yml': ci('dotnet test'),
    },
  },
];

function makeRepo(files: Readonly<Record<string, string>>): { repo: string; list: string[] } {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-test-convention-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  return { repo, list: Object.keys(files) };
}

function nonHollowShare(repo: string): { value: number; max: number } {
  const input = buildWitanInputFromRepo({
    productSlug: 'test-convention-ecosystems',
    productDisplayName: 'Test convention ecosystems',
    repoPath: repo,
    generatedAt: '2026-10-03T00:00:00.000Z',
  });
  const found = input.signals
    ?.find(({ criterionId }) => criterionId === 'A1')
    ?.metrics?.find(({ name }) => name === 'non_hollow_test_share');
  if (found?.max === undefined) throw new Error('A1 non_hollow_test_share metric absent');
  return { value: found.value, max: found.max };
}

describe('test conventions recognised per ecosystem', () => {
  for (const eco of ECOSYSTEMS) {
    it(`${eco.name}: test file, CI test command and assertion idiom are credited`, () => {
      const { repo, list } = makeRepo(eco.files);

      const concrete = findConcreteTestFiles(repo, list);
      expect(concrete).toContain(eco.testFile);
      if (eco.nameOnlyTestFile) expect(concrete).toContain(eco.nameOnlyTestFile);

      expect(findConfiguredTestRunnerFiles(repo, list)).toContain('.github/workflows/ci.yml');

      if (eco.assertionIdiom) {
        const testFileCount = eco.nameOnlyTestFile ? 2 : 1;
        expect(nonHollowShare(repo)).toEqual({ value: testFileCount, max: testFileCount });
      }
    });
  }

  // Control: the harness must be able to produce the failing value. A name-shaped test file with
  // no assertion is hollow, and a CI workflow with no test command is not credited.
  it('control: a hollow Go test file and a command-less workflow are not credited', () => {
    const { repo, list } = makeRepo({
      'go.mod': 'module example.com/calc\n\ngo 1.22\n',
      'calc/calc_test.go': 'package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {}\n',
      '.github/workflows/ci.yml': ci('echo hello'),
    });
    expect(findConcreteTestFiles(repo, list)).toContain('calc/calc_test.go');
    expect(findConfiguredTestRunnerFiles(repo, list)).not.toContain('.github/workflows/ci.yml');
    expect(nonHollowShare(repo)).toEqual({ value: 0, max: 1 });
  });
});
