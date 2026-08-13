# Prospective A3/B6 paired evaluation v1 — preregistration (2026-08-10)

Status: **preregistered before any Cejel scan of the prospective corpus**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Prior evidence and scope

The private Alfred corpus was merged first, at
`748cd81959ac10780cc2747116ef8bc3fa9038e5`. It contains twelve new synthetic
seeded/repair pairs: six A3 production-readiness gaps (`PA3-01` through `PA3-06`) and six B6
privilege-escalation gaps (`PB6-01` through `PB6-06`). A detector-independent construction
oracle records that every seeded case lacks its declared operational property, every repair has
that property, and the named defect file is the only changed file in each pair.

The corpus was authored and merged before either detector change. Cejel was then developed only
against previously exposed calibration shapes and separately authored synthetic clean controls:

- v20, merged at `43c54f332c315e0a120e217eb1a525c531c36379`, added three narrowly
  worded, exact-path A3 findings; and
- v21, merged at `ef392882f8b70646800b7fb6d92c454ec2230f07`, inherited v20 and
  added one narrowly worded, exact-path B6 finding over bounded administrative-SQL shapes.

No Cejel version or rubric has scanned any seeded or repaired repository from the prospective
corpus. Reading and constructing the source corpus is not blindness: the same organization
authored the corpus, detector, and evaluation. “Prospective” and “unseen” mean only that the
corpus was frozen before detector implementation and remained scan-unseen until this final
preregistered run.

This experiment is synthetic, single-author/home-field, construction-bound, and not naturally
sampled. It does not estimate defect prevalence, ecosystem recall, repository precision, or
customer performance. It does not revise the historical dual-control `0 / 16`, the v3 native
in-scope recall result, or the decision-contract held-out result.

## Question and unit of evaluation

For each of the twelve fixed prospective pairs:

1. does explicit v21 emit the pair-specific prospective finding on the seeded repository, from
   the named criterion and with evidence whose path exactly equals the named defect file; and
2. does the same pair-specific finding remain absent from the paired repair?

The pair is the primary unit. The primary descriptive records are paired successes `p/12`,
seeded detections `k/12`, and repair flags `f/12`. A3 and B6 are also reported separately as
`p/6`, `k/6`, and `f/6`. These are complete counts over this fixed corpus, not estimates of a
larger population.

## Immutable bindings

Every binding must be authenticated before the first control source is materialized:

| Artifact | Frozen binding |
|---|---|
| Cejel detector merge | `ef392882f8b70646800b7fb6d92c454ec2230f07` |
| Cejel detector Git tree | `1b031ecfe2f3563f5e57f79770e46ec10d482169` |
| Cejel package version at that commit | `0.4.0` — source-tree version only; this post-release v21 detector did not ship in tag `v0.4.0` |
| Explicit rubric | `witan-rubric-v21-prospective-2026-08-10` |
| Public default | remains `witan-rubric-v17-2026-07-24` |
| Detector source path / blob | `src/witan/repo-signals.ts` / `b60d5f8452efa9a7e72eab475a9615b4b7276b1d` |
| Rubric-version path / blob | `src/witan/rubric-version.ts` / `efcc18b84f3ca0d559fe597ff65247a07e1dd404` |
| Scoring path / blob | `src/witan/scoring.ts` / `eec23e5d2bcdde962e0795894faa846022ac6b50` |
| A3 regression-control path / blob | `src/witan/__tests__/a3-explicit-gaps-v20.test.ts` / `c1fdb1d9606f12be156907f0e63b6fcbdcd2daea` |
| B6 regression-control path / blob | `src/witan/__tests__/b6-executed-escalation-v21.test.ts` / `fcc3b244e1afc2be9ad22c12713572ce0155c741` |
| Scan boundary | `scoreRepoWithPublicCejel`, explicit v21, no ingest, auto-discovered ingest disabled |
| Fixed `generatedAt` | `2026-08-10T00:00:00.000Z` |
| Alfred corpus merge | `748cd81959ac10780cc2747116ef8bc3fa9038e5` |
| Corpus path | `packages/bede/src/a3-b6-prospective-corpus-v1/corpus.ts` |
| Corpus blob / SHA-256 | `9ee5474b953a4d6409e5e2da76a5ebe8218596c0` / `c7b295b3517d23700303f31dda61cd071b98c460dedcff5d7ebb73d1bc463dc2` |
| Oracle path | `packages/bede/src/a3-b6-prospective-corpus-v1/oracle.ts` |
| Oracle blob / SHA-256 | `81f08c6fb6ded8e2b6b0f31b461f0d311d84129e` / `b5fed4e69c4b0ae4f8a415e92dd2a2a029e6032c93bb2d0a2e89089356ad684e` |

