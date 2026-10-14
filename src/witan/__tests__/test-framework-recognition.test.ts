import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';

// A1 non_hollow_test_share recognition for test frameworks the assertion patterns could not read
// (goal_cejel_v26_test_framework_recognition_2026-10-14; #406 for .NET). A recognition fix under
// every selectable rubric. Each idiom is taken from the framework's own documentation and counts
// only in live code, outside comments and string literals. Fixtures are synthetic.

const roots: string[] = [];
function share(files: Record<string, string>, rubricVersion?: string) {
  const root = mkdtempSync(join(tmpdir(), 'cejel-test-framework-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  const signals = buildWitanInputFromRepo({
    repoPath: root,
    productSlug: 'test-framework',
    productDisplayName: 'test-framework',
    generatedAt: '2026-09-15T00:00:00.000Z',
    ...(rubricVersion ? { rubricVersion } : {}),
  }).signals ?? [];
  const metric = signals.find(c => c.criterionId === 'A1')?.metrics?.find(m => m.name === 'non_hollow_test_share');
  // value is the non-hollow file count and max the rated count (at least 1): the share is their ratio.
  return metric?.max ? metric.value / metric.max : undefined;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const csharp = (body: string, head = 'using Xunit;\n\n') =>
  `${head}public class InventoryTests\n{\n    [Fact]\n    public void Counts()\n    {\n        ${body}\n    }\n}\n`;
const dotnet = (test: string, extra: Record<string, string> = {}) => share({
  'src/Inventory/Inventory.cs': 'public static class Inventory { public static int Count(int[] items) => items.Length; }\n',
  'tests/Inventory.Tests/InventoryTests.cs': test,
  ...extra,
});
const swift = (test: string) => share({
  'Package.swift': '// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "Inventory")\n',
  'Sources/Inventory/Inventory.swift': 'public func count(_ items: [Int]) -> Int { items.count }\n',
  'Tests/InventoryTests/InventoryTests.swift': test,
});
const swiftCase = (body: string) =>
  `import XCTest\n@testable import Inventory\n\nfinal class InventoryTests: XCTestCase {\n    func testCounts() throws {\n        ${body}\n    }\n}\n`;
const scala = (test: string, extra: Record<string, string> = {}) => share({
  'build.sbt': 'name := "inventory"\n',
  'src/main/scala/example/Inventory.scala': 'package example\n\nobject Inventory { def count(items: Seq[Int]): Int = items.size }\n',
  'src/test/scala/example/InventorySpec.scala': test,
  ...extra,
});
const kotlin = (test: string, extra: Record<string, string> = {}) => share({
  'build.gradle.kts': 'plugins { kotlin("jvm") }\n',
  'src/main/kotlin/example/Inventory.kt': 'package example\n\nfun count(items: List<Int>): Int = items.size\n',
  'src/test/kotlin/example/InventoryTest.kt': test,
  ...extra,
});
const node = (test: string) => share({
  'package.json': '{"name":"inventory","scripts":{"test":"tape test/*.js"}}\n',
  'index.js': 'exports.count = (items) => items.length;\n',
  'test/inventory.js': test,
});

describe('xUnit, NUnit and MSTest assertions (#406)', () => {
  // xUnit: https://xunit.net/docs/getting-started/v3/getting-started (Assert.Equal, Assert.True).
  it.each([
    'Assert.Equal(2, Inventory.Count(new[] { 1, 2 }));',
    'Assert.True(Inventory.Count(new[] { 1 }) == 1);',
    'Assert.Throws<System.ArgumentNullException>(() => Inventory.Count(null!));',
  ])('xUnit: credits live %s', body => { expect(dotnet(csharp(body))).toBe(1); });
  // NUnit: https://docs.nunit.org/articles/nunit/writing-tests/assertions/assertions.html
  it.each([
    'Assert.That(Inventory.Count(new[] { 1, 2 }), Is.EqualTo(2));',
    'ClassicAssert.AreEqual(2, Inventory.Count(new[] { 1, 2 }));',
  ])('NUnit: credits live %s', body => {
    expect(dotnet(csharp(body, 'using NUnit.Framework;\n\n').replace('[Fact]', '[Test]'))).toBe(1);
  });
  // MSTest: https://learn.microsoft.com/dotnet/core/testing/unit-testing-mstest-writing-tests-assertions
  it.each([
    'Assert.AreEqual(2, Inventory.Count(new[] { 1, 2 }));',
    'StringAssert.Contains("inventory", "in");',
    'CollectionAssert.AreEqual(new[] { 1 }, new[] { 1 });',
  ])('MSTest: credits live %s', body => {
    expect(dotnet(csharp(body, 'using Microsoft.VisualStudio.TestTools.UnitTesting;\n\n').replace('[Fact]', '[TestMethod]'))).toBe(1);
  });
  it.each([
    ['in a line comment', '// Assert.Equal(2, Inventory.Count(new[] { 1, 2 }));'],
    ['in a block comment', '/* Assert.Equal(2, Inventory.Count(new[] { 1, 2 })); */'],
    ['in a string literal', 'var note = "Assert.Equal(2, 2)";'],
    ['in a verbatim string literal', 'var note = @"C:\\temp\\" + @"Assert.Equal(2, 2)";'],
  ])('near-miss: the idiom only %s stays hollow', (_where, body) => {
    expect(dotnet(csharp(body))).toBe(0);
  });
});

describe('Swift XCTest assertions', () => {
  // https://developer.apple.com/documentation/xctest/test-assertions; the open-source
  // swift-corelibs-xctest declares the same functions in Sources/XCTest/Public/XCTAssert.swift.
  it.each([
    'XCTAssertEqual(count([1, 2]), 2)',
    'XCTAssertTrue(count([1]) == 1)',
    'XCTAssert(count([]) == 0)',
    'let value = try XCTUnwrap(Optional(count([1])))',
    'XCTFail("not implemented")',
  ])('credits live %s', body => { expect(swift(swiftCase(body))).toBe(1); });
  it.each([
    ['in a line comment', '// XCTAssertEqual(count([1, 2]), 2)'],
    ['in a nested block comment', '/* outer /* inner */ XCTAssertEqual(count([1, 2]), 2) */'],
    ['in a string literal', 'let note = "XCTAssertEqual(count([1, 2]), 2)"'],
    ['in a multi-line string literal', 'let note = """\n        a lone " quote, then XCTAssertEqual(count([1, 2]), 2)\n        """'],
  ])('near-miss: the idiom only %s stays hollow', (_where, body) => {
    expect(swift(swiftCase(body))).toBe(0);
  });
});

describe('ScalaTest assertions and matchers', () => {
  const suite = (body: string, imports = 'import org.scalatest.funsuite.AnyFunSuite\n') =>
    `package example\n\n${imports}\nclass InventorySpec extends AnyFunSuite {\n  test("counts") {\n    ${body}\n  }\n}\n`;
  // The 3.1+ import `org.scalatest.matchers.should.Matchers` is not used here: its own text
  // already matches the JS `should.` idiom above, so a file carrying it was never hollow and
  // could not show this change. The 3.0 grouped import and the must form carry no such text.
  const matchers = 'import org.scalatest.{FlatSpec, Matchers}\n';
  const mustMatchers = 'import org.scalatest.flatspec.AnyFlatSpec\nimport org.scalatest.matchers.must.Matchers\n';
  // https://www.scalatest.org/user_guide/using_assertions (assert, assertResult, assertThrows, intercept)
  it.each([
    'assert(Inventory.count(Seq(1, 2)) == 2)',
    'assertThrows[IllegalArgumentException] { require(false) }',
    'intercept[IllegalArgumentException] { require(false) }',
  ])('credits live %s with a ScalaTest import', body => { expect(scala(suite(body))).toBe(1); });
  // https://www.scalatest.org/user_guide/using_matchers (shouldBe, should be, should equal)
  it.each([
    'Inventory.count(Seq(1, 2)) shouldBe 2',
    'Inventory.count(Seq(1, 2)) should be (2)',
    'Inventory.count(Seq(1, 2)) should equal (2)',
    'Inventory.count(Seq(1, 2)) shouldEqual 2',
  ])('credits live %s with a ScalaTest matchers import', body => {
    expect(scala(suite(body, matchers))).toBe(1);
  });
  it.each([
    'Inventory.count(Seq(1, 2)) mustBe 2',
    'Inventory.count(Seq(1, 2)) must equal (2)',
  ])('credits live %s with a ScalaTest must-matchers import', body => {
    expect(scala(suite(body, mustMatchers))).toBe(1);
  });
  it('near-miss: assert( without a ScalaTest import stays hollow', () => {
    expect(scala(suite('assert(Inventory.count(Seq(1, 2)) == 2)', ''))).toBe(0);
  });
  it('near-miss: shouldBe without a matchers import stays hollow', () => {
    expect(scala(suite('Inventory.count(Seq(1, 2)) shouldBe 2'))).toBe(0);
  });
  it('near-miss: a matchers import that is only a comment does not license shouldBe', () => {
    expect(scala(suite('Inventory.count(Seq(1, 2)) shouldBe 2', 'import org.scalatest.funsuite.AnyFunSuite\n// import org.scalatest.Matchers\n'))).toBe(0);
  });
  it.each([
    ['in a line comment', '// Inventory.count(Seq(1, 2)) shouldBe 2'],
    ['in a string literal', 'val note = "Inventory.count(Seq(1, 2)) shouldBe 2"'],
    ['in a triple-quoted string', 'val note = """a lone " quote, then x shouldBe 2"""'],
  ])('near-miss: the matcher only %s stays hollow', (_where, body) => {
    expect(scala(suite(body, matchers))).toBe(0);
  });
});

describe('Kotest matchers', () => {
  const spec = (body: string, imports = 'import io.kotest.core.spec.style.StringSpec\nimport io.kotest.matchers.shouldBe\n') =>
    `package example\n\n${imports}\nclass InventoryTest : StringSpec({\n    "counts" {\n        ${body}\n    }\n})\n`;
  // https://kotest.io/docs/assertions/assertions.html ("name shouldBe \"sam\"", shouldXxx matchers)
  it.each([
    'count(listOf(1, 2)) shouldBe 2',
    'count(listOf(1, 2)).shouldBe(2)',
  ])('credits live %s with a Kotest matcher import', body => { expect(kotlin(spec(body))).toBe(1); });
  it('credits a Kotest matcher brought in by a wildcard import', () => {
    expect(kotlin(spec('"inventory".shouldContain("vent")', 'import io.kotest.core.spec.style.StringSpec\nimport io.kotest.matchers.string.*\n'))).toBe(1);
  });
  it('near-miss: shouldBe without a Kotest matcher import stays hollow', () => {
    expect(kotlin(spec('count(listOf(1, 2)) shouldBe 2', 'import io.kotest.core.spec.style.StringSpec\n'))).toBe(0);
  });
  it.each([
    ['in a line comment', '// count(listOf(1, 2)) shouldBe 2'],
    ['in a string literal', 'println("expected: count shouldBe 2")'],
    ['in a raw string', 'val note = """a lone " quote, then count(listOf(1, 2)) shouldBe 2"""'],
  ])('near-miss: the matcher only %s stays hollow', (_where, body) => {
    expect(kotlin(spec(body))).toBe(0);
  });
});

describe('tape and tap assertions', () => {
  // tape: https://github.com/tape-testing/tape#methods (t.ok, t.equal, t.deepEqual/t.same, ...)
  it.each([
    "const test = require('tape');\n\ntest('counts', (t) => {\n  t.equal(count([1, 2]), 2);\n  t.end();\n});\n",
    "import test from 'tape';\n\ntest('counts', (t) => {\n  t.ok(count([1]) === 1);\n  t.end();\n});\n",
    "const test = require('tape');\n\ntest('counts', function (t) {\n  t.deepEqual([count([1])], [1]);\n  t.end();\n});\n",
  ])('tape: credits a live assertion %#', body => { expect(node(body)).toBe(1); });
  // tap: https://node-tap.org/basics/ and the Assertions class, https://tapjs.github.io/tapjs/classes/_tapjs_asserts.index.Assertions.html
  it.each([
    "import t from 'tap';\n\nt.same(count([1, 2]), 2);\n",
    "const t = require('tap');\n\nt.test('counts', async (t) => {\n  t.equal(count([1, 2]), 2);\n});\n",
    "import { test } from 'tap';\n\ntest('counts', (t) => {\n  t.match({ size: count([1]) }, { size: 1 });\n  t.end();\n});\n",
  ])('tap: credits a live assertion %#', body => { expect(node(body)).toBe(1); });
  it.each([
    ['without any tape or tap import', "const t = { equal() {}, end() {} };\n\nt.equal(count([1, 2]), 2);\nt.end();\n"],
    ['with the import only inside a string', "const fixture = \"const test = require('tape');\";\nconst t = { equal() {} };\nt.equal(count([1, 2]), 2);\n"],
    ['with the import only inside a comment', "// const test = require('tape');\nconst t = { equal() {} };\nt.equal(count([1, 2]), 2);\n"],
  ])('near-miss: t.equal %s stays hollow', (_where, body) => { expect(node(body)).toBe(0); });
  it.each([
    ['in a line comment', "const test = require('tape');\n\ntest('counts', (t) => {\n  // t.equal(count([1, 2]), 2);\n  t.end();\n});\n"],
    ['in a string literal', "const test = require('tape');\n\ntest('counts', (t) => {\n  t.comment('t.equal(count([1, 2]), 2)');\n  t.end();\n});\n"],
  ])('near-miss: the assertion only %s stays hollow', (_where, body) => { expect(node(body)).toBe(0); });
});

describe('suite-level skips', () => {
  const live = { 'tests/Inventory.Tests/CountTests.cs': csharp('Assert.Equal(1, 1);').replace('InventoryTests', 'CountTests') };
  // NUnit: "When applied to a fixture or assembly, all contained tests are ignored."
  // https://docs.nunit.org/articles/nunit/writing-tests/attributes/ignore.html
  it.each([
    ['[TestFixture, Ignore("flaky")]', 'using NUnit.Framework;\n\n[TestFixture, Ignore("flaky")]\n'],
    ['[Ignore] then [TestFixture]', 'using NUnit.Framework;\n\n[Ignore("flaky")]\n[TestFixture]\n'],
    // MSTest: IgnoreAttribute "unconditionally skips a test class or method".
    // https://learn.microsoft.com/dotnet/core/testing/unit-testing-mstest-writing-tests-controlling-execution
    ['MSTest [TestClass] then [Ignore]', 'using Microsoft.VisualStudio.TestTools.UnitTesting;\n\n[TestClass]\n[Ignore]\n'],
  ])('a fixture class under %s is hollow', (_name, head) => {
    const ignored = `${head}public class InventoryTests\n{\n    [Test]\n    public void Counts()\n    {\n        Assert.That(1, Is.EqualTo(1));\n    }\n}\n`;
    expect(dotnet(ignored, live)).toBe(0.5);
  });
  it.each([
    ['an xUnit [Fact(Skip = ...)]', csharp('Assert.Equal(1, 1);').replace('[Fact]', '[Fact(Skip = "flaky")]\n    public void Skipped() { Assert.Equal(1, 2); }\n\n    [Fact]')],
    ['an NUnit [Test, Ignore(...)] on one method', csharp('Assert.That(1, Is.EqualTo(1));', 'using NUnit.Framework;\n\n').replace('[Fact]', '[Test, Ignore("flaky")]\n    public void Skipped() { Assert.That(1, Is.EqualTo(2)); }\n\n    [Test]')],
    ['a commented-out fixture [Ignore]', `using NUnit.Framework;\n\n// [Ignore("flaky")]\n${csharp('Assert.That(1, Is.EqualTo(1));', '').replace('[Fact]', '[Test]')}`],
  ])('a per-test skip or inert attribute does not make the file hollow: %s', (_name, test) => {
    expect(dotnet(test, live)).toBe(1);
  });
  // ScalaTest: "to temporarily ignore an entire suite of tests, you can annotate the test class
  // with @Ignore" — org.scalatest.Ignore (jvm/core/src/main/java/org/scalatest/Ignore.java).
  it('ScalaTest: a suite class annotated @Ignore is hollow', () => {
    const liveSpec = 'package example\n\nimport org.scalatest.funsuite.AnyFunSuite\n\nclass CountSpec extends AnyFunSuite {\n  test("counts") { assert(1 == 1) }\n}\n';
    const ignored = 'package example\n\nimport org.scalatest.Ignore\nimport org.scalatest.funsuite.AnyFunSuite\n\n@Ignore\nclass InventorySpec extends AnyFunSuite {\n  test("counts") { assert(1 == 1) }\n}\n';
    expect(scala(ignored, { 'src/test/scala/example/CountSpec.scala': liveSpec })).toBe(0.5);
  });
  it('ScalaTest: a per-test ignore does not make the file hollow', () => {
    const test = 'package example\n\nimport org.scalatest.funsuite.AnyFunSuite\n\nclass InventorySpec extends AnyFunSuite {\n  ignore("later") { assert(1 == 2) }\n  test("counts") { assert(1 == 1) }\n}\n';
    expect(scala(test)).toBe(1);
  });
  // Kotest: "If we wish to simply disable a spec completely, then we can use the @Ignored annotation."
  // https://kotest.io/docs/framework/conditional/spec-annotations-conditional-evaluation.html
  it('Kotest: a spec annotated @Ignored is hollow', () => {
    const liveSpec = 'package example\n\nimport io.kotest.core.spec.style.StringSpec\nimport io.kotest.matchers.shouldBe\n\nclass CountTest : StringSpec({\n    "counts" { 1 shouldBe 1 }\n})\n';
    const ignored = 'package example\n\nimport io.kotest.core.annotation.Ignored\nimport io.kotest.core.spec.style.StringSpec\nimport io.kotest.matchers.shouldBe\n\n@Ignored\nclass InventoryTest : StringSpec({\n    "counts" { 1 shouldBe 1 }\n})\n';
    expect(kotlin(ignored, { 'src/test/kotlin/example/CountTest.kt': liveSpec })).toBe(0.5);
  });
});

describe('a name-shaped file is not newly called hollow from an assertion library this rule does not read', () => {
  // `*Tests.cs` and `*Spec.scala` are rated by name only when a documented suite-level skip makes
  // them hollow. An unrecognised assertion library (here FluentAssertions, specs2) is not proof of
  // a placeholder, so such a file stays out of the denominator, as it was before this change.
  it('a FluentAssertions-only *Tests.cs file is not rated hollow', () => {
    const fluent = 'using FluentAssertions;\nusing Xunit;\n\npublic class InventoryTests\n{\n    [Fact]\n    public void Counts() => Inventory.Count(new[] { 1, 2 }).Should().Be(2);\n}\n';
    expect(dotnet(fluent, { 'tests/Inventory.Tests/CountTests.cs': csharp('Assert.Equal(1, 1);').replace('InventoryTests', 'CountTests') })).toBe(1);
  });
  it('a specs2-only *Spec.scala file is not rated hollow', () => {
    const specs2 = 'package example\n\nimport org.specs2.mutable.Specification\n\nclass InventorySpec extends Specification {\n  "count" >> { Inventory.count(Seq(1, 2)) must_== 2 }\n}\n';
    const liveSpec = 'package example\n\nimport org.scalatest.funsuite.AnyFunSuite\n\nclass CountSpec extends AnyFunSuite {\n  test("counts") { assert(1 == 1) }\n}\n';
    expect(scala(specs2, { 'src/test/scala/example/CountSpec.scala': liveSpec })).toBe(1);
  });
});

describe('every selectable rubric', () => {
  it.each([...WITAN_SELECTABLE_RUBRIC_VERSIONS])('%s credits an xUnit, XCTest, ScalaTest, Kotest and tape file', rubricVersion => {
    expect(share({
      'src/Inventory/Inventory.cs': 'public static class Inventory { public static int Count(int[] items) => items.Length; }\n',
      'tests/Inventory.Tests/InventoryTests.cs': csharp('Assert.Equal(2, Inventory.Count(new[] { 1, 2 }));'),
      'Tests/InventoryTests/InventoryTests.swift': swiftCase('XCTAssertEqual(count([1, 2]), 2)'),
      'src/test/scala/example/InventorySpec.scala': 'import org.scalatest.funsuite.AnyFunSuite\n\nclass InventorySpec extends AnyFunSuite {\n  test("counts") { assert(1 == 1) }\n}\n',
      'src/test/kotlin/example/InventoryTest.kt': 'import io.kotest.matchers.shouldBe\n\nclass InventoryTest : StringSpec({ "counts" { 1 shouldBe 1 } })\n',
      'test/inventory.js': "const test = require('tape');\ntest('counts', (t) => { t.equal(1, 1); t.end(); });\n",
    }, rubricVersion)).toBe(1);
  });
});
