# A2 HMAC digest compare by keyed computation — 2026-10-14

**CONSTRAINTS-VERSION: 2026-08-01.5**

This is a recognition fix under every selectable rubric. It ships the way #430 did: no identifier
bump, and weights and thresholds unchanged. Fingerprints and goldens are re-pinned, and each delta
is recorded in `leaderboard/RUBRIC_CHANGELOG.md`. The release that carries it runs a preregistered
public before-and-after, and the operator runs the private labelled-case check before that release.
This change runs neither.

## The cost #430 left

#430 (0.6.4) removed `digest` from `INSECURE_SECRET_COMPARE_LINE_PATTERN`, because a bare digest
name is no evidence of a secret. CHANGELOG 0.6.4 states what that cost: "an HMAC result held in a
variable named only `digest` is no longer flagged." Whether a value is secret is decided by what
produced it, so this change decides it from the computation, not the name.

## The change

`findInsecureSecretCompareLine` keeps the #430 line pattern exactly as it was. Beside it, for a
`.ts`/`.tsx`/`.js`/`.jsx`, `.py`, `.go` or `.rb` file, `findKeyedHmacDigestCompareLine` reports the
first comparison where:
- the left-hand identifier contains `digest` and is not a property (`row.digest` is not it);
- the operator is `===` / `!==` in JS and TS, or `==` / `!=` in Python, Go and Ruby, which have no
  `===`;
- the right-hand operand is not a quote, `undefined`, `null`, `None` or `nil`, and is not
  numeric-shaped (the existing `NUMERIC_SHAPED_OPERAND_PATTERN`);
- the identifier was bound earlier in the same file.

An identifier is **bound** when its assignment:
- produces a digest from a keyed HMAC computation directly; or
- reads one earlier direct HMAC binding: an HMAC object's digest method, or a value already
  produced. That is one hop. A binding reached through one hop seeds no further hop.

Assignments are found on masked code (`maskCommentsAndStrings`). The assigned expression runs to a
`;`, `,` or unmatched closing bracket at depth 0, or to a line break at depth 0 that no `.` chain
continues, capped at 512 characters. It is searched with strings kept, so `subtle.sign('HMAC', …)`
still reads its quoted algorithm. A match counts only where it starts in live code. The file reports
the earlier of the two rules' lines.

`maskCommentsAndStrings` gains one optional argument, `hashComments`, for Python and Ruby. With it,
`#` opens the line comment, `//` and `/*` are not comments, and `'''` strings run to the next
`'''`. Every existing caller passes nothing and lexes exactly as before.

### The computations, each from the runtime's own documentation

Web fetch was permitted for three pages and denied for two. The Go and Ruby APIs were read from
their public source on GitHub at the default branch on 2026-10-14.

| Runtime | Direct digest | HMAC object, then digest | Source |
| --- | --- | --- | --- |
| Node | `createHmac(algorithm, key[, options])` … `.digest(` in one expression | `createHmac(…)` (optionally `.update(…)`), then `<obj>.digest(` | <https://nodejs.org/api/crypto.html>, loaded: `crypto.createHmac(algorithm, key[, options])`, and the page's example `createHmac('sha256', secret).update('I love cupcakes').digest('hex')` |
| Web Crypto | `crypto.subtle.sign('HMAC' \| { name: 'HMAC' }, key, data)` | n/a: `sign` returns the value | <https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign>, loaded: "To use HMAC, pass the string `HMAC` or an object of the form `{ name: "HMAC" }`"; returns "A Promise that fulfills with an ArrayBuffer containing the signature" |
| Python | `hmac.new(…).digest()` / `.hexdigest()`; `hmac.digest(key, msg, digest)` | `hmac.new(…)`, then `<obj>.digest(` / `.hexdigest(` | <https://docs.python.org/3/library/hmac.html>, loaded: `hmac.new(key, msg=None, digestmod)`, `hmac.digest(key, msg, digest)` ("Return digest of msg for given secret key"), `HMAC.digest()`, `HMAC.hexdigest()` |
| Go | `hmac.New(…).Sum(` | `mac := hmac.New(h, key)`, then `mac.Sum(` | <https://pkg.go.dev/crypto/hmac>; not loaded. Read from `src/crypto/hmac/hmac.go` in golang/go: `func New(h func() hash.Hash, key []byte) hash.Hash`, and the package example `mac := hmac.New(sha256.New, key)`, `mac.Write(message)`, `expectedMAC := mac.Sum(nil)` |
| Ruby | `OpenSSL::HMAC.digest` / `.hexdigest` / `.base64digest(digest, key, data)` | `OpenSSL::HMAC.new(key, digest)`, then `<obj>.digest` / `.hexdigest` / `.base64digest` (parentheses optional) | <https://docs.ruby-lang.org/en/master/OpenSSL/HMAC.html>; not loaded. Read from ruby/openssl `lib/openssl/hmac.rb` (`HMAC.digest(digest, key, data)`, `HMAC.hexdigest`, `HMAC.base64digest`) and `ext/openssl/ossl_hmac.c` (`HMAC.new(key, digest)`, instance `digest`, `hexdigest`) |

