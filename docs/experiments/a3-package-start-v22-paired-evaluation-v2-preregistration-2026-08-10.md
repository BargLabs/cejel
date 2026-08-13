# A3 package-start prospective paired evaluation v2 — preregistration (2026-08-10)

Status: **preregistered before any Cejel scan of the frozen v2 corpus**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Prior evidence and bounded purpose

The completed A3/B6 v1 run stopped at its paired-control gate. All three B6 controls passed, but
all three A3 controls missed because their paths fell outside the deliberately bounded v20
entrypoint rules. The target corpus was never imported, decoded, materialized, or scanned. That
terminal refusal is preserved and is not reinterpreted here.

The later native in-scope recall record found that A3 still missed two direct Node HTTP services
whose root package `start` scripts named non-conventional entrypoint files. Cejel PR #150 then
added explicit-only prospective v22. It inherits v21 and adds one closure: follow a simple root
`node <path>` or `tsx <path>` start command to a tracked authored JavaScript or TypeScript file,
then apply the existing bounded direct-HTTP/readiness predicate to that exact file. Wrapper
commands, missing targets, test-only targets, delegated handlers, and unanchored repository-wide
file search remain outside the rule. Public default v17 and explicit v21 behavior remain
unchanged.

Before that detector was implemented, Alfred PR #876 merged six new synthetic A3 seeded/repair
pairs plus a detector-independent construction oracle. No Cejel version or rubric has scanned a
seeded or repaired repository from that corpus. The corpus is synthetic, single-author/home-field,
and construction-bound. “Prospective” means only that it was frozen before implementation and
remained scan-unseen until this final preregistered run; it does not mean blinded or naturally
sampled.

This experiment asks whether the narrow implementation behaves as designed on that fixed corpus.
It does not estimate prevalence, ecosystem recall, repository precision, customer performance,
or the effect of v22 on unrelated A3 constructions. It does not revise historical dual-control,
v1, v3 native in-scope recall, decision-contract, score, certificate, or leaderboard records.

## Question and unit

For each of the six frozen pairs:

1. does explicit v22 emit the exact A3 direct-HTTP readiness finding on the seeded repository,
   with evidence anchored to that pair's frozen defect file; and
2. is that exact finding absent from the paired repair?

The pair is the primary unit. The descriptive records are paired successes `p/6`, seeded
detections `k/6`, and repair flags `f/6`. These are complete counts over this fixed construction
corpus, not estimates of a larger population.

## Immutable bindings

Every binding must be authenticated before the first control source is materialized:

| Artifact | Frozen binding |
|---|---|
| Cejel detector merge | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` |
| Cejel detector Git tree | `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Cejel package version at that tree | `0.4.0` — source-tree version only; v22 did not ship in tag `v0.4.0` |
| Explicit rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Public default | remains `witan-rubric-v17-2026-07-24` |
| Detector source blob | `src/witan/repo-signals.ts` / `c55e9c8a82e2398672486183fd436f3ef82c64c8` |
| Rubric-version blob | `src/witan/rubric-version.ts` / `65a734bb71ef18b14d63ce57e71488e476f7c337` |
| Scoring blob | `src/witan/scoring.ts` / `d61dc75ccdf84c13129f642353e03cf996e0bdb9` |
| v22 regression-control blob | `src/witan/__tests__/a3-package-start-v22.test.ts` / `648d4a348c88334c477b50efc712d84839ccf31a` |
| Scan boundary | `scoreRepoWithPublicCejel`, explicit v22, no ingest, auto-discovered ingest disabled |
| Fixed `generatedAt` | `2026-08-10T00:00:00.000Z` |
| Alfred corpus merge | `f1b02fbdbc253fcbfeed590c1e3318bdade600d0` |
| Private corpus blob / SHA-256 | `71f4e0d4995995d04eb1945893616e12643fe656` / `ef3bd665099a0a684e96ec4136d881c3dfbcb825e3d7445c007b52f9a1f9fa9e` |
| Private oracle blob / SHA-256 | `99f3c1147569b3ffcae11e7c76f9cd5bbc6ad2e7` / `c6f9cddc82775540b285bf0b4cdd98431d1998e85268da01d665d3a31825af2c` |
| Frozen pair count | six seeded/repair pairs, twelve evaluation rows |

