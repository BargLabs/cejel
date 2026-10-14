# A1 test-framework recognition — 2026-10-14

**CONSTRAINTS-VERSION: 2026-08-01.5**

This is a recognition fix under every selectable rubric. It ships the way #427 (AVA) did: no
identifier bump, and weights and thresholds unchanged. Fingerprints and goldens are re-pinned, and
each delta is recorded in `leaderboard/RUBRIC_CHANGELOG.md`. The release that carries it runs a
preregistered public before-and-after, and the operator runs the private labelled-case check
before that release. This change runs neither.

## The issues

- **#406** (.NET): `Assert.Equal` and similar match nothing in the assertion patterns, so .NET test
  files skip the non-hollow check. This is an A1 assertion-recognition gap and is fixed here.
- **#409** is not an A1 test-file or assertion-recognition gap. The v26 brief calls it "wrapper-run
  tests". What the issue describes is A1's **verification-command** matching:
  - CI runs tests through `./Build.ps1`, `${{ env.CARGO }} test` or `./mvnw … verify`, and
    `CI_TEST_COMMAND_PATTERN` misses them;
  - the type-check and lint patterns (`tsc|mypy|pyright`, `eslint|pylint|…`) give compiled
    languages nothing;
  - `isTestRunnerConfig` has no `.ps1`, `build.sh`, .NET or JVM entries.

  That matches the cycle-13 washout record's description. The issue itself calls each option "a
  measurement decision, not a bug fix under v17". It is left out of this change.

## How test files are admitted

`findConcreteTestFiles` admits a file through `isTestFile`:
- test directories: `tests?/`, `specs?/`, `__tests__/`, and `<name>Tests/` / `<name>Specs/`;
- per-language name conventions.

The documented layouts of these frameworks are already admitted by directory: SwiftPM
`Tests/<Target>Tests/`, .NET `<Project>.Tests/` or `tests/`, sbt and Gradle `src/test/…`, and a
tape `test/` folder. `NAME_SHAPED_TEST_FILE_PATTERN` admits nothing. It only decides whether an
admitted file with no recognized assertion is rated hollow, or excluded from the denominator as
support scaffolding. Admission, and with it `test_to_source_ratio`, is unchanged.

## The change

`measureNonHollowTestShare` adds one recognizer, `hasLiveFrameworkAssertion`, and one skip
detector, `hasFrameworkSuiteLevelSkip`. Both run over `maskCommentsAndStrings`, which blanks
comments and string literals, preserving offsets. Its lexer handles:
- nested block comments;
- `"""` strings;
- C# `@"…"` verbatim strings.

Idioms are searched with `import` lines blanked. Every existing pattern still runs on raw text,
unchanged. Masking runs lazily: only for a file the existing patterns did not credit, or one that
contains `Ignore`/`Ignored`.

### Idioms, each from the framework's own documentation

Web fetch was not permitted from this session. Each project's documentation source, or its public
API source where the published page is built elsewhere, was read on GitHub at its default branch
on 2026-10-14. The URL is the page that source builds.

| Framework | Idiom | Gate | Documentation |
| --- | --- | --- | --- |
| xUnit | `Assert.X(` incl. generic `Assert.Throws<T>(` | none: the v3 template adds `<Using Include="Xunit" />` project-wide | <https://xunit.net/docs/getting-started/v3/getting-started> (`Assert.True`, `Assert.Equal`; source `site/docs/getting-started/v3/getting-started.md` in xunit/xunit.net) |
| NUnit | `Assert.That(`, `ClassicAssert.X(` | none | <https://docs.nunit.org/articles/nunit/writing-tests/assertions/assertions.html> (source in nunit/docs) |
| MSTest | `Assert.X(`, `StringAssert.X(`, `CollectionAssert.X(` | none | <https://learn.microsoft.com/dotnet/core/testing/unit-testing-mstest-writing-tests-assertions> (source in dotnet/docs) |
| XCTest | `XCTAssert…(`, `XCTFail(`, `XCTUnwrap(` | none (the names are unique) | <https://developer.apple.com/documentation/xctest>; not loaded. The same public functions are declared in swiftlang/swift-corelibs-xctest `Sources/XCTest/Public/XCTAssert.swift`, which was read. |
| ScalaTest | `assert(`, `assertResult(`, `assertThrows[`, `intercept[` | an `import org.scalatest…` | <https://www.scalatest.org/user_guide/using_assertions>; not loaded. Read from `jvm/core/src/main/scala/org/scalatest/Assertions.scala` in scalatest/scalatest. |
| ScalaTest matchers | `shouldBe`, `shouldEqual`, `should be`, `should equal`, `mustBe`, `must equal`, … | a ScalaTest matchers import (`org.scalatest.matchers…`, `org.scalatest.{…Matchers}`, `org.scalatest._`) | <https://www.scalatest.org/user_guide/using_matchers>; not loaded. Read from `matchers/should/Matchers.scala` (scaladoc: `result should equal (3)`, `result should be (3)`, `result shouldBe 3`) and `MustBeCanEqualSpec.scala` (`x mustBe y`). |
| Kotest | `shouldX` matchers (`shouldBe`, `shouldContain`, …) | an `io.kotest.matchers` / `io.kotest.assertions` import | <https://kotest.io/docs/assertions/assertions.html> ("name shouldBe \"sam\""; source `documentation/docs/assertions/index.md` in kotest/kotest) |
| tape | `t.ok(`, `t.equal(`, `t.deepEqual(`/`t.same(`, `t.throws(` and every documented alias | a live `tape` import or require | <https://github.com/tape-testing/tape#methods> (`readme.markdown`) |
| tap | `t.equal(`, `t.same(`, `t.match(`, `t.ok(`, `t.has(`, `t.throws(`, `t.rejects(`, … | a live `tap` import or require | <https://node-tap.org/basics/> (`import t from 'tap'`), and the Assertions class <https://tapjs.github.io/tapjs/classes/_tapjs_asserts.index.Assertions.html> (methods read from `src/asserts/src/index.ts` in tapjs/tapjs) |

