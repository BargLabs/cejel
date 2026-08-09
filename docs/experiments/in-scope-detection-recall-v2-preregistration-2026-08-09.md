# In-scope native detection-recall experiment v2 — successor preregistration (2026-08-09)

Status: **preregistered before fixture materialization, positive-control execution, or any scan**

## Prior protocol disposition

This is a new protocol, not an edit or addendum to
`in-scope-detection-recall-preregistration-2026-08-06.md`.

The v1 protocol was committed at
`6420b98e9a633f134f556cf287f76262cac3f1de` and later merged with two pre-run
addenda at `a54a5c2be3513833259fa4e8700244e1a3873e50`. It required that no detector,
collector, rubric, rubric version, score, or published leaderboard artifact change before the
experiment closed, and stated that a detector change voided the protocol.

Before any v1 fixture was materialized or scanned, Cejel commit
`ce6af76376264540a4d12494a8ac8d4ab92082ee` changed `src/witan/repo-signals.ts`,
`src/witan/rubric-version.ts`, and `src/witan/scoring.ts` to add prospective v19. Commit
`60e135658271cf92f79135e215c6e903764d0245` then changed the published rubric changelog. An
independent evaluator audited that history on 2026-08-09 and stopped before reading fixture
contents, creating a harness, materializing a fixture, or invoking Cejel.

V1 is therefore **VOID before execution**. Its run count is zero and it has no recall outcome.
The v1 documents remain immutable historical records.

## Successor boundary

V2 asks the same bounded question against the released Cejel v0.4.0 **public-default v17**
scanner: on 30 fixed held-out synthetic repository defects, five for each native path-emitting
criterion A1–A5 and B6, how often does the named criterion cite the exact named defect file?

V2 adopts the already-authored corpus without changing a byte, seed, control, mapping,
partition, criterion, or defect-file designation. The successor exists only to replace v1's
repository-wide moving-main freeze with immutable execution bindings that can be authenticated
at run time.

This experiment does not evaluate prospective v18 or v19, does not promote any rubric, and does
not change a score, detector, collector, leaderboard, release, or public default.

## Immutable execution bindings

The evaluator must authenticate all bindings before materialization:

| Artifact | Frozen binding |
|---|---|
| Cejel release | tag `v0.4.0` |
| Cejel commit | `03ef74bd05274ff079c8dcd09dcdfaa8a6f1e3ff` |
| Cejel Git tree | `a857f0b3df0cd38d69393b7a90383156ae2fdb82` |
| Cejel package version | `0.4.0` |
| Rubric | `witan-rubric-v17-2026-07-24` selected explicitly |
| Scan boundary | `scoreRepoWithPublicCejel` with no ingest and no auto-discovered ingest |
| Fixed `generatedAt` | `2026-08-09T00:00:00.000Z` |
| Private Alfred corpus merge | `d4f6f0dfa0721d2e35b40b14f43f227e5ec79dbc` |
| Corpus path | `packages/bede/src/in-scope-cejel-recall/fixtures/seed-corpus.json` |
| Corpus Git blob | `84e1d7d55d73b0c0895809d40e9946758636c777` |
| Corpus SHA-256 | `331349ecd5be409f0800e396863d3a7869f330b7603baf0e484636733f878220` |

The corpus contains exactly 60 evaluation seeds and six out-of-denominator positive controls.
The 60 are 30 calibration and 30 held-out seeds; each of A1–A5 and B6 has IDs `01`–`05` in
calibration and `06`–`10` held out. Every ID is unique, and each seed's `defectFile` must be an
exact key in its `files` map.

Any binding mismatch is a pre-run protocol failure. Later changes on `main` do not alter this
experiment because the evaluator must execute the exact frozen tree. Executing any other tree,
rubric, scan boundary, corpus blob, or clock voids the run.

## Evaluator and harness ordering

The corpus-authoring and successor-preregistration sessions are excluded from execution and
outcome evaluation. A different evaluator must perform the run.

The order is fixed:

1. merge this successor preregistration;
2. create a deterministic private Alfred harness that embeds this document's **merged commit**
   and every immutable binding above;
3. test the harness only with separately authored synthetic self-tests that do not materialize or
   scan any of the 66 frozen corpus entries;