Any commit, tree, blob, content hash, version, rubric, path, clock, scan-boundary, corpus count, ID,
criterion, defect-file, partition, source-kind, or oracle mismatch is a pre-run protocol failure.
Executing another Cejel tree or changing any source, pair, oracle, predicate, or binding voids the
experiment.

## Harness and ancestry order

The order is fixed:

1. merge this preregistration in Cejel;
2. create a fresh Alfred harness from an Alfred commit that contains corpus merge
   `748cd81959ac10780cc2747116ef8bc3fa9038e5`;
3. bind the merged Cejel preregistration commit and exact document blob in the harness;
4. implement the six out-of-denominator paired controls below and test harness mechanics only
   with separately authored synthetic self-tests that do not import, materialize, or scan the
   prospective corpus;
5. commit and push the harness;
6. authenticate local `HEAD`, its Alfred remote-tracking ref, and independent `git ls-remote` as
   the same harness commit;
7. build the exact frozen Cejel detector tree and re-authenticate every binding;
8. invoke the harness exactly once: twelve control rows first, followed only after their gate
   passes by all 24 prospective seeded/repair rows; and
9. commit and push raw JSON and human-readable Markdown separately after the harness commit.

Git ancestry does not cross repository boundaries. The merged Cejel preregistration commit and
its document blob are immutable cross-repository content bindings in Alfred. Within Alfred, the
corpus merge and pushed harness commit must both be strict ancestors of the result commit. The
eventual private-result merge must preserve those ancestry relations; commit timestamps or an
embedded SHA alone are not ancestry evidence.

The harness may authenticate bindings, create its fixed controls, dynamically import the frozen
corpus only after the control gate passes, run the construction oracle, materialize repositories,
invoke the frozen scanner, apply the frozen predicates, and render evidence. It may not contain a
second detector, case-specific exception, marker-string outcome path, transformed fixture, or
alternate finding source.

## Materialization and execution

Each control and evaluation row is materialized into its own new temporary directory from only
that row's file map. Paths must be relative, non-empty, contain no `..` segment, and remain within
the temporary directory. The materializer creates a local Git repository containing exactly
those files and one commit with fixed author, committer, and timestamp values recorded in the raw
result.

Fixture hooks, package managers, scripts, tests, builds, imports, binaries, notebooks, and
generated programs are never executed. The corpus construction oracle operates only on the
authored file maps. Temporary and private absolute paths must not appear in the public rendering.

Cejel is built from the frozen detector tree before the run. Every materialized repository is
scored offline through `scoreRepoWithPublicCejel` with explicit rubric
`witan-rubric-v21-prospective-2026-08-10`, the fixed clock above, no ingest, and auto-discovered
ingest disabled.

There is exactly one harness invocation and no per-row retry. An exception, materialization
failure, schema failure, binding failure, missing report, or incomplete row is preserved. After
the first control row begins, neither harness nor fixture may be repaired and the experiment may
not be rerun. A pre-control failure before any control or corpus byte is materialized or scanned
may stop with run count zero, but authorizes no scan until a new preregistration permits recovery.

## Pair-specific prospective findings

The only target summaries are:

- `A3/package_build_or_typecheck_present`: `A deployable service package manifest declares
  neither a build nor a typecheck script.`
- `A3/http_health_signal_present`: `A production HTTP entrypoint handles requests directly but
  declares no health or readiness route.`
- `A3/container_healthcheck_present`: `A runtime Dockerfile declares no active HEALTHCHECK
  instruction.`
- `B6/sql_privilege_escalation_absent` and `B6/driver_privilege_escalation_absent`: `An authored
  SQL artifact contains, or a direct database-driver call executes, an administrative role grant,
  SUPERUSER escalation, or schema-wide table privilege grant with no documented human gate.`

For each row, the expected target summary is selected only by its frozen criterion and
`oracleKind` mapping above.

A seeded row is `detected` only when:

- its construction oracle reports `seededSatisfied: false`;
- the named criterion emits a finding with the exact pair-specific target summary; and
- that same finding has `evidence.path` exactly equal to the frozen `defectFile`.

A seeded row with no exact match and no error is `missed`. A finding from another criterion, a
different summary, positive evidence, basename match, substring match, or the correct summary at
another path does not count.

