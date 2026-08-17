# In-scope native detection-recall experiment v4 — v22 successor preregistration

Status: **preregistered before any frozen control or evaluation-fixture materialization or scan**

**CONSTRAINTS-VERSION: 2026-08-01.4**

## Purpose and predecessor boundary

V4 is a new prospective measurement, not a retry, amendment, or reinterpretation of v1, v2, or v3.
V3 remains the immutable released-v17 result: 16/30 held out on its fixed fixture set. V1 and v2
remain immutable terminal control voids. The v2 A3/B6 paired census is separate, construction-bound
instrument evidence; it is neither a recall result nor a reason to alter this corpus.

V4 asks: using explicit prospective v22, how often does the named criterion cite the exact named
defect file on the already-frozen 60-entry in-scope corpus? It is intended to measure the bounded
effect of the post-v3 A3 and B6 detector closure without changing fixtures, controls, partition,
predicate, or reporting after their contents are known to the scanner.

V22 inherits the bounded v20 A3 explicit-gap rules and v21 B6 executed-escalation rules, and adds
only recognition of a direct Node HTTP entrypoint named by a simple root `package.json` start command.
It is prospective and unreleased. The public default remains v17; no V4 outcome may promote v22,
alter a release, score, certificate, leaderboard, or customer-facing population claim.

## Frozen corpus and predicate

The adopted Alfred corpus is unchanged at `d4f6f0dfa0721d2e35b40b14f43f227e5ec79dbc`:
`packages/bede/src/in-scope-cejel-recall/fixtures/seed-corpus.json`, blob
`84e1d7d55d73b0c0895809d40e9946758636c777`, SHA-256
`331349ecd5be409f0800e396863d3a7869f330b7603baf0e484636733f878220`.
It contains exactly 60 `evaluationSeeds`: five calibration and five held-out entries for each of
A1-A5 and B6. The held-out denominator is 30. The old `positiveControls` array is superseded and
must not be decoded, materialized, scanned, or used.

The adopted v3 control artifact is unchanged at Alfred merge
`11284d9ca97c5d6b216014cc3315df07d4e02549`:
`packages/bede/src/in-scope-cejel-recall/fixtures/positive-controls-v3.json`, blob
`c705a2491d695b0f15028bd1d4fa55eb402edc2f`, SHA-256
`0955e77b47e5da5d8010da29359cc9aa1e27b3fa85969405cdff199fc39e07d4`.
It contains exactly six distinct controls, PC-A1 through PC-B6, and no evaluation array.

`cited` is unchanged: a row is caught only when its named criterion emits a finding whose
`evidence.path` exactly equals the row's named `defectFile`. Other criteria, positive evidence,
basename or substring matches, and unrelated findings do not count.

## Immutable detector bindings

| Artifact | Frozen binding |
|---|---|
| Cejel detector commit | `8a289ea09b4cb91354e64610181a1ae79af4b5ec` |
| Cejel Git tree | `10960a032b784f7c11068a1b4a030bf76029eea0` |
| Package version | `0.4.0` source-tree version only; this is not a claim that v22 shipped in tag `v0.4.0` |
| Explicit rubric | `witan-rubric-v22-prospective-2026-08-10` |
| Public default | `witan-rubric-v17-2026-07-24` |
| Signal collector blob | `src/witan/repo-signals.ts` / `c55e9c8a82e2398672486183fd436f3ef82c64c8` |
| Rubric-version blob | `src/witan/rubric-version.ts` / `65a734bb71ef18b14d63ce57e71488e476f7c337` |
| Scoring blob | `src/witan/scoring.ts` / `d61dc75ccdf84c13129f642353e03cf996e0bdb9` |
| Scan boundary | `scoreRepoWithPublicCejel`, explicit v22, no ingest, auto-discovered ingest disabled |
| Fixed clock | `2026-08-11T00:00:00.000Z` |

Any mismatch in detector commit, tree, package version, rubric, source blob, corpus/control object,
path, hash, count, partition, predicate, boundary, or clock is a pre-run protocol failure. A
detector, collector, rubric, rubric-version, score, or published-leaderboard change after this
preregistration merges voids V4 and requires a new preregistration.

## Harness, ordering, and one-run rule

1. Merge this preregistration.
2. A different evaluator creates a new Alfred V4 harness from `origin/main`, embedding the eventual
   merged Cejel commit and this document blob as cross-repository immutable bindings.
3. The harness may be tested only with separately authored synthetic self-tests that do not import,
   decode, materialize, or scan either frozen source.
4. Commit and push the harness, then prove local HEAD, remote-tracking ref, and independent
   `git ls-remote` are the same commit before any frozen byte is read.
5. Authenticate all bindings; build the frozen Cejel tree; invoke the harness exactly once.
6. Execute the six controls first. A miss or error is `VOID_CONTROL_FAILURE`; the harness must not
   decode, materialize, or scan `evaluationSeeds` and may publish no evaluation count or recall claim.
7. Only if all controls pass, execute all 60 evaluation rows once; commit raw result and Markdown
   separately after the pushed harness commit.

Within Alfred, the corpus merge, v3-control merge, and V4 harness must be strict ancestors of its
result commit. Cejel objects are cross-repository content bindings, never described as Alfred
ancestors. No row retry, fixture repair, harness repair, or second invocation is allowed after the
first control begins. A pre-control failure before a frozen byte is materialized authorizes no scan
until a further preregistration permits recovery.

Each row is materialized into a new temporary Git repository from only its frozen files map, with
fixed author, committer, timestamp, and branch metadata. Paths are relative, non-empty, contain no
`..`, and remain within that temporary directory. Fixture hooks, scripts, tests, builds, package
managers, imports, binaries, notebooks, and generated programs are never executed.

## Reporting and claim boundary

If all controls pass and all 60 rows complete without errors, report held-out `k/30` with a
two-sided 95% Wilson interval; report full-cohort `k/60` and each class's held-out `k/5`
descriptively. Aggregate held-out `0/30` or `30/30` refuses claim-bearing output. Any evaluation
error is non-claim-bearing and preserves completed rows without a complete-case denominator.

For any other complete aggregate, the sole licensed statement is:

> On this fixed, isolated, in-scope held-out fixture set, Cejel source commit `8a289ea` using
> explicit prospective v22 cited `k` of 30 named defect files; the two-sided 95% Wilson interval
> for that fixture-set proportion is `[L, U]`.

This is not repository-wide, ecosystem-wide, customer, vulnerability, pack, or future-version
recall; it is not precision; and it cannot be combined with dual-control, the v17 calibration,
the A3/B6 paired census, or any LLM-pack result. Raw fixtures and raw scan evidence stay private
in Alfred. A public closeout may contain bindings, IDs, categorical outcomes, aggregates, intervals,
refusal state, and hashes, but never fixture source, private paths, credentials, or unrelated
Alfred material.
