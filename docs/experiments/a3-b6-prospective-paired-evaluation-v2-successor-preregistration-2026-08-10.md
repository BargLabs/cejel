# Prospective A3/B6 paired evaluation v2 — successor preregistration (2026-08-10)

Status: **preregistered before any Cejel scan of the prospective target corpus**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Successor basis and authorized change

The sole v1 invocation ended `VOID_CONTROL_FAILURE` before importing, decoding, materializing,
or scanning any target entry. Its three A3 seeded controls were missed, all three A3 repairs
were clean, all three B6 seeded controls were detected, all three B6 repairs were clean, and no
row or instrument errored. The terminal public record is merged at
`4e15a02fdbea59310dddb10f405478fcc2cd0216` with blob
`9cae97bf3c673dea07fa34b239d966a295ce88df` and SHA-256
`ab39811c313d1efc8b603e5b49630dd55299a59328a1f5b64cd907926e6e6413`.

The v1 failure was an instrument-design mismatch: its A3 control paths did not satisfy v20's
already-public bounded path qualification. This successor changes only the three A3 control file
maps to reproduce the independent public v20 regression domains exactly enough to exercise the
frozen detector. It does not change the detector, rubric, corpus, oracle, target IDs, target
paths, predicates, scan boundary, execution order, denominator, reporting rule, or licensed
statement. The B6 controls are unchanged.

This is a new protocol and permits one new run. It is not a repair, retry, continuation, or
reinterpretation of v1. The frozen v1 preregistration, harness, run, and result remain terminal
and unmodified.

## Scope and limitation

The target remains the twelve fixed synthetic seeded/repair pairs merged in private Alfred at
`748cd81959ac10780cc2747116ef8bc3fa9038e5`: six A3 pairs (`PA3-01` through `PA3-06`) and six B6
pairs (`PB6-01` through `PB6-06`). The corpus and detector-independent oracle were frozen before
the v20/v21 detector changes. No Cejel scanner has read or scored any target entry: v1's dynamic
target import was structurally below the failed control gate and evaluation row count was zero.

“Prospective” and “scan-unseen” describe that ordering only. The corpus is synthetic,
single-author/home-field, construction-bound, and not naturally sampled. This experiment does
not estimate defect prevalence, ecosystem recall, repository precision, release performance,
leaderboard performance, or customer performance. It does not revise historical dual-control
`0 / 16`, v3 native in-scope recall, or the decision-contract held-out result.

## Question and fixed unit

For each target pair, does explicit v21 emit the pair-specific exact-summary, exact-path finding
on the seeded repository and remain silent for that same summary/path on the paired repair?

The pair is the primary unit. Complete descriptive counts are paired successes `p/12`, seeded
detections `k/12`, and repair flags `f/12`, plus the same counts for A3 and B6 separately over six
pairs each. These are censuses of the fixed corpus, not population estimates.

## Immutable bindings

Every binding must be authenticated before the first control source is materialized:

| Artifact | Frozen binding |
|---|---|
| Cejel detector merge | `ef392882f8b70646800b7fb6d92c454ec2230f07` |
| Cejel detector Git tree | `1b031ecfe2f3563f5e57f79770e46ec10d482169` |
| Package version in detector tree | `0.4.0` — source-tree version only; v21 did not ship in tag `v0.4.0` |
| Explicit rubric | `witan-rubric-v21-prospective-2026-08-10` |
| Public default | remains `witan-rubric-v17-2026-07-24` |
| Detector source path / blob | `src/witan/repo-signals.ts` / `b60d5f8452efa9a7e72eab475a9615b4b7276b1d` |
| Rubric-version path / blob | `src/witan/rubric-version.ts` / `efcc18b84f3ca0d559fe597ff65247a07e1dd404` |
| Scoring path / blob | `src/witan/scoring.ts` / `eec23e5d2bcdde962e0795894faa846022ac6b50` |
| A3 public regression path / blob | `src/witan/__tests__/a3-explicit-gaps-v20.test.ts` / `c1fdb1d9606f12be156907f0e63b6fcbdcd2daea` |
| B6 public regression path / blob | `src/witan/__tests__/b6-executed-escalation-v21.test.ts` / `fcc3b244e1afc2be9ad22c12713572ce0155c741` |
| Scan boundary | `scoreRepoWithPublicCejel`, explicit v21, no ingest, auto-discovered ingest disabled |
| Fixed `generatedAt` | `2026-08-10T00:00:00.000Z` |
| Alfred corpus merge | `748cd81959ac10780cc2747116ef8bc3fa9038e5` |
| Corpus path | `packages/bede/src/a3-b6-prospective-corpus-v1/corpus.ts` |
| Corpus blob / SHA-256 | `9ee5474b953a4d6409e5e2da76a5ebe8218596c0` / `c7b295b3517d23700303f31dda61cd071b98c460dedcff5d7ebb73d1bc463dc2` |
| Oracle path | `packages/bede/src/a3-b6-prospective-corpus-v1/oracle.ts` |
| Oracle blob / SHA-256 | `81f08c6fb6ded8e2b6b0f31b461f0d311d84129e` / `b5fed4e69c4b0ae4f8a415e92dd2a2a029e6032c93bb2d0a2e89089356ad684e` |
| v1 pushed harness | `BargLabs/alfred@2872dfe11eb35101a8305cbd623a90cf21a67fd5` |
| v1 private result | `BargLabs/alfred@50d29383054a554cc1cc80378816deab2389ed6d` |
| v1 private merge | `BargLabs/alfred@0d8414f037418119ba843750e56b3f7d4914ff24` |
| v1 public closeout | `BargLabs/cejel@4e15a02fdbea59310dddb10f405478fcc2cd0216` |