**Ruby's `OpenSSL::HMAC#==` is constant-time.** `lib/openssl/hmac.rb` defines it as "Securely
compare with another HMAC instance in constant time" (`OpenSSL.fixed_length_secure_compare`). So an
`OpenSSL::HMAC.new` instance is never itself bound. Only a digest string read from it is, and
`String#==` is not constant-time.

**Keyed versus plain.** Every computation above names HMAC, and each API takes the key. The plain
analogues are `createHash`, `hashlib.sha256`, `sha256.Sum256` and `Digest::SHA256`. They produce a
digest, but none matches the keyed pattern, so none binds.

## Red first

`src/witan/__tests__/hmac-digest-compare.test.ts`, final file, run against the unfixed scanner
(`457c9292`'s `repo-signals.ts`): **38 tests, 19 failed, 19 passed.**
- **Failed:** every positive. That is Node direct, a multi-line chain and an intermediate object;
  Web Crypto `'HMAC'` and `{ name: 'HMAC' }`; Python direct, intermediate object and one-shot
  `hmac.digest`; Go; Ruby direct and instance; and the Node fixture under all ten rubrics.
- **Passed:** every negative, and the shadowing pin (its production warning comes from the
  unchanged #430 line pattern).

The first red run (committed as `ece0c1d2`) had 36 tests: 19 failed, 17 passed. Every later test
edit or addition is a negative or a pin, and each is reported below.

After the fix: 38 of 38. The #430 regression file, `ava-and-public-digest.test.ts`, is unchanged
and passes 34 of 34.

## Guard deletions

Each guard was deleted alone from the fixed source, the new suite run, and the source restored
(`git checkout`). The goal named guards 1 and 2.

| # | Guard deleted | Red | Named test(s) |
| --- | --- | --- | --- |
| 1 | **identifier binding**: any `digest` compare in a file that contains a keyed HMAC computation | 3 | `an HMAC computed into mac beside an unrelated contentDigest === etag`, `an HMAC computed into digest beside an unrelated fileDigest === etag`, `the bound is one intermediate: a second hop is not followed` |
| 2 | **keyed versus plain hash**: any digest-producing expression binds | 4 | `Node createHash`, `Python hashlib`, `Ruby Digest` plain-hash controls; `the bound is one intermediate` (its middle value `h.digest()` becomes direct) |
| 3 | comment and string masking (raw text for both views) | 7 | Node `//`, block-comment, string and template-literal comparisons; `the HMAC computation only inside a comment or a string does not bind`; Python `#` / `'''`; Ruby `#` |
| 4 | hash-comment mode for Python and Ruby | 2 | the Python and Ruby comment near-misses |
| 5 | `'''` string handling | 1 | the Python `'''` near-miss, after the fixture fix below |
| 6 | a match inside the assigned expression must start in code | 1 | `the HMAC computation only inside a comment or a string does not bind` (the quoted computation assigned to `digest`) |
| 7 | one hop only (one-hop bindings seed further hops) | 1 | `the bound is one intermediate: a second hop is not followed` |
| 8 | property exclusion on the compared identifier | 1 | `a property of the same name is not the bound variable` |
| 9 | an `OpenSSL::HMAC` instance is never bound | 1 | `a Ruby OpenSSL::HMAC instance compared with == is not flagged`, after the fixture fix below |
| 10a | presence-literal operand rejection | 1 | `presence and numeric checks on a bound digest are not flagged` |
| 10b | numeric-shaped operand rejection | 1 | the same test (its last clause, `digest === sig.length`) |
| 11 | the comparison must follow the binding assignment | 1 | `a comparison before the binding assignment is not flagged` (added for this guard) |

**Go's plain-hash control turns red under no deletion.** `sha256.Sum256(` never matches Go's
`.Sum(` digest shape, so that control is held by the shape, not by the keyed check.

**Three fixtures first failed to reach their guard.** This is #479's and #487's lesson again: a
guard-deletion fixture must reach the guard.
- **Guard 5:** the Python docstring near-miss passed with `'''` handling deleted. It preceded the
  assignment, so the ordering check hid it, and quote toggling masked it anyway. It now follows
  the assignment and holds one embedded quote (`'''Don't write: …'''`).
- **Guard 9:** the Ruby instance near-miss passed with the guard deleted. It held no
  digest-producing call, so the file-level gate returned before binding ran. It now reads
  `other.hexdigest`.
- **Guard 11:** had no test, so one was added.

## A considered restriction, not shipped

A2 reports only the first file with a match, and a test-path match reports at `info`. That raised
a question: could a new match in a test file listed first displace a production warning? I wrote a
production-paths-only restriction and a test for it, then deleted the restriction. The test stayed
green. Every selectable rubric runs this scan over `productionImplFiles` (`useV39Detectors` is set
for the whole v17 closure), so a test file never reaches the rule. The restriction would be dead
code there, so it is not shipped. The test stays as a pin:
`a test-path match does not shadow a production finding in a later file`.

## Behaviour corpus

Two synthetic specimens extend the corpus from 28 to 30:
- `hmac-digest-compare`: the goal's Node fixture;
- `unkeyed-digest-controls`: a plain `createHash` digest compared, and an HMAC computed into `mac`
  beside an unrelated `contentDigest === etag`.

The previous scanner (`457c9292`'s `repo-signals.ts`) and this change each scored the same
30-specimen corpus under all ten selectable rubrics. All 30 fixture HEAD SHAs were equal in both
runs. Pipeline check: `457c9292` on the committed 28-specimen corpus reproduces all ten committed
fingerprints.

300 specimen/rubric surfaces were compared, and 10 moved: `hmac-digest-compare` under every rubric,
A2 only. **The other 29 specimens are identical under all ten rubrics (290 of 290).** That includes
every existing specimen (280 of 280) and `unkeyed-digest-controls`. The delta is the same under
every rubric:

| Specimen | A2 | A2 status | Findings | `crypto_comparison_hygiene` | Code trust | Overall |
| --- | --- | --- | --- | --- | --- | --- |
| `hmac-digest-compare` | not applicable → 2.3 | not applicable → warning | none → 1 warning | absent → 0 | 1.3 → 1.6 | 0.9 → 1.1 |

The verdict is unchanged. **The added warning raises the composite scores.** A2 was not applicable
on this specimen and is now scored, so 2.3 enters the code-trust mean. That is existing scoring
behaviour, and the RUBRIC_CHANGELOG entry discloses it.

The measurement after the fix used `repo-signals.ts` as committed in `74a03483`, and that file is
unchanged since. Later commits touched test files and records only. The restriction above was
added and deleted with no net change.

## Golden re-pins

No pinned metric moved: the golden's metric assertions run before its hash assertion and passed.
Each moved pin is recovered by restoring only the previous fingerprint, asserted in the test:
- v17 golden, four fixtures: `preHmacDigestCompareReportSha256`;
- the CLI byte pin;
- F2 reads-disclosure under v17, v22, v23 and v25: `F2_PRE_HMAC_DIGEST_PINS`.

Every older recovery chain is unchanged.

## Verification

On the final tree (`339d8515`, with the temporary measurement harness deleted):
- `pnpm typecheck` is clean and `pnpm build` succeeds.
- Full `pnpm test`, CI's own test command: 123 files and 2,728 tests passed, 0 failed. That
  includes the offline-boundary guard ("finds no structural offline-boundary violations in scoring
  source"), and was re-run alone, 41 of 41.

Before the re-pins, the moved pins failed exactly as expected:
- the changelog citation check;
- the 4 v17 golden hashes;
- the CLI byte pin;
- the 4 F2 hashes.

**Not run here:** the preregistered public before-and-after, and the operator's private
labelled-case check. Both belong to the release that carries this change.

## Notes for review

- **Bindings ignore scope.** A same-named parameter in another function, after a keyed-HMAC
  assignment in the same file, is read as the bound value. The goal scopes binding to the file. The
  ordering check (comparison after assignment) is the only positional limit.
- **One hop is literal.** `const raw = h.digest(); const digest = raw.toString('hex')` binds `raw`
  but not `digest`. A method chain on an HMAC object, such as `h.update(b).digest()` assigned from
  a separate `h`, is not an object digest call either. Both are misses, not false findings.
- **Aliased imports are not read.** `from hmac import new`, `import hmac as h` and a renamed
  `createHmac` miss.
- **The Web Crypto algorithm must be a literal** at the call. A `sign(algorithm, …)` with a variable
  algorithm misses.
- **The lexer is C-family plus `#` mode.** The known under-blanking cases from
  `test-framework-recognition-2026-10-14.md` apply, along with Ruby `=begin`/`=end` blocks and
  `%q{}` literals. Over-blanking only causes misses.
