# In-scope native detection-recall experiment — preregistration (2026-08-06)

Status: preregistered before seed-fixture authorship and before any scan

## Question and boundary

This is a new experiment. It does not amend or reinterpret `dual-control-v1`, whose own
research question explicitly asks what the current **Cejel verification stack** catches. That
protocol therefore names Cejel, not agent claim integrity; its risk-enriched false-success
population was a Cejel design error, not a reason to retire or retarget its harness in this pass.

The experiment measures only six native Cejel criterion classes that can produce a finding path
under the existing predicate. No detector, collector, rubric, rubric version, score, or published
leaderboard artifact may change from this commit until the experiment is closed. A detector change
voids this protocol and requires a new preregistration.

`cited` is unchanged: a seed is caught only when a named criterion's
`criterion.findings[].evidence.path` is exactly equal to that seed's named defect-file path.
Positive-evidence paths do not count.

## Criterion-defined classes

The following text is quoted from the native rubric definition, `src/witan/rubric.ts`, at
`de8412a511e6422f6e512e1ccc0d379864bb4cb9`:

| Criterion | Rubric definition (verbatim) | Seeded defect class |
|---|---|---|
| A1 | “Test integrity and regression signal” | A repository has a materially inadequate or non-executable regression-test signal. |
| A2 | “Data-layer isolation and secrets posture” | A repository commits a credential-shaped secret or exposes an ungated tenant/data-layer isolation failure. |
| A3 | “Production readiness” | A deployable service lacks a material production-readiness primitive or release/deployment verification signal. |
| A4 | “Dependency hygiene” | An application dependency set lacks a reproducibility or version-hygiene control. |
| A5 | “Claim-vs-reality reconciliation” | Repository claims and the evidence needed to reconcile them with implementation are materially disconnected. |
| B6 | “Privileged-operation human gating” | A privileged operation can be executed without a documented, fail-closed human gate. |

B2–B4 are excluded because they emit positive-evidence paths only; B1 and B5 emit no path.
The seed authors used the rubric definitions above, not `repo-signals.ts` or any other detector
implementation source. A criterion with no realistic seed is recorded now: **none**. Every listed
criterion has an ordinary repository defect shape that can be seeded without a marker string.

## Cohort size and inference

The evaluation cohort is **N = 60**, ten seeds per criterion. Each class has five calibration
seeds and five held-out seeds, so held-out `n = 30`. For zero catches, the Wilson 95% upper endpoint
is `z² / (n + z²)` with `z = 1.959963984540054`: **11.35%** for held-out `n = 30` and **6.02%** for
the full `n = 60` descriptive cohort. This permits only the bounded statement that, under these
fixed in-scope fixture shapes, held-out detection recall is below 11.35% at 95% confidence if it is
observed to be zero; it does not establish repository-wide recall.

The held-out split is fixed by seed ID in the table below. Calibration outcomes may inform only
harness operation after a separately authorized run; the held-out membership, fixtures, oracle,
and mapping cannot change after this preregistration.

## Frozen seed-to-criterion mapping

Each ID maps to exactly one criterion. Suffixes `01`–`05` are calibration and `06`–`10` are held
out for every criterion. The shape is an authoring brief, not a detector signature.

| IDs | Criterion | Partition | Fixture shape |
|---|---|---|---|
| A1-01…A1-05 | A1 | calibration | Missing concrete tests, all-skipped tests, assertion-free tests, tests disconnected from implementation, or a non-executable test command. |
| A1-06…A1-10 | A1 | held-out | The same five test-integrity families in different ordinary repository layouts and languages. |
| A2-01…A2-05 | A2 | calibration | A committed, non-live credential-shaped assignment in source, configuration, or history; or a tenant data surface without its required isolation policy. |
| A2-06…A2-10 | A2 | held-out | The same secret/isolation families in different ordinary repository layouts and languages. |
| A3-01…A3-05 | A3 | calibration | A deployable service with an absent release workflow, deployment configuration, readiness signal, environment template, or production error boundary. |
| A3-06…A3-10 | A3 | held-out | The same production-readiness families in different ordinary repository layouts and languages. |
| A4-01…A4-05 | A4 | calibration | Application dependencies with an absent lockfile, unconstrained version, stale update automation, or unreproducible manifest relationship. |
| A4-06…A4-10 | A4 | held-out | The same dependency-hygiene families in different ordinary repository layouts and package ecosystems. |
| A5-01…A5-05 | A5 | calibration | A repository claim source and implementation surface without a reconciliatory artifact, with the disconnection expressed through ordinary documentation and code. |
| A5-06…A5-10 | A5 | held-out | The same claim-reality families in different ordinary repository layouts and claim subjects. |
| B6-01…B6-05 | B6 | calibration | An executable privileged database or access-control operation without a documented fail-closed human gate. |
| B6-06…B6-10 | B6 | held-out | The same privileged-operation families in different ordinary repository layouts and gate mechanisms. |

## Positive controls and void rule

Six controls, `PC-A1` through `PC-B6`, are authored beside but outside the 60-seed evaluation
denominator. Each is the direct, ordinary defect shape named by its criterion definition: no real
tests (A1), a non-live committed credential-shaped assignment (A2), a deployable service lacking
release automation (A3), an application manifest without a lockfile (A4), an unreconciled repository
claim (A5), and an ungated privileged operation (B6). Each control names its criterion and exact
defect-file path.

Every control must be `cited` by its named criterion. If any positive control is missed, the run is
an **instrument failure and VOID**: no recall numerator, denominator, rate, interval, or claim may
be published. No control is redesigned after a miss; the fixture-regime question returns to the
operator.

## Isolation, corpus location, and authorship

The unrun seed corpus will live only in the private Alfred harness branch at
`packages/bede/src/in-scope-cejel-recall/fixtures/`. It is outside all 24 published corpus
repositories and does not touch Cejel's leaderboard or its calibration repositories. Fixture
repositories are synthetic isolated workspaces, never checks out of corpus repositories.

The current Codex session authors this test set and is excluded from detector work, fixture changes,
and outcome evaluation until a separately authorized evaluator accepts the frozen corpus. Detector
authors must not read these fixtures while the experiment remains open.

## Publication guards and order

The inherited publication guards refuse claim-bearing output when held-out recall is **zero or
perfect**, when any defect class has **zero catches or no miss**, or when any positive control is
not cited. The later result must also prove this preregistration is a strict ancestor and retain
the unchanged `cited` predicate.

Order is fixed: (1) commit this preregistration; (2) author and commit the private seed corpus;
(3) obtain separate authorization and a different evaluator; (4) run once; (5) commit a result in a
later review. This pass ends after step 2. It runs no scan, no evaluation, and computes no recall.
