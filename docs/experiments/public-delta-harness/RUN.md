# Run a preregistered public before-and-after (harness v2)

This is a reusable copy of `../v17-delta-459-427-430-2026-10-13/harness/`. That directory stays
unchanged as part of its published record. v2 takes runs and pairs from the plan, so an experiment
writes a plan instead of editing this code. An experiment directory holds `PREREGISTRATION.md`,
`plan.json` and, after the runs, the result. It cites this harness at a merged commit.

## Plan schema `cejel-public-delta-v2`

```json
{
  "schema": "cejel-public-delta-v2",
  "corpusSha256": "<sha-256 of leaderboard/corpus.json>",
  "publicRows": 23,
  "scope": "public entries only; private implementation and reports excluded",
  "generatedAt": "2026-10-15T00:00:00.000Z",
  "runs": [
    { "name": "before", "commit": "<40-hex>", "rubric": "witan-rubric-v17-2026-07-24" },
    { "name": "after", "commit": "<40-hex>", "rubric": "witan-rubric-v17-2026-07-24" }
  ],
  "pairs": [
    { "name": "delta", "before": "before", "after": "after",
      "allowedCriteria": ["A3"], "presentationOnly": ["rubricBehaviourFingerprint"] }
  ],
  "expected": { }
}
```

- **runs.** Run names are unique path segments. Each commit is a full 40-hex commit. No two runs
  may share both commit and rubric. Each rubric must be in `WITAN_SELECTABLE_RUBRIC_VERSIONS`, read
  from `src/witan/rubric-version.ts` in that run's clean checkout. The harness holds no rubric
  list.
- **pairs.** `before` and `after` must name declared runs, and must be different runs.
  `allowedCriteria` lists the criterion ids that the pair may move. `unexpectedCriteria` in the
  result is measured against that list and nothing else. `presentationOnly` lists top-level report
  fields whose change is allowed. It may not name a scoring field (`criteria`, `overallScore`,
  `codeTrustScore`, `processTrustScore`, `verdict`). Any other non-scoring field that changes is
  listed in `undeclaredFieldChanges`. A pair of two rubrics at one commit normally declares
  `rubricVersion` and `rubricBehaviourFingerprint`.
- **Unchanged from the precedent:** the corpus digest and public-only filter; the public row count,
  still checked against the digested corpus (the plan now declares it, where the precedent fixed
  23 in code); target pin, cleanliness and full history; the fixed `generatedAt`; explicitly disabled ingest
  (`ingestPatterns: []`, `autoDiscoverIngest: false`); raw reports kept in local scratch;
  scalar-only export; the 0.6.3 placement functions, with `cejel` as transparency. Unknown fields
  in a run or pair are refused.

## Steps

Commit and push `PREREGISTRATION.md` and `plan.json` before scoring. Preserve that commit as a
strict ancestor of the result, and do not squash the branch. Keep scratch storage outside every
checkout. `score-arm.mts` refuses a scratch root inside the protocol or source checkout.

1. Create one detached, clean source checkout per distinct run commit. Two runs on one commit, for
   example two rubrics, share a checkout. Reuse the installed dependencies; this does not change
   tracked source. Do not point a run at `main`.
2. Put the public entries' full-history target trees in `<scratch>/checkouts/<name>`.
   - **Where verified copies come from.** Copy them from an earlier board scratch work directory
     whose trees were verified against the same corpus digest. The 0.6.3 full-history board
     regeneration (`../board-regeneration-0.6.3-full-history-2026-10-10/harness/RUN.md`, step 4)
     is the precedent source. APFS clone copies are fine. Do not copy private rows.
   - **When no verified copies exist,** clone each public entry from `leaderboard/corpus.json`,
     using its `url` and `commit` and nothing else. Make a full clone with no `--depth` and no
     `--filter`, fetch the pinned commit, and check it out detached. This is the full arm of
     `../board-regeneration-0.6.3-full-history-2026-10-10/harness/run-row.sh`, without the scan.
   - Either way, the same identity checks apply before and after every scan: HEAD equals the
     corpus commit, the tree is clean, the clone is not shallow and has no partial-clone filter,
     and the commit count is unchanged. A target that fails is refused. It is not repaired
     between runs.
3. Read the preregistration commit from Git and save it. Run
   `pnpm exec node --test docs/experiments/public-delta-harness/harness.node-test.mjs`.
4. From the protocol checkout, invoke `score-arm.mts` through the installed tsx loader with five
   arguments: plan path, source checkout path, run name, scratch root, preregistration commit.
   Before it imports the scanner, it checks that:
   - the preregistration commit is 40-hex, is an ancestor of the protocol checkout, and holds the
     plan's exact bytes;
   - the source HEAD is the run's commit and tracked source is clean;
   - the run's rubric is selectable at that commit;
   - every target passes its identity checks;
   - `<scratch>/out/<run>` does not exist.

   Run each declared run once. An existing output directory is refused.
5. Invoke `compare.mjs` with the plan path, the unchanged `leaderboard/corpus.json` and the scratch
   root. It checks that each manifest names its run, commit, rubric, `generatedAt`, plan digest and
   row bindings. It checks that every run shares one preregistration commit, and that each report
   carries its run's rubric. It then computes every declared pair. Copy `paired-result.json`
   unchanged beside the preregistration. It holds only public scalar scores, statuses, counts,
   criterion ids and field names. Raw reports stay local.
6. Write `result.md` against the unchanged expected values. Keep every failed forecast, unexpected
   movement, undeclared field change and error. Verify preregistration ancestry and all guards
   before you commit the results.

Placements are modeled within the fixed runs. This harness does not publish a leaderboard,
calibrate or promote a rubric, change target pins or fix a failed row.

## Result shape

`paired-result.json` (`cejel-public-delta-v2-result`) has `planSha256`, `preregCommit`, `runs`
(`sourceHead`, `rubric`, `completed`, `errors`), `expected` and `pairs`. Each pair has `before`,
`after`, `allowedCriteria`, `presentationOnly`, `summary` and `rows`. The summary and row fields
are the precedent's fields, with three additions: `identicalAfterPresentationRemoval`,
`undeclaredFieldChanges` and, per row, `presentationFieldsChanged`. Against the precedent, `arms`
is now `runs`, and `left` and `right` are now `before` and `after`. `harness.node-test.mjs` checks
this mapping against the precedent's own `compare.mjs`.
