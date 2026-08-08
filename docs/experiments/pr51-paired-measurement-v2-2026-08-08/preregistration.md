# PR #51 paired golden-cohort diagnostic v2 — preregistration

Status: preregistered before either detector arm is executed. Supersedes v1, which stopped during
candidate preflight before any bundle, arm, or frozen checkout access.

**CONSTRAINTS-VERSION: 2026-08-01.3**

## Question, population, and claim boundary

This diagnostic decides draft PR #51 by comparing the current detector on `origin/main` with that
detector plus #51's exact original one-commit change. It uses the already-spent, retired v1.9 golden
cohort: 24 repositories, 4,199 scored opportunities, 34 `present`, and 4,165 `absent`. The manifests,
labels, spans, repositories, rubric, rules, thresholds, and five outcomes are frozen by
`preregistration-bindings.json`.

This is not a new calibration, release gate, correction to the published v1.9 result, estimate on
fresh repositories, or authorization for an external claim. No untouched cohort may be accessed.
The historical 0/34 result is context only; both arms are measured now under identical inputs,
runtime, execution procedure, and byte-bound no-egress assets.

The locked outcomes are findings, distinct matched true positives, unmatched or duplicate false
positives, repositories with any `insufficient_data` rule state, and recall (`TP / 34`). A finding
matches only the same repository, rule, exact path, and inclusive frozen positive source span.

## V1 correction and candidate identity

The v1 preflight erratum is at
`../pr51-paired-measurement-2026-08-08/ERRATUM.md`. Stable patch IDs include enough hunk context to
change when an unchanged patch is replayed beside later edits, so v1 could not accept Git's
conflict-free replay of #51. No measurement had begun.

V2 freezes the original #51 base `c1f76ddb0454aa9f3326102efaeb766ad5446eea` and head
`025f1016d121a13545ad557e3e2843d808f2c7f4`. The harness requires the head to be exactly one commit
above that base. For a committed baseline it runs Git's tree-only merge of the baseline and original
head. Any conflict is a stop. The candidate must be exactly one commit above baseline and its Git
tree must equal the mechanically derived merge tree. No manual conflict resolution or semantic
change is admissible. The raw baseline-to-candidate diff is separately hash-bound before results.

## Chronology and pre-result commitment

After this v2 preregistration merges, create clean baseline and candidate worktrees. Build each arm
outside Git with the bound builder, which embeds the exact clean detector commit. Before opening a
frozen checkout or running either arm, commit a separate pre-result document from the template. It
must bind the v2 preregistration merge commit, then-current `origin/main` baseline, conflict-free
candidate commit, raw candidate diff SHA-256, both bundle SHA-256 values, exact Node and Git runtime,
baseline-first order, and raw v2 bindings SHA-256.

The pre-result commit must strictly descend from the v2 preregistration. Raw arm artifacts must be
created outside every participating repository, retained privately, and never staged, committed, or
pasted into a public PR. Baseline runs first. Candidate requires and byte-binds the baseline artifact.

## Exact execution

Build each clean arm from its own worktree:

```bash
node calibration/llm/scripts/build-pr51-paired-bundle.mjs --output-dir /private/path/arm-bundle
```

Prepare the 24 frozen checkouts only after the pre-result document is committed. Checkout may use
the network; detector execution may not. Run the baseline with plain Node under the exact bound
wrapper:

```bash
calibration/llm/scripts/no-egress-wrapper.sh \
  node /private/path/baseline-bundle/pr51-paired-measurement.js \
  --mode run-arm --arm baseline \
  --detector-root /private/path/baseline-cejel-worktree \
  --manifest calibration/llm/cohorts/golden-manifest-v1.9.json \
  --opportunities calibration/llm/results/v1.9-golden-opportunity-manifest.json \
  --bindings docs/experiments/pr51-paired-measurement-v2-2026-08-08/preregistration-bindings.json \
  --matrix /private/path/checkout-matrix.json \
  --commitment /private/path/pre-result-commitment.json \
  --commitment-git-repo /private/path/cejel-result-worktree \
  --commitment-git-commit FULL_COMMITMENT_COMMIT_SHA \
  --commitment-git-path docs/experiments/pr51-paired-measurement-v2-2026-08-08/pre-result-commitment.json \
  --output /private/path/baseline-arm.json --confirm-network-isolation
```

Run candidate second with its bundle/root/output and
`--prior-arm /private/path/baseline-arm.json`. Score with the committed source harness outside the
wrapper, passing `--mode score-pair`, `--detector-root`, `--baseline`, `--candidate`, `--manifest`,
`--opportunities`, `--bindings`, `--commitment`, the three `--commitment-git-*` arguments, both
`--*-detector-root` arguments, and both `--*-bundle` arguments. The scorer directly revalidates the
committed anchors, exact clean worktrees, bundle bytes, complete ordered arm records, runtime, all
24 frozen repositories, and paired source digests before emitting aggregates and audit hashes.

## Locked disposition

- Candidate recall greater than baseline recall: **merge #51**.
- Otherwise, equal recall and fewer candidate false positives: **merge #51**.
- Otherwise, including recall loss, unchanged five-number result, or more false positives:
  **close #51 without merge**.

Only the aggregate comparison, conflict-free application record, and locked disposition may be
reported on #51. Do not update any published figure, calibration table, release claim, sealed
artifact, leaderboard field, or site copy.

## Stop conditions

Stop without interpretation if the original patch does not merge conflict-free; the derived tree,
commit, diff, runtime, bundle, binding, or committed chronology differs; any detector checkout has
tracked or untracked changes; any frozen checkout has tracked, untracked, or ignored contamination;
the two arms differ in source digests; all five no-egress probe surfaces are not denied; an output
enters a repository; an arm precedes the committed pre-result record; or any golden/untouched input
is modified. Any later correction is an erratum; any semantic change requires another superseding
preregistration. Tests may use synthetic repositories only and must not open a frozen checkout.