### Suite-level skips

| Skip | Effect | Documentation |
| --- | --- | --- |
| NUnit `[Ignore("…")]` on the fixture class, alone or in a combined list (`[TestFixture, Ignore("…")]`) | hollow | "When applied to a fixture or assembly, all contained tests are ignored." <https://docs.nunit.org/articles/nunit/writing-tests/attributes/ignore.html> |
| MSTest `[Ignore]` on the test class | hollow | "unconditionally skips a test class or method" <https://learn.microsoft.com/dotnet/core/testing/unit-testing-mstest-writing-tests-controlling-execution> |
| ScalaTest `@Ignore` on the suite class (with a ScalaTest import) | hollow | "you can annotate the test class with `@Ignore`" (`jvm/core/src/main/java/org/scalatest/Ignore.java`) |
| Kotest `@Ignored` on the spec class (with a Kotest import) | hollow | "If we wish to simply disable a spec completely, then we can use the `@Ignored` annotation." <https://kotest.io/docs/framework/conditional/spec-annotations-conditional-evaluation.html> |
| xUnit `[Fact(Skip = …)]`, NUnit `[Test, Ignore(…)]` on a method, ScalaTest `ignore(…)` | not hollow | per-test only |

xUnit, XCTest, tape and tap document no suite-level skip.

### Naming: a deliberate narrowing of the card

The card asks for `*Tests.swift`, `*Tests.cs` / `*Test.cs` and `*Spec.scala` / `*Test.scala` /
`*Suite.scala` in `NAME_SHAPED_TEST_FILE_PATTERN`. Added there, each would rate every such file
**hollow by absence** whenever no recognized idiom matches. In these ecosystems that includes
FluentAssertions, Shouldly, specs2 and every other assertion library this rule does not read. That
would be a new false assertion from a recognition fix.

So the .NET and Scala names (`SUITE_SKIP_NAME_SHAPED_TEST_FILE_PATTERN`) join the denominator only
when a documented suite-level skip disables the file. That is what makes NUnit's "[Ignore] on the
fixture class" hollow, as the card requires. An unrecognized library leaves the file out of the
denominator, as before. Two controls pin this: a FluentAssertions-only `*Tests.cs` and a
specs2-only `*Spec.scala`. `*Tests.swift` is not added. XCTest documents no suite-level skip, so
under this rule the name would never take effect.

**For review:** making these names rate by absence is a one-line change. Guard 8 below shows the
two controls that would then fail.

## Red first