Any mismatch in a commit, tree, blob, content hash, path, version, rubric, clock, boundary, count,
ID, criterion, defect file, partition, source kind, oracle, or v1 terminal binding is a pre-run
protocol failure. Any detector, corpus, oracle, target-predicate, or reporting change voids this
protocol.

## Corrected paired-control gate

The six control pairs remain outside every target count. Their exact file maps are frozen in the
pushed v2 harness. The A3 pairs must use these already-public v20 regression shapes:

1. `CTRL-A3-MANIFEST`, defect path `package.json`: a private package starts
   `node src/main.js`, includes a test script, and declares neither `build` nor `typecheck`; its
   only changed file is `package.json`, where the repair adds `build: tsc --noEmit`. Both variants
   contain the same `src/main.js` direct Node HTTP server.
2. `CTRL-A3-HTTP`, defect path `src/main.js`: a private package starts `node src/main.js` and has
   `typecheck: tsc --noEmit`; its direct Node HTTP callback reads `request.method` but declares no
   health/readiness path. The repair changes only `src/main.js` by adding an exact `/ready`
   branch.
3. `CTRL-A3-CONTAINER`, defect path `deploy/Dockerfile`: a private package starts
   `node src/service.js` and declares a build script; the runtime Dockerfile ends in
   `CMD ["node", "src/service.js"]` with no active `HEALTHCHECK`. The repair changes only the
   Dockerfile by adding an active `HEALTHCHECK` before the same command.

The B6 controls retain their v1 file maps and exact defect paths:

1. `CTRL-B6-ROLE` uses `database/operator_roles.sql` with an administrative role-membership
   grant; its repair narrows the statement to ordinary object privileges.
2. `CTRL-B6-SUPERUSER` uses `src/operator.ts` with a direct driver literal executing
   `ALTER USER ... SUPERUSER`; its repair changes the literal to `NOSUPERUSER`.
3. `CTRL-B6-SCHEMA` uses `migrations/permissions.sql` with
   `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA`; its repair narrows the grant to a named object
   and privilege.

For every control, the seeded oracle must be false, repair oracle true, and the defect path the
only changed file. All six seeded controls must satisfy the exact target-summary/path predicate,
all six repairs must be clean for that predicate, and no row may error. Otherwise the sole run is
`VOID_CONTROL_FAILURE`; the harness must not import, decode, materialize, or scan the target and
may publish only control outcomes and instrument diagnostics. No control may be redesigned,
replaced, or rerun under this protocol.

## Harness, ancestry, and execution order

The fixed order is:

1. merge this successor preregistration in Cejel;
2. create a fresh Alfred v2 harness from `origin/main` containing v1 private merge
   `0d8414f037418119ba843750e56b3f7d4914ff24`;
3. bind the merged successor commit and exact document blob, all immutable detector/corpus/oracle
   objects above, and the terminal v1 objects;
4. implement only the corrected controls and harness mechanics, testing them only with separately
   authored synthetic self-tests that do not import, decode, materialize, or scan a target case;