The private Alfred paths and target identifiers are intentionally omitted from this public
document. The pushed private harness must bind their exact paths, identifiers, file maps,
criterion, expected summary, and defect files and must authenticate the public blob/hash bindings
above before access.

Any commit, tree, blob, content hash, version, rubric, path, clock, scan-boundary, count,
identifier, criterion, defect-file, source-kind, or oracle mismatch is a pre-run protocol failure.
Executing another Cejel tree or changing any source, pair, oracle, predicate, or binding voids the
experiment.

## Harness and ancestry order

The order is fixed:

1. merge this preregistration in Cejel;
2. create a fresh Alfred harness from a commit containing corpus merge
   `f1b02fbdbc253fcbfeed590c1e3318bdade600d0`;
3. bind the merged Cejel preregistration commit and exact document blob in the harness;
4. implement the six out-of-denominator paired controls below and test only harness mechanics
   with separately authored synthetic self-tests that do not import, decode, materialize, or scan
   the target corpus;
5. commit and push the harness;
6. authenticate local `HEAD`, its Alfred remote-tracking ref, and independent `git ls-remote` as
   the same harness commit;
7. build the exact frozen Cejel detector tree and re-authenticate every binding;
8. invoke the harness exactly once: twelve control rows first, followed only after their gate
   passes by all twelve target seeded/repair rows; and
9. commit and push raw JSON and human-readable Markdown separately after the harness commit.

Git ancestry does not cross repositories. The merged Cejel preregistration commit and document
blob are immutable cross-repository content bindings in Alfred. Within Alfred, the corpus merge
and pushed harness commit must both be strict ancestors of the result commit. The eventual Alfred
result merge must preserve those ancestry relations; timestamps or embedded SHAs alone are not
ancestry evidence.

The harness may authenticate bindings, create fixed controls, dynamically import the target only
after the control gate passes, run the construction oracle, materialize repositories, invoke the
frozen scanner, apply the frozen predicates, and render evidence. It may not contain a second
detector, case-specific exception, marker-string outcome path, transformed fixture, or alternate
finding source.

## Materialization and execution

Each row is materialized into its own new temporary directory from only that row's file map.
Paths must be relative, non-empty, contain no `..` segment, and remain inside the temporary
directory. The materializer creates a local Git repository containing exactly those files and one
commit with fixed author, committer, and timestamp values recorded in the private raw result.

Fixture hooks, package managers, scripts, tests, builds, imports, binaries, notebooks, and
generated programs are never executed. The corpus construction oracle operates only on authored
file maps. Private absolute paths must not appear in public rendering.

Cejel is built from the frozen detector tree before the run. Every materialized repository is
scored offline through `scoreRepoWithPublicCejel` with explicit rubric
`witan-rubric-v22-prospective-2026-08-10`, the fixed clock above, no ingest, and auto-discovered
ingest disabled.

There is exactly one harness invocation and no per-row retry. An exception, materialization
failure, schema failure, binding failure, missing report, or incomplete row is preserved. After
the first control row begins, neither harness nor fixture may be repaired and the experiment may
not be rerun. A pre-control failure before any control or target byte is materialized or scanned
may stop with run count zero, but authorizes no scan until a successor preregistration permits it.

## Exact predicate

The only target is criterion `A3`, metric `http_health_signal_present`, summary:

> A production HTTP entrypoint handles requests directly but declares no health or readiness
> route.

A seeded row is `detected` only when its construction oracle reports the seeded property absent
and A3 emits that exact summary with `evidence.path` exactly equal to the frozen defect file.
Anything else, including a basename or substring match, is a miss.

A repair is `clean` only when its oracle reports the repair property present and A3 emits no
finding combining that exact summary with the exact frozen defect path. Such a finding makes the
repair `flagged`. Unrelated inherited findings are preserved privately but do not become v22
repair flags. A pair is `paired_success` only when its seed is detected and its repair is clean.