4. commit and push the harness before the first frozen-corpus materialization;
5. execute one run comprising the six controls followed by all 60 evaluation seeds; and
6. commit the raw result and its human rendering separately after the harness commit.

The successor-preregistration merge commit and harness commit must both be strict ancestors of
the result commit. Commit timestamps are not ancestry evidence.

The harness may not contain a detector, seed-specific exception, marker-string catch path, or
alternate finding source. It may only materialize, invoke the frozen scanner, apply the frozen
predicate, calculate the frozen summaries, and render evidence.

## Deterministic materialization and execution

Each entry is materialized into its own new temporary directory using only the entry's `files`
map. Paths must be relative, must not contain `..`, and may not escape that directory. The
materializer then creates a local Git repository containing exactly those files and one commit
with fixed author, committer, and timestamp values recorded in the raw result. Hooks, repository
scripts, tests, builds, package managers, imports, binaries, notebooks, and generated programs
inside a fixture are never executed.

Cejel is built from the frozen release tree before the run. Every fixture is scored offline
through the sealed public scan boundary with:

- the fixture repository as `repoPath`;
- its seed/control ID as product identity;
- rubric `witan-rubric-v17-2026-07-24` explicitly selected;
- `generatedAt` fixed to `2026-08-09T00:00:00.000Z`;
- no operator ingest; and
- auto-discovered ingest disabled.

The run has no per-row retry. A process exception, materialization failure, schema failure, or
missing report becomes an error row and is preserved. The evaluator may not repair a fixture,
change the harness, or rerun after the first frozen entry begins. A pre-entry failure that occurs
before any corpus byte is materialized or scanned may stop as a pre-run instrument failure, but
it authorizes no scan until a new preregistration explicitly permits recovery.

## Catch predicate

`cited` is unchanged from v1: a seed or control is caught only when its named criterion has a
`criterion.findings[].evidence.path` exactly equal to that entry's named `defectFile`.

An evidence path from another criterion, a positive-evidence path, a criterion name without that
finding path, a substring or basename match, or an unrelated finding does not count. The raw
result records, for every entry, the named criterion, named defect file, cited boolean, and the
complete set of finding evidence paths emitted by the named criterion.

## Positive controls and void rule

The six controls `PC-A1` through `PC-B6` are outside every recall denominator. All six must be
`cited` by their named criterion. A control miss or control error makes the run **VOID**. In that
state the result may report control outcomes and instrument diagnostics only; it must not publish
an evaluation numerator, denominator, rate, interval, or per-class count.

No control is redesigned, replaced, or rerun after a miss.

## Frozen reporting rule

If every positive control passes and all 60 evaluation rows complete:

- the primary held-out result is `k/30` with a two-sided 95% Wilson interval;
- the full `k/60` cohort is descriptive and reported separately;
- each criterion is reported descriptively as held-out `k/5`, with no per-class threshold; and
- every individual seed outcome is retained before any aggregate is shown.

Aggregate held-out `0/30` or `30/30` refuses claim-bearing output. Outcomes `1/30` through
`29/30` receive no pass/fail label or qualitative threshold. Their only licensed statement is:

> On this fixed, isolated, in-scope held-out fixture set, Cejel v0.4.0 using its explicit public
> default v17 rubric cited `k` of 30 named defect files; the two-sided 95% Wilson interval for
> that fixture-set proportion is `[L, U]`.

This does not establish repository-wide, ecosystem-wide, customer, vulnerability, pack, or
future-version recall. It must not be combined, averaged, or described as confirming the seeded
dual-control result, the three session-derived real anchors, the v50 agreement study, or any LLM
Pack measurement.

An evaluation error row makes the run non-claim-bearing and preserves all completed raw rows, but
does not authorize a retry or favorable complete-case denominator.

## Publication boundary

Raw fixtures and raw scan evidence remain in private Alfred. The user has separately authorized
public disclosure of Alfred-derived scores and hashes. After private result review, Cejel may
publish a redacted additive result containing bindings, run integrity, per-seed IDs and outcomes,
aggregate/per-class counts, intervals, refusal state, and hashes. It must not publish private
fixture contents, private absolute paths, credentials, or unrelated Alfred material.

Neither the private nor public result may edit this preregistration, either v1 preregistration,
either v1 addendum, any historical result, or the corpus.
