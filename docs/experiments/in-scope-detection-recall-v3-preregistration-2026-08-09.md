# In-scope native detection-recall experiment v3 — successor preregistration (2026-08-09)

Status: **preregistered before evaluation-fixture materialization or scan**

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Prior protocol disposition

This is a new protocol, not an edit or addendum to either earlier protocol.

V1 was void before execution after its repository-wide freeze was broken. Its run count is zero.
V2 executed its six positive controls once, missed `PC-A2`, `PC-A3`, and `PC-B6`, and stopped at
the precommitted control gate before any of the 60 evaluation fixtures was materialized or scanned.
V2 is terminally `VOID_CONTROL_FAILURE`, has zero evaluation rows, and licenses no recall figure.
The v1 and v2 preregistrations, addenda, harness, corpus, and results remain immutable.

V3 treats v2 only as an instrument-development pilot. It replaces the six out-of-denominator
positive controls with the separately developed and merged v3 control artifact. It does not alter
the evaluation corpus, detector, collector, rubric, rubric version, score, public default, scan
boundary, clock, catch predicate, denominator, partition, defect-file designation, or reporting
rule.

## Successor question and frozen evaluation corpus

V3 asks the same bounded question against the released Cejel v0.4.0 **public-default v17**
scanner: on 30 fixed held-out synthetic repository defects, five for each native path-emitting
criterion A1–A5 and B6, how often does the named criterion cite the exact named defect file?

The original private corpus is adopted without changing a byte. Its `evaluationSeeds` array
contains exactly 60 entries: 30 calibration and 30 held out; each of A1–A5 and B6 has IDs `01`–
`05` in calibration and `06`–`10` held out. Every ID is unique, and every seed's `defectFile` is
an exact key in its `files` map. Only that array supplies evaluation entries. The original
corpus's `positiveControls` array is expressly superseded and must not be read, materialized,
scanned, or used by the v3 harness.

This experiment does not evaluate prospective v18 or v19, does not promote any rubric, and does
not change a score, detector, collector, leaderboard, release, or public default.

## Immutable execution bindings

The evaluator must authenticate every binding before reading or materializing an evaluation
entry:

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
| Private Alfred v3-control merge | `11284d9ca97c5d6b216014cc3315df07d4e02549` |
| V3-control path | `packages/bede/src/in-scope-cejel-recall/fixtures/positive-controls-v3.json` |
| V3-control Git blob | `c705a2491d695b0f15028bd1d4fa55eb402edc2f` |
| V3-control SHA-256 | `0955e77b47e5da5d8010da29359cc9aa1e27b3fa85969405cdff199fc39e07d4` |

The v3 control artifact contains exactly six unique entries, `PC-A1` through `PC-B6`, one for each
named criterion A1–A5 and B6. It contains no evaluation array; `evaluationCorpusChanged` is
`false`; and every control's named `defectFile` is an exact key in its `files` map. `PC-A1`,
`PC-A4`, and `PC-A5` are byte-for-byte structurally equal to their v2 counterparts. `PC-A2`,
`PC-A3`, and `PC-B6` were repaired using shapes already positive in the frozen scanner's
regression tests. All six were development-validated against the frozen execution bindings before
this preregistration; that validation is instrument evidence outside all evaluation denominators.

Any binding or structural mismatch is a pre-run protocol failure. Executing any other Cejel tree,
rubric, scan boundary, corpus blob, control blob, or clock voids the run. The harness must
mechanically reject use of the superseded controls and must not combine the two control sources.

## Evaluator and harness ordering

The corpus-authoring, control-repair, and successor-preregistration sessions are excluded from
execution and outcome evaluation. A different evaluator must perform the run.

The order is fixed:

1. merge this successor preregistration;
2. create a deterministic private Alfred v3 harness that embeds this document's **merged Cejel
   commit**, the Git blob of this document at that commit, and every immutable binding above;
3. test the harness only with separately authored synthetic self-tests that do not read,
   materialize, or scan any frozen evaluation entry or either frozen control set;
4. commit and push the harness before reading or materializing the original corpus's
   `evaluationSeeds` array;
5. re-authenticate the local harness commit, its Alfred remote-tracking ref, and the independent
   remote ref as the same object;
6. execute exactly one run comprising the six v3 controls followed, only if all controls pass, by
   all 60 original evaluation entries; and
7. commit the raw result and its human rendering separately after the harness commit.

Git ancestry does not cross repository boundaries. The merged Cejel v3 preregistration commit and
its document blob are immutable cross-repository content bindings recorded by the Alfred harness
and result; neither is described as an Alfred ancestor. Within Alfred, corpus merge
`d4f6f0dfa0721d2e35b40b14f43f227e5ec79dbc`, v3-control merge
`11284d9ca97c5d6b216014cc3315df07d4e02549`, and the pushed v3 harness commit must all be strict
ancestors of the result commit. Commit timestamps are not ancestry evidence.

The harness may not contain a detector, seed-specific exception, marker-string catch path, or
alternate finding source. It may only authenticate bindings, select the preregistered arrays,
materialize, invoke the frozen scanner, apply the frozen predicate, calculate the frozen
summaries, and render evidence.

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
change the harness, or rerun after the first v3 control begins. A pre-control failure that occurs
before any frozen control or evaluation byte is materialized or scanned may stop as a pre-run
instrument failure, but it authorizes no scan until a new preregistration explicitly permits
recovery.

## Catch predicate

`cited` is unchanged: an entry is caught only when its named criterion has a
`criterion.findings[].evidence.path` exactly equal to that entry's named `defectFile`.

An evidence path from another criterion, a positive-evidence path, a criterion name without that
finding path, a substring or basename match, or an unrelated finding does not count. The raw
result records, for every executed entry, the named criterion, named defect file, cited boolean,
and complete set of finding evidence paths emitted by the named criterion.

## Positive controls and void rule

The six v3 controls are outside every recall denominator. All six must be `cited` by their named
criterion. A control miss or control error makes the run **VOID**. In that state the gate must not
read, materialize, or scan the `evaluationSeeds` array, and the result may report control outcomes
and instrument diagnostics only; it must not publish an evaluation numerator, denominator, rate,
interval, or per-class count.

No control is redesigned, replaced, or rerun after the run begins.

## Frozen reporting rule

If every v3 positive control passes and all 60 evaluation rows complete:

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

Neither the private nor public result may edit this preregistration, either predecessor
preregistration, any predecessor addendum, any historical result, the original corpus, or either
control artifact.