The private raw result preserves each executed row's named-criterion finding summaries and
evidence paths before applying these predicates.

## Paired instrument-control gate

The pushed harness freezes six synthetic control pairs outside the evaluation denominator. Each
uses a simple root `node` or `tsx` start command to a tracked authored JS/TS direct HTTP
entrypoint. The six controls must exercise distinct accepted spellings or bounded arrangements,
including JavaScript and TypeScript, a leading `./`, supported module extensions, a root-level
target, a nested target, and coexistence with an unrelated conventional server filename. Every
repair changes only its anchored entrypoint to add a health/readiness route.

The controls must be derived only from the already-public v22 regression domain, must not copy or
import a target case, and are outside every evaluation count. Their exact maps, commands, paths,
expected summary, and oracles are frozen in the pushed harness.

All six seeds must be detected, all six repairs clean, all twelve control oracle states exact, and
no control may error. Any failure makes the run `VOID_CONTROL_FAILURE`. In that state the harness
must not import, decode, materialize, or scan the target corpus and may publish only control
aggregates and instrument diagnostics. No control may be redesigned, replaced, or rerun.

## Frozen reporting rule

If all controls pass and all twelve evaluation rows complete with valid oracles and no errors,
the run is `CLAIM_BEARING`. It reports privately, before aggregates, every row outcome, then
reports paired successes `p/6`, seeded detections `k/6`, and repair flags `f/6`.

The licensed public statement for any complete outcome is:

> On six fixed synthetic A3 package-start seeded/repair pairs authored and merged before the v22
> detector, Cejel source commit `8a289ea` using explicit v22 emitted the exact-path readiness
> finding in `k` of six seeded repositories and in `f` of six paired repairs; `p` of six pairs
> combined seeded detection with a clean repair. This construction-bound census does not estimate
> real-world recall or precision. Public default v17 is unchanged.

Zero and perfect counts are reportable because the denominator is the complete fixed corpus, not
a sample used for population inference. They receive no confidence interval or generalized
recall/precision wording.

If any evaluation row or oracle errors or the run is incomplete, the state is
`NONCLAIM_EVALUATION_ERROR`; completed row outcomes remain preserved privately, but no aggregate,
licensed statement, or retry is authorized.

## Precommitted engineering and release gate

After a complete run, the exact frozen detector tree must again pass `pnpm build`, the full test
suite, the offline-boundary guard, and publish/installability validation. Existing tests must
continue to prove that public default v17 is unchanged and that the new package-start shape does
not appear under explicit v21.

The narrow A3 engineering closure is **GREEN** only when all of these hold:

- the run is `CLAIM_BEARING`;
- controls are 6/6 paired successes;
- evaluation is `p = 6`, `k = 6`, and `f = 0`;
- there are no oracle, materialization, binding, detector, or instrument errors; and
- the post-run validation matrix is fully green.

Any other state is **NO-GO** for treating this package-start gap as closed and requires stopping,
preserving the result, and deciding from a successor protocol whether another bounded repair is
worthwhile.

GREEN licenses only the bounded public statement above and a recommendation that engineering
attention return to the higher-value dual-control problem. It makes explicit v22 technically
eligible for a separately approved future release. It does not automatically publish a package,
promote v22 to the public default, change a rubric selection, rescore a leaderboard, or establish
population recall/precision. Those remain separate user decisions; default promotion would
benefit from independent or naturally sourced evidence beyond this home-field corpus.

## Publication boundary

Raw fixture sources, target identifiers, private paths, per-case outcomes, and complete raw scan
evidence remain in private Alfred. The user has authorized public disclosure of Alfred-derived
aggregate scores and hashes. After the private result is reviewed and merged, Cejel may publish an
additive redacted result containing immutable public bindings, run integrity, aggregate counts,
the licensed statement, gate disposition, and artifact hashes.

The public result must not contain target identifiers, target paths, per-case outcomes, raw
fixture source, private absolute paths, credentials, or unrelated Alfred material. Neither result
may edit this preregistration, corpus, oracle, detector, tests, historical experiments, release
artifacts, default rubric, or leaderboard.