`src/witan/__tests__/test-framework-recognition.test.ts`, run against the unfixed scanner
(`4ca642ef`'s `repo-signals.ts`) with the final test file: **75 tests, 52 failed, 23 passed.**
- **Failed:** every positive; every skip case, including the per-test-skip controls, whose live
  file was not recognized; both naming controls; and the every-rubric case (×10).
- **Passed:** every near-miss.

After the fix: 75 of 75.

One finding from writing the red tests: ScalaTest 3.1+'s documented import,
`import org.scalatest.matchers.should.Matchers`, is **already** credited before this change. The
raw JS alternative `should\.` matches the import line itself, so a file carrying it was never
hollow and could not show this change. The positive and near-miss fixtures therefore use the 3.0
grouped import and the `must` form. The looseness is false credit, outside this change's scope,
and tightening it would move existing scores down. Filed as #486.

## Guard deletions

Each guard was deleted alone from the fixed source, the new suite run, and the source restored.

| # | Guard deleted | Red | Named test(s) |
| --- | --- | --- | --- |
| 1 | comment and string masking (`maskCommentsAndStrings` returns raw text) | 20 | every comment/string near-miss: xUnit ×4, XCTest ×4, ScalaTest ×4, Kotest ×3, tape ×4; plus `a commented-out fixture [Ignore]` |
| 2 | tape/tap import check | 3 | `t.equal without any tape or tap import`, `…import only inside a string`, `…import only inside a comment` |
| 3 | tape/tap binding must be live code (keyword outside strings) | 1 | `t.equal with the import only inside a string stays hollow` |
| 4 | ScalaTest matchers-import check | 3 | `shouldBe without a matchers import`, `a matchers import that is only a comment does not license shouldBe`, and the Kotest `shouldBe without a Kotest matcher import` (the ungated ScalaTest matcher also reads Kotlin) |
| 5 | Kotest matchers-import check | 3 | the same three |
| 6 | ScalaTest import check on `assert(` | 1 | `assert( without a ScalaTest import stays hollow` |
| 7 | `[Ignore]` must sit on a class | 1 | `an NUnit [Test, Ignore(...)] on one method` |
| 8 | skip-scoped naming (rate `*Tests.cs`/`*Spec.scala` by name alone) | 2 | `a FluentAssertions-only *Tests.cs file is not rated hollow`, `a specs2-only *Spec.scala file is not rated hollow` |
| 9 | import-line blanking | 3 | the Kotest comment, string and raw-string near-misses (`import io.kotest.matchers.shouldBe` matched the idiom by itself) |
| 10 | `"""` string handling | 3 | Swift multi-line, ScalaTest triple-quoted and Kotest raw-string near-misses |
| 11 | C# verbatim-string handling | 1 | `the idiom only in a verbatim string literal` |
| 12 | nested block comments | 1 | `the idiom only in a nested block comment` |

**Guard 10 first turned nothing red.** Each triple-quoted near-miss then held two embedded quotes,
so plain quote toggling happened to mask them as well. Each now holds one embedded quote, and the
deletion turns 3 red. This is #479's lesson again: a guard-deletion fixture must reach the guard.

## Behaviour corpus

Six synthetic specimens extend the corpus from 22 to 28:
- `xunit-assertions`;
- `nunit-ignored-fixture`: a live `Assert.That` fixture beside a `[TestFixture, Ignore(…)]` one;
- `xctest-assertions`;
- `scalatest-assertions`;
- `kotest-matchers`;
- `tape-assertions`.

The previous scanner (`4ca642ef`'s `repo-signals.ts`) and this change each scored the same
28-specimen corpus under all ten selectable rubrics. All 28 fixture HEAD SHAs were equal in both
runs. Pipeline check: `4ca642ef` on the committed 22-specimen corpus reproduces all ten committed
fingerprints.

280 specimen/rubric surfaces were compared, and 60 moved: the six new specimens under every rubric,
A1 only. **All 22 existing specimens are identical under all ten rubrics (220 of 220).** The
per-specimen delta is the same under every rubric:

| Specimen | A1 | A1 status | share | Code trust | Overall |
| --- | --- | --- | --- | --- | --- |
| `xunit-assertions`, `xctest-assertions`, `scalatest-assertions`, `kotest-matchers` | 1.2 → 1.8 | critical → warning | 0/1 → 1/1 | 1.2 → 1.8 | 0.6 → 0.9 |
| `nunit-ignored-fixture` | 1.2 → 1.5 | critical → warning | 0/1 → 1/2 | 1.2 → 1.5 | 0.6 → 0.8 |
| `tape-assertions` | 1.2 → 1.8 | critical → warning | 0/1 → 1/1 | 2.0 → 2.3 | 1.0 → 1.2 |

Verdicts are unchanged (`unverified`). Fingerprints before and after are tabled in the
RUBRIC_CHANGELOG entry.

## Golden re-pins

No pinned metric moved: the golden's metric assertions run before its hash assertion and passed.
Each moved pin is recovered by restoring only the previous fingerprint, asserted in the test:
- v17 golden, four fixtures: `preTestFrameworkRecognitionReportSha256`;
- the CLI byte pin;
- F2 reads-disclosure under v17, v22, v23 and v25: `F2_PRE_TEST_FRAMEWORK_PINS`.

Every older recovery chain is unchanged.

## Notes for review

- **Naming narrowed:** see "Naming" above.
- **The lexer is C-family.** Over-blanking only withholds credit. The known under-blanking cases
  can expose quoted text as code: a JS regex literal containing a quote, a Scala 2 symbol literal
  (`'sym`), and a C# interpolated raw string. None was observed.
- **The behaviour change is not monotone.** A documented suite-level skip can now lower a share
  that was positive, for example a JUnit-style `FooTest.kt` under Kotest `@Ignored`.
- **#486 (later):** the raw `should\.` alternative credits ScalaTest's `matchers.should.Matchers`
  import by itself.

## Lesson

Staged as `PENDING_cejel_name_rating_needs_affirmative_evidence_2026-10-14.json`:
- **Affirmative evidence for name-based negatives.** Extending a "counted by file name" rule to a
  new ecosystem asserts a negative for every idiom there that the detector cannot read. Extend it
  only where there is affirmative evidence.
- **Imports name idioms without using them.** An idiom matcher over source text matches the import
  statements that name the idiom. Search with imports blanked, and give each gated idiom a near-miss
  whose only occurrence of the name is its import.
- **Compute the ratio.** A test reading a ratio metric must compute value/max. A 0-of-1 or 1-of-1
  fixture cannot tell the numerator from the share.