A repair is `clean` only when its oracle reports `repairSatisfied: true` and the named criterion
emits no finding that combines the pair-specific target summary with the exact frozen defect
path. Such a match makes the repair `flagged`. Unrelated historical findings are retained in the
raw result but do not become prospective v20/v21 repair flags.

A pair is `paired_success` only when its seeded row is `detected` and its repair is `clean`.

The raw result preserves, for every executed row, the complete named-criterion finding summaries
and evidence paths before applying these predicates.

## Paired instrument-control gate

The harness freezes six synthetic control pairs before it may import the target corpus:

| Control | Family | Required seeded shape | Required repair property |
|---|---|---|---|
| `CTRL-A3-MANIFEST` | A3 manifest | deployable service manifest lacking both `build` and `typecheck` | same manifest gains `build` or `typecheck` |
| `CTRL-A3-HTTP` | A3 HTTP | direct request handler lacking health/readiness route | same handler gains a health/readiness route |
| `CTRL-A3-CONTAINER` | A3 container | runtime Dockerfile lacking active `HEALTHCHECK` | same Dockerfile gains active `HEALTHCHECK` |
| `CTRL-B6-ROLE` | B6 raw SQL | authored SQL administrative role-membership grant | grant removed or narrowed to ordinary object privileges |
| `CTRL-B6-SUPERUSER` | B6 driver | direct driver literal executing `ALTER ROLE ... SUPERUSER` | literal changes to `NOSUPERUSER` |
| `CTRL-B6-SCHEMA` | B6 raw SQL | schema-wide `GRANT ALL PRIVILEGES ON ALL TABLES` | grant narrowed to named objects/privileges |

The complete control file maps, exact defect paths, and expected target-summary mapping are frozen
in the pushed harness. They must be derived from the already exposed v20/v21 regression domains,
must not copy or import a target `PA3-*` or `PB6-*` case, and are outside every evaluation count.

All six seeded controls must be `detected`, all six repairs must be `clean`, all twelve control
oracles must have their expected states, and no control may error. Any failure makes the run
`VOID_CONTROL_FAILURE`. In that state the harness must not import, decode, materialize, or scan
the prospective corpus and may publish only control outcomes and instrument diagnostics. No
control may be redesigned, replaced, or rerun.

## Frozen reporting rule

If all controls pass and all 24 evaluation rows complete with valid oracles and no errors, the
run is `CLAIM_BEARING`. It reports:

- every case-level seeded and repair outcome before aggregates;
- A3 paired successes, seeded detections, and repair flags as `p/6`, `k/6`, and `f/6`;
- B6 paired successes, seeded detections, and repair flags as `p/6`, `k/6`, and `f/6`; and
- combined paired successes, seeded detections, and repair flags as `p/12`, `k/12`, and `f/12`.

The licensed statement, for any complete outcome including zero or perfect fixed-corpus counts,
is:

> On twelve fixed synthetic seeded/repair pairs authored and merged before the prospective
> detector changes, Cejel source commit `ef39288` using explicit v21 emitted the pair-specific
> prospective exact-path finding in `k` of 12 seeded repositories and in `f` of 12 paired
> repairs; `p` of 12 pairs combined seeded detection with a clean repair. A3 contributed
> `pA3/6` paired successes and B6 contributed `pB6/6`. This construction-bound result is a
> descriptive census of these fixtures, not an estimate of real-world recall or precision; v21
> remains unreleased and the public default remains v17.

Zero and perfect counts are reportable here because the denominator is the complete fixed corpus,
not a sample used for population inference. They receive no pass/fail label, qualitative grade,
confidence interval, or generalized recall/precision wording.

If an evaluation row or oracle errors or the run is incomplete, the state is
`NONCLAIM_EVALUATION_ERROR`; completed row outcomes remain preserved, but no aggregate or licensed
statement is emitted and no retry is authorized.

No outcome may change a release, public default, rubric selection, score, certificate,
leaderboard, historical result, or customer-facing population claim.

## Publication boundary

Raw fixture sources and complete raw scan evidence remain in private Alfred. The user has
authorized public disclosure of Alfred-derived scores and hashes. After the private result is
reviewed and merged, Cejel may publish an additive redacted result containing immutable bindings,
run integrity, case IDs, categorical outcomes, fixed-corpus counts, the licensed statement when
authorized, and artifact hashes.

The public result must not contain raw fixture sources, private absolute paths, credentials, or
unrelated Alfred material. Neither result may edit this preregistration, the corpus, oracle,
detector, tests, historical experiments, release artifacts, default rubric, or leaderboard.