5. commit and push the harness;
6. authenticate local `HEAD`, its Alfred remote-tracking ref, and independent `git ls-remote` as
   the same harness commit;
7. build and re-authenticate the exact frozen Cejel detector tree;
8. invoke the harness exactly once: twelve control rows first, followed only after the complete
   gate passes by all 24 target rows; and
9. commit and push raw JSON and human-readable Markdown separately after the harness commit.

Within Alfred, corpus merge `748cd81959ac10780cc2747116ef8bc3fa9038e5`, v1 private merge
`0d8414f037418119ba843750e56b3f7d4914ff24`, and the pushed v2 harness must be strict ancestors of
the v2 result commit. The eventual private-result merge must preserve those relations. Cejel
commits and blobs are cross-repository immutable content bindings, not Alfred ancestors.

There is exactly one v2 harness invocation and no per-row retry. After the first control row
begins, neither harness nor fixture may be repaired and v2 may not be rerun. A failure before any
control or target byte is materialized or scanned leaves run count zero and authorizes no scan
until another preregistration permits recovery.

Each executed row is materialized into a new temporary Git repository from only its frozen file
map, with fixed author, committer, timestamp, and branch metadata. Paths must be relative,
non-empty, contain no `..` segment, and remain within the temporary directory. Fixture hooks,
package managers, scripts, tests, builds, imports, binaries, notebooks, and generated programs
are never executed. Temporary and private absolute paths must not appear in public output.

## Frozen target predicate

The only target summaries are unchanged from v1:

- A3 manifest: `A deployable service package manifest declares neither a build nor a typecheck
  script.`
- A3 HTTP: `A production HTTP entrypoint handles requests directly but declares no health or
  readiness route.`
- A3 container: `A runtime Dockerfile declares no active HEALTHCHECK instruction.`
- B6 SQL/driver: `An authored SQL artifact contains, or a direct database-driver call executes,
  an administrative role grant, SUPERUSER escalation, or schema-wide table privilege grant with
  no documented human gate.`

A seeded row is `detected` only when its construction oracle is false and the named criterion
emits the pair-specific exact summary with `evidence.path` exactly equal to the frozen defect
file. Otherwise it is `missed` unless an error occurs. A repair is `clean` only when its oracle
is true and that exact summary/path match is absent; otherwise it is `flagged`. Findings from
another criterion, different summaries, different paths, basename/substring matches, positive
evidence, and unrelated historical findings do not count. The raw result retains all
named-criterion summaries and evidence paths before applying the predicate.

## Frozen reporting and publication rule

If all controls pass and all 24 target rows complete with valid oracles and no errors, the state
is `CLAIM_BEARING`. The result publishes all case-level categorical outcomes, followed by A3,
B6, and combined paired successes, seeded detections, and repair flags. Any complete outcome,
including zero or perfect counts, is reportable because this is a descriptive census of the
entire fixed corpus, not population inference. No confidence interval, pass/fail label,
qualitative grade, recall/precision estimate, or generalized performance wording is allowed.

The only licensed statement is:

> On twelve fixed synthetic seeded/repair pairs authored and merged before the prospective
> detector changes, Cejel source commit `ef39288` using explicit v21 emitted the pair-specific
> prospective exact-path finding in `k` of 12 seeded repositories and in `f` of 12 paired
> repairs; `p` of 12 pairs combined seeded detection with a clean repair. A3 contributed
> `pA3/6` paired successes and B6 contributed `pB6/6`. This construction-bound result is a
> descriptive census of these fixtures, not an estimate of real-world recall or precision; v21
> remains unreleased and the public default remains v17.

If any target row or oracle errors or evaluation is incomplete, the state is
`NONCLAIM_EVALUATION_ERROR`; completed rows remain preserved but no aggregate or licensed
statement is emitted and no retry is authorized.

Raw fixture sources and complete scan evidence remain in private Alfred. The user has authorized
public disclosure of Alfred-derived scores and hashes. After review and private merge, Cejel may
publish an additive redacted result containing bindings, run integrity, case IDs, categorical
outcomes, fixed-corpus counts, an authorized licensed statement, and artifact hashes. It must
exclude fixture source, private absolute paths, credentials, and unrelated Alfred material.

No outcome may change a release, public default, rubric selection, score, certificate,
leaderboard, historical result, or customer-facing population claim.
